/**
 * Watchlist Module
 * Responsible for: adding, removing, querying watched stocks.
 * NOT responsible for: Portfolio management.
 */
const WatchlistModule = (() => {

  function getAll() {
    return DB.Watchlist.getAll();
  }

  function add(item) {
    if (!item.id)        item.id        = Utils.uid();
    if (!item.createdAt) item.createdAt = new Date().toISOString();
    DB.Watchlist.add(item);
    return item;
  }

  function remove(id) {
    DB.Watchlist.remove(id);
  }

  function updatePrice(id, price) {
    const all  = getAll();
    const item = all.find(w => w.id === id);
    if (item) { item.currentPrice = price; DB.Watchlist.save(all); }
  }

  function getTargetHits() {
    return getAll().filter(w => w.currentPrice && w.targetPrice && w.currentPrice <= w.targetPrice);
  }

  return { getAll, add, remove, updatePrice, getTargetHits };
})();
