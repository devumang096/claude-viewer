export const State = {
  view: 'dashboard',
  sub: null,          // e.g. session id, memory filename
  extra: null,        // e.g. project dirName
  projects: [],
  plans: [],
  walkthroughs: [],
  history: null,
  liveRefreshTimer: null,
  pins: [],
  theme: 'system',     // 'system' | 'light' | 'dark'
  costs: null,
  search: { query: '', results: null, loading: false, activeIndex: 0 },
};
