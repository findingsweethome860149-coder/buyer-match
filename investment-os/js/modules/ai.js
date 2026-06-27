/**
 * AI Module — Analysis Engine
 * Responsible for: providing analysis, reasons, and reminders.
 * Read-only — NEVER writes to any data store except AICache.
 * NEVER gives direct buy/sell commands.
 * NEVER predicts stock prices or guarantees returns.
 * All output must include reasoning — never just a conclusion.
 */
const AIModule = (() => {

  // ── Score ─────────────────────────────────────────────────────────────────
  // 0–100 proximity-to-target-price score.

  function scoreStock(watchItem) {
    const { currentPrice, targetPrice } = watchItem;
    if (!currentPrice || !targetPrice) return 50;
    if (currentPrice <= targetPrice) return 100;
    const ratio = currentPrice / targetPrice;
    if (ratio >= 1.3) return 0;
    return Math.max(0, Math.round(100 - (ratio - 1) / 0.3 * 100));
  }

  /**
   * Returns { label, cls, stars, tier }
   * tier: 'high' | 'mid-high' | 'mid' | 'mid-low' | 'low'
   */
  function scoreLabel(score) {
    if (score >= 90) return { label: '吸引',  cls: 'score-high',     stars: '★★★★★', tier: 'high' };
    if (score >= 70) return { label: '值得觀察', cls: 'score-high',   stars: '★★★★☆', tier: 'mid-high' };
    if (score >= 50) return { label: '中性',   cls: 'score-mid',     stars: '★★★☆☆', tier: 'mid' };
    if (score >= 30) return { label: '偏高',   cls: 'score-mid',     stars: '★★☆☆☆', tier: 'mid-low' };
    return              { label: '高風險',  cls: 'score-low',     stars: '★☆☆☆☆', tier: 'low' };
  }

  // ── Portfolio Health ──────────────────────────────────────────────────────
  // 0–100. Based on: concentration, cash ratio, trading frequency, long-term holding.
  // Does NOT evaluate by return rate.

  function portfolioHealth(holdings, transactions, totalAssets) {
    if (holdings.length === 0) return { score: 0, reasons: ['尚無持股資料'] };
    const reasons = [];
    let score = 100;

    // 1. Concentration: single holding > 60% → deduct
    const totalVal = holdings.reduce((s, h) => s + h.quantity * (h.currentPrice || h.avgCost), 0);
    let maxPct = 0;
    holdings.forEach(h => {
      const pct = totalVal > 0 ? h.quantity * (h.currentPrice || h.avgCost) / totalVal * 100 : 0;
      if (pct > maxPct) maxPct = pct;
    });
    if (maxPct > 80) { score -= 30; reasons.push(`最大持股集中度 ${Utils.fmt(maxPct, 1)}%，集中度過高（建議 < 60%）`); }
    else if (maxPct > 60) { score -= 15; reasons.push(`最大持股集中度 ${Utils.fmt(maxPct, 1)}%，略為集中（建議 < 60%）`); }
    else reasons.push(`持股分散度良好，最大單一部位 ${Utils.fmt(maxPct, 1)}%`);

    // 2. Cash ratio: < 10% of total is a yellow flag
    const cashBal = totalAssets - totalVal;
    const cashPct = totalAssets > 0 ? cashBal / totalAssets * 100 : 0;
    if (cashPct < 0) { score -= 20; reasons.push('現金餘額為負，請確認入金記錄'); }
    else if (cashPct < 10) { score -= 10; reasons.push(`現金比例 ${Utils.fmt(cashPct, 1)}%，備用金偏低`); }
    else reasons.push(`現金比例 ${Utils.fmt(cashPct, 1)}%，流動性充足`);

    // 3. Trading frequency: > 8 trades/month is a flag
    const trades = transactions.filter(t => t.type === 'buy' || t.type === 'sell');
    const months = _monthsSinceFirst(trades);
    const freq   = months > 0 ? trades.length / months : trades.length;
    if (freq > 8) { score -= 20; reasons.push(`平均每月交易 ${Utils.fmt(freq, 1)} 次，頻率偏高`); }
    else if (freq > 4) { score -= 5; reasons.push(`平均每月交易 ${Utils.fmt(freq, 1)} 次，交易頻率適中`); }
    else reasons.push(`平均每月交易 ${Utils.fmt(freq, 1)} 次，長期持有傾向良好`);

    // 4. Long-term holding: avg holding duration
    const avgDays = _avgHoldingDays(transactions);
    if (avgDays !== null) {
      if (avgDays < 30)       { score -= 15; reasons.push(`平均持有 ${Math.round(avgDays)} 天，短線操作傾向明顯`); }
      else if (avgDays < 180) {               reasons.push(`平均持有 ${Math.round(avgDays)} 天，持有時間尚可`); }
      else                    {               reasons.push(`平均持有 ${Math.round(avgDays)} 天，長期持有策略執行中`); }
    }

    return { score: Math.max(0, Math.min(100, score)), reasons };
  }

  // ── Behavioral Analysis ───────────────────────────────────────────────────

  function behaviorAnalysis(transactions, holdings) {
    const insights = [];
    const trades = transactions.filter(t => t.type === 'buy' || t.type === 'sell');
    if (trades.length === 0) return insights;

    // Chasing highs: buying when price > avgCost * 1.2 on same stock without prior holding
    const buyHighCount = trades.filter(t => {
      if (t.type !== 'buy') return false;
      const h = holdings.find(x => x.stockId === t.stockId);
      return h && t.price > h.avgCost * 1.2;
    }).length;
    if (buyHighCount > 0) {
      insights.push({ icon: '⚠️', text: `有 ${buyHighCount} 次在均價 20% 以上加碼的紀錄，留意追高風險。` });
    }

    // Trading frequency per month
    const months = _monthsSinceFirst(trades);
    const freq   = months > 0 ? trades.length / months : trades.length;
    if (freq > 8) {
      insights.push({ icon: '🔄', text: `每月平均 ${Utils.fmt(freq, 1)} 次交易，頻繁交易會增加手續費成本，建議降低。` });
    } else if (freq <= 2 && trades.length > 0) {
      insights.push({ icon: '🏆', text: `每月平均 ${Utils.fmt(freq, 1)} 次交易，低頻率是紀律投資的好徵兆。` });
    }

    // Single stock concentration
    const stockCount = [...new Set(trades.map(t => t.stockId))].length;
    if (stockCount === 1) {
      insights.push({ icon: '⚖️', text: '目前所有交易都集中在同一檔股票，建議逐步考慮分散。' });
    }

    // Thesis fill rate
    const withThesis = trades.filter(t => t.thesis && t.thesis.length > 5).length;
    const thesisRate = trades.length > 0 ? withThesis / trades.length * 100 : 0;
    if (thesisRate < 50 && trades.length >= 3) {
      insights.push({ icon: '📝', text: `${Math.round(thesisRate)}% 的交易有填寫理由，建議每次交易都記錄原因，有助日後檢視決策品質。` });
    } else if (thesisRate >= 80 && trades.length >= 3) {
      insights.push({ icon: '📝', text: `${Math.round(thesisRate)}% 的交易都有記錄理由，投資紀律很好。` });
    }

    return insights;
  }

  // ── Thesis Review ─────────────────────────────────────────────────────────
  // Check if original buy thesis is still worth re-examining.

  function thesisReview(transactions, holdings) {
    const alerts = [];
    const buys = transactions.filter(t => t.type === 'buy' && t.thesis);
    buys.forEach(tx => {
      const h = holdings.find(x => x.stockId === tx.stockId);
      if (!h) return; // already sold
      const daysSince = _daysSince(tx.date);
      // Flag if bought with thesis and held for > 180 days
      if (daysSince > 180) {
        alerts.push({
          stockId:   tx.stockId,
          stockName: tx.stockName,
          thesis:    tx.thesis,
          daysSince: Math.round(daysSince),
        });
      }
    });
    // Deduplicate by stockId (keep oldest buy with thesis)
    const seen = new Set();
    return alerts.filter(a => { if (seen.has(a.stockId)) return false; seen.add(a.stockId); return true; });
  }

  // ── Daily Summary ─────────────────────────────────────────────────────────
  // Returns { state: 'calm'|'notice'|'action', icon, title, items, actionCount }

  function analyze({ holdings, watchlist, settings, transactions }) {
    const items = [];
    let actionCount = 0;

    // Priority 1: Target price reached
    watchlist.forEach(w => {
      if (w.currentPrice && w.targetPrice && w.currentPrice <= w.targetPrice) {
        items.push({
          icon: '🎯', priority: 1,
          text: `<strong>${w.stockId} ${w.stockName}</strong> 現價 $${Utils.fmt(w.currentPrice, 2)} 達到你的目標買入價 $${Utils.fmt(w.targetPrice, 2)}。` +
                (w.memo ? `<br><span style="font-size:12px;color:var(--muted)">當初理由：${w.memo}</span>` : ''),
          decision: '是否依計畫買入，由你決定。',
        });
        actionCount++;
      }
    });

    // Priority 2: Monthly DCA reminder
    const day = new Date().getDate();
    if (day >= settings.reminderDay && day <= settings.reminderDay + 4) {
      items.push({
        icon: '📅', priority: 2,
        text: `本月定期定額提醒日到了。你設定的每月預算是 <strong>$${Utils.fmt(settings.monthlyBudget)}</strong>，確認是否已完成本月投入。`,
        decision: '是否執行，由你決定。',
      });
      actionCount++;
    }

    // Priority 3: Concentration risk
    if (holdings.length > 0) {
      const totalVal = holdings.reduce((s, h) => s + h.quantity * (h.currentPrice || h.avgCost), 0);
      holdings.forEach(h => {
        const pct = totalVal > 0 ? h.quantity * (h.currentPrice || h.avgCost) / totalVal * 100 : 0;
        if (pct > 60) {
          items.push({
            icon: '⚖️', priority: 3,
            text: `<strong>${h.stockId} ${h.stockName}</strong> 佔投資組合 ${Utils.fmt(pct, 1)}%，集中度偏高，長期持有風險較大。`,
            decision: '是否考慮分散配置，由你決定。',
          });
        }
      });
    }

    // Priority 4: Thesis review (held > 180 days)
    const thesisAlerts = thesisReview(transactions, holdings);
    thesisAlerts.forEach(a => {
      items.push({
        icon: '🔍', priority: 4,
        text: `<strong>${a.stockId} ${a.stockName}</strong> 持有已 ${a.daysSince} 天，當初買進理由「${a.thesis}」是否仍成立？`,
        decision: '建議重新評估，最終決策由你決定。',
      });
    });

    // Priority 9: Encouragement when calm
    if (actionCount === 0 && holdings.length > 0) {
      const winners = holdings.filter(h => h.currentPrice > h.avgCost);
      if (winners.length > 0) {
        const best  = winners.reduce((a, b) => (b.currentPrice / b.avgCost > a.currentPrice / a.avgCost ? b : a));
        const pct   = (best.currentPrice / best.avgCost - 1) * 100;
        items.push({
          icon: '📈', priority: 9,
          text: `<strong>${best.stockId} ${best.stockName}</strong> 報酬率 <strong class="positive">+${Utils.fmt(pct, 2)}%</strong>，長期持有策略執行中。耐心是最有效的投資工具。`,
          decision: null,
        });
      }
    }

    // Determine state
    let state, icon, title;
    if (actionCount === 0 && items.every(i => i.priority >= 4)) {
      state = 'calm';  icon = '😌'; title = '今天不用交易。';
    } else if (actionCount <= 1) {
      state = 'notice'; icon = '👀'; title = '有一件事值得確認。';
    } else {
      state = 'action'; icon = '📋'; title = `有 ${actionCount} 件事需要確認。`;
    }

    return { state, icon, title, items, actionCount };
  }

  // ── Stock Analysis ────────────────────────────────────────────────────────
  // Returns analysis points array (max 5 meaningful points + disclaimer).

  function analyzeStock(watchItem, holdingItem) {
    const { stockId, stockName, currentPrice, targetPrice } = watchItem;
    const points = [];

    // 1. Price vs target
    if (targetPrice && currentPrice) {
      const diff = ((currentPrice / targetPrice) - 1) * 100;
      if (currentPrice <= targetPrice) {
        points.push({ icon: '🟢', text: `現價 $${Utils.fmt(currentPrice, 2)} 已達目標買入價 $${Utils.fmt(targetPrice, 2)}，符合當初設定的買入條件。` });
      } else {
        points.push({ icon: '🟡', text: `現價比目標買入價高 ${Utils.fmt(diff, 1)}%，尚未到達理想買入區間。` });
      }
    } else {
      points.push({ icon: '⚪', text: '尚未設定目標買入價，建議先設定再追蹤，才能讓 AI 提供有意義的評分。' });
    }

    // 2. Holding P&L if applicable
    if (holdingItem && currentPrice) {
      const pnl    = (currentPrice - holdingItem.avgCost) * holdingItem.quantity;
      const pnlPct = (currentPrice / holdingItem.avgCost - 1) * 100;
      points.push({
        icon: pnl >= 0 ? '📈' : '📉',
        text: `目前持有 ${Utils.fmt(holdingItem.quantity)} 股，均價 $${Utils.fmt(holdingItem.avgCost, 2)}，未實現損益 ${Utils.pnlSign(pnl)}$${Utils.fmt(Math.abs(pnl))} (${Utils.pnlSign(pnlPct)}${Utils.fmt(pnlPct, 2)}%)。`,
      });
    }

    // 3. Thesis status (if we have holding with thesis from transactions)
    if (holdingItem) {
      const holdingDays = holdingItem.priceUpdatedAt ? _daysSince(holdingItem.priceUpdatedAt) : null;
      if (holdingDays !== null && holdingDays > 180) {
        points.push({ icon: '🔍', text: `持有超過 ${Math.round(holdingDays)} 天，建議定期重新確認買進理由是否仍成立。` });
      }
    }

    // 4. Memo/thesis if set on watchlist
    if (watchItem.memo) {
      points.push({ icon: '💡', text: `觀察備註：${watchItem.memo}` });
    }

    // Disclaimer always last
    points.push({ icon: '💬', text: 'AI 分析僅供參考，不構成投資建議。最終決策由你決定。' });

    // Cache
    if (stockId) {
      const score   = scoreStock(watchItem);
      const summary = points.slice(0, -1).map(p => p.text).join(' ');
      DB.AICache.set(stockId, { stockId, score, summary });
    }

    return points.slice(0, 6); // max 5 meaningful + disclaimer
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  function _daysSince(dateStr) {
    if (!dateStr) return null;
    return (Date.now() - new Date(dateStr).getTime()) / 86400000;
  }

  function _monthsSinceFirst(trades) {
    if (trades.length === 0) return 0;
    const sorted = [...trades].sort((a, b) => a.date.localeCompare(b.date));
    const ms = Date.now() - new Date(sorted[0].date).getTime();
    return Math.max(1, ms / (30 * 86400000));
  }

  function _avgHoldingDays(transactions) {
    // Match buys to sells on same stockId (FIFO), compute holding days
    const durations = [];
    const buyQueue  = {}; // stockId → [ { date, quantity } ]

    [...transactions]
      .filter(t => t.type === 'buy' || t.type === 'sell')
      .sort((a, b) => a.date.localeCompare(b.date))
      .forEach(tx => {
        if (tx.type === 'buy') {
          if (!buyQueue[tx.stockId]) buyQueue[tx.stockId] = [];
          buyQueue[tx.stockId].push({ date: tx.date, quantity: tx.quantity });
        } else {
          let remaining = tx.quantity;
          const queue   = buyQueue[tx.stockId] || [];
          while (remaining > 0 && queue.length > 0) {
            const buy  = queue[0];
            const used = Math.min(remaining, buy.quantity);
            const days = _daysSince(buy.date) - _daysSince(tx.date);
            durations.push(Math.abs(days));
            buy.quantity -= used;
            remaining    -= used;
            if (buy.quantity <= 0.0001) queue.shift();
          }
        }
      });

    if (durations.length === 0) return null;
    return durations.reduce((s, d) => s + d, 0) / durations.length;
  }

  return {
    analyze,
    scoreStock,
    scoreLabel,
    analyzeStock,
    portfolioHealth,
    behaviorAnalysis,
    thesisReview,
  };
})();
