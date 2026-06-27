/**
 * LINE Intent Handler
 * Routes parsed intents to the appropriate service.
 * Returns a reply string. All business logic is in services, not here.
 *
 * Design rule: parse → call service → format reply. Nothing else.
 */
const DB          = require('../db/store');
const txSvc       = require('../services/transactionService');
const portSvc     = require('../services/portfolioService');
const aiSvc       = require('../services/aiService');
const utils       = require('../services/utils');
const { parse }   = require('./parser');

// ── Auth guard ────────────────────────────────────────────────────────────────

function isAllowed(lineUserId) {
  // If no authorized users configured yet, allow the first user (setup mode)
  const list = DB.Auth.getAuthorized();
  if (list.length === 0) {
    DB.Auth.add(lineUserId);
    return true;
  }
  return DB.Auth.isAuthorized(lineUserId);
}

// ── Stock resolver ────────────────────────────────────────────────────────────
// Resolves a raw "2330" or "台積電" string to a watchlist item or a minimal stub.

function resolveStock(rawStock) {
  return DB.Watchlist.findByStockId(rawStock) || null;
}

// ── Main handler ──────────────────────────────────────────────────────────────

async function handle(lineUserId, text) {
  if (!isAllowed(lineUserId)) {
    return '⛔ 未授權的使用者。請洽管理員。';
  }

  const intent = parse(text);

  switch (intent.intent) {

    // ── Watchlist ────────────────────────────────────────────────────────────

    case 'ADD_WATCH': {
      const existing = resolveStock(intent.rawStock);
      if (existing) return `📋 ${existing.stockId} ${existing.stockName} 已在觀察清單中。`;

      // Add with stockId = rawStock; stockName will be same until user edits in Dashboard
      const item = {
        id:          utils.uid(),
        stockId:     intent.rawStock.toUpperCase(),
        stockName:   intent.rawStock,
        currentPrice: 0,
        targetPrice:  0,
        memo:         '',
        createdAt:    new Date().toISOString(),
      };
      DB.Watchlist.add(item);
      return `✅ 已加入觀察清單：${item.stockId}\n\n💡 建議到 Dashboard 補充股票名稱和目標價。`;
    }

    case 'REMOVE_WATCH': {
      const w = resolveStock(intent.rawStock);
      if (!w) return `找不到「${intent.rawStock}」，請確認代號是否正確。`;
      DB.Watchlist.remove(w.id);
      return `✅ 已從觀察清單移除：${w.stockId} ${w.stockName}`;
    }

    case 'LIST_WATCH': {
      const list = DB.Watchlist.getAll();
      if (list.length === 0) return '觀察清單是空的。\n\n傳送「新增 2330」加入第一檔股票。';
      const lines = list.map(w => {
        const score = aiSvc.scoreStock(w);
        const label = aiSvc.scoreLabel(score);
        const price = w.currentPrice ? `$${utils.fmt(w.currentPrice, 2)}` : '—';
        const target = w.targetPrice ? `目標 $${utils.fmt(w.targetPrice, 2)}` : '未設目標';
        return `${w.stockId} ${w.stockName}\n現價 ${price}｜${target}｜${label}（${score}）`;
      });
      return `📋 觀察清單（${list.length} 檔）\n\n` + lines.join('\n\n');
    }

    // ── Transactions ─────────────────────────────────────────────────────────

    case 'BUY':
    case 'SELL': {
      const isBuy = intent.intent === 'BUY';
      const w     = resolveStock(intent.rawStock);
      const stockId   = w ? w.stockId   : intent.rawStock.toUpperCase();
      const stockName = w ? w.stockName : intent.rawStock;
      const { quantity, price } = intent;
      const settings  = DB.Settings.get();
      const fee = Math.max(20, Math.round(quantity * price * settings.defaultFeeRate / 100));
      const tax = isBuy ? 0 : Math.round(quantity * price * 0.003);
      const total = isBuy
        ? quantity * price + fee
        : quantity * price - fee - tax;

      const pendingData = {
        type: isBuy ? 'buy' : 'sell',
        stockId, stockName, quantity, price, fee, tax, total,
      };
      DB.Pending.set(lineUserId, pendingData);

      const lines = [
        `請確認：`,
        `股票：${stockId} ${stockName}`,
        `${isBuy ? '買入' : '賣出'}：${utils.fmt(quantity)} 股 × $${utils.fmt(price, 2)}`,
        `手續費：$${utils.fmt(fee)}`,
      ];
      if (!isBuy) lines.push(`證交稅：$${utils.fmt(tax)}`);
      lines.push(`${isBuy ? '總支出' : '總收入'}：$${utils.fmt(Math.abs(total))}`);
      lines.push('', '回覆「確認」建立交易，「取消」放棄。');
      return lines.join('\n');
    }

    case 'DEPOSIT':
    case 'WITHDRAW': {
      const isDeposit = intent.intent === 'DEPOSIT';
      DB.Pending.set(lineUserId, { type: isDeposit ? 'deposit' : 'withdraw', cashAmt: intent.cashAmt });
      return [
        `請確認：`,
        `${isDeposit ? '入金' : '出金'} $${utils.fmt(intent.cashAmt)}`,
        '',
        '回覆「確認」建立記錄，「取消」放棄。',
      ].join('\n');
    }

    // ── Confirm / Cancel ─────────────────────────────────────────────────────

    case 'CONFIRM': {
      const pending = DB.Pending.get(lineUserId);
      if (!pending) return '目前沒有待確認的操作。';
      DB.Pending.clear(lineUserId);

      const tx = txSvc.add({ ...pending, date: utils.today() });

      const isTrade = tx.type === 'buy' || tx.type === 'sell';
      if (isTrade) {
        const allTxs = txSvc.getAll();
        portSvc.recalculate(allTxs);
      }

      if (tx.type === 'buy')      return `✅ 買入記錄已建立：${tx.stockId} ${tx.stockName} ${utils.fmt(tx.quantity)} 股 @ $${utils.fmt(tx.price, 2)}\nDashboard 已同步更新。`;
      if (tx.type === 'sell')     return `✅ 賣出記錄已建立：${tx.stockId} ${tx.stockName} ${utils.fmt(tx.quantity)} 股 @ $${utils.fmt(tx.price, 2)}\nDashboard 已同步更新。`;
      if (tx.type === 'deposit')  return `✅ 入金 $${utils.fmt(tx.cashAmt)} 已記錄。Dashboard 已同步更新。`;
      if (tx.type === 'withdraw') return `✅ 出金 $${utils.fmt(tx.cashAmt)} 已記錄。Dashboard 已同步更新。`;
      return '✅ 已記錄。';
    }

    case 'CANCEL': {
      const had = DB.Pending.get(lineUserId);
      DB.Pending.clear(lineUserId);
      return had ? '已取消操作。資料未變更。' : '目前沒有待取消的操作。';
    }

    // ── Queries ───────────────────────────────────────────────────────────────

    case 'TODAY': {
      const txs      = txSvc.getAll();
      const holdings = portSvc.getHoldings();
      const watchlist = DB.Watchlist.getAll();
      const settings = DB.Settings.get();
      const cash     = portSvc.getCashBalance(txs);
      const mktVal   = portSvc.getMarketValue();
      const unrealized = portSvc.getUnrealizedPnL();

      const brief = aiSvc.getDailySummary({ holdings, watchlist, settings, transactions: txs });
      return [
        `📊 ${new Date().toLocaleDateString('zh-TW')} 投資摘要`,
        '',
        `總資產：$${utils.fmt(cash + mktVal)}`,
        `現金：$${utils.fmt(cash)}｜股票：$${utils.fmt(mktVal)}`,
        `未實現損益：${utils.pnlStr(unrealized)}`,
        '',
        '── AI 建議 ──',
        brief,
      ].join('\n');
    }

    case 'HOLDINGS': {
      const holdings = portSvc.getHoldings();
      if (holdings.length === 0) return '目前沒有持股。\n\n傳送「買 2330 1股 980」新增第一筆買入。';
      const lines = holdings.map(h => {
        const mktVal = h.quantity * (h.currentPrice || h.avgCost);
        const pnl    = h.quantity * ((h.currentPrice || h.avgCost) - h.avgCost);
        return `${h.stockId} ${h.stockName}\n${utils.fmt(h.quantity)} 股｜均價 $${utils.fmt(h.avgCost, 2)}｜市值 $${utils.fmt(mktVal)}\n損益 ${utils.pnlStr(pnl)}`;
      });
      return `📂 持股明細（${holdings.length} 檔）\n\n` + lines.join('\n\n');
    }

    case 'REMIND': {
      const txs      = txSvc.getAll();
      const holdings = portSvc.getHoldings();
      const watchlist = DB.Watchlist.getAll();
      const settings = DB.Settings.get();
      const brief    = aiSvc.getDailySummary({ holdings, watchlist, settings, transactions: txs });
      return `🔔 今日通知\n\n${brief}`;
    }

    case 'ANALYZE': {
      const w = resolveStock(intent.rawStock);
      if (!w) {
        return [
          `找不到「${intent.rawStock}」的資料。`,
          '',
          '請先新增到觀察清單：',
          `新增 ${intent.rawStock}`,
        ].join('\n');
      }
      const h = portSvc.getHoldings().find(x => x.stockId === w.stockId);
      return aiSvc.analyzeStockText(w, h);
    }

    // ── Unknown ───────────────────────────────────────────────────────────────

    default: {
      return [
        '不太理解你的指令，以下是支援的格式：',
        '',
        '── 觀察清單 ──',
        '新增 2330',
        '刪除 2330',
        '觀察',
        '',
        '── 交易 ──',
        '買 2330 3股 980',
        '賣 2330 2股 1100',
        '入金 5000',
        '出金 3000',
        '',
        '── 查詢 ──',
        '今天',
        '持股',
        '提醒',
        '分析 2330',
      ].join('\n');
    }
  }
}

module.exports = { handle };
