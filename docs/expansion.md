# 場景擴展計畫（loop 用）

> 2026-09-22 開始｜分支 `feat/expand-scenes`｜每 30 分鐘一套｜**每套約 70 個元素**（使用者 2026-09-22 指定）｜做完 5 套就停，等使用者看成果
> 場景製作標準見 [scene-standard.md](scene-standard.md)，本檔只記佇列、地圖配置與每套的步驟。

## 1. 佇列

| # | 場景 id | 名稱 | 地圖位置（2600×1300） | 區域（草案） | 狀態 |
| --- | --- | --- | --- | --- | --- |
| 1 | `station` | 車站 | x 0–2600, y 2600–3900（超市南邊） | 剪票口、售票大廳、站前廣場在北排，月台是南邊整條 | 進行中 |
| 2 | `restaurant` | 餐廳 | x 3600–6200, y 0–1300（河邊東岸再往東） | 門口 → 用餐區 → 吧台 → 廚房 | 待做 |
| 3 | `school` | 學校 | x 3600–6200, y 1300–2600 | 校門 → 教室 → 操場 → 保健室 | 待做 |
| 4 | `hospital` | 醫院 | x 3600–6200, y 2600–3900 | 大門 → 掛號櫃台 → 候診室 → 診間 | 待做 |
| 5 | `airport` | 機場 | x 0–2600, y 3900–5200（車站南邊） | 出發大廳 → 安檢 → 登機門 → 停機坪 | 待做 |

區域和物品到做那一套時再定，可以改；地圖位置盡量照表，免得後面的場景沒地方放。

## 2. 地圖配置（做完 5 套後）

```
x:  0 ─────────────── 2600 ─ 2935 ── 3600 ─────────────── 6200
y0     公園                 │河│ 河邊東岸 │ 餐廳
       商業街               │  │          ├─────────
y1300                       │  │          │ 學校
       超市                 │  │          │
y2600  車站（月台在南緣）    │  │ 河岸步道  │ 醫院
y3900  機場                 │  │  延伸    │（空地，留給之後的場景）
y5200
```

- 每套 70 個元素，所以新街區約 2600×1300（公園 33 個用 2600×1130），密度和商業街差不多。
- `world` 跟著場景逐步加大：車站 3600×3900 → 餐廳 6200×3900 → 機場 6200×5200。
- 地圖只往南、往東加大，**既有場景的座標不動**（原點在左上）。
- 加大 `world` 時，`WorldBackground.tsx` 裡用 `WORLD.w / WORLD.h` 畫到邊的地形（河、東岸）要檢查：東岸固定畫到 x 3600；河一路流到地圖南緣。
- 新場景的地形放在 `src/components/scene/districts/<Name>.tsx`（`WorldBackground.tsx` 已 242 行，不再往裡面塞），在 `WorldBackground.tsx` 引入並加一個 `SECTIONS` 分區。

## 3. 每一套的步驟

每次 loop 觸發時：

0. **先看有沒有做到一半的場景**（manifest 已存在但還沒進 `scene-config.json` 的 `order`，或 miko-ws 還有 pending）。有就接著做，不開新場景。第 1 節佇列全部「完成」→ 刪掉 cron、回報，結束。
1. **manifest** `content/svg-manifests/<id>.json`：格式照現有檔案（`sceneName: "語言小鎮・<名稱>"`、`sceneSlug: "la-<id>"`、`propStyle: "front-flat"`、`zones`、`elements`）。
   - 約 70 個 Lane B 物件；動物 / 人物可列 Lane A（暫緩，不生成）。
   - `itemId` 與英文單字不能和任何現有 manifest 重複（寫完用腳本檢查）；日語 `reading` 用平假名 / 片假名。
   - `desc` 要寫出能一眼認出的特徵，不含文字、數字；之前描述不清就畫錯（見 svg-assets.md §5）。
2. **生成**：在 miko-ws 的 `data/scene-assets/jobs.json` 加一筆 job，背景跑 `node scripts/scene-asset-jobs.js --loop`（有鎖，不會和 runtime 排程互搶）。
3. **生成期間做地圖**：`scene-config.json`（`world`、`order`、場景設定）、`districts/<Name>.tsx` 地形、`SECTIONS`、`TownMinimap.tsx` 的 `COLORS`、`src/lib/scenes.ts` 的 import。每個區域至少 1 個背景動態；背景不畫像單字物品的東西。
4. **收圖**：`npm run content:sync-svg` → `npm run content:preview` → 看預覽圖；認不出的改 `desc` 後 `--regen`。
5. **擺放**：`npm run content:layout -- <id>` → `npm run content:scenes` → `npm run content:audio` → 開著 dev server 跑 `npm run content:scene-preview`，看圖後手改 `content/layouts/<id>.json`。
6. **檢查**：`npm test`、`npm run lint`、`npm run typecheck`、`npm run test:e2e`（E2E 裡寫死場景數的地方要跟著改）。
7. **文件**：本檔佇列狀態與第 4 節紀錄、`svg-assets.md` 的場景表、`scene-standard.md` §1 地圖、`planning.md` 進度總覽。
8. **commit**：`feat: add <名稱> district (<N> items)`，只 commit 在 `feat/expand-scenes`。

不能做的事：移動既有場景座標、對既有場景 `content:layout --reset`、在 SVG 或背景放文字、繞過 build-scenes 直接用 SVG、push。

## 4. 紀錄

| 場景 | 完成時間 | 物品數 | 重生次數 | 備註 |
| --- | --- | --- | --- | --- |
| 車站（station） | 2026-09-22 02:24 | 67 | 1 | 自動 |
