@AGENTS.md

# 記憶小鎮（la-game）— 本地 Claude 指引

沉浸式語言找物遊戲：在小鎮裡找東西、點物品聽發音（英語 / 日語），物品位置固定，用空間記單字。
所有場景是同一張 2D 小鎮地圖上的街區（3/4 俯視地面 + 正面直立物件；地形在 `src/components/scene/WorldBackground.tsx`），`/scene/<id>` 是「目前街區」。
規劃見 `docs/planning.md`，素材產線見 `docs/svg-assets.md`。

## Tech Stack

- Next.js 16（App Router）+ React 19 + TypeScript + Tailwind v4
- 單元測試 Vitest；E2E Playwright（用本機 Chrome，`channel: 'chrome'`）
- 無後端：進度存 localStorage（`src/components/ProgressProvider.tsx`，讀取時用 `parseProgress` 驗證）

## Commands

```bash
npm run dev               # 開發
npm run build && npm start
npm run play              # 試玩用 production（build 到 .next-play、開在 3220）；自動擴展重建 .next 不會弄壞它
npm test                  # Vitest（src/lib、scripts/lib）
npm run test:coverage
npm run test:e2e          # next build + Playwright
npm run lint && npm run typecheck
```

## 內容管線（改內容不要直接改 src/data）

場景製作標準（小鎮地圖、擺放、動態）見 `docs/scene-standard.md`，新場景照 §4 流程做。

```
content/svg-manifests/*.json   單字（中/英/日+讀音）、物品描述 ← 唯一來源
        │ miko-ws 場景素材工廠生成 SVG → npm run content:sync-svg
public/svg/<scene>/<itemId>.svg
content/scene-config.json      地圖大小、各區域在地圖上的矩形、地帶、成群、散落、動態
        │ npm run content:layout -- <scene>（只替沒有位置的物件擺放；--reset 整個重排）
content/layouts/<scene>.json   鎖定的位置（可手改，build 只讀它）
        │ npm run content:scenes（白名單清洗 SVG + 檢查擺放/動態/id 重複）
src/data/scenes/<scene>.json   遊戲讀的資料（產出物）
        │ npm run content:audio（edge-tts 底稿，保證每個詞都有聲音）
        │ npm run content:voice（miko-ws 讓 ChatGPT 念整個場景 → whisper 切割、驗收 → 覆蓋；記錄在 content/voice/）
public/audio/<en|ja|zh>/<scene>/<itemId>.mp3
```

- 擺放演算法：`scripts/lib/layout.mjs`；動態參數：`scripts/lib/motion.mjs`；設定檢查：`scripts/lib/scene-config.mjs`；SVG 白名單：`scripts/lib/svg-sanitize.mjs`
- 預覽整張地圖與各街區：開著 `npm run dev` 再跑 `npm run content:scene-preview` → `docs/scene-preview/`
- 地形座標（道路、河、牆）在 `WorldBackground.tsx`，要和 scene-config 的區域、地帶一致，改地圖時兩邊一起改
- 街區之間的路網、地圖邊緣（海岸、丘陵）由 `src/lib/city.ts` 算、`src/components/scene/city/` 畫；格線數字要和 `district-kit.mjs` 一致（見 `docs/city-plan.md`）
- 物件 SVG 會被內嵌（點擊範圍 = 形狀），所以一定要經過白名單清洗；不要繞過 build-scenes 直接用 SVG
- 場景上線後不要 `content:layout --reset`（玩家記住的位置會變）

## 自動擴展（新場景全自動，見 `docs/expansion.md`）

- `scripts/auto-expand.mjs` 由 miko-ws runtime 的 `LaGameExpandScheduler` 每 30 分鐘推進一步（miko-ws `.env` 的 `LA_GAME_EXPAND_ENABLED`）：miko-ws codex 規劃場景與單字表 → miko-ws 生成 SVG → 整合、測試、commit 到 `feat/expand-scenes`
- 新場景用街區模板（`scripts/lib/district-kit.mjs` + `src/components/scene/districts/GeneratedDistrict.tsx`），不手畫地形；主題與地圖 slot 在 `content/expansion.json`
- 規劃結果在 `content/plans/<scene>.json`（manifest 由它產生）；狀態與紀錄在 `.auto-expand/`（不進 git）
- `src/data/scenes/registry.ts` 由 build-scenes 產生，新場景不用改 `src/lib/scenes.ts`

## Key Constraints

- 遊戲規則是純函式（`src/lib/stages.ts`、`progress.ts`、`geometry.ts`、`town.ts`），UI 只呼叫；新規則先寫單元測試
- 物件圖與背景都不放文字（場景要給多語言共用）；UI 文字用繁體中文
- 函式名不要用 `use` 開頭除非是 hook（React Compiler lint 會把它當 hook）
- Next 16 的 `params` 是 Promise：server page 用 `await params`
