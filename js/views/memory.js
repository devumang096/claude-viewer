import { $, $$, escHtml, relTime, renderMd, highlightCode, attachCopyButtons } from '../utils.js';
import { Api } from '../api.js';
import { State } from '../state.js';
import { icon } from '../icons.js';

const WIKI_LINK_RE = /\[\[([^\]]+)\]\]/g;

function normalize(s) {
  return String(s || '').toLowerCase().replace(/[-_\s]+/g, '-').trim();
}

function frontmatterName(content) {
  const m = content.match(/^name:\s*(.+)$/m);
  return m ? m[1].trim() : null;
}

function frontmatterBlock(content) {
  const m = content.match(/^---\n([\s\S]*?)\n---/);
  return m ? m[1] : null;
}

// Parses a `tags: [a, b]` or `tags:\n  - a\n  - b` frontmatter block. Files without
// either form simply contribute no tags — nothing is fabricated.
function extractTags(files) {
  const allTags = new Set();
  const perFileTags = new Map();
  for (const f of files) {
    const fm = frontmatterBlock(f.content);
    if (!fm) continue;
    let tags = [];
    const inline = fm.match(/^tags:\s*\[([^\]]*)\]/m);
    if (inline) {
      tags = inline[1].split(',').map(t => t.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    } else {
      const block = fm.match(/^tags:\s*\n((?:\s*-\s*.+\n?)+)/m);
      if (block) tags = [...block[1].matchAll(/-\s*(.+)/g)].map(m => m[1].trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    }
    if (tags.length) {
      perFileTags.set(f.filename, tags);
      tags.forEach(t => allTags.add(t));
    }
  }
  return { allTags: [...allTags].sort(), perFileTags };
}

// Plain-text pass over raw content resolving [[wiki-links]] and markdown links to
// real target files, using the same matching rules as the DOM-based resolver below
// (frontmatter `name:` wins, otherwise filename). Used for the overview's "referenced
// N times" counts, computed eagerly without rendering every file's markdown.
function computeBacklinkCounts(files) {
  const counts = new Map();
  const byProject = new Map();
  for (const f of files) {
    if (!byProject.has(f.project)) byProject.set(f.project, []);
    byProject.get(f.project).push(f);
  }
  for (const [, projFiles] of byProject) {
    const resolveMap = new Map();
    for (const f of projFiles) resolveMap.set(normalize(f.filename.replace(/\.(md|json)$/, '')), f);
    for (const f of projFiles) {
      const name = frontmatterName(f.content);
      if (name) resolveMap.set(normalize(name), f);
    }
    for (const f of projFiles) {
      const wikiRe = /\[\[([^\]]+)\]\]/g;
      let m;
      while ((m = wikiRe.exec(f.content))) {
        const target = resolveMap.get(normalize(m[1]));
        if (target && target.filename !== f.filename) counts.set(target.filename, (counts.get(target.filename) || 0) + 1);
      }
      const mdLinkRe = /\[[^\]]+\]\(([^)]+)\)/g;
      let m2;
      while ((m2 = mdLinkRe.exec(f.content))) {
        const href = m2[1];
        if (/^([a-z]+:)?\/\//i.test(href) || href.startsWith('#')) continue;
        const guess = href.split('/').pop().replace(/\.(md|json)$/, '');
        const target = resolveMap.get(normalize(guess));
        if (target && target.filename !== f.filename) counts.set(target.filename, (counts.get(target.filename) || 0) + 1);
      }
    }
  }
  return counts;
}

function memSizeKb(content) {
  return new Blob([content]).size / 1024;
}

// ── Memory overview ──────────────────────────────────────────────
export function renderMemoryOverview(area, setBreadcrumb, files) {
  setBreadcrumb(['Memory']);

  if (!files.length) {
    area.innerHTML = `<div class="content-inner">
      <div>
        <div class="page-title page-title--hero">Memory</div>
        <div class="page-sub">Persistent context Claude references across sessions.</div>
      </div>
      <div class="empty">No memory files found</div>
    </div>`;
    return;
  }

  const { allTags, perFileTags } = extractTags(files);
  const backlinkCounts = computeBacklinkCounts(files);
  const totalSizeKb = files.reduce((s, f) => s + memSizeKb(f.content), 0);
  const lastUpdated = Math.max(...files.map(f => f.updatedAt || 0));

  const kpis = [
    { label: 'Total Files', value: String(files.length) },
    { label: 'Total Size', value: `${Math.round(totalSizeKb * 10) / 10} KB` },
    { label: 'Last Updated', value: lastUpdated ? relTime(lastUpdated) : '—' },
    { label: 'Tags', value: String(allTags.length) },
  ];

  const byRecency = [...files].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const byRefs = files.map(f => ({ f, count: backlinkCounts.get(f.filename) || 0 })).sort((a, b) => b.count - a.count);

  const fileRow = (f, detail) => `<div class="row" style="cursor:pointer;" onclick="App.navigate('memory','${escHtml(f.filename)}')">
    <div class="row-main">
      <div class="row-name">${escHtml(f.filename)}</div>
      <div class="row-detail">${detail}</div>
    </div>
  </div>`;

  const recentHtml = (list) => list.length
    ? list.slice(0, 5).map(f => fileRow(f, `updated ${f.updatedAt ? relTime(f.updatedAt) : '—'}`)).join('')
    : '<div class="empty">No matches</div>';
  const frequentHtml = (list) => list.filter(x => x.count > 0).length || list.length
    ? (list.slice(0, 5).map(({ f, count }) => fileRow(f, `referenced ${count} time${count !== 1 ? 's' : ''}`)).join('') || '<div class="empty">No cross-references yet</div>')
    : '<div class="empty">No cross-references yet</div>';

  area.innerHTML = `<div class="content-inner">
    <div>
      <div class="page-title page-title--hero">Memory</div>
      <div class="page-sub">Persistent context Claude references across sessions.</div>
    </div>

    <div class="kpi-grid kpi-grid--4">${kpis.map(k =>
      `<div class="kpi-card kpi-card--sm"><div class="kpi-label">${escHtml(k.label)}</div><div class="kpi-value">${escHtml(k.value)}</div></div>`
    ).join('')}</div>

    <div class="memory-toolbar">
      <div class="memory-search">
        ${icon('search', { size: 14 })}
        <input id="memory-search-input" placeholder="Search memory files...">
      </div>
      ${allTags.map(t => `<span class="tag-chip" data-tag="${escHtml(t)}">#${escHtml(t)}</span>`).join('')}
    </div>

    <div class="two-col">
      <div>
        <div class="panel-title">Recently Modified</div>
        <div class="panel" id="memory-recent-list">${recentHtml(byRecency)}</div>
      </div>
      <div>
        <div class="panel-title">Frequently Referenced</div>
        <div class="panel" id="memory-frequent-list">${frequentHtml(byRefs)}</div>
      </div>
    </div>
  </div>`;

  function applyFilter() {
    const q = ($('#memory-search-input', area)?.value || '').toLowerCase().trim();
    const activeTag = $('.tag-chip.active', area)?.dataset.tag || null;
    const matches = (f) => {
      if (activeTag && !(perFileTags.get(f.filename) || []).includes(activeTag)) return false;
      if (q && !f.filename.toLowerCase().includes(q) && !f.content.toLowerCase().includes(q)) return false;
      return true;
    };
    $('#memory-recent-list', area).innerHTML = recentHtml(byRecency.filter(matches));
    $('#memory-frequent-list', area).innerHTML = frequentHtml(byRefs.filter(x => matches(x.f)));
  }

  $('#memory-search-input', area)?.addEventListener('input', applyFilter);
  $$('.tag-chip', area).forEach(chip => chip.addEventListener('click', () => {
    const wasActive = chip.classList.contains('active');
    $$('.tag-chip', area).forEach(c => c.classList.remove('active'));
    if (!wasActive) chip.classList.add('active');
    applyFilter();
  }));
}

// ── Memory detail (full markdown, wiki-links, backlinks) ─────────
// Resolve [[link]] text nodes to real anchors after marked.parse() has already run,
// so markdown syntax is never corrupted and code blocks are naturally skipped.
function resolveWikiLinks(containerEl, resolveMap, backlinkTracker, sourceFilename) {
  const walker = document.createTreeWalker(containerEl, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!WIKI_LINK_RE.test(node.nodeValue)) return NodeFilter.FILTER_REJECT;
      WIKI_LINK_RE.lastIndex = 0;
      const parentTag = node.parentElement?.tagName;
      if (parentTag === 'CODE' || parentTag === 'PRE') return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const targets = [];
  let n;
  // eslint-disable-next-line no-cond-assign
  while ((n = walker.nextNode())) targets.push(n);

  for (const textNode of targets) {
    const text = textNode.nodeValue;
    const frag = document.createDocumentFragment();
    let lastIndex = 0;
    let match;
    WIKI_LINK_RE.lastIndex = 0;
    // eslint-disable-next-line no-cond-assign
    while ((match = WIKI_LINK_RE.exec(text))) {
      const [full, linkText] = match;
      if (match.index > lastIndex) frag.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));

      const targetFile = resolveMap.get(normalize(linkText));
      if (targetFile) {
        const a = document.createElement('a');
        a.className = 'wiki-link';
        a.href = '#';
        a.dataset.targetFilename = targetFile.filename;
        a.textContent = linkText;
        a.addEventListener('click', (ev) => {
          ev.preventDefault();
          scrollToCard(targetFile.filename);
        });
        frag.appendChild(a);
        if (backlinkTracker && sourceFilename) {
          if (!backlinkTracker.has(targetFile.filename)) backlinkTracker.set(targetFile.filename, new Set());
          backlinkTracker.get(targetFile.filename).add(sourceFilename);
        }
      } else {
        const span = document.createElement('span');
        span.className = 'wiki-link-broken';
        span.title = `No memory file found for [[${linkText}]]`;
        span.textContent = linkText;
        frag.appendChild(span);
      }
      lastIndex = match.index + full.length;
    }
    if (lastIndex < text.length) frag.appendChild(document.createTextNode(text.slice(lastIndex)));
    textNode.parentNode.replaceChild(frag, textNode);
  }
}

function scrollToCard(filename) {
  const target = document.querySelector(`.memory-file-card[data-filename="${CSS.escape(filename)}"]`);
  if (!target) return;
  target.scrollIntoView({ block: 'start' });
  target.classList.add('search-jump-highlight');
  setTimeout(() => target.classList.remove('search-jump-highlight'), 1600);
}

// Memory files also cross-reference each other with plain markdown links
// (e.g. `[Title](other-file.md)`), not just `[[wiki-links]]`. Rewire those that
// point at another memory file in this project to jump within the page instead
// of doing a real navigation (which 404s — the file only exists under ~/.claude).
function interceptMarkdownLinks(containerEl, resolveMap, backlinkTracker, sourceFilename) {
  for (const a of containerEl.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href');
    if (/^([a-z]+:)?\/\//i.test(href) || href.startsWith('#')) continue; // external / anchor links untouched
    const filenameGuess = href.split('/').pop().replace(/\.(md|json)$/, '');
    const targetFile = resolveMap.get(normalize(filenameGuess));
    if (!targetFile) continue;

    a.classList.add('wiki-link');
    a.href = '#';
    a.addEventListener('click', (ev) => {
      ev.preventDefault();
      scrollToCard(targetFile.filename);
    });
    if (backlinkTracker && sourceFilename) {
      if (!backlinkTracker.has(targetFile.filename)) backlinkTracker.set(targetFile.filename, new Set());
      backlinkTracker.get(targetFile.filename).add(sourceFilename);
    }
  }
}

function renderMemoryDetail(area, setBreadcrumb, files) {
  setBreadcrumb(['Memory']);

  let html = `<div class="content-inner">
    <div>
      <div class="page-title">Memory</div>
      <div class="page-sub">${files.length} file${files.length !== 1 ? 's' : ''} · ~/.claude/projects/*/memory/</div>
    </div>
    <div>`;

  // MEMORY.md first (index)
  const sorted = [...files].sort((a, b) =>
    a.filename === 'MEMORY.md' ? -1 : b.filename === 'MEMORY.md' ? 1 : a.filename.localeCompare(b.filename)
  );

  for (const f of sorted) {
    const isIndex = f.filename === 'MEMORY.md';
    html += `<div class="memory-file-card" data-filename="${escHtml(f.filename)}">
      <div class="memory-file-header">
        <span class="memory-file-name">${icon(isIndex ? 'claudeMd' : 'memory', { size: 13 })} ${escHtml(f.filename)}</span>
        ${f.updatedAt ? `<span class="memory-file-meta">${relTime(f.updatedAt)}</span>` : ''}
      </div>
      <div class="md-content">${renderMd(f.content)}</div>
      <div class="memory-backlinks" data-backlinks-for="${escHtml(f.filename)}"></div>
    </div>`;
  }
  html += `</div></div>`;
  area.innerHTML = html;
  highlightCode(area);
  attachCopyButtons(area);

  // Resolve wiki-links per project (memory is project-scoped, don't cross-resolve between projects)
  const backlinks = new Map(); // filename -> Set(sourceFilenames)
  const byProject = new Map();
  for (const f of files) {
    if (!byProject.has(f.project)) byProject.set(f.project, []);
    byProject.get(f.project).push(f);
  }

  for (const [, projFiles] of byProject) {
    const resolveMap = new Map();
    for (const f of projFiles) {
      resolveMap.set(normalize(f.filename.replace(/\.(md|json)$/, '')), f);
    }
    for (const f of projFiles) {
      const name = frontmatterName(f.content);
      if (name) resolveMap.set(normalize(name), f); // frontmatter name takes priority on collision
    }
    for (const f of projFiles) {
      const card = $(`.memory-file-card[data-filename="${CSS.escape(f.filename)}"]`, area);
      const mdContent = card?.querySelector('.md-content');
      if (mdContent) {
        resolveWikiLinks(mdContent, resolveMap, backlinks, f.filename);
        interceptMarkdownLinks(mdContent, resolveMap, backlinks, f.filename);
      }
    }
  }

  // Render backlinks per card
  for (const el of $$('.memory-backlinks', area)) {
    const filename = el.dataset.backlinksFor;
    const sources = backlinks.get(filename);
    if (!sources || !sources.size) continue;
    const list = [...sources].sort();
    el.innerHTML = `
      <div class="thinking-toggle memory-backlinks-toggle">
        <span>🔗</span> <span>Linked from ${list.length} file${list.length !== 1 ? 's' : ''}</span> <span class="chevron">▶</span>
      </div>
      <div class="memory-backlinks-list">
        ${list.map(fn => `<a href="#" data-jump="${escHtml(fn)}">${escHtml(fn)}</a>`).join('')}
      </div>`;
  }
  $$('.memory-backlinks-toggle', area).forEach(el => el.addEventListener('click', () => {
    el.classList.toggle('open');
    el.nextElementSibling.classList.toggle('visible');
  }));
  $$('.memory-backlinks-list a', area).forEach(a => a.addEventListener('click', (ev) => {
    ev.preventDefault();
    scrollToCard(a.dataset.jump);
  }));

  // Jump-to-highlight, if navigated here from the overview or a search result
  if (State._jumpToFilename) {
    scrollToCard(State._jumpToFilename);
    State._jumpToFilename = null;
  }
}

// ── Dispatcher ─────────────────────────────────────────────────
// No sub-route: the new overview (KPIs/search/tags/ranked lists). With a filename
// in the route: jump straight into the existing full-content detail view.
export async function renderMemory(area, setBreadcrumb) {
  const files = await Api.memory();
  if (State.sub) {
    State._jumpToFilename = State.sub;
    renderMemoryDetail(area, setBreadcrumb, files);
  } else {
    renderMemoryOverview(area, setBreadcrumb, files);
  }
}
