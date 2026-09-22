#!/bin/bash
# 安裝 / 移除自動擴展的 launchd 排程：每 30 分鐘跑一次 scripts/auto-expand.mjs（見 docs/expansion.md）
#
#   bash scripts/install-auto-expand.sh           安裝並立刻跑一次
#   bash scripts/install-auto-expand.sh --remove  停止並移除
#
# 用 node 當進入點：macOS TCC 不讓 launchd 背景的 bash 讀 ~/Documents，node 有授權（com.btrain.dev 也是這樣跑）。
set -euo pipefail

LABEL=com.la-game.auto-expand
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DOMAIN="gui/$(id -u)"

if [[ "${1:-}" == "--remove" ]]; then
  launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
  rm -f "$PLIST"
  echo "已移除 $LABEL"
  exit 0
fi

NODE="$(command -v node)"
mkdir -p "$ROOT/.auto-expand"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<!-- 記憶小鎮自動擴展：每 30 分鐘推進一步。由 scripts/install-auto-expand.sh 產生，移除用 --remove。 -->
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE</string>
    <string>$ROOT/scripts/auto-expand.mjs</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$ROOT</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>$PATH</string>
  </dict>
  <key>StartInterval</key>
  <integer>1800</integer>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$ROOT/.auto-expand/launchd.log</string>
  <key>StandardErrorPath</key>
  <string>$ROOT/.auto-expand/launchd.log</string>
</dict>
</plist>
EOF

launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
launchctl bootstrap "$DOMAIN" "$PLIST"
echo "已安裝 $LABEL（每 30 分鐘）。紀錄：$ROOT/.auto-expand/auto-expand.log"
