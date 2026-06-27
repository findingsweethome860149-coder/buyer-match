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

// ── Yahoo Finance Price Proxy ─────────────────────────────────────────────
// GET /api/price?stocks=2330,2317
// Returns: { prices: { "2330": { price, change, changePct, name, updatedAt } } }
// Tries {id}.TW first, then {id}.TWO for OTC stocks.

const PRICE_CACHE     = new Map();
const PRICE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

app.get('/api/price', async (req, res) => {
  const raw = (req.query.stocks || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  if (raw.length === 0) return res.status(400).json({ error: 'stocks param required' });
  if (raw.length > 20)  return res.status(400).json({ error: 'max 20 stocks per request' });

  const prices = {};
  const now    = Date.now();

  // Split into cached and to-fetch
  const toFetch = [];
  raw.forEach(id => {
    const cached = PRICE_CACHE.get(id);
    if (cached && now - cached.fetchedAt < PRICE_CACHE_TTL) {
      prices[id] = cached.data;
    } else {
      toFetch.push(id);
    }
  });

  if (toFetch.length > 0) {
    // Yahoo Finance accepts comma-separated symbols in one request
    const trySymbols = async (ids, suffix) => {
      const symbols = ids.map(id => `${id}${suffix}`).join(',');
      const url     = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols}&fields=regularMarketPrice,regularMarketChange,regularMarketChangePercent,shortName`;
      const resp    = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal:  AbortSignal.timeout(8000),
      });
      if (!resp.ok) throw new Error(`Yahoo HTTP ${resp.status}`);
      const body = await resp.json();
      return (body?.quoteResponse?.result || []);
    };

    // Try TSE (.TW) batch first
    let results = [];
    try { results = await trySymbols(toFetch, '.TW'); } catch { /* will retry per-stock */ }

    // For any that returned no price, retry with .TWO (OTC)
    const found = new Set(results.map(r => r.symbol?.replace(/\.(TW|TWO)$/, '')));
    const retry = toFetch.filter(id => !found.has(id));
    if (retry.length > 0) {
      try {
        const otcResults = await trySymbols(retry, '.TWO');
        results = results.concat(otcResults);
      } catch { /* best effort */ }
    }

    results.forEach(r => {
      const id   = (r.symbol || '').replace(/\.(TW|TWO)$/, '');
      const data = {
        price:     r.regularMarketPrice      ?? null,
        change:    r.regularMarketChange     ?? null,
        changePct: r.regularMarketChangePercent ?? null,
        name:      r.shortName               ?? id,
        updatedAt: new Date().toISOString(),
      };
      PRICE_CACHE.set(id, { data, fetchedAt: now });
      prices[id] = data;
    });
  }

  res.json({ prices });
});

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
