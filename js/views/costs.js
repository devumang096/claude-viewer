import { escHtml, fmtUsd, fmtTokens, dailyBuckets, monthlySpend } from '../utils.js';
import { Api } from '../api.js';
import { State } from '../state.js';

// A single accent system means model-distribution segments are differentiated by
// varying the orange accent's lightness rather than introducing off-palette colors.
const MODEL_COLORS = ['oklch(62% 0.14 40)', 'oklch(70% 0.11 40)', 'oklch(78% 0.08 45)', 'oklch(86% 0.05 55)'];
const OTHER_COLOR = 'oklch(88% 0.01 55)';

export async function renderCosts(area, setBreadcrumb) {
  setBreadcrumb(['Usage & Cost']);
  const costs = await Api.costs();
  const { totals, byModel, byProject, pricingNote } = costs;

  const buckets = dailyBuckets(State.projects, 7);
  const today = buckets[buckets.length - 1];
  const totalSessionCount = byProject.reduce((s, p) => s + p.sessionCount, 0);
  const avgCostPerSession = totalSessionCount ? totals.estCostUsd / totalSessionCount : 0;
  const cacheHitRate = (totals.cacheReadTokens + totals.inputTokens) > 0
    ? totals.cacheReadTokens / (totals.cacheReadTokens + totals.inputTokens) : 0;

  const kpis = [
    { label: 'Monthly Spend', value: fmtUsd(monthlySpend(State.projects, 0)) },
    { label: 'Avg Cost / Session', value: fmtUsd(avgCostPerSession) },
    { label: 'Tokens Today', value: fmtTokens(today.tokens) },
    { label: 'Cache Hit Rate', value: `${(cacheHitRate * 100).toFixed(1)}%` },
  ];

  const maxTokens = Math.max(...buckets.map(b => b.tokens), 1);
  const barChart = buckets.map(b =>
    `<div class="bar-chart-col"><div class="bar-chart-bar" style="height:${Math.max(3, b.tokens / maxTokens * 100)}%"></div><span class="bar-chart-label">${escHtml(b.label)}</span></div>`
  ).join('');

  const totalModelCost = byModel.reduce((s, m) => s + m.estCostUsd, 0) || 1;
  const modelSegments = byModel.slice(0, 4).map((m, i) => ({ name: m.model, cost: m.estCostUsd, color: MODEL_COLORS[i], estimated: m.estimated }));
  if (byModel.length > 4) {
    modelSegments.push({ name: 'Other', cost: byModel.slice(4).reduce((s, m) => s + m.estCostUsd, 0), color: OTHER_COLOR, estimated: false });
  }
  const stackedBar = modelSegments.map(s => `<div style="width:${(s.cost / totalModelCost * 100).toFixed(2)}%;background:${s.color};"></div>`).join('');
  const legend = modelSegments.map(s => `<div class="legend-row">
    <span class="legend-dot" style="background:${s.color}"></span>
    <span class="legend-name mono">${escHtml(s.name)}${s.estimated ? '<span class="estimated-flag" title="Unrecognized model, priced at Sonnet-tier rates">approx</span>' : ''}</span>
    <span class="legend-pct">${(s.cost / totalModelCost * 100).toFixed(0)}%</span>
  </div>`).join('');

  const projectsSorted = [...byProject].sort((a, b) => b.estCostUsd - a.estCostUsd).slice(0, 6);
  const maxProjectCost = Math.max(...projectsSorted.map(p => p.estCostUsd), 1);
  const hbars = projectsSorted.map(p => {
    const name = p.projectPath.split('/').pop() || p.projectPath;
    return `<div class="hbar-row">
      <div class="hbar-head"><span class="name">${escHtml(name)}</span><span class="value">${fmtUsd(p.estCostUsd)}</span></div>
      <div class="hbar-track"><div class="hbar-fill" style="width:${(p.estCostUsd / maxProjectCost * 100).toFixed(1)}%"></div></div>
    </div>`;
  }).join('');

  // Not exposed by /api/costs (only per-project/per-model aggregates) — computed
  // client-side from the per-session usage already loaded in State.projects.
  const expensive = State.projects.flatMap(p => p.sessions.filter(s => s.usage?.estCostUsd))
    .sort((a, b) => b.usage.estCostUsd - a.usage.estCostUsd).slice(0, 5);
  const expensiveRows = expensive.length
    ? expensive.map(s => `<div class="expensive-row"><span class="name">${escHtml(s.title)}</span><span class="cost">${fmtUsd(s.usage.estCostUsd)}</span></div>`).join('')
    : '<div class="empty">No usage data found</div>';

  const html = `<div class="content-inner">
    <div>
      <div class="page-title page-title--hero">Usage &amp; Cost</div>
      <div class="page-sub">Where your tokens and spend are going.</div>
    </div>

    <div class="kpi-grid kpi-grid--4">${kpis.map(k =>
      `<div class="kpi-card kpi-card--sm"><div class="kpi-label">${escHtml(k.label)}</div><div class="kpi-value">${escHtml(k.value)}</div></div>`
    ).join('')}</div>

    <div class="usage-grid">
      <div class="panel panel-pad">
        <div class="panel-title">Token Usage — Last 7 Days</div>
        <div class="bar-chart">${barChart}</div>
      </div>
      <div class="panel panel-pad">
        <div class="panel-title">Model Distribution</div>
        ${byModel.length ? `<div class="stacked-bar">${stackedBar}</div><div class="legend">${legend}</div>` : '<div class="empty">No usage data found</div>'}
      </div>
    </div>

    <div class="usage-grid" style="grid-template-columns:1fr 1fr;">
      <div class="panel panel-pad">
        <div class="panel-title">Cost by Project</div>
        <div class="hbar">${hbars || '<div class="empty">No usage data found</div>'}</div>
      </div>
      <div class="panel panel-pad">
        <div class="panel-title">Most Expensive Sessions</div>
        <div>${expensiveRows}</div>
      </div>
    </div>

    <div class="pricing-note">${escHtml(pricingNote)}</div>
  </div>`;

  area.innerHTML = html;
}
