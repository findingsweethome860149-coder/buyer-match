# CHANGELOG

All notable changes to AI Investment OS Lite are documented here.
Versioning follows [Semantic Versioning](https://semver.org/).

---

## [1.0.0] — 2026-06-27

### Initial Release

AI Investment OS Lite V1 — 陪伴台灣小資族建立投資紀律的 AI 教練 App。

### Features

#### Dashboard
- AI 每日一句建議（calm / notice / action 三種狀態）
- 總資產概覽（股票市值 + 現金餘額 + 未實現/已實現損益）
- Goal Tracker（目標進度條 + 預估完成月份）
- Portfolio 健康度摘要卡（home 頁面）
- 觀察清單前 5 檔快覽
- AI 通知（目標價到達提醒）

#### Transaction
- 支援：買入 / 賣出 / 入金 / 出金
- 手續費自動計算（台灣券商標準 0.1425%，最低 $20 NTD）
- 賣出自動計算 0.3% 證交稅
- 超賣防護（不得賣出超過持有量）
- 交易前二次確認
- Buy Thesis 下拉選單（長期投資 / 高殖利率 / 成長股 / 價值投資 / AI觀察 / 自訂）

#### Portfolio
- 從交易紀錄重新計算持股（FIFO 成本基礎）
- 已實現 P&L 精確計算
- 今日損益（以前日/更新價格差計算）
- Portfolio 健康度（0-100 分，四維度：集中度 / 現金比例 / 交易頻率 / 平均持有天數）
- 行為分析（追高紀錄 / 交易頻率 / 集中度 / Thesis 填寫率）

#### Watchlist
- 新增 / 刪除觀察股票
- 目標買入價設定
- AI 吸引力評分（0-100，五星評等）
- 目標價到達提醒（🎯 標記）
- 股票詳情 Modal（AI 分析 + 快速買入）

#### History
- 完整交易紀錄
- 篩選：類型 / 股票代號
- 排序：日期 / 金額
- 刪除（帶 Portfolio 重新計算）
- 證交稅顯示一致性修正

#### Settings
- 每月投資預算設定
- 目標金額設定
- 手續費率設定（預設 0.1425%）
- 深色 / 淺色模式切換
- 每月提醒日設定

#### Goal Tracker
- 投資目標選擇（第一桶金 / 買房基金等）
- 進度條（百分比）
- 預估完成月份（依每月預算計算）
- 達標提示「🎉 已達成目標！」

#### Security & Backup
- 4 位數 PIN 保護（FNV-1a hash，5 次失敗 30 秒鎖定）
- PIN 保護：App 啟動 / 設定頁面 / 匯入 / 清除資料
- JSON 備份匯出（`AIInvestmentOS_Backup_YYYYMMDD_HHMMSS.json`）
- JSON 還原匯入（原子寫入，失敗完整 rollback）
- 備份格式驗證
- localStorage 損毀偵測與 Recovery 畫面

#### LINE Integration (V1)
- Webhook 伺服器（`server/`，Node.js + Express）
- 支援指令：買 / 賣 / 入金 / 出金 / 新增 / 今日 / 持股 / 觀察
- 交易前 LINE 二次確認
- 前端每 15 秒自動輪詢同步
- 所有 LINE 操作透過現有 Module 處理，localStorage 維持 Single Source of Truth

#### Onboarding
- 4 步驟引導（歡迎 → 目標 → 預算 → 提醒日）
- 首次使用偵測

### Architecture
- Pure frontend SPA（無 build tools，無框架）
- Repository Pattern（`db.js`，唯一 localStorage 存取點）
- Module 分離：Transaction / Portfolio / Watchlist / AI / Security / Notification / Dashboard
- Unidirectional data flow：`Action → TransactionModule → PortfolioModule.recalculate() → DashboardModule.render*()`
- `app.js` 唯一協調者，Module 間不直接互呼

### Bug Fixes (Sprint 1–7)
- 修正 Watchlist 重複加入同一檔股票
- 修正 History 初始渲染遺漏證交稅
- 修正資料夾結構不符規格（js/modules/ → js/）
- 修正 dashboard.js 直接呼叫 TransactionModule / WatchlistModule（架構違規）
- 修正 dashboard.js 直接呼叫 SecurityModule（架構違規）
- 修正超賣未防護
- 修正 calcFee 最低手續費（原 $1 → $20 NTD）
- 修正 DB.importAll 非原子寫入（加入 snapshot/rollback）
- 修正 clearAllData 流程（PIN 驗證應在 confirm 之前）
- 修正 navigate('settings') 缺少 PIN 驗證
- 修正 exportData 檔名格式
- 移除所有 console.error / console.warn（Release build）
- 修正 FileReader 缺少 onerror 處理
- 修正 calcFee 多傳第 3 個參數（undefined behavior）

---

## [Unreleased — V1.1 Roadmap]

See README for V1.1 Roadmap items.
