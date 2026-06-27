/**
 * Utils — shared helpers, no business logic.
 */

// Taiwan stock market constants
const TAIWAN_SECURITIES_TAX = 0.003;   // 0.3% on sell
const MIN_COMMISSION_NTD    = 20;       // broker minimum commission

const Utils = (() => {
  function fmt(n, d = 0) {
    if (n === undefined || n === null || isNaN(n)) return '—';
    return n.toLocaleString('zh-TW', { minimumFractionDigits: d, maximumFractionDigits: d });
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  function pnlCls(v) { return v >= 0 ? 'positive' : 'negative'; }
  function pnlSign(v) { return v >= 0 ? '+' : ''; }

  function calcFee(amount, feeRatePct) {
    // Commission only — securities tax is tracked separately on the transaction record
    return Math.max(MIN_COMMISSION_NTD, Math.round(amount * feeRatePct / 100));
  }

  return { fmt, uid, today, pnlCls, pnlSign, calcFee };
})();
