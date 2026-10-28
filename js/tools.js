'use strict';

/* ============================================================
 * 工具：匯出／匯入、截圖、空檔日期輸出
 * ============================================================ */

// ── 匯出／匯入 ─────────────────────────────────────────────
// 匯出前可以取消勾選不想匯出的行程（跟「空檔日期」的排除功能同樣的概念）；預設全部匯出
let exportExcluded = new Set(); // 被排除的行程 id
const exportPicker = {
  get listEl() { return $('expList'); },
  get catsEl() { return $('expCats'); },
  isOn: (ev) => !exportExcluded.has(ev.id),
  setOn: (ids, on) => ids.forEach((id) => (on ? exportExcluded.delete(id) : exportExcluded.add(id))),
  onChange: () => {
    const n = pickedCount(exportPicker);
    $('expCount').textContent = `已選 ${n} / ${events.length} 筆`;
    $('btnDoExport').textContent = `匯出 ${n} 筆`;
    $('btnDoExport').disabled = n === 0;
  },
};
function showExportModal() {
  if (!events.length) { toast('目前沒有行程可以匯出'); return; }
  exportExcluded = new Set();
  renderPicker(exportPicker);
  openModal('exportModal');
}
function setAllExport(on) {
  exportPicker.setOn(events.map((e) => e.id), on);
  renderPicker(exportPicker);
}
function exportEvents() {
  const chosen = events.filter((e) => !exportExcluded.has(e.id));
  const data = { title: loadRaw(KEY.title) || DEFAULT_TITLE, events: chosen, categories, trpgSystems,
    stream: { events: streamEvents, settings: streamSettings, days: streamDays, palettes: streamPalettes }, // 直播行程整份一起帶走
    exportedAt: new Date().toISOString() };
  download(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), 'calendar_events.json');
  closeModal('exportModal');
  toast(`已匯出 ${chosen.length} 筆`);
}
// 匯入檔來源不可信（可能是手改過、舊版或壞掉的檔案）：只留下格式正確的行程，缺的欄位補預設值。
const isDs = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(parseDs(s).getTime());
const isHex = (s) => typeof s === 'string' && /^#[0-9a-f]{6}$/i.test(s);
const isHm = (s) => typeof s === 'string' && /^([01]\d|2[0-4]):[0-5]\d$/.test(s);
function sanitizeEvents(list) {
  const seen = new Set(), out = [];
  (Array.isArray(list) ? list : []).forEach((raw) => {
    if (!raw || typeof raw !== 'object' || !isDs(raw.start)) return;
    let start = raw.start, end = isDs(raw.end) ? raw.end : raw.start;
    if (end < start) [start, end] = [end, start];
    const id = raw.id && !seen.has(String(raw.id)) ? String(raw.id) : uid();
    seen.add(id);
    out.push({
      ...raw, id, start, end,
      title: String(raw.title ?? ''), memo: String(raw.memo ?? ''), detail: String(raw.detail ?? ''),
      people: Array.isArray(raw.people) ? raw.people.map(String).filter(Boolean) : [],
      startTime: isHm(raw.startTime) ? raw.startTime : '', endTime: isHm(raw.endTime) ? raw.endTime : '',
      colorMode: raw.colorMode === 'gradient' ? 'gradient' : 'solid',
      color1: isHex(raw.color1) ? raw.color1 : DEFAULT_EVENT_COLORS.c1, color2: isHex(raw.color2) ? raw.color2 : DEFAULT_EVENT_COLORS.c2,
      category: String(raw.category ?? ''), trpg: raw.trpg && typeof raw.trpg === 'object' ? raw.trpg : null,
      ...(Array.isArray(raw.stickers) && raw.stickers.length ? { stickers: raw.stickers.filter((s) => typeof (s && s.src || s) === 'string' && String(s.src || s).startsWith('data:image/')).slice(0, STICKER.max) } : {}),
    });
  });
  return out;
}

async function importEvents(e) {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    const rawList = Array.isArray(data.events) ? data.events : Array.isArray(data) ? data : null; // 也接受純行程陣列
    if (!rawList) { toast('檔案格式不正確'); return; }
    const clean = sanitizeEvents(rawList), skipped = rawList.length - clean.length;
    if (events.length && !confirm(`匯入會取代目前私人行程裡的 ${events.length} 筆行程（改成檔案裡的 ${clean.length} 筆）。
要繼續嗎？建議先用「匯出」備份目前的資料。`)) return;
    events = clean;
    saveEvents();
    if (Array.isArray(data.categories)) { categories = data.categories; saveCategories(); }
    if (Array.isArray(data.trpgSystems)) { trpgSystems = [...new Set([...data.trpgSystems, ...trpgSystems])]; save(KEY.systems, trpgSystems); }
    if (data.title) saveRaw(KEY.title, data.title);
    if (data.stream) importStreamData(data.stream);
    renderYearView();
    toast(`已匯入（${events.length} 筆）` + (skipped ? `，略過 ${skipped} 筆格式不正確的資料` : ''));
  } catch (err) { toast('讀取失敗：' + err.message); }
}

// ── 截圖 ───────────────────────────────────────────────────
// 先把目標複製到畫面外、以「完整內容」的尺寸展開再拍，
// 這樣輸出框會跟著內容變大，不受視窗大小、捲動位置或 min-height 影響。
// 輸出圖的尺寸上限：長邊 1920、短邊 1080（橫的直的都適用）；寬度夠小的圖放大到最多 2 倍讓字更清楚
const OUT_LONG = 1920, OUT_SHORT = 1080;
const outScale = (w, h) => Math.min(2, OUT_LONG / Math.max(w, h), OUT_SHORT / Math.min(w, h));
// 把 src 複製到畫面外，寬度照原本的輸出寬度
function stageCopy(src) {
  const width = Math.ceil(src.offsetWidth); // 不用 getBoundingClientRect：直播預覽被等比例縮小時，要拍的是原本的輸出寬度
  const copy = src.cloneNode(true);
  copy.querySelectorAll('[data-html2canvas-ignore]').forEach((n) => n.remove());
  copy.querySelectorAll('details').forEach((d) => { d.open = true; }); // 收合的區塊拍出來內容會疊在一起，輸出圖一律展開（畫面上的收合狀態不變）
  Object.assign(copy.style, { width: width + 'px', maxWidth: 'none', minHeight: '0', height: 'auto', margin: '0' });
  const stage = el('div', {}, copy);
  stage.style.cssText = 'position:absolute;left:-10000px;top:0;pointer-events:none;';
  document.body.appendChild(stage);
  return { copy, width, stage };
}
function renderCanvas(node, width) {
  const h = Math.ceil(node.getBoundingClientRect().height);
  return html2canvas(node, {
    scale: outScale(width, h), useCORS: true, backgroundColor: null,
    width, height: h, windowWidth: Math.max(width, window.innerWidth), windowHeight: h + 50,
    scrollX: 0, scrollY: 0,
  });
}
// paginate(copy)：可選，把複製出來的內容切成好幾頁（回傳要各拍一張的元素陣列），檔名加 _1、_2…
async function capture(targetId, filename, paginate) {
  if (typeof html2canvas === 'undefined') { toast('截圖元件載入失敗，請檢查網路連線'); return; }
  toast('截圖中…');
  const prevX = window.scrollX, prevY = window.scrollY;
  window.scrollTo(0, 0);
  const { copy, width, stage } = stageCopy($(targetId));
  try {
    if (document.fonts && document.fonts.ready) await document.fonts.ready; // 自訂字型載入完才拍
    await new Promise((r) => setTimeout(r, 250));
    const pages = paginate ? paginate(copy) : [copy];
    for (const [i, page] of pages.entries()) {
      const blob = await new Promise((resolve) => renderCanvas(page, width).then((cv) => cv.toBlob(resolve, 'image/png')));
      download(blob, pages.length > 1 ? filename.replace(/\.png$/, `_${i + 1}.png`) : filename);
    }
    toast(pages.length > 1 ? `已下載 ${pages.length} 張圖片` : '已下載圖片');
  } catch (err) { toast('截圖失敗'); } finally { stage.remove(); window.scrollTo(prevX, prevY); }
}
// 頂部「📷 截圖」：依目前所在的畫面決定拍年度總覽、這個月或直播行程
function takeScreenshot() {
  const view = currentView();
  if (view === 'month') { takeMonthScreenshot(); return; }
  if (view === 'stream') { takeStreamScreenshot(); return; }
  renderYearView();
  capture('bgPreview', `calendar_${viewYear}.png`);
}
const takeMonthScreenshot = () => capture('bgMonthPreview', `calendar_${viewYear}_${pad2(currentMonth + 1)}.png`);

// ── 空檔時段計算（以 30 分為單位）──────────────────────────
const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
// 18:00 → "18"，18:30 → "18:30"，24:00 → "24"
const fmtMin = (min) => { const h = Math.floor(min / 60), m = min % 60; return m ? `${h}:${pad2(m)}` : String(h); };

// 某天被行程佔用的時段：{ full: 整天, ranges: [[起,迄]…]（分鐘）}
function busyOn(ds) {
  const ranges = [];
  for (const ev of blockingEventsForDay(ds)) {
    if (!ev.startTime && !ev.endTime) return { full: true, ranges: [] }; // 未填時間＝整天
    // 單日行程用起訖時間；跨日行程：首日從開始時間忙到 24:00、末日從 0:00 忙到結束時間、中間日整天
    let a = 0, b = 1440;
    if (ev.start === ev.end) {
      if (ev.startTime) a = toMin(ev.startTime);
      if (ev.endTime) b = toMin(ev.endTime);
    } else if (ds === ev.start) {
      if (ev.startTime) a = toMin(ev.startTime);
    } else if (ds === ev.end) {
      if (ev.endTime) b = toMin(ev.endTime);
    }
    // 向外取整到 30 分，避免把只剩零碎的時間當成空檔
    a = Math.floor(a / SLOT) * SLOT;
    b = Math.min(1440, Math.ceil(b / SLOT) * SLOT);
    if (b > a) ranges.push([a, b]);
  }
  return { full: ranges.some(([a, b]) => a <= 0 && b >= 1440), ranges };
}
// 回傳 null＝整天都有事、true＝整天沒有行程（且沒限定時段範圍，只列日期）、陣列＝空檔 [[起,迄]…]
// 限定了時段範圍（例如 20:30～24）時，沒有行程的日子也要列出那個範圍：11/1(日) 20:30~24
function freeRanges(ds) {
  const winStart = Number($('fdWinStart').value), winEnd = Number($('fdWinEnd').value);
  if (!blockingEventsForDay(ds).length) {
    if (winStart <= 0 && winEnd >= 1440) return true;
    return winEnd - winStart >= SLOT ? [[winStart, winEnd]] : [];
  }
  const { full, ranges } = busyOn(ds);
  if (full) return null;
  ranges.sort((x, y) => x[0] - y[0]);
  const free = [];
  let cur = winStart;
  for (const [a, b] of ranges) {
    if (a > cur) free.push([cur, Math.min(a, winEnd)]);
    cur = Math.max(cur, b);
  }
  if (cur < winEnd) free.push([cur, winEnd]);
  return free.filter(([a, b]) => b - a >= SLOT && a < winEnd && b > winStart);
}
const dayIsFullyBusy = (ds) => blockingEventsForDay(ds).length > 0 && busyOn(ds).full;

// ── 空檔日期視窗 ───────────────────────────────────────────
let fdMode = 'single', fdMonths = [], fdExcludeDow = [], fdExcludeDates = [], exclMonth = 0;

function showFreeDaysModal() {
  fdExcludeDow = []; fdExcludeDates = [];
  buildDowRow();
  $('fdExclHoliday').checked = false;
  $('freeDaysOutput').value = '';
  exclMonth = currentMonth;
  buildMonthGrid();
  setFdMode('single');
  renderExclCal();
  renderExclTags();
  openModal('freeDaysModal');
}
function setFdMode(mode) {
  fdMode = mode;
  $('fdMode1').classList.toggle('active', mode === 'single');
  $('fdMode2').classList.toggle('active', mode === 'multi');
  $('fdMultiMonths').hidden = mode !== 'multi';
  if (mode === 'multi' && !fdMonths.length) fdMonths = [currentMonth];
  updateMonthGrid();
}
const toggleIn = (arr, v) => { const i = arr.indexOf(v); if (i === -1) arr.push(v); else arr.splice(i, 1); };

function buildMonthGrid() {
  $('fdMonthGrid').replaceChildren(...Array.from({ length: 12 }, (_, m) => el('button', {
    type: 'button', class: 'month-check-btn', text: `${m + 1} 月`, dataset: { m },
    onclick: () => { toggleIn(fdMonths, m); updateMonthGrid(); },
  })));
}
function updateMonthGrid() {
  document.querySelectorAll('#fdMonthGrid .month-check-btn').forEach((b) => b.classList.toggle('active', fdMonths.includes(Number(b.dataset.m))));
}
function buildDowRow() {
  $('fdDowRow').replaceChildren(...weekOrder().map((dw) => {
    const btn = el('button', { type: 'button', class: ('dow-toggle ' + dowClass(dw)).trim(), text: DOW_NAMES[dw] });
    btn.classList.toggle("active", fdExcludeDow.includes(dw)); // 重建時保留已選取的星期
    btn.addEventListener('click', () => { toggleIn(fdExcludeDow, dw); btn.classList.toggle('active', fdExcludeDow.includes(dw)); });
    return btn;
  }));
}
function renderExclCal() {
  $('exclCalTitle').textContent = `${viewYear} 年 ${exclMonth + 1} 月`;
  const cal = $('exclMiniCal');
  cal.innerHTML = '';
  appendDowHeaders(cal, 'edow', false);
  appendLeadingBlanks(cal, viewYear, exclMonth);
  for (let d = 1; d <= daysInMonth(viewYear, exclMonth); d++) {
    const ds = dateStr(viewYear, exclMonth, d), dw = dowOf(viewYear, exclMonth, d);
    const cell = el('div', { class: 'excl-day', text: d });
    if (dw === 6) cell.classList.add('sat');
    if (dw === 0 || (holidayName(ds) && dw !== 6)) cell.classList.add('sun'); // 假日也標紅
    if (dayIsFullyBusy(ds)) {
      cell.classList.add('has-ev'); // 整天都有行程的日期本來就不是空檔，不可點選
    } else {
      if (fdExcludeDates.includes(ds)) cell.classList.add('excluded');
      cell.addEventListener('click', () => { toggleIn(fdExcludeDates, ds); renderExclCal(); renderExclTags(); });
    }
    cal.appendChild(cell);
  }
}
function renderExclTags() {
  const wrap = $('exclTags');
  if (!fdExcludeDates.length) { wrap.innerHTML = '<span class="empty-note">無</span>'; return; }
  wrap.replaceChildren(...[...fdExcludeDates].sort().map((ds) => {
    const dt = parseDs(ds);
    const label = fmtDay(dt.getMonth(), dt.getDate(), dt.getDay()) + ' ';
    return el('div', { class: 'excl-tag' }, label, el('button', {
      type: 'button', text: '×',
      onclick: () => { toggleIn(fdExcludeDates, ds); renderExclCal(); renderExclTags(); },
    }));
  }));
}

function generateFreeDays() {
  const months = fdMode === 'multi' ? [...fdMonths].sort((a, b) => a - b) : [currentMonth];
  if (!months.length) { toast('請選擇月份'); return; }
  const exclHoliday = $('fdExclHoliday').checked, lines = [];
  months.forEach((m) => {
    for (let d = 1; d <= daysInMonth(viewYear, m); d++) {
      const ds = dateStr(viewYear, m, d), dw = dowOf(viewYear, m, d);
      if (fdExcludeDow.includes(dw) || fdExcludeDates.includes(ds)) continue;
      if (exclHoliday && holidayName(ds)) continue;
      const free = freeRanges(ds);
      if (free === null) continue;                                    // 整天都有事
      if (free === true) { lines.push(fmtDay(m, d, dw)); continue; }  // 整天沒有行程
      if (!free.length) continue;                                     // 有行程且扣除後沒有空檔
      lines.push(`${fmtDay(m, d, dw)} ${free.map(([a, b]) => `${fmtMin(a)}~${fmtMin(b)}`).join(', ')}`);
    }
  });
  $('freeDaysOutput').value = lines.length ? lines.join('\n') : '（沒有空檔日期）';
}
function copyFreeDays() {
  const ta = $('freeDaysOutput'), text = ta.value;
  if (!text || text === '（沒有空檔日期）') { toast('沒有可複製的內容'); return; }
  const fallback = () => { ta.select(); document.execCommand('copy'); toast('已複製到剪貼簿'); };
  if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => toast('已複製到剪貼簿')).catch(fallback);
  else fallback();
}

// 匯入檔裡的直播行程資料（沒有就略過，舊版匯出檔不受影響）
function importStreamData(s) {
  if (Array.isArray(s.events)) { streamEvents = sanitizeEvents(s.events); streamEvents.forEach(materializeTrpg); saveStreamEvents(); }
  if (s.settings && typeof s.settings === 'object') { streamSettings = Object.assign(clone(STREAM_DEFAULTS), s.settings); saveStreamSettings(); }
  if (s.days && typeof s.days === 'object') { streamDays = s.days; saveStreamDays(); }
  if (Array.isArray(s.palettes)) { streamPalettes = s.palettes; save(KEY.streamPalettes, streamPalettes); }
}
