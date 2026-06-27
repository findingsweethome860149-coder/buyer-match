/**
 * AI Investment OS Lite — LINE Bot Server
 *
 * Entry point. Wires Express + LINE SDK + webhook handler.
 *
 * Required environment variables:
 *   LINE_CHANNEL_SECRET   — from LINE Developers console
 *   LINE_CHANNEL_TOKEN    — channel access token
 *   PORT                  — (optional) defaults to 3000
 *   DB_FILE               — (optional) path to JSON db, defaults to ./data/aios_db.json
 */
const express   = require('express');
const line      = require('@line/bot-sdk');
const { handle } = require('./line/handler');

const config = {
  channelSecret:      process.env.LINE_CHANNEL_SECRET || '',
  channelAccessToken: process.env.LINE_CHANNEL_TOKEN  || '',
};

if (!config.channelSecret || !config.channelAccessToken) {
  console.warn('[AIOS] Warning: LINE_CHANNEL_SECRET or LINE_CHANNEL_TOKEN not set.');
  console.warn('[AIOS] Set them in .env or environment variables before deploying.');
}

const client = new line.messagingApi.MessagingApiClient({ channelAccessToken: config.channelAccessToken });
const app    = express();

// ── Webhook ───────────────────────────────────────────────────────────────────

app.post(
  '/webhook',
  line.middleware(config),
  async (req, res) => {
    res.sendStatus(200); // acknowledge immediately

    const events = req.body.events || [];
    await Promise.all(events.map(event => _processEvent(event)));
  }
);

async function _processEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') return;

  const lineUserId = event.source.userId;
  const text       = event.message.text;

  try {
    const reply = await handle(lineUserId, text);
    await client.replyMessage({
      replyToken: event.replyToken,
      messages: [{ type: 'text', text: reply }],
    });
  } catch (err) {
    console.error('[AIOS] Handler error:', err);
    try {
      await client.replyMessage({
        replyToken: event.replyToken,
        messages: [{ type: 'text', text: '發生錯誤，請稍後再試。' }],
      });
    } catch { /* reply token expired — ignore */ }
  }
}

// ── Health check ──────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', version: '1.0', ts: new Date().toISOString() });
});

// ── Start ─────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[AIOS] LINE Bot server running on port ${PORT}`);
  console.log(`[AIOS] Webhook endpoint: POST /webhook`);
});
