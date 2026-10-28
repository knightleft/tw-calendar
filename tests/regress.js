// 回歸測試：在已載入 index.html 的頁面中執行（用法見 CLAUDE.md「測試」）。
// 回傳 { passed, failed: [{name, actual, expected}] }；會清空 localStorage，請在測試用分頁執行。
(async () => {
  const failed = [];
  let passed = 0;
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const check = (name, actual, expected) => { if (same(actual, expected)) passed++; else failed.push({ name, actual, expected }); };
  // 舊測試的編輯流程不測同步：載入視窗後一律取消勾選「同步」，免得連動改到另一邊的行程（同步另有專屬測試）
  window.__realLoadSync = window.__realLoadSync || loadSync; const realLoadSync = window.__realLoadSync; loadSync = () => { realLoadSync(); document.getElementById("evSync").checked = false; }; // 重複執行測試時，不能把已覆蓋的版本當成原版

  const $$ = (id) => document.getElementById(id);
  const fire = (node, type) => node.dispatchEvent(new MouseEvent(type, { bubbles: true }));
  const choose = (id, v) => { const s = $$(id); s.value = v; s.dispatchEvent(new Event('change')); };
  const type = (id, v) => { const s = $$(id); s.value = v; s.dispatchEvent(new Event('input')); };
  const cell = (d, month = 10) => document.querySelector(`#monthFullCal .cal-day[data-date="2026-${pad2(month)}-${pad2(d)}"]`); // 限定主月視圖
  const base = { memo: '', colorMode: 'solid', color1: '#ff0000', color2: '#00ff00', category: '', trpg: null };

  localStorage.clear();
  // 重設記憶體中的狀態，讓測試可以在同一頁重複執行
  events = []; categories = clone(DEFAULT_CATEGORIES); trpgSystems = []; colorHistory = [];
  setTheme('light'); setWeekStart(1); choose('timeFmt', '24');
  viewYear = 2026;

  // ── 假日（2026）──────────────────────────────────────────
  const h26 = calcHolidays(2026);
  check('假日：春節', [h26['2026-02-16'], h26['2026-02-17']], ['除夕', '春節']);
  check('假日：兒童節與清明', [h26['2026-04-04'], h26['2026-04-05']], ['兒童節', '清明節']);
  check('假日：補假', [h26['2026-04-03'], h26['2026-04-06'], h26['2026-10-09']], ['補假', '補假', '補假']);
  check('假日：端午中秋', [h26['2026-06-19'], h26['2026-09-25']], ['端午節', '中秋節']);
  check('假日：2025 起恢復的紀念日', [h26['2026-09-28'], h26['2026-10-25'], h26['2026-12-25']], ['教師節', '光復節', '行憲紀念日']);

  // ── 版面：週首 ───────────────────────────────────────────
  openMonth(9);
  check('週一開頭：標題列', [...document.querySelectorAll('#monthFullCal .dow-label')].map((x) => x.textContent).join(''), '一二三四五六日');
  check('週一開頭：2026/10/1 前空白數', document.querySelectorAll('#monthFullCal .cal-day.empty').length, 3);
  setWeekStart(0);
  check('週日開頭：標題列', [...document.querySelectorAll('#monthFullCal .dow-label')].map((x) => x.textContent).join(''), '日一二三四五六');
  check('週日開頭：2026/10/1 前空白數', document.querySelectorAll('#monthFullCal .cal-day.empty').length, 4);
  setWeekStart(1);

  // ── 固定資料集：顯示與空檔 ───────────────────────────────
  events = [
    { ...base, id: 'e1', title: '單日', start: '2026-10-05', end: '2026-10-05', startTime: '09:00', endTime: '12:10' },
    { ...base, id: 'e2', title: '跨日', start: '2026-10-08', end: '2026-10-10', startTime: '20:00', endTime: '10:00', colorMode: 'gradient' },
    { ...base, id: 'e3', title: '', start: '2026-10-14', end: '2026-10-14', startTime: '19:30', endTime: '24:00', category: 'cat_gm', trpg: { gm: '染香', system: 'NC', script: '人偶X不知道禮服的秘密' } },
    { ...base, id: 'e4', title: '整天', start: '2026-10-20', end: '2026-10-21', startTime: '', endTime: '' },
  ];
  openMonth(9);
  check('TRPG 顯示樣式', evName(eventById('e3')), '【TRPG】染香 - NC 《人偶X不知道禮服的秘密》');
  check('色條文字（24 小時）', cell(14).querySelector('.event-label-inline').textContent, '19:30 【TRPG】染香 - NC 《人偶X不知道禮服的秘密》');
  choose('timeFmt', '12');
  check('色條文字（12 小時）', cell(14).querySelector('.event-label-inline').textContent, '7:30 PM 【TRPG】染香 - NC 《人偶X不知道禮服的秘密》');
  check('提示文字（24:00 → 12:00 AM）', cell(14).querySelector('.event-bar').title.startsWith('7:30 PM～12:00 AM '), true);
  choose('timeFmt', '24');

  const freeLines = (opts = {}) => {
    showFreeDaysModal();
    if (opts.multi) { setFdMode('multi'); fdMonths = opts.multi; updateMonthGrid(); }
    if (opts.dow) fdExcludeDow = opts.dow;
    $$('fdExclHoliday').checked = !!opts.hol;
    choose('fdWinStart', opts.ws ?? 0); choose('fdWinEnd', opts.we ?? 1440);
    generateFreeDays();
    return $$('freeDaysOutput').value.split('\n');
  };
  let free = freeLines();
  check('空檔：整天沒行程只列日期', free.includes('10/1(四)'), true);
  check('空檔：單日行程（取整到 30 分）', free.includes('10/5(一) 0~9, 12:30~24'), true);
  check('空檔：跨日首日', free.includes('10/8(四) 0~20'), true);
  check('空檔：跨日末日', free.includes('10/10(六) 10~24'), true);
  check('空檔：結束 24:00', free.includes('10/14(三) 0~19:30'), true);
  check('空檔：整天行程不列', free.some((l) => l.startsWith('10/20(') || l.startsWith('10/21(')), false);
  free = freeLines({ ws: 1080, we: 1320 });
  check('空檔：限定 18~22', free.includes('10/5(一) 18~22') && free.includes('10/8(四) 18~20'), true);
  $$('fdWinStart').value = '1230'; $$('fdWinEnd').value = '1440'; generateFreeDays();
  const free2030 = $$('freeDaysOutput').value.split('\n');
  check('空檔：限定 20:30～24 → 沒行程的日子也列出範圍（10/1(四) 20:30~24）', [free2030.includes('10/1(四) 20:30~24'), free2030.includes('10/1(四)')], [true, false]);
  check('空檔：限定範圍時，有行程的日子仍只列範圍內扣除後的空檔（10/5 原本 0~9, 12:30~24）', free2030.includes('10/5(一) 20:30~24'), true);
  $$('fdWinStart').value = '0'; $$('fdWinEnd').value = '1440'; generateFreeDays();
  check('空檔：範圍改回整天 → 沒行程的日子又只列日期', $$('freeDaysOutput').value.split('\n').includes('10/1(四)'), true);
  $$('fdWinStart').value = '1080'; $$('fdWinEnd').value = '1320'; generateFreeDays();
  free = freeLines({ dow: [0, 6] }); // 索引同 Date.getDay()：日=0、六=6
  check('空檔：排除週末', free.some((l) => /\((六|日)\)/.test(l)), false);
  free = freeLines({ hol: true });
  check('空檔：排除假日', free.some((l) => l.startsWith('10/9(') || l.startsWith('10/10(')), false);
  closeModal('freeDaysModal');

  // ── 拖曳：新增、移動、複製、取消 ─────────────────────────
  openMonth(9);
  fire(cell(1), 'mousedown'); fire(cell(3), 'mouseover'); fire(cell(3), 'mouseup');
  check('拖曳選取 → 新增視窗', [isModalOpen('eventModal'), $$('evStart').value, $$('evEnd').value, $$('eventModalTitle').textContent], [true, '2026-10-01', '2026-10-03', '新增行程']);
  check('新增視窗沒有複製／刪除鈕', [$$('btnCopyEv').hidden, $$('deleteEvBtn').hidden], [true, true]);
  closeEventModal();

  fire(cell(5).querySelector('.event-bar'), 'mousedown'); fire(cell(6), 'mouseover');
  check('拖曳預覽落點', [...document.querySelectorAll('#monthFullCal .move-target')].map((x) => x.dataset.date), ['2026-10-06']);
  fire(cell(6), 'mouseup');
  check('詢問移動／複製', $$('moveAskText').textContent, '「單日」10/5 → 10/6');
  $$('btnCopyDo').click();
  check('選複製', events.filter((e) => e.title === '單日').map((e) => e.start).sort(), ['2026-10-05', '2026-10-06']);
  fire(cell(6).querySelector('.event-bar'), 'mousedown'); fire(cell(7), 'mouseover'); fire(cell(7), 'mouseup');
  $$('btnMoveDo').click();
  check('選移動', events.filter((e) => e.title === '單日').map((e) => e.start).sort(), ['2026-10-05', '2026-10-07']);
  fire(cell(7).querySelector('.event-bar'), 'mousedown'); fire(cell(9), 'mouseover'); fire(cell(9), 'mouseup');
  $$('btnMoveCancel').click();
  check('選取消', events.filter((e) => e.title === '單日').map((e) => e.start).sort(), ['2026-10-05', '2026-10-07']);
  fire(cell(7).querySelector('.event-bar'), 'mousedown'); fire(cell(7), 'mouseup'); fire(cell(7).querySelector('.event-bar'), 'click');
  check('沒移動 → 點擊開啟編輯', [isModalOpen('eventModal'), $$('evTitle').value, $$('btnCopyEv').hidden], [true, '單日', false]);
  closeEventModal();

  // ── 編輯視窗內「複製」到其他月份 ─────────────────────────
  openEditEvent('e3');
  $$('btnCopyEv').click();
  check('複製對話框預設下週', [isModalOpen('copyModal'), $$('copyTarget').value], [true, '2026-10-21']);
  check('複製對話框說明', $$('copyInfo').textContent, '「【TRPG】染香 - NC 《人偶X不知道禮服的秘密》」10/14（共 1 天）');
  $$('copyTarget').value = '2026-11-18'; $$('btnConfirmCopy').click();
  const copied = events.find((e) => e.start === '2026-11-18');
  check('複製到其他月份：內容相同、日期不同', [copied.end, copied.startTime, copied.endTime, copied.category, copied.trpg.script, copied.id !== 'e3'], ['2026-11-18', '19:30', '24:00', 'cat_gm', '人偶X不知道禮服的秘密', true]);
  check('複製後原行程不變、行程視窗仍開著', [eventById('e3').start, isModalOpen('eventModal'), isModalOpen('copyModal')], ['2026-10-14', true, false]);
  // 跨日行程：天數不變；未儲存的修改也會帶入
  closeEventModal();
  openEditEvent('e2'); type('evTitle', '改過標題'); $$('btnCopyEv').click();
  check('跨日行程說明含天數', $$('copyInfo').textContent, '「改過標題」10/8～10/10（共 3 天）');
  $$('copyTarget').value = '2026-12-30'; $$('btnConfirmCopy').click();
  const longCopy = events.find((e) => e.start === '2026-12-30');
  check('跨日複製：結束日順延、帶入未儲存修改', [longCopy.end, longCopy.title, eventById('e2').title], ['2027-01-01', '改過標題', '跨日']);
  $$('btnCancelCopy') && closeEventModal();
  openEditEvent('e1'); $$('btnCopyEv').click(); $$('copyTarget').value = ''; const before = events.length; $$('btnConfirmCopy').click();
  check('沒選日期不會複製', [events.length, isModalOpen('copyModal')], [before, true]);
  $$('btnCancelCopy').click(); closeEventModal();

  // ── 編輯與儲存、TRPG、系統紀錄 ───────────────────────────
  trpgSystems = [];
  openEditEvent('e3');
  check('TRPG 載入', [$$('trpgGm').value, $$('trpgSystem').value, !$$('trpgFields').hidden, $$('evStartTimeH').value, $$('evEndTimeH').value, $$('evEndTimeM').disabled], ['染香', 'NC', true, '19', '24', true]);
  type('trpgSystem', 'COC'); saveEvent();
  check('儲存後系統被記住', [trpgSystems, evName(eventById('e3'))], [['COC'], '【TRPG】染香 - COC 《人偶X不知道禮服的秘密》']);
  openNewEvent('2026-10-25', '2026-10-25'); [...document.querySelectorAll('.cat-chip')][0].click();
  type('trpgGm', 'GM'); type('trpgScript', '劇本'); choose('evStartTimeH', '21'); choose('evStartTimeM', '15'); choose('evEndTimeH', '20'); saveEvent();
  const ne = events[events.length - 1];
  check('新增 TRPG 行程（時間顛倒會對調）', [ne.title, ne.category, ne.startTime, ne.endTime, ne.color1, evName(ne)], ['', 'cat_play', '20:00', '21:15', '#6f9be8', '【TRPG】GM 《劇本》']);
  openNewEvent('2026-10-26', '2026-10-26'); type('evTitle', '素'); saveEvent();
  check('一般行程不帶 TRPG', [events[events.length - 1].category, events[events.length - 1].trpg], ['', null]);
  openEditEvent(events[events.length - 1].id); deleteEvent();
  check('刪除', events.some((e) => e.title === '素'), false);

  // 系統下拉
  openNewEvent('2026-10-27', '2026-10-27'); [...document.querySelectorAll('.cat-chip')][0].click(); $$('btnSysDrop').click();
  check('系統下拉列出紀錄', [...document.querySelectorAll('.sys-item span')].map((x) => x.textContent), ['COC']);
  document.querySelector('.sys-item span').click();
  check('點選填入並預覽', [$$('trpgSystem').value, $$('trpgPreview').textContent], ['COC', '【TRPG】COC']);
  closeEventModal();

  // ── 同行者 ───────────────────────────────────────────────
  openNewEvent('2026-10-29', '2026-10-29');
  type('evTitle', '聚餐'); type('evPeople', ' 小明\n\n小華  \n');
  saveEvent();
  const pe = events[events.length - 1];
  check('同行者：每行一人、去除空白與空行', pe.people, ['小明', '小華']);
  check('同行者：顯示在標題後面', [evName(pe), cell(29).querySelector('.event-label-inline').textContent], ['聚餐 with 小明、小華', '聚餐 with 小明、小華']);
  check('同行者：提示文字', cell(29).querySelector('.event-bar').title, '聚餐 with 小明、小華');
  openEditEvent(pe.id);
  check('同行者：編輯時還原成每行一人', $$('evPeople').value, '小明\n小華');
  type('evPeople', ''); saveEvent();
  check('同行者：清空後不再顯示', [eventById(pe.id).people, evName(eventById(pe.id))], [[], '聚餐']);
  // TRPG 行程也會接在組合文字後面；複製會帶同行者
  openEditEvent('e3'); type('evPeople', '阿一'); $$('btnCopyEv').click();
  check('同行者：複製對話框說明含 with', $$('copyInfo').textContent.includes(' with 阿一'), true);
  $$('copyTarget').value = '2026-11-30'; $$('btnConfirmCopy').click();
  check('同行者：複製帶入', events.find((e) => e.start === '2026-11-30').people, ['阿一']);
  closeEventModal();

  // ── 不影響空檔 ───────────────────────────────────────────
  events.push({ ...base, id: 'nb1', title: '只是紀錄', start: '2026-10-02', end: '2026-10-03', startTime: '', endTime: '', noBlock: true });
  events.push({ ...base, id: 'nb2', title: '紀錄加有事', start: '2026-10-06', end: '2026-10-06', startTime: '', endTime: '', noBlock: true });
  events.push({ ...base, id: 'nb3', title: '真的有事', start: '2026-10-06', end: '2026-10-06', startTime: '10:00', endTime: '11:00' });
  openMonth(9);
  const nbFree = freeLines();
  check('不影響空檔：整天紀錄的日子仍算有空', [nbFree.includes('10/2(五)'), nbFree.includes('10/3(六)')], [true, true]);
  check('不影響空檔：與一般行程同日只扣一般行程', nbFree.includes('10/6(二) 0~10, 11~24'), true);
  openMonth(9);
  check('不影響空檔：仍顯示在月曆上', [!!cell(2).querySelector('.event-bar'), !!cell(3).querySelector('.event-bar')], [true, true]);
  openEditEvent('nb1');
  check('不影響空檔：編輯時還原勾選', [$$('evNoBlock').checked, $$('btnCopyEv').hidden], [true, false]);
  $$('evNoBlock').checked = false; saveEvent();
  check('取消勾選後恢復佔用', [eventById('nb1').noBlock, freeLines().some((l) => l.startsWith('10/2('))], [false, false]);
  openEditEvent('nb2'); $$('btnCopyEv').click(); $$('copyTarget').value = '2026-11-05'; $$('btnConfirmCopy').click();
  check('複製會帶入「不影響空檔」', events.find((e) => e.start === '2026-11-05').noBlock, true);
  closeEventModal(); openNewEvent('2026-10-30', '2026-10-30');
  check('新增行程預設為會佔用', $$('evNoBlock').checked, false);
  closeEventModal(); closeModal('freeDaysModal');

  // ── 每格 5 行：假日名佔 1 行，放不下時最後一行是「+N」────
  const manyDay = (d, n) => { for (let i = 0; i < n; i++) events.push({ ...base, id: `m${d}_${i}`, title: `行程${i + 1}`, start: `2026-10-${d}`, end: `2026-10-${d}`, startTime: '', endTime: '' }); };
  manyDay('15', 4); manyDay('16', 6); manyDay('17', 8); manyDay('10', 3); manyDay('09', 4); // 10/9 補假、10/10 國慶日（兩天原本就各有 1 個跨日行程 e2，所以實際是 4 個與 5 個）
  openMonth(9);
  const bars = (d) => cell(d).querySelectorAll('.event-bar').length;
  const badge = (d) => { const b = cell(d).querySelector('.more-badge'); return b ? b.textContent : null; };
  check('無假日：第 1 行也留給假日名，4 個剛好放下、不出現 +N', [bars(15), badge(15), !!cell(15).querySelector('.holiday-name.empty')], [4, null, true]);
  check('無假日：6 個 → 顯示 3 個＋「+3」', [bars(16), badge(16)], [3, '+3']);
  check('無假日：8 個 → 顯示 3 個＋「+5」', [bars(17), badge(17)], [3, '+5']);
  check('假日名佔一行：4 個剛好放下', [!!cell(10).querySelector('.holiday-name'), bars(10), badge(10)], [true, 4, null]);
  check('假日＋5 個 → 假日名、3 個行程、「+2」共 5 行', [bars(9), badge(9)], [3, '+2']);
  check('「+N」永遠在最後一行', cell(9).lastElementChild.classList.contains('more-row'), true);
  fire(cell(17).querySelector('.more-badge'), 'mousedown'); fire(cell(17).querySelector('.more-badge'), 'mouseup');
  check('按「+N」不會當成拖曳新增', isModalOpen('eventModal'), false);
  fire(cell(17).querySelector('.more-badge'), 'click');
  check('點「+N」開啟當天清單（列出全部）', [isModalOpen('dayModal'), $$('dayListTitle').textContent, document.querySelectorAll('#dayListBody .day-item').length], [true, '10/17(六) 的行程', 8]);
  document.querySelectorAll('#dayListBody .day-item')[7].click();
  check('點清單項目 → 開啟該行程編輯（含被隱藏的第 8 個）', [isModalOpen('dayModal'), isModalOpen('eventModal'), $$('evTitle').value], [false, true, '行程8']);
  closeEventModal();
  // 高度：不論有沒有行程、有沒有假日，每格一樣高，且剛好容納 5 行
  const allH = [...new Set([...document.querySelectorAll('#monthFullCal .cal-day[data-date]')].map((x) => Math.round(x.getBoundingClientRect().height)))];
  check('--cell-rows 與設定一致', getComputedStyle(document.documentElement).getPropertyValue('--cell-rows').trim(), String(CELL_ROWS));
  check('所有日期格高度一致', allH.length, 1);
  check('格子放得下日期列＋5 行', allH[0] >= 25 + CELL_ROWS * 20, true);
  const rowsBottom = (d) => Math.max(...[...cell(d).children].map((c) => c.getBoundingClientRect().bottom)) - cell(d).getBoundingClientRect().top;
  check('假日＋超過 5 個的格子，內容不超出格子', rowsBottom(9) <= allH[0], true);
  events = events.filter((e) => !e.id.startsWith('m')); openMonth(9);

  // ── 跨日行程：換月、換週時補上名稱；不影響空檔的不顯示在年度總覽 ──
  const keepEv3 = events;
  const labelOf = (d) => { const l = cell(d).querySelector('.event-label-inline'); return l ? l.textContent : null; };
  events = [
    { ...base, id: 'sp1', title: '跨月活動', start: '2026-09-28', end: '2026-10-14', startTime: '', endTime: '' },
    { ...base, id: 'sp2', title: '單日', start: '2026-10-07', end: '2026-10-07', startTime: '19:00', endTime: '' },
    { ...base, id: 'sp3', title: '只是紀錄', start: '2026-10-20', end: '2026-10-21', startTime: '', endTime: '', noBlock: true },
  ];
  setWeekStart(1); openMonth(9);
  check('跨月行程：下個月 1 號補上名稱', labelOf(1), '跨月活動');
  check('跨月行程：中間日不重複', [labelOf(2), labelOf(3), labelOf(4)], [null, null, null]);
  check('跨月行程：週一（週首）補上名稱', [labelOf(5), labelOf(12)], ['跨月活動', '跨月活動']);
  check('跨月行程：延續日不帶時間、起始日帶時間', [labelOf(7), labelOf(13)], ['19:00 單日', null]);
  setWeekStart(0); openMonth(9);
  check('週日開頭：週首改為週日', [labelOf(4), labelOf(11), labelOf(5)], ['跨月活動', '跨月活動', null]);
  setWeekStart(1);
  check('行程名稱與提示維持完整', cell(1).querySelector('.event-bar').title, '跨月活動');
  renderMiniCal(9);
  const miniFlag = (d) => document.querySelectorAll('#mini-9 .mini-day')[d - 1].classList.contains('has-event');
  check('年度總覽：一般行程有顯示', [miniFlag(1), miniFlag(14)], [true, true]);
  check('年度總覽：不影響空檔的不顯示', [miniFlag(20), miniFlag(21)], [false, false]);
  check('月視圖：不影響空檔的仍顯示', [!!cell(20).querySelector('.event-bar'), labelOf(20)], [true, '只是紀錄']);
  events = keepEv3; openMonth(9);

  // ── 跨日行程經過假日時，色條高度要一致 ───────────────────
  const keepEv4 = events;
  events = [{ ...base, id: 'lg', title: '長行程', start: '2026-10-07', end: '2026-10-12', startTime: '', endTime: '' }]; // 10/9 補假、10/10 國慶日
  openMonth(9);
  const barTop = (d) => cell(d).querySelector('.event-bar').getBoundingClientRect().top - cell(d).getBoundingClientRect().top;
  check('跨日行程：經過假日與一般日，色條離格子頂端距離相同', [...new Set([7, 8, 9, 10, 11, 12].map((d) => Math.round(barTop(d))))].length, 1);
  check('每一格都有保留假日行（假日顯示名稱、其他留空）', [cell(9).querySelector('.holiday-name').textContent, cell(8).querySelector('.holiday-name').textContent, cell(8).querySelector('.holiday-name').classList.contains('empty')], ['補假', '', true]);
  events = keepEv4; openMonth(9);

  // ── 底色太亮時改用黑字 ───────────────────────────────────
  const keepEvents = events;
  const dtEv = (id, d, extra) => ({ ...base, id, title: id, start: `2026-10-${d}`, end: `2026-10-${d}`, startTime: '', endTime: '', ...extra });
  events = [
    dtEv('dtLight', '01', { color1: '#a8dce8' }),
    dtEv('dtPink', '02', { color1: '#f08aa8' }),
    dtEv('dtBlue', '03', { color1: '#6f9be8' }),
    dtEv('dtYellow', '04', { color1: '#e8c86f' }),
    dtEv('dtGradMid', '05', { colorMode: 'gradient', color1: '#ffffff', color2: '#000000' }),
    dtEv('dtGradDark', '06', { colorMode: 'gradient', color1: '#223344', color2: '#334455' }),
  ];
  openMonth(9);
  const darkOf = (d) => cell(d).querySelector('.event-bar').classList.contains('dark-text');
  check('亮色底 → 黑字', [darkOf(1), darkOf(4)], [true, true]);
  check('預設粉／藍等中等亮度 → 維持白字', [darkOf(2), darkOf(3)], [false, false]);
  check('漸層以平均亮度判斷', [darkOf(5), darkOf(6)], [true, false]);
  renderMiniCal(9);
  check('年度總覽迷你月曆同步', [...document.querySelectorAll('#mini-9 .mini-day')].slice(0, 3).map((x) => x.classList.contains('dark-text')), [true, false, false]);
  backToYear(); openMonth(9);
  check('黑字的實際顏色', getComputedStyle(cell(1).querySelector('.event-label-inline')).color, 'rgb(17, 17, 17)');
  check('白字維持白色', getComputedStyle(cell(2).querySelector('.event-label-inline')).color, 'rgb(255, 255, 255)');
  events = keepEvents; openMonth(9);

  // ── 類別管理 ─────────────────────────────────────────────
  openNewEvent('2026-10-28', '2026-10-28'); $$('btnManageCat').click(); $$('btnAddCat').click();
  check('新增類別', [isModalOpen('catModal'), categories.map((c) => c.name + ':' + !!c.trpg)], [true, ['TRPG・跑團:true', 'TRPG・帶團:true', '實況:false', '新類別:false']]);
  $$('btnCloseCat').click(); closeEventModal();

  // ── 背景與配色（亮暗共用）────────────────────────────────
  showBgModal(); setBgMode('pattern'); bgDraft.pattern.type = 'heart'; updateBgPreview(); applyBg();
  setTheme('dark');
  check('自訂背景切換主題後保留', [bgSettings.mode, bgSettings.pattern.type], ['pattern', 'heart']);
  localStorage.removeItem(KEY.bg); localStorage.removeItem(KEY.colors); setTheme('dark');
  check('未自訂時依主題用預設', bgSettings.colors[0], '#1f1a24');
  showBgModal(); setBgMode('gradient'); $$('btnAutoColors').click();
  check('依背景自動配色（暗底 → 淺字）', luminance(calColors.text) > 0.5, true);
  closeBgModal(); setTheme('light');
  check('自動配色（亮底 → 深字）', (setTheme('light'), showBgModal(), setBgMode('gradient'), $$('btnAutoColors').click(), closeBgModal(), luminance(calColors.text) < 0.5), true);

  // ── 文字色每個主題各存一份（背景共用）────────────────────
  localStorage.clear();
  const titleColor = () => getComputedStyle(document.documentElement).getPropertyValue('--cal-title').trim();
  setTheme('dark'); showBgModal(); setBgMode('gradient'); document.querySelectorAll('#bgColorRow .bgc').forEach((input, k) => { input.value = ['#101820', '#182030', '#202838'][k]; }); updateBgPreview();
  $$('btnAutoColors').click(); applyBg();
  const darkTitle = titleColor();
  setTheme('light');
  const lightTitle = titleColor();
  check('切換主題：標題文字色跟著換（暗→淺字、亮→深字）', [luminance(darkTitle) > 0.5, luminance(lightTitle) < 0.5], [true, true]);
  check('切換主題：自訂背景仍共用', bgSettings.colors[0], '#101820');
  setTheme('dark');
  check('切回暗色：還原當時設定的文字色', titleColor(), darkTitle);
  check('文字色分開儲存', [load(KEY.colors, null), !!load(colorsKey('dark'), null)], [null, true]);
  // 舊版（亮暗共用同一份）的資料搬家
  localStorage.clear();
  save(KEY.colors, { text: '#f3e6ec', muted: '#b9a3ae', border: '#4a3b52', cardBg: '#000000', cardAlpha: 30 }); migrateSharedColors();
  check('舊資料是淺色文字 → 搬到暗色', [load(KEY.colors, null), load(colorsKey('dark'), {}).text], [null, '#f3e6ec']);
  localStorage.clear();
  save(KEY.colors, { text: '#222222', muted: '#888888', border: '#cccccc', cardBg: '#ffffff', cardAlpha: 80 }); migrateSharedColors();
  check('舊資料是深色文字 → 留在亮色', [load(KEY.colors, {}).text, load(colorsKey('dark'), null)], ['#222222', null]);
  localStorage.clear(); setTheme('light');

  // ── v0.19：點背景取消、HEX、實況前綴、字級、匯出勾選 ─────
  localStorage.clear(); events = []; categories = clone(DEFAULT_CATEGORIES); openMonth(9);
  // 1. 點行程視窗外的灰色背景就取消（不儲存）
  const evCount = events.length;
  openNewEvent('2026-10-05', '2026-10-05'); type('evTitle', '不該被存');
  $$('eventModal').click(); // 點在遮罩上（target 就是遮罩本身）
  check('點視窗外灰色背景 → 關閉且不儲存', [isModalOpen('eventModal'), events.length], [false, evCount]);
  openNewEvent('2026-10-05', '2026-10-05'); $$('eventModal').querySelector('.modal').click();
  check('點在視窗內容上不會關閉', isModalOpen('eventModal'), true);
  closeEventModal();

  // 3. 類別「標題前綴」：實況 → 標題自動加【實況】
  const liveCat = categories.find((c) => c.id === 'cat_live');
  check('預設有「實況」類別與前綴', [liveCat.name, liveCat.tag], ['實況', '實況']);
  openNewEvent('2026-10-07', '2026-10-07');
  [...document.querySelectorAll('.cat-chip')].find((x) => x.textContent === '實況').click();
  type('evTitle', '雜談夜');
  check('行程視窗即時預覽', $$('namePreview').textContent, '顯示為：【實況】雜談夜');
  saveEvent();
  const liveEv = events[events.length - 1];
  check('儲存的標題不含前綴（顯示時才加）', [liveEv.title, evName(liveEv)], ['雜談夜', '【實況】雜談夜']);
  openMonth(9);
  check('月曆色條顯示【實況】', cell(7).querySelector('.event-label-inline').textContent, '【實況】雜談夜');
  openEditEvent(liveEv.id); type('evTitle', '【實況】已自己寫了');
  check('標題已含前綴不重複', $$('namePreview').textContent, '顯示為：【實況】已自己寫了');
  type('evPeople', '小明');
  check('預覽包含同行者', $$('namePreview').textContent, '顯示為：【實況】已自己寫了 with 小明');
  closeEventModal();
  openNewEvent('2026-10-08', '2026-10-08'); type('evTitle', '一般');
  check('沒選類別 → 預覽沒有前綴', $$('namePreview').textContent, '顯示為：一般'); closeEventModal();
  categories.find((c) => c.id === 'cat_live').tag = '直播';
  check('改前綴後顯示跟著變', evName(liveEv), '【直播】雜談夜');
  categories.find((c) => c.id === 'cat_live').tag = '實況';
  check('TRPG 類別不重複加前綴', evName({ title: 'x', category: 'cat_gm', trpg: { gm: 'A', system: '', script: '' } }), '【TRPG】A');

  // 4. 日期、星期文字比行程文字大
  events = [{ ...base, id: 'fs', title: '字級', start: '2026-10-12', end: '2026-10-12', startTime: '', endTime: '' }]; openMonth(9);
  const px = (node) => parseFloat(getComputedStyle(node).fontSize);
  const labelPx = px(cell(12).querySelector('.event-label-inline'));
  check('日期數字比行程文字大', px(cell(12).querySelector('.day-num')) > labelPx + 2, true);
  check('星期標題比行程文字大', px(document.querySelector('.dow-label')) > labelPx + 2, true);
  const cellHs = new Set([...document.querySelectorAll('#monthFullCal .cal-day[data-date]')].map((x) => Math.round(x.getBoundingClientRect().height)));
  check('放大字級後所有格子仍等高', cellHs.size, 1);
  check('放大字級後內容不超出格子', [...document.querySelectorAll('#monthFullCal .cal-day[data-date]')].every((x) => x.scrollHeight <= x.clientHeight + 3), true);

  // 5. 匯出時可取消勾選部分行程
  events = [
    { ...base, id: 'x1', title: '公開', start: '2026-10-01', end: '2026-10-01', startTime: '', endTime: '', category: 'cat_play' },
    { ...base, id: 'x2', title: '私人', start: '2026-10-02', end: '2026-10-02', startTime: '', endTime: '', category: 'cat_live' },
    { ...base, id: 'x3', title: '私人二', start: '2026-10-03', end: '2026-10-03', startTime: '', endTime: '', category: 'cat_live' },
    { ...base, id: 'x4', title: '無類別', start: '2026-10-04', end: '2026-10-04', startTime: '', endTime: '' },
  ];
  showExportModal();
  check('匯出視窗：預設全選', [isModalOpen('exportModal'), document.querySelectorAll('#expList input:checked').length, $$('expCount').textContent, $$('btnDoExport').textContent], [true, 4, '已選 4 / 4 筆', '匯出 4 筆']);
  check('匯出視窗：類別快速勾選鈕', [...document.querySelectorAll('#expCats .cat-chip')].map((x) => x.textContent), ['TRPG・跑團 (1)', '實況 (2)', '無類別 (1)']);
  [...document.querySelectorAll('#expCats .cat-chip')].find((x) => x.textContent.startsWith('實況')).click();
  check('點類別 → 該類別整批取消', [document.querySelectorAll('#expList input:checked').length, $$('expCount').textContent], [2, '已選 2 / 4 筆']);
  document.querySelectorAll('#expList input')[3].click(); // 取消「無類別」（依日期排序第 4 個）
  check('單筆取消', $$('btnDoExport').textContent, '匯出 1 筆');
  let outText; const origDl = window.download; window.download = (blob) => { outText = blob.text(); };
  $$('btnDoExport').click(); window.download = origDl;
  const out = JSON.parse(await outText);
  check('匯出檔只含勾選的行程', [out.events.map((e) => e.title), isModalOpen('exportModal')], [['公開'], false]);
  check('類別設定仍完整匯出', out.categories.length, categories.length);
  showExportModal(); $$('expNone').click();
  check('全不選 → 匯出鈕停用', [$$('btnDoExport').disabled, document.querySelectorAll('#expList input:checked').length], [true, 0]);
  $$('expAll').click(); check('全選', [$$('btnDoExport').disabled, $$('expCount').textContent], [false, '已選 4 / 4 筆']);
  $$('exportModal').click(); check('點視窗外關閉', isModalOpen('exportModal'), false);
  events = []; localStorage.clear();

  // ── v0.21：直播行程（週曆／月曆；行程從行事曆「匯入」複本）──
  localStorage.clear(); categories = clone(DEFAULT_CATEGORIES); setWeekStart(1); streamEvents = [];
  const mk = (id, title, s, e, extra) => ({ ...base, id, title, start: `2026-10-${s}`, end: `2026-10-${e}`, startTime: '', endTime: '', ...extra });
  events = [
    mk('s1', '直播A', '14', '14', { startTime: '20:00', endTime: '22:00', category: 'cat_live' }),
    mk('s2', '整天活動', '14', '14'),
    mk('s3', '私人', '14', '14'),
    mk('s4', '跨日直播', '15', '17', { startTime: '19:00', endTime: '21:00' }),
    mk('s5', '國慶直播', '10', '10'),
    mk('s6', '下週', '21', '21'),
  ];
  streamAnchor = '2026-10-14'; setStreamMode('week'); openStream();
  check('直播行程：切換到直播畫面', currentView(), 'stream');
  check('直播行程一開始是空的，顯示提示', [streamEvents.length, $$('streamHint').hidden, document.querySelectorAll('.sw-event').length], [0, false, 0]);

  // 匯入：從行事曆挑選 → 複製進直播行程
  showStreamImport();
  check('匯入視窗（週曆）：只列這一週（10/12～10/18）的私人行程、預設都不選', [isModalOpen('streamPickModal'), document.querySelectorAll('#spList .exp-row').length, $$('spCount').textContent, $$('spDo').disabled, $$('spScope').textContent.includes('這一週')], [true, 4, '已選 0 / 4 筆', true, true]);
  const pickRow = (title) => [...document.querySelectorAll('#spList .exp-row')].find((r) => r.textContent.includes(title)).querySelector('input');
  ['直播A', '整天活動', '跨日直播'].forEach((t) => pickRow(t).click());
  check('勾選後更新數量與按鈕', [$$('spCount').textContent, $$('spDo').textContent, $$('spDo').disabled], ['已選 3 / 4 筆', '匯入 3 筆', false]);
  check('類別快速鈕（只算這一週的）', [...document.querySelectorAll('#spCats .cat-chip')].map((x) => x.textContent), ['實況 (1)', '無類別 (3)']);
  $$('spDo').click();
  setStreamMode('month'); showStreamImport();
  check('匯入視窗（月曆）：列出整個 10 月的私人行程', [document.querySelectorAll('#spList .exp-row').length, $$('spCount').textContent, $$('spScope').textContent.includes('2026 年 10 月')], [6, '已選 0 / 6 筆', true]);
  ['國慶直播', '下週'].forEach((t) => pickRow(t).click());
  $$('spDo').click(); setStreamMode('week');
  check('匯入：複製 5 筆、記下來源，視窗關閉', [streamEvents.length, streamEvents.every((e) => e.sourceId && e.id !== e.sourceId), isModalOpen('streamPickModal')], [5, true, false]);
  check('匯入後存檔', load(KEY.streamEvents, []).length, 5);
  check('行事曆原本的行程不變', [events.length, events.some((e) => e.sourceId)], [6, false]);
  check('提示消失', $$('streamHint').hidden, true);

  const col = (d) => document.querySelector(`.sw-day[data-date="2026-10-${d}"]`);
  check('週曆：期間標題（週一開頭）', $$('streamPeriod').textContent, '2026/10/12 ～ 10/18');
  check('週曆：7 欄、起始是週一', [document.querySelectorAll('.sw-day').length, document.querySelector('.sw-day').dataset.date], [7, '2026-10-12']);
  check('週曆：只顯示匯入的（沒匯入的「私人」不出現）', [...col(14).querySelectorAll('.sw-name')].map((x) => x.textContent), ['整天活動', '【實況】直播A']);
  check('週曆：有時間的顯示時間', [...col(14).querySelectorAll('.sw-time')].map((x) => x.textContent), ['20:00～22:00']);
  check('週曆：跨日行程每天都顯示，時間只在起始日（結束日顯示結束時間）', [col(15).querySelector('.sw-time').textContent, col(16).querySelector('.sw-time'), col(17).querySelector('.sw-time').textContent], ['19:00～21:00', null, '～21:00']);
  streamAnchor = '2026-10-10'; renderStreamView();
  check('週曆：假日欄顯示假日名', document.querySelector('.sw-day[data-date="2026-10-10"] .sw-holiday').textContent, '國慶日');
  check('週曆：一般日的假日行留空但佔位', [document.querySelector('.sw-day[data-date="2026-10-07"] .sw-holiday').classList.contains('empty'), document.querySelector('.sw-day[data-date="2026-10-07"] .sw-holiday').textContent], [true, '']);
  streamAnchor = '2026-10-14'; setWeekStart(0); renderStreamView();
  check('週曆：週日開頭時期間跟著變', $$('streamPeriod').textContent, '2026/10/11 ～ 10/17');
  setWeekStart(1); renderStreamView();

  // 切換週／月、翻頁
  streamShift(1);
  check('週曆：下一週 = +7 天，只顯示那週的行程', [streamAnchor, $$('streamPeriod').textContent, [...document.querySelectorAll('.sw-name')].map((x) => x.textContent)], ['2026-10-21', '2026/10/19 ～ 10/25', ['下週']]);
  streamShift(-1); setStreamMode('month');
  check('月曆：標題與模式', [$$('streamPeriod').textContent, $$('streamMonth').hidden, $$('streamWeek').hidden, loadRaw(KEY.streamMode)], ['2026 年 10 月', false, true, 'month']);
  const scell = (d) => document.querySelector(`#streamMonth .cal-day[data-date="2026-10-${pad2(d)}"]`);
  const mbars = (d) => scell(d).querySelectorAll('.event-bar').length;
  check('月曆：只顯示匯入的行程', [mbars(14), mbars(15), mbars(21)], [2, 1, 1]);
  streamShift(1);
  check('月曆：下個月（跳到 1 號）', [streamAnchor, $$('streamPeriod').textContent], ['2026-11-01', '2026 年 11 月']);
  streamShift(-1); streamToday();
  check('回到今天', streamAnchor, toDs(new Date()));
  streamAnchor = '2026-10-14'; renderStreamView();

  // 月曆「+N」只列出直播行程的行程
  for (let i = 0; i < 5; i++) streamEvents.push({ ...mk(`sm${i}`, `S${i}`, '20', '20') });
  events.push(mk('sx1', '不顯示一', '20', '20'), mk('sx2', '不顯示二', '20', '20'));
  renderStreamView();
  check('月曆：直播行程 5 個 → 3 個＋「+2」', [mbars(20), scell(20).querySelector('.more-badge').textContent], [3, '+2']);
  scell(20).querySelector('.more-badge').click();
  check('點「+N」→ 當天清單只有直播行程的行程', [isModalOpen('dayModal'), document.querySelectorAll('#dayListBody .day-item').length], [true, 5]);
  document.querySelector('#dayListBody .day-item').click();
  check('從當天清單點行程 → 編輯的是直播行程那一份', [isModalOpen('eventModal'), editKind, $$('eventModalTitle').textContent.includes('直播行程')], [true, 'stream', true]);
  closeEventModal();
  streamEvents = streamEvents.filter((e) => !e.id.startsWith('sm')); events = events.filter((e) => !e.id.startsWith('sx')); renderStreamView();

  // 直播行程的行程各改各的
  setStreamMode('week');
  col(14).querySelector('.sw-event').click();
  check('點週曆的行程 → 開啟編輯（直播行程那份）', [isModalOpen('eventModal'), editKind, $$('evTitle').value, $$('btnCopyEv').hidden], [true, 'stream', '整天活動', false]);
  type('evTitle', '改名後的直播'); saveEvent();
  const edited = streamEvents.find((e) => e.sourceId === 's2');
  check('改直播行程的行程：只改直播行程，行事曆不動，且保留來源', [edited.title, eventById('s2').title, edited.sourceId, load(KEY.streamEvents, []).some((e) => e.title === '改名後的直播')], ['改名後的直播', '整天活動', 's2', true]);
  check('改完後週曆立刻更新', [...col(14).querySelectorAll('.sw-name')].map((x) => x.textContent).includes('改名後的直播'), true);
  col(14).querySelector('.sw-event').click(); $$('deleteEvBtn').click();
  check('從直播行程刪除：行事曆那筆還在', [streamEvents.some((e) => e.sourceId === 's2'), !!eventById('s2'), editKind], [false, true, 'stream']);
  openEditEvent('s1'); check('編輯行事曆的行程會切回行事曆那份', [editKind, $$('eventModalTitle').textContent], ['main', '編輯行程']); closeEventModal();
  openStream(); col(14).querySelector('.sw-event').click(); $$('btnCopyEv').click(); $$('copyTarget').value = '2026-10-28'; $$('btnConfirmCopy').click();
  check('在直播行程複製行程 → 複製到直播行程，不跑到行事曆', [streamEvents.filter((e) => e.start === '2026-10-28').length, events.some((e) => e.start === '2026-10-28')], [1, false]);
  closeEventModal();

  // 再匯入同一筆 → 更新；沒選的不會動
  showStreamImport();
  check('已匯入的有標記', [...document.querySelectorAll('#spList .exp-tag')].map((x) => x.textContent).length > 0, true);
  pickRow('整天活動').click(); pickRow('直播A').click();
  const countBefore = streamEvents.length;
  $$('spDo').click();
  await new Promise((r) => setTimeout(r, 20));
  const s1copies = streamEvents.filter((e) => e.sourceId === 's1').length;
  check('重複匯入：已存在的更新、不重複，已刪掉的重新加入', [s1copies, streamEvents.filter((e) => e.sourceId === 's2').length, streamEvents.length - countBefore], [1, 1, 1]);
  check('更新用行事曆最新內容', streamEvents.find((e) => e.sourceId === 's2').title, '整天活動');
  { // v0.59：重複（匯入過的、或同一天同標題自己打的）要顯示差異、問覆蓋，不複製一份
    const keepEv = events, keepSt = streamEvents, msgs = [], keepToast = window.toast; window.toast = (m) => msgs.push(m);
    const ev = (id, extra) => ({ id, title: '重複測試', memo: '', detail: '', people: [], start: '2026-10-20', end: '2026-10-20', startTime: '20:00', endTime: '22:00', colorMode: 'solid', color1: '#f08aa8', color2: '#d9547e', category: '', ...extra });
    events = [ev('d1')]; streamEvents = [ev('d2', { startTime: '21:00', color1: '#112233', detail: '直播上寫的說明' })];
    const sel = () => { streamImportSel = new Set(['d1']); doStreamImport(); };
    sel();
    check('同天同標題但沒匯入過的直播行程：算重複、跳出視窗，列出有差異的項目', [isModalOpen('dupModal'), [...document.querySelectorAll('#dupList .dup-diff tr')].slice(1).map((r) => r.firstChild.textContent)], [true, ['開始時間', '顏色', '說明']]);
    check('差異視窗：目前與新的內容都顯示', [...document.querySelectorAll('#dupList .dup-diff tr')].slice(1, 2).map((r) => [r.children[1].textContent, r.children[2].textContent])[0], ['21:00', '20:00']);
    $$('dupCancel').click(); await new Promise((r) => setTimeout(r, 20));
    check('取消：什麼都不動、不複製', [streamEvents.length, streamEvents[0].startTime, isModalOpen('dupModal')], [1, '21:00', false]);
    sel(); $$('dupNone').click(); $$('dupDo').click(); await new Promise((r) => setTimeout(r, 20));
    check('全部略過：保留直播行程原樣、不多複製一份', [streamEvents.length, streamEvents[0].startTime, streamEvents[0].sourceId], [1, '21:00', undefined]);
    sel(); $$('dupAll').click(); $$('dupDo').click(); await new Promise((r) => setTimeout(r, 20));
    check('覆蓋：換成私人行程的內容、記下來源、仍只有一筆', [streamEvents.length, streamEvents[0].startTime, streamEvents[0].color1, streamEvents[0].detail, streamEvents[0].sourceId, streamEvents[0].id], [1, '20:00', '#f08aa8', '', 'd1', 'd2']);
    check('覆蓋後的提示', msgs.some((m) => m.includes('覆蓋 1 筆')), true);
    sel();
    check('內容完全一樣：不用問、直接略過', [isModalOpen('dupModal'), streamEvents.length, msgs.some((m) => m.includes('已是最新'))], [false, 1, true]);
    streamEvents = [ev('d3')]; sel();
    check('沒有差異的同天同標題：不問，直接認作同一筆（記下來源，不複製）', [isModalOpen('dupModal'), streamEvents.length, streamEvents[0].sourceId], [false, 1, 'd1']);
    window.toast = keepToast; events = keepEv; streamEvents = keepSt; closeModal('streamPickModal'); }

  // 行事曆上之後改了原行程，直播行程那份不跟著變（要手動重新匯入）
  eventById('s1').title = '行事曆上改名';
  check('行事曆改動不會自動同步到直播行程', streamEvents.find((e) => e.sourceId === 's1').title, '直播A');

  // 清空
  const origConfirm = window.confirm;
  window.confirm = () => false; clearStream();
  check('清空：按取消不會清', streamEvents.length > 0, true);
  window.confirm = () => true; clearStream();
  check('清空（週曆）：只清這一週（10/12～10/18）開始的行程，其他週與行事曆不受影響', [streamEvents.filter((e) => e.start >= '2026-10-12' && e.start <= '2026-10-18').length, streamEvents.length > 0, events.length > 0], [0, true, true]);
  const leftover = streamEvents.length;
  check('版面設定面板只有一個收合入口（工具列的「⚙ 版面設定」）', [!!$$('ssHide'), !!$$('stSettings')], [false, true]);
  check('清空鈕的文字跟著畫面（週曆＝這一週）', $$('stClear').textContent, '🗑 清空這一週的直播行程');
  window.confirm = () => false; clearStream();
  check('清空：按取消不會清', streamEvents.length, leftover);
  window.confirm = () => true; clearStream();
  check('這一週已經沒有行程：不再清、不會動到其他週', streamEvents.length, leftover);
  setStreamMode('month'); check('清空鈕的文字（月曆＝這個月）', $$('stClear').textContent, '🗑 清空這個月的直播行程');
  clearStream();
  check('清空（月曆）：清掉這個月剩下的行程，行事曆不受影響', [streamEvents.filter((e) => e.start.startsWith('2026-10')).length, events.length > 0, $$('streamHint').hidden === (streamEvents.length > 0)], [0, true, true]);
  streamEvents = []; saveStreamEvents(); setStreamMode('week');
  window.confirm = origConfirm;

  // 舊版（v0.21 初版：行程上的 stream 旗標）搬家
  localStorage.clear();
  events = [mk('old1', '舊旗標', '03', '03', { stream: true }), mk('old2', '沒旗標', '04', '04')]; streamEvents = [];
  migrateStreamFlags();
  check('舊旗標只搬一次：有旗標的成為直播行程複本、並清掉旗標', [streamEvents.map((e) => e.title + ':' + e.sourceId), events.some((e) => 'stream' in e)], [['舊旗標:old1'], false]);
  migrateStreamFlags();
  check('不會重複搬', streamEvents.length, 1);

  // 截圖（直播行程）
  events = [mk('shot1', '截圖用', '14', '14')]; streamEvents = [{ ...mk('shot2', '截圖用', '14', '14'), sourceId: 'shot1' }];
  // 截圖要等 html2canvas 跑完；用輪詢取代固定等待，機器忙的時候才不會誤判
  const waitUntil = async (fn, ms = 15000) => { const t = Date.now(); while (!fn() && Date.now() - t < ms) await new Promise((r) => setTimeout(r, 100)); };
  let stShot; const origDl2 = window.download; window.download = (blob, name) => { stShot = { name, size: blob.size }; };
  streamAnchor = '2026-10-14'; setStreamMode('week'); renderStreamView(); takeStreamScreenshot();
  await waitUntil(() => stShot);
  check('直播週曆截圖', [stShot && stShot.name, stShot && stShot.size > 1000], ['stream_week_20261012.png', true]);
  stShot = null; setStreamMode('month'); takeStreamScreenshot();
  await waitUntil(() => stShot);
  check('直播月曆截圖', [stShot && stShot.name, stShot && stShot.size > 1000], ['stream_month_202610.png', true]);
  window.download = origDl2;

  // 其他畫面的切換不受影響
  setTheme('dark'); check('直播行程中切換主題不出錯並維持在直播行程', currentView(), 'stream'); setTheme('light');
  backToYear(); check('回年度總覽', currentView(), 'year');
  openMonth(9); check('進月視圖', currentView(), 'month');
  setStreamMode('week'); events = []; streamEvents = []; localStorage.clear(); backToYear();

  // ── v0.22：直播行程版面設定（參考 KumoTools Stream Schedule Maker）──
  localStorage.clear(); streamSettings = clone(STREAM_DEFAULTS); streamDays = {}; streamPalettes = []; categories = clone(DEFAULT_CATEGORIES); setWeekStart(1);
  events = []; streamEvents = [
    { ...base, id: 'k1', title: '雜談', start: '2026-10-14', end: '2026-10-14', startTime: '20:00', endTime: '22:00', category: '', color1: '#6f9be8' },
    { ...base, id: 'k2', title: '遊戲', start: '2026-10-16', end: '2026-10-16', startTime: '', endTime: '', category: '', color1: '#f0a35e' },
  ];
  streamAnchor = '2026-10-14'; setStreamMode('week'); openStream(); buildStreamSettings();
  const box = $$('bgStreamPreview');
  const dayCard = (d) => document.querySelector(`.sw-day[data-date="2026-10-${d}"]`);
  check('預設：標題沒填就不顯示（不套用頁面標題）、副標題自動、帳號／署名隱藏，年份行只有年份', [$$('streamTitle').textContent + '|' + $$('streamTitle').hidden, $$('streamEyebrow').textContent, $$('streamHandle').hidden, $$('streamFoot').hidden, $$('streamTz').hidden === false, $$('streamAvatarWrap').hidden, $$('streamSocials').hidden], ['|true', '✦ 本週直播時間表 ✦', true, true, true, true, true]);
  check('預設：有行程與沒行程的日子都是 100% 不透明（沒勾休息日就不變淡）', [dayCard(14).style.opacity, dayCard(13).style.opacity], ['1', '1']);
  check('預設：沒行程的日子不顯示休息訊息', dayCard(13).querySelector('.sw-rest'), null);
  streamDays = { '2026-10-13': { rest: true } }; renderStreamView();
  check('勾了「休息日」才顯示休息訊息、並套用較淡的 55%', [dayCard(13).querySelector('.sw-rest').textContent, dayCard(13).style.opacity], ['休息日', '0.55']);

  // 左側面板（不是跳窗），用畫面上的欄位操作
  const ssRowOf = (label) => [...document.querySelectorAll('#ssBody .ss-row')].find((r) => r.querySelector('label') && r.querySelector('label').textContent.startsWith(label));
  const ssInput = (label, v, evt = 'input') => { const c = ssRowOf(label).querySelector('input[type=text], select, input[type=date]'); c.value = v; c.dispatchEvent(new Event(evt, { bubbles: true })); };
  check('設定面板：顯示在畫面上、有 7 個區段', [!$$('streamPanel').hidden, document.querySelectorAll('#ssBody .ss-sec').length], [true, 7]);
  check('設定面板不是跳出視窗，而且排在預覽區左邊（DOM 順序）', [$$('streamPanel').closest('.modal-overlay'), $$('streamPanel').nextElementSibling === $$('streamMain'), $$('streamLayout').firstElementChild === $$('streamPanel')], [null, true, true]);
  check('設定面板：寬螢幕固定在左側（sticky）、窄螢幕改排在上方', getComputedStyle($$('streamPanel')).position, innerWidth > 900 ? 'sticky' : 'static');
  { const titleInput = ssRowOf('標題').querySelector('input'); titleInput.value = 'x'; titleInput.dispatchEvent(new Event('input', { bubbles: true }));
    check('在面板打字不會重建面板（輸入框還是同一個、不會失去焦點）', ssRowOf('標題').querySelector('input') === titleInput, true); titleInput.value = ''; titleInput.dispatchEvent(new Event('input', { bubbles: true })); }
  ssInput('標題', '染香的直播'); ssInput('副標題', '✦ MY SCHEDULE ✦'); ssInput('帳號', '@someone');
  check('文字：標題、副標題、帳號', [$$('streamTitle').textContent, $$('streamEyebrow').textContent, $$('streamHandle').textContent, $$('streamHandle').hidden], ['染香的直播', '✦ MY SCHEDULE ✦', '@someone', false]);
  ssInput('署名', 'Art by @x'); ssSet('creditPos', 'right');
  check('文字：署名與位置', [$$('streamFoot').textContent, $$('streamFoot').dataset.pos, $$('streamFoot').hidden], ['Art by @x', 'right', false]);
  ssInput('休息日訊息', '好好休息 ♡');
  check('文字：休息日訊息', dayCard(13).querySelector('.sw-rest').textContent, '好好休息 ♡');
  ssInput('字型', 'rounded', 'change');
  check('文字：字型寫進 CSS 變數', box.style.getPropertyValue('--stream-font').includes('Huninn'), true);
  streamSettings.titleColor = '#ff0000'; ssSet('titleOutline', true);
  check('文字：標題顏色與描邊', [box.style.getPropertyValue('--stream-title-color'), box.style.getPropertyValue('--stream-title-shadow').includes('255, 255, 255') || box.style.getPropertyValue('--stream-title-shadow').includes('#ffffff')], ['#ff0000', true]);
  ssSet('titleOutline', false);
  check('文字：關閉描邊', box.style.getPropertyValue('--stream-title-shadow'), 'none');

  // 日程：語言、時區、跳到日期
  ssSet('lang', 'en');
  check('語言：英文星期與眉標（眉標已自訂所以不變）', [dayCard(14).querySelector('.sw-dow').textContent, dayCard(13).querySelector('.sw-rest').textContent], ['WED', '好好休息 ♡']);
  ssSet('eyebrow', ''); ssSet('restMsg', '');
  check('語言：英文預設文字', [$$('streamEyebrow').textContent, dayCard(13).querySelector('.sw-rest').textContent], ['✦ WEEKLY STREAM SCHEDULE ✦', 'Rest Day']);
  setStreamMode('month');
  check('語言：英文月曆標題與星期列', [$$('streamPeriod').textContent, document.querySelector('#streamMonth .dow-label').textContent], ['October 2026', 'Mon']);
  ssSet('lang', 'ja'); check('語言：日文', [$$('streamPeriod').textContent, $$('streamEyebrow').textContent], ['2026年10月', '✦ 今月の配信スケジュール ✦']);
  ssSet('lang', 'zh'); setStreamMode('week');
  ssInput('時區', 'Asia/Taipei', 'change');
  check('時區標示（只標示 GMT+幾，不寫地點）', [$$('streamTz').hidden, $$('streamTz').textContent], [false, '2026　GMT+8']);
  ssInput('時區', 'none', 'change');
  const jumpInput = ssRowOf('開始日').querySelector('input[type=date]'); jumpInput.value = '2026-11-04'; jumpInput.dispatchEvent(new Event('change'));
  check('跳到某一週', [streamAnchor, $$('streamPeriod').textContent], ['2026-11-04', '2026/11/02 ～ 11/8']);
  streamAnchor = '2026-10-14'; renderStreamView(); fillDaySettings();

  // 配色
  ssSet('dayColorMode', 'rotate'); ssSet('dayColors', ['#ff0000', '#00ff00', '#0000ff']);
  check('配色：日卡片輪替 3 色', [0, 1, 2, 3].map((i) => document.querySelectorAll('.sw-day')[i].style.background.replace(/ /g, '')), ['rgb(255,0,0)', 'rgb(0,255,0)', 'rgb(0,0,255)', 'rgb(255,0,0)']);
  check('配色：深色底自動用白字、淺色底用深字', [document.querySelectorAll('.sw-day')[0].style.getPropertyValue('--cal-text'), readableText('#ffffff')], ['#ffffff', '#3a2d33']);
  const rp = randomPalette();
  check('隨機配色：3 個色碼＋標題色', [rp.colors.length, rp.colors.every((c) => /^#[0-9a-f]{6}$/.test(c)), /^#[0-9a-f]{6}$/.test(rp.title)], [3, true, true]);
  const cv = document.createElement('canvas'); cv.width = 30; cv.height = 30; const g = cv.getContext('2d');
  g.fillStyle = '#ff0000'; g.fillRect(0, 0, 30, 15); g.fillStyle = '#00aa00'; g.fillRect(0, 15, 15, 15); g.fillStyle = '#0000ff'; g.fillRect(15, 15, 15, 15);
  const imgColors = await paletteFromImage(cv.toDataURL('image/png'));
  check('從圖片取色：取到 3 種主色', [imgColors.length, imgColors[0]], [3, '#ff0000']);
  applyPalette(['#111111', '#222222', '#333333'], '#abcdef');
  check('套用配色：改成輪替並更新標題色', [streamSettings.dayColorMode, streamSettings.dayColors, streamSettings.titleColor], ['rotate', ['#111111', '#222222', '#333333'], '#abcdef']);
  const palInput = [...document.querySelectorAll('#ssBody input[placeholder="配色名稱"]')][0]; palInput.value = '夜色';
  [...document.querySelectorAll('#ssBody button')].find((b) => b.textContent.includes('儲存目前配色')).click();
  check('我的配色：儲存並存檔', [streamPalettes.map((p) => p.name), load(KEY.streamPalettes, []).length], [['夜色'], 1]);
  ssSet('dayColorMode', 'default'); streamSettings.dayColors = ['#fbd5e1', '#fde7ee', '#ffffff']; streamSettings.titleColor = ''; saveStreamSettings();
  document.querySelector('#ssBody .ss-pal-sw').click();
  check('我的配色：點一下套用', [streamSettings.dayColors[0], streamSettings.titleColor], ['#111111', '#abcdef']);
  streamSettings.dayColorMode = 'default'; streamSettings.titleColor = ''; saveStreamSettings(); renderStreamView();

  // 社群、圖片
  ssSet('socTwitch', 'twitch.tv/abc'); ssSet('socX', '@abc');
  check('社群貼紙', [...document.querySelectorAll('#streamSocials .sc-pill')].map((x) => x.textContent), ['🎮 twitch.tv/abc', '𝕏 @abc']);
  const tiny = cv.toDataURL('image/png');
  streamSettings.avatar = tiny; streamSettings.bgImage = tiny; saveStreamSettings(); renderStreamView();
  check('圖片：頭像顯示、專用背景圖蓋過一般背景', [$$('streamAvatarWrap').hidden, $$('streamBgLayer').style.backgroundImage.startsWith('url('), getComputedStyle($$('streamAvatarWrap')).borderRadius], [false, true, '50%']);
  streamSettings.bgImage = ''; saveStreamSettings(); renderStreamView();
  check('圖片：移除專用背景圖後回到一般背景', box.style.backgroundImage.includes('linear-gradient'), true);
  streamSettings.avatar = ''; saveStreamSettings(); renderStreamView();

  // 版面
  ssSet('style', 'list'); check('版面：清單樣式', [box.dataset.style, getComputedStyle($$('streamWeek')).gridTemplateColumns.split(' ').length], ['list', 1]);
  ssSet('style', 'vertical'); check('版面：直式樣式', box.dataset.style, 'vertical');
  ssSet('style', 'grid');
  ssSet('corners', 'sharp'); check('版面：直角', [box.dataset.corners, getComputedStyle(dayCard(14)).borderTopLeftRadius], ['sharp', '0px']);
  ssSet('corners', 'pill'); check('版面：膠囊', parseFloat(getComputedStyle(dayCard(14)).borderTopLeftRadius) >= 24, true);
  ssSet('corners', 'rounded');
  ssSet('aspect', '16:9'); check('版面：16:9 比例', [box.style.aspectRatio, Math.abs(box.getBoundingClientRect().width / box.getBoundingClientRect().height - 16 / 9) < 0.05 || box.getBoundingClientRect().height > box.getBoundingClientRect().width / (16 / 9)], ['16 / 9', true]);
  ssSet('aspect', '9:16'); check('版面：9:16 比例（至少這麼高）', box.getBoundingClientRect().height + 1 >= box.getBoundingClientRect().width * 16 / 9, true);
  ssSet('aspect', 'auto'); check('版面：自動', box.style.aspectRatio, '');
  ssSet('sparkles', true); check('版面：閃光', box.classList.contains('sparkles'), true); ssSet('sparkles', false);
  ssSet('align', 'center'); check('版面：行程文字置中', [box.dataset.align, getComputedStyle(dayCard(14).querySelector('.sw-event')).textAlign], ['center', 'center']); ssSet('align', 'left');
  ssSet('activeOpacity', 80); ssSet('restOpacity', 30);
  check('版面：有行程／休息日不透明度', [dayCard(14).style.opacity, dayCard(13).style.opacity], ['0.8', '0.3']);
  ssSet('activeOpacity', 100); ssSet('restOpacity', 55);

  // 每天的設定（目前這一週）
  streamDays = {}; saveStreamDays(); fillDaySettings(); renderStreamView();
  const dayBox = (d) => [...document.querySelectorAll('#ssBody .ss-day')].find((x) => x.querySelector('.ss-day-head').textContent.includes(`10/${d}`));
  const toggleIn = (box, label) => [...box.querySelectorAll('.ss-toggle')].find((l) => l.textContent.includes(label)).querySelector('input');
  const fireEvt = (node, evt) => node.dispatchEvent(new Event(evt, { bubbles: true }));
  check('每天設定：列出這一週 7 天，每天一張卡', document.querySelectorAll('#ssBody .ss-day').length, 7);
  check('每天設定：卡片內容與順序（休息日 → 時間＋標題 → 說明＋該場貼紙 → 第二場 → 不透明度 → 強調 → 徽章）',
    [dayBox(14).querySelector('.ss-day-head').textContent.includes('週三'), !!dayBox(14).querySelector('.ss-two .time-pick'), dayBox(14).querySelectorAll('.ss-slot input[type=text]').length, [...dayBox(14).querySelectorAll('.ss-line')].map((l) => l.textContent.trim().slice(0, 6))],
    [true, true, 2, ['🖼 圖片貼', '第二場直播', '這天的不透明', '✨ 強調這一', '🏷 強調徽']]);
  // 休息日
  const rest14 = dayBox(14).querySelector('.ss-rest input'); rest14.checked = true; fireEvt(rest14, 'change');
  check('每天設定：休息日＝隱藏當天行程、顯示休息訊息、變淡', [dayCard(14).querySelectorAll('.sw-event').length, !!dayCard(14).querySelector('.sw-rest'), dayCard(14).style.opacity], [0, true, '0.55']);
  rest14.checked = false; fireEvt(rest14, 'change');
  check('每天設定：取消後恢復、且清掉空設定', [dayCard(14).querySelectorAll('.sw-event').length, streamDays['2026-10-14']], [1, undefined]);
  // 直接編輯當天的直播內容：時間、標題、說明
  const slot14 = dayBox(14).querySelector('.ss-slot');
  check('每天設定：顯示當天第一場的時間／標題／說明', [slot14.querySelectorAll('select')[0].value, slot14.querySelectorAll('select')[1].value, slot14.querySelector('.ss-two input').value, slot14.querySelectorAll('input[type=text]')[1].value], ['20', '00', '雜談', '']);
  const detail14 = slot14.querySelectorAll('input[type=text]')[1]; detail14.value = '輕鬆聊天'; fireEvt(detail14, 'input');
  check('每天設定：填說明 → 週曆行程下方顯示小字', [streamEvents.find((e) => e.id === 'k1').detail, dayCard(14).querySelector('.sw-detail').textContent], ['輕鬆聊天', '輕鬆聊天']);
  const title14 = slot14.querySelector('.ss-two input'); title14.value = '改名雜談'; fireEvt(title14, 'input');
  check('每天設定：改標題 → 直接改到直播行程那筆行程', [streamEvents.find((e) => e.id === 'k1').title, dayCard(14).querySelector('.sw-name').textContent], ['改名雜談', '改名雜談']);
  const hSel = slot14.querySelectorAll('select')[0]; hSel.value = '21'; fireEvt(hSel, 'change');
  check('每天設定：改時間', [streamEvents.find((e) => e.id === 'k1').startTime, dayCard(14).querySelector('.sw-time').textContent.startsWith('21:00')], ['21:00', true]);
  // 空白的日子：填了才建立行程，全部清空就移除
  const slot13 = dayBox(13).querySelector('.ss-slot'); const countBefore13 = streamEvents.length;
  const t13 = slot13.querySelector('.ss-two input'); t13.value = '新的一場'; fireEvt(t13, 'input');
  const created = streamEvents.find((e) => e.start === '2026-10-13');
  check('每天設定：在沒有行程的日子填標題 → 建立一筆直播行程', [streamEvents.length - countBefore13, created.title, created.end, !!created.sourceId, dayCard(13).querySelectorAll('.sw-event').length], [1, '新的一場', '2026-10-13', false, 1]);
  t13.value = ''; fireEvt(t13, 'input');
  check('每天設定：三欄都清空 → 移除那筆', [streamEvents.some((e) => e.start === '2026-10-13'), dayCard(13).querySelectorAll('.sw-event').length], [false, 0]);
  // 第二場
  const second13 = toggleIn(dayBox(13), '第二場直播');
  check('每天設定：第二場預設不勾、沒有第二組欄位', [second13.checked, dayBox(13).querySelectorAll('.ss-slot').length], [false, 1]);
  second13.checked = true; fireEvt(second13, 'change');
  check('每天設定：勾「第二場直播」才出現第二組欄位', dayBox(13).querySelectorAll('.ss-slot').length, 2);
  const s2 = dayBox(13).querySelectorAll('.ss-slot')[1], s2t = s2.querySelector('.ss-two input'); s2t.value = '第二場'; fireEvt(s2t, 'input');
  check('每天設定：第二場直接建立一筆行程', streamEvents.filter((e) => e.start === '2026-10-13').map((e) => e.title), ['第二場']);
  const origConfirm4 = window.confirm; window.confirm = () => false; second13.checked = false; fireEvt(second13, 'change');
  check('每天設定：取消勾選但按「取消」→ 保留第二場', [second13.checked, streamEvents.some((e) => e.title === '第二場')], [true, true]);
  window.confirm = () => true; second13.checked = false; fireEvt(second13, 'change'); window.confirm = origConfirm4;
  check('每天設定：確認後移除第二場', [streamEvents.some((e) => e.title === '第二場'), dayBox(13).querySelectorAll('.ss-slot').length], [false, 1]);
  // 強調、徽章（徽章獨立勾選）
  const hl16 = toggleIn(dayBox(16), '強調這一天'); hl16.checked = true; fireEvt(hl16, 'change');
  check('每天設定：強調這一天', dayCard(16).classList.contains('highlight'), true);
  check('每天設定：徽章沒勾就不顯示、徽章文字欄預設隱藏', [!!dayCard(16).querySelector('.sw-badge'), dayBox(16).querySelector('.ss-badge').closest('.ss-sub').hidden], [false, true]);
  const bd16 = toggleIn(dayBox(16), '強調徽章'); bd16.checked = true; fireEvt(bd16, 'change');
  const badgeInput = dayBox(16).querySelector('.ss-badge'); badgeInput.value = '生日！'; fireEvt(badgeInput, 'input');
  check('每天設定：勾徽章＋填文字 → 顯示', [badgeInput.closest('.ss-sub').hidden, dayCard(16).querySelector('.sw-badge').textContent], [false, '生日！']);
  hl16.checked = false; fireEvt(hl16, 'change');
  check('每天設定：徽章與強調各自獨立', [dayCard(16).classList.contains('highlight'), !!dayCard(16).querySelector('.sw-badge')], [false, true]);
  // 勾選後才出現的細項：強調（樣式、填滿色、框線顏色、背景圖片）、徽章（形狀、顏色、大小）
  const sub = (box, label) => [...box.querySelectorAll('.ss-sub')].find((s) => (label === '強調' ? s.querySelector('.ss-pills button').textContent === '光暈' : s.querySelector('.ss-badge')));
  const day17 = dayBox(17), hlSub17 = sub(day17, '強調'), bdSub17 = sub(day17, '徽章');
  check('細項預設都收起來（沒勾就不出現）', [hlSub17.hidden, bdSub17.hidden], [true, true]);
  const hl17 = toggleIn(day17, '強調這一天'); hl17.checked = true; fireEvt(hl17, 'change');
  check('勾「強調這一天」→ 出現強調細項（樣式／填滿色／框線顏色／背景圖片）', [hlSub17.hidden, [...hlSub17.querySelectorAll('.ss-pill')].map((b) => b.textContent), [...hlSub17.querySelectorAll('.ss-sub-row > span')].map((s) => s.textContent)], [false, ['光暈', '粗框', '浮凸', '陰影'], ['填滿色', '框線顏色', '背景圖片']]);
  check('強調預設樣式是「光暈」', [hlSub17.querySelector('.ss-pill.active').textContent, [...dayCard(17).classList].includes('hl-glow')], ['光暈', true]);
  const pickPill = (box, text) => [...box.querySelectorAll('.ss-pill')].find((b) => b.textContent === text).click();
  pickPill(hlSub17, '粗框');
  check('強調樣式：粗框', [dayCard(17).classList.contains('hl-thick'), streamDays['2026-10-17'].hlStyle, getComputedStyle(dayCard(17)).borderTopWidth, hlSub17.querySelector('.ss-pill.active').textContent], [true, 'thick', '5px', '粗框']);
  pickPill(hlSub17, '浮凸'); check('強調樣式：浮凸', [dayCard(17).classList.contains('hl-emboss'), getComputedStyle(dayCard(17)).boxShadow.includes('inset')], [true, true]);
  pickPill(hlSub17, '陰影'); check('強調樣式：陰影', [dayCard(17).classList.contains('hl-shadow'), getComputedStyle(dayCard(17)).boxShadow.includes('7px')], [true, true]);
  pickPill(hlSub17, '光暈'); check('改回預設樣式就不存多餘設定', streamDays['2026-10-17'].hlStyle, undefined);
  const colorsIn17 = hlSub17.querySelectorAll('input[type=color]');
  const borderIn = colorsIn17[colorsIn17.length - 1]; borderIn.value = '#336699'; fireEvt(borderIn, 'input');
  check('強調：框線顏色', [dayCard(17).style.getPropertyValue('--hl-color'), streamDays['2026-10-17'].hlBorder], ['#336699', '#336699']);
  const fillRowEl = [...hlSub17.querySelectorAll('.ss-sub-row')].find((r) => r.textContent.includes('填滿色'));
  const fillToggle = fillRowEl.querySelector('input[type=checkbox]'), fillIn = fillRowEl.querySelector('input[type=color]');
  check('填滿色：勾選前不出現色盤（只有一列、右邊是勾選框）', [fillIn.hidden, hlSub17.querySelectorAll('.ss-sub-row').length > 0], [true, true]);
  fillToggle.checked = true; fireEvt(fillToggle, 'change');
  fillIn.value = '#202020'; fireEvt(fillIn, 'input');
  check('填滿色：勾選後出現色盤；卡片套用該色並自動換成白字', [fillIn.hidden, dayCard(17).style.background.replace(/ /g, ''), dayCard(17).style.getPropertyValue('--cal-text')], [false, 'rgb(32,32,32)', '#ffffff']);
  fillToggle.checked = false; fireEvt(fillToggle, 'change');
  check('填滿色：取消勾選就不套用', [dayCard(17).style.background.replace(/ /g, ''), streamDays['2026-10-17'].hlFillOn], ['', undefined]);
  streamDays['2026-10-17'].hlBg = tiny; saveStreamDays(); renderStreamView();
  check('強調：背景圖片', dayCard(17).style.backgroundImage.startsWith('url('), true);
  hl17.checked = false; fireEvt(hl17, 'change');
  check('取消強調 → 細項收起、外觀與背景圖都不再套用', [hlSub17.hidden, dayCard(17).classList.contains('highlight'), dayCard(17).style.backgroundImage], [true, false, '']);
  hl17.checked = true; fireEvt(hl17, 'change');
  delete streamDays['2026-10-17'].hlBg; saveStreamDays();

  const bd17 = toggleIn(day17, '強調徽章'); bd17.checked = true; fireEvt(bd17, 'change');
  check('勾「強調徽章」→ 出現徽章細項（文字、形狀、顏色、大小）', [bdSub17.hidden, [...bdSub17.querySelectorAll('.ss-pill')].map((b) => b.textContent), !!bdSub17.querySelector('input[type=color]'), !!bdSub17.querySelector('input[type=range]')], [false, ['圓角', '膠囊', '爆炸', '雲朵', '愛心'], true, true]);
  const bdText = bdSub17.querySelector('.ss-badge'); bdText.value = '聯動！'; fireEvt(bdText, 'input');
  check('徽章預設是膠囊、用預設色', [bdSub17.querySelector('.ss-pill.active').textContent, dayCard(17).querySelector('.sw-badge').className, dayCard(17).querySelector('.sw-badge').style.background.replace(/ /g, '')], ['膠囊', 'sw-badge sw-badge-pill', 'rgb(217,84,126)']);
  pickPill(bdSub17, '圓角'); check('徽章形狀：圓角', dayCard(17).querySelector('.sw-badge').classList.contains('sw-badge-rounded'), true);
  for (const [label, cls] of [['爆炸', 'burst'], ['雲朵', 'cloud'], ['愛心', 'heart']]) {
    pickPill(bdSub17, label);
    const el17 = dayCard(17).querySelector('.sw-badge');
    check(`徽章形狀：${label}（用 SVG 畫）`, [el17.classList.contains(`sw-badge-${cls}`), decodeURIComponent(el17.style.backgroundImage).includes('<svg'), el17.textContent], [true, true, '聯動！']);
  }
  const bdColor = bdSub17.querySelector('input[type=color]'); bdColor.value = '#00aa55'; fireEvt(bdColor, 'input');
  check('徽章顏色：SVG 形狀與文字顏色都跟著換', [decodeURIComponent(dayCard(17).querySelector('.sw-badge').style.backgroundImage).includes('#00aa55'), streamDays['2026-10-17'].badgeColor], [true, '#00aa55']);
  pickPill(bdSub17, '膠囊');
  check('徽章顏色：膠囊用背景色', dayCard(17).querySelector('.sw-badge').style.background.replace(/ /g, ''), 'rgb(0,170,85)');
  const bdRange = bdSub17.querySelector('input[type=range]');
  check('徽章大小預設 60', [bdRange.value, bdSub17.querySelector('.ss-val').textContent], ['60', '60']);
  bdRange.value = 100; fireEvt(bdRange, 'input');
  check('徽章大小：拉到 100 → 徽章變大並存檔', [dayCard(17).querySelector('.sw-badge').style.getPropertyValue('--bd-size'), streamDays['2026-10-17'].badgeSize, bdSub17.querySelector('.ss-val').textContent], ['100px', 100, '100']);
  bdRange.value = 60; fireEvt(bdRange, 'input');
  check('預設值（膠囊、大小 60）不會存進設定', [streamDays['2026-10-17'].badgeShape, streamDays['2026-10-17'].badgeSize], [undefined, undefined]);
  bd17.checked = false; fireEvt(bd17, 'change');
  check('取消徽章 → 細項收起、徽章消失', [bdSub17.hidden, !!dayCard(17).querySelector('.sw-badge')], [true, false]);
  streamDays = {}; saveStreamDays(); fillDaySettings(); renderStreamView();
  // 不透明度：預設自動，拉動才單獨指定，可改回自動
  const opLine = dayBox(16).querySelector('.ss-opacity'), rangeEl = opLine.querySelector('input[type=range]');
  check('每天設定：不透明度預設顯示「自動」', [opLine.textContent.includes('自動'), opLine.querySelector('button').hidden], [true, true]);
  rangeEl.value = 40; fireEvt(rangeEl, 'input');
  check('每天設定：單獨指定不透明度', [dayCard(16).style.opacity, streamDays['2026-10-16'].opacity, opLine.textContent.includes('40%')], ['0.4', 40, true]);
  opLine.querySelector('button').click();
  check('每天設定：「自動」鈕改回自動', [(streamDays['2026-10-16'] || {}).opacity, dayCard(16).style.opacity], [undefined, '1']);
  streamDays['2026-10-16'] = { ...(streamDays['2026-10-16'] || {}), stickers: [tiny, tiny] }; saveStreamDays(); renderStreamView();
  check('每天設定：貼圖顯示', dayCard(16).querySelectorAll('.sw-sticker').length, 2);
  check('每天設定：存檔', Object.keys(load(KEY.streamDays, {})), ['2026-10-16']);
  streamDays = {}; saveStreamDays();
  // 貼紙跟著「每一場直播」走（每場最多 5 張）
  const ev14 = streamEvents.find((e) => e.start === '2026-10-14'); ev14.stickers = [tiny, tiny]; saveStreamEvents(); renderStreamView(); fillDaySettings();
  check('貼紙：該場的貼紙顯示在那天的卡片上', dayCard(14).querySelectorAll('.sw-sticker').length, 2);
  { const slot = dayBox(14).querySelector('.ss-slot'), cards = slot.querySelectorAll('.ss-stk-card');
    check('貼紙：控制項在該場直播裡，每張一張卡、五條滑桿預設值（含外框厚度）', [cards.length, [...cards[0].querySelectorAll('input[type=range]')].map((r) => r.value), cards[0].querySelector('.ss-stk-name').textContent, STICKER.max], [2, ['80', '0', '0', '0', '0'], '貼紙 1', 5]);
    const [sz, rot, hx] = cards[0].querySelectorAll('input[type=range]');
    sz.value = 120; fireEvt(sz, 'input'); rot.value = -8; fireEvt(rot, 'input'); hx.value = 30; fireEvt(hx, 'input');
    const st = streamEvents.find((e) => e.start === '2026-10-14').stickers[0], img = dayCard(14).querySelector('.sw-sticker');
    check('貼紙：大小／旋轉／橫向存在行程上', [st.size, st.rot, st.x, typeof st.src, load(KEY.streamEvents, []).find((e) => e.start === '2026-10-14').stickers[0].size], [120, -8, 30, 'string', 120]);
    check('貼紙：套用到畫面', [img.style.width, img.style.transform, img.style.left.replace(/ /g, '')], ['120px', 'translateX(-50%) rotate(-8deg)', 'calc(80%)']);
    check('貼紙：另一張不受影響（舊格式字串照常顯示）', [typeof streamEvents.find((e) => e.start === '2026-10-14').stickers[1], dayCard(14).querySelectorAll('.sw-sticker')[1].style.width], ['string', '80px']);
    slot.querySelectorAll('.ss-stk-del')[0].click();
    check('貼紙：刪除', [streamEvents.find((e) => e.start === '2026-10-14').stickers.length, dayBox(14).querySelector('.ss-slot').querySelectorAll('.ss-stk-card').length], [1, 1]); }
  { const slot = dayBox(14).querySelector('.ss-slot'), add = slot.querySelector('.ss-add');
    streamEvents.find((e) => e.start === '2026-10-14').stickers = [tiny, tiny, tiny, tiny, tiny]; fillDaySettings();
    check('貼紙：每場最多 5 張，滿了就收起新增鈕', [dayBox(14).querySelector('.ss-slot .ss-add').hidden, dayBox(14).querySelectorAll('.ss-slot .ss-stk-card').length, dayBox(14).querySelector('.ss-stk-head span').textContent], [true, 5, '🖼 圖片貼紙 · 5/5']);
    delete streamEvents.find((e) => e.start === '2026-10-14').stickers; saveStreamEvents(); fillDaySettings(); renderStreamView();
      { const keepAll = streamEvents; streamEvents = []; fillDaySettings();
    check('貼紙：沒有行程的場次不能加圖（新增鈕停用）', [...document.querySelectorAll('#ssDaysBody .ss-slot .ss-add')].every((b) => b.disabled), true);
    streamEvents = keepAll; fillDaySettings(); } }
  // 舊版每天共用的貼紙：升級時搬到當天第一場；當天沒有行程的就留著照常顯示
  { const keepE = streamEvents, keepD = streamDays; localStorage.removeItem(KEY.stkMigrated);
    streamEvents = [{ id: 'mg1', title: '甲', start: '2026-10-20', end: '2026-10-20', startTime: '20:00' }, { id: 'mg2', title: '乙', start: '2026-10-20', end: '2026-10-20', startTime: '10:00' }];
    streamDays = { '2026-10-20': { stickers: [tiny, tiny] }, '2026-10-21': { stickers: [tiny] } }; saveStreamEvents(); saveStreamDays(); migrateDayStickers();
    check('貼紙遷移：搬到當天最早的一場；沒有行程的那天保留', [streamEvents.find((e) => e.id === 'mg2').stickers.length, !!streamEvents.find((e) => e.id === 'mg1').stickers, streamDays['2026-10-20'].stickers, streamDays['2026-10-21'].stickers.length, loadRaw(KEY.stkMigrated)], [2, false, undefined, 1, '1']);
    streamEvents = keepE; streamDays = keepD; saveStreamEvents(); saveStreamDays(); }

  // 還原預設
  const origConfirm2 = window.confirm; window.confirm = () => true;
  resetStreamSettings(); window.confirm = origConfirm2;
  check('還原預設：外觀回到預設，行程與每天設定不受影響', [streamSettings.title, streamSettings.style, streamEvents.length], ['', 'grid', 2]);

  // 面板收合／展開，會記住狀態；換週時每天的設定跟著換
  $$('stSettings').click();
  check('收合面板', [$$('streamPanel').hidden, loadRaw(KEY.streamPanel)], [true, '0']);
  $$('stSettings').click();
  check('按「版面設定」展開面板', [$$('streamPanel').hidden, loadRaw(KEY.streamPanel)], [false, '1']);
  $$('stSettings').click(); initStreamPanel();
  check('重新進入直播行程時沿用上次的收合狀態', $$('streamPanel').hidden, true);
  toggleStreamPanel(true);
  const dayTitle = () => $$('ssDaysTitle').textContent;
  const titleBefore = dayTitle();
  streamShift(1);
  check('換週：每天的設定改成新的一週', [titleBefore.includes('10/12'), dayTitle().includes('10/19'), document.querySelectorAll('#ssBody .ss-day').length], [true, true, 7]);
  streamShift(-1);
  const daysDetails = $$('ssDaysSec'); daysDetails.open = true;
  applyPalette(['#aaaaaa', '#bbbbbb', '#cccccc']);
  check('套用配色重畫面板時，保留各區段的展開狀態', $$('ssDaysSec').open, true);
  streamSettings = clone(STREAM_DEFAULTS); streamDays = {}; saveStreamSettings(); saveStreamDays(); buildStreamSettings(); renderStreamView();


  // ── 直播行程的「正在編輯」標示、說明欄 ─────────────────────
  const keepEvents7 = events, keepStream7 = streamEvents;
  events = [{ ...base, id: 'bd1', title: '行事曆行程', memo: '私人備註', start: '2026-10-14', end: '2026-10-14', startTime: '', endTime: '' }];
  streamEvents = [{ ...base, id: 'bd2', title: '直播行程', memo: '私人備註', detail: '公開說明', start: '2026-10-14', end: '2026-10-14', startTime: '', endTime: '', sourceId: 'bd1' }];
  backToYear();
  streamAnchor = '2026-10-14'; openStream();
  openStream();
  // 直播行程的編輯視窗：「備註」欄換成會顯示的「說明」，行事曆的私人備註不會被帶出來
  document.querySelector('.sw-day[data-date="2026-10-14"] .sw-event').click();
  check('編輯直播行程：欄位標籤是「說明」、內容是 detail（不是私人備註）', [$$('lblMemo').textContent.startsWith('說明'), $$('evMemo').value], [true, '公開說明']);
  type('evMemo', '新的說明'); saveEvent();
  check('儲存：只改 detail，原本的備註不動', [streamEvents[0].detail, streamEvents[0].memo], ['新的說明', '私人備註']);
  check('週曆行程顯示的是說明，不會顯示私人備註', document.querySelector('.sw-day[data-date="2026-10-14"] .sw-detail').textContent, '新的說明');
  openEditEvent('bd1');
  check('編輯行事曆的行程：標籤維持「備註」、內容是 memo', [$$('lblMemo').textContent, $$('evMemo').value], ['備註', '私人備註']);
  closeEventModal();
  events = keepEvents7; streamEvents = keepStream7; streamDays = {}; backToYear();

  // 匯出／匯入帶著直播行程
  ssSet('handle', '@export-me'); streamPalettes = [{ id: 'p1', name: 'P', colors: ['#111111', '#222222', '#333333'], title: '' }];
  streamDays = { '2026-10-14': { highlight: true } };
  events = [mk('ex1', '匯出測試', '14', '14')];
  let exText; const origDl3 = window.download; window.download = (blob) => { exText = blob.text(); };
  showExportModal(); $$('btnDoExport').click(); window.download = origDl3;
  const exData = JSON.parse(await exText);
  check('匯出檔含直播行程整份', [Object.keys(exData.stream), exData.stream.events.length, exData.stream.settings.handle], [['events', 'settings', 'days', 'palettes'], 2, '@export-me']);
  streamEvents = []; streamSettings = clone(STREAM_DEFAULTS); streamDays = {}; streamPalettes = [];
  importStreamData(exData.stream);
  check('匯入還原直播行程', [streamEvents.length, streamSettings.handle, streamDays['2026-10-14'].highlight, streamPalettes.length], [2, '@export-me', true, 1]);
  check('舊版匯出檔（沒有 stream）也能匯入', (() => { try { importStreamData({}); return true; } catch (e) { return false; } })(), true);

  // 截圖帶著設定（比例、貼圖等）
  streamSettings = clone(STREAM_DEFAULTS); ssSet('aspect', '4:3'); ssSet('handle', '@shot');
  let shot2; const origDl4 = window.download; window.download = (blob, name) => { shot2 = { name, size: blob.size }; };
  streamAnchor = '2026-10-14'; setStreamMode('week'); openStream(); takeStreamScreenshot();
  await waitUntil(() => shot2);
  window.download = origDl4;
  check('套用設定後仍可截圖', [shot2 && shot2.name, shot2 && shot2.size > 1000], ['stream_week_20261012.png', true]);
  streamSettings = clone(STREAM_DEFAULTS); streamDays = {}; streamPalettes = []; streamEvents = []; events = []; localStorage.clear(); backToYear();

  // ── 介面重排：頂部列、設定選單、依畫面截圖、欄位順序、Esc、匯入驗證 ──
  localStorage.clear(); events = []; streamEvents = []; streamSettings = clone(STREAM_DEFAULTS); streamDays = {}; categories = clone(DEFAULT_CATEGORIES);
  backToYear(); setSettingsMenu(false);
  const idsInOrder = (selector) => [...document.querySelectorAll(selector)].map((x) => x.id);
  check('頂部列依用途分組：大分類（私人/直播）、截圖→ 資料（匯入、匯出）→ 設定', idsInOrder('#topbar .scope-tabs > button, #topbar .tb-group > button, #topbar .tb-menu > button'), ['scopeMain', 'scopeStream', 'btnShot', 'btnImport', 'btnExport', 'btnTheme', 'btnSettings']);
  check('底板（亮暗）與日曆寬度留在頂部列，背景／週首／時間顯示收進「設定」選單', [['btnTheme', 'widthSlider'].every((id) => $$(id).closest('#topbar') && !$$(id).closest('#settingsMenu')), ['btnBg', 'weekStart', 'timeFmt'].every((id) => $$(id).closest('#settingsMenu'))], [true, true]);
  check('設定選單預設收起', [$$('settingsMenu').hidden, $$('btnSettings').getAttribute('aria-expanded')], [true, 'false']);
  $$('btnSettings').click();
  check('按「⚙ 設定」展開選單', [$$('settingsMenu').hidden, $$('btnSettings').getAttribute('aria-expanded')], [false, 'true']);
  choose('timeFmt', '12'); choose('timeFmt', '24');
  check('操作選單內的控制項時選單保持開著', $$('settingsMenu').hidden, false);
  document.body.click();
  check('點選單外面 → 收起', $$('settingsMenu').hidden, true);
  $$('btnSettings').click(); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  check('Esc → 收起選單', $$('settingsMenu').hidden, true);
  $$('btnSettings').click(); $$('btnBg').click();
  check('選「設定背景」→ 選單收起並開啟背景視窗', [$$('settingsMenu').hidden, isModalOpen('bgModal')], [true, true]);
  closeBgModal();

  // 頂部「截圖」依目前畫面決定拍什麼
  let shotName; const origDl5 = window.download; window.download = (blob, name) => { shotName = name; };
  const shotOf = async () => { shotName = null; $$('btnShot').click(); await waitUntil(() => shotName); return shotName; };
  viewYear = 2026; backToYear();
  check('截圖按鈕提示：年度', $$('btnShot').title, '截圖年度總覽');
  check('年度總覽 → 拍年度', await shotOf(), 'calendar_2026.png');
  openMonth(9);
  check('截圖按鈕提示：月', $$('btnShot').title, '截圖這個月');
  check('月視圖 → 拍這個月（不會跳回年度）', [await shotOf(), currentView()], ['calendar_2026_10.png', 'month']);
  streamAnchor = '2026-10-14'; setStreamMode('week'); openStream();
  check('截圖按鈕提示：直播行程', $$('btnShot').title, '截圖直播行程（年度／週曆／月曆／年度直播回顧）');
  check('直播行程 → 拍直播行程', await shotOf(), 'stream_week_20261012.png');
  window.download = origDl5;
  check('各畫面不再各放一顆截圖鈕', [document.getElementById('btnMonthShot'), document.getElementById('stShot')], [null, null]);

  // 月視圖標頭：返回 → 翻月 → 今天，空檔輸出靠右
  openMonth(2);
  check('月視圖標頭按鈕順序', idsInOrder('#monthViewHeader button'), ['btnBackYear', 'monthPrev', 'monthNext', 'monthToday', 'btnFree']);
  $$('monthToday').click();
  const nowD = new Date();
  check('「今天」回到本月', [viewYear, currentMonth, currentView()], [nowD.getFullYear(), nowD.getMonth(), 'month']);

  // 直播行程：操作列、設定面板區段順序
  openStream();
  check('直播行程操作列：導覽在左、匯入／設定靠右（沒有截圖與清空）', [...document.querySelectorAll('#streamBar > *')].filter((x) => !x.hidden).map((x) => x.id || x.className.split(' ')[0]), ['fd-mode-tabs', 'stPrev', 'stToday', 'stNext', 'stImport', 'stSettings']);
  check('清空直播行程放在設定面板底部（危險操作不放在常用列）', !!$$('stClear').closest('#spFoot'), true);
  $$('ssBody').replaceChildren(); buildStreamSettings(); // 清掉先前測試留下的展開狀態，檢查真正的預設
  check('設定面板區段順序：文字 → 日程 → 配色 → 社群 → 圖片 → 版面 → 每天', [...document.querySelectorAll('#ssBody > details > summary')].map((s) => s.textContent.trim().replace(/^\S+\s*/, '').slice(0, 2)), ['文字', '日程', '配色', '社群', '圖片', '版面', '每天']);
  check('預設只展開「文字」', [...document.querySelectorAll('#ssBody > details')].map((d) => d.open), [true, false, false, false, false, false, false]);

  // 行程視窗欄位順序與空檔視窗順序
  const labelsOf = (modal) => [...document.querySelectorAll(`#${modal} .form-group > label:first-child, #${modal} .form-row .form-group > label:first-child`)].map((l) => l.textContent.trim().slice(0, 2));
  check('行程視窗欄位順序：標題 → 類別 → TRPG → 日期 → 時間 → 同行者 → 備註 → 顏色 → 同步', labelsOf('eventModal'), ['標題', '類別', 'TR', '開始', '結束', '時間', '同行', '備註', '顏色', '同步']);
  check('開始日與結束日並排在同一列', $$('evStart').closest('.form-row') === $$('evEnd').closest('.form-row'), true);
  check('空檔視窗順序：月份 → 時段 → 排除星期 → 排除日期 → 輸出 → 外部服務', labelsOf('freeDaysModal'), ['選擇', '有空', '排除', '排除', '輸出', '用外']);
  check('行程視窗按鈕：儲存、取消在前，刪除放最後', idsInOrder('#eventModal .modal-actions button'), ['btnSaveEv', 'btnCancelEv', 'btnCopyEv', 'deleteEvBtn']);

  // Esc：一次只關最上面那個視窗
  openNewEvent('2026-10-20', '2026-10-20');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  check('Esc 關閉行程視窗（等同取消）', isModalOpen('eventModal'), false);
  events = [{ ...base, id: 'esc1', title: 'E', start: '2026-10-20', end: '2026-10-20', startTime: '', endTime: '' }];
  openEditEvent('esc1'); $$('btnCopyEv').click();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  check('疊了兩層視窗時，Esc 先關最上面的（複製），行程視窗還在', [isModalOpen('copyModal'), isModalOpen('eventModal')], [false, true]);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  check('再按一次 Esc 才關行程視窗', isModalOpen('eventModal'), false);
  openNewEvent('2026-10-21', '2026-10-21'); $$('btnManageCat').click();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  check('類別管理視窗也能用 Esc／點背景關閉', [isModalOpen('catModal'), isModalOpen('eventModal')], [false, true]);
  $$('btnManageCat').click(); $$('catModal').click();
  check('點類別視窗外面也關閉', isModalOpen('catModal'), false);
  closeEventModal();

  // 存檔失敗要提醒
  const origSetItem = Storage.prototype.setItem; Storage.prototype.setItem = () => { throw new Error('quota'); };
  saveWarned = false; $$('toast').textContent = '';
  const saved1 = save('tw_cal_test', 1);
  const toastText = $$('toast').textContent;
  $$('toast').textContent = ''; const saved2 = save('tw_cal_test', 2);
  Storage.prototype.setItem = origSetItem; saveWarned = false;
  check('存檔失敗：回傳 false 並提醒使用者', [saved1, toastText.includes('儲存失敗')], [false, true]);
  check('存檔失敗的提醒 5 秒內不重複洗版', [saved2, $$('toast').textContent], [false, '']);

  // 匯入：驗證格式、取代前確認
  const sane = sanitizeEvents([
    { id: 'g1', start: '2026-10-01', end: '2026-10-02', title: 'ok', color1: '#112233', startTime: '09:30', people: ['A', '', 'B'] },
    { start: 'not-a-date', title: '壞日期' }, null, 'string', 42,
    { id: 'g1', start: '2026-10-09', end: '2026-10-03', color1: 'zzz', startTime: '99:99', colorMode: 'weird' },
  ]);
  check('匯入驗證：壞資料被略過，其餘補預設值', [sane.length, sane[0].people, sane[1].start + '~' + sane[1].end, sane[1].color1, sane[1].startTime, sane[1].colorMode, sane[1].title], [2, ['A', 'B'], '2026-10-03~2026-10-09', DEFAULT_EVENT_COLORS.c1, '', 'solid', '']);
  check('匯入驗證：重複的 id 會換新的', sane[0].id !== sane[1].id, true);
  const importText = JSON.stringify({ events: [{ start: '2026-10-05', title: '新的' }, { start: 'x' }] });
  const doImport = async () => { const dt2 = new DataTransfer(); dt2.items.add(new File([importText], 'i.json', { type: 'application/json' })); $$('importFile').files = dt2.files; $$('importFile').dispatchEvent(new Event('change')); await new Promise((r) => setTimeout(r, 200)); };
  events = [{ ...base, id: 'keep', title: '原本的', start: '2026-10-01', end: '2026-10-01', startTime: '', endTime: '' }];
  const origConfirm3 = window.confirm; let askedText = '';
  window.confirm = (msg) => { askedText = msg; return false; }; await doImport();
  check('匯入前會確認（會取代目前行程）；按取消不動資料', [events.map((e) => e.title), askedText.includes('取代目前私人行程裡的 1 筆')], [['原本的'], true]);
  window.confirm = () => true; await doImport();
  check('確認後取代，並提示略過幾筆', [events.map((e) => e.title), $$('toast').textContent.includes('略過 1 筆')], [['新的'], true]);
  window.confirm = origConfirm3;
  importStreamData({ events: [{ start: 'bad' }, { start: '2026-10-07', title: 'S' }] });
  check('直播行程資料匯入也會驗證', streamEvents.map((e) => e.title), ['S']);
  events = []; streamEvents = []; localStorage.clear(); backToYear();

  // ── 匯出／匯入 ───────────────────────────────────────────
  let exported;
  const origDownload = window.download;
  window.download = (blob) => { exported = blob.text(); };
  exportEvents(); window.download = origDownload;
  const text = await exported, parsed = JSON.parse(text);
  check('匯出欄位', Object.keys(parsed), ['title', 'events', 'categories', 'trpgSystems', 'stream', 'exportedAt']);
  const n = events.length; events = [];
  const dt = new DataTransfer(); dt.items.add(new File([text], 'x.json', { type: 'application/json' }));
  $$('importFile').files = dt.files; $$('importFile').dispatchEvent(new Event('change'));
  await new Promise((r) => setTimeout(r, 200));
  check('匯入還原行程數', events.length, n);

  // ── v0.26：私人／直播大分類、直播年度總覽、等比例縮放 ──
  setCalWidth(1200); showView('year');
  check('大分類：私人行程高亮、直播不亮', [$$('scopeMain').classList.contains('active'), $$('scopeStream').classList.contains('active')], [true, false]);
  streamEvents = [{ id: 'sy1', title: '直播年度測試', start: '2026-03-05', end: '2026-03-06', startTime: '', endTime: '', color: '#d9547e', textColor: '#ffffff', category: '', sourceId: '' }]; saveStreamEvents();
  $$('scopeStream').click();
  check('大分類：按「直播行程」進直播畫面', [currentView(), $$('scopeStream').classList.contains('active'), $$('scopeMain').classList.contains('active')], ['stream', true, false]);
  streamAnchor = '2026-10-14'; setStreamMode('year');
  check('直播年度總覽：12 個月、標題、模式存檔', [$$('streamYear').hidden, $$('streamYear').children.length, $$('streamPeriod').textContent, $$('streamWeek').hidden, $$('streamMonth').hidden, loadRaw(KEY.streamMode)], [false, 12, '2026 年', true, true, 'year']);
  check('直播年度總覽：只用直播行程上色（3/5、3/6）', $$('streamYear').querySelectorAll('.has-event').length, 2);
  streamShift(1); check('直播年度總覽：下一年', [streamAnchor, $$('streamPeriod').textContent], ['2027-01-01', '2027 年']); streamShift(-1);
  $$('streamYear').children[2].click();
  check('直播年度總覽：點月份進該月的直播月曆', [streamMode, streamAnchor, $$('streamPeriod').textContent], ['month', '2026-03-01', '2026 年 3 月']);
  $$('stYear').click(); check('頁籤「年度總覽」可切回', [streamMode, $$('stYear').classList.contains('active')], ['year', true]);
  $$('scopeMain').click();
  check('大分類：按「私人行程」回年度總覽', [currentView(), $$('scopeMain').classList.contains('active')], ['year', true]);
  // 預覽照輸出寬度排版，再等比例縮小放進視窗
  setCalWidth(1600); openStream(); setStreamMode('week');
  { const sc = $$('streamScaler'), stg = $$('streamStage'), pv = $$('bgStreamPreview');
    check('等比例縮放：預覽寬度固定為輸出寬度', pv.offsetWidth, 1600);
    const k = Math.min(1, stg.clientWidth / 1600);
    check('等比例縮放：縮放比例與外框高度', [sc.style.transform === (k < 1 ? `scale(${k})` : ''), stg.style.height === Math.ceil(sc.offsetHeight * k) + 'px'], [true, true]);
    check('等比例縮放：縮小後不超出外框', stg.getBoundingClientRect().width + 1 >= sc.getBoundingClientRect().width, true); }
  setCalWidth(1200); streamEvents = []; saveStreamEvents(); setStreamMode('week'); showView('year');

  // ── v0.27+：同步、社群平台顏色、圖片區、貼紙縱向 ──
  loadSync = realLoadSync;
  const evsBefore = events, stBefore = streamEvents; events = []; streamEvents = [];
  openNewEvent('2026-11-02', '2026-11-02');
  check('同步：新行程預設不勾、標籤「同時新增到直播行程」', [$$('evSync').checked, $$('lblSync').textContent], [false, '同時新增到直播行程']);
  $$('evTitle').value = '同步測試'; $$('evMemo').value = '私人備註'; saveEvent();
  check('同步：沒勾就只存私人行程', [events.length, streamEvents.length], [1, 0]);
  openEditEvent(events[0].id); $$('evSync').checked = true; saveEvent();
  check('同步：勾選後在直播行程建立複本（帶 sourceId，不帶私人備註）', [streamEvents.length, streamEvents[0].sourceId === events[0].id, streamEvents[0].title, streamEvents[0].memo, streamEvents[0].detail], [1, true, '同步測試', '', '']);
  openEditEvent(events[0].id);
  check('同步：已有對應行程 → 預設不勾、標籤改為「同步修改另一邊」', [$$('evSync').checked, $$('lblSync').textContent], [false, '同步修改另一邊（直播行程）對應的行程']);
  $$('evSync').checked = true; $$('evTitle').value = '改名了'; saveEvent();
  check('同步：勾著儲存 → 另一邊一起改名', [streamEvents.length, streamEvents[0].title], [1, '改名了']);
  openEditEvent(events[0].id); $$('evSync').checked = false; $$('evTitle').value = '只改私人'; saveEvent();
  check('同步：取消勾選 → 另一邊不動', [events[0].title, streamEvents[0].title], ['只改私人', '改名了']);
  openEditEvent(streamEvents[0].id, 'stream');
  check('同步：直播行程這邊的標籤指向私人行程、預設不勾', [$$('lblSync').textContent, $$('evSync').checked], ['同步修改另一邊（私人行程）對應的行程', false]);
  $$('evSync').checked = true; $$('evTitle').value = '從直播改'; saveEvent();
  check('同步：直播 → 私人，標題一起改、私人備註保留', [events[0].title, events[0].memo], ['從直播改', '私人備註']);
  events.push({ ...events[0], id: 'solo1', title: '直播獨有' }); streamEvents.push({ ...streamEvents[0], id: 'solo2', title: '直播獨有', sourceId: '' });
  openEditEvent('solo2', 'stream'); $$('evSync').checked = true; saveEvent();
  check('同步：直播行程沒有對應時，勾選會新增私人行程並連回來', [events.length, streamEvents.find((e) => e.id === 'solo2').sourceId === events[events.length - 1].id, events[events.length - 1].title], [3, true, '直播獨有']);
  events = evsBefore; streamEvents = stBefore; saveEvents(); saveStreamEvents();

  ssSet('socBluesky', 'me.bsky.social'); ssSet('socYoutube', '@yt'); ssSet('socTwitch', 'twitch.tv/a'); ssSet('socX', '@x'); ssSet('socOther', 'blog');
  check('社群：依平台上色，含藍天／Bluesky（順序固定）', [...document.querySelectorAll('#streamSocials .sc-pill')].map((x) => x.className.replace('sc-pill ', '') + ':' + x.textContent), ['sc-twitch:🎮 twitch.tv/a', 'sc-x:𝕏 @x', 'sc-youtube:▶ @yt', 'sc-bluesky:🦋 me.bsky.social', 'sc-other:✦ blog']);
  check('社群：各平台色不同', ['sc-twitch', 'sc-x', 'sc-youtube', 'sc-bluesky'].map((c) => getComputedStyle(document.querySelector('#streamSocials .' + c)).backgroundColor), ['rgb(145, 70, 255)', 'rgb(17, 17, 17)', 'rgb(255, 0, 51)', 'rgb(17, 133, 254)']);
  ['socBluesky', 'socYoutube', 'socTwitch', 'socX', 'socOther'].forEach((k) => ssSet(k, ''));

  streamSettings.avatar = tiny; streamSettings.bgImage = tiny; streamSettings.palImg = tiny; saveStreamSettings(); buildStreamSettings(); renderStreamView();
  check('圖片區：三張圖各一塊（圓形、背景、取色）', document.querySelectorAll('.ss-img-block').length, 3);
  check('圖片區：互相套用鈕', [...document.querySelectorAll('.ss-img-block')].map((b) => [...b.querySelectorAll('button')].map((x) => x.textContent).filter((t) => t.startsWith('↺')).join('|')), ['↺ 使用背景圖|↺ 使用取色圖', '↺ 使用圓形圖像|↺ 使用取色圖', '↺ 使用圓形圖像|↺ 使用背景圖']);
  ssSet('avatarZoom', 150); ssSet('avatarX', 30);
  check('圖片區：頭像縮放／位置', [$$('streamAvatar').style.transform, $$('streamAvatar').style.objectPosition], ['scale(1.5)', '30% 50%']);
  openStream(); ssSet('bgOpacity', 40); ssSet('bgSize', 120); ssSet('bgY', 20);
  await new Promise((r) => setTimeout(r, 250)); // 背景圖要先載入才知道原尺寸
  { const layer = $$('streamBgLayer'), longSide = Math.max(box.offsetWidth, box.offsetHeight);
    check('圖片區：背景圖獨立一層，可調透明度／位置', [layer.style.opacity, layer.style.backgroundPosition, layer.hidden, layer.style.transform], ['0.4', '50% 20%', false, '']);
    check('背景圖大小 120%：實際像素＝蓋滿畫布的 1.2 倍（放大）', Math.abs(parseFloat(layer.style.backgroundSize) - longSide * 1.2) < 1.5, true);
    const s120 = parseFloat(layer.style.backgroundSize); ssSet('bgSize', 50); await new Promise((r) => setTimeout(r, 100));
    check('背景圖大小 50%：縮小成蓋滿尺寸的一半（露出整張圖，不是把裁過的畫面縮小）', [Math.abs(parseFloat(layer.style.backgroundSize) - longSide * 0.5) < 1.5, parseFloat(layer.style.backgroundSize) < s120], [true, true]);
    ssSet('bgSize', 120); }
  [...document.querySelectorAll('.ss-img-block')][2].querySelectorAll('button').forEach((b) => { if (b.textContent === '↺ 使用圓形圖像') b.click(); });
  await new Promise((r) => setTimeout(r, 400));
  check('圖片區：取色圖套用後立即取色', streamSettings.dayColorMode, 'rotate');
  streamSettings = clone(STREAM_DEFAULTS); saveStreamSettings(); buildStreamSettings(); renderStreamView();

  streamAnchor = '2026-10-14'; const evY = { ...newStreamEvent('2026-10-16'), title: '縱向測試', stickers: [{ src: tiny, size: 80, rot: 0, x: 0, y: 40 }] }; streamEvents.push(evY); saveStreamEvents(); renderStreamView(); fillDaySettings();
  check('貼紙：縱向位置套用（往上 40%）', dayCard(16).querySelector('.sw-sticker').style.bottom.replace(/ /g, ''), 'calc(40%+6px)');
  check('貼紙：滑桿與外框設定', [...dayBox(16).querySelector('.ss-slot').querySelectorAll('.ss-stk-card')[0].querySelectorAll('.ss-stk-lbl')].map((x) => x.textContent.replace(/[\d\s-]+/g, '')), ['大小px', '旋轉°', '橫向%', '縱向（往上）%', '外框厚度px']);
  streamEvents.splice(streamEvents.indexOf(evY), 1); saveStreamEvents(); renderStreamView();
  streamDays = {}; saveStreamDays();

  // ── v0.29：配色與日程區照附圖調整 ──
  buildStreamSettings(); renderStreamView();
  const secOf = (t) => [...document.querySelectorAll('#ssBody details.ss-sec')].find((d) => d.querySelector('summary').textContent.includes(t));
  check('配色區：隨機鈕、6 組預設色卡、5 個色盤', [!!secOf('配色').querySelector('.ss-big-btn'), secOf('配色').querySelectorAll('.ss-preset').length, [...secOf('配色').querySelectorAll('.ss-swatch span')].map((x) => x.textContent)], [true, 6, ['日 1', '日 2', '日 3', '背景', '文字']]);
  check('配色區：每組預設色卡 4 個圓點（日 1～3＋背景）', secOf('配色').querySelector('.ss-preset').children.length, 4);
  secOf('配色').querySelectorAll('.ss-preset')[5].click();
  check('套用預設「深夜」：3 色＋畫布底色＋文字色，改成輪替', [streamSettings.dayColors, streamSettings.canvasBg, streamSettings.titleColor, streamSettings.dayColorMode], [['#3b2f5a', '#5a4a85', '#e8a6c8'], '#1a1626', '#f3e9ff', 'rotate']);
  check('畫布底色套到預覽、文字色套到標題與星期名', [$$('bgStreamPreview').style.backgroundColor.replace(/ /g, ''), $$('bgStreamPreview').dataset.tc, getComputedStyle($$('streamPeriod')).color.replace(/ /g, '')], ['rgb(26,22,38)', '1', 'rgb(243,233,255)']);
  const bgSw = [...secOf('配色').querySelectorAll('.ss-swatch input')][3]; bgSw.value = '#112233'; fireEvt(bgSw, 'input');
  check('背景色盤：改畫布底色', streamSettings.canvasBg, '#112233');
  streamSettings.canvasBg = ''; streamSettings.titleColor = ''; saveStreamSettings(); renderStreamView();
  check('沒指定畫布底色／文字色就回到一般背景', [$$('bgStreamPreview').style.backgroundImage.includes('linear-gradient') || $$('bgStreamPreview').style.backgroundColor !== 'rgb(17, 34, 51)', $$('bgStreamPreview').dataset.tc], [true, '']);
  buildStreamSettings();
  check('日程區：開始日 → 時區（含顯示與顏色）→ 輸出語言 → 署名位置', [...secOf('日程').querySelectorAll('.ss-row > label, .ss-hint')].map((x) => x.textContent.slice(0, 4)), ['開始日（', '時區標示', '顯示：不', '年份與時', '輸出語言', '星期、日', '署名位置']);
  check('日程區：語言改成按鈕（只保留中、英、日）', [...secOf('日程').querySelectorAll('.ss-pills')[0].children].map((b) => b.dataset.value), ['zh', 'en', 'ja']);
  [...secOf('日程').querySelectorAll('.ss-pills')[0].children].find((b) => b.dataset.value === 'zh').click();
  [...secOf('日程').querySelectorAll('.ss-pills')[1].children].find((b) => b.textContent === '右').click();
  check('署名位置：右（按鈕）', [streamSettings.creditPos, secOf('文字').textContent.includes('署名位置')], ['right', false]);
  const tzSel = secOf('日程').querySelector('select'); tzSel.value = 'Asia/Tokyo'; fireEvt(tzSel, 'change');
  check('時區：選了之後顯示「顯示：…」', secOf('日程').querySelectorAll('.ss-hint')[0].textContent.includes('GMT+9'), true);
  streamSettings = clone(STREAM_DEFAULTS); saveStreamSettings(); buildStreamSettings(); renderStreamView();

  // ── v0.30：配色區不爆框、星期名貼近日期、提示詞不含個人資料 ──
  openStream(); buildStreamSettings(); renderStreamView();
  document.querySelectorAll('#ssBody details.ss-sec').forEach((d) => { d.open = true; });
  { const over = []; document.querySelectorAll('#ssBody details.ss-sec').forEach((sec) => { const r = sec.getBoundingClientRect(); sec.querySelectorAll('*').forEach((n) => { const b = n.getBoundingClientRect(); if (b.width && n.tagName !== 'SUMMARY' && b.right > r.right - 11) over.push(n.className || n.tagName); }); });
    check('設定面板：所有欄位都在區段框內（不爆框）', over.filter((c) => c !== 'ss-name'), []); }
  { const head = document.querySelector('.sw-day .sw-head'), date = head.querySelector('.sw-date').getBoundingClientRect(), dow = head.querySelector('.sw-dow').getBoundingClientRect();
    check('週曆：星期名緊貼日期（中間距離小於 20px）', [getComputedStyle(head).justifyContent, dow.left - date.right < 20], ['flex-start', true]); }
  check('行程視窗提示詞：不含個人資料、同行者沒有提示', ['evTitle', 'trpgGm', 'trpgSystem', 'trpgScript', 'evPeople'].map((id) => $$(id).placeholder), ['標題', 'GM', '系統', '劇本名', '']);

  // ── v0.31：字型（Google／電腦）、固定比例時版型相容 ──
  setCalWidth(1200); openStream(); setStreamMode('week'); streamAnchor = '2026-10-14';
  const evKeep = streamEvents;
  streamEvents = [0, 1, 2, 3, 4, 5, 6].flatMap((i) => [0, 1, 2].map((k) => ({ id: `fit${i}${k}`, title: `行程${i}-${k}`, memo: '', detail: '說明文字', start: `2026-10-${12 + i}`, end: `2026-10-${12 + i}`, startTime: `${10 + k * 3}:00`, endTime: `${11 + k * 3}:00`, color1: '#f08aa8', color2: '#d9547e', colorMode: 'solid', category: '', people: [], noBlock: false })));
  const fitBox = $$('bgStreamPreview');
  for (const [asp, shape, cols] of [['16:9', 'wide', 7], ['4:3', 'classic', 4], ['9:16', 'portrait', 2]]) {
    ssSet('aspect', asp);
    const body = $$('streamWeek'), r = fitBox.getBoundingClientRect(), [aw, ah] = asp.split(':').map(Number);
    check(`版型相容 ${asp}：畫布是固定比例、形狀 ${shape}、週曆 ${cols} 欄`, [Math.abs(r.width / r.height - aw / ah) < 0.02, fitBox.dataset.shape, getComputedStyle(body).gridTemplateColumns.split(' ').length], [true, shape, cols]);
    check(`版型相容 ${asp}：內容放得進畫布（不破框）`, [fitBox.scrollHeight <= fitBox.clientHeight + 3, body.scrollHeight <= body.clientHeight + 3, body.scrollWidth <= body.clientWidth + 3], [true, true, true]);
    for (const st of ['list', 'vertical']) { ssSet('style', st); check(`版型相容 ${asp} · ${st}：不破框`, [fitBox.scrollHeight <= fitBox.clientHeight + 3, body.scrollHeight <= body.clientHeight + 3], [true, true]); }
    ssSet('style', 'grid');
  }
  setStreamMode('month'); ssSet('aspect', '16:9');
  check('版型相容：月曆在 16:9 也放得進畫布', [$$('streamMonth').scrollHeight <= $$('streamMonth').clientHeight + 3, fitBox.scrollHeight <= fitBox.clientHeight + 3], [true, true]);
  setStreamMode('year'); check('版型相容：年度總覽在 16:9 也放得進畫布', fitBox.scrollHeight <= fitBox.clientHeight + 3, true);
  setStreamMode('week'); ssSet('aspect', 'auto');
  check('畫面比例自動：不固定高度、內容區不被縮放', [fitBox.dataset.fit, $$('streamWeek').style.transform, $$('streamWeek').classList.contains('sw-fill')], ['', '', false]);
  streamEvents = evKeep;

  // 匯入範圍：這段時間沒有私人行程就不開視窗；年度＝整年
  events = [{ id: 'r1', title: '十二月', start: '2026-12-05', end: '2026-12-05', startTime: '', endTime: '', color1: '#f08aa8', color2: '#d9547e', colorMode: 'solid', category: '', people: [], noBlock: false }];
  setStreamMode('week'); streamAnchor = '2026-10-14'; closeModal('streamPickModal'); showStreamImport();
  check('匯入：這一週沒有私人行程 → 不開視窗', isModalOpen('streamPickModal'), false);
  setStreamMode('year'); showStreamImport();
  check('匯入（年度）：列出整年的私人行程', [isModalOpen('streamPickModal'), document.querySelectorAll('#spList .exp-row').length, $$('spScope').textContent.includes('2026 年')], [true, 1, true]);
  closeModal('streamPickModal'); events = evsBefore; setStreamMode('week');

  // 年度總覽沒有預設眉標；預覽比視窗窄時置中
  openStream(); setStreamMode('year');
  check('直播年度總覽：沒有預設眉標（「本月直播時間表」不該出現）', [$$('streamEyebrow').hidden, $$('streamEyebrow').textContent], [true, '']);
  ssSet('eyebrow', '我的標語'); check('直播年度總覽：自訂眉標照常顯示', [$$('streamEyebrow').hidden, $$('streamEyebrow').textContent], [false, '我的標語']); ssSet('eyebrow', '');
  setStreamMode('month'); check('月曆／週曆仍有預設眉標', [$$('streamEyebrow').hidden, $$('streamEyebrow').textContent], [false, '✦ 本月直播時間表 ✦']); setStreamMode('week');
  setCalWidth(480); renderStreamView();
  { const stg = $$('streamStage').getBoundingClientRect(), sc = $$('streamScaler').getBoundingClientRect();
    check('直播預覽置中（視窗夠寬時兩側留白相等；被縮小時剛好填滿）', [Math.round(sc.width) <= 480, Math.abs((sc.left - stg.left) - (stg.width - sc.width) / 2) < 2], [true, true]); }
  setCalWidth(1200);

  // v0.50：社群帳號在設定選單填一次，版面設定只勾選要顯示哪些；Twitch 設定也在設定選單
  check('設定選單：有「社群帳號」「Twitch 設定」，直播工具列沒有 Twitch 設定鈕', [!!document.querySelector('#settingsMenu #btnSocial'), !!document.querySelector('#settingsMenu #btnTwitchSet'), !!$$('stTwitch')], [true, true, false]);
  openSocialModal(); $$('soc_socTwitch').value = 'twitch.tv/abc'; $$('soc_socX').value = '@abc'; saveSocialModal();
  check('社群帳號視窗：存進設定、直播行程顯示', [streamSettings.socTwitch, [...document.querySelectorAll('#streamSocials .sc-pill')].map((x) => x.textContent)], ['twitch.tv/abc', ['🎮 twitch.tv/abc', '𝕏 @abc']]);
  { const sec = [...$$('ssBody').children].find((d) => d.querySelector('summary').textContent.includes('社群'));
    check('版面設定的社群區：只有勾選（沒有填帳號的欄），沒填的灰掉', [sec.querySelectorAll('input[type=text]').length, [...sec.querySelectorAll('input[type=checkbox]')].map((x) => x.disabled)], [0, [false, false, true, true, true]]);
    sec.querySelector('input[type=checkbox]').click();
    check('取消勾選 Twitch：直播行程不顯示它', [streamSettings.socTwitchShow, [...document.querySelectorAll('#streamSocials .sc-pill')].map((x) => x.textContent)], [false, ['𝕏 @abc']]); }
  streamSettings.socTwitchShow = true; ssSet('socTwitch', 'twitch.tv/abc');
  { const keep = confirm; window.confirm = () => true; resetStreamSettings(); window.confirm = keep; }
  check('還原版面設定：社群帳號保留、顯示旗標回預設', [streamSettings.socTwitch, streamSettings.socX, streamSettings.socTwitchShow], ['twitch.tv/abc', '@abc', true]);
  ['socTwitch', 'socX'].forEach((k) => ssSet(k, ''));

  // ── v0.34：社群在右下角、筆記格、每天設定可收合 ──
  openStream(); streamAnchor = '2026-10-14'; setStreamMode('week'); streamEvents = [{ id: 'nt1', title: '直播', detail: '', memo: '', start: '2026-10-14', end: '2026-10-14', startTime: '', endTime: '', color1: '#f08aa8', color2: '#d9547e', colorMode: 'solid', category: '', people: [], noBlock: false }];
  ssSet('socTwitch', 'tw'); ssSet('socYoutube', 'yt');
  { const soc = $$('streamSocials'), wk = $$('streamWeek'), pv = fitBox.getBoundingClientRect(), sr = soc.getBoundingClientRect(), wr = wk.getBoundingClientRect();
    check('社群：在週曆下方、靠右對齊（右下角）', [getComputedStyle(soc).justifyContent, sr.top >= wr.bottom - 1, Math.abs(pv.right - sr.right) < pv.width * 0.06, !$$('streamHead').contains(soc)], ['flex-end', true, true, true]); }
  ssSet('socTwitch', ''); ssSet('socYoutube', '');
  check('筆記：沒填就沒有格子', [document.querySelectorAll('.sw-notecell').length, fitBox.dataset.note], [0, '']);
  ssSet('note', '第一行\n第二行'); ssSet('aspect', '16:9');
  { const cell = document.querySelector('.sw-notecell'), days = document.querySelectorAll('.sw-day'), dr = days[0].getBoundingClientRect(), nr = cell.getBoundingClientRect();
    check('筆記：是週曆的第 8 格，跟日卡片同尺寸（橫式畫布 8 欄一排）', [days.length, days[7] === cell, Math.abs(nr.width - dr.width) < 2, Math.abs(nr.height - dr.height) < 2, getComputedStyle($$('streamWeek')).gridTemplateColumns.split(' ').length], [8, true, true, true, 8]);
    check('筆記：裡面是行程同款卡片、保留換行，標題放在日期的位置', [cell.querySelector('.sw-event .sw-detail').textContent, getComputedStyle(cell.querySelector('.sw-detail')).whiteSpace, cell.querySelector('.sw-date').textContent], ['第一行\n第二行', 'pre-wrap', '筆記']); }
  ssSet('aspect', '4:3'); check('筆記：4:3 畫布 4 欄×2 列、不用撐滿', [getComputedStyle($$('streamWeek')).gridTemplateColumns.split(' ').length, getComputedStyle(document.querySelector('.sw-notecell')).gridColumnEnd], [4, 'auto']);
  ssSet('aspect', 'auto');
  ssSet('lang', 'en'); check('筆記：標題跟著輸出語言', document.querySelector('.sw-notecell .sw-date').textContent, 'NOTE'); ssSet('lang', 'ja'); check('筆記：日文', document.querySelector('.sw-notecell .sw-date').textContent, 'ノート'); ssSet('lang', 'zh');
  buildStreamSettings();
  check('設定區有對應的筆記欄位（多行）', !![...document.querySelectorAll('#ssBody textarea')].find((t) => t.value === '第一行\n第二行'), true);
  ssSet('note', '');
  fillDaySettings();
  { const d = dayBox(14), tg = d.querySelector('.ss-day-toggle'), body = d.querySelector('.ss-day-body');
    check('每天設定：預設展開、有收合鈕，休息日勾選仍在標題列', [body.hidden, tg.textContent.includes('10/14'), !!d.querySelector('.ss-day-head .ss-rest')], [false, true, true]);
    tg.click();
    check('每天設定：按一下收合，標題旁顯示行程名稱', [dayBox(14).querySelector('.ss-day-body').hidden, dayBox(14).classList.contains('collapsed'), dayBox(14).querySelector('.ss-day-sum').hidden, dayBox(14).querySelector('.ss-day-sum').textContent], [true, true, false, '· 直播']);
    fillDaySettings();
    check('每天設定：換週重畫後仍維持收合（以星期幾記）', dayBox(14).querySelector('.ss-day-body').hidden, true);
    const tools = [...document.querySelectorAll('.ss-days-tools button')];
    tools.find((b) => b.textContent === '全部展開').click();
    check('每天設定：全部展開', [...document.querySelectorAll('#ssDaysBody .ss-day-body')].every((b) => !b.hidden), true);
    tools.find((b) => b.textContent === '全部收合').click();
    check('每天設定：全部收合', [...document.querySelectorAll('#ssDaysBody .ss-day-body')].every((b) => b.hidden), true);
    [...document.querySelectorAll('.ss-days-tools button')].find((b) => b.textContent === '全部展開').click(); }
  streamEvents = evKeep;

  // ── v0.36：筆記文字設定、休息日置中、貼紙圓弧外框與陰影 ──
  openStream(); streamAnchor = '2026-10-14'; setStreamMode('week'); setCalWidth(1200);
  streamEvents = [{ ...newStreamEvent('2026-10-14'), title: '外框測試', startTime: '10:00', stickers: [{ src: tiny, size: 60 }] }]; streamDays = { '2026-10-15': { rest: true } }; saveStreamEvents(); saveStreamDays();
  ssSet('align', 'right'); ssSet('note', '置中的筆記');
  { const note = document.querySelector('.sw-notecell .sw-event'), det = note.querySelector('.sw-detail');
    check('筆記：文字一律置中（即使行程文字設成靠右）、預設 16px', [getComputedStyle(note).textAlign, getComputedStyle(det).fontSize], ['center', '16px']);
    ssSet('noteSize', 30); ssSet('noteColor', '#112233');
    check('筆記：可調文字大小與顏色', [document.querySelector('.sw-notecell .sw-detail').style.fontSize, document.querySelector('.sw-notecell .sw-detail').style.color.replace(/ /g, '')], ['30px', 'rgb(17,34,51)']); }
  buildStreamSettings();
  { const sec = [...document.querySelectorAll('#ssBody details.ss-sec')].find((d) => d.querySelector('summary').textContent.includes('文字')), labels = [...sec.querySelectorAll('.ss-row > label')].map((x) => x.textContent.slice(0, 6));
    check('設定區：筆記有多行欄位、文字顏色、文字大小', [!!sec.querySelector('textarea'), labels.includes('筆記文字顏色'), labels.includes('筆記文字大小')], [true, true, true]); }
  ssSet('note', ''); ssSet('noteSize', 16); ssSet('noteColor', ''); ssSet('align', 'left');
  check('休息日：週曆上的休息訊息置中', getComputedStyle(document.querySelector('.sw-day[data-date="2026-10-15"] .sw-rest')).textAlign, 'center');
  await new Promise((r) => setTimeout(r, 100));
  { const evS = streamEvents[0], imgOf = () => dayCard(14).querySelector('.sw-sticker');
    check('貼紙：沒設外框就用原圖', [imgOf().src === tiny, imgOf().style.width], [true, '60px']);
    evS.stickers = [{ src: tiny, size: 60, bw: 6, bc: '#ff0000' }]; saveStreamEvents(); renderStreamView(); await new Promise((r) => setTimeout(r, 250));
    const outlined = imgOf();
    check('貼紙：有外框時，圖片烙上圓弧外框與陰影（尺寸變大、不再是原圖）', [outlined.src === tiny, outlined.src.startsWith('data:image/png'), parseFloat(outlined.style.width) > 60], [false, true, true]);
    const px = (src) => new Promise((res) => { const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d'); g.drawImage(im, 0, 0); res([im.width, im.height, g.getImageData(Math.floor(im.width / 2), 2, 1, 1).data[3], g.getImageData(Math.floor(im.width / 2), Math.floor(im.height / 2), 1, 1).data[3]]); }; im.src = src; });
    const [w, h, edgeA, midA] = await px(outlined.src);
    check('貼紙：外框圖四周透明、中間不透明（外框貼著圖片外緣）', [w > 30 && h > 30, edgeA < 80, midA > 200], [true, true, true]);
    evS.stickers = [{ src: tiny, size: 60, bw: 12, bc: '#ff0000' }]; renderStreamView(); await new Promise((r) => setTimeout(r, 250));
    check('貼紙：外框越厚，圖片越大', parseFloat(imgOf().style.width) > parseFloat(outlined.style.width), true);
    evS.stickers = [{ src: tiny, size: 60, bw: 0 }]; renderStreamView();
    check('貼紙：外框厚度 0 就回到原圖', [imgOf().src === tiny, imgOf().style.width], [true, '60px']); }
  { const slot = document.querySelector('#ssDaysBody .ss-slot'); fillDaySettings();
    const card = document.querySelector('#ssDaysBody .ss-stk-card');
    check('設定區：貼紙卡有外框顏色與外框厚度（預設 0＝舊貼紙不受影響）', [!!card.querySelector('input[type=color]'), [...card.querySelectorAll('.ss-stk-lbl')].map((x) => x.textContent.replace(/[\d\s-]+/g, '')).pop(), STICKER.newBw], [true, '外框厚度px', 6]); }
  streamEvents = evKeep; streamDays = {}; saveStreamEvents(); saveStreamDays(); fillDaySettings();

  // ── v0.37：背景有圖時的文字可讀性 ──
  openStream(); streamSettings.bgImage = ''; streamSettings.titleColor = ''; saveStreamSettings(); renderStreamView();
  { const dow = document.querySelector('.sw-dow'), docCs = getComputedStyle(document.documentElement);
    check('星期名跟日期同一個字色（不再用容易看不見的次要色）', [getComputedStyle(dow).color === getComputedStyle(document.querySelector('.sw-date')).color, getComputedStyle(dow).opacity], [true, '0.72']);
    check('背景沒圖：不加光暈，標題陰影是 none', [box.dataset.img, box.style.getPropertyValue('--stream-title-shadow')], ['', 'none']);
    streamSettings.bgImage = tiny; saveStreamSettings(); renderStreamView();
    check('直播專用背景有圖：標記 data-img、標題改用光暈（不設描邊時）', [box.dataset.img, box.style.getPropertyValue('--stream-title-shadow'), getComputedStyle($$('streamTitle')).textShadow !== 'none', getComputedStyle($$('streamEyebrow')).textShadow !== 'none'], ['1', '', true, true]);
    check('光暈顏色跟字色相反（深字配白光暈）', [box.style.getPropertyValue('--halo').includes('255,255,255'), luminance(docCs.getPropertyValue('--cal-text').trim()) < 0.5], [true, true]);
    streamSettings.titleColor = '#ffffff'; saveStreamSettings(); renderStreamView();
    check('淺色字配深色光暈', box.style.getPropertyValue('--halo').includes('0,0,0'), true);
    ssSet('titleOutline', true); check('有設描邊就用描邊、不用光暈', box.style.getPropertyValue('--stream-title-shadow').includes('255, 255, 255') || box.style.getPropertyValue('--stream-title-shadow').includes('px'), true); ssSet('titleOutline', false);
    streamSettings.bgImage = ''; streamSettings.titleColor = ''; saveStreamSettings(); renderStreamView(); }

  // ── v0.38：眉標／帳號／時區顏色、行程字級與尺寸 ──
  openStream(); streamAnchor = '2026-10-14'; setStreamMode('week');
  streamEvents = [{ ...newStreamEvent('2026-10-14'), title: '字級測試', startTime: '10:00', detail: '說明' }]; saveStreamEvents();
  ssSet('handle', '@me'); ssSet('tz', 'Asia/Taipei'); renderStreamView();
  { const col = (id) => getComputedStyle($$(id)).color.replace(/ /g, '');
    check('眉標／帳號／時區標示：預設都是次要色', [col('streamEyebrow') === col('streamHandle'), col('streamHandle') === col('streamTz')], [true, true]);
    ssSet('eyebrowColor', '#ff0000'); ssSet('handleColor', '#00ff00'); ssSet('tzColor', '#0000ff');
    check('眉標／帳號／時區標示：可各自指定顏色', [col('streamEyebrow'), col('streamHandle'), col('streamTz')], ['rgb(255,0,0)', 'rgb(0,255,0)', 'rgb(0,0,255)']);
    ssSet('eyebrowColor', ''); ssSet('handleColor', ''); ssSet('tzColor', '');
    check('改回自動就回到次要色', col('streamEyebrow') === col('streamHandle'), true); }
  buildStreamSettings();
  { const sec = (t) => [...document.querySelectorAll('#ssBody details.ss-sec')].find((d) => d.querySelector('summary').textContent.includes(t)), lab = (s) => [...s.querySelectorAll('.ss-row > label')].map((x) => x.textContent);
    check('設定區：副標題顏色、帳號顏色在文字區，年份與時區顏色在日程區', [lab(sec('文字')).includes('副標題顏色'), lab(sec('文字')).includes('帳號顏色'), lab(sec('日程')).some((x) => x.startsWith('年份與時區顏色'))], [true, true, true]); }
  { const px = (sel) => parseFloat(getComputedStyle(document.querySelector(sel)).fontSize);
    check('行程文字大小：標題 > 時間 > 備註', [px('.sw-name') > px('.sw-time'), px('.sw-time') > px('.sw-detail')], [true, true]);
    check('行程卡片夠高：一張至少 5 rem，三張疊起來剛好填滿日卡片', [parseFloat(getComputedStyle(document.querySelector('.sw-event')).minHeight) >= 80, getComputedStyle(document.querySelector('.sw-day')).minHeight === '0px' || getComputedStyle(document.querySelector('.sw-day')).minHeight === '356px'], [true, true]); }
  streamEvents = evKeep; saveStreamEvents(); ssSet('tz', 'none');

  // ── v0.39：舊貼紙可刪除、日期標題加大、兩場為預設尺寸／三場縮小 ──
  openStream(); streamAnchor = '2026-10-14'; setStreamMode('week'); setCalWidth(1200);
  streamEvents = []; streamDays = { '2026-10-16': { rest: true, stickers: [tiny, tiny] } }; saveStreamEvents(); saveStreamDays(); renderStreamView(); fillDaySettings();
  check('舊版貼紙（當天沒有場次）仍會畫在週曆上', document.querySelectorAll('.sw-day[data-date="2026-10-16"] .sw-sticker').length, 2);
  const legacyBox = () => [...dayBox(16).querySelectorAll('.ss-stk-box')].find((b) => b.textContent.includes('舊版'));
  { const box = legacyBox(), cards = box.querySelectorAll('.ss-stk-card');
    check('設定區：舊版貼紙有自己的區塊可以刪除（沒有新增鈕）', [!!box, cards.length, box.querySelector('.ss-add').hidden, box.textContent.includes('舊版每天共用的貼紙')], [true, 2, true, true]);
    cards[0].querySelector('.ss-stk-del').click();
    check('刪除舊貼紙：週曆與存檔都少一張', [document.querySelectorAll('.sw-day[data-date="2026-10-16"] .sw-sticker').length, streamDays['2026-10-16'].stickers.length], [1, 1]);
    legacyBox().querySelector('.ss-stk-del').click();
    check('全部刪完：畫面沒有貼紙、存檔也不留空陣列、區塊收起', [document.querySelectorAll('.sw-day[data-date="2026-10-16"] .sw-sticker').length, 'stickers' in streamDays['2026-10-16'], legacyBox().hidden], [0, false, true]); }
  fillDaySettings();
  check('沒有舊貼紙的日子不會出現這個區塊', [...document.querySelectorAll('#ssDaysBody .ss-stk-box')].filter((b) => b.textContent.includes('舊版')).length, 0);
  streamDays = {}; saveStreamDays();
  { const px = (sel) => parseFloat(getComputedStyle(document.querySelector(sel)).fontSize);
    streamEvents = [0, 1].map((i) => ({ ...newStreamEvent('2026-10-14'), title: `標題${i}`, startTime: `${10 + i * 3}:00`, detail: '說明' })); saveStreamEvents(); renderStreamView();
    const two = { date: px('.sw-date'), name: px('.sw-name'), time: px('.sw-time'), detail: px('.sw-detail'), h: parseFloat(getComputedStyle(document.querySelector('.sw-event')).minHeight), n: document.querySelector('.sw-day[data-date="2026-10-14"]').dataset.ev };
    check('兩場（預設尺寸）：日期 ≥ 28px、標題 ≥ 24px，標題 > 時間 > 說明', [two.date >= 28, two.name >= 24, two.name > two.time, two.time > two.detail, two.n], [true, true, true, true, '']);
    streamEvents.push({ ...newStreamEvent('2026-10-14'), title: '標題2', startTime: '16:00', detail: '說明' }); saveStreamEvents(); renderStreamView();
    const three = { name: px('.sw-name'), time: px('.sw-time'), detail: px('.sw-detail'), h: parseFloat(getComputedStyle(document.querySelector('.sw-event')).minHeight), n: document.querySelector('.sw-day[data-date="2026-10-14"]').dataset.ev };
    check('填到第 3 場：這一天的行程縮小（字變小、卡片變矮），順序仍是 標題 > 時間 > 說明', [three.n, three.name < two.name, three.time < two.time, three.detail < two.detail, three.h < two.h, three.name > three.time && three.time > three.detail], ['3', true, true, true, true, true]);
    check('只有填到 3 場的那一天縮小，其他天不受影響', [document.querySelectorAll('.sw-day[data-ev="3"]').length, document.querySelectorAll('.sw-day[data-ev="3"] .sw-event').length], [1, 3]);
    { // v0.61：3 場時從原尺寸一路縮小到「剛好塞進跟 2 場一樣高的日卡片」，不是固定縮一個大小
      const d3 = document.querySelector('.sw-day[data-ev="3"]'), k = parseFloat(d3.style.getPropertyValue('--sw-k')), minH = SW_DAY_MIN;
      d3.style.alignSelf = 'start'; const natural = d3.offsetHeight; d3.style.alignSelf = '';
      check('3 場：倍率在 0.5～1 之間，日卡片沒有比 2 場時（最小高度）更高', [k >= 0.5 && k < 1, natural <= minH + 1], [true, true]);
      check('3 場的字比 2 場小、但不會縮到看不見（至少一半）', [px('.sw-name') < two.name, px('.sw-name') >= two.name * 0.5 - 0.5], [true, true]);
      check('2 場的日卡片不縮（沒有倍率）', document.querySelector('.sw-day[data-date="2026-10-15"]').style.getPropertyValue('--sw-k'), '');
      streamDays['2026-10-15'] = { rest: true }; saveStreamDays(); renderStreamView();
      check('休息日文字加大（≥ 28px）', px('.sw-day.rest .sw-rest'), px('.sw-day.rest .sw-rest') >= 28 ? px('.sw-day.rest .sw-rest') : '≥28'); } }
  streamEvents = evKeep; saveStreamEvents();

  // ── v0.40：標題區（最大標題／副標題／年份＋時區） ──
  openStream(); streamAnchor = '2026-10-14'; setStreamMode('week'); setCalWidth(1200);
  ssSet('title', '我的標題'); ssSet('eyebrow', '我的副標題'); ssSet('handle', ''); ssSet('tz', 'none'); renderStreamView();
  { const px = (id) => parseFloat(getComputedStyle($$(id)).fontSize), al = (id) => getComputedStyle($$(id)).textAlign;
    check('標題區：標題最大、副標題較小、年份行最小', [px('streamTitle') >= 50, px('streamTitle') > px('streamEyebrow'), px('streamEyebrow') > px('streamTz')], [true, true, true]);
    check('標題區順序：標題 → 副標題（同一塊）；年份行在期間之前', [[...$$('streamHeadText').children].map((x) => x.id), $$('streamTz').nextElementSibling.id], [['streamTitle', 'streamEyebrow', 'streamHandle'], 'streamPeriod']);
    check('標題與副標題預設置中；年份行固定靠右', [al('streamTitle'), al('streamEyebrow'), al('streamTz')], ['center', 'center', 'right']);
    ssSet('titleAlign', 'left'); ssSet('eyebrowAlign', 'right');
    check('標題、副標題各自選對齊（左／右）；年份行不受影響', [al('streamTitle'), al('streamEyebrow'), al('streamTz')], ['left', 'right', 'right']);
    ssSet('titleAlign', 'right'); ssSet('eyebrowAlign', 'left');
    check('對齊可互換（標題右、副標題左）', [al('streamTitle'), al('streamEyebrow')], ['right', 'left']);
    ssSet('titleAlign', 'center'); ssSet('eyebrowAlign', 'center'); }
  check('年份行：只有年份（沒選時區）', $$('streamTz').textContent, '2026');
  ssSet('tz', 'Asia/Taipei'); check('年份行：年份＋時區（GMT+8）', $$('streamTz').textContent, '2026　GMT+8');
  streamAnchor = '2026-12-30'; renderStreamView(); check('週曆跨年：年份用週首那天所在的年', $$('streamTz').textContent.startsWith('2026'), true);
  streamAnchor = '2027-01-05'; renderStreamView(); check('換到下一年：年份跟著變', $$('streamTz').textContent.startsWith('2027'), true);
  setStreamMode('year'); check('年度總覽也用同一個標題區（年份行照常顯示）', $$('streamTz').textContent, '2027　GMT+8'); setStreamMode('week');
  ssSet('titleColor', '#112233'); ssSet('eyebrowColor', '#445566'); ssSet('tzColor', '#778899');
  { const c = (id) => getComputedStyle($$(id)).color.replace(/ /g, '');
    check('標題、副標題、年份行可各自改顏色', [c('streamTitle'), c('streamEyebrow'), c('streamTz')], ['rgb(17,34,51)', 'rgb(68,85,102)', 'rgb(119,136,153)']); }
  buildStreamSettings();
  { const sec = [...document.querySelectorAll('#ssBody details.ss-sec')].find((d) => d.querySelector('summary').textContent.includes('文字')), labs = [...sec.querySelectorAll('.ss-row > label')].map((x) => x.textContent);
    const iT = labs.indexOf('標題（最大的字）'), iS = labs.indexOf('副標題（標題下方的小字）');
    check('設定區：標題→顏色→對齊，副標題→顏色→對齊（依序排在最前面）', [labs.slice(iT, iT + 3), labs.slice(iS, iS + 3)], [['標題（最大的字）', '標題顏色', '標題對齊'], ['副標題（標題下方的小字）', '副標題顏色', '副標題對齊']]); }
  ssSet('titleColor', ''); ssSet('eyebrowColor', ''); ssSet('tzColor', ''); ssSet('tz', 'none'); ssSet('title', ''); ssSet('eyebrow', ''); streamAnchor = '2026-10-14'; renderStreamView();

  // ── v0.41：標題區統一描邊、直播行程的 TRPG 不顯示 GM／同行者且文字可直接改 ──
  openStream(); streamAnchor = '2026-10-14'; setStreamMode('week'); setCalWidth(1200);
  ssSet('title', '標題'); ssSet('eyebrow', '副標題'); ssSet('handle', '@me'); ssSet('tz', 'Asia/Taipei'); ssSet('titleOutline', true); ssSet('titleOutlineColor', '#ff0000'); ssSet('titleOutlineWidth', 3);
  { const sh = (id) => getComputedStyle($$(id)).textShadow;
    check('描邊：標題、副標題、帳號、期間、年份行一起套用，顏色與粗細照設定', [['streamTitle', 'streamEyebrow', 'streamHandle', 'streamPeriod', 'streamTz'].every((id) => sh(id).includes('rgb(255, 0, 0)')), box.style.getPropertyValue('--stream-title-shadow').split('),').length >= 1, box.style.getPropertyValue('--stream-title-shadow').split(', ').length, box.style.getPropertyValue('--stream-title-shadow').includes('3.0px')], [true, true, 12, true]);
    ssSet('titleOutline', false);
    check('關掉描邊：全部都沒有陰影（背景沒圖時）', ['streamTitle', 'streamEyebrow', 'streamHandle', 'streamPeriod', 'streamTz'].every((id) => sh(id) === 'none'), true); }
  buildStreamSettings();
  { const sec = [...document.querySelectorAll('#ssBody details.ss-sec')].find((d) => d.querySelector('summary').textContent.includes('文字')), labs = [...sec.querySelectorAll('.ss-row > label, .ss-row .check-line')].map((x) => x.textContent);
    check('設定區：描邊開關（說明含副標題等）、顏色、粗細', [labs.some((x) => x.includes('文字描邊（標題、副標題、帳號、年份行一起）')), labs.includes('描邊顏色'), labs.includes('描邊粗細')], [true, true, true]); }
  ssSet('title', ''); ssSet('eyebrow', ''); ssSet('handle', ''); ssSet('tz', 'none'); ssSet('titleOutlineWidth', 2);
  // TRPG：直播行程不顯示 GM 與同行者
  { const trpgEv = { ...newStreamEvent('2026-10-14'), title: '', category: 'cat_gm', trpg: { gm: '染香', system: 'NC', script: '劇本甲' }, people: ['小明', '小華'], startTime: '20:00' };
    check('TRPG 在私人行程：照舊顯示 GM 與同行者', evName({ ...trpgEv, trpg: { ...trpgEv.trpg } }), '【TRPG】染香 - NC 《劇本甲》 with 小明、小華');
    streamEvents = [trpgEv]; saveStreamEvents(); renderStreamView();
    check('TRPG 在直播行程：不顯示 GM 名字與同行者', [evName(trpgEv), document.querySelector('.sw-day[data-date="2026-10-14"] .sw-name').textContent], ['【TRPG】NC 《劇本甲》', '【TRPG】NC 《劇本甲》']);
      const normal = { ...newStreamEvent('2026-10-14'), title: '一般', category: '', people: ['小明'] }; streamEvents = [normal]; saveStreamEvents();
    check('非 TRPG 類別在直播行程仍顯示同行者', evName(normal), '一般 with 小明');
    // 匯入：TRPG 欄位組出的字直接寫進標題，不帶 GM／同行者
    const keepMain = events; events = [{ id: 'tr1', title: '', memo: '私人備註', start: '2026-10-14', end: '2026-10-14', startTime: '20:00', endTime: '', color1: '#6f9be8', color2: '#4f6fd0', colorMode: 'solid', category: 'cat_gm', trpg: { gm: '染香', system: 'NC', script: '劇本甲' }, people: ['小明'] }];
    streamEvents = []; streamImportSel = new Set(['tr1']); doStreamImport();
    const imp = streamEvents[0];
    check('匯入 TRPG 行程：標題＝組出的字（可直接編輯），TRPG 欄位與同行者清掉', [imp.title, imp.trpg, imp.people, imp.sourceId], ['【TRPG】NC 《劇本甲》', null, [], 'tr1']);
    check('私人行程那份不受影響（GM、同行者都還在）', [events[0].trpg.gm, events[0].people], ['染香', ['小明']]);
    fillDaySettings();
    { const slot = [...document.querySelectorAll('#ssDaysBody .ss-day')].find((d) => d.querySelector('.ss-day-head').textContent.includes('10/14')).querySelector('.ss-slot'), inp = slot.querySelector('.ss-two input');
      check('每天設定：標題欄就是那串文字（不再是空的）', inp.value, '【TRPG】NC 《劇本甲》');
      inp.value = '【TRPG】NC 《改過的劇本》'; fireEvt(inp, 'input');
      check('在每天設定直接改字：週曆跟著變、存檔', [document.querySelector('.sw-day[data-date="2026-10-14"] .sw-name').textContent, streamEvents[0].title], ['【TRPG】NC 《改過的劇本》', '【TRPG】NC 《改過的劇本》']); }
    // 啟動時整理舊資料（舊的直播行程還帶著 TRPG 欄位）
    streamEvents = [{ ...newStreamEvent('2026-10-15'), title: '', category: 'cat_play', trpg: { gm: '甲', system: '', script: '乙' }, people: ['丙'] }]; saveStreamEvents(); migrateStreamTrpg();
    check('舊資料整理：標題寫進去、GM 與同行者不留', [streamEvents[0].title, streamEvents[0].trpg, streamEvents[0].people, load(KEY.streamEvents, [])[0].title], ['【TRPG】《乙》', null, [], '【TRPG】《乙》']);
    // 行程視窗存直播行程
    openEditEvent(streamEvents[0].id, 'stream'); $$('evSync').checked = false; selectedCat = 'cat_gm'; writeTrpg({ gm: '某GM', system: 'COC', script: '' }); $$('evPeople').value = '路人'; saveEvent();
    check('在行程視窗存直播行程的 TRPG：GM 與同行者不留、字寫進標題', [streamEvents[0].title, streamEvents[0].trpg, streamEvents[0].people], ['【TRPG】COC', null, []]);
    events = keepMain; }
  streamEvents = evKeep; saveStreamEvents(); renderStreamView();

  // ── v0.60：今天整格塗滿主題色（年度總覽、月視圖、直播的週曆／月曆／年度總覽）──
  { const fill = 'rgb(194, 65, 109)', white = 'rgb(255, 255, 255)', now = new Date(), t = toDs(now), bg = (n) => getComputedStyle(n).backgroundColor, col = (n) => getComputedStyle(n).color;
    const keepEv = events, keepSt = streamEvents, keepAnchor = streamAnchor, keepVY = viewYear; events = []; streamEvents = [];
    viewYear = now.getFullYear(); showView('year'); renderYearView();
    const mini = document.querySelector(`#mini-${now.getMonth()} .mini-day.today`);
    check('年度總覽：今天的小格塗滿主題色、白字，只有一格', [!!mini, mini && bg(mini), mini && col(mini), document.querySelectorAll('#yearGrid .mini-day.today').length], [true, fill, white, 1]);
    renderMonthFull(now.getMonth()); showView('month');
    const cell = document.querySelector(`#monthFullCal .cal-day[data-date="${t}"]`);
    check('月視圖：今天整格塗滿主題色，日期數字白色', [cell.classList.contains('today'), bg(cell), col(cell.querySelector('.day-num'))], [true, fill, white]);
    check('月視圖：其他天不塗色', [...document.querySelectorAll('#monthFullCal .cal-day[data-date]')].filter((c) => c.dataset.date !== t).every((c) => bg(c) !== fill), true);
    openStream(); streamAnchor = t; setStreamMode('week'); renderStreamView();
    const sw = document.querySelector('#streamWeek .sw-day.today');
    check('直播週曆：今天整張卡塗滿主題色，日期與星期白字', [!!sw, sw && bg(sw), sw && col(sw.querySelector('.sw-date')), sw && col(sw.querySelector('.sw-dow'))], [true, fill, white, white]);
    setStreamMode('month'); renderStreamView();
    const sm = document.querySelector(`#streamMonth .cal-day[data-date="${t}"]`);
    check('直播月曆：今天整格塗滿主題色', sm && bg(sm), fill);
    events = keepEv; streamEvents = keepSt; streamAnchor = keepAnchor; viewYear = keepVY; setStreamMode('week'); fillDaySettings(); backToYear(); }

  // ── v0.42：工具介面配色（亮／暗主題下，頂部列、直播設定面板、各視窗的文字對比都要達到 WCAG AA）──
  { const parse = (s) => { const m = s.match(/[\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1 }; };
    const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const blend = (t, b) => ({ r: t.r * t.a + b.r * (1 - t.a), g: t.g * t.a + b.g * (1 - t.a), b: t.b * t.a + b.b * (1 - t.a), a: 1 });
    const bgOf = (el) => { const chain = []; for (let n = el; n; n = n.parentElement) { const st = getComputedStyle(n); let c = parse(st.backgroundColor); if (c.a === 0 && /gradient/.test(st.backgroundImage)) c = parse(st.backgroundImage.match(/rgba?\([^)]*\)/)[0]); if (c.a > 0) { chain.push(c); if (c.a >= 1) break; } } const bc = parse(getComputedStyle(document.body).backgroundColor); return chain.reverse().reduce((a, c) => blend(c, a), bc.a ? { ...bc, a: 1 } : { r: 255, g: 255, b: 255, a: 1 }); };
    const audit = (root) => { const bad = []; root.querySelectorAll('*').forEach((el) => {
      if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && !['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)) return;
      const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none' || !el.offsetWidth) return;
      const col = parse(cs.color), bg = bgOf(el), fg = col.a < 1 ? blend(col, bg) : col, L1 = lum(fg), L2 = lum(bg), ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      const fs = parseFloat(cs.fontSize), large = fs >= 24 || (fs >= 18.66 && parseInt(cs.fontWeight) >= 700);
      if (ratio < (large ? 3 : 4.5)) bad.push(`${el.tagName}.${(el.className || '').toString().split(' ')[0]}|${el.id}:${ratio.toFixed(2)}`);
    }); return bad; };
    const keepTheme = theme;
    const noTransition = el('style', { text: '*, *::before, *::after { transition: none !important; animation: none !important; }' }); // 頁面在背景時轉場會停在中間色，量到的對比會失真
    document.head.appendChild(noTransition);
    for (const th of ['light', 'dark']) {
      setTheme(th); openStream(); toggleStreamPanel(true); buildStreamSettings(); document.querySelectorAll('#ssBody details').forEach((d) => { d.open = true; });
      await new Promise((r) => setTimeout(r, 400)); // 等按鈕的顏色轉場跑完，不然量到的是中間色
      check(`介面配色（${th}）：頂部列、直播操作列、設定面板的文字對比都達 4.5:1`, [...audit($$('topbar')), ...audit($$('streamBar')), ...audit($$('streamPanel'))], []);
      setSettingsMenu(true);
      check(`介面配色（${th}）：設定選單的文字對比都達 4.5:1`, audit($$('settingsMenu')), []);
      setSettingsMenu(false);
      setStreamMode('log'); buildStreamSettings(); document.querySelectorAll('#ssBody details').forEach((d) => { d.open = true; });
      await new Promise((r) => setTimeout(r, 400));
      check(`介面配色（${th}）：年度直播回顧的操作列與版面設定面板對比都達 4.5:1`, [...audit($$('streamBar')), ...audit($$('streamPanel')), ...audit($$('streamLog').querySelector('.rv-nav'))], []);
      setStreamMode('week'); buildStreamSettings();
      for (const id of ['eventModal', 'catModal', 'exportModal', 'bgModal', 'freeDaysModal', 'logModal', 'twitchModal', 'socialModal', 'dupModal', 'copyModal', 'dayModal', 'streamPickModal']) {
        if (id === 'freeDaysModal') showFreeDaysModal(); else if (id === 'eventModal') openNewEvent('2026-10-05', '2026-10-05'); else if (id === 'logModal') openLogEdit(null); else if (id === 'twitchModal') openTwitchModal(); else if (id === 'socialModal') openSocialModal(); else if (id === 'dupModal') askOverwrite([{ id: 'x', title: '【實況】標題', when: '2026/10/05', diff: [['標題', '舊的標題', '新的標題'], ['顏色', '#b58ae8', '#f08aa8']] }], { intro: '說明文字', oldLabel: '目前', newLabel: '新的' }); else openModal(id);
        check(`介面配色（${th}）：${id} 的文字對比都達 4.5:1`, audit($$(id)), []);
        check(`介面配色（${th}）：${id} 的輸入框提示文字（placeholder）對比都達 4.5:1`, [...$$(id).querySelectorAll("input[placeholder]")].filter((i) => i.offsetWidth).map((i) => { const bg = bgOf(i), fg = blend(parse(getComputedStyle(i, "::placeholder").color), bg), r = (Math.max(lum(fg), lum(bg)) + 0.05) / (Math.min(lum(fg), lum(bg)) + 0.05); return r < 4.5 ? `${i.id}:${r.toFixed(2)}` : null; }).filter(Boolean), []);
        closeModal(id); }
    }
    noTransition.remove(); setTheme(keepTheme); backToYear(); }

  // ── v0.43：直播紀錄（手動、Twitch 同步、截圖、匯出入）──
  { const keepLog = streamLog, keepCfg = twitchCfg, keepFetch = window.fetch;
    streamLog = []; saveStreamLog(); twitchCfg = { login: '', clientId: '', token: '', userId: '' }; saveTwitchCfg();
    logAutoSynced = true; // 測試中不要觸發「第一次開紀錄頁自動同步」，免得打到真的 Twitch
    openStream(); toggleStreamPanel(true); reviewView = 'year'; setStreamMode('log');
    check('紀錄頁：預覽收起、年曆版面有版面設定面板（年度回顧版）、紀錄清單與工具鈕出現', [$$('streamStage').hidden, $$('logStage').hidden, $$('streamPanel').hidden, ['stSync', 'stLogAdd', 'stSettings'].every((id) => !$$(id).hidden), ['stPrev', 'stToday', 'stNext', 'stImport'].every((id) => $$(id).hidden), $$('stLog').classList.contains('active'), $$('stWeek').classList.contains('active')], [true, false, false, true, true, true, false]);
    check('紀錄頁：沒資料時的說明', $$('streamLog').textContent.includes('還沒有任何直播紀錄'), true);
    check('頁籤記住上次在紀錄頁', loadRaw(KEY.streamMode), 'log');
    // 手動新增
    $$('stLogAdd').click();
    check('新增視窗：預設今天、刪除鈕隱藏', [isModalOpen('logModal'), $$('logDate').value === toDs(new Date()), $$('btnDeleteLog').hidden], [true, true, true]);
    $$('logDate').value = '2026-10-24'; $$('logTime').value = '20:00'; $$('logTitle').value = '深夜雜談'; $$('logGame').value = 'Just Chatting'; $$('logDur').value = '188'; $$('logUrl').value = 'https://www.twitch.tv/videos/1';
    const png = await new Promise((r) => { const c = document.createElement('canvas'); c.width = 64; c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#c33'; g.fillRect(0, 0, 64, 64); c.toBlob(r, 'image/png'); });
    logShotFile = new File([png], 'shot.png', { type: 'image/png' });
    await saveLogEdit();
    const e1 = streamLog[0];
    check('手動新增：欄位存檔（開播時間、標題、分類、時長、連結）', [streamLog.length, e1.source, logParts(e1.startedAt).ds, logParts(e1.startedAt).hm, e1.title, e1.game, e1.durationSec, e1.url, e1.hasThumb, load(KEY.streamLog, []).length], [1, 'manual', '2026-10-24', '20:00', '深夜雜談', 'Just Chatting', 11280, 'https://www.twitch.tv/videos/1', true, 1]);
    const blob = await thumbGet(e1.id);
    check('截圖存進 IndexedDB（縮成 480×270 的 JPEG）', [!!blob, blob && blob.type], [true, 'image/jpeg']);
    reviewView = 'list'; reviewYear = null; reviewMonth = null; renderStreamLog();
    check('清單顯示：日期星期時間、標題、分類、時長、月份摘要', [document.querySelector('.log-when').textContent, document.querySelector('.log-title').textContent, document.querySelector('.log-game').textContent, document.querySelector('.log-meta').textContent, document.querySelector('.log-month').textContent], ['10/24（六）20:00', '深夜雜談', 'Just Chatting', '3 小時 8 分', '10 月　·　1 場　·　3 小時 8 分']);
    await new Promise((r) => setTimeout(r, 200));
    check('清單顯示截圖', document.querySelector('.log-thumb .rv-img').hidden === false && document.querySelector('.log-thumb .rv-img').style.backgroundImage.startsWith('url(') && document.querySelector('.log-thumb').classList.contains('has'), true);
    // 年度直播回顧：統計、整年熱度圖、月份展開、年份切換、截圖
    { const keepReview = streamLog.slice();
      streamLog.push({ id: 'r2', source: 'manual', startedAt: new Date('2026-03-05T21:00:00').toISOString(), title: '三月的台', game: 'Elden Ring', durationSec: 5400, url: '', hasThumb: false },
        { id: 'r3', source: 'manual', startedAt: new Date('2026-03-05T23:30:00').toISOString(), title: '同一天第二場', game: 'Elden Ring', durationSec: 1800, url: '', hasThumb: false },
        { id: 'r4', source: 'manual', startedAt: new Date('2025-12-31T20:00:00').toISOString(), title: '去年最後一場', game: '', durationSec: 0, url: '', hasThumb: false });
      reviewYear = null; reviewMonth = null; reviewView = 'list'; renderStreamLog();
      check('年度回顧：預設顯示有紀錄的最新一年，標題與頁籤名稱', [$$('streamLog').querySelector('.rv-title').textContent, $$('stLog').textContent, $$('streamLog').querySelector('.rv-year').textContent], ['2026 年直播回顧', '年度直播回顧', '2026 年']);
      check('年度回顧：統計（場數、天數、總時數、最常直播的分類）', [...$$('streamLog').querySelectorAll('.rv-stat')].map((s) => s.querySelector('.rv-lbl').textContent + '=' + s.querySelector('.rv-num').textContent), ['直播場數=3 場', '直播天數=2 天', '總時數=5 小時 8 分', '最常直播=Elden Ring']);
      check('年度回顧：整年熱度圖（365 格；3/5 有 2 場、10/24 有 1 場）', [$$('streamLog').querySelectorAll('.rv-day').length, $$('streamLog').querySelectorAll('.rv-day.on').length, $$('streamLog').querySelectorAll('.rv-day.on2').length], [365, 2, 1]);
      check('年度回顧：月份依序展開、只列有直播的月份（3 月、10 月），摘要含場數與時長', [...$$('streamLog').querySelectorAll('.log-month')].map((s) => s.textContent), ['3 月　·　2 場　·　2 小時', '10 月　·　1 場　·　3 小時 8 分']);
      check('年度回顧：同月份內依時間由早到晚', [...$$('streamLog').querySelectorAll('.rv-month')[0].querySelectorAll('.log-title')].map((x) => x.textContent), ['三月的台', '同一天第二場']);
      check('年度回顧：不在輸出圖裡的東西（年份切換列、編輯鈕）有標記', [$$('streamLog').querySelector('.rv-nav').dataset.html2canvasIgnore, [...$$('streamLog').querySelectorAll('.log-actions')].every((a) => a.dataset.html2canvasIgnore === 'true')], ['true', true]);
      $$('streamLog').querySelector('.rv-month').open = false; $$('streamLog').querySelector('.rv-month').dispatchEvent(new Event('toggle'));
      check('收合月份會記住（重畫後還是收合）', (renderStreamLog(), $$('streamLog').querySelector('.rv-month').open), false);
      { // v0.56：年度回顧的社群小貼紙、直播紀錄加進私人／直播行程
        const keepView56 = reviewView, keepYear56 = reviewYear, keepS = { ...streamSettings }, keepLog3 = streamLog, keepEv = events, keepSt = streamEvents, keepCats = categories;
        Object.assign(streamSettings, { socTwitch: 'twitch.tv/abc', socX: '@abc', socXShow: false, rvSocials: false });
        reviewView = 'month'; renderStreamLog();
        check('回顧社群小貼紙：沒勾選就不顯示', document.querySelectorAll('#streamLog .rv-socials').length, 0);
        ssSet('rvSocials', true); renderStreamLog();
        check('回顧社群小貼紙：勾選後在圖上顯示（只列有填帳號、沒被取消勾選的平台）', [...document.querySelectorAll('#streamLog .rv-socials .sc-pill')].map((x) => x.textContent), ['🎮 twitch.tv/abc']);
        reviewView = 'list'; streamLog = Array.from({ length: 12 }, (_, i) => ({ id: 'sp' + i, source: 'manual', startedAt: new Date(2026, i, 5, 20).toISOString(), title: 't' + i, game: 'G', durationSec: 0, url: '', hasThumb: false, edited: true })); reviewYear = 2026; renderStreamLog();
        { const st = stageCopy($$('streamLog')), pages = splitReviewPages(st.copy);
          check('清單分頁：社群小貼紙只在最後一頁', [pages.map((p) => !!p.querySelector('.rv-socials')), pages.length > 1], [pages.map((_, i) => i === pages.length - 1), true]); st.stage.remove(); }
        setStreamMode('log'); buildStreamSettings(); reviewView = 'month'; buildStreamSettings();
        check('回顧版面設定有「社群小貼紙」勾選', [...$$('ssBody').querySelectorAll('label.check-line')].some((l) => l.textContent.includes('社群小貼紙')), true);
        // 加進行事曆
        if (!categories.some((c) => c.id === 'cat_live')) categories = [...categories, clone(DEFAULT_CATEGORIES.find((c) => c.id === 'cat_live'))];
        events = []; streamEvents = []; streamLog = [];
        $$('stLogAdd').click(); $$('logDate').value = '2026-10-24'; $$('logTime').value = '23:00'; $$('logTitle').value = '【FF14｜雜談】深夜場'; $$('logDur').value = '2:30:00';
        $$('logToMain').checked = true; $$('logToStream').checked = true; await saveLogEdit();
        const le = streamLog[0], pe = events[0], se = streamEvents[0];
        check('加進行事曆：私人與直播行程各一筆、標題照原本輸入、套實況類別', [events.length, streamEvents.length, pe.title, se.title, pe.category, se.category, pe.color1], [1, 1, '【FF14｜雜談】深夜場', '【FF14｜雜談】深夜場', 'cat_live', 'cat_live', '#b58ae8']);
        check('加進行事曆：時間（跨午夜時結束日隔天）', [pe.start, pe.startTime, pe.end, pe.endTime], ['2026-10-24', '23:00', '2026-10-25', '01:30']);
        check('加進行事曆：紀錄記下對應的行程編號', [le.mainEventId === pe.id, le.streamEventId === se.id], [true, true]);
        openLogEdit(le.id);
        check('再開紀錄：已加入的打勾、有提示', [$$('logToMain').checked, $$('logToStream').checked, $$('logToMainNote').textContent.includes('已加入')], [true, true, true]);
        $$('logTitle').value = '改過的標題'; $$('logTime').value = '20:00'; await saveLogEdit();
        check('再存一次：更新同一筆、不會重複新增', [events.length, streamEvents.length, events[0].title, events[0].startTime, events[0].endTime, events[0].end], [1, 1, '改過的標題', '20:00', '22:30', '2026-10-24']);
        openLogEdit(le.id); $$('logToMain').checked = false; $$('logToStream').checked = false; $$('logTitle').value = '只改紀錄'; await saveLogEdit();
        check('取消勾選：不會刪掉已加入的行程、也不再更新', [events.length, events[0].title], [1, '改過的標題']);
        $$('stLogAdd').click(); $$('logTitle').value = '沒勾的'; await saveLogEdit();
        check('沒勾選就只存紀錄', [streamLog.length, events.length, streamEvents.length], [2, 1, 1]);
        streamSettings = keepS; saveStreamSettings(); streamLog = keepLog3; events = keepEv; streamEvents = keepSt; categories = keepCats; saveEvents(); saveStreamEvents(); saveStreamLog(); setStreamMode('log'); reviewView = keepView56; reviewYear = keepYear56; renderStreamLog(); }
      { // v0.57：批次把直播紀錄加進行事曆、之後自動加入
        const keepView57 = reviewView, keepYear57 = reviewYear, keepLog = streamLog, keepEv = events, keepSt = streamEvents, keepCats = categories, keepAuto = { ...logAuto }, keepCfg = twitchCfg, keepF = window.fetch;
        if (!categories.some((c) => c.id === 'cat_live')) categories = [...categories, clone(DEFAULT_CATEGORIES.find((c) => c.id === 'cat_live'))];
        events = []; streamEvents = []; logAuto = { main: false, stream: false };
        const entry = (id, ds, title, extra) => ({ id, source: 'manual', startedAt: new Date(`${ds}T20:00:00`).toISOString(), title, game: 'G', durationSec: 3600, url: '', hasThumb: false, edited: true, ...extra });
        streamLog = [entry('b1', '2026-03-01', '三月場'), entry('b2', '2026-04-02', '四月場'), entry('b3', '2026-05-03', '直播中', { live: true, durationSec: 0 }), entry('b4', '2025-12-30', '去年場')];
        reviewYear = 2026; setStreamMode('log'); reviewView = 'list'; renderStreamLog();
        check('批次加入：工具列有鈕', [$$('stLogToCal').hidden], [false]);
        openLogBatch();
        check('批次加入：預設這一年、兩邊都勾；直播中的不算（2 筆）', [$$('lbScope').value, $$('lbMain').checked, $$('lbStream').checked, $$('lbCount').textContent.includes('選到 2 筆'), $$('lbCount').textContent.includes('私人行程 2 筆、直播行程 2 筆')], ['year', true, true, true, true]);
        $$('lbScope').value = 'all'; updateLogBatch();
        check('批次加入：選「全部」會多算去年的', $$('lbCount').textContent.includes('私人行程 3 筆、直播行程 3 筆'), true);
        $$('lbScope').value = 'year'; $$('lbStream').checked = false; updateLogBatch();
        check('批次加入：只勾私人行程時直播行程算 0', $$('lbCount').textContent.includes('私人行程 2 筆、直播行程 0 筆'), true);
        $$('lbStream').checked = true; updateLogBatch(); doLogBatch();
        check('批次加入：兩邊各 2 筆、標題照原樣、套實況類別、直播中的略過', [events.map((e) => e.title), streamEvents.length, events.every((e) => e.category === 'cat_live'), streamLog.find((e) => e.id === 'b3').mainEventId, streamLog.find((e) => e.id === 'b4').mainEventId], [['三月場', '四月場'], 2, true, undefined, undefined]);
        check('批次加入：時間取自開播時間與時長', [events[0].start, events[0].startTime, events[0].endTime], ['2026-03-01', '20:00', '21:00']);
        events[0].title = '我自己改過的'; openLogBatch(); $$('lbScope').value = 'all'; updateLogBatch();
        check('批次加入：再開一次，已加過的不重算（只剩去年那筆）', $$('lbCount').textContent.includes('私人行程 1 筆、直播行程 1 筆'), true);
        doLogBatch();
        check('批次加入：不會動到已加入、被你改過的行程', [events.map((e) => e.title), events.length, streamEvents.length], [['我自己改過的', '四月場', '去年場'], 3, 3]);
        openLogBatch(); check('全部加完：加入鈕停用', $$('btnLbDo').disabled, true); closeModal('logBatchModal');
        // 實況類別被使用者刪掉重建（編號不同）、或乾脆沒有：仍要套到顏色標籤；已加過但沒類別的可以補
        categories = categories.filter((c) => c.id !== 'cat_live').concat([{ id: 'my_live', name: '實況', mode: 'solid', c1: '#123456', c2: '#654321', tag: '實況' }]);
        streamLog.push(entry('b5', '2026-06-01', '六月場'));
        openLogBatch(); $$('lbScope').value = 'year'; updateLogBatch(); doLogBatch();
        check('實況類別編號不同（自己重建的）：用名稱找到、套上它的顏色', [events.find((e) => e.title === '六月場').category, events.find((e) => e.title === '六月場').color1], ['my_live', '#123456']);
        categories = categories.filter((c) => c.id !== 'my_live'); streamLog.push(entry('b6', '2026-07-01', '七月場'));
        openLogBatch(); $$('lbScope').value = 'year'; updateLogBatch(); doLogBatch();
        check('完全沒有實況類別：補回預設的實況類別並套上', [categories.some((c) => c.id === 'cat_live'), events.find((e) => e.title === '七月場').category, streamEvents.find((e) => e.title === '七月場').color1], [true, 'cat_live', '#b58ae8']);
        const ev1 = () => events.find((e) => e.id === streamLog.find((l) => l.id === 'b1').mainEventId);
        ev1().category = ''; ev1().color1 = '#000000';
        openLogBatch(); $$('lbScope').value = 'year'; updateLogBatch();
        check('已加過但沒有類別：計數提示會補類別', $$('lbCount').textContent.includes('幫已加過的 1 筆補上實況類別'), true);
        doLogBatch();
        check('補上類別：套上實況類別與顏色，標題不動', [ev1().category, ev1().color1, ev1().title], ['cat_live', '#b58ae8', '我自己改過的']);
        // 自動加入
        openLogBatch(); $$('lbMain').checked = true; $$('lbStream').checked = false; $$('lbAuto').checked = true; $$('lbScope').value = 'all'; updateLogBatch(); doLogBatch();
        check('勾「之後也自動加入」：設定存起來', [logAuto, load(KEY.logAuto, null)], [{ main: true, stream: false }, { main: true, stream: false }]);
        const jf = (d) => new Response(JSON.stringify({ data: d }), { status: 200 });
        window.fetch = async (url) => { const u = String(url); if (u.includes('/helix/users')) return jf([{ id: 'u1' }]); if (u.includes('/helix/streams')) return jf([]); if (u.includes('/helix/videos')) return jf([{ id: 'vz1', stream_id: 'sz1', title: '【Elden Ring】自動加入', created_at: '2026-10-27T12:00:00Z', url: 'u', duration: '1h', thumbnail_url: '' }]); return new Response('', { status: 404 }); };
        twitchCfg = { login: 'me', clientId: 'c', token: 't', userId: '' }; await syncTwitchLog(true);
        check('同步到新紀錄：自動加進私人行程（直播行程沒勾就不加）', [events.some((e) => e.title === '【Elden Ring】自動加入'), streamEvents.some((e) => e.title === '【Elden Ring】自動加入')], [true, false]);
        $$('stLogAdd').click();
        check('自動加入開著：新增紀錄時預設勾選', [$$('logToMain').checked, $$('logToStream').checked], [true, false]); closeModal('logModal');
        window.fetch = keepF; twitchCfg = keepCfg; saveTwitchCfg(); logAuto = keepAuto; save(KEY.logAuto, logAuto);
        streamLog = keepLog; events = keepEv; streamEvents = keepSt; categories = keepCats; saveEvents(); saveStreamEvents(); saveStreamLog(); reviewView = keepView57; reviewYear = keepYear57; renderStreamLog(); }
      { // v0.55：輸出尺寸上限、清單依月份分頁、縮圖不拉長
        check('輸出尺寸上限：長邊 ≤1920、短邊 ≤1080（橫直都適用）、小圖最多放大 2 倍', [outScale(1000, 600), outScale(1000, 1500), outScale(1600, 400), outScale(400, 300)].map((s) => Math.round(s * 1000) / 1000), [1.8, 1.08, 1.2, 2]);
        const keepH2c = window.html2canvas, keepDl = window.download, keepLog2 = streamLog, keepYear = reviewYear, keepView = reviewView, shots = [], names = [];
        window.html2canvas = async (node, opt) => { shots.push({ months: [...node.querySelectorAll('.rv-month > summary')].map((s) => Number(s.textContent.split(' ')[0])), h: node.getBoundingClientRect().height, hasStats: !!node.querySelector('.rv-stats'), title: !!node.querySelector('.rv-title'), scale: opt.scale, w: opt.width, oh: opt.height }); return Object.assign(document.createElement('canvas'), { width: 4, height: 4 }); };
        window.download = (b, n) => names.push(n);
        streamLog = Array.from({ length: 36 }, (_, i) => ({ id: 'pg' + i, source: 'manual', startedAt: new Date(2026, Math.floor(i / 3), 5 + (i % 3), 20).toISOString(), title: '台' + i, game: 'G', durationSec: 3600, url: '', hasThumb: false, edited: true }));
        reviewYear = 2026; reviewView = 'list'; renderStreamLog();
        takeStreamScreenshot(); await waitUntil(() => names.length >= 2 && names.length === shots.length && shots.length > 0, 8000); await new Promise((r) => setTimeout(r, 300));
        check('清單截圖：切成多張、檔名加序號', [shots.length > 1, names.every((n, i) => n === `stream_review_2026_${i + 1}.png`), names.length === shots.length], [true, true, true]);
        check('清單截圖：十二個月依序各出現一次、不會切在月份中間', shots.flatMap((s) => s.months), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
        check('清單截圖：每張都有標題，只有第一張帶統計；多月份的頁高度不超過 1080', [shots.every((s) => s.title), shots.map((s) => s.hasStats), shots.every((s) => s.months.length < 2 || s.h <= 1080)], [true, shots.map((_, i) => i === 0), true]);
        check('清單截圖：每張輸出尺寸都在 1920×1080 以內', shots.every((s) => Math.max(s.w, s.oh) * s.scale <= 1920.5 && Math.min(s.w, s.oh) * s.scale <= 1080.5), true);
        window.html2canvas = keepH2c; window.download = keepDl; streamLog = keepLog2; reviewYear = keepYear; reviewView = keepView; renderStreamLog();
        const cellImg = document.querySelector('#streamLog .rv-img'); check('縮圖用背景圖置中裁切（不拉長）', cellImg ? getComputedStyle(cellImg).backgroundSize : 'cover', 'cover'); }
      { // 截圖：收合的月份在輸出圖裡一律展開（畫面上維持收合）
        const keepH2c = window.html2canvas, seen = [];
        window.html2canvas = async (node) => { seen.push(node.querySelectorAll('details:not([open])').length); return Object.assign(document.createElement('canvas'), { width: 4, height: 4 }); };
        const keepDl = window.download; window.download = () => {};
        const first = $$('streamLog').querySelector('.rv-month'); first.open = false;
        capture('streamLog', 'x.png'); await waitUntil(() => seen.length);
        check('截圖：收合的月份輸出時展開、畫面上仍維持收合', [seen[0], first.open], [0, false]);
        window.html2canvas = keepH2c; window.download = keepDl; first.open = true; }
      [...$$('streamLog').querySelectorAll('.rv-nav .color-tab')].find((b) => b.textContent === '全部展開').click();
      check('全部展開', [...$$('streamLog').querySelectorAll('.rv-month')].every((d) => d.open), true);
      [...$$('streamLog').querySelectorAll('.rv-nav .color-tab')].find((b) => b.textContent === '全部收合').click();
      check('全部收合', [...$$('streamLog').querySelectorAll('.rv-month')].every((d) => !d.open), true);
      [...$$('streamLog').querySelectorAll('.rv-nav .color-tab')].find((b) => b.textContent === '全部展開').click();
      $$('streamLog').querySelectorAll('.rv-nav .year-nav-btn')[0].click();
      check('切到上一年（2025）：只列那一年的紀錄', [$$('streamLog').querySelector('.rv-title').textContent, [...$$('streamLog').querySelectorAll('.log-title')].map((x) => x.textContent), $$('streamLog').querySelectorAll('.rv-day.on').length], ['2025 年直播回顧', ['去年最後一場'], 1]);
      $$('streamLog').querySelectorAll('.rv-nav .year-nav-btn')[0].click();
      check('沒有紀錄的年份：顯示提示、不出現統計', [$$('streamLog').textContent.includes('2024 年還沒有直播紀錄'), $$('streamLog').querySelectorAll('.rv-stat').length], [true, 0]);
      reviewYear = 2026; renderStreamLog();
      // 年曆（12 個月）與月曆：有開台的日子放當天的截圖
      reviewView = 'year'; reviewYear = 2026; reviewMonth = null; renderStreamLog(); await new Promise((r) => setTimeout(r, 150));
      check('年曆：12 個月曆、每月 7 欄星期標題，月份標題含場數', [$$('streamLog').querySelectorAll('.rv-mcard').length, $$('streamLog').querySelectorAll('.rv-mcard')[0].querySelectorAll('.rv-dow').length, $$('streamLog').querySelectorAll('.rv-mtitle')[2].textContent, $$('streamLog').querySelectorAll('.rv-mtitle')[0].textContent], [12, 7, '3 月　·　2 場', '1 月']);
      check('年曆：有開台的日子上色（3/5、10/24），其他天不上色；同一天兩場標 ×2', [$$('streamLog').querySelectorAll('.rv-cell.has').length, [...$$('streamLog').querySelectorAll('.rv-cell.has')].map((c) => c.dataset.date), $$('streamLog').querySelector('.rv-cell[data-date="2026-03-05"] .rv-x').textContent, !!$$('streamLog').querySelector('.rv-cell[data-date="2026-10-24"] .rv-x')], [2, ['2026-03-05', '2026-10-24'], '×2', false]);
      check('年曆：10 月 24 日那格鋪了當天的截圖', [!!$$('streamLog').querySelector('.rv-cell[data-date="2026-10-24"] .rv-img') && $$('streamLog').querySelector('.rv-cell[data-date="2026-10-24"] .rv-img').hidden === false, $$('streamLog').querySelector('.rv-cell[data-date="2026-10-24"]').classList.contains('shot')], [true, true]);
      check('年曆：每月天數正確（2 月 28 格、10 月 31 格）', [$$('streamLog').querySelectorAll('.rv-mcard')[1].querySelectorAll('.rv-cell').length, $$('streamLog').querySelectorAll('.rv-mcard')[9].querySelectorAll('.rv-cell').length], [28, 31]);
      check('年曆：10/1 排在正確的星期欄（跟週首設定一致）', [...$$('streamLog').querySelectorAll('.rv-mcard')[9].querySelector('.rv-cal').children].findIndex((c) => c.dataset && c.dataset.date === '2026-10-01') - 7, (new Date(2026, 9, 1).getDay() - weekStart + 7) % 7);
      check('年曆：版面頁籤（年曆／月曆／清單）、不在輸出圖裡的操作列有標記', [[...$$('streamLog').querySelectorAll('.rv-nav .fd-mode-tab')].map((b) => b.textContent), $$('streamLog').querySelector('.rv-nav .fd-mode-tab.active').textContent, $$('streamLog').querySelector('.rv-nav').dataset.html2canvasIgnore], [['年曆', '月曆', '清單'], '年曆', 'true']);
      $$('streamLog').querySelectorAll('.rv-mtitle')[9].click(); await new Promise((r) => setTimeout(r, 150));
      check('點月份標題 → 進那個月的大月曆；標題、統計只算這個月', [reviewView, reviewMonth, $$('streamLog').querySelector('.rv-title').textContent, $$('streamLog').querySelector('.rv-year').textContent, [...$$('streamLog').querySelectorAll('.rv-num')].map((x) => x.textContent).slice(0, 2)], ['month', 10, '2026 年 10 月直播回顧', '2026 年 10 月', ['1 場', '1 天']]);
      { const cell = $$('streamLog').querySelector('.rv-cell[data-date="2026-10-24"]');
        check('月曆：有開台的那天有截圖與標題條，其他天只有數字', [!!cell.querySelector('.rv-img'), cell.querySelector('.rv-cap').textContent, $$('streamLog').querySelectorAll('.rv-cap').length, $$('streamLog').querySelector('.rv-cal').classList.contains('big')], [true, '深夜雜談', 1, true]); }
      check('月曆：一格有直播的日子可點，開編輯視窗', (() => { $$('streamLog').querySelector('.rv-cell[data-date="2026-10-24"]').click(); const open = isModalOpen('logModal'); closeModal('logModal'); return open; })(), true);
      $$('streamLog').querySelectorAll('.rv-nav .year-nav-btn')[1].click();
      check('月曆：→ 下個月（10 月 → 11 月）', [reviewMonth, reviewYear], [11, 2026]);
      reviewMonth = 12; renderStreamLog(); $$('streamLog').querySelectorAll('.rv-nav .year-nav-btn')[1].click();
      check('月曆：12 月再 → 會跨到隔年 1 月', [reviewMonth, reviewYear], [1, 2027]);
      reviewYear = 2026; reviewMonth = 3; renderStreamLog();
      check('3 月大月曆：同一天兩場標 ×2、標題條用第一場', [$$('streamLog').querySelector('.rv-cell[data-date="2026-03-05"] .rv-x').textContent, $$('streamLog').querySelector('.rv-cell[data-date="2026-03-05"] .rv-cap').textContent], ['×2', '三月的台']);
      reviewMonth = 10; renderStreamLog();
      let shot2 = null; const keepCap2 = window.capture; window.capture = (id, name) => { shot2 = [id, name]; };
      takeScreenshot(); await new Promise((r) => setTimeout(r, 50));
      check('月曆版面按 📷：檔名帶月份', shot2, ['streamLog', 'stream_review_2026-10.png']);
      reviewView = 'year'; renderStreamLog(); shot2 = null; takeScreenshot(); await new Promise((r) => setTimeout(r, 50)); window.capture = keepCap2;
      check('年曆版面按 📷：檔名只有年份', shot2, ['streamLog', 'stream_review_2026.png']);
      reviewView = 'list'; reviewMonth = null; renderStreamLog();
      // 📷 截圖：輸出這一塊，等截圖載入後才拍
      let shot = null; const keepCap = window.capture; window.capture = (id, name) => { shot = [id, name]; };
      takeScreenshot(); await new Promise((r) => setTimeout(r, 50)); window.capture = keepCap;
      check('紀錄頁按 📷：輸出年度直播回顧那張圖（檔名含年份）', shot, ['streamLog', 'stream_review_2026.png']);
      setCalWidth(1000); check('回顧頁寬度跟著日曆寬度（寬度滑桿）、套用背景', [$$('streamLog').offsetWidth, $$('streamLog').style.backgroundImage !== '' || $$('streamLog').style.backgroundColor !== ''], [1000, true]); setCalWidth(1200);
      streamLog = keepReview; saveStreamLog(); reviewYear = null; renderStreamLog(); }
    // 編輯與刪除
    openLogEdit(e1.id);
    check('編輯視窗：帶入原本的內容、有刪除鈕', [$$('logTitle').value, [...document.querySelectorAll('#logGameChips .tag-chip')].map((c) => c.firstChild.textContent).join('、'), $$('logDur').value, $$('btnDeleteLog').hidden], ['深夜雜談', 'Just Chatting', '3:08:00', false]);
    await new Promise((r) => setTimeout(r, 200));
    check('編輯視窗：顯示目前的截圖與「移除截圖」', [$$('logShotPrev').hidden, $$('logShotClear').hidden], [false, false]);
    $$('logTitle').value = '改過的標題'; logShotCleared = true; await saveLogEdit();
    check('編輯：改標題、移除截圖（IndexedDB 也清掉）', [streamLog[0].title, streamLog[0].hasThumb, await thumbGet(e1.id)], ['改過的標題', false, undefined]);
    // 匯出入
    let exported = null; const keepDownload = window.download; window.download = (b) => { exported = b; };
    await exportStreamLog(); window.download = keepDownload;
    const exp = JSON.parse(await exported.text());
    check('匯出：格式與筆數', [exp.app, exp.version, exp.entries.length, exp.entries[0].title], ['tw-calendar-streamlog', 1, 1, '改過的標題']);
    streamLog = []; saveStreamLog();
    await importStreamLog(new File([JSON.stringify(exp)], 'x.json'));
    check('匯入：還原紀錄', [streamLog.length, streamLog[0].title], [1, '改過的標題']);
    await importStreamLog(new File([JSON.stringify(exp)], 'x.json'));
    check('匯入：已有的略過、不重複', streamLog.length, 1);
    await importStreamLog(new File(['{"x":1}'], 'bad.json'));
    check('匯入：格式不對不會動到資料', streamLog.length, 1);
    // 刪除
    const ask = window.confirm; window.confirm = () => true; openLogEdit(streamLog[0].id); await deleteLogEntry(); window.confirm = ask;
    check('刪除紀錄', [streamLog.length, document.querySelectorAll('.log-card').length], [0, 0]);
    // Twitch 同步（用假的 fetch 回應）
    const calls = [];
    const jpg = await new Promise((r) => { const c = document.createElement('canvas'); c.width = 160; c.height = 90; c.toBlob(r, 'image/jpeg'); });
    window.fetch = async (url, opt) => {
      calls.push([String(url), opt && opt.headers]);
      const u = String(url), json = (data, status = 200) => new Response(JSON.stringify({ data }), { status, headers: { 'Content-Type': 'application/json' } });
      if (u.includes('/helix/users')) return json([{ id: '777', login: 'me' }]);
      if (u.includes('/helix/streams')) return json([{ id: 's-live', game_name: 'Elden Ring', title: '現在直播中', started_at: '2026-10-26T12:00:00Z', thumbnail_url: 'https://static-cdn.jtvnw.net/previews-ttv/live_user_me-{width}x{height}.jpg' }]);
      if (u.includes('/helix/videos')) return json([
        { id: 'v1', stream_id: 's-old', title: '上週的台', created_at: '2026-10-20T12:30:00Z', url: 'https://www.twitch.tv/videos/v1', duration: '3h8m33s', thumbnail_url: 'https://static-cdn.jtvnw.net/cf_vods/x/thumb/thumb0-%{width}x%{height}.jpg' },
        { id: 'v2', stream_id: 's-live', title: '現在直播中', created_at: '2026-10-26T12:00:00Z', url: 'https://www.twitch.tv/videos/v2', duration: '0h20m5s', thumbnail_url: '' },
      ]);
      if (u.includes('static-cdn.jtvnw.net')) return new Response(jpg, { status: 200 });
      return new Response('', { status: 404 });
    };
    const toastsA = []; const keepToastA = window.toast; window.toast = (m) => toastsA.push(m);
    await syncTwitchLog(); window.toast = keepToastA;
    check('沒填憑證：不會呼叫 Twitch，改開設定視窗，並說缺哪幾項', [calls.length, isModalOpen('twitchModal'), toastsA.some((m) => m.includes('缺 帳號、Client ID、存取憑證'))], [0, true, true]); closeModal('twitchModal');
    twitchCfg = { login: 'Me', clientId: 'cid', token: 'tok', userId: '' }; saveTwitchCfg();
    await syncTwitchLog();
    check('同步：帶 Client-Id 與 Bearer 憑證，帳號轉小寫查詢', [calls[0][1]['Client-Id'], calls[0][1].Authorization, calls[0][0].includes('login=me'), twitchCfg.userId], ['cid', 'Bearer tok', true, '777']);
    check('同步：直播中 ＋ VOD 依 stream_id 合併成 2 筆（直播中的那場帶有分類，不重複）', [streamLog.length, streamLog.filter((e) => e.streamId === 's-live').length], [2, 1]);
    const live = streamLog.find((e) => e.streamId === 's-live'), old = streamLog.find((e) => e.streamId === 's-old');
    check('直播中那場：標題、分類（Elden Ring）、VOD 連結與時長補上，不再標示直播中', [live.title, live.game, live.url, live.durationSec, live.live], ['現在直播中', 'Elden Ring', 'https://www.twitch.tv/videos/v2', 1205, false]);
    check('舊 VOD：時間、標題、時長、連結（VOD 不含分類，留空可手動補）', [old.title, old.game, old.durationSec, old.url, old.startedAt], ['上週的台', '', 11313, 'https://www.twitch.tv/videos/v1', '2026-10-20T12:30:00Z']);
    check('截圖：兩場都抓進來存成圖片（樣板網址換成 640×360）', [live.hasThumb, old.hasThumb, calls.some((c) => c[0].includes('previews-ttv/live_user_me-640x360.jpg')), calls.some((c) => c[0].includes('thumb0-640x360.jpg'))], [true, true, true, true]);
    check('同步：記下上次同步時間', !!twitchCfg.lastSync, true);
    live.edited = true; live.title = '我自己改的標題'; live.game = '我自己填的分類'; saveStreamLog();
    const nBefore = streamLog.length;
    await syncTwitchLog();
    check('再同步一次：不會多出重複紀錄；自己改過的標題與分類不會被蓋掉', [streamLog.length, live.title, live.game], [nBefore, '我自己改的標題', '我自己填的分類']);
    window.fetch = async () => new Response('', { status: 401 });
    const toasts = []; const keepToast = window.toast; window.toast = (m) => toasts.push(m);
    await syncTwitchLog(); window.toast = keepToast;
    check('憑證過期（401）：提示更新憑證、紀錄不受影響', [toasts.some((m) => m.includes('401') && m.includes('重新填')), streamLog.length], [true, nBefore]);
    window.fetch = keepFetch;
    // 年度回顧的版面設定（年曆／月曆）：色系、背景圖、文字、版面；清單只供觀看
    { const keepRv = RV_KEYS.map((k) => streamSettings[k]), box = $$('streamLog'), cp = (n) => getComputedStyle(box).getPropertyValue(n).trim();
      streamLog = [{ id: 'rv1', source: 'manual', startedAt: new Date('2026-03-05T21:00:00').toISOString(), title: '【Elden Ring】三月的台', game: '', durationSec: 3600, url: '', hasThumb: false }];
      reviewView = 'year'; reviewYear = 2026; reviewMonth = null; renderStreamLog(); buildStreamSettings();
      const sec = (t) => [...document.querySelectorAll('#ssBody details.ss-sec')].find((d) => d.querySelector('summary').textContent.includes(t));
      check('年度回顧的設定面板：標題、區段（色系／背景圖／文字／版面），沒有「清空直播行程」', [$$('spHead').querySelector('strong').textContent, [...document.querySelectorAll('#ssBody > details > summary')].map((s) => s.textContent.trim().replace(/^\S+\s*/, '')), $$('spFoot').hidden], ['⚙ 年度回顧版面設定', ['色系', '背景圖', '文字', '版面'], true]);
      check('預設不自訂：沒有任何 rv 設定被套用、副標題不顯示（沒有 Weekly Schedule 之類的字）', [RV_KEYS.every((k) => streamSettings[k] === STREAM_DEFAULTS[k]), !!box.querySelector('.rv-sub'), box.style.getPropertyValue('--cal-title')], [true, false, '']);
      ssSet('rvSub', 'Senka* Weekly Schedule'); ssSet('rvTitle', '我的 2026 直播');
      check('可以自訂標題與副標題（副標題留空才不顯示）', [box.querySelector('.rv-title').textContent, box.querySelector('.rv-sub').textContent], ['我的 2026 直播', 'Senka* Weekly Schedule']);
      ssSet('rvSub', ''); ssSet('rvTitle', '');
      check('標題回到預設、副標題消失', [box.querySelector('.rv-title').textContent, !!box.querySelector('.rv-sub')], ['2026 年直播回顧', false]);
      applyReviewPreset(RV_PRESETS.find((p) => p.name === '海藍'));
      check('套用色系「海藍」：背景漸層、文字、卡片、強調色寫進回顧圖', [streamSettings.rvBg1, box.style.backgroundImage.includes('linear-gradient'), cp('--cal-title'), cp('--theme-dark')], ['#e3f0ff', true, '#22344f', '#2f6bb5']);
      check('回顧圖的字色真的變了（標題、統計）', [getComputedStyle(box.querySelector('.rv-title')).color, getComputedStyle(box.querySelector('.rv-num')).color], ['rgb(34, 52, 79)', 'rgb(34, 52, 79)']);
      check('強調色套在有開台的日子上', getComputedStyle(box.querySelector('.rv-cell.has')).backgroundColor, 'rgb(47, 107, 181)');
      applyReviewPreset(RV_PRESETS[0]);
      check('色系選「跟隨一般背景」：全部清掉（沒有任何行內覆寫）', [streamSettings.rvBg1, streamSettings.rvText, box.style.getPropertyValue('--cal-title')], ['', '', '']);
      streamSettings.rvBgImage = tiny; streamSettings.rvBg1 = '#ffffff'; streamSettings.rvBgFade = 40; saveStreamSettings(); renderStreamLog();
      check('背景圖：蓋一層背景色（淡化 40%）再疊圖，整張鋪滿', [box.style.backgroundImage.includes('url('), box.style.backgroundImage.includes('rgba(255,255,255,0.4)') || box.style.backgroundImage.replace(/ /g, '').includes('rgba(255,255,255,0.4)'), box.style.backgroundSize], [true, true, 'auto, cover']);
      buildStreamSettings();
      check('背景圖區段：有選圖、淡化滑桿、可「使用直播專用背景圖」', [!!sec('背景圖').querySelector('.ss-thumb'), !!sec('背景圖').querySelector('input[type=range]'), [...sec('背景圖').querySelectorAll('button')].some((b) => b.textContent.includes('使用直播專用背景圖'))], [true, true, true]);
      streamSettings.rvBgImage = ''; streamSettings.rvBg1 = ''; saveStreamSettings();
      ssSet('rvStats', false);
      check('關掉統計：上方四格消失', box.querySelectorAll('.rv-stat').length, 0); ssSet('rvStats', true);
      ssSet('rvCols', '2'); check('年曆一列放 2 個月', getComputedStyle(box.querySelector('.rv-months')).gridTemplateColumns.split(' ').length, 2);
      ssSet('rvCols', '4'); check('年曆一列放 4 個月', getComputedStyle(box.querySelector('.rv-months')).gridTemplateColumns.split(' ').length, 4); ssSet('rvCols', '3');
      ssSet('font', 'google'); ssSet('fontName', 'Noto Sans JP');
      check('字型也套到回顧圖', getComputedStyle(box).fontFamily.includes('Noto Sans JP'), true); ssSet('font', 'default'); ssSet('fontName', '');
      reviewView = 'list'; renderStreamLog();
      check('清單版面只供觀看：沒有設定面板、版面設定鈕收起', [$$('streamPanel').hidden, $$('stSettings').hidden], [true, true]);
      reviewView = 'month'; renderStreamLog();
      check('月曆版面也有設定面板', [$$('streamPanel').hidden, $$('stSettings').hidden], [false, false]);
      const askR = window.confirm; window.confirm = () => true; streamSettings.title = '保留的標題'; ssSet('rvText', '#123456'); resetStreamSettings(); window.confirm = askR;
      check('年度回顧的「還原預設」只還原回顧的設定（直播行程的標題不受影響）', [streamSettings.rvText, streamSettings.title], ['', '保留的標題']); streamSettings.title = '';
      setStreamMode('week');
      check('離開年度回顧：設定面板換回直播行程版（標題、清空鈕回來）', [$$('spHead').querySelector('strong').textContent, $$('spFoot').hidden, [...document.querySelectorAll('#ssBody > details > summary')].length > 4], ['⚙ 直播行程版面設定', false, true]);
      setStreamMode('log'); reviewView = 'list';
      RV_KEYS.forEach((k, i) => { streamSettings[k] = keepRv[i]; }); saveStreamSettings(); }
    // v0.51：分類 tag（點過去填過的、手打、移除）；備份鈕依畫面決定
    { // 匯入備份檔（改成 async／file.text() 後行為不變）
      const keepEv = events, keepConfirm = window.confirm, keepToast = window.toast, msgs = []; window.confirm = () => true; window.toast = (m) => msgs.push(m);
      const fake = { target: { files: [new File([JSON.stringify({ events: [{ id: 'i1', title: '匯入的', start: '2026-10-05', end: '2026-10-05' }, { title: '壞的' }] })], 'b.json')], value: 'x' } };
      await importEvents(fake);
      check('匯入備份：留下格式正確的、略過壞的、提示筆數', [events.map((x) => x.title), fake.target.value, msgs.some((m) => m.includes('已匯入（1 筆）') && m.includes('略過 1 筆'))], [['匯入的'], '', true]);
      await importEvents({ target: { files: [new File(['不是json'], 'x.json')], value: '' } });
      check('匯入備份：壞檔不動現有資料、提示讀取失敗', [events.length, msgs.some((m) => m.startsWith('讀取失敗'))], [1, true]);
      events = keepEv; saveEvents(); window.confirm = keepConfirm; window.toast = keepToast;
    }
    {
      const savedLog = streamLog;
      streamLog = [{ id: 'p1', source: 'manual', startedAt: '2026-10-20T12:00:00Z', title: 'x', game: 'FF14、Elden Ring', durationSec: 0, url: '', hasThumb: false, edited: true },
        { id: 'p2', source: 'manual', startedAt: '2026-10-21T12:00:00Z', title: 'y', game: 'FF14', durationSec: 0, url: '', hasThumb: false, edited: true }];
      $$('stLogAdd').click(); $$('logTitle').value = '【Might & Mushroom】測試'; renderLogGames();
      const sugg = () => [...document.querySelectorAll('#logGameSuggest .tag-sugg')].map((b) => b.textContent);
      check('分類建議：標題的【】優先，其後依過去填的次數排序', sugg(), ['＋ Might & Mushroom', '＋ FF14', '＋ Elden Ring']);
      document.querySelectorAll('#logGameSuggest .tag-sugg')[1].click();
      check('點建議：加成 tag、從建議消失', [logGames, sugg()], [['FF14'], ['＋ Might & Mushroom', '＋ Elden Ring']]);
      $$('logGame').value = 'elden'; $$('logGame').dispatchEvent(new Event('input'));
      check('邊打邊篩選建議', sugg(), ['＋ Elden Ring']);
      $$('logGame').value = '我的新遊戲'; $$('logGame').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      check('手打 + Enter：加成 tag、輸入框清空', [logGames, $$('logGame').value], [['FF14', '我的新遊戲'], '']);
      $$('logGame').value = '另一個、第三個'; $$('logGame').dispatchEvent(new Event('input'));
      check('打到「、」就切成多個 tag', logGames, ['FF14', '我的新遊戲', '另一個', '第三個']);
      document.querySelector('#logGameChips .tag-x').click();
      check('按 × 移除', logGames, ['我的新遊戲', '另一個', '第三個']);
      $$('logGame').value = ''; $$('logGame').dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));
      check('輸入框空的時候按 Backspace 移除最後一個', logGames, ['我的新遊戲', '另一個']);
      $$('logGame').value = '尚未按Enter'; await saveLogEdit();
      check('存檔：沒按 Enter 的字也算、存成「A、B」', streamLog.find((e) => e.title === '【Might & Mushroom】測試').game, '我的新遊戲、另一個、尚未按Enter');
      streamLog = savedLog;
      setStreamMode('log'); showView('stream');
      check('備份鈕：年度直播回顧時提示是備份直播紀錄', [$$('btnExport').title, $$('btnImport').title], ['把直播紀錄（含截圖）存成備份檔', '從備份檔匯入直播紀錄']);
      setStreamMode('week');
      check('備份鈕：其他畫面是備份行程', [$$('btnExport').title, !!$$('stLogExport'), !!$$('stLogImport')], ['把行程存成備份檔', false, false]);
    }
    // v0.49：多分類、時長 時:分:秒、拖曳圖片
    check('時長解析：時:分:秒／時:分／純數字＝分鐘／空白／錯誤', [parseHms('3:08:33'), parseHms('1:30'), parseHms('188'), parseHms(''), parseHms('1:75:00'), parseHms('abc'), parseHms('０:10:00'.replace('０', '0'))], [11313, 5400, 11280, 0, null, null, 600]);
    check('時長顯示：fmtHms', [fmtHms(11313), fmtHms(0), fmtHms(59)], ['3:08:33', '', '0:00:59']);
    check('多分類：以「、」「,」分開、去重', [splitGames('FF14、雜談, FF14，Elden Ring'), splitGames('')], [['FF14', '雜談', 'Elden Ring'], []]);
    {
      const savedLog = streamLog;
      streamLog = [{ id: 'm1', source: 'manual', startedAt: '2026-10-24T12:00:00Z', title: '兩款', game: 'FF14、Elden Ring', durationSec: 3600, url: '', hasThumb: false, edited: true },
        { id: 'm2', source: 'manual', startedAt: '2026-10-25T12:00:00Z', title: '一款', game: 'FF14', durationSec: 5025, url: '', hasThumb: false, edited: true }];
      reviewView = 'list'; reviewYear = 2026; renderStreamLog();
      check('多分類：清單卡片每個分類一個標籤、最常直播算每一款', [[...$$('streamLog').querySelectorAll('.log-game')].map((x) => x.textContent), [...$$('streamLog').querySelectorAll('.rv-stat')].map((s) => s.querySelector('.rv-num').textContent)], [['FF14', 'Elden Ring', 'FF14'], ['2 場', '2 天', '2 小時 24 分', 'FF14']]);
      openLogEdit('m1'); logGames = []; $$('logGame').value = 'A、B、A'; $$('logDur').value = '1:02:03'; await saveLogEdit();
      check('編輯存檔：分類整理成「A、B」、時長存成秒', [streamLog.find((x) => x.id === 'm1').game, streamLog.find((x) => x.id === 'm1').durationSec], ['A、B', 3723]);
      openLogEdit('m1'); $$('logDur').value = '1:99:00'; await saveLogEdit();
      check('時長格式錯誤：不存檔、視窗不關', [streamLog.find((x) => x.id === 'm1').durationSec, $$('logModal').classList.contains('open') || getComputedStyle($$('logModal')).display !== 'none'], [3723, true]);
      closeModal('logModal');
      streamLog = savedLog;
    }
    {
      // 拖曳：dataTransfer 帶圖片檔就會交給 handler；不是圖片或不是檔案都不處理
      const zone = document.createElement('div'), got = [];
      onImageDrop(zone, (f) => got.push(f.name));
      const fire = (type, files, types) => { const ev = new Event(type, { bubbles: true, cancelable: true }); ev.dataTransfer = { files, types }; zone.dispatchEvent(ev); return ev.defaultPrevented; };
      const png = new File(['x'], 'a.png', { type: 'image/png' }), txt = new File(['x'], 'a.txt', { type: 'text/plain' });
      const over = fire('dragover', [png], ['Files']);
      check('拖曳：經過時加上提示樣式', [over, zone.classList.contains('drag-over')], [true, true]);
      fire('drop', [txt, png], ['Files']);
      fire('drop', [txt], ['Files']);
      fire('drop', [png], ['text/plain']);
      check('拖曳：只處理圖片檔、提示樣式移除', [got, zone.classList.contains('drag-over')], [['a.png'], false]);
      check('拖曳區：紀錄視窗、背景圖視窗', [!!$$('logShotZone'), !!$$('bgPaneImage')], [true, true]);
    }
    check('月曆標題條：去掉開頭的【遊戲｜…】（遊戲已經在分類）', [stripGameTag('【FF14｜雜談】20261026 上一次FF14是426欸哈哈【微醺染香】'), stripGameTag('沒有括號'), stripGameTag('【只有括號】')], ['20261026 上一次FF14是426欸哈哈【微醺染香】', '沒有括號', '']);
    // 標題的｜：【FF14｜雜談】就是 FF14
    check('標題抓遊戲：【遊戲｜這場主題】只取｜前面', [gameFromTitle('【FF14｜雜談】20261026 上一次FF14是426欸哈哈【微醺染香】'), gameFromTitle('【Might & Mushroom | 抓寶】x'), gameFromTitle('【 魔法與蘑菇 ｜ 雜談 】x')], ['FF14', 'Might & Mushroom', '魔法與蘑菇']);
    // 開什麼台：直接看標題開頭的【】
    check('標題抓遊戲：開頭【】裡的字（英文、中文都可以），後面的【頻道名】不算', [gameFromTitle('【Might & Mushroom】20261024 醒來就好想睡995【微醺染香】'), gameFromTitle('【魔法與蘑菇】20261024 雜談'), gameFromTitle('  【FF14】主線'), gameFromTitle('沒有括號的標題【微醺染香】'), gameFromTitle(''), gameFromTitle(null)], ['Might & Mushroom', '魔法與蘑菇', 'FF14', '', '', '']);
    { const keepEdited = streamLog.slice();
      streamLog = [{ id: 'g1', source: 'twitch', streamId: 'sg1', videoId: 'vg1', startedAt: '2026-10-24T12:00:00Z', title: '【Might & Mushroom】20261024 醒來就好想睡995【微醺染香】', game: '', durationSec: 0, url: '', hasThumb: false, edited: false },
        { id: 'g2', source: 'manual', startedAt: '2026-10-25T12:00:00Z', title: '【魔法與蘑菇】雜談', game: '我自己填的', durationSec: 0, url: '', hasThumb: false, edited: true },
        { id: 'g3', source: 'manual', startedAt: '2026-10-26T12:00:00Z', title: '沒有括號', game: 'Elden Ring', durationSec: 0, url: '', hasThumb: false, edited: false }];
      check('顯示：沒填分類就用標題的【】；自己手填的優先；沒有括號才用原本的分類', streamLog.map(gameOf), ['Might & Mushroom', '我自己填的', 'Elden Ring']);
      reviewView = 'list'; reviewYear = 2026; reviewMonth = null; renderStreamLog();
      check('清單卡片的分類標籤跟著標題', [...$$('streamLog').querySelectorAll('.log-game')].map((x) => x.textContent), ['Might & Mushroom', '我自己填的', 'Elden Ring']);
      check('統計「最常直播」也算標題裡的遊戲', reviewStats(streamLog)[3][1], 'Might & Mushroom');
      openLogEdit('g1'); $$('logTitle').value = '【魔法與蘑菇】20261024 新標題'; await saveLogEdit();
      check('編輯：分類欄還是自動帶的字 → 標題換成中文名，分類跟著換', streamLog.find((e) => e.id === 'g1').game, '魔法與蘑菇');
      openLogEdit('g2'); $$('logTitle').value = '【另一個遊戲】雜談'; await saveLogEdit();
      check('編輯：分類是自己手填的 → 改標題不會被蓋掉', streamLog.find((e) => e.id === 'g2').game, '我自己填的');
      $$('stLogAdd').click(); $$('logDate').value = '2026-10-27'; $$('logTitle').value = '【Might & Mushroom】新增測試'; $$('logGame').value = ''; await saveLogEdit();
      check('手動新增：分類留空 → 自動用標題【】裡的字', streamLog[streamLog.length - 1].game, 'Might & Mushroom');
      // Twitch 同步：標題的【】優先於 Twitch 給的分類；手動編輯過的不動
      const keepF = window.fetch, keepCfgG = twitchCfg; const jf = (data) => new Response(JSON.stringify({ data }), { status: 200 });
      window.fetch = async (url) => { const u = String(url);
        if (u.includes('/helix/users')) return jf([{ id: '9' }]);
        if (u.includes('/helix/streams')) return jf([{ id: 'sg-live', game_name: 'Might and Mushroom (Twitch 英文分類)', title: '【Might & Mushroom】現在直播', started_at: '2026-10-28T12:00:00Z', thumbnail_url: '' }]);
        if (u.includes('/helix/videos')) return jf([{ id: 'vg9', stream_id: 'sg2', title: '【Elden Ring】VOD 標題', created_at: '2026-10-20T12:00:00Z', url: 'u', duration: '1h', thumbnail_url: '' }]);
        return new Response('', { status: 404 }); };
      twitchCfg = { login: 'me', clientId: 'c', token: 't', userId: '' }; await syncTwitchLog(true);
      check('同步：直播中那場的分類用標題的【】（而不是 Twitch 的英文分類）', streamLog.find((e) => e.streamId === 'sg-live').game, 'Might & Mushroom');
      check('同步：VOD 的標題有【】也自動帶出分類', streamLog.find((e) => e.videoId === 'vg9').game, 'Elden Ring');
      window.fetch = keepF; twitchCfg = keepCfgG; saveTwitchCfg(); streamLog = keepEdited; saveStreamLog(); reviewView = 'list'; reviewYear = null; renderStreamLog(); }
    // 換取存取憑證（Client ID ＋ Secret → App Access Token）；Secret 不存、換完清掉
    { const tokCalls = [];
      window.fetch = async (url, opt) => {
        tokCalls.push([String(url), opt]);
        const body = String(opt.body);
        if (body.includes('client_secret=bad')) return new Response(JSON.stringify({ status: 400, message: 'invalid client secret' }), { status: 403 });
        return new Response(JSON.stringify({ access_token: 'newtoken123', expires_in: 5184000, token_type: 'bearer' }), { status: 200 });
      };
      twitchCfg = { login: 'Me', clientId: 'old', token: 'tok', userId: '' };
      openTwitchModal(); $$('twLogin').value = 'Me'; $$('twClientId').value = 'cid'; $$('twSecret').value = '';
      const t0 = []; const kt = window.toast; window.toast = (m) => t0.push(m);
      check('Twitch 設定視窗：沒有「存取憑證」欄、Secret 欄跟其他欄位同樣式', [!$$('twToken'), !$$('btnTwToken'), getComputedStyle($$('twSecret')).borderRadius === getComputedStyle($$('twClientId')).borderRadius, $$('twSecret').type], [true, true, true, 'password']);
      $$('twSecret').value = 'bad'; await saveTwitchModal();
      check('換憑證：Secret 不對 → 明講「Client Secret 不對」、視窗不關、憑證不變', [t0.some((m) => m.includes('Client Secret 不對')), $$('twitchModal').classList.contains('open'), twitchCfg.token], [true, true, 'tok']);
      $$('twSecret').value = 'goodsecret'; await saveTwitchModal(); await new Promise((r) => setTimeout(r, 50)); window.toast = kt;
      const [turl, topt] = tokCalls.filter(([u]) => u.includes('id.twitch.tv')).pop();
      check('換憑證：POST 到 id.twitch.tv，用 client_credentials', [turl, topt.method, String(topt.body).includes('grant_type=client_credentials'), String(topt.body).includes('client_id=cid')], ['https://id.twitch.tv/oauth2/token', 'POST', true, true]);
      check('換憑證成功：存進設定、Secret 欄清空、記下到期時間、視窗關閉', [twitchCfg.token, $$('twSecret').value, Math.round((twitchCfg.tokenExpiresAt - Date.now()) / 86400000), $$('twitchModal').classList.contains('open')], ['newtoken123', '', 60, false]);
      openTwitchModal(); $$('twClientId').value = 'cid'; $$('twSecret').value = ''; const callsBefore = tokCalls.length; await saveTwitchModal(); await new Promise((r) => setTimeout(r, 50));
      check('已有憑證、Secret 留空：保留原憑證、不再換', [twitchCfg.token, tokCalls.slice(callsBefore).some(([u]) => u.includes('id.twitch.tv'))], ['newtoken123', false]);
      openTwitchModal(); $$('twClientId').value = 'other'; $$('twSecret').value = ''; await saveTwitchModal(); await new Promise((r) => setTimeout(r, 50));
      check('換了 Client ID 又沒填 Secret：舊憑證作廢', twitchCfg.token, '');
      twitchCfg.clientId = 'cid'; twitchCfg.token = 'newtoken123'; twitchCfg.tokenExpiresAt = Date.now() + 60 * 86400000;
      check('Secret 不會被存起來（設定與 localStorage 都找不到）', [JSON.stringify(twitchCfg).includes('goodsecret'), Object.keys(localStorage).some((k) => (localStorage.getItem(k) || '').includes('goodsecret'))], [false, false]);
      window.fetch = keepFetch; closeModal('twitchModal'); }
    // 設定視窗
    openTwitchModal();
    check('Twitch 設定視窗：帶入已填的內容（Secret 一律空白）', [$$('twLogin').value, $$('twClientId').value, $$('twSecret').value], ['Me', 'cid', '']);
    closeModal('twitchModal');
    setStreamMode('week');
    check('離開紀錄頁：預覽回來、紀錄清單收起', [$$('streamStage').hidden, $$('logStage').hidden, $$('stSync').hidden], [false, true, true]);
    streamLog = keepLog; twitchCfg = keepCfg; saveStreamLog(); saveTwitchCfg();
    // 測試用的截圖不留在瀏覽器裡：先關掉連線再刪資料庫
    if (logDb) { (await logDb).close(); logDb = null; }
    await new Promise((res) => { const rq = indexedDB.deleteDatabase('twcal-streamlog'); rq.onsuccess = rq.onerror = rq.onblocked = () => res(); setTimeout(res, 800); }); }

  // 每天最多 3 場直播
  { streamEvents = [{ ...newStreamEvent('2026-10-14'), title: '一', startTime: '10:00' }]; saveStreamEvents(); fillDaySettings();
    const d = dayBox(14), labels = () => [...dayBox(14).querySelectorAll('.ss-more .ss-toggle span')].map((x) => x.textContent);
    check('每天 3 場：只有第一場時，只問「第二場直播」', [labels(), dayBox(14).querySelectorAll('.ss-slot').length], [['第二場直播'], 1]);
    const t2 = toggleIn(dayBox(14), '第二場直播'); t2.checked = true; fireEvt(t2, 'change');
    check('勾第二場 → 出現第二組欄位、接著問「第三場直播」', [labels(), dayBox(14).querySelectorAll('.ss-slot').length], [['第二場直播', '第三場直播'], 2]);
    const t3 = toggleIn(dayBox(14), '第三場直播'); t3.checked = true; fireEvt(t3, 'change');
    check('勾第三場 → 三組欄位，最多就到這裡', [labels(), dayBox(14).querySelectorAll('.ss-slot').length], [['第二場直播', '第三場直播'], 3]);
    const inp = (i) => dayBox(14).querySelectorAll('.ss-slot')[i].querySelector('.ss-two input');
    inp(1).value = '二'; fireEvt(inp(1), 'input'); inp(2).value = '三'; fireEvt(inp(2), 'input');
    check('三場都各是一筆行程', streamEvents.filter((e) => e.start === '2026-10-14').map((e) => e.title).sort(), ['一', '三', '二']);
    check('每場各自有圖片貼紙區', dayBox(14).querySelectorAll('.ss-slot .ss-stk-box').length, 3);
    const ask = window.confirm; let asked = 0; window.confirm = () => { asked++; return true; };
    const t2b = toggleIn(dayBox(14), '第二場直播'); t2b.checked = false; fireEvt(t2b, 'change'); window.confirm = ask;
    check('取消第二場：之後的第三場一起移除（確認一次）', [asked, streamEvents.filter((e) => e.start === '2026-10-14').map((e) => e.title), dayBox(14).querySelectorAll('.ss-slot').length], [1, ['一'], 1]); }
  streamEvents = evKeep; saveStreamEvents(); fillDaySettings();

  // 暗色主題：時間下拉清單的字看得見
  { const keepTheme = theme; setTheme('dark');
    const opt = document.querySelector('.time-pick select option'), cs = getComputedStyle(opt);
    check('暗色主題：下拉選項的文字色與底色不同（亮字深底）', [cs.color !== cs.backgroundColor, luminance(cs.color.match(/\d+/g).slice(0, 3).reduce((s, v) => s + Number(v).toString(16).padStart(2, '0'), '#')) > luminance(cs.backgroundColor.match(/\d+/g).slice(0, 3).reduce((s, v) => s + Number(v).toString(16).padStart(2, '0'), '#'))], [true, true]);
    setTheme(keepTheme); }

  // 字型
  ssSet('font', 'google'); ssSet('fontName', 'Noto Sans JP');
  check('字型：Google 字型寫進 CSS 變數並載入', [box.style.getPropertyValue('--stream-font'), !!document.querySelector('link[href*="fonts.googleapis.com"][href*="Noto+Sans+JP"]')], ['"Noto Sans JP", "Noto Sans TC", sans-serif', true]);
  ssSet('font', 'local'); ssSet('fontName', 'Microsoft JhengHei');
  check('字型：電腦字型直接用名稱', box.style.getPropertyValue('--stream-font'), '"Microsoft JhengHei", sans-serif');
  ssSet('fontName', 'a";}</style><script>x</script>');
  check('字型：名稱會過濾掉引號與標籤符號', box.style.getPropertyValue('--stream-font').includes('<') || box.style.getPropertyValue('--stream-font').includes(';'), false);
  buildStreamSettings();
  { const sec = [...document.querySelectorAll('#ssBody details.ss-sec')][0], rows = [...sec.querySelectorAll('.ss-row')];
    check('字型：選了電腦字型才出現名稱欄與「讀取電腦字型清單」', [rows.some((r) => !r.hidden && r.querySelector('input[list="ssFontList"]')), [...sec.querySelectorAll('button')].some((b) => b.textContent === '讀取電腦字型清單' && !b.closest('.ss-row').hidden)], [true, true]); }
  ssSet('font', 'default'); ssSet('fontName', ''); buildStreamSettings();
  check('字型：預設／內建字型時名稱欄收起', [...document.querySelectorAll('#ssBody input[list="ssFontList"]')].every((i) => i.closest('.ss-row').hidden), true);

  // 跨裝置同步（v0.62）：用記憶體裡的假資料夾代替 Google Drive 資料夾
  { const keepSync = { dir: sync.dir, reload: sync.reload, confirm: window.confirm };
    const reloads = []; sync.reload = () => reloads.push(1); sync.dir = null;
    const fakeDir = (name = 'fake') => {
      const files = new Map(), dirs = new Map(), nf = () => { const e = new Error('nf'); e.name = 'NotFoundError'; return e; };
      const d = { name, files, dirs, perm: 'granted',
        async queryPermission() { return d.perm; }, async requestPermission() { return d.perm; },
        async getFileHandle(n, o) {
          if (!files.has(n)) { if (!(o && o.create)) throw nf(); files.set(n, new Blob([])); }
          return { async getFile() { return files.get(n); }, async createWritable() { let buf; return { async write(x) { buf = x; }, async close() { files.set(n, new Blob([buf])); } }; } };
        },
        async getDirectoryHandle(n, o) { if (!dirs.has(n)) { if (!(o && o.create)) throw nf(); dirs.set(n, fakeDir(n)); } return dirs.get(n); },
        async removeEntry(n) { files.delete(n); },
        async *entries() { for (const k of files.keys()) yield [k, {}]; } };
      return d;
    };
    const dirtyNow = () => localStorage.getItem(KEY.syncDirty);
    const writeRemote = (dir, savedAt, data) => fsWrite(dir, SYNC_FILE, JSON.stringify({ app: 'twcal', version: 'x', savedAt, data }));

    localStorage.clear();
    ['tw_cal_zz', KEY.syncLast, KEY.twitch, KEY.streamMode, KEY.streamPanel, 'other'].forEach((k) => localStorage.setItem(k, '1'));
    check('同步的鍵：只有 tw_cal_ 資料；不含同步暫存、Twitch 憑證、頁籤與面板、別人的鍵', syncKeys(), ['tw_cal_zz']);
    check('同步判斷：沒檔案→寫出、雲端較新→套用（有改→問）、本機有改→寫出、一樣→不動',
      [syncDecide(null, 0, false), syncDecide(100, 50, false), syncDecide(100, 50, true), syncDecide(100, 100, true), syncDecide(100, 100, false), syncDecide(50, 100, false)], ['push', 'pull', 'conflict', 'push', 'none', 'none']);

    localStorage.setItem(KEY.syncDirty, '0');
    localStorage.setItem('tw_cal_zz', '1'); check('同值寫入不算修改', dirtyNow(), '0');
    localStorage.setItem(KEY.twitch, '{"a":1}'); check('Twitch 憑證改了不算修改', dirtyNow(), '0');
    localStorage.setItem('tw_cal_zz', '2'); check('改值 → 標記未同步', dirtyNow(), '1');
    localStorage.setItem(KEY.syncDirty, '0'); localStorage.removeItem('tw_cal_zz'); check('刪除 → 標記未同步', dirtyNow(), '1');

    // 寫出 → 另一台套用
    const A = fakeDir();
    localStorage.clear();
    localStorage.setItem(KEY.streamLog, JSON.stringify([{ id: 'tsync1', hasThumb: true, startedAt: '2026-10-01T10:00:00Z', title: 't' }]));
    localStorage.setItem(KEY.title, '同步測試');
    await thumbPut('tsync1', new Blob(['abc'], { type: 'image/jpeg' }));
    await syncPush(A);
    const mf = JSON.parse(await A.files.get(SYNC_FILE).text());
    check('寫出：主檔有資料與時間、縮圖放進 thumbs/、本機記下上次同步並清掉未同步', [mf.app, mf.data[KEY.title], mf.savedAt === Number(localStorage.getItem(KEY.syncLast)), [...A.dirs.get('thumbs').files.keys()], dirtyNow(), localStorage.getItem(KEY.syncThumbs)], ['twcal', '同步測試', true, ['tsync1.jpg'], '0', null]);
    check('寫出：不含 Twitch 憑證與同步暫存', Object.keys(mf.data).some((k) => k.startsWith('tw_cal_sync_') || k === KEY.twitch), false);
    await thumbDel('tsync1'); localStorage.clear();
    await syncPull(A, mf);
    check('套用：資料與縮圖都回來、記下同步時間、重新載入一次', [localStorage.getItem(KEY.title), (await thumbGet('tsync1') || {}).size, Number(localStorage.getItem(KEY.syncLast)) === mf.savedAt, dirtyNow(), reloads.length], ['同步測試', 3, true, '0', 1]);

    // syncRun 的各種情況
    const B = fakeDir();
    localStorage.clear(); localStorage.setItem(KEY.events, JSON.stringify([{ id: 'e1' }]));
    sync.dir = B;
    check('雲端沒有檔案、本機有資料 → 寫出', [await syncRun(), B.files.has(SYNC_FILE), dirtyNow(), sync.status], [true, true, '0', 'ok']);
    const last1 = Number(localStorage.getItem(KEY.syncLast));
    await writeRemote(B, last1 + 1000, { [KEY.title]: '雲端的' });
    await syncRun();
    check('雲端較新、本機沒改 → 直接套用（資料換成雲端的、重新載入）', [localStorage.getItem(KEY.title), localStorage.getItem(KEY.events), reloads.length], ['雲端的', null, 2]);

    localStorage.setItem(KEY.title, '本機的'); clearTimeout(sync.timer);
    const last2 = Number(localStorage.getItem(KEY.syncLast));
    await writeRemote(B, last2 + 5000, { [KEY.title]: '雲端又改的' });
    let asked = 0; window.confirm = () => { asked++; return true; };
    await syncRun();
    check('兩邊都改、選雲端 → 套用雲端，本機那份備份在資料夾', [asked, localStorage.getItem(KEY.title), B.files.has('calendar-data.backup-local.json'), JSON.parse(await B.files.get('calendar-data.backup-local.json').text()).data[KEY.title]], [1, '雲端又改的', true, '本機的']);

    localStorage.setItem(KEY.title, '本機再改'); clearTimeout(sync.timer);
    const last3 = Number(localStorage.getItem(KEY.syncLast));
    await writeRemote(B, last3 + 5000, { [KEY.title]: '雲端再改' });
    window.confirm = () => false;
    await syncRun();
    check('兩邊都改、選本機 → 雲端換成本機的，原本雲端那份備份', [JSON.parse(await B.files.get(SYNC_FILE).text()).data[KEY.title], JSON.parse(await B.files.get('calendar-data.backup-cloud.json').text()).data[KEY.title], localStorage.getItem(KEY.title)], ['本機再改', '雲端再改', '本機再改']);

    // 第一次連上已有資料的雲端：本機有資料時不能默默蓋掉
    localStorage.removeItem(KEY.syncLast); localStorage.setItem(KEY.events, JSON.stringify([{ id: 'e9' }])); clearTimeout(sync.timer);
    asked = 0; window.confirm = () => { asked++; return false; };
    await syncRun();
    check('第一次連上有資料的雲端、本機也有資料 → 一定先問', asked, 1);

    B.perm = 'prompt'; const before = JSON.stringify(Object.keys(localStorage));
    check('資料夾權限還沒恢復 → 不讀寫、狀態是「需要點一下」', [await syncRun(), sync.status, JSON.stringify(Object.keys(localStorage)) === before], [false, 'need', true]);
    const bad = fakeDir(); await fsWrite(bad, SYNC_FILE, '不是 JSON'); sync.dir = bad;
    check('同步檔壞掉 → 報錯、不動本機資料', [await syncRun(), sync.status, localStorage.getItem(KEY.title)], [false, 'error', '本機再改']);

    clearTimeout(sync.timer); syncPaint('off'); Object.assign(sync, { dir: keepSync.dir, reload: keepSync.reload }); window.confirm = keepSync.confirm;
    await thumbDel('tsync1').catch(() => {}); }

  localStorage.clear();
  return { passed, failed };
})()
