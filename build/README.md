# Kavacha Build System

Kavacha is an **overlay repository**: it does not vendor Firefox or Zen source. The
bootstrap script fetches upstream Zen Browser into `browser/zen-upstream/` (gitignored),
applies Kavacha's patches, and delegates to Zen's `surfer`-based build system, which in
turn downloads and patches the matching Firefox source.

```
Kavacha repo (this)          browser/zen-upstream/        Firefox source
  patches + branding   -->     Zen (surfer build)    -->    Gecko (untouched)
```

## Commands

| Command | What it does |
|---|---|
| `./build/bootstrap.sh` | Check prereqs, clone Zen, `npm i`, `npm run init` (fetch Firefox source), language packs |
| `./build/bootstrap.sh build` | **Import → brand → build.** Full build; first build 1–3 hours |
| `./build/bootstrap.sh build-only` | Compile what is already in `engine/`, skipping the import. Only when you know nothing under `src/` changed |
| `./build/bootstrap.sh ui` | Fast UI-only rebuild (`npm run build:ui`) |
| `./build/bootstrap.sh start` | Launch the built browser |
| `./build/bootstrap.sh brand` | Regenerate branding only |
| `./build/bootstrap.sh update` | Reset + pull upstream, re-apply Kavacha patches |

### Why `build` imports first

`surfer build` calls `patchCheck()`, `applyConfig()` and `genericBuild()` — it
**never** calls `applyPatches()`. Files under `src/**/*.patch` therefore reach
`engine/` only via `surfer import`. Building without importing produces a
silently *wrong* binary that looks fine: patches 0031, 0032 and 0038 were absent
from every build for two weeks because of this, and a full rebuild reproduced a
byte-identical `preferences.xhtml`.

Surfer's own `patchCheck()` cannot catch it — it compares only the **count** of
`.patch` files, so edits *within* an existing patch are invisible to it. Since
2026-08-01 `bootstrap.sh build` always imports first (defect D0d).

Branding must run **after** the import, because the import overwrites the
generated branding directory. `build` also restores `engine/build/moz.build`
before importing: `generate-branding.sh` rewrites its update-host line in place,
which collides with Zen's own `src/build/moz-build.patch` and otherwise makes
every later import fail with "patch does not apply" (defect D0c).

**Never** use `dist/bin/browser/modules/*.mjs` to check whether a build is
current — on macOS those are symlinks through `engine/` to `src/`, so they match
even with no build at all. Check a genuinely preprocessed artifact such as
`Kavacha.app/Contents/Resources/browser/chrome/browser/content/browser/preferences/preferences.xhtml`,
or the packaged `browser/defaults/preferences/firefox-branding.js`.

## Prerequisites

- ~30 GB free disk
- Git, Python 3, Node.js 21+, Rust/Cargo, sccache
- **macOS:** Xcode Command Line Tools (`xcode-select --install`)
- **Windows:** MozillaBuild + 7-Zip on PATH, Visual Studio "Desktop development with C++"
- **Linux:** standard build essentials (gcc/clang, pkg-config, GTK dev headers)

## Patch workflow

Kavacha changes to upstream files are ordered patches in `browser/patches/`:

1. Make your change inside `browser/zen-upstream/` and verify it builds.
2. Export it: `git -C browser/zen-upstream diff > browser/patches/NNNN-short-name.patch`
3. Reset upstream (`git -C browser/zen-upstream checkout -- .`) and confirm
   `./build/bootstrap.sh update` re-applies it cleanly.

Patches are a last resort — prefer prefs (`privacy/tracker-controls/`), branding config
(`browser/branding/`), and chrome CSS/JS overlays, all of which survive upstream updates
without conflicts.

## Upstream tracking strategy

- Zen tracks Firefox **release/ESR**; Kavacha tracks Zen's `stable` tags.
- On each Zen release: `./build/bootstrap.sh update`, fix any patch conflicts, run the
  test suite, cut a Kavacha Nightly.
- Firefox security point-releases flow in through Zen — never skip them.
