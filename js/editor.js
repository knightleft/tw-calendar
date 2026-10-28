'use strict';

/* ============================================================
 * 行程編輯視窗：基本欄位、24 小時制時間選擇器、顏色與最近使用、
 *             類別（含管理視窗）、TRPG 資訊與「系統」下拉紀錄
 * ============================================================ */

// ── 開啟／關閉 ─────────────────────────────────────────────
function openEventModal(title) {
  $('eventModalTitle').textContent = title;
  updateColorPreview();
  renderColorHistory();
  renderCatChips();
  openModal('eventModal');
}
function openNewEvent(start, end) {
  editingId = null; editKind = 'main'; selectedCat = null;
  writeTrpg(null);
  $('evTitle').value = ''; $('evMemo').value = ''; $('evPeople').value = '';
  $('lblMemo').textContent = '備註';
  $('evStart').value = start; $('evEnd').value = end;
  setTime('evStartTime', ''); setTime('evEndTime', '');
  $('evColor1').value = DEFAULT_EVENT_COLORS.c1; $('evColor2').value = DEFAULT_EVENT_COLORS.c2;
  $('evNoBlock').checked = false;
  $('deleteEvBtn').hidden = true;
  $('btnCopyEv').hidden = true; // 還沒存過的行程沒有「複製」
  setColorMode('solid');
  loadSync();
  openEventModal('新增行程');
  setTimeout(() => $('evTitle').focus(), 100);
}
function openEditEvent(id, kind = 'main') {
  const ev = listOf(kind).find((x) => x.id === id);
  if (!ev) return;
  editingId = id; editKind = kind; selectedCat = ev.category || null;
  writeTrpg(ev.trpg);
  // 直播行程的行程：這欄是「說明」（顯示在直播行程下方的小字，存在 detail）；行事曆的行程是私人「備註」（存在 memo、不會上直播）
  $('lblMemo').textContent = kind === 'stream' ? '說明（顯示在直播行程下方）' : '備註';
  $('evTitle').value = ev.title; $('evMemo').value = (kind === 'stream' ? ev.detail : ev.memo) || ''; $('evPeople').value = (ev.people || []).join('\n');
  $('evStart').value = ev.start; $('evEnd').value = ev.end;
  setTime('evStartTime', ev.startTime || ''); setTime('evEndTime', ev.endTime || '');
  $('evColor1').value = ev.color1 || DEFAULT_EVENT_COLORS.c1; $('evColor2').value = ev.color2 || DEFAULT_EVENT_COLORS.c2;
  $('evNoBlock').checked = !!ev.noBlock;
  $('deleteEvBtn').hidden = false;
  $('btnCopyEv').hidden = false;
  setColorMode(ev.colorMode || 'solid');
  loadSync();
  openEventModal(kind === 'stream' ? '編輯直播行程（只改直播行程這份）' : '編輯行程');
}
const closeEventModal = () => closeModal('eventModal');

// 讀取表單內容（尚未含 id）；資料有問題時提示並回傳 null。不會修改任何資料。
function readEventForm() {
  let s = $('evStart').value, e = $('evEnd').value;
  if (!s) { toast('請選擇開始日'); return null; }
  if (!e) e = s;
  if (s > e) [s, e] = [e, s];
  let st = getTime('evStartTime'), et = getTime('evEndTime');
  if (s === e && st && et && st > et) [st, et] = [et, st]; // 同一天時，結束時間不早於開始時間

  const trpg = catIsTrpg(selectedCat) ? readTrpg() : null;
  const title = $('evTitle').value.trim();
  return {
    // 標題留空：有 TRPG 資訊時由它顯示，否則記為「（未命名）」
    title: title || (trpgText(trpg) ? '' : '（未命名）'),
    memo: $('evMemo').value,
    people: parsePeople($('evPeople').value),
    noBlock: $('evNoBlock').checked,
    start: s, end: e, colorMode, color1: $('evColor1').value, color2: $('evColor2').value,
    startTime: st, endTime: et,
    category: categories.some((x) => x.id === selectedCat) ? selectedCat : '',
    trpg,
  };
}
// ── 同步到另一份行程（行事曆 ⇄ 直播行程）──────────────────────
// 兩邊靠直播行程的 sourceId（＝行事曆行程 id）對應；沒勾就各改各的，不會動到另一邊
function counterpartOf(kind, id) {
  if (!id) return null;
  if (kind === 'main') return streamEvents.find((e) => e.sourceId === id) || null;
  const src = streamEvents.find((e) => e.id === id);
  return (src && src.sourceId && events.find((e) => e.id === src.sourceId)) || null;
}
function loadSync() {
  const other = editKind === 'main' ? '直播行程' : '私人行程', cp = counterpartOf(editKind, editingId);
  $('lblSync').textContent = cp ? `同步修改另一邊（${other}）對應的行程` : `同時新增到${other}`;
  $('syncHint').textContent = cp ? '已經有對應的行程；勾選會一起更新（標題、日期、時間、同行者、顏色…），備註與說明不會被覆蓋。' : '勾選後會在另一邊建立一份複本，之後可以選擇是否同步。';
  $('evSync').checked = false; // 一律預設不勾，要同步才自己勾

}
// 把表單內容同步到另一邊；備註（私人）與說明（公開）不互相複製
function syncCounterpart(form, data) {
  const toStream = editKind === 'main', list = toStream ? streamEvents : events;
  const cp = counterpartOf(editKind, editingId), shared = { ...form };
  delete shared.memo;
  if (cp) { Object.assign(cp, shared); if (toStream) materializeTrpg(cp); return; }
  const copy = { id: uid(), memo: '', ...shared };
  if (toStream) { copy.detail = ''; copy.sourceId = data.id; } else data.sourceId = copy.id;
  if (toStream) materializeTrpg(copy);
  list.push(copy);
}

function saveEvent() {
  const form = readEventForm();
  if (!form) return;
  if (form.trpg && form.trpg.system) rememberSystem(form.trpg.system);
  const list = listOf(editKind);
  const idx = editingId ? list.findIndex((x) => x.id === editingId) : -1;
  const data = { id: editingId || uid(), ...form };
  if (editKind === 'stream') { data.detail = form.memo; data.memo = idx > -1 ? (list[idx].memo || '') : ''; materializeTrpg(data); }
  if (idx > -1 && list[idx].sourceId) data.sourceId = list[idx].sourceId; // 直播行程複本要記得來源
  const doSync = $('evSync').checked;
  if (doSync) syncCounterpart(form, data); // 先處理：直播行程新增時要把 sourceId 寫進 data
  if (idx > -1) list[idx] = data; else list.push(data);
  pushColorHistory(colorMode, data.color1, data.color2);
  saveList(editKind);
  if (doSync) saveList(editKind === 'main' ? 'stream' : 'main');
  closeEventModal();
  refreshViews();
  toast(doSync ? '已儲存，並同步到另一邊' : '已儲存');
}

// ── 複製到其他日期 ─────────────────────────────────────────
// 以目前表單內容（含尚未儲存的修改）建立一筆新行程，天數與時間不變，只換開始日。
// 複製後行程視窗維持開啟，可以繼續複製到別的日期。
function openCopyDialog() {
  const form = readEventForm();
  if (!form) return;
  const days = diffDays(form.start, form.end) + 1;
  $('copyInfo').textContent = `「${evName(form)}」${fmtRange(form.start, form.end)}（共 ${days} 天）`;
  $('copyTarget').value = addDays(form.start, 7); // 預設下一週，方便改成其他月份
  openModal('copyModal');
  setTimeout(() => $('copyTarget').focus(), 100);
}
function confirmCopy() {
  const form = readEventForm();
  const target = $('copyTarget').value;
  if (!form) return;
  if (!target) { toast('請選擇要複製到哪一天'); return; }
  // 複製出來的是獨立的新行程，不繼承「來源」
  const copy = { id: uid(), ...form, start: target, end: addDays(target, diffDays(form.start, form.end)) };
  if (editKind === 'stream') { copy.detail = form.memo; copy.memo = ''; }
  if (copy.trpg && copy.trpg.system) rememberSystem(copy.trpg.system);
  listOf(editKind).push(copy);
  saveList(editKind);
  closeModal('copyModal');
  refreshViews();
  toast(`已複製到 ${fmtRange(copy.start, copy.end)}`);
}
function deleteEvent() {
  if (!editingId) return;
  const list = listOf(editKind);
  list.splice(list.findIndex((x) => x.id === editingId), 1);
  saveList(editKind);
  closeEventModal();
  refreshViews();
  toast('已刪除');
}

// ── 24 小時制時間選擇器 ────────────────────────────────────
// 小時 00–24、分鐘 5 分一格（24 時只能 00），小時選「--」＝未填
function buildTimePick(id) {
  const hours = [el('option', { value: '', text: '--' })];
  for (let h = 0; h <= 24; h++) hours.push(el('option', { value: pad2(h), text: pad2(h) }));
  const mins = [];
  for (let m = 0; m < 60; m += 5) mins.push(el('option', { value: pad2(m), text: pad2(m) }));
  const h = el('select', { id: id + 'H', ariaLabel: '時' }, ...hours);
  const m = el('select', { id: id + 'M', ariaLabel: '分' }, ...mins);
  $(id).replaceChildren(h, el('span', { text: ':' }), m);
  h.addEventListener('change', () => {
    if (h.value === '24') m.value = '00';
    m.disabled = h.value === '' || h.value === '24';
  });
}
function setTime(id, v) {
  const h = $(id + 'H'), m = $(id + 'M');
  const [hh, mm] = v ? v.split(':') : ['', '00'];
  h.value = hh;
  if (mm && ![...m.options].some((o) => o.value === mm)) m.add(new Option(mm, mm)); // 保留非 5 分倍數的舊資料
  m.value = mm || '00';
  m.disabled = hh === '' || hh === '24';
}
function getTime(id) {
  const h = $(id + 'H').value;
  return h === '' ? '' : `${h}:${$(id + 'M').value || '00'}`;
}

// ── 顏色 ───────────────────────────────────────────────────
function setColorMode(mode) {
  colorMode = mode;
  $('tabSolid').classList.toggle('active', mode === 'solid');
  $('tabGrad').classList.toggle('active', mode === 'gradient');
  $('color2Wrap').hidden = mode !== 'gradient';
  updateColorPreview();
}
function updateColorPreview() {
  const c1 = $('evColor1').value, c2 = $('evColor2').value;
  $('colorPreview').style.background = colorMode === 'gradient' ? gradientCss(c1, c2) : c1;
}
function applyColors(mode, c1, c2) {
  setColorMode(mode);
  $('evColor1').value = c1; $('evColor2').value = c2;
  updateColorPreview();
}
function pushColorHistory(mode, c1, c2) {
  colorHistory = colorHistory.filter((h) => !(h.mode === mode && h.c1 === c1 && h.c2 === c2));
  colorHistory.unshift({ mode, c1, c2 });
  colorHistory = colorHistory.slice(0, COLOR_HISTORY_MAX);
  save(KEY.colorHist, colorHistory);
}
function renderColorHistory() {
  const row = $('colorHistoryRow');
  if (!colorHistory.length) { row.innerHTML = '<span class="empty-note">尚無紀錄</span>'; return; }
  row.replaceChildren(...colorHistory.map((h) => {
    const grad = h.mode === 'gradient';
    const sw = el('div', {
      class: 'history-swatch' + (grad ? ' grad' : ''),
      title: grad ? `${h.c1} → ${h.c2}` : h.c1,
      onclick: () => applyColors(h.mode, h.c1, h.c2),
    });
    sw.style.background = grad ? gradientCss(h.c1, h.c2) : h.c1;
    return sw;
  }));
}

// ── 類別 ───────────────────────────────────────────────────
function renderCatChips() {
  const box = $('catChips');
  if (!categories.length) {
    box.innerHTML = '<span class="empty-note">尚無類別，可按「管理類別」新增</span>';
  } else {
    box.replaceChildren(...categories.map((c) => {
      const dot = el('i');
      dot.style.background = catBg(c);
      return el('button', {
        type: 'button',
        class: 'cat-chip' + (c.id === selectedCat ? ' active' : ''),
        onclick: () => {
          selectedCat = selectedCat === c.id ? null : c.id; // 再點一次＝取消類別（顏色不變）
          if (selectedCat) applyColors(c.mode, c.c1, c.c2);
          renderCatChips();
        },
      }, dot, c.name || '（未命名）');
    }));
  }
  updateTrpgFields();
}

// 管理視窗中的一列：改名／改色／漸層／TRPG 欄位／刪除，變更即時存檔
function renderCatRow(c) {
  const name = el('input', { type: 'text', value: c.name, placeholder: '類別名稱' });
  const c1 = el('input', { type: 'color', value: c.c1 });
  const c2 = el('input', { type: 'color', value: c.c2 });
  const tag = el('input', {
    type: 'text', class: 'cat-tag', value: c.tag || '', placeholder: '標題前綴', maxLength: 12,
    title: '填了之後，此類別行程的標題前會自動加【前綴】，例如填「實況」→【實況】標題',
  });
  const grad = el('input', { type: 'checkbox', checked: c.mode === 'gradient' });
  const tr = el('input', { type: 'checkbox', checked: !!c.trpg });
  const preview = el('div', { class: 'cat-preview' });
  const sync = () => {
    Object.assign(c, { name: name.value, c1: c1.value, c2: c2.value, mode: grad.checked ? 'gradient' : 'solid', trpg: tr.checked, tag: tag.value.trim() });
    c2.hidden = !grad.checked;
    preview.style.background = catBg(c);
    saveCategories();
  };
  [name, c1, c2, grad, tr, tag].forEach((input) => input.addEventListener('input', sync));
  sync();
  const del = el('button', {
    type: 'button', class: 'cat-del', text: '×', title: '刪除',
    onclick: () => {
      categories = categories.filter((x) => x.id !== c.id);
      if (selectedCat === c.id) selectedCat = null;
      saveCategories();
      renderCatList();
    },
  });
  return el('div', { class: 'cat-row' },
    name, c1,
    el('label', { class: 'cat-grad' }, grad, '漸層'), c2, preview,
    el('label', { class: 'cat-grad', title: '勾選後，此類別的行程可填 GM／系統／劇本名' }, tr, 'TRPG 欄位'),
    tag, del);
}
function renderCatList() {
  const list = $('catList');
  if (!categories.length) { list.innerHTML = '<span class="empty-note">尚無類別</span>'; return; }
  list.replaceChildren(...categories.map(renderCatRow));
}
// 類別的改動都是即時存檔的，所以「完成」、點背景、Esc 都是同一件事：關掉並更新行程視窗的類別晶片
function closeCatModal() { closeModal('catModal'); renderCatChips(); }
function addCategory() {
  categories.push({ id: uid(), name: '新類別', mode: 'solid', c1: DEFAULT_EVENT_COLORS.c1, c2: DEFAULT_EVENT_COLORS.c2 });
  saveCategories();
  renderCatList();
  const inputs = $('catList').querySelectorAll('input[type="text"]');
  const last = inputs[inputs.length - 1];
  if (last) { last.focus(); last.select(); }
}

// ── TRPG 資訊 ──────────────────────────────────────────────
const readTrpg = () => ({ gm: $('trpgGm').value.trim(), system: $('trpgSystem').value.trim(), script: $('trpgScript').value.trim() });
function writeTrpg(t) {
  $('trpgGm').value = (t && t.gm) || '';
  $('trpgSystem').value = (t && t.system) || '';
  $('trpgScript').value = (t && t.script) || '';
  updateTrpgFields();
}
function updateTrpgFields() {
  $('trpgFields').hidden = !catIsTrpg(selectedCat);
  $('trpgPreview').textContent = trpgText(readTrpg()) || '（填寫後會在這裡預覽顯示樣式）';
  updateNamePreview();
}
// 標題欄下方的「顯示為」預覽：套用類別前綴、TRPG 組合文字、同行者之後，行程在月曆上實際的樣子
function updateNamePreview() {
  const cat = categories.some((c) => c.id === selectedCat) ? selectedCat : '';
  const shown = evName({
    title: $('evTitle').value.trim(), category: cat,
    trpg: catIsTrpg(cat) ? readTrpg() : null, people: parsePeople($('evPeople').value),
  });
  $('namePreview').textContent = `顯示為：${shown}`;
}
function rememberSystem(name) {
  trpgSystems = [name, ...trpgSystems.filter((x) => x !== name)].slice(0, SYSTEM_HISTORY_MAX);
  save(KEY.systems, trpgSystems);
}
// 「系統」欄：可自由輸入，也可從填寫過的紀錄下拉選取（紀錄可個別刪除）
function initSystemCombo() {
  const inp = $('trpgSystem'), panel = $('sysPanel');
  const close = () => { panel.hidden = true; };
  const render = (filter) => {
    const q = (filter || '').toLowerCase();
    const list = trpgSystems.filter((s) => !q || s.toLowerCase().includes(q));
    if (!list.length) {
      panel.innerHTML = `<div class="sys-empty">${trpgSystems.length ? '沒有符合的紀錄' : '還沒有紀錄，填寫過的系統會自動保存'}</div>`;
      return;
    }
    panel.replaceChildren(...list.map((s) => el('div', { class: 'sys-item' },
      el('span', { text: s, onclick: () => { inp.value = s; updateTrpgFields(); close(); } }),
      el('button', {
        type: 'button', text: '×', title: '從紀錄中刪除',
        onclick: (e) => {
          e.stopPropagation();
          trpgSystems = trpgSystems.filter((x) => x !== s);
          save(KEY.systems, trpgSystems);
          render(filter);
        },
      }))));
  };
  $('btnSysDrop').addEventListener('click', () => {
    if (panel.hidden) { render(''); panel.hidden = false; } else close();
  });
  inp.addEventListener('input', () => { if (trpgSystems.length) { render(inp.value); panel.hidden = false; } });
  inp.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  document.addEventListener('click', (e) => { if (!e.target.closest('.combo')) close(); });
}
