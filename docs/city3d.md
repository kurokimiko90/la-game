# 3D 城市（試作：銀座 × 商業街）

`/city3d`：把「商業街」的 56 個物品擺到真實的東京銀座街道上，操作第三人稱小人走路找東西。和 2D 小鎮**並存**，
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
src/lib/city3d/road-layout.ts               中央通り上下行車道寬度修正、車道虛線判定、外側路緣（移植自 Ginza road-layout / road-markings）
src/lib/city3d/greenery.ts                  中央通り桂樹 + 四區植栽帶的近似配置（遊戲區外；純資料）
src/components/city3d/ginzaGreenery.ts      桂樹與植栽帶外觀（色票 + 卡通著色，InstancedMesh）
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

- 漫遊（第三人稱，`ginzaAvatar.ts` 小人）：點地面走過去、WASD／方向鍵（相對鏡頭）、Shift 跑、拖曳繞小人轉鏡頭、滾輪遠近、點物品聽發音；手機有方向鍵。
- 鏡頭注視小人前方 3 m，小人在畫面下方；小人擋住後面的物品時自動半透明。記憶挑戰關掉點地面走路（點空地 = 作答）。
- 右上「鳥瞰」切換俯視（OrbitControls）。
- 提示：在目標所在區域立黃色光柱，並把視線轉過去。
- 記憶挑戰：物品隱形，點的方向經過目標原位置附近就算對（`PickEvent.nearIds`）。

## 畫面氛圍（可愛 Q 版小鎮）

- **滾筒世界**：`src/lib/city3d/curvature.ts`。離鏡頭越遠往下彎（y -= k·水平距離²，k = 0.001），遠處沉到地平線下、露出天空。
  全域改 three.js 的 `project_vertex`（`toon.ts`），自訂 shader（描邊、店內）各自插 `curveGLSL`；鏡頭高於 40 m（鳥瞰、陰影貼圖）不彎。
  頂點要夠密才彎得起來：`subdivide.ts` 把大網格沿最長邊切到遊戲區附近 2 m、越遠越粗（總三角形約 2.3M → 2.6M）。
  點選用 `rayPolyline` 把射線還原成彎曲前的折線；k 太大（0.0025）時 30–60 m 高的大樓會像往內倒。
- **小人**（`ginzaAvatar.ts`）：大頭、平塗五官（眼睛不打光，兩顆高光）、腮紅、∪ 嘴、呆毛彈簧；隨機眨眼、步伐壓扁伸展、跑步前傾與揚塵、頭轉向導覽／滑鼠指著的物品、找到物品時 ^ ^ 眼開心跳（`cheer()`）。
- **路人**（`ginzaPeople.ts`）：同樣的 Q 版比例（約 1.3 m，大頭、黑豆眼）。
- **物品**：點到或導覽念到時彈一下（`bounceItem`）。
- **光與天空**：天光偏藍、地面反光偏暖；天空加卡通雲（雜訊 + 窄 smoothstep，慢慢飄）；畫面四周微暗。
- **鏡頭**：視角 42°、距離 9.5 m、仰角 0.5 rad，比較像在看模型小鎮。
- 截圖：開發模式下 `window.__city3d` 是 CityWorld（可設 `dist`、`yaw`、`pitch`、呼叫 `cheer()`）。

## 聽讀導覽

右上「導覽」：小人自動沿人行道走過遊戲區（10 站，約 4 分鐘），每站依序轉向站內物品、跳單字卡並發音（算「看過」）。
可暫停、上一站、下一站（步行中 = 直接抵達）；方向鍵、點地面、切鳥瞰或 Esc 結束，拖曳可轉鏡頭。

- 站點：`src/data/city3d/ginza-tour.ts`（街道座標 + 物品順序）；路線與狀態機：`src/lib/city3d/guided-tour.ts`（移植自 Ginza `web/guided-tour.js`，2026-10-25 未 commit 版）。
- 路徑自動排：室外走 v 13.3 步行線，進出店面走門口，室內先到店面內側走道再橫移。導覽直接設定位置不跑碰撞，所以 `city3d-tour.test.ts` 逐 15 cm 檢查路徑不碰建築、物品、家具和店內牆。
- 每個 2D 物品剛好出現一次且在自己的區域（測試檢查）；加物品要同時加進某一站。
- 沒移植：時刻漸變（la-game 固定白天）、歷史解說與出處、斑馬線過街（遊戲區只走東側）。

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

2026-10-11 同步（Ginza 已改用 git，基準 `e23927f`）：

- **店面分節＋店內縱深**：牆面按約 5.5 m 分節（`src/lib/city3d/shop-types.ts`），每節是挖空玻璃的框架貼圖＋ interior mapping 的店內（`ginzaShopInteriors.ts`），12 種業態按鄰近 OSM 店家分類（`city.json` 的 `signs[].cat`）。陳列繪製 `shop-paint/*.js` 原樣移植，畫完後每個像素換成最接近的色票色，和卡通物件一致；不移植夜間點燈。
- `city.json` 換成 Ginza 新版：建築與道路不變，招牌多了 `cat`，另有 `clock`、`boards`、`streetSigns`（後兩者含文字，不顯示）。
- 未移植：夜景燈箱、路燈與信號柱（`infrastructure.js`）、自動前進（第三人稱不需要）、未核實遮陽棚的移除（la-game 保留卡通遮陽棚）。

刻意**沒有**移植或做了改動的部分：

- **OSM 店名招牌**（`city.json` 的 `signs`）：la-game 背景不放文字（場景要給多語言共用），不移植。
- **遊戲區**（`ginza-street.ts` 的 `playZone`）：不放店面、不鋪道路帶狀面、不跑車和行人。否則會和要找的「櫥窗」「遮陽棚」「汽車」「計程車」「公車」混淆，行人也會穿過物品。區外照常有。
- **日夜變化**：la-game 固定白天晴空，不移植 Ginza 的太陽位置與夜間發光。

## 室內（店內）

- 服飾店、咖啡店是松屋一樓挖出來的室內：`GINZA_STREET.rooms`（街道座標）→ `carveRooms`（`src/lib/city3d/rooms.ts`）把大樓切成「一樓其餘部分」＋「房間上方樓層（底部抬到天花板，不擋路）」，`ginzaRooms.ts` 畫地板、內牆、天花板、玻璃店面與吊燈。
- 店內物品（衣服、陳列、吧台用品、桌上的蛋糕）只放在房間裡；人行道只放街上本來就有的東西（郵筒、販賣機、ATM、立牌、傘架）。
- 只能從門口進出，玻璃店面擋路；在室內時鏡頭壓在天花板下、不穿出牆，鏡頭被逼近時小人變半透明。
- 鳥瞰看不到店內（被樓上擋住）。

## 已知限制

- 只有商業街一個場景；其他街區、室內場景還沒做。
- OSM 的中央通り是上下行兩條 22 m 寬的線，地面貼圖會把人行道塗成車道色，所以這段另鋪 `fx-sidewalk` 地磚。
- 物件擋路用腳邊 0.9 m 以下的佔地矩形（`src/lib/city3d/footprint.ts`）；記憶挑戰中隱形的物品不擋，免得撞到就知道位置。
- `GameScreen3D` 的關卡流程和 2D `GameScreen` 重複，之後應抽成共用 hook。

## 授權

建築與道路資料 © OpenStreetMap contributors，ODbL 1.0（見 `public/city3d/ginza/ATTRIBUTION.md`），畫面右上角有標示。
城市建構程式碼移植自作者自己的 Ginza 專案。

2026-10-10 同步 Ginza 的實景街道優化：
- `roads.json` 換成新版（多了道路名稱、寬度來源、過街線標記；幾何與舊版幾乎相同）。
- 中央通り上下行原本各 22 m 寬而互相重疊，改為每條寬度 = 對向中心線間距（約 6–9 m），人行道恢復約 6 m；遊戲區外側路緣因此和區內積木路緣（v = 11）對齊。
- 分開的單向段恢復車道虛線；外側加淺灰路緣；過街線不再畫成人行道，有 OSM 標線標記才畫斑馬線。
- 桂樹 + 植栽帶：官方 136 株、四區設計（ギンザのノハラ／銀座植物園／銀座エキゾチック／SASA deco）；逐株座標無公開資料，按每側約 16 m 近似放置，只放在遊戲區外，花壇按朝向擋路。顏色只用色票。
