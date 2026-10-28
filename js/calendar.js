'use strict';

/* ============================================================
 * 年度總覽、月視圖、拖曳選取新增、拖曳移動／複製行程
 * ============================================================ */

// 星期標題列（依週首排序），套用在年度迷你月曆、月視圖、排除日期日曆
function appendDowHeaders(container, cls, withDayClass, names = DOW_NAMES) {
  weekOrder().forEach((w) => {
    container.appendChild(el('div', { class: withDayClass ? `${cls} ${dowClass(w)}` : cls, text: names[w] }));
  });
}
// 月初前的空白格
function appendLeadingBlanks(container, y, m, cls = '') {
  for (let i = 0; i < firstCol(y, m); i++) container.appendChild(el('div', cls ? { class: cls } : {}));
}

// ── 年度總覽 ───────────────────────────────────────────────
function renderYearView() {
  const saved = loadRaw(KEY.title);
  const title = saved === null ? DEFAULT_TITLE : saved;
  $('titleInput').value = title;
  $('yearTitle').textContent = title || DEFAULT_TITLE;
  fitTitle();
  $('yearLabel').textContent = viewYear + ' 年';
  applyBgToDom();

  const grid = $('yearGrid');
  grid.innerHTML = '';
  for (let m = 0; m < 12; m++) {
    const mini = el('div', { class: 'mini-cal', id: `mini-${m}` });
    grid.appendChild(el('div', { class: 'month-card', onclick: () => openMonth(m) },
      el('h3', { text: `${viewYear} 年 ${m + 1} 月` }), mini));
    renderMiniCal(m);
  }
}

function renderMiniCal(m) {
  fillMiniCal($('mini-' + m), viewYear, m, blockingEventsForDay);
}
// 年度總覽與直播年度總覽共用：evsFor 決定這一天用哪份行程上色
function fillMiniCal(box, y, m, evsFor) {
  if (!box) return;
  box.innerHTML = '';
  appendDowHeaders(box, 'dow', false);
  appendLeadingBlanks(box, y, m);
  for (let d = 1; d <= daysInMonth(y, m); d++) {
    const ds = dateStr(y, m, d);
    const cell = el('div', { class: 'mini-day', text: d });
    if (dowClass(dowOf(y, m, d))) cell.classList.add(dowClass(dowOf(y, m, d)));
    if (holidayName(ds)) cell.classList.add('holiday');
    if (ds === toDs(new Date())) cell.classList.add('today');
    const [ev] = evsFor(ds); // 同一天有多個行程時，只用第一個上色；勾選「不影響空檔」的只是紀錄，年度總覽不顯示
    if (ev) {
      const first = ev.start === ds, last = ev.end === ds; // 連續區間：起／中／終／單日圓角不同
      cell.style.background = eventBg(ev);
      if (eventNeedsDarkText(ev)) cell.classList.add('dark-text');
      cell.classList.add('has-event', first && last ? 'event-solo' : first ? 'event-start' : last ? 'event-end' : 'event-mid');
    }
    box.appendChild(cell);
  }
}
const changeYear = (delta) => { viewYear += delta; renderYearView(); };

// ── 月視圖 ─────────────────────────────────────────────────
// 三個主畫面（年度總覽／月視圖／直播行程）同一時間只顯示一個
const VIEWS = ['year', 'month', 'stream'];
function showView(name) {
  VIEWS.forEach((v) => { $(v + 'View').style.display = v === name ? 'block' : 'none'; });
  document.body.dataset.view = name;
  syncBackupButtons(name === 'stream' && streamMode === 'log');
  $('btnShot').title = { year: '截圖年度總覽', month: '截圖這個月', stream: '截圖直播行程（年度／週曆／月曆／年度直播回顧）' }[name];
  $('scopeMain').classList.toggle('active', name !== 'stream'); // 大分類：私人行程（年度＋月視圖）｜直播行程
  $('scopeStream').classList.toggle('active', name === 'stream'); // 頂部「截圖」依目前畫面決定拍什麼
}
const currentView = () => VIEWS.find((v) => getComputedStyle($(v + 'View')).display !== 'none');

function openMonth(m) {
  currentMonth = m;
  showView('month');
  $('monthViewTitle').textContent = `${viewYear} 年 ${m + 1} 月`;
  applyBgToDom();
  renderMonthFull(m);
}
function goToThisMonth() {
  const now = new Date();
  viewYear = now.getFullYear();
  openMonth(now.getMonth());
}
function changeMonth(delta) {
  let m = currentMonth + delta;
  if (m < 0) { m = 11; viewYear--; }
  if (m > 11) { m = 0; viewYear++; }
  openMonth(m);
}
function backToYear() {
  showView('year');
  renderYearView();
}
function refreshViews() {
  renderMonthFull(currentMonth);
  renderMiniCal(currentMonth);
  if (currentView() === 'stream') renderStreamView();
}

// 跨日行程：起始日顯示（時間＋）名稱；之後每個月的第 1 天、每週的第一欄也補上名稱，
// 這樣翻到下個月或換到下一列時，不必點開就知道這條是什麼行程。
function renderEventBar(ev, ds, repeatTitle) {
  const bar = el('div', { class: 'event-bar' });
  bar.style.background = eventBg(ev);
  bar.title = timeText(ev) + evName(ev) + (ev.memo ? '\n' + ev.memo : '');
  bar.dataset.evid = ev.id;
  if (eventNeedsDarkText(ev)) bar.classList.add('dark-text');
  const isStart = ev.start === ds;
  if (isStart || repeatTitle) {
    const time = isStart && ev.startTime ? fmtTime(ev.startTime) + ' ' : ''; // 時間只屬於起始日
    bar.appendChild(el('div', { class: 'event-label-inline', text: time + evName(ev) }));
  }
  return bar;
}

// 互動事件統一掛在 #monthFullCal 上（事件代理），格子重畫時不必重新綁定
function renderMonthFull(m) { renderMonthGrid($('monthFullCal'), viewYear, m, eventsForDay); }

// 把某年某月畫成格子：主月視圖與直播月曆共用。evsFor(ds) 決定每天要畫哪些行程。
function renderMonthGrid(cal, y, m, evsFor, dowNames = DOW_NAMES) {
  cal.innerHTML = '';
  appendDowHeaders(cal, 'dow-label', true, dowNames);
  appendLeadingBlanks(cal, y, m, 'cal-day empty');
  const today = new Date();
  for (let d = 1; d <= daysInMonth(y, m); d++) {
    const ds = dateStr(y, m, d), hName = holidayName(ds);
    const cell = el('div', { class: 'cal-day', dataset: { date: ds } });
    const dc = dowClass(dowOf(y, m, d));
    if (dc) cell.classList.add(dc);
    if (hName) cell.classList.add('holiday');
    if (today.getFullYear() === y && today.getMonth() === m && today.getDate() === d) cell.classList.add('today');
    cell.appendChild(el('span', { class: 'day-num', text: d }));
    // 第 1 行固定留給假日名（沒有假日也留空）：這樣跨日行程的色條在每一天都在同一個高度，不會遇到假日就被往下推
    cell.appendChild(el('div', { class: hName ? 'holiday-name' : 'holiday-name empty', text: hName || '' }));
    // 每格共 CELL_ROWS 行：第 1 行是假日名（固定保留）；行程放不下時，最後 1 行改放「+N」（N＝沒顯示的數量）
    const evs = evsFor(ds);
    const capacity = CELL_ROWS - 1;
    const shown = evs.length > capacity ? evs.slice(0, Math.max(0, capacity - 1)) : evs;
    const repeatTitle = d === 1 || (dowOf(y, m, d) - weekStart + 7) % 7 === 0; // 月初或週首
    shown.forEach((ev) => cell.appendChild(renderEventBar(ev, ds, repeatTitle)));
    if (shown.length < evs.length) {
      const hidden = evs.length - shown.length;
      cell.appendChild(el('div', { class: 'more-row' }, el('span', {
        class: 'more-badge', text: `+${hidden}`, title: `還有 ${hidden} 個行程，點擊查看全部`,
      })));
    }
    cal.appendChild(cell);
  }
}

const cellOf = (target) => target.closest && target.closest('.cal-day[data-date]');
const barOf = (target) => target.closest && target.closest('.event-bar');
const moreOf = (target) => target.closest && target.closest('.more-badge');
function dateAtPoint(x, y) {
  const cell = cellOf(document.elementFromPoint(x, y) || document.body);
  return cell ? cell.dataset.date : null;
}

function bindMonthGrid() {
  const grid = $('monthFullCal');
  // 滑鼠：按在色條上＝移動行程；按在空白處＝拖曳選取日期範圍（單擊＝同一天）
  grid.addEventListener('mousedown', (e) => {
    const cell = cellOf(e.target);
    if (!cell) return;
    if (moreOf(e.target)) return; // 「+N」只用來開清單，不要當成拖曳選取的起點
    const bar = barOf(e.target);
    if (bar) startMove(bar.dataset.evid, cell.dataset.date);
    else if (!moving) startDrag(cell.dataset.date);
  });
  grid.addEventListener('mouseover', (e) => {
    const cell = cellOf(e.target);
    if (!cell) return;
    if (moving) hoverMove(cell.dataset.date); else if (isDragging) continueDrag(cell.dataset.date);
  });
  grid.addEventListener('mouseup', (e) => {
    const cell = cellOf(e.target);
    if (!cell) return;
    if (moving) endMove(cell.dataset.date); else if (isDragging) endDrag(cell.dataset.date);
  });
  // 沒有真的移動時，放開後會接著觸發 click → 開啟編輯
  grid.addEventListener('click', (e) => {
    if (moreOf(e.target)) { openDayList(cellOf(e.target).dataset.date); return; }
    const bar = barOf(e.target);
    if (bar && !moving) openEditEvent(bar.dataset.evid);
  });
  // 觸控：與滑鼠相同，但目標日期要用手指座標查詢
  grid.addEventListener('touchstart', (e) => {
    const cell = cellOf(e.target);
    if (!cell) return;
    if (moreOf(e.target)) { e.preventDefault(); openDayList(cell.dataset.date); return; }
    const bar = barOf(e.target);
    if (bar) { e.preventDefault(); startMove(bar.dataset.evid, cell.dataset.date); return; }
    if (moving) return;
    e.preventDefault();
    startDrag(cell.dataset.date);
  }, { passive: false });
  grid.addEventListener('touchmove', (e) => {
    if (!cellOf(e.target)) return;
    e.preventDefault();
    const t = e.touches[0], target = dateAtPoint(t.clientX, t.clientY);
    if (!target) return;
    if (moving) hoverMove(target); else if (isDragging) continueDrag(target);
  }, { passive: false });
  grid.addEventListener('touchend', (e) => {
    const cell = cellOf(e.target);
    if (!cell) return;
    const t = e.changedTouches[0], target = dateAtPoint(t.clientX, t.clientY) || cell.dataset.date;
    if (moving) endMove(target); else if (isDragging) endDrag(target);
  });
  // 在格子外放開滑鼠
  document.addEventListener('mouseup', (e) => {
    if (moving) { endMove(dateAtPoint(e.clientX, e.clientY)); return; }
    if (isDragging) { isDragging = false; clearHighlight(); }
  });
}

// ── 拖曳選取日期範圍（新增行程）───────────────────────────
const selectionRange = () => (dragStart <= dragEnd ? [dragStart, dragEnd] : [dragEnd, dragStart]);
const dayCells = () => document.querySelectorAll('#monthFullCal .cal-day[data-date]'); // 只管主月視圖（直播月曆是唯讀的）
function highlightSelection() {
  const [s, e] = selectionRange();
  dayCells().forEach((c) => c.classList.toggle('in-selection', c.dataset.date >= s && c.dataset.date <= e));
}
const clearHighlight = () => dayCells().forEach((c) => c.classList.remove('in-selection'));
function startDrag(ds) { isDragging = true; dragStart = dragEnd = ds; highlightSelection(); }
function continueDrag(ds) { dragEnd = ds; highlightSelection(); }
function endDrag(ds) {
  dragEnd = ds; isDragging = false; clearHighlight();
  const [s, e] = selectionRange();
  openNewEvent(s, e);
}

// ── 拖曳移動既有行程 ───────────────────────────────────────
function startMove(id, grabbedDate) {
  const ev = eventById(id);
  if (!ev) return;
  moving = { id, offset: diffDays(ev.start, grabbedDate) }; // 抓的是行程的第幾天
  document.querySelectorAll(`#monthFullCal .event-bar[data-evid="${id}"]`).forEach((b) => b.classList.add('moving'));
  document.body.style.cursor = 'grabbing';
}
// 游標在 ds 時，行程會落在哪個區間
function moveRange(ds) {
  const ev = eventById(moving.id);
  const start = addDays(ds, -moving.offset);
  return { ev, start, end: addDays(start, diffDays(ev.start, ev.end)) };
}
function hoverMove(ds) {
  if (!moving || !ds) return;
  const { start, end } = moveRange(ds);
  dayCells().forEach((c) => c.classList.toggle('move-target', c.dataset.date >= start && c.dataset.date <= end));
}
function endMove(ds) {
  if (!moving) return;
  document.querySelectorAll('.event-bar.moving').forEach((b) => b.classList.remove('moving'));
  document.querySelectorAll('.cal-day.move-target').forEach((c) => c.classList.remove('move-target'));
  document.body.style.cursor = '';
  if (!ds) { moving = null; return; }
  const { ev, start, end } = moveRange(ds);
  moving = null;
  if (!ev || start === ev.start) return; // 沒移動 → 視為點擊（開啟編輯）
  askMoveOrCopy(ev, start, end);
}

// 放開後詢問要「移動」還是「複製」
function askMoveOrCopy(ev, start, end) {
  pendingMove = { id: ev.id, start, end };
  $('moveAskText').textContent = `「${evName(ev)}」${fmtRange(ev.start, ev.end)} → ${fmtRange(start, end)}`;
  openModal('moveModal');
}
function resolveMove(action) { // 'move' | 'copy' | 'cancel'
  const p = pendingMove;
  pendingMove = null;
  closeModal('moveModal');
  const ev = p && eventById(p.id);
  if (!ev || action === 'cancel') return;
  if (action === 'copy') events.push(Object.assign(clone(ev), { id: uid(), start: p.start, end: p.end }));
  else { ev.start = p.start; ev.end = p.end; }
  saveEvents();
  refreshViews();
  toast(action === 'copy' ? '已複製' : '已移動');
}

// ── 當天行程清單（點「+N」開啟）────────────────────────────
function openDayList(ds, evsFor = eventsForDay, kind = 'main') {
  const [, m, d] = ds.split('-').map(Number);
  $('dayListTitle').textContent = `${fmtDay(m - 1, d, parseDs(ds).getDay())} 的行程`;
  $('dayListBody').replaceChildren(...evsFor(ds).map((ev) => {
    const dot = el('i', { class: 'day-dot' });
    dot.style.background = eventBg(ev);
    return el('button', {
      type: 'button', class: 'day-item',
      onclick: () => { closeModal('dayModal'); openEditEvent(ev.id, kind); },
    }, dot, el('span', { class: 'day-item-text', text: timeText(ev) + evName(ev) }));
  }));
  openModal('dayModal');
}
