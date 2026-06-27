/**
 * Portfolio Module
 * Responsible for: holdings, cost basis, unrealized/realized P&L, cash balance.
 * NOT responsible for: stock analysis (that's AI Module).
 *
 * Architecture rule: Portfolio recalculates from transaction history.
 * It does NOT accept direct mutations from Transaction Module.
 */
const PortfolioModule = (() => {
  const QTY_EPSILON = 0.0001; // minimum quantity to keep a holding (handles float rounding)

  function getHoldings() {
    return DB.Portfolio.getAll();
  }

  function saveHoldings(holdings) {
    DB.Portfolio.save(holdings);
  }

  /**
   * Recalculate holdings from full transaction history.
   * Preserves user-updated currentPrice values.
   * Called after any transaction add/remove.
   */
  function recalculate(transactions) {
    const existing = getHoldings();
    const priceMap = {};
    existing.forEach(h => { priceMap[h.stockId] = { currentPrice: h.currentPrice, previousPrice: h.previousPrice, priceUpdatedAt: h.priceUpdatedAt }; });

    const map = {};
    transactions
      .filter(tx => tx.type === 'buy' || tx.type === 'sell')
      .sort((a, b) => a.date.localeCompare(b.date))
      .forEach(tx => {
        if (!map[tx.stockId]) {
          map[tx.stockId] = { stockId: tx.stockId, stockName: tx.stockName, quantity: 0, totalCost: 0 };
        }
        const h = map[tx.stockId];
        if (tx.type === 'buy') {
          h.totalCost += tx.quantity * tx.price;
          h.quantity  += tx.quantity;
        } else {
          const costPerShare = h.quantity > 0 ? h.totalCost / h.quantity : 0;
          h.totalCost = Math.max(0, h.totalCost - costPerShare * tx.quantity);
          h.quantity = Math.max(0, h.quantity - tx.quantity);
        }
      });

    const holdings = Object.values(map)
      .filter(h => h.quantity > QTY_EPSILON)
      .map(h => {
        const prev = priceMap[h.stockId] || {};
        return {
          id:             h.stockId,
          stockId:        h.stockId,
          stockName:      h.stockName,
          quantity:       h.quantity,
          avgCost:        h.quantity > 0 ? h.totalCost / h.quantity : 0,
          currentPrice:   prev.currentPrice || (h.quantity > 0 ? h.totalCost / h.quantity : 0),
          previousPrice:  prev.previousPrice  || null,
          priceUpdatedAt: prev.priceUpdatedAt || null,
        };
      });

    saveHoldings(holdings);
    return holdings;
  }

  function updateCurrentPrice(stockId, price) {
    const holdings = getHoldings();
    const h = holdings.find(x => x.stockId === stockId);
    if (h) {
      h.previousPrice  = h.currentPrice || h.avgCost;
      h.currentPrice   = price;
      h.priceUpdatedAt = Utils.today();
      saveHoldings(holdings);
    }
  }

  function getTodayPnL() {
    const today = Utils.today();
    return getHoldings().reduce((s, h) => {
      if (h.priceUpdatedAt === today && h.previousPrice) {
        return s + (h.currentPrice - h.previousPrice) * h.quantity;
      }
      return s;
    }, 0);
  }

  function getMarketValue() {
    return getHoldings().reduce((s, h) => s + h.quantity * (h.currentPrice || h.avgCost), 0);
  }

  function getUnrealizedPnL() {
    return getHoldings().reduce((s, h) => {
      return s + (h.quantity * (h.currentPrice || h.avgCost) - h.quantity * h.avgCost);
    }, 0);
  }

  function getCashBalance(transactions) {
    const txBal = (transactions || TransactionModule.getAll()).reduce((bal, tx) => {
      if (tx.type === 'deposit')  return bal + tx.cashAmt;
      if (tx.type === 'withdraw') return bal - tx.cashAmt;
      if (tx.type === 'buy')      return bal - (tx.quantity * tx.price + (tx.fee || 0));
      if (tx.type === 'sell')     return bal + (tx.quantity * tx.price - (tx.fee || 0) - (tx.tax || 0));
      return bal;
    }, 0);
    // Cash dividends add to cash balance
    const divBal = DB.Dividends.getAll().reduce((s, d) => s + (d.cashAmount || 0), 0);
    return txBal + divBal;
  }

  function getRealizedPnL(transactions) {
    return (transactions || TransactionModule.getAll())
      .filter(tx => tx.type === 'sell' && tx.realizedPnL !== undefined)
      .reduce((s, tx) => s + tx.realizedPnL, 0);
  }

  function getTotalAssets(transactions) {
    return getCashBalance(transactions) + getMarketValue();
  }

  function getDividendTotal() {
    return DB.Dividends.getAll().reduce((s, d) => s + (d.cashAmount || 0), 0);
  }

  /**
   * XIRR — annualised return based on cash flows (deposits/withdrawals/dividends)
   * and current portfolio value.
   */
  function getXIRR(transactions) {
    const txs  = transactions || TransactionModule.getAll();
    const divs = DB.Dividends.getAll();

    const flows = [];

    // Deposits are outflows (you spend money), withdrawals are inflows (you take money back)
    txs.forEach(tx => {
      if (tx.type === 'deposit')  flows.push({ date: tx.date, amount: -tx.cashAmt });
      if (tx.type === 'withdraw') flows.push({ date: tx.date, amount:  tx.cashAmt });
    });

    // Cash dividends are inflows
    divs.forEach(d => {
      if (d.cashAmount) flows.push({ date: d.date, amount: d.cashAmount });
    });

    if (flows.length === 0) return null;

    // Current portfolio value is the final inflow at today's date
    const totalAssets = getTotalAssets(txs);
    if (totalAssets <= 0) return null;
    flows.push({ date: Utils.today(), amount: totalAssets });

    flows.sort((a, b) => a.date.localeCompare(b.date));
    return Utils.xirr(flows);
  }

  return {
    getHoldings,
    recalculate,
    updateCurrentPrice,
    getMarketValue,
    getUnrealizedPnL,
    getTodayPnL,
    getCashBalance,
    getRealizedPnL,
    getTotalAssets,
    getDividendTotal,
    getXIRR,
  };
})();
