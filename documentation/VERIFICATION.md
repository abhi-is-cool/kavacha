# Kavacha Verification Ledger

> Items that cannot be completed without your action — credentials, hardware,
> or a product decision — live in [BLOCKED.md](BLOCKED.md).

Everything currently claimed as done but not proven, in one place. Created
2026-07-31 because [ROADMAP.md](ROADMAP.md) marks Phase 3 complete while six of
its entries still carry "Build/Marionette verification pending", and patches
0033–0037 are not mentioned in the roadmap at all.

**This document does not authorize any building.** It is the checklist to work
from when verification does happen.

---

## 1. Verification levels

A patch is not "verified" as a single boolean. Four distinct levels, weakest to
strongest:

| Level | Meaning | How it's established |
|---|---|---|
| **L1 — git-apply** | The diff applies cleanly onto the preceding tree | `git -C browser/zen-upstream apply --check` on the 0001→N-1 chain, then reverse-apply back to baseline |
| **L2 — syntax** | New/modified JS parses | `node --check` on each new `.mjs` / `.js` |
| **L3 — build** | The chain compiles and the module is packaged into the app | `mach build` completes; `Kavacha*.sys.mjs` present under `dist/bin/browser/modules/` |
| **L4 — functional** | The feature actually does the thing, in the running browser | `build/marionette-verify.py` against a launched build; observed DOM/geometry/state, not source reading |

The roadmap gate is **L4**. Patch headers that say "NOT BUILD-VERIFIED" were
written before a local build existed and now understate reality — see §2.

---

## 2. What the evidence actually shows today

Observed 2026-07-31 in `browser/zen-upstream/`:

- The **full 0001–0037 chain is applied** to the working tree (all 14
  `Kavacha*.sys.mjs` modules present in `src/zen/common/sys/`, all six
  `src/zen/kavacha-*/` about:-page dirs, `kavacha-theme-fixes.inc.css` from 0033).
- A **built app exists**: `engine/obj-aarch64-apple-darwin/dist/Kavacha.app`,
  dated 2026-07-18.
- Every Kavacha module is **packaged into the build** — 17 `Kavacha*.sys.mjs`
  files under `dist/bin/browser/modules/`, including `KavachaMarketplace`,
  `KavachaSDK`, `KavachaPluginManager`, `KavachaAboutStudio`,
  `KavachaAboutMarketplace`, `KavachaAboutPlugins`.
- Patches 0035/0036/0037 were **diagnosed by probing that running build** over
  Marionette.

**Therefore: L1, L2 and L3 are effectively satisfied for the whole chain.** The
chain applies, compiles, packages, and launches. The "authored without a local
Zen checkout / NOT BUILD-VERIFIED" language in the headers of 0022–0034 is
**stale** and should be corrected — it is now misleading in the other
direction, implying a risk that has already been retired.

**What is genuinely outstanding is L4 — functional verification.** Being
packaged proves a module ships. It does not prove it initializes, that its
palette command appears, or that its UI does anything. Patch 0030 is the
cautionary case: it built and packaged fine, and the button still opened
nothing for three patches (fixed only in 0036).

> ✅ **Resolved 2026-08-01 — but the caveat was far worse than stated.** The
> 2026-07-18 app was not merely missing 0036/0037. **Patches 0031, 0032 and 0038
> had never been present in *any* Kavacha binary.**
>
> `./build/bootstrap.sh build` runs `surfer build`, which calls only
> `patchCheck()`, `applyConfig()` and `genericBuild()` — it **never** calls
> `applyPatches()`. Files under `src/**/*.patch` (which is how 0021/0031/0032
> deliver their about:preferences integration, and which 0038 extends) reach
> `engine/` **only** via `surfer import`. No import had run since 2026-07-16, so
> a full 21-minute rebuild reproduced a byte-identical `preferences.xhtml`
> (sha256 unchanged at `a9453a9f…`). Surfer's `patchCheck()` did not catch it:
> it compares only the **count** of `.patch` files, and those patches edited
> existing patch files rather than adding new ones.
>
> **Never treat `dist/bin/browser/modules/*.mjs` as freshness evidence.** On
> macOS those are symlinks through `engine/` to `src/`, so grepping one for a
> patch marker matches even with no build at all. This is the most likely origin
> of earlier "confirmed in the running build" claims that could not have been
> true. Use a genuinely preprocessed artifact instead —
> `Kavacha.app/Contents/Resources/browser/chrome/browser/content/browser/preferences/preferences.xhtml`.
>
> Correct rebuild order: `npx surfer import` → `./build/bootstrap.sh brand` →
> `./build/bootstrap.sh build`. Branding must come **after** import.
>
> Binary used for every L4 result below: **buildID `20260731235720`**, verified
> current by `preferences.xhtml` sha256 `a9453a9f…` → `a4f37f50…`, size
> 103,172 → 112,891 bytes, and marker counts `paneKavachaWorkspaces` 0 → 8,
> `kavachaWorkspacesIsolateContainers` 0 → 1.

---

## 3. Outstanding functional (L4) verification, per patch

Each row's test is taken from the patch's own header, which already specifies
the Marionette pass to run.

### Phase 3 — customization engines

| Patch | Feature | L4 test to run | Status |
|---|---|---|---|
| **0022** | Layout engine | Edit `kavacha-layout.json`; confirm tab orientation, density, sidebar side/width and hidden elements apply live to every open window without restart. Run the four palette commands (Toggle Tab Layout, Cycle Sidebar, Cycle Density, Reload Layout). | ✅ **L4 (core)** 2026-08-01 — `setLayout({density:"comfortable", sidebar:"right", sidebarWidth:320})` applied live without restart: root `kavacha-density` `compact`→`comfortable`, `kavacha-sidebar` `left`→`right`, `--kavacha-sidebar-width` `250px`→`320px`; restoring returned all three to baseline. The four palette commands are registered (see 0027) but were not individually invoked; `hiddenElements`/`componentSizes` untested (both empty in the live doc). |
| **0023** | Theme engine | Switch to Kavacha Forest and back via "Switch Theme"; confirm surfaces retint live and default Midnight shows **zero flash**. Drop a package into profile `kavacha-themes/` and confirm discovery. | ✅ **L4 (core)** 2026-08-01 — `listThemes()` = `["kavacha-midnight","kavacha-forest"]`. Switching to Forest retinted live: `--kavacha-surface` `#0b0912`→`#101A14`, `--kavacha-text-primary` `#f6f4fc`→`#E6F0E9`, `--kavacha-border` `#322b4a`→`#274031`; 19 `--kavacha-*` inline props set on the root; restore returned to Midnight. **Defect found: Midnight's `--kavacha-accent` resolves to the empty string** (Forest sets `#E0A458`) — see §4. Zero-flash and profile `kavacha-themes/` discovery not tested. |
| **0024** | `about:studio` | Open about:studio; toggle every Layout control and confirm the real chrome updates; switch a theme from the Themes tab. | ❌ not run |
| **0025** | Live CSS editor | Apply a rule → see the chrome change. Toggle safe mode → all custom CSS drops. Revert from history. Confirm the escape-hatch palette command works **while the chrome is broken**. | ❌ not run |
| **0026** | Chrome polish + contrast | Confirm luminance-derived `color-scheme` flips toolbar text/icons to readable on both a dark theme and a bright custom surface from about:studio. Confirm reduced-motion gating. | ⚠️ L3 only (`mach build faster` + launch, no engine errors) |

### Phase 3 — platform

| Patch | Feature | L4 test to run | Status |
|---|---|---|---|
| **0027** | Command registry (complete) | Open Cmd+K; confirm commands **cluster by domain**. Register a runtime command and watch it enter the palette; unregister and watch it leave. | ✅ **L4** 2026-08-01 — 22 commands registered; domains emit in the order `navigation → organization → productivity → appearance → privacy → automation` with `clusteredByDomain: true`. Runtime `register()` → total 23 and `has()` true; `unregister()` → total 22 and `has()` false. The reconstructed-hunk risk is retired. |
| **0028** | `about:marketplace` | Install/apply/remove a theme, a layout preset, and the "Research Mode" bundle. Confirm the palette **gains and loses** the `Apply: …` commands. Confirm `install()` of a reserved `widget`/`panel` type throws. | ✅ **L4** 2026-08-01 — `getCatalog()` returns 5 components (2 theme, 2 layout, 1 bundle). Installing `theme-forest` added it to `installed` **and** registered `kavacha-marketplace-apply-theme-forest`; uninstalling removed both. `install("nonexistent-widget")` threw `KavachaMarketplace: unknown component`. Bundle install and the reserved `widget`/`panel` rejection were not exercised. |
| **0029** | SDK + plugins | Sideload a plugin under profile `kavacha-plugins/<id>/`; open about:plugins; grant a permission; enable; watch its command reach Cmd+K; disable → command leaves; revoke; uninstall. | ⚠️ **partial** 2026-08-01 — `KavachaSDK` and `KavachaPluginManager` both import successfully in the running build; `list()` returns `[]`. No plugin was sideloaded, so permission grant/revoke, enable/disable and the command lifecycle remain untested. |
| **0030** | ⚙ menu button + panel | Superseded in part by 0033/0036/0037 (see below). Still unverified: that the panel lists **Settings first, then every domain section**, that invoking a row runs the command, and that a marketplace/plugin command appears in the panel at runtime. | ⚠️ **mostly verified** 2026-08-01 — the panel opens and lists **Settings first**, then all six domain sections in registry order (Navigation, Organization, Productivity, Appearance, Privacy, Automation), 21 items total. Still unverified: that invoking a row actually runs its command, and that a marketplace-installed command appears in the *panel* (it was proven to enter the *registry* — see 0028). |
| **0031** | Appearance & Customization panes | Open about:preferences; confirm both panes render; exercise the theme picker, accent control + "Use system accent" reset, new-tab toggle, layout controls, safe-mode checkbox; confirm the four out-links. | ⚠️ **L3 — first build ever to contain it** 2026-08-01. `kavacha-appearance.js` and `kavacha-customization.js` are packaged for the first time, and `paneKavachaAppearance`/`paneKavachaCustomization` markers went 0 → 13 in the built `preferences.xhtml`. Runtime controls not yet probed — the probe covered only the Workspaces pane. |
| **0032** | Workspaces pane + restore-archived | Confirm the pane renders; exercise the unload-threshold pref, "Sleep inactive tabs now", the template buttons, and the **Restore an archived space…** picker. Confirm the dashboard Settings link and the welcome closing line. | ✅ **L4 (pane renders)** 2026-08-01 — at `about:preferences#paneKavachaWorkspaces` every element resolves visible with a non-zero rect: `kavachaWorkspacesTemplatesGroup` 600×132, `kavachaWorkspacesUnloadMinutes` 84×36, `kavachaWorkspacesSleepNow` 198×42, all `visibility: visible`, none `hidden`. The sleep-now action, unload-threshold write-back, template buttons, **Restore an archived space…** picker, dashboard Settings link and welcome line were not exercised. |

### Post-build fix patches

| Patch | Feature | L4 test to run | Status |
|---|---|---|---|
| **0033** | Menu visibility + darker theme | Confirm the gear **renders with a visible glyph** (the `-moz-context-properties`/fill fix) and that the retry path finds the toolbar cluster on a cold start. Contrast on the darker tokens is subjective — needs a user look, not a probe. | ✅ **L4 (glyph)** 2026-08-01 — the button computes `list-style-image: url("chrome://browser/skin/zen-icons/settings.svg")`, `fill: rgba(255, 255, 255, 0.847)` and `-moz-context-properties: "fill fill-opacity"`, so the context-properties fix works and the glyph is painted. Cold-start retry path and subjective contrast still unassessed. |
| **0034** | Clear unpinned tabs on quit | Pin some tabs, leave others unpinned, quit, relaunch → **only pinned tabs restore**. Then flip `kavacha.session.clear-unpinned-on-quit=false` and confirm normal restore returns. Check no `beforeunload` prompt blocks quit. | ❌ **FAILS L4 — confirmed data loss, 2026-08-01.** With the pref at its default `true`, **pinned tabs are destroyed** across quit/relaunch: pinned `about:robots` + `about:license` → restored session contained only `about:blank`. Control arm (pref `false`) restored all tabs with pinning intact, so the restore machinery is not at fault. Root cause: the `quit-application-granted` observer aborts SessionStore's final write — **no `sessionstore.jsonlz4` is produced** (control writes 3,403 bytes; `previous.jsonlz4` and `upgrade.jsonlz4-*` are also absent). The pinned tabs *are* persisted correctly in `recovery.jsonlz4` (2,015 bytes, both entries `pinned: true`), but a clean startup never reads that file. Reproduced twice; the confirming run had clean process-exit waits in both arms. See §4. |
| **0035** | Content edge inset | Confirm web content meets the window edge on all four sides in horizontal mode, and that vertical/sidebar mode still keeps Zen's inset. | ⚠️ cause measured live; **fix not confirmed** |
| **0036** | Menu button no-overflow | Confirm `#kavacha-menu-button` parentElement is the toolbar cluster (not `widget-overflow-list`) and that clicking opens the panel. | ✅ **L4** 2026-08-01 — `#kavacha-menu-button` `parentElement.id` = `zen-sidebar-top-buttons-customization-target`, `closest("#widget-overflow-list")` = `null`, rect 31×29 at (1218, 52), `visibility: visible`, `display: flex`. Opening it puts `kavacha-menu-panel` in `state: "open"`. §3.1 resolved below. |
| **0037** | Menu panel scrolling | Confirmed live: scrollHeight 813 vs clientHeight 624, scrollTop reached 189, all 27 entries reachable. | ✅ **L4 — re-confirmed 2026-08-01** on buildID `20260731235720`: scrollHeight 813 vs clientHeight 624, `overflow-y: auto`, scrollTop reached 189 (= 813 − 624, the full range). Panel renders 6 domain headers and 21 items. Note the earlier "27 entries" figure does not match the 21 observed — the count in the original claim was wrong, not the scrolling behaviour. |

### Phase 2 — identity

| Patch | Feature | L4 test to run | Status |
|---|---|---|---|
| **0038** | Optional per-Space containers | With `kavacha.workspaces.isolate-containers` **off** (the default): create a Student Space, confirm its `containerTabId` is `0`, and confirm a google.com login made in another Space carries into it. Create a Private Space and confirm it **still** gets its own container (the template is exempt). Flip the Settings › Workspaces checkbox on, create another Student Space, and confirm that one *does* get a container. Also confirm the checkbox reflects an externally-set pref (it has a live observer). | ✅ **L4** 2026-08-01 — the pref reads `false` at runtime with `hasUserValue: false`, so the branding default genuinely survives into the packaged app (`firefox-branding.js` line 228). Student Space created with the pref **off** → `containerTabId: 0`; Private Space with the pref **off** → `containerTabId: 6` (template exempt, as designed); Developer Space with the pref **on** → `containerTabId: 7`. The checkbox renders `checked: false` with label "Give new template Spaces their own container" (FTL resolved, not a raw ID) and **follows an externally-set pref** (`false` → flip → `true` → restored), proving the live observer. The cross-Space google.com sign-in carry-over was not tested. |

> Non-retroactivity is deliberate and worth testing explicitly: Spaces created
> *before* the pref is flipped keep whatever `containerTabId` they already hold.
> Clearing it would orphan the cookies inside that container and read to the user
> as being signed out everywhere. A test that flips the pref and then checks an
> *existing* Space is testing the wrong thing.

#### 3.1 Discrepancy to reconcile

Commit `e2d288f` states *"Both patches are git-apply-validated and confirmed
functionally in the running build."* But patch 0036's own header claims only
that the **overflow placement was captured** from the live build — it does not
claim the `overflows="false"` fix was confirmed after application. 0037's header
does explicitly claim post-change confirmation.

**✅ Resolved 2026-08-01 by re-probing: 0036's header understates it; the commit
message is substantively right.** The button is genuinely out of the overflow
list — `parentElement.id` is `zen-sidebar-top-buttons-customization-target` and
`closest("#widget-overflow-list")` is `null` — it is visible (31×29 at
(1218, 52), `visibility: visible`, `display: flex`), and clicking it opens the
panel. **0036's header should be corrected to claim post-change confirmation.**

Two caveats on how that conclusion was reached, both worth carrying forward:

- The 2026-07-18 binary that the original claim was made against **could not
  have contained 0036/0037** (app dated 18:38, patches committed 18:40), so the
  original claim was unsupported *at the time* even though it turned out to be
  correct. It was verified for the first time on 2026-08-01.
- 0036/0037 ship as `src/zen/**` modules, which reach the app as **symlinks to
  live source**. Static grep of a shipped module can therefore never establish
  that a build contains them. Only runtime probing can, which is what §2 now
  requires.

---

## 4. Known open defects

| # | Defect | Source | Severity |
|---|---|---|---|
| **D0** | **Data loss RESOLVED 2026-08-01; feature activation STILL BROKEN.** 0034's mechanism was architecturally impossible: SessionStore snapshots windows first (`SessionStore.sys.mjs:1310`) and `getCurrentState()` re-collects only `if (RunState.isRunning)` (`:5630`), so removing tabs at quit could never affect the saved session - and it corrupted it, via a null-`linkedBrowser` deref at `TabState.sys.mjs:79` that truncated `winData.tabs` and aborted the shutdown write. Patch 0039 moves the work to startup (`SessionStore.promiseAllWindowsRestored`). Pinned tabs now survive and `sessionstore.jsonlz4` is written (2993/3011/3014 bytes across three binaries, zero TypeErrors). **Outstanding:** with the pref ON, the next start leaves the window with no browser element (`browserElement is null`, buildID 20260801161436); the pref-OFF control on the same binary is clean, so the cleanup is the cause. Pref defaults **false** and must stay so. | L4 probe, 2026-08-01 | data loss fixed; feature disabled |
| **D0b** | ~~`kavacha.session.clear-unpinned-on-quit` is declared in no prefs file.~~ **RESOLVED 2026-08-01.** Declared in `ui/defaults/kavacha-ux.js` and confirmed to reach the app as `pref("kavacha.session.clear-unpinned-on-quit", false);` at line 243 of the packaged `firefox-branding.js`. Default deliberately set to **false**: this is the only Kavacha behaviour that discards user data on an ordinary action, so it is opt-in. A Settings checkbox (`kavachaWorkspacesClearUnpinned`, Workspaces pane) was added alongside it. | L4 probe, 2026-08-01 | ✅ resolved |
| **D0c** | ~~`build/generate-branding.sh` permanently breaks `surfer import`.~~ **RESOLVED 2026-08-01.** `bootstrap.sh` gained `restore_mozbuild()`, which restores `engine/build/moz.build` from the engine's pristine HEAD before any import; branding then re-applies the Kavacha host immediately after. Exercised end-to-end: after the restore, `surfer import` applied all **246** patches cleanly where it had previously failed. | build repair, 2026-08-01 | ✅ resolved |
| **D0d** | ~~`bootstrap.sh build` never imports.~~ **RESOLVED 2026-08-01.** `build` now routes through `build_all()`: restore moz.build → `npm run import` → `apply_branding` → `npm run build`, so a `src/**/*.patch` edit can no longer miss the binary. A `build-only` escape hatch keeps the old compile-only behaviour for when nothing under `src/` changed. | build repair, 2026-08-01 | ✅ resolved |
| **D0e** | ~~`surfer import` never syncs the `locales/` tree, so every FTL string added by a patch ships as a BLANK control.~~ **RESOLVED 2026-08-01.** Found while L4-verifying the new Settings checkbox: it rendered with no label. `preferences.xhtml` links `zen-preferences.ftl` (lines 46, 52) and the repo copy carried the keys, but the engine copy did not. Measured by running a full import and hashing: engine's `zen-preferences.ftl` came back **byte-identical** (`40c1eb65e4a0` → `40c1eb65e4a0`) across an import that applied all 246 patches, while the repo copy held 88 `kavacha-` keys against the engine's 84 — a delta of exactly the 4 new ones. The engine copy's mtime (`2026-07-31 23:24:16`) predated the edit (`2026-08-01 15:14:49`) despite two full imports in between. Fixed by `sync_locales()` in `bootstrap.sh`, which copies `locales/en-US/browser/**` onto `engine/browser/locales/en-US/**` after import; of 12 en-US FTL files exactly 1 differed, so the sync is precise. **This defect is invisible to every gate we had**: the patch applies, compiles, packages, and the control appears with correct geometry — only its text is missing. | L4 probe, 2026-08-01 | ✅ resolved |
| D1 | ⚙ panel overhangs the window bottom by ~6px at 758px height; the `calc()` cap is marginally too generous. Scrolling unaffected. **Confirmed 2026-08-01**: panel bottom 764 vs `window.innerHeight` 758 → overhang exactly 6px. | 0037 header; re-measured 2026-08-01 | cosmetic |
| **D5** | Theme `kavacha-midnight` leaves `--kavacha-accent` unset at runtime. **Correction 2026-08-01 (evening):** an earlier note in this file claimed Midnight "ships no default accent". It does — both `customization/themes/kavacha-midnight/colors.json` and `BUILTIN_THEMES` in `KavachaThemeEngine.sys.mjs` declare `accent: "#E8A33D"`. What ships no accent is the **pref**: `ui/defaults/kavacha-ux.js` says "no accent is set *here* (the welcome flow asks)", which is about the pref, not the theme package. Those are different things and the earlier note conflated them. The custom property is empty because Midnight is the baked default and the engine clears overrides for it (`if (id === kDefaultTheme)`), the palette being `%`-included into `zen-theme.css` at build time. **New, unverified:** the baked values and the package disagree — runtime `--kavacha-surface` is `#0b0912`, the package says `#14111F`. If a theme switch away from Midnight and back applies package values, the surface would change. Not tested; a theme-switch round trip is the probe to write. | 0023 L4 probe, 2026-08-01 | 🟡 open — token source-of-truth mismatch |
| D2 | Dashboard contrast pass outstanding — low-opacity links **likely below WCAG AA**. | ROADMAP Phase 3 follow-ups | accessibility |
| D3 | Both bundled themes are dark: base-token override fills only the dark half of `light-dark()`. Light themes are a follow-up, not a bug, but the limit is untested. | 0023 header | known limit |
| D4 | Plugins are trusted-on-grant — no JS sandbox / compartment isolation per plugin. The SDK is the only sanctioned surface, but nothing *enforces* that boundary. | 0029 header | security hardening |

---

### 4.1 Harness traps found while chasing D0 (2026-08-01)

Three ways this harness manufactured false results. All cost real time; all are
cheap to avoid once known.

- **`mn._launch_once` opens its log with mode `"w"`.** `t0034.py` runs four
  phases against one profile, so each phase **truncates** the previous phase's
  stderr. Grepping the surviving log showed "zero TabState errors" when the
  pref-ON phase had in fact thrown four — the log being read was the pref-OFF
  phase. A run that reuses a tag must append, or tag per phase.
- **The Marionette chrome sandbox is torn down before shutdown observers run.**
  Observers registered from `WebDriver:ExecuteScript` never fire at
  `quit-application-requested` or `quit-application-granted`. Both arms of a
  sandbox-based prototype came back as silent no-ops — which reads exactly like
  "the fix works" if only the treatment arm is run. Shutdown behaviour cannot be
  prototyped from the sandbox; it needs a real build.
- **`Cu.reportError` and `dump()` from the sandbox do not reach captured
  stderr**, though genuine engine `JavaScript error:` lines do. A tracer built
  on either is silently blank. Verify the trace channel with a known-good
  marker before trusting an empty trace as evidence of absence.

A fourth near-miss worth recording: `.sys.mjs` modules under
`browser/modules/` **are** live symlinks through `engine/` to `src/`, so source
edits do take effect without a rebuild. An identity check that greps
`fn.toString()` for a marker defined in a *module-level helper* will not find it
and wrongly suggests the file is not loaded. Check for a token that actually
appears inside the function being inspected.

## 5. Documentation reconciliation needed

- **ROADMAP.md has zero references to patches 0033–0037.** Five patches of
  shipped work are absent from the plan: menu visibility + theme contrast
  (0033), clear-unpinned-tabs-on-quit (0034 — a *user-facing behavior change*
  with no roadmap entry at all), content edge inset (0035), and the two menu
  fixes (0036/0037).
- **Six ROADMAP entries still read "Build/Marionette verification pending"** for
  0022–0032. Per §2 the build half is settled; the wording should narrow to
  functional verification only.
- **Patch headers 0022–0034 say "authored without a local Zen checkout".** That
  is no longer true of the environment. Correct the headers so they stop
  implying an already-retired risk.
- **ADR coverage gap**: ADRs run 0001–0011, ending at the SDK/plugin model
  (0011). Patches 0030–0032's settings-consolidation decision and 0034's
  clear-unpinned-tabs-on-quit behavior change have no ADR.

---

## 6. Artifacts outside the patch chain

These live directly in the repo tree, not in overlay patches, and have their own
verification need — nothing checks that they stay in sync with the code that
consumes them:

- `sdk/kavacha-plugin.schema.json` + `sdk/README.md` — must match what
  `KavachaSDK.sys.mjs` and `KavachaPluginPermissions.sys.mjs` actually accept.
- `customization/**/*.schema.json` (layout schema, theme manifest schema) — must
  match what `KavachaLayoutEngine` / `KavachaThemeEngine` actually parse.
- `ui/workspaces/*.schema.json` — the workspace/space object shape.
- `customization/layout-engine/default-layout.json` — reconciled to the
  horizontal default; confirm it still matches shipped prefs.

**Suggested**: a CI schema-conformance check, so a schema and its consumer can't
drift silently.

---

## 7. Release-gate verification still unbuilt

From ROADMAP Phase 4 and the release-gate table — verification work that does
not exist yet at all:

- [ ] **Network-silence test in CI**: fresh idle profile ⇒ zero telemetry
      requests. (Phase 4, unchecked. This is the load-bearing proof behind
      Kavacha's core privacy claim and nothing currently tests it.)
- [ ] **Reproducible builds** — Beta gate.
- [ ] **Signed builds** — Developer Preview gate.
- [ ] **Startup < 2 s** — v1.0 gate, unmeasured.
- [ ] **Crash rate < 0.5 %** — v1.0 gate, no telemetry by design; needs an
      opt-in or manual methodology.
- [ ] **External review of the crypto design** — Phase 5, explicit blocker for
      shipping sync.
- [ ] **Windows native build** — upstream-broken at this pin (libwebrtc rule
      missing when linking xul.dll). Experimental until Zen's win-cross recipe
      is adopted.
- [ ] **Tab-switch latency with heavy addon sets** (patch 0004 note) — flagged
      as "keep an eye on", never measured.

---

## 8. How to verify, when the time comes

**L1/L2 — no build required** (per the established workflow):

```
cd browser/zen-upstream
git apply <chain 0001..N-1>
git apply --check <patch N> && git apply <patch N>
node --check <each new .mjs/.js>
git apply -R <patch N> ...          # reverse back to baseline
git status --short                   # must return empty
```

Gotcha: modified-file hunks need exact `@@` counts — context+removed = old
count, context+added = new count. Copying counts from a reference patch is the
single most common cause of a "corrupt patch" rejection.

**L4 — requires the built app:**

```
./build/marionette-verify.py --launch     # shell 1
./build/marionette-verify.py              # shell 2
```

It speaks length-prefixed JSON over TCP to port 2828 — no third-party deps — and
reports hard facts (loaded modules, element existence, geometry) rather than
screenshots. Extend it per feature rather than eyeballing; the 0030 → 0036 saga
is the argument for that.

---

## 9. Priority order

1. **0034** — clear-unpinned-tabs-on-quit destroys user tabs and is entirely
   unverified. Verify, or default the pref off until it is.
2. **0027** — the registry is the substrate the menu, marketplace and SDK all
   build on, and its riskiest hunks were reconstructed.
3. **0022/0023** — the engines everything else delegates to.
4. **0031/0032** — settings panes; broad surface, L1+L2 only.
5. **0028/0029** — marketplace and plugins.
6. **0024/0025/0026/0033/0035** — studio, CSS editor, polish, fixes.
7. **D1–D4** and the §5 documentation reconciliation.
8. **§7 release gates** — start with the network-silence CI test.
