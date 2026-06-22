/**
 * 好屋網 C306A008 物件圖片抓取腳本
 * 執行前請先安裝：npm install puppeteer
 * 執行方式：node scrape-images.js
 */

const puppeteer = require('puppeteer');
const fs = require('fs');

const TARGET_URL = 'https://www.hbhousing.com.tw/franchise/broker/C306A008/broker_list.aspx';

(async () => {
  console.log('啟動瀏覽器...');
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();

  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );
  await page.setViewport({ width: 1280, height: 900 });

  console.log('開啟頁面：', TARGET_URL);
  await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 30000 });

  // 等待物件列表載入
  await page.waitForSelector('img', { timeout: 10000 }).catch(() => {
    console.log('警告：找不到圖片元素，頁面可能需要登入或格式不同');
  });

  const results = await page.evaluate(() => {
    const items = [];

    // 嘗試抓取常見的物件卡片結構
    const cards = document.querySelectorAll(
      '.house-item, .property-item, .list-item, [class*="house"], [class*="property"], li[data-id], .item-box'
    );

    if (cards.length > 0) {
      cards.forEach(card => {
        const img = card.querySelector('img');
        const titleEl = card.querySelector('[class*="title"], h2, h3, .name');
        const priceEl = card.querySelector('[class*="price"]');
        const addrEl = card.querySelector('[class*="addr"], [class*="address"]');
        const snEl = card.querySelector('[class*="sn"], [class*="no"], [data-sn]');

        items.push({
          sn: snEl ? (snEl.textContent.trim() || snEl.dataset.sn) : '',
          title: titleEl ? titleEl.textContent.trim() : '',
          price: priceEl ? priceEl.textContent.trim() : '',
          addr: addrEl ? addrEl.textContent.trim() : '',
          img: img ? (img.src || img.dataset.src || img.dataset.lazySrc) : '',
        });
      });
    } else {
      // fallback：直接抓所有圖片
      document.querySelectorAll('img').forEach(img => {
        const src = img.src || img.dataset.src || img.dataset.lazySrc || '';
        if (src && !src.includes('logo') && !src.includes('icon') && src.startsWith('http')) {
          items.push({ img: src, title: img.alt || '', sn: '', price: '', addr: '' });
        }
      });
    }

    return items;
  });

  await browser.close();

  if (results.length === 0) {
    console.log('未抓到任何物件，請檢查頁面結構是否改變。');
    return;
  }

  console.log(`\n共抓到 ${results.length} 筆物件：\n`);
  results.forEach((item, i) => {
    console.log(`[${i + 1}] ${item.title || '(無標題)'}`);
    console.log(`    編號：${item.sn || '-'}`);
    console.log(`    地址：${item.addr || '-'}`);
    console.log(`    價格：${item.price || '-'}`);
    console.log(`    圖片：${item.img || '(無圖)'}`);
    console.log('');
  });

  const outputFile = 'scraped-properties.json';
  fs.writeFileSync(outputFile, JSON.stringify(results, null, 2), 'utf8');
  console.log(`結果已儲存到 ${outputFile}`);
})();
