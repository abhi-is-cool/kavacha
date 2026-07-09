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
| `./build/bootstrap.sh build` | Full build (`npm run build`). First build: 1–3 hours |
| `./build/bootstrap.sh ui` | Fast UI-only rebuild (`npm run build:ui`) |
| `./build/bootstrap.sh start` | Launch the built browser |
| `./build/bootstrap.sh update` | Reset + pull upstream, re-apply Kavacha patches |

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
