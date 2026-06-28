#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

# 啟動本機伺服器
if command -v python3 &>/dev/null; then
  python3 -m http.server 17300 --bind 127.0.0.1 &
elif command -v python &>/dev/null; then
  python -m http.server 17300 --bind 127.0.0.1 &
else
  # 沒有 Python，直接開檔案
  if command -v open &>/dev/null; then open "$DIR/index.html"
  else xdg-open "$DIR/index.html"; fi
  exit 0
fi

sleep 1

# 開瀏覽器
if command -v open &>/dev/null; then
  open "http://127.0.0.1:17300"
elif command -v xdg-open &>/dev/null; then
  xdg-open "http://127.0.0.1:17300"
fi

wait
