/**
 * DB Module — localStorage adapter
 * Single source of truth for persistence.
 * No business logic here.
 */
const DB = (() => {
  const PREFIX = 'ios_';

  function get(key, defaultVal) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw !== null ? JSON.parse(raw) : defaultVal;
    } catch {
      return defaultVal;
    }
  }

  function set(key, value) {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  }

  function remove(key) {
    localStorage.removeItem(PREFIX + key);
  }

  function clear() {
    const keys = Object.keys(localStorage).filter(k => k.startsWith(PREFIX));
    keys.forEach(k => localStorage.removeItem(k));
  }

  return { get, set, remove, clear };
})();
