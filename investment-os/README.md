# AI Investment OS Lite

> 陪伴小資族建立投資紀律的 AI 陪跑教練。

## 專案結構

```
investment-os/
├── index.html              # 入口點（純結構，無商業邏輯）
├── css/
│   └── app.css             # 全域樣式
└── js/
    ├── db.js               # localStorage 資料層
    ├── utils.js            # 通用工具函數
    ├── app.js              # 應用入口、模組協調器
    ├── modules/
    │   ├── transaction.js  # 交易紀錄模組（只負責儲存）
    │   ├── portfolio.js    # 持倉模組（從交易重算，不直接被修改）
    │   ├── watchlist.js    # 觀察清單模組
    │   ├── ai.js           # AI 分析模組（唯讀，不寫資料）
    │   ├── dashboard.js    # 畫面渲染模組（無商業邏輯）
    │   ├── notification.js # 通知模組（不修改資料）
    │   └── security.js     # 安全模組（Audit Log、未來 PIN）
    └── plugins/            # 未來擴充（美股、ETF、Crypto）
```

## 架構原則

### 資料流（單向）
```
使用者操作
  → TransactionModule.add()
  → PortfolioModule.recalculate()
  → AIModule.analyze()
  → DashboardModule.render*()
  → NotificationModule.toast()
```

### 模組職責

| 模組 | 負責 | 不負責 |
|------|------|--------|
| Transaction | 所有交易紀錄的儲存 | 修改 Portfolio |
| Portfolio | 持倉、損益、現金計算 | 股票分析 |
| Watchlist | 觀察清單管理 | Portfolio |
| AI | 分析與建議 | 寫入任何資料 |
| Dashboard | 畫面渲染 | 商業邏輯 |
| Notification | 通知發送 | 修改資料 |
| Security | 認證、Audit Log | 股票資料 |

## V1 功能

- Dashboard：每日 AI 陪跑教練摘要
- Portfolio：持倉、損益、現金餘額、已實現損益
- Watchlist：觀察股票 + 目標買入價提醒
- Transaction：買入、賣出、入金、出金，含手續費
- Onboarding：首次使用設定投資目標

## 未來擴充（不影響 V1）

- LINE Assistant（需後端）
- Push Notification（需後端）
- 多使用者
- 雲端同步
- plugins/us_stock/
- plugins/etf/
- Mobile App
