/**
 * AI Service — server-side mirror of AIModule.
 * Read-only. Never writes to any data store except AICache.
 */
const DB    = require('../db/store');
const utils = require('./utils');

function scoreStock(watchItem) {
  const { currentPrice, targetPrice } = watchItem;
  if (!currentPrice || !targetPrice) return 50;
  if (currentPrice <= targetPrice) return 100;
  const ratio = currentPrice / targetPrice;
  if (ratio >= 1.3) return 0;
  return Math.max(0, Math.round(100 - (ratio - 1) / 0.3 * 100));
}

function scoreLabel(score) {
  if (score >= 80) return '吸引';
  if (score >= 50) return '觀察';
  return '偏高';
}

function getDailySummary({ holdings, watchlist, settings, transactions }) {
  const items = [];
  let actionCount = 0;

  watchlist.forEach(w => {
    if (w.currentPrice && w.targetPrice && w.currentPrice <= w.targetPrice) {
      items.push(`🎯 ${w.stockId} ${w.stockName} 現價 $${utils.fmt(w.currentPrice, 2)} 已達目標買入價 $${utils.fmt(w.targetPrice, 2)}`);
      actionCount++;
    }
  });

  const day = new Date().getDate();
  if (day >= settings.reminderDay && day <= settings.reminderDay + 4) {
    items.push(`📅 本月定期定額提醒日到了。每月預算 $${utils.fmt(settings.monthlyBudget)}`);
    actionCount++;
  }

  if (holdings.length > 0) {
    const totalVal = holdings.reduce((s, h) => s + h.quantity * (h.currentPrice || h.avgCost), 0);
    holdings.forEach(h => {
      const pct = totalVal > 0 ? h.quantity * (h.currentPrice || h.avgCost) / totalVal * 100 : 0;
      if (pct > 60) {
        items.push(`⚖️ ${h.stockId} 佔投資組合 ${utils.fmt(pct, 1)}%，集中度偏高`);
      }
    });
  }

  if (actionCount === 0) {
    return '😌 今天不用交易。持續執行你的投資計畫。';
  }
  return items.join('\n');
}

function analyzeStockText(watchItem, holdingItem) {
  const score = scoreStock(watchItem);
  const label = scoreLabel(score);
  const lines = [`📊 ${watchItem.stockId} ${watchItem.stockName}`, `AI 評分：${score}/100（${label}）`];

  if (watchItem.targetPrice && watchItem.currentPrice) {
    const diff = ((watchItem.currentPrice / watchItem.targetPrice) - 1) * 100;
    if (watchItem.currentPrice <= watchItem.targetPrice) {
      lines.push(`🟢 現價 $${utils.fmt(watchItem.currentPrice, 2)} 已達目標買入價 $${utils.fmt(watchItem.targetPrice, 2)}`);
    } else {
      lines.push(`🟡 現價比目標買入價高 ${utils.fmt(diff, 1)}%`);
    }
  } else if (!watchItem.targetPrice) {
    lines.push('⚪ 尚未設定目標買入價');
  }

  if (holdingItem) {
    const pnl    = (watchItem.currentPrice - holdingItem.avgCost) * holdingItem.quantity;
    const pnlPct = (watchItem.currentPrice / holdingItem.avgCost - 1) * 100;
    lines.push(`持有 ${utils.fmt(holdingItem.quantity)} 股，均價 $${utils.fmt(holdingItem.avgCost, 2)}，損益 ${utils.pnlStr(pnl)}（${utils.pnlSign(pnlPct)}${utils.fmt(pnlPct, 2)}%）`);
  }

  lines.push('💬 AI 分析僅供參考，最終決策由你決定。');
  return lines.join('\n');
}

module.exports = { scoreStock, scoreLabel, getDailySummary, analyzeStockText };
