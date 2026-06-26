/**
 * Transaction Module
 * Responsible for: storing all transaction records.
 * NOT responsible for: modifying Portfolio directly.
 * Portfolio recalculates itself from transaction history.
 */
const TransactionModule = (() => {
  const KEY = 'transactions';

  function getAll() {
    return DB.get(KEY, []);
  }

  function add(tx) {
    if (!tx.id)   tx.id   = Utils.uid();
    if (!tx.date) tx.date = Utils.today();
    const all = getAll();
    all.push(tx);
    DB.set(KEY, all);
    return tx;
  }

  function remove(id) {
    const all = getAll().filter(t => t.id !== id);
    DB.set(KEY, all);
  }

  function getBySymbol(symbol) {
    return getAll().filter(t => t.symbol === symbol);
  }

  function getByType(type) {
    return getAll().filter(t => t.type === type);
  }

  return { getAll, add, remove, getBySymbol, getByType };
})();
