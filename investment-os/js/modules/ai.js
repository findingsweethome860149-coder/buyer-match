/**
 * AI Module
 * Responsible for: generating analysis and suggestions.
 * Read-only — NEVER writes to any data store.
 * NEVER gives direct buy/sell commands.
 * Always provides reasoning. Always defers final decision to user.
 */
const AIModule = (() => {

  /**
   * Run daily analysis.
   * Returns { items: AnalysisItem[], actionCount: number }
   *
   * AnalysisItem: { icon, text, decision, priority }
   */
  function analyze({ holdings, watchlist, settings, transactions }) {
    const items = [];
    let actionCount = 0;

    // 1. Watchlist target price reached
    watchlist.forEach(w => {
      if (w.currentPrice && w.targetPrice && w.currentPrice <= w.targetPrice) {
        items.push({
          icon: '🎯',
          priority: 1,
          text: `<strong>${w.symbol} ${w.name}</strong> 現價 $${Utils.fmt(w.currentPrice, 2)} 達到你的目標買入價 $${Utils.fmt(w.targetPrice, 2)}。` +
                (w.note ? `<br><span style="font-size:12px;color:var(--muted)">當初理由：${w.note}</span>` : ''),
          decision: '是否依計畫買入，由你決定。',
        });
        actionCount++;
      }
    });

    // 2. Monthly DCA reminder
    const day = new Date().getDate();
    if (day >= settings.reminderDay && day <= settings.reminderDay + 4) {
      items.push({
        icon: '📅',
        priority: 2,
        text: `本月定期定額提醒日到了。你設定的每月預算是 <strong>$${Utils.fmt(settings.monthlyBudget)}</strong>，確認是否已完成本月投入。`,
        decision: '是否執行，由你決定。',
      });
      actionCount++;
    }

    // 3. Concentration risk (single holding > 60%)
    if (holdings.length > 0) {
      const totalVal = holdings.reduce((s, h) => s + h.shares * (h.currentPrice || h.avgCost), 0);
      holdings.forEach(h => {
        const val = h.shares * (h.currentPrice || h.avgCost);
        const pct = totalVal > 0 ? val / totalVal * 100 : 0;
        if (pct > 60) {
          items.push({
            icon: '⚖️',
            priority: 3,
            text: `<strong>${h.symbol} ${h.name}</strong> 佔投資組合 ${Utils.fmt(pct, 1)}%，集中度偏高，長期持有風險較大。`,
            decision: '是否考慮分散配置，由你決定。',
          });
        }
      });
    }

    // 4. Encouragement — positive reinforcement when all is calm
    if (actionCount === 0 && holdings.length > 0) {
      const winners = holdings.filter(h => h.currentPrice > h.avgCost);
      if (winners.length > 0) {
        const best = winners.reduce((a, b) => (b.currentPrice / b.avgCost > a.currentPrice / a.avgCost ? b : a));
        const pct  = (best.currentPrice / best.avgCost - 1) * 100;
        items.push({
          icon: '📈',
          priority: 9,
          text: `<strong>${best.symbol} ${best.name}</strong> 報酬率 <strong class="positive">+${Utils.fmt(pct, 2)}%</strong>，長期持有策略執行中。耐心是最有效的投資工具。`,
          decision: null,
        });
      }
    }

    return { items, actionCount };
  }

  /**
   * Score a watchlist stock from 0–100.
   * Higher = closer to or below target price (more attractive entry).
   * 100 = at or below target. 50 = no target set (neutral). 0 = far above target.
   */
  function scoreStock(watchItem) {
    const { currentPrice, targetPrice } = watchItem;
    if (!currentPrice || !targetPrice) return 50;
    if (currentPrice <= targetPrice) return 100;
    const ratio = currentPrice / targetPrice;
    if (ratio >= 1.3) return 0;
    // Linear from 100 (at target) to 0 (30% above target)
    return Math.max(0, Math.round(100 - (ratio - 1) / 0.3 * 100));
  }

  /**
   * Score label and colour class for display.
   */
  function scoreLabel(score) {
    if (score >= 80) return { label: '吸引', cls: 'score-high' };
    if (score >= 50) return { label: '觀察', cls: 'score-mid' };
    return { label: '偏高', cls: 'score-low' };
  }

  /**
   * Generate a brief stock analysis summary for the detail view.
   * Returns an array of analysis points.
   */
  function analyzeStock(watchItem, holdingItem) {
    const { symbol, name, currentPrice, targetPrice } = watchItem;
    const points = [];

    if (targetPrice && currentPrice) {
      const diff = ((currentPrice / targetPrice) - 1) * 100;
      if (currentPrice <= targetPrice) {
        points.push({ icon: '🟢', text: `現價 $${Utils.fmt(currentPrice, 2)} 已達目標買入價 $${Utils.fmt(targetPrice, 2)}，具有投資吸引力。` });
      } else {
        points.push({ icon: '🟡', text: `現價比目標買入價高 ${Utils.fmt(diff, 1)}%，尚未到達理想買入區間。` });
      }
    } else if (!targetPrice) {
      points.push({ icon: '⚪', text: '尚未設定目標買入價，建議先設定再追蹤。' });
    }

    if (holdingItem) {
      const pnl    = (currentPrice - holdingItem.avgCost) * holdingItem.shares;
      const pnlPct = (currentPrice / holdingItem.avgCost - 1) * 100;
      points.push({ icon: pnl >= 0 ? '📈' : '📉', text: `目前持有 ${Utils.fmt(holdingItem.shares)} 股，均價 $${Utils.fmt(holdingItem.avgCost, 2)}，未實現損益 ${Utils.pnlSign(pnl)}$${Utils.fmt(Math.abs(pnl))} (${Utils.pnlSign(pnlPct)}${Utils.fmt(pnlPct, 2)}%)。` });
    }

    points.push({ icon: '💬', text: 'AI 分析僅供參考，不構成投資建議。最終決策由你決定。' });
    return points;
  }

  return { analyze, scoreStock, scoreLabel, analyzeStock };
})();
