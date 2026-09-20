#!/usr/bin/env bash
#
# Kavacha bootstrap — fetches Firefox ESR at a pinned commit, lays the Kavacha
# overlay, patches and branding on it, and drives Firefox's own `mach`.
# ADR 0020 (documentation/decisions/0020-firefox-esr-direct-overlay.md).
#
# Usage:
#   ./build/bootstrap.sh setup            # fetch pin, mozconfig, overlay, patches, branding, mach bootstrap
#   ./build/bootstrap.sh build            # ./mach build (first build 1-4 h)
#   ./build/bootstrap.sh fast             # ./mach build faster — repackage JS/CSS/FTL/XHTML, no compile
#   ./build/bootstrap.sh start            # ./mach run -- -purgecaches
#   ./build/bootstrap.sh package          # ./mach package (+ NSIS installer on Windows)
#   ./build/bootstrap.sh brand            # regenerate branding only
#   ./build/bootstrap.sh update           # reset checkout to the pin (objdir kept), re-overlay, re-patch, re-brand
#   ./build/bootstrap.sh overlay-export   # copy overlay-path files edited in the checkout back to browser/overlay/
#   ./build/bootstrap.sh overlay-check    # non-zero if browser/overlay/ and the checkout differ
#   ./build/bootstrap.sh patch-export NNNN-name [paths...]   # git diff of tracked files -> browser/patches/
#   ./build/bootstrap.sh roundtrip        # reverse/forward the patch series in a scratch worktree, byte-identical
#   ./build/bootstrap.sh mach <args...>   # run ./mach in the checkout with the right environment
#
# Run mach-driving verbs as `env -u CLAUDECODE -u CLAUDE_CODE ./build/bootstrap.sh build`
# when an agent is driving: mach detects one and suppresses the real error text.
#
# Windows: run from C:\mozilla-build\start-shell.bat, or from any bash — this
# script re-executes itself under MozillaBuild's MSYS2 when $MOZILLABUILD is
# unset (that is what start-shell.bat provides; Git Bash alone cannot run mach).
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_DIR="$REPO_ROOT/browser/firefox-source"
OVERLAY_DIR="$REPO_ROOT/browser/overlay"
PATCHES_DIR="$REPO_ROOT/browser/patches"

# Firefox ESR pin. Bump deliberately for security point releases, then run
# `update` and re-validate the patch series (CI reads this line with sed —
# keep the exact `FIREFOX_COMMIT="<40 hex>"` shape).
FIREFOX_REPO="https://github.com/mozilla-firefox/firefox.git"
FIREFOX_BRANCH="esr153"
FIREFOX_COMMIT="14432190c3978acabcdf6a8562fbb4119a474341"

KV_CHANNEL="${KV_CHANNEL:-nightly}"

log()  { printf '\033[1;36m[kavacha]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[kavacha] WARN:\033[0m %s\n' "$*" >&2; }
fail() { printf '\033[1;31m[kavacha] ERROR:\033[0m %s\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# Platform
# ---------------------------------------------------------------------------
case "$(uname -s)" in
    Darwin)               KV_OS=macos ;;
    Linux)                KV_OS=linux ;;
    MINGW*|MSYS*|CYGWIN*) KV_OS=windows ;;
    *)                    KV_OS=unknown ;;
esac

# On Windows, mach needs MozillaBuild's Python and MSYS2. If we are not already
# inside that environment (start-shell.bat exports MOZILLABUILD), find the
# install and re-exec this script under its bash with the same arguments.
reexec_under_mozillabuild() {
    [ "$KV_OS" = "windows" ] || return 0
    [ -z "${MOZILLABUILD:-}" ] || return 0
    local mb
    for mb in "/c/mozilla-build" "${MOZILLABUILD_DIR:-}"; do
        [ -n "$mb" ] && [ -x "$mb/msys2/usr/bin/bash.exe" ] && break
        mb=""
    done
    [ -n "$mb" ] || fail "MozillaBuild not found at C:\\mozilla-build. Install it: https://ftp.mozilla.org/pub/mozilla/libraries/win32/MozillaBuildSetup-Latest.exe"
    # msys2's one-time first-run init can drop the environment once; allow one
    # retry, never a loop.
    if [ "${KV_REEXEC:-0}" -ge 2 ]; then
        fail "MOZILLABUILD is still unset after re-executing under $mb — run from C:\\mozilla-build\\start-shell.bat"
    fi
    log "Re-executing under MozillaBuild ($mb)..."
    local winmb winbash state sc="" argstr="" a
    winmb="$(cygpath -w "$mb")\\"
    winbash="$(cygpath -w "$mb/msys2/usr/bin/bash.exe")"
    state="$(cygpath -m "$HOME/.mozbuild")"
    # Resolve sccache here, where the caller's PATH is known, and hand it over
    # explicitly: PATH inheritance into MozillaBuild's MSYS2 is not guaranteed.
    if command -v sccache >/dev/null 2>&1; then sc="$(cygpath -m "$(command -v sccache)")"; fi
    for a in "$@"; do argstr="$argstr '$a'"; done
    # Hop through native cmd.exe: two different MSYS runtimes (Git Bash's and
    # MozillaBuild's) do not hand each other custom environment variables, but
    # both read a real Windows environment block. A batch file sidesteps the
    # quote re-escaping Git Bash applies to native command lines.
    # profile-mozilla.sh (run by --login) then prepends bin/, python3/ and
    # mingw64/bin to PATH.
    local bat
    bat="$(mktemp "${TMPDIR:-/tmp}/kavacha-reexec.XXXXXX").cmd"
    printf '%s\r\n' \
        '@echo off' \
        "set \"MOZILLABUILD=$winmb\"" \
        'set MSYSTEM=MSYS' \
        'set MSYS2_PATH_TYPE=inherit' \
        'set CHERE_INVOKING=1' \
        "set KV_REEXEC=$(( ${KV_REEXEC:-0} + 1 ))" \
        "set \"KV_SCCACHE=${KV_SCCACHE:-$sc}\"" \
        "set \"MOZBUILD_STATE_PATH=$state\"" \
        "\"$winbash\" --login -c \"cd '$(cygpath -u "$REPO_ROOT")' && ./build/bootstrap.sh$argstr\"" \
        'exit /b %ERRORLEVEL%' > "$bat"
    exec cmd.exe //c "$(cygpath -w "$bat")"
}

# ---------------------------------------------------------------------------
# Prerequisites
# ---------------------------------------------------------------------------
check_prereqs() {
    log "Checking prerequisites ($KV_OS)..."
    command -v git >/dev/null || fail "git is required"
    case "$KV_OS" in
        macos)
            xcode-select -p >/dev/null 2>&1 || fail "Xcode Command Line Tools missing: xcode-select --install"
            ;;
        windows)
            [ -n "${MOZILLABUILD:-}" ] || fail "Run inside the MozillaBuild shell (C:\\mozilla-build\\start-shell.bat)"
            [ "$(git config --global --get core.longpaths || true)" = "true" ] \
                || warn "git config --global core.longpaths true is recommended (Firefox's tree exceeds MAX_PATH)"
            ;;
        linux) ;;
        *) fail "Unsupported platform: $(uname -s)" ;;
    esac
    local free_gb
    free_gb="$(df -Pk "$REPO_ROOT" 2>/dev/null | awk 'NR==2{print int($4/1024/1024)}')"
    if [ -n "$free_gb" ] && [ "$free_gb" -lt 40 ]; then
        warn "Only ${free_gb} GB free; a Firefox build needs ~40 GB."
    fi
    if [ -n "${KV_SCCACHE:-}" ] || command -v sccache >/dev/null 2>&1; then
        log "sccache: ${KV_SCCACHE:-$(command -v sccache)}"
    else
        warn "sccache not found — builds will not be cached (optional)"
    fi
    log "Prerequisites OK. mach bootstrap fetches the compilers itself (--enable-bootstrap)."
}

# ---------------------------------------------------------------------------
# Firefox source at the pin
# ---------------------------------------------------------------------------
current_head() { git -C "$SRC_DIR" rev-parse HEAD 2>/dev/null || true; }

# The checkout's base is the pin; after copy_overlay the HEAD is one commit
# above it ("kavacha overlay"). base_ref() returns the pin either way.
base_ref() { echo "$FIREFOX_COMMIT"; }

fetch_firefox() {
    if [ -d "$SRC_DIR/.git" ]; then
        if git -C "$SRC_DIR" cat-file -e "$FIREFOX_COMMIT^{commit}" 2>/dev/null; then
            log "Firefox source present at browser/firefox-source (pin ${FIREFOX_COMMIT:0:12} available)."
            return 0
        fi
        log "Fetching pinned commit ${FIREFOX_COMMIT:0:12} into existing checkout..."
        git -C "$SRC_DIR" fetch --depth 1 origin "$FIREFOX_COMMIT"
        return 0
    fi
    log "Fetching Firefox ($FIREFOX_BRANCH @ ${FIREFOX_COMMIT:0:12}, depth 1)..."
    mkdir -p "$SRC_DIR"
    git -C "$SRC_DIR" init -q
    git -C "$SRC_DIR" remote add origin "$FIREFOX_REPO"
    git -C "$SRC_DIR" fetch --depth 1 origin "$FIREFOX_COMMIT"
    git -C "$SRC_DIR" checkout -q FETCH_HEAD
    git -C "$SRC_DIR" config user.email "build@kavacha.app"
    git -C "$SRC_DIR" config user.name "Kavacha build"
}

check_pin() {
    [ -d "$SRC_DIR/.git" ] || fail "browser/firefox-source missing. Run: ./build/bootstrap.sh setup"
    local base
    base="$(git -C "$SRC_DIR" rev-parse HEAD)"
    # HEAD is either the pin or the overlay commit whose parent is the pin.
    if [ "$base" != "$FIREFOX_COMMIT" ] && [ "$(git -C "$SRC_DIR" rev-parse HEAD^ 2>/dev/null || true)" != "$FIREFOX_COMMIT" ]; then
        fail "browser/firefox-source is not at the pinned ${FIREFOX_COMMIT:0:12}. Run: ./build/bootstrap.sh update"
    fi
}

# ---------------------------------------------------------------------------
# mozconfig
# ---------------------------------------------------------------------------
write_mozconfig() {
    local mc="$SRC_DIR/mozconfig"
    log "Writing mozconfig ($KV_OS, channel $KV_CHANNEL)..."
    {
        echo "# Generated by build/bootstrap.sh — do not edit; edit write_mozconfig() instead."
        echo "ac_add_options --enable-application=browser"
        echo "ac_add_options --enable-bootstrap"
        echo "ac_add_options --with-branding=browser/branding/kavacha"
        echo "ac_add_options --with-app-basename=Kavacha"      # MOZ_APP_NAME derives to 'kavacha'
        echo "ac_add_options --with-distribution-id=app.kavacha"
        echo "ac_add_options --enable-release"
        echo "ac_add_options --enable-optimize"
        echo "ac_add_options --disable-debug"
        echo "ac_add_options --disable-tests"
        echo "ac_add_options --disable-crashreporter"
        echo "ac_add_options --enable-update-channel=$KV_CHANNEL"
        echo "mk_add_options MOZ_OBJDIR=@TOPSRCDIR@/obj-@CONFIG_GUESS@"
        echo "export MOZ_TELEMETRY_REPORTING="
        echo "export MOZ_REQUIRE_SIGNING="
        case "$KV_OS" in
            windows)
                echo "ac_add_options --disable-default-browser-agent"   # WDBA phones home
                echo "ac_add_options --disable-maintenance-service"     # unsigned builds cannot use it
                ;;
            linux)
                echo "ac_add_options --enable-default-toolkit=cairo-gtk3-wayland"
                ;;
        esac
        # KV_NO_SCCACHE=1 builds without the compiler cache. sccache is an
        # optimization, and on Windows its server has been seen to die
        # mid-build ("error reading compile response from server", os error
        # 10054, while linking gkrust — 2026-09-20), which costs the whole
        # build. When it misbehaves, turn it off rather than retrying blind.
        local sc="${KV_SCCACHE:-}"
        if [ -n "${KV_NO_SCCACHE:-}" ]; then
            sc=""
        elif [ -z "$sc" ] && command -v sccache >/dev/null 2>&1; then
            sc="$(command -v sccache)"
            [ "$KV_OS" = "windows" ] && sc="$(cygpath -m "$sc")"
        fi
        if [ -n "$sc" ]; then
            echo "ac_add_options --with-ccache=$sc"
            echo "mk_add_options \"export RUSTC_WRAPPER=$sc\""
        fi
        if [ -n "${KV_MOZCONFIG_EXTRA:-}" ]; then
            printf '%s\n' "$KV_MOZCONFIG_EXTRA"                  # CI: -j caps, --disable-debug-symbols
        fi
    } > "$mc"
    grep -q "^mozconfig$" "$SRC_DIR/.git/info/exclude" 2>/dev/null || echo "mozconfig" >> "$SRC_DIR/.git/info/exclude"
}

# ---------------------------------------------------------------------------
# Overlay: Kavacha-authored files, copied onto the checkout and committed
# locally on top of the pin so `git diff HEAD` is exactly the patch series.
# ---------------------------------------------------------------------------
overlay_files() {
    # Relative paths of every file in the overlay (empty if none).
    [ -d "$OVERLAY_DIR" ] || return 0
    (cd "$OVERLAY_DIR" && find . -type f ! -name 'README.md' -o -type f -name 'README.md' ! -path './README.md' | sed 's#^\./##' | sort)
}

copy_overlay() {
    local files
    files="$(overlay_files)"
    if [ -z "$files" ]; then
        log "Overlay is empty — checkout stays at the pin."
        return 0
    fi
    log "Copying overlay ($(printf '%s\n' "$files" | wc -l | tr -d ' ') files) onto the checkout..."
    local f
    while IFS= read -r f; do
        mkdir -p "$SRC_DIR/$(dirname "$f")"
        cp "$OVERLAY_DIR/$f" "$SRC_DIR/$f"
    done <<< "$files"
    # Stage by top-level overlay directory (no xargs: MSYS2 under MozillaBuild
    # can fail to fork it). The checkout was just reset, so -A here only adds
    # the overlay files.
    local topdirs
    topdirs="$(cd "$OVERLAY_DIR" && find . -mindepth 1 -maxdepth 1 -type d | sed 's#^\./##')"
    while IFS= read -r dir; do
        [ -n "$dir" ] && git -C "$SRC_DIR" add -A -- "$dir"
    done <<< "$topdirs"
    if ! git -C "$SRC_DIR" diff --cached --quiet; then
        git -C "$SRC_DIR" commit -q -m "kavacha overlay"
        log "Overlay committed locally on top of the pin."
    else
        log "Overlay already committed and unchanged."
    fi
}

overlay_check() {
    check_pin
    local files rc=0 f
    files="$(overlay_files)"
    [ -n "$files" ] || { log "Overlay is empty."; return 0; }
    while IFS= read -r f; do
        if ! cmp -s "$OVERLAY_DIR/$f" "$SRC_DIR/$f"; then
            echo "differs: $f"; rc=1
        fi
    done <<< "$files"
    if [ $rc -eq 0 ]; then
        log "Overlay and checkout agree."
    else
        fail "Overlay and checkout differ — run overlay-export (checkout is newer) or setup/update (overlay is newer)."
    fi
}

overlay_export() {
    check_pin
    local files f n=0
    files="$(overlay_files)"
    [ -n "$files" ] || fail "Overlay is empty — nothing to export against. Add files under browser/overlay/ first."
    while IFS= read -r f; do
        if [ -f "$SRC_DIR/$f" ] && ! cmp -s "$OVERLAY_DIR/$f" "$SRC_DIR/$f"; then
            cp "$SRC_DIR/$f" "$OVERLAY_DIR/$f"; n=$((n+1)); echo "exported: $f"
        fi
    done <<< "$files"
    # New files created under an overlay directory in the checkout.
    local dir
    for dir in $(cd "$OVERLAY_DIR" && find . -type d | sed 's#^\./##' | grep -v '^\.$'); do
        for f in $(cd "$SRC_DIR" && git ls-files --others --exclude-standard -- "$dir" 2>/dev/null); do
            mkdir -p "$OVERLAY_DIR/$(dirname "$f")"; cp "$SRC_DIR/$f" "$OVERLAY_DIR/$f"; n=$((n+1)); echo "exported (new): $f"
        done
    done
    log "$n file(s) exported to browser/overlay/."
}

# ---------------------------------------------------------------------------
# Patches: only hunks to files Firefox tracks, applied as uncommitted changes.
# ---------------------------------------------------------------------------
apply_patches() {
    shopt -s nullglob
    local patches=("$PATCHES_DIR"/*.patch)
    shopt -u nullglob
    if [ ${#patches[@]} -eq 0 ]; then
        log "No patches in browser/patches/."
        return 0
    fi
    log "Applying ${#patches[@]} patch(es)..."
    local p
    for p in "${patches[@]}"; do
        if git -C "$SRC_DIR" apply --check "$p" 2>/dev/null; then
            git -C "$SRC_DIR" apply "$p"
            log "  applied $(basename "$p")"
        elif git -C "$SRC_DIR" apply --check --reverse "$p" 2>/dev/null; then
            log "  already applied $(basename "$p")"
        else
            fail "Patch does not apply: $(basename "$p")"
        fi
    done
}

patch_export() {
    check_pin
    local name="${1:-}"; shift || true
    [[ "$name" =~ ^[0-9]{4}-[a-z0-9-]+$ ]] || fail "Usage: patch-export NNNN-short-name [paths...]"
    local out="$PATCHES_DIR/$name.patch"
    [ -f "$out" ] && warn "Overwriting existing $out"
    {
        echo "# What: <one line>"
        echo "# Why a patch: <why an overlay file or pref could not do it>"
        echo "# Touches: $(git -C "$SRC_DIR" diff --name-only HEAD -- "$@" | tr '\n' ' ')"
        git -C "$SRC_DIR" diff HEAD -- "$@"
    } > "$out"
    log "Wrote $out — fill in the header, then run: ./build/bootstrap.sh roundtrip"
}

roundtrip() {
    check_pin
    shopt -s nullglob
    local patches=("$PATCHES_DIR"/*.patch)
    shopt -u nullglob
    [ ${#patches[@]} -gt 0 ] || { log "No patches — nothing to round-trip."; return 0; }
    # A sparse worktree holding only the directories the series touches: a full
    # Firefox checkout is ~400k files and minutes on Windows; this is seconds.
    local wt dirs
    wt="$(mktemp -d "${TMPDIR:-/tmp}/kavacha-rt.XXXXXX")"
    dirs="$(grep -h '^+++ b/' "${patches[@]}" | sed 's#^+++ b/##; s#/[^/]*$##' | sort -u)"
    git -C "$SRC_DIR" worktree add -q --no-checkout --detach "$wt" HEAD
    # Expand now: the trap runs after this function's locals are gone.
    # shellcheck disable=SC2064
    trap "git -C '$SRC_DIR' worktree remove --force '$wt' >/dev/null 2>&1 || true" EXIT
    git -C "$wt" sparse-checkout init --cone
    # shellcheck disable=SC2086
    git -C "$wt" sparse-checkout set $dirs
    git -C "$wt" checkout -q --detach HEAD
    local p i
    for p in "${patches[@]}"; do git -C "$wt" apply --check "$p" && git -C "$wt" apply "$p"; done
    local first; first="$(git -C "$wt" diff HEAD | sha256sum | cut -d' ' -f1)"
    for (( i=${#patches[@]}-1; i>=0; i-- )); do git -C "$wt" apply -R "${patches[$i]}"; done
    git -C "$wt" diff --quiet HEAD || fail "Reverse pass left a diff."
    # Only files the patch application CREATED count (Firefox's own tree ships
    # files named *.orig), hence untracked status rather than a tree-wide find.
    [ -z "$(git -C "$wt" status --porcelain --untracked-files=all | grep -E '\.(rej|orig)$' | head -1)" ] || fail "Reverse pass left .rej/.orig files."
    for p in "${patches[@]}"; do git -C "$wt" apply "$p"; done
    local second; second="$(git -C "$wt" diff HEAD | sha256sum | cut -d' ' -f1)"
    [ "$first" = "$second" ] || fail "Forward passes differ ($first vs $second)."
    log "Round-trip OK: ${#patches[@]} patch(es), byte-identical (sha256 $first)."
}

# ---------------------------------------------------------------------------
# Branding + mach
# ---------------------------------------------------------------------------
apply_branding() {
    log "Generating Kavacha branding..."
    SRC_DIR="$SRC_DIR" "$REPO_ROOT/build/generate-branding.sh"
}

mach() {
    check_pin
    (cd "$SRC_DIR" && ./mach "$@")
}

objdir() {
    local d
    d="$(find "$SRC_DIR" -maxdepth 1 -type d -name 'obj-*' 2>/dev/null | head -1)"
    [ -n "$d" ] || fail "No objdir yet — run: ./build/bootstrap.sh build"
    echo "$d"
}

# ---------------------------------------------------------------------------
# Verbs
# ---------------------------------------------------------------------------
cmd_setup() {
    check_prereqs
    fetch_firefox
    write_mozconfig
    copy_overlay
    apply_patches
    apply_branding
    log "Running mach bootstrap (fetches toolchains; several GB on first run)..."
    mach --no-interactive bootstrap --application-choice browser
    log "Setup complete. Next: env -u CLAUDECODE -u CLAUDE_CODE ./build/bootstrap.sh build"
}

cmd_update() {
    [ -d "$SRC_DIR/.git" ] || fail "browser/firefox-source missing. Run: ./build/bootstrap.sh setup"
    log "Resetting checkout to the pin (objdir kept)..."
    git -C "$SRC_DIR" reset -q --hard
    git -C "$SRC_DIR" clean -fdq -e obj-* -e mozconfig
    git -C "$SRC_DIR" cat-file -e "$FIREFOX_COMMIT^{commit}" 2>/dev/null || git -C "$SRC_DIR" fetch --depth 1 origin "$FIREFOX_COMMIT"
    git -C "$SRC_DIR" checkout -q --detach "$FIREFOX_COMMIT"
    write_mozconfig
    copy_overlay
    apply_patches
    apply_branding
    log "Update complete."
}

cmd_start() {
    check_pin
    if [ "$KV_OS" = "windows" ]; then
        tasklist 2>/dev/null | grep -qi "^kavacha.exe" && fail "Kavacha is already running — close it first."
    else
        pgrep -f "obj-.*/dist/.*/kavacha" >/dev/null 2>&1 && fail "Kavacha is already running — quit it first."
    fi
    mach run -- -purgecaches "$@"
}

cmd_package() {
    # On Windows `mach package` also runs the NSIS installer rule (make-package
    # in toolkit/mozapps/installer/packager.mk) and writes
    # dist/<app>-<version>.<locale>.win64.installer.exe next to the zip.
    mach package
    log "Packages in $(objdir)/dist/"
    find "$(objdir)/dist" -maxdepth 1 -type f \( -name '*.dmg' -o -name '*.tar.*' -o -name '*.zip' -o -name '*.installer.exe' \) -exec ls -la {} \;
}

case "${1:-setup}" in
    setup)          reexec_under_mozillabuild "$@"; cmd_setup ;;
    build)          reexec_under_mozillabuild "$@"; check_pin; mach build ;;
    fast)           reexec_under_mozillabuild "$@"; check_pin; mach build faster ;;
    start)          reexec_under_mozillabuild "$@"; shift; cmd_start "$@" ;;
    package)        reexec_under_mozillabuild "$@"; cmd_package ;;
    brand)          apply_branding ;;
    update)         reexec_under_mozillabuild "$@"; cmd_update ;;
    overlay-export) overlay_export ;;
    overlay-check)  overlay_check ;;
    patch-export)   shift; patch_export "$@" ;;
    roundtrip)      roundtrip ;;
    mach)           reexec_under_mozillabuild "$@"; shift; mach "$@" ;;
    *)
        sed -n '2,24p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
        exit 1
        ;;
esac
