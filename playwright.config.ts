import { defineConfig } from '@playwright/test';

const PORT = 3210;

// 用本機 Google Chrome（channel: 'chrome'），不另外下載瀏覽器。
// 先 build 再跑：npm run test:e2e
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: 'chrome',
    viewport: { width: 1280, height: 800 },
    // 物件與背景的動態會讓點擊位置微幅移動；E2E 關掉動畫，點擊才穩定
    reducedMotion: 'reduce',
  },
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
