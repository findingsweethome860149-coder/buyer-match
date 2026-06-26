// =============================================================
// Finding Sweet Home — LINE 自動設定腳本
// Phase 1 : Rich Menu 自動建立、上傳圖片、設為預設
// =============================================================
// 使用方式：node line/setup-line.js
// =============================================================

const https = require('https');
const fs = require('fs');
const path = require('path');

const TOKEN = process.env.LINE_TOKEN || 'TlJmZd/AnIKgKS7ZRUm+k5LGH/fTj6oAo13ETUr5o3O48Xe1q2rz4GpnNqXNwUqpFDGRGC5DZQD5Ss8EaTPyTbT3MC05Emsc7bKJOXfM+skBiVbpZroZJYUrNhxz+ymLW8hvNdA+J0irLnfrNdU0fwdB04t89/1O/w1cDnyilFU=';

const RICH_MENU_IMAGE_PATH = path.join(__dirname, 'rich-menu.png');

// Rich Menu 規格
const RICH_MENU_BODY = {
  size: { width: 1200, height: 810 },
  selected: true,
  name: '愛家的綸 主選單',
  chatBarText: '功能選單',
  areas: [
    {
      bounds: { x: 0,   y: 0,   width: 400, height: 405 },
      action: { type: 'message', text: '我要找房' }
    },
    {
      bounds: { x: 400, y: 0,   width: 400, height: 405 },
      action: { type: 'message', text: '我要賣房' }
    },
    {
      bounds: { x: 800, y: 0,   width: 400, height: 405 },
      action: { type: 'message', text: '免費估價' }
    },
    {
      bounds: { x: 0,   y: 405, width: 400, height: 405 },
      action: { type: 'message', text: '學區宅' }
    },
    {
      bounds: { x: 400, y: 405, width: 400, height: 405 },
      action: { type: 'uri', uri: 'https://www.findingsweethomekh.com/' }
    },
    {
      bounds: { x: 800, y: 405, width: 400, height: 405 },
      action: { type: 'uri', uri: 'https://findingsweethome860149-coder.github.io/buyer-match/card.html' }
    }
  ]
};

// ---------- HTTP helpers ----------

function apiRequest(method, path, body, contentType = 'application/json') {
  return new Promise((resolve, reject) => {
    const isBuffer = Buffer.isBuffer(body);
    const payload = isBuffer ? body : (body ? Buffer.from(JSON.stringify(body)) : null);
    const options = {
      hostname: 'api.line.me',
      path,
      method,
      headers: {
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': contentType,
        ...(payload ? { 'Content-Length': payload.length } : {}),
      },
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ---------- Steps ----------

async function deleteExistingRichMenus() {
  console.log('\n📋 檢查現有 Rich Menu...');
  const res = await apiRequest('GET', '/v2/bot/richmenu/list');
  if (!res.body.richmenus || res.body.richmenus.length === 0) {
    console.log('   無現有 Rich Menu');
    return;
  }
  for (const rm of res.body.richmenus) {
    console.log(`   刪除舊 Rich Menu: ${rm.richMenuId} (${rm.name})`);
    await apiRequest('DELETE', `/v2/bot/richmenu/${rm.richMenuId}`);
  }
  console.log('   ✅ 舊 Rich Menu 已清除');
}

async function createRichMenu() {
  console.log('\n🔧 建立 Rich Menu...');
  const res = await apiRequest('POST', '/v2/bot/richmenu', RICH_MENU_BODY);
  if (res.status !== 200) {
    throw new Error(`建立失敗 ${res.status}: ${JSON.stringify(res.body)}`);
  }
  const richMenuId = res.body.richMenuId;
  console.log(`   ✅ Rich Menu 建立成功: ${richMenuId}`);
  return richMenuId;
}

async function uploadImage(richMenuId) {
  console.log('\n🖼️  上傳 Rich Menu 圖片...');
  if (!fs.existsSync(RICH_MENU_IMAGE_PATH)) {
    throw new Error(`找不到圖片：${RICH_MENU_IMAGE_PATH}\n請先執行：node line/generate-rich-menu-image.js`);
  }
  const image = fs.readFileSync(RICH_MENU_IMAGE_PATH);
  const res = await apiRequest(
    'POST',
    `/v2/bot/richmenu/${richMenuId}/content`,
    image,
    'image/png'
  );
  if (res.status !== 200) {
    throw new Error(`上傳失敗 ${res.status}: ${JSON.stringify(res.body)}`);
  }
  console.log('   ✅ 圖片上傳成功');
}

async function setDefaultRichMenu(richMenuId) {
  console.log('\n📌 設定為預設 Rich Menu...');
  const res = await apiRequest('POST', `/v2/bot/user/all/richmenu/${richMenuId}`);
  if (res.status !== 200) {
    throw new Error(`設定失敗 ${res.status}: ${JSON.stringify(res.body)}`);
  }
  console.log('   ✅ 已設為所有用戶的預設 Rich Menu');
}

async function verifyBot() {
  console.log('\n🤖 驗證 Bot 資訊...');
  const res = await apiRequest('GET', '/v2/bot/info');
  if (res.status !== 200) {
    throw new Error(`Token 驗證失敗 ${res.status}: ${JSON.stringify(res.body)}`);
  }
  console.log(`   Bot 名稱: ${res.body.displayName}`);
  console.log(`   Bot ID:   @${res.body.basicId}`);
  return res.body;
}

// ---------- Main ----------

async function main() {
  console.log('==============================================');
  console.log('  愛家的綸 LINE 自動設定腳本 — Phase 1');
  console.log('==============================================');

  await verifyBot();
  await deleteExistingRichMenus();
  const richMenuId = await createRichMenu();
  await uploadImage(richMenuId);
  await setDefaultRichMenu(richMenuId);

  console.log('\n==============================================');
  console.log('  ✅ Rich Menu 設定完成！');
  console.log('  打開 LINE 官方帳號即可看到新選單。');
  console.log('==============================================');
  console.log('\n⚠️  以下項目需在 LINE Manager 後台手動設定：');
  console.log('   1. 加入好友歡迎訊息');
  console.log('   2. 六組關鍵字自動回覆');
  console.log('   → 詳見 line/setup-guide.md\n');
}

main().catch(e => {
  console.error('\n❌ 錯誤：', e.message);
  process.exit(1);
});
