# Kavacha Build System

Kavacha is an **overlay repository**: it does not vendor Firefox source. `build/bootstrap.sh`
fetches **Firefox ESR** at a pinned commit into `browser/firefox-source/` (gitignored), lays
Kavacha's overlay files and patches on it, generates the branding, and drives Firefox's own
`./mach`. There is no intermediate fork and no `surfer` — see
[ADR 0020](../documentation/decisions/0020-firefox-esr-direct-overlay.md) for why the Zen base
was retired on 2026-09-19.

```
Kavacha repo (this)                      browser/firefox-source/          binary
  overlay + patches + branding + prefs --->  Firefox ESR @ pin (mach) --->  kavacha(.exe/.app)
```

> **Status:** this document describes the build system as designed in ADR 0020. Until port
> milestone M1 has produced an observed build, treat every command below as the contract
> `bootstrap.sh` is being written to, not as something that has run. M1 replaces this note
> with the first build transcript's facts (times, paths, the Visual Studio answer).

## Commands

| Command | What it does |
|---|---|
| `./build/bootstrap.sh setup` | Check prereqs → fetch Firefox at `FIREFOX_COMMIT` (depth 1) → write `mozconfig` → copy `browser/overlay/` onto the checkout and commit it locally → apply `browser/patches/` → generate branding → `./mach --no-interactive bootstrap --application-choice browser` |
| `./build/bootstrap.sh build` | `./mach build`. First build 1–4 h; incremental builds minutes |
| `./build/bootstrap.sh fast` | `./mach build faster` — repackages JS/CSS/FTL/XHTML/jar content without compiling. Use after any overlay-only edit |
| `./build/bootstrap.sh start` | `./mach run -- -purgecaches` |
| `./build/bootstrap.sh package` | `./mach package`; on Windows also the NSIS installer |
| `./build/bootstrap.sh brand` | Regenerate branding only |
| `./build/bootstrap.sh update` | Reset the checkout to the pin (keeps the objdir), re-copy overlay, re-apply patches, re-brand |
| `./build/bootstrap.sh overlay-export` | Copy overlay-path files edited in the checkout back into `browser/overlay/` |
| `./build/bootstrap.sh overlay-check` | Non-zero if `browser/overlay/` and the checkout differ |
| `./build/bootstrap.sh patch-export NNNN-name` | `git diff HEAD -- <files>` in the checkout → `browser/patches/NNNN-name.patch`, with the required header |
| `./build/bootstrap.sh roundtrip` | Reverse newest→oldest, forward oldest→newest in a scratch worktree; byte-identical or fail |

Run `mach` commands as `env -u CLAUDECODE -u CLAUDE_CODE ./build/bootstrap.sh build` when an
agent is driving: `mach` detects one and suppresses the real error, leaving `*** Fix above
errors` with nothing above it.

## How the pieces attach

- **Overlay** (`browser/overlay/`) mirrors Firefox's tree: `browser/components/kavacha/`
  holds one `moz.build`, one `components.conf`, one `jar.mn`, every `Kavacha*.sys.mjs`, every
  `about:` page and every stylesheet; `browser/locales/en-US/browser/kavacha/` holds the FTL
  files. `setup` copies it in and commits it on top of the pin, so inside the checkout
  `git diff HEAD` is exactly the patch series and `git diff <pin>..HEAD` is exactly the
  overlay.
- **Patches** (`browser/patches/`) touch only files Firefox tracks — wiring `DIRS`, one
  `browser.xhtml` include, the Settings panes, the search config. Target: under ten.
- **Branding** is generated, not committed: `generate-branding.sh` renders
  `browser/branding/kavacha/` inside the checkout from `browser/branding/kavacha/branding.json`
  + `assets/logo.png`, using Firefox's `browser/branding/unofficial` as the template — PNG
  sizes, `.ico` (Pillow), `.icns` (macOS), NSIS bitmaps, `branding.nsi`,
  `VisualElementsManifest.xml`, `brand.ftl/.dtd/.properties`, and `pref/firefox-branding.js`
  with `privacy/tracker-controls/kavacha.js` + `ui/defaults/kavacha-ux.js` appended (Firefox
  packages that file as application defaults) and `app.update.url` pointed at
  `updates.kavacha.app`.
- **mozconfig** is written by `setup` per OS: `--enable-application=browser`,
  `--enable-bootstrap`, `--with-branding=browser/branding/kavacha`, `--with-app-name=kavacha`,
  `--with-app-basename=Kavacha`, `--with-distribution-id=app.kavacha`, release/optimize, no
  tests, no crash reporter, `--enable-update-channel=$KV_CHANNEL`; Windows adds
  `--disable-default-browser-agent` and `--disable-maintenance-service`; sccache when present.

## Prerequisites

- ~40 GB free disk, Git. `mach bootstrap` (via `--enable-bootstrap`) fetches clang, Rust,
  cbindgen, nasm and node itself.
- **macOS:** Xcode Command Line Tools (`xcode-select --install`).
- **Windows:** [MozillaBuild](https://ftp.mozilla.org/pub/mozilla/libraries/win32/MozillaBuildSetup-Latest.exe)
  installed to `C:\mozilla-build`; run every command from `C:\mozilla-build\start-shell.bat`
  (`bootstrap.sh` refuses to run outside it — Git Bash lacks the Python and MSYS2 `mach`
  needs). `git config --global core.longpaths true` and `core.autocrlf false`. Whether a
  Visual Studio install is also required is the first thing M1 answers; the hypothesis is
  that `--enable-bootstrap` fetches the packaged MSVC toolchain, with VS 2022 Build Tools
  ("Desktop development with C++" + Windows 11 SDK) as the fallback.
- **Linux:** build essentials (gcc/clang, pkg-config), GTK 3 dev headers, `xvfb` for headless
  probes.
- Optional: `sccache` (used automatically when on PATH), Python `pillow` for icon rendering
  (`pip install pillow`; required by `generate-branding.sh`).

## Editing workflow

1. Edit in `browser/firefox-source/`. Overlay-path files: `./build/bootstrap.sh overlay-export`
   copies them back into `browser/overlay/`; commit them like any file. Tracked Firefox files:
   `./build/bootstrap.sh patch-export NNNN-name`, then `roundtrip` must pass.
2. Rebuild with `fast` (overlay-only changes) or `build`, then re-run the relevant probe:
   `build/marionette-verify.py --launch`, then `build/marionette-verify.py` /
   `marionette-substrate.py` / `marionette-phase7.py`. Purge `<profile>/startupCache` after a
   rebuild (`--purge-cache`) or `ChromeUtils.importESModule` keeps returning the stale module.
3. Never check whether a build is current by looking at files in `dist/bin` that may be
   symlinks into the source tree; check a genuinely preprocessed artifact such as the packaged
   `browser/defaults/preferences/firefox-branding.js`.

## Upstream tracking strategy

- Kavacha pins a commit on Firefox's `esr153` branch (`FIREFOX_COMMIT` in `bootstrap.sh`).
  Security point releases: bump the pin, `./build/bootstrap.sh update`, fix any patch
  conflicts, run the probes, cut a Nightly. Never skip one.
- The next ESR is a deliberate migration, planned like the move off Zen was.
