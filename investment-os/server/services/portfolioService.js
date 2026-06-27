/**
 * Portfolio Service — server-side mirror of PortfolioModule.
 */
const DB    = require('../db/store');
const utils = require('./utils');

function getHoldings() {
  return DB.Portfolio.getAll();
}

function recalculate(transactions) {
  const existing  = getHoldings();
  const priceMap  = {};
  existing.forEach(h => {
    priceMap[h.stockId] = {
      currentPrice:   h.currentPrice,
      previousPrice:  h.previousPrice,
      priceUpdatedAt: h.priceUpdatedAt,
    };
  });

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
        const cps = h.quantity > 0 ? h.totalCost / h.quantity : 0;
        h.totalCost = Math.max(0, h.totalCost - cps * tx.quantity);
        h.quantity  = Math.max(0, h.quantity - tx.quantity);
      }
    });

  const holdings = Object.values(map)
    .filter(h => h.quantity > 0.0001)
    .map(h => {
      const prev = priceMap[h.stockId] || {};
      return {
        id:             h.stockId,
        stockId:        h.stockId,
        stockName:      h.stockName,
        quantity:       h.quantity,
        avgCost:        h.quantity > 0 ? h.totalCost / h.quantity : 0,
        currentPrice:   prev.currentPrice  || (h.quantity > 0 ? h.totalCost / h.quantity : 0),
        previousPrice:  prev.previousPrice  || null,
        priceUpdatedAt: prev.priceUpdatedAt || null,
      };
    });

  DB.Portfolio.save(holdings);
  return holdings;
}

function getCashBalance(transactions) {
  return transactions.reduce((bal, tx) => {
    if (tx.type === 'deposit')  return bal + tx.cashAmt;
    if (tx.type === 'withdraw') return bal - tx.cashAmt;
    if (tx.type === 'buy')      return bal - (tx.quantity * tx.price + (tx.fee || 0));
    if (tx.type === 'sell')     return bal + (tx.quantity * tx.price - (tx.fee || 0) - (tx.tax || 0));
    return bal;
  }, 0);
}

function getMarketValue() {
  return getHoldings().reduce((s, h) => s + h.quantity * (h.currentPrice || h.avgCost), 0);
}

function getUnrealizedPnL() {
  return getHoldings().reduce((s, h) =>
    s + h.quantity * ((h.currentPrice || h.avgCost) - h.avgCost), 0);
}

module.exports = { getHoldings, recalculate, getCashBalance, getMarketValue, getUnrealizedPnL };
