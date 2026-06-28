/**
 * Price Module — TWSE direct browser fetch + server proxy fallback.
 * Read-only. Never writes to any data store.
 */
const PriceModule = (() => {
  const CACHE_TTL_MS   = 90 * 1000; // 90-second client-side cache
  const SERVER_URL_KEY = 'aios_line_server_url';
  const MARKET_OPEN_H  = 9,  MARKET_OPEN_M  = 0;
  const MARKET_CLOSE_H = 13, MARKET_CLOSE_M = 30;

  // TWSE Open API (bulk, no proxy needed, browser-friendly)
  const TWSE_OPEN_URL = 'https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_AVG_ALL';
  let _twseOpenCache = null, _twseOpenAt = 0;
  const TWSE_OPEN_TTL = 3 * 60 * 1000;

  const _cache = {};

  // ── Stock lookup (code ↔ name) ──────────────────────────────────────────────

  // Returns { code→name } and { name→code } maps, loaded once per session
  let _stockMap = null; // Map: code → name
  let _nameMap  = null; // Map: name → code (first match)

  async function loadStockList() {
    if (_stockMap) return;
    try {
      const r = await fetch(TWSE_OPEN_URL, { signal: AbortSignal.timeout(12000) });
      if (!r.ok) return;
      const list = await r.json();
      _stockMap = new Map();
      _nameMap  = new Map();
      list.forEach(row => {
        if (row.Code && row.Name) {
          _stockMap.set(row.Code, row.Name);
          if (!_nameMap.has(row.Name)) _nameMap.set(row.Name, row.Code);
        }
      });
    } catch { /* offline or CORS */ }
  }

  function lookupByCode(code) {
    return _stockMap ? (_stockMap.get(code.toUpperCase()) || null) : null;
  }

  function lookupByName(name) {
    if (!_nameMap) return null;
    const q = name.trim();
    // exact match first
    if (_nameMap.has(q)) return _nameMap.get(q);
    // partial match
    for (const [n, code] of _nameMap) {
      if (n.includes(q) || q.includes(n)) return code;
    }
    return null;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  async function fetchPrices(stockIds) {
    if (!stockIds || stockIds.length === 0) return {};

    const now    = Date.now();
    const result = {};
    const toFetch = stockIds.filter(id => {
      const c = _cache[id];
      if (c && now - c.fetchedAt < CACHE_TTL_MS) { result[id] = c; return false; }
      return true;
    });

    if (toFetch.length === 0) return result;

    const serverUrl = _serverUrl();
    if (serverUrl) {
      // Use server proxy (returns real-time MIS data with volume)
      await _fetchViaServer(serverUrl, toFetch, result, now);
    } else {
      // Direct browser call to TWSE Open API (no server needed)
      await _fetchViaTWSE(toFetch, result, now);
    }

    return result;
  }

  async function fetchTaiex() {
    const serverUrl = _serverUrl();
    if (serverUrl) {
      try {
        const r = await fetch(`${serverUrl}/api/taiex`, { signal: AbortSignal.timeout(5000) });
        if (r.ok) return await r.json();
      } catch { /* fall through */ }
    }
    // Direct TWSE MIS for TAIEX
    try {
      const r = await fetch(
        'https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=tse_t00.tw&json=1&delay=0',
        { signal: AbortSignal.timeout(8000) }
      );
      if (!r.ok) return null;
      const body = await r.json();
      const row  = (body?.msgArray || [])[0];
      if (!row) return null;
      const price = parseFloat(row.z !== '-' ? row.z : row.y);
      const prev  = parseFloat(row.y) || price;
      return { price, change: +(price - prev).toFixed(2), changePct: +((price - prev) / prev * 100).toFixed(2) };
    } catch { return null; }
  }

  function isMarketOpen() {
    const now  = new Date(Date.now() + 8 * 3600 * 1000);
    const day  = now.getUTCDay();
    if (day === 0 || day === 6) return false;
    const mins = now.getUTCHours() * 60 + now.getUTCMinutes();
    return mins >= MARKET_OPEN_H * 60 + MARKET_OPEN_M && mins <= MARKET_CLOSE_H * 60 + MARKET_CLOSE_M;
  }

  function isConfigured() { return !!_serverUrl(); }

  // ── Private ─────────────────────────────────────────────────────────────────

  async function _fetchViaServer(serverUrl, ids, out, now) {
    try {
      const resp = await fetch(`${serverUrl}/api/price?stocks=${ids.join(',')}`, { signal: AbortSignal.timeout(10000) });
      if (!resp.ok) return;
      const { prices } = await resp.json();
      Object.entries(prices || {}).forEach(([id, data]) => {
        _cache[id] = { ...data, fetchedAt: now };
        out[id]    = _cache[id];
      });
    } catch { /* server unreachable */ }
  }

  async function _fetchViaTWSE(ids, out, now) {
    try {
      // Bulk download all TSE stocks (CORS-enabled open data)
      if (!_twseOpenCache || now - _twseOpenAt > TWSE_OPEN_TTL) {
        const r = await fetch(TWSE_OPEN_URL, { signal: AbortSignal.timeout(12000) });
        if (!r.ok) return;
        const list = await r.json();
        _twseOpenCache = new Map();
        list.forEach(row => {
          const price = parseFloat(row.ClosingPrice);
          if (row.Code && !isNaN(price)) {
            _twseOpenCache.set(row.Code, { price, name: row.Name || row.Code });
          }
        });
        _twseOpenAt = now;
      }
      ids.forEach(id => {
        const d = _twseOpenCache.get(id);
        if (d) {
          _cache[id] = { ...d, change: null, changePct: null, volume: null, source: 'twse-open', fetchedAt: now };
          out[id]    = _cache[id];
        }
      });
    } catch { /* CORS blocked or API down */ }
  }

  function _serverUrl() {
    return (localStorage.getItem(SERVER_URL_KEY) || '').trim().replace(/\/$/, '') || null;
  }

  return { fetchPrices, fetchTaiex, isMarketOpen, isConfigured, loadStockList, lookupByCode, lookupByName };
})();
