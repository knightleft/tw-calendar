'use strict';

/* ============================================================
 * 通用的「勾選行程」清單：匯出、直播行程「選擇行程」共用
 * cfg = {
 *   listEl, catsEl     放清單／類別快速鈕的容器
 *   isOn(ev)           這筆行程目前是否勾選
 *   setOn(ids, on)     把一批行程設為勾選／取消
 *   onChange()         勾選狀態改變後（更新數量、重畫等）
 *   items()            （選填）要列出哪些行程，預設是全部（依日期排序）
 *   tag(ev)            （選填）接在名稱後面的小標記，例如「（已匯入）」
 * }
 * ============================================================ */

const sortedEvents = () => [...events].sort((a, b) => (a.start + (a.startTime || '')).localeCompare(b.start + (b.startTime || '')));
const eventDateText = (ev) => ev.start.replace(/-/g, '/') + (ev.end !== ev.start ? `～${fmtRange(ev.end, ev.end)}` : '');

function renderPicker(cfg) {
  const list = cfg.items ? cfg.items() : sortedEvents();
  cfg.listEl.replaceChildren(...list.map((ev) => {
    const dot = el('i', { class: 'day-dot' });
    dot.style.background = eventBg(ev);
    const box = el('input', {
      type: 'checkbox', checked: cfg.isOn(ev),
      onchange: () => { cfg.setOn([ev.id], box.checked); cfg.onChange(); },
    });
    return el('label', { class: 'exp-row' }, box, dot,
      el('span', { class: 'exp-date', text: eventDateText(ev) }), el('span', { class: 'exp-name', text: evName(ev) }),
      ...(cfg.tag && cfg.tag(ev) ? [el('span', { class: 'exp-tag', text: cfg.tag(ev) })] : []));
  }));

  // 依類別一次勾選／取消
  const catOf = (ev) => (categories.some((c) => c.id === ev.category) ? ev.category : '');
  const groups = [...categories.map((c) => ({ id: c.id, name: c.name || '（未命名）', bg: catBg(c) })), { id: '', name: '無類別', bg: 'transparent' }]
    .map((g) => ({ ...g, ids: list.filter((ev) => catOf(ev) === g.id).map((ev) => ev.id) }))
    .filter((g) => g.ids.length);
  cfg.catsEl.replaceChildren(...groups.map((g) => {
    const dot = el('i');
    dot.style.background = g.bg;
    return el('button', {
      type: 'button', class: 'cat-chip', title: '點一下：整個類別一起勾選／取消',
      onclick: () => {
        const allOn = g.ids.every((id) => cfg.isOn(eventById(id)));
        cfg.setOn(g.ids, !allOn);
        renderPicker(cfg);
      },
    }, dot, `${g.name} (${g.ids.length})`);
  }));
  cfg.onChange();
}
const pickedCount = (cfg) => events.filter(cfg.isOn).length;

// 發現重複時的確認視窗：items = [{ id, title, when, diff }]；回傳 Promise<要覆蓋的 id 集合>，按「取消」回傳 null（整個動作取消）
// 每筆列出「目前 → 新的」有差異的項目，預設都勾覆蓋，使用者可逐筆取消（取消勾選＝保留目前的、不新增）
function askOverwrite(items, { intro, oldLabel, newLabel }) {
  return new Promise((resolve) => {
    const boxes = new Map();
    const count = () => { const n = [...boxes.values()].filter((b) => b.checked).length; $('dupCount').textContent = `覆蓋 ${n} / ${items.length} 筆`; };
    const finish = (value) => { $('dupDo').onclick = $('dupCancel').onclick = $('dupAll').onclick = $('dupNone').onclick = null; $('dupModal').onclick = null; modalClosers.delete('dupModal'); closeModal('dupModal'); resolve(value); };
    $('dupIntro').textContent = intro;
    $('dupList').replaceChildren(...items.map((it) => {
      const box = el('input', { type: 'checkbox', checked: true, onchange: count });
      boxes.set(it.id, box);
      return el('div', { class: 'dup-card' },
        el('label', { class: 'check-line' }, box, el('b', { text: it.title }), el('span', { class: 'hint', text: it.when })),
        el('table', { class: 'dup-diff' },
          el('tr', {}, el('th', { text: '項目' }), el('th', { text: oldLabel }), el('th', { text: newLabel })),
          ...it.diff.map(([label, a, b]) => el('tr', {}, el('td', { text: label }), el('td', { class: 'dup-old', text: a }), el('td', { class: 'dup-new', text: b })))));
    }));
    $('dupAll').onclick = () => { boxes.forEach((b) => { b.checked = true; }); count(); };
    $('dupNone').onclick = () => { boxes.forEach((b) => { b.checked = false; }); count(); };
    $('dupDo').onclick = () => finish(new Set([...boxes].filter(([, b]) => b.checked).map(([id]) => id)));
    $('dupCancel').onclick = () => finish(null);
    modalClosers.set('dupModal', () => finish(null)); // 按 Esc＝取消
    $('dupModal').onclick = (e) => { if (e.target === e.currentTarget) finish(null); }; // 點背景＝取消
    count();
    openModal('dupModal');
  });
}
