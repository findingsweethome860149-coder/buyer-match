/**
 * LINE Message Parser
 * Converts raw text into a structured intent object.
 * No business logic here — only parsing.
 *
 * Returns: { intent, ...params } | { intent: 'unknown' }
 */

const INTENTS = {
  // Watchlist
  ADD_WATCH:    /^新增\s+([^\s]+)$/,
  REMOVE_WATCH: /^刪除\s+([^\s]+)$/,
  LIST_WATCH:   /^(觀察|watchlist|watch)$/i,

  // Transactions
  BUY:      /^買\s+(\S+)\s+(\d+(?:\.\d+)?)股\s+(\d+(?:\.\d+)?)$/,
  SELL:     /^賣\s+(\S+)\s+(\d+(?:\.\d+)?)股\s+(\d+(?:\.\d+)?)$/,
  DEPOSIT:  /^入金\s+(\d+(?:\.\d+)?)$/,
  WITHDRAW: /^出金\s+(\d+(?:\.\d+)?)$/,

  // Confirmations
  CONFIRM: /^(確認|confirm|yes|y|ok)$/i,
  CANCEL:  /^(取消|cancel|no|n)$/i,

  // Dashboard queries
  TODAY:    /^(今天|今日|today)$/i,
  HOLDINGS: /^(持股|portfolio|持倉)$/i,
  REMIND:   /^(提醒|通知|remind)$/i,

  // Stock detail (4-digit TW code or Chinese name with 分析 prefix)
  ANALYZE:    /^分析\s+(\S+)$/,
  STOCK_CODE: /^(\d{4,6})$/,
};

function parse(text) {
  const t = text.trim();

  let m;

  if ((m = t.match(INTENTS.BUY)))
    return { intent: 'BUY', rawStock: m[1], quantity: parseFloat(m[2]), price: parseFloat(m[3]) };

  if ((m = t.match(INTENTS.SELL)))
    return { intent: 'SELL', rawStock: m[1], quantity: parseFloat(m[2]), price: parseFloat(m[3]) };

  if ((m = t.match(INTENTS.DEPOSIT)))
    return { intent: 'DEPOSIT', cashAmt: parseFloat(m[1]) };

  if ((m = t.match(INTENTS.WITHDRAW)))
    return { intent: 'WITHDRAW', cashAmt: parseFloat(m[1]) };

  if ((m = t.match(INTENTS.ADD_WATCH)))
    return { intent: 'ADD_WATCH', rawStock: m[1] };

  if ((m = t.match(INTENTS.REMOVE_WATCH)))
    return { intent: 'REMOVE_WATCH', rawStock: m[1] };

  if (INTENTS.LIST_WATCH.test(t))
    return { intent: 'LIST_WATCH' };

  if (INTENTS.CONFIRM.test(t))
    return { intent: 'CONFIRM' };

  if (INTENTS.CANCEL.test(t))
    return { intent: 'CANCEL' };

  if (INTENTS.TODAY.test(t))
    return { intent: 'TODAY' };

  if (INTENTS.HOLDINGS.test(t))
    return { intent: 'HOLDINGS' };

  if (INTENTS.REMIND.test(t))
    return { intent: 'REMIND' };

  if ((m = t.match(INTENTS.ANALYZE)))
    return { intent: 'ANALYZE', rawStock: m[1] };

  if ((m = t.match(INTENTS.STOCK_CODE)))
    return { intent: 'ANALYZE', rawStock: m[1] };

  return { intent: 'UNKNOWN', text: t };
}

module.exports = { parse };
