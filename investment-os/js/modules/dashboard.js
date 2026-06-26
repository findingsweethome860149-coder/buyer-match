/**
 * Dashboard Module
 * Responsible for: rendering all UI views.
 * NO business logic here — only display.
 * Reads from core data via passed-in values; does not query modules directly.
 *
 * Data flow: App → gather data from modules → pass to Dashboard → render
 */
const DashboardModule = (() => {

  // ── Home ──────────────────────────────────────────────────────────────────

  function renderHome({ aiResult, holdings, watchlist, cash, totalAssets, settings, recentTxs }) {
    const { items, actionCount } = aiResult;

    // ① 今日一句建議 (AI Brief) — always the biggest block
    let cls, icon, title, sub;
    if (actionCount === 0) {
      cls = 'status-calm'; icon = '😌';
      title = '今天不用交易';
      sub   = '市場平靜，安心生活。<br>長期投資的力量在於耐心等待。';
    } else if (actionCount === 1) {
      cls = 'status-attention'; icon = '👀';
      title = '有一件事值得確認';
      sub   = '花 1 分鐘看看下方的 AI 提醒。';
    } else {
      cls = 'status-action'; icon = '📋';
      title = `有 ${actionCount} 件事需要確認`;
      sub   = '請花 3 分鐘檢視以下提醒。';
    }
    _set('dailyBrief', `
      <div class="brief-status ${cls}">
        <div class="brief-icon">${icon}</div>
        <div class="brief-title">${title}</div>
        <div class="brief-sub">${sub}</div>
      </div>
      ${items.length ? _aiCard(items) : ''}
    `);

    // ② 目前資產
    const stockVal  = holdings.reduce((s, h) => s + h.shares * (h.currentPrice || h.avgCost), 0);
    const totalCost = holdings.reduce((s, h) => s + h.shares * h.avgCost, 0);
    const pnl       = stockVal - totalCost;
    const pnlPct    = totalCost > 0 ? pnl / totalCost * 100 : 0;
    const goalLabel = settings.investmentGoal || '投資目標';
    _set('assetsHome', `
      <div class="card">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <div class="card-title" style="margin-bottom:0">目前資產</div>
          <span class="goal-tag">🎯 ${goalLabel}</span>
        </div>
        <div class="asset-row">
          <span class="asset-label">總資產</span>
          <span class="asset-total">$${Utils.fmt(totalAssets)}</span>
        </div>
        <div class="asset-row">
          <span class="asset-label">現金</span>
          <span class="asset-value ${cash < 0 ? 'negative' : ''}">$${Utils.fmt(cash)}</span>
        </div>
        <div class="asset-row">
          <span class="asset-label">持股市值</span>
          <span class="asset-value">$${Utils.fmt(stockVal)}</span>
        </div>
        ${holdings.length > 0 ? `
        <div class="asset-row" style="border-top:1px solid var(--border);margin-top:4px;padding-top:10px">
          <span class="asset-label">未實現損益</span>
          <span class="asset-value ${Utils.pnlCls(pnl)}">${Utils.pnlSign(pnl)}$${Utils.fmt(Math.abs(pnl))} (${Utils.pnlSign(pnlPct)}${Utils.fmt(pnlPct, 2)}%)</span>
        </div>` : ''}
      </div>
    `);

    // ③ Watchlist — always shown (not only when hits)
    if (watchlist.length > 0) {
      const rows = watchlist.slice(0, 4).map(w => {
        const met  = w.currentPrice && w.targetPrice && w.currentPrice <= w.targetPrice;
        const diff = (w.currentPrice && w.targetPrice)
          ? ((w.currentPrice / w.targetPrice - 1) * 100) : null;
        return `
          <div class="watch-row" style="padding:8px 0">
            <div>
              <span style="font-size:15px;font-weight:700">${w.symbol}</span>
              <span style="font-size:13px;color:var(--muted);margin-left:6px">${w.name}</span>
            </div>
            <div style="text-align:right">
              <span class="asset-value ${met ? 'target-met' : ''}">$${Utils.fmt(w.currentPrice || 0, 2)}${met ? ' 🎯' : ''}</span>
              ${diff !== null ? `<div style="font-size:11px;${met ? 'color:var(--green)' : 'color:var(--muted)'}">${diff > 0 ? '+' : ''}${Utils.fmt(diff, 1)}%</div>` : ''}
            </div>
          </div>
        `;
      }).join('');
      const more = watchlist.length > 4 ? `<div style="font-size:12px;color:var(--muted);text-align:center;padding-top:6px">還有 ${watchlist.length - 4} 檔 →</div>` : '';
      _set('watchlistHome', `
        <div class="card">
          <div class="card-title">觀察清單</div>
          ${rows}
          ${more}
        </div>
      `);
    } else {
      _set('watchlistHome', `
        <div class="card">
          <div class="card-title">觀察清單</div>
          <div style="padding:12px 0;color:var(--muted);font-size:14px;text-align:center">
            點右下角 ＋ 加入第一檔股票
          </div>
        </div>
      `);
    }

    // ④ 今日提醒
    const d = new Date().getDate();
    const reminders = [];
    if (d >= settings.reminderDay && d <= settings.reminderDay + 4) {
      reminders.push({ icon: '📅', text: `本月定期投入日：預算 <strong>$${Utils.fmt(settings.monthlyBudget)}</strong>` });
    }
    const hits = watchlist.filter(w => w.currentPrice && w.targetPrice && w.currentPrice <= w.targetPrice);
    hits.forEach(w => {
      reminders.push({ icon: '🎯', text: `<strong>${w.symbol} ${w.name}</strong> 已達目標買入價 $${Utils.fmt(w.targetPrice, 2)}` });
    });
    if (reminders.length > 0) {
      _set('remindersHome', `
        <div class="card">
          <div class="card-title">今日提醒</div>
          ${reminders.map(r => `
            <div class="insight-item">
              <div class="insight-icon">${r.icon}</div>
              <div class="insight-text">${r.text}</div>
            </div>
          `).join('')}
        </div>
      `);
    } else {
      _set('remindersHome', '');
    }

    // ⑤ 最新活動
    if (recentTxs && recentTxs.length > 0) {
      const LABEL = { buy:'買入', sell:'賣出', deposit:'入金', withdraw:'出金' };
      const rows = recentTxs.map(tx => {
        const isTrade = tx.type === 'buy' || tx.type === 'sell';
        const desc = isTrade
          ? `${LABEL[tx.type]} ${tx.symbol} ${tx.name}`
          : `${LABEL[tx.type]} $${Utils.fmt(tx.cashAmt)}`;
        const dateStr = tx.date ? tx.date.slice(5) : '';
        return `
          <div class="activity-item">
            <div class="activity-dot activity-dot-${tx.type}"></div>
            <div class="activity-text">${desc}</div>
            <div class="activity-date">${dateStr}</div>
          </div>
        `;
      }).join('');
      _set('activityHome', `
        <div class="card">
          <div class="card-title">最新活動</div>
          ${rows}
        </div>
      `);
    } else {
      _set('activityHome', '');
    }
  }

  // ── Portfolio ─────────────────────────────────────────────────────────────

  function renderPortfolio({ holdings, cash, unrealized, unrealPct, realized, totalAssets, todayPnL }) {
    const el = document.getElementById('portfolioView');

    if (holdings.length === 0 && cash === 0) {
      el.innerHTML = `<div class="empty"><div class="empty-icon">📂</div>投資組合是空的<br>先點 ＋ 入金，再新增買入交易</div>`;
      return;
    }

    const holdingRows = holdings.map(h => {
      const mktVal = h.shares * (h.currentPrice || h.avgCost);
      const cost   = h.shares * h.avgCost;
      const pnl    = mktVal - cost;
      const pnlPct = cost > 0 ? pnl / cost * 100 : 0;
      const totalVal = holdings.reduce((s, x) => s + x.shares * (x.currentPrice || x.avgCost), 0);
      const alloc  = totalVal > 0 ? mktVal / totalVal * 100 : 0;
      const sharesFmt = h.shares % 1 !== 0 ? Utils.fmt(h.shares, 3) : Utils.fmt(h.shares);
      return `
        <div class="stock-row">
          <div>
            <div class="stock-symbol">${h.symbol}</div>
            <div class="stock-name">${h.name} · ${sharesFmt} 股</div>
            <div style="margin-top:5px">
              <span class="chip chip-gray">均價 $${Utils.fmt(h.avgCost, 2)}</span>
              <span class="chip chip-blue">${Utils.fmt(alloc, 1)}%</span>
            </div>
          </div>
          <div class="stock-right">
            <div class="stock-value" onclick="App.openUpdatePrice('${h.id}','portfolio')" style="cursor:pointer">
              $${Utils.fmt(mktVal)} ✏️
            </div>
            <div class="stock-sub ${Utils.pnlCls(pnl)}">${Utils.pnlSign(pnl)}${Utils.fmt(pnlPct, 2)}%</div>
            <div style="font-size:11px;color:var(--muted);margin-top:2px">現價 $${Utils.fmt(h.currentPrice || h.avgCost, 2)}</div>
          </div>
        </div>
      `;
    }).join('');

    const todayBar = todayPnL !== 0 ? `
      <div class="today-pnl">
        <span style="color:var(--muted)">今日損益</span>
        <span class="${Utils.pnlCls(todayPnL)}" style="font-weight:700">${Utils.pnlSign(todayPnL)}$${Utils.fmt(Math.abs(todayPnL))}</span>
      </div>` : '';

    el.innerHTML = `
      ${todayBar}
      <div class="card">
        <div class="card-title">總資產</div>
        <div class="total-row"><span class="total-label">總資產</span><span class="total-value">$${Utils.fmt(totalAssets)}</span></div>
        <div class="total-row"><span class="total-label">股票市值</span><span>$${Utils.fmt(holdings.reduce((s,h)=>s+h.shares*(h.currentPrice||h.avgCost),0))}</span></div>
        <div class="total-row"><span class="total-label">現金餘額</span><span class="${cash < 0 ? 'negative' : ''}">$${Utils.fmt(cash)}</span></div>
        <div class="total-row"><span class="total-label">未實現損益</span><span class="${Utils.pnlCls(unrealized)}">${Utils.pnlSign(unrealized)}$${Utils.fmt(Math.abs(unrealized))} (${Utils.pnlSign(unrealPct)}${Utils.fmt(unrealPct, 2)}%)</span></div>
        <div class="total-row"><span class="total-label">已實現損益</span><span class="${Utils.pnlCls(realized)}">${Utils.pnlSign(realized)}$${Utils.fmt(Math.abs(realized))}</span></div>
      </div>
      ${holdings.length > 0 ? `
      <div class="card">
        <div class="card-title">持股明細 <span style="font-size:11px;color:var(--muted)">點市值更新現價</span></div>
        ${holdingRows}
      </div>` : ''}
    `;
  }

  // ── Watchlist ─────────────────────────────────────────────────────────────

  function renderWatchlist({ watchlist }) {
    const el = document.getElementById('watchlistView');

    if (watchlist.length === 0) {
      el.innerHTML = `<div class="empty"><div class="empty-icon">👁️</div>觀察清單是空的<br>點 ＋ 加入想追蹤的股票</div>`;
      return;
    }

    function _rows(list) {
      return list.map(w => {
        const met    = w.currentPrice && w.targetPrice && w.currentPrice <= w.targetPrice;
        const diff   = (w.currentPrice && w.targetPrice) ? ((w.currentPrice / w.targetPrice - 1) * 100) : null;
        const score  = AIModule.scoreStock(w);
        const sl     = AIModule.scoreLabel(score);
        return `
          <div class="watch-row" onclick="App.openStockDetail('${w.id}')" style="cursor:pointer">
            <div style="flex:1;min-width:0">
              <div style="display:flex;align-items:center;gap:6px">
                <span class="stock-symbol">${w.symbol}</span>
                <span class="score-badge ${sl.cls}">${sl.label} ${score}</span>
                ${met ? '<span style="font-size:14px">🎯</span>' : ''}
              </div>
              <div class="stock-name">${w.name}</div>
              ${w.note ? `<div style="font-size:12px;color:var(--muted);margin-top:2px">${w.note}</div>` : ''}
            </div>
            <div style="text-align:right;flex-shrink:0;padding-left:8px">
              <div class="watch-price ${met ? 'target-met' : ''}"
                   onclick="event.stopPropagation();App.openUpdatePrice('${w.id}','watch')">
                $${Utils.fmt(w.currentPrice || 0, 2)} ✏️
              </div>
              <div style="font-size:12px;color:var(--muted);margin-top:2px">目標 $${w.targetPrice ? Utils.fmt(w.targetPrice, 2) : '—'}</div>
              ${diff !== null ? `<div style="font-size:12px;margin-top:2px" class="${met ? 'positive' : diff < 0 ? 'positive' : 'negative'}">${diff > 0 ? '+' : ''}${Utils.fmt(diff, 1)}%</div>` : ''}
            </div>
          </div>
        `;
      }).join('');
    }

    el.innerHTML = `
      <input class="search-bar" id="watchSearch" placeholder="搜尋股票代號或名稱…" oninput="App.filterWatchlist(this.value)">
      <div class="card" id="watchlistRows">
        <div class="card-title">觀察清單 <span style="font-size:11px;color:var(--muted)">點股票看分析 · 點價格更新</span></div>
        ${_rows(watchlist)}
      </div>
    `;

    el._allWatchlist = watchlist;
    el._rows = _rows;
  }

  // ── History ───────────────────────────────────────────────────────────────

  function renderHistory({ transactions }) {
    const el = document.getElementById('historyView');
    const txs = [...transactions].sort((a, b) => b.date.localeCompare(a.date));

    if (txs.length === 0) {
      el.innerHTML = `<div class="empty"><div class="empty-icon">📋</div>還沒有交易紀錄<br>點 ＋ 新增第一筆交易</div>`;
      return;
    }

    const totalDeposit  = txs.filter(t => t.type === 'deposit').reduce((s, t) => s + t.cashAmt, 0);
    const totalWithdraw = txs.filter(t => t.type === 'withdraw').reduce((s, t) => s + t.cashAmt, 0);
    const totalBuyAmt   = txs.filter(t => t.type === 'buy').reduce((s, t) => s + t.shares * t.price, 0);
    const totalFees     = txs.reduce((s, t) => s + (t.fee || 0), 0);

    const LABEL = { buy:'買入', sell:'賣出', deposit:'入金', withdraw:'出金' };
    const CHIP  = { buy:'chip-blue', sell:'chip-red', deposit:'chip-green', withdraw:'chip-yellow' };
    const SIGN  = { buy:'-', sell:'+', deposit:'+', withdraw:'-' };
    const CLS   = { buy:'negative', sell:'positive', deposit:'positive', withdraw:'negative' };

    const rows = txs.map(tx => {
      const isTrade = tx.type === 'buy' || tx.type === 'sell';
      const amount  = isTrade ? (tx.shares * tx.price) : tx.cashAmt;
      const sharesFmt = tx.shares % 1 !== 0 ? Utils.fmt(tx.shares, 3) : Utils.fmt(tx.shares);
      return `
        <div class="tx-row">
          <div style="flex:1;min-width:0">
            <div class="tx-date">${tx.date}</div>
            <div class="tx-desc">
              <span class="chip ${CHIP[tx.type]}">${LABEL[tx.type]}</span>
              ${isTrade ? `${tx.symbol} ${tx.name}` : '現金'}
            </div>
            ${tx.reason ? `<div style="font-size:12px;color:var(--muted);margin-top:3px">理由：${tx.reason}</div>` : ''}
            ${tx.note   ? `<div style="font-size:12px;color:var(--muted);margin-top:1px">${tx.note}</div>` : ''}
          </div>
          <div style="flex-shrink:0;padding-left:12px">
            <div class="tx-amount ${CLS[tx.type]}">${SIGN[tx.type]}$${Utils.fmt(amount)}</div>
            ${isTrade ? `<div class="tx-sub">${sharesFmt} 股 @ $${Utils.fmt(tx.price, 2)}</div>` : ''}
            ${tx.fee    ? `<div class="tx-sub">手續費 $${Utils.fmt(tx.fee)}</div>` : ''}
            <button class="btn-sm" onclick="App.deleteTx('${tx.id}')" style="margin-top:6px">刪除</button>
          </div>
        </div>
      `;
    }).join('');

    el.innerHTML = `
      <div class="card">
        <div class="card-title">統計</div>
        <div class="total-row"><span class="total-label">總入金</span><span class="positive">+$${Utils.fmt(totalDeposit)}</span></div>
        <div class="total-row"><span class="total-label">總出金</span><span class="negative">-$${Utils.fmt(totalWithdraw)}</span></div>
        <div class="total-row"><span class="total-label">總買入金額</span><span>$${Utils.fmt(totalBuyAmt)}</span></div>
        <div class="total-row"><span class="total-label">累計手續費</span><span class="negative">$${Utils.fmt(totalFees)}</span></div>
        <div class="total-row"><span class="total-label">交易筆數</span><span>${txs.length} 筆</span></div>
      </div>
      <input class="search-bar" id="historySearch" placeholder="搜尋股票代號、名稱或日期…" oninput="App.filterHistory(this.value)">
      <div class="card" id="historyRows">
        <div class="card-title">所有交易</div>
        ${rows}
      </div>
    `;
    el._allTxs = txs;
    el._rowFn  = (list) => list.map(tx => {
      const isTrade = tx.type === 'buy' || tx.type === 'sell';
      const amount  = isTrade ? (tx.shares * tx.price) : tx.cashAmt;
      const sharesFmt = tx.shares % 1 !== 0 ? Utils.fmt(tx.shares, 3) : Utils.fmt(tx.shares);
      return `
        <div class="tx-row">
          <div style="flex:1;min-width:0">
            <div class="tx-date">${tx.date}</div>
            <div class="tx-desc">
              <span class="chip ${CHIP[tx.type]}">${LABEL[tx.type]}</span>
              ${isTrade ? `${tx.symbol} ${tx.name}` : '現金'}
            </div>
            ${tx.reason ? `<div style="font-size:12px;color:var(--muted);margin-top:3px">理由：${tx.reason}</div>` : ''}
            ${tx.note   ? `<div style="font-size:12px;color:var(--muted);margin-top:1px">${tx.note}</div>` : ''}
          </div>
          <div style="flex-shrink:0;padding-left:12px">
            <div class="tx-amount ${CLS[tx.type]}">${SIGN[tx.type]}$${Utils.fmt(amount)}</div>
            ${isTrade ? `<div class="tx-sub">${sharesFmt} 股 @ $${Utils.fmt(tx.price, 2)}</div>` : ''}
            ${tx.fee    ? `<div class="tx-sub">手續費 $${Utils.fmt(tx.fee)}</div>` : ''}
            <button class="btn-sm" onclick="App.deleteTx('${tx.id}')" style="margin-top:6px">刪除</button>
          </div>
        </div>
      `;
    }).join('');
  }

  // ── Settings ──────────────────────────────────────────────────────────────

  function renderSettings({ settings }) {
    document.getElementById('settingsView').innerHTML = `
      <div class="card">
        <div class="card-title">投資設定</div>
        ${settings.investmentGoal ? `
        <div class="setting-row">
          <span class="setting-label">投資目標</span>
          <span class="setting-value" onclick="App.editSetting('investmentGoal','投資目標','${settings.investmentGoal}')">${settings.investmentGoal} ✏️</span>
        </div>` : ''}
        <div class="setting-row">
          <span class="setting-label">每月投資預算</span>
          <span class="setting-value" onclick="App.editSetting('monthlyBudget','每月投資預算（元）',${settings.monthlyBudget})">$${Utils.fmt(settings.monthlyBudget)} ✏️</span>
        </div>
        <div class="setting-row">
          <span class="setting-label">每月提醒日</span>
          <span class="setting-value" onclick="App.editSetting('reminderDay','提醒日（1~28）',${settings.reminderDay})">${settings.reminderDay} 日 ✏️</span>
        </div>
        <div class="setting-row">
          <span class="setting-label">預設手續費率</span>
          <span class="setting-value" onclick="App.editSetting('defaultFeeRate','手續費率（%）',${settings.defaultFeeRate})">${settings.defaultFeeRate}% ✏️</span>
        </div>
      </div>

      <div class="line-card">
        <div class="line-card-title">LINE Assistant</div>
        <div class="line-card-sub">透過 LINE 完成入金、買入、賣出、查詢持股。所有交易經過二次確認。</div>
        <div class="line-badge">⏳ 即將推出 · 需要後端服務</div>
      </div>

      <div class="card">
        <div class="card-title">通知設定</div>
        <div class="insight-item">
          <div class="insight-icon">🔔</div>
          <div class="insight-text">盤前摘要、盤中重大事件、盤後摘要<br><span style="font-size:12px">⏳ 即將推出 · 需要後端服務</span></div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">關於</div>
        <div class="insight-item">
          <div class="insight-icon">✦</div>
          <div class="insight-text">
            <strong>AI Investment OS Lite v1.0</strong><br>
            陪伴小資族建立投資紀律的 AI 陪跑教練。<br>
            不報明牌，不替你下決定，不是股票分析軟體。
          </div>
        </div>
        <div class="insight-item">
          <div class="insight-icon">⚠️</div>
          <div class="insight-text">
            AI 提供分析與提醒，<strong>不構成任何投資建議</strong>。<br>
            所有投資決策由使用者自行判斷並承擔責任。<br>
            投資一定有風險，過去績效不代表未來結果。
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-title" style="color:var(--red)">資料管理</div>
        <p style="font-size:13px;color:var(--muted);margin-bottom:12px">所有資料儲存於你的裝置本機，不會上傳至任何伺服器。</p>
        <button class="btn btn-danger" onclick="App.exportData()" style="margin-bottom:8px">匯出資料（JSON）</button>
        <button class="btn btn-danger" onclick="App.clearAllData()">清除所有資料</button>
      </div>
    `;
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  function _set(id, html) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  }

  function _aiCard(items) {
    return `
      <div class="card">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <div class="card-title" style="margin-bottom:0">AI 陪跑教練</div>
          <span style="font-size:11px;color:var(--muted)">分析僅供參考</span>
        </div>
        ${items.map(i => `
          <div class="insight-item">
            <div class="insight-icon">${i.icon}</div>
            <div class="insight-text">
              ${i.text}
              ${i.decision ? `<div class="insight-decision">💬 ${i.decision}</div>` : ''}
            </div>
          </div>
        `).join('')}
        <div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--border);font-size:11px;color:var(--muted);text-align:center">
          AI 提供分析與提醒，所有投資決策由你自己決定。
        </div>
      </div>
    `;
  }

  return { renderHome, renderPortfolio, renderWatchlist, renderHistory, renderSettings };
})();
