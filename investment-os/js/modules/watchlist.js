/**
 * Watchlist Module
 * Responsible for: adding, removing, querying watched stocks.
 * NOT responsible for: Portfolio management.
 */
const WatchlistModule = (() => {
  const KEY = 'watchlist';

  function getAll() {
    return DB.get(KEY, []);
  }

  function add(item) {
    if (!item.id) item.id = Utils.uid();
    const all = getAll();
    all.push(item);
    DB.set(KEY, all);
    return item;
  }

  function remove(id) {
    DB.set(KEY, getAll().filter(w => w.id !== id));
  }

  function updatePrice(id, price) {
    const all = getAll();
    const item = all.find(w => w.id === id);
    if (item) { item.currentPrice = price; DB.set(KEY, all); }
  }

  function getTargetHits() {
    return getAll().filter(w => w.currentPrice && w.targetPrice && w.currentPrice <= w.targetPrice);
  }

  return { getAll, add, remove, updatePrice, getTargetHits };
})();
