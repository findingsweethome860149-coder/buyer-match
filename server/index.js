/**
 * AI Investment OS Lite — LINE Webhook Server
 *
 * Architecture:
 *   LINE → POST /webhook → parse command → require confirmation → addPending
 *   Frontend → GET /api/sync → consume pending ops → clear them
 *
 * Business logic lives in lineService.js.
 * Persistence lives in store.js.
 */
const express = require('express');
const crypto  = require('crypto');
const store   = require('./store');
const { parseCommand, buildConfirmText, buildErrorText } = require('./lineService');

const app = express();

// ── Config ────────────────────────────────────────────────────────────────

const PORT               = process.env.PORT || 3000;
const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET || '';
const LINE_ACCESS_TOKEN  = process.env.LINE_ACCESS_TOKEN  || '';

// Read raw body before JSON parse (LINE signature validation needs it)
app.use('/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

// CORS for frontend (development)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
  next();
});

// ── LINE Webhook ──────────────────────────────────────────────────────────

app.post('/webhook', (req, res) => {
  // Verify LINE signature
  if (LINE_CHANNEL_SECRET) {
    const sig = req.headers['x-line-signature'];
    if (!sig || !_verifySignature(req.body, sig)) {
      console.warn('Invalid LINE signature');
      return res.sendStatus(401);
    }
  }

  let body;
  try { body = JSON.parse(req.body); }
  catch { return res.sendStatus(400); }

  // Acknowledge immediately (LINE requires < 1s response)
  res.sendStatus(200);

  // Process events asynchronously
  (body.events || []).forEach(event => {
    if (event.type !== 'message' || event.message.type !== 'text') return;
    _handleTextMessage(event).catch(err => console.error('Event handling error:', err));
  });
});

async function _handleTextMessage(event) {
  const userId = event.source.userId;
  const text   = event.message.text;
  const replyToken = event.replyToken;

  const cmd = parseCommand(text);

  // Handle confirmation flow
  if (cmd.type === 'confirm') {
    const pending = store.getAwaiting(userId);
    if (!pending) {
      await _reply(replyToken, '沒有待確認的操作。');
      return;
    }
    store.addPending(pending);
    store.clearAwaiting(userId);
    const label = { buy:'買進', sell:'賣出', deposit:'入金', withdraw:'出金', add_watch:'加入觀察' };
    await _reply(replyToken, `✅ ${label[pending.type] || pending.type} 已送出，Dashboard 將自動同步。`);
    return;
  }

  if (cmd.type === 'cancel') {
    store.clearAwaiting(userId);
    await _reply(replyToken, '已取消操作。');
    return;
  }

  // Queries — read-only, no confirmation needed
  if (cmd.type === 'query_today')     { await _reply(replyToken, '請至 Dashboard 查看今日 AI 摘要。'); return; }
  if (cmd.type === 'query_holdings')  { await _reply(replyToken, '請至 Dashboard → 投資組合 查看持股。'); return; }
  if (cmd.type === 'query_watchlist') { await _reply(replyToken, '請至 Dashboard → 觀察清單 查看。'); return; }

  if (cmd.type === 'unknown') {
    await _reply(replyToken, buildErrorText(cmd.raw));
    return;
  }

  // Watchlist add — no two-step needed
  if (cmd.type === 'add_watch') {
    store.addPending(cmd);
    await _reply(replyToken, `✅ ${cmd.stockId} 已加入觀察清單，Dashboard 將自動同步。`);
    return;
  }

  // Buy / Sell / Deposit / Withdraw — require confirmation
  store.setAwaiting(userId, cmd);
  await _reply(replyToken, buildConfirmText(cmd));
}

// ── Frontend Sync API ─────────────────────────────────────────────────────

/** GET /api/sync — returns pending ops for the frontend to process */
app.get('/api/sync', (req, res) => {
  res.json({ pending: store.getPending() });
});

/** POST /api/sync/ack — frontend acknowledges consumed op ids */
app.post('/api/sync/ack', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids must be array' });
  store.clearPending(ids);
  res.json({ ok: true });
});

/** GET /health */
app.get('/health', (req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// ── LINE Reply helper ─────────────────────────────────────────────────────

async function _reply(replyToken, text) {
  if (!LINE_ACCESS_TOKEN) {
    console.log('[LINE reply mock]', text);
    return;
  }
  const body = JSON.stringify({
    replyToken,
    messages: [{ type: 'text', text }],
  });
  const resp = await fetch('https://api.line.me/v2/bot/message/reply', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`,
    },
    body,
  });
  if (!resp.ok) console.error('LINE reply failed:', resp.status, await resp.text());
}

// ── Signature verification ────────────────────────────────────────────────

function _verifySignature(rawBody, signature) {
  const hash = crypto
    .createHmac('sha256', LINE_CHANNEL_SECRET)
    .update(rawBody)
    .digest('base64');
  return hash === signature;
}

// ── Start ─────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`AIOS LINE server running on port ${PORT}`);
  if (!LINE_CHANNEL_SECRET) console.warn('⚠️  LINE_CHANNEL_SECRET not set — signature verification disabled');
  if (!LINE_ACCESS_TOKEN)   console.warn('⚠️  LINE_ACCESS_TOKEN not set — replies will be logged only');
});
