'use strict';

/* ============================================================
 * 應用程式狀態：啟動時從 localStorage 讀入，之後由各模組修改並自行存檔
 * ============================================================ */

// ── 檢視 ───────────────────────────────────────────────────
let viewYear = new Date().getFullYear();
let currentMonth = 0;
// 直播行程：週曆或月曆、目前看的是哪一天所在的週／月
let streamMode = ['year', 'month', 'log'].includes(loadRaw(KEY.streamMode)) ? loadRaw(KEY.streamMode) : 'week';
let streamAnchor = toDs(new Date());
// 直播行程有自己的一份行程（從行事曆「匯入」進來的複本，之後各改各的）
let streamEvents = load(KEY.streamEvents, []);
// 直播行程外觀設定、每天的個別設定（休息日、強調、徽章、貼圖，以日期為鍵）、自己存的配色
let streamSettings = Object.assign(clone(STREAM_DEFAULTS), load(KEY.streamSet, {}));
let streamDays = load(KEY.streamDays, {});
let streamPalettes = load(KEY.streamPalettes, []);

// ── 行程資料 ───────────────────────────────────────────────
let events = load(KEY.events, []);
let colorHistory = load(KEY.colorHist, []);          // [{mode, c1, c2}]，最近使用在前
let categories = load(KEY.cats, null) || clone(DEFAULT_CATEGORIES);
// v0.21 曾用行程上的 stream 旗標決定直播行程內容；改成「匯入複本」後，把有旗標的行程搬進直播行程（只做一次）
function migrateStreamFlags() {
  if (loadRaw(KEY.streamMigrated)) return;
  const flagged = events.filter((e) => e.stream);
  flagged.forEach((e) => { streamEvents.push({ ...clone(e), id: uid(), sourceId: e.id }); });
  events.forEach((e) => { delete e.stream; });
  if (flagged.length) { save(KEY.streamEvents, streamEvents); save(KEY.events, events); }
  saveRaw(KEY.streamMigrated, '1');
}
migrateStreamFlags();
// 圖片貼紙改成跟著「每一場直播」走（每場最多 5 張）：把舊的「每天共用」貼紙搬到當天第一場（只做一次；當天沒有行程的先留著，畫面仍會顯示）
function migrateDayStickers() {
  if (loadRaw(KEY.stkMigrated)) return;
  let moved = false;
  Object.keys(streamDays).forEach((ds) => {
    const cfg = streamDays[ds];
    if (!cfg || !Array.isArray(cfg.stickers) || !cfg.stickers.length) return;
    const first = streamEvents.filter((e) => e.start === ds).sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''))[0];
    if (!first) return;
    first.stickers = [...(first.stickers || []), ...cfg.stickers].slice(0, 5);
    delete cfg.stickers;
    moved = true;
  });
  if (moved) { save(KEY.streamEvents, streamEvents); save(KEY.streamDays, streamDays); }
  saveRaw(KEY.stkMigrated, '1');
}
migrateDayStickers();
// 舊版（v0.05）存下的預設類別沒有 trpg 旗標，補上
categories.forEach((c) => { if (c.trpg === undefined) c.trpg = c.id === 'cat_play' || c.id === 'cat_gm'; });
// v0.19 新增「實況」範例類別（標題自動加【實況】）。只補一次，使用者刪掉之後不會再冒出來
if (!loadRaw(KEY.seedLive)) {
  if (!categories.some((c) => c.id === 'cat_live')) categories.push(clone(DEFAULT_CATEGORIES.find((c) => c.id === 'cat_live')));
  save(KEY.cats, categories);
  saveRaw(KEY.seedLive, '1');
}
let trpgSystems = load(KEY.systems, []);             // 曾填寫過的 TRPG 系統，最近使用在前

// ── 顯示偏好 ───────────────────────────────────────────────
let theme = loadRaw(KEY.theme) ||
  (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
let weekStart = loadRaw(KEY.weekStart) === '0' ? 0 : 1; // 0=週日開頭, 1=週一開頭
let timeFmt = loadRaw(KEY.timeFmt) === '12' ? 12 : 24;  // 只影響顯示；填寫一律 24 小時制

// 背景與配色：有存過就沿用（亮暗共用），否則用目前主題的預設
function loadBg() {
  const d = clone(BG_DEFAULTS[theme]), s = load(KEY.bg, null);
  if (s) {
    if (s.mode) d.mode = s.mode;
    if (s.colors) d.colors = s.colors;
    if (s.angle !== undefined) d.angle = s.angle;
    Object.assign(d.pattern, s.pattern || {});
    Object.assign(d.image, s.image || {});
  }
  return d;
}
// 文字／邊框色「每個主題各存一份」（背景則亮暗共用）：切換主題時，標題等文字才會跟著換成適合該主題的顏色。
// 亮色沿用原本的鍵名，暗色加 _dark。
const colorsKey = (t) => (t === 'dark' ? KEY.colors + '_dark' : KEY.colors);
// 舊版（v0.08～v0.17）亮暗共用同一份：若存的是淺色文字，代表是在暗色主題下設定的，搬到暗色那一份
function migrateSharedColors() {
  const old = load(KEY.colors, null);
  if (!old || !old.text || load(colorsKey('dark'), null)) return;
  if (luminance(old.text) > 0.5) { save(colorsKey('dark'), old); try { localStorage.removeItem(KEY.colors); } catch (e) { /* 忽略 */ } }
}
function loadColors() { return Object.assign({}, COLORS_DEFAULTS[theme], load(colorsKey(theme), null) || {}); }
migrateSharedColors();
let calColors = loadColors();
let bgSettings = loadBg();
let bgDraft = null; // 背景視窗中尚未套用的草稿

// ── 編輯中的暫存狀態 ───────────────────────────────────────
let editingId = null;     // 正在編輯的行程 id（null＝新增）
let editKind = 'main';   // 行程視窗正在編輯哪一份：'main'＝私人行程、'stream'＝直播行程的複本
let selectedCat = null;   // 行程視窗中選取的類別 id
let colorMode = 'solid';  // 行程視窗的顏色模式
let isDragging = false, dragStart = null, dragEnd = null; // 拖曳選取日期範圍
let moving = null;        // 拖曳移動行程：{ id, offset }
let pendingMove = null;   // 等待「移動／複製」回答：{ id, start, end }

// ── 週首相關的日期計算 ─────────────────────────────────────
const firstCol = (y, m) => (dowOf(y, m, 1) - weekStart + 7) % 7;                      // 月初前的空白格數
const weekOrder = () => Array.from({ length: 7 }, (_, i) => (weekStart + i) % 7);      // 欄位 → 實際星期
