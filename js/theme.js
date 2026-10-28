'use strict';

/* ============================================================
 * 外觀：顏色套用、背景（漸層／圖樣／圖片）與背景視窗、
 *      亮暗主題、週首、時間顯示格式、寬度、標題欄
 * ============================================================ */

// 依背景色決定文字／邊框色：亮背景用深字，暗背景用淺字
function autoCalColors(colors) {
  const lum = colors.reduce((s, c) => s + luminance(c), 0) / colors.length;
  const base = colors[0];
  return lum > 0.4
    ? { text: shade(base, -0.65), muted: shade(base, -0.52), border: shade(base, -0.18), cardBg: '#ffffff', cardAlpha: 82 }
    : { text: shade(base, 0.85), muted: shade(base, 0.55), border: shade(base, 0.30), cardBg: '#000000', cardAlpha: 30 };
}
function applyCalColors() {
  const root = document.documentElement.style;
  const alpha = Math.round(calColors.cardAlpha / 100 * 255).toString(16).padStart(2, '0');
  root.setProperty('--cal-text', calColors.text);
  root.setProperty('--cal-text-muted', calColors.muted);
  root.setProperty('--cal-border', calColors.border);
  root.setProperty('--cal-card-bg', calColors.cardBg + alpha);
  root.setProperty('--cal-title', calColors.text);
}

// ── 背景繪製 ───────────────────────────────────────────────
function svgTile(shape, hex, alpha, size) {
  const body = shape === 'heart'
    ? '<path transform="translate(12 12)" d="M12 21C5 16 2 12.5 2 9a5 5 0 0 1 10-1.5A5 5 0 0 1 22 9c0 3.5-3 7-10 12z"/>'
    : '<polygon points="24,10 27.7,19.5 38,20.2 30,26.8 32.6,37 24,31.5 15.4,37 18,26.8 10,20.2 20.3,19.5"/>';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 48 48"><g fill="${hex}" fill-opacity="${alpha}">${body}</g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
// 背景設定 → { color, image, size, repeat, position }（對應 CSS background-*）
function bgStyleOf(s) {
  if (s.mode === 'pattern') {
    const p = s.pattern, c = rgba(p.color, p.alpha / 100);
    let image, size = `${p.size}px ${p.size}px`;
    switch (p.type) {
      case 'dots': image = `radial-gradient(circle, ${c} 0 16%, transparent 17%)`; break;
      case 'stripes': image = `repeating-linear-gradient(45deg, ${c} 0 ${p.size / 4}px, transparent ${p.size / 4}px ${p.size / 2}px)`; size = 'auto'; break;
      case 'check': image = `conic-gradient(${c} 0 25%, transparent 0 50%, ${c} 0 75%, transparent 0)`; break;
      case 'grid': image = `linear-gradient(${c} 1.5px, transparent 1.5px), linear-gradient(90deg, ${c} 1.5px, transparent 1.5px)`; size = `${size}, ${size}`; break;
      default: { const t = Math.round(p.size * 1.4); image = svgTile(p.type, p.color, p.alpha / 100, t); size = `${t}px ${t}px`; }
    }
    return { color: p.base, image, size, repeat: 'repeat', position: '0 0' };
  }
  if (s.mode === 'image' && s.image.data) {
    const tone = THEME_TONE[theme], tile = s.image.fit === 'tile';
    const veil = `rgba(${tone.overlay},${s.image.fade / 100})`; // 疊一層淡化色讓內容更易讀
    return {
      color: tone.page,
      image: `linear-gradient(${veil},${veil}), url("${s.image.data}")`,
      size: tile ? 'auto, 240px auto' : 'auto, cover',
      repeat: tile ? 'repeat, repeat' : 'repeat, no-repeat',
      position: '0 0, center',
    };
  }
  return { color: 'transparent', image: `linear-gradient(${s.angle}deg, ${s.colors.join(', ')})`, size: 'auto', repeat: 'no-repeat', position: '0 0' };
}
function paintBg(node, s) {
  const st = bgStyleOf(s);
  Object.assign(node.style, {
    background: 'none',
    backgroundColor: st.color,
    backgroundImage: st.image,
    backgroundSize: st.size,
    backgroundRepeat: st.repeat,
    backgroundPosition: st.position,
  });
}
function applyBgToDom() {
  paintBg($('bgPreview'), bgSettings);
  paintBg($('bgMonthPreview'), bgSettings);
  paintBg($('bgStreamPreview'), bgSettings);
  if (typeof applyReviewLook === 'function') applyReviewLook(); // 年度直播回顧：沒自訂背景就跟著一般背景
  paintBg(document.body, bgSettings);
  document.body.style.backgroundAttachment = bgSettings.mode === 'image' ? 'fixed' : 'scroll';
  if (typeof applyStreamBg === 'function') applyStreamBg(); // 直播行程若設了專用背景圖，蓋掉上面畫的一般背景
}

// ── 背景視窗 ───────────────────────────────────────────────
const BG_PANES = [['Gradient', 'gradient'], ['Pattern', 'pattern'], ['Image', 'image']];

function collectBgDraft() {
  bgDraft.colors = [...document.querySelectorAll('#bgColorRow .bgc')].map((i) => i.value);
  bgDraft.angle = parseInt($('bgAngle').value, 10);
  bgDraft.pattern.base = $('patBase').value;
  bgDraft.pattern.color = $('patColor').value;
  bgDraft.pattern.size = parseInt($('patSize').value, 10);
  bgDraft.pattern.alpha = parseInt($('patAlpha').value, 10);
  bgDraft.image.fade = parseInt($('imgFade').value, 10);
}
function updateBgPreview() {
  if (!bgDraft) return;
  collectBgDraft();
  $('bgAngleVal').textContent = bgDraft.angle + '°';
  $('patSizeVal').textContent = bgDraft.pattern.size + 'px';
  $('patAlphaVal').textContent = bgDraft.pattern.alpha + '%';
  $('imgFadeVal').textContent = bgDraft.image.fade + '%';
  document.querySelectorAll('#patternGrid .pattern-opt').forEach((b) => {
    b.classList.toggle('active', b.dataset.type === bgDraft.pattern.type);
    const mini = clone(bgDraft);
    mini.mode = 'pattern'; mini.pattern.type = b.dataset.type; mini.pattern.size = 16;
    paintBg(b, mini);
  });
  paintBg($('bgPreviewBar'), bgDraft);
}
function setBgMode(mode) {
  bgDraft.mode = mode;
  BG_PANES.forEach(([name, key]) => {
    $('bgTab' + name).classList.toggle('active', mode === key);
    $('bgPane' + name).hidden = mode !== key;
  });
  updateBgPreview();
}
function setImgFit(fit, silent) {
  bgDraft.image.fit = fit;
  $('imgFitCover').classList.toggle('active', fit === 'cover');
  $('imgFitTile').classList.toggle('active', fit === 'tile');
  if (!silent) updateBgPreview();
}
function syncCalColorInputs() {
  $('calTextColor').value = calColors.text;
  $('calMutedColor').value = calColors.muted;
  $('calBorderColor').value = calColors.border;
  $('calCardBgColor').value = calColors.cardBg;
  $('calCardAlpha').value = calColors.cardAlpha;
  $('calCardAlphaVal').textContent = calColors.cardAlpha + '%';
}
function previewCalColors() {
  calColors.text = $('calTextColor').value;
  calColors.muted = $('calMutedColor').value;
  calColors.border = $('calBorderColor').value;
  calColors.cardBg = $('calCardBgColor').value;
  calColors.cardAlpha = parseInt($('calCardAlpha').value, 10);
  $('calCardAlphaVal').textContent = calColors.cardAlpha + '%';
  applyCalColors();
}
function autoColorsFromBg() {
  collectBgDraft();
  const colors = bgDraft.mode === 'pattern' ? [bgDraft.pattern.base]
    : bgDraft.mode === 'image' ? [THEME_TONE[theme].imageBase]
    : bgDraft.colors;
  calColors = autoCalColors(colors);
  syncCalColorInputs();
  applyCalColors();
  toast('已依背景自動設定');
}
function showBgModal() {
  bgDraft = clone(bgSettings);
  document.querySelectorAll('#bgColorRow .bgc').forEach((input, i) => { if (bgDraft.colors[i]) input.value = bgDraft.colors[i]; });
  $('bgAngle').value = bgDraft.angle;
  $('patBase').value = bgDraft.pattern.base;
  $('patColor').value = bgDraft.pattern.color;
  $('patSize').value = bgDraft.pattern.size;
  $('patAlpha').value = bgDraft.pattern.alpha;
  $('imgFade').value = bgDraft.image.fade;
  $('patternGrid').replaceChildren(...PATTERNS.map((pt) => el('button', {
    type: 'button', class: 'pattern-opt', text: pt.name, dataset: { type: pt.id },
    onclick: () => { bgDraft.pattern.type = pt.id; updateBgPreview(); },
  })));
  setImgFit(bgDraft.image.fit, true);
  syncCalColorInputs();
  setBgMode(bgDraft.mode);
  openModal('bgModal');
}
function closeBgModal() { closeModal('bgModal'); bgDraft = null; }
function applyBg() {
  collectBgDraft();
  if (bgDraft.mode === 'image' && !bgDraft.image.data) { toast('請先選擇圖片'); return; }
  const prev = bgSettings;
  bgSettings = bgDraft;
  if (!save(KEY.bg, bgSettings)) { bgSettings = prev; toast('背景儲存失敗（圖片可能太大）'); return; }
  save(colorsKey(theme), calColors);
  applyBgToDom();
  applyCalColors();
  closeBgModal();
  renderYearView();
}
// 讀取背景圖片：長邊縮到 1600px、轉 JPEG 後存入草稿
async function loadBgImage(file) {
  if (!file) return;
  try { bgDraft.image.data = await readImage(file, 1600, false); updateBgPreview(); } catch (e) { toast('無法讀取這張圖片'); }
}

// ── 亮暗主題、週首、時間顯示格式、寬度 ─────────────────────
function syncThemeButton() {
  document.documentElement.dataset.theme = theme;
  const b = $('btnTheme');
  b.textContent = theme === 'dark' ? '☀️' : '🌙'; // 顯示「點下去會切換成」的模式
  b.setAttribute('aria-label', theme === 'dark' ? '切換為亮色' : '切換為暗色');
}
function setTheme(t) {
  if (bgDraft) closeBgModal(); // 切換前先放棄尚未套用的背景草稿
  theme = t;
  saveRaw(KEY.theme, t);
  bgSettings = loadBg();
  calColors = loadColors();
  syncThemeButton();
  applyCalColors();
  rerenderAll();
}
function setWeekStart(v) {
  weekStart = v === 0 ? 0 : 1;
  saveRaw(KEY.weekStart, String(weekStart));
  rerenderAll();
}
function setTimeFmt(v) {
  timeFmt = Number(v) === 12 ? 12 : 24;
  saveRaw(KEY.timeFmt, String(timeFmt));
  rerenderAll();
}
function setCalWidth(v, persist) {
  v = parseInt(v, 10) || DEFAULT_CAL_WIDTH;
  document.documentElement.style.setProperty('--cal-width', v + 'px');
  $('widthSlider').value = v;
  $('widthVal').textContent = v + 'px';
  if (typeof fitStreamStage === 'function') { fitStreamContent(); fitStreamStage(); }
  if (persist) saveRaw(KEY.width, v);
}
// 讓標題輸入框寬度貼合文字，版號標籤才會緊接在標題後面
function fitTitle() {
  const inp = $('titleInput');
  const probe = el('span', { text: inp.value || inp.placeholder });
  probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;font:' + getComputedStyle(inp).font;
  document.body.appendChild(probe);
  inp.style.width = Math.ceil(probe.getBoundingClientRect().width) + 6 + 'px';
  probe.remove();
}
// 設定變更後，重畫目前可見的所有內容
function rerenderAll() {
  renderYearView();
  const view = currentView();
  if (view === 'month') renderMonthFull(currentMonth);
  if (view === 'stream') renderStreamView();
  if (isModalOpen('freeDaysModal')) { buildDowRow(); renderExclCal(); }
}
