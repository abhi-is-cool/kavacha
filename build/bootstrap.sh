#!/usr/bin/env bash
#
# Kavacha bootstrap — fetches upstream Zen Browser, applies the Kavacha overlay,
# and wraps the upstream build commands.
#
# Usage:
#   ./build/bootstrap.sh          # setup: check prereqs, clone upstream, npm i, init source
#   ./build/bootstrap.sh build    # full browser build (first run: 1-3 hours)
#   ./build/bootstrap.sh fast     # import + repackage front end only, no C++/Rust
#                                 # compile. Use for CSS/FTL/XHTML/prefs/about: pages.
#   ./build/bootstrap.sh ui       # raw build:ui, NO import -- prefer `fast`
#   ./build/bootstrap.sh start    # launch the built browser
#   ./build/bootstrap.sh package  # produce installers (DMG/tar/exe) in browser/zen-upstream/dist/
#   ./build/bootstrap.sh update   # pull latest upstream and re-apply Kavacha patches
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UPSTREAM_DIR="$REPO_ROOT/browser/zen-upstream"
UPSTREAM_REPO="https://github.com/zen-browser/desktop.git"
# Zen commit the Kavacha patch series is authored against. Cloning an unpinned
# tip means upstream drift silently breaks patches on any machine that clones
# later than the first one (observed: 0009 failed on a fresh Windows clone while
# the same patch applied on a months-old macOS checkout). Bump deliberately, and
# re-validate the patch series when you do.
UPSTREAM_COMMIT="425f0ae1c392d44cfab9e43312fb6e854285c4e5"
PATCHES_DIR="$REPO_ROOT/browser/patches"

log()  { printf '\033[1;36m[kavacha]\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m[kavacha] ERROR:\033[0m %s\n' "$*" >&2; exit 1; }

check_prereqs() {
    log "Checking prerequisites..."
    local missing=()
    command -v git     >/dev/null || missing+=("git")
    command -v python3 >/dev/null || missing+=("python3")
    command -v node    >/dev/null || missing+=("node (21+)")
    command -v npm     >/dev/null || missing+=("npm")
    command -v cargo   >/dev/null || missing+=("rust/cargo (https://rustup.rs)")
    command -v sccache >/dev/null || missing+=("sccache (cargo install sccache)")

    if [ ${#missing[@]} -gt 0 ]; then
        fail "Missing prerequisites: ${missing[*]}"
    fi

    local node_major
    node_major="$(node -p 'process.versions.node.split(".")[0]')"
    [ "$node_major" -ge 21 ] || fail "Node.js 21+ required (found $(node -v))"

    if [ "$(uname)" = "Darwin" ]; then
        xcode-select -p >/dev/null 2>&1 || fail "Xcode Command Line Tools required: xcode-select --install"
    fi

    local free_gb
    free_gb="$(df -g "$REPO_ROOT" 2>/dev/null | awk 'NR==2 {print $4}' || echo 999)"
    [ "${free_gb:-999}" -ge 30 ] || log "WARNING: <30GB free disk; the Firefox build may fail."

    log "Prerequisites OK."
}

fetch_upstream() {
    if [ -d "$UPSTREAM_DIR/.git" ]; then
        log "Upstream already cloned at browser/zen-upstream."
        # The pin is only enforced at first clone and by `update`; an existing
        # clone left on another commit (an old pin, or the tip a pre-fix
        # `update` reset to) would silently build off-pin while CI validates
        # at the pin. Hard-stop instead of auto-resetting: the tree carries
        # uncommitted applied patches we must not clobber here.
        local head
        head="$(git -C "$UPSTREAM_DIR" rev-parse HEAD)"
        if [ "$head" != "$UPSTREAM_COMMIT" ]; then
            fail "browser/zen-upstream is at ${head:0:12}, not the pinned ${UPSTREAM_COMMIT:0:12}. Run: ./build/bootstrap.sh update"
        fi
    else
        log "Cloning Zen Browser..."
        git clone "$UPSTREAM_REPO" "$UPSTREAM_DIR"
        log "Pinning upstream to $UPSTREAM_COMMIT..."
        git -C "$UPSTREAM_DIR" checkout -q "$UPSTREAM_COMMIT"
    fi
}

apply_patches() {
    shopt -s nullglob
    local patches=("$PATCHES_DIR"/*.patch)
    shopt -u nullglob
    if [ ${#patches[@]} -eq 0 ]; then
        log "No Kavacha patches to apply yet."
        return
    fi
    log "Applying ${#patches[@]} Kavacha patch(es)..."
    for p in "${patches[@]}"; do
        log "  -> $(basename "$p")"
        git -C "$UPSTREAM_DIR" apply --check "$p" || fail "Patch does not apply cleanly: $p"
        git -C "$UPSTREAM_DIR" apply "$p"
    done
}

apply_branding() {
    "$REPO_ROOT/build/generate-branding.sh"
    log "Selecting the kavacha brand..."
    (cd "$UPSTREAM_DIR" && npm run surfer -- set brand kavacha)
}

setup() {
    check_prereqs
    fetch_upstream
    apply_patches
    log "Installing upstream dependencies..."
    (cd "$UPSTREAM_DIR" && npm i)
    log "Bootstrapping Firefox source (this downloads several GB)..."
    (cd "$UPSTREAM_DIR" && npm run init)
    log "Updating en-US language packs..."
    (cd "$UPSTREAM_DIR" && python3 ./scripts/update_en_US_packs.py)
    apply_branding
    log "Setup complete. Next: ./build/bootstrap.sh build"
}

# D0c: apply_branding rewrites engine/build/moz.build IN PLACE, and Zen's own
# src/build/moz-build.patch changes the same line. Once branding has run, every
# later `surfer import` fails with "patch does not apply". The engine tree is a
# git checkout whose HEAD is pristine Firefox, so restoring just that one file
# lets the Zen patch apply again; apply_branding re-applies the Kavacha host
# immediately afterwards, so nothing is lost.
restore_mozbuild() {
    local mozbuild="$UPSTREAM_DIR/engine/build/moz.build"
    [ -f "$mozbuild" ] || return 0
    if ! git -C "$UPSTREAM_DIR/engine" diff --quiet -- build/moz.build 2>/dev/null; then
        log "Restoring engine/build/moz.build to pristine before import (D0c)..."
        git -C "$UPSTREAM_DIR/engine" checkout -- build/moz.build
    fi
}

# D0d: `surfer build` calls patchCheck(), applyConfig() and genericBuild() but
# never applyPatches(), so files under src/**/*.patch reach engine/ ONLY via
# `surfer import`. Skipping the import produces a silently WRONG binary —
# patches 0031, 0032 and 0038 never shipped in any build for two weeks because
# of this. surfer's own patchCheck() cannot catch it: it compares only the COUNT
# of .patch files, so edits *within* an existing patch are invisible to it.
# Importing before every build makes that class of failure impossible.
# D0e: `surfer import` copies src/** into the engine and applies the .patch
# series, but it never touches the top-level locales/ tree — measured 2026-08-01
# by running a full import and comparing hashes: engine's zen-preferences.ftl
# came back byte-identical (40c1eb65e4a0 -> 40c1eb65e4a0) while the repo copy
# carried four new keys. Every patch that adds an FTL string therefore applies
# cleanly, builds, packages, and ships a control with NO LABEL, because its
# data-l10n-id resolves against a stale engine copy. Layout is l10n-central
# (locales/<locale>/<component>/<path>), so repo locales/en-US/browser/** maps
# onto engine/browser/locales/en-US/**.
sync_locales() {
    local src="$UPSTREAM_DIR/locales/en-US/browser"
    local dst="$UPSTREAM_DIR/engine/browser/locales/en-US"
    [ -d "$src" ] && [ -d "$dst" ] || return 0
    log "Syncing en-US locales into the engine (D0e: import skips locales/)..."
    (cd "$src" && find . -type f -name '*.ftl' -print0) |
        while IFS= read -r -d '' rel; do
            if ! cmp -s "$src/$rel" "$dst/$rel"; then
                log "  updating ${rel#./}"
                mkdir -p "$(dirname "$dst/$rel")"
                cp "$src/$rel" "$dst/$rel"
            fi
        done
}

build_all() {
    restore_mozbuild
    log "Importing source into the engine (D0d: surfer build never does this)..."
    (cd "$UPSTREAM_DIR" && npm run import)
    sync_locales
    # Branding MUST come after import: import overwrites the generated branding
    # dir and reverts the moz.build update host.
    apply_branding
    (cd "$UPSTREAM_DIR" && npm run build)
}

# Repackage the front end without recompiling C++/Rust.
#
# A full `build` is ~27 minutes and is only necessary when compiled code
# changes. CSS, FTL, XHTML, prefs and about: pages only need re-importing and
# repackaging, which takes minutes. Three consecutive full rebuilds were spent
# on one FTL string and two CSS values before this existed.
#
# This is NOT the same as the bare `ui` case below. `ui` runs `build:ui` alone,
# with no import -- which is exactly D0d, the defect where a change under src/
# never reaches the binary while every check still passes. Anything delivered
# as src/**/*.patch (0021/0031/0032/0038 among others) reaches engine/ only via
# import, so skipping it produces a build that silently lacks the change you
# are trying to test. The import and locale sync below are load-bearing.
#
# Still use the full `build` when C++/Rust or anything needing compilation
# changed. When in doubt, `build`: a wrong `fast` costs a confusing debugging
# session, a needless `build` costs 27 minutes.
build_fast() {
    restore_mozbuild
    log "Importing source into the engine (skipping import here would be D0d)..."
    (cd "$UPSTREAM_DIR" && npm run import)
    sync_locales
    apply_branding
    log "Repackaging front end only (no C++/Rust compile)..."
    (cd "$UPSTREAM_DIR" && npm run build:ui)
}

case "${1:-setup}" in
    setup)  setup ;;
    build)  build_all ;;
    build-only)
        # Escape hatch: compile whatever is already in engine/, no import. Use
        # only when you know nothing under src/ changed.
        (cd "$UPSTREAM_DIR" && npm run build)
        ;;
    fast)   build_fast ;;
    ui)
        # Raw build:ui with NO import. Reintroduces D0d for anything delivered
        # under src/ -- prefer `fast`, which imports first. Kept only for the
        # case where you have already imported by hand this cycle.
        (cd "$UPSTREAM_DIR" && npm run build:ui)
        ;;
    start)
        # A running instance silently absorbs new launches (Firefox remoting
        # opens a window in the OLD process — stale code after rebuilds).
        if pgrep -f "zen-upstream/engine/obj-.*/dist/.*/MacOS/zen" > /dev/null 2>&1; then
            fail "Kavacha is already running — quit it fully (Cmd+Q) first, or new launches reuse the old process and ignore the rebuilt code."
        fi
        # -purgecaches: the profile's startup cache stores compiled chrome
        # scripts keyed on the build ID, which incremental UI builds do NOT
        # bump — without it, a relaunch after `bootstrap.sh ui` can run
        # yesterday's cached JS against today's files (cost a debugging
        # session on 2026-07-14).
        (cd "$UPSTREAM_DIR" && npm start -- -purgecaches)
        ;;
    package) (cd "$UPSTREAM_DIR" && npm run package) ;;
    brand)  apply_branding ;;
    update)
        # Discard applied-patch modifications (they all live in browser/patches/)
        # and any generated overlay files patches will recreate.
        git -C "$UPSTREAM_DIR" checkout -- .
        git -C "$UPSTREAM_DIR" clean -fd src/ 2>/dev/null || true
        OLD_FF="$(python3 -c "import json; print(json.load(open('$UPSTREAM_DIR/surfer.json'))['version']['version'])")"
        # Update means "re-sync the working tree to the PIN", not "chase Zen's
        # tip": patches are authored against UPSTREAM_COMMIT and CI validates
        # against it, so resetting to the moving dev tip (what this used to
        # do) desyncs every local build from CI until patches happen to rot.
        # To actually take a newer Zen: bump UPSTREAM_COMMIT deliberately,
        # re-validate the patch series, then run update.
        git -C "$UPSTREAM_DIR" fetch origin "$UPSTREAM_COMMIT"
        git -C "$UPSTREAM_DIR" reset --hard "$UPSTREAM_COMMIT"
        NEW_FF="$(python3 -c "import json; print(json.load(open('$UPSTREAM_DIR/surfer.json'))['version']['version'])")"
        apply_patches
        log "Refreshing upstream dependencies..."
        (cd "$UPSTREAM_DIR" && npm i)
        if [ "$OLD_FF" != "$NEW_FF" ]; then
            log "Firefox version changed ($OLD_FF -> $NEW_FF); downloading new engine..."
            (cd "$UPSTREAM_DIR" && npm run download)
        fi
        # Surfer applies Zen's engine patches as uncommitted modifications on
        # the pristine "Firefox <version>" base commit — a re-import needs the
        # engine back at that base first. clean WITHOUT -x keeps the obj dir
        # (git-ignored), so the next build stays incremental.
        log "Resetting engine to pristine Firefox state (obj dir preserved)..."
        git -C "$UPSTREAM_DIR/engine" reset -q
        git -C "$UPSTREAM_DIR/engine" checkout -q -- .
        git -C "$UPSTREAM_DIR/engine" clean -fdq
        log "Re-importing source into the engine..."
        (cd "$UPSTREAM_DIR" && npm run import)
        log "Updating en-US language packs..."
        (cd "$UPSTREAM_DIR" && python3 ./scripts/update_en_US_packs.py)
        apply_branding
        log "Upstream updated to $(git -C "$UPSTREAM_DIR" log -1 --format='%h (%cd)' --date=short); patches re-applied. Re-run: ./build/bootstrap.sh build"
        ;;
    *) fail "Unknown command: $1 (expected: setup | build | build-only | ui | start | package | brand | update)" ;;
esac
