'use strict';

/* ============================================================
 * 直播紀錄：把「哪天幾點、開了什麼台、標題、一張截圖」存下來
 *  - Twitch 的 VOD 只保留 7 天，所以要靠這份紀錄留住歷史
 *  - 資料（文字）存在 localStorage；截圖（比較大）存在 IndexedDB，key 是紀錄的 id
 *  - 可以手動新增／編輯；也可以填 Twitch 憑證後一鍵同步（讀取直播中狀態與最近的 VOD）
 * 紀錄：{ id, source: 'twitch'|'manual', streamId, videoId, startedAt(ISO), title, game,
 *         durationSec, url, hasThumb, thumbUrl(抓不到圖時保留的遠端網址), edited, live }
 * ============================================================ */

let streamLog = load(KEY.streamLog, []);
let twitchCfg = Object.assign({ login: '', clientId: '', token: '', userId: '' }, load(KEY.twitch, null) || {});
const saveStreamLog = () => save(KEY.streamLog, streamLog);
const saveTwitchCfg = () => save(KEY.twitch, twitchCfg);
// 新增、同步到的紀錄要不要自動加進行事曆（私人／直播各自）
let logAuto = Object.assign({ main: false, stream: false }, load(KEY.logAuto, null) || {});
const twitchReady = () => !!(twitchCfg.login.trim() && twitchCfg.clientId.trim() && twitchCfg.token.trim());

// ── 截圖：存在 IndexedDB（不放 localStorage，圖多了會塞滿）──────────
let logDb = null;
const logDbOpen = () => logDb || (logDb = new Promise((resolve, reject) => {
  const rq = indexedDB.open('twcal-streamlog', 1);
  rq.onupgradeneeded = () => rq.result.createObjectStore('thumbs');
  rq.onsuccess = () => resolve(rq.result);
  rq.onerror = () => reject(rq.error);
}));
async function idbOp(mode, fn) {
  const db = await logDbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('thumbs', mode), rq = fn(tx.objectStore('thumbs'));
    tx.oncomplete = () => resolve(rq && rq.result);
    tx.onerror = () => reject(tx.error);
  });
}
const thumbGet = (id) => idbOp('readonly', (s) => s.get(id));
const thumbPut = (id, blob) => { syncTouchThumb(id); return idbOp('readwrite', (s) => s.put(blob, id)); };
const thumbDel = (id) => { syncTouchThumb(id); return idbOp('readwrite', (s) => s.delete(id)); };
const thumbObjUrls = new Map();
async function thumbSrc(entry) {
  if (!entry.hasThumb) return entry.thumbUrl || '';
  if (thumbObjUrls.has(entry.id)) return thumbObjUrls.get(entry.id);
  try {
    const blob = await thumbGet(entry.id);
    if (!blob) return entry.thumbUrl || '';
    const url = URL.createObjectURL(blob);
    thumbObjUrls.set(entry.id, url);
    return url;
  } catch (e) { return entry.thumbUrl || ''; }
}
// 縮成 480×270 的 JPEG（裁成 16:9），一張約 20～40KB
async function toThumbBlob(source) {
  const bmp = await createImageBitmap(source);
  const W = 480, H = 270, k = Math.max(W / bmp.width, H / bmp.height);
  const cv = el('canvas', { width: W, height: H }), g = cv.getContext('2d');
  g.drawImage(bmp, (W - bmp.width * k) / 2, (H - bmp.height * k) / 2, bmp.width * k, bmp.height * k);
  return new Promise((resolve) => cv.toBlob(resolve, 'image/jpeg', 0.82));
}
async function setEntryThumb(entry, source) {
  const blob = await toThumbBlob(source);
  await thumbPut(entry.id, blob);
  if (thumbObjUrls.has(entry.id)) { URL.revokeObjectURL(thumbObjUrls.get(entry.id)); thumbObjUrls.delete(entry.id); }
  entry.hasThumb = true;
}

// ── 顯示用的文字 ───────────────────────────────────────────
// 開什麼台直接看標題：標題開頭的【…】就是遊戲名稱（中文或英文都行，照你標題怎麼寫；有「｜」只取前面），例：
// 【Might & Mushroom】20261024 醒來就好想睡995【微醺染香】→ Might & Mushroom。只取開頭那一組，後面的【頻道名】不算。
const gameFromTitle = (title) => { const m = /^\s*【([^】]+)】/.exec(title || ''); return m ? m[1].split(/[｜|]/)[0].trim() : ''; }; // 【FF14｜雜談】：｜把「遊戲｜這場的主題」分開，只取前面
// 月曆格子的標題條：開頭的【遊戲｜…】已經等於格子上的分類，不重複放
const stripGameTag = (title) => (title || '').replace(/^\s*【[^】]*】\s*/, '');
// 顯示用的分類：自己手動填過的（edited）以手填為準；否則以標題裡的【】為準，沒有才用 Twitch 給的分類
const gameOf = (e) => (e.edited ? e.game : gameFromTitle(e.title) || e.game) || gameFromTitle(e.title);
// 一場直播可以有多個分類：存成「A、B」一個字串（舊資料與匯出入格式不變），顯示、統計時再拆開
const splitGames = (s) => [...new Set(String(s || '').split(/[、,，;；]/).map((x) => x.trim()).filter(Boolean))];
const gamesOf = (e) => splitGames(gameOf(e));
// 一筆直播紀錄的預設欄位（手動新增、Twitch 同步、匯入共用），extra 蓋掉預設值
const newLogEntry = (extra) => ({ id: uid(), source: 'manual', streamId: '', videoId: '', startedAt: '', title: '', game: '', durationSec: 0, url: '', hasThumb: false, thumbUrl: '', edited: false, live: false, ...extra });
const logParts = (iso) => {
  const d = new Date(iso);
  return { ds: toDs(d), hm: `${pad2(d.getHours())}:${pad2(d.getMinutes())}`, dw: d.getDay() };
};
const logWhen = (e) => { const p = logParts(e.startedAt); return `${p.ds.replace(/-/g, '/')}（${DOW_NAMES[p.dw]}）${p.hm}`; };
// 時長欄位：「3:08:33」＝時:分:秒；只有兩段是時:分；單一數字當作分鐘（舊習慣）。空白＝0，格式錯誤回傳 null
function parseHms(str) {
  const s = String(str || '').trim().replace(/：/g, ':');
  if (!s) return 0;
  if (!/^\d+(\.\d+)?$|^\d+(:\d{1,2}){1,2}$/.test(s)) return null;
  if (!s.includes(':')) return Math.round(Number(s) * 60);
  const [a, b, c] = s.split(':').map(Number);
  if (b > 59 || (c || 0) > 59) return null;
  return a * 3600 + b * 60 + (c || 0);
}
const fmtHms = (sec) => (sec ? `${Math.floor(sec / 3600)}:${pad2(Math.floor((sec % 3600) / 60))}:${pad2(Math.round(sec % 60))}` : '');
function logDuration(sec) {
  if (!sec) return '';
  const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
  return `${h ? `${h} 小時 ` : ''}${m || !h ? `${m} 分` : ''}`.trim();
}
// Twitch 的時長長這樣："3h8m33s"
const parseTwitchDuration = (s) => { const m = /(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/.exec(s || '') || []; return (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0); };

// ── 年度直播回顧（紀錄頁的畫面；也是 📷 截圖會輸出的那張圖）──────────────
// 三種版面：年曆（12 個月曆，有開台的日子放當天的截圖）、月曆（單月的大月曆）、清單（統計＋熱度圖＋依月份展開的卡片）
let reviewYear = null, reviewMonth = null, reviewView = 'year', reviewLoading = Promise.resolve();
const reviewClosed = new Set(); // 清單版面收合的月份（只記在這次開啟的頁面）
const REVIEW_VIEWS = [['year', '年曆'], ['month', '月曆'], ['list', '清單']];
const entryDs = (e) => logParts(e.startedAt).ds;
const daysInYear = (y) => ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 366 : 365);
function reviewStats(list) {
  const days = new Set(list.map(entryDs)), secs = list.reduce((s, e) => s + (e.durationSec || 0), 0);
  const games = new Map();
  list.forEach((e) => gamesOf(e).forEach((g) => games.set(g, (games.get(g) || 0) + 1)));
  const top = [...games].sort((a, b) => b[1] - a[1])[0];
  return [['直播場數', `${list.length} 場`], ['直播天數', `${days.size} 天`], ['總時數', secs ? logDuration(secs) : '—'], ['最常直播', top ? top[0] : '—']];
}
const reviewStatsBox = (list, force) => (!force && !streamSettings.rvStats) ? [] : el('div', { class: 'rv-stats' }, ...reviewStats(list).map(([k, v]) => el('div', { class: 'rv-stat' }, el('div', { class: 'rv-num', text: v }), el('div', { class: 'rv-lbl', text: k }))));
// 整年的小方格：一格一天，有直播的上色（同一天多場顏色更深），依週首設定排列
function reviewHeat(year, list) {
  const count = new Map();
  list.forEach((e) => count.set(entryDs(e), (count.get(entryDs(e)) || 0) + 1));
  const offset = (new Date(year, 0, 1).getDay() - weekStart + 7) % 7, total = daysInYear(year);
  const cells = Array.from({ length: total }, (_, i) => {
    const ds = toDs(new Date(year, 0, 1 + i)), n = count.get(ds) || 0;
    const cell = el('div', { class: `rv-day${n ? ' on' : ''}${n > 1 ? ' on2' : ''}`, title: n ? `${ds.replace(/-/g, '/')}　${n} 場` : ds.replace(/-/g, '/') });
    if (i === 0) cell.style.gridRowStart = String(offset + 1);
    return cell;
  });
  const heat = el('div', { class: 'rv-heat' }, ...cells);
  heat.style.gridTemplateColumns = `repeat(${Math.ceil((offset + total) / 7)}, 1fr)`;
  return heat;
}
// 縮圖層：用背景圖（置中、等比例鋪滿）而不是 <img>，輸出截圖才不會被拉長；載入完才顯示，並在 host 上加 cls
function thumbLayer(entry, host, cls, loads) {
  const layer = el('div', { class: 'rv-img', hidden: true });
  loads.push(thumbSrc(entry).then((src) => { if (src) { layer.style.backgroundImage = `url("${src}")`; layer.hidden = false; host.classList.add(cls); } }));
  return layer;
}
// 月曆：有開台的日子鋪上當天（第一場）的截圖，同一天多場標「×N」；大月曆（月曆版面）再加標題
function reviewMonthGrid(y, m0, byDay, big, loads) {
  const grid = el('div', { class: `rv-cal${big ? ' big' : ''}` });
  appendDowHeaders(grid, 'rv-dow', true);
  appendLeadingBlanks(grid, y, m0);
  for (let d = 1; d <= daysInMonth(y, m0); d++) {
    const ds = dateStr(y, m0, d), items = byDay.get(ds) || [], first = items[0];
    const cell = el('div', { class: `rv-cell ${dowClass(dowOf(y, m0, d))}${items.length ? ' has' : ''}`, dataset: { date: ds } }, el('span', { class: 'rv-n', text: String(d) }));
    if (first) {
      cell.prepend(thumbLayer(first, cell, 'shot', loads));
      if (items.length > 1) cell.appendChild(el('span', { class: 'rv-x', text: `×${items.length}` }));
      if (big) cell.appendChild(el('div', { class: 'rv-cap', text: stripGameTag(first.title) || gameOf(first) || '直播' }));
      cell.title = items.map((e) => `${logParts(e.startedAt).hm} ${e.title || ''}`.trim()).join('\n');
      cell.addEventListener('click', () => openLogEdit(first.id));
    }
    grid.appendChild(cell);
  }
  return grid;
}
// 外觀：把「年度直播回顧」的版面設定（色系、背景圖、文字色、字型）套到 #streamLog；沒指定的就跟著一般背景與配色
function applyReviewLook() {
  applyStreamFont(); // 用到 Google 字型時要先載入
  const box = $('streamLog'), s = streamSettings, set = (k, v) => (v ? box.style.setProperty(k, v) : box.style.removeProperty(k));
  if (!box) return;
  set('--cal-title', s.rvText); set('--cal-text', s.rvText);
  set('--cal-text-muted', s.rvText && rgba(s.rvText, 0.7)); set('--cal-border', s.rvText && rgba(s.rvText, 0.2));
  set('--cal-card-bg', s.rvCard && rgba(s.rvCard, 0.88)); set('--theme-dark', s.rvAccent);
  const font = streamFontCss();
  box.style.fontFamily = font === 'inherit' ? '' : font;
  if (!s.rvBg1 && !s.rvBgImage) { paintBg(box, bgSettings); return; }
  const c1 = s.rvBg1 || '#ffffff', c2 = s.rvBg2 || c1, veil = rgba(c1, s.rvBgFade / 100);
  Object.assign(box.style, {
    backgroundColor: c1, backgroundPosition: 'center', backgroundRepeat: 'no-repeat',
    backgroundImage: s.rvBgImage ? `linear-gradient(${veil}, ${veil}), url("${s.rvBgImage}")` : `linear-gradient(135deg, ${c1}, ${c2})`,
    backgroundSize: s.rvBgImage ? 'auto, cover' : 'auto',
  });
}
// 清單版面：依月份展開的卡片
function reviewMonthList(list, loads) {
  return Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
    const key = `${reviewYear}-${pad2(m)}`, items = list.filter((e) => entryDs(e).startsWith(key));
    if (!items.length) return null;
    const secs = items.reduce((s, e) => s + (e.durationSec || 0), 0);
    const det = el('details', { class: 'rv-month', open: !reviewClosed.has(key) },
      el('summary', { class: 'log-month', text: `${m} 月　·　${items.length} 場${secs ? `　·　${logDuration(secs)}` : ''}` }),
      el('div', { class: 'log-grid' }, ...items.map((e) => logCard(e, loads))));
    det.addEventListener('toggle', () => { if (det.open) reviewClosed.delete(key); else reviewClosed.add(key); });
    return det;
  }).filter(Boolean);
}
// 上方的操作列（版面頁籤、換年／換月、清單的展開收合）：不會出現在輸出的圖裡
function reviewNav() {
  const month = reviewView === 'month';
  const shift = (delta) => {
    if (!month) { reviewYear += delta; return; }
    reviewMonth += delta;
    if (reviewMonth < 1) { reviewMonth = 12; reviewYear--; } else if (reviewMonth > 12) { reviewMonth = 1; reviewYear++; }
  };
  const go = (delta) => () => { shift(delta); renderStreamLog(); };
  const nav = el('div', { class: 'rv-nav' },
    el('div', { class: 'fd-mode-tabs st-tabs' }, ...REVIEW_VIEWS.map(([k, t]) => btn(t, () => { reviewView = k; renderStreamLog(); }, `fd-mode-tab${k === reviewView ? ' active' : ''}`))),
    btn('←', go(-1), 'year-nav-btn', { ariaLabel: month ? '上個月' : '上一年' }),
    el('span', { class: 'rv-year', text: month ? `${reviewYear} 年 ${reviewMonth} 月` : `${reviewYear} 年` }),
    btn('→', go(1), 'year-nav-btn', { ariaLabel: month ? '下個月' : '下一年' }),
    ...(reviewView === 'list' ? [
      btn('全部展開', () => { reviewClosed.clear(); renderStreamLog(); }),
      btn('全部收合', () => { for (let m = 1; m <= 12; m++) reviewClosed.add(`${reviewYear}-${pad2(m)}`); renderStreamLog(); }),
    ] : []));
  nav.dataset.html2canvasIgnore = 'true';
  return nav;
}
// 清單版面截圖：一張圖放不下時，用「月份」當分頁線切成好幾張（每張不超過 1080 高，月份不會被切成兩半）。
// 第一張帶標題、統計與熱度圖，之後每張只放標題與月份；單一個月本身就超過時獨佔一張（輸出時再等比例縮小）
function splitReviewPages(copy) {
  const months = [...copy.querySelectorAll('.rv-month')];
  if (!months.length) return [copy];
  const head = copy.querySelector('.rv-head'), socials = copy.querySelector('.rv-socials'), intro = [...copy.children].filter((n) => n !== head && n !== socials && !n.classList.contains('rv-month')), stage = copy.parentNode, pages = [];
  let cur = null;
  const next = () => {
    cur = copy.cloneNode(false);
    cur.append(pages.length ? head.cloneNode(true) : head, ...(pages.length ? [] : intro));
    stage.appendChild(cur);
    pages.push(cur);
  };
  next();
  months.forEach((m) => {
    cur.appendChild(m);
    if (cur.getBoundingClientRect().height > OUT_SHORT && cur.querySelectorAll('.rv-month').length > 1) { next(); cur.appendChild(m); }
  });
  if (socials) cur.appendChild(socials);
  copy.remove();
  return pages;
}
function renderStreamLog() {
  applyReviewLook();
  $('stSettings').hidden = reviewView === 'list';
  $('streamPanel').hidden = reviewView === 'list' || loadRaw(KEY.streamPanel) === '0'; // 只有年曆、月曆有版面設定
  const box = $('streamLog'), years = [...new Set(streamLog.map((e) => Number(entryDs(e).slice(0, 4))))];
  if (reviewYear === null) reviewYear = years.length ? Math.max(...years) : new Date().getFullYear();
  const list = streamLog.filter((e) => entryDs(e).startsWith(String(reviewYear))).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  if (reviewMonth === null) reviewMonth = list.length ? Number(entryDs(list[list.length - 1]).slice(5, 7)) : new Date().getMonth() + 1;
  const monthKey = `${reviewYear}-${pad2(reviewMonth)}`, inMonth = list.filter((e) => entryDs(e).startsWith(monthKey));
  const month = reviewView === 'month';
  const head = el('div', { class: 'rv-head' },
    el('div', { class: 'rv-title', text: streamSettings.rvTitle.trim() || (month ? `${reviewYear} 年 ${reviewMonth} 月直播回顧` : `${reviewYear} 年直播回顧`) }),
    ...(streamSettings.rvSub.trim() ? [el('div', { class: 'rv-sub', text: streamSettings.rvSub.trim() })] : []));
  if (!streamLog.length) {
    box.replaceChildren(reviewNav(), head, el('div', { class: 'log-empty' },
      el('div', { text: '還沒有任何直播紀錄' }),
      el('div', { class: 'hint', text: '按「＋ 新增紀錄」手動記一筆，或按「⚙ Twitch 設定」填好憑證後同步（Twitch 的 VOD 只保留 7 天，記下來才不會不見）。' })));
    return;
  }
  const loads = [], byDay = new Map();
  list.forEach((e) => byDay.set(entryDs(e), [...(byDay.get(entryDs(e)) || []), e]));
  let body;
  if (reviewView === 'list') {
    body = list.length ? [reviewStatsBox(list, true), reviewHeat(reviewYear, list), el('div', { class: 'rv-legend', text: '每一格是一天，有顏色代表那天有直播（顏色越深＝當天場次越多）' }), ...reviewMonthList(list, loads)]
      : [el('div', { class: 'log-empty' }, el('div', { text: `${reviewYear} 年還沒有直播紀錄` }))];
  } else if (month) {
    body = [reviewStatsBox(inMonth), reviewMonthGrid(reviewYear, reviewMonth - 1, byDay, true, loads)];
  } else {
    body = [reviewStatsBox(list), el('div', { class: 'rv-months' }, ...Array.from({ length: 12 }, (_, m0) => {
      const n = list.filter((e) => entryDs(e).startsWith(`${reviewYear}-${pad2(m0 + 1)}`)).length;
      return el('div', { class: 'rv-mcard' },
        el('div', { class: 'rv-mtitle', text: `${m0 + 1} 月${n ? `　·　${n} 場` : ''}`, title: '看這個月的大月曆', onclick: () => { reviewView = 'month'; reviewMonth = m0 + 1; renderStreamLog(); } }),
        reviewMonthGrid(reviewYear, m0, byDay, false, loads));
    }))];
  }
  reviewLoading = Promise.all(loads);
  const socials = streamSettings.rvSocials ? socialPills(streamSettings) : [];
  box.replaceChildren(reviewNav(), head, ...body.flat(), ...(socials.length ? [el('div', { class: 'rv-socials' }, ...socials)] : []));
  const months = box.querySelector('.rv-months');
  if (months) months.style.gridTemplateColumns = `repeat(${Number(streamSettings.rvCols) || 3}, 1fr)`;
}
function logCard(e, loads) {
  const thumb = el('div', { class: 'log-thumb' }, el('span', { class: 'log-nothumb', text: '沒有截圖' }));
  thumb.prepend(thumbLayer(e, thumb, 'has', loads || []));
  const p = logParts(e.startedAt);
  const actions = el('div', { class: 'log-actions' },
    ...(e.url ? [el('a', { href: e.url, target: '_blank', rel: 'noopener', text: '看 VOD ↗' })] : []),
    btn('編輯', () => openLogEdit(e.id)));
  actions.dataset.html2canvasIgnore = 'true'; // 輸出的圖不要有按鈕
  return el('div', { class: 'log-card', dataset: { logid: e.id } }, thumb,
    el('div', { class: 'log-info' },
      el('div', { class: 'log-when', text: `${Number(p.ds.slice(5, 7))}/${Number(p.ds.slice(8))}（${DOW_NAMES[p.dw]}）${p.hm}` }, ...(e.live ? [el('span', { class: 'log-live', text: ' 🔴 直播中' })] : [])),
      el('div', { class: 'log-title', text: e.title || '（沒有標題）' }),
      el('div', { class: 'log-sub' }, ...gamesOf(e).map((g) => el('span', { class: 'log-game', text: g })), el('span', { class: 'log-meta', text: logDuration(e.durationSec) })),
      actions));
}

// ── 新增／編輯 ─────────────────────────────────────────────
let logEditing = null, logShotFile = null, logShotCleared = false, logGameAuto = '', logGames = [], logGameComposing = false;
// 目前在看「年度直播回顧」嗎：頂部列的 匯入／匯出 在這個畫面改成備份直播紀錄
const inLogView = () => currentView() === 'stream' && streamMode === 'log';
function syncBackupButtons(log) {
  $('btnImport').title = log ? '從備份檔匯入直播紀錄' : '從備份檔匯入行程';
  $('btnExport').title = log ? '把直播紀錄（含截圖）存成備份檔' : '把行程存成備份檔';
}
// 分類 tag：過去填過的依次數排序，點一下加入；也可以手打（Enter、「、」或逗號加入）
function pastGames() {
  const n = new Map();
  streamLog.forEach((e) => gamesOf(e).forEach((g) => n.set(g, (n.get(g) || 0) + 1)));
  return [...n].sort((a, b) => b[1] - a[1]).map(([g]) => g);
}
function addLogGames(text) {
  splitGames(text).forEach((g) => { if (!logGames.includes(g)) logGames.push(g); });
  renderLogGames();
}
function renderLogGames() {
  const typed = $('logGame').value.trim().toLowerCase();
  $('logGameChips').replaceChildren(...logGames.map((g) => el('span', { class: 'tag-chip' }, g,
    el('button', { type: 'button', class: 'tag-x', ariaLabel: `移除 ${g}`, text: '×', onclick: () => { logGames = logGames.filter((x) => x !== g); renderLogGames(); } }))));
  const pool = [...new Set([gameFromTitle($('logTitle').value), ...pastGames()].filter(Boolean))].filter((g) => !logGames.includes(g) && g.toLowerCase().includes(typed)).slice(0, 12);
  $('logGameSuggest').replaceChildren(...pool.map((g) => el('button', { type: 'button', class: 'tag-sugg', text: `＋ ${g}`, onclick: () => { $('logGame').value = ''; addLogGames(g); $('logGame').focus(); } })));
  $('logGameSuggestWrap').hidden = !pool.length;
}
function openLogEdit(id) {
  const e = id ? streamLog.find((x) => x.id === id) : null;
  logEditing = e ? e.id : null; logShotFile = null; logShotCleared = false;
  const p = e ? logParts(e.startedAt) : { ds: toDs(new Date()), hm: `${pad2(new Date().getHours())}:00` };
  $('logModalTitle').textContent = e ? '編輯直播紀錄' : '新增直播紀錄';
  $('logDate').value = p.ds; $('logTime').value = p.hm;
  $('logTitle').value = e ? e.title : ''; $('logGame').value = '';
  logGames = e ? splitGames(e.game) : [];
  renderLogGames();
  logGameAuto = e ? gameFromTitle(e.title) : ''; // 欄位裡還是當初自動帶的字，就當作沒自訂，標題改了會跟著變
  $('logUrl').value = e ? e.url || '' : ''; $('logDur').value = e ? fmtHms(e.durationSec) : '';
  $('btnDeleteLog').hidden = !e;
  LOG_TARGETS.forEach((t) => { const has = !!(e && logLinked(e, t)); $(t.box).checked = has || (!e && logAuto[t.name]); $(`${t.box}Note`).textContent = has ? '（已加入，儲存時會更新那一筆）' : ''; });
  const prev = $('logShotPrev'), clear = $('logShotClear');
  prev.hidden = clear.hidden = true;
  if (e) thumbSrc(e).then((src) => { if (src) { prev.src = src; prev.hidden = clear.hidden = false; } });
  openModal('logModal');
}
// 分類欄留空、或還是自動帶的那個字，就跟著標題開頭的【】走；自己改過就以手填為準
const logGameFor = (title, typed) => (!typed || typed === logGameAuto ? gameFromTitle(title) || typed : splitGames(typed).join('、'));
// 加入行事曆：直播紀錄可以順手變成私人行程／直播行程（套「實況」類別，標題照原本輸入的）；記下對應的行程編號，之後再存會更新同一筆
const LOG_TARGETS = [
  { name: 'main', box: 'logToMain', key: 'mainEventId', label: '私人行程', list: () => events, save: () => saveEvents() },
  { name: 'stream', box: 'logToStream', key: 'streamEventId', label: '直播行程', list: () => streamEvents, save: () => saveStreamEvents() },
];
const logLinked = (e, t) => t.list().some((x) => x.id === e[t.key]);
function logEventTimes(e) {
  const p = logParts(e.startedAt), out = { start: p.ds, end: p.ds, startTime: p.hm, endTime: '' };
  if (e.durationSec > 0) {
    const end = new Date(new Date(e.startedAt).getTime() + e.durationSec * 1000);
    Object.assign(out, { end: toDs(end), endTime: `${pad2(end.getHours())}:${pad2(end.getMinutes())}` });
  }
  return out;
}
// 「實況」類別：先認編號（預設的 cat_live），認不到再認名稱或標題前綴（使用者自己刪掉重建過的）；都沒有就補回預設的那個，行程才有顏色標籤
function liveCategory() {
  let c = categories.find((x) => x.id === 'cat_live') || categories.find((x) => x.name === '實況' || x.tag === '實況');
  if (!c) { c = clone(DEFAULT_CATEGORIES.find((x) => x.id === 'cat_live')); categories.push(c); saveCategories(); }
  return c;
}
const applyLiveCategory = (ev, c) => Object.assign(ev, { category: c.id, colorMode: c.mode, color1: c.c1, color2: c.c2 });
// want：{ main, stream } 要不要加到哪邊；onlyNew＝已經加過的就不更新內容（批次用；但還沒有類別的會補上實況類別，回傳 '補類別'），否則會更新那一筆的標題與時間（單筆編輯用）
function syncLogEvents(e, want, onlyNew) {
  const live = liveCategory(), added = [];
  LOG_TARGETS.forEach((t) => {
    if (!want[t.name]) return;
    const cur = t.list().find((x) => x.id === e[t.key]), data = { title: e.title, ...logEventTimes(e) };
    if (cur) {
      if (!onlyNew) Object.assign(cur, data);
      else if (!cur.category) { applyLiveCategory(cur, live); added.push('補類別'); }
    } else {
      const n = applyLiveCategory({ id: uid(), memo: '', detail: '', people: [], trpg: null, ...data }, live);
      t.list().push(n); e[t.key] = n.id; added.push(t.label);
    }
    t.save();
  });
  return added;
}
// 批次：把一串紀錄加進行事曆（直播中的還沒結束、不加）；回傳各邊新增的筆數與補上類別的筆數
function addLogsToCalendar(list, want) {
  const n = { main: 0, stream: 0, fixed: 0 };
  list.filter((e) => !e.live).forEach((e) => syncLogEvents(e, want, true).forEach((label) => { n[{ 私人行程: 'main', 直播行程: 'stream' }[label] || 'fixed']++; }));
  if (n.main || n.stream || n.fixed) { saveStreamLog(); rerenderAll(); }
  return n;
}
const logBatchList = () => streamLog.filter((e) => !e.live && ($('lbScope').value === 'all' || entryDs(e).startsWith(String(reviewYear))));
const logBatchWant = () => ({ main: $('lbMain').checked, stream: $('lbStream').checked });
function updateLogBatch() {
  const list = logBatchList(), want = logBatchWant(), n = LOG_TARGETS.map((t) => (want[t.name] ? list.filter((e) => !logLinked(e, t)).length : 0));
  const fix = LOG_TARGETS.reduce((s, t) => s + (want[t.name] ? list.filter((e) => logLinked(e, t) && !t.list().find((x) => x.id === e[t.key]).category).length : 0), 0); // 已加過、但還沒有類別的
  $('lbCount').textContent = `選到 ${list.length} 筆紀錄；會新增私人行程 ${n[0]} 筆、直播行程 ${n[1]} 筆${fix ? `、幫已加過的 ${fix} 筆補上實況類別` : ''}（已加過的內容不動）`;
  $('btnLbDo').disabled = !n[0] && !n[1] && !fix;
}
function openLogBatch() {
  $('lbScope').replaceChildren(el('option', { value: 'year', text: `${reviewYear} 年的紀錄` }), el('option', { value: 'all', text: '全部紀錄' }));
  const auto = logAuto.main || logAuto.stream;
  $('lbMain').checked = auto ? logAuto.main : true; $('lbStream').checked = auto ? logAuto.stream : true; $('lbAuto').checked = auto;
  updateLogBatch();
  openModal('logBatchModal');
}
function doLogBatch() {
  const want = logBatchWant();
  logAuto = $('lbAuto').checked ? { ...want } : { main: false, stream: false };
  save(KEY.logAuto, logAuto);
  const n = addLogsToCalendar(logBatchList(), want);
  closeModal('logBatchModal');
  renderStreamLog();
  toast(`已加入：私人行程 ${n.main} 筆、直播行程 ${n.stream} 筆${n.fixed ? `；補上實況類別 ${n.fixed} 筆` : ''}`);
}
function setLogShot(f) {
  logShotFile = f; logShotCleared = false;
  $('logShotPrev').src = URL.createObjectURL(f);
  $('logShotPrev').hidden = $('logShotClear').hidden = false;
}
async function saveLogEdit() {
  const ds = $('logDate').value, hm = $('logTime').value || '00:00';
  if (!ds) { toast('請選擇日期'); return; }
  addLogGames($('logGame').value); $('logGame').value = ''; // 打了還沒按 Enter 的字也算
  const durationSec = parseHms($('logDur').value);
  if (durationSec === null) { toast('時長請填「時:分:秒」，例如 3:08:33'); $('logDur').focus(); return; }
  const startedAt = new Date(`${ds}T${hm}:00`).toISOString();
  let e = logEditing ? streamLog.find((x) => x.id === logEditing) : null;
  if (!e) { e = newLogEntry(); streamLog.push(e); }
  Object.assign(e, { startedAt, title: $('logTitle').value.trim(), game: logGameFor($('logTitle').value, logGames.join('、')), url: $('logUrl').value.trim(), durationSec, edited: true, live: false });
  try {
    if (logShotFile) await setEntryThumb(e, logShotFile);
    else if (logShotCleared && e.hasThumb) { await thumbDel(e.id); thumbObjUrls.delete(e.id); e.hasThumb = false; e.thumbUrl = ''; }
  } catch (err) { toast('截圖存不進去，其他欄位已儲存'); }
  const added = syncLogEvents(e, { main: $('logToMain').checked, stream: $('logToStream').checked });
  saveStreamLog();
  closeModal('logModal');
  renderStreamLog();
  if (added.length) rerenderAll();
  toast(added.length ? `已儲存紀錄，並加入` : '已儲存紀錄');
}
async function deleteLogEntry() {
  const e = streamLog.find((x) => x.id === logEditing);
  if (!e || !confirm(`要刪除「${e.title || logWhen(e)}」這筆紀錄嗎？（截圖也會一起刪掉）`)) return;
  streamLog = streamLog.filter((x) => x !== e);
  try { await thumbDel(e.id); } catch (err) { /* 沒有截圖就算了 */ }
  thumbObjUrls.delete(e.id);
  saveStreamLog();
  closeModal('logModal');
  renderStreamLog();
  toast('已刪除');
}

// ── 匯出／匯入（含截圖，轉成 data URL 放在檔案裡）────────────
async function exportStreamLog() {
  if (!streamLog.length) { toast('目前沒有紀錄可以匯出'); return; }
  const entries = [];
  for (const e of streamLog) {
    let thumb = '';
    if (e.hasThumb) { try { const b = await thumbGet(e.id); if (b) thumb = await blobToDataUrl(b); } catch (err) { thumb = ''; } }
    entries.push({ ...e, thumb });
  }
  download(new Blob([JSON.stringify({ app: 'tw-calendar-streamlog', version: 1, entries }, null, 1)], { type: 'application/json' }), `streamlog_${toDs(new Date()).replace(/-/g, '')}.json`);
  toast(`已匯出 ${entries.length} 筆紀錄`);
}
async function importStreamLog(file) {
  try {
    const data = JSON.parse(await file.text());
    if (!data || data.app !== 'tw-calendar-streamlog' || !Array.isArray(data.entries)) { toast('檔案格式不正確'); return; }
    let added = 0;
    for (const raw of data.entries) {
      if (!raw || typeof raw.startedAt !== 'string' || Number.isNaN(Date.parse(raw.startedAt))) continue;
      const dup = streamLog.find((x) => x.id === raw.id || (raw.streamId && x.streamId === raw.streamId));
      if (dup) continue;
      const e = newLogEntry({ ...(raw.id ? { id: String(raw.id) } : {}), source: raw.source === 'twitch' ? 'twitch' : 'manual', streamId: String(raw.streamId || ''), videoId: String(raw.videoId || ''), startedAt: raw.startedAt, title: String(raw.title || ''), game: String(raw.game || ''), durationSec: Number(raw.durationSec) || 0, url: String(raw.url || ''), edited: !!raw.edited });
      if (typeof raw.thumb === 'string' && raw.thumb.startsWith('data:image/')) { try { await thumbPut(e.id, await (await fetch(raw.thumb)).blob()); e.hasThumb = true; } catch (err) { e.hasThumb = false; } }
      streamLog.push(e);
      added++;
    }
    saveStreamLog();
    renderStreamLog();
    toast(`已匯入 ${added} 筆紀錄（已有的略過）`);
  } catch (err) { toast('讀取失敗：' + err.message); }
}

// ── Twitch 同步 ────────────────────────────────────────────
async function twFetch(path) {
  const r = await fetch(`https://api.twitch.tv/helix/${path}`, { headers: { 'Client-Id': twitchCfg.clientId.trim(), Authorization: `Bearer ${twitchCfg.token.trim()}` } });
  if (r.status === 401) throw new Error('憑證無效或已過期（401），請到「⚙ 設定 → Twitch 設定」重新填 Client Secret');
  if (!r.ok) throw new Error(`Twitch 回應 ${r.status}`);
  return (await r.json()).data || [];
}
// Twitch 給的縮圖網址是樣板：...{width}x{height}.jpg（VOD 的是 %{width}x%{height}）
const twThumbUrl = (tpl) => (tpl || '').replace(/%?\{width\}/, '640').replace(/%?\{height\}/, '360');
async function fetchEntryThumb(entry, tpl) {
  const url = twThumbUrl(tpl);
  if (!url) return;
  try {
    const r = await fetch(url, { mode: 'cors' });
    if (!r.ok) throw new Error('圖片 ' + r.status);
    await setEntryThumb(entry, await r.blob());
  } catch (err) { entry.thumbUrl = url.replace(/\?.*$/, ''); } // 抓不下來（沒有跨網站許可）就只留網址，VOD 刪掉後圖就沒了
}
let logSyncing = false, logAutoSynced = false;
async function syncTwitchLog(quiet) {
  if (!twitchReady()) {
    if (quiet) return;
    const missing = [['帳號', twitchCfg.login], ['Client ID', twitchCfg.clientId], ['存取憑證', twitchCfg.token]].filter(([, v]) => !v.trim()).map(([k]) => k);
    toast(`Twitch 設定還沒填完：缺 ${missing.join('、')}（填 Client Secret 會自動換憑證）`);
    openTwitchModal();
    return;
  }
  if (logSyncing) return;
  logSyncing = true;
  if (!quiet) toast('同步 Twitch 中…');
  try {
    const login = twitchCfg.login.trim().toLowerCase();
    if (!twitchCfg.userId || twitchCfg.userLogin !== login) {
      const [user] = await twFetch(`users?login=${encodeURIComponent(login)}`);
      if (!user) throw new Error(`找不到 Twitch 帳號「${login}」`);
      Object.assign(twitchCfg, { userId: user.id, userLogin: login });
      saveTwitchCfg();
    }
    const find = (o) => streamLog.find((e) => (o.streamId && e.streamId === o.streamId) || (o.videoId && e.videoId === o.videoId));
    let added = 0, updated = 0;
    const fresh = new Set(), wasLive = streamLog.filter((e) => e.live);
    const [live] = await twFetch(`streams?user_id=${twitchCfg.userId}`);
    streamLog.forEach((e) => { if (e.live && !(live && live.id === e.streamId)) e.live = false; });
    if (live) {
      let e = find({ streamId: live.id });
      if (!e) { e = newLogEntry({ source: 'twitch', streamId: live.id, startedAt: live.started_at }); streamLog.push(e); fresh.add(e); added++; } else updated++;
      e.live = true;
      if (!e.edited) { e.title = live.title || e.title; e.game = gameFromTitle(e.title) || live.game_name || e.game; }
      if (!e.hasThumb) await fetchEntryThumb(e, `${live.thumbnail_url}?t=${Date.now()}`);
    }
    for (const v of await twFetch(`videos?user_id=${twitchCfg.userId}&type=archive&first=100`)) {
      let e = find({ streamId: v.stream_id, videoId: v.id });
      if (!e) { e = newLogEntry({ source: 'twitch', streamId: v.stream_id || '', videoId: v.id, startedAt: v.created_at, title: v.title || '', url: v.url }); streamLog.push(e); fresh.add(e); added++; } else if (!e.videoId || e.live) updated++;
      Object.assign(e, { videoId: v.id, url: v.url, durationSec: parseTwitchDuration(v.duration), startedAt: v.created_at, live: false });
      if (v.stream_id && !e.streamId) e.streamId = v.stream_id;
      if (!e.edited && v.title) e.title = v.title;
      if (!e.edited) e.game = gameFromTitle(e.title) || e.game;
      if (!e.hasThumb) await fetchEntryThumb(e, v.thumbnail_url);
    }
    const calAdded = (logAuto.main || logAuto.stream) ? addLogsToCalendar([...fresh, ...wasLive], logAuto) : { main: 0, stream: 0, fixed: 0 }; // 新的、或剛結束的紀錄自動加進行事曆
    twitchCfg.lastSync = new Date().toISOString();
    saveTwitchCfg(); saveStreamLog();
    if (streamMode === 'log') renderStreamLog();
    if (!quiet || added) toast(`同步完成：新增 ${added} 筆${updated ? `、更新 ${updated} 筆` : ''}${calAdded.main + calAdded.stream ? `；已加進行事曆 ${calAdded.main + calAdded.stream} 筆` : ''}`);
  } catch (err) {
    toast(`同步失敗：${err.message}`);
  } finally { logSyncing = false; }
}
function openTwitchModal() {
  $('twLogin').value = twitchCfg.login; $('twClientId').value = twitchCfg.clientId;
  $('twSecret').value = '';
  const left = !twitchCfg.token ? '還沒有存取憑證' : twitchCfg.tokenExpiresAt ? `存取憑證約剩 ${Math.max(0, Math.round((twitchCfg.tokenExpiresAt - Date.now()) / 86400000))} 天` : '';
  $('twLast').textContent = [twitchCfg.lastSync ? `上次同步：${logWhen({ startedAt: twitchCfg.lastSync })}` : '還沒同步過', left].filter(Boolean).join('　');
  openModal('twitchModal');
}
// 用 Client ID ＋ Client Secret 換「App Access Token」（client_credentials）：Secret 只在這一次請求裡用，不存；成功回傳 { token, expiresAt }，失敗提示後回傳 null
async function fetchTwitchToken(clientId, secret) {
  try {
    const r = await fetch('https://id.twitch.tv/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: clientId, client_secret: secret, grant_type: 'client_credentials' }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.access_token) throw new Error({ 'invalid client secret': 'Client Secret 不對', 'invalid client': 'Client ID 不對' }[j.message] || j.message || `Twitch 回應 ${r.status}`);
    return { token: j.access_token, expiresAt: Date.now() + (j.expires_in || 0) * 1000 };
  } catch (err) {
    toast(`取得憑證失敗：${err.message}`);
    return null;
  }
}
async function saveTwitchModal() {
  const login = $('twLogin').value.trim(), clientId = $('twClientId').value.trim(), secret = $('twSecret').value.trim();
  let { token, tokenExpiresAt } = twitchCfg;
  if (clientId !== twitchCfg.clientId) token = ''; // 換了 Client ID，舊憑證就不能用了
  if (secret) {
    if (!clientId) { toast('請先填 Client ID'); return; }
    const got = await fetchTwitchToken(clientId, secret);
    if (!got) return;
    ({ token, expiresAt: tokenExpiresAt } = got);
  }
  $('twSecret').value = '';
  Object.assign(twitchCfg, { login, clientId, token: token || '', tokenExpiresAt });
  if (twitchCfg.userLogin !== login.toLowerCase()) twitchCfg.userId = '';
  saveTwitchCfg();
  closeModal('twitchModal');
  syncTwitchLog();
}
function clearTwitchModal() {
  if (!confirm('要清除已填的 Twitch 帳號與憑證嗎？（已記下的直播紀錄會保留）')) return;
  twitchCfg = { login: '', clientId: '', token: '', userId: '' };
  saveTwitchCfg();
  closeModal('twitchModal');
  toast('已清除 Twitch 設定');
}
