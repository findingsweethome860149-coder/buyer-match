// 自動設定 LINE Webhook URL
const https = require('https');

const TOKEN = 'TlJmZd/AnIKgKS7ZRUm+k5LGH/fTj6oAo13ETUr5o3O48Xe1q2rz4GpnNqXNwUqpFDGRGC5DZQD5Ss8EaTPyTbT3MC05Emsc7bKJOXfM+skBiVbpZroZJYUrNhxz+ymLW8hvNdA+J0irLnfrNdU0fwdB04t89/1O/w1cDnyilFU=';
const WEBHOOK_URL = 'https://buyer-match-production.up.railway.app/webhook';

const body = JSON.stringify({ webhook_endpoint: WEBHOOK_URL });

const req = https.request({
  hostname: 'api.line.me',
  path: '/v2/bot/channel/webhook/endpoint',
  method: 'PUT',
  headers: {
    'Authorization': `Bearer ${TOKEN}`,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  },
}, res => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    console.log(`狀態：${res.statusCode}`);
    console.log(data);
    if (res.statusCode === 200) {
      console.log('\n✅ Webhook URL 設定成功！');
      console.log(`   ${WEBHOOK_URL}`);
    }
  });
});
req.on('error', e => console.error(e));
req.write(body);
req.end();
