// =============================================================
// Finding Sweet Home CRM — LINE Module Config
// Phase 1 : Brand & LINE Official Account
// =============================================================
// 所有品牌資訊、網址、文字集中於此。
// 未來各 Module 只讀此 config，不得寫死。
// =============================================================

const BRAND = {
  name_zh:    "愛家的綸",
  name_en:    "Finding Sweet Home",
  agent_name: "張家綸",
  title:      "高雄不動產顧問",
  regions:    ["左營", "三民"],
  phone:      "0987-860149",
  line_id:    "andrea773",
  tagline:    "孩子在哪長大，我比你還在乎。",
};

const URLS = {
  wordpress: "https://www.findingsweethomekh.com/",
  card:      "https://findingsweethome860149-coder.github.io/buyer-match/card.html",
  // Phase 2 預留
  buyer_form:     null,
  seller_form:    null,
  valuation_form: null,
  school_guide:   null,
};

const COLORS = {
  deep_green: "#124734",
  ink_green:  "#0B2F24",
  gold:       "#D4AF37",
  cream:      "#F8F6F0",
};

// Rich Menu 六格設定
// action.uri 未來直接換成各 Module 入口
const RICH_MENU = {
  name: "愛家的綸 主選單",
  chat_bar_text: "功能選單",
  cells: [
    {
      id: "buy",
      label:   "我要找房",
      emoji:   "🏠",
      keyword: ["找房", "買房", "我要找房"],
      action:  { type: "message", text: "我要找房" },
    },
    {
      id: "sell",
      label:   "我要賣房",
      emoji:   "🔑",
      keyword: ["賣房", "委託", "我要賣房"],
      action:  { type: "message", text: "我要賣房" },
    },
    {
      id: "valuation",
      label:   "免費估價",
      emoji:   "💰",
      keyword: ["估價", "免費估價"],
      action:  { type: "message", text: "免費估價" },
    },
    {
      id: "school",
      label:   "學區宅",
      emoji:   "🎓",
      keyword: ["學區", "學區宅"],
      action:  { type: "message", text: "學區宅" },
    },
    {
      id: "article",
      label:   "房市文章",
      emoji:   "📰",
      keyword: ["文章", "房市"],
      action:  { type: "uri", uri: URLS.wordpress },
    },
    {
      id: "about",
      label:   "認識家綸",
      emoji:   "👤",
      keyword: ["家綸", "聯絡"],
      action:  { type: "uri", uri: URLS.card },
    },
  ],
};

// 關鍵字回覆訊息
// reply 為 LINE Messaging API flex message 或 text
const AUTO_REPLY = {
  buy: {
    triggers: ["找房", "買房", "我要找房"],
    reply: `🏠 *買方需求登記*

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
  sell: {
    triggers: ["賣房", "委託", "我要賣房"],
    reply: `🔑 *屋主委託*

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
  valuation: {
    triggers: ["估價", "免費估價"],
    reply: `💰 *免費房屋估價*

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
  school: {
    triggers: ["學區", "學區宅"],
    reply: `🎓 *高雄學區宅指南*

左營、三民最熱門學區宅資訊：

🏫 左營區：
  新上國小 / 左營國中 / 左營高中

🏫 三民區：
  民族國小 / 陽明國中 / 高雄高中

需要學區地圖或目前在售物件？
請直接告訴我 📍

📞 0987-860149`,
  },
  article: {
    triggers: ["文章", "房市"],
    reply: `📰 *房市文章*

最新高雄房市分析、換屋攻略、
學區宅指南，盡在：

🔗 ${URLS.wordpress}

歡迎訂閱，掌握第一手資訊 📊`,
  },
  about: {
    triggers: ["家綸", "聯絡"],
    reply: `👤 *認識愛家的綸*

張家綸 — 高雄不動產顧問
服務區域：左營、三民

${BRAND.tagline}

📱 LINE ID：${BRAND.line_id}
📞 電話：${BRAND.phone}
🔗 電子名片：${URLS.card}`,
  },
};

// Welcome Message（加入好友時觸發）
const WELCOME_MESSAGE = `你好，我是愛家的綸 張家綸 👋

高雄左營、三民專業不動產顧問。

${BRAND.tagline}

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

// =============================================================
// Phase 2 Module 預留（不實作，僅佔位）
// =============================================================
const PHASE2_MODULES = {
  wordpress_knowledge: null,
  github_crm:          null,
  buyer_match:         null,
  seller_crm:          null,
  line_push:           null,
  weekly_report:       null,
  article_recommend:   null,
};

// Phase 3 預留
const PHASE3_AI = {
  claude_integration: null,
};

module.exports = {
  BRAND,
  URLS,
  COLORS,
  RICH_MENU,
  AUTO_REPLY,
  WELCOME_MESSAGE,
  PHASE2_MODULES,
  PHASE3_AI,
};
