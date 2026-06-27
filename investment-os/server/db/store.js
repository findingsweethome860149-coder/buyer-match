/**
 * DB Store — server-side persistence.
 * Mirrors the browser DB module (same aios_ schema, same Repository Pattern).
 * Uses a JSON flat-file so the data format is identical to a future Cloud export.
 *
 * All writes are synchronous to keep the code simple and avoid race conditions
 * in a single-process Node server. Swap to async + proper DB when scaling.
 */
const fs   = require('fs');
const path = require('path');

const DB_FILE = process.env.DB_FILE || path.join(__dirname, '..', 'data', 'aios_db.json');

function _ensureDir() {
  const dir = path.dirname(DB_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function _read() {
  _ensureDir();
  if (!fs.existsSync(DB_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch { return {}; }
}

function _write(data) {
  _ensureDir();
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function _get(key, def) {
  const data = _read();
  return key in data ? data[key] : def;
}

function _set(key, val) {
  const data = _read();
  data[key] = val;
  _write(data);
}

// ── Repositories ─────────────────────────────────────────────────────────────

const Transactions = {
  getAll()          { return _get('transactions', []); },
  save(txs)         { _set('transactions', txs); },
  add(tx)           { const all = this.getAll(); all.push(tx); this.save(all); },
  remove(id)        { this.save(this.getAll().filter(t => t.id !== id)); },
  getByStockId(sid) { return this.getAll().filter(t => t.stockId === sid); },
};

const Watchlist = {
  getAll()   { return _get('watchlist', []); },
  save(lst)  { _set('watchlist', lst); },
  add(item)  { const all = this.getAll(); all.push(item); this.save(all); },
  remove(id) { this.save(this.getAll().filter(w => w.id !== id)); },
  findByStockId(sid) {
    const lc = sid.toLowerCase();
    return this.getAll().find(w =>
      w.stockId.toLowerCase() === lc || w.stockName.toLowerCase().includes(lc)
    ) || null;
  },
};

const Portfolio = {
  getAll()   { return _get('portfolio', []); },
  save(hdgs) { _set('portfolio', hdgs); },
};

const SETTINGS_DEF = {
  monthlyBudget: 10000, reminderDay: 5, defaultFeeRate: 0.1425,
  investmentGoal: '', goalAmount: 0,
  pinEnabled: false, darkMode: true, notification: true, language: 'zh-TW', version: '1.0',
};

const Settings = {
  get()   { return { ...SETTINGS_DEF, ..._get('settings', {}) }; },
  save(s) { _set('settings', s); },
};

const AICache = {
  get(stockId) { return (_get('ai_cache', {}))[stockId] || null; },
  set(stockId, data) {
    const c = _get('ai_cache', {});
    c[stockId] = { ...data, updatedAt: new Date().toISOString() };
    _set('ai_cache', c);
  },
};

const Auth = {
  getAuthorized() { return _get('authorized_users', []); },
  isAuthorized(lineUserId) { return this.getAuthorized().includes(lineUserId); },
  add(lineUserId) {
    const list = this.getAuthorized();
    if (!list.includes(lineUserId)) { list.push(lineUserId); _set('authorized_users', list); }
  },
};

// Pending confirmations (in-memory only; lost on restart — acceptable for V1)
const _pending = new Map();

const Pending = {
  set(lineUserId, data)    { _pending.set(lineUserId, data); },
  get(lineUserId)          { return _pending.get(lineUserId) || null; },
  clear(lineUserId)        { _pending.delete(lineUserId); },
};

function exportAll() {
  return {
    exportedAt:   new Date().toISOString(),
    version:      '1.0',
    transactions: Transactions.getAll(),
    watchlist:    Watchlist.getAll(),
    portfolio:    Portfolio.getAll(),
    settings:     Settings.get(),
  };
}

module.exports = { Transactions, Watchlist, Portfolio, Settings, AICache, Auth, Pending, exportAll };
