import { $, escHtml, relTime, fmtDate, fmtTime, renderJson, renderMd, highlightCode, attachCopyButtons } from '../utils.js';
import { State } from '../state.js';
import { Api } from '../api.js';
import { icon } from '../icons.js';
import { liveCard, sessionCard, pinButton } from './dashboard.js';

// ── CLAUDE.md ─────────────────────────────────────────────────
export async function renderClaudeMd(area, setBreadcrumb) {
  setBreadcrumb(['CLAUDE.md']);
  const { content, path: mdPath } = await Api.claudeMd();
  if (!content) {
    area.innerHTML = `<div class="empty">No CLAUDE.md found in home directory or ~/.claude/</div>`;
    return;
  }
  area.innerHTML = `<div class="content-inner">
    <div>
      <div class="page-title">CLAUDE.md</div>
      <div class="page-sub">${escHtml(mdPath || '')} · Global instructions</div>
    </div>
    <div class="md-content">${renderMd(content)}</div>
  </div>`;
  highlightCode(area);
  attachCopyButtons(area);
}

// ── Settings ──────────────────────────────────────────────────
export async function renderSettings(area, setBreadcrumb) {
  setBreadcrumb(['Settings']);
  const { global: g, local: l } = await Api.settings();
  let html = `<div class="content-inner">
    <div>
      <div class="page-title">Settings</div>
      <div class="page-sub">~/.claude/settings.json &amp; settings.local.json</div>
    </div>`;

  if (g) {
    html += `<div class="settings-section">
      <div class="settings-section-title">Global settings.json</div>
      <div class="json-view">${renderJson(g)}</div>
    </div>`;
  }
  if (l) {
    html += `<div class="settings-section">
      <div class="settings-section-title">Local settings.local.json</div>
      <div class="json-view">${renderJson(l)}</div>
    </div>`;
  }
  if (!g && !l) html += `<div class="empty">No settings files found</div>`;
  html += `</div>`;
  area.innerHTML = html;
  attachCopyButtons(area);
}

// ── History ───────────────────────────────────────────────────
function historyRows(records) {
  if (!records.length) return '<div class="empty">No commands found</div>';
  return records.map((r, i) => `
    <div class="history-item" data-idx="${i}">
      <span class="history-ts">${r.timestamp ? fmtTime(r.timestamp) : ''}</span>
      <span class="history-proj" title="${escHtml(r.project || '')}">${escHtml((r.project || '').split('/').pop() || r.project || '')}</span>
      <span class="history-cmd">${escHtml(r.display || '')}</span>
    </div>`).join('');
}

export function filterHistory(q) {
  const filtered = q
    ? State._historyAll.filter(r => r.display?.toLowerCase().includes(q.toLowerCase()))
    : State._historyAll;
  $('#hist-list').innerHTML = historyRows(filtered);
}

export async function renderHistory(area, setBreadcrumb) {
  setBreadcrumb(['History']);
  const records = await Api.history(500);
  State._historyAll = records;

  area.innerHTML = `<div class="content-inner">
    <div>
      <div class="page-title">Command History</div>
      <div class="page-sub">${records.length} recent commands</div>
    </div>
    <div>
      <input class="history-search" id="hist-search" placeholder="Filter commands…" oninput="App.filterHistory(this.value)">
      <div class="history-list" id="hist-list">${historyRows(records)}</div>
    </div>
  </div>`;
}

// ── Live Sessions ─────────────────────────────────────────────
export async function renderLive(area, setBreadcrumb) {
  setBreadcrumb(['Live Sessions']);
  const sessions = await Api.liveSessions();
  let html = `<div class="content-inner"><div>
    <div class="page-title">Live Sessions</div>
    <div class="page-sub">${sessions.length} session${sessions.length !== 1 ? 's' : ''} · auto-refreshes every 10s</div>
  </div>`;
  if (!sessions.length) html += '<div class="empty">No active sessions</div>';
  else html += `<div>${sessions.map(s => liveCard(s)).join('')}</div>`;
  html += `</div>`;
  area.innerHTML = html;

  if (State.liveRefreshTimer) clearInterval(State.liveRefreshTimer);
  State.liveRefreshTimer = setInterval(async () => {
    if (State.view === 'live') await renderLive(area, setBreadcrumb);
    else clearInterval(State.liveRefreshTimer);
  }, 10000);
}

// ── Plugins ───────────────────────────────────────────────────
export async function renderPlugins(area, setBreadcrumb) {
  setBreadcrumb(['Plugins']);
  const { marketplaces, installed } = await Api.plugins();
  let html = `<div class="content-inner">
    <div>
      <div class="page-title">Plugins</div>
      <div class="page-sub">Installed plugins and marketplaces</div>
    </div>`;

  if (Object.keys(marketplaces).length) {
    html += `<div><div class="panel-title">Marketplaces</div><div>`;
    for (const [id, mp] of Object.entries(marketplaces)) {
      html += `<div class="memory-file-card">
        <div class="memory-file-header">
          <span class="memory-file-name">${icon('folder', { size: 14 })} ${escHtml(id)}</span>
          ${mp.lastUpdated ? `<span class="memory-file-meta">${relTime(new Date(mp.lastUpdated).getTime())}</span>` : ''}
        </div>
        <div class="json-view">${renderJson(mp)}</div>
      </div>`;
    }
    html += `</div></div>`;
  }

  if (installed.length) {
    html += `<div><div class="panel-title">Installed</div><div>`;
    for (const p of installed) {
      html += `<div class="memory-file-card">
        <div class="memory-file-header">
          <span class="memory-file-name">${icon('puzzle', { size: 14 })} ${escHtml(p.name)}</span>
          <span class="memory-file-meta">${escHtml(p.marketplace)}</span>
        </div>
        <div class="json-view">${renderJson(p.pkg)}</div>
      </div>`;
    }
    html += `</div></div>`;
  }

  if (!Object.keys(marketplaces).length && !installed.length) {
    html += '<div class="empty">No plugins found</div>';
  }
  html += `</div>`;
  area.innerHTML = html;
  attachCopyButtons(area);
}

// ── Agents & Skills ──────────────────────────────────────────────
// Real, disk-discoverable capabilities only: plugin-provided (skills/*/SKILL.md,
// agents/*.md under every installed plugin) and project-local (<project>/.claude/skills,
// /.claude/agents). Claude Code's *built-in* skills/subagents are compiled into the CLI
// itself and aren't files anywhere, so they can't be listed here — see the note below.
function capabilityRow(item) {
  const meta = item.source === 'project'
    ? (item.project.split('/').pop() || item.project)
    : [item.marketplace, item.plugin].filter(Boolean).join(' / ');
  return `<div class="row">
    <div class="row-main">
      <div class="row-title mono">${escHtml(item.name)}</div>
      <div class="row-detail">${escHtml(item.description)}</div>
    </div>
    <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
      ${item.model ? `<span class="badge badge--neutral mono">${escHtml(item.model)}</span>` : ''}
      <span class="badge ${item.source === 'project' ? 'badge--accent' : 'badge--neutral'}">${escHtml(meta)}</span>
    </div>
  </div>`;
}

// Messaging-channel plugins (personal-assistant pairing/config, not software dev).
// Hidden by default behind the "Hide non-technical" toggle below.
const NON_TECHNICAL_PLUGINS = new Set(['discord', 'imessage', 'telegram']);
const isNonTechnical = (x) => NON_TECHNICAL_PLUGINS.has(x.plugin);

export async function renderAgentsSkills(area, setBreadcrumb) {
  setBreadcrumb(['Agents & Skills']);
  const [skills, agents] = await Promise.all([Api.skills(), Api.agents()]);

  const marketplaces = new Set([...skills, ...agents].filter(x => x.source === 'plugin').map(x => x.marketplace));
  const projectLocalCount = [...skills, ...agents].filter(x => x.source === 'project').length;

  const kpis = [
    { label: 'Skills', value: String(skills.length) },
    { label: 'Agents', value: String(agents.length) },
    { label: 'Marketplaces', value: String(marketplaces.size) },
    { label: 'Project-Local', value: String(projectLocalCount) },
  ];

  const html = `<div class="content-inner">
    <div>
      <div class="page-title page-title--hero">Agents &amp; Skills</div>
      <div class="page-sub">Capabilities discoverable on disk from installed plugins and project-local configuration.</div>
    </div>

    <div class="kpi-grid kpi-grid--4">${kpis.map(k =>
      `<div class="kpi-card kpi-card--sm"><div class="kpi-label">${escHtml(k.label)}</div><div class="kpi-value">${escHtml(k.value)}</div></div>`
    ).join('')}</div>

    <div class="memory-search">
      ${icon('search', { size: 14 })}
      <input id="cap-search-input" placeholder="Search skills and agents...">
    </div>
    <label style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--text-secondary);margin-top:8px;cursor:pointer;">
      <input type="checkbox" id="cap-hide-nontech" checked>
      Hide non-technical (Discord/iMessage/Telegram)
    </label>

    <div class="two-col">
      <div>
        <div class="panel-title" id="skills-title">Skills (${skills.length})</div>
        <div class="panel" id="skills-list"></div>
      </div>
      <div>
        <div class="panel-title" id="agents-title">Agents (${agents.length})</div>
        <div class="panel" id="agents-list"></div>
      </div>
    </div>

    <div class="pricing-note">Built-in skills and subagents (e.g. Explore, Plan, general-purpose, dataviz) are compiled into the Claude Code CLI itself and aren't files on disk — only plugin-installed and project-local ones can be listed here.</div>
  </div>`;

  area.innerHTML = html;

  const renderLists = () => {
    const q = $('#cap-search-input', area).value.toLowerCase().trim();
    const hideNonTech = $('#cap-hide-nontech', area).checked;
    const matches = (x) => (!q || x.name.toLowerCase().includes(q) || x.description.toLowerCase().includes(q))
      && (!hideNonTech || !isNonTechnical(x));
    const shownSkills = skills.filter(matches);
    const shownAgents = agents.filter(matches);
    $('#skills-title', area).textContent = `Skills (${shownSkills.length})`;
    $('#agents-title', area).textContent = `Agents (${shownAgents.length})`;
    $('#skills-list', area).innerHTML = shownSkills.map(capabilityRow).join('') || '<div class="empty">No matches</div>';
    $('#agents-list', area).innerHTML = shownAgents.map(capabilityRow).join('') || '<div class="empty">No matches</div>';
  };

  $('#cap-search-input', area)?.addEventListener('input', renderLists);
  $('#cap-hide-nontech', area)?.addEventListener('change', renderLists);
  renderLists();
}

// ── Plans (all) ───────────────────────────────────────────────
// Plans are static markdown files with no execution state — there's no real
// "running/scheduled/failed" concept to show, so the KPIs and groups below are
// all derived from real file metadata (name/content/createdAt/updatedAt/size).
function planRow(plan) {
  const preview = plan.content.replace(/^#+\s*/gm, '').replace(/\n/g, ' ').slice(0, 140);
  const meta = [
    plan.updatedAt ? relTime(plan.updatedAt) : null,
    `${Math.round(plan.size / 1024 * 10) / 10} KB`,
  ].filter(Boolean).join(' · ');
  return `<div class="row" style="cursor:pointer;" onclick="App.navigate('plan','${escHtml(plan.filename)}')">
    ${pinButton('plan', plan.filename, plan.name)}
    <div class="row-main">
      <div class="row-title">${escHtml(plan.name)}</div>
      <div class="row-detail">${escHtml(preview)}</div>
    </div>
    <div class="row-meta">${meta}</div>
  </div>`;
}

export async function renderPlans(area, setBreadcrumb) {
  setBreadcrumb(['Plans']);
  const plans = [...(State.plans || [])].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  let html = `<div class="content-inner">
    <div>
      <div class="page-title page-title--hero">Plans</div>
      <div class="page-sub">~/.claude/plans/ · Plan files created with /plan or plan mode</div>
    </div>`;

  if (!plans.length) {
    html += `<div class="empty" style="text-align:left;padding:32px 0;">
      <div style="color:var(--ink-muted);font-size:13px;margin-bottom:8px;">No plans yet</div>
      <div style="color:var(--ink-faint);font-size:12px;">Plans are created when you use <code style="background:var(--code-bg);color:var(--code-fg);padding:2px 5px;border-radius:3px;">/plan</code> or enter plan mode in Claude Code.<br>They'll appear here automatically once created.</div>
    </div>`;
  } else {
    const weekAgo = Date.now() - 7 * 86_400_000;
    const recent = plans.filter(p => (p.updatedAt || 0) >= weekAgo);
    const older = plans.filter(p => (p.updatedAt || 0) < weekAgo);
    const totalSize = plans.reduce((s, p) => s + (p.size || 0), 0);

    const kpis = [
      { label: 'Total Plans', value: String(plans.length) },
      { label: 'Updated This Week', value: String(recent.length) },
      { label: 'Total Size', value: `${Math.round(totalSize / 1024 * 10) / 10} KB` },
      { label: 'Avg Size', value: `${Math.round(totalSize / plans.length / 1024 * 10) / 10} KB` },
      { label: 'Most Recent', value: plans[0]?.updatedAt ? relTime(plans[0].updatedAt) : '—' },
    ];
    html += `<div class="kpi-grid kpi-grid--5">${kpis.map(k =>
      `<div class="kpi-card kpi-card--sm"><div class="kpi-label">${escHtml(k.label)}</div><div class="kpi-value">${escHtml(k.value)}</div></div>`
    ).join('')}</div>`;

    if (recent.length) {
      html += `<div>
        <div class="panel-title">Updated Recently</div>
        <div class="panel">${recent.map(planRow).join('')}</div>
      </div>`;
    }
    if (older.length) {
      html += `<div>
        <div class="panel-title">Older</div>
        <div class="panel">${older.map(planRow).join('')}</div>
      </div>`;
    }
  }
  html += `</div>`;
  area.innerHTML = html;
}

// ── Single plan ───────────────────────────────────────────────
export async function renderPlan(area, setBreadcrumb, loadPlans) {
  const filename = State.sub;
  let plan = (State.plans || []).find(p => p.filename === filename);
  if (!plan) {
    await loadPlans();
    plan = (State.plans || []).find(p => p.filename === filename);
    if (!plan) { area.innerHTML = '<div class="empty">Plan not found</div>'; return; }
  }
  renderPlanContent(area, setBreadcrumb, plan);
}

function renderPlanContent(area, setBreadcrumb, plan) {
  setBreadcrumb(['Plans', plan.name]);
  area.innerHTML = `<div class="content-inner">
    <div>
      <div class="page-title">${icon('plans', { size: 18 })} ${escHtml(plan.name)} ${pinButton('plan', plan.filename, plan.name)}</div>
      <div class="page-sub">
        ${escHtml(plan.filename)} ·
        ${plan.updatedAt ? 'Updated ' + relTime(plan.updatedAt) : ''}
        ${plan.createdAt ? ' · Created ' + fmtDate(plan.createdAt) : ''}
        · ${Math.round(plan.size / 1024 * 10) / 10} KB
      </div>
    </div>
    <div class="md-content">${renderMd(plan.content)}</div>
  </div>`;
  highlightCode(area);
  attachCopyButtons(area);
}

export { sessionCard };
