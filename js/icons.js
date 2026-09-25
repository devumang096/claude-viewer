// Shared 16px feather-style stroke icon set. All paths use currentColor so
// callers control color/size purely through CSS (font-size/color on the wrapper).
const PATHS = {
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  plans: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 4v16M8 9h12M8 15h12"/>',
  walkthrough: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H12v18H6.5A2.5 2.5 0 0 1 4 18.5z"/><path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H12v18h5.5a2.5 2.5 0 0 0 2.5-2.5z"/>',
  sessions: '<path d="M8 4v16M16 4v16M4 8h4M4 16h4M16 8h4M16 16h4"/>',
  usage: '<path d="M4 20V10M12 20V4M20 20v-7"/>',
  memory: '<path d="M9 4a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3M9 4a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3M15 4a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3M15 4a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3"/>',
  claudeMd: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  refresh: '<path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
  chevron: '<path d="M6 9l6 6 6-6"/>',
  pin: '<path d="M12 2l1.6 5.2L19 9l-4.6 3.2L15.5 18 12 14.8 8.5 18l1.1-5.8L5 9l5.4-1.8z"/>',
  pinOutline: '<path d="M12 2l1.6 5.2L19 9l-4.6 3.2L15.5 18 12 14.8 8.5 18l1.1-5.8L5 9l5.4-1.8z" fill="none"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  zap: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  puzzle: '<path d="M9 3h4a1 1 0 0 1 1 1v2.5a1.5 1.5 0 0 0 3 0V4a1 1 0 0 1 1-1h1a2 2 0 0 1 2 2v1a1 1 0 0 1-1 1h-2.5a1.5 1.5 0 0 0 0 3H20a1 1 0 0 1 1 1v4a2 2 0 0 1-2 2h-1a1 1 0 0 1-1-1v-2.5a1.5 1.5 0 0 0-3 0V15a1 1 0 0 1-1 1H9"/>',
  external: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6M10 14L21 3"/>',
};

export function icon(name, { size = 16, strokeWidth = 2 } = {}) {
  const inner = PATHS[name];
  if (!inner) return '';
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}
