import { $, escHtml } from './utils.js';
import { State } from './state.js';
import { Api } from './api.js';
import { initRouter, navigateTo } from './router.js';
import { Pins } from './pins.js';
import { Theme } from './theme.js';
import { renderSidebar, toggleSection, updateSidebarActive } from './sidebar.js';
import { initKeyboard, attachListKeyboardNav } from './keyboard.js';
import { openSearch, closeSearch, isSearchOpen, initSearch } from './search.js';

import { renderDashboard } from './views/dashboard.js';
import { renderSession } from './views/session.js';
import { renderMemory } from './views/memory.js';
import { renderCosts } from './views/costs.js';
import { renderSessionsList } from './views/sessions-list.js';
import {
  renderClaudeMd, renderSettings, renderHistory, filterHistory,
  renderLive, renderPlugins, renderPlans, renderPlan, renderAgentsSkills,
} from './views/misc.js';
import { renderWalkthroughs, renderWalkthrough } from './views/walkthroughs.js';

export const App = {
  async init() {
    Theme.init();
    await Promise.all([this.loadProjects(), this.loadPlans(), this.loadWalkthroughs()]);
    this.renderSidebar();
    Theme.updateButton();
    initSearch();
    $('#search-open-btn').addEventListener('click', () => (isSearchOpen() ? closeSearch() : openSearch()));
    $('#topbar-search-btn').addEventListener('click', () => (isSearchOpen() ? closeSearch() : openSearch()));
    initKeyboard({
      onOpenSearch: () => (isSearchOpen() ? closeSearch() : openSearch()),
      onEscape: () => {
        if (isSearchOpen()) closeSearch();
        else if (document.body.classList.contains('sidebar-open')) this.closeSidebar();
      },
      onRefresh: () => this.refresh(),
    });

    initRouter((view, sub, extra) => {
      State.view = view;
      State.sub = sub;
      State.extra = extra;
      updateSidebarActive();
      this.render();
    });
  },

  async loadProjects() {
    State.projects = await Api.projects();
  },

  async loadPlans() {
    State.plans = await Api.plans();
    State._planCount = State.plans.length || null;
  },

  async loadWalkthroughs() {
    State.walkthroughs = await Api.walkthroughs();
    State._walkthroughCount = State.walkthroughs.length || null;
  },

  async refresh() {
    await Promise.all([this.loadProjects(), this.loadPlans(), this.loadWalkthroughs()]);
    this.renderSidebar();
    this.render();
  },

  navigate(view, sub = null, extra = null) {
    navigateTo(view, sub, extra, (v, s, e) => {
      State.view = v;
      State.sub = s;
      State.extra = e;
      updateSidebarActive();
      this.render();
    });
    this.closeSidebar();
  },

  toggleSidebar() {
    document.body.classList.toggle('sidebar-open');
  },

  closeSidebar() {
    document.body.classList.remove('sidebar-open');
  },

  renderSidebar() {
    renderSidebar();
  },

  togglePin(kind, id, title, extra, btnEl) {
    const nowPinned = Pins.toggle({ kind, id, title, dirName: extra });
    if (btnEl) {
      btnEl.classList.toggle('pinned', nowPinned);
      btnEl.textContent = nowPinned ? '★' : '☆';
      btnEl.title = nowPinned ? 'Unpin' : 'Pin';
    }
    this.renderSidebar();
  },

  filterHistory(q) {
    filterHistory(q);
  },

  setBreadcrumb(parts) {
    const bc = $('#breadcrumb');
    bc.innerHTML = ['~/.claude', ...parts].map((p, i) =>
      i < parts.length ? `<span>${escHtml(p)}</span><span class="sep">/</span>` : `<span class="current">${escHtml(p)}</span>`
    ).join('');
  },

  async render() {
    const area = $('#content-area');
    area.innerHTML = '<div class="loading">Loading</div>';
    area.scrollTop = 0;
    const setBreadcrumb = (parts) => this.setBreadcrumb(parts);

    switch (State.view) {
      case 'dashboard':
        await renderDashboard(area, setBreadcrumb);
        attachListKeyboardNav(area, '.session-card', (el) => el.click());
        break;
      case 'claude-md': await renderClaudeMd(area, setBreadcrumb); break;
      case 'settings': await renderSettings(area, setBreadcrumb); break;
      case 'memory': await renderMemory(area, setBreadcrumb); break;
      case 'costs': await renderCosts(area, setBreadcrumb); break;
      case 'agents-skills': await renderAgentsSkills(area, setBreadcrumb); break;
      case 'sessions':
        await renderSessionsList(area, setBreadcrumb);
        attachListKeyboardNav(area, '.session-card', (el) => el.click());
        break;
      case 'session': await renderSession(area, setBreadcrumb); break;
      case 'history':
        await renderHistory(area, setBreadcrumb);
        attachListKeyboardNav(area, '.history-item', (el) => el.click());
        break;
      case 'live': await renderLive(area, setBreadcrumb); break;
      case 'plugins': await renderPlugins(area, setBreadcrumb); break;
      case 'plans': await renderPlans(area, setBreadcrumb); break;
      case 'plan': await renderPlan(area, setBreadcrumb, () => this.loadPlans()); break;
      case 'walkthroughs': await renderWalkthroughs(area, setBreadcrumb); break;
      case 'walkthrough': await renderWalkthrough(area, setBreadcrumb, () => this.loadWalkthroughs()); break;
      default: area.innerHTML = '<div class="empty">Unknown view</div>';
    }
  },
};

// Expose for the inline onclick="" handlers used throughout the generated HTML —
// ES modules don't put top-level bindings on window automatically.
window.App = App;
window.toggleSection = toggleSection;
window.Theme = Theme;

// ── Boot ───────────────────────────────────────────────────────
App.init().catch(console.error);
