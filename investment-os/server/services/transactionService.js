/**
 * Transaction Service — server-side mirror of TransactionModule.
 * All business logic lives here. LINE handler only calls this.
 */
const DB    = require('../db/store');
const utils = require('./utils');

function getAll() {
  return DB.Transactions.getAll();
}

function add(tx) {
  if (!tx.id)        tx.id        = utils.uid();
  if (!tx.date)      tx.date      = utils.today();
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

module.exports = { getAll, add, remove };
