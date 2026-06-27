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

  /**
   * XIRR — internal rate of return for irregular cash flows.
   * @param {Array<{amount: number, date: string}>} flows  positive=inflow, negative=outflow
   * @returns {number|null} annualised rate (e.g. 0.12 = 12%), or null if no solution
   */
  function xirr(flows) {
    if (!flows || flows.length < 2) return null;
    const t0  = new Date(flows[0].date).getTime();
    const days = flows.map(f => (new Date(f.date).getTime() - t0) / 86400000);
    const amts = flows.map(f => f.amount);

    function npv(rate) {
      return amts.reduce((s, a, i) => s + a / Math.pow(1 + rate, days[i] / 365), 0);
    }
    function dnpv(rate) {
      return amts.reduce((s, a, i) => s - (days[i] / 365) * a / Math.pow(1 + rate, days[i] / 365 + 1), 0);
    }

    let rate = 0.1;
    for (let i = 0; i < 100; i++) {
      const f = npv(rate);
      const d = dnpv(rate);
      if (Math.abs(d) < 1e-12) break;
      const next = rate - f / d;
      if (Math.abs(next - rate) < 1e-8) return next;
      rate = next;
      if (rate < -0.999) return null;
    }
    return null;
  }

  function csvRow(fields) {
    return fields.map(f => {
      const s = f === null || f === undefined ? '' : String(f);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(',');
  }

  return { fmt, uid, today, pnlCls, pnlSign, calcFee, xirr, csvRow };
})();
