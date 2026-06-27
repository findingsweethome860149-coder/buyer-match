// 產生 Rich Menu 圖片 (1200x810 px)
// 使用 Playwright + Chromium headless 截圖

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const OUT_PATH = path.join(__dirname, 'rich-menu.png');

const HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: 1200px; height: 810px; overflow: hidden; background: #0B2F24; font-family: 'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', sans-serif; }
  .grid {
    display: grid;
    grid-template-columns: repeat(3, 400px);
    grid-template-rows: repeat(2, 405px);
    width: 1200px;
    height: 810px;
    border: 2px solid #D4AF37;
  }
  .cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    border: 1px solid #D4AF37;
    cursor: pointer;
    position: relative;
    gap: 16px;
    transition: background 0.2s;
  }
  .cell::before {
    content: '';
    position: absolute;
    inset: 0;
    background: rgba(212, 175, 55, 0);
  }
  .icon {
    font-size: 90px;
    line-height: 1;
    filter: drop-shadow(0 2px 8px rgba(212,175,55,0.4));
  }
  .label {
    color: #F8F6F0;
    font-size: 60px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-shadow: 0 1px 4px rgba(0,0,0,0.5);
  }
  .divider {
    width: 40px;
    height: 2px;
    background: #D4AF37;
    border-radius: 1px;
  }
  /* 底部品牌署名 */
  .brand-bar {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 0;
  }
</style>
</head>
<body>
<div class="grid">
  <div class="cell">
    <div class="icon">🏠</div>
    <div class="divider"></div>
    <div class="label">我要找房</div>
  </div>
  <div class="cell">
    <div class="icon">🔑</div>
    <div class="divider"></div>
    <div class="label">我要賣房</div>
  </div>
  <div class="cell">
    <div class="icon">💰</div>
    <div class="divider"></div>
    <div class="label">免費估價</div>
  </div>
  <div class="cell">
    <div class="icon">🎓</div>
    <div class="divider"></div>
    <div class="label">學區宅</div>
  </div>
  <div class="cell">
    <div class="icon">📰</div>
    <div class="divider"></div>
    <div class="label">房市文章</div>
  </div>
  <div class="cell">
    <div class="icon">👤</div>
    <div class="divider"></div>
    <div class="label">認識家綸</div>
  </div>
</div>
</body>
</html>`;

async function generate() {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1200, height: 810 });
  await page.setContent(HTML, { waitUntil: 'load' });
  await page.waitForTimeout(500);
  await page.screenshot({ path: OUT_PATH, clip: { x: 0, y: 0, width: 1200, height: 810 } });
  await browser.close();
  console.log(`✅ Rich Menu 圖片已產生：${OUT_PATH} (${fs.statSync(OUT_PATH).size} bytes)`);
}

generate().catch(e => { console.error(e); process.exit(1); });
