# 記憶小鎮（la-game）

沉浸式語言找物遊戲：在一張 2D 小鎮地圖裡找東西，點物品聽英語 / 日語發音。物品位置固定，靠空間記憶記單字。

- 11 個街區（公園、街道、超市、學校、車站、餐廳、河濱、醫院、機場、圖書館、郵局）
- 多種關卡 + 自由探索，提示、星級、解鎖
- 無後端，進度存在瀏覽器 localStorage

## 技術

Next.js 16（App Router）· React 19 · TypeScript · Tailwind v4 · Vitest · Playwright

## 開始

```bash
npm install
npm run dev        # http://localhost:3000
```

其他指令：

```bash
npm test           # 單元測試
npm run test:e2e   # E2E（需要本機 Chrome）
npm run lint && npm run typecheck
npm run build && npm start
```

## 內容管線

單字與物品描述在 `content/svg-manifests/*.json`，擺放在 `content/layouts/`，由 `npm run content:scenes` 產出 `src/data/scenes/`（遊戲讀的資料）。改內容不要直接改 `src/data`。

SVG 素材與發音錄音的生成依賴作者本機的 miko-ws 工具鏈，不在此 repo；已生成的 SVG（`public/svg/`）與音檔（`public/audio/`）都已提交，直接可玩。

文件：

- [docs/planning.md](docs/planning.md) — 規劃
- [docs/scene-standard.md](docs/scene-standard.md) — 場景製作標準
- [docs/svg-assets.md](docs/svg-assets.md) — 素材產線
- [docs/expansion.md](docs/expansion.md) — 自動擴展

## License

程式碼以 [MIT](LICENSE) 授權。
