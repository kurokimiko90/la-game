# 小鎮自動擴展

> 2026-09-22 起｜分支 `feat/expand-scenes`｜miko-ws runtime 的排程每 30 分鐘推進一步｜每個場景 `itemsPerScene` 個物品（`content/expansion.json`）
> 所有 LLM 工作（場景規劃、單字表）和 SVG 生成都交給 miko-ws；發音用本機 edge-tts 打底，英語再用 build-voice 換成 ChatGPT 的聲音（失敗就保留 edge-tts，不擋整合）。沒有人工步驟。

## 1. 流程（`scripts/auto-expand.mjs`，每次執行推進一步）

```
idle
 │ 挑下一個主題與 slot（content/expansion.json）
 │ miko-ws codex：規劃 4 個區域（室內外、地面、地形特徵）→ 每區 itemsPerScene / 4 個物品（中英日、讀音、描述、位置；至少一半放地上）
 │ 驗證（格式、跨場景不重複、描述不含文字）→ content/plans/<id>.json、content/svg-manifests/<id>.json
 │ 登記 miko-ws jobs.json
generating
 │ miko-ws 生成 SVG（背景程序，每批 6 個）
 │ 生成失敗的隔輪退回重排（最多 maxRequeueRounds 輪）；「LLM 判定無合適圖」是永久失敗，不重排
integrating
 │ sync-svg → 寫 scene-config（區域、地帶、群組、動態、地形）→ 擺放 → build → 音檔
 │ vitest、tsc、eslint、Playwright E2E 全過 → 在本檔第 5 節記一筆 → commit
idle（下一個場景）
```

- **補元素**（`expansion.json` 的 `topUp: true`）：idle 時先補舊街區，再開新場景。已上線的街區每個區域補到 `itemsPerScene / 4` 個，
  只生成新的物品（miko-ws 只做 manifest 裡還沒做過的），舊物品的 SVG 和位置都不動；補的全放地上（空的是地板）。
  每個街區對同一個 `itemsPerScene` 只補一次（記在 `content/plans/<id>.json` 的 `topUp`），補不滿也不重試；調高 `itemsPerScene` 會再補一輪。
  `--status` 會列出待補的街區和數量。
- **任何一步失敗就停在 `blocked`**，不會一直燒額度。錯誤在 `.auto-expand/state.json`，各步驟輸出在 `.auto-expand/<步驟>.log`。
- **只 commit 到 `feat/expand-scenes`**，不 push。
- 物品少於 `minItems`（生成失敗太多）也算失敗。

```bash
node scripts/auto-expand.mjs --status     # 目前在哪一步、miko-ws 進度
node scripts/auto-expand.mjs              # 手動推進一步
node scripts/auto-expand.mjs --unblock    # 修好問題後，從卡住的步驟重來
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

## 3. 地圖

```
x:  0 ─────────── 2600 ─ 2935 ── 3600 ──────── 6200 ──────── 8800 ─────── 11400
y0     公園             │河│ 河邊東岸 │ slot 2    │ slot 7    │ slot 14
       商業街           │  │          ├───────────┤           │
y1300                   │  │          │ slot 3    │ slot 8    │ slot 15
       超市             │  │          │           │           │
y2600  車站（slot 1）    │  │ 河岸步道  │ slot 4    │ slot 9    │ slot 16
y3900  slot 5           │  │  延伸    │ slot 6    │ slot 10   │ slot 17
y5200  slot 11          │  │          │ slot 12   │ slot 13   │ slot 18
```

- slot 順序和主題清單在 `content/expansion.json`，要更多場景就往裡面加。
- 地圖大小自動算（核心範圍 + 已用的 slot）。河和東岸步道一路延伸到地圖南緣。
- 既有場景的座標不動；已上線的場景不要 `content:layout --reset`。

## 4. 已知限制

- 地形是模板，不像前 4 個場景那樣為每個地方量身畫（例如車站沒有站房外觀）。
- SVG 品質只有機械驗證（miko-ws 驗證器），沒有人看過就 commit。要人工檢查：開著 server 跑 `npm run content:scene-preview`。
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
