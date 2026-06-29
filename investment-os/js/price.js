/**
 * Price Module — TWSE open API with Yahoo Finance fallback.
 * Read-only. Never writes to any data store.
 */
const PriceModule = (() => {
  const CACHE_TTL_MS   = 90 * 1000;
  const SERVER_URL_KEY = 'aios_line_server_url';
  const MARKET_OPEN_H  = 9,  MARKET_OPEN_M  = 0;
  const MARKET_CLOSE_H = 13, MARKET_CLOSE_M = 30;

  // TWSE Open API
  const TWSE_OPEN_URL = 'https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_AVG_ALL';
  let _twseOpenCache = null, _twseOpenAt = 0;
  const TWSE_OPEN_TTL = 3 * 60 * 1000;

  // Yahoo Finance chart API (fallback, per-stock)
  const YF_BASE = 'https://query2.finance.yahoo.com/v8/finance/chart/';

  const _cache = {};

  // ── Stock lookup ─────────────────────────────────────────────────────────────
  let _stockMap = null;
  let _nameMap  = null;

  async function loadStockList() {
    if (_stockMap) return;
    try {
      const r = await fetch(TWSE_OPEN_URL, { signal: AbortSignal.timeout(12000) });
      if (!r.ok) throw new Error('twse 403');
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
    if (_nameMap.has(q)) return _nameMap.get(q);
    for (const [n, code] of _nameMap) {
      if (n.includes(q) || q.includes(n)) return code;
    }
    return null;
  }

  // ── Public API ───────────────────────────────────────────────────────────────

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
      await _fetchViaServer(serverUrl, toFetch, result, now);
    } else {
      // Try TWSE first, fall back to Yahoo Finance per stock
      const fetched = await _fetchViaTWSE(toFetch, result, now);
      const missing = toFetch.filter(id => !result[id]);
      if (missing.length > 0) {
        await _fetchViaYahoo(missing, result, now);
      }
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
    // Try TWSE MIS
    try {
      const r = await fetch(
        'https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=tse_t00.tw&json=1&delay=0',
        { signal: AbortSignal.timeout(8000) }
      );
      if (r.ok) {
        const body = await r.json();
        const row  = (body?.msgArray || [])[0];
        if (row) {
          const price = parseFloat(row.z !== '-' ? row.z : row.y);
          const prev  = parseFloat(row.y) || price;
          return { price, change: +(price - prev).toFixed(2), changePct: +((price - prev) / prev * 100).toFixed(2) };
        }
      }
    } catch { /* fall through */ }
    // Yahoo Finance fallback for TAIEX (^TWII)
    try {
      const r = await fetch(`${YF_BASE}%5ETWII?interval=1d&range=2d`, { signal: AbortSignal.timeout(8000) });
      if (r.ok) {
        const body = await r.json();
        const meta = body?.chart?.result?.[0]?.meta;
        if (meta) {
          const price = meta.regularMarketPrice || meta.previousClose;
          const prev  = meta.chartPreviousClose || meta.previousClose || price;
          return { price, change: +(price - prev).toFixed(2), changePct: +((price - prev) / prev * 100).toFixed(2) };
        }
      }
    } catch { /* offline */ }
    return null;
  }

  function isMarketOpen() {
    const now  = new Date(Date.now() + 8 * 3600 * 1000);
    const day  = now.getUTCDay();
    if (day === 0 || day === 6) return false;
    const mins = now.getUTCHours() * 60 + now.getUTCMinutes();
    return mins >= MARKET_OPEN_H * 60 + MARKET_OPEN_M && mins <= MARKET_CLOSE_H * 60 + MARKET_CLOSE_M;
  }

  function isConfigured() { return !!_serverUrl(); }

  // ── Private ──────────────────────────────────────────────────────────────────

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
      if (!_twseOpenCache || now - _twseOpenAt > TWSE_OPEN_TTL) {
        const r = await fetch(TWSE_OPEN_URL, { signal: AbortSignal.timeout(12000) });
        if (!r.ok) return false;
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
      return true;
    } catch { return false; }
  }

  // Yahoo Finance fallback — one request per stock
  async function _fetchViaYahoo(ids, out, now) {
    await Promise.allSettled(ids.map(async id => {
      try {
        const symbol = id + '.TW';
        const r = await fetch(`${YF_BASE}${symbol}?interval=1d&range=2d`, { signal: AbortSignal.timeout(10000) });
        if (!r.ok) return;
        const body = await r.json();
        const meta = body?.chart?.result?.[0]?.meta;
        if (!meta) return;
        const price = meta.regularMarketPrice || meta.previousClose;
        if (!price || isNaN(price)) return;
        const prev  = meta.chartPreviousClose || meta.previousClose || price;
        const change    = +(price - prev).toFixed(2);
        const changePct = +(change / prev * 100).toFixed(2);
        _cache[id] = { price, name: id, change, changePct, volume: null, source: 'yahoo', fetchedAt: now };
        out[id]    = _cache[id];
      } catch { /* skip this stock */ }
    }));
  }

  function _serverUrl() {
    return (localStorage.getItem(SERVER_URL_KEY) || '').trim().replace(/\/$/, '') || null;
  }

  return { fetchPrices, fetchTaiex, isMarketOpen, isConfigured, loadStockList, lookupByCode, lookupByName };
})();
