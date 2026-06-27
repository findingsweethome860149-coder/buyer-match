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

  function renderHome({ aiResult, holdings, watchlist, cash, totalAssets, settings, todayPnL, cumulativePnL, healthResult }) {
    const { items, actionCount } = aiResult;

    // ① 今日 AI 建議
    let icon, title;
    if (actionCount === 0) { icon = '😌'; title = '今天不用交易。'; }
    else if (actionCount === 1) { icon = '👀'; title = '有一件事值得確認。'; }
    else { icon = '📋'; title = `有 ${actionCount} 件事需要確認。`; }
    _set('dailyBrief', `
      <div class="card" id="aiBriefCard">
        <div class="card-title">今日 AI 建議</div>
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:28px">${icon}</span>
          <span style="font-size:15px;font-weight:600;flex:1">${title}</span>
          ${items.length ? `<span style="font-size:13px;color:var(--accent);cursor:pointer;flex-shrink:0" onclick="App.toggleAiBrief()">查看原因 ›</span>` : ''}
        </div>
        <div id="aiBriefDetail" style="display:none;margin-top:12px;border-top:1px solid var(--border);padding-top:10px">
          ${items.map(i => `
            <div class="insight-item">
              <div class="insight-icon">${i.icon}</div>
              <div class="insight-text">${i.text}${i.decision ? `<div class="insight-decision">💬 ${i.decision}</div>` : ''}</div>
            </div>`).join('')}
          <div style="margin-top:8px;font-size:11px;color:var(--muted);text-align:center">AI 分析僅供參考，所有決策由你決定。</div>
        </div>
      </div>
    `);

    // ② 資產摘要
    _set('assetsHome', `
      <div class="card">
        <div class="card-title">資產摘要</div>
        <div class="asset-row">
          <span class="asset-label">總資產</span>
          <span class="asset-total">$${Utils.fmt(totalAssets)}</span>
        </div>
        <div class="asset-row">
          <span class="asset-label">今日損益</span>
          <span class="asset-value ${Utils.pnlCls(todayPnL)}">${todayPnL !== 0 ? Utils.pnlSign(todayPnL) + '$' + Utils.fmt(Math.abs(todayPnL)) : '—'}</span>
        </div>
        <div class="asset-row">
          <span class="asset-label">累積損益</span>
          <span class="asset-value ${Utils.pnlCls(cumulativePnL)}">${Utils.pnlSign(cumulativePnL)}$${Utils.fmt(Math.abs(cumulativePnL))}</span>
        </div>
        <div class="asset-row">
          <span class="asset-label">現金</span>
          <span class="asset-value ${cash < 0 ? 'negative' : ''}">$${Utils.fmt(cash)}</span>
        </div>
      </div>
    `);

    // ③ Goal Tracker
    const goalLabel   = settings.investmentGoal || '尚未設定目標';
    const goalAmount  = settings.goalAmount || 0;
    const monthBudget = settings.monthlyBudget || 0;
    const goalPct     = (goalAmount > 0 && totalAssets > 0) ? Math.min(100, totalAssets / goalAmount * 100) : 0;
    const goalReached = goalAmount > 0 && totalAssets >= goalAmount;

    let goalFooter = '';
    if (goalReached) {
      goalFooter = `<div style="font-size:13px;font-weight:600;color:var(--green);margin-top:6px">🎉 已達成目標！</div>`;
    } else if (goalAmount > 0 && monthBudget > 0 && totalAssets < goalAmount) {
      const remaining  = goalAmount - totalAssets;
      const monthsLeft = Math.ceil(remaining / monthBudget);
      const est = new Date();
      est.setMonth(est.getMonth() + monthsLeft);
      const estStr = `${est.getFullYear()}/${String(est.getMonth() + 1).padStart(2, '0')}`;
      goalFooter = `<div style="font-size:12px;color:var(--muted);margin-top:6px">預估完成日期：${estStr}（按每月 $${Utils.fmt(monthBudget)} 計算）</div>`;
    } else if (goalAmount > 0) {
      goalFooter = `<div style="font-size:12px;color:var(--muted);margin-top:6px">設定每月預算以計算預估完成日期</div>`;
    }

    _set('watchlistHome', `
      <div class="card">
        <div class="card-title">Goal Tracker</div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <span style="font-size:14px;font-weight:600">🎯 ${goalLabel}</span>
          <span style="font-size:12px;color:var(--accent);cursor:pointer" onclick="App.editSetting('investmentGoal','投資目標','${goalLabel}')">更改 ✏️</span>
        </div>
        ${goalAmount > 0 ? `
          <div style="margin-bottom:4px">
            <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--muted);margin-bottom:4px">
              <span>完成進度</span>
              <span>${Utils.fmt(goalPct, 1)}%（目標 $${Utils.fmt(goalAmount)}）</span>
            </div>
            <div style="height:8px;border-radius:4px;background:var(--surface2)">
              <div style="width:${goalPct}%;height:8px;border-radius:4px;background:var(--accent);transition:width .4s"></div>
            </div>
          </div>
          ${goalFooter}
        ` : `
          <div style="font-size:13px;color:var(--muted)">
            設定目標金額以追蹤進度
            <span style="color:var(--accent);cursor:pointer;margin-left:6px" onclick="App.editSetting('goalAmount','目標金額（元）',0)">設定 →</span>
          </div>
        `}
      </div>
    `);

    // ④ Portfolio Health（home summary card）
    if (healthResult && healthResult.score !== undefined) {
      const hl     = AIModule.healthLabel(healthResult.score);
      const hColor = healthResult.score >= 60 ? 'var(--green)' : healthResult.score >= 40 ? 'var(--yellow)' : 'var(--red)';
      _set('portfolioHealthHome', `
        <div class="card">
          <div class="card-title">Portfolio 健康度</div>
          <div style="display:flex;align-items:center;gap:14px">
            <div style="font-size:34px;font-weight:900;color:${hColor}">${healthResult.score}</div>
            <div style="flex:1">
              <div style="height:6px;border-radius:3px;background:var(--surface2)">
                <div style="width:${healthResult.score}%;height:6px;border-radius:3px;background:${hColor};transition:width .5s"></div>
              </div>
              <div style="margin-top:4px;display:flex;justify-content:space-between;align-items:center">
                <span class="score-badge ${hl.cls}">${hl.label}</span>
                <span style="font-size:11px;color:var(--muted)">${hl.tip}</span>
              </div>
            </div>
          </div>
          ${healthResult.reasons && healthResult.reasons.length > 0 ? `
            <div style="margin-top:8px;font-size:12px;color:var(--muted)">
              ${healthResult.reasons.slice(0, 2).map(r => `<div style="padding:2px 0">· ${r}</div>`).join('')}
            </div>` : ''}
        </div>
      `);
    } else {
      _set('portfolioHealthHome', '');
    }

    // ⑤ Watchlist（前 5 檔）
    _set('remindersHome', watchlist.length > 0 ? `
      <div class="card">
        <div class="card-title">觀察清單</div>
        ${watchlist.slice(0, 5).map(w => {
          const met   = w.currentPrice && w.targetPrice && w.currentPrice <= w.targetPrice;
          const score = AIModule.scoreStock(w);
          const sl    = AIModule.scoreLabel(score);
          return `
            <div class="watch-row" onclick="App.openStockDetail('${w.id}')" style="cursor:pointer;padding:8px 0">
              <div>
                <span style="font-size:15px;font-weight:700">${w.stockId}</span>
                <span style="font-size:12px;color:var(--muted);margin-left:5px">${w.stockName}</span>
                ${met ? '<span style="font-size:12px">🎯</span>' : ''}
              </div>
              <div style="text-align:right">
                <div style="font-size:14px;font-weight:600 ${met ? ';color:var(--green)' : ''}">$${Utils.fmt(w.currentPrice || 0, 2)}</div>
                <span class="score-badge ${sl.cls}">${sl.label}</span>
              </div>
            </div>`;
        }).join('')}
        ${watchlist.length > 5 ? `<div style="font-size:12px;color:var(--muted);text-align:center;padding-top:6px">還有 ${watchlist.length - 5} 檔 →</div>` : ''}
      </div>
    ` : `
      <div class="card">
        <div class="card-title">觀察清單</div>
        <div style="padding:10px 0;color:var(--muted);font-size:14px;text-align:center">點右下角 ＋ 加入第一檔股票</div>
      </div>
    `);

    // ⑥ 通知（最新 3 則 AI 提醒）
    const notifs = items.filter(i => i.priority <= 3).slice(0, 3);
    _set('activityHome', notifs.length > 0 ? `
      <div class="card">
        <div class="card-title">通知</div>
        ${notifs.map(n => `
          <div class="insight-item">
            <div class="insight-icon">${n.icon}</div>
            <div class="insight-text" style="font-size:13px">${n.text}</div>
          </div>`).join('')}
      </div>
    ` : '');
  }

  // ── Portfolio ─────────────────────────────────────────────────────────────

  function renderPortfolio({ holdings, watchlist, transactions, cash, unrealized, unrealPct, realized, totalAssets, todayPnL, thesisMap }) {
    const el = document.getElementById('portfolioView');

    if (holdings.length === 0 && cash === 0) {
      el.innerHTML = `<div class="empty"><div class="empty-icon">📂</div>投資組合是空的<br>先點 ＋ 入金，再新增買入交易</div>`;
      return;
    }

    const totalVal = holdings.reduce((s, x) => s + x.quantity * (x.currentPrice || x.avgCost), 0);
    const holdingRows = holdings.map(h => {
      const mktVal    = h.quantity * (h.currentPrice || h.avgCost);
      const cost      = h.quantity * h.avgCost;
      const pnl       = mktVal - cost;
      const pnlPct    = cost > 0 ? pnl / cost * 100 : 0;
      const alloc     = totalVal > 0 ? mktVal / totalVal * 100 : 0;
      const qtyFmt    = h.quantity % 1 !== 0 ? Utils.fmt(h.quantity, 3) : Utils.fmt(h.quantity);
      const wItem     = (watchlist || []).find(w => w.stockId === h.stockId);
      const aiPoints  = wItem ? AIModule.analyzeStock(wItem, h) : [];
      const aiHint    = aiPoints.length > 1 ? aiPoints[0].text : null;
      const thesis    = thesisMap && thesisMap[h.stockId];
      return `
        <div class="stock-row" style="flex-direction:column;align-items:stretch;gap:8px">
          <div style="display:flex;justify-content:space-between;align-items:flex-start">
            <div>
              <div class="stock-symbol">${h.stockId}</div>
              <div class="stock-name">${h.stockName} · ${qtyFmt} 股</div>
              <div style="margin-top:5px">
                <span class="chip chip-gray">均價 $${Utils.fmt(h.avgCost, 2)}</span>
                <span class="chip chip-blue">${Utils.fmt(alloc, 1)}%</span>
                ${thesis ? `<span class="chip chip-gray" style="color:var(--accent)">📌 ${thesis}</span>` : `<span class="chip chip-gray" style="color:var(--muted)">尚未設定買進理由</span>`}
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
          ${aiHint ? `<div style="font-size:12px;color:var(--muted);padding:6px 8px;background:var(--surface2);border-radius:6px">💬 ${aiHint}</div>` : ''}
          <div style="text-align:right">
            <span style="font-size:12px;color:var(--accent);cursor:pointer" onclick="App.viewHoldingHistory('${h.stockId}')">查看交易紀錄 →</span>
          </div>
        </div>
      `;
    }).join('');

    const todayBar = todayPnL !== 0 ? `
      <div class="today-pnl">
        <span style="color:var(--muted)">今日損益</span>
        <span class="${Utils.pnlCls(todayPnL)}" style="font-weight:700">${Utils.pnlSign(todayPnL)}$${Utils.fmt(Math.abs(todayPnL))}</span>
      </div>` : '';

    // Portfolio Health card
    const health = AIModule.portfolioHealth(holdings, transactions || [], totalAssets);
    const behav  = AIModule.behaviorAnalysis(transactions || [], holdings);
    const hColor = health.score >= 70 ? 'var(--green)' : health.score >= 40 ? 'var(--yellow)' : 'var(--red)';

    el.innerHTML = `
      ${todayBar}
      <div class="card">
        <div class="card-title">總資產</div>
        <div class="total-row"><span class="total-label">總資產</span><span class="total-value">$${Utils.fmt(totalAssets)}</span></div>
        <div class="total-row"><span class="total-label">股票市值</span><span>$${Utils.fmt(holdings.reduce((s,h)=>s+h.quantity*(h.currentPrice||h.avgCost),0))}</span></div>
        <div class="total-row"><span class="total-label">現金餘額</span><span class="${cash < 0 ? 'negative' : ''}">$${Utils.fmt(cash)}</span></div>
        <div class="total-row"><span class="total-label">未實現損益</span><span class="${Utils.pnlCls(unrealized)}">${Utils.pnlSign(unrealized)}$${Utils.fmt(Math.abs(unrealized))} (${Utils.pnlSign(unrealPct)}${Utils.fmt(unrealPct, 2)}%)</span></div>
        <div class="total-row"><span class="total-label">已實現損益</span><span class="${Utils.pnlCls(realized)}">${Utils.pnlSign(realized)}$${Utils.fmt(Math.abs(realized))}</span></div>
      </div>
      ${holdings.length > 0 ? `
      <div class="card">
        <div class="card-title">持股明細 <span style="font-size:11px;color:var(--muted)">點市值更新現價</span></div>
        ${holdingRows}
      </div>` : ''}
      <div class="card">
        <div class="card-title">Portfolio 健康度</div>
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px">
          <div style="font-size:32px;font-weight:900;color:${hColor}">${health.score}</div>
          <div style="flex:1">
            <div style="height:6px;border-radius:3px;background:var(--surface2)">
              <div style="width:${health.score}%;height:6px;border-radius:3px;background:${hColor};transition:width .4s"></div>
            </div>
            <div style="font-size:12px;color:var(--muted);margin-top:4px">滿分 100 分（不以報酬率評分）</div>
          </div>
        </div>
        ${health.reasons.map(r => `<div style="font-size:12px;color:var(--muted);padding:3px 0">• ${r}</div>`).join('')}
      </div>
      ${behav.length > 0 ? `
      <div class="card">
        <div class="card-title">AI 行為分析</div>
        ${behav.map(b => `
          <div class="insight-item">
            <div class="insight-icon">${b.icon}</div>
            <div class="insight-text" style="font-size:13px">${b.text}</div>
          </div>`).join('')}
        <div style="font-size:11px;color:var(--muted);margin-top:8px;text-align:center">AI 分析僅供參考，不構成投資建議。</div>
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
                <span class="stock-symbol">${w.stockId}</span>
                <span class="score-badge ${sl.cls}">${sl.label} ${score}</span>
                ${met ? '<span style="font-size:14px">🎯</span>' : ''}
              </div>
              <div class="stock-name">${w.stockName}</div>
              ${w.memo ? `<div style="font-size:12px;color:var(--muted);margin-top:2px">${w.memo}</div>` : ''}
            </div>
            <div style="text-align:right;flex-shrink:0;padding-left:8px">
              <div class="watch-price ${met ? 'target-met' : ''}"
                   onclick="event.stopPropagation();App.openUpdatePrice('${w.id}','watch')">
                $${Utils.fmt(w.currentPrice || 0, 2)} ✏️
              </div>
              <div style="font-size:12px;color:var(--muted);margin-top:2px">目標 $${w.targetPrice ? Utils.fmt(w.targetPrice, 2) : '—'}</div>
              ${diff !== null ? `<div style="font-size:12px;margin-top:2px" class="${diff <= 0 ? 'positive' : 'negative'}">${diff > 0 ? '+' : ''}${Utils.fmt(diff, 1)}%</div>` : ''}
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

    DashboardModule._watchCache = { list: watchlist, rows: _rows };
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
    const totalBuyAmt   = txs.filter(t => t.type === 'buy').reduce((s, t) => s + t.quantity * t.price, 0);
    const totalFees     = txs.reduce((s, t) => s + (t.fee || 0), 0);

    const LABEL = { buy:'買入', sell:'賣出', deposit:'入金', withdraw:'出金' };
    const CHIP  = { buy:'chip-blue', sell:'chip-red', deposit:'chip-green', withdraw:'chip-yellow' };
    const SIGN  = { buy:'-', sell:'+', deposit:'+', withdraw:'-' };
    const CLS   = { buy:'negative', sell:'positive', deposit:'positive', withdraw:'negative' };

    function _txRow(tx) {
      const isTrade = tx.type === 'buy' || tx.type === 'sell';
      const amount  = isTrade ? (tx.quantity * tx.price) : tx.cashAmt;
      const qtyFmt  = tx.quantity && tx.quantity % 1 !== 0 ? Utils.fmt(tx.quantity, 3) : Utils.fmt(tx.quantity || 0);
      const secTax  = tx.type === 'sell' && tx.tax ? Utils.fmt(tx.tax) : null;
      return `
        <div class="tx-row">
          <div style="flex:1;min-width:0">
            <div class="tx-date">${tx.date}</div>
            <div class="tx-desc">
              <span class="chip ${CHIP[tx.type]}">${LABEL[tx.type]}</span>
              ${isTrade ? `${tx.stockId} ${tx.stockName}` : '現金'}
            </div>
            ${tx.thesis ? `<div style="font-size:12px;color:var(--muted);margin-top:3px">理由：${tx.thesis}</div>` : ''}
            ${tx.memo   ? `<div style="font-size:12px;color:var(--muted);margin-top:1px">${tx.memo}</div>` : ''}
          </div>
          <div style="flex-shrink:0;padding-left:12px">
            <div class="tx-amount ${CLS[tx.type]}">${SIGN[tx.type]}$${Utils.fmt(amount)}</div>
            ${isTrade ? `<div class="tx-sub">${qtyFmt} 股 @ $${Utils.fmt(tx.price, 2)}</div>` : ''}
            ${tx.fee  ? `<div class="tx-sub">手續費 $${Utils.fmt(tx.fee)}</div>` : ''}
            ${secTax  ? `<div class="tx-sub">證交稅 $${secTax}</div>` : ''}
            <button class="btn-sm" onclick="App.deleteTx('${tx.id}')" style="margin-top:6px">刪除</button>
          </div>
        </div>
      `;
    }

    const rows = txs.map(_txRow).join('');

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
      <div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap">
        <button class="btn-sm hist-filter-btn selected" data-type="all"     onclick="App.filterHistoryType('all')">全部</button>
        <button class="btn-sm hist-filter-btn"          data-type="buy"     onclick="App.filterHistoryType('buy')">買進</button>
        <button class="btn-sm hist-filter-btn"          data-type="sell"    onclick="App.filterHistoryType('sell')">賣出</button>
        <button class="btn-sm hist-filter-btn"          data-type="deposit" onclick="App.filterHistoryType('deposit')">入金</button>
        <button class="btn-sm hist-filter-btn"          data-type="withdraw" onclick="App.filterHistoryType('withdraw')">出金</button>
        <span style="margin-left:auto;display:flex;gap:6px">
          <button class="btn-sm hist-sort-btn selected" data-sort="date-desc" onclick="App.sortHistory('date-desc')">新→舊</button>
          <button class="btn-sm hist-sort-btn"          data-sort="date-asc"  onclick="App.sortHistory('date-asc')">舊→新</button>
          <button class="btn-sm hist-sort-btn"          data-sort="amt-desc"  onclick="App.sortHistory('amt-desc')">金額↓</button>
        </span>
      </div>
      <div class="card" id="historyRows">
        <div class="card-title">所有交易</div>
        ${rows}
      </div>
    `;

    DashboardModule._histCache = { list: txs, rowFn: (list) => list.map(_txRow).join('') };
  }

  // ── Settings ──────────────────────────────────────────────────────────────

  function renderSettings({ settings, pinEnabled = false }) {
    const isDark = settings.darkMode !== false; // default dark
    document.getElementById('settingsView').innerHTML = `
      <div class="card">
        <div class="card-title">顯示</div>
        <div class="setting-row">
          <span class="setting-label">深色模式</span>
          <label class="toggle-switch">
            <input type="checkbox" id="darkModeToggle" ${isDark ? 'checked' : ''}
              onchange="App.toggleDarkMode(this.checked)">
            <span class="toggle-track"><span class="toggle-thumb"></span></span>
          </label>
        </div>
      </div>

      <div class="card">
        <div class="card-title">投資目標</div>
        <div class="setting-row">
          <span class="setting-label">目標名稱</span>
          <span class="setting-value" onclick="App.editSetting('investmentGoal','投資目標',${JSON.stringify(settings.investmentGoal || '')})">${settings.investmentGoal || '未設定'} ✏️</span>
        </div>
        <div class="setting-row">
          <span class="setting-label">目標金額</span>
          <span class="setting-value" onclick="App.editSetting('goalAmount','目標金額（元）',${settings.goalAmount || 0})">${settings.goalAmount ? '$' + Utils.fmt(settings.goalAmount) : '未設定'} ✏️</span>
        </div>
      </div>

      <div class="card">
        <div class="card-title">投資設定</div>
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

      <div class="card">
        <div class="card-title">安全</div>
        <div class="setting-row">
          <span class="setting-label">PIN 鎖定</span>
          ${pinEnabled ? `
            <div style="display:flex;align-items:center;gap:12px">
              <span style="font-size:13px;color:var(--green);font-weight:600">已開啟</span>
              <span style="font-size:13px;color:var(--accent);cursor:pointer" onclick="App.changePIN()">更改 PIN</span>
              <span style="font-size:13px;color:var(--red);cursor:pointer" onclick="App.disablePIN()">關閉</span>
            </div>` : `
            <span style="font-size:13px;color:var(--accent);cursor:pointer" onclick="App.setupPIN()">設定 PIN →</span>`}
        </div>
        ${pinEnabled ? `
        <div style="font-size:12px;color:var(--muted);margin-top:6px">
          開啟 App 及執行匯入、清除操作時需輸入 PIN
        </div>` : `
        <div style="font-size:12px;color:var(--muted);margin-top:6px">
          設定 4 位數 PIN，保護 App 開啟與重要操作
        </div>`}
      </div>

      <div class="line-card">
        <div class="line-card-title">LINE Assistant</div>
        <div class="line-card-sub">透過 LINE 完成入金、買入、賣出、查詢持股。所有交易經過二次確認，Dashboard 自動同步。</div>
        <div style="margin-top:10px">
          <label class="form-label" style="font-size:12px;margin-bottom:4px;display:block">Webhook 伺服器網址</label>
          <div style="display:flex;gap:6px">
            <input class="form-input" id="lineServerUrl" type="url" placeholder="https://your-server.example.com"
              style="flex:1;font-size:12px"
              value="${(typeof localStorage !== 'undefined' ? localStorage.getItem('aios_line_server_url') : '') || ''}">
            <button class="btn" style="font-size:12px;padding:6px 10px" onclick="App.saveLineServerUrl()">儲存</button>
          </div>
          <div style="font-size:11px;color:var(--muted);margin-top:4px">設定後每 15 秒自動同步 LINE 操作</div>
        </div>
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
        <div class="card-title">資料管理</div>
        <p style="font-size:13px;color:var(--muted);margin-bottom:12px">所有資料儲存於你的裝置本機，不會上傳至任何伺服器。</p>
        <div style="margin-top:12px;display:flex;flex-direction:column;gap:8px">
          <button class="btn btn-primary" onclick="App.exportData()">匯出資料（JSON）</button>
          <button class="btn btn-primary" onclick="App.importData()">匯入資料（JSON）</button>
          <button class="btn btn-danger"  onclick="App.clearAllData()">清除所有資料</button>
        </div>
      </div>
    `;
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  function _set(id, html) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
  }

  return { renderHome, renderPortfolio, renderWatchlist, renderHistory, renderSettings, _watchCache: null, _histCache: null };
})();
