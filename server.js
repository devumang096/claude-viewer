const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { estimateCost, rateFor } = require('./pricing');

const app = express();
const PORT = 3737;
const HOST = '127.0.0.1';
const ALLOWED_HOSTS = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`]);
const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;
const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const MAX_INDEXED_TEXT_PER_SESSION = 2 * 1024 * 1024; // 2MB cap per session

function decodeProjectPath(dirName) {
  // '-Users-alice' → '/Users/alice'
  // Handles leading dash → leading slash, then replace inner dashes with slashes
  // But dashes inside folder names are preserved — this is best-effort
  return dirName.replace(/^-/, '/').replace(/-/g, '/');
}

function readJsonl(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return content
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(l => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
  } catch { return []; }
}

function getSessionSummary(records) {
  // Use last ai-title as canonical title
  const titles = records.filter(r => r.type === 'ai-title');
  const lastTitle = titles.length ? titles[titles.length - 1].aiTitle : null;

  const firstUser = records.find(r => r.type === 'user');
  let preview = '';
  if (firstUser) {
    const content = firstUser.message?.content;
    if (typeof content === 'string') preview = content;
    else if (Array.isArray(content)) {
      const t = content.find(c => c.type === 'text');
      if (t) preview = t.text;
    }
  }

  const timestamps = records
    .filter(r => r.timestamp)
    .map(r => new Date(r.timestamp).getTime())
    .filter(n => !isNaN(n));
  const startTime = timestamps.length ? Math.min(...timestamps) : null;
  const endTime = timestamps.length ? Math.max(...timestamps) : null;

  const userCount = records.filter(r => r.type === 'user').length;
  const assistantCount = records.filter(r => r.type === 'assistant').length;

  // Count sub-conversations (each ai-title = one conversation segment)
  const subConversations = titles.length || 1;

  // Count tool calls + accumulate token usage in the same pass
  let toolCalls = 0;
  const usage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    byModel: {},
  };
  records.filter(r => r.type === 'assistant').forEach(r => {
    const content = r.message?.content;
    if (Array.isArray(content)) {
      toolCalls += content.filter(c => c.type === 'tool_use').length;
    }

    const u = r.message?.usage;
    const model = r.message?.model;
    if (!u) return;

    const inputTokens = u.input_tokens || 0;
    const outputTokens = u.output_tokens || 0;
    const cacheReadTokens = u.cache_read_input_tokens || 0;
    const cacheCreationTokens = u.cache_creation_input_tokens || 0;

    usage.inputTokens += inputTokens;
    usage.outputTokens += outputTokens;
    usage.cacheReadTokens += cacheReadTokens;
    usage.cacheCreationTokens += cacheCreationTokens;

    if (model) {
      if (!usage.byModel[model]) {
        usage.byModel[model] = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 };
      }
      const m = usage.byModel[model];
      m.inputTokens += inputTokens;
      m.outputTokens += outputTokens;
      m.cacheReadTokens += cacheReadTokens;
      m.cacheCreationTokens += cacheCreationTokens;
    }
  });

  usage.estCostUsd = Object.entries(usage.byModel).reduce(
    (sum, [model, modelUsage]) => sum + estimateCost(modelUsage, model),
    0
  );

  return {
    title: lastTitle || preview.slice(0, 80) || 'Untitled session',
    preview: preview.slice(0, 120),
    startTime,
    endTime,
    userCount,
    assistantCount,
    toolCalls,
    subConversations,
    usage,
  };
}

function extractSearchableText(records) {
  // Only human-authored/generated text — no raw tool_use/tool_result dumps (noisy, often huge)
  const blocks = [];
  let totalLen = 0;

  records.forEach((rec, recordIndex) => {
    if (rec.type !== 'user' && rec.type !== 'assistant') return;
    const content = rec.message?.content;
    const speaker = rec.type;
    const ts = rec.timestamp || null;

    const pushBlock = (blockIndex, text) => {
      if (!text || totalLen >= MAX_INDEXED_TEXT_PER_SESSION) return;
      const capped = text.slice(0, MAX_INDEXED_TEXT_PER_SESSION - totalLen);
      totalLen += capped.length;
      blocks.push({ recordIndex, blockIndex, speaker, ts, text: capped });
    };

    if (typeof content === 'string') {
      pushBlock(0, content);
    } else if (Array.isArray(content)) {
      content.forEach((c, blockIndex) => {
        if (c.type === 'text') pushBlock(blockIndex, c.text);
        else if (c.type === 'thinking') pushBlock(blockIndex, c.thinking);
      });
    }
  });

  return blocks;
}

// ── Cache ──────────────────────────────────────────────────────────────
// mtime-invalidated: only reparse a file when it has actually changed on disk.
const sessionCache = new Map(); // filePath -> { mtimeMs, summary, textBlocks }
const smallFileCache = new Map(); // filePath -> { mtimeMs, content }

function getCachedSession(filePath) {
  let mtimeMs;
  try {
    mtimeMs = fs.statSync(filePath).mtimeMs;
  } catch {
    return null;
  }
  const cached = sessionCache.get(filePath);
  if (cached && cached.mtimeMs === mtimeMs) return cached;

  const records = readJsonl(filePath);
  const summary = getSessionSummary(records);
  const textBlocks = extractSearchableText(records);
  const entry = { mtimeMs, summary, textBlocks };
  sessionCache.set(filePath, entry);
  return entry;
}

function getCachedFileContent(filePath) {
  let mtimeMs;
  try {
    mtimeMs = fs.statSync(filePath).mtimeMs;
  } catch {
    return null;
  }
  const cached = smallFileCache.get(filePath);
  if (cached && cached.mtimeMs === mtimeMs) return cached.content;

  const content = fs.readFileSync(filePath, 'utf8');
  smallFileCache.set(filePath, { mtimeMs, content });
  return content;
}

function walkProjects() {
  const projectsDir = path.join(CLAUDE_DIR, 'projects');
  const result = [];
  try {
    const entries = fs.readdirSync(projectsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const dirPath = path.join(projectsDir, entry.name);
      const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.jsonl'));
      const sessions = [];
      for (const file of files) {
        const sessionId = file.replace('.jsonl', '');
        const filePath = path.join(dirPath, file);
        const cached = getCachedSession(filePath);
        if (!cached) continue;
        sessions.push({ id: sessionId, filePath, ...cached.summary });
      }
      sessions.sort((a, b) => (b.endTime || 0) - (a.endTime || 0));
      result.push({
        dirName: entry.name,
        projectPath: decodeProjectPath(entry.name),
        sessions,
      });
    }
  } catch (e) { console.error('walkProjects error', e.message); }
  return result;
}

function parseFrontmatter(content) {
  const m = content.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  const result = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([a-zA-Z_]+):\s*(.*)$/);
    if (kv) result[kv[1]] = kv[2].trim();
  }
  return result;
}

// Marketplace repo layouts vary (some are flat `plugins/<name>/`, others nest an
// extra checkout folder first), so rather than assume a fixed depth this walks the
// whole marketplaces tree looking for SKILL.md and agents/*.md.
function walkPluginCapabilities(pluginsMarketplacesDir) {
  const skills = [];
  const agents = [];

  function marketplaceOf(filePath) {
    return path.relative(pluginsMarketplacesDir, filePath).split(path.sep)[0];
  }
  function pluginOf(filePath, anchor) {
    const segments = path.relative(pluginsMarketplacesDir, filePath).split(path.sep);
    const idx = segments.indexOf(anchor);
    return idx > 0 ? segments[idx - 1] : null;
  }

  function walk(dir, depth) {
    if (depth > 10) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === '.git' || e.name === 'node_modules') continue;
        walk(full, depth + 1);
      } else if (e.name === 'SKILL.md') {
        const fm = parseFrontmatter(fs.readFileSync(full, 'utf8'));
        skills.push({
          name: fm.name || path.basename(path.dirname(full)),
          description: fm.description || '',
          marketplace: marketplaceOf(full),
          plugin: pluginOf(full, 'skills'),
          source: 'plugin',
        });
      } else if (e.name.endsWith('.md') && path.basename(dir) === 'agents') {
        const fm = parseFrontmatter(fs.readFileSync(full, 'utf8'));
        agents.push({
          name: fm.name || e.name.replace(/\.md$/, ''),
          description: fm.description || '',
          tools: fm.tools || null,
          model: fm.model || null,
          marketplace: marketplaceOf(full),
          plugin: pluginOf(full, 'agents'),
          source: 'plugin',
        });
      }
    }
  }

  walk(pluginsMarketplacesDir, 0);
  return { skills, agents };
}

// Project-local capabilities live in the project's own working directory
// (<projectPath>/.claude/skills, /.claude/agents), separate from the transcript
// storage under ~/.claude/projects/.
function walkProjectCapabilities(projects) {
  const skills = [];
  const agents = [];
  for (const proj of projects) {
    const skillsDir = path.join(proj.projectPath, '.claude', 'skills');
    if (fs.existsSync(skillsDir)) {
      for (const name of fs.readdirSync(skillsDir)) {
        const skillMd = path.join(skillsDir, name, 'SKILL.md');
        if (!fs.existsSync(skillMd)) continue;
        const fm = parseFrontmatter(fs.readFileSync(skillMd, 'utf8'));
        skills.push({ name: fm.name || name, description: fm.description || '', project: proj.projectPath, source: 'project' });
      }
    }
    const agentsDir = path.join(proj.projectPath, '.claude', 'agents');
    if (fs.existsSync(agentsDir)) {
      for (const file of fs.readdirSync(agentsDir).filter(f => f.endsWith('.md'))) {
        const fm = parseFrontmatter(fs.readFileSync(path.join(agentsDir, file), 'utf8'));
        agents.push({ name: fm.name || file.replace(/\.md$/, ''), description: fm.description || '', tools: fm.tools || null, model: fm.model || null, project: proj.projectPath, source: 'project' });
      }
    }
  }
  return { skills, agents };
}

function prewarmCache() {
  try {
    walkProjects();
    console.log('  Session cache pre-warmed.');
  } catch (e) {
    console.error('cache pre-warm error', e.message);
  }
}

// Serve the frontend
// Rejects requests whose Host header is not localhost, which blocks DNS-rebinding reads of ~/.claude.
app.use((req, res, next) => {
  if (!ALLOWED_HOSTS.has(req.headers.host)) return res.status(403).json({ error: 'Forbidden host' });
  next();
});
app.use(express.static(path.join(__dirname)));
app.use(express.json());

// ── API ────────────────────────────────────────────────────────────────

app.get('/api/projects', (req, res) => {
  const result = walkProjects().map(proj => ({
    dirName: proj.dirName,
    projectPath: proj.projectPath,
    sessions: proj.sessions.map(({ filePath, ...rest }) => rest),
  }));
  res.json(result);
});

app.get('/api/session/:dirName/:sessionId', (req, res) => {
  const { dirName, sessionId } = req.params;
  if (!SAFE_SEGMENT.test(dirName) || !SAFE_SEGMENT.test(sessionId) || dirName.startsWith('..') || sessionId.startsWith('..')) {
    return res.status(400).json({ error: 'Invalid project or session id' });
  }
  const filePath = path.join(CLAUDE_DIR, 'projects', dirName, `${sessionId}.jsonl`);
  const records = readJsonl(filePath);
  res.json(records);
});

app.get('/api/memory', (req, res) => {
  const result = [];
  const projectsDir = path.join(CLAUDE_DIR, 'projects');
  try {
    const entries = fs.readdirSync(projectsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const memDir = path.join(projectsDir, entry.name, 'memory');
      if (!fs.existsSync(memDir)) continue;
      const files = fs.readdirSync(memDir).filter(f => f.endsWith('.md') || f.endsWith('.json'));
      for (const file of files) {
        const filePath = path.join(memDir, file);
        const content = fs.readFileSync(filePath, 'utf8');
        const stat = fs.statSync(filePath);
        result.push({
          project: decodeProjectPath(entry.name),
          filename: file,
          content,
          updatedAt: stat.mtimeMs,
        });
      }
    }
  } catch (e) { console.error('memory error', e.message); }
  res.json(result);
});

app.get('/api/settings', (req, res) => {
  const read = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
  res.json({
    global: read(path.join(CLAUDE_DIR, 'settings.json')),
    local: read(path.join(CLAUDE_DIR, 'settings.local.json')),
  });
});

app.get('/api/claude-md', (req, res) => {
  const candidates = [
    path.join(os.homedir(), 'CLAUDE.md'),
    path.join(CLAUDE_DIR, 'CLAUDE.md'),
  ];
  for (const p of candidates) {
    try {
      const content = fs.readFileSync(p, 'utf8');
      return res.json({ content, path: p });
    } catch {}
  }
  res.json({ content: null, path: null });
});

app.get('/api/history', (req, res) => {
  const limit = parseInt(req.query.limit) || 200;
  const records = readJsonl(path.join(CLAUDE_DIR, 'history.jsonl'));
  records.reverse();
  res.json(records.slice(0, limit));
});

app.get('/api/live-sessions', (req, res) => {
  const sessionsDir = path.join(CLAUDE_DIR, 'sessions');
  const result = [];
  try {
    const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      try { result.push(JSON.parse(fs.readFileSync(path.join(sessionsDir, file), 'utf8'))); } catch {}
    }
  } catch {}
  result.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  res.json(result);
});

app.get('/api/plans', (req, res) => {
  const plansDir = path.join(CLAUDE_DIR, 'plans');
  const result = [];
  try {
    if (!fs.existsSync(plansDir)) return res.json([]);
    const files = fs.readdirSync(plansDir).filter(f => f.endsWith('.md') || f.endsWith('.txt'));
    for (const file of files) {
      const filePath = path.join(plansDir, file);
      const stat = fs.statSync(filePath);
      const content = fs.readFileSync(filePath, 'utf8');
      result.push({
        filename: file,
        name: file.replace(/\.(md|txt)$/, '').replace(/-/g, ' '),
        content,
        createdAt: stat.birthtimeMs,
        updatedAt: stat.mtimeMs,
        size: stat.size,
      });
    }
  } catch (e) { console.error('plans error', e.message); }
  result.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  res.json(result);
});

app.get('/api/walkthroughs', (req, res) => {
  const walkthroughsDir = path.join(CLAUDE_DIR, 'walkthroughs');
  const result = [];
  try {
    if (!fs.existsSync(walkthroughsDir)) return res.json([]);
    const files = fs.readdirSync(walkthroughsDir).filter(f => f.endsWith('.md') || f.endsWith('.txt'));
    for (const file of files) {
      const filePath = path.join(walkthroughsDir, file);
      const stat = fs.statSync(filePath);
      const content = fs.readFileSync(filePath, 'utf8');
      result.push({
        filename: file,
        name: file.replace(/\.(md|txt)$/, '').replace(/-/g, ' '),
        content,
        createdAt: stat.birthtimeMs,
        updatedAt: stat.mtimeMs,
        size: stat.size,
      });
    }
  } catch (e) { console.error('walkthroughs error', e.message); }
  result.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  res.json(result);
});

app.get('/api/plugins', (req, res) => {
  const result = { marketplaces: {}, installed: [] };
  try {
    const mp = path.join(CLAUDE_DIR, 'plugins', 'known_marketplaces.json');
    if (fs.existsSync(mp)) result.marketplaces = JSON.parse(fs.readFileSync(mp, 'utf8'));
  } catch {}
  try {
    const pluginsBase = path.join(CLAUDE_DIR, 'plugins', 'marketplaces');
    if (fs.existsSync(pluginsBase)) {
      for (const mp of fs.readdirSync(pluginsBase)) {
        const pluginDir = path.join(pluginsBase, mp);
        try {
          const entries = fs.readdirSync(pluginDir, { withFileTypes: true });
          for (const e of entries) {
            if (!e.isDirectory()) continue;
            const pkgPath = path.join(pluginDir, e.name, 'package.json');
            if (fs.existsSync(pkgPath)) {
              result.installed.push({
                marketplace: mp,
                name: e.name,
                pkg: JSON.parse(fs.readFileSync(pkgPath, 'utf8')),
              });
            }
          }
        } catch {}
      }
    }
  } catch {}
  res.json(result);
});

app.get('/api/skills', (req, res) => {
  const plugin = walkPluginCapabilities(path.join(CLAUDE_DIR, 'plugins', 'marketplaces'));
  const project = walkProjectCapabilities(walkProjects());
  res.json([...plugin.skills, ...project.skills]);
});

app.get('/api/agents', (req, res) => {
  const plugin = walkPluginCapabilities(path.join(CLAUDE_DIR, 'plugins', 'marketplaces'));
  const project = walkProjectCapabilities(walkProjects());
  res.json([...plugin.agents, ...project.agents]);
});

app.get('/api/stats', (req, res) => {
  const projects = walkProjects();
  let totalSessions = 0, totalMessages = 0, totalToolCalls = 0;
  for (const proj of projects) {
    totalSessions += proj.sessions.length;
    for (const sess of proj.sessions) {
      totalMessages += sess.userCount + sess.assistantCount;
      totalToolCalls += sess.toolCalls;
    }
  }

  let totalPlans = 0;
  try {
    const plansDir = path.join(CLAUDE_DIR, 'plans');
    if (fs.existsSync(plansDir)) {
      totalPlans = fs.readdirSync(plansDir).filter(f => f.endsWith('.md') || f.endsWith('.txt')).length;
    }
  } catch {}

  res.json({ totalSessions, totalMessages, totalToolCalls, totalPlans });
});

app.get('/api/costs', (req, res) => {
  const projects = walkProjects();

  const totals = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, estCostUsd: 0 };
  const byModel = {};
  const byProject = [];

  for (const proj of projects) {
    const projTotals = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, estCostUsd: 0, sessionCount: 0 };

    for (const sess of proj.sessions) {
      const u = sess.usage;
      if (!u) continue;
      projTotals.inputTokens += u.inputTokens;
      projTotals.outputTokens += u.outputTokens;
      projTotals.cacheReadTokens += u.cacheReadTokens;
      projTotals.cacheCreationTokens += u.cacheCreationTokens;
      projTotals.estCostUsd += u.estCostUsd;
      projTotals.sessionCount += 1;

      totals.inputTokens += u.inputTokens;
      totals.outputTokens += u.outputTokens;
      totals.cacheReadTokens += u.cacheReadTokens;
      totals.cacheCreationTokens += u.cacheCreationTokens;
      totals.estCostUsd += u.estCostUsd;

      for (const [model, m] of Object.entries(u.byModel || {})) {
        if (!byModel[model]) {
          const { estimated } = rateFor(model);
          byModel[model] = { model, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, estCostUsd: 0, sessionCount: 0, estimated };
        }
        byModel[model].inputTokens += m.inputTokens;
        byModel[model].outputTokens += m.outputTokens;
        byModel[model].cacheReadTokens += m.cacheReadTokens;
        byModel[model].cacheCreationTokens += m.cacheCreationTokens;
        byModel[model].estCostUsd += estimateCost(m, model);
        byModel[model].sessionCount += 1;
      }
    }

    byProject.push({ dirName: proj.dirName, projectPath: proj.projectPath, ...projTotals });
  }

  byProject.sort((a, b) => b.estCostUsd - a.estCostUsd);
  const byModelList = Object.values(byModel).sort((a, b) => b.estCostUsd - a.estCostUsd);

  res.json({
    totals,
    byModel: byModelList,
    byProject,
    pricingNote: 'Approximate, list pricing as of 2026-07-16. May not reflect actual billing (enterprise agreements, batch discounts, promotional pricing, or models released after this table was last edited aren’t accounted for). See pricing.js.',
  });
});

app.get('/api/search', (req, res) => {
  const q = (req.query.q || '').trim();
  const limit = parseInt(req.query.limit) || 40;
  const startedAt = Date.now();

  if (q.length < 2) {
    return res.json({ query: q, tookMs: 0, sessions: [], memory: [], plans: [], walkthroughs: [], claudeMd: [] });
  }

  const qLower = q.toLowerCase();

  function scoreAndSnippet(textLower, text) {
    const idx = textLower.indexOf(qLower);
    if (idx === -1) return null;
    const words = qLower.split(/\s+/).filter(Boolean);
    let score = 1;
    if (words.length > 1 && textLower.includes(qLower)) score = 3; // exact phrase
    else if (words.every(w => textLower.includes(w))) score = 2; // all words present

    const contextRadius = 80;
    const start = Math.max(0, idx - contextRadius);
    const end = Math.min(text.length, idx + qLower.length + contextRadius);
    const snippet = (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
    const matchStart = idx - start + (start > 0 ? 1 : 0);

    return { score, snippet, matchStart, matchLen: q.length };
  }

  // ── Sessions ──
  const sessionResults = [];
  const projectsDir = path.join(CLAUDE_DIR, 'projects');
  try {
    const entries = fs.readdirSync(projectsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const dirPath = path.join(projectsDir, entry.name);
      const files = fs.readdirSync(dirPath).filter(f => f.endsWith('.jsonl'));
      for (const file of files) {
        const filePath = path.join(dirPath, file);
        const cached = getCachedSession(filePath);
        if (!cached) continue;
        for (const block of cached.textBlocks) {
          const hit = scoreAndSnippet(block.text.toLowerCase(), block.text);
          if (!hit) continue;
          sessionResults.push({
            dirName: entry.name,
            sessionId: file.replace('.jsonl', ''),
            projectPath: decodeProjectPath(entry.name),
            sessionTitle: cached.summary.title,
            recordIndex: block.recordIndex,
            blockIndex: block.blockIndex,
            speaker: block.speaker,
            ts: block.ts,
            ...hit,
          });
        }
      }
    }
  } catch (e) { console.error('search sessions error', e.message); }

  // ── Memory ──
  const memoryResults = [];
  try {
    const entries = fs.readdirSync(projectsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const memDir = path.join(projectsDir, entry.name, 'memory');
      if (!fs.existsSync(memDir)) continue;
      const files = fs.readdirSync(memDir).filter(f => f.endsWith('.md'));
      for (const file of files) {
        const filePath = path.join(memDir, file);
        const content = getCachedFileContent(filePath);
        if (!content) continue;
        const hit = scoreAndSnippet(content.toLowerCase(), content);
        if (!hit) continue;
        const nameMatch = content.match(/^name:\s*(.+)$/m);
        memoryResults.push({
          project: decodeProjectPath(entry.name),
          filename: file,
          memoryName: nameMatch ? nameMatch[1].trim() : file,
          ...hit,
        });
      }
    }
  } catch (e) { console.error('search memory error', e.message); }

  // ── Plans ──
  const planResults = [];
  try {
    const plansDir = path.join(CLAUDE_DIR, 'plans');
    if (fs.existsSync(plansDir)) {
      const files = fs.readdirSync(plansDir).filter(f => f.endsWith('.md') || f.endsWith('.txt'));
      for (const file of files) {
        const filePath = path.join(plansDir, file);
        const content = getCachedFileContent(filePath);
        if (!content) continue;
        const hit = scoreAndSnippet(content.toLowerCase(), content);
        if (!hit) continue;
        planResults.push({
          filename: file,
          name: file.replace(/\.(md|txt)$/, '').replace(/-/g, ' '),
          ...hit,
        });
      }
    }
  } catch (e) { console.error('search plans error', e.message); }

  // ── Walkthroughs ──
  const walkthroughResults = [];
  try {
    const walkthroughsDir = path.join(CLAUDE_DIR, 'walkthroughs');
    if (fs.existsSync(walkthroughsDir)) {
      const files = fs.readdirSync(walkthroughsDir).filter(f => f.endsWith('.md') || f.endsWith('.txt'));
      for (const file of files) {
        const filePath = path.join(walkthroughsDir, file);
        const content = getCachedFileContent(filePath);
        if (!content) continue;
        const hit = scoreAndSnippet(content.toLowerCase(), content);
        if (!hit) continue;
        walkthroughResults.push({
          filename: file,
          name: file.replace(/\.(md|txt)$/, '').replace(/-/g, ' '),
          ...hit,
        });
      }
    }
  } catch (e) { console.error('search walkthroughs error', e.message); }

  // ── CLAUDE.md ──
  const claudeMdResults = [];
  try {
    const candidates = [path.join(os.homedir(), 'CLAUDE.md'), path.join(CLAUDE_DIR, 'CLAUDE.md')];
    for (const p of candidates) {
      const content = getCachedFileContent(p);
      if (!content) continue;
      const hit = scoreAndSnippet(content.toLowerCase(), content);
      if (hit) claudeMdResults.push({ path: p, ...hit });
    }
  } catch (e) { console.error('search claude-md error', e.message); }

  const byScoreThenRecency = (a, b) => b.score - a.score || (b.ts || 0) - (a.ts || 0);

  res.json({
    query: q,
    tookMs: Date.now() - startedAt,
    sessions: sessionResults.sort(byScoreThenRecency).slice(0, Math.min(15, limit)),
    memory: memoryResults.sort((a, b) => b.score - a.score).slice(0, Math.min(10, limit)),
    plans: planResults.sort((a, b) => b.score - a.score).slice(0, Math.min(10, limit)),
    walkthroughs: walkthroughResults.sort((a, b) => b.score - a.score).slice(0, Math.min(10, limit)),
    claudeMd: claudeMdResults.slice(0, 5),
  });
});

app.use((err, req, res, next) => {
  console.error(`${req.method} ${req.path} failed:`, err.message);
  res.status(500).json({ error: 'Internal server error' });
});

if (require.main === module) {
  app.listen(PORT, HOST, () => {
    console.log(`\n  Claude Viewer  →  http://localhost:${PORT}\n`);
    setImmediate(prewarmCache); // fire-and-forget, don't block startup
  });
}

module.exports = { app, decodeProjectPath, SAFE_SEGMENT };
