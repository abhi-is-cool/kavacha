#!/usr/bin/env bash
#
# Kavacha bootstrap — fetches upstream Zen Browser, applies the Kavacha overlay,
# and wraps the upstream build commands.
#
# Usage:
#   ./build/bootstrap.sh          # setup: check prereqs, clone upstream, npm i, init source
#   ./build/bootstrap.sh build    # full browser build (first run: 1-3 hours)
#   ./build/bootstrap.sh ui       # fast rebuild after UI-only changes
#   ./build/bootstrap.sh start    # launch the built browser
#   ./build/bootstrap.sh package  # produce installers (DMG/tar/exe) in browser/zen-upstream/dist/
#   ./build/bootstrap.sh update   # pull latest upstream and re-apply Kavacha patches
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UPSTREAM_DIR="$REPO_ROOT/browser/zen-upstream"
UPSTREAM_REPO="https://github.com/zen-browser/desktop.git"
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
    else
        log "Cloning Zen Browser (shallow)..."
        git clone --depth 10 "$UPSTREAM_REPO" "$UPSTREAM_DIR"
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

case "${1:-setup}" in
    setup)  setup ;;
    build)  (cd "$UPSTREAM_DIR" && npm run build) ;;
    ui)     (cd "$UPSTREAM_DIR" && npm run build:ui) ;;
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
        git -C "$UPSTREAM_DIR" fetch --depth 10 origin dev
        git -C "$UPSTREAM_DIR" reset --hard FETCH_HEAD
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
    *) fail "Unknown command: $1 (expected: setup | build | ui | start | package | update)" ;;
esac
