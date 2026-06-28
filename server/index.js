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

// ── TAIEX Weighted Index ──────────────────────────────────────────────────
let _taiexCache = null, _taiexFetchedAt = 0;
const TAIEX_TTL = 60 * 1000;

app.get('/api/taiex', async (req, res) => {
  const now = Date.now();
  if (_taiexCache && now - _taiexFetchedAt < TAIEX_TTL) return res.json(_taiexCache);
  try {
    const resp = await fetch(
      'https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=tse_t00.tw&json=1&delay=0',
      { headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://mis.twse.com.tw/' }, signal: AbortSignal.timeout(8000) }
    );
    if (!resp.ok) throw new Error('unavailable');
    const body = await resp.json();
    const row  = (body?.msgArray || [])[0];
    if (!row) throw new Error('no data');
    const price = parseFloat(row.z !== '-' ? row.z : row.y);
    const prev  = parseFloat(row.y) || price;
    _taiexCache = {
      price, prev,
      change:    parseFloat((price - prev).toFixed(2)),
      changePct: parseFloat(((price - prev) / prev * 100).toFixed(2)),
      name: '加權指數',
      updatedAt: new Date().toISOString(),
    };
    _taiexFetchedAt = now;
    res.json(_taiexCache);
  } catch { res.status(503).json({ error: 'taiex unavailable' }); }
});

/** GET /health */
app.get('/health', (req, res) => res.json({
  ok: true,
  ts: new Date().toISOString(),
  priceSources: ['twse-open', 'twse-mis', 'yahoo'],
  twseOpenCached: !!_twseOpenCache,
}));

// ── Price Proxy (TWSE Open API → TWSE MIS → Yahoo Finance) ──────────────
// GET /api/price?stocks=2330,2317
// Returns: { prices: { "2330": { price, change, changePct, name, source, updatedAt } } }

const PRICE_CACHE     = new Map(); // stockId → { data, fetchedAt }
const PRICE_CACHE_TTL = 3 * 60 * 1000; // 3 minutes

// Bulk TWSE Open API cache (downloads ALL stocks at once)
let _twseOpenCache     = null; // Map: stockId → { price, change, name }
let _twseOpenFetchedAt = 0;
const TWSE_OPEN_TTL   = 3 * 60 * 1000;

app.get('/api/price', async (req, res) => {
  const raw = (req.query.stocks || '').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  if (raw.length === 0) return res.status(400).json({ error: 'stocks param required' });
  if (raw.length > 30)  return res.status(400).json({ error: 'max 30 stocks per request' });

  const prices = {};
  const now    = Date.now();

  // Serve from per-stock cache first
  const toFetch = raw.filter(id => {
    const c = PRICE_CACHE.get(id);
    if (c && now - c.fetchedAt < PRICE_CACHE_TTL) { prices[id] = c.data; return false; }
    return true;
  });

  if (toFetch.length > 0) {
    // ── Source 1: TWSE Open API (bulk, ~1 min update, TSE listed only) ──────
    await _tryTwseOpen(toFetch, prices, now);

    // ── Source 2: TWSE MIS API (near real-time, market hours only) ────────
    const stillMissing = toFetch.filter(id => !prices[id]);
    if (stillMissing.length > 0) {
      await _tryTwseMis(stillMissing, prices, now);
    }

    // ── Source 3: Yahoo Finance (fallback, may need crumb) ────────────────
    const finalMissing = toFetch.filter(id => !prices[id]);
    if (finalMissing.length > 0) {
      await _tryYahoo(finalMissing, prices, now);
    }

    // Cache results
    toFetch.forEach(id => {
      if (prices[id]) PRICE_CACHE.set(id, { data: prices[id], fetchedAt: now });
    });
  }

  res.json({ prices, ts: new Date().toISOString() });
});

// Source 1: TWSE Open API — downloads all TSE stock prices in one shot
async function _tryTwseOpen(ids, out, now) {
  try {
    if (!_twseOpenCache || now - _twseOpenFetchedAt > TWSE_OPEN_TTL) {
      const resp = await fetch(
        'https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_AVG_ALL',
        { signal: AbortSignal.timeout(10000) }
      );
      if (!resp.ok) return;
      const list = await resp.json();
      _twseOpenCache = new Map();
      list.forEach(row => {
        const price = parseFloat(row.ClosingPrice);
        if (row.Code && !isNaN(price)) {
          _twseOpenCache.set(row.Code, {
            price,
            change:    null,
            changePct: null,
            name:      row.Name || row.Code,
          });
        }
      });
      _twseOpenFetchedAt = now;
    }

    ids.forEach(id => {
      const d = _twseOpenCache.get(id);
      if (d) out[id] = { ...d, source: 'twse-open', updatedAt: new Date().toISOString() };
    });
  } catch { /* fall through to next source */ }
}

// Source 2: TWSE MIS API — real-time during market hours, supports TSE + OTC
async function _tryTwseMis(ids, out, now) {
  try {
    // MIS needs prefix: tse_ for TSE, otc_ for OTC (try tse first)
    const ex_ch = ids.map(id => `tse_${id}.tw`).join('|');
    const url   = `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${ex_ch}&json=1&delay=0`;
    const resp  = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://mis.twse.com.tw/' },
      signal:  AbortSignal.timeout(8000),
    });
    if (!resp.ok) return;
    const body = await resp.json();
    const rows = body?.msgArray || [];

    rows.forEach(row => {
      const id    = row.c;
      const price = parseFloat(row.z !== '-' ? row.z : row.y); // z=last, y=yesterday close
      if (id && !isNaN(price)) {
        const prev = parseFloat(row.y) || price;
        out[id] = {
          price,
          change:    parseFloat((price - prev).toFixed(2)),
          changePct: parseFloat(((price - prev) / prev * 100).toFixed(2)),
          volume:    parseInt(row.v)  || 0,  // 累積成交量（張）
          high:      parseFloat(row.h) || null,
          low:       parseFloat(row.l) || null,
          name:      row.n || id,
          source:    'twse-mis',
          updatedAt: new Date().toISOString(),
        };
      }
    });

    // Retry missing as OTC
    const missing = ids.filter(id => !out[id]);
    if (missing.length > 0) {
      const ex_ch2 = missing.map(id => `otc_${id}.tw`).join('|');
      const r2 = await fetch(
        `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${ex_ch2}&json=1&delay=0`,
        { headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://mis.twse.com.tw/' }, signal: AbortSignal.timeout(8000) }
      );
      if (r2.ok) {
        const b2  = await r2.json();
        (b2?.msgArray || []).forEach(row => {
          const id    = row.c;
          const price = parseFloat(row.z !== '-' ? row.z : row.y);
          if (id && !isNaN(price) && !out[id]) {
            const prev = parseFloat(row.y) || price;
            out[id] = {
              price,
              change:    parseFloat((price - prev).toFixed(2)),
              changePct: parseFloat(((price - prev) / prev * 100).toFixed(2)),
              volume:    parseInt(row.v)  || 0,
              high:      parseFloat(row.h) || null,
              low:       parseFloat(row.l) || null,
              name:      row.n || id,
              source:    'twse-mis-otc',
              updatedAt: new Date().toISOString(),
            };
          }
        });
      }
    }
  } catch { /* fall through */ }
}

// Source 3: Yahoo Finance — requires crumb after 2024 API changes
async function _tryYahoo(ids, out, now) {
  try {
    // Acquire crumb
    const cookieResp = await fetch('https://finance.yahoo.com/', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
      signal:  AbortSignal.timeout(8000),
    });
    const setCookie = cookieResp.headers.get('set-cookie') || '';
    const cookie    = setCookie.split(';')[0];

    const crumbResp = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Cookie': cookie },
      signal:  AbortSignal.timeout(5000),
    });
    if (!crumbResp.ok) return;
    const crumb = (await crumbResp.text()).trim();

    // Fetch quotes (try .TW then .TWO)
    const _fetchYahooSymbols = async (symbols) => {
      const url  = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols}&crumb=${encodeURIComponent(crumb)}`;
      const resp = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Cookie': cookie },
        signal:  AbortSignal.timeout(8000),
      });
      if (!resp.ok) return [];
      const body = await resp.json();
      return body?.quoteResponse?.result || [];
    };

    const twSymbols  = ids.map(id => `${id}.TW`).join(',');
    const results    = await _fetchYahooSymbols(twSymbols);
    const found      = new Set();

    results.forEach(r => {
      const id = (r.symbol || '').replace(/\.(TW|TWO)$/, '');
      if (r.regularMarketPrice) {
        out[id] = {
          price:     r.regularMarketPrice,
          change:    r.regularMarketChange    ?? null,
          changePct: r.regularMarketChangePercent ?? null,
          name:      r.shortName || id,
          source:    'yahoo',
          updatedAt: new Date().toISOString(),
        };
        found.add(id);
      }
    });

    // OTC retry
    const otcIds = ids.filter(id => !found.has(id));
    if (otcIds.length > 0) {
      const twoResults = await _fetchYahooSymbols(otcIds.map(id => `${id}.TWO`).join(','));
      twoResults.forEach(r => {
        const id = (r.symbol || '').replace(/\.(TW|TWO)$/, '');
        if (r.regularMarketPrice && !out[id]) {
          out[id] = {
            price:     r.regularMarketPrice,
            change:    r.regularMarketChange    ?? null,
            changePct: r.regularMarketChangePercent ?? null,
            name:      r.shortName || id,
            source:    'yahoo-otc',
            updatedAt: new Date().toISOString(),
          };
        }
      });
    }
  } catch { /* all sources exhausted */ }
}

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
