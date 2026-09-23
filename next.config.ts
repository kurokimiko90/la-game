import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 試玩用的 production build 放在獨立資料夾（npm run play → .next-play），
  // 自動擴展跑 test:e2e 重建 .next 時才不會把正在試玩的伺服器弄壞
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
