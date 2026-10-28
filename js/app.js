'use strict';

/* ============================================================
 * 啟動：綁定所有按鈕與輸入、初始化畫面
 * ============================================================ */

const on = (id, type, fn) => $(id).addEventListener(type, fn);
const onClick = (id, fn) => on(id, 'click', fn);

// 視窗的「取消」動作：點視窗外的灰色背景、按 Esc 都等同按取消。
// Esc 一次只關最上面（DOM 順序最後、且目前開著）的那一個視窗。
const modalClosers = new Map();
function closeOnBackdrop(id, closeFn) {
  modalClosers.set(id, closeFn);
  on(id, 'click', (e) => { if (e.target === e.currentTarget) closeFn(); });
}
function bindEscapeToClose() {
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('settingsMenu').hidden) { setSettingsMenu(false); return; } // 先收選單，再關視窗
    const open = [...document.querySelectorAll('.modal-overlay.open')].pop();
    if (open && modalClosers.has(open.id)) modalClosers.get(open.id)();
  });
}

// 「⚙ 設定」選單：底板、背景、週首、時間顯示、日曆寬度。點選單外面或按 Esc 收起來。
function setSettingsMenu(open) {
  $('settingsMenu').hidden = !open;
  $('btnSettings').setAttribute('aria-expanded', String(open));
}
function bindSettingsMenu() {
  onClick('btnSettings', () => setSettingsMenu($('settingsMenu').hidden));
  document.addEventListener('click', (e) => { if (!$('settingsMenu').hidden && !e.target.closest('.tb-menu')) setSettingsMenu(false); });
  onClick('btnTheme', () => setTheme(theme === 'dark' ? 'light' : 'dark'));
  onClick('btnBg', () => { setSettingsMenu(false); showBgModal(); });
  onClick('btnTwitchSet', () => { setSettingsMenu(false); openTwitchModal(); });
  onClick('stLogToCal', openLogBatch);
  ['lbScope', 'lbMain', 'lbStream'].forEach((id) => on(id, 'change', updateLogBatch));
  onClick('btnLbDo', doLogBatch);
  onClick('btnLbCancel', () => closeModal('logBatchModal'));
  closeOnBackdrop('logBatchModal', () => closeModal('logBatchModal'));
  onClick('btnSync', () => { setSettingsMenu(false); openSyncModal(); });
  onClick('btnSyncPick', pickSyncFolder);
  onClick('btnSyncNow', () => { syncRun(); });
  onClick('btnSyncStop', stopSync);
  onClick('btnSyncClose', () => closeModal('syncModal'));
  closeOnBackdrop('syncModal', () => closeModal('syncModal'));
  onClick('syncChip', onSyncChip);
  onClick('btnSocial', () => { setSettingsMenu(false); openSocialModal(); });
  onClick('btnSocialSave', saveSocialModal);
  onClick('btnSocialCancel', () => closeModal('socialModal'));
  closeOnBackdrop('socialModal', () => closeModal('socialModal'));
}

function bindTopbar() {
  on('titleInput', 'input', function () {
    fitTitle();
    saveRaw(KEY.title, this.value);
    $('yearTitle').textContent = this.value || DEFAULT_TITLE;
  });
  on('widthSlider', 'input', function () { setCalWidth(this.value, true); });
  $('weekStart').value = String(weekStart);
  on('weekStart', 'change', function () { setWeekStart(Number(this.value)); });
  $('timeFmt').value = String(timeFmt);
  on('timeFmt', 'change', function () { setTimeFmt(this.value); });
  bindSettingsMenu();
  onClick('scopeStream', openStream);
  onClick('scopeMain', () => { if (currentView() === 'stream') backToYear(); });
  onClick('btnExport', () => (inLogView() ? exportStreamLog() : showExportModal()));
  onClick('expAll', () => setAllExport(true));
  onClick('expNone', () => setAllExport(false));
  onClick('btnDoExport', exportEvents);
  onClick('btnCancelExport', () => closeModal('exportModal'));
  closeOnBackdrop('exportModal', () => closeModal('exportModal'));
  onClick('btnImport', () => $('importFile').click());
  on('importFile', 'change', function (e) { if (!inLogView()) { importEvents(e); return; } const f = this.files[0]; this.value = ''; if (f) importStreamLog(f); });
  onClick('btnShot', takeScreenshot);
  $('versionTag').textContent = VERSION;
}

function bindViews() {
  onClick('yearPrev', () => changeYear(-1));
  onClick('yearNext', () => changeYear(1));
  onClick('btnBackYear', backToYear);
  onClick('monthPrev', () => changeMonth(-1));
  onClick('monthNext', () => changeMonth(1));
  onClick('monthToday', goToThisMonth);
  onClick('btnFree', showFreeDaysModal);
  bindMonthGrid();
  // 移動／複製詢問
  onClick('btnMoveDo', () => resolveMove('move'));
  onClick('btnCopyDo', () => resolveMove('copy'));
  onClick('btnMoveCancel', () => resolveMove('cancel'));
  closeOnBackdrop('moveModal', () => resolveMove('cancel'));
  onClick('btnCloseDay', () => closeModal('dayModal'));
  closeOnBackdrop('dayModal', () => closeModal('dayModal'));
}

// 直播紀錄：頁籤上的工具鈕、新增/編輯視窗、Twitch 設定視窗
function bindStreamLog() {
  onClick('stSync', () => syncTwitchLog());
  onClick('stLogAdd', () => openLogEdit(null));
  onClick('btnSaveLog', saveLogEdit);
  onClick('btnCancelLog', () => closeModal('logModal'));
  onClick('btnDeleteLog', deleteLogEntry);
  closeOnBackdrop('logModal', () => closeModal('logModal'));
  on('logGame', 'input', function () { if (/[、,，;；]/.test(this.value) && !logGameComposing) { addLogGames(this.value); this.value = ''; } renderLogGames(); });
  on('logGame', 'compositionstart', () => { logGameComposing = true; });
  on('logGame', 'compositionend', function () { logGameComposing = false; this.dispatchEvent(new Event('input')); });
  on('logGame', 'keydown', function (e) {
    if (e.isComposing) return;
    if (e.key === 'Enter') { e.preventDefault(); addLogGames(this.value); this.value = ''; renderLogGames(); }
    else if (e.key === 'Backspace' && !this.value && logGames.length) { logGames.pop(); renderLogGames(); }
  });
  on('logGame', 'blur', function () { if (this.value.trim()) { addLogGames(this.value); this.value = ''; renderLogGames(); } });
  on('logTitle', 'input', renderLogGames);
  onClick('logShotPick', () => $('logShotFile').click());
  on('logShotFile', 'change', function () { const f = this.files[0]; this.value = ''; if (f) setLogShot(f); });
  onImageDrop($('logShotZone'), setLogShot);
  onClick('logShotClear', () => { logShotFile = null; logShotCleared = true; $('logShotPrev').hidden = $('logShotClear').hidden = true; });
  onClick('btnTwSave', saveTwitchModal);
  onClick('btnTwCancel', () => closeModal('twitchModal'));
  onClick('btnTwClear', clearTwitchModal);
  closeOnBackdrop('twitchModal', () => closeModal('twitchModal'));
}

function bindStream() {
  window.addEventListener('resize', fitStreamStage);
  if (window.ResizeObserver) { const ro = new ResizeObserver(fitStreamStage); ['streamStage', 'streamScaler', 'logStage', 'logScaler'].forEach((id) => ro.observe($(id))); }
  onClick('stYear', () => setStreamMode('year'));
  onClick('stWeek', () => setStreamMode('week'));
  onClick('stMonth', () => setStreamMode('month'));
  onClick('stLog', () => setStreamMode('log'));
  bindStreamLog();
  onClick('stPrev', () => streamShift(-1));
  onClick('stNext', () => streamShift(1));
  onClick('stToday', streamToday);
  onClick('stImport', showStreamImport);
  onClick('stSettings', () => toggleStreamPanel());
  onClick('ssReset', resetStreamSettings);
  onClick('stClear', clearStream);
  // 直播行程是「看」的畫面：點行程進編輯、點「+N」看當天（只含有顯示在直播行程的行程）
  on('streamView', 'click', (e) => {
    if (moreOf(e.target)) { openDayList(cellOf(e.target).dataset.date, streamEventsForDay, 'stream'); return; }
    const item = e.target.closest('[data-evid]');
    if (item) openEditEvent(item.dataset.evid, 'stream');
  });
  onClick('spAll', () => setAllStreamImport(true));
  onClick('spNone', () => setAllStreamImport(false));
  onClick('spDo', doStreamImport);
  onClick('spCancel', () => closeModal('streamPickModal'));
  closeOnBackdrop('streamPickModal', () => closeModal('streamPickModal'));
}

function bindEventModal() {
  buildTimePick('evStartTime');
  buildTimePick('evEndTime');
  onClick('tabSolid', () => setColorMode('solid'));
  onClick('tabGrad', () => setColorMode('gradient'));
  on('evColor1', 'input', updateColorPreview);
  on('evColor2', 'input', updateColorPreview);
  initSystemCombo();
  ['trpgGm', 'trpgSystem', 'trpgScript'].forEach((id) => on(id, 'input', updateTrpgFields));
  ['evTitle', 'evPeople'].forEach((id) => on(id, 'input', updateNamePreview));
  onClick('btnManageCat', () => { renderCatList(); openModal('catModal'); });
  onClick('btnAddCat', addCategory);
  onClick('btnCloseCat', closeCatModal);
  closeOnBackdrop('catModal', closeCatModal);
  onClick('btnSaveEv', saveEvent);
  onClick('btnCancelEv', closeEventModal);
  closeOnBackdrop('eventModal', closeEventModal);
  onClick('btnCopyEv', openCopyDialog);
  onClick('btnConfirmCopy', confirmCopy);
  onClick('btnCancelCopy', () => closeModal('copyModal'));
  closeOnBackdrop('copyModal', () => closeModal('copyModal'));
  onClick('deleteEvBtn', deleteEvent);
}

function bindBgModal() {
  BG_PANES.forEach(([name, key]) => onClick('bgTab' + name, () => setBgMode(key)));
  document.querySelectorAll('#bgModal .bgc, #bgAngle, #patBase, #patColor, #patSize, #patAlpha, #imgFade')
    .forEach((input) => input.addEventListener('input', updateBgPreview));
  onClick('btnPickImg', () => $('bgImageFile').click());
  on('bgImageFile', 'change', function () { const f = this.files[0]; this.value = ''; loadBgImage(f); });
  onImageDrop($('bgPaneImage'), loadBgImage);
  onClick('imgFitCover', () => setImgFit('cover'));
  onClick('imgFitTile', () => setImgFit('tile'));
  ['calTextColor', 'calMutedColor', 'calBorderColor', 'calCardBgColor', 'calCardAlpha']
    .forEach((id) => on(id, 'input', previewCalColors));
  onClick('btnAutoColors', autoColorsFromBg);
  onClick('btnApplyBg', applyBg);
  onClick('btnCancelBg', closeBgModal);
  closeOnBackdrop('bgModal', closeBgModal);
}

function bindFreeDaysModal() {
  [['fdWinStart', 0], ['fdWinEnd', 1440]].forEach(([id, def]) => {
    const sel = $(id);
    for (let m = 0; m <= 1440; m += SLOT) sel.add(new Option(fmtMin(m) + (m % 60 ? '' : ':00'), m));
    sel.value = def;
  });
  onClick('fdMode1', () => setFdMode('single'));
  onClick('fdMode2', () => setFdMode('multi'));
  onClick('exclPrev', () => { exclMonth = (exclMonth + 11) % 12; renderExclCal(); });
  onClick('exclNext', () => { exclMonth = (exclMonth + 1) % 12; renderExclCal(); });
  onClick('btnGenFree', generateFreeDays);
  onClick('btnCopyFree', copyFreeDays);
  const close = () => closeModal('freeDaysModal');
  onClick('btnCloseFree', close);
  closeOnBackdrop('freeDaysModal', close);
}

document.addEventListener('DOMContentLoaded', () => {
  bindTopbar();
  bindViews();
  bindStream();
  bindEscapeToClose();
  bindEventModal();
  bindBgModal();
  bindFreeDaysModal();
  syncThemeButton();
  document.documentElement.style.setProperty('--cell-rows', CELL_ROWS); // 讓 CSS 依行數預留格子高度
  setCalWidth(loadRaw(KEY.width) || DEFAULT_CAL_WIDTH, false);
  applyCalColors();
  renderYearView();
  syncInit();
  if (document.fonts) document.fonts.ready.then(fitTitle); // 字型載入後標題寬度會變
});
