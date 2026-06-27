/**
 * App — entry point and coordinator.
 *
 * Data flow (per Architecture doc):
 *   User action → TransactionModule.add()
 *     → PortfolioModule.recalculate()
 *     → AIModule.analyze()
 *     → DashboardModule.render*()
 *     → NotificationModule.toast()
 *
 * App coordinates modules. Modules do NOT call each other directly.
 * All user-facing operations are wrapped in error handling.
 */
const App = (() => {
  let _page = 'home';

  // ─── Settings ──────────────────────────────────────────────────────────────

  function getSettings() {
    return DB.get('settings', {
      monthlyBudget: 10000,
      reminderDay: 5,
      defaultFeeRate: 0.1425,
      investmentGoal: '',
    });
  }

  function saveSettings(s) {
    DB.set('settings', s);
  }

  // ─── Navigation ────────────────────────────────────────────────────────────

  function navigate(page) {
    _page = page;
    document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === page));
    document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === 'page-' + page));
    _safeRender();
  }

  function _safeRender() {
    try {
      _renderCurrentPage();
    } catch (err) {
      console.error('Render error:', err);
      NotificationModule.toast('畫面更新失敗，請稍後再試。');
    }
  }

  function _renderCurrentPage() {
    const txs      = TransactionModule.getAll();
    const holdings = PortfolioModule.getHoldings();
    const watchlist = WatchlistModule.getAll();
    const settings = getSettings();

    if (_page === 'home') {
      const aiResult   = AIModule.analyze({ holdings, watchlist, settings, transactions: txs });
      const cash       = PortfolioModule.getCashBalance(txs);
      const totalAssets = PortfolioModule.getTotalAssets(txs);
      const recentTxs  = [...txs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
      DashboardModule.renderHome({
        aiResult,
        holdings,
        watchlist,
        cash,
        totalAssets,
        settings,
        recentTxs,
      });
    } else if (_page === 'portfolio') {
      DashboardModule.renderPortfolio({
        holdings,
        cash:        PortfolioModule.getCashBalance(txs),
        unrealized:  PortfolioModule.getUnrealizedPnL(),
        unrealPct:   _unrealPct(holdings),
        realized:    PortfolioModule.getRealizedPnL(txs),
        totalAssets: PortfolioModule.getTotalAssets(txs),
        todayPnL:    PortfolioModule.getTodayPnL(),
      });
    } else if (_page === 'watchlist') {
      DashboardModule.renderWatchlist({ watchlist });
    } else if (_page === 'history') {
      DashboardModule.renderHistory({ transactions: txs });
    } else if (_page === 'settings') {
      DashboardModule.renderSettings({ settings });
    }
  }

  function _unrealPct(holdings) {
    const cost = holdings.reduce((s, h) => s + h.shares * h.avgCost, 0);
    const val  = holdings.reduce((s, h) => s + h.shares * (h.currentPrice || h.avgCost), 0);
    return cost > 0 ? (val - cost) / cost * 100 : 0;
  }

  // ─── Transaction actions ───────────────────────────────────────────────────

  let _pendingTx = null; // staged transaction pending confirm

  function submitTransaction() {
    try {
      const type = document.getElementById('txType').value;
      const date = document.getElementById('txDate').value;
      if (!date) { NotificationModule.toast('請選擇日期'); return; }

      const LABEL = { buy:'買入', sell:'賣出', deposit:'入金', withdraw:'出金' };

      if (type === 'deposit' || type === 'withdraw') {
        const cashAmt = parseFloat(document.getElementById('txCashAmt').value);
        if (!cashAmt || cashAmt <= 0) { NotificationModule.toast('請輸入金額'); return; }
        _pendingTx = {
          type, date, cashAmt,
          reason: document.getElementById('txReason').value.trim(),
          note:   document.getElementById('txNote').value.trim(),
        };
        document.getElementById('txConfirmBody').innerHTML = `
          <div class="insight-item"><div class="insight-icon">${type === 'deposit' ? '💰' : '💸'}</div>
          <div class="insight-text"><strong>${LABEL[type]}</strong><br>金額：$${Utils.fmt(cashAmt)}<br>日期：${date}</div></div>`;
        closeModal('modalTx');
        openModal('modalTxConfirm');
        return;
      }

      const symbol = document.getElementById('txSymbol').value.trim().toUpperCase();
      const name   = document.getElementById('txName').value.trim();
      const shares = parseFloat(document.getElementById('txShares').value);
      const price  = parseFloat(document.getElementById('txPrice').value);
      const fee    = parseFloat(document.getElementById('txFee').value) || 0;
      const reason = document.getElementById('txReason').value.trim();
      const note   = document.getElementById('txNote').value.trim();

      if (!symbol || !name) { NotificationModule.toast('請填寫股票代號與名稱'); return; }
      if (!shares || shares <= 0) { NotificationModule.toast('請填寫股數'); return; }
      if (!price  || price  <= 0) { NotificationModule.toast('請填寫成交價格'); return; }

      const total = shares * price + (type === 'buy' ? fee : -fee);
      _pendingTx = { type, date, symbol, name, shares, price, fee, reason, note };

      document.getElementById('txConfirmBody').innerHTML = `
        <div class="insight-item"><div class="insight-icon">${type === 'buy' ? '📈' : '📉'}</div>
        <div class="insight-text">
          <strong>${LABEL[type]} ${symbol} ${name}</strong><br>
          股數：${Utils.fmt(shares)} 股 × $${Utils.fmt(price, 2)}<br>
          手續費：$${Utils.fmt(fee)}<br>
          ${type === 'buy' ? '合計支出' : '合計收入'}：<strong>$${Utils.fmt(Math.abs(total))}</strong><br>
          日期：${date}
          ${reason ? `<br>理由：${reason}` : ''}
        </div></div>`;
      closeModal('modalTx');
      openModal('modalTxConfirm');
    } catch (err) {
      console.error('submitTransaction error:', err);
      NotificationModule.toast('新增交易失敗，請稍後再試。資料未遺失。');
    }
  }

  function confirmTransaction() {
    try {
      const tx = _pendingTx;
      if (!tx) return;

      if (tx.type === 'deposit' || tx.type === 'withdraw') {
        TransactionModule.add(tx);
        SecurityModule.log(tx.type, `$${tx.cashAmt}`);
        _pendingTx = null;
        closeModal('modalTxConfirm');
        _clearTxForm();
        NotificationModule.toast(`${tx.type === 'deposit' ? '入金' : '出金'} $${Utils.fmt(tx.cashAmt)} 已記錄`);
        _safeRender();
        return;
      }

      // Calculate realized P&L for sells
      if (tx.type === 'sell') {
        const h = PortfolioModule.getHoldings().find(x => x.symbol === tx.symbol);
        if (h) tx.realizedPnL = (tx.price - h.avgCost) * tx.shares - tx.fee;
      }

      TransactionModule.add(tx);
      PortfolioModule.recalculate(TransactionModule.getAll());
      SecurityModule.log(tx.type, `${tx.symbol} ${tx.shares}股 @${tx.price}`);
      _pendingTx = null;
      closeModal('modalTxConfirm');
      _clearTxForm();
      NotificationModule.toast(`${tx.type === 'buy' ? '買入' : '賣出'} ${tx.symbol} ${Utils.fmt(tx.shares)} 股已記錄`);
      _safeRender();
    } catch (err) {
      console.error('confirmTransaction error:', err);
      NotificationModule.toast('新增交易失敗，請稍後再試。資料未遺失。');
    }
  }

  function deleteTx(id) {
    if (!confirm('確定刪除此筆紀錄？')) return;
    try {
      TransactionModule.remove(id);
      PortfolioModule.recalculate(TransactionModule.getAll());
      SecurityModule.log('deleteTx', id);
      NotificationModule.toast('紀錄已刪除');
      _safeRender();
    } catch (err) {
      console.error('deleteTx error:', err);
      NotificationModule.toast('刪除失敗，請稍後再試。');
    }
  }

  // ─── Watchlist actions ────────────────────────────────────────────────────

  function addWatch() {
    try {
      const symbol  = document.getElementById('watchSymbol').value.trim().toUpperCase();
      const name    = document.getElementById('watchName').value.trim();
      const current = parseFloat(document.getElementById('watchCurrent').value) || 0;
      const target  = parseFloat(document.getElementById('watchTarget').value) || 0;
      const note    = document.getElementById('watchNote').value.trim();

      if (!symbol || !name) { NotificationModule.toast('請填寫股票代號與名稱'); return; }

      WatchlistModule.add({ symbol, name, currentPrice: current, targetPrice: target, note });
      ['watchSymbol','watchName','watchCurrent','watchTarget','watchNote'].forEach(id => {
        document.getElementById(id).value = '';
      });
      closeModal('modalWatch');
      NotificationModule.toast(`已加入觀察：${symbol} ${name}`);
      _safeRender();
    } catch (err) {
      console.error('addWatch error:', err);
      NotificationModule.toast('加入觀察失敗，請稍後再試。');
    }
  }

  // ─── Stock detail modal ───────────────────────────────────────────────────

  let _detailWatchId = null;

  function openStockDetail(id) {
    const w = WatchlistModule.getAll().find(x => String(x.id) === String(id));
    if (!w) return;
    _detailWatchId = id;
    const h = PortfolioModule.getHoldings().find(x => x.symbol === w.symbol);
    const score = AIModule.scoreStock(w);
    const sl    = AIModule.scoreLabel(score);
    const points = AIModule.analyzeStock(w, h);

    document.getElementById('stockDetailTitle').innerHTML =
      `${w.symbol} ${w.name} <span class="score-badge ${sl.cls}">${sl.label}</span>`;
    document.getElementById('stockDetailBody').innerHTML = `
      <div style="margin-bottom:12px">
        <div style="font-size:24px;font-weight:800;margin-bottom:2px">$${Utils.fmt(w.currentPrice || 0, 2)}</div>
        <div style="font-size:13px;color:var(--muted)">目標買入價：$${w.targetPrice ? Utils.fmt(w.targetPrice, 2) : '未設定'}</div>
      </div>
      <div style="margin-bottom:12px">
        <div style="font-size:12px;color:var(--muted);margin-bottom:6px">AI 評分</div>
        <div style="display:flex;align-items:center;gap:8px">
          <div style="flex:1;height:6px;border-radius:3px;background:var(--surface2)">
            <div style="width:${score}%;height:6px;border-radius:3px;background:${score>=80?'var(--green)':score>=50?'var(--yellow)':'var(--red)'}"></div>
          </div>
          <span style="font-size:13px;font-weight:700">${score}/100</span>
        </div>
      </div>
      ${points.map(p => `
        <div class="insight-item">
          <div class="insight-icon">${p.icon}</div>
          <div class="insight-text">${p.text}</div>
        </div>
      `).join('')}
    `;
    openModal('modalStockDetail');
  }

  function stockDetailBuy() {
    const w = _detailWatchId ? WatchlistModule.getAll().find(x => String(x.id) === String(_detailWatchId)) : null;
    closeModal('modalStockDetail');
    openModal('modalTx');
    if (w) {
      setTimeout(() => {
        document.getElementById('txSymbol').value = w.symbol;
        document.getElementById('txName').value   = w.name;
        if (w.currentPrice) document.getElementById('txPrice').value = w.currentPrice;
        document.getElementById('txType').dispatchEvent(new Event('change'));
        document.getElementById('txPrice').dispatchEvent(new Event('input'));
      }, 50);
    }
  }

  // ─── Search / filter ──────────────────────────────────────────────────────

  function filterWatchlist(q) {
    const cache = DashboardModule._watchCache;
    if (!cache) return;
    const lq   = q.trim().toLowerCase();
    const list = lq
      ? cache.list.filter(w => w.symbol.toLowerCase().includes(lq) || w.name.toLowerCase().includes(lq))
      : cache.list;
    const card = document.getElementById('watchlistRows');
    if (card) card.innerHTML = `<div class="card-title">觀察清單 <span style="font-size:11px;color:var(--muted)">點股票看分析 · 點價格更新</span></div>${cache.rows(list)}`;
  }

  function filterHistory(q) {
    const cache = DashboardModule._histCache;
    if (!cache) return;
    const lq   = q.trim().toLowerCase();
    const list = lq
      ? cache.list.filter(t =>
          (t.symbol || '').toLowerCase().includes(lq) ||
          (t.name   || '').toLowerCase().includes(lq) ||
          (t.date   || '').includes(lq))
      : cache.list;
    const card = document.getElementById('historyRows');
    if (card) card.innerHTML = `<div class="card-title">所有交易</div>${cache.rowFn(list) || '<div style="padding:16px;color:var(--muted);text-align:center">找不到符合的紀錄</div>'}`;
  }

  function removeWatch(id) {
    try {
      WatchlistModule.remove(id);
      NotificationModule.toast('已移除');
      _safeRender();
    } catch (err) {
      console.error('removeWatch error:', err);
      NotificationModule.toast('移除失敗，請稍後再試。');
    }
  }

  // ─── Update price ─────────────────────────────────────────────────────────

  function openUpdatePrice(id, ctx) {
    const items = ctx === 'portfolio' ? PortfolioModule.getHoldings() : WatchlistModule.getAll();
    const item  = items.find(i => String(i.id) === String(id));
    if (!item) return;
    document.getElementById('updatePriceTitle').textContent = `更新現價：${item.symbol} ${item.name}`;
    document.getElementById('updatePriceValue').value = item.currentPrice || '';
    document.getElementById('updatePriceId').value = id;
    document.getElementById('updatePriceCtx').value = ctx;
    openModal('modalUpdatePrice');
  }

  function confirmUpdatePrice() {
    try {
      const id    = document.getElementById('updatePriceId').value;
      const ctx   = document.getElementById('updatePriceCtx').value;
      const price = parseFloat(document.getElementById('updatePriceValue').value);
      if (!price || price <= 0) { NotificationModule.toast('請輸入有效價格'); return; }

      if (ctx === 'portfolio') {
        PortfolioModule.updateCurrentPrice(id, price);
      } else {
        WatchlistModule.updatePrice(id, price);
      }
      closeModal('modalUpdatePrice');
      NotificationModule.toast('現價已更新');
      _safeRender();
    } catch (err) {
      console.error('confirmUpdatePrice error:', err);
      NotificationModule.toast('更新失敗，請稍後再試。');
    }
  }

  // ─── Settings actions ─────────────────────────────────────────────────────

  function editSetting(key, label, current) {
    const val = prompt(label, current);
    if (val === null || val.trim() === '') return;
    const s = getSettings();
    if (key === 'investmentGoal') {
      s[key] = val.trim();
    } else {
      const num = parseFloat(val);
      if (isNaN(num) || num <= 0) { NotificationModule.toast('請輸入有效數字'); return; }
      s[key] = key === 'defaultFeeRate' ? num : Math.round(num);
    }
    saveSettings(s);
    DashboardModule.renderSettings({ settings: s });
    NotificationModule.toast('已更新');
  }

  function exportData() {
    try {
      const data = {
        exportedAt:   new Date().toISOString(),
        portfolio:    PortfolioModule.getHoldings(),
        watchlist:    WatchlistModule.getAll(),
        transactions: TransactionModule.getAll(),
        settings:     getSettings(),
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `investment-os-${Utils.today()}.json`;
      a.click();
      SecurityModule.log('exportData', Utils.today());
    } catch (err) {
      console.error('exportData error:', err);
      NotificationModule.toast('匯出失敗，請稍後再試。');
    }
  }

  function clearAllData() {
    if (!confirm('確定要清除所有資料？此操作無法復原。')) return;
    DB.clear();
    SecurityModule.log('clearAllData');
    NotificationModule.toast('資料已清除，重新載入中…');
    setTimeout(() => location.reload(), 1200);
  }

  // ─── Onboarding ────────────────────────────────────────────────────────────

  let _obStep    = 0;
  let _obGoal    = '';
  const OB_STEPS = 4; // 0=welcome, 1=goal, 2=budget, 3=ready

  function selectGoal(btn) {
    document.querySelectorAll('.goal-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    _obGoal = btn.dataset.goal;
    const isCustom = _obGoal === '自訂目標';
    document.getElementById('customGoalWrap').style.display = isCustom ? '' : 'none';
    if (isCustom) document.getElementById('ob_customGoal').focus();
  }

  function nextOnboard() {
    if (_obStep === 1) {
      // Validate goal selection
      if (!_obGoal) { NotificationModule.toast('請選擇你的投資目標'); return; }
      let goal = _obGoal;
      if (goal === '自訂目標') {
        goal = document.getElementById('ob_customGoal').value.trim();
        if (!goal) { NotificationModule.toast('請輸入你的自訂目標'); return; }
      }
      const s = getSettings();
      s.investmentGoal = goal;
      saveSettings(s);

      // Update ready screen to show chosen goal
      document.getElementById('ob_ready_desc').innerHTML =
        `目標：<strong>${goal}</strong><br><br>` +
        `接下來你可以：<br><br>` +
        `① 加入想追蹤的股票到觀察清單<br>` +
        `② 入金並新增第一筆買入交易<br>` +
        `③ 每天查看 Dashboard<br><br>` +
        `記住：每一筆交易都值得記錄原因。<br>` +
        `這是建立投資紀律最重要的一步。`;

    } else if (_obStep === 2) {
      const budget = parseFloat(document.getElementById('ob_budget').value);
      if (!budget || budget <= 0) { NotificationModule.toast('請輸入每月投資金額'); return; }
      const s = getSettings();
      s.monthlyBudget  = Math.round(budget);
      s.reminderDay    = parseInt(document.getElementById('ob_day').value);
      s.defaultFeeRate = parseFloat(document.getElementById('ob_fee').value) || 0.1425;
      saveSettings(s);
    }

    _obStep++;
    _updateObDots();
  }

  function _updateObDots() {
    for (let i = 0; i < OB_STEPS; i++) {
      const step = document.getElementById('os' + i);
      const dot  = document.getElementById('od' + i);
      if (step) step.classList.toggle('active', i === _obStep);
      if (dot)  dot.classList.toggle('active',  i === _obStep);
    }
  }

  function finishOnboard() {
    DB.set('ready', true);
    document.getElementById('onboarding').classList.remove('show');
    _safeRender();
  }

  // ─── Init ──────────────────────────────────────────────────────────────────

  function init() {
    // Header date
    const now  = new Date();
    const DAYS = ['日','一','二','三','四','五','六'];
    document.getElementById('headerDate').textContent =
      `${now.getFullYear()}.${String(now.getMonth()+1).padStart(2,'0')}.${String(now.getDate()).padStart(2,'0')} 週${DAYS[now.getDay()]}`;

    // Nav
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => navigate(item.dataset.page));
    });

    // FAB
    document.getElementById('fabBtn').addEventListener('click', () => {
      if (_page === 'watchlist') openModal('modalWatch');
      else openModal('modalTx');
    });

    // Fee auto-calc
    ['txShares','txPrice'].forEach(id => {
      document.getElementById(id).addEventListener('input', _autoCalcFee);
    });
    document.getElementById('txType').addEventListener('change', () => {
      _onTxTypeChange();
      _autoCalcFee();
    });

    // Modal backdrop close
    document.querySelectorAll('.modal-overlay').forEach(m => {
      m.addEventListener('click', e => { if (e.target === m) m.classList.remove('open'); });
    });

    // Global error boundary — prevent silent failures
    window.addEventListener('error', (e) => {
      console.error('Uncaught error:', e.error);
      NotificationModule.toast('發生錯誤，請重新整理頁面。資料已自動保存。');
    });

    // Start
    if (!DB.get('ready', false)) {
      document.getElementById('onboarding').classList.add('show');
    } else {
      _safeRender();
    }
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  function _onTxTypeChange() {
    const type   = document.getElementById('txType').value;
    const isCash = type === 'deposit' || type === 'withdraw';
    document.getElementById('txStockFields').style.display = isCash ? 'none' : '';
    document.getElementById('txCashFields').style.display  = isCash ? '' : 'none';
    document.getElementById('modalTxTitle').textContent =
      { buy:'買入交易', sell:'賣出交易', deposit:'入金', withdraw:'出金' }[type];
  }

  function _autoCalcFee() {
    const shares = parseFloat(document.getElementById('txShares').value) || 0;
    const price  = parseFloat(document.getElementById('txPrice').value) || 0;
    const type   = document.getElementById('txType').value;
    if (shares && price) {
      document.getElementById('txFee').value =
        Utils.calcFee(shares * price, getSettings().defaultFeeRate, type === 'sell');
    }
  }

  function _clearTxForm() {
    ['txSymbol','txName','txShares','txPrice','txFee','txCashAmt','txReason','txNote']
      .forEach(id => { document.getElementById(id).value = ''; });
  }

  return {
    init,
    navigate,
    submitTransaction,
    confirmTransaction,
    deleteTx,
    addWatch,
    removeWatch,
    openStockDetail,
    stockDetailBuy,
    filterWatchlist,
    filterHistory,
    openUpdatePrice,
    confirmUpdatePrice,
    editSetting,
    exportData,
    clearAllData,
    selectGoal,
    nextOnboard,
    finishOnboard,
  };
})();
