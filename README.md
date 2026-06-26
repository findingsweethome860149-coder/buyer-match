# Finding Sweet Home CRM

**愛家的綸 — 高雄不動產顧問 張家綸**

> 孩子在哪長大，我比你還在乎。

---

## 專案概覽

本專案為「Finding Sweet Home CRM」模組化系統。

採**新增 Module**方式擴充，各階段互不影響。

| 階段 | 狀態 | 內容 |
|------|------|------|
| Phase 1 | ✅ 完成 | LINE 官方帳號品牌更新 |
| Phase 2 | 🔜 預留 | WordPress 知識庫、CRM、LINE Push |
| Phase 3 | 🔜 預留 | AI × Claude 整合 |

---

## 品牌資訊

| 項目 | 內容 |
|------|------|
| 品牌 | 愛家的綸 / Finding Sweet Home |
| 顧問 | 張家綸 |
| 服務區域 | 高雄左營、三民 |
| 電話 | 0987-860149 |
| LINE ID | andrea773 |
| WordPress | https://www.findingsweethomekh.com/ |
| 電子名片 | https://findingsweethome860149-coder.github.io/buyer-match/card.html |

---

## Phase 1 — LINE 官方帳號

### 檔案結構

```
line/
├── config.js          ← 品牌設定中心（所有網址、文字、色碼）
├── rich-menu.json     ← Rich Menu 規格與動作設定
├── messages.json      ← 歡迎訊息 & 關鍵字自動回覆
├── brand-guide.md     ← 品牌視覺指南
└── setup-guide.md     ← LINE 後台操作步驟

card.html              ← 電子名片（GitHub Pages 公開）
```

### Rich Menu（六格）

```
┌────────────┬────────────┬────────────┐
│ 🏠 我要找房 │ 🔑 我要賣房 │ 💰 免費估價 │
├────────────┼────────────┼────────────┤
│ 🎓 學區宅  │ 📰 房市文章 │ 👤 認識家綸 │
└────────────┴────────────┴────────────┘
```

### 關鍵字自動回覆

| 關鍵字 | 回覆內容 |
|--------|----------|
| 找房 / 買房 / 我要找房 | 買方需求登記 |
| 賣房 / 委託 / 我要賣房 | 屋主委託說明 |
| 估價 / 免費估價 | 估價需求收集 |
| 學區 / 學區宅 | 高雄學區宅指南 |
| 文章 / 房市 | WordPress 入口 |
| 家綸 / 聯絡 | 電子名片連結 |

### 品牌色

| 色名 | HEX |
|------|-----|
| 深綠 | `#124734` |
| 墨綠 | `#0B2F24` |
| 金色 | `#D4AF37` |
| 米白 | `#F8F6F0` |

### 設定說明

完整步驟請見 [`line/setup-guide.md`](line/setup-guide.md)

---

## Phase 2 預留 Module（不實作）

- WordPress Knowledge Module
- GitHub CRM（buyer / seller / valuation / school / reports）
- LINE Push Notification
- Weekly Report
- Article Recommendation

---

## Phase 3 預留（不實作）

- Claude AI 整合
- CRM 自動化
- LINE × WordPress × GitHub 全串接

---

## 開發規範

- 所有功能**模組化**，新增 Module 不修改既有程式
- 所有網址與文字統一於 `line/config.js`
- Rich Menu、品牌色、WordPress 各自獨立可更新
- **不寫死，不全部耦合**

---

## 聯絡

張家綸 — 愛家的綸
📞 0987-860149 ｜ LINE: andrea773
