# Session handoff — Windows box → Mac

**Written 2026-08-27.** Scratch file for the machine switch. Delete it once Phase 7 is
tested and the notes are flipped; it is not part of the permanent documentation set.

---

## TL;DR

Phase 7 (`b1f933f`, patches `0082`–`0087`) is still **UNTESTED**. Nothing was built,
nothing was probed, and no status marker was changed. The Windows box could not build it
— not a build failure, the build could not be *invoked*. Everything below step 0 of the
task is still open, exactly as `documentation/REMAINING_WORK.md` describes.

**On the Mac, the original task runs as written.** Start at step 1.

---

## Repo state

| | |
|---|---|
| `origin/main` | `b1f933f` — *Phase 7: knowledge, graph, focus, workflows, tab tree, tooling (0082-0087) — UNTESTED* |
| Windows local | `b1f933f` + 3 commits (see below) |
| Working tree | clean |

Three commits exist beyond `b1f933f` on the Windows checkout:

1. `8aed8e9` — disabled all of CI (repo had gone private over personal info)
2. `5cba1d2` — **revert** of the above (repo went public again, emails are staying)
3. this `context.md`

Commits 1 and 2 **cancel out exactly** — `git diff b1f933f HEAD -- .github/workflows/ci.yml`
is empty. They are noise from a request that was reversed within the same session. Squash
or drop them whenever convenient; nothing depends on them.

### ⚠️ The CI on/off switch is *not* in git

The disable commit was never pushed, so **GitHub-side CI was never actually off** and the
`0 8 * * *` nightly cron kept running throughout. If the **Settings → Actions → General →
Disable actions** toggle was flipped in the web UI during that window, *that* is what is
still off, and it has to be turned back on there. No commit will do it.

---

## The task (unchanged)

The authoritative version is the **READ FIRST** block at the top of
`documentation/REMAINING_WORK.md`. Summary:

1. **Build.** `env -u CLAUDECODE -u CLAUDE_CODE ./build/bootstrap.sh build`, then
   `./build/bootstrap.sh fast` so post-import module edits propagate.
2. **Probe.** `./build/marionette-verify.py --launch`, then `./build/marionette-phase7.py`.
3. **Fix every bug found** — edit in `browser/zen-upstream/`, regenerate the patch in
   `browser/patches/`, re-run the round-trip (reverse newest→oldest, forward oldest→newest
   in a scratch copy, diff every touched file; byte-identical, zero `.rej`).
4. **Commit, then flip the notes** — both `PHASE7-TEST-STATUS` markers to
   `TESTED <sha>`, replace the READ FIRST block with a one-liner, rewrite
   `VERIFICATION.md` §4d to what the probe actually showed, and correct the "never built"
   wording in `ROADMAP.md`, `SHIPPING.md` §3, `FEATURES.md`, `PLATFORM_PLAN.md` and
   `browser/patches/README.md`.

`grep -rn "PHASE7-TEST-STATUS" documentation/` finds both markers.

### Harness gotchas that have burned this project before

- **`env -u CLAUDECODE -u CLAUDE_CODE` is mandatory.** `mach` detects an agent and
  suppresses the real error, leaving `*** Fix above errors` with nothing above it.
- **`rm -rf /tmp/kavacha-mn-profile/startupCache` after every rebuild.** Otherwise
  `ChromeUtils.importESModule` keeps returning the stale module while every direct file
  check says it is current.
- **Launch with `MOZ_DISABLE_CONTENT_SANDBOX=1`.** JSWindowActor *child* scripts do not
  load in a local macOS build without it. This gates `0082` clip/highlight capture and
  `0087` citation metadata — the two most likely places to see a false "feature broken".

---

## What actually happened on the Windows box

**Step 0 — pull ✅.** Fast-forwarded `e8a84a5` → `b1f933f`. Needed a Git Credential
Manager dialog; it opens behind other windows.

**Step 1 — build ❌ could not start.** No Visual Studio at all (`vswhere.exe` absent, so
not even the installer), no `C:\mozilla-build`, no 7-Zip on PATH. `build/README.md`
requires all three on Windows. `mach` had nothing to compile with.

Behind that sits the older blocker: `documentation/BLOCKED.md` **B4** / `SHIPPING.md`
**R8** — Windows native is upstream-broken at the pinned Zen commit `425f0ae1`
(libwebrtc rule missing when linking `xul.dll`; Zen only cross-compiles Windows).
Installing the toolchain would most likely have landed on B4 rather than a working build.

**Step 2 — probe ❌ unreachable.** No binary. The static fallback was unavailable too:
`browser/zen-upstream/` is empty on a cold checkout, and `test/phase7-logic/phase7_logic_test.mjs`
imports directly from it, so the 41 logic checks fail at module resolution
(`ERR_MODULE_NOT_FOUND` on `KavachaCitations.sys.mjs`) — not a logic failure, just nothing
to import. The "41 checks pass" claim in the READ FIRST block is therefore **unreproduced**
on any machine in this session.

**Steps 3 & 4 — not attempted.** No bugs found because nothing ran. No marker touched.

### One assumption in the notes is now wrong

The READ FIRST block blames the two failed builds on the dev machine running out of RAM
and swapping. **That machine is not the constraint any more.** The Windows box has
**31.4 GB RAM and 934 GB free** — comfortably more than the box that swapped. If the Mac
has similar headroom, budget for the documented ~27 min (or the ~4 h cold build CI
assumes), not for a swap death spiral. If a build dies again, look somewhere other than
memory first.

---

## Mac setup

Prereqs (`build/README.md`): ~30 GB free disk; Git, Python 3, Node 21+, Rust/Cargo,
sccache; **Xcode Command Line Tools** (`xcode-select --install`).

```sh
git clone https://github.com/abhi-is-cool/kavacha.git
cd kavacha
./build/bootstrap.sh          # clone upstream @ 425f0ae1, npm i, init source, apply overlay
env -u CLAUDECODE -u CLAUDE_CODE ./build/bootstrap.sh build
```

`browser/zen-upstream/` is gitignored and will not come down with the clone — the
bootstrap populates it. Expect a large download and a long first build.

---

## CI — what it can and cannot do for this

`.github/workflows/ci.yml`, three jobs: `validate` (fast, every push/PR),
`nightly-build` (cron + `workflow_dispatch` with `full_build: true`),
`publish-nightly` (`contents: write`, pushes binaries to the `nightly` release).

- **It can build.** Matrix is `ubuntu-latest` + `macos-latest`, 360-minute ceiling.
  A `workflow_dispatch` with `full_build: true` would give the first-ever completed
  Phase 7 build without waiting on local hardware.
- **It cannot probe.** There is **no Marionette step anywhere in the workflow** —
  `marionette-verify.py` and `marionette-phase7.py` are never invoked. The only runtime
  check is *Network-silence test (R3)* (line ~250). Adding a probe step is real new work:
  a headless Linux runner needs xvfb, and the `MOZ_DISABLE_CONTENT_SANDBOX=1` guidance is
  macOS-specific.
- **It cannot help Windows.** Windows is deliberately excluded from the matrix
  (`ci.yml` ~L99-111): *"native Windows is upstream-broken at this pin … every attempt
  burns ~3.5h of runner time."*

---

## Also unresolved: installing Kavacha on Windows

Asked for during this session; not possible today. All three routes are closed — no local
build (no toolchain, plus B4), no CI build (matrix excludes Windows), and therefore no
Windows asset in the `nightly` release to download. It needs the **B4/R8 decision**:
adopt Zen's win-cross recipe, or move `UPSTREAM_COMMIT` off `425f0ae1`
(`build/bootstrap.sh:26`). That is a deliberate scope call, not a side effect of the
Phase 7 work.

---

## Standing rule

Do not flip a status marker on anything that was not observed to execute. **Patch 0059**
is the reminder: four settings panes passed every static gate, shipped, and had never once
run. Static gates passing is not evidence; a probe transcript is.
