/**
 * Price Module — Yahoo Finance stock price fetching via server proxy.
 * Read-only. Never writes to any data store.
 * All writes (updateCurrentPrice, updatePrice) happen in app.js.
 */
const PriceModule = (() => {
  const CACHE_TTL_MS        = 5 * 60 * 1000; // 5-minute client-side cache
  const SERVER_URL_KEY      = 'aios_line_server_url';
  const MARKET_OPEN_H       = 9;
  const MARKET_OPEN_M       = 0;
  const MARKET_CLOSE_H      = 13;
  const MARKET_CLOSE_M      = 30;

  const _cache = {}; // { stockId: { price, change, changePct, name, fetchedAt } }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Fetch prices for an array of Taiwan stock IDs.
   * Returns { stockId: { price, change, changePct, name } } for found stocks.
   * Requires the LINE/price server to be configured in localStorage.
   */
  async function fetchPrices(stockIds) {
    if (!stockIds || stockIds.length === 0) return {};

    const serverUrl = _serverUrl();
    if (!serverUrl) return null; // null = server not configured

    const now     = Date.now();
    const result  = {};
    const toFetch = [];

    stockIds.forEach(id => {
      const c = _cache[id];
      if (c && now - c.fetchedAt < CACHE_TTL_MS) {
        result[id] = c;
      } else {
        toFetch.push(id);
      }
    });

    if (toFetch.length === 0) return result;

    try {
      const resp = await fetch(
        `${serverUrl}/api/price?stocks=${toFetch.join(',')}`,
        { signal: AbortSignal.timeout(10000) }
      );
      if (!resp.ok) return result;

      const { prices } = await resp.json();
      Object.entries(prices || {}).forEach(([id, data]) => {
        _cache[id] = { ...data, fetchedAt: now };
        result[id] = _cache[id];
      });
    } catch {
      // Server unreachable — return what we have from cache
    }

    return result;
  }

  /** Returns true if Taiwan market is currently open (weekdays 09:00–13:30 CST) */
  function isMarketOpen() {
    // Use Asia/Taipei offset (UTC+8)
    const now   = new Date(Date.now() + 8 * 3600 * 1000);
    const day   = now.getUTCDay(); // 0=Sun, 6=Sat
    if (day === 0 || day === 6) return false;
    const h = now.getUTCHours();
    const m = now.getUTCMinutes();
    const mins = h * 60 + m;
    const open  = MARKET_OPEN_H  * 60 + MARKET_OPEN_M;
    const close = MARKET_CLOSE_H * 60 + MARKET_CLOSE_M;
    return mins >= open && mins <= close;
  }

  /** Returns true if server URL is configured */
  function isConfigured() {
    return !!_serverUrl();
  }

  // ── Private ───────────────────────────────────────────────────────────────

  function _serverUrl() {
    return (localStorage.getItem(SERVER_URL_KEY) || '').trim().replace(/\/$/, '') || null;
  }

  return { fetchPrices, isMarketOpen, isConfigured };
})();
