import { $, $$, escHtml, relTime, fmtUsd, fmtTokens, fmtDate, dailyBuckets, monthlySpend } from '../utils.js';
import { State } from '../state.js';
import { Api } from '../api.js';
import { Pins } from '../pins.js';

export function pinButton(kind, id, title, extra = null) {
  const pinned = Pins.has(kind, id);
  const titleAttr = escHtml(title).replace(/'/g, '&#39;');
  const extraArg = extra != null ? `,'${extra}'` : ',null';
  return `<button class="pin-btn ${pinned ? 'pinned' : ''}" title="${pinned ? 'Unpin' : 'Pin'}"
    onclick="event.stopPropagation(); App.togglePin('${kind}','${id}','${titleAttr}'${extraArg}, this)">${pinned ? '★' : '☆'}</button>`;
}

// Only the facts that matter for scanning a list: when, how much happened, roughly what it cost.
// Everything else (tool calls, sub-conversation count, session id) lives on the detail page.
export function sessionCard(sess) {
  const messageCount = sess.userCount + sess.assistantCount;
  const meta = [
    sess.endTime ? relTime(sess.endTime) : null,
    `${messageCount} msg${messageCount !== 1 ? 's' : ''}`,
    sess.usage?.estCostUsd >= 0.01 ? fmtUsd(sess.usage.estCostUsd) : null,
  ].filter(Boolean);

  return `<div class="session-card" onclick="App.navigate('session','${sess.id}','${sess.dirName}')">
    ${pinButton('session', sess.id, sess.title, sess.dirName)}
    <div class="session-card-title">${escHtml(sess.title)}</div>
    <div class="session-card-preview">${escHtml(sess.preview || '')}</div>
    <div class="session-card-meta">${meta.map(m => `<span>${m}</span>`).join('')}</div>
  </div>`;
}

export function liveCard(s) {
  return `<div class="live-card">
    <div class="live-card-header">
      <div class="live-status ${s.status}"></div>
      <div class="live-name">${escHtml(s.name || s.sessionId?.slice(0, 8))}</div>
      <span class="tag ${s.status === 'busy' ? 'tag-good' : 'tag-neutral'}" style="margin-left:auto">${s.status}</span>
    </div>
    <div class="live-cwd">${escHtml(s.cwd || '')}</div>
    <div class="live-meta">
      <span>pid ${s.pid || ''}</span>
      <span>${escHtml(s.version || '')}</span>
      <span>started ${relTime(s.startedAt)}</span>
      <span>updated ${relTime(s.updatedAt)}</span>
    </div>
  </div>`;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function sparklinePoints(values) {
  const w = 52, h = 20;
  const max = Math.max(...values), min = Math.min(...values);
  const range = max - min || 1;
  return values.map((v, i) => `${(i / (values.length - 1)) * w},${h - ((v - min) / range) * h}`).join(' ');
}

function fmtDuration(ms) {
  const mins = Math.max(0, Math.floor(ms / 60000));
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

// All 5 KPIs are real, derived from `buckets` (trailing 7 real calendar days,
// built from session timestamps already loaded client-side — see dailyBuckets in utils.js)
// and the live-session registry. No fabricated metrics.
function buildKpis(buckets, live) {
  const today = buckets[buckets.length - 1];
  const yesterday = buckets[buckets.length - 2];
  const busyCount = live.filter(s => s.status === 'busy').length;
  const idleCount = live.length - busyCount;

  const thisMonth = monthlySpend(State.projects, 0);
  const lastMonth = monthlySpend(State.projects, 1);
  const spendDeltaPct = lastMonth ? ((thisMonth - lastMonth) / lastMonth) * 100 : null;
  const tokensDeltaPct = yesterday.tokens ? ((today.tokens - yesterday.tokens) / yesterday.tokens) * 100 : null;
  const avgCacheHit = buckets.reduce((s, b) => s + b.cacheHitRate, 0) / buckets.length;

  return [
    {
      label: 'Active Sessions', value: String(busyCount), unit: 'running',
      delta: live.length ? `${idleCount} idle` : 'none live',
      good: true,
      spark: buckets.map(b => b.sessionCount),
    },
    {
      label: 'Monthly Spend', value: fmtUsd(thisMonth), unit: '',
      delta: spendDeltaPct == null ? 'no prior month' : `${spendDeltaPct >= 0 ? '↑' : '↓'} ${Math.abs(spendDeltaPct).toFixed(0)}% vs last mo.`,
      good: spendDeltaPct == null || spendDeltaPct <= 15,
      spark: buckets.map(b => b.cost),
    },
    {
      label: 'Tokens Today', value: fmtTokens(today.tokens), unit: 'tokens',
      delta: tokensDeltaPct == null ? `${fmtTokens(today.tokens)} today` : `${tokensDeltaPct >= 0 ? '↑' : '↓'} ${Math.abs(tokensDeltaPct).toFixed(0)}% vs yesterday`,
      good: true,
      spark: buckets.map(b => b.tokens),
    },
    {
      label: 'Msgs & Tool Calls', value: String(today.messageCount), unit: 'today',
      delta: `${today.toolCalls} tool call${today.toolCalls !== 1 ? 's' : ''}`,
      good: true,
      spark: buckets.map(b => b.messageCount),
    },
    {
      label: 'Cache Hit Rate', value: (today.cacheHitRate * 100).toFixed(1), unit: '%',
      delta: `${(avgCacheHit * 100).toFixed(0)}% avg (7d)`,
      good: today.cacheHitRate >= 0.4,
      spark: buckets.map(b => b.cacheHitRate * 100),
    },
  ];
}

function kpiCard(k) {
  return `<div class="kpi-card">
    <div class="kpi-label">${escHtml(k.label)}</div>
    <div class="kpi-value-row">
      <span class="kpi-value">${k.value}</span>
      ${k.unit ? `<span class="kpi-unit">${escHtml(k.unit)}</span>` : ''}
    </div>
    <div class="kpi-foot">
      <span class="kpi-delta ${k.good ? '' : 'warn'}">${escHtml(k.delta)}</span>
      <svg class="kpi-spark" width="52" height="20" viewBox="0 0 52 20"><polyline points="${sparklinePoints(k.spark)}" fill="none" stroke-width="1.6"/></svg>
    </div>
  </div>`;
}

// Live-session records only carry cwd/pid/status/timestamps — no tokens, cost, or
// model. Where the live sessionId matches a parsed session (the common case), join
// in real usage data; otherwise leave those stats as "—" rather than fabricating them.
function activeNowHtml(live) {
  const busy = live.filter(s => s.status === 'busy');
  if (!busy.length) return `<div class="active-now-empty">No sessions running right now</div>`;

  const allSessions = State.projects.flatMap(p => p.sessions.map(s => ({ ...s, dirName: p.dirName })));

  return busy.map(s => {
    const matched = allSessions.find(sess => sess.id === s.sessionId);
    const dominantModel = matched?.usage?.byModel
      ? Object.entries(matched.usage.byModel).sort((a, b) =>
          (b[1].inputTokens + b[1].outputTokens) - (a[1].inputTokens + a[1].outputTokens))[0]?.[0]
      : null;
    const name = escHtml(s.name || s.sessionId?.slice(0, 8) || 'session');
    const openAttr = matched ? `onclick="App.navigate('session','${s.sessionId}','${matched.dirName}')"` : 'disabled';

    return `<div class="active-now-card">
      <div class="active-now-head">
        <span class="dot dot--good dot--live"></span>
        <span class="active-now-name">${name}</span>
        ${dominantModel ? `<span class="badge badge--accent mono">${escHtml(dominantModel)}</span>` : ''}
        <span class="badge ${s.status === 'busy' ? 'badge--good' : 'badge--neutral'}">${escHtml(s.status)}</span>
        <div style="flex:1"></div>
        <button class="btn btn-icon" ${openAttr}>Open</button>
      </div>
      <div class="active-now-path">${escHtml(s.cwd || '')}</div>
      <div class="active-now-stats">
        <div><div class="active-now-stat-label">Elapsed</div><div class="active-now-stat-value">${s.startedAt ? fmtDuration(Date.now() - s.startedAt) : '—'}</div></div>
        <div><div class="active-now-stat-label">Tokens</div><div class="active-now-stat-value">${matched ? fmtTokens((matched.usage?.inputTokens || 0) + (matched.usage?.outputTokens || 0)) : '—'}</div></div>
        <div><div class="active-now-stat-label">Est. Cost</div><div class="active-now-stat-value">${matched?.usage?.estCostUsd != null ? fmtUsd(matched.usage.estCostUsd) : '—'}</div></div>
        <div><div class="active-now-stat-label">Last Activity</div><div class="active-now-stat-value">${s.updatedAt ? relTime(s.updatedAt) : '—'}</div></div>
      </div>
    </div>`;
  }).join('');
}

function dayLabel(ts) {
  const d = new Date(ts), now = new Date();
  const startOfDay = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return fmtDate(ts);
}

// Merges real sessions + real plans into one feed. "Errors" has no backing data
// source in this app (no crash/error log is exposed anywhere) — selecting that
// filter shows a genuine empty state instead of fabricated rows.
function buildActivityItems() {
  const sessions = State.projects.flatMap(p => p.sessions.map(s => ({
    kind: 'session', ts: s.endTime, title: s.title, detail: s.preview || '',
    cost: s.usage?.estCostUsd, id: s.id, dirName: p.dirName,
  })));
  const plans = (State.plans || []).map(p => ({
    kind: 'plan', ts: p.updatedAt, title: p.name,
    detail: p.content.replace(/^#+\s*/gm, '').replace(/\n/g, ' ').slice(0, 120),
    size: p.size, filename: p.filename,
  }));
  const walkthroughs = (State.walkthroughs || []).map(w => ({
    kind: 'walkthrough', ts: w.updatedAt, title: w.name,
    detail: w.content.replace(/^#+\s*/gm, '').replace(/\n/g, ' ').slice(0, 120),
    size: w.size, filename: w.filename,
  }));
  return [...sessions, ...plans, ...walkthroughs].filter(i => i.ts).sort((a, b) => b.ts - a.ts).slice(0, 40);
}

function activityRow(it) {
  const onclick = it.kind === 'session'
    ? `App.navigate('session','${it.id}','${it.dirName}')`
    : it.kind === 'walkthrough'
      ? `App.navigate('walkthrough','${it.filename}')`
      : `App.navigate('plan','${it.filename}')`;
  const meta = [
    relTime(it.ts),
    it.kind === 'session'
      ? (it.cost >= 0.01 ? fmtUsd(it.cost) : null)
      : (it.size != null ? `${Math.round(it.size / 1024 * 10) / 10} KB` : null),
  ].filter(Boolean).join(' · ');

  return `<div class="activity-row" onclick="${onclick}">
    <span class="dot ${it.kind === 'session' ? 'dot--accent' : 'dot--neutral'}"></span>
    <div class="row-main">
      <div class="row-title">${escHtml(it.title)}</div>
      <div class="row-detail">${escHtml(it.detail)}</div>
    </div>
    <div class="row-meta">${meta}</div>
    <span class="badge badge--neutral">${it.kind}</span>
  </div>`;
}

function activityGroupsHtml(items, filter) {
  let filtered = items;
  if (filter === 'sessions') filtered = items.filter(i => i.kind === 'session');
  else if (filter === 'plans') filtered = items.filter(i => i.kind === 'plan');
  else if (filter === 'walkthroughs') filtered = items.filter(i => i.kind === 'walkthrough');
  else if (filter === 'errors') filtered = [];

  if (!filtered.length) return `<div class="empty">${filter === 'errors' ? 'No errors recorded' : 'No activity yet'}</div>`;

  const groups = new Map();
  for (const it of filtered) {
    const label = dayLabel(it.ts);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(it);
  }
  return [...groups.entries()]
    .map(([day, dayItems]) => `<div class="activity-day-header">${escHtml(day)}</div>${dayItems.map(activityRow).join('')}`)
    .join('');
}

export async function renderDashboard(area, setBreadcrumb) {
  setBreadcrumb(['Dashboard']);
  const live = await Api.liveSessions();
  const buckets = dailyBuckets(State.projects, 7);
  const kpis = buildKpis(buckets, live);
  const activityItems = buildActivityItems();

  let html = `<div class="content-inner">
    <div>
      <h1 class="page-title page-title--hero">${greeting()}</h1>
      <div class="page-sub">Here's what's happening across your workspace.</div>
    </div>

    <div class="kpi-grid kpi-grid--5">${kpis.map(kpiCard).join('')}</div>

    <div>
      <div class="panel-title"><span>Active Now</span><span class="dot dot--good"></span></div>
      ${activeNowHtml(live)}
    </div>

    <div>
      <div style="display:flex;align-items:center;gap:16px;margin-bottom:12px;">
        <div class="panel-title" style="margin:0;flex:1;">Activity</div>
        <div class="activity-filters" id="activity-filters">
          ${['all', 'sessions', 'plans', 'walkthroughs', 'errors'].map(f =>
            `<div class="chip ${f === 'all' ? 'active' : ''}" data-filter="${f}">${f[0].toUpperCase()}${f.slice(1)}</div>`
          ).join('')}
        </div>
      </div>
      <div class="panel" id="activity-list">${activityGroupsHtml(activityItems, 'all')}</div>
    </div>
  </div>`;

  area.innerHTML = html;

  $$('.chip', area).forEach(chip => chip.addEventListener('click', () => {
    $$('.chip', area).forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    $('#activity-list', area).innerHTML = activityGroupsHtml(activityItems, chip.dataset.filter);
  }));
}
