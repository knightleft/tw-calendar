'use strict';

/* ============================================================
 * 設定與常數（不含任何邏輯）
 * 載入順序：config → util → state → holidays → events → theme
 *          → calendar → editor → tools → app
 * ============================================================ */

const DEFAULT_TITLE = '我的行事曆';
// 版號規則：每做一次新調整 +0.01；只是釐清上個需求則不加；
// 使用者確認定版後 +1 並將小數歸零（例：v0.07 → v1.00）
const VERSION = 'v0.63';

// localStorage 鍵名
const KEY = {
  events: 'tw_cal_events',
  title: 'tw_cal_title',
  bg: 'tw_cal_bg',
  colors: 'tw_cal_colors',
  colorHist: 'tw_cal_colorhist',
  width: 'tw_cal_width',
  theme: 'tw_cal_theme',
  weekStart: 'tw_cal_weekstart',
  timeFmt: 'tw_cal_timefmt',
  cats: 'tw_cal_categories',
  systems: 'tw_cal_trpgsystems',
  seedLive: 'tw_cal_seed_live',
  streamMode: 'tw_cal_streammode',
  streamEvents: 'tw_cal_streamevents',
  streamMigrated: 'tw_cal_stream_migrated',
  stkMigrated: 'tw_cal_stkmigrated',
  streamSet: 'tw_cal_streamset',
  streamDays: 'tw_cal_streamdays',
  streamPalettes: 'tw_cal_streampalettes',
  streamPanel: 'tw_cal_streampanel',
  streamLog: 'tw_cal_streamlog',
  twitch: 'tw_cal_twitch',
  logAuto: 'tw_cal_logauto',
  // 以下三個是同步用的本機暫存（tw_cal_sync_ 開頭的不會被同步）：上次同步到的雲端時間、是否有未同步的修改、改過的截圖 id
  syncLast: 'tw_cal_sync_last',
  syncDirty: 'tw_cal_sync_dirty',
  syncThumbs: 'tw_cal_sync_thumbs',
  syncMode: 'tw_cal_sync_mode', // 'google'（登入 Google 帳號）｜'folder'（本機資料夾）；沒有＝還沒設定
};

// Google 登入同步：用戶端 ID 是公開識別碼、不是密鑰，放在程式裡沒有安全問題（只有授權過的網站來源才能用）。
// 範圍只要 drive.appdata：只能讀寫「這個程式專用的隱藏空間」，碰不到使用者 Drive 裡的其他檔案
const GOOGLE_CLIENT_ID = '867188989861-rrqju4d83hdd8gtte7eo5psf93min23q.apps.googleusercontent.com';
const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';

const DOW_NAMES = ['日', '一', '二', '三', '四', '五', '六']; // 依 Date.getDay() 索引
const DEFAULT_CAL_WIDTH = 1200;
const COLOR_HISTORY_MAX = 10;
const SYSTEM_HISTORY_MAX = 50;
const SLOT = 30; // 空檔計算的最小單位（分鐘）
const CELL_ROWS = 5; // 月視圖每天的格子有幾「行」：第 1 行固定留給假日名，其餘放行程；行程放不下時最後 1 行放「+N」
const MIN_WHITE_CONTRAST = 2; // 底色與白字的對比度低於此值就改用黑字（約等於底色亮度 > 0.47）
const DEFAULT_EVENT_COLORS = { c1: '#f08aa8', c2: '#d9547e' };

// 預設背景／配色依亮暗主題而異；使用者一旦「套用」過自訂設定，切換主題時會沿用該設定
const BG_DEFAULTS = {
  light: {
    mode: 'gradient',
    colors: ['#fff5f8', '#fde7ee', '#fbd5e1'],
    angle: 135,
    pattern: { type: 'dots', base: '#fff5f8', color: '#f08aa8', size: 36, alpha: 45 },
    image: { data: '', fade: 50, fit: 'cover' },
  },
  dark: {
    mode: 'gradient',
    colors: ['#1f1a24', '#2a2230', '#33293a'],
    angle: 135,
    pattern: { type: 'dots', base: '#241e2a', color: '#f08aa8', size: 36, alpha: 30 },
    image: { data: '', fade: 50, fit: 'cover' },
  },
};
const COLORS_DEFAULTS = {
  light: { text: '#4a3b42', muted: '#75636b', border: '#f3d3dd', cardBg: '#ffffff', cardAlpha: 82 },
  dark: { text: '#f3e6ec', muted: '#b9a3ae', border: '#4a3b52', cardBg: '#000000', cardAlpha: 30 },
};
// 圖片背景用：底色、疊在圖片上的淡化層（RGB）、「依背景自動設定」時視為圖片的基準色
const THEME_TONE = {
  light: { page: '#fff5f8', overlay: '255,255,255', imageBase: '#ffffff' },
  dark: { page: '#1f1a24', overlay: '20,16,26', imageBase: '#14101a' },
};
const PATTERNS = [
  { id: 'dots', name: '圓點' }, { id: 'stripes', name: '斜紋' }, { id: 'check', name: '格子' },
  { id: 'grid', name: '方格線' }, { id: 'heart', name: '愛心' }, { id: 'star', name: '星星' },
];

// 首次使用時的範例類別
const DEFAULT_CATEGORIES = [
  { id: 'cat_play', name: 'TRPG・跑團', mode: 'solid', c1: '#6f9be8', c2: '#4f6fd0', trpg: true },
  { id: 'cat_gm', name: 'TRPG・帶團', mode: 'solid', c1: '#f0a35e', c2: '#d9803a', trpg: true },
  { id: 'cat_live', name: '實況', mode: 'solid', c1: '#b58ae8', c2: '#8f63d0', tag: '實況' },
];

// ── 直播行程外觀設定（版面設定視窗；參考 KumoTools 的 Stream Schedule Maker 的可編輯項目）──
// 字串欄位留空＝用自動／預設值
const STREAM_DEFAULTS = {
  // 文字
  title: '', titleAlign: 'center', eyebrow: '', eyebrowAlign: 'center', handle: '', note: '', eyebrowColor: '', handleColor: '', tzColor: '', noteColor: '', noteSize: 16, credit: '', creditPos: 'center', restMsg: '',
  font: 'default', fontName: '', titleColor: '', titleOutline: false, titleOutlineColor: '#ffffff', titleOutlineWidth: 2,
  // 日程
  lang: 'zh', tz: 'none',
  // 配色
  dayColorMode: 'default', dayColors: ['#fbd5e1', '#fde7ee', '#ffffff'],
  // 社群
  // 帳號在「⚙ 設定 → 社群帳號」填一次；版面設定只決定要不要顯示（soc*Show）
  socTwitch: '', socX: '', socYoutube: '', socBluesky: '', socOther: '',
  socTwitchShow: true, socXShow: true, socYoutubeShow: true, socBlueskyShow: true, socOtherShow: true,
  // 圖片（以 data URL 存在瀏覽器裡）
  avatar: '', avatarZoom: 100, avatarX: 50, avatarY: 50,
  bgImage: '', bgX: 50, bgY: 50, bgSize: 100, bgOpacity: 100,
  palImg: '', canvasBg: '',
  // 版面
  style: 'grid', corners: 'rounded', aspect: 'auto', align: 'left',
  activeOpacity: 100, restOpacity: 55, sparkles: false,
  // 年度直播回顧（年曆／月曆版面的外觀；空字串＝跟著一般背景與配色）
  rvTitle: '', rvSub: '', rvBg1: '', rvBg2: '', rvBgImage: '', rvBgFade: 35, rvText: '', rvCard: '', rvAccent: '', rvCols: 3, rvStats: true, rvSocials: false,
};
// 社群平台：[類別, 圖示, 名稱, 帳號提示, 帳號鍵名]
const SOCIALS = [
  ['twitch', '🎮', 'Twitch', 'twitch.tv/…', 'socTwitch'], ['x', '𝕏', 'X', '@…', 'socX'], ['youtube', '▶', 'YouTube', '@…', 'socYoutube'],
  ['bluesky', '🦋', '藍天 / Bluesky', 'name.bsky.social', 'socBluesky'], ['other', '✦', '其他', '', 'socOther'],
];
const RV_KEYS = Object.keys(STREAM_DEFAULTS).filter((k) => k.startsWith('rv'));
// 年度直播回顧的色系（背景兩色、文字、卡片、強調色）
const RV_PRESETS = [
  { name: '跟隨一般背景', c: { rvBg1: '', rvBg2: '', rvText: '', rvCard: '', rvAccent: '' } },
  { name: '莓果粉', c: { rvBg1: '#ffe4ec', rvBg2: '#fbc9d8', rvText: '#4a3b42', rvCard: '#ffffff', rvAccent: '#c2416d' } },
  { name: '海藍', c: { rvBg1: '#e3f0ff', rvBg2: '#b9d6f5', rvText: '#22344f', rvCard: '#ffffff', rvAccent: '#2f6bb5' } },
  { name: '薄荷', c: { rvBg1: '#e6f7ee', rvBg2: '#bfe8d2', rvText: '#244237', rvCard: '#ffffff', rvAccent: '#2f8f63' } },
  { name: '薰衣草', c: { rvBg1: '#f0e9ff', rvBg2: '#d6c8f5', rvText: '#3a2d57', rvCard: '#ffffff', rvAccent: '#7a52c7' } },
  { name: '夜色', c: { rvBg1: '#1f1a2e', rvBg2: '#3a2d57', rvText: '#f3e9ff', rvCard: '#2b2340', rvAccent: '#ff7aa8' } },
];

const STREAM_FONTS = {
  default: { name: '預設（黑體）', css: '' },
  rounded: { name: '圓體（Huninn）', css: '"Huninn", "Noto Sans TC", sans-serif', gf: 'Huninn' },
  maru: { name: '圓黑（Zen Maru Gothic）', css: '"Zen Maru Gothic", "Noto Sans TC", sans-serif', gf: 'Zen Maru Gothic' },
  serif: { name: '明體（Noto Serif TC）', css: '"Noto Serif TC", serif', gf: 'Noto Serif TC' },
  google: { name: '🌐 Google 字型（輸入名稱）', css: '' },
  local: { name: '💻 電腦裡的字型（輸入或選擇）', css: '' },
};
// 輸出語言：星期名稱、預設文字、月份標題
const EN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const STREAM_LANGS = {
  zh: {
    name: '🇹🇼 中文', dow: ['週日', '週一', '週二', '週三', '週四', '週五', '週六'], short: ['日', '一', '二', '三', '四', '五', '六'],
    eyebrowWeek: '✦ 本週直播時間表 ✦', eyebrowMonth: '✦ 本月直播時間表 ✦', rest: '休息日',
    month: (y, m) => `${y} 年 ${m + 1} 月`,
    note: '筆記',
  },
  en: {
    name: '🇬🇧 English', dow: ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'], short: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    eyebrowWeek: '✦ WEEKLY STREAM SCHEDULE ✦', eyebrowMonth: '✦ MONTHLY STREAM SCHEDULE ✦', rest: 'Rest Day',
    month: (y, m) => `${EN_MONTHS[m]} ${y}`,
    note: 'NOTE',
  },
  ja: {
    name: '🇯🇵 日本語', dow: ['日', '月', '火', '水', '木', '金', '土'], short: ['日', '月', '火', '水', '木', '金', '土'],
    eyebrowWeek: '✦ 今週の配信スケジュール ✦', eyebrowMonth: '✦ 今月の配信スケジュール ✦', rest: 'お休み',
    month: (y, m) => `${y}年${m + 1}月`,
    note: 'ノート',
  },
};
// 配色預設：日卡片 3 色＋畫布底色＋文字色（標題與星期名）
const STREAM_PRESETS = [
  { name: '粉彩', colors: ['#ffd1dc', '#c9a0f0', '#b5ead7'], bg: '#fff7de', title: '#5a3a4a' },
  { name: '玫瑰', colors: ['#ffe0ee', '#ffbcd1', '#ff9ab8'], bg: '#fff8fb', title: '#7a2f4d' },
  { name: '抹茶', colors: ['#d4ecd0', '#a6d49f', '#fff1c9'], bg: '#fffbe0', title: '#3d5a3a' },
  { name: '天空', colors: ['#cfe3ff', '#a8c0f5', '#ecd5ff'], bg: '#ffffff', title: '#34456e' },
  { name: '蜜桃', colors: ['#ffd2bf', '#ffab94', '#ffe27a'], bg: '#fff9ee', title: '#6b3a2a' },
  { name: '深夜', colors: ['#3b2f5a', '#5a4a85', '#e8a6c8'], bg: '#1a1626', title: '#f3e9ff' },
];
// 時區標示（只在畫面上標示，不會換算時間）
const STREAM_TZS = {
  none: { name: '不顯示' },
  auto: { name: '自動（瀏覽器）' },
  'Asia/Taipei': { name: '台北' }, 'Asia/Tokyo': { name: '東京' }, 'Asia/Seoul': { name: '首爾' },
  'Asia/Hong_Kong': { name: '香港' }, 'Asia/Singapore': { name: '新加坡' }, UTC: { name: 'UTC' },
  'America/Los_Angeles': { name: '洛杉磯' }, 'America/New_York': { name: '紐約' },
  'Europe/London': { name: '倫敦' }, 'Europe/Paris': { name: '巴黎' }, 'Australia/Sydney': { name: '雪梨' },
};

// 直播行程每天的「強調」「徽章」細項（勾選後才出現的選項）
const HL_STYLES = [['glow', '光暈'], ['thick', '粗框'], ['emboss', '浮凸'], ['shadow', '陰影']];
const BADGE_SHAPES = [['rounded', '圓角'], ['pill', '膠囊'], ['burst', '爆炸'], ['cloud', '雲朵'], ['heart', '愛心']];
const BADGE_SIZE = { min: 40, max: 120, def: 60 };
// 圖片貼紙：大小 px、旋轉度數、橫向位置（以卡片中心為 0，單位 % 卡片寬度）
const STICKER = { max: 5, size: { min: 20, max: 240, def: 80 }, rot: { min: -180, max: 180, def: 0 }, x: { min: -100, max: 100, def: 0 }, y: { min: -50, max: 100, def: 0 }, bw: { min: 0, max: 20, def: 0 }, newBw: 6, bc: '#ffffff' };
