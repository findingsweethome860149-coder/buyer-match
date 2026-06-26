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
 */
const App = (() => {
  let _page = 'home';

  // ─── Settings ──────────────────────────────────────────────────────────────

  function getSettings() {
    return DB.get('settings', { monthlyBudget: 10000, reminderDay: 5, defaultFeeRate: 0.1425 });
  }

  function saveSettings(s) {
    DB.set('settings', s);
  }

  // ─── Navigation ────────────────────────────────────────────────────────────

  function navigate(page) {
    _page = page;
    document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === page));
    document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === 'page-' + page));
    _renderCurrentPage();
  }

  function _renderCurrentPage() {
    const txs      = TransactionModule.getAll();
    const holdings = PortfolioModule.getHoldings();
    const watchlist = WatchlistModule.getAll();
    const settings = getSettings();

    if (_page === 'home') {
      const aiResult = AIModule.analyze({ holdings, watchlist, settings, transactions: txs });
      DashboardModule.renderHome({
        aiResult,
        holdings,
        watchlistHits: WatchlistModule.getTargetHits(),
        settings,
      });
    } else if (_page === 'portfolio') {
      DashboardModule.renderPortfolio({
        holdings,
        cash:         PortfolioModule.getCashBalance(txs),
        unrealized:   PortfolioModule.getUnrealizedPnL(),
        unrealPct:    _unrealPct(holdings),
        realized:     PortfolioModule.getRealizedPnL(txs),
        totalAssets:  PortfolioModule.getTotalAssets(txs),
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

  function submitTransaction() {
    const type = document.getElementById('txType').value;
    const date = document.getElementById('txDate').value;
    if (!date) { NotificationModule.toast('請選擇日期'); return; }

    if (type === 'deposit' || type === 'withdraw') {
      const cashAmt = parseFloat(document.getElementById('txCashAmt').value);
      if (!cashAmt || cashAmt <= 0) { NotificationModule.toast('請輸入金額'); return; }
      const tx = {
        type, date, cashAmt,
        reason: document.getElementById('txReason').value.trim(),
        note:   document.getElementById('txNote').value.trim(),
      };
      TransactionModule.add(tx);
      SecurityModule.log(type, `$${cashAmt}`);
      _clearTxForm(); closeModal('modalTx');
      NotificationModule.toast(`${type === 'deposit' ? '入金' : '出金'} $${Utils.fmt(cashAmt)} 已記錄`);
      _renderCurrentPage();
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

    // Calculate realized P&L for sells
    let realizedPnL;
    if (type === 'sell') {
      const holdings = PortfolioModule.getHoldings();
      const h = holdings.find(x => x.symbol === symbol);
      if (h) realizedPnL = (price - h.avgCost) * shares - fee;
    }

    const tx = { type, date, symbol, name, shares, price, fee, reason, note };
    if (realizedPnL !== undefined) tx.realizedPnL = realizedPnL;
    TransactionModule.add(tx);

    // Portfolio recalculates from full transaction history
    PortfolioModule.recalculate(TransactionModule.getAll());

    SecurityModule.log(type, `${symbol} ${shares}股 @${price}`);
    _clearTxForm(); closeModal('modalTx');
    NotificationModule.toast(`${type === 'buy' ? '買入' : '賣出'} ${symbol} ${Utils.fmt(shares)} 股已記錄`);
    _renderCurrentPage();
  }

  function deleteTx(id) {
    if (!confirm('確定刪除此筆紀錄？')) return;
    TransactionModule.remove(id);
    PortfolioModule.recalculate(TransactionModule.getAll());
    SecurityModule.log('deleteTx', id);
    NotificationModule.toast('紀錄已刪除');
    _renderCurrentPage();
  }

  // ─── Watchlist actions ────────────────────────────────────────────────────

  function addWatch() {
    const symbol  = document.getElementById('watchSymbol').value.trim().toUpperCase();
    const name    = document.getElementById('watchName').value.trim();
    const current = parseFloat(document.getElementById('watchCurrent').value) || 0;
    const target  = parseFloat(document.getElementById('watchTarget').value) || 0;
    const note    = document.getElementById('watchNote').value.trim();

    if (!symbol || !name) { NotificationModule.toast('請填寫股票代號與名稱'); return; }

    WatchlistModule.add({ symbol, name, currentPrice: current, targetPrice: target, note });
    ['watchSymbol','watchName','watchCurrent','watchTarget','watchNote'].forEach(id => { document.getElementById(id).value = ''; });
    closeModal('modalWatch');
    NotificationModule.toast(`已加入觀察：${symbol} ${name}`);
    DashboardModule.renderWatchlist({ watchlist: WatchlistModule.getAll() });
  }

  function removeWatch(id) {
    WatchlistModule.remove(id);
    NotificationModule.toast('已移除');
    DashboardModule.renderWatchlist({ watchlist: WatchlistModule.getAll() });
  }

  // ─── Update price ─────────────────────────────────────────────────────────

  function openUpdatePrice(id, ctx) {
    const items = ctx === 'portfolio' ? PortfolioModule.getHoldings() : WatchlistModule.getAll();
    const item  = items.find(i => i.id === id || i.id == id);
    if (!item) return;
    document.getElementById('updatePriceTitle').textContent = `更新現價：${item.symbol} ${item.name}`;
    document.getElementById('updatePriceValue').value = item.currentPrice || '';
    document.getElementById('updatePriceId').value = id;
    document.getElementById('updatePriceCtx').value = ctx;
    openModal('modalUpdatePrice');
  }

  function confirmUpdatePrice() {
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
    _renderCurrentPage();
  }

  // ─── Settings actions ─────────────────────────────────────────────────────

  function editSetting(key, label, current) {
    const val = prompt(label, current);
    if (val === null) return;
    const num = parseFloat(val);
    if (isNaN(num) || num <= 0) { NotificationModule.toast('請輸入有效數字'); return; }
    const s = getSettings();
    s[key] = key === 'defaultFeeRate' ? num : Math.round(num);
    saveSettings(s);
    DashboardModule.renderSettings({ settings: s });
    NotificationModule.toast('已更新');
  }

  function exportData() {
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
  }

  function clearAllData() {
    if (!confirm('確定要清除所有資料？此操作無法復原。')) return;
    DB.clear();
    SecurityModule.log('clearAllData');
    NotificationModule.toast('資料已清除，重新載入中…');
    setTimeout(() => location.reload(), 1200);
  }

  // ─── Onboarding ────────────────────────────────────────────────────────────

  let _obStep = 0;

  function nextOnboard() {
    if (_obStep === 1) {
      const budget = parseFloat(document.getElementById('ob_budget').value);
      if (!budget || budget <= 0) { NotificationModule.toast('請輸入每月投資金額'); return; }
      const s = getSettings();
      s.monthlyBudget   = Math.round(budget);
      s.reminderDay     = parseInt(document.getElementById('ob_day').value);
      s.defaultFeeRate  = parseFloat(document.getElementById('ob_fee').value) || 0.1425;
      saveSettings(s);
    }
    _obStep++;
    _updateObDots();
  }

  function _updateObDots() {
    for (let i = 0; i < 3; i++) {
      document.getElementById('os' + i).classList.toggle('active', i === _obStep);
      document.getElementById('od' + i).classList.toggle('active', i === _obStep);
    }
  }

  function finishOnboard() {
    DB.set('ready', true);
    document.getElementById('onboarding').classList.remove('show');
    _renderCurrentPage();
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

    // Start
    if (!DB.get('ready', false)) {
      document.getElementById('onboarding').classList.add('show');
    } else {
      _renderCurrentPage();
    }
  }

  // ─── Private modal helpers ────────────────────────────────────────────────

  function _onTxTypeChange() {
    const type = document.getElementById('txType').value;
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
      const fee = Utils.calcFee(shares * price, getSettings().defaultFeeRate, type === 'sell');
      document.getElementById('txFee').value = fee;
    }
  }

  function _clearTxForm() {
    ['txSymbol','txName','txShares','txPrice','txFee','txCashAmt','txReason','txNote'].forEach(id => {
      document.getElementById(id).value = '';
    });
  }

  return {
    init,
    navigate,
    submitTransaction,
    deleteTx,
    addWatch,
    removeWatch,
    openUpdatePrice,
    confirmUpdatePrice,
    editSetting,
    exportData,
    clearAllData,
    nextOnboard,
    finishOnboard,
  };
})();
