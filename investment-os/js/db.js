/**
 * DB Module — Repository Pattern
 * Single source of truth for all persistence.
 * No business logic. No module may call localStorage directly.
 *
 * Future: swap _get/_set/_remove to IndexedDB / Cloud without touching any other module.
 */
const DB = (() => {
  const PREFIX = 'aios_';

  // ── Low-level storage (private) ───────────────────────────────────────────

  function _get(key, def) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw !== null ? JSON.parse(raw) : def;
    } catch { return def; }
  }

  function _set(key, val) {
    localStorage.setItem(PREFIX + key, JSON.stringify(val));
  }

  function _remove(key) {
    localStorage.removeItem(PREFIX + key);
  }

  function clear() {
    Object.keys(localStorage)
      .filter(k => k.startsWith(PREFIX))
      .forEach(k => localStorage.removeItem(k));
  }

  // ── Repository: Transactions ──────────────────────────────────────────────

  const Transactions = {
    getAll()          { return _get('transactions', []); },
    save(txs)         { _set('transactions', txs); },
    add(tx)           { const all = this.getAll(); all.push(tx); this.save(all); },
    remove(id)        { this.save(this.getAll().filter(t => t.id !== id)); },
    getByStockId(sid) { return this.getAll().filter(t => t.stockId === sid); },
    getByType(type)   { return this.getAll().filter(t => t.type === type); },
  };

  // ── Repository: Watchlist ─────────────────────────────────────────────────

  const Watchlist = {
    getAll()   { return _get('watchlist', []); },
    save(lst)  { _set('watchlist', lst); },
    add(item)  { const all = this.getAll(); all.push(item); this.save(all); },
    remove(id) { this.save(this.getAll().filter(w => w.id !== id)); },
  };

  // ── Repository: Portfolio (current-price cache only) ──────────────────────

  const Portfolio = {
    getAll()   { return _get('portfolio', []); },
    save(hdgs) { _set('portfolio', hdgs); },
  };

  // ── Repository: Settings ──────────────────────────────────────────────────

  const SETTINGS_DEF = {
    monthlyBudget:  10000,
    reminderDay:    5,
    defaultFeeRate: 0.1425,
    investmentGoal: '',
    goalAmount:     0,
    pinEnabled:     false,
    darkMode:       true,
    notification:   true,
    language:       'zh-TW',
    version:        '1.0',
  };

  const Settings = {
    get()   { return { ...SETTINGS_DEF, ..._get('settings', {}) }; },
    save(s) { _set('settings', s); },
  };

  // ── Repository: Goal ──────────────────────────────────────────────────────

  const Goal = {
    get()   { return _get('goal', { targetAmount: 0, currentAmount: 0, progress: 0, createdAt: null }); },
    save(g) { _set('goal', g); },
  };

  // ── Repository: AI Cache ──────────────────────────────────────────────────

  const AICache = {
    get(stockId) { return (_get('ai_cache', {}))[stockId] || null; },
    set(stockId, data) {
      const c = _get('ai_cache', {});
      c[stockId] = { ...data, updatedAt: new Date().toISOString() };
      _set('ai_cache', c);
    },
    getAll() { return _get('ai_cache', {}); },
    clear()  { _set('ai_cache', {}); },
  };

  // ── Repository: User ──────────────────────────────────────────────────────

  const User = {
    get()   { return _get('user', null); },
    save(u) { _set('user', u); },
  };

  // ── Backup ────────────────────────────────────────────────────────────────

  function exportAll() {
    return {
      exportedAt:   new Date().toISOString(),
      version:      '1.0',
      transactions: Transactions.getAll(),
      watchlist:    Watchlist.getAll(),
      portfolio:    Portfolio.getAll(),
      settings:     Settings.get(),
      goal:         Goal.get(),
      user:         User.get(),
    };
  }

  function importAll(data) {
    if (!data || data.version !== '1.0') throw new Error('格式不符或版本不相容');
    if (Array.isArray(data.transactions)) Transactions.save(data.transactions);
    if (Array.isArray(data.watchlist))    Watchlist.save(data.watchlist);
    if (Array.isArray(data.portfolio))    Portfolio.save(data.portfolio);
    if (data.settings)                    Settings.save(data.settings);
    if (data.goal)                        Goal.save(data.goal);
    if (data.user)                        User.save(data.user);
  }

  // ── Legacy low-level (used by security.js audit log + ready flag) ─────────

  function get(key, def) { return _get(key, def); }
  function set(key, val) { _set(key, val); }
  function remove(key)   { _remove(key); }

  return {
    get, set, remove, clear,
    Transactions, Watchlist, Portfolio,
    Settings, Goal, AICache, User,
    exportAll, importAll,
  };
})();
