# ADR 0020 — Overlay Firefox ESR directly; build with `mach`; Windows is a native target

**Status:** Accepted · 2026-09-19 · **Supersedes [ADR 0001](0001-fork-zen-overlay.md)** on the
choice of base. ADR 0001's two other principles — overlay repository, Gecko never modified —
are carried forward unchanged.

## Context

Kavacha was built as 87 ordered patches over Zen Browser pinned at `425f0ae1`, which sits on
Firefox **152.0.6**. Three facts, established 2026-09-19, made the base untenable:

1. **The pin is off the security train.** Firefox 152 was a June 2026 rapid release. The live
   ESR is **153** (released 2026-07-21, replacing ESR 140). Nothing at the Zen pin can receive
   a CVE fix, and ADR 0001's own consequences clause said security fixes must never be skipped.
2. **Windows is blocked *by* Zen.** The recorded failure ("no rule to make target …
   `Unified_cpp_…gn0.obj`" when linking `xul.dll`) is Zen's native-Windows libwebrtc build
   config, which Zen does not maintain because it cross-compiles Windows from Ubuntu with wine
   and a VS2026 sysroot. Vanilla Firefox on Windows is Mozilla's tier-1 native path.

   > **AMENDED 2026-09-20 — this reason is falsified as written.** The first CI run of the
   > Windows leg produced the *same* failure on vanilla Firefox ESR 153, with no Zen in the
   > tree: `No rule to make target '...\third_party\libwebrtc\modules\congestion_controller\`
   > `goog_cc_scream_network_controller\goog_cc_scream_network_controller_gn\`
   > `Unified_cpp_etwork_controller_gn0.obj', needed by '../../../dist/bin/xul.dll'`, after
   > 179 minutes on `windows-latest`. So the failure is not a property of Zen's build config,
   > and attributing it to Zen was wrong.
   >
   > What *is* established: native Windows builds **on a real host**. This box has built,
   > packaged and launched Kavacha on this base repeatedly (§4e, §4i), and its objdir contains
   > that exact directory's `backend.mk`, the rule for that object, and the compiled `.obj`.
   > Re-running configure locally with CI's own mozconfig (`-j3`,
   > `--disable-debug-symbols`) still generates that backend correctly — so the cause is
   > neither the source, the pin, the patches, nor the configure options, and is specific to
   > the runner environment. It is not yet diagnosed.
   >
   > **SECOND AMENDMENT, 2026-09-21 — the cause is MAX_PATH, and it was never about
   > Zen at all.** Three instrumented runs narrowed it to arithmetic. When make links
   > `xul.dll` it names each prerequisite relative to `toolkit/library/build` with three
   > parent hops, and hands that string to the Win32 API **without normalising the
   > `..`** — so the 260-character limit applies to the un-normalised form. On the
   > GitHub runner the longest libwebrtc object came to **262 characters**; on this
   > development host, whose objdir prefix is six characters shorter, **256**. Exactly
   > one object in the tree exceeds the limit on the runner and it is precisely the one
   > that failed; zero exceed it here. That is the whole difference between the two
   > machines, and it accounts for every observation: the file exists (the compile step
   > reaches it by a short relative path), the rule exists, the ordering edge is
   > honoured, and a fresh `make` process fails identically — because the failure is in
   > `stat`, not in make's logic.
   >
   > So reason 2's diagnosis was wrong twice over: not Zen's build config, and not
   > anything peculiar to Firefox either. Zen's recorded failure was almost certainly
   > the same arithmetic on a longer prefix. **Fixed** by `KV_OBJDIR`, which puts the
   > Windows CI objdir at `D:/o`: 64 characters of headroom where the default left
   > −2. An in-tree `obj-win` would have left 17, which is one libwebrtc directory
   > level away from this recurring.
   >
   > **The decision stands on reasons 1 and 3**, which are untouched, and macOS and Linux
   > have since been observed building on this base in CI — something never true on the Zen
   > base. But the honest reading is that reason 2 was a guess that happened to point the
   > right way for the wrong reason.
3. **The coupling is shallow where it matters.** An audit of the series (39,924 lines) found
   that **84.4 %** of changed lines (25,008 lines, 118 files) are Kavacha-authored files that
   only *live* inside Zen's tree; **15.6 %** (4,636 lines, 37 files) edit Zen source, and half
   of that (2,274 lines in `ZenSpaceManager.mjs`) is Kavacha workspace code written inside
   Zen's class. Zero hunks touch a vanilla Firefox file directly.

ADR 0001 anticipated this: *"if Zen stalls, the fallback is re-pointing the overlay at Firefox
ESR directly (the patch/pref/overlay mechanisms are upstream-agnostic by design)."*

## Decision

1. **Base: Firefox ESR 153**, pinned by commit on the `esr153` branch of
   `github.com/mozilla-firefox/firefox` (`FIREFOX_COMMIT` in `build/bootstrap.sh`). Security
   point releases are taken by bumping the pin and re-validating; the next ESR is a deliberate
   migration.
2. **Overlay, not patches, for Kavacha's own files.** Everything Kavacha authors lives under
   `browser/overlay/` mirroring Firefox's tree (`browser/components/kavacha/…`,
   `browser/locales/en-US/browser/kavacha/…`) and is copied onto the checkout. Patches in
   `browser/patches/` contain **only** hunks to files Firefox tracks, and are kept to a
   handful: wiring `DIRS`, one `browser.xhtml` include, the Settings panes, the search config.
3. **Build with `./mach` directly.** Zen's `surfer` toolchain is dropped, and with it the three
   documented surfer defects (D0c/D0d/D0e in `VERIFICATION.md`) that `bootstrap.sh` worked
   around. `bootstrap.sh` writes the mozconfig, copies the overlay, applies patches, generates
   branding, and delegates to `mach bootstrap / build / package / run`.
4. **Windows is a native build target**, locally (MozillaBuild shell) and in CI
   (`windows-latest`). No cross-compilation.
5. **Kavacha owns the substrate Zen used to provide:** process/window startup, the workspaces
   model ([ADR 0021](0021-kavacha-owned-workspaces.md)), the command palette surface, and the
   first-run welcome. Firefox primitives are used where they exist (containers, `SessionStore`,
   tab groups, `sidebar.verticalTabs`, built-in light/dark themes, `CustomizableUI`,
   `ConfirmationHint`).
6. **Dropped, deliberately, rather than rebuilt:** Zen compact mode, split view, glance, Zen
   mods/boosts, Zen sync, the Zen gradient theme generator, Zen folders (Firefox tab groups
   replace them), and every `zen.*` pref (each maps to a Firefox or `kavacha.*` pref).
7. **The command palette defaults to Ctrl/Cmd+K**, displacing Firefox's secondary search
   shortcut. It is rebindable through Kavacha's shortcuts store.

## Consequences

- The 87-patch Zen series is moved to `browser/patches-zen/` as read-only reference and is
  deleted at parity. Porting proceeds by milestone (M0–M5) with an observed gate at each; the
  standing rule that **no status marker flips without an execution transcript** applies to the
  port exactly as it did to patch 0059.
- Windows support is *claimed* only when a native build has been observed to launch and pass the
  network-silence test on this platform (M1), and **R8 closes only after CI publishes a Windows
  asset** (M4). Until then `SHIPPING.md` R8 and `BLOCKED.md` B4 stay open, re-worded.
- Nothing here moves a release gate: R1 (update service) and R2 (signed builds) still stand
  between any build and any user.
- Per-space bookmarks — the one Zen feature Kavacha *adopted* rather than extended (ADR 0005
  decision 1) — are deferred, not rebuilt; see ADR 0021.
- Phase 7 (0082–0087), never built or run under Zen, ports with everything else and receives its
  first test on the Firefox build (M5). Its markers stay `UNTESTED` until then.
- The Kavacha-vs-Zen positioning in `DIFFERENTIATION.md` changes shape: there is no longer an
  "inherit from Zen" column. What Kavacha does not build itself, it gets from Firefox.
