/**
 * Utils — shared helpers, no business logic.
 */
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

  function calcFee(amount, feeRatePct, isSell = false) {
    // Commission only — tax (0.3%) is tracked separately on the transaction record
    return Math.max(20, Math.round(amount * feeRatePct / 100));
  }

  return { fmt, uid, today, pnlCls, pnlSign, calcFee };
})();
