// Hash-based routing: #/<view>/<sub>/<extra>
// A single hashchange listener is the only place that mutates State and triggers a render,
// avoiding the double-render trap of calling both render() and location.hash= from the same place.

export function buildHash(view, sub = null, extra = null) {
  const parts = ['', view];
  if (sub != null) parts.push(encodeURIComponent(sub));
  if (extra != null) parts.push(encodeURIComponent(extra));
  return '#' + parts.join('/');
}

export function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  if (!raw) return { view: 'dashboard', sub: null, extra: null };
  const [view, sub, extra] = raw.split('/').map(p => (p === undefined ? null : p));
  return {
    view: view || 'dashboard',
    sub: sub ? decodeURIComponent(sub) : null,
    extra: extra ? decodeURIComponent(extra) : null,
  };
}

// Wires hashchange -> onRoute(view, sub, extra). Also handles the initial boot state.
export function initRouter(onRoute) {
  window.addEventListener('hashchange', () => {
    const { view, sub, extra } = parseHash();
    onRoute(view, sub, extra);
  });

  if (!location.hash) {
    history.replaceState(null, '', buildHash('dashboard'));
  }
  const { view, sub, extra } = parseHash();
  onRoute(view, sub, extra);
}

// Called by App.navigate(). If the target hash equals the current one, hashchange won't
// fire (browsers no-op same-hash assignment), so we invoke onRoute directly in that case.
export function navigateTo(view, sub, extra, onRoute) {
  const newHash = buildHash(view, sub, extra);
  if (location.hash === newHash) {
    onRoute(view, sub, extra);
  } else {
    location.hash = newHash;
  }
}
