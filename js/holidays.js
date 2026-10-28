'use strict';

/* ============================================================
 * 台灣國定假日
 * 農曆節日使用瀏覽器內建 Intl 的 chinese 曆法換算。
 * ※ 政府每年會公告「調整放假／補班」，此處僅依法定節日與補假規則推算，
 *    正式日期請以行政院人事行政總處公告為準。
 * ============================================================ */

const lunarCache = {};
const holidayCache = {};
let lunarWarned = false;

// 該年每個「平月」農曆日期對應的國曆日期：{ '月-日': 'YYYY-MM-DD' }（閏月略過）
function lunarIndex(y) {
  if (lunarCache[y]) return lunarCache[y];
  const idx = {};
  try {
    const fmt = new Intl.DateTimeFormat('en-u-ca-chinese', { month: 'numeric', day: 'numeric' });
    for (let dt = new Date(y, 0, 1); dt.getFullYear() === y; dt.setDate(dt.getDate() + 1)) {
      const parts = fmt.formatToParts(dt);
      const m = parts.find((x) => x.type === 'month').value;
      const d = parts.find((x) => x.type === 'day').value;
      if (/^\d+$/.test(m)) idx[`${m}-${d}`] = toDs(dt); // 閏月（如 "5bis"）不是數字，會被略過
    }
  } catch (e) {
    if (!lunarWarned) { lunarWarned = true; toast('此瀏覽器不支援農曆換算，農曆節日將不顯示'); }
  }
  return (lunarCache[y] = idx);
}

// 清明節的國曆日（4 月幾號）：依節氣近似公式（21 世紀）
function qingming(y) {
  const yy = y % 100;
  return Math.floor(yy * 0.2422 + 4.81) - Math.floor(yy / 4);
}

function calcHolidays(y) {
  const map = {};
  const add = (ds, name) => { map[ds] = map[ds] ? `${map[ds]}・${name}` : name; };

  add(dateStr(y, 0, 1), '元旦');
  add(dateStr(y, 1, 28), '和平紀念日');
  add(dateStr(y, 3, 4), '兒童節');
  add(dateStr(y, 3, qingming(y)), '清明節');
  add(dateStr(y, 4, 1), '勞動節');
  add(dateStr(y, 9, 10), '國慶日');
  if (y >= 2025) { // 2025 年起恢復放假的紀念日
    add(dateStr(y, 8, 28), '教師節');
    add(dateStr(y, 9, 25), '光復節');
    add(dateStr(y, 11, 25), '行憲紀念日');
  }

  const lunar = lunarIndex(y);
  if (lunar['1-1']) {
    add(addDays(lunar['1-1'], -1), '除夕');
    for (let i = 0; i < 3; i++) add(addDays(lunar['1-1'], i), '春節');
  }
  if (lunar['5-5']) add(lunar['5-5'], '端午節');
  if (lunar['8-15']) add(lunar['8-15'], '中秋節');

  // 補假：週六 → 往前補最近的上班日；週日 → 往後補最近的上班日
  Object.keys(map).sort().forEach((ds) => {
    const dow = parseDs(ds).getDay();
    if (dow !== 6 && dow !== 0) return;
    const step = dow === 6 ? -1 : 1;
    let t = addDays(ds, step);
    while (map[t] || [0, 6].includes(parseDs(t).getDay())) t = addDays(t, step);
    map[t] = '補假';
  });
  return map;
}

function holidayName(ds) {
  const y = Number(ds.slice(0, 4));
  if (!holidayCache[y]) holidayCache[y] = calcHolidays(y);
  return holidayCache[y][ds] || null;
}
