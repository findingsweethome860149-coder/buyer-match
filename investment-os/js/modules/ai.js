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

  return { analyze };
})();
