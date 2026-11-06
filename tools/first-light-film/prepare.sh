#!/usr/bin/env bash
# Gathers what the film is made of into lib/ and assets/ (both ignored by git):
# the page's own pictures and fonts, and GSAP from npm.
set -euo pipefail
cd "$(dirname "$0")"
PUB=../../platform/public
mkdir -p lib assets
for part in wing-l wing-r tail body glint-gold glint-violet; do cp "$PUB/first-light/guardian-$part-1240.webp" assets/; done
cp "$PUB/first-light/horizon-2560.webp" assets/
for door in mercadito services work yavayago community sanctuary animals; do cp "$PUB/first-light/door-$door-960.webp" assets/; done
cp "$PUB/fonts/fraunces.woff2" "$PUB/fonts/jakarta.woff2" assets/
if [ ! -f lib/gsap.min.js ]; then
  tmp=$(mktemp -d); (cd "$tmp" && npm pack gsap@3.14.2 --silent >/dev/null && tar -xzf gsap-3.14.2.tgz)
  cp "$tmp/package/dist/gsap.min.js" lib/; rm -rf "$tmp"
fi
echo "ready: $(ls assets | wc -l) assets, lib/gsap.min.js"
