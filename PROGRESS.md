# Finding Sweet Home CRM — 開發記錄

---

## Phase 1 ✅ 完成（2026-06-26）

### 完成項目

| 項目 | 說明 |
|------|------|
| Rich Menu 六格 | 墨綠金色品牌風格，自動上傳 LINE |
| 加入好友歡迎訊息 | Webhook 自動回覆，無需手動 |
| 六組關鍵字自動回覆 | 找房/賣房/估價/學區/文章/聯絡 |
| 品牌視覺指南 | 色票、字型、設計規範 |
| LINE 設定文件 | 後台操作步驟 |
| Webhook 伺服器 | Railway 雲端，24小時運行 |

### 系統架構

```
GitHub (buyer-match)
├── line/
│   ├── config.js          ← 品牌設定中心
│   ├── rich-menu.json     ← Rich Menu 規格
│   ├── rich-menu.png      ← Rich Menu 圖片
│   ├── messages.json      ← 訊息文字
│   ├── brand-guide.md     ← 品牌視覺指南
│   ├── setup-guide.md     ← LINE 後台說明
│   ├── setup-line.js      ← Rich Menu 自動上傳
│   └── set-webhook.js     ← Webhook URL 設定
├── webhook/
│   ├── index.js           ← Webhook 伺服器主程式
│   └── package.json
└── card.html              ← 電子名片

Railway (雲端伺服器)
└── buyer-match-production.up.railway.app/webhook
```

### LINE 帳號資訊

| 項目 | 內容 |
|------|------|
| Bot ID | @898jvoyx |
| Webhook | https://buyer-match-production.up.railway.app/webhook |
| Railway 專案 | natural-youth |

---

## Phase 2 🔜 待開發

### 優先順序

1. **WordPress 知識庫 Module**
   - 串接 https://www.findingsweethomekh.com/
   - 關鍵字觸發文章推薦
   - 新文章自動 LINE 推播

2. **買方 CRM Module**
   - LINE 收集買方需求表單
   - GitHub 儲存買方資料
   - 自動配對物件

3. **賣方 CRM Module**
   - 屋主委託登記
   - 物件資料管理

4. **LINE Push 通知**
   - 新物件通知
   - 市場行情週報

5. **估價 Module**
   - 自動收集估價需求
   - 回報機制

### 升級方式
- 每個 Module 獨立新增到 `webhook/modules/`
- 在 `line/config.js` 登記新功能
- 不修改既有程式

---

## Phase 3 🔜 待開發

### AI 整合計畫

- **Claude AI** 串接，自動回答房市問題
- 智慧配對買方需求與物件
- 自動產生每週市場分析報告
- LINE × WordPress × GitHub 全串接

---

## 技術筆記

### 新增關鍵字回覆
編輯 `webhook/index.js` 的 `REPLIES` 陣列，新增一組：
```js
{
  triggers: ['關鍵字1', '關鍵字2'],
  text: '回覆內容',
}
```
推送 GitHub → Railway 自動更新，不需重啟。

### 修改 Rich Menu
1. 修改 `line/rich-menu.png`（設計新圖片）
2. 執行 `node line/setup-line.js`

### 修改品牌設定
所有網址、文字、色碼集中在 `line/config.js`。

---

*最後更新：2026-06-26*
