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

> **Observed 2026-09-19 (M1), Windows 11, 24 threads:** `setup` incl. `mach bootstrap` ~10 min
> (toolchain downloads), first `build` **30 min**, `package` ~1 min producing
> `kavacha-153.4.0.en-US.win64.zip` and `…win64.installer.exe`, `fast` ~1 min. macOS and Linux
> have not yet been built on this base (port milestone M4 proves them in CI).
>
> **Do not edit `bootstrap.sh` while a build it launched is running.** bash reads a script
> incrementally, so when `mach` returns the shell resumes at a stale offset and reports
> `unexpected EOF` after a build that actually succeeded.

## Commands

| Command | What it does |
|---|---|
| `./build/bootstrap.sh setup` | Check prereqs → fetch Firefox at `FIREFOX_COMMIT` (depth 1) → write `mozconfig` → copy `browser/overlay/` onto the checkout and commit it locally → apply `browser/patches/` → generate branding → `./mach --no-interactive bootstrap --application-choice browser` |
| `./build/bootstrap.sh build` | `./mach build`. First build 1–4 h; incremental builds minutes |
| `./build/bootstrap.sh fast` | `./mach build faster` — repackages JS/CSS/FTL/XHTML/jar content without compiling. Use after any overlay-only edit |
| `./build/bootstrap.sh start` | `./mach run -- -purgecaches` |
| `./build/bootstrap.sh package` | `./mach package` — zip/tar/DMG plus, on Windows, the NSIS `…installer.exe` (its `make-package` rule runs NSIS itself), all in `obj-*/dist/` |
| `./build/bootstrap.sh brand` | Regenerate branding only |
| `./build/bootstrap.sh update` | Bring the checkout back in line with this repo (keeps the objdir): revert, re-copy overlay, re-apply patches, re-brand. Writes only files whose bytes actually changed — see *Why `update` is cheap* below |
| `./build/bootstrap.sh overlay-export` | Copy overlay-path files edited in the checkout back into `browser/overlay/` |
| `./build/bootstrap.sh overlay-check` | Non-zero if `browser/overlay/` and the checkout differ |
| `./build/bootstrap.sh patch-export NNNN-name` | `git diff HEAD -- <files>` in the checkout → `browser/patches/NNNN-name.patch`, with the required header |
| `./build/bootstrap.sh roundtrip` | Reverse newest→oldest, forward oldest→newest in a scratch worktree; byte-identical or fail |

Three static checks run over the overlay (`build/check-overlay.py`, also in CI), each
catching a failure a build cannot: a Fluent id defined in two Kavacha `.ftl` files (every
window loads them into one bundle, so the second is silently dropped); a top-level
`const`/`let`/`class` in a window script (those share `browser.js`'s scope, so the
declaration throws and aborts that whole file); and an unsorted `EXTRA_JS_MODULES`, which
fails the `moz.build` read outright because mozbuild sorts case-insensitively and Python
does not. All three were real — see the script's header.

Run `mach` commands as `env -u CLAUDECODE -u CLAUDE_CODE ./build/bootstrap.sh build` when an
agent is driving: `mach` detects one and suppresses the real error, leaving `*** Fix above
errors` with nothing above it.

## Why `update` is cheap

`update` used to detach the checkout to the pin and lay everything down again, which
handed all ~120 overlay files, all 5 patched files and every generated branding file a
fresh mtime whether or not their bytes had changed. `make` and mach's build backend key
off mtimes, so that bought a long C++ rebuild on every iteration — most of a working day
on 2026-09-20, roughly 30 minutes a cycle where an incremental build should be minutes.

It now writes only what differs:

- the checkout stays on the pin when it is already there, so the overlay is never deleted
  and restored wholesale (`copy_overlay` compares each file and skips the identical ones,
  and prunes any path the overlay commit still holds that `browser/overlay/` has dropped);
- the patched files are snapshotted before the revert and given their old mtimes back when
  the re-applied result is byte-identical — which it normally is. Two of the five are
  `moz.build` files, and a new mtime on those alone regenerates the build backend;
- branding renders into a staging directory and is copied over file by file, so an
  unchanged rebrand touches nothing (`generate-branding.sh` honours `KV_BRAND_DST`).

Each step reports what it changed (`Overlay: 120 files, 0 changed` / `Patched files: 5
unchanged (mtime kept)` / `Branding: 0 file(s) changed`), so a surprising rebuild has a
visible cause. Bumping `FIREFOX_COMMIT` still means a real checkout move and a long
rebuild; `update` says so when it takes that path.

> **Observed 2026-09-20, same host, nothing changed between runs:** `update` 46 s,
> `./mach build` **24 s**. The same no-op cycle before this change was ~30 minutes.
> Measure with the build's own last line, not a pipeline's exit status — `cmd | tail`
> reports `tail`'s status, which is how a failed build first read as EXIT=0 here.

> **Close the browser before building.** A running `kavacha` holds `dist/bin/*.dll` open
> and the Windows linker fails with `"…mozglue.dll": Access is denied` — five minutes in,
> with nothing in the message to say why (observed 2026-09-20: eleven `kavacha.exe`
> processes left behind by hand-driven probe runs). `build`, `fast`, `package` and `start`
> now refuse up front instead. `build/marionette-ci.py` kills the browsers it starts.

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
  installed to `C:\mozilla-build` (4.2.1 verified; ships Python 3.12, MSYS2, NSIS, 7-Zip,
  mozmake). `git config --global core.longpaths true` and `core.autocrlf false`.
  **No Visual Studio install is required** — verified 2026-09-19 on this host: with no VS
  present, `mach bootstrap` downloaded the packaged MSVC toolchain and Windows SDK into
  `~/.mozbuild/vs` and reported "Your system should be ready to build Firefox for Desktop".
  You may run `bootstrap.sh` from Git Bash or the MozillaBuild shell: when `$MOZILLABUILD`
  is unset it re-executes itself under MozillaBuild's MSYS2 via a generated `.cmd` file.
  (The hop goes through native `cmd.exe` on purpose: Git Bash's MSYS runtime and
  MozillaBuild's MSYS2 do not pass each other custom environment variables, and Git Bash
  re-escapes quotes on native command lines — a batch file avoids both.) `mach`'s state
  lives in `~/.mozbuild` (`MOZBUILD_STATE_PATH` is pinned there explicitly, because
  Python's `Path.home()` cannot resolve a home directory inside that MSYS2 otherwise).
- **Linux:** build essentials (gcc/clang, pkg-config), GTK 3 dev headers, `xvfb` for headless
  probes.
- Optional: `sccache` (used automatically when on PATH), Python `pillow` for icon rendering
  (`pip install pillow`; required by `generate-branding.sh`).

  **`sccache` on Windows is flaky.** Its server has been seen to die mid-build —
  `sccache: error: failed to execute compile` / `error reading compile response from
  server` (os error 10054) while compiling `gkrust`, losing an 18-minute build
  (2026-09-20). It is only a cache: when it misbehaves, build with
  `KV_NO_SCCACHE=1` rather than retrying blind, and check `sccache --show-stats`
  (an empty cache after a crash means it restarted and there was nothing to reuse
  anyway).

## Editing workflow

1. Edit in `browser/firefox-source/`. Overlay-path files: `./build/bootstrap.sh overlay-export`
   copies them back into `browser/overlay/`; commit them like any file. Tracked Firefox files:
   `./build/bootstrap.sh patch-export NNNN-name`, then `roundtrip` must pass.
2. Rebuild with `fast` (overlay-only changes; note `update` first if the overlay gained files)
   or `build` (moz.build/jar.mn changes), then re-run the probes. The whole set, each on its
   own fresh profile, is one command — this is also what CI runs:

   ```
   python3 build/marionette-ci.py            # substrate 104 + Phase 7 78 + restart 3+7
   ```

   To drive one probe by hand instead, launch the browser yourself and attach:
   `build/marionette-verify.py --launch --purge-cache`, then `build/marionette-verify.py`
   (chrome facts), `marionette-substrate.py`, `marionette-phase7.py`, or
   `marionette-restart.py 1` / relaunch / `marionette-restart.py 2`. Two rules that cost
   real time when ignored: purge `<profile>/startupCache` after a rebuild (`--purge-cache`)
   or `ChromeUtils.importESModule` keeps returning the stale module; and **give every probe
   run its own profile** — chained through one profile the restart probe read 4/7, and 7/7
   from clean. `marionette-ci.py` does both for you.
3. Never check whether a build is current by looking at files in `dist/bin` that may be
   symlinks into the source tree; check a genuinely preprocessed artifact such as the packaged
   `browser/defaults/preferences/firefox-branding.js`.

> The harness notes above (`env -u CLAUDECODE`, purging `startupCache`, the
> `MOZ_DISABLE_CONTENT_SANDBOX` caveat) were carried over from `context.md`, the
> Windows→Mac handoff scratch file. It was deleted at port milestone M5, as it said to be.

## Upstream tracking strategy

- Kavacha pins a commit on Firefox's `esr153` branch (`FIREFOX_COMMIT` in `bootstrap.sh`).
  Security point releases: bump the pin, `./build/bootstrap.sh update`, fix any patch
  conflicts, run the probes, cut a Nightly. Never skip one.
- The next ESR is a deliberate migration, planned like the move off Zen was.
