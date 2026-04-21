#!/usr/bin/env bash
# Build macOS icon assets from build/logo.svg.
# Produces:
#   build/icon.png         (1024x1024)
#   build/icon.iconset/    (10 PNGs at standard sizes)
#   build/icon.icns        (Mac app icon bundle)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SVG="$ROOT/build/logo.svg"
PNG="$ROOT/build/icon.png"
ISET="$ROOT/build/icon.iconset"
ICNS="$ROOT/build/icon.icns"

[[ -f "$SVG" ]] || { echo "missing $SVG" >&2; exit 1; }

rsvg-convert -w 1024 -h 1024 "$SVG" -o "$PNG"

rm -rf "$ISET"
mkdir -p "$ISET"

declare -a SPECS=(
  "16  icon_16x16.png"
  "32  icon_16x16@2x.png"
  "32  icon_32x32.png"
  "64  icon_32x32@2x.png"
  "128 icon_128x128.png"
  "256 icon_128x128@2x.png"
  "256 icon_256x256.png"
  "512 icon_256x256@2x.png"
  "512 icon_512x512.png"
  "1024 icon_512x512@2x.png"
)

for spec in "${SPECS[@]}"; do
  size=${spec%% *}
  name=${spec##* }
  sips -z "$size" "$size" "$PNG" --out "$ISET/$name" >/dev/null
done

iconutil -c icns "$ISET" -o "$ICNS"
echo "→ $PNG"
echo "→ $ICNS"
