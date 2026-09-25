// Global keyboard shortcuts: Cmd/Ctrl+K or / to open search, Cmd/Ctrl+R to refresh, Esc to close the topmost overlay.
export function initKeyboard({ onOpenSearch, onEscape, onRefresh }) {
  document.addEventListener('keydown', (ev) => {
    const isTyping = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName);

    if ((ev.metaKey || ev.ctrlKey) && ev.key === 'k') {
      ev.preventDefault();
      onOpenSearch();
      return;
    }
    if ((ev.metaKey || ev.ctrlKey) && ev.key === 'r') {
      ev.preventDefault();
      onRefresh();
      return;
    }
    if (ev.key === '/' && !isTyping) {
      ev.preventDefault();
      onOpenSearch();
      return;
    }
    if (ev.key === 'Escape') {
      onEscape();
    }
  });
}

// Scoped j/k + arrow-key navigation within a dense list (dashboard recent-sessions, history).
// Tracks a "kbd-active" class on itemSelector children; Enter activates via onActivate(el).
export function attachListKeyboardNav(container, itemSelector, onActivate) {
  if (!container) return;
  let idx = -1;

  function items() {
    return [...container.querySelectorAll(itemSelector)];
  }
  function setActive(newIdx) {
    const list = items();
    if (!list.length) return;
    list.forEach(el => el.classList.remove('kbd-active'));
    idx = Math.max(0, Math.min(newIdx, list.length - 1));
    list[idx].classList.add('kbd-active');
    list[idx].scrollIntoView({ block: 'nearest' });
  }

  container.tabIndex = -1;
  container.addEventListener('keydown', (ev) => {
    if (['j', 'ArrowDown'].includes(ev.key)) { ev.preventDefault(); setActive(idx + 1); }
    else if (['k', 'ArrowUp'].includes(ev.key)) { ev.preventDefault(); setActive(idx - 1); }
    else if (ev.key === 'Enter' && idx >= 0) { ev.preventDefault(); onActivate(items()[idx]); }
  });
}
