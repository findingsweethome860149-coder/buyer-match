/**
 * Server-side utils — mirrors browser Utils module.
 */

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function fmt(num, decimals = 0) {
  if (num === undefined || num === null || isNaN(num)) return '0';
  return Number(num).toLocaleString('zh-TW', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function pnlSign(n) { return n >= 0 ? '+' : ''; }
function pnlStr(n)  { return `${pnlSign(n)}$${fmt(Math.abs(n))}`; }

function calcFee(amount, feeRate = 0.1425, isSell = false) {
  const commission = Math.max(20, Math.round(amount * feeRate / 100));
  return isSell ? commission : commission;
}

module.exports = { uid, today, fmt, pnlSign, pnlStr, calcFee };
