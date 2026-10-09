# 3D 城市（試作：銀座 × 商業街）

`/city3d`：把「商業街」的 56 個物品擺到真實的東京銀座街道上，第一人稱走路找東西。和 2D 小鎮**並存**，
關卡規則、進度、發音、UI 元件全部共用（進度 key 相同，2D 學過的字在 3D 也算數）。

## 結構

```
public/city3d/ginza/city.json, roads.json   銀座 OSM 建築與道路（Ginza 專案 build_city.py 產出，ODbL）
src/lib/city3d/collision.ts                 行走碰撞（純函式，移植自 Ginza web/collision.js）
src/lib/city3d/street-frame.ts              街道座標系：u 沿街、v 離中心線 → 世界座標與朝向
src/lib/city3d/model-dsl.ts                 3D「積木」格式：形體 + 色票名（不依賴 three.js，可測試）
src/data/city3d/street-models.ts            56 個物品 + 街景家具的積木模型（手工）
src/data/city3d/ginza-street.ts             擺放：中央通り東側人行道，路口→商店→咖啡店→公車站
src/components/city3d/toon.ts               畫風：三階卡通著色 + 反轉外殼墨線描邊
src/components/city3d/ginzaCity.ts          建築／地面／道路帶狀面／天空（移植自 Ginza web/city.js，改 la-game 配色）
src/components/city3d/ginzaStreetscape.ts   一樓店面櫥窗、遮陽棚（移植自 Ginza web/streetscape.js，色票重畫）
src/components/city3d/ginzaClockTower.ts    和光鐘樓：四面無文字刻度鐘、東京時間指針、卡通著色與墨線
src/components/city3d/ginzaLife.ts          車流 170 輛（輪廓車身）、人流 2,200 人（移植自 Ginza web/life.js，色票 + 卡通著色）
src/components/city3d/ginzaPeople.ts        會擺手腳的行人（shader 動畫，移植自 Ginza web/people.js，衣服用色票）
src/components/city3d/CityWorld.ts          three.js 引擎：行走、拖曳轉頭、raycast 點選、提示光柱、鳥瞰
src/components/city3d/GameScreen3D.tsx      React：關卡狀態機（同 2D GameScreen）+ 覆蓋 UI
```

## 畫風怎麼和 2D 對齊

- **顏色只用色票**：`model-dsl.ts` 的 `PALETTE` 就是 2D SVG 物件用的同一組色（`#37474f` 墨、`#e57373` 紅…），寫錯色名測試會擋。
- **卡通著色**：`MeshToonMaterial` + 三階漸層，不做寫實光影；大樓陰影 `shadow.intensity = 0.4`，只壓暗一點。
- **墨線描邊**：每個物品多畫一層背面外殼，沿法線外推、線寬依距離放大（畫面上約固定粗細），對應 SVG 的描邊。
- **建築**：Ginza 的程序化窗格改成 2D 小鎮的淺藍玻璃 + 墨色窗框，牆色用 2D 房子的粉彩色。
- **小東西放大成玩具尺寸**（杯子、湯匙、車票），第一人稱才找得到；測試要求最長邊 ≥ 18 cm。

## 操作

- 漫遊：WASD／方向鍵、Shift 跑、拖曳轉頭、點物品聽發音；手機有方向鍵。
- 右上「鳥瞰」切換俯視（OrbitControls）。
- 提示：在目標所在區域立黃色光柱，並把視線轉過去。
- 記憶挑戰：物品隱形，點的方向經過目標原位置附近就算對（`PickEvent.nearIds`）。

## 預覽截圖

`/city3d?view=u,v,lookU,lookV` 直接站到街道座標 (u, v) 看向 (lookU, lookV)，例如
`/city3d?view=52.5,13.4,52.5,16.4` 看咖啡吧台。可以拿來做像 `content:scene-preview` 的 3D 截圖審查。

## 新增物品模型

1. 在 `street-models.ts` 用 `box / cyl / sph / cone / tor`（y 是底部高度）組出物品，正面朝 +z、單位公尺。
2. 在 `ginza-street.ts` 加擺放（`rot` 0 = 朝馬路、90 = 朝出生點方向）。
3. `npm test`：會檢查每個 2D 物品都有模型、色名都在色票、擺放不在真實建築裡。

積木格式是純資料，之後可以讓 codex 照同一格式自動產生，接進自動擴展。

## 和 Ginza 專案同步

Ginza（`~/Documents/project/Ginza`，非 git）更新時要手動移植。最近一次：2026-10-09 12:54 版，同步了道路帶狀面、店面櫥窗／遮陽棚、車流人流（輪廓車身、會走路的行人 people.js）。
建築與道路資料沿用先前同步的版本；本次鐘樓同步沒有覆蓋 `city.json`／`roads.json`。

和光鐘樓已另外同步自 `web/signage.js`：沿用屋頂位置與輪廓，羅馬數字改成無文字刻度，套用色票、卡通著色與墨線。`CityWorld` 建構時加入鐘樓並立即校時，每 30 秒依電腦時鐘換算東京時間（UTC+9），切回頁面也會校時；銷毀場景時清除定時器和事件監聽。目前地圖沒有 `clock` 欄位時，使用原版位置與和光建築高度；未來有 `clock` 欄位則直接讀取。

另已同步 2026-10-09 14:49 版的三項美術更新：店面僅配置在朝街且外側沒有相鄰建築遮擋的牆面（仍避開遊戲區）；建築窗距分三種，中央 320 m 街區加合併繪製的屋簷與腰線；鐘樓增加底座、12 根裝飾柱、金色系鐘框與尖頂圓球。材質維持 la-game 卡通著色，鐘面維持無文字刻度與真實東京時間。

刻意**沒有**移植或做了改動的部分：

- **OSM 店名招牌**（`city.json` 的 `signs`）：la-game 背景不放文字（場景要給多語言共用），不移植。
- **遊戲區**（`ginza-street.ts` 的 `playZone`）：不放店面、不鋪道路帶狀面、不跑車和行人。否則會和要找的「櫥窗」「遮陽棚」「汽車」「計程車」「公車」混淆，行人也會穿過物品。區外照常有。
- **日夜變化**：la-game 固定白天晴空，不移植 Ginza 的太陽位置與夜間發光。

## 已知限制

- 只有商業街一個場景；其他街區、室內場景還沒做。
- OSM 的中央通り是上下行兩條 22 m 寬的線，地面貼圖會把人行道塗成車道色，所以這段另鋪 `fx-sidewalk` 地磚。
- 物件不擋路（玩家可以穿過吧台、長椅）；碰撞只算建築。
- `GameScreen3D` 的關卡流程和 2D `GameScreen` 重複，之後應抽成共用 hook。

## 授權

建築與道路資料 © OpenStreetMap contributors，ODbL 1.0（見 `public/city3d/ginza/ATTRIBUTION.md`），畫面右上角有標示。
城市建構程式碼移植自作者自己的 Ginza 專案。
