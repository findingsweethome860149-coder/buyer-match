# AI Investment OS Lite

> 陪伴台灣小資族建立投資紀律的 AI 教練 App

**Version:** 1.0.0  
**Status:** Release  
**Type:** Pure Frontend SPA（無需伺服器，無需帳號）

---

## 產品定位

AI Investment OS Lite 是一位陪跑教練。

- 不報明牌
- 不替你下決定
- 陪你建立屬於自己的投資紀律
- 記錄每一筆交易的「為什麼」

---

## 核心功能

| 功能 | 說明 |
|------|------|
| Dashboard | AI 每日摘要、資產總覽、目標追蹤 |
| 交易記錄 | 買入 / 賣出 / 入金 / 出金，自動計算手續費與證交稅 |
| 投資組合 | 持股明細、已實現/未實現 P&L、健康度評分 |
| 觀察清單 | 目標買入價追蹤、AI 吸引力評分 |
| Goal Tracker | 投資目標設定、進度追蹤、預估完成日期 |
| 備份/還原 | JSON 匯出匯入，完整原子寫入 |
| PIN 保護 | 4 位數 PIN，FNV-1a hash，5 次失敗鎖定 |
| LINE 整合 | 透過 LINE 新增交易，Dashboard 自動同步 |

---

## 快速開始

### 1. 純前端部署（推薦）

```bash
# 直接用瀏覽器開啟
open investment-os/index.html

# 或使用任意靜態伺服器
npx serve investment-os
python3 -m http.server 8080 --directory investment-os
```

不需要安裝任何依賴。所有資料儲存於瀏覽器 `localStorage`。

### 2. LINE Integration（選用）

LINE 指令功能需要額外的 Webhook 伺服器：

```bash
cd server
cp .env.example .env
# 填入 LINE_CHANNEL_SECRET 和 LINE_ACCESS_TOKEN
npm install
npm start
```

啟動後，在 App 設定頁面填入伺服器網址，即可透過 LINE 新增交易。

---

## 專案結構

```
investment-os/          # 前端 App（純靜態）
├── index.html          # 唯一入口
├── css/
│   └── app.css         # 深色/淺色雙主題，CSS Variables
└── js/
    ├── db.js           # Repository Pattern — 唯一 localStorage 存取點
    ├── utils.js        # 共用工具、台股常數（手續費率、證交稅）
    ├── transaction.js  # 交易 CRUD
    ├── portfolio.js    # 持股計算（FIFO 成本基礎）
    ├── watchlist.js    # 觀察清單
    ├── ai.js           # AI 分析引擎（健康度 / 行為分析 / 評分）
    ├── security.js     # PIN 保護、稽核日誌
    ├── notification.js # Toast 通知
    ├── dashboard.js    # 純 Renderer（無業務邏輯）
    └── app.js          # 唯一協調者（Coordinator）

server/                 # LINE Webhook 伺服器（選用）
├── index.js            # Express webhook + sync API
├── lineService.js      # 指令解析（無 webhook 細節）
├── store.js            # JSON 檔案持久化
├── package.json
└── .env.example
```

---

## 架構原則

```
User Action
    ↓
TransactionModule.add()
    ↓
PortfolioModule.recalculate()
    ↓
AIModule.analyze()
    ↓
DashboardModule.render*()
    ↓
NotificationModule.toast()
```

- **Repository Pattern** — 所有 `localStorage` 存取透過 `db.js`，Key 前綴 `aios_`
- **Unidirectional Data Flow** — 資料只往一個方向流動
- **app.js 唯一協調者** — Module 間不直接互相呼叫
- **dashboard.js 純 Renderer** — 只讀取 AIModule（唯讀），不寫入任何 Module

---

## 台股計算規則

| 項目 | 規則 |
|------|------|
| 手續費 | 成交金額 × 0.1425%，最低 $20 NTD |
| 證交稅 | 賣出金額 × 0.3%（僅賣出） |
| 成本基礎 | FIFO |
| 損益計算 | (賣出價 - 均攤成本) × 股數 - 手續費 - 證交稅 |

---

## 支援的 LINE 指令

```
買 2330 3股 980       → 買入（需確認）
賣 2330 2股 1050      → 賣出（需確認）
入金 5000             → 入金（需確認）
出金 3000             → 出金（需確認）
新增 2330             → 加入觀察清單
今日                  → 提示至 Dashboard 查看
持股                  → 提示至 Dashboard 查看
觀察                  → 提示至 Dashboard 查看
確認                  → 確認上一筆操作
取消                  → 取消上一筆操作
```

---

## V1.1 Roadmap（未排入實作）

1. **PWA 支援** — Service Worker，可安裝至主畫面
2. **Push Notification** — 盤前摘要、目標價到達推播
3. **LINE Flex Message** — Rich 格式回覆
4. **Cloud Sync** — Firebase / Supabase 跨裝置同步
5. **分批買入計劃** — 定期定額排程
6. **年化報酬計算** — XIRR / TWR
7. **ETF 支援** — 台灣 ETF（0050 / 0056 等）
8. **股利記錄** — 現金股利 / 股票股利
9. **匯出 CSV/Excel** — 交易紀錄
10. **多帳號支援** — 切換不同投資帳戶