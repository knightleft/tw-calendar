'use strict';

/* ============================================================
 * 直播行程：給直播畫面用的週曆／月曆
 *  - 有自己的一份行程：從私人行程挑選行程「匯入」（複製）進來，之後各改各的
 *  - 外觀可在「⚙ 版面設定」調整（文字、語言、配色、社群、圖片、版型、每天的設定）
 *  - 背景與配色預設沿用「背景」設定；可截圖（跟其他畫面同一套截圖機制）
 * ============================================================ */

// 該日期所在那一週的第一天（依週首設定）
const weekStartOf = (ds) => addDays(ds, -((parseDs(ds).getDay() - weekStart + 7) % 7));

// 行程在直播週曆裡的排序：整天的在前，其餘依開始時間
const byStartTime = (a, b) => (a.startTime || '').localeCompare(b.startTime || '');

const streamLang = () => STREAM_LANGS[streamSettings.lang] || STREAM_LANGS.zh;
const dayCfg = (ds) => streamDays[ds] || {};
const saveStreamSettings = () => save(KEY.streamSet, streamSettings);
const saveStreamDays = () => save(KEY.streamDays, streamDays);
// 日卡片換成自訂顏色時，文字要跟著選得清楚
const readableText = (bg) => (luminance(bg) > 0.45 ? '#3a2d33' : '#ffffff');
// 描邊：在 12 個方向各疊一份同色、不模糊的陰影（w 是邊的粗細 px）
const outlineShadow = (c, w = 2) => Array.from({ length: 12 }, (_, i) => `${(Math.cos((i * Math.PI) / 6) * w).toFixed(1)}px ${(Math.sin((i * Math.PI) / 6) * w).toFixed(1)}px 0 ${c}`).join(', ');

// 版型相容：指定畫面比例時，畫布高度固定為「寬 × 比例」，內容區填滿剩下的高度——
// 週曆的欄數依畫布形狀調整（寬／橫式 7 欄、4:3 4 欄、直式 2 欄），卡片等高；
// 還是放不下才縮小內容：先把內容區加寬、加高成 1/z 倍重新排版，再用 transform 縮回來（不用 CSS zoom，
// 因為 html2canvas 截圖不支援 zoom，圖會跟畫面不一樣），所以不會破框也不會被裁掉。
function fitStreamContent() {
  const box = $('bgStreamPreview'), bodies = [$('streamYear'), $('streamWeek'), $('streamMonth')];
  bodies.forEach((b) => { b.style.cssText = ''; b.classList.remove('sw-fill'); });
  const fixed = streamSettings.aspect !== 'auto';
  box.dataset.fit = fixed ? '1' : '';
  const body = bodies.find((b) => !b.hidden);
  if (!fixed || !body || !box.offsetWidth) return;
  body.classList.add('sw-fill');
  const availH = body.clientHeight, fits = () => body.scrollHeight <= body.clientHeight + 3 && body.scrollWidth <= body.clientWidth + 3; // 容許幾 px 的進位誤差
  let z = 1;
  while (z > 0.3 && !fits()) {
    z = Math.round((z - 0.04) * 100) / 100;
    // 縮小後內容區的版面大小是 1/z 倍，要用負的下外距把多出來的版面空間補回去，不然會把下面的備註推出畫布
    Object.assign(body.style, { flex: 'none', width: `${100 / z}%`, height: `${availH / z}px`, marginBottom: `${availH - availH / z}px`, transform: `scale(${z})`, transformOrigin: 'top left' });
  }
}

// 直播預覽是照「輸出寬度」排版的，再用 transform 等比例縮小放進視窗（截圖仍拍原尺寸）
function fitScaled(stage, scaler) {
  if (!stage || !scaler || !stage.clientWidth) return;
  const scale = Math.min(1, stage.clientWidth / scaler.offsetWidth);
  const t = scale < 1 ? `scale(${scale})` : '';
  if (scaler.style.transform !== t) scaler.style.transform = t;
  const h = Math.ceil(scaler.offsetHeight * scale) + 'px';
  if (stage.style.height !== h) stage.style.height = h;
}
// 預覽（週曆/月曆/年度）與年度直播回顧都是照「輸出寬度」排版，再縮進視窗
function fitStreamStage() {
  applyBgSize(); // 畫布大小變了，背景圖的實際像素也要跟著算
  fitScaled($('streamStage'), $('streamScaler'));
  fitScaled($('logStage'), $('logScaler'));
}

function openStream() {
  showView('stream');
  applyBgToDom();
  initStreamPanel();
  renderStreamView();
}
function setStreamMode(mode) {
  const wasLog = streamMode === 'log';
  streamMode = ['year', 'month', 'log'].includes(mode) ? mode : 'week';
  saveRaw(KEY.streamMode, streamMode);
  renderStreamView();
  if (wasLog !== (streamMode === 'log')) buildStreamSettings(); // 年度直播回顧與其他畫面用不同的設定面板內容
}
function streamShift(delta) {
  if (streamMode === 'log') return;
  if (streamMode === 'year') {
    const dt = parseDs(streamAnchor);
    streamAnchor = toDs(new Date(dt.getFullYear() + delta, 0, 1));
  } else if (streamMode === 'week') {
    streamAnchor = addDays(streamAnchor, 7 * delta);
  } else {
    const dt = parseDs(streamAnchor);
    streamAnchor = toDs(new Date(dt.getFullYear(), dt.getMonth() + delta, 1));
  }
  renderStreamView();
  fillDaySettings();
}
function streamToday() {
  if (streamMode === 'log') return;
  streamAnchor = toDs(new Date());
  renderStreamView();
  fillDaySettings();
}

// ── 外觀：把設定套到畫面上 ─────────────────────────────────
// 背景圖覆寫：有設定「直播行程專用背景圖」就蓋掉一般背景（applyBgToDom 之後會呼叫）
function applyStreamBg() {
  const box = $('bgStreamPreview');
  const layer = $('streamBgLayer');
  if (!box || !layer) return;
  const s = streamSettings;
  if (s.canvasBg) box.style.background = s.canvasBg; // 自訂畫布底色：蓋過一般背景（背景圖那層仍疊在上面）
  layer.hidden = !s.bgImage;
  if (!s.bgImage) return;
  // 背景圖放在獨立的一層：才能單獨調位置、大小與透明度，而不影響上面的文字
  Object.assign(layer.style, { backgroundImage: `url("${s.bgImage}")`, backgroundPosition: `${s.bgX}% ${s.bgY}%`, opacity: s.bgOpacity / 100 });
  applyBgSize();
}
// 背景圖大小：100% ＝ 剛好蓋滿畫布（cover），小於 100% 會縮小並露出整張圖、大於則放大。
// 用「圖片原尺寸 × 比例」算出實際像素，不能用 transform 縮放——那一層本來就已經被畫布裁過，縮小只會讓裁過的樣子縮小。
const bgNatural = new Map();
function applyBgSize() {
  const layer = $('streamBgLayer'), box = $('bgStreamPreview'), src = streamSettings.bgImage;
  if (!layer || layer.hidden || !src) return;
  const nat = bgNatural.get(src);
  if (!nat) {
    const im = new Image();
    im.onload = () => { bgNatural.set(src, { w: im.naturalWidth, h: im.naturalHeight }); applyBgSize(); };
    im.src = src;
    return;
  }
  const k = Math.max(box.offsetWidth / nat.w, box.offsetHeight / nat.h) * streamSettings.bgSize / 100;
  layer.style.backgroundSize = `${nat.w * k}px ${nat.h * k}px`;
}
function applyStreamLook() {
  const s = streamSettings, box = $('bgStreamPreview');
  applyStreamFont();
  Object.assign(box.dataset, { style: s.style, corners: s.corners, align: s.align });
  box.classList.toggle('sparkles', !!s.sparkles);
  box.dataset.shape = { '16:9': 'wide', '4:3': 'classic', '9:16': 'portrait' }[s.aspect] || '';
  box.dataset.titleAlign = s.titleAlign;
  box.dataset.subAlign = s.eyebrowAlign;
  box.dataset.note = s.note.trim() ? '1' : '';
  box.dataset.tc = s.titleColor ? '1' : ''; // 有指定文字色時，期間與星期名也跟著用
  box.style.setProperty('--stream-font', streamFontCss());
  box.style.setProperty('--stream-title-color', s.titleColor || 'var(--cal-title)');
  // 背景有圖（一般背景或直播專用背景）時，文字外圍加一圈跟字色相反的光暈，不然淺色字會融進圖裡
  // 副標題、帳號、年份＋時區可以各自指定顏色；沒指定就用預設的次要色
  [['eyebrow', s.eyebrowColor], ['handle', s.handleColor], ['tz', s.tzColor]].forEach(([k, c]) => (c ? box.style.setProperty(`--stream-${k}-color`, c) : box.style.removeProperty(`--stream-${k}-color`)));
  const onImage = !!s.bgImage || bgSettings.mode === 'image';
  box.dataset.img = onImage ? '1' : '';
  const halo = luminance(s.titleColor || calColors.text) > 0.5 ? 'rgba(0,0,0,.6)' : 'rgba(255,255,255,.85)';
  box.style.setProperty('--halo', `0 0 3px ${halo}, 0 0 9px ${halo}`);
  if (s.titleOutline) box.style.setProperty('--stream-title-shadow', outlineShadow(s.titleOutlineColor, s.titleOutlineWidth));
  else if (onImage) box.style.removeProperty('--stream-title-shadow'); // 沒設描邊就用光暈
  else box.style.setProperty('--stream-title-shadow', 'none');
  box.style.aspectRatio = s.aspect === 'auto' ? '' : s.aspect.replace(':', ' / '); // 當作最小比例：內容比這個比例高時會自動變高
  applyBgToDom(); // 先還原成一般背景，再套專用背景圖
}
// ── 字型：內建選項、Google Fonts、電腦裡已安裝的字型 ──────────
const fontQuote = (n) => n.replace(/[^\w \-\u00C0-\uFFFF]/g, '').trim(); // 只留字母數字空白與連字號，避免寫進 CSS 或網址時出問題
function streamFontCss() {
  const s = streamSettings, p = STREAM_FONTS[s.font] || STREAM_FONTS.default, name = fontQuote(s.fontName || '');
  if (s.font === 'google' && name) return `"${name}", "Noto Sans TC", sans-serif`;
  if (s.font === 'local' && name) return `"${name}", sans-serif`;
  return p.css || 'inherit';
}
const loadedGoogleFonts = new Set();
function loadGoogleFont(family) {
  family = fontQuote(family || '');
  if (!family || loadedGoogleFonts.has(family)) return;
  loadedGoogleFonts.add(family);
  const link = el('link', { rel: 'stylesheet', href: `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}&display=swap` });
  link.addEventListener('error', () => { loadedGoogleFonts.delete(family); link.remove(); toast(`找不到 Google 字型「${family}」，請確認名稱`); });
  document.head.appendChild(link);
}
function applyStreamFont() {
  const s = streamSettings, p = STREAM_FONTS[s.font];
  if (s.font === 'google') loadGoogleFont(s.fontName); else if (p && p.gf) loadGoogleFont(p.gf);
}

// 標題區右下那行「年份＋時區」：年份是目前畫面所在的年（週曆用週首那天的年），時區沒選就只有年份
// 時區標示（只標示，不換算時間）
function tzLabel() {
  const tz = streamSettings.tz;
  if (tz === 'none' || !STREAM_TZS[tz]) return '';
  try {
    const zone = tz === 'auto' ? undefined : tz;
    const off = new Intl.DateTimeFormat('en', { timeZone: zone, timeZoneName: 'shortOffset' }).formatToParts(parseDs(streamAnchor)).find((p) => p.type === 'timeZoneName').value;
    return off;
  } catch (e) { return ''; }
}

// 筆記格：跟日卡片同尺寸的第 8 格，裡面是跟行程同一種卡片；設定裡沒填就不出現
const NOTE_LOOK = { colorMode: 'solid', color1: DEFAULT_EVENT_COLORS.c1, color2: DEFAULT_EVENT_COLORS.c2 };
function renderNoteCell(L) {
  const card = el('div', { class: 'sw-event sw-note' + (eventNeedsDarkText(NOTE_LOOK) ? ' dark-text' : '') }, el('div', { class: 'sw-detail', text: streamSettings.note.trim() }));
  const detail = card.querySelector('.sw-detail'); // 筆記的文字色與大小由設定決定（沒指定顏色就跟著卡片自動選深淺）
  detail.style.fontSize = `${streamSettings.noteSize}px`;
  if (streamSettings.noteColor) detail.style.color = streamSettings.noteColor;
  card.style.background = eventBg(NOTE_LOOK);
  return el('div', { class: 'sw-day sw-notecell' },
    el('div', { class: 'sw-head' }, el('span', { class: 'sw-date', text: L.note })),
    el('div', { class: 'sw-holiday empty' }), card);
}

function renderStreamHead() {
  const s = streamSettings, L = streamLang();
  $('streamTitle').textContent = s.title.trim(); // 標題沒填就不顯示，不套用頁面標題
  $('streamTitle').hidden = !s.title.trim();
  $('streamEyebrow').textContent = s.eyebrow.trim() || (streamMode === 'week' ? L.eyebrowWeek : streamMode === 'month' ? L.eyebrowMonth : ''); // 年度總覽沒有預設眉標
  $('streamEyebrow').hidden = !$('streamEyebrow').textContent;
  $('streamHandle').textContent = s.handle.trim();
  $('streamHandle').hidden = !s.handle.trim();
  $('streamAvatarWrap').hidden = !s.avatar;
  const av = $('streamAvatar');
  if (s.avatar) av.src = s.avatar; else av.removeAttribute('src');
  Object.assign(av.style, { objectPosition: `${s.avatarX}% ${s.avatarY}%`, transform: `scale(${s.avatarZoom / 100})`, transformOrigin: `${s.avatarX}% ${s.avatarY}%` });
  const pills = socialPills(s);
  $('streamSocials').replaceChildren(...pills);
  $('streamSocials').hidden = !pills.length;
  const year = parseDs(streamMode === 'week' ? weekStartOf(streamAnchor) : streamAnchor).getFullYear();
  $('streamTz').textContent = [year, tzLabel()].filter(Boolean).join('　');
  $('streamFoot').textContent = s.credit.trim();
  $('streamFoot').hidden = !s.credit.trim();
  $('streamFoot').dataset.pos = s.creditPos;
}

// 社群小貼紙：有填帳號、且在版面設定裡勾選顯示的平台（直播行程與年度直播回顧共用）
const socialPills = (s) => SOCIALS.filter(([, , , , key]) => s[key].trim() && s[`${key}Show`] !== false)
  .map(([kind, icon, , , key]) => el('span', { class: `sc-pill sc-${kind}`, text: `${icon} ${s[key].trim()}` }));

function renderStreamView() {
  // 直播紀錄是另一種畫面：沒有預覽與版面設定，換成紀錄清單與它自己的工具鈕
  const logMode = streamMode === 'log';
  $('stLog').classList.toggle('active', logMode);
  syncBackupButtons(logMode);
  $('streamStage').hidden = logMode;
  $('logStage').hidden = !logMode;
  ['stPrev', 'stToday', 'stNext', 'stImport'].forEach((id) => { $(id).hidden = logMode; });
  $('stSettings').hidden = logMode && reviewView === 'list'; // 年度回顧的清單版面只供觀看，沒有版面設定
  ['stSync', 'stLogAdd', 'stLogToCal'].forEach((id) => { $(id).hidden = !logMode; });
  if (logMode) {
    ['stYear', 'stWeek', 'stMonth'].forEach((id) => $(id).classList.remove('active'));
    renderStreamLog();
    fitStreamStage();
    if (twitchReady() && !logAutoSynced) { logAutoSynced = true; syncTwitchLog(true); }
    return;
  }
  $('streamPanel').hidden = loadRaw(KEY.streamPanel) === '0';
  applyStreamLook();
  renderStreamHead();
  $('stWeek').classList.toggle('active', streamMode === 'week');
  $('stYear').classList.toggle('active', streamMode === 'year');
  $('stMonth').classList.toggle('active', streamMode === 'month');
  $('streamYear').hidden = streamMode !== 'year';
  $('streamWeek').hidden = streamMode !== 'week';
  $('streamMonth').hidden = streamMode !== 'month';
  if (streamMode === 'year') renderStreamYear(); else if (streamMode === 'week') { renderStreamWeek(); fitDayText(); } else renderStreamMonth();
  $('stClear').textContent = `🗑 清空${{ week: '這一週', month: '這個月', year: '這一年' }[streamMode]}的直播行程`;
  $('streamHint').hidden = streamEvents.length > 0; // 直播行程還是空的時提醒一下（不會出現在截圖裡）
  fitStreamContent();
  fitStreamStage();
}

// 一天有 3 場時：日卡片維持跟 2 場的一樣高，把這天卡片裡的字（--sw-k 倍率）從原尺寸一路縮小到第 3 場塞得進去。
// 格狀樣式才量；預覽被隱藏、量不到高度時不動
const SW_DAY_MIN = 356; // 同 style.css 的 .sw-day min-height（那條在窄視窗會被關掉，這裡不跟著視窗變，輸出才一致）
function fitDayText() {
  const days = [...document.querySelectorAll('#streamWeek .sw-day')];
  days.forEach((d) => { d.style.removeProperty('--sw-k'); d.style.alignSelf = 'start'; }); // 先讓每張卡片回到自然高度，不被同一列最高的那張撐開
  const three = days.filter((d) => d.dataset.ev === '3');
  if (streamSettings.style !== 'grid') three.forEach((d) => d.style.setProperty('--sw-k', 0.78)); // 清單、直式沒有固定高度可以量：固定縮一個大小（跟舊版一樣）
  else if (three.length && days[0].offsetHeight) {
    const target = Math.max(SW_DAY_MIN, ...days.filter((d) => d.dataset.ev !== '3').map((d) => d.offsetHeight));
    if (target >= 120) three.forEach((d) => { let k = 1; while (k > 0.5 && d.offsetHeight > target + 1) { k = Math.round((k - 0.04) * 100) / 100; d.style.setProperty('--sw-k', k); } });
  }
  days.forEach((d) => { d.style.alignSelf = ''; });
}

// 直播年度總覽：12 個迷你月曆，只用直播行程上色；點月份進該月的直播月曆
function renderStreamYear() {
  const y = parseDs(streamAnchor).getFullYear();
  $('streamPeriod').textContent = `${y} 年`;
  $('streamYear').replaceChildren(...Array.from({ length: 12 }, (_, m) => {
    const mini = el('div', { class: 'mini-cal' });
    fillMiniCal(mini, y, m, streamEventsForDay);
    return el('div', { class: 'month-card', onclick: () => { streamAnchor = dateStr(y, m, 1); setStreamMode('month'); fillDaySettings(); } },
      el('h3', { text: `${y} 年 ${m + 1} 月` }), mini);
  }));
}

function renderStreamMonth() {
  const dt = parseDs(streamAnchor), y = dt.getFullYear(), m = dt.getMonth(), L = streamLang();
  $('streamPeriod').textContent = L.month(y, m);
  renderMonthGrid($('streamMonth'), y, m, streamEventsForDay, L.short);
}

function renderStreamWeek() {
  const s = streamSettings, L = streamLang();
  const start = weekStartOf(streamAnchor), end = addDays(start, 6), todayDs = toDs(new Date());
  $('streamPeriod').textContent = `${start.replace(/-/g, '/')} ～ ${fmtRange(end, end)}`;
  const cells = Array.from({ length: 7 }, (_, i) => {
    const ds = addDays(start, i), dt = parseDs(ds), dw = dt.getDay(), hName = holidayName(ds), cfg = dayCfg(ds);
    const isRest = !!cfg.rest; // 只有勾了「休息日」才算休息：不顯示當天行程、顯示休息訊息、套用較淡的不透明度
    const evs = isRest ? [] : streamEventsForDay(ds).sort(byStartTime);
    const opacity = cfg.opacity != null ? cfg.opacity : (isRest ? s.restOpacity : s.activeOpacity);
    const cls = ['sw-day', dowClass(dw), hName ? 'holiday' : '', ds === todayDs ? 'today' : '', cfg.highlight ? `highlight hl-${cfg.hlStyle || 'glow'}` : '', isRest ? 'rest' : ''];
    const col = el('div', { class: cls.filter(Boolean).join(' '), dataset: { date: ds, ev: evs.length >= 3 ? '3' : '' } },
      el('div', { class: 'sw-head' },
        el('span', { class: 'sw-date', text: `${dt.getMonth() + 1}/${dt.getDate()}` }),
        el('span', { class: 'sw-dow', text: L.dow[dw] })),
      el('div', { class: hName ? 'sw-holiday' : 'sw-holiday empty', text: hName || '' }));
    col.style.opacity = opacity / 100;
    if (s.dayColorMode === 'rotate') { // 日卡片依序輪替 3 種顏色
      const bg = s.dayColors[i % 3], fg = readableText(bg);
      col.style.background = bg;
      col.style.setProperty('--cal-text', fg);
      col.style.setProperty('--cal-text-muted', fg);
    }
    if (cfg.highlight) applyHighlight(col, cfg);
    if (cfg.badgeOn && cfg.badge) col.appendChild(renderBadge(cfg));
    evs.forEach((ev) => col.appendChild(renderWeekEvent(ev, ds)));
    if (isRest) col.appendChild(el('div', { class: 'sw-rest', text: s.restMsg.trim() || L.rest }));
    // 貼紙跟著「這一場直播」（行程）走；舊版每天共用的貼紙（cfg.stickers）也照常顯示
    const stickers = [...(cfg.stickers || []), ...evs.filter((ev) => ev.start === ds).flatMap((ev) => ev.stickers || [])];
    if (stickers.length) {
      col.appendChild(el('div', { class: 'sw-stickers' }, ...stickers.map((raw) => {
        const st = stickerOf(raw), look = stickerLook(st), img = el('img', { class: 'sw-sticker', src: look.src, alt: '' });
        Object.assign(img.style, { width: look.width + 'px', left: `calc(50% + ${st.x}%)`, bottom: `calc(${6 - look.inset}px + ${st.y}%)`, transform: `translateX(-50%) rotate(${st.rot}deg)` });
        return img;
      })));
    }
    return col;
  });
  if (s.note.trim()) cells.push(renderNoteCell(L));
  $('streamWeek').replaceChildren(...cells);
}

// 貼紙樣式：舊資料是單純的圖片字串，新的是 { src, size, rot, x, y, bw, bc }；一律在這裡補齊預設值
const stickerOf = (s) => ({ size: STICKER.size.def, rot: STICKER.rot.def, x: STICKER.x.def, y: STICKER.y.def, bw: STICKER.bw.def, bc: STICKER.bc, ...(typeof s === 'string' ? { src: s } : s) });

// 貼紙的圓弧外框與陰影要「烤」進圖片：截圖用的 html2canvas 不支援 CSS filter，用 drop-shadow 疊外框的話圖會跟畫面不同。
// 作法：把圖片染成外框色 → 在一圈角度各畫一次（把形狀向外撐開 bw，邊角是圓的）→ 加陰影畫上去 → 再疊上原圖。
const stkImgs = new Map(), stkOutlines = new Map();
function stickerLook(st) {
  const plain = { src: st.src, width: st.size, inset: 0 };
  if (!st.bw) return plain;
  const img = stkImgs.get(st.src);
  if (!img) { // 圖片還沒載入：先用原圖，載好再重畫一次
    if (img === undefined) {
      stkImgs.set(st.src, null);
      const im = new Image();
      im.onload = () => { stkImgs.set(st.src, im); renderStreamView(); };
      im.src = st.src;
    }
    return plain;
  }
  const k = st.size / img.naturalWidth; // 原圖的 1px 在畫面上是幾 px
  const r = Math.max(1, Math.round(st.bw / k)), blur = Math.round(r * 0.8) + 2, pad = r + blur + 4;
  const cw = img.naturalWidth + pad * 2, ch = img.naturalHeight + pad * 2;
  const key = `${st.bc}|${r}`, perSrc = stkOutlines.get(st.src) || new Map();
  stkOutlines.set(st.src, perSrc);
  if (!perSrc.has(key)) {
    const layer = () => { const c = el('canvas', { width: cw, height: ch }); return [c, c.getContext('2d')]; };
    const [tint, tg] = layer(), [ring, rg] = layer(), [out, g] = layer();
    tg.drawImage(img, pad, pad);
    tg.globalCompositeOperation = 'source-in';
    tg.fillStyle = st.bc;
    tg.fillRect(0, 0, cw, ch);
    [r, r / 2].forEach((rad) => { for (let a = 0; a < 360; a += 15) rg.drawImage(tint, Math.cos((a * Math.PI) / 180) * rad, Math.sin((a * Math.PI) / 180) * rad); });
    rg.drawImage(tint, 0, 0);
    Object.assign(g, { shadowColor: 'rgba(0,0,0,.35)', shadowBlur: blur, shadowOffsetY: Math.round(r / 2) + 1 });
    g.drawImage(ring, 0, 0);
    g.shadowColor = 'transparent';
    g.drawImage(img, pad, pad);
    perSrc.set(key, out.toDataURL('image/png'));
  }
  return { src: perSrc.get(key), width: cw * k, inset: pad * k };
}

// ── 每天的「強調」與「徽章」外觀 ───────────────────────────
// 強調：樣式（光暈／粗框／浮凸／陰影，由 class 決定）＋框線色、填滿色、背景圖（以 CSS 變數與 inline style 套用）
function applyHighlight(col, cfg) {
  if (cfg.hlBorder) col.style.setProperty('--hl-color', cfg.hlBorder);
  if (cfg.hlFillOn && cfg.hlFill) {
    const fg = readableText(cfg.hlFill);
    col.style.background = cfg.hlFill;
    col.style.setProperty('--cal-text', fg);
    col.style.setProperty('--cal-text-muted', fg);
  }
  if (cfg.hlBg) Object.assign(col.style, { backgroundImage: `url("${cfg.hlBg}")`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' });
}
// 徽章形狀：圓角、膠囊用 CSS；爆炸、雲朵、愛心用 SVG 當背景（顏色直接寫進 SVG）
function badgeSvg(shape, color) {
  const star = Array.from({ length: 32 }, (_, i) => {
    const a = (Math.PI * 2 * i) / 32 - Math.PI / 2, r = i % 2 ? 40 : 50;
    return `${(50 + r * Math.cos(a)).toFixed(1)},${(50 + r * Math.sin(a)).toFixed(1)}`;
  }).join(' ');
  const body = {
    burst: `<polygon points="${star}"/>`,
    heart: '<path d="M50 90C18 64 6 46 6 31 6 17 17 7 29 7c9 0 16 5 21 13C55 12 62 7 71 7 83 7 94 17 94 31c0 15-12 33-44 59z"/>',
    cloud: '<g><circle cx="30" cy="60" r="22"/><circle cx="52" cy="42" r="26"/><circle cx="74" cy="60" r="22"/><rect x="30" y="60" width="44" height="22"/></g>',
  }[shape];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g fill="${color}">${body}</g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
function renderBadge(cfg) {
  const shape = BADGE_SHAPES.some(([k]) => k === cfg.badgeShape) ? cfg.badgeShape : 'pill';
  const size = cfg.badgeSize || BADGE_SIZE.def, color = cfg.badgeColor || DEFAULT_EVENT_COLORS.c2;
  const b = el('div', { class: `sw-badge sw-badge-${shape}`, text: cfg.badge });
  b.style.setProperty('--bd-size', `${size}px`);
  b.style.fontSize = `${Math.max(10, Math.round(size * 0.2))}px`;
  b.style.color = readableText(color);
  if (['burst', 'cloud', 'heart'].includes(shape)) b.style.backgroundImage = badgeSvg(shape, color);
  else b.style.background = color;
  return b;
}

// 週曆裡的一筆行程：第一行時間（只有起始日顯示開始時間、結束日顯示結束時間），第二行名稱
function renderWeekEvent(ev, ds) {
  let time = '';
  if (ds === ev.start) time = timeText(ev).trim();
  else if (ds === ev.end && ev.endTime) time = `～${fmtTime(ev.endTime)}`;
  const card = el('div', { class: 'sw-event' + (eventNeedsDarkText(ev) ? ' dark-text' : ''), dataset: { evid: ev.id } });
  card.style.background = eventBg(ev);
  card.title = (time ? time + ' ' : '') + evName(ev) + (ev.detail ? '\n' + ev.detail : '');
  if (time) card.appendChild(el('div', { class: 'sw-time', text: time }));
  card.appendChild(el('div', { class: 'sw-name', text: evName(ev) }));
  if (ev.detail) card.appendChild(el('div', { class: 'sw-detail', text: ev.detail }));
  return card;
}

// 截圖：只拍標題、期間與日曆本體（上方的操作列不會入鏡）
function takeStreamScreenshot() {
  if (streamMode === 'log') { reviewLoading.then(() => capture('streamLog', `stream_review_${reviewYear}${reviewView === 'month' ? '-' + pad2(reviewMonth) : ''}.png`, reviewView === 'list' ? splitReviewPages : null)); return; } // 等截圖都載入再拍
  const label = streamMode === 'week'
    ? `week_${weekStartOf(streamAnchor).replace(/-/g, '')}`
    : `month_${streamAnchor.slice(0, 7).replace('-', '')}`;
  capture('bgStreamPreview', `stream_${label}.png`);
}

// ── 從私人行程匯入 ───────────────────────────────────────────
// 直播行程有自己的一份行程：從行事曆挑選行程「匯入」＝複製一份過來，之後各改各的
// （在直播行程改標題、時間、顏色都不會動到行事曆上原本的行程）。
let streamImportSel = new Set(); // 這次要匯入的私人行程 id
const importedCopy = (srcId) => streamEvents.find((e) => e.sourceId === srcId);
// 匯入視窗只列「目前畫面那段時間」的私人行程：週曆＝那一週、月曆＝那個月、年度＝那一年（跨到這段時間的也算）
function streamRange() {
  const dt = parseDs(streamAnchor), y = dt.getFullYear(), m = dt.getMonth();
  if (streamMode === 'week') { const start = weekStartOf(streamAnchor); return { start, end: addDays(start, 6), label: `這一週（${start.replace(/-/g, '/')} ～ ${fmtRange(addDays(start, 6), addDays(start, 6))}）` }; }
  if (streamMode === 'month') return { start: dateStr(y, m, 1), end: dateStr(y, m, daysInMonth(y, m)), label: `${y} 年 ${m + 1} 月` };
  return { start: dateStr(y, 0, 1), end: dateStr(y, 11, 31), label: `${y} 年` };
}
const eventsInRange = () => { const r = streamRange(); return sortedEvents().filter((e) => e.start <= r.end && e.end >= r.start); };
const streamImporter = {
  items: eventsInRange,
  get listEl() { return $('spList'); },
  get catsEl() { return $('spCats'); },
  isOn: (ev) => streamImportSel.has(ev.id),
  setOn: (ids, on) => ids.forEach((id) => (on ? streamImportSel.add(id) : streamImportSel.delete(id))),
  tag: (ev) => (importedCopy(ev.id) ? '（已匯入）' : ''),
  onChange: () => {
    const n = streamImportSel.size;
    $('spCount').textContent = `已選 ${n} / ${eventsInRange().length} 筆`;
    $('spDo').textContent = `匯入 ${n} 筆`;
    $('spDo').disabled = n === 0;
  },
};
function showStreamImport() {
  const r = streamRange();
  if (!events.length) { toast('私人行程還沒有任何行程可以匯入'); return; }
  if (!eventsInRange().length) { toast(`${r.label}沒有私人行程可以匯入`); return; }
  $('spScope').textContent = `目前列出：${r.label}的私人行程（要匯入別的時間，先在直播行程切到那段時間）`;
  streamImportSel = new Set();
  renderPicker(streamImporter);
  openModal('streamPickModal');
}
function setAllStreamImport(on) {
  streamImporter.setOn(eventsInRange().map((e) => e.id), on);
  renderPicker(streamImporter);
}
// 直播行程裡已經有的「同一筆」：匯入過的（sourceId）優先；沒匯入過但同一天、同標題的也算（例如自己在直播行程打的）
const streamTwin = (src, copy) => importedCopy(src.id) || streamEvents.find((e) => !e.sourceId && e.start === copy.start && e.title === copy.title);
// 匯入：沒有重複的直接複製；有重複的先列出差異問要不要覆蓋（內容完全一樣的不用問、略過）；覆蓋＝用私人行程最新的內容換掉直播行程那一筆
async function doStreamImport() {
  const fresh = [], same = [], conflicts = [];
  events.filter((e) => streamImportSel.has(e.id)).forEach((src) => {
    const copy = { ...clone(src), sourceId: src.id };
    materializeTrpg(copy); // 直播行程的 TRPG 行程：字寫進標題，不帶 GM 與同行者
    const old = streamTwin(src, copy);
    if (!old) { fresh.push(copy); return; }
    const diff = eventDiff(old, copy);
    if (diff.length) conflicts.push({ src, old, copy, diff }); else if (!old.sourceId) old.sourceId = src.id; else same.push(old);
  });
  let overwrite = new Set();
  if (conflicts.length) {
    overwrite = await askOverwrite(conflicts.map((c) => ({ id: c.old.id, title: evName(c.copy), when: eventDateText(c.copy), diff: c.diff })), { intro: '直播行程裡已經有下面這些行程。勾選的會用私人行程的內容覆蓋（直播行程上改過的部分會不見），沒勾的保持原樣、不會多複製一份。', oldLabel: '直播行程（目前）', newLabel: '私人行程（新的）' });
    if (!overwrite) return; // 取消：什麼都不匯入
  }
  conflicts.filter((c) => overwrite.has(c.old.id)).forEach((c) => { streamEvents[streamEvents.indexOf(c.old)] = { ...c.copy, id: c.old.id }; });
  fresh.forEach((copy) => streamEvents.push({ ...copy, id: uid() }));
  saveStreamEvents();
  closeModal('streamPickModal');
  renderStreamView();
  const kept = conflicts.length - overwrite.size;
  toast(`已匯入 ${fresh.length} 筆` + (overwrite.size ? `、覆蓋 ${overwrite.size} 筆` : '') + (kept ? `、保留 ${kept} 筆原樣` : '') + (same.length ? `（${same.length} 筆已是最新）` : ''));
}
// 清空只清「目前畫面那段時間」的直播行程（週曆＝那一週、月曆＝那個月、年度＝那一年；以開始日為準），其他時間與每天的設定不動
function clearStream() {
  const r = streamRange(), doomed = streamEvents.filter((e) => e.start >= r.start && e.start <= r.end);
  if (!doomed.length) { toast(`${r.label}沒有直播行程可以清`); return; }
  if (!confirm(`要清空${r.label}的直播行程嗎？（共 ${doomed.length} 筆；其他時間與私人行程不受影響）`)) return;
  streamEvents = streamEvents.filter((e) => !doomed.includes(e));
  saveStreamEvents();
  renderStreamView();
  fillDaySettings();
  toast(`已清空${r.label}的 ${doomed.length} 筆直播行程`);
}
