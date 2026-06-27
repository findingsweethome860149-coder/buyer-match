/**
 * Store — Simple JSON file persistence for LINE server.
 * Maintains pending operations queue that the frontend polls.
 * Frontend (localStorage) remains Single Source of Truth for committed data.
 */
const fs   = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'data.json');

const DEFAULT_DATA = {
  pending:  [],   // pending confirmed ops ready for frontend to consume
  awaiting: {},   // ops awaiting LINE confirmation { userId: { op, expiresAt } }
};

function _read() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return { ...DEFAULT_DATA };
  }
}

function _write(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ── Pending queue (confirmed ops for frontend to consume) ─────────────────

function getPending() {
  return _read().pending || [];
}

function addPending(op) {
  const data = _read();
  data.pending = data.pending || [];
  data.pending.push({ ...op, id: _uid(), createdAt: new Date().toISOString() });
  _write(data);
}

function clearPending(ids) {
  const data = _read();
  if (ids && ids.length > 0) {
    data.pending = (data.pending || []).filter(p => !ids.includes(p.id));
  } else {
    data.pending = [];
  }
  _write(data);
}

// ── Awaiting confirmation (unconfirmed LINE commands) ─────────────────────

function setAwaiting(userId, op) {
  const data = _read();
  data.awaiting = data.awaiting || {};
  data.awaiting[userId] = { op, expiresAt: Date.now() + 5 * 60 * 1000 }; // 5-min TTL
  _write(data);
}

function getAwaiting(userId) {
  const data = _read();
  const entry = (data.awaiting || {})[userId];
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    clearAwaiting(userId);
    return null;
  }
  return entry.op;
}

function clearAwaiting(userId) {
  const data = _read();
  if (data.awaiting) delete data.awaiting[userId];
  _write(data);
}

function _uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

module.exports = { getPending, addPending, clearPending, setAwaiting, getAwaiting, clearAwaiting };
