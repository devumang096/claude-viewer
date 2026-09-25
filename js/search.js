import { $, $$, escHtml } from './utils.js';
import { State } from './state.js';
import { Api } from './api.js';

let abortController = null;
let debounceTimer = null;

function markSnippet(r) {
  const before = escHtml(r.snippet.slice(0, r.matchStart));
  const match = escHtml(r.snippet.slice(r.matchStart, r.matchStart + r.matchLen));
  const after = escHtml(r.snippet.slice(r.matchStart + r.matchLen));
  return `${before}<mark>${match}</mark>${after}`;
}

function resultRow(kind, r, index) {
  const title = kind === 'sessions' ? r.sessionTitle
    : kind === 'memory' ? r.memoryName
      : kind === 'plans' ? r.name
        : kind === 'walkthroughs' ? r.name
          : 'CLAUDE.md';
  return `<div class="search-result" data-kind="${kind}" data-index="${index}">
    <div class="search-result-title">${escHtml(title)}</div>
    <div class="search-result-snippet">${markSnippet(r)}</div>
  </div>`;
}

function renderResults(results) {
  const area = $('#search-results');
  area.classList.remove('pending');
  const groups = [
    ['sessions', 'Sessions'],
    ['memory', 'Memory'],
    ['plans', 'Plans'],
    ['walkthroughs', 'Walkthroughs'],
    ['claudeMd', 'CLAUDE.md'],
  ];

  const flatIndex = []; // for keyboard nav: { kind, item }
  let html = '';
  for (const [kind, label] of groups) {
    const items = results[kind] || [];
    if (!items.length) continue;
    html += `<div class="search-group-label">${label}</div>`;
    items.forEach((r, i) => {
      html += resultRow(kind, r, flatIndex.length);
      flatIndex.push({ kind, item: r });
    });
  }

  if (!flatIndex.length) {
    html = `<div class="search-empty">${results.query ? 'No results' : 'Type to search sessions, memory, plans, walkthroughs, and CLAUDE.md'}</div>`;
  }

  area.innerHTML = html;
  $('#search-took').textContent = results.tookMs != null ? `${flatIndex.length} results · ${results.tookMs}ms` : '';
  State.search.results = flatIndex;
  State.search.activeIndex = 0;
  updateActiveRow();

  $$('.search-result', area).forEach(el => {
    el.addEventListener('click', () => activate(parseInt(el.dataset.index)));
    el.addEventListener('mouseenter', () => {
      State.search.activeIndex = parseInt(el.dataset.index);
      updateActiveRow();
    });
  });
}

function updateActiveRow() {
  $$('.search-result').forEach(el => {
    el.classList.toggle('active', parseInt(el.dataset.index) === State.search.activeIndex);
  });
  const active = $('.search-result.active');
  if (active) active.scrollIntoView({ block: 'nearest' });
}

function activate(index) {
  const entry = State.search.results?.[index];
  if (!entry) return;
  const { kind, item } = entry;
  closeSearch();

  if (kind === 'sessions') {
    State._jumpToRecordIndex = item.recordIndex;
    window.App.navigate('session', item.sessionId, item.dirName);
  } else if (kind === 'memory') {
    window.App.navigate('memory', item.filename);
  } else if (kind === 'plans') {
    window.App.navigate('plan', item.filename);
  } else if (kind === 'walkthroughs') {
    window.App.navigate('walkthrough', item.filename);
  } else if (kind === 'claudeMd') {
    window.App.navigate('claude-md');
  }
}

async function runSearch(q) {
  State.search.query = q;
  if (abortController) abortController.abort();
  if (q.trim().length < 2) {
    renderResults({ query: q, sessions: [], memory: [], plans: [], walkthroughs: [], claudeMd: [] });
    return;
  }
  abortController = new AbortController();
  $('#search-results').classList.add('pending');
  try {
    const results = await Api.search(q, { signal: abortController.signal });
    renderResults(results);
  } catch (err) {
    if (err.name !== 'AbortError') console.error('search failed', err);
  }
}

export function openSearch() {
  const overlay = $('#search-overlay');
  overlay.classList.add('visible');
  const input = $('#search-input');
  input.value = State.search.query || '';
  input.focus();
  input.select();
  if (input.value.trim().length >= 2) runSearch(input.value);
  else renderResults({ query: '', sessions: [], memory: [], plans: [], walkthroughs: [], claudeMd: [] });
}

export function closeSearch() {
  $('#search-overlay').classList.remove('visible');
}

export function isSearchOpen() {
  return $('#search-overlay').classList.contains('visible');
}

export function initSearch() {
  const input = $('#search-input');
  const overlay = $('#search-overlay');

  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => runSearch(input.value), 250);
  });

  input.addEventListener('keydown', (ev) => {
    const max = (State.search.results?.length || 1) - 1;
    if (ev.key === 'ArrowDown') { ev.preventDefault(); State.search.activeIndex = Math.min(State.search.activeIndex + 1, max); updateActiveRow(); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); State.search.activeIndex = Math.max(State.search.activeIndex - 1, 0); updateActiveRow(); }
    else if (ev.key === 'Enter') { ev.preventDefault(); activate(State.search.activeIndex); }
  });

  overlay.addEventListener('click', (ev) => {
    if (ev.target === overlay) closeSearch();
  });
}
