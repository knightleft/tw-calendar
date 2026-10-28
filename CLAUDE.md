# 我的行事曆 — 維護指南

純前端的年曆／月曆工具（繁體中文、台灣假日）。無後端、無建置步驟，直接開 `index.html` 即可使用。
功能規格見 [SPEC.md](SPEC.md)；本檔說明**怎麼改、怎麼驗證、哪些規則一定要遵守**。

## 檔案地圖

```
index.html        所有畫面與對話框的 HTML（無 inline style / inline handler）
style.css         單一樣式表；暗色主題與版面小工具放在最後
js/               一般 <script>（非 ES 模組，才能雙擊開啟）；載入順序 = 相依順序
  config.js       常數、預設值、localStorage 鍵名、VERSION
  util.js         $ / el() / 日期字串 / 顏色運算 / 儲存 / toast / 對話框開關 / download
  state.js        所有可變狀態（啟動時從 localStorage 讀入）+ 週首相關日期計算
  holidays.js     台灣國定假日（農曆用 Intl 換算）、補假規則
  events.js       行程資料模型、顯示文字（TRPG 組合、同行者、12/24 小時）、類別小函式
  theme.js        自動配色、背景繪製與背景視窗、亮暗主題、週首、時間顯示、寬度
  calendar.js     年度總覽、月視圖（renderMonthGrid 與直播月曆共用）、showView、事件代理、拖曳選取／移動／複製詢問
  editor.js       行程視窗、時間選擇器、顏色、類別、TRPG、系統下拉、複製到其他日期
  picker.js       通用「勾選行程」清單（匯出、直播曆選擇行程共用）
  tools.js        匯出入、截圖、空檔時段計算與空檔視窗
  stream-settings.js  直播曆「⚙ 版面設定」左側面板（文字、日程、配色、社群、圖片、版面、每天的設定）與配色工具
  streamlog.js    直播紀錄（紀錄清單、截圖 IndexedDB、Twitch 同步）
  sync.js         跨裝置同步（Google Drive 資料夾，File System Access API；載入在 stream-settings 之後）
  stream.js       直播行程（年度總覽＋週曆＋月曆，預覽用 fitStreamStage 等比例縮放）：有自己獨立的行程（streamEvents，從行事曆「匯入」複本）的週曆/月曆、匯入對話框、截圖
  app.js          事件綁定（bindXxx）與啟動
tests/
  regress.js      回歸測試（見下方「測試」）
  serve.ps1       本機靜態伺服器（這台機器沒有 Python／Node）
```

## 開發慣例

- **資料流**：改狀態 → 立刻存檔（`saveEvents()`、`saveCategories()`、`save(KEY.x, …)`）→ 重畫（`refreshViews()` / `renderYearView()` / `rerenderAll()`）。
- **日期**一律用 `'YYYY-MM-DD'` 字串（可直接字串比較）；`dateStr(y, m, d)` 的 `m` 是 **0 起算**；星期索引同 `Date.getDay()`（日=0、六=6），畫面欄位順序由 `weekOrder()` 決定。
- **時間**一律存 24 小時制字串 `'HH:MM'`，可為 `'24:00'`；12 小時制只是顯示（`fmtTime`）。空字串＝未填。
- **建 DOM** 用 `el(tag, props, ...children)`，不要拼 HTML 字串（只有固定的空狀態提示例外）。
- **新增按鈕／欄位**：HTML 加 id → 在 `app.js` 對應的 `bindXxx()` 綁事件 → 邏輯放在最相關的模組。
- **新增會存檔的設定**：鍵名加進 `config.js` 的 `KEY`，預設值也放 `config.js`；若要進匯出／匯入，改 `tools.js` 的 `exportEvents` / `importEvents`。
- 函式與狀態都是全域（`window`），測試與跨模組呼叫依賴這點；**不要改名**既有的公開函式而不同步更新 `tests/regress.js`。
- 註解用繁體中文，說明「為什麼」，不要複述程式碼在做什麼。

## 易踩的坑

- 月視圖的互動掛在 `#monthFullCal` 上（事件代理），格子是重畫的，**不要**再對每個格子 `addEventListener`。
- 月視圖每格是 `CELL_ROWS` 行（第 1 行固定留給假日名，沒假日也留空，好讓跨日色條等高；其餘放行程，放不下時最後一行是「+N」），被收起的行程可從 `openDayList` 看到；新增會讀取「當天行程」的功能時，要想清楚是要「畫面上看得到的」還是「全部」（`eventsForDay` 是全部）。
- 截圖（`capture()`）是先把區塊複製到畫面外再拍；html2canvas 會忽略 `data-html2canvas-ignore` 的元素，所以輸出圖會比畫面矮，這是預期。
- 所有視窗點灰色背景都會關閉（行程視窗也是，等同「取消」，不儲存）。
- 色盤一律用原生 `<input type="color">`（使用者要求維持原生，不要自製彈窗；原生彈窗的預設格式網頁無法指定）。
- 類別有選填的 `tag`（標題前綴）：顯示名稱一律用 `evName()`，不要直接用 `ev.title`。
- 背景亮暗共用（存過就沿用，沒存過才用各主題預設，`loadBg`）；文字/邊框色則每個主題各存一份（`colorsKey(theme)`），因為圖片背景的淡化層會隨主題變。
- 改類別顏色**不會**回頭改既有行程（顏色在建立行程時就複製進去了）。
- 空檔計算以 30 分為單位，行程時段向外取整（`busyOn`）；只看 `blockingEventsForDay`（排除勾選「不影響空檔」的行程），新增空檔相關邏輯時不要直接用 `eventsForDay`。
- 假日是推算值，政府的調整放假／補班不會自動納入（註明在 `holidays.js` 開頭）。

## 版號規則（必須遵守）

- 版號在 `js/config.js` 的 `VERSION`，畫面標題旁顯示。
- **新需求** → +0.01（v0.10 → v0.11）；使用者只是把上個需求**說得更清楚／我誤解了** → **不加**，併入上一版說明。
- 只有使用者明確說「確定版號」才 +1 並把小數歸零（v0.xx → v1.00）。**不要主動詢問是否定版。**
- 每次改版同步：`config.js` 的 `VERSION`、`SPEC.md`「目前版本」與該版調整紀錄。

## 測試

這台機器沒有 Python／Node，用 PowerShell 起靜態伺服器，再在瀏覽器分頁的主控台執行回歸腳本。

```powershell
# 1) 啟動伺服器（背景執行；預設 http://localhost:8765/）
& 'D:\My Tools\calendar\tests\serve.ps1' -Root 'D:\My Tools\calendar'
```

```js
// 2) 開 http://localhost:8765/index.html，在該頁執行（可重複執行）：
const src = await (await fetch('/tests/regress.js?' + Date.now())).text();
await (0, eval)(src)   // → { passed: N, failed: [] }
```

- `failed` 必須為空才算通過；會清空該頁的 localStorage，請用測試用分頁。
- 改功能時**同步補測試**：在 `tests/regress.js` 對應區塊加 `check(名稱, 實際, 預期)`，預期值要寫死（不要用雜湊）。
- 瀏覽器的「本機檔案」分頁是靜態快照、不會執行 script，一定要走 `http://localhost`。
- 測完用 `localStorage.clear()` 清掉測試資料，並關掉伺服器。

## 回覆使用者時

- 使用者習慣用口語描述需求；理解有疑義時依合理推測先做，並在回覆中說明做了什麼假設。
- 每次改動後在回覆中交代：改了什麼、怎麼驗證的、沒驗證到的部分。

## 直播曆注意事項

- 主畫面有三個（年度 `yearView`／月 `monthView`／直播 `streamView`），一律用 `showView(name)` 切換、`currentView()` 取得目前是哪個；新增會依畫面重畫的功能時（改設定、儲存行程後），記得 `rerenderAll()` / `refreshViews()` 已涵蓋直播曆。
- 主月視圖與直播月曆是**兩個同時存在於 DOM 的格子**（`#monthFullCal`、`#streamMonth`）：查詢日期格時要限定容器（例如 `#monthFullCal .cal-day[...]`），不要用全域的 `.cal-day` 選擇器（測試也一樣）。
- 直播曆有**獨立的行程陣列** `streamEvents`（存 `tw_cal_streamevents`），行程是從行事曆「匯入」的複本（帶 `sourceId`），之後各改各的、不自動同步（刻意：避免私人內容誤上直播）。
- 行程視窗用 `editKind`（'main'｜'stream'）區分正在改哪一份：`openEditEvent(id, kind)`、`saveList(kind)`、`listOf(kind)`。新增處理「目前編輯的行程」的功能時，不要直接動 `events`，要用 `listOf(editKind)`。
- 版面設定是直播曆左側的固定面板（`#streamPanel`，不是 modal）：`initStreamPanel()` 首次進入時建一次、`buildStreamSettings()` 重畫時會保留各區段展開狀態；每天的設定只在換週時用 `fillDaySettings()` 單獨更新，**不要在每次 `renderStreamView()` 都重建面板**（會讓輸入框失去焦點）。
- 直播曆外觀設定存在 `streamSettings`（預設值 `STREAM_DEFAULTS`）、每天的個別設定在 `streamDays`（以日期為鍵，空值要清掉）；改動後走 `ssSet()` / `saveStreamSettings()` + `renderStreamView()`。新增一個設定欄位＝`config.js` 加預設值 → `stream.js` 的 `applyStreamLook()` / 渲染處套用 → `stream-settings.js` 的 `buildStreamSettings()` 加一個欄位（`ssText/ssSelect/ssCheck/ssRange/ssColor/ssImage`）。
- 直播曆的背景圖覆寫在 `applyBgToDom()` 最後由 `applyStreamBg()` 套用；`applyStreamLook()` 會先還原一般背景再覆寫，所以清掉專用背景圖後呼叫它即可還原。

## 介面與健壯性慣例（v0.23）

- **頂部列**分組：大分類（私人行程｜直播行程）、截圖｜資料（匯入、匯出）｜常用外觀（底板🌙、日曆寬度）｜設定選單（`#settingsMenu`：背景、週首、時間顯示）。很少改的偏好放進設定選單，使用者明確要求常用的（底板、寬度）留在頂部列；選單開關用 `setSettingsMenu()`。
- **📷 截圖是依畫面決定的**（`takeScreenshot()` → 年度／`takeMonthScreenshot()`／`takeStreamScreenshot()`）；新增畫面時要在 `takeScreenshot()` 與 `showView()` 的按鈕提示補上，不要另外放第二顆截圖鈕。
- **視窗的取消動作**一律用 `closeOnBackdrop(id, closeFn)` 註冊：它同時處理點背景與 Esc（`bindEscapeToClose` 一次只關最上面的視窗）。新增 modal 記得註冊。
- **表單欄位順序原則**：先放會影響其他欄位的（標題、類別），再放必填（日期、時間），最後才是選填與少改的（同行者、備註、顏色）。危險操作（刪除、清空）放最後或收進次要區域。
- **外部資料一律先驗證**：匯入走 `sanitizeEvents()`（`tools.js`），不要直接把檔案內容塞進 `events`／`streamEvents`；會取代現有資料的操作要先 `confirm()`。
- **存檔一律走 `save()`**：失敗時它會自動提醒使用者；不要直接呼叫 `localStorage.setItem`。
- 直播曆行程有兩個文字欄位要分清楚：`memo`（行事曆的私人備註，**絕不顯示在直播曆**）與 `detail`（直播曆行程名稱下方的公開說明）。編輯直播曆行程時，行程視窗的「備註」欄改綁 `detail`（`editKind === 'stream'`）。
- 直播曆「每天的設定」（`ssDay`／`ssSlot`）直接讀寫當天「開始」的直播曆行程；不要在每次輸入時重畫整張卡（會失去焦點），只有「第二場」「徽章」這類結構變化才局部重畫。
- 直播曆的「休息日」只由 `streamDays[ds].rest` 決定；沒有行程的日子不是休息日。
- 直播曆每天的「強調／徽章」細項：選項清單在 `config.js`（`HL_STYLES`、`BADGE_SHAPES`、`BADGE_SIZE`）；渲染在 `stream.js` 的 `applyHighlight()`／`renderBadge()`（徽章的爆炸／雲朵／愛心是 `badgeSvg()` 產生的 SVG 背景）；設定 UI 在 `stream-settings.js` 的 `ssDay()`（`ssPills`／`ssColorLine` 小元件，細項放在 `.ss-sub`，用 `hidden` 切換，不重畫整張卡）。新增細項時，`update()` 要記得清掉預設值與空值。

## 大分類與直播預覽縮放（v0.26）

- 頂部列 `#scopeMain`／`#scopeStream` 是大分類：私人行程＝`yearView`＋`monthView`，直播行程＝`streamView`（年度 `streamYear`／週曆／月曆，`streamMode` = year｜week｜month）。`showView()` 負責同步兩顆按鈕的 active。
- 迷你月曆用 `fillMiniCal(box, y, m, evsFor)`：私人年度傳 `blockingEventsForDay`，直播年度傳 `streamEventsForDay`。
- `#bgStreamPreview` 固定為 `--cal-width` 寬，外層 `#streamScaler` 用 `transform: scale` 縮進 `#streamStage`（`fitStreamStage()`）。**量寬度要用 `offsetWidth`，不要用 `getBoundingClientRect()`**（後者含縮放），`capture()` 已照此處理。
- 行程同步（`editor.js`）：靠直播行程的 `sourceId` 對應私人行程；`counterpartOf(kind, id)` 找另一邊、`syncCounterpart()` 寫入。**備註（memo）與說明（detail）不跨邊複製**。測試裡 `loadSync` 被暫時蓋掉成「一律不勾」，同步另有專屬測試。
- 直播背景圖在獨立的 `#streamBgLayer`（位置／大小／透明度），不是 `#bgStreamPreview` 本身的 background。
- 直播預覽指定畫面比例時走 `fitStreamContent()`（`#bgStreamPreview[data-fit]`＋`data-shape`）：畫布固定比例、內容區 `.sw-fill` 填滿、放不下才對內容區 `zoom`。新增會改變內容高度的功能（欄位、區塊）時，要在改完後呼叫 `renderStreamView()` 讓它重新量測。 縮小內容不要用 CSS `zoom`、`background-clip: text`、`inset` 的 box-shadow：html2canvas 不支援，截圖會跟畫面不同。
- 字型：`streamFontCss()` 決定 CSS、`loadGoogleFont()` 載入；名稱一律先過 `fontQuote()` 過濾。

## 用語（v0.32）

- 畫面文字：私人那份叫「**私人行程**」、直播那份叫「**直播行程**」（裡面再分年度總覽／週曆／月曆）；「我的行事曆」只是網站標題。新增畫面文字時沿用，不要再寫「直播曆」或用「行事曆」指私人行程。
- 追加 CSS 時先找有沒有同一個選擇器的既有規則，直接改原規則，不要在檔尾再蓋一層。


## v0.35 補充

- 圖片貼紙存在**每一場直播（stream 行程）**的 `ev.stickers`（最多 `STICKER.max`＝5），不是 `streamDays`；`streamDays[ds].stickers` 只是舊資料（`migrateDayStickers()` 升級時搬走，沒行程的留著、仍會畫出來）。設定 UI 是 `ssStickerBox()`，掛在 `ssSlot()` 裡。
- 每天最多 3 場：`ssDay()` 的 `slots`／`drawMore()`／`setShown()`；取消某一場會連之後的場次一起移除。
- 筆記是週曆的第 8 格（`renderNoteCell()`，class `sw-notecell`）；固定比例的欄數規則要避開它（`:last-child:not(.sw-notecell)`、`[data-note="1"]`）。
- 背景圖大小用 `applyBgSize()` 算實際像素（需要圖片原尺寸，載入後才會套用）；不要改回 transform。
- 下拉選單的選項要自己設底色與文字色（`select option`），否則暗色主題看不到字。
- 貼紙外框與陰影由 `stickerLook()`（stream.js）把圖片「烤」成帶外框的新圖（有快取；圖片載入完才會重畫一次）：不能改用 CSS `filter: drop-shadow`，html2canvas 不支援。`stickerOf()` 補齊每張貼紙的預設值（含 `bw`、`bc`）。
- 寫 JS 時，**不要在同一行的程式碼中間插 `//` 註解**（會吃掉後面的 `} catch…`，造成整支檔案語法錯誤、畫面一片空白）；註解放在上一行。

## 直播紀錄（v0.43）

- 新模組 `js/streamlog.js`（在 stream.js 之後載入）：`streamLog`（localStorage）、截圖在 IndexedDB（`thumbGet/thumbPut/thumbDel`，key＝紀錄 id）、`twitchCfg`、`syncTwitchLog()`。`streamMode` 多了 `'log'`，`renderStreamView()` 在 log 模式會收起預覽與版面設定、顯示 `#streamLog` 與紀錄的工具鈕後直接 return。
- Twitch 的 VOD 沒有分類（遊戲），分類只能靠「直播中同步」或手動；`edited` 旗標表示使用者改過，同步不能覆蓋標題與分類。合併紀錄靠 `streamId`／`videoId`。
- 測試用假的 `window.fetch` 回應 Helix（見 `tests/regress.js` 的 v0.43 區塊），**沒有連過真正的 Twitch**；憑證不要寫進測試或文件。測完要 `indexedDB.deleteDatabase('twcal-streamlog')` 清掉測試截圖。
- 紀錄頁就是「年度直播回顧」（v0.44）：`renderStreamLog()` 畫整張回顧圖（標題、統計、熱度圖、月份），📷 截圖拍 `#streamLog`（先 `await reviewLoading`，等封面載入）。它跟預覽一樣包在 `#logStage > #logScaler`，照 `--cal-width` 排版再縮放（`fitScaled()`）；**不要把 `#streamLog` 本身 hidden**，要收合請用 `#logStage`。不該出現在圖裡的元素用 `dataset.html2canvasIgnore = 'true'`。
- 測試裡量對比（`介面配色` 那段）前要關掉轉場：頁面在背景時 CSS transition 會停在中間色，量到的對比會失真。Client Secret 一律不存（`fetchTwitchToken()` 換完就清），不要為了「方便」把它寫進 `twitchCfg`。
- 年度直播回顧有三種版面（`reviewView`：year｜month｜list）：年曆／月曆用 `reviewMonthGrid()` 把當天截圖鋪進日期格（`byDay` 對照表）；`takeStreamScreenshot()` 的檔名依版面決定。共用的小按鈕用 `btn()`、讀檔轉 data URL 用 `blobToDataUrl()`（util.js），不要再各處手寫 `el('button', …)`／`FileReader`。
- 紀錄的分類（遊戲）用 `gameOf(e)` 取：手動編輯過（`edited`）以手填為準，否則標題開頭的【】（`gameFromTitle()`）優先，再來才是 Twitch 給的 `game`。新增顯示分類的地方一律用 `gameOf()`，不要直接讀 `e.game`。

## 年度直播回顧的外觀（v0.48）

- 外觀存在 `streamSettings` 的 `rv*` 鍵（`RV_KEYS`、`RV_PRESETS` 在 `config.js`），由 `applyReviewLook()`（streamlog.js）套到 `#streamLog`；`applyBgToDom()` 也會呼叫它。
- 設定面板與直播行程共用：`buildStreamSettings()` 在 `streamMode === 'log'` 時改走 `buildReviewSettings()`；清單版面不顯示面板。
- 測試要先設 `logAutoSynced = true`，避免進入畫面時真的去連 Twitch。
- 圖片上傳一律同時支援選檔與拖曳：用 util.js 的 `onImageDrop(區塊, 處理函式)`，處理函式收一個 File（跟 change 事件共用同一個函式）；讀圖縮放用 `readImage()`。
- 紀錄的分類是「A、B」字串：顯示與統計用 `gamesOf(e)`（陣列），存檔前用 `splitGames()` 整理；時長用 `parseHms()`／`fmtHms()` 轉換（錯誤回傳 null）。
- 社群帳號（`soc*`）在設定選單的 `socialModal` 填、版面設定只有 `soc*Show` 勾選；平台清單是 config.js 的 `SOCIALS`，新增平台改那一處。Twitch 憑證只有「儲存並同步」會換（`fetchTwitchToken(clientId, secret)` 回傳 `{token, expiresAt}` 或 null），沒有獨立的憑證欄。
- 頂部列的 匯入／匯出 依畫面決定（`inLogView()`，年度直播回顧＝備份直播紀錄、`syncBackupButtons()` 更新提示）；新增畫面要有自己的備份時照這個模式，不要另放按鈕。直播行程的設定面板只有「⚙ 版面設定」一個收合入口。
- 分類 tag：狀態是 `logGames`（陣列），`renderLogGames()` 重畫 tag 與建議；存檔走 `logGameFor()`。新增 placeholder 不用另外設色（全域規則已設），但回歸測試會檢查對比。
- 截圖：`capture(id, 檔名, paginate)`；輸出尺寸由 `outScale()` 限制在 1920×1080 內，新增畫面不用另外處理。縮圖／封面用 `.rv-img`（背景圖），不要用 `<img>` + `object-fit`（html2canvas 會拉長）。清單截圖用 `splitReviewPages()` 依月份分頁。
- 直播紀錄 ↔ 行程：紀錄的 `mainEventId`／`streamEventId` 指向加進去的行程（`syncLogEvents()`、`LOG_TARGETS`）；更新時只動標題與時間，不覆蓋使用者改過的顏色／類別。社群小貼紙用 `socialPills(s)`（stream.js），回顧與直播行程共用。
- 批次加行事曆用 `addLogsToCalendar(list, want)`（只新增、不更新已加過的）；單筆編輯用 `syncLogEvents(e, want)`（會更新）。自動加入的設定是 `logAuto`（`KEY.logAuto`）。
- 匯入發現重複：用 `eventDiff(a, b)`（events.js）算差異、`askOverwrite(items, 文案)`（picker.js）問使用者；新增「把 A 清單的東西放進 B 清單」的功能時，要先找有沒有同一筆，有就走這個流程，不要直接複製。
- 同步（v0.62，`js/sync.js`）：靠包住 `Storage.prototype.setItem/removeItem` 偵測修改，所以存檔一律走 `save()`／`saveRaw()` 即可，不用另外通知；`tw_cal_sync_*`（`KEY.syncLast/syncDirty/syncThumbs`）是本機暫存、不會被同步，Twitch 憑證與 `streamMode`／`streamPanel` 也排除（見 `syncable()`）。**新增的設定鍵只要以 `tw_cal_` 開頭就會自動同步**；若是每台各自的偏好，要加進 `syncable()` 的排除清單。截圖在 IndexedDB，`thumbPut/thumbDel` 會呼叫 `syncTouchThumb(id)`。套用雲端資料＝直接寫 localStorage 後重新載入（`sync.reload`，測試會蓋掉）。測試用假資料夾物件（見 regress.js v0.62），沒有碰過真的 Google Drive。
- 週曆 3 場的縮字用 `fitDayText()`（stream.js），字級與卡片間距都乘 `--sw-k`；新增日卡片裡的文字時，字級也要寫成 `calc(Xrem * var(--sw-k))` 才會跟著縮。
