/**
 * Transaction Module
 * Responsible for: storing all transaction records.
 * NOT responsible for: modifying Portfolio directly.
 * Portfolio recalculates itself from transaction history.
 */
const TransactionModule = (() => {

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
        tx.tax = Math.round(tx.quantity * tx.price * 0.003);
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

  return { getAll, add, remove, getByStockId, getByType };
})();
