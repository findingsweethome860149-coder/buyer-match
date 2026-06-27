/**
 * Transaction Module
 * Responsible for: storing all transaction records.
 * NOT responsible for: modifying Portfolio directly.
 * Portfolio recalculates itself from transaction history.
 */
const TransactionModule = (() => {
  const TAX_RATE = TAIWAN_SECURITIES_TAX; // 0.3%, sell only

  function getAll() {
    return DB.Transactions.getAll();
  }

  function add(tx) {
    if (!tx.id)        tx.id        = Utils.uid();
    if (!tx.date)      tx.date      = Utils.today();
    if (!tx.createdAt) tx.createdAt = new Date().toISOString();

    const isTrade = tx.type === 'buy' || tx.type === 'sell';
    if (isTrade) {
      if (tx.type === 'sell' && tx.tax === undefined) {
        tx.tax = Math.round(tx.quantity * tx.price * TAX_RATE);
      }
      if (tx.total === undefined) {
        tx.total = tx.type === 'buy'
          ? tx.quantity * tx.price + (tx.fee || 0)
          : tx.quantity * tx.price - (tx.fee || 0) - (tx.tax || 0);
      }
    }

    DB.Transactions.add(tx);
    return tx;
  }

  function remove(id) {
    DB.Transactions.remove(id);
  }

  function getByStockId(stockId) {
    return DB.Transactions.getByStockId(stockId);
  }

  function getByType(type) {
    return DB.Transactions.getByType(type);
  }

  // ── Dividend helpers ───────────────────────────────────────────────────────

  function addDividend(div) {
    if (!div.id)        div.id        = Utils.uid();
    if (!div.date)      div.date      = Utils.today();
    if (!div.createdAt) div.createdAt = new Date().toISOString();
    DB.Dividends.add(div);
    return div;
  }

  function removeDividend(id) {
    DB.Dividends.remove(id);
  }

  function getAllDividends() {
    return DB.Dividends.getAll();
  }

  return { getAll, add, remove, getByStockId, getByType, addDividend, removeDividend, getAllDividends };
})();
