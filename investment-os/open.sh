#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"
if command -v open &>/dev/null; then
  open "$DIR/index.html"
elif command -v xdg-open &>/dev/null; then
  xdg-open "$DIR/index.html"
else
  echo "請手動用瀏覽器開啟: $DIR/index.html"
fi
