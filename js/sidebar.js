import { $, $$, escHtml } from './utils.js';
import { State } from './state.js';
import { Pins } from './pins.js';
import { icon } from './icons.js';

// Configuration starts open per spec; the extra "More" group (History/Live/Plugins —
// real features that aren't part of the new nav spec but shouldn't be lost) starts collapsed.
const collapsedSections = new Set(['more']);

export function renderSidebar() {
  const nav = $('#sidebar-nav');
  const totalSessions = State.projects.reduce((s, p) => s + p.sessions.length, 0);
  const totalPlans = (State.plans || []).length;
  const totalWalkthroughs = (State.walkthroughs || []).length;
  const pins = Pins.list();

  const navRow = (id, iconName, label, { count = null, view = id, sub = null } = {}) => {
    const active = State.view === view && (sub == null || State.sub === sub);
    return `<div class="nav-item ${active ? 'active' : ''}" data-nav="${id}" onclick="App.navigate('${view}'${sub ? `,'${sub}'` : ''})">
      <span class="icon">${icon(iconName)}</span>
      <span class="label">${label}</span>
      ${count != null ? `<span class="badge">${count}</span>` : ''}
    </div>`;
  };

  let html = `
    <div>
      <div class="nav-group-label">Overview</div>
      ${navRow('dashboard', 'dashboard', 'Dashboard')}
    </div>

    <div>
      <div class="nav-group-label">Work</div>
      ${navRow('plans', 'plans', 'Plans', { count: totalPlans || null })}
      ${navRow('walkthroughs', 'walkthrough', 'Walkthroughs', { count: totalWalkthroughs || null })}
      ${navRow('sessions', 'sessions', 'Sessions', { count: totalSessions || null })}
    </div>

    <div>
      <div class="nav-group-label">Insights</div>
      ${navRow('costs', 'usage', 'Usage &amp; Cost')}
      ${navRow('memory', 'memory', 'Memory')}
      ${navRow('agents-skills', 'puzzle', 'Agents &amp; Skills')}
    </div>
  `;

  // ── Configuration (collapsible) ──
  const configOpen = !collapsedSections.has('config');
  html += `<div>
    <div class="nav-group-label clickable" onclick="toggleSection('config')">
      <span class="grow">Configuration</span>
      <span class="section-chevron ${configOpen ? '' : 'collapsed'}">${icon('chevron')}</span>
    </div>
    <div style="${configOpen ? '' : 'display:none'}">
      ${navRow('claude-md', 'claudeMd', 'CLAUDE.md')}
      ${navRow('settings', 'settings', 'Settings')}
    </div>
  </div>`;

  // ── Pinned ──
  html += `<div>
    <div class="nav-group-label">Pinned</div>`;
  if (!pins.length) {
    html += `<div class="pinned-empty">Nothing pinned yet</div>`;
  } else {
    for (const pin of pins) {
      const nav = pin.kind === 'session' ? `session:${pin.id}`
        : pin.kind === 'memory' ? `memory`
          : pin.kind === 'walkthrough' ? `walkthrough:${pin.id}`
            : `plan:${pin.id}`;
      const onclick = pin.kind === 'session'
        ? `App.navigate('session','${pin.id}','${pin.dirName}')`
        : pin.kind === 'memory'
          ? `App.navigate('memory')`
          : pin.kind === 'walkthrough'
            ? `App.navigate('walkthrough','${pin.id}')`
            : `App.navigate('plan','${pin.id}')`;
      const iconName = pin.kind === 'session' ? 'sessions'
        : pin.kind === 'memory' ? 'memory'
          : pin.kind === 'walkthrough' ? 'walkthrough'
            : 'plans';
      html += `<div class="nav-item" data-nav="${nav}" onclick="${onclick}" title="${escHtml(pin.title)}">
        <span class="icon">${icon(iconName)}</span>
        <span class="label">${escHtml(pin.title.length > 26 ? pin.title.slice(0, 26) + '…' : pin.title)}</span>
      </div>`;
    }
  }
  html += `</div>`;

  // ── More (History / Live Sessions / Plugins — real features not in the new nav spec) ──
  const moreOpen = !collapsedSections.has('more');
  html += `<div>
    <div class="nav-group-label clickable" onclick="toggleSection('more')">
      <span class="grow">More</span>
      <span class="section-chevron ${moreOpen ? '' : 'collapsed'}">${icon('chevron')}</span>
    </div>
    <div style="${moreOpen ? '' : 'display:none'}">
      ${navRow('history', 'clock', 'Command History')}
      ${navRow('live', 'zap', 'Live Sessions')}
      ${navRow('plugins', 'puzzle', 'Plugins')}
    </div>
  </div>`;

  nav.innerHTML = html;
}

export function toggleSection(id) {
  if (collapsedSections.has(id)) collapsedSections.delete(id);
  else collapsedSections.add(id);
  renderSidebar();
}

export function updateSidebarActive() {
  $$('.nav-item').forEach(el => el.classList.remove('active'));
  let active = $(`[data-nav="${State.view}${State.sub ? ':' + State.sub : ''}"]`);
  // Individual session/plan pages don't have their own nav row — fall back to
  // highlighting the parent list so there's still an active indicator.
  if (!active && State.view === 'plan') active = $('[data-nav="plans"]');
  if (!active && State.view === 'walkthrough') active = $('[data-nav="walkthroughs"]');
  if (!active && State.view === 'session') active = $('[data-nav="sessions"]');
  if (active) active.classList.add('active');
}
