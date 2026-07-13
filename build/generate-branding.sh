#!/usr/bin/env bash
#
# Generates engine/browser/branding/kavacha inside the upstream tree from the
# surfer-generated release branding, replacing brand strings and URLs with
# Kavacha's (source of truth: browser/branding/kavacha/branding.json).
#
# Logos are rendered from browser/branding/kavacha/assets/logo.png (2000x2000
# with alpha). Windows-installer imagery (.ico, .bmp, VisualElementsManifest)
# remains a Zen placeholder until dedicated assets exist — macOS/Linux builds
# don't use it.
#
# Runs as part of `bootstrap.sh setup|update`; safe to re-run any time.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$REPO_ROOT/browser/zen-upstream/engine/browser/branding/release"
DST="$REPO_ROOT/browser/zen-upstream/engine/browser/branding/kavacha"

log() { printf '\033[1;36m[kavacha]\033[0m %s\n' "$*"; }

[ -d "$SRC" ] || { echo "ERROR: $SRC missing — run bootstrap setup first (surfer import generates it)." >&2; exit 1; }

log "Generating Kavacha branding at engine/browser/branding/kavacha..."
rm -rf "$DST"
cp -R "$SRC" "$DST"

cat > "$DST/configure.sh" <<'EOF'
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

MOZ_APP_DISPLAYNAME="Kavacha"
MOZ_MACBUNDLE_ID="kavacha"
EOF

cat > "$DST/locales/en-US/brand.ftl" <<'EOF'
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

-brand-shorter-name = Kavacha
-brand-short-name = Kavacha
-brand-full-name = Kavacha
# This brand name can be used in messages where the product name needs to
# remain unchanged across different versions (Nightly, Beta, etc.).
-brand-product-name = Kavacha
-vendor-short-name = Kavacha
trademarkInfo = { " " }
EOF

cat > "$DST/locales/en-US/brand.dtd" <<'EOF'
<!-- This Source Code Form is subject to the terms of the Mozilla Public
   - License, v. 2.0. If a copy of the MPL was not distributed with this
   - file, You can obtain one at http://mozilla.org/MPL/2.0/. -->

<!ENTITY  brandShorterName      "Kavacha">
<!ENTITY  brandShortName        "Kavacha">
<!ENTITY  brandFullName         "Kavacha">
EOF

cat > "$DST/locales/en-US/brand.properties" <<'EOF'
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

brandShorterName=Kavacha
brandShortName=Kavacha
brandFullName=Kavacha
vendorShortName=Kavacha
EOF

# Kavacha URLs (branding.json → urls). Update checks stay pointed at a
# non-resolving host until Kavacha runs its own update infrastructure.
cat > "$DST/pref/firefox-branding.js" <<'EOF'
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

pref("startup.homepage_override_url", "https://kavacha.app/whatsnew?v=%VERSION%");
pref("startup.homepage_welcome_url", "https://kavacha.app/welcome/");
pref("startup.homepage_welcome_url.additional", "https://kavacha.app/privacy/");

pref("app.update.promptWaitTime", 691200);
pref("app.update.url.manual", "https://kavacha.app/download/");
pref("app.update.url.details", "https://kavacha.app/releases/");
pref("app.releaseNotesURL", "https://kavacha.app/whatsnew/");
pref("app.releaseNotesURL.aboutDialog", "https://kavacha.app/releases/%VERSION%/");
pref("app.releaseNotesURL.prompt", "https://kavacha.app/releases/");
EOF

# Ship the Kavacha privacy defaults inside the app. firefox-branding.js is the
# one branding file packaged as browser default prefs (JS_PREFERENCE_FILES in
# branding-common.mozbuild), so the hardened pref set rides along with it.
# Source of truth: privacy/tracker-controls/kavacha.js — edit there, never here.
{
    echo ""
    echo "// ============================================================================"
    echo "// Kavacha privacy defaults — generated from privacy/tracker-controls/kavacha.js"
    echo "// ============================================================================"
    cat "$REPO_ROOT/privacy/tracker-controls/kavacha.js"
    echo ""
    echo "// ============================================================================"
    echo "// Kavacha UX defaults — generated from ui/defaults/kavacha-ux.js"
    echo "// ============================================================================"
    cat "$REPO_ROOT/ui/defaults/kavacha-ux.js"
} >> "$DST/pref/firefox-branding.js"
log "Privacy + UX defaults appended to branding prefs ($(cat "$REPO_ROOT/privacy/tracker-controls/kavacha.js" "$REPO_ROOT/ui/defaults/kavacha-ux.js" | grep -c '^pref(') prefs)."

# ---------------------------------------------------------------------------
# Update host. Patch 0002 sets updateHostname in surfer.json, but the
# mozconfig export it produces never reaches CONFIG (MOZ_APPUPDATE_HOST is
# not declared in moz.configure), so Zen's hardcoded fallback in
# build/moz.build wins. Rewrite it here — this script reruns after every
# import/update, so the fix survives engine re-imports.
# ---------------------------------------------------------------------------
MOZBUILD="$REPO_ROOT/browser/zen-upstream/engine/build/moz.build"
if grep -q "updates.zen-browser.app" "$MOZBUILD"; then
    # -i.bak form works on both BSD (macOS) and GNU (Linux) sed
    sed -i.kavacha-bak 's|updates\.zen-browser\.app|updates.kavacha.app|' "$MOZBUILD"
    rm -f "$MOZBUILD.kavacha-bak"
fi
grep -q 'MOZ_APPUPDATE_HOST"\] = "updates.kavacha.app"' "$MOZBUILD" \
    || { echo "ERROR: update-host rewrite failed in build/moz.build" >&2; exit 1; }
log "Update host set to updates.kavacha.app in build/moz.build."

# ---------------------------------------------------------------------------
# Icons from the Kavacha logo
# ---------------------------------------------------------------------------
LOGO="$REPO_ROOT/browser/branding/kavacha/assets/logo.png"
[ -f "$LOGO" ] || { echo "ERROR: $LOGO missing." >&2; exit 1; }

# Portable square resize: sips on macOS, ImageMagick or Pillow elsewhere
# (CI installs Pillow; Linux runners also ship ImageMagick).
render_png() {
    local size="$1" src="$2" dst="$3"
    if command -v sips >/dev/null; then
        sips -z "$size" "$size" "$src" --out "$dst" >/dev/null
    elif command -v magick >/dev/null; then
        magick "$src" -resize "${size}x${size}" "$dst"
    elif command -v convert >/dev/null; then
        convert "$src" -resize "${size}x${size}" "$dst"
    elif python3 -c 'import PIL' 2>/dev/null; then
        python3 -c "
import sys
from PIL import Image
src, dst, size = sys.argv[1], sys.argv[2], int(sys.argv[3])
Image.open(src).resize((size, size), Image.LANCZOS).save(dst)
" "$src" "$dst" "$size"
    else
        echo "ERROR: no image resizer found (need sips, ImageMagick, or Python Pillow)." >&2
        exit 1
    fi
}

log "Rendering logo sizes from assets/logo.png..."
for size in 16 22 24 32 48 64 128 256 512 1024; do
    render_png "$size" "$LOGO" "$DST/logo${size}.png"
done
for size in 16 22 24 32 48 64 128 256 512; do
    cp "$DST/logo${size}.png" "$DST/default${size}.png"
done
cp "$LOGO" "$DST/logo.png"
cp "$LOGO" "$DST/logo-mac.png"
render_png 192 "$LOGO" "$DST/content/about-logo.png"
render_png 384 "$LOGO" "$DST/content/about-logo@2x.png"
render_png 150 "$LOGO" "$DST/VisualElements_150.png"
render_png 70  "$LOGO" "$DST/VisualElements_70.png"

if [ "$(uname)" = "Darwin" ]; then
    log "Building firefox.icns via iconutil..."
    ICONSET="$(mktemp -d)/kavacha.iconset"
    mkdir -p "$ICONSET"
    for size in 16 32 128 256 512; do
        render_png "$size" "$LOGO" "$ICONSET/icon_${size}x${size}.png"
        double=$((size * 2))
        render_png "$double" "$LOGO" "$ICONSET/icon_${size}x${size}@2x.png"
    done
    iconutil -c icns "$ICONSET" -o "$DST/firefox.icns"
    rm -rf "$(dirname "$ICONSET")"
fi

log "Branding generated. NOTE: Windows .ico/.bmp remain Zen placeholders until dedicated assets land."
