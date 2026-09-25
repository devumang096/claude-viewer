const STORAGE_KEY = 'claude-viewer:theme';
const ORDER = ['system', 'light', 'dark'];
const ICON = { system: '◐', light: '☀', dark: '☾' };

export const Theme = {
  current: 'system',

  init() {
    this.current = localStorage.getItem(STORAGE_KEY) || 'system';
    this.apply();
  },

  apply() {
    if (this.current === 'system') {
      delete document.documentElement.dataset.theme;
    } else {
      document.documentElement.dataset.theme = this.current;
    }
  },

  cycle() {
    const i = ORDER.indexOf(this.current);
    this.current = ORDER[(i + 1) % ORDER.length];
    localStorage.setItem(STORAGE_KEY, this.current);
    this.apply();
    this.updateButton();
  },

  updateButton() {
    const btn = document.getElementById('theme-toggle');
    if (!btn) return;
    btn.textContent = ICON[this.current];
    btn.title = `Theme: ${this.current} (click to cycle)`;
  },
};
