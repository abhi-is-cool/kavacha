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
    log "Setup complete. Next: ./build/bootstrap.sh build"
}

case "${1:-setup}" in
    setup)  setup ;;
    build)  (cd "$UPSTREAM_DIR" && npm run build) ;;
    ui)     (cd "$UPSTREAM_DIR" && npm run build:ui) ;;
    start)  (cd "$UPSTREAM_DIR" && npm start) ;;
    update)
        git -C "$UPSTREAM_DIR" checkout -- . && git -C "$UPSTREAM_DIR" pull
        apply_patches
        log "Upstream updated and patches re-applied. Re-run: ./build/bootstrap.sh build"
        ;;
    *) fail "Unknown command: $1 (expected: setup | build | ui | start | update)" ;;
esac
