'use strict';

/* ============================================================
 * 行程資料模型與顯示文字
 * 行程：{ id, title, memo, start, end, startTime, endTime,
 *         colorMode, color1, color2, category, trpg }
 * ============================================================ */

const saveEvents = () => save(KEY.events, events);
const eventById = (id) => events.find((x) => x.id === id);
const eventsForDay = (ds) => events.filter((e) => e.start <= ds && e.end >= ds);
// 計算空檔時只看會佔用時間的行程（勾選「不影響空檔」的只是記錄）
const blockingEventsForDay = (ds) => eventsForDay(ds).filter((e) => !e.noBlock);
// 直播行程有自己的一份行程（streamEvents）。行程視窗用 kind 區分改的是哪一份。
const saveStreamEvents = () => save(KEY.streamEvents, streamEvents);
const listOf = (kind) => (kind === 'stream' ? streamEvents : events);
const saveList = (kind) => (kind === 'stream' ? saveStreamEvents() : saveEvents());
const streamEventsForDay = (ds) => streamEvents.filter((e) => e.start <= ds && e.end >= ds);
const gradientCss = (c1, c2) => `linear-gradient(90deg,${c1},${c2})`;
const eventBg = (ev) => (ev.colorMode === 'gradient' ? gradientCss(ev.color1, ev.color2) : ev.color1);
// 行程底色太亮、白字看不清楚時改用黑字：以底色（漸層取兩端平均）的亮度算出與白色的對比度
function eventNeedsDarkText(ev) {
  const colors = ev.colorMode === 'gradient' ? [ev.color1, ev.color2] : [ev.color1];
  const lum = colors.reduce((s, c) => s + luminance(c || DEFAULT_EVENT_COLORS.c1), 0) / colors.length;
  return 1.05 / (lum + 0.05) < MIN_WHITE_CONTRAST;
}

// ── 時間顯示 ───────────────────────────────────────────────
// 24:00 在 12 小時制顯示為 12:00 AM
function fmtTime(hhmm) {
  if (timeFmt === 24) return hhmm;
  const [h, m] = hhmm.split(':').map(Number);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad2(m)} ${h % 24 < 12 ? 'AM' : 'PM'}`;
}
// 提示文字用：「19:00～21:00 」（皆可留空＝全天）
function timeText(ev) {
  if (!ev.startTime && !ev.endTime) return '';
  return (ev.startTime ? fmtTime(ev.startTime) : '') + (ev.endTime ? `～${fmtTime(ev.endTime)}` : '') + ' ';
}

// ── TRPG 資訊 ──────────────────────────────────────────────
// GM／系統／劇本名 → 【TRPG】GM - 系統 《劇本名》（缺哪項就省略哪段）
function trpgText(t) {
  if (!t) return '';
  const head = [t.gm, t.system].map((x) => (x || '').trim()).filter(Boolean).join(' - ');
  const script = (t.script || '').trim();
  const body = [head, script ? `《${script}》` : ''].filter(Boolean).join(' ');
  return body ? `【TRPG】${body}` : '';
}
// 同行者：每人一行輸入、存成陣列；顯示時接在名稱後面「 with A、B」
const parsePeople = (text) => text.split('\n').map((s) => s.trim()).filter(Boolean);
const peopleText = (ev) => (ev.people && ev.people.length ? ` with ${ev.people.join('、')}` : '');
// 類別若設定了「標題前綴」（例：實況），標題前自動加【前綴】；標題已自己寫了就不重複
function catPrefix(ev) {
  const c = categories.find((x) => x.id === ev.category);
  if (!c || !c.tag) return '';
  const p = `【${c.tag}】`;
  return (ev.title || '').startsWith(p) ? '' : p;
}
// 兩筆行程的差異（匯入時發現重複、要問使用者要不要覆蓋用）：回傳 [[項目, 目前, 新的], …]，一模一樣就是空陣列
const catNameOf = (id) => { const c = categories.find((x) => x.id === id); return c ? c.name || '（未命名）' : '（無）'; };
const DIFF_FIELDS = [
  ['標題', (e) => e.title || '（空白）'], ['開始日', (e) => e.start], ['結束日', (e) => e.end],
  ['開始時間', (e) => e.startTime || '（未填）'], ['結束時間', (e) => e.endTime || '（未填）'],
  ['類別', (e) => catNameOf(e.category)],
  ['顏色', (e) => (e.colorMode === 'gradient' ? `${e.color1} → ${e.color2}` : e.color1)],
  ['同行者', (e) => (e.people && e.people.length ? e.people.join('、') : '（無）')],
  ['說明', (e) => e.detail || '（無）'], ['貼紙', (e) => `${(e.stickers || []).length} 張`],
];
const eventDiff = (a, b) => DIFF_FIELDS.map(([label, get]) => [label, get(a), get(b)]).filter(([, x, y]) => x !== y);

// 行程在畫面上顯示的名稱：有填 TRPG 欄位就用組合文字（本身已含【TRPG】），否則「類別前綴＋標題」；有同行者就接在後面
function evName(ev) {
  // 直播行程裡的 TRPG 行程不顯示 GM 與同行者
  if (catIsTrpg(ev.category) && streamEvents.includes(ev)) return trpgTextNoGm(ev.trpg) || catPrefix(ev) + (ev.title || '（未命名）');
  return (trpgText(ev.trpg) || catPrefix(ev) + (ev.title || '（未命名）')) + peopleText(ev);
}

// ── 類別 ───────────────────────────────────────────────────
const catIsTrpg = (id) => !!(categories.find((c) => c.id === id) || {}).trpg;

// 直播行程的 TRPG 行程：不顯示 GM 名字與同行者；TRPG 欄位組出的文字（【TRPG】系統 《劇本》）直接寫進標題，
// 這樣在直播行程的「每天的設定」就是一般的標題欄，可以直接改字（原本標題是空的，畫面上的字是另外組出來的）。
const trpgTextNoGm = (t) => (t ? trpgText({ ...t, gm: '' }) : '');
function materializeTrpg(ev) {
  if (!catIsTrpg(ev.category)) return;
  const text = trpgTextNoGm(ev.trpg);
  if (text) { ev.title = text; ev.trpg = null; }
  ev.people = [];
}
// 舊的直播行程（匯入時還帶著 TRPG 欄位）啟動時整理一次；整理過的再跑也不會變
function migrateStreamTrpg() {
  const snap = () => JSON.stringify(streamEvents.map((e) => [e.title, e.trpg, e.people]));
  const before = snap();
  streamEvents.forEach(materializeTrpg);
  if (snap() !== before) saveStreamEvents();
}
migrateStreamTrpg();
const catBg = (c) => (c.mode === 'gradient' ? gradientCss(c.c1, c.c2) : c.c1);
const saveCategories = () => save(KEY.cats, categories);
