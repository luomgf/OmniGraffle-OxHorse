#!/usr/bin/env bash
# 打包 OmniGraffle 插件，供 GitHub Release 下载。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${ROOT}/dist"
ASSET="OxHorse.omnigrafflejs.zip"
BUNDLE="${ROOT}/split-text-to-rectangles.omnigrafflejs"

[ -d "$BUNDLE" ] || { echo "找不到插件目录：$BUNDLE" >&2; exit 1; }

rm -rf "$OUT"
mkdir -p "$OUT"

(
  cd "$ROOT"
  zip -r "$OUT/$ASSET" "$(basename "$BUNDLE")" \
    -x "*.DS_Store" \
    -x "*__MACOSX*" \
    -x "*.swp"
)

echo "已生成 $OUT/$ASSET"
ls -lh "$OUT/$ASSET"
