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
    return DB.Settings.get();
  }

  function saveSettings(s) {
    DB.Settings.save(s);
  }

  // ─── Navigation ────────────────────────────────────────────────────────────

  function navigate(page) {
    if (page === 'settings' && SecurityModule.isPINEnabled()) {
      SecurityModule.prompt({
        title: '請輸入通關密碼進入設定',
        onSuccess: () => _doNavigate(page),
        onCancel:  () => {},
      });
      return;
    }
    _doNavigate(page);
  }

  function _doNavigate(page) {
    _page = page;
    document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === page));
    document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === 'page-' + page));
    _safeRender();
  }

  function _safeRender() {
    try {
      if (!LicenseModule.isActivated()) { _renderDemoPage(); return; }
      _renderCurrentPage();
    } catch {
      NotificationModule.toast('畫面更新失敗，請稍後再試。');
    }
  }

  function _renderCurrentPage() {
    const txs      = TransactionModule.getAll();
    const holdings = PortfolioModule.getHoldings();
    const watchlist = WatchlistModule.getAll();
    const settings = getSettings();

    if (_page === 'home') {
      const aiResult    = AIModule.analyze({ holdings, watchlist, settings, transactions: txs });
      const cash        = PortfolioModule.getCashBalance(txs);
      const totalAssets = PortfolioModule.getTotalAssets(txs);
      const unrealized  = PortfolioModule.getUnrealizedPnL();
      const realized    = PortfolioModule.getRealizedPnL(txs);
      const healthResult = holdings.length > 0
        ? AIModule.portfolioHealth(holdings, txs, totalAssets)
        : null;
      DashboardModule.renderHome({
        aiResult,
        holdings,
        watchlist,
        cash,
        totalAssets,
        settings,
        todayPnL:      PortfolioModule.getTodayPnL(),
        cumulativePnL: unrealized + realized,
        healthResult,
      });
    } else if (_page === 'portfolio') {
      // Latest thesis per stock from buy transactions
      const thesisMap = {};
      txs.filter(t => t.type === 'buy' && t.thesis)
         .sort((a, b) => a.date.localeCompare(b.date))
         .forEach(t => { thesisMap[t.stockId] = t.thesis; });
      DashboardModule.renderPortfolio({
        holdings,
        watchlist,
        transactions:   txs,
        cash:           PortfolioModule.getCashBalance(txs),
        unrealized:     PortfolioModule.getUnrealizedPnL(),
        unrealPct:      _unrealPct(holdings),
        realized:       PortfolioModule.getRealizedPnL(txs),
        totalAssets:    PortfolioModule.getTotalAssets(txs),
        todayPnL:       PortfolioModule.getTodayPnL(),
        thesisMap,
        dividendTotal:  PortfolioModule.getDividendTotal(),
        xirr:           PortfolioModule.getXIRR(txs),
      });
    } else if (_page === 'watchlist') {
      DashboardModule.renderWatchlist({ watchlist });
    } else if (_page === 'history') {
      DashboardModule.renderHistory({ transactions: txs, dividends: TransactionModule.getAllDividends() });
    } else if (_page === 'settings') {
      DashboardModule.renderSettings({ settings, pinEnabled: SecurityModule.isPINEnabled(), licenseActivated: LicenseModule.isActivated(), licenseKey: LicenseModule.storedKey() });
    }
  }

  function _unrealPct(holdings) {
    const cost = holdings.reduce((s, h) => s + h.quantity * h.avgCost, 0);
    const val  = holdings.reduce((s, h) => s + h.quantity * (h.currentPrice || h.avgCost), 0);
    return cost > 0 ? (val - cost) / cost * 100 : 0;
  }

  // ─── Transaction actions ───────────────────────────────────────────────────

  let _pendingTx = null; // staged transaction pending confirm

  function submitTransaction() {
    if (!LicenseModule.isActivated()) { _promptLicense(); return; }
    try {
      const type = document.getElementById('txType').value;
      const date = document.getElementById('txDate').value;
      if (!date) { NotificationModule.toast('請選擇日期'); return; }

      const LABEL = { buy:'買入', sell:'賣出', deposit:'入金', withdraw:'出金', dividend:'股利', stock_dividend:'股票股利' };

      if (type === 'deposit' || type === 'withdraw') {
        const cashAmt = parseFloat(document.getElementById('txCashAmt').value);
        if (!cashAmt || cashAmt <= 0) { NotificationModule.toast('請輸入金額'); return; }
        _pendingTx = {
          type, date, cashAmt,
          thesis: _readThesis(),
          memo:   document.getElementById('txNote').value.trim(),
        };
        document.getElementById('txConfirmBody').innerHTML = `
          <div class="insight-item"><div class="insight-icon">${type === 'deposit' ? '💰' : '💸'}</div>
          <div class="insight-text"><strong>${LABEL[type]}</strong><br>金額：$${Utils.fmt(cashAmt)}<br>日期：${date}</div></div>`;
        closeModal('modalTx');
        openModal('modalTxConfirm');
        return;
      }

      // Dividend flow
      if (type === 'dividend' || type === 'stock_dividend') {
        const stockId   = document.getElementById('txSymbol').value.trim().toUpperCase();
        const stockName = document.getElementById('txName').value.trim();
        const memo      = document.getElementById('txNote').value.trim();
        if (!stockId) { NotificationModule.toast('請填寫股票代號'); return; }
        let cashAmount = 0, stockShares = 0;
        if (type === 'dividend') {
          cashAmount = parseFloat(document.getElementById('txDivCash').value) || 0;
          if (cashAmount <= 0) { NotificationModule.toast('請輸入現金股利金額'); return; }
        } else {
          stockShares = parseFloat(document.getElementById('txDivShares').value) || 0;
          if (stockShares <= 0) { NotificationModule.toast('請輸入股票股利股數'); return; }
        }
        _pendingTx = { type, date, stockId, stockName, cashAmount, stockShares, memo };
        const parts = [];
        if (cashAmount)  parts.push(`現金股利 $${Utils.fmt(cashAmount)}`);
        if (stockShares) parts.push(`股票股利 ${Utils.fmt(stockShares, 3)} 股`);
        document.getElementById('txConfirmBody').innerHTML = `
          <div class="insight-item"><div class="insight-icon">💵</div>
          <div class="insight-text"><strong>股利 ${stockId} ${stockName}</strong><br>${parts.join('、')}<br>日期：${date}</div></div>`;
        closeModal('modalTx');
        openModal('modalTxConfirm');
        return;
      }

      const stockId   = document.getElementById('txSymbol').value.trim().toUpperCase();
      const stockName = document.getElementById('txName').value.trim();
      const quantity  = parseFloat(document.getElementById('txShares').value);
      const price     = parseFloat(document.getElementById('txPrice').value);
      const fee       = parseFloat(document.getElementById('txFee').value) || 0;
      const thesis    = _readThesis();
      const memo      = document.getElementById('txNote').value.trim();

      if (!stockId || !stockName) { NotificationModule.toast('請填寫股票代號與名稱'); return; }
      if (!quantity || quantity <= 0) { NotificationModule.toast('請填寫股數'); return; }
      if (!price    || price    <= 0) { NotificationModule.toast('請填寫成交價格'); return; }

      if (type === 'sell') {
        const holding = PortfolioModule.getHoldings().find(x => x.stockId === stockId);
        if (!holding) { NotificationModule.toast(`${stockId} 不在持股中，無法賣出`); return; }
        if (quantity > holding.quantity + 0.0001) {
          NotificationModule.toast(`持有 ${Utils.fmt(holding.quantity, 3)} 股，不能賣出 ${Utils.fmt(quantity, 3)} 股`);
          return;
        }
      }

      const tax   = type === 'sell' ? Math.round(quantity * price * TAIWAN_SECURITIES_TAX) : 0;
      const total = type === 'buy'
        ? quantity * price + fee
        : quantity * price - fee - tax;

      _pendingTx = { type, date, stockId, stockName, quantity, price, fee, tax, total, thesis, memo };

      document.getElementById('txConfirmBody').innerHTML = `
        <div class="insight-item"><div class="insight-icon">${type === 'buy' ? '📈' : '📉'}</div>
        <div class="insight-text">
          <strong>${LABEL[type]} ${stockId} ${stockName}</strong><br>
          股數：${Utils.fmt(quantity)} 股 × $${Utils.fmt(price, 2)}<br>
          手續費：$${Utils.fmt(fee)}<br>
          ${type === 'sell' ? `證交稅：$${Utils.fmt(tax)}<br>` : ''}
          ${type === 'buy' ? '合計支出' : '合計收入'}：<strong>$${Utils.fmt(Math.abs(total))}</strong><br>
          日期：${date}
          ${thesis ? `<br>理由：${thesis}` : ''}
        </div></div>`;
      closeModal('modalTx');
      openModal('modalTxConfirm');
    } catch {
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

      if (tx.type === 'dividend' || tx.type === 'stock_dividend') {
        const div = TransactionModule.addDividend({
          stockId:     tx.stockId,
          stockName:   tx.stockName,
          date:        tx.date,
          cashAmount:  tx.cashAmount || 0,
          stockShares: tx.stockShares || 0,
          memo:        tx.memo,
        });
        // Stock dividends increase holdings via recalculate
        if (tx.stockShares > 0) {
          // Add as a synthetic 0-price buy to FIFO pool
          TransactionModule.add({
            type: 'buy', date: tx.date,
            stockId: tx.stockId, stockName: tx.stockName,
            quantity: tx.stockShares, price: 0, fee: 0, tax: 0, total: 0,
            thesis: '股票股利', memo: `股票股利 ${tx.stockShares}股`,
          });
          PortfolioModule.recalculate(TransactionModule.getAll());
        }
        SecurityModule.log('dividend', `${tx.stockId} 股利`);
        _pendingTx = null;
        closeModal('modalTxConfirm');
        _clearTxForm();
        const parts = [];
        if (tx.cashAmount)  parts.push(`現金股利 $${Utils.fmt(tx.cashAmount)}`);
        if (tx.stockShares) parts.push(`股票股利 ${Utils.fmt(tx.stockShares, 3)} 股`);
        NotificationModule.toast(`${tx.stockId} ${parts.join('、')} 已記錄`);
        _safeRender();
        return;
      }

      // Calculate realized P&L for sells
      if (tx.type === 'sell') {
        const h = PortfolioModule.getHoldings().find(x => x.stockId === tx.stockId);
        if (h) tx.realizedPnL = (tx.price - h.avgCost) * tx.quantity - tx.fee - (tx.tax || 0);
      }

      TransactionModule.add(tx);
      PortfolioModule.recalculate(TransactionModule.getAll());
      SecurityModule.log(tx.type, `${tx.stockId} ${tx.quantity}股 @${tx.price}`);
      _pendingTx = null;
      closeModal('modalTxConfirm');
      _clearTxForm();
      NotificationModule.toast(`${tx.type === 'buy' ? '買入' : '賣出'} ${tx.stockId} ${Utils.fmt(tx.quantity)} 股已記錄`);
      _safeRender();
    } catch {
      NotificationModule.toast('新增交易失敗，請稍後再試。資料未遺失。');
    }
  }

  function deleteDividend(id) {
    if (!confirm('確定刪除此筆股利記錄？')) return;
    try {
      TransactionModule.removeDividend(id);
      SecurityModule.log('deleteDividend', id);
      NotificationModule.toast('股利記錄已刪除');
      _safeRender();
    } catch {
      NotificationModule.toast('刪除失敗，請稍後再試。');
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
    } catch {
      NotificationModule.toast('刪除失敗，請稍後再試。');
    }
  }

  // ─── Watchlist actions ────────────────────────────────────────────────────

  function addWatch() {
    if (!LicenseModule.isActivated()) { _promptLicense(); return; }
    try {
      const stockId   = document.getElementById('watchSymbol').value.trim().toUpperCase();
      const stockName = document.getElementById('watchName').value.trim();
      const current   = parseFloat(document.getElementById('watchCurrent').value) || 0;
      const target    = parseFloat(document.getElementById('watchTarget').value) || 0;
      const memo      = document.getElementById('watchNote').value.trim();

      if (!stockId || !stockName) { NotificationModule.toast('請填寫股票代號與名稱'); return; }

      const duplicate = WatchlistModule.getAll().find(w => w.stockId === stockId);
      if (duplicate) { NotificationModule.toast(`${stockId} 已在觀察清單中`); return; }

      const alertHigh = parseFloat(document.getElementById('watchAlertHigh').value) || 0;
      const alertLow  = parseFloat(document.getElementById('watchAlertLow').value)  || 0;
      WatchlistModule.add({ stockId, stockName, currentPrice: current, targetPrice: target, alertHigh, alertLow, memo });
      ['watchSymbol','watchName','watchCurrent','watchTarget','watchAlertHigh','watchAlertLow','watchNote'].forEach(id => {
        document.getElementById(id).value = '';
      });
      closeModal('modalWatch');
      NotificationModule.toast(`已加入觀察：${stockId} ${stockName}`);
      _safeRender();
    } catch {
      NotificationModule.toast('加入觀察失敗，請稍後再試。');
    }
  }

  // ─── Stock detail modal ───────────────────────────────────────────────────

  let _detailWatchId = null;

  function openStockDetail(id) {
    const w = WatchlistModule.getAll().find(x => String(x.id) === String(id));
    if (!w) return;
    _detailWatchId = id;
    const h      = PortfolioModule.getHoldings().find(x => x.stockId === w.stockId);
    const score  = AIModule.scoreStock(w);
    const sl     = AIModule.scoreLabel(score);
    const points = AIModule.analyzeStock(w, h);

    document.getElementById('stockDetailTitle').innerHTML =
      `${w.stockId} ${w.stockName} <span class="score-badge ${sl.cls}">${sl.label}</span>`;
    const scoreColor = score >= 70 ? 'var(--green)' : score >= 50 ? 'var(--yellow)' : 'var(--red)';
    document.getElementById('stockDetailBody').innerHTML = `
      <div style="margin-bottom:12px">
        <div style="font-size:24px;font-weight:800;margin-bottom:2px">$${Utils.fmt(w.currentPrice || 0, 2)}</div>
        <div style="font-size:13px;color:var(--muted)">目標買入價：$${w.targetPrice ? Utils.fmt(w.targetPrice, 2) : '未設定'}</div>
      </div>
      <div style="margin-bottom:12px;padding:10px;background:var(--surface2);border-radius:8px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <span style="font-size:12px;color:var(--muted)">AI 評分</span>
          <span style="font-size:18px;color:${scoreColor}">${sl.stars}</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <div style="flex:1;height:6px;border-radius:3px;background:var(--surface)">
            <div style="width:${score}%;height:6px;border-radius:3px;background:${scoreColor}"></div>
          </div>
          <span style="font-size:14px;font-weight:700;color:${scoreColor}">${score}/100</span>
        </div>
        <div style="font-size:11px;color:var(--muted);margin-top:4px">${sl.label} — ${_scoreTip(sl.tier)}</div>
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
        document.getElementById('txSymbol').value = w.stockId;
        document.getElementById('txName').value   = w.stockName;
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
      ? cache.list.filter(w => w.stockId.toLowerCase().includes(lq) || w.stockName.toLowerCase().includes(lq))
      : cache.list;
    const card = document.getElementById('watchlistRows');
    if (card) card.innerHTML = `<div class="card-title">觀察清單 <span style="font-size:11px;color:var(--muted)">點股票看分析 · 點價格更新</span></div>${cache.rows(list)}`;
  }

  function filterHistory(q) {
    _applyHistoryFilters();
  }

  function filterHistoryType(type) {
    document.querySelectorAll('.hist-filter-btn').forEach(b =>
      b.classList.toggle('selected', b.dataset.type === type));
    _applyHistoryFilters();
  }

  function sortHistory(by) {
    document.querySelectorAll('.hist-sort-btn').forEach(b =>
      b.classList.toggle('selected', b.dataset.sort === by));
    _applyHistoryFilters();
  }

  function _applyHistoryFilters() {
    const cache = DashboardModule._histCache;
    if (!cache) return;
    const q    = (document.getElementById('historySearch')?.value || '').trim().toLowerCase();
    const type = document.querySelector('.hist-filter-btn.selected')?.dataset.type || 'all';
    const sort = document.querySelector('.hist-sort-btn.selected')?.dataset.sort || 'date-desc';

    let list    = cache.list;
    let divList = cache.divList || [];

    if (q) {
      list    = list.filter(t =>
        (t.stockId   || '').toLowerCase().includes(q) ||
        (t.stockName || '').toLowerCase().includes(q) ||
        (t.date      || '').includes(q));
      divList = divList.filter(d =>
        (d.stockId   || '').toLowerCase().includes(q) ||
        (d.stockName || '').toLowerCase().includes(q) ||
        (d.date      || '').includes(q));
    }

    if (type === 'dividend') {
      list = [];
    } else if (type !== 'all') {
      list    = list.filter(t => t.type === type);
      divList = [];
    }

    if (sort === 'date-asc')  list = [...list].sort((a, b) => a.date.localeCompare(b.date));
    else if (sort === 'date-desc') list = [...list].sort((a, b) => b.date.localeCompare(a.date));
    else if (sort === 'amt-desc')  list = [...list].sort((a, b) => (b.quantity*b.price||b.cashAmt||0) - (a.quantity*a.price||a.cashAmt||0));

    const divRows = cache.divRowFn ? cache.divRowFn(divList) : '';
    const card = document.getElementById('historyRows');
    if (card) card.innerHTML = `<div class="card-title">所有交易</div>${cache.rowFn(list)}${divRows ? `<div style="border-top:1px solid var(--border);margin:4px 0 8px"></div>${divRows}` : ''}${!cache.rowFn(list) && !divRows ? '<div style="padding:16px;color:var(--muted);text-align:center">找不到符合的紀錄</div>' : ''}`;
  }

  function removeWatch(id) {
    try {
      WatchlistModule.remove(id);
      NotificationModule.toast('已移除');
      _safeRender();
    } catch {
      NotificationModule.toast('移除失敗，請稍後再試。');
    }
  }

  // ─── Update price ─────────────────────────────────────────────────────────

  function openUpdatePrice(id, ctx) {
    const items = ctx === 'portfolio' ? PortfolioModule.getHoldings() : WatchlistModule.getAll();
    const item  = items.find(i => String(i.id) === String(id));
    if (!item) return;
    document.getElementById('updatePriceTitle').textContent = `更新現價：${item.stockId || item.id} ${item.stockName || ''}`;
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
    } catch {
      NotificationModule.toast('更新失敗，請稍後再試。');
    }
  }

  // ─── Price refresh + volume anomaly detection ─────────────────────────────

  // volume history: { stockId: [{ time, volume }] }  (ring buffer, max 20 samples)
  const _volHistory = {};

  async function refreshPrices() {

    const btn = document.getElementById('refreshPriceBtn');
    if (btn) btn.classList.add('spinning');
    _setPriceStatus('更新中…');

    try {
      const holdings  = PortfolioModule.getHoldings();
      const watchlist = WatchlistModule.getAll();
      const allIds    = [...new Set([
        ...holdings.map(h => h.stockId),
        ...watchlist.map(w => w.stockId),
      ])];

      const prices = await PriceModule.fetchPrices(allIds);
      if (!prices || Object.keys(prices).length === 0) {
        _setPriceStatus('無法取得股價，請確認網路連線');
        return;
      }

      let updated = 0;
      holdings.forEach(h => {
        const p = prices[h.stockId];
        if (p && p.price) { PortfolioModule.updateCurrentPrice(h.stockId, p.price); updated++; }
      });
      watchlist.forEach(w => {
        const p = prices[w.stockId];
        if (p && p.price) { WatchlistModule.updatePrice(w.id, p.price); updated++; }
      });

      // Volume anomaly detection (only during market hours)
      if (PriceModule.isMarketOpen()) {
        _checkVolumeAnomaly(prices);
        _checkPriceAlerts(prices, watchlist);
        _refreshTaiex();
      }

      const now     = new Date();
      const timeStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
      const market  = PriceModule.isMarketOpen() ? '盤中' : '盤後';
      _setPriceStatus(updated > 0
        ? `${market} · 已更新 ${updated} 檔 · ${timeStr}`
        : `無法取得股價資料 · ${timeStr}`);

      if (updated > 0) _safeRender();
    } catch {
      _setPriceStatus('股價更新失敗');
    } finally {
      if (btn) btn.classList.remove('spinning');
    }
  }

  function _checkVolumeAnomaly(prices) {
    const now = Date.now();
    Object.entries(prices).forEach(([id, p]) => {
      if (!p.volume) return;
      if (!_volHistory[id]) _volHistory[id] = [];
      const hist = _volHistory[id];
      hist.push({ time: now, volume: p.volume });
      if (hist.length > 20) hist.shift();
      if (hist.length < 3) return;

      // delta = volume increment in last interval
      const delta = hist[hist.length - 1].volume - hist[hist.length - 2].volume;
      if (delta <= 0) return;

      // average delta over earlier samples (exclude last 2)
      const older = hist.slice(0, -2);
      if (older.length < 2) return;
      const deltas = [];
      for (let i = 1; i < older.length; i++) {
        const d = older[i].volume - older[i - 1].volume;
        if (d > 0) deltas.push(d);
      }
      if (deltas.length === 0) return;
      const avgDelta = deltas.reduce((s, d) => s + d, 0) / deltas.length;

      if (delta >= avgDelta * 3) {
        const pct  = Math.round(delta / avgDelta);
        const name = p.name || id;
        _notify(
          `⚡ 異常成交量：${id} ${name}`,
          `本次成交量是均量的 ${pct} 倍（${(delta/1000).toFixed(1)}千張）\n現價 $${p.price}，請留意進出場時機`
        );
      }
    });
  }

  function _checkPriceAlerts(prices, watchlist) {
    watchlist.forEach(w => {
      const p = prices[w.stockId];
      if (!p || !p.price) return;
      if (w.alertHigh && p.price >= w.alertHigh) {
        _notify(`📈 突破警示：${w.stockId} ${w.stockName}`, `現價 $${p.price} 突破警示上限 $${w.alertHigh}，考慮加碼或觀望`);
      }
      if (w.alertLow && p.price <= w.alertLow) {
        _notify(`📉 跌破警示：${w.stockId} ${w.stockName}`, `現價 $${p.price} 跌破警示下限 $${w.alertLow}，考慮退場`);
      }
    });
  }

  // Throttle notifications: same stock same message → max once per 5 min
  const _notifySent = {};
  function _notify(title, body) {
    const key = title;
    const now = Date.now();
    if (_notifySent[key] && now - _notifySent[key] < 5 * 60 * 1000) return;
    _notifySent[key] = now;
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body, icon: './icons/icon-192.png' });
    } else {
      NotificationModule.toast(title);
    }
  }

  async function _refreshTaiex() {
    try {
      const d   = await PriceModule.fetchTaiex();
      const bar = document.getElementById('taiexBar');
      if (!bar || !d || !d.price) return;
      const cls  = d.change >= 0 ? 'positive' : 'negative';
      const sign = d.change >= 0 ? '+' : '';
      bar.style.display = '';
      bar.innerHTML = `<span style="color:var(--muted)">加權指數</span>
        <strong style="margin:0 6px">${d.price.toLocaleString()}</strong>
        <span class="${cls}">${sign}${d.change} (${sign}${d.changePct}%)</span>`;
    } catch { /* API unavailable */ }
  }

  // Auto-refresh every 60s during market hours (works with or without server)
  function _startAutoRefresh() {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
    setInterval(() => {
      if (PriceModule.isMarketOpen()) refreshPrices();
    }, 60 * 1000);
    // Also refresh TAIEX on start if market open
    if (PriceModule.isMarketOpen()) _refreshTaiex();
  }

  function _setPriceStatus(text) {
    const bar = document.getElementById('priceStatusBar');
    if (!bar) return;
    bar.textContent = text;
    bar.style.display = text ? '' : 'none';
  }

  // ─── Settings actions ─────────────────────────────────────────────────────

  function toggleDarkMode(isDark) {
    document.body.classList.toggle('light', !isDark);
    const s = getSettings();
    s.darkMode = isDark;
    saveSettings(s);
  }

  function _applyDarkMode() {
    const s = getSettings();
    document.body.classList.toggle('light', s.darkMode === false);
  }

  function toggleAiBrief() {
    const el = document.getElementById('aiBriefDetail');
    if (!el) return;
    const open = el.style.display === 'none';
    el.style.display = open ? 'block' : 'none';
    const btn = el.previousElementSibling?.querySelector('span:last-child');
    if (btn) btn.textContent = open ? '收起 ‹' : '查看原因 ›';
  }

  function viewHoldingHistory(stockId) {
    navigate('history');
    setTimeout(() => {
      const input = document.getElementById('historySearch');
      if (input) { input.value = stockId; filterHistory(stockId); }
    }, 100);
  }

  function editSetting(key, label, current) {
    if (!LicenseModule.isActivated()) { _promptLicense(); return; }
    const val = prompt(label, current);
    if (val === null || val.trim() === '') return;
    const s = getSettings();
    if (key === 'investmentGoal') {
      s[key] = val.trim();
    } else if (key === 'goalAmount') {
      const num = parseFloat(val);
      s[key] = (!isNaN(num) && num > 0) ? num : 0;
    } else {
      const num = parseFloat(val);
      if (isNaN(num) || num <= 0) { NotificationModule.toast('請輸入有效數字'); return; }
      s[key] = key === 'defaultFeeRate' ? num : Math.round(num);
    }
    saveSettings(s);
    DashboardModule.renderSettings({ settings: s, pinEnabled: SecurityModule.isPINEnabled(), licenseActivated: LicenseModule.isActivated(), licenseKey: LicenseModule.storedKey() });
    NotificationModule.toast('已更新');
  }

  function saveLineServerUrl() {
    const input = document.getElementById('lineServerUrl');
    if (!input) return;
    const url = input.value.trim().replace(/\/$/, '');
    const btn = document.getElementById('refreshPriceBtn');
    if (url) {
      localStorage.setItem('aios_line_server_url', url);
      if (btn) btn.style.display = '';
      NotificationModule.toast('伺服器網址已儲存，股價更新與 LINE 同步已啟動');
      _startLineSyncPoll();
      refreshPrices();
    } else {
      localStorage.removeItem('aios_line_server_url');
      if (btn) btn.style.display = 'none';
      _setPriceStatus('');
      NotificationModule.toast('伺服器網址已清除');
    }
  }

  function exportCSV(type) {
    try {
      const pad = n => String(n).padStart(2, '0');
      const now = new Date();
      const ts  = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}`;
      let rows, filename;

      if (type === 'transactions') {
        rows = [Utils.csvRow(['日期','類型','股票代號','股票名稱','股數','成交價','手續費','證交稅','已實現損益','入出金','備註'])];
        const LABEL = { buy:'買入', sell:'賣出', deposit:'入金', withdraw:'出金' };
        TransactionModule.getAll().forEach(tx => {
          rows.push(Utils.csvRow([
            tx.date,
            LABEL[tx.type] || tx.type,
            tx.stockId    || '',
            tx.stockName  || '',
            tx.quantity   != null ? tx.quantity   : '',
            tx.price      != null ? tx.price      : '',
            tx.fee        != null ? tx.fee        : '',
            tx.tax        != null ? tx.tax        : '',
            tx.realizedPnL != null ? tx.realizedPnL : '',
            tx.cashAmt    != null ? tx.cashAmt    : '',
            tx.memo       || '',
          ]));
        });
        filename = `AIOS_交易紀錄_${ts}.csv`;
      } else if (type === 'dividends') {
        rows = [Utils.csvRow(['日期','股票代號','股票名稱','現金股利','股票股利(股)','備註'])];
        DB.Dividends.getAll().forEach(d => {
          rows.push(Utils.csvRow([d.date, d.stockId, d.stockName || '', d.cashAmount || '', d.stockShares || '', d.memo || '']));
        });
        filename = `AIOS_股利紀錄_${ts}.csv`;
      } else if (type === 'holdings') {
        rows = [Utils.csvRow(['股票代號','股票名稱','持股數','平均成本','現價','市值','未實現損益','未實現損益%'])];
        PortfolioModule.getHoldings().forEach(h => {
          const mv  = h.quantity * (h.currentPrice || h.avgCost);
          const pnl = mv - h.quantity * h.avgCost;
          const pct = h.avgCost > 0 ? (pnl / (h.quantity * h.avgCost) * 100).toFixed(2) : '';
          rows.push(Utils.csvRow([h.stockId, h.stockName, h.quantity, h.avgCost.toFixed(2), h.currentPrice || '', mv.toFixed(0), pnl.toFixed(0), pct]));
        });
        filename = `AIOS_持股損益_${ts}.csv`;
      } else {
        return;
      }

      const bom  = '﻿'; // UTF-8 BOM so Excel opens correctly
      const blob = new Blob([bom + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const a    = document.createElement('a');
      a.href     = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      SecurityModule.log('exportCSV', type);
      NotificationModule.toast('CSV 已下載');
    } catch {
      NotificationModule.toast('匯出失敗，請稍後再試。');
    }
  }

  function exportData() {
    try {
      const data = DB.exportAll();
      const now  = new Date();
      const pad  = n => String(n).padStart(2, '0');
      const ts   = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const a    = document.createElement('a');
      a.href     = URL.createObjectURL(blob);
      a.download = `AIInvestmentOS_Backup_${ts}.json`;
      a.click();
      SecurityModule.log('exportData', Utils.today());
      NotificationModule.toast('備份已下載');
    } catch {
      NotificationModule.toast('匯出失敗，請稍後再試。');
    }
  }

  function importData() {
    if (!LicenseModule.isActivated()) { _promptLicense(); return; }
    const _doImport = () => {
      try {
        const input = document.createElement('input');
        input.type   = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
          const file = e.target.files[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onerror = () => { NotificationModule.toast('備份檔讀取失敗，請重試。'); };
          reader.onload = (ev) => {
            try {
              let data;
              try { data = JSON.parse(ev.target.result); }
              catch { NotificationModule.toast('備份檔格式不正確。'); return; }
              DB.importAll(data);
              PortfolioModule.recalculate(DB.Transactions.getAll());
              SecurityModule.log('importData', file.name);
              NotificationModule.toast('資料匯入成功，重新載入中…');
              setTimeout(() => location.reload(), 1200);
            } catch (e) {
              NotificationModule.toast(e.message || '備份檔格式不正確。');
            }
          };
          reader.readAsText(file);
        };
        input.click();
      } catch {
        NotificationModule.toast('匯入失敗，請稍後再試。');
      }
    };
    if (SecurityModule.isPINEnabled()) {
      SecurityModule.prompt({ title: '請輸入通關密碼確認匯入', onSuccess: _doImport });
    } else {
      _doImport();
    }
  }

  // ── PIN management ────────────────────────────────────────────────────────

  function setupPIN() {
    SecurityModule.promptSetNew({
      onSuccess: () => {
        NotificationModule.toast('通關密碼已設定，下次開啟 App 將要求輸入');
        DashboardModule.renderSettings({ settings: DB.Settings.get(), pinEnabled: SecurityModule.isPINEnabled(), licenseActivated: LicenseModule.isActivated(), licenseKey: LicenseModule.storedKey() });
        SecurityModule.log('setupPIN');
      },
    });
  }

  function changePIN() {
    SecurityModule.prompt({
      title: '輸入目前通關密碼',
      onSuccess: () => {
        SecurityModule.promptSetNew({
          onSuccess: () => {
            NotificationModule.toast('通關密碼已更新');
            DashboardModule.renderSettings({ settings: DB.Settings.get(), pinEnabled: SecurityModule.isPINEnabled(), licenseActivated: LicenseModule.isActivated(), licenseKey: LicenseModule.storedKey() });
          },
        });
      },
    });
  }

  function disablePIN() {
    SecurityModule.prompt({
      title: '輸入通關密碼確認關閉',
      onSuccess: () => {
        SecurityModule.disablePIN();
        NotificationModule.toast('密碼保護已關閉');
        DashboardModule.renderSettings({ settings: DB.Settings.get(), pinEnabled: SecurityModule.isPINEnabled(), licenseActivated: LicenseModule.isActivated(), licenseKey: LicenseModule.storedKey() });
      },
    });
  }

  function clearAllData() {
    if (!LicenseModule.isActivated()) { _promptLicense(); return; }
    const _doDelete = () => {
      if (!confirm('確定要清除所有資料？此操作無法復原。')) return;
      try {
        DB.clear();
        SecurityModule.log('clearAllData');
        NotificationModule.toast('資料已清除，重新載入中…');
        setTimeout(() => location.reload(), 1200);
      } catch {
        NotificationModule.toast('清除失敗，請稍後再試。');
      }
    };
    if (SecurityModule.isPINEnabled()) {
      SecurityModule.prompt({ title: '請輸入 PIN 確認清除資料', onSuccess: _doDelete });
    } else {
      _doDelete();
    }
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
      if (!_obGoal) { NotificationModule.toast('請選擇你的投資目標'); return; }
      let goal = _obGoal;
      if (goal === '自訂目標') {
        goal = document.getElementById('ob_customGoal').value.trim();
        if (!goal) { NotificationModule.toast('請輸入你的自訂目標'); return; }
      }
      const s = getSettings();
      s.investmentGoal = goal;
      saveSettings(s);

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
      s.defaultFeeRate = parseFloat(document.getElementById('ob_fee').value) || DB.Settings.DEFAULT_FEE_RATE;
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
    _applyDarkMode();

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

    // Global error boundary
    window.addEventListener('error', (e) => {
      NotificationModule.toast('發生錯誤，請重新整理頁面。資料已自動保存。');
    });

    // Always show price refresh button
    const btn = document.getElementById('refreshPriceBtn');
    if (btn) btn.style.display = '';

    // Auto price refresh + volume monitoring during market hours
    _startAutoRefresh();

    // Load stock list for code↔name auto-fill
    PriceModule.loadStockList();

    // Auto-fill: code field → name field on Enter
    [['txSymbol','txName'], ['watchSymbol','watchName']].forEach(([codeId, nameId]) => {
      const codeEl = document.getElementById(codeId);
      const nameEl = document.getElementById(nameId);
      if (codeEl && nameEl) {
        codeEl.addEventListener('keydown', e => {
          if (e.key !== 'Enter') return;
          const name = PriceModule.lookupByCode(codeEl.value.trim());
          if (name) { nameEl.value = name; nameEl.focus(); }
        });
        nameEl.addEventListener('keydown', e => {
          if (e.key !== 'Enter') return;
          const code = PriceModule.lookupByName(nameEl.value.trim());
          if (code) { codeEl.value = code; codeEl.focus(); }
        });
      }
    });

    // LINE sync polling (every 15s, only if server is configured)
    _startLineSyncPoll();

    // Start — check data integrity first
    if (!_checkDataIntegrity()) {
      _showRecoveryScreen();
      return;
    }

    // License / Demo mode
    if (!LicenseModule.isActivated()) {
      _enterDemoMode();
      return;
    }

    if (!DB.get('ready', false)) {
      document.getElementById('onboarding').classList.add('show');
    } else if (SecurityModule.isPINEnabled()) {
      SecurityModule.prompt({
        title:       '輸入通關密碼解鎖',
        allowCancel: false,
        onSuccess:   () => _safeRender(),
      });
    } else {
      _safeRender();
    }
  }

  // ─── License / Demo Mode ─────────────────────────────────────────────────

  function _promptLicense() {
    NotificationModule.toast('體驗模式：請先輸入授權碼啟用完整版');
    openLicenseModal();
  }

  function openLicenseModal() {
    document.getElementById('licenseError').textContent = '';
    document.getElementById('licenseKeyInput').value = '';
    openModal('modalLicense');
  }

  function submitLicenseKey() {
    const key = document.getElementById('licenseKeyInput').value.trim();
    if (LicenseModule.activate(key)) {
      closeModal('modalLicense');
      NotificationModule.toast('授權成功！歡迎使用完整版');
      // Exit demo mode: reload to start fresh with real data
      setTimeout(() => location.reload(), 800);
    } else {
      document.getElementById('licenseError').textContent = '授權碼無效，請確認後重新輸入';
    }
  }

  function _enterDemoMode() {
    const banner = document.getElementById('demoBanner');
    if (banner) banner.style.display = '';
    _renderDemoPage();
  }

  function _renderDemoPage() {
    const txs      = LicenseModule.DEMO_TRANSACTIONS;
    const watchlist = LicenseModule.DEMO_WATCHLIST;
    const settings = getSettings();

    // Compute simple demo holdings (buy - sell)
    const holdMap = {};
    txs.filter(t => t.type === 'buy' || t.type === 'sell').forEach(t => {
      if (!holdMap[t.stockId]) holdMap[t.stockId] = { stockId: t.stockId, stockName: t.stockName, quantity: 0, cost: 0 };
      const sign = t.type === 'buy' ? 1 : -1;
      holdMap[t.stockId].quantity += sign * t.quantity;
      holdMap[t.stockId].cost     += sign * t.quantity * t.price;
    });
    const holdings = Object.values(holdMap).filter(h => h.quantity > 0).map(h => ({
      ...h,
      avgCost:      h.cost / h.quantity,
      currentPrice: null,
    }));

    // Compute demo financials from transactions
    const demoCash = txs.reduce((s, t) => {
      if (t.type === 'buy')  return s - Math.abs(t.total);
      if (t.type === 'sell') return s + Math.abs(t.total);
      return s;
    }, 2000000); // assume 200萬初始資金
    const demoStockValue = holdings.reduce((s, h) => s + h.quantity * h.avgCost, 0);
    const demoTotal = demoCash + demoStockValue;
    const demoRealized = txs.filter(t => t.type === 'sell').reduce((s, t) => s + t.total, 0)
                       - txs.filter(t => t.type === 'sell').reduce((s, t) => s + t.quantity * txs.find(b => b.stockId === t.stockId && b.type === 'buy')?.price * 1 || 0, 0);

    if (_page === 'home' || !_page) {
      DashboardModule.renderHome({ aiResult: null, holdings, watchlist, cash: demoCash, totalAssets: demoTotal, settings, todayPnL: 0, cumulativePnL: 0, healthResult: null });
    } else if (_page === 'portfolio') {
      DashboardModule.renderPortfolio({ holdings, watchlist, transactions: txs, cash: demoCash, unrealized: 0, unrealPct: 0, realized: 0, totalAssets: demoTotal, todayPnL: 0, thesisMap: {}, dividendTotal: 0, xirr: null });
    } else if (_page === 'watchlist') {
      DashboardModule.renderWatchlist({ watchlist });
    } else if (_page === 'history') {
      DashboardModule.renderHistory({ transactions: txs, dividends: [] });
    } else if (_page === 'settings') {
      DashboardModule.renderSettings({ settings, pinEnabled: false, licenseActivated: false, licenseKey: '' });
    }
  }

  // ─── LINE Sync ────────────────────────────────────────────────────────────

  const LINE_SYNC_INTERVAL_MS = 15000;
  const LINE_SERVER_URL_KEY   = 'aios_line_server_url'; // stored in localStorage by user

  function _startLineSyncPoll() {
    const url = localStorage.getItem(LINE_SERVER_URL_KEY);
    if (!url) return; // no server configured
    _lineSyncOnce(url);
    setInterval(() => _lineSyncOnce(url), LINE_SYNC_INTERVAL_MS);
  }

  async function _lineSyncOnce(serverUrl) {
    try {
      const res  = await fetch(`${serverUrl}/api/sync`, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) return;
      const { pending } = await res.json();
      if (!pending || pending.length === 0) return;

      const consumed = [];
      for (const op of pending) {
        try {
          _processLineOp(op);
          consumed.push(op.id);
        } catch {
          // Skip unprocessable ops silently; they remain in queue
        }
      }

      if (consumed.length > 0) {
        await fetch(`${serverUrl}/api/sync/ack`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ ids: consumed }),
        });
        NotificationModule.toast(`LINE 同步了 ${consumed.length} 筆操作`);
        _safeRender();
      }
    } catch {
      // Silent fail — server may be offline
    }
  }

  function _processLineOp(op) {
    if (op.type === 'buy' || op.type === 'sell') {
      const fee = op.fee || Utils.calcFee(op.quantity * op.price, DB.Settings.get().defaultFeeRate || 0.1425);
      const tax = op.type === 'sell' ? Math.round(op.quantity * op.price * TAIWAN_SECURITIES_TAX) : 0;
      const total = op.type === 'buy'
        ? op.quantity * op.price + fee
        : op.quantity * op.price - fee - tax;

      let realizedPnL;
      if (op.type === 'sell') {
        const h = PortfolioModule.getHoldings().find(x => x.stockId === op.stockId);
        if (!h) throw new Error(`${op.stockId} not in holdings`);
        if (op.quantity > h.quantity + 0.0001) throw new Error(`Oversell ${op.stockId}`);
        realizedPnL = (op.price - h.avgCost) * op.quantity - fee - tax;
      }

      TransactionModule.add({
        type: op.type, date: op.date || Utils.today(),
        stockId: op.stockId, stockName: op.stockName || op.stockId,
        quantity: op.quantity, price: op.price,
        fee, tax, total, realizedPnL,
        thesis: op.thesis || 'LINE', memo: 'via LINE',
      });
      PortfolioModule.recalculate(TransactionModule.getAll());

    } else if (op.type === 'deposit' || op.type === 'withdraw') {
      TransactionModule.add({
        type: op.type, date: op.date || Utils.today(),
        cashAmt: op.cashAmt, memo: 'via LINE',
      });

    } else if (op.type === 'add_watch') {
      const dup = WatchlistModule.getAll().find(w => w.stockId === op.stockId);
      if (!dup) WatchlistModule.add({ stockId: op.stockId, stockName: op.stockName || op.stockId });
    }
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  function _checkDataIntegrity() {
    try {
      const raw = localStorage.getItem('aios_transactions');
      if (raw !== null) JSON.parse(raw); // throws if malformed
      const raw2 = localStorage.getItem('aios_watchlist');
      if (raw2 !== null) JSON.parse(raw2);
      return true;
    } catch { return false; }
  }

  function _showRecoveryScreen() {
    document.getElementById('page-home').innerHTML = `
      <div class="card" style="margin-top:24px;border:1px solid var(--red)">
        <div class="card-title" style="color:var(--red)">⚠️ 資料異常</div>
        <p style="font-size:14px;margin-bottom:4px">偵測到資料損毀或格式不符。</p>
        <p style="font-size:13px;color:var(--muted);margin-bottom:16px">請匯入備份資料來還原，或清除後重新開始。</p>
        <button class="btn btn-primary" onclick="App.importData()">匯入備份</button>
        <button class="btn btn-danger" onclick="App.clearAllData()" style="margin-top:8px">清除全部資料</button>
      </div>`;
    document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === 'page-home'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === 'home'));
  }

  function _scoreTip(tier) {
    const tips = {
      'high':     '值得持續追蹤，現價具吸引力',
      'mid-high': '值得觀察，接近合理買入區間',
      'mid':      '中性，等待更好的買入時機',
      'mid-low':  '偏高，建議耐心等待回落',
      'low':      '現價偏高風險區，謹慎評估',
    };
    return tips[tier] || '';
  }

  function _onTxTypeChange() {
    const type      = document.getElementById('txType').value;
    const isCash    = type === 'deposit' || type === 'withdraw';
    const isDivCash = type === 'dividend';
    const isDivStk  = type === 'stock_dividend';
    const isDiv     = isDivCash || isDivStk;

    document.getElementById('txStockFields').style.display    = (isCash) ? 'none' : '';
    document.getElementById('txCashFields').style.display     = isCash ? '' : 'none';
    document.getElementById('txTradeFields').style.display    = (isDiv || isCash) ? 'none' : '';
    document.getElementById('txDivCashField').style.display   = isDivCash ? '' : 'none';
    document.getElementById('txDivSharesField').style.display = isDivStk  ? '' : 'none';
    document.getElementById('txThesisWrap').style.display     = isDiv ? 'none' : '';

    document.getElementById('modalTxTitle').textContent =
      { buy:'買入交易', sell:'賣出交易', deposit:'入金', withdraw:'出金', dividend:'現金股利', stock_dividend:'股票股利' }[type] || '新增交易';
  }

  function _autoCalcFee() {
    const shares = parseFloat(document.getElementById('txShares').value) || 0;
    const price  = parseFloat(document.getElementById('txPrice').value) || 0;
    const type   = document.getElementById('txType').value;
    if (shares && price) {
      document.getElementById('txFee').value =
        Utils.calcFee(shares * price, getSettings().defaultFeeRate);
    }
  }

  function _readThesis() {
    const sel = document.getElementById('txThesisSelect');
    if (!sel) return '';
    if (sel.value === '自訂') return (document.getElementById('txReasonCustom').value || '').trim();
    return sel.value;
  }

  function onThesisChange(val) {
    const wrap = document.getElementById('txReasonCustomWrap');
    if (wrap) wrap.style.display = val === '自訂' ? '' : 'none';
  }

  function _clearTxForm() {
    ['txSymbol','txName','txShares','txPrice','txFee','txCashAmt','txDivCash','txDivShares','txReasonCustom','txNote']
      .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    const sel = document.getElementById('txThesisSelect');
    if (sel) sel.value = '';
    const wrap = document.getElementById('txReasonCustomWrap');
    if (wrap) wrap.style.display = 'none';
  }

  return {
    init,
    navigate,
    submitTransaction,
    confirmTransaction,
    deleteTx,
    deleteDividend,
    addWatch,
    removeWatch,
    toggleAiBrief,
    viewHoldingHistory,
    openStockDetail,
    stockDetailBuy,
    filterWatchlist,
    filterHistory,
    filterHistoryType,
    sortHistory,
    openUpdatePrice,
    confirmUpdatePrice,
    editSetting,
    toggleDarkMode,
    exportCSV,
    exportData,
    importData,
    clearAllData,
    setupPIN,
    changePIN,
    disablePIN,
    selectGoal,
    nextOnboard,
    finishOnboard,
    onThesisChange,
    saveLineServerUrl,
    refreshPrices,
    installPWA,
    openLicenseModal,
    submitLicenseKey,
  };
})();

// ── PWA Install prompt ──────────────────────────────────────────────────────
let _pwaPrompt = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  _pwaPrompt = e;
  const btn = document.getElementById('installBtn');
  if (btn) btn.style.display = '';
});
window.addEventListener('appinstalled', () => {
  const btn = document.getElementById('installBtn');
  if (btn) btn.style.display = 'none';
  _pwaPrompt = null;
});
function installPWA() {
  if (_pwaPrompt) {
    _pwaPrompt.prompt();
    _pwaPrompt.userChoice.then(() => { _pwaPrompt = null; });
  } else {
    NotificationModule.toast('請在瀏覽器選單中選擇「加入主畫面」');
  }
}
