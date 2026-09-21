# SVG 素材清單與 miko-ws 產線

> 日期：2026-09-21｜狀態：132/132 已生成並同步到 `public/svg/`；預覽圖在 `docs/svg-preview/`

## 1. 要生成的 SVG

**只有「場景物件」需要生成**：4 個場景共 132 個 SVG。其他畫面元素不另外生成：

| 用途 | 來源 | 需要生成？ |
| --- | --- | --- |
| 場景可點擊物件 | miko-ws Lane B（LLM 手寫 SVG） | ✅ 132 個 |
| 任務清單提示圖（階段 1 看圖找） | 直接用同一個物件 SVG | ❌ |
| 詞彙本卡片圖 | 直接用同一個物件 SVG | ❌ |
| 小鎮地圖入口 | 每個場景挑一個代表物件（噴泉 / 紅綠燈 / 橋 / 購物車） | ❌ |
| 場景底圖（天空、地面、道路、水面） | la-game 用幾個幾何圖層組合 | ❌ |
| UI 圖示（提示、聲音、返回、星星、鎖） | 用 Lucide 圖示庫 | ❌ |
| 動物、人物（16 個） | Lane B 不能畫生物，之後走 Lane A（PNG） | ⏸ 暫緩 |

| 場景 | manifest | SVG（Lane B） | 暫緩（Lane A） | codex 呼叫（每批 6 個） |
| --- | --- | --- | --- | --- |
| 公園 | `content/svg-manifests/park.json` | 33 | 6 | 6 |
| 商業街 | `content/svg-manifests/street.json` | 34 | 3 | 6 |
| 河邊商業區 | `content/svg-manifests/riverside.json` | 30 | 5 | 5 |
| 超市 | `content/svg-manifests/supermarket.json` | 35 | 2 | 6 |
| **合計** | | **132** | **16** | **約 23 次**（重試另計） |

## 2. 多語言設計：SVG 裡不放任何文字

學習語言為**英語 + 日語**，同一個場景要能對應多種語言，所以：

- SVG 只畫物件，**不含 `<text>`、字母、數字**（招牌、看板、票券都只用色塊）。
- 單字放在 manifest 的 `ref.words`，換語言只換資料和音檔，場景和 SVG 不動：

```json
"ref": {
  "project": "la-game", "scene": "park", "zone": "plaza", "itemId": "fountain",
  "words": { "zh-TW": "噴泉", "en": "fountain", "ja": { "text": "噴水", "reading": "ふんすい" } }
}
```

- 日語保留 `reading`（假名讀音），畫面上可以顯示成漢字加上方小字讀音（振假名）。
- 132 + 16 個英文單字跨場景沒有重複（產生 manifest 時已檢查）。

## 3. 視角：正面平視（front-flat），不用 miko-ws 預設的俯視

miko-ws Lane B 目前寫死「鳥瞰俯視 90°」。俯視圖裡的路燈、紅綠燈、郵筒、腳踏車都只剩一個圓點或細線，**認不出是什麼東西**，對學單字是致命問題。所以改成：

- 正面平視的扁平圖示；鋪在地上的物件（野餐墊、沙坑、斑馬線）用略帶俯角的平行四邊形畫出上表面。
- 物件底部貼齊 viewBox 底緣：場景按「地面線」擺放物件，前後景用縮放和上下位置表現。
- 附帶好處：每個物件在場景裡是一個獨立的 `<g>`，**點擊範圍就是物件本身的形狀**，不需要另外做熱區標註工具。

## 4. miko-ws 端的實作（已完成）

- **`front-flat` 畫風**：`src/skills/scene-assets/config/prop-style.js` 新增正面平視的設計規則與 3 個範例；`stage1b-svg.js` 依 manifest 的 `propStyle` 選配方，`front-flat` 會擋掉含 `<text>` 的 SVG。`propStyle` 在匯入時寫進 registry，之後重生也沿用。
- **LLM 路由**：Lane B 只走 codex，用排隊任務的方式（`runCodexText`），不再落回 Chrome pool。實測中落回 Perplexity / Gemini 的批次全部失敗（公園 6 個、商業街 12 個、河邊 6 個）；只走 codex 一批約 75 秒，全部通過驗證。
- **通用排程**：`SceneAssetJobScheduler` 讀 `data/scene-assets/jobs.json`（已登記 4 個場景）。`.env` 已設 `SCENE_ASSET_JOBS_ENABLED=true`，**runtime 重啟後才生效**。
- **手動指令**：`node scripts/scene-asset-jobs.js --status | --once | --loop`。同一場景同時只允許一個程序寫入（依場景加鎖）；每批的輸出寫在 `logs/single/scene-asset-jobs.log`，失敗時會記下違反了哪條規則。
- **測試**：`tests/scene-assets.frontFlat.test.js`、`tests/scene-assets.jobs.test.js`，共 22 個，全部通過。
- **驗證器**：除了原有規則，新增擋 `<text>`、非數字座標、內容跑出 viewBox 外；失敗時會記下違反了哪條規則。

## 5. 執行紀錄與操作

**結果（2026-09-21）**：4 個場景共 132 個全部生成，並通過機械驗證（沒有漸層、曲線、文字；座標是數字；內容在畫面內）。
用 Chrome 看成品的結論：約 128 個一眼能認出；**三明治（像金字塔）、滑板機車 scooter、高麗菜、香腸**偏弱，可以改描述後重生，或人工修圖。

過程中踩到的問題與修正：

| 問題 | 影響 | 修正 |
| --- | --- | --- |
| 落到 Perplexity / Gemini 的批次解析不出元素 | 公園 6 個、商業街 12 個、河邊 6 個失敗 | Lane B 改成只走 codex（排隊等待） |
| gateway 逾時 | 公園 1 批失敗 | 改用排隊任務，最多等 20 分鐘 |
| 手動 `--regen` 與排程同時寫同一個場景 | 3 個已完成的元素被寫回 failed | 同一場景加寫入鎖；`--loop` 單次失敗不中斷 |
| LLM 在 `points` 裡寫英文數字（`forty,52`） | 腳踏車畫不出來 | 驗證器擋非數字座標 |
| viewBox 與內容錯位 | 信用卡整張空白 | 驗證器檢查內容是否在 viewBox 內（信用卡已手動修正 viewBox） |
| 描述不清 | 嬰兒車、雨傘、飲水台、桌子、斑馬線、背包、繩子的畫面錯誤 | 改寫 manifest 描述後重生 |

⚠️ **不要用 ImageMagick 判斷品質**：它的 SVG 引擎會漏畫描邊，白色物件因此「消失」，我一度把好的圖誤判成壞圖。預覽一律用 `node scripts/preview-sheet.mjs`（本機 Chrome 渲染）。

```bash
# 進度（miko-ws）
node scripts/scene-asset-jobs.js --status
# 單個元素重生（先改 la-game manifest 的 desc）
node scripts/scene-asset-gen.js --scene="語言小鎮・公園" --slug=la-park \
  --manifest=<la-game 路徑>/content/svg-manifests/park.json --regen=el-0xx
# 拉回 la-game → public/svg/<scene>/<itemId>.svg，狀態寫 content/svg-status.json
node scripts/sync-svg.mjs
# 預覽圖 → docs/svg-preview/<scene>.png
node scripts/preview-sheet.mjs
```

- `failed` 的元素排程不會自動重跑（避免同一個壞元素一直消耗額度），要用 `--regen`。
- **manifest 是單字與描述的唯一來源**：修改描述請直接改 `content/svg-manifests/*.json`。

## 6. 暫緩項：動物與人物（16 個）

鴿子、狗、貓、鴨子、松鼠、蝴蝶、海鷗、魚、螃蟹、警察、郵差、花店老闆、船長、服務生、店員、收銀員。

Lane A 輸出的是 PNG，要做成跟扁平 SVG 一致的畫風，需要先為 la-game 探索並確定一套風格設定（explore-style / commit-style）。原型階段（M1）先不放動物和人物。
