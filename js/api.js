// Single source of truth for backend endpoint URLs.
export const Api = {
  projects: () => fetch('/api/projects').then(r => r.json()),
  session: (dirName, sessionId) =>
    fetch(`/api/session/${encodeURIComponent(dirName)}/${encodeURIComponent(sessionId)}`).then(r => r.json()),
  memory: () => fetch('/api/memory').then(r => r.json()),
  settings: () => fetch('/api/settings').then(r => r.json()),
  claudeMd: () => fetch('/api/claude-md').then(r => r.json()),
  history: (limit = 500) => fetch(`/api/history?limit=${limit}`).then(r => r.json()),
  liveSessions: () => fetch('/api/live-sessions').then(r => r.json()),
  plugins: () => fetch('/api/plugins').then(r => r.json()),
  skills: () => fetch('/api/skills').then(r => r.json()),
  agents: () => fetch('/api/agents').then(r => r.json()),
  plans: () => fetch('/api/plans').then(r => r.json()),
  walkthroughs: () => fetch('/api/walkthroughs').then(r => r.json()),
  stats: () => fetch('/api/stats').then(r => r.json()),
  costs: () => fetch('/api/costs').then(r => r.json()),
  search: (q, { signal } = {}) => fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal }).then(r => r.json()),
};
