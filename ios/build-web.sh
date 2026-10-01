#!/bin/sh
# Copies the website into the app bundle (web/), pointing it at the bundled three.js and Latin fonts so it runs offline.
# CJK text falls back to the system's PingFang and Songti. Runs as a build phase; SRCROOT is ios/.
set -eu
REPO="$SRCROOT/.."
OUT="$TARGET_BUILD_DIR/$UNLOCALIZED_RESOURCES_FOLDER_PATH/web"
rm -rf "$OUT"
mkdir -p "$OUT/sfx" "$OUT/vendor/fonts"
cp "$REPO"/sfx/*.mp3 "$OUT/sfx/"
cp "$SRCROOT/vendor/three.min.js" "$OUT/vendor/"
cp "$SRCROOT"/vendor/fonts/* "$OUT/vendor/fonts/"
sed -e 's#https://cdnjs.cloudflare.com/ajax/libs/three.js/0.160.0/three.min.js#vendor/three.min.js#' \
    -e 's#<link rel="stylesheet" href="https://fonts.googleapis.com/css2[^"]*">#<link rel="stylesheet" href="vendor/fonts/fonts.css">#' \
    -e '/rel="preconnect"/d' \
    "$REPO/index.html" > "$OUT/index.html"
grep -q 'vendor/three.min.js' "$OUT/index.html" || { echo "error: three.js reference not rewritten"; exit 1; }
