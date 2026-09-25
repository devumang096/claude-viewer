const STORAGE_KEY = 'claude-viewer:pins-v1';

function load() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}
function save(pins) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(pins));
}

function keyOf(pin) {
  return `${pin.kind}:${pin.id}`;
}

export const Pins = {
  list() {
    return load();
  },
  has(kind, id) {
    return load().some(p => p.kind === kind && p.id === id);
  },
  toggle(pin) {
    const pins = load();
    const idx = pins.findIndex(p => keyOf(p) === keyOf(pin));
    if (idx >= 0) {
      pins.splice(idx, 1);
    } else {
      pins.unshift({ ...pin, pinnedAt: Date.now() });
    }
    save(pins);
    return idx < 0; // true if now pinned
  },
  remove(kind, id) {
    const pins = load().filter(p => !(p.kind === kind && p.id === id));
    save(pins);
  },
};
