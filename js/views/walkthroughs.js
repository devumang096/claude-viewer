import { $, escHtml, relTime, fmtDate, renderMd, highlightCode, attachCopyButtons } from '../utils.js';
import { State } from '../state.js';
import { icon } from '../icons.js';
import { pinButton } from './dashboard.js';

// ── Walkthroughs (all) ──────────────────────────────────────────
// Like plans, these are static markdown files with no execution state — a
// written explainer for a feature that's already shipped, saved for later
// reference rather than tracking in-progress work.
function walkthroughRow(walkthrough) {
  const preview = walkthrough.content.replace(/^#+\s*/gm, '').replace(/\n/g, ' ').slice(0, 140);
  const meta = [
    walkthrough.updatedAt ? relTime(walkthrough.updatedAt) : null,
    `${Math.round(walkthrough.size / 1024 * 10) / 10} KB`,
  ].filter(Boolean).join(' · ');
  return `<div class="row" style="cursor:pointer;" onclick="App.navigate('walkthrough','${escHtml(walkthrough.filename)}')">
    ${pinButton('walkthrough', walkthrough.filename, walkthrough.name)}
    <div class="row-main">
      <div class="row-title">${escHtml(walkthrough.name)}</div>
      <div class="row-detail">${escHtml(preview)}</div>
    </div>
    <div class="row-meta">${meta}</div>
  </div>`;
}

export async function renderWalkthroughs(area, setBreadcrumb) {
  setBreadcrumb(['Walkthroughs']);
  const walkthroughs = [...(State.walkthroughs || [])].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

  let html = `<div class="content-inner">
    <div>
      <div class="page-title page-title--hero">Walkthroughs</div>
      <div class="page-sub">~/.claude/walkthroughs/ · Written explainers for shipped features</div>
    </div>`;

  if (!walkthroughs.length) {
    html += `<div class="empty" style="text-align:left;padding:32px 0;">
      <div style="color:var(--ink-muted);font-size:13px;margin-bottom:8px;">No walkthroughs yet</div>
      <div style="color:var(--ink-faint);font-size:12px;">Ask Claude to write up a feature or change as a walkthrough and save it to <code style="background:var(--code-bg);color:var(--code-fg);padding:2px 5px;border-radius:3px;">~/.claude/walkthroughs/</code>.<br>It'll appear here automatically.</div>
    </div>`;
  } else {
    const weekAgo = Date.now() - 7 * 86_400_000;
    const recent = walkthroughs.filter(w => (w.updatedAt || 0) >= weekAgo);
    const older = walkthroughs.filter(w => (w.updatedAt || 0) < weekAgo);
    const totalSize = walkthroughs.reduce((s, w) => s + (w.size || 0), 0);

    const kpis = [
      { label: 'Total Walkthroughs', value: String(walkthroughs.length) },
      { label: 'Updated This Week', value: String(recent.length) },
      { label: 'Total Size', value: `${Math.round(totalSize / 1024 * 10) / 10} KB` },
      { label: 'Avg Size', value: `${Math.round(totalSize / walkthroughs.length / 1024 * 10) / 10} KB` },
      { label: 'Most Recent', value: walkthroughs[0]?.updatedAt ? relTime(walkthroughs[0].updatedAt) : '—' },
    ];
    html += `<div class="kpi-grid kpi-grid--5">${kpis.map(k =>
      `<div class="kpi-card kpi-card--sm"><div class="kpi-label">${escHtml(k.label)}</div><div class="kpi-value">${escHtml(k.value)}</div></div>`
    ).join('')}</div>`;

    if (recent.length) {
      html += `<div>
        <div class="panel-title">Updated Recently</div>
        <div class="panel">${recent.map(walkthroughRow).join('')}</div>
      </div>`;
    }
    if (older.length) {
      html += `<div>
        <div class="panel-title">Older</div>
        <div class="panel">${older.map(walkthroughRow).join('')}</div>
      </div>`;
    }
  }
  html += `</div>`;
  area.innerHTML = html;
}

// ── Single walkthrough ───────────────────────────────────────────
export async function renderWalkthrough(area, setBreadcrumb, loadWalkthroughs) {
  const filename = State.sub;
  let walkthrough = (State.walkthroughs || []).find(w => w.filename === filename);
  if (!walkthrough) {
    await loadWalkthroughs();
    walkthrough = (State.walkthroughs || []).find(w => w.filename === filename);
    if (!walkthrough) { area.innerHTML = '<div class="empty">Walkthrough not found</div>'; return; }
  }
  renderWalkthroughContent(area, setBreadcrumb, walkthrough);
}

function renderWalkthroughContent(area, setBreadcrumb, walkthrough) {
  setBreadcrumb(['Walkthroughs', walkthrough.name]);
  area.innerHTML = `<div class="content-inner">
    <div>
      <div class="page-title">${icon('walkthrough', { size: 18 })} ${escHtml(walkthrough.name)} ${pinButton('walkthrough', walkthrough.filename, walkthrough.name)}</div>
      <div class="page-sub">
        ${escHtml(walkthrough.filename)} ·
        ${walkthrough.updatedAt ? 'Updated ' + relTime(walkthrough.updatedAt) : ''}
        ${walkthrough.createdAt ? ' · Created ' + fmtDate(walkthrough.createdAt) : ''}
        · ${Math.round(walkthrough.size / 1024 * 10) / 10} KB
      </div>
    </div>
    <div class="md-content">${renderMd(walkthrough.content)}</div>
  </div>`;
  highlightCode(area);
  attachCopyButtons(area);
}
