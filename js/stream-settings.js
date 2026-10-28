'use strict';

/* ============================================================
 * 直播行程「⚙ 版面設定」面板（固定在直播畫面左側，不是跳出視窗）
 * 區段：文字／日程／配色／社群／圖片／版面／每天的設定（目前這一週）
 * 所有欄位改了立即套用到畫面並存檔（不用按確定）。
 * ============================================================ */

// ── 欄位小元件 ─────────────────────────────────────────────
function ssSet(key, value) {
  streamSettings[key] = value;
  saveStreamSettings();
  renderStreamView();
}
const ssRow = (label, ...controls) => el('div', { class: 'ss-row' }, el('label', { text: label }), el('div', { class: 'ss-ctl' }, ...controls));

// 單行文字欄與多行文字欄共用同一段：tag 是 'input' 或 'textarea'
function ssTextField(key, label, tag, props) {
  const input = el(tag, props);
  input.value = streamSettings[key];
  input.addEventListener('input', () => ssSet(key, input.value));
  return ssRow(label, input);
}
const ssText = (key, label, placeholder = '') => ssTextField(key, label, 'input', { type: 'text', placeholder });
const ssArea = (key, label, placeholder = '') => ssTextField(key, label, 'textarea', { rows: 4, placeholder });
function ssSelect(key, label, options) { // options: [[值, 文字], …]
  const sel = el('select', {}, ...options.map(([v, t]) => el('option', { value: v, text: t })));
  sel.value = streamSettings[key];
  sel.addEventListener('change', () => ssSet(key, sel.value));
  return ssRow(label, sel);
}
function ssCheck(key, label) {
  const box = el('input', { type: 'checkbox', checked: !!streamSettings[key] });
  box.addEventListener('change', () => ssSet(key, box.checked));
  return el('div', { class: 'ss-row' }, el('label', { class: 'check-line' }, box, label));
}
function ssRange(key, label, min = 0, max = 100, unit = '%') {
  const out = el('span', { class: 'ss-val', text: `${streamSettings[key]}${unit}` });
  const input = el('input', { type: 'range', min, max, value: streamSettings[key] });
  input.addEventListener('input', () => { out.textContent = `${input.value}${unit}`; ssSet(key, Number(input.value)); });
  return ssRow(label, input, out);
}
// 顏色欄：色盤＋HEX；allowAuto 時多一顆「自動」鈕（清成預設）
function ssColor(key, label, allowAuto) {
  const color = el('input', { type: 'color', value: streamSettings[key] || '#444444' });
  const box = el('div', { class: 'ss-color' }, color);
  color.addEventListener('input', () => ssSet(key, color.value));
  if (allowAuto) {
    box.appendChild(btn('自動', () => { color.value = '#444444'; ssSet(key, ''); }, 'color-tab small', { title: '改回自動（跟著一般配色）' }));
  }
  return ssRow(label, box);
}

// 讀圖片並縮小（長邊 max px）；PNG 保留透明，其他轉 JPEG
async function readImage(file, max, asPng) {
  const img = new Image();
  img.src = await blobToDataUrl(file);
  await img.decode();
  const r = Math.min(1, max / Math.max(img.width, img.height));
  const cv = el('canvas', { width: Math.round(img.width * r), height: Math.round(img.height * r) });
  cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
  return asPng ? cv.toDataURL('image/png') : cv.toDataURL('image/jpeg', 0.85);
}
// 圖片區：圓形頭像（縮放、位置）、背景圖（位置、大小、透明度）、取色圖；三張圖可互相套用
function ssImageBlock(key, label, hint, max, asPng, copies, sliders, after) {
  const cur = () => streamSettings[key];
  const thumb = el('img', { class: 'ss-thumb', alt: '', hidden: !cur(), src: cur() || '' });
  const file = el('input', { type: 'file', accept: 'image/*', hidden: true });
  const pick = btn(cur() ? '更換圖片' : '選擇圖片', () => file.click());
  const clear = btn('移除', null, 'color-tab small', { hidden: !cur() });
  const setImage = async (data) => {
    const prev = cur();
    streamSettings[key] = data;
    if (!save(KEY.streamSet, streamSettings)) { streamSettings[key] = prev; toast('圖片太大，無法儲存'); return; }
    if (after && data) await after(data);
    renderStreamView(); buildStreamSettings();
  };
  const useFile = async (f) => { try { await setImage(await readImage(f, max, asPng)); } catch (e) { toast('無法讀取這張圖片'); } };
  file.addEventListener('change', () => { const f = file.files[0]; file.value = ''; if (f) useFile(f); });
  clear.addEventListener('click', () => setImage(''));
  const copyBtns = copies.map(([from, text]) => btn(`↺ ${text}`, () => { if (!streamSettings[from]) { toast('那張圖片還沒設定'); return; } setImage(streamSettings[from]); }));
  const block = el('div', { class: 'ss-img-block' },
    el('div', { class: 'ss-img-title', text: label }), el('div', { class: 'ss-hint', text: `${hint}也可以直接把圖片拖進來。` }),
    el('div', { class: 'ss-ctl' }, thumb, pick, clear, file),
    ...(copyBtns.length ? [el('div', { class: 'ss-ctl' }, ...copyBtns)] : []),
    ...(cur() ? sliders : []));
  onImageDrop(block, useFile);
  return block;
}
function ssImageSection() {
  const fromPal = async (data) => { applyPaletteQuiet(await paletteFromImage(data)); };
  return [
    ssImageBlock('avatar', '圓形圖像（頭像／Logo）', '顯示在標題旁，圓形裁切。', 256, true, [['bgImage', '使用背景圖'], ['palImg', '使用取色圖']],
      [ssRange('avatarZoom', '縮放', 100, 300, '%'), ssRange('avatarX', '橫向位置', 0, 100), ssRange('avatarY', '縱向位置', 0, 100)]),
    ssImageBlock('bgImage', '背景圖（蓋過一般背景）', '當作整張圖的背景，建議調低不透明度。', 1600, false, [['avatar', '使用圓形圖像'], ['palImg', '使用取色圖']],
      [ssRange('bgX', '橫向位置', 0, 100), ssRange('bgY', '縱向位置', 0, 100), ssRange('bgSize', '大小', 10, 300, '%'), ssRange('bgOpacity', '不透明度', 10, 100)]),
    ssImageBlock('palImg', '取色圖', '從這張圖抽出顏色放進日卡片的配色（選圖後立刻套用）。', 200, true, [['avatar', '使用圓形圖像'], ['bgImage', '使用背景圖']], [], fromPal),
  ];
}

// ── 配色工具 ───────────────────────────────────────────────
function hslHex(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
  return '#' + [f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, '0')).join('');
}
function randomPalette() {
  const h = Math.floor(Math.random() * 360);
  return { colors: [hslHex(h, 80, 88), hslHex((h + 40) % 360, 75, 90), hslHex((h + 200) % 360, 65, 92)], title: hslHex(h, 45, 28), bg: hslHex(h, 60, 96) };
}
// 從圖片取出最常出現的 3 種（彼此夠不一樣的）顏色
function paletteFromImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = reject;
    img.onload = () => {
      const cv = el('canvas', { width: 48, height: 48 });
      const ctx = cv.getContext('2d');
      ctx.drawImage(img, 0, 0, 48, 48);
      const px = ctx.getImageData(0, 0, 48, 48).data, buckets = {};
      for (let i = 0; i < px.length; i += 4) {
        if (px[i + 3] < 128) continue; // 透明的不算
        const key = `${px[i] >> 4},${px[i + 1] >> 4},${px[i + 2] >> 4}`;
        (buckets[key] = buckets[key] || { n: 0, r: 0, g: 0, b: 0 });
        buckets[key].n++; buckets[key].r += px[i]; buckets[key].g += px[i + 1]; buckets[key].b += px[i + 2];
      }
      const ranked = Object.values(buckets).sort((a, b) => b.n - a.n).map((b) => [Math.round(b.r / b.n), Math.round(b.g / b.n), Math.round(b.b / b.n)]);
      const picked = [];
      for (const c of ranked) {
        if (picked.every((p) => Math.abs(p[0] - c[0]) + Math.abs(p[1] - c[1]) + Math.abs(p[2] - c[2]) > 90)) picked.push(c);
        if (picked.length === 3) break;
      }
      while (picked.length < 3 && ranked.length) picked.push(ranked[picked.length % ranked.length]);
      resolve(picked.map(([r, g, b]) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')));
    };
    img.src = dataUrl;
  });
}
// 只換配色、不重畫面板（呼叫端自己會重畫）
function applyPaletteQuiet(colors, title, bg) {
  streamSettings.dayColors = colors.slice(0, 3);
  streamSettings.dayColorMode = 'rotate';
  if (title) streamSettings.titleColor = title;
  if (bg !== undefined) streamSettings.canvasBg = bg;
  saveStreamSettings();
}
function applyPalette(colors, title, bg) {
  applyPaletteQuiet(colors, title, bg);
  renderStreamView();
  buildStreamSettings(); // 重畫面板，色盤欄位才會更新
}

function ssPaletteSection() {
  const dot = (c) => { const i = el('i'); i.style.background = c; return i; };
  const apply = (p) => applyPalette(p.colors, p.title, p.bg);
  const rand = el('button', { type: 'button', class: 'ss-big-btn', text: '🎲 隨機配色', onclick: () => apply(randomPalette()) });
  const presets = el('div', { class: 'ss-presets' }, ...STREAM_PRESETS.map((p) => el('button', { type: 'button', class: 'ss-preset', title: p.name, onclick: () => apply(p) }, ...[...p.colors, p.bg].map(dot))));
  // 5 個色盤：日 1～3（日卡片輪替）、背景（畫布）、文字（標題與星期名）；原生色盤
  const swatch = (label, value, onInput) => {
    const color = el('input', { type: 'color', value });
    color.addEventListener('input', () => { onInput(color.value); saveStreamSettings(); renderStreamView(); });
    return el('label', { class: 'ss-swatch' }, color, el('span', { text: label }));
  };
  const swatches = el('div', { class: 'ss-swatch5' },
    ...[0, 1, 2].map((i) => swatch(`日 ${i + 1}`, streamSettings.dayColors[i], (v) => { streamSettings.dayColors[i] = v; streamSettings.dayColorMode = 'rotate'; })),
    swatch('背景', streamSettings.canvasBg || '#ffffff', (v) => { streamSettings.canvasBg = v; }),
    swatch('文字', streamSettings.titleColor || '#444444', (v) => { streamSettings.titleColor = v; }));
  const note = el('div', { class: 'ss-hint', text: '日 1～3 依序用在每天的卡片；背景＝畫布底色，文字＝標題與星期名。' });
  const mode = ssSelect('dayColorMode', '日卡片顏色', [['default', '跟著一般配色'], ['rotate', '輪替使用上面 3 種顏色']]);

  // 我的配色：把目前的 3 色＋背景＋文字色存起來（存在這個瀏覽器）
  const name = el('input', { type: 'text', class: 'ss-name', placeholder: '配色名稱', maxLength: 20 });
  const list = el('div', { class: 'ss-palettes' });
  const renderList = () => {
    list.replaceChildren(...streamPalettes.map((p) => el('div', { class: 'cp-item' },
      el('div', { class: 'ss-pal-sw', title: p.name, onclick: () => applyPalette(p.colors, p.title, p.bg) }, ...[...p.colors, ...(p.bg ? [p.bg] : [])].map(dot)),
      el('span', { text: p.name }),
      el('button', { type: 'button', text: '×', title: '刪除', onclick: () => { streamPalettes = streamPalettes.filter((x) => x.id !== p.id); save(KEY.streamPalettes, streamPalettes); renderList(); } }))));
    if (!streamPalettes.length) list.innerHTML = '<span class="empty-note">還沒有存過配色</span>';
  };
  renderList();
  const saveBtn = el('button', {
    type: 'button', class: 'ss-big-btn primary', text: '＋ 儲存目前配色',
    onclick: () => {
      streamPalettes.push({ id: uid(), name: name.value.trim() || `配色 ${streamPalettes.length + 1}`, colors: [...streamSettings.dayColors], title: streamSettings.titleColor, bg: streamSettings.canvasBg });
      save(KEY.streamPalettes, streamPalettes);
      name.value = '';
      renderList();
      toast('已儲存配色');
    },
  });
  return [rand, presets, swatches, note, mode,
    el('div', { class: 'ss-subtitle', text: '我的配色' }), el('div', { class: 'ss-hint', text: '先調整上面的色盤再儲存；只存在這個瀏覽器。' }), name, saveBtn, list];
}

// ── 每天的設定（目前這一週）────────────────────────────────
// 樣式參考 Stream Schedule Maker：每一天一張卡，直接編輯當天的直播內容（時間、標題、說明、第二場），
// 再加上休息日、這天的不透明度、強調、徽章、圖片貼紙。
const newStreamEvent = (ds) => ({
  id: uid(), title: '', memo: '', detail: '', start: ds, end: ds, startTime: '', endTime: '',
  colorMode: 'solid', color1: DEFAULT_EVENT_COLORS.c1, color2: DEFAULT_EVENT_COLORS.c2, category: '', trpg: null, people: [],
});
const dayStarts = (ds) => streamEvents.filter((e) => e.start === ds).sort(byStartTime); // 當天「開始」的直播行程

// 小時:分鐘 選擇器（24 小時制；「--」＝未填）。不依賴 id，可以在放進畫面前就建好。
function ssTimePick(value, onChange) {
  const hours = [el('option', { value: '', text: '--' }), ...Array.from({ length: 25 }, (_, h) => el('option', { value: pad2(h), text: pad2(h) }))];
  const mins = Array.from({ length: 12 }, (_, i) => el('option', { value: pad2(i * 5), text: pad2(i * 5) }));
  const h = el('select', { ariaLabel: '時' }, ...hours), m = el('select', { ariaLabel: '分' }, ...mins);
  const [hh, mm] = value ? value.split(':') : ['', '00'];
  h.value = hh;
  if (mm && ![...m.options].some((o) => o.value === mm)) m.add(new Option(mm, mm));
  m.value = mm || '00';
  m.disabled = hh === '' || hh === '24';
  h.addEventListener('change', () => { if (h.value === '24') m.value = '00'; m.disabled = h.value === '' || h.value === '24'; onChange(); });
  m.addEventListener('change', onChange);
  return { node: el('div', { class: 'time-pick' }, h, el('span', { text: ':' }), m), get: () => (h.value === '' ? '' : `${h.value}:${m.value || '00'}`) };
}

// 一組圖片貼紙（每張可調大小、旋轉、橫向、縱向）：get() 取目前的貼紙、set(陣列) 負責存檔與重畫畫面、canAdd() 決定能不能新增
// 拖動滑桿時只改畫面，不重畫這個設定卡，免得失去焦點
function ssStickerBox({ get, set, canAdd, hint, hideWhenEmpty }) {
  const list = el('div', { class: 'ss-stickers' }), file = el('input', { type: 'file', accept: 'image/*', hidden: true });
  const title = el('span'), addBtn = el('button', { type: 'button', class: 'color-tab small ss-add', text: '＋ 新增', onclick: () => file.click() });
  const patch = (i, p) => set(get().map((s, j) => (j === i ? { ...stickerOf(s), ...p } : s)));
  const slider = (label, unit, range, val, key, i) => {
    const out = el('span', { class: 'ss-val', text: String(val) }), input = el('input', { type: 'range', min: range.min, max: range.max, value: val });
    input.addEventListener('input', () => { out.textContent = input.value; patch(i, { [key]: Number(input.value) }); });
    return el('label', { class: 'ss-stk-slider' }, el('span', { class: 'ss-stk-lbl' }, label, ' ', out, unit), input);
  };
  const card = (st, i) => el('div', { class: 'ss-stk-card' },
    el('div', { class: 'ss-stk-row' },
      el('img', { src: st.src, alt: '' }),
      el('span', { class: 'ss-stk-name', text: `貼紙 ${i + 1}` }),
      el('button', { type: 'button', class: 'ss-stk-del', text: '刪除', onclick: () => { set(get().filter((_, j) => j !== i)); render(); } })),
    slider('大小', 'px', STICKER.size, st.size, 'size', i),
    slider('旋轉', '°', STICKER.rot, st.rot, 'rot', i),
    slider('橫向', '%', STICKER.x, st.x, 'x', i),
    slider('縱向（往上）', '%', STICKER.y, st.y, 'y', i),
    ssColorLine('外框顏色', st.bc, (v) => patch(i, { bc: v })).node,
    slider('外框厚度', 'px', STICKER.bw, st.bw, 'bw', i));
  const render = () => {
    const items = get();
    title.textContent = `🖼 圖片貼紙 · ${items.length}/${STICKER.max}`;
    addBtn.hidden = items.length >= STICKER.max || (hideWhenEmpty && !canAdd());
    box.hidden = !!hideWhenEmpty && !items.length;
    addBtn.disabled = !canAdd();
    addBtn.title = canAdd() ? '' : '先填時間或標題，才能加圖片';
    list.replaceChildren(...items.map((raw, i) => card(stickerOf(raw), i)));
  };
  // 新加的貼紙預設帶圓弧外框與陰影（舊貼紙的外框厚度是 0）
  const addFile = async (f) => {
    if (!canAdd() || get().length >= STICKER.max) { toast(canAdd() ? `最多 ${STICKER.max} 張` : '先填時間或標題，才能加圖片'); return; }
    try { set([...get(), { src: await readImage(f, 240, true), bw: STICKER.newBw }].slice(0, STICKER.max)); render(); } catch (e) { toast('無法讀取這張圖片'); }
  };
  file.addEventListener('change', () => { const f = file.files[0]; file.value = ''; if (f) addFile(f); });
  const box = el('div', { class: 'ss-line ss-stk-box' }, el('div', { class: 'ss-stk-head' }, title, addBtn), el('div', { class: 'ss-hint', text: hint || `每次直播最多 ${STICKER.max} 張 png／jpg（去背圖效果最好），會疊在這天的卡片上；也可以直接把圖片拖進來。` }), list, file);
  onImageDrop(box, addFile);
  render();
  return { render, node: box };
}

// 一個「場次」＝時間＋標題＋說明三欄（加上這一場的圖片貼紙），直接對應當天開始的一筆直播行程（沒有就先不建立，填了才建立；三欄都清空就移除）
function ssSlot(ds, index) {
  let ev = dayStarts(ds)[index] || null;
  const time = ssTimePick(ev ? ev.startTime : '', () => commit());
  const title = el('input', { type: 'text', value: ev ? ev.title : '', placeholder: ev && !ev.title ? evName(ev) : '標題（例：雜談）' });
  const detail = el('input', { type: 'text', value: ev ? ev.detail || '' : '', placeholder: '說明（例：輕鬆聊天）' });
  const stk = ssStickerBox({
    get: () => (ev && ev.stickers) || [],
    set: (arr) => { if (!ev) return; if (arr.length) ev.stickers = arr; else delete ev.stickers; saveStreamEvents(); renderStreamView(); },
    canAdd: () => !!ev,
  });
  function commit() {
    const t = title.value.trim(), st = time.get(), d = detail.value.trim();
    if (!t && !st && !d) {
      if (ev) { streamEvents.splice(streamEvents.indexOf(ev), 1); ev = null; }
    } else {
      if (!ev) { ev = newStreamEvent(ds); streamEvents.push(ev); }
      Object.assign(ev, { title: t, startTime: st, detail: d });
    }
    saveStreamEvents();
    renderStreamView();
    stk.render();
  }
  title.addEventListener('input', commit);
  detail.addEventListener('input', commit);
  return {
    node: el('div', { class: 'ss-slot' }, el('div', { class: 'ss-two' }, time.node, title), detail, stk.node),
    has: () => !!ev,
    remove: () => { if (ev) { streamEvents.splice(streamEvents.indexOf(ev), 1); ev = null; saveStreamEvents(); } },
  };
}

// 一排互斥的選項鈕（像附圖裡的「光暈／粗框／浮凸／陰影」）
function ssPills(options, current, onPick) {
  const box = el('div', { class: 'ss-pills' });
  const mark = (value) => box.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.value === value));
  options.forEach(([value, label]) => box.appendChild(el('button', {
    type: 'button', class: 'ss-pill', text: label, dataset: { value },
    onclick: () => { mark(value); onPick(value); },
  })));
  mark(current);
  return box;
}
// 「文字 … 色盤」一列（原生色盤）
function ssColorLine(label, value, onInput) {
  const color = el('input', { type: 'color', value });
  color.addEventListener('input', () => onInput(color.value));
  return { color, node: el('label', { class: 'ss-sub-row' }, el('span', { text: label }), color) };
}

function ssDay(ds) {
  const cfg = () => streamDays[ds] || {};
  const update = (patch) => {
    const next = { ...cfg(), ...patch };
    ['rest', 'highlight', 'badgeOn', 'hlFillOn'].forEach((k) => { if (!next[k]) delete next[k]; }); // 清掉空值與預設值，避免存一堆沒用的設定
    if (!next.badge) delete next.badge;
    if (!next.hlBg) delete next.hlBg;
    if (next.hlStyle === 'glow') delete next.hlStyle;
    if (next.badgeShape === 'pill') delete next.badgeShape;
    if (next.badgeSize === BADGE_SIZE.def) delete next.badgeSize;
    if (next.opacity == null) delete next.opacity;
    if (!next.stickers || !next.stickers.length) delete next.stickers;
    if (Object.keys(next).length) streamDays[ds] = next; else delete streamDays[ds];
    saveStreamDays();
    renderStreamView();
  };
  const dt = parseDs(ds), L = streamLang();
  // 一行「文字 … 勾選框」
  const toggleLine = (label, checked, onChange) => {
    const box = el('input', { type: 'checkbox', checked });
    box.addEventListener('change', () => onChange(box.checked));
    return { box, node: el('label', { class: 'ss-line ss-toggle' }, el('span', { text: label }), box) };
  };

  const rest = el('input', { type: 'checkbox', checked: !!cfg().rest });
  rest.addEventListener('change', () => update({ rest: rest.checked }));

  // 場次：第一場固定顯示；「第二場／第三場直播」勾選後才出現下一組欄位（每天最多 3 場）
  const ORDINAL = ['第二場直播', '第三場直播'];
  const slots = [ssSlot(ds, 0)];
  let shown = Math.min(3, Math.max(1, dayStarts(ds).length)); // 目前顯示幾場
  const moreBox = el('div', { class: 'ss-more' });
  const drawMore = () => {
    moreBox.replaceChildren();
    for (let k = 1; k <= Math.min(shown, 2); k++) {
      const on = k < shown;
      const line = toggleLine(ORDINAL[k - 1], on, (checked) => setShown(k, checked, line));
      moreBox.appendChild(line.node);
      if (on) { slots[k] = slots[k] || ssSlot(ds, k); moreBox.appendChild(el('div', { class: 'ss-second' }, slots[k].node)); }
    }
  };
  // 取消勾選會一併移除之後的場次；有內容時先確認
  const setShown = (k, checked, line) => {
    if (checked) { shown = k + 1; drawMore(); return; }
    const doomed = slots.slice(k, shown).filter((x) => x && x.has());
    if (doomed.length && !confirm(`要移除這天的${ORDINAL[k - 1]}${doomed.length > 1 ? '與之後的場次' : ''}嗎？（只影響直播行程，私人行程不受影響）`)) { line.box.checked = true; return; }
    slots.slice(k, shown).forEach((x) => x && x.remove());
    slots.length = k;
    shown = k;
    drawMore();
    renderStreamView();
  };
  drawMore();
  const slot1 = slots[0];
  const extra = dayStarts(ds).length - 3;

  // 這天的不透明度：預設「自動」（一般日 / 休息日各用版面設定裡的值），拉動滑桿才會單獨指定
  const opLabel = el('span', { text: cfg().opacity != null ? `這天的不透明度：${cfg().opacity}%` : '這天的不透明度：自動' });
  const opReset = btn('自動', null, 'color-tab small', { title: '改回自動', hidden: cfg().opacity == null });
  const range = el('input', { type: 'range', min: 0, max: 100, value: cfg().opacity != null ? cfg().opacity : 100 });
  range.addEventListener('input', () => { opLabel.textContent = `這天的不透明度：${range.value}%`; opReset.hidden = false; update({ opacity: Number(range.value) }); });
  opReset.addEventListener('click', () => { range.value = 100; opLabel.textContent = '這天的不透明度：自動'; opReset.hidden = true; update({ opacity: null }); });

  // ✨ 強調這一天：勾選後才出現「樣式、填滿色、框線顏色、背景圖片」
  const hlSub = el('div', { class: 'ss-sub', hidden: !cfg().highlight });
  const highlight = toggleLine('✨ 強調這一天', !!cfg().highlight, (on) => { hlSub.hidden = !on; update({ highlight: on }); });
  // 填滿色：同一列右邊是勾選框，勾了才會出現色盤（跟附圖一樣）
  const fillColor = el('input', { type: 'color', value: cfg().hlFill || '#ffffff', hidden: !cfg().hlFillOn });
  fillColor.addEventListener('input', () => update({ hlFill: fillColor.value }));
  const fillOn = el('input', { type: 'checkbox', checked: !!cfg().hlFillOn });
  fillOn.addEventListener('change', () => { fillColor.hidden = !fillOn.checked; update({ hlFillOn: fillOn.checked }); });
  const hlBgFile = el('input', { type: 'file', accept: 'image/*', hidden: true });
  const hlBgThumb = el('img', { class: 'ss-thumb', alt: '', hidden: !cfg().hlBg, src: cfg().hlBg || '' });
  const hlBgClear = btn('移除', null, 'color-tab small', { hidden: !cfg().hlBg });
  const syncHlBg = () => { hlBgThumb.hidden = hlBgClear.hidden = !cfg().hlBg; if (cfg().hlBg) hlBgThumb.src = cfg().hlBg; };
  const useHlBg = async (f) => { try { update({ hlBg: await readImage(f, 600, false) }); syncHlBg(); } catch (e) { toast('無法讀取這張圖片'); } };
  hlBgFile.addEventListener('change', () => { const f = hlBgFile.files[0]; hlBgFile.value = ''; if (f) useHlBg(f); });
  hlBgClear.addEventListener('click', () => { update({ hlBg: '' }); syncHlBg(); });
  const hlBgRow = el('div', { class: 'ss-sub-row ss-sub-col' }, el('span', { text: '背景圖片', title: '也可以直接把圖片拖進來' }),
    el('div', { class: 'ss-ctl' }, hlBgThumb, btn('上傳 PNG／JPG', () => hlBgFile.click()), hlBgClear, hlBgFile));
  onImageDrop(hlBgRow, useHlBg);
  hlSub.append(
    ssPills(HL_STYLES, cfg().hlStyle || 'glow', (v) => update({ hlStyle: v })),
    el('label', { class: 'ss-sub-row' }, el('span', { text: '填滿色' }), el('div', { class: 'ss-ctl' }, fillColor, fillOn)),
    ssColorLine('框線顏色', cfg().hlBorder || DEFAULT_EVENT_COLORS.c2, (v) => update({ hlBorder: v })).node,
    hlBgRow);

  // 🏷 強調徽章：勾選後才出現「文字、形狀、顏色、大小」
  const badgeSub = el('div', { class: 'ss-sub', hidden: !cfg().badgeOn });
  const badgeInput = el('input', { type: 'text', class: 'ss-badge', value: cfg().badge || '', placeholder: '徽章文字（例：生日！）', maxLength: 12 });
  badgeInput.addEventListener('input', () => update({ badge: badgeInput.value.trim() }));
  const bdSize = el('input', { type: 'range', min: BADGE_SIZE.min, max: BADGE_SIZE.max, value: cfg().badgeSize || BADGE_SIZE.def });
  const bdSizeVal = el('span', { class: 'ss-val', text: String(cfg().badgeSize || BADGE_SIZE.def) });
  bdSize.addEventListener('input', () => { bdSizeVal.textContent = bdSize.value; update({ badgeSize: Number(bdSize.value) }); });
  badgeSub.append(
    badgeInput,
    ssPills(BADGE_SHAPES, cfg().badgeShape || 'pill', (v) => update({ badgeShape: v })),
    el('div', { class: 'ss-sub-row' },
      ssColorLine('顏色', cfg().badgeColor || DEFAULT_EVENT_COLORS.c2, (v) => update({ badgeColor: v })).node,
      el('label', { class: 'ss-size' }, el('span', { text: '大小' }), bdSize, bdSizeVal)));
  const badge = toggleLine('🏷 強調徽章', !!cfg().badgeOn, (on) => { badgeSub.hidden = !on; update({ badgeOn: on }); if (on) badgeInput.focus(); });

  // 每張卡可收合：收合狀態用「星期幾」記著，換週也維持；收合時標題旁顯示當天的行程名稱
  const dow = dt.getDay(), first = dayStarts(ds)[0];
  const sum = el('span', { class: 'ss-day-sum', text: first ? `· ${evName(first)}` : '' });
  const arrow = el('span', { class: 'ss-day-arrow', text: '▾' });
  // 舊版「每天共用」的貼紙（當天沒有場次可以放的）：沒有地方可以編輯就會永遠卡在畫面上，所以有的話在這裡列出來，可以調整與刪除
  const legacy = (cfg().stickers || []).length ? ssStickerBox({ get: () => cfg().stickers || [], set: (arr) => update({ stickers: arr }), canAdd: () => false, hideWhenEmpty: true, hint: '舊版每天共用的貼紙（這天沒有直播場次可以放）。可以調整，或按「刪除」移除。' }) : null;
  const body = el('div', { class: 'ss-day-body' },
    slot1.node,
    moreBox,
    ...(legacy ? [legacy.node] : []),
    ...(extra > 0 ? [el('div', { class: 'ss-note', text: `這天還有 ${extra} 筆行程，請直接點週曆上的行程編輯。` })] : []),
    el('div', { class: 'ss-line ss-opacity' }, el('div', { class: 'ss-op-head' }, opLabel, opReset), range),
    highlight.node, hlSub,
    badge.node, badgeSub);
  const card = el('div', { class: 'ss-day' },
    el('div', { class: 'ss-day-head' },
      el('button', { type: 'button', class: 'ss-day-toggle', title: '收合／展開這一天' }, arrow, el('span', { text: `${L.dow[dow]}　${dt.getMonth() + 1}/${dt.getDate()}` }), sum),
      el('label', { class: 'ss-rest' }, el('span', { text: '休息日' }), rest)),
    body);
  const apply = () => {
    const closed = ssDayCollapsed.has(dow);
    body.hidden = closed; card.classList.toggle('collapsed', closed); sum.hidden = !closed; arrow.textContent = closed ? '▸' : '▾';
  };
  card.querySelector('.ss-day-toggle').addEventListener('click', () => { if (ssDayCollapsed.has(dow)) ssDayCollapsed.delete(dow); else ssDayCollapsed.add(dow); apply(); });
  apply();
  return card;
}
const ssDayCollapsed = new Set(); // 收合的星期（0～6），只記在這次開啟的頁面

// ── 組裝視窗 ───────────────────────────────────────────────
const ssSection = (title, rows, open) => el('details', { class: 'ss-sec', open: !!open }, el('summary', { text: title }), ...rows);

// 字型欄位：選「Google 字型」或「電腦裡的字型」才會出現名稱欄；電腦字型可按鈕讀取已安裝清單（瀏覽器支援才有）
function ssFontRows() {
  const fontSel = ssSelect('font', '字型', Object.entries(STREAM_FONTS).map(([k, v]) => [k, v.name]));
  const fontNameRow = ssText('fontName', '字型名稱', 'Google 字型名稱，例：Noto Sans JP');
  const fontList = el('datalist', { id: 'ssFontList' });
  fontNameRow.querySelector('input').setAttribute('list', 'ssFontList');
  const fontLocalRow = ssRow('', btn('讀取電腦字型清單', async () => {
    if (!window.queryLocalFonts) { toast('這個瀏覽器不能讀取字型清單，請直接輸入字型名稱'); return; }
    try {
      const names = [...new Set((await window.queryLocalFonts()).map((f) => f.family))].sort();
      fontList.replaceChildren(...names.map((n) => el('option', { value: n })));
      toast(`讀到 ${names.length} 個字型，點名稱欄選擇`);
    } catch (e) { toast('沒有取得讀取字型的權限，請直接輸入字型名稱'); }
  }), fontList);
  const showFontRows = () => {
    const f = streamSettings.font;
    fontNameRow.hidden = f !== 'google' && f !== 'local';
    fontLocalRow.hidden = f !== 'local';
    fontNameRow.querySelector('input').placeholder = f === 'local' ? '電腦裡的字型名稱，例：Microsoft JhengHei' : 'Google 字型名稱，例：Noto Sans JP';
  };
  showFontRows();
  fontSel.querySelector('select').addEventListener('change', showFontRows);
  return [fontSel, fontNameRow, fontLocalRow];
}

// 年度直播回顧的設定面板（年曆、月曆版面用；清單版面只供觀看，沒有設定）
function applyReviewPreset(p) {
  Object.assign(streamSettings, p.c);
  saveStreamSettings();
  renderStreamView();
  buildStreamSettings();
}
function buildReviewSettings() {
  $('spHead').querySelector('strong').textContent = '⚙ 年度回顧版面設定';
  $('spFoot').hidden = true;
  const openState = new Map([...$('ssBody').children].map((d) => [d.querySelector('summary').textContent, d.open]));
  const presets = el('div', { class: 'ss-pills' }, ...RV_PRESETS.map((p) => btn(p.name, () => applyReviewPreset(p), 'ss-pill')));
  const [fontSel, fontNameRow, fontLocalRow] = ssFontRows();
  $('ssBody').replaceChildren(
    ssSection('🎨 色系', [presets, ssColor('rvBg1', '背景色 1', true), ssColor('rvBg2', '背景色 2（兩色漸層；留空＝單色）', true), ssColor('rvText', '文字顏色', true), ssColor('rvCard', '卡片底色', true), ssColor('rvAccent', '強調色（有開台的日子、分類標籤）', true), el('div', { class: 'ss-hint', text: '「自動」＝跟著一般背景與配色。截圖輸出的就是這個樣子。' })], true),
    ssSection('🖼️ 背景圖', [ssImageBlock('rvBgImage', '背景圖', '鋪滿整張回顧圖，建議調高淡化，字才看得清楚。', 1600, false, [['bgImage', '使用直播專用背景圖']], [ssRange('rvBgFade', '淡化（蓋一層背景色）', 0, 90)])], true),
    ssSection('✏️ 文字', [ssText('rvTitle', '標題（留空＝「2026 年直播回顧」）', '例：我的 2026 直播'), ssText('rvSub', '副標題（留空＝不顯示）', '例：Senka* Weekly Schedule'), fontSel, fontNameRow, fontLocalRow]),
    ssSection('📐 版面', [ssSelect('rvCols', '年曆一列放幾個月', [['2', '2 個（格子大）'], ['3', '3 個'], ['4', '4 個（格子小）']]), ssCheck('rvStats', '顯示上方的統計（場數、天數、總時數、最常直播）'), ssCheck('rvSocials', '在圖的右下角加上社群小貼紙'), el('div', { class: 'ss-hint', text: socialPills(streamSettings).length ? '顯示哪幾個平台，在直播行程的版面設定勾選；帳號在「⚙ 設定 → 社群帳號」。' : '還沒填社群帳號：到「⚙ 設定 → 社群帳號」填寫後才會出現。' })]));
  openState.forEach((open, title) => { const d = [...$('ssBody').children].find((x) => x.querySelector('summary').textContent === title); if (d) d.open = open; });
}

function buildStreamSettings() {
  if (streamMode === 'log') { buildReviewSettings(); return; }
  $('spHead').querySelector('strong').textContent = '⚙ 直播行程版面設定';
  $('spFoot').hidden = false;
  // 重畫前記下各區段是否展開，重畫後還原
  const openState = new Map([...$('ssBody').children].map((d) => [d.querySelector('summary').textContent, d.open]));
  const jump = el('input', { type: 'date', value: streamAnchor });
  jump.addEventListener('change', () => { if (jump.value) { streamAnchor = jump.value; renderStreamView(); fillDaySettings(); } });
  const [fontSel, fontNameRow, fontLocalRow] = ssFontRows();
  const tzRow = ssSelect('tz', '時區標示（只標示，不換算）', Object.entries(STREAM_TZS).map(([k, v]) => [k, v.name]));
  const tzHint = el('div', { class: 'ss-hint' });
  const showTz = () => { tzHint.textContent = `顯示：${tzLabel() || '不顯示'}`; };
  showTz();
  tzRow.querySelector('select').addEventListener('change', showTz);
  $('ssBody').replaceChildren(
    ssSection('✏️ 文字', [
      ssText('title', '標題（最大的字）', '留空＝不顯示標題'),
      ssColor('titleColor', '標題顏色', true),
      ssRow('標題對齊', ssPills([['left', '左'], ['center', '中央'], ['right', '右']], streamSettings.titleAlign, (v) => ssSet('titleAlign', v))),
      ssText('eyebrow', '副標題（標題下方的小字）', '留空＝自動'),
      ssColor('eyebrowColor', '副標題顏色', true),
      ssRow('副標題對齊', ssPills([['left', '左'], ['center', '中央'], ['right', '右']], streamSettings.eyebrowAlign, (v) => ssSet('eyebrowAlign', v))),
      ssText('handle', '帳號／暱稱', '@your_name'),
      ssColor('handleColor', '帳號顏色', true),
      ssArea('note', '筆記（週曆多出的第 8 格，留空就不顯示）'),
      ssColor('noteColor', '筆記文字顏色', true),
      ssRange('noteSize', '筆記文字大小', 10, 48, 'px'),
      ssText('credit', '署名文字（位置在「日程」）', '例：Art by @someone'),
      ssText('restMsg', '休息日訊息', '留空＝自動（休息日）'),
      fontSel, fontNameRow, fontLocalRow,
      ssCheck('titleOutline', '文字描邊（標題、副標題、帳號、年份行一起）'),
      ssColor('titleOutlineColor', '描邊顏色', false),
      ssRange('titleOutlineWidth', '描邊粗細', 1, 8, 'px'),
    ], true),
    ssSection('📆 日程', [
      ssRow('開始日（跳到那一週／月）', jump),
      tzRow, tzHint,
      ssColor('tzColor', '年份與時區顏色（標題下方靠右那行）', true),
      ssRow('輸出語言', ssPills(Object.entries(STREAM_LANGS).map(([k, v]) => [k, v.name]), streamSettings.lang, (v) => ssSet('lang', v))),
      el('div', { class: 'ss-hint', text: '星期、日期與預設文字使用的語言；只影響預設文字，你自己改過的不會變。' }),
      ssRow('署名位置', ssPills([['left', '左'], ['center', '中央'], ['right', '右']], streamSettings.creditPos, (v) => ssSet('creditPos', v))),
    ]),
    ssSection('🎨 配色', ssPaletteSection()),
    ssSection('🔗 社群（勾選要顯示哪些）', [
      ...SOCIALS.map(([, icon, name, , key]) => {
        const acct = streamSettings[key].trim(), row = ssCheck(`${key}Show`, `${icon} ${name}　${acct || '（尚未填寫）'}`);
        row.querySelector('input').disabled = !acct;
        return row;
      }),
      el('div', { class: 'ss-hint', text: '帳號到「⚙ 設定 → 社群帳號」填一次就好。' }),
    ]),
    ssSection('🖼️ 圖片', ssImageSection()),
    ssSection('📐 版面', [
      ssSelect('style', '週曆樣式', [['grid', '格狀（7 欄）'], ['list', '清單（一天一列）'], ['vertical', '直式（一天一張卡）']]),
      ssSelect('corners', '邊角', [['rounded', '圓角'], ['pill', '膠囊'], ['sharp', '直角'], ['sticker', '貼紙風']]),
      ssSelect('aspect', '畫面比例（截圖大小）', [['auto', '自動（依內容）'], ['4:3', '4:3 · Twitter / Discord'], ['16:9', '16:9 · YouTube / 直播'], ['9:16', '9:16 · 限時動態 / Shorts']]),
      ssSelect('align', '行程文字對齊', [['left', '靠左'], ['center', '置中'], ['right', '靠右']]),
      ssRange('activeOpacity', '一般日的不透明度'),
      ssRange('restOpacity', '休息日的不透明度（在「每天的設定」勾了休息日才會套用）'),
      ssCheck('sparkles', '✨ 閃光裝飾'),
    ]),
    el('details', { class: 'ss-sec', id: 'ssDaysSec' }, el('summary', { id: 'ssDaysTitle' }), 
      el('div', { class: 'ss-days-tools' },
        btn('全部收合', () => { [0, 1, 2, 3, 4, 5, 6].forEach((d) => ssDayCollapsed.add(d)); fillDaySettings(); }),
        btn('全部展開', () => { ssDayCollapsed.clear(); fillDaySettings(); })),
      el('div', { id: 'ssDaysBody', class: 'ss-days' })),
  );
  fillDaySettings();
  openState.forEach((open, title) => { const d = [...$('ssBody').children].find((x) => x.querySelector('summary').textContent === title); if (d) d.open = open; });
}

// 「每天的設定」只跟著目前看的那一週走：換週時單獨重畫這一段（不動其他欄位，打字才不會中斷）
function fillDaySettings() {
  if (!$('ssDaysBody')) return;
  const start = weekStartOf(streamAnchor);
  $('ssDaysTitle').textContent = `📅 每天的設定（${start.slice(5).replace('-', '/')} 起這一週）`;
  $('ssDaysBody').replaceChildren(...Array.from({ length: 7 }, (_, i) => ssDay(addDays(start, i))));
}
// 面板：第一次進直播行程時建立；左側固定，可收合（記住上次的狀態）
let streamPanelBuilt = false;
function initStreamPanel() {
  if (!streamPanelBuilt) { buildStreamSettings(); streamPanelBuilt = true; }
  $('streamPanel').hidden = loadRaw(KEY.streamPanel) === '0';
}
function toggleStreamPanel(show = $('streamPanel').hidden) {
  $('streamPanel').hidden = !show;
  saveRaw(KEY.streamPanel, show ? '1' : '0');
}
function resetStreamSettings() {
  const review = streamMode === 'log';
  if (!confirm(review ? '要把年度直播回顧的版面設定還原成預設嗎？' : '要把直播行程的版面設定還原成預設嗎？（行程與每天的設定不受影響）')) return;
  if (review) RV_KEYS.forEach((k) => { streamSettings[k] = STREAM_DEFAULTS[k]; });
  else {
    const accounts = Object.fromEntries(SOCIALS.map(([, , , , key]) => [key, streamSettings[key]]));
    streamSettings = { ...clone(STREAM_DEFAULTS), ...accounts }; // 社群帳號是在設定選單填的，不跟著還原
  }
  saveStreamSettings();
  applyBgToDom();
  renderStreamView();
  buildStreamSettings();
  toast('已還原預設');
}

// 「⚙ 設定 → 社群帳號」：帳號只填這一份；直播行程的版面設定只勾選要顯示哪些
function openSocialModal() {
  $('socialBody').replaceChildren(...SOCIALS.map(([, icon, name, hint, key]) => el('div', { class: 'form-group' },
    el('label', { for: `soc_${key}`, text: `${icon} ${name}` }),
    el('input', { type: 'text', id: `soc_${key}`, value: streamSettings[key], placeholder: hint, autocomplete: 'off' }))));
  openModal('socialModal');
}
function saveSocialModal() {
  SOCIALS.forEach(([, , , , key]) => { streamSettings[key] = $(`soc_${key}`).value.trim(); });
  saveStreamSettings();
  closeModal('socialModal');
  renderStreamView();
  buildStreamSettings();
  toast('已儲存社群帳號');
}
