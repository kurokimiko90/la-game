# 小鎮自動擴展

> 2026-09-22 起｜分支 `feat/expand-scenes`｜miko-ws runtime 的排程每 30 分鐘推進一步｜每個場景 `itemsPerScene` 個物品（`content/expansion.json`）
> 所有 LLM 工作（場景規劃、單字表）和 SVG 生成都交給 miko-ws；發音用本機 edge-tts 打底，英語再用 build-voice 換成 ChatGPT 的聲音（失敗就保留 edge-tts，不擋整合）。沒有人工步驟。

## 1. 流程（`scripts/auto-expand.mjs`，每次執行推進一步）

```
idle
 │ 挑下一個主題與 slot（content/expansion.json）
 │ miko-ws codex：規劃 4 個區域（室內外、地面、地形特徵）→ 每區 itemsPerScene / 4 個物品（中英日、讀音、描述、位置；至少一半放地上）
 │ 驗證（格式、跨場景不重複、描述不含文字）
 │ 單字審核（codex 當語言老師：日文自然度、讀音、台灣中文、場景合理）→ 修正 zh/ja/reading 或丟掉
 │ → content/plans/<id>.json（套用的修正記在 reviewFixes）、content/svg-manifests/<id>.json
 │ 登記 miko-ws jobs.json
generating
 │ miko-ws 生成 SVG（背景程序，每批 6 個）
 │ 生成失敗的隔輪退回重排（最多 maxRequeueRounds 輪）；「LLM 判定無合適圖」是永久失敗，不重排
integrating
 │ sync-svg → 寫 scene-config（區域、地帶、群組、動態、地形）→ 擺放 → build → 音檔
 │ vitest、tsc、eslint、Playwright E2E 全過
 │ 品質檢查 scripts/review-scene.mjs → 列入待人工審（.auto-expand/review-queue.json，不擋 commit）
 │   渲染檢查（空白、剪影、渲染失敗）、自動試玩（點不點得到、手機上多大）、看圖驗收（codex 附圖：像不像、哪些太像）
 │   構圖審查排進 .auto-expand/layout-pending.json：commit 後 reload-play 換上新版伺服器再截圖給 codex 評 1–5 分
 │ → 在本檔第 5 節記一筆 → commit
idle（下一個場景）
```

- **補元素**（`expansion.json` 的 `topUp: true`）：idle 時先補舊街區，再開新場景。已上線的街區每個區域補到 `itemsPerScene / 4` 個，
  只生成新的物品（miko-ws 只做 manifest 裡還沒做過的），舊物品的 SVG 和位置都不動；補的全放地上（空的是地板）。
  每個街區對同一個 `itemsPerScene` 只補一次（記在 `content/plans/<id>.json` 的 `topUp`），補不滿也不重試；調高 `itemsPerScene` 會再補一輪。
  `--status` 會列出待補的街區和數量。
- **失敗不會一直停著**（`scripts/lib/recovery.mjs`）：
  - 規劃的合格物品不夠 → 跳過這個主題（記在 state 的 `skipped`，log 會寫不合格原因統計），下一輪換下一個主題
  - 規劃、生成出錯（多半是 miko-ws 連不上）→ 停在 `blocked`，退避後自動重試（30 分、1、2、4、最多 6 小時），不放棄主題
  - 整合連續失敗 3 次 → 放棄這個場景，改到一半的檔案收進 `git stash`（`git stash list` 找得回來）
  - git 撞到 `index.lock`：有 git 在跑就等 5 秒重試；沒有 git 在跑、鎖放超過 10 分鐘就當殘留刪掉（`scripts/lib/git-lock.mjs`）
  - commit 失敗時 `docs/expansion.md` 的紀錄會拿掉，重試不會一筆變多筆
  - 錯誤在 `.auto-expand/state.json`，各步驟輸出在 `.auto-expand/<步驟>.log`
- **品質關卡**（2026-10-01 起）：
  - 單字審核 `scripts/lib/vocab-review.mjs`：修正只能改 zh / ja / reading（圖是照英文畫的，改英文等於換東西）；
    審核想丟掉超過 20% 就當作審核不可靠，不丟物品只套修正；審核失敗照原樣放行。
  - 渲染檢查 `scripts/check-svg-render.mjs`（規則在 `scripts/lib/svg-render-check.mjs`）：只抓「畫壞了」。
  - 自動試玩 `scripts/lib/playtest.mjs`：用遊戲本身的點擊判定（`itemAtPoint`，重疊時小的優先）和手機預設縮放，
    標出點得到不到 30%、手機上短邊不到 24px 的物件。2026-10-01 全部 2140 個物件都沒標到（最差 41%、25px），目前是防退步用。
  - 看圖驗收 `scripts/lib/visual-review.mjs`：每 20 個物件拼一張編號對照表，附圖給 miko-ws 的 codex（`codexText(prompt, { images })` →
    miko-ws `codex exec --image`），問每格像不像描述、哪些長得太像。一個街區約 5 次呼叫、8 分鐘。
    2026-10-01 在 gym 校準（以人工看圖為準，樣本 1 個街區）：標記的約七成五同意、漏掉約三成，所以只進清單、不擋 commit、不自動重畫。
  - 構圖審查 `scripts/lib/layout-review.mjs`：在試玩伺服器上把每個區域縮放、置中截圖（`.auto-expand/review/<scene>-zone-<id>.png`），
    4 張一次給 codex，問擺放合不合理、給 1–5 分。gym 同一份截圖兩次給了 3 分和 2 分，問題描述對錯參半，只當參考。
  - 玩家數據：遊戲裡記每個物件找了多久、點錯、提示、揭曉（`src/lib/playstats.ts`，本機 localStorage），`/stats` 看最難找的並匯出；
    `node --no-warnings scripts/import-play-stats.mjs <匯出檔>` 匯入後，玩家常找不到的物件列進待人工審清單。
  - `--status` 列出待人工審的街區；細節在 `.auto-expand/review/<scene>.json`，對照表 `.auto-expand/review/<scene>-<n>.png`，
    看完從 `review-queue.json` 刪掉。手動跑：`node scripts/review-scene.mjs <scene> [--no-vision]`。
  - 閒置（沒有 slot、主題用完、到上限）同樣的原因只記一次 log。
- **只 commit 到 `feat/expand-scenes`**，不 push。
- 物品少於 `minItems`（生成失敗太多）也算失敗。

```bash
node scripts/auto-expand.mjs --status     # 目前在哪一步、miko-ws 進度
node scripts/auto-expand.mjs              # 手動推進一步
node scripts/auto-expand.mjs --unblock    # 不等退避，馬上從卡住的步驟重來
tail -f .auto-expand/auto-expand.log
```

**排程**：miko-ws runtime 的 `LaGameExpandScheduler`（`miko-ws/src/skills/scene-assets/LaGameExpandScheduler.js`），
和 `SceneAssetJobScheduler` 同一套模式：miko-ws 啟動後自動跑，每 30 分鐘叫一次 `auto-expand.mjs`。
開關在 miko-ws 的 `.env`：`LA_GAME_EXPAND_ENABLED=true`、`LA_GAME_EXPAND_INTERVAL_MS`、`LA_GAME_DIR`（預設 `../la-game`）。
排程狀態：`miko-ws/logs/single/la-game-expand-state.json`。
同一個場景內不等排程：規劃完直接開始生成；生成器結束後自己接著跑 `auto-expand.mjs --after-generator` 去整合（失敗的重排後也馬上重開生成）。
排程只負責開新場景和保底（生成器中途掛掉、接續呼叫撞到鎖時）。

## 2. 街區模板（`scripts/lib/district-kit.mjs`）

每個新場景佔一個 slot（2600×1300），切成 2×2 個區域，路線順時針（左上 → 右上 → 右下 → 左下）。
LLM 只從列舉值裡選，幾何由模板算：

| 欄位 | 可選 |
| --- | --- |
| 室內外 | 室內：後牆（可掛東西、靠牆放大型設備）＋兩側牆柱，牆上的燈會明暗變化；室外：花台草叢會動、可以放飄在空中的東西 |
| 地面 | 室內 tile / wood / carpet；室外 grass / paving / sand / concrete |
| 地形特徵 | none、road（車道）、track（鐵軌）、water（水池）只能在室外；counter / table / stand / chiller / checkout（檯面，沿用 `Surfaces.tsx`） |
| 物品位置 | ground、wall、wallbase、surface、road、track、water、sky（區域不支援的位置退回 ground） |

**自動排列**：`planToSceneConfig` 產生的設定帶 `"arrange": "auto"`，擺放時依地形和物件大小自動排（規則見 `docs/scene-standard.md` §2.2）。排不進整齊位置的物件改成隨機，並在 `content:layout` 印出 ⚠️，不會卡住流程。補元素時新物件會避開已鎖定的物件排。

地形由 `src/components/scene/districts/GeneratedDistrict.tsx` 照場景 JSON 的 `terrain` 畫；手畫的前 4 個場景不受影響。
新場景不用改程式：`build-scenes` 會產生 `src/data/scenes/registry.ts`，小地圖顏色也在 `terrain` 裡。

## 3. 地圖（城市格線，2026-09-23 起；規劃見 `docs/city-plan.md`）

slot 之間留 240 寬的街道，外圍一圈環路，再外面是東側丘陵與南側海岸。幾何在 `src/lib/city.ts`（畫路網）和 `scripts/lib/district-kit.mjs`（`STREET_WIDTH`、`EDGE_SIZE`、`worldSize`），兩邊由單元測試檢查一致。

```
x:  0 ──── 2600 ─ 2935 ─ 3600 │街│ 3840 ── 6440 │街│ 6680 ── 9280 │街│ 9520 …  │環路│ 丘陵
y0     公園         │河│ 河邊東岸 │  │ 餐廳         │  │ 郵局         │  │ 商業
       商業街       │  │          │  │ ═══ 街 ═════ ╪══╪ ═══════════ ╪══╪
y1540  超市         │  │          │  │ 學校         │  │ 消防局       │  │ 商業
y2600  ══ 街（核心南緣）══ 橋 ═══════╪══╪ ═══════════ ╪══╪ ═══════════ ╪══╪
       站前廣場     │  │          │圓環
y3080  車站         │  │ 河岸步道  │  │ 醫院         │  │ 麵包店       │  │ 商業
y4620  機場         │  │          │  │ 圖書館       │  │ 海邊         │  │ 休閒
       ═══════════════ 濱海環路 ════════════════════════════════════════════════
       沙灘、海（河在這裡出海）
```

- slot 和主題都有 `zone`（土地使用分區：commercial / civic / neighborhood / residential / leisure / outskirts）。新主題優先放同分區的空 slot，沒有才放任何空的（`nextSlot`）。主題清單的順序 = 建造順序，城市由內往外長。
- 地圖大小自動算（內側範圍 + 環路 + 邊緣）。格線上還沒蓋的 slot 畫成小樹林。
- 2026-09-23 把已上線的 10 個自動擴展街區整塊平移過一次（`scripts/migrate-city-grid.mjs`，只能跑一次，`expansion.json` 的 `grid.street` 是標記）。街區內的相對位置不變；玩家進度只存物件 id，不受影響。
- 之後已上線的場景座標不動；不要 `content:layout --reset`。
- **手畫核心 4 區也會補元素**（2026-09-23 起）：`content/plans/{park,street,riverside,supermarket}.json` 是從 manifest 反推的（`manifestToPlan`，`core: true`、`itemsTarget: 70`）。整合時不重寫手寫的 scene-config，只替新物品在 ground 地帶排位置，舊物品不動。目標 70 比 itemsPerScene 小，因為手畫區域有湖、馬路、貨架，空地少。

## 4. 已知限制

- 地形是模板，不像前 4 個場景那樣為每個地方量身畫（例如車站沒有站房外觀）。
- 看圖驗收準確度只有約七成五、構圖審查分數不穩定（見上），都只進清單，不自動重畫或重排。
- 看圖驗收依賴 miko-ws 的附圖支援（`src/skills/course/brains/index.js` 的 `sendMessageFresh(prompt, { images })`，2026-10-01 加）。
- 單字審核本身也會錯（2026-10-01 實測：曾把泳帽判成不屬於健身房、給錯讀音），所以修正記在 plan 的 `reviewFixes` 可追查。
- 場景越多，整張地圖的物件越多；手機效能還沒實測（見 planning.md 風險表）。
- codex 忙的時候整批會逾時（2026-09-21 晚上車站 53 個失敗），靠隔輪重排補回來。

## 5. 紀錄

| 場景 | 完成時間（UTC） | 物品數 | 重排輪數 | 備註 |
| --- | --- | --- | --- | --- |
| 車站（station） | 2026-09-22 02:24 | 67 | 1 | 自動整合；單字表手寫。雕像、出口標示、泰迪熊畫不出來（人形 / 動物形） |
| 餐廳（restaurant） | 2026-09-22 05:58 | 70 | 0 | 自動 |
| 學校（school） | 2026-09-22 07:27 | 70 | 0 | 自動 |
| 醫院（hospital） | 2026-09-22 08:57 | 69 | 0 | 自動 |
| 機場（airport） | 2026-09-22 11:46 | 70 | 0 | 自動 |
| 圖書館（library） | 2026-09-22 12:57 | 67 | 0 | 自動 |
| 郵局（post-office） | 2026-09-22 13:44 | 70 | 0 | 自動 |
| 醫院（hospital） | 2026-09-23 01:04 | 92 | 1 | 補元素 +23 |
| 機場（airport） | 2026-09-23 01:38 | 89 | 0 | 補元素 +19 |
| 圖書館（library） | 2026-09-23 05:34 | 88 | 1 | 補元素 +0 |
| 郵局（post-office） | 2026-09-23 06:07 | 91 | 0 | 補元素 +21 |
| 消防局（fire-station） | 2026-09-23 06:41 | 80 | 0 | 自動 |
| 消防局（fire-station） | 2026-09-23 06:53 | 84 | 0 | 補元素 +4 |
| 麵包店（bakery） | 2026-09-23 07:19 | 74 | 0 | 自動 |
| 麵包店（bakery） | 2026-09-23 07:33 | 91 | 0 | 補元素 +17 |
| 海邊（beach） | 2026-09-23 10:58 | 80 | 0 | 自動 |
| 公園（park） | 2026-09-23 12:49 | 65 | 0 | 補元素 +32 |
| 商業街（street） | 2026-09-23 13:33 | 61 | 0 | 補元素 +27 |
| 河邊商業區（riverside） | 2026-09-23 22:49 | 53 | 0 | 補元素 +23 |
| 超市（supermarket） | 2026-09-23 23:09 | 68 | 0 | 補元素 +33 |
| 海邊（beach） | 2026-09-23 23:18 | 95 | 0 | 補元素 +15 |
| 服飾店（clothing-store） | 2026-09-25 20:29 | 70 | 0 | 自動 |
| 服飾店（clothing-store） | 2026-09-25 20:37 | 88 | 0 | 補元素 +18 |
| 電影院（movie-theater） | 2026-09-25 21:17 | 82 | 0 | 自動 |
| 電影院（movie-theater） | 2026-09-25 21:38 | 91 | 0 | 補元素 +9 |
| 銀行（bank） | 2026-09-26 10:58 | 99 | 0 | 自動 |
| 銀行（bank） | 2026-09-26 11:06 | 100 | 0 | 補元素 +1 |
| 服飾店（clothing-store） | 2026-09-26 11:53 | 88 | 0 | 改成兩格、情境重排 |
| 電影院（movie-theater） | 2026-09-26 12:02 | 91 | 0 | 改成兩格、情境重排 |
| 銀行（bank） | 2026-09-26 12:07 | 100 | 0 | 改成兩格、情境重排 |
| 海邊（beach） | 2026-09-26 12:10 | 95 | 0 | 改成兩格、情境重排 |
| 博物館（museum） | 2026-09-26 12:25 | 100 | 0 | 自動 |
| 警察局（police-station） | 2026-09-26 13:01 | 100 | 0 | 自動 |
| 美髮院（hair-salon） | 2026-09-26 14:15 | 100 | 0 | 自動 |
| 花店（flower-shop） | 2026-09-26 14:58 | 100 | 0 | 自動 |
| 書店（bookstore） | 2026-09-26 16:12 | 100 | 0 | 自動 |
| 文具店（stationery-store） | 2026-09-27 19:46 | 100 | 0 | 自動 |
| 我的家（home） | 2026-09-27 21:51 | 78 | 4 | 自動 |
| 健身房（gym） | 2026-09-28 09:31 | 100 | 0 | 自動整合；殘留的 index.lock 擋住 commit，10-01 手動補 commit |
