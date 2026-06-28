/**
 * LicenseModule — permanent license key + demo mode.
 * Key format: XXXX-XXXX-XXXX-CCCC  (16 hex chars; last 4 = FNV checksum)
 * Validation is client-side; key generation is done by the developer only.
 */
const LicenseModule = (() => {
  const STORE_KEY  = 'aios_license_key';
  const SECRET     = 'AIOS_V1_SM_2025';   // embedded signing secret
  const KEY_RE     = /^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/i;

  // ── FNV-1a hash (returns 8-char hex string) ─────────────────────────────
  function _fnv(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h  = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0').toUpperCase();
  }

  // ── Key validation ───────────────────────────────────────────────────────
  function validate(raw) {
    if (!raw || typeof raw !== 'string') return false;
    const key = raw.trim().toUpperCase();
    if (!KEY_RE.test(key)) return false;
    const parts   = key.split('-');
    const payload = parts.slice(0, 3).join('');   // first 12 chars
    const check   = parts[3];                     // last 4 chars
    const expected = _fnv(payload + SECRET).slice(0, 4);
    return expected === check;
  }

  // ── Activation ───────────────────────────────────────────────────────────
  function activate(raw) {
    if (!validate(raw)) return false;
    localStorage.setItem(STORE_KEY, raw.trim().toUpperCase());
    return true;
  }

  function deactivate() {
    localStorage.removeItem(STORE_KEY);
  }

  function isActivated() {
    const stored = localStorage.getItem(STORE_KEY) || '';
    return validate(stored);
  }

  function storedKey() {
    return localStorage.getItem(STORE_KEY) || '';
  }

  // ── Demo data ────────────────────────────────────────────────────────────
  const DEMO_TRANSACTIONS = [
    { id: 'demo-0', type: 'deposit', date: '2025-01-01', cashAmt: 2000000, total: 2000000, memo: '初始資金' },
    { id: 'demo-1', type: 'buy',  date: '2025-01-15', stockId: '2330', stockName: '台積電',  quantity: 1000, price: 850,  fee: 1020, tax: 0,    total: -851020, thesis: 'AI 需求持續強勁，長期持有', memo: '' },
    { id: 'demo-2', type: 'buy',  date: '2025-03-10', stockId: '2454', stockName: '聯發科',  quantity: 500,  price: 1200, fee: 906,  tax: 0,    total: -600906, thesis: '5G 晶片出貨成長', memo: '' },
    { id: 'demo-3', type: 'sell', date: '2025-05-20', stockId: '2330', stockName: '台積電',  quantity: 200,  price: 960,  fee: 289,  tax: 576,  total: 191135,  thesis: '獲利了結部分持股', memo: '' },
    { id: 'demo-4', type: 'buy',  date: '2025-06-01', stockId: '2317', stockName: '鴻海',    quantity: 2000, price: 210,  fee: 634,  tax: 0,    total: -420634, thesis: 'AI 伺服器組裝訂單成長', memo: '' },
  ];

  const DEMO_WATCHLIST = [
    { id: 'watch-demo-1', stockId: '2330', stockName: '台積電',  alertHigh: 1000, alertLow: 800,  addedAt: '2025-01-15' },
    { id: 'watch-demo-2', stockId: '2454', stockName: '聯發科',  alertHigh: 1400, alertLow: 1050, addedAt: '2025-03-10' },
    { id: 'watch-demo-3', stockId: '2317', stockName: '鴻海',    alertHigh: 250,  alertLow: 185,  addedAt: '2025-06-01' },
    { id: 'watch-demo-4', stockId: '0050', stockName: '元大台灣50', alertHigh: 200, alertLow: 165, addedAt: '2025-06-01' },
  ];

  return { validate, activate, deactivate, isActivated, storedKey, DEMO_TRANSACTIONS, DEMO_WATCHLIST };
})();
