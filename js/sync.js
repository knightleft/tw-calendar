'use strict';

/* ============================================================
 * 跨裝置同步：把資料存成「一個資料夾」的檔案，有兩種放法（上面的邏輯完全共用）：
 *  - 登入 Google 帳號（主要）：放在 Drive 的 appDataFolder（程式專用的隱藏空間），做成跟資料夾一樣的介面（driveDir）
 *  - 本機資料夾（進階）：每台電腦都選同一個 Google Drive 電腦版的同步資料夾，由 Drive 負責把檔案送到另一台
 *  - calendar-data.json：所有 tw_cal_ 開頭的設定與資料（原樣的字串）＋ savedAt（最後寫入時間）
 *  - thumbs/<id>.jpg：直播紀錄的截圖（IndexedDB 裡的 Blob）
 * 不同步：Twitch 憑證（每台各自登入）、頁籤與面板開合（每台自己的操作習慣）、同步用的暫存鍵 tw_cal_sync_*。
 * 流程：啟動、回到分頁、本機有修改（等 1.5 秒）→ syncRun()：讀雲端 savedAt，跟「上次同步到哪」比：
 *   雲端較新且本機沒改 → 套用雲端並重新載入；本機有改 → 寫回雲端；兩邊都改 → 問使用者，輸的那份先備份。
 * 為什麼用資料夾：瀏覽器不能直接讀 Google Drive，但能拿到使用者選的本機資料夾的讀寫權；
 * 權限在重開瀏覽器後要使用者點一下才能恢復（瀏覽器規定），所以會有「點一下繼續同步」。
 * ============================================================ */

const SYNC_FILE = 'calendar-data.json';
const SYNC_THUMBS = 'thumbs';
const SYNC_DELAY = 1500;
const sync = { dir: null, status: 'off', msg: '', busy: false, again: false, timer: 0, gen: 0, reload: () => location.reload() };

// ── 哪些鍵要同步 ───────────────────────────────────────────
const syncable = (k) => k.startsWith('tw_cal_') && !k.startsWith('tw_cal_sync_') && ![KEY.twitch, KEY.streamPanel, KEY.streamMode].includes(k);
function syncKeys() {
  const ks = [];
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (syncable(k)) ks.push(k); }
  return ks.sort();
}
// 本機有沒有「值得保護」的資料：第一次連上已有資料的雲端時，不能默默蓋掉
const syncHasData = () => [KEY.events, KEY.streamEvents, KEY.streamLog].some((k) => (load(k, []) || []).length > 0);

// 有人改了資料：標記未同步，稍後寫回雲端。直接包住 localStorage，這樣不用每個 save 都記得呼叫
const rawSet = Storage.prototype.setItem, rawRemove = Storage.prototype.removeItem;
function syncTouch() {
  sync.gen++;
  rawSet.call(localStorage, KEY.syncDirty, '1');
  if (!sync.dir) return;
  clearTimeout(sync.timer);
  sync.timer = setTimeout(() => syncRun('edit'), SYNC_DELAY);
  syncPaint('pending');
}
Storage.prototype.setItem = function (k, v) {
  const old = this === localStorage && syncable(k) ? this.getItem(k) : undefined;
  rawSet.call(this, k, v);
  if (old !== undefined && old !== String(v)) syncTouch();
};
Storage.prototype.removeItem = function (k) {
  const had = this === localStorage && syncable(k) && this.getItem(k) !== null;
  rawRemove.call(this, k);
  if (had) syncTouch();
};
// 截圖不在 localStorage：改過的 id 記下來，下次寫回雲端時要重寫那一張（同 id 換圖時檔名不變）
function syncTouchThumb(id) {
  const ids = new Set(load(KEY.syncThumbs, []));
  ids.add(id);
  rawSet.call(localStorage, KEY.syncThumbs, JSON.stringify([...ids]));
  syncTouch();
}

// ── 資料夾讀寫 ─────────────────────────────────────────────
const thumbFile = (id) => String(id).replace(/[^\w-]/g, '_') + '.jpg';
async function fsRead(dir, name) {
  try { return await (await dir.getFileHandle(name)).getFile(); }
  catch (e) { if (e.name === 'NotFoundError') return null; throw e; }
}
async function fsWrite(dir, name, data) {
  const w = await (await dir.getFileHandle(name, { create: true })).createWritable();
  await w.write(data);
  await w.close();
}
async function syncReadManifest(dir) {
  const f = await fsRead(dir, SYNC_FILE);
  if (!f) return null;
  let mf;
  try { mf = JSON.parse(await f.text()); } catch (e) { mf = null; }
  if (!mf || mf.app !== 'twcal' || typeof mf.savedAt !== 'number' || !mf.data || typeof mf.data !== 'object') throw new Error('資料夾裡的 ' + SYNC_FILE + ' 格式不對');
  return mf;
}
function syncSnapshot() {
  const data = {};
  syncKeys().forEach((k) => { data[k] = localStorage.getItem(k); });
  return { app: 'twcal', version: VERSION, savedAt: Date.now(), data };
}

// 雲端時間 / 上次同步 / 本機是否有未同步的修改 → 該做什麼
function syncDecide(remoteAt, last, dirty) {
  if (remoteAt == null) return 'push';
  if (remoteAt > last) return dirty ? 'conflict' : 'pull';
  return dirty ? 'push' : 'none';
}

async function syncPush(dir) {
  const gen = sync.gen, snap = syncSnapshot();
  const td = await dir.getDirectoryHandle(SYNC_THUMBS, { create: true });
  const want = new Map(), forced = new Set(load(KEY.syncThumbs, []).map(thumbFile));
  (load(KEY.streamLog, []) || []).forEach((e) => { if (e && e.hasThumb && e.id) want.set(thumbFile(e.id), e.id); });
  const have = new Set();
  for await (const [name] of td.entries()) have.add(name);
  for (const [name, id] of want) {
    if (have.has(name) && !forced.has(name)) continue;
    const blob = await thumbGet(id);
    if (blob) await fsWrite(td, name, blob);
  }
  for (const name of have) if (!want.has(name)) await td.removeEntry(name).catch(() => {});
  // 縮圖都寫完才寫主檔：另一台看到新主檔時，圖一定已經在
  await fsWrite(dir, SYNC_FILE, JSON.stringify(snap));
  rawSet.call(localStorage, KEY.syncLast, String(snap.savedAt));
  rawRemove.call(localStorage, KEY.syncThumbs);
  // 寫的過程中又有修改的話，保留「未同步」讓下一輪再寫
  if (gen === sync.gen) rawSet.call(localStorage, KEY.syncDirty, '0');
}

async function syncPull(dir, mf) {
  // 先把截圖都備妥，任何一步失敗就不動本機資料
  const td = await dir.getDirectoryHandle(SYNC_THUMBS).catch(() => null);
  const thumbs = [];
  if (td) {
    let entries = [];
    try { entries = JSON.parse(mf.data[KEY.streamLog] || '[]'); } catch (e) { entries = []; }
    for (const e of entries) {
      if (!e || !e.hasThumb || !e.id) continue;
      const f = await fsRead(td, thumbFile(e.id));
      if (!f) continue;
      const cur = await thumbGet(e.id);
      if (!cur || cur.size !== f.size) thumbs.push([e.id, f]);
    }
  }
  // 資料夾的 File 本身就是 Blob；Google Drive 的是延遲下載的物件（先看大小，要用才抓）
  for (const [id, f] of thumbs) { const data = f instanceof Blob ? f : await f.blob(); await idbOp('readwrite', (s) => s.put(data, id)); }
  syncKeys().filter((k) => !(k in mf.data)).forEach((k) => rawRemove.call(localStorage, k));
  Object.entries(mf.data).forEach(([k, v]) => { if (syncable(k) && typeof v === 'string') rawSet.call(localStorage, k, v); });
  rawSet.call(localStorage, KEY.syncLast, String(mf.savedAt));
  rawSet.call(localStorage, KEY.syncDirty, '0');
  rawRemove.call(localStorage, KEY.syncThumbs);
  sync.reload();
}

// 兩邊都有改：輸的那份先留一份備份在同一個資料夾（格式跟主檔一樣，要救回來把檔名改成 calendar-data.json 即可）
async function syncBackup(dir, loser, remoteFile) {
  if (loser === 'local') await fsWrite(dir, 'calendar-data.backup-local.json', JSON.stringify(syncSnapshot()));
  else if (remoteFile) await fsWrite(dir, 'calendar-data.backup-cloud.json', await remoteFile.text());
}

const syncWhen = (ms) => { const d = new Date(ms); return `${d.getMonth() + 1}/${d.getDate()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };

async function syncRun() {
  if (!sync.dir) return false;
  if (sync.busy) { sync.again = true; return false; }
  sync.busy = true;
  clearTimeout(sync.timer);
  syncPaint('busy');
  let pulled = false;
  try {
    if ((await sync.dir.queryPermission({ mode: 'readwrite' })) !== 'granted') { syncPaint('need'); return false; }
    const mf = await syncReadManifest(sync.dir);
    const last = Number(loadRaw(KEY.syncLast)) || 0;
    const dirty = loadRaw(KEY.syncDirty) === '1' || (!last && syncHasData());
    let act = syncDecide(mf && mf.savedAt, last, dirty);
    if (act === 'conflict') {
      const cloudWins = confirm(`雲端的資料（${syncWhen(mf.savedAt)} 存的）跟這台電腦的資料都有不同的內容。\n\n按「確定」：用雲端的，這台的內容會被取代\n按「取消」：用這台的，雲端的內容會被取代\n\n沒被採用的那一份，會先備份在同步資料夾裡（calendar-data.backup-*.json）。`);
      await syncBackup(sync.dir, cloudWins ? 'local' : 'cloud', cloudWins ? null : await fsRead(sync.dir, SYNC_FILE));
      act = cloudWins ? 'pull' : 'push';
    }
    if (act === 'pull') { pulled = true; syncPaint('ok', mf.savedAt); await syncPull(sync.dir, mf); }
    else if (act === 'push') { await syncPush(sync.dir); syncPaint('ok', Number(loadRaw(KEY.syncLast))); }
    else syncPaint('ok', last);
    return true;
  } catch (e) {
    if (e && e.need) syncPaint('need');
    else syncPaint('error', e && e.message ? e.message : String(e));
    return false;
  } finally {
    sync.busy = false;
    if (sync.again && !pulled) { sync.again = false; setTimeout(syncRun, 0); }
  }
}

// ── 狀態顯示（頂部列的小按鈕＋設定視窗）─────────────────────
function syncPaint(status, extra) {
  sync.status = status;
  const stamp = extra ? syncWhen(extra) : '';
  const text = { off: '', pending: '☁ 等待同步…', busy: '☁ 同步中…', ok: `☁ 已同步${stamp ? ' ' + stamp : ''}`, need: '☁ 點一下繼續同步', error: '⚠ 同步失敗' }[status];
  sync.msg = status === 'error' ? extra : text;
  const chip = $('syncChip');
  if (!chip) return;
  chip.hidden = status === 'off';
  chip.textContent = text;
  chip.title = status === 'error' ? `同步失敗：${extra}（點一下重試）` : status === 'need' ? '瀏覽器重開後需要你點一下，才能再讀寫同步資料夾' : '跨裝置同步（Google Drive 資料夾）';
  chip.classList.toggle('sync-warn', status === 'need' || status === 'error');
  if (isModalOpen('syncModal')) fillSyncModal();
}

// ── Google Drive（登入帳號）：做成跟資料夾一樣的介面，上面的寫出／套用邏輯完全共用 ──────────
// 檔案放在 appDataFolder（程式專用的隱藏空間，沒有子資料夾，所以 thumbs/ 就是檔名前綴）
const drv = { token: '', exp: 0, list: null };
const driveMissing = () => { const e = new Error('not found'); e.name = 'NotFoundError'; return e; };
const driveNeed = () => { const e = new Error('需要重新登入 Google'); e.need = true; return e; };
const gsiReady = () => !!(window.google && google.accounts && google.accounts.oauth2);
let gsiLoading = null;
function loadGsi() {
  if (gsiReady()) return Promise.resolve(true);
  return gsiLoading || (gsiLoading = new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
    s.onload = () => resolve(true);
    s.onerror = () => { gsiLoading = null; s.remove(); resolve(false); };
    document.head.appendChild(s);
  }));
}
// prompt='none'：不跳任何視窗，能靜默續期就給（失敗＝要使用者點一下）；''：必要時才跳登入／同意視窗（要在點擊當下呼叫，不然會被瀏覽器擋）
function gsiRequest(prompt) {
  return new Promise((resolve) => {
    if (!gsiReady()) { resolve(false); return; }
    let done = false, timer = 0;
    const finish = (r) => {
      if (done) return;
      done = true; clearTimeout(timer);
      if (r && r.access_token) { drv.token = r.access_token; drv.exp = Date.now() + (Number(r.expires_in) || 3600) * 1000; resolve(true); } else resolve(false);
    };
    timer = setTimeout(() => finish(null), prompt === 'none' ? 8000 : 120000);
    google.accounts.oauth2.initTokenClient({ client_id: GOOGLE_CLIENT_ID, scope: GOOGLE_SCOPE, callback: finish, error_callback: () => finish(null) }).requestAccessToken({ prompt });
  });
}
async function driveToken() {
  if (drv.token && Date.now() < drv.exp - 60000) return true;
  await loadGsi();
  return gsiRequest('none');
}
async function driveFetch(url, opts = {}, retry = true) {
  if (!(await driveToken())) throw driveNeed();
  const r = await fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: 'Bearer ' + drv.token } });
  if (r.status === 401 && retry) { drv.token = ''; return driveFetch(url, opts, false); }
  if (!r.ok) throw new Error(`Google Drive 回應 ${r.status}`);
  return r;
}
const DRIVE_FIELDS = 'id,name,size,modifiedTime';
// 一輪同步只列一次檔案，之後的寫入／刪除自己更新這份清單；同名重複（兩台同時第一次建檔）取最新的
async function driveList() {
  if (drv.list) return drv.list;
  const m = new Map();
  let page = '';
  do {
    const j = await (await driveFetch(`https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&pageSize=1000&fields=nextPageToken,files(${DRIVE_FIELDS})${page ? '&pageToken=' + encodeURIComponent(page) : ''}`)).json();
    for (const f of j.files || []) { const old = m.get(f.name); if (!old || f.modifiedTime > old.modifiedTime) m.set(f.name, f); }
    page = j.nextPageToken || '';
  } while (page);
  return (drv.list = m);
}
async function driveSave(name, data) {
  const list = await driveList();
  let f = list.get(name);
  if (!f) {
    f = await (await driveFetch(`https://www.googleapis.com/drive/v3/files?fields=${DRIVE_FIELDS}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, parents: ['appDataFolder'] }) })).json();
    list.set(name, f);
  }
  list.set(name, await (await driveFetch(`https://www.googleapis.com/upload/drive/v3/files/${f.id}?uploadType=media&fields=${DRIVE_FIELDS}`, { method: 'PATCH', headers: { 'Content-Type': 'application/octet-stream' }, body: data })).json());
}
function driveDir(prefix = '') {
  const media = (f) => `https://www.googleapis.com/drive/v3/files/${f.id}?alt=media`;
  return {
    isDrive: true, name: 'Google Drive',
    async queryPermission() { drv.list = null; return (await driveToken()) ? 'granted' : 'prompt'; },
    requestPermission() { return gsiRequest('').then((ok) => (ok ? 'granted' : 'denied')); },
    async getFileHandle(n, o) {
      const full = prefix + n;
      if (!(await driveList()).has(full) && !(o && o.create)) throw driveMissing();
      return {
        async getFile() {
          const f = (await driveList()).get(full);
          if (!f) throw driveMissing();
          return { size: Number(f.size || 0), text: async () => (await driveFetch(media(f))).text(), blob: async () => (await driveFetch(media(f))).blob() };
        },
        async createWritable() { let buf; return { async write(x) { buf = x; }, async close() { await driveSave(full, buf); } }; },
      };
    },
    async getDirectoryHandle(n) { return driveDir(prefix + n + '/'); },
    async removeEntry(n) {
      const list = await driveList(), f = list.get(prefix + n);
      if (f) { await driveFetch(`https://www.googleapis.com/drive/v3/files/${f.id}`, { method: 'DELETE' }); list.delete(prefix + n); }
    },
    async *entries() { for (const k of (await driveList()).keys()) if (k.startsWith(prefix)) yield [k.slice(prefix.length), {}]; },
  };
}

// ── 設定視窗 ───────────────────────────────────────────────
const syncSupported = () => typeof window.showDirectoryPicker === 'function';
function fillSyncModal() {
  const drive = !!(sync.dir && sync.dir.isDrive);
  $('syncStatus').textContent = !sync.dir ? '尚未設定' : (sync.status === 'error' ? '同步失敗：' + sync.msg : sync.msg || '已連上');
  $('syncFolder').textContent = !sync.dir ? '' : drive ? '同步位置：你的 Google Drive（程式專用的隱藏空間）' : '資料夾：' + sync.dir.name;
  $('btnSyncGoogle').hidden = drive;
  $('btnSyncPick').hidden = !syncSupported();
  $('btnSyncPick').textContent = sync.dir && !drive ? '改選別的資料夾' : '改用資料夾同步（進階）';
  $('btnSyncNow').hidden = $('btnSyncStop').hidden = !sync.dir;
}
function openSyncModal() { loadGsi(); fillSyncModal(); openModal('syncModal'); }

// 資料夾的控制代碼存在 IndexedDB（可以直接存進去），重開瀏覽器後還找得到同一個資料夾
let syncDbP = null;
const syncDb = () => syncDbP || (syncDbP = new Promise((resolve, reject) => {
  const rq = indexedDB.open('twcal-sync', 1);
  rq.onupgradeneeded = () => rq.result.createObjectStore('kv');
  rq.onsuccess = () => resolve(rq.result);
  rq.onerror = () => reject(rq.error);
}));
async function syncKv(mode, fn) {
  const db = await syncDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('kv', mode), rq = fn(tx.objectStore('kv'));
    tx.oncomplete = () => resolve(rq && rq.result);
    tx.onerror = () => reject(tx.error);
  });
}

async function pickSyncFolder() {
  let dir;
  try { dir = await window.showDirectoryPicker({ id: 'twcal-sync', mode: 'readwrite' }); }
  catch (e) { return; } // 使用者取消
  await syncKv('readwrite', (s) => s.put(dir, 'dir'));
  rawSet.call(localStorage, KEY.syncMode, 'folder');
  sync.dir = dir;
  syncStartFresh();
}
// 換了同步位置＝跟那邊的歷史無關，當成第一次連上（本機有資料而對方也有時會先問）
async function syncStartFresh() {
  rawRemove.call(localStorage, KEY.syncLast);
  rawRemove.call(localStorage, KEY.syncThumbs);
  drv.list = null;
  syncPaint('busy');
  await syncRun();
}
async function connectGoogle() {
  // 登入視窗要在點擊當下開，所以元件要事先載好；還沒好就請使用者再按一次
  if (!gsiReady()) { loadGsi(); toast('Google 登入元件載入中，請稍後再按一次（需要連上網路）'); return; }
  if (!(await gsiRequest(''))) { toast('沒有登入成功'); return; }
  await syncKv('readwrite', (s) => s.delete('dir')).catch(() => {});
  rawSet.call(localStorage, KEY.syncMode, 'google');
  sync.dir = driveDir('');
  syncStartFresh();
}
async function stopSync() {
  if (!confirm('停止同步？這台電腦上的資料會保留，只是不再同步（雲端或資料夾裡的檔案也不會刪）。')) return;
  clearTimeout(sync.timer);
  await syncKv('readwrite', (s) => s.delete('dir')).catch(() => {});
  if (sync.dir && sync.dir.isDrive && drv.token && gsiReady()) google.accounts.oauth2.revoke(drv.token, () => {});
  drv.token = ''; drv.list = null;
  sync.dir = null;
  [KEY.syncMode, KEY.syncLast, KEY.syncDirty, KEY.syncThumbs].forEach((k) => rawRemove.call(localStorage, k));
  syncPaint('off');
  fillSyncModal();
}
// 頂部的小按鈕：需要權限時點它（要有使用者動作才能要權限）；其他狀態點了就立刻同步
async function onSyncChip() {
  if (!sync.dir) { openSyncModal(); return; }
  try { await sync.dir.requestPermission({ mode: 'readwrite' }); } catch (e) { /* 使用者拒絕時 syncRun 會再顯示「需要權限」 */ }
  syncRun();
}

async function syncInit() {
  if (loadRaw(KEY.syncMode) === 'google') { sync.dir = driveDir(''); loadGsi(); }
  else if (syncSupported()) { try { sync.dir = await syncKv('readonly', (s) => s.get('dir')) || null; } catch (e) { sync.dir = null; } }
  if (!sync.dir) return;
  syncRun();
  // 回到這個分頁時看一下別台有沒有改：正在編輯（視窗開著）就先不動，免得畫面突然重載
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !document.querySelector('.modal-overlay.open')) syncRun();
  });
}
