/**
 * LINE Service — Business logic for LINE command processing.
 * No webhook details here. Pure: parse command → return op or error.
 */

// Taiwan securities tax rate
const TAIWAN_SECURITIES_TAX = 0.003;
const MIN_COMMISSION_NTD    = 20;
const DEFAULT_FEE_RATE      = 0.1425; // %

// ── Command parser ────────────────────────────────────────────────────────

/**
 * Parse a LINE text message into a structured command.
 * Returns { type, ...params } or { type: 'unknown', raw }
 */
function parseCommand(text) {
  const t = text.trim();

  // 新增 <stockId|stockName>
  const addMatch = t.match(/^新增\s+(\S+)$/);
  if (addMatch) return { type: 'add_watch', stockId: addMatch[1].toUpperCase(), stockName: addMatch[1].toUpperCase() };

  // 買 <stockId> <qty>股 <price>
  const buyMatch = t.match(/^買\s+(\S+)\s+(\d+(?:\.\d+)?)股?\s+(\d+(?:\.\d+)?)$/);
  if (buyMatch) return {
    type:      'buy',
    stockId:   buyMatch[1].toUpperCase(),
    stockName: buyMatch[1].toUpperCase(),
    quantity:  parseFloat(buyMatch[2]),
    price:     parseFloat(buyMatch[3]),
    date:      _today(),
  };

  // 賣 <stockId> <qty>股 <price>
  const sellMatch = t.match(/^賣\s+(\S+)\s+(\d+(?:\.\d+)?)股?\s+(\d+(?:\.\d+)?)$/);
  if (sellMatch) return {
    type:      'sell',
    stockId:   sellMatch[1].toUpperCase(),
    stockName: sellMatch[1].toUpperCase(),
    quantity:  parseFloat(sellMatch[2]),
    price:     parseFloat(sellMatch[3]),
    date:      _today(),
  };

  // 入金 <amount>
  const depositMatch = t.match(/^入金\s+(\d+(?:\.\d+)?)$/);
  if (depositMatch) return { type: 'deposit', cashAmt: parseFloat(depositMatch[1]), date: _today() };

  // 出金 <amount>
  const withdrawMatch = t.match(/^出金\s+(\d+(?:\.\d+)?)$/);
  if (withdrawMatch) return { type: 'withdraw', cashAmt: parseFloat(withdrawMatch[1]), date: _today() };

  // 今日
  if (t === '今日') return { type: 'query_today' };

  // 持股
  if (t === '持股') return { type: 'query_holdings' };

  // 觀察
  if (t === '觀察') return { type: 'query_watchlist' };

  // 確認 / 取消
  if (t === '確認') return { type: 'confirm' };
  if (t === '取消') return { type: 'cancel' };

  return { type: 'unknown', raw: t };
}

// ── Reply builders ────────────────────────────────────────────────────────

function buildConfirmText(op) {
  if (op.type === 'buy' || op.type === 'sell') {
    const label  = op.type === 'buy' ? '買進' : '賣出';
    const fee    = _calcFee(op.quantity * op.price, DEFAULT_FEE_RATE);
    const tax    = op.type === 'sell' ? Math.round(op.quantity * op.price * TAIWAN_SECURITIES_TAX) : 0;
    const total  = op.type === 'buy'
      ? op.quantity * op.price + fee
      : op.quantity * op.price - fee - tax;
    return [
      `請確認交易：`,
      `${label} ${op.stockId}`,
      `股數：${op.quantity} 股`,
      `價格：$${op.price}`,
      `手續費：$${fee}`,
      op.type === 'sell' ? `證交稅：$${tax}` : null,
      `${op.type === 'buy' ? '合計支出' : '合計收入'}：$${Math.abs(total).toFixed(0)}`,
      ``,
      `回覆「確認」送出，「取消」放棄。`,
    ].filter(Boolean).join('\n');
  }
  if (op.type === 'deposit') return `請確認入金 $${op.cashAmt}？\n回覆「確認」送出，「取消」放棄。`;
  if (op.type === 'withdraw') return `請確認出金 $${op.cashAmt}？\n回覆「確認」送出，「取消」放棄。`;
  return '請確認操作？回覆「確認」送出，「取消」放棄。';
}

function buildErrorText(raw) {
  return [
    `無法識別指令：「${raw}」`,
    ``,
    `支援指令範例：`,
    `買 2330 3股 980`,
    `賣 2330 2股 1050`,
    `入金 5000`,
    `出金 3000`,
    `新增 2330`,
    `今日 / 持股 / 觀察`,
  ].join('\n');
}

// ── Helpers ───────────────────────────────────────────────────────────────

function _calcFee(amount, ratePct) {
  return Math.max(MIN_COMMISSION_NTD, Math.round(amount * ratePct / 100));
}

function _today() {
  return new Date().toISOString().slice(0, 10);
}

module.exports = { parseCommand, buildConfirmText, buildErrorText };
