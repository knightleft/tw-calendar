'use strict';

/* ============================================================
 * 通用小工具：DOM、日期字串、顏色運算、儲存、提示、對話框、下載
 * 日期一律用 'YYYY-MM-DD' 字串（月份以 0 起算的參數會特別註明）
 * ============================================================ */

// ── DOM ────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

/**
 * 建立元素：el('div', { class: 'a', text: '…', dataset: {k: 'v'}, onclick: fn }, 子節點…)
 * 其他鍵一律當成元素屬性（property）直接設定。
 */
function el(tag, props = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (k === 'ariaLabel') node.setAttribute('aria-label', v);
    else node[k] = v;
  }
  kids.forEach((kid) => node.append(kid));
  return node;
}

const openModal = (id) => $(id).classList.add('open');
const closeModal = (id) => $(id).classList.remove('open');
const isModalOpen = (id) => $(id).classList.contains('open');

// ── 日期 ───────────────────────────────────────────────────
const pad2 = (n) => String(n).padStart(2, '0');
const dateStr = (y, m, d) => `${y}-${pad2(m + 1)}-${pad2(d)}`; // m 為 0 起算
const parseDs = (ds) => { const [y, m, d] = ds.split('-').map(Number); return new Date(y, m - 1, d); };
const toDs = (dt) => dateStr(dt.getFullYear(), dt.getMonth(), dt.getDate());
const addDays = (ds, n) => { const dt = parseDs(ds); dt.setDate(dt.getDate() + n); return toDs(dt); };
const diffDays = (a, b) => {
  const pa = a.split('-').map(Number), pb = b.split('-').map(Number);
  return Math.round((Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / 86400000);
};
const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
const dowOf = (y, m, d) => new Date(y, m, d).getDay(); // 0=日 … 6=六
const dowClass = (dw) => (dw === 0 ? 'sun' : dw === 6 ? 'sat' : '');
const fmtDay = (m, d, dw) => `${m + 1}/${d}(${DOW_NAMES[dw]})`; // m 為 0 起算
const fmtRange = (s, e) => {
  const f = (ds) => { const [, m, d] = ds.split('-').map(Number); return `${m}/${d}`; };
  return s === e ? f(s) : `${f(s)}～${f(e)}`;
};

// ── 其他 ───────────────────────────────────────────────────
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const clone = (o) => JSON.parse(JSON.stringify(o));

// ── localStorage（隱私模式或空間不足時不會丟例外）──────────
function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); }
  catch (e) { return fallback; }
}
// 存檔失敗（空間不足、被瀏覽器停用…）時提醒使用者，不然資料看起來存了、重開卻不見。5 秒內最多提醒一次。
let saveWarned = false;
function save(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); return true; }
  catch (e) {
    if (!saveWarned) {
      saveWarned = true;
      toast('⚠ 儲存失敗：瀏覽器儲存空間不足或被停用，資料可能不會保留，建議先匯出備份');
      setTimeout(() => { saveWarned = false; }, 5000);
    }
    return false;
  }
}
function loadRaw(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
function saveRaw(key, v) { try { localStorage.setItem(key, v); } catch (e) { /* 忽略 */ } }

// ── 提示訊息 ───────────────────────────────────────────────
let toastTimer = null;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

// ── 檔案下載 ───────────────────────────────────────────────
function download(blob, name) {
  const a = el('a', { href: URL.createObjectURL(blob), download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// 小按鈕：btn('文字', 點擊函式, 'color-tab small', { title, hidden })；沒有點擊動作就傳 null
const btn = (text, onclick, cls = 'color-tab small', extra = {}) => el('button', { type: 'button', class: cls, text, ...(onclick ? { onclick } : {}), ...extra });
// Blob／File → data URL
const blobToDataUrl = (blob) => new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(blob); });
// 讓一個區塊可以把圖片檔拖進來（跟「選擇圖片」鈕做同一件事）；handler 收到第一個圖片檔
const dragHasFiles = (e) => [...((e.dataTransfer && e.dataTransfer.types) || [])].includes('Files');
function onImageDrop(zone, handler) {
  zone.addEventListener('dragover', (e) => { if (!dragHasFiles(e)) return; e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', (e) => { if (!zone.contains(e.relatedTarget)) zone.classList.remove('drag-over'); });
  zone.addEventListener('drop', (e) => {
    zone.classList.remove('drag-over');
    if (!dragHasFiles(e)) return;
    e.preventDefault();
    const f = [...e.dataTransfer.files].find((x) => x.type.startsWith('image/'));
    if (f) handler(f); else toast('請拖曳圖片檔');
  });
}
// 拖到沒有放置區的地方時，不要讓瀏覽器把圖片檔直接開在這一頁（會丟掉正在編輯的內容）
['dragover', 'drop'].forEach((t) => window.addEventListener(t, (e) => { if (dragHasFiles(e)) e.preventDefault(); }));

// ── 顏色運算 ───────────────────────────────────────────────
function hexToRgb(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
}
function luminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
// 整體加亮（amt>0）或加暗（amt<0），amt 範圍 -1～1
function shade(hex, amt) {
  const { r, g, b } = hexToRgb(hex);
  const c = (v) => Math.max(0, Math.min(255, Math.round(v + amt * 255))).toString(16).padStart(2, '0');
  return '#' + c(r) + c(g) + c(b);
}
const rgba = (hex, a) => { const c = hexToRgb(hex); return `rgba(${c.r},${c.g},${c.b},${a})`; };
