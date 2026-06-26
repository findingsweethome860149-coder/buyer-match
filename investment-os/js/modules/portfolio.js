/**
 * Portfolio Module
 * Responsible for: holdings, cost basis, unrealized/realized P&L, cash balance.
 * NOT responsible for: stock analysis (that's AI Module).
 *
 * Architecture rule: Portfolio recalculates from transaction history.
 * It does NOT accept direct mutations from Transaction Module.
 */
const PortfolioModule = (() => {
  const HOLDINGS_KEY = 'portfolio';

  // ── Holdings (current price is stored here, updated manually by user) ──

  function getHoldings() {
    return DB.get(HOLDINGS_KEY, []);
  }

  function saveHoldings(holdings) {
    DB.set(HOLDINGS_KEY, holdings);
  }

  /**
   * Recalculate holdings from full transaction history.
   * Preserves user-updated currentPrice values.
   * Called after any transaction add/remove.
   */
  function recalculate(transactions) {
    const existing = getHoldings();
    const priceMap = {};
    existing.forEach(h => { priceMap[h.symbol] = h.currentPrice; });

    const map = {};
    transactions
      .filter(tx => tx.type === 'buy' || tx.type === 'sell')
      .sort((a, b) => a.date.localeCompare(b.date))
      .forEach(tx => {
        if (!map[tx.symbol]) {
          map[tx.symbol] = { symbol: tx.symbol, name: tx.name, shares: 0, totalCost: 0 };
        }
        const h = map[tx.symbol];
        if (tx.type === 'buy') {
          h.totalCost += tx.shares * tx.price;
          h.shares    += tx.shares;
        } else {
          const costPerShare = h.shares > 0 ? h.totalCost / h.shares : 0;
          h.totalCost = Math.max(0, h.totalCost - costPerShare * tx.shares);
          h.shares    = Math.max(0, h.shares - tx.shares);
        }
      });

    const holdings = Object.values(map)
      .filter(h => h.shares > 0.0001)
      .map(h => ({
        id:           h.symbol,
        symbol:       h.symbol,
        name:         h.name,
        shares:       h.shares,
        avgCost:      h.shares > 0 ? h.totalCost / h.shares : 0,
        currentPrice: priceMap[h.symbol] || (h.shares > 0 ? h.totalCost / h.shares : 0),
      }));

    saveHoldings(holdings);
    return holdings;
  }

  function updateCurrentPrice(symbol, price) {
    const holdings = getHoldings();
    const h = holdings.find(x => x.symbol === symbol);
    if (h) { h.currentPrice = price; saveHoldings(holdings); }
  }

  // ── Computed values ──

  function getMarketValue() {
    return getHoldings().reduce((s, h) => s + h.shares * (h.currentPrice || h.avgCost), 0);
  }

  function getUnrealizedPnL() {
    return getHoldings().reduce((s, h) => {
      return s + (h.shares * (h.currentPrice || h.avgCost) - h.shares * h.avgCost);
    }, 0);
  }

  function getCashBalance(transactions) {
    return (transactions || TransactionModule.getAll()).reduce((bal, tx) => {
      if (tx.type === 'deposit')  return bal + tx.cashAmt;
      if (tx.type === 'withdraw') return bal - tx.cashAmt;
      if (tx.type === 'buy')      return bal - (tx.shares * tx.price + (tx.fee || 0));
      if (tx.type === 'sell')     return bal + (tx.shares * tx.price - (tx.fee || 0));
      return bal;
    }, 0);
  }

  function getRealizedPnL(transactions) {
    return (transactions || TransactionModule.getAll())
      .filter(tx => tx.type === 'sell' && tx.realizedPnL !== undefined)
      .reduce((s, tx) => s + tx.realizedPnL, 0);
  }

  function getTotalAssets(transactions) {
    return getCashBalance(transactions) + getMarketValue();
  }

  return {
    getHoldings,
    recalculate,
    updateCurrentPrice,
    getMarketValue,
    getUnrealizedPnL,
    getCashBalance,
    getRealizedPnL,
    getTotalAssets,
  };
})();
