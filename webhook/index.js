// =============================================================
// Finding Sweet Home — LINE Webhook Server
// Phase 1 : 自動歡迎訊息 + 關鍵字自動回覆
// =============================================================

const http = require('http');
const crypto = require('crypto');
const https = require('https');

const TOKEN   = process.env.LINE_TOKEN   || 'TlJmZd/AnIKgKS7ZRUm+k5LGH/fTj6oAo13ETUr5o3O48Xe1q2rz4GpnNqXNwUqpFDGRGC5DZQD5Ss8EaTPyTbT3MC05Emsc7bKJOXfM+skBiVbpZroZJYUrNhxz+ymLW8hvNdA+J0irLnfrNdU0fwdB04t89/1O/w1cDnyilFU=';
const SECRET  = process.env.LINE_SECRET  || '758465c23ccf99b4b864ff6c980a1c8d';
const PORT    = process.env.PORT         || 3000;

// ---------- 品牌設定 ----------

const URLS = {
  wordpress: 'https://www.findingsweethomekh.com/',
  card:      'https://findingsweethome860149-coder.github.io/buyer-match/card.html',
};

const WELCOME = `你好，我是愛家的綸 張家綸 👋

高雄左營、三民專業不動產顧問。

孩子在哪長大，我比你還在乎。

不是每間房都適合孩子，
但總有一間，剛好是你的家。

━━━━━━━━━━━━━━━
你可以跟我說：
🏠 我要找房
🔑 我要賣房
💰 免費估價
🎓 學區宅
━━━━━━━━━━━━━━━

或直接點選下方選單開始 ⬇️`;

const REPLIES = [
  {
    triggers: ['找房', '買房', '我要找房'],
    text: `🏠 買方需求登記

您好！我是愛家的綸張家綸，
高雄左營、三民專業不動產顧問。

請告訴我您的需求：
• 預算範圍
• 希望學區 / 地段
• 房型坪數
• 自住 or 投資？

我會為您篩選最合適的物件 🙌

📞 0987-860149
🔗 ${URLS.card}`,
  },
  {
    triggers: ['賣房', '委託', '我要賣房'],
    text: `🔑 屋主委託

您好！我是愛家的綸張家綸。
高雄左營、三民區操盤經驗豐富。

委託前請先了解：
• 免費市場估價
• 精準行銷策略
• 全程透明服務

請留下您的聯絡方式，
我們將安排免費估價 📋

📞 0987-860149
🔗 ${URLS.card}`,
  },
  {
    triggers: ['估價', '免費估價'],
    text: `💰 免費房屋估價

高雄左營、三民區成交行情，
由我親自為您分析。

請提供：
• 房屋地址或路段
• 坪數（室內 / 權狀）
• 屋齡
• 樓層

我將於 24 小時內提供估價報告 ✅

📞 0987-860149`,
  },
  {
    triggers: ['學區', '學區宅'],
    text: `🎓 高雄學區宅指南

左營、三民最熱門學區宅資訊：

🏫 左營區：
  新上國小 / 左營國中 / 左營高中

🏫 三民區：
  民族國小 / 陽明國中 / 高雄高中

需要學區地圖或目前在售物件？
請直接告訴我 📍

📞 0987-860149`,
  },
  {
    triggers: ['文章', '房市'],
    text: `📰 房市文章

最新高雄房市分析、換屋攻略、
學區宅指南，盡在：

🔗 ${URLS.wordpress}

歡迎訂閱，掌握第一手資訊 📊`,
  },
  {
    triggers: ['家綸', '聯絡'],
    text: `👤 認識愛家的綸

張家綸 — 高雄不動產顧問
服務區域：左營、三民

孩子在哪長大，我比你還在乎。

📱 LINE ID：andrea773
📞 電話：0987-860149
🔗 電子名片：${URLS.card}`,
  },
];

// ---------- LINE API ----------

function lineReply(replyToken, text) {
  const body = JSON.stringify({
    replyToken,
    messages: [{ type: 'text', text }],
  });
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.line.me',
      path: '/v2/bot/message/reply',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ---------- 簽名驗證 ----------

function verifySignature(body, signature) {
  const hash = crypto.createHmac('sha256', SECRET).update(body).digest('base64');
  return hash === signature;
}

// ---------- 事件處理 ----------

function matchReply(text) {
  const t = text.trim();
  for (const rule of REPLIES) {
    if (rule.triggers.some(k => t.includes(k))) return rule.text;
  }
  return null;
}

async function handleEvent(event) {
  if (event.type === 'follow') {
    await lineReply(event.replyToken, WELCOME);
    console.log(`[follow] 歡迎訊息已送出`);
    return;
  }
  if (event.type === 'message' && event.message.type === 'text') {
    const reply = matchReply(event.message.text);
    if (reply) {
      await lineReply(event.replyToken, reply);
      console.log(`[message] 關鍵字：${event.message.text}`);
    }
  }
}

// ---------- HTTP Server ----------

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Finding Sweet Home Webhook OK');
    return;
  }
  if (req.method !== 'POST' || req.url !== '/webhook') {
    res.writeHead(404);
    res.end();
    return;
  }

  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', async () => {
    const sig = req.headers['x-line-signature'];
    if (!verifySignature(body, sig)) {
      res.writeHead(401);
      res.end('Unauthorized');
      return;
    }
    res.writeHead(200);
    res.end('OK');

    try {
      const payload = JSON.parse(body);
      for (const event of payload.events || []) {
        await handleEvent(event);
      }
    } catch (e) {
      console.error('處理事件錯誤：', e.message);
    }
  });
});

server.listen(PORT, () => {
  console.log(`✅ Finding Sweet Home Webhook 啟動，Port ${PORT}`);
});
