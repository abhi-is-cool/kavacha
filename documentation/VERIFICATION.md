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

> **Caveat on the 0060–0065 rows (added 2026-08-04).** These L4 verifications
> (dated 2026-08-02/03) were run on a local working tree with patch 0059's
> `preferences-js.patch` fix applied by hand. The *committed* patch series was
> unbuildable from a fresh checkout during that window — 0059 as merged could
> not apply (it was authored against a pre-0021 image of that file), so CI was
> red and `bootstrap.sh setup` would have failed at `apply_patches` — until the
> repair commit `293dbf9` (2026-08-03). The behaviours these rows describe are
> real and were observed live; the caveat is only that they were not reproducible
> from the committed tree until the repair. Everything from patch 0066 onward was
> verified against a clean build of the committed chain.

### Phase 3 — customization engines

| Patch | Feature | L4 test to run | Status |
|---|---|---|---|
| **0022** | Layout engine | Edit `kavacha-layout.json`; confirm tab orientation, density, sidebar side/width and hidden elements apply live to every open window without restart. Run the four palette commands (Toggle Tab Layout, Cycle Sidebar, Cycle Density, Reload Layout). | ✅ **L4 (core)** 2026-08-01 — `setLayout({density:"comfortable", sidebar:"right", sidebarWidth:320})` applied live without restart: root `kavacha-density` `compact`→`comfortable`, `kavacha-sidebar` `left`→`right`, `--kavacha-sidebar-width` `250px`→`320px`; restoring returned all three to baseline. The four palette commands are registered (see 0027) but were not individually invoked; `hiddenElements`/`componentSizes` untested (both empty in the live doc). |
| **0023** | Theme engine | Switch to Kavacha Forest and back via "Switch Theme"; confirm surfaces retint live and default Midnight shows **zero flash**. Drop a package into profile `kavacha-themes/` and confirm discovery. | ✅ **L4 (core)** 2026-08-01 — `listThemes()` = `["kavacha-midnight","kavacha-forest"]`. Switching to Forest retinted live: `--kavacha-surface` `#0b0912`→`#101A14`, `--kavacha-text-primary` `#f6f4fc`→`#E6F0E9`, `--kavacha-border` `#322b4a`→`#274031`; 19 `--kavacha-*` inline props set on the root; restore returned to Midnight. **Defect found: Midnight's `--kavacha-accent` resolves to the empty string** (Forest sets `#E0A458`) — see §4. Zero-flash and profile `kavacha-themes/` discovery not tested. |
| **0024** | `about:studio` | Open about:studio; toggle every Layout control and confirm the real chrome updates; switch a theme from the Themes tab. | ⚠️ **L4 (renders)** 2026-08-02 — loads to `readyState: complete`, title "Customization Studio", three tabs (`tab-layout`, `tab-themes`, `tab-advanced`) and sections Tabs / Sidebar / Density / Toolbar / Theme / Custom chrome CSS / History. Controls are real and enabled, including the `sidebar-width` range input. **Still unverified: that toggling a control changes the actual chrome** — per the 0030 lesson, rendering is not functioning. |
| **0025** | Live CSS editor | Apply a rule → see the chrome change. Toggle safe mode → all custom CSS drops. Revert from history. Confirm the escape-hatch palette command works **while the chrome is broken**. | ✅ **L4 (core)** 2026-08-02 — `setCSS()` applied live to real chrome: `#kavacha-menu-button` outline `3px` → `7px`, and `getCSS()` read the rule back verbatim. Safe mode dropped it (`7px` → `3px`, exactly baseline) and switching safe mode off restored it (`7px`). Original CSS restored afterwards. **Defect: `listHistory()` returned 0 entries after two `setCSS()` calls**, so revert-from-history could not be exercised — see D8, **fixed 2026-08-02 by patch 0045** (a save race, not persistence). The history arm is verified against the module's logic; re-run it through about:studio's Advanced tab on the next build to close 0025 completely. |
| **0026** | Chrome polish + contrast | Confirm luminance-derived `color-scheme` flips toolbar text/icons to readable on both a dark theme and a bright custom surface from about:studio. Confirm reduced-motion gating. | ⚠️ **partial** 2026-08-02 — luminance-derived `color-scheme` resolves `dark` both inline and computed on the Midnight surface, and a `prefers-reduced-motion` media rule is present in the chrome sheets. The **bright** custom-surface arm — the one that would actually prove the luminance branch flips — was not exercised. |

### Phase 3 — platform

| Patch | Feature | L4 test to run | Status |
|---|---|---|---|
| **0027** | Command registry (complete) | Open Cmd+K; confirm commands **cluster by domain**. Register a runtime command and watch it enter the palette; unregister and watch it leave. | ✅ **L4** 2026-08-01 — 22 commands registered; domains emit in the order `navigation → organization → productivity → appearance → privacy → automation` with `clusteredByDomain: true`. Runtime `register()` → total 23 and `has()` true; `unregister()` → total 22 and `has()` false. The reconstructed-hunk risk is retired. |
| **0028** | `about:marketplace` | Install/apply/remove a theme, a layout preset, and the "Research Mode" bundle. Confirm the palette **gains and loses** the `Apply: …` commands. Confirm `install()` of a reserved `widget`/`panel` type throws. | ✅ **L4** 2026-08-01 — `getCatalog()` returns 5 components (2 theme, 2 layout, 1 bundle). Installing `theme-forest` added it to `installed` **and** registered `kavacha-marketplace-apply-theme-forest`; uninstalling removed both. `install("nonexistent-widget")` threw `KavachaMarketplace: unknown component`. Bundle install and the reserved `widget`/`panel` rejection were not exercised. |
| **0029** | SDK + plugins | Sideload a plugin under profile `kavacha-plugins/<id>/`; open about:plugins; grant a permission; enable; watch its command reach Cmd+K; disable → command leaves; revoke; uninstall. | ⚠️ **partial** 2026-08-01 — `KavachaSDK` and `KavachaPluginManager` both import successfully in the running build; `list()` returns `[]`. No plugin was sideloaded, so permission grant/revoke, enable/disable and the command lifecycle remain untested. |
| **0030** | ⚙ menu button + panel | Superseded in part by 0033/0036/0037 (see below). Still unverified: that the panel lists **Settings first, then every domain section**, that invoking a row runs the command, and that a marketplace/plugin command appears in the panel at runtime. | ✅ **L4** 2026-08-02 — the panel opens and lists **Settings first**, then all six domain sections in registry order, 22 rows. **Row invocation now confirmed**: a command registered at runtime produced a row whose `.click()` drove the registered callback from 0 to 1 executions (`commandActuallyRan: true`). That was the last open half of the 0030 → 0036 saga — the button that "did nothing for three patches" is now demonstrably wired end to end. Still unverified: that a *marketplace-installed* command reaches the panel (it was proven to reach the registry — see 0028). |
| **0031** | Appearance & Customization panes | Open about:preferences; confirm both panes render; exercise the theme picker, accent control + "Use system accent" reset, new-tab toggle, layout controls, safe-mode checkbox; confirm the four out-links. | ✅ **L4 (both panes render, labels resolve)** 2026-08-02 — Appearance: category `category-kavacha-appearance` reads "Appearance & Themes", pane spans 5 blocks (600×44 header + Theme 132 + Accent 113 + Newtab + links) with 5 controls — `kavachaAppearanceThemeSelect` (menulist showing "Kavacha Midnight", options Midnight/Forest), `kavachaAppearanceAccentInput`, `kavachaAppearanceAccentReset` ("Use system accent"), `kavachaAppearanceNewtabDashboard`, `kavachaAppearanceStudioLink`. Customization: category reads "Customization", 4 blocks, 8 controls — TabStyle (Horizontal/Vertical), Sidebar (Left/Right/Hidden), Density (Compact/Normal/Comfortable), "Show the toolbar", "Custom CSS safe mode", and the CSS / Marketplace / Plugins out-links. **Every label resolves to real text, not a raw Fluent id.** Still unexercised: that operating each control changes the chrome. |
| **0032** | Workspaces pane + restore-archived | Confirm the pane renders; exercise the unload-threshold pref, "Sleep inactive tabs now", the template buttons, and the **Restore an archived space…** picker. Confirm the dashboard Settings link and the welcome closing line. | ✅ **L4 (pane renders)** 2026-08-01 — at `about:preferences#paneKavachaWorkspaces` every element resolves visible with a non-zero rect: `kavachaWorkspacesTemplatesGroup` 600×132, `kavachaWorkspacesUnloadMinutes` 84×36, `kavachaWorkspacesSleepNow` 198×42, all `visibility: visible`, none `hidden`. The sleep-now action, unload-threshold write-back, template buttons, **Restore an archived space…** picker, dashboard Settings link and welcome line were not exercised. |

### Post-build fix patches

| Patch | Feature | L4 test to run | Status |
|---|---|---|---|
| **0033** | Menu visibility + darker theme | Confirm the gear **renders with a visible glyph** (the `-moz-context-properties`/fill fix) and that the retry path finds the toolbar cluster on a cold start. Contrast on the darker tokens is subjective — needs a user look, not a probe. | ✅ **L4 (glyph)** 2026-08-01 — the button computes `list-style-image: url("chrome://browser/skin/zen-icons/settings.svg")`, `fill: rgba(255, 255, 255, 0.847)` and `-moz-context-properties: "fill fill-opacity"`, so the context-properties fix works and the glyph is painted. Cold-start retry path and subjective contrast still unassessed. |
| **0034** | Clear unpinned tabs on quit | Pin some tabs, leave others unpinned, quit, relaunch → **only pinned tabs restore**. Then flip `kavacha.session.clear-unpinned-on-quit=false` and confirm normal restore returns. Check no `beforeunload` prompt blocks quit. | ✅ **L4 — the feature finally works, 2026-08-02** (patches 0039 + 0044). With the pref ON: 2 pinned (`about:robots`, `about:license`) + 4 unpinned before quit → **exactly the 2 pinned tabs after relaunch**, plus Zen's empty-tab placeholder. `zombies: 0`, `selectedBrowser` valid (no `browserElement is null`), and `sessionstore.jsonlz4` written at **3021 bytes** — the file whose *absence* was D0's data-loss signature. The blocker was D6, now resolved. **Still to do before anyone enables this by default:** the pref-OFF control arm on this same binary, and the `beforeunload` check. The pref remains **false** by default and should stay so — this is the only Kavacha behaviour that discards user data on an ordinary action, and working is not the same as wanted-on. Historical record of the original failure follows. ❌ **FAILED L4 — confirmed data loss, 2026-08-01.** With the pref at its default `true`, **pinned tabs are destroyed** across quit/relaunch: pinned `about:robots` + `about:license` → restored session contained only `about:blank`. Control arm (pref `false`) restored all tabs with pinning intact, so the restore machinery is not at fault. Root cause: the `quit-application-granted` observer aborts SessionStore's final write — **no `sessionstore.jsonlz4` is produced** (control writes 3,403 bytes; `previous.jsonlz4` and `upgrade.jsonlz4-*` are also absent). The pinned tabs *are* persisted correctly in `recovery.jsonlz4` (2,015 bytes, both entries `pinned: true`), but a clean startup never reads that file. Reproduced twice; the confirming run had clean process-exit waits in both arms. See §4. |
| **0035** | Content edge inset | Confirm web content meets the window edge on all four sides in horizontal mode, and that vertical/sidebar mode still keeps Zen's inset. | ✅ **L4** 2026-08-02 — with `zen.tabs.vertical=false`, `#zen-tabbox-wrapper` has zero margins on all four sides and a rect of `x:0 y:96 right:1280 bottom:758` against `innerWidth 1280 / innerHeight 758` — **gapLeft 0, gapRight 0, gapBottom 0**. The selected browser reports the same three zeroes, so content genuinely meets the window edge. The vertical/sidebar arm (Zen's inset must be *kept* there) was not measured. |
| **0036** | Menu button no-overflow | Confirm `#kavacha-menu-button` parentElement is the toolbar cluster (not `widget-overflow-list`) and that clicking opens the panel. | ✅ **L4** 2026-08-01 — `#kavacha-menu-button` `parentElement.id` = `zen-sidebar-top-buttons-customization-target`, `closest("#widget-overflow-list")` = `null`, rect 31×29 at (1218, 52), `visibility: visible`, `display: flex`. Opening it puts `kavacha-menu-panel` in `state: "open"`. §3.1 resolved below. |
| **0037** | Menu panel scrolling | Confirmed live: scrollHeight 813 vs clientHeight 624, scrollTop reached 189, all 27 entries reachable. | ✅ **L4 — re-confirmed 2026-08-01** on buildID `20260731235720`: scrollHeight 813 vs clientHeight 624, `overflow-y: auto`, scrollTop reached 189 (= 813 − 624, the full range). Panel renders 6 domain headers and 21 items. Note the earlier "27 entries" figure does not match the 21 observed — the count in the original claim was wrong, not the scrolling behaviour. **Superseded by 0060**: the panel no longer scrolls at the shipped registry, because it no longer renders every command at once. The caps 0037 and 0040 added are kept — a single expanded section, or a plugin that registers heavily into one domain, can still reach the viewport — but they are no longer load-bearing, so this row's numbers no longer reproduce. |
| **0060** | ⚙ menu declutter | Open the panel: it should rest at ~7 rows with Settings pinned and one collapsed row per domain carrying a count. Confirm expanding a section closes the previous one; that every section fits without scrolling; that the filter searches across domains and that "settings" still finds the pinned row; that focus lands in the filter on open and Up/Down walk the rows. | ✅ **L4** 2026-08-02 — resting panel **291px** tall (vs ~720px before) with `scrollHeight == clientHeight`, i.e. nothing to scroll. Six sections with live counts **3/4/3/9/1/1**, all `aria-expanded: false`. Expanding each in turn: bottom edge **423–679** in a 758px window, so every section fits; opening a second closes the first (`rowsVisible` 5, not 14). Filter `"theme"` → 1 row with Appearance auto-expanded and the other five hidden at count 0; `"settings"` → the pinned row survives; `"zzzz"` → 0 rows + empty state; cleared → back to 291px. Focus lands in `.kavacha-menu-filter` on `popupshown`; ArrowDown/ArrowUp walk filter → Settings → Navigation → back to filter, each `defaultPrevented: true`. **Partly superseded by 0063**: the Appearance domain is no longer a section, so the resting panel is 293px with two pinned rows and five sections, and the "3/4/3/9/1/1" counts no longer reproduce. Everything else in this row still holds — re-confirmed 2026-08-03. |
| **0061** | Theme engine correctness | Switch between all three built-in themes and read the 18 `--kavacha-*` tokens off the chrome root each time: the same set must be defined under every theme, including the default. Under a light theme, `color-scheme` must be `light` on `:root`, `panel`, `menupopup` **and** `browser[type=content]`, and must not change when `zen.view.window.scheme` is flipped. Install a theme whose text fails 4.5:1 and confirm the applied text is readable. | ✅ **L4** 2026-08-03 — **18/18 tokens defined under Midnight, Forest and Daylight, none missing** (before: 6 of 18 at the default, 18 elsewhere — the defect). Daylight → mode `light`, `color-scheme: light` on all four selectors, `--zen-urlbar-filter` on the `brightness(75%)` branch; forcing `zen.view.window.scheme` to 0 changes none of them. Contrast for the built-ins: **18.14 / 16.40 / 16.01** primary, all pass. A grey-on-grey theme authored in `hsl()` + a named colour (unparseable to the old code, which would have called it "dark") measures **1.37:1** as authored and is repaired to **4.61 primary / 4.92 secondary** on apply. Midnight → Forest → Midnight leaves all 18 tokens byte-identical. **Corrected by 0064:** this row's claim that `zen.view.window.scheme` "becomes inert" was true only of CSS. Zen also reads that pref in JS and writes `--toolbox-textcolor`, `--toolbar-color-scheme` and `--zen-primary-color` inline, which no stylesheet was contesting — so the whole sidebar stayed white-on-white under Daylight while every assertion in this row passed. The engine now writes the pref to match the derived mode. Also: the contrast figures here are the engine's own token-vs-token check, which is not the same as what the chrome paints; 0064 adds the painted sweep. **CORRECTED 2026-08-03 (patch 0065): the `browser[type=content]` quarter of the "all four selectors" claim is FALSE and never held.** Measured on the reporter's own profile under Daylight, on the binary this row was written against: root `light`, `panel` `light`, `menupopup` `light`, and `browser[type=content]` **`dark`**, with the content browser painting `rgb(32,32,32)`. The rule is not failing to match — `b.matches("#tabbrowser-tabpanels browser[type='content']")` returns **true** and `kavacha-theme-mode='light'` is on `#main-window` — the element's scheme is simply not decided by that cascade. Content follows Firefox's own *Website appearance* (`browser.theme.content-theme`, default `2` = follow the OS; the host was `systemDark: true`), and setting that pref live does not move it either. This is **correct Firefox behaviour and is deliberately left alone** — websites follow the OS, not the browser theme — but the row overclaimed, and the overclaim survived because the original probe read a selector rather than `gBrowser.selectedBrowser`. Same failure shape as 0064's regex caveat: the assertion passed while the pixels disagreed. |
| **0062** | Theme-aware content pages | With a light theme active, open `about:studio`, `about:marketplace`, `about:plugins` and the new tab; each root should carry the theme's tokens, `kavacha-theme-mode` and a matching `color-scheme`, and the user's accent should reach `--zen-primary-color`. | ✅ **L4** 2026-08-03 — all four pages, both directions. Daylight → mode `light`, `color-scheme: light`, `--kavacha-surface #F7F6FB`, body background `rgb(247,246,251)` on the three about: pages and `rgb(236,234,244)` (the sunken token) on the new tab. Midnight → mode `dark`, `#0B0912`, `rgb(11,9,18)` / `rgb(6,4,9)`. Accent `#4AA3DF` reaches `--zen-primary-color` on all four, which it never did before. **Not covered:** the new-tab dashboard above its base layer is deliberately left white-on-photo (see the patch header) — that is a decision, not an untested claim. |
| **0063** | Appearance panel | Open the ⚙ menu: Appearance should be pinned under Settings and no longer be a generated section. Open the panel and confirm the mode, theme, accent and layout controls are present and reflect current state; click a theme card and an accent swatch and confirm the browser changes. | ✅ **L4** 2026-08-03 — menu at rest **293px**, no scrolling, pinned `[Settings, Appearance]`, sections `[Navigation, Organization, Productivity, Privacy, Automation]`. Panel **360×649**, bottom 743 in a 758px window, no scrolling at the shipped three themes; with a fourth installed it scrolls rather than overhanging (measured 640/734 with a 586px cap). Cards paint real palettes — Midnight `rgb(11,9,18)…`, Daylight `rgb(247,246,251)…`. Clicking Daylight: pref → `kavacha-daylight`, mode → `light`, surface → `#F7F6FB`, `color-scheme` → `light`, live. Accent swatch → `zen.theme.accent-color` and `--zen-primary-color` both `#4AA3DF`. Layout rows offer all three tab styles with the active one `aria-pressed`. Patch 0060's filter and arrow-key behaviour re-confirmed unbroken. **Measured while doing this:** inside a XUL popup `100vh` is **808px** in a 758px window, so 0060's `calc(100vh - 10rem)` caps are ~50px looser than intended; the new panel measures its anchor instead. |
| **0064** | Theme mode: the last authority | With a light theme active and the sidebar expanded, sweep every visible text-bearing chrome element, composite its colour over the theme surface, and assert none falls below 4.5:1 — the tab strip especially. Repeat under both dark built-ins. Confirm `zen.view.window.scheme` tracks the derived mode. Collapse and expand in each tab style and confirm the tabs survive; confirm the toolbox width is Zen's, not ours. | ✅ **L4** 2026-08-03 — **the reported bug reproduced exactly**: under Daylight, all 21 text-bearing elements in the sidebar (Space indicator, Clear button, five tabs, their labels, their sublabels, new-tab button and icon) computed to `color(srgb 0.962 0.949 0.946 / 0.81)`, luminance **0.893** on a surface of **0.927** — about **1.04:1**, i.e. invisible. That is "where are my tabs". After: **0 of 44** elements below 4.5:1, worst **8.55** (Daylight), **10.74** (Midnight), **9.92** (Forest). `zen.view.window.scheme` now reads 1 under Daylight and 0 under Midnight/Forest. 18-step layout matrix: 5 visible tabs at **every** step; collapse/expand cycles **230 → 60 → 230** in vertical and in arc; horizontal gives a 1280px strip. Toolbox width moved from our pinned 250px to Zen's own **230px**, so the splitter owns it again. Panel re-checked: 360×649, bottom 707/758, worst in-panel text **8.11:1**, theme card and accent swatch both live. `about:studio` under Daylight: body `rgb(247,246,251)` on `rgb(27,24,48)`. **Caveat on the method:** the first version of this sweep reported **0 offenders on the very strip where all 21 were unreadable**, because its colour regex matched only `rgb()`/`rgba()` and Firefox returns `color-mix()` results as `color(srgb …)`. The shipped `parseLiteralColor` had the identical gap; both are fixed. Treat a zero-offender result from a colour probe as suspect until the parser is shown to handle what the browser actually returns. |
| **0065** | Compact mode has a way back | Put a window in compact mode and confirm the chrome is genuinely gone (toolbox off-screen, tab strip and ⚙ button not visible). Then open the Appearance panel and confirm a **Compact mode** row exists, reflects the live state, and that clicking **Off** restores the toolbox, the tab strip and the tabs. Confirm the panel opens at all while its anchor is hidden. | ✅ **L4** 2026-08-03 — reproduced from the reporter's own profile. Compact on: toolbox at **x = −247**, width 252, `tabbrowser-tabs` `visibility: hidden`, `kavacha-menu-button` `visibility: hidden` — the empty window in the report. The Appearance panel **still opens with its anchor hidden** (`state: "open"`, rect 360×685 at 82,50), which is what makes this a usable escape hatch and was not obvious in advance. Rows are now `[Tabs, Density, Sidebar, Compact mode]`; the new row reads `off=false / on=true` against the live `gZenCompactModeManager.preference`. Clicking **Off**: toolbox → **x = 0, width 230**, tab strip `visible`, **3 tabs visible**, `zen.view.compact.enable-at-startup` → `false`. Verified separately that the pref alone governs the startup state: a pristine copy of the same profile with only that boolean flipped starts at toolbox x = 0, tabs and ⚙ button visible. **Not covered:** the hover-reveal path, and whether the row survives a window opened while already compact. |

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
| **D1** | ~~⚙ panel overhangs the window bottom by ~6px.~~ **RESOLVED 2026-08-01** (patch 0040). Confirmed at panel bottom 764 vs `innerHeight` 758 → exactly 6px, panel anchored at y=94 with 22 entries. Root cause: 0037 computed its cap from an assumed anchor of **y=81**; the real anchor is y=94, so every cap was 13px too generous. Both caps tightened by 1rem (bottom ≈ 748). The comment now records the *anchor* as the value to re-measure, so the next person does not tune the symptom. | 0037 header; re-measured 2026-08-01 | ✅ resolved |
| **D6** | ~~**`gBrowser.removeTab()` on a restored tab during startup never completes.**~~ **RESOLVED 2026-08-02** (patch 0044). The tab that would not close was Zen's **`zen-empty-tab`** — the placeholder shown when a workspace holds nothing. It is furniture, not content, and was never part of the restored session; Zen's own `#isLastTabInWindow` skips it for exactly that reason. Handing it to `removeTab()` does not remove it, it half-destroys it. Fixed by excluding structural tabs (`zen-empty-tab`, `zen-glance-tab`) from the sweep, from the "is the window now empty" count, and from survivor selection. **Two corrections to the diagnosis below, both instructive:** (1) it is *not* a startup failure — the zombie reproduces mid-session with no restart, which is how it was finally caught after the restart cycle had made every iteration cost minutes; (2) the hunt for "what `_endRemoveTab` waits on" was chasing a red herring — nothing was waiting, `removeTab` was simply handed a tab it was never meant to receive. Measured mid-session across five tabs: every real tab closed while the empty tab returned `stillInTabs: true`; after the fix, zombieCount **0**, pinned tab survives and takes focus. Full quit/relaunch acceptance test passes — 2 pinned + 4 unpinned before, exactly the 2 pinned after, zombies 0, `selectedBrowser` valid, `sessionstore.jsonlz4` written at **3021 bytes** (D0's signature failure was that file being absent). The earlier caveat about `browserElement is null` having a second trigger is retained below and still unresolved. | D0 diagnosis, 2026-08-01; fixed 2026-08-02 | ✅ resolved |
| ~~D6 (original entry)~~ | **`gBrowser.removeTab()` on a restored tab during startup never completes.** Diagnosed 2026-08-01 on buildID 20260801193154 by recording `gBrowser` state into a pref (`kavacha.debug.d0`) — the trace channel is dead in that context and Marionette cannot attach after the failure. The tab stays in `gBrowser.tabs` indefinitely with `closing: true` and `linkedBrowser: null`; a snapshot 6s later still shows the zombie. Anything enumerating tabs then dereferences a null browser — which is exactly what `browserElement is null` was. **Not** a startup race (attaching 25s later still fails), **not** tab selection (`selectedBrowserNull` was `false` at every snapshot, selected tab valid and pinned), **not** workspaces (all tabs shared one workspace id throughout). This is the sole remaining blocker on patch 0034's feature. Next step for whoever continues: read Zen's `removeTab` override to find what `_endRemoveTab` waits on, or close via SessionStore's own API rather than `gBrowser.removeTab`. **Caveat, found 2026-08-02 while launching a demo profile:** `browserElement is null` also occurred on a profile with a restored session while the cleanup pref was at its default `false` — that profile's session contained an `about:preferences` tab. So the symptom has at least one trigger unrelated to this cleanup. It does not invalidate the diagnosis above (the zombie tabs were observed directly, with the cleanup running), but before anyone relies on D6, re-run it against a restore-only control on the same binary to confirm the two are separable. A fresh profile on the same build attaches cleanly. | D0 diagnosis, 2026-08-01 | blocks 0034 feature |
| **D5** | Theme `kavacha-midnight` leaves `--kavacha-accent` unset at runtime. **Correction 2026-08-01 (evening):** an earlier note in this file claimed Midnight "ships no default accent". It does — both `customization/themes/kavacha-midnight/colors.json` and `BUILTIN_THEMES` in `KavachaThemeEngine.sys.mjs` declare `accent: "#E8A33D"`. What ships no accent is the **pref**: `ui/defaults/kavacha-ux.js` says "no accent is set *here* (the welcome flow asks)", which is about the pref, not the theme package. Those are different things and the earlier note conflated them. The custom property is empty because Midnight is the baked default and the engine clears overrides for it (`if (id === kDefaultTheme)`), the palette being `%`-included into `zen-theme.css` at build time. **RESOLVED 2026-08-02 — not a defect.** The theme-switch round trip was run: `setActiveTheme("kavacha-forest")` → `setActiveTheme("kavacha-midnight")` returned every token to its baked value (`--kavacha-surface` `#0b0912` → `#101A14` → `#0b0912`, `surfaceChanged: false`; inline custom properties on the root went 7 → 25 → 7). So the package's `#14111F` is **never** applied for Midnight — the engine clears overrides for the default theme exactly as designed, and there is no live mismatch to fix. What remains is a maintenance trap rather than a bug: `customization/themes/kavacha-midnight/colors.json` carries values that can never take effect, so editing them looks like it should change the UI and does nothing. Worth either aligning the package to the baked values or annotating the file; recorded here so the next person does not chase it. | 0023 L4 probe, 2026-08-01 | ✅ resolved (trap noted) |
| **D8** | **`KavachaUserCSS.listHistory()` returned 0 entries after `setCSS()`.** Found 2026-08-02 while L4-verifying 0025. **Root cause found and fixed 2026-08-02 (patch 0045): a TOCTOU in `setCSS()`, not persistence.** `setCSS()` read the text it was about to overwrite via `_loadCSS()` (the cache), and that cache is nulled *asynchronously* by the revision observer `setCSS()` itself rings on the way out. Two overlapping calls both saw the cache empty, both read the pre-write file, both computed `previous === ""`, and neither pushed history. Nothing threw, so it presented as a missing feature. Marionette's `execute_script` does not await promises — the probe made exactly that call — but so does the Studio's Apply racing a palette command. Fixed with a mutation queue plus a from-disk read; the empty baseline is now snapshotted so a first-ever save is revertible. Reproduced and re-verified against the real module with Gecko's globals stubbed: sequential/concurrent/fire-and-forget all 0 → 2 entries, and revert-to-oldest restores `""`. | 0025 L4 probe, 2026-08-02 | ✅ resolved (patch 0045) — logic verified; the about:studio path still needs a build |
| **D10** | **`about:preferences` was largely dead: one duplicate identifier disabled most of Settings.** Found 2026-08-02 by *opening the page*, immediately after 0047–0050 had been declared complete-on-paper. `kavacha-privacy.js` declared `const lazy` at top level and so does upstream `search.js` — and every pane script in about:preferences is a classic `<script>` sharing **one** global scope, so this is a `redeclaration of const lazy` SyntaxError that kills the whole file at **parse** time. Nothing in it ever ran, so the Privacy Center had never once executed. **The blast radius is the actually important part:** a parse failure leaves `gKavachaPrivacyCenter` undefined, and `init_all()` passed that bare global to `register_module()` (`preferences.js:532`), which threw `ReferenceError` and **aborted `init_all()`** — so every pane registered *after* that line silently never initialised: the other three Kavacha panes, Firefox Labs and Account & Sync. Total observable trace: two console lines. **RESOLVED 2026-08-02** (patch 0059), in two parts — the rename to `kavachaLazy` restores today's failure, and pane registration is now `typeof`-guarded and try/caught so one broken pane costs **one pane**. Verified live on the reporter's own profile: console errors 2 → **0**, all four Kavacha categories present and `hidden: false`, each template expands and populates (7/5/4/7 content nodes, 39 controls), `category-sync` visible again, and the Privacy Center renders real ledger data (77 blocked all-time, 2.6 MB estimated, per-type breakdown, 5 search engines). A collision audit over every pane script in the tree found `lazy` was the only duplicate top-level binding. **Note what this says about static verification:** every file was present, every id and FTL key reached the package, `node --check` passed on the file *in isolation* — and the feature was dead. Only loading the page catches it. | Live probe, 2026-08-02 | ✅ resolved (patch 0059) |
| **D9** | **CI validated patches against Zen's moving tip, not the pin.** ~~Every PR run could go red for reasons unrelated to Kavacha.~~ **RESOLVED 2026-08-02** (commit `143f4d9`). The `validate` job ran `git clone --depth 10` on zen-browser/desktop's *default branch* and applied the series to whatever Zen had merged that day, while the build honours `UPSTREAM_COMMIT=425f0ae1` — so a red run meant "Zen moved", not "Kavacha broke". Upstream tip was `ccbd9344` at the time of diagnosis. Established by elimination: all four validate steps were reproduced locally, and JSON parse, jsonschema validation and `shellcheck build/*.sh` (rc=0) all pass, while the patch series applies cleanly at the pin (42/42, later 43/43). Fixed by fetching the single pinned SHA at depth 1 — GitHub permits this, verified against the real remote — with the pin read out of `bootstrap.sh` so the two cannot drift. **Caveat: the actual CI log was never read** (no `gh` on this host), so this is inference from a faithful local reproduction, not from the failing line itself. | CI failure triage, 2026-08-02 | ✅ resolved |
| **D7** | **Two Settings controls bind the same pref, with opposite polarity.** `zen.urlbar.replace-newtab` (what ⌘T / Ctrl+T does) is exposed twice: `kavachaAppearanceNewtabDashboard` in the Kavacha Appearance pane (**inverse** — checked means pref `false`, wired through a live observer in `kavacha-appearance.js:133,137`) and `kavachaNewtabFloatingSearch` in Zen's Looks and Feel pane (**direct** — `preference="zen.urlbar.replace-newtab"`, `zenLooksAndFeel.inc.xhtml:43-45`). Both are live, so toggling one silently flips the other, and they read as contradictory because one is phrased positively and the other negatively. Found 2026-08-01 while checking whether the ⌘T setting already existed; patch 0041 deliberately added **no** third control. **RESOLVED 2026-08-02** (patch 0043). Both controls turned out to be Kavacha's own additions — `kavachaNewtabFloatingSearch` from 0011, `kavachaAppearanceNewtabDashboard` from 0031 — so this was never a question of overriding upstream. The Appearance pane keeps it (Kavacha owns that pane, settings consolidation was the 0030–0032 decision, and 0041/0042 settled the wording); the Looks and Feel checkbox is removed, with a comment left at the removal site so it does not get re-added. Confirmed in the packaged, preprocessed `preferences.xhtml`: `kavachaNewtabFloatingSearch` 1 → **0**, `kavachaAppearanceNewtabDashboard` still **2**. | 0041 investigation, 2026-08-01 | ✅ resolved |
| **D2** | ~~Dashboard contrast pass outstanding — low-opacity links **likely below WCAG AA**.~~ **CONFIRMED then RESOLVED 2026-08-02** (patch 0043). The suspicion was right and worse than "links": *every* text element on the dashboard failed. The page paints text over a Wikimedia photo behind a gradient scrim, so there is no fixed background and no single ratio — the honest measure is the **worst case**, the same text over the brightest pixel a photo can supply. Measured there: `.name-label` **1.12:1** (need 3.0), `.name-skip` **1.10:1**, `.settings` **1.84:1**, `.credit` **2.36:1** (need 4.5). Against the *page* background all four "passed" at 5.29–16.82:1, which is exactly why this survived — measuring the page background instead of the photo reports a clean bill of health. `.settings` was worst because `opacity: 0.85` multiplied into an already-translucent colour (0.6 × 0.85 = 0.51 effective alpha); `text-shadow` does not count toward WCAG and rescued none of them. Darkening the global `.scrim` enough would need alpha ≈ 0.80 and bury the wallpaper, so each element got a **local** backdrop instead. Re-measured after the fix: **5.17 / 4.85 / 8.55 / 8.56 — 0 failures**, matching the solved-for predictions (5.17, 4.68, 8.59, 8.59) to two decimals. Alphas were solved numerically; the sweep is in §4.2. Whether it *looks* right remains B7. | ROADMAP Phase 3 follow-ups | ✅ resolved |
| **D3** | ~~Both bundled themes are dark: base-token override fills only the dark half of `light-dark()`. Light themes are a follow-up, not a bug, but the limit is untested.~~ **RESOLVED 2026-08-03** (patches 0061 + 0062). 0056 shipped Kavacha Daylight and the light half of the bridge, but this row was never updated and the limit was never tested — and testing it found it was still real, just relocated. The token bridge was fine; `color-scheme` was not. The engine wrote it inline on `:root`, which reaches the root and nothing else, while Zen applies it to `:root, panel, menupopup, .zen-browser-generic-background, #urlbar[breakout-extend], #tabbrowser-tabpanels browser[type=content]` and the toast container, gated on a `zen.view.window.scheme` pref that knows nothing about Kavacha themes. Daylight therefore gave a light frame over dark popups, dark menus and dark content, with `--zen-urlbar-filter` still on `brightness(25%)` — a near-black urlbar on a white browser. Zen's block is anchored on `#main-window[windowtype=…]:not([chromehidden~='toolbar'])`, specificity **(1,2,0)**, so no `:root`-based override could ever have won; `kavacha-theme-scheme.inc.css` re-uses that anchor. Separately, the four Kavacha content pages hardcoded `color-scheme: dark` and could not see the token floor at all (0062). Now verified light-clean on all four chrome selectors and all four pages. | 0023 header | ✅ resolved (0061, 0062) |
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

### 4.2 The D2 contrast sweep (recompute before retuning)

Minimum backdrop alpha needed for white text to clear WCAG AA over a **pure
white** photo pixel, by text alpha. `newtab.css` cites this table; change the
numbers there only by rerunning this, never by eye:

| Element | text alpha | requirement | min backdrop alpha |
|---|---|---|---|
| `.name-label` | 1.00 (opaque, 48px → large) | 3.0 | 0.42 |
| `.name-skip` | 0.60 | 4.5 | 0.72 |
| `.settings` | 0.51 (0.6 × `opacity: .85`) | 4.5 | 0.80 |
| `.credit` | 0.75 | 4.5 | 0.64 |

Global scrim alpha at those positions is only 0.05 (mid-page) and 0.41
(bottom), which is why all four failed. Raising text alpha to 0.92 drops the
required backdrop to ~0.54, which is what made a local 0.55 panel sufficient.

Two things this exercise proves in general:

- **A worst-case model is the only meaningful one over imagery.** WCAG's
  formula assumes an opaque backdrop. Any probe that reads
  `getComputedStyle(el).backgroundColor` on a photo-backed page is measuring
  the page's own colour, not what the user sees, and will report a page that
  is unreadable over half the wallpapers as fully compliant.
- **The predicted numbers matched the runtime measurement to two decimals**
  (5.17/4.68/8.59/8.59 predicted against 5.17/4.85/8.56/8.55 measured), so
  this is a model worth trusting for the next surface rather than re-deriving.

### 4.3 Harness traps found while probing 0024/0025/0031 (2026-08-02)

Four more ways to manufacture a false result. Every one of these first
presented as a *product* failure and was actually the probe:

- **`#categories richlistitem` matches nothing.** The categories are
  `<html:moz-page-nav-button id="category-kavacha-appearance"
  view="paneKavachaAppearance">`. This selector returning `[]` was previously
  recorded as an unexplained oddity; it is simply the wrong element name.
- **Each pane lives inside `<html:template id="template-paneX">` and is inert
  until its category is activated.** Navigating to `about:preferences#paneX`
  does **not** instantiate it — clicking the nav button does. A probe that
  navigates by URL hash sees an empty document and reports the pane as
  missing. Both Kavacha panes "did not exist" for exactly this reason before
  the probe clicked first.
- **A pane is several sibling blocks sharing `data-category`**, not one
  container. `querySelector` (singular) returns the 44px title bar, so the
  pane looks like it renders but has zero controls. Use `querySelectorAll` and
  flatten.
- **`doc.l10n.formatValue(id)` returns `null` for attribute-only messages.**
  Fluent messages that define only `.label` have no value, so a
  "does this string resolve" check flags perfectly good controls as MISSING
  while the control's own label is correct. Compare against the rendered
  attribute, not `formatValue` alone.

And one that produced a false *negative* on a fix rather than a false
positive: a background-walk that accepts only opaque backgrounds
(`alpha > 0.99`) **walks straight past a translucent local backdrop**. After
patch 0043 added `rgba(0,0,0,0.55)` panels, the contrast probe still reported
failures because it never saw them; the layers have to be accumulated and
composited in order. A fix can be correct and still measure as broken.

## 4b. Phase 2/3 follow-ups (0051–0058) — L4 verified 2026-08-02

Built with `./build/bootstrap.sh fast` and driven over Marionette against the built
browser: **114 checks, 0 failures**, in two passes. The harness scripts extend
`build/marionette-verify.py`'s dependency-free client.

Pass 1 (77 checks) — parts exist, are wired, and are *labelled*:

| Patch | What was proved |
|---|---|
| 0051 | The container submenu is relabelled and rebuilt by Kavacha: "No container" present and radio-checked, "New container…" present (so the menu is not a dead end on a profile with zero containers, which is what Zen's `shouldShowContainers` gate would have made it), Edit Description item present. |
| 0052 | `KavachaMarkdown` renders headings/lists/emphasis; an `https:` link becomes an `<a>` and a `javascript:` link **does not**; raw HTML produces **no elements** and survives as text. The Preview toggle renders nodes, hides the textarea, and clears itself on the way back. |
| 0053/0054/0055 | All 16 new panels, menu items and controls exist **and their labels resolve** — the D0e check, run because blank controls measured correctly in every geometry probe. |
| 0054 | `kavachaBranchDepth` returns 0 for a root Space and **terminates on a deliberately constructed parent cycle** rather than hanging. |
| 0055 | 25 palette actions carry a domain, and both the group label and the command label resolve to real strings. |
| 0056 | The Daylight theme is installed; the default stamps `mode=dark`, Daylight stamps `mode=light`, chrome `color-scheme` follows, and the light layer re-points `--zen-branding-paper` at the theme surface (`#F7F6FB` both sides). Switching back restores `dark`. |
| 0057 | Three built-in widgets registered; the dashboard renders one slot per enabled widget with titles; reordering changes the order **and persists into the layout document**. The catalog now carries `widget` and `panel` types; applying a `panel` component sets the whole arrangement and applying a `widget` component adds exactly that card. |
| 0058 | `arc` stamps `kavacha-tab-style`, implies the vertical strip, and **survives both a re-read and a reload from disk** — the specific thing that would have broken, since `_normalize` seeded `tabStyle` from a boolean pref that cannot distinguish arc from vertical. |

Pass 2 (37 checks) — the actual user flows:

| Flow | Result |
|---|---|
| Pin a tab → snapshot → branch | Snapshot captures the `pinned` flag; **the branch comes back with the pinned tab pinned**. This is the arm patch 0054 exists for: 0019 always captured it and 0020 always ignored it. |
| Branch metadata | Parent pointer set, `kavachaBranchDepth` = 1. |
| Compare with parent | Panel opens with populated only-here / only-there / in-both sections. |
| Timeline + replay | Timeline opens for a *named* Space (not just the active one); replay shows "1 of 12" — oldest first, so stepping forward runs the way the work happened — lists that snapshot's tabs, and exits back to the list. |
| Discard branch | The confirm **actually appears**, with the interpolated text naming the Space and saying the snapshots survive; accepting deletes the branch. A Space with **no parent is refused without even prompting**. |
| Coach mark | Appears anchored with resolved text, removes itself on hide, flips its pref, and **does not appear a second time**. |
| Studio highlighting | Seven token classes produced including `!important` and at-rules; the textarea's text is transparent while its caret is not; both layers share font, size, line-height and padding (the thing that would make text drift off the caret); the highlight layer never intercepts clicks. |
| Console | No Kavacha errors in the browser console across either pass. |

Two harness notes worth keeping, because both cost a cycle:

- `Services.prompt` is an XPCOM service and **cannot be monkey-patched from a Marionette
  sandbox**. The stub silently did nothing and the real window-modal confirm blocked the
  script. Accepting the real dialog via a `common-dialog-loaded` observer is both the fix
  and the better test — it proves the confirm appears.
- Marionette blocks on a window-modal prompt even so: the discard has to be *started*
  without awaiting, so the script returns and the observer can accept the dialog while
  Marionette is idle, with the outcome read in a second call.

**Not covered by this pass**, and deliberately stated rather than implied: the Arc and
light-theme *appearance* (only the tokens and attributes were asserted, not how they
look), the recommendations panel against a profile with the recommended extensions
actually installed, and the universal-search shortcut firing from a real key press (it
ships unbound, so there is no default chord to press).

---

## 4c. Phase 6 AI surfaces (0080–0081) — L4 verified 2026-08-15

Built with `./build/bootstrap.sh fast` and driven over Marionette against the built
browser, with a mock Ollama on `localhost:11434` speaking the three endpoints the
bridge uses (`/api/tags`, `/api/generate`, `/api/chat`) and logging every request,
plus three fixture pages served over HTTP so the indexer actor could capture real
text. **All checks passed.**

| Area | What was proved |
|---|---|
| Sidebar registration | `viewKavachaAISidebar` is in `SidebarController.sidebars` after startup, pointing at the chrome page, and `visible` follows `kavacha.ai.enabled`. It opens at 216 px in the horizontal-tab layout, the switcher title resolves to "Kavacha AI" (so the Fluent id reaches browser.xhtml's scope — the D0e check), and the page exposes `summarizeCurrentPage` / `focusAsk` / `selectMode`. |
| Sidebar theming | Body background computes to the *theme's* surface, not the literal fallback baked into the stylesheet — patch 0062's `content-theme.js` is in the cascade, so the sidebar follows a theme switch like the other Kavacha pages. |
| Summarize | Header follows the selected tab; 487 characters of real captured page text reached the model; the reply rendered as **two real `<li>` nodes** through `KavachaMarkdown` with no `<script>` anywhere in the output. |
| On-demand capture | The indexer actor's `Capture` query returns `{url, title, text}` for the current page **without writing to the index**, which is what makes summarizing work with the index switched off. |
| Term extraction | "Where did I read about flood mapping in Kerala?" → `flood, mapping, kerala`. A quoted phrase survives whole (`"remote sensing"`). An all-stopword question yields `[]` and is reported as such rather than searched. |
| Retrieval + relaxation | The AND pass finds the one page carrying all three terms; the OR pass adds partial matches ranked by distinct terms matched. `exact` and `relaxed` are reported separately, and the sidebar's sentence differs accordingly — the first cut conflated them and claimed "no page matched every word" when one had. |
| Places fallback | With the index empty, retrieval still returned the right page from Places on title match (`indexed: false`) — proving the fallback is load-bearing, not decorative. |
| Cited answers | The answer rendered with `[1]`/`[2]` as controls titled with their source, the source list numbered to match, and **clicking `[1]` opened that source in a new tab**. |
| Degradation | Dead endpoint → `unreachable`; `kavacha.ai.enabled=false` → `disabled`; both return the ranked sources with no answer. Grouping with AI off reports `disabled` and changes nothing. Saving a session with AI off still saves, under the fallback name `<Space> — <date>`. |
| Duplicate tabs | `planDuplicates` picked exactly the `#fragment` copy; the **pinned** copy of the same URL was neither closed nor treated as the duplicate to remove; cancelling changed nothing; a second run closed 0. `about:blank` tabs are ignored. |
| Grouping — success | A fenced-JSON reply with prose in front produced two real tab groups (2 tabs each, distinct colours). A second run left already-grouped tabs alone. |
| Grouping — hostile replies | Prose-wrapped JSON parses; out-of-range and negative indices are **dropped, not clamped**; a missing label, duplicate indices, and a plain refusal all yield no groups and **no change to any tab**. |
| Saved sessions | Stored with `reason: session` and the model's name, listed by `listSnapshots`, shown in the timeline; a second save with an unchanged tab set still records (the `force` path past structural dedup). |
| Commands + icons | All five new commands register in the right domains (30 total). **Every `chrome://` icon URL across all 30 Kavacha commands was fetched: none 404.** This found that patch 0079's summarize command pointed at `selectable/edit.svg`, which is not in the icon set; fixed in 0080. |
| No background requests (R3) | With the mock logging every request it receives: **0 requests after a full fresh-profile startup, and still 0 after opening the AI sidebar.** ADR 0013's "probed on demand, never in the background" survives the sidebar existing — registering it and rendering its footer read prefs only. The first request happens when a feature is actually invoked. |

Harness notes:

- **The packaged app must be rebuilt AND the profile's `startupCache` cleared** before a
  `.sys.mjs` change is visible. A restart alone is not enough: two probe rounds were run
  against stale module code that still resolved to a current file on disk. Correct
  sequence: `bootstrap.sh fast` → kill → `rm -rf <profile>/startupCache` → relaunch.
- **JSWindowActor child scripts do not load in the content process on a local macOS
  build.** `resource:///actors/*Child.sys.mjs` are symlinks pointing outside the app
  bundle and the content sandbox refuses them — Zen's own `ZenBoostsChild` and
  `ZenGlanceChild` fail identically, so this is the build layout, not a Kavacha defect.
  Anything actor-driven (the passive page indexer, on-demand capture) can only be
  verified with `MOZ_DISABLE_CONTENT_SANDBOX=1`, which is how the above was run. **A
  packaged CI build copies rather than symlinks, so this does not affect shipped
  builds — but it means patch 0078's passive capture has never been exercised in a
  default local run**, and it is worth an explicit check on a real packaged artifact.
- §4b's note that `Services.prompt` cannot be monkey-patched from a Marionette sandbox
  is confirmed the hard way: the stub silently did nothing, the real modal blocked the
  harness, and the window ended up closing. Patch 0081 answers it in the product rather
  than the harness — `planDuplicates()` decides and `closeDuplicates()` destroys, with
  the confirmation injectable and defaulting to the real prompt.

**Not covered**, stated rather than implied: quality of a real model's output (a mock
proves the protocol and the plumbing, never the answers); the sidebar's *appearance*
under a light theme (tokens asserted, not looks); grouping against more than the
fixture tabs; and the summarize/ask paths driven from the palette by an actual key
press rather than by invoking the registered command.

---

## 4d. Phase 7 (0082–0086) — **built and L4-verified 2026-08-27 (Zen base)**

<!-- PHASE7-TEST-STATUS: TESTED 2026-08-27 -->
> **Still current as the record of Phase 7's first run.** This section describes Phase 7
> on the **Zen** base. It was re-run later on the Firefox ESR base after the re-platform
> — see [§4h](#4h-phase-7--first-run-on-the-firefox-esr-base-2026-09-20). §4h does not
> supersede this one; it is a second run on a different base, and two of the three
> defects found here were found again there because the port branched from before this
> commit (`dd49da9`).

**Built and driven at runtime, on the record.** Phase 7 had its first completed build
(Apple Silicon, ~57 min) and its first L4 probe on 2026-08-27.
`build/marionette-phase7.py`, launched on a **fresh** profile with
`MOZ_DISABLE_CONTENT_SANDBOX=1`, reports **75 passed, 0 failed**. The base chrome probe
(`marionette-verify.py`) is clean alongside it. This section now says what the probe
showed, not what was hoped.

Written 2026-08-17, corrected 2026-08-23, verified 2026-08-27. The earlier drafts said
"never built"; that was true when written and is why this section exists — to keep
"it applies" apart from "it works". The distinction paid off: the first run drove code
that had passed every static gate and was dead anyway.

**Three defects only a run could show — found by the probe, fixed, re-probed clean:**

1. **0083 — the knowledge graph module never packaged.** `KavachaKnowledgeGraph.sys.mjs`
   was created but never added to `src/zen/common/moz.build`'s `EXTRA_JS_MODULES`, so
   `resource:///modules/KavachaKnowledgeGraph.sys.mjs` failed to load — `about:knowledge`'s
   graph, `describe()`, `hubs()` and every edge were dead in a real build while the
   round-trip, syntax and manifest gates all passed. This is the 0059 shape exactly
   (present, packaged elsewhere, dead here) and is the second distinct unsorted/omitted
   `EXTRA_JS_MODULES` bug in this series — the Workflows one was caught pre-commit, this
   one only by the run. Registering it shifted patch 0084's adjacent `moz.build` hunk,
   regenerated to match; the 87-patch round-trip is byte-identical again.
2. **0083 — the entity parser dropped one-character names.** `parseEntities` rejected any
   `name.length < 2`, discarding legitimately single-letter entities ("X", "Q") and
   returning nothing for a model reply of `[{"name":"X",...}]`. Relaxed to drop only
   empty/duplicate names. Confirmed in isolation (pure function, node) and in the probe.
3. **0084 — focus mode left notifications permanently denied.** The park pref
   `kavacha.focus.saved-notification-default` shipped a default of 0
   (`ui/defaults/kavacha-ux.js`), and libpref prunes a user value equal to its default —
   so when the user's notification default was 0 (the common "ask"), `_muteNotifications`
   could not persist the saved value, its `prefHasUserValue` sentinel never set,
   `_restoreNotifications` early-returned, and the default stayed at 2 (DENY) after the
   first session. The ROADMAP line boasting "restored exactly … before the bug rather
   than after" was, ironically, describing the bug. Fix: the park pref ships no default.
   Verified on a fresh profile: `before=0 → after=0`.

**What the probe proved (75/75), by patch:**

| Patch | Now driven at runtime |
|---|---|
| 0082 | Knowledge sidebar registers; note upsert + empty-body delete; highlight and clip store; `forPage` returns note+highlight+clip; search finds the note; JSON export; `removeForUrl` clears the page |
| 0083 | `about:knowledge` contract registered and the module loads; an edge dedups to weight 2; self- and non-web edges refused; `hubs()` and the four `describe()` sections; all five `parseEntities` cases (prose-wrapped, refusal, junk-kind→topic, unnamed-dropped, capped-at-12) |
| 0084 | `about:focus` registered; base-domain block matching; session active with minutes left; end time in **seconds** (not overflowed); notifications denied during and **restored exactly** after |
| 0085 | `about:workflows` registered; valid workflow saves + registers its `Run:` command; `javascript:` URL and unknown step refused; sub-15-minute interval refused; a run executes its steps; a workflow cannot run another; delete revokes the command |
| 0086 | Back-then-elsewhere produces a **sibling**, not a truncation; branch points marked; cursor on the newest node; a reload adds no node; `about:blank` is never a node |
| 0087 | APA (title-first with no author, author-first with one), MLA quoting, BibTeX TeX-escaping and host+year key; the two panels exist; all 13 commands register and every command icon resolves |

**Prior static/logic results (still true, kept for the record).** The 87-patch series
round-trips byte-identically with zero `.rej`; `node --check` passes on every new/modified
`.mjs`/`.js`; the four `components.conf` parse with distinct cids/contract ids; the
workflow schema's action `enum` matches `KavachaWorkflowActions`; and
`test/phase7-logic/phase7_logic_test.mjs` (41 checks, real modules, Gecko globals stubbed)
earlier fixed the multi-step-back tab-tree classifier and the ordering of the
`run-command` recursion refusal.

Two harness notes, now confirmed necessary in practice: a `.sys.mjs` change needs
`bootstrap.sh fast` **plus** clearing the profile `startupCache`; a **new**
`EXTRA_JS_MODULES` entry needs a full `mach build`, not `build:ui`; and JSWindow actor
child scripts do not load on a local macOS build without `MOZ_DISABLE_CONTENT_SANDBOX=1`,
which affects 0082's clip/highlight capture and 0087's citation metadata through the
`KavachaIndexer` actor.

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

## 4e. Firefox ESR 153 base — M1: first native Windows build, observed (2026-09-19)

The first milestone of the re-platform ([ADR 0020](decisions/0020-firefox-esr-direct-overlay.md)):
vanilla Firefox ESR 153 plus Kavacha branding and default prefs, built and run **natively on
the Windows host**, no Zen, no surfer, no Visual Studio. Everything below was executed, not
inferred; the transcripts are in the M1 session log.

| Check | Observed |
|---|---|
| Toolchain | `mach bootstrap` fetched clang, Rust wrappers, nasm, node, NSIS, mozmake **and the packaged MSVC toolchain + Windows SDK** into `~/.mozbuild/vs` with no Visual Studio installed; "Your system should be ready to build Firefox for Desktop!" |
| Build | `./build/bootstrap.sh build` from Git Bash (re-executed under MozillaBuild 4.2.1) — **30 min wall clock** on this host (24 threads, sccache cold), `obj-x86_64-pc-windows-msvc/dist/bin/kavacha.exe`, `xul.dll` 179 MB |
| Identity | `kavacha.exe --version` → `Mozilla Kavacha 153.4.0esr`; `application.ini` `Name=Kavacha`, `Version=153.4.0`; Marionette `Services.appinfo.name === "Kavacha"`, window title brand "Kavacha" |
| Packaged prefs | `browser/defaults/preferences/firefox-branding.js` carries all 117 Kavacha prefs; runtime probe confirmed branding prefs **win** over `firefox.js` (`media.gmp-manager.url`, `extensions.systemAddon.update.url`, `browser.region.network.url` all at Kavacha's values) |
| Package | `mach package` → `kavacha-153.4.0.en-US.win64.zip` (130 MB) **and** `kavacha-153.4.0.en-US.win64.installer.exe` (NSIS ran as part of `make-package`; no separate target) |
| L4 probe | `marionette-verify.py` against the live build: app facts, Firefox chrome geometry; `loadedModules: []` and no menu button — correct for M1 (overlay deliberately empty) |
| **R3 network-silence** | **PASSED** on Windows: 0 denylisted hosts on a fresh idle profile after 40 s. Contacted: Remote Settings + its CDN, `services.addons.mozilla.org` (allowed), and one NOTABLE: `ciscobinary.openh264.org` |

**Two defects the first R3 run surfaced, both fixed and re-verified in the same session:**

- **`aus5.mozilla.org` was still asked for `update.xml`** despite `app.update.url` being set to
  Kavacha's host and effective at runtime. Firefox 153 takes the update URL from
  `application.ini` (`[AppUpdate] URL`), generated by `build/moz.build` from a hard-coded
  `aus5.mozilla.org`; the `CONFIG` override it consults has no configure option and the pref
  is no longer read. Fixed by **patch 0001** (the first patch of the new series);
  `Services.appinfo.updateURL` now reads `https://updates.kavacha.app/…`, and aus5 is gone
  from the second run. This is the same problem patch 0002 solved under Zen by a different route.
- **Nimbus experiments ran** (`RSLoader` evaluated `nimbus-secure-experiments` recipes) with
  every documented switch off, because Firefox 153 enables the loader when studies, rollouts
  **or Firefox Labs** are on, and Labs has only an enterprise-policy switch. Fixed by
  **patch 0002** (a pref gate, `nimbus.labs.enabled`, upstream default unchanged) plus
  `nimbus.rollouts.enabled=false` / `nimbus.labs.enabled=false` in `kavacha.js`. Runtime:
  `ExperimentAPI.enabled === false` (labs/rollouts/studies all false). Shipping `policies.json`
  was rejected because it brands every install "managed by your organization".

**Recorded, not fixed:** `toolkit.telemetry.enabled` reads `true` at runtime although the
pref ships `false` — Firefox forces it on for prerelease update channels (`nightly`) at
startup; `datareporting.healthreport.uploadEnabled` stays `false` and no telemetry host was
contacted. OpenH264 is now fetched **without** the aus5 GMP ballot (the `gmp-gmpopenh264`
directory appears on a fresh profile), so the 2026-08 note that silencing the ballot silences
Cisco no longer holds; the decision to keep OpenH264 stands, the mechanism note is corrected.

**Not claimed by M1:** R8 (needs a CI-published installer — M4), macOS/Linux on the new
base (M4), any Kavacha feature (M2+), `.icns` (template icon on non-Mac hosts).

Harness hazard found: editing `bootstrap.sh` while a build it launched is running makes bash
resume at a stale byte offset when `mach` returns (`unexpected EOF` after a *successful*
build). Do not edit a running script; `build/README.md` says so now.

## 4f. Firefox ESR 153 base — M2: the substrate, observed (2026-09-19)

Milestone M2 of the re-platform ([ADR 0020](decisions/0020-firefox-esr-direct-overlay.md)
§4, [ADR 0021](decisions/0021-kavacha-owned-workspaces.md)): the four things Zen used to
provide, now Kavacha's own, driven over Marionette on the Windows build.
`build/marionette-substrate.py` — **43 checks, 0 failures**; `build/marionette-restart.py`
(two phases around a real relaunch of the same profile) — **7 checks, 0 failures**.

| Piece | What the probe observed |
|---|---|
| Startup (`KavachaStartup`, `profile-after-change` category) | module imports, service constructed, window script ran (`gKavacha.ready`), Kavacha stylesheet applied before first paint (`--kavacha-sheet-loaded`), FTLs inserted — all injected at `browser-window-before-show`, **no `browser.xhtml` patch** |
| Spaces model (`KavachaWorkspaces` + `gKavachaWorkspaces`) | ≥1 space on a fresh profile ("Personal"); `createAndSaveWorkspace` returns a record and switches; a new tab joins the active space and carries `kavachaSpaceId` in SessionStore; switching away hides it (`tab.hidden === true`), switching back shows it and re-selects the space's last-selected tab; archive hides it from the strip and flags the record, unarchive re-activates; delete moves the tabs home; the strip is a CustomizableUI widget inside `#TabsToolbar` with one button per visible space |
| **Restart round-trip** | space + hidden tab → session flushed → clean quit → relaunch (`browser.startup.page=3`): the space is in the store, the `about:robots` tab is restored **in its space** (SessionStore custom value), hidden while home is active, listed in the strip, shown on switch |
| Command palette | `KavachaCommandRegistry` ported (802 lines; 87 command strings recovered into `kavacha-commands.ftl`), `Ctrl/Cmd+K` key registered with Firefox's `key_search` displaced, the panel opens, lists the built-ins grouped by domain (incl. the template commands), closes |
| Welcome | `about:kavacha-welcome` resolves (JS `nsIAboutModule`), loads in the parent as secure chrome UI, renders its four steps, script runs; `startup.homepage_welcome_url` default = `about:kavacha-welcome` (Marionette itself sets a user value of `about:blank` on test profiles — the probe reads the default branch) |
| Settings panes (patch 0004) | the four Kavacha nav buttons exist in `about:preferences`; `#kavachaPrivacy` selects `paneKavachaPrivacy`; the pane template expands, its script runs, the body un-hides. **Placeholder bodies** — the real panes are M3 |

**Defects the probes caught, fixed the same day:**

- **Restored tabs lost their space.** Session restore creates tabs (firing `TabOpen`) *before*
  applying their saved state; the `TabOpen` handler stamped every restored tab with the active
  space and wrote it as a custom value, and `SSTabRestoring` then trusted the attribute. The
  first restart round-trip failed 3 of 7. Fix: defer the `TabOpen` assignment by one task
  (restore applies state synchronously right after creating its tabs) and make the saved
  custom value authoritative over the attribute. Second run: 7/7.
- Placeholder pane ids were generated from the include file name (`kavachaPrivacyCenterCategory`)
  while the pane scripts, probe and the Zen-era panes use `kavachaPrivacyCategory`. Aligned to
  the Zen-era names, which M3 keeps.
- Two probe-side corrections, not product bugs: the space re-selects its *last-selected* tab, not
  the tab a test added in the background; an about: page's `documentURI` stays the about: URI.

**Not claimed by M2:** any ported feature (M3); theme mode is the welcome page's pref +
built-in-theme switch until `KavachaThemeEngine` is ported and becomes the authority;
per-space search engine / extensions / settings overrides (they hook the switch chokepoint
in M3, which already exists — `addSwitchListener`); container retargeting of fresh tabs;
Firefox's quick-actions urlbar integration; the notes/branching/timeline members of the
facade, which log "not ported yet" and return empty.

## 4g. Firefox ESR 153 base — M3: the port, observed (2026-09-20)

Every Kavacha-authored file of the Zen era now lives in `browser/overlay/` and runs on
the Firefox base. Build `20260920090557`, Firefox 153.4.0, Windows x86_64 (clang-cl 21.1.8
+ lld-link; the packaged MSVC sysroot supplies headers and libs only).

**All numbers below are from FRESH PROFILES.** Chaining probes through one profile
contaminates them — the restart probe "regressed" to 4/7 that way and is 7/7 on a clean
run. Probes get their own `--profile` now.

| Probe | Result |
|---|---|
| `marionette-substrate.py` | **104 / 104** |
| `marionette-phase7.py` | **77 / 77** (see §4h) |
| `marionette-restart.py` (two phases around a real relaunch) | **7 / 7** |
| `network_silence_test.py` (R3) | **PASSED** — 0 denylisted hosts |
| `bootstrap.sh roundtrip` | byte-identical, 4 patches |
| `check-overlay.py` | pass |

Ported: 40 modules, 11 `about:` pages, 4 Settings panes, 15 Phase 7 page files, the token
floor and every stylesheet. The substrate probe drives the spaces model end to end
(create / switch / hide / archive / delete / restart), per-space settings and search
engine through the switch chokepoint, notes with markdown preview, universal search,
snapshot → branch → timeline → compare, the palette, the ⚙ menu, `about:studio`, the four
Settings panes with live Privacy Center counters, and asserts that **every** ported module
imports and **every** Kavacha `about:` page loads with content — the 0059 check, since
"present and packaged" is not "works".

**Three defects the port found, each now guarded by a check proved against the real bug**
(`build/check-overlay.py`, wired into CI):

- **`redeclaration of const lazy`** in the ported universal search. Window scripts share
  `browser.js`'s scope, so one top-level `const` aborted that whole file — and
  `KavachaStartup`'s single try/catch then skipped every *later* script and every window
  hook. The window came up with no menu button, no palette and no theme, and nothing said
  why. Fixed both halves: the script is block-scoped, and startup now isolates each piece.
  This is the Zen-era patch 0059 failure, recurring.
- **Four duplicate Fluent ids.** Under Zen, `zen-command-palette.ftl` and
  `zen-preferences.ftl` were separate bundles, so the ⚙ appearance panel and the Settings
  pane could both define `kavacha-appearance-title`. On the Firefox base every window
  loads them into ONE bundle and Fluent silently drops the second definition.
- **An unsorted `EXTRA_JS_MODULES`**, which fails the `moz.build` read outright. mozbuild
  sorts case-insensitively (`util.py`, `key=lambda x: x.lower()`), which is not Python's
  default: `KavachaAIBridge` sorts before `KavachaAboutFocus` in ASCII and after it here.
  **§4d recorded this defect class as caught by no static gate. It is caught by one now.**

**Two defects in the port's own new code, found only by a from-scratch profile:**

- **The theme mode and the chrome disagreed on a fresh profile.** `XPIProvider` *installs*
  `default-theme` asynchronously during first-run startup, and installing a theme makes it
  active — undoing the built-in theme Kavacha had enabled. A first-run user got Firefox's
  default chrome while `kavacha-theme-mode` said `dark`. Invisible on any profile that had
  run before, because the theme was left enabled from the previous run. Fixed by a
  **bounded, surgical** re-assert at delayed startup: it re-takes the theme only from
  `default-theme@mozilla.org` (the one XPIProvider installs), gives up after ~10 s, and
  never overrides a theme the user chose. Two earlier diagnoses — "AddonManager not ready"
  and "run the hook later" — were both wrong; reading `XPIProvider.sys.mjs` settled it.
- **Restored tabs lost their space.** Session restore creates tabs (firing `TabOpen`)
  *before* applying their saved state, so the `TabOpen` handler stamped every restored tab
  with the active space. Fixed by deferring that assignment one task and making the saved
  `SessionStore` value authoritative over the mirrored attribute.

**Deliberately not ported** (ADR 0020 §4g): Zen compact mode, split view, glance, mods /
boosts, Zen sync, the gradient generator, Zen folders (Firefox tab groups replace them),
and every `zen.*` pref. **Deferred** (ADR 0021): per-space bookmarks — the one Zen feature
Kavacha adopted rather than built; history attribution ported in full.

**M3 does NOT claim:** macOS or Linux on this base (M4), R8 (needs a CI-published
installer), any L4 arm in §3 that this probe does not exercise, or subjective visual
sign-off (B7).

## 4h. Phase 7 — first run on the Firefox ESR base (2026-09-20)

<!-- PHASE7-TEST-STATUS: TESTED aff0e3d (build 20260920090557) -->
**Phase 7 runs on the Firefox ESR base.** `build/marionette-phase7.py` ran clean on a
fresh profile against build `20260920090557`, and **78 checks, 0 failures** after the
entity-parser fix below — knowledge
capture (notes, highlights, clips, search, export, per-page delete), the knowledge graph
(edge dedup and weighting, self-edge and non-web refusal, hubs, describe, the entity
parser), focus sessions, automation workflows, the tab-history tree, citations and
writing mode.

> **This was not Phase 7's first run.** Earlier drafts of this section said the probe had
> "never once been executed until today" and called this the first-ever run. That was
> false, and it was written in good faith from a branch that did not contain the evidence:
> the re-platform branched at `2cc7cc0`, and Phase 7's actual first build and first L4
> probe happened on the **Zen** base on 2026-08-27 (`dd49da9`, 75/75, Apple Silicon) —
> [§4d](#4d-phase-7-00820086--built-and-l4-verified-2026-08-27-zen-base). What is true
> here is narrower and still worth recording: this is the first Phase 7 run **on the
> Firefox ESR base**, on a different platform, after every feature was ported.
>
> The two histories met on 2026-09-20. The lesson is the one this file exists for: a
> claim of the form "this has never been done" is a claim about everything you cannot
> see, and a branch is exactly the thing that hides it.

Getting there took four fixes. Two of them are the same defects 2026-08-27 had already
found and fixed on the Zen base — the port branched from before those fixes, so it
re-derived them independently rather than inheriting them:

- **A real defect: focus mode left desktop notifications blocked permanently.**
  `kavacha.focus.saved-notification-default` shipped with default `0`. In Gecko,
  `setIntPref(p, v)` where `v` equals `p`'s default *clears* the user value instead of
  storing one — and `0` is also the ordinary value of
  `permissions.default.desktop-notification` ("ask"). So "save the previous value" stored
  nothing, `_restoreNotifications` found nothing saved and returned early, and every focus
  session ended with notifications still blocked, across restarts. Fixed with a `-1`
  sentinel and one shared accessor. **Already found and fixed on 2026-08-27** on the Zen
  base, which resolved it the other way — by shipping no default at all, so
  `prefHasUserValue()` is an honest sentinel. Both fixes are correct and mutually
  exclusive; `ui/defaults/kavacha-ux.js` now carries the `-1` default the ported module
  expects, and says so. The pre-2026-08-27 header of patch 0084 asserted the opposite
  ("the notification default is restored exactly on end"); the 2026-08-27 commit corrected
  that header in place, and that correction is preserved in
  `browser/patches-zen/0084-focus-mode.patch`.
- **Two port gaps:** the tab-history-tree and saved-session panels lived in Zen's
  `popups.inc` and had no Firefox-base equivalent, so `KavachaTabHistory.showPanel()`
  silently did nothing and `kavachaOpenSavedSessions` was still a stub. Both panels are
  built now and the session manager (restore / rename / delete) is implemented.
- **Three of the probe's assertions were changed — and one of those changes was wrong.**
  Its entity-parser cases used one-character names (`"X"`, `"A"`). I read the parser's
  `name.length < 2` guard as deliberate LLM-noise rejection and rewrote the probe to match
  it. That was backwards: 2026-08-27 had already diagnosed the same guard as a real defect
  — it discards legitimately single-letter entities (`"X"`, `"Q"`) — and relaxed it to
  drop only empty and duplicate names. Rewriting a probe so it agrees with the code under
  test removes the only thing that could have caught this. **Fixed 2026-09-20 after the
  merge:** the guard now drops only empty and duplicate names, and the probe reads single
  letters again — `entity parser: single-character names are KEPT` replaces
  `… are dropped as noise`, with a case added for case-insensitive duplicate collapse.
  Phase 7 goes 77 → **78 checks, 0 failures**, and both new assertions were confirmed
  individually in the transcript rather than inferred from the total.

**Still not claimed for Phase 7:** the capture paths that need a real http(s) page
(`CaptureSelection`, citation metadata from live page markup) — the indexer actor matches
http/https only and this probe runs on `about:` pages; its modules are packaged at
`resource:///actors/` and parse. Those are L4 arms for a session with a real page load.

## 4i. Build loop and probe runner (2026-09-20)

Not a claim about the browser — a claim about the machinery that produces the evidence
above, recorded here because two of these were costing the evidence itself.

**`update` no longer forces a rebuild.** It detached the checkout to the pin and laid the
overlay, patches and branding down again on every run, handing ~125 files a fresh mtime
whether or not their bytes had changed; mach's build backend keys off mtimes, so each
iteration bought a near-full C++ rebuild. It now writes only what differs, keeps the
checkout on the pin when it is already there, restores the patched files' mtimes when the
re-applied result is byte-identical, and stages branding through a temp directory.
**Observed on this host, nothing changed between runs: `update` 46 s, `mach build` 24 s**
(`Overlay: 120 files, 0 changed` / `Patched files: 5 unchanged (mtime kept)` /
`Branding: 0 file(s) changed`). The same no-op cycle previously took about 30 minutes.

`overlay_prune` — the new path that removes a file from the checkout after it leaves
`browser/overlay/` — was exercised deliberately rather than shipped unrun: a throwaway
overlay file was added (`Overlay: 121 files, 1 changed`, commit amended), then deleted
(`pruned browser/components/kavacha/content/kavacha-prune-probe.js`), with
`git rev-parse HEAD^` still the pin on both sides. `overlay-check` agrees and `roundtrip`
is byte-identical (sha256 `b28395b2…`, 4 patches).

**`build/marionette-ci.py`** runs every probe in one command, each on its own `mkdtemp`
profile, launching and killing the browser itself. Observed: **3/3 probes, 192 checks,
0 failures, headless** — substrate 104, Phase 7 78, restart 3 (phase 1) + 7
(phase 2) — against build `20260920093413`. No browser processes were left behind
afterwards, checked: Firefox's content processes do exit with the parent, so terminating
the parent is enough. This is also the first evidence that the probes pass **headless**,
which is how CI will run them.

Two failures worth keeping, both self-inflicted and both of a kind that reads as success:

- A build reported `EXIT=0` while having failed. The command was `... build | tail -40`,
  and `$?` after a pipeline is the *last* element's status. The build had actually died
  at `"…mozglue.dll": Access is denied` — eleven `kavacha.exe` processes left over from
  hand-driven probe runs were holding `dist/bin` open. `build`, `fast`, `package` and
  `start` now refuse up front with that count instead of failing five minutes in.
- The first version of the mtime fix snapshotted the patched files *after* the reset that
  reverts them, so it compared an unpatched file against a patched one, never matched,
  and restored nothing — while still printing a plausible-looking log. It was caught by
  checking `stat -c %Y` against the previous run's recorded values rather than by reading
  the log.

**A third false success, found by CI on 2026-09-20.** The `validate` job failed on
`shellcheck build/*.sh` with two SC2015 findings (`A && B || continue` in `cmd_update`).
Local shellcheck had reported **clean** — on **0.11.0**, while the runner image ships
**0.9.0**, and 0.9.0 reports SC2015 where 0.11.0 does not. The local gate was weaker than
the gate that counted, so "clean locally" carried no information about CI. Both lines are
now explicit `if` blocks, checked against **both** versions, the CI step prints
`shellcheck --version` so the gate's strength is visible in its own log, and
`build/README.md` says to match the version before trusting a local run.

Worth recording alongside the diagnosis: this was ranked *least* likely of three
hypotheses, on the reasoning that an older linter checks less. That reasoning is wrong —
checks are added and removed across versions, and SC2015's heuristics were narrowed after
0.9. The two hypotheses ranked above it (PEP 668 on `pip install jsonschema`, and
`apt-get install` without `apt-get update`) were both plausible and both wrong. Reading
the failing log settled it in one step; reproducing all six steps locally had settled
nothing, because every one of them passed.

## 4j. First CI run of the port (2026-09-20)

**macOS and Linux build on the Firefox ESR base.** Neither had ever been built on it; both
came back green in the first `nightly-build` run, with artifacts. That retires a real risk
the re-platform plan carried from the start.

**Windows failed, and it failed in the way that was supposed to be impossible.** After 179
minutes on `windows-latest`:

```
No rule to make target '..\..\..\third_party\libwebrtc\modules\congestion_controller\
goog_cc_scream_network_controller\goog_cc_scream_network_controller_gn\
Unified_cpp_etwork_controller_gn0.obj', needed by '../../../dist/bin/xul.dll'.  Stop.
```

That is the same failure string [ADR 0020](decisions/0020-firefox-esr-direct-overlay.md)
recorded for Zen and used as reason 2 for leaving it — reproduced here on vanilla Firefox
ESR 153 with no Zen in the tree. The ADR is amended; the diagnosis was wrong.

What has been ruled out, and how:

| Candidate | Ruled out by |
|---|---|
| The source, pin or patch series | This host builds it. Its objdir holds that directory's `backend.mk`, the rule for that object, and the compiled 167 KB `.obj` |
| CI's mozconfig (`-j3`, `--disable-debug-symbols`) | Re-ran `mach configure` locally with CI's exact options into a scratch objdir: the backend and the rule are generated correctly |

So the cause is specific to the runner environment and is **not yet diagnosed**. Candidates
still open: disk exhaustion on the runner, a backend regeneration racing `-j3`, or runner
filesystem behaviour.

**Diagnostics were added rather than a hypothesis chased** (2026-09-20). The job ended on a
single make line with no retained output, so a re-run would have been equally opaque. The
Windows leg now records disk on both drives and the size of `~/.mozbuild` and the checkout
after setup; `tee`s the build to an artifact uploaded `if: always()` on every platform; and,
on failure, reports whether that one directory has its `backend.mk`, `Makefile`, generated
`.cpp` and `.obj`, the backend coverage of the whole libwebrtc tree, whether the backend was
regenerated mid-build, any disk-full signature in the log, and `sccache --show-stats`.

**Baseline from this host, for comparison** (the same script, run against the local objdir):
`third_party/libwebrtc` has **1020 directories, 540 `backend.mk`, 540 `Makefile`, 427
`.obj`**, and the failing directory has all four of its files including the 167 KB object. A
different backend/Makefile count in CI localises the fault to backend generation; the same
counts with a missing `.obj` localises it to the compile step. The script was run here
against both a populated and an empty objdir under `bash -eo pipefail` (the runner's flags)
and exits 0 in both — a diagnostic step that fails is worse than none.

### Second Windows run — the diagnostics answered, and ruled out every hypothesis

The instrumented re-run (2026-09-21) failed at the **identical target** after 41 minutes
rather than 179, the difference being an sccache at 95.7% hits. Deterministic, not flaky.
Everything the diagnostics checked came back correct and matching this host:

| Check | CI | This host |
|---|---|---|
| `backend.mk` present and naming the object | yes | yes |
| libwebrtc dirs / `backend.mk` / `Makefile` / `.obj` | 1020 / 540 / 540 / 427 | **identical** |
| Ordering edge | `root-deps.mk` line 364: `toolkit/library/build/target` depends on that dir's `target-objects` | same file |
| Link prerequisite spelling | backslashes | **backslashes too** |
| Backend regenerated mid-build | no — only the initial `config.status` at 1:32 | — |
| Disk | D: 214 GB free, C: 15.5 GB, no disk-full signature | — |

**And the object exists.** 26,704 bytes, mtime 04:14; the build began 03:38:48 and failed at
elapsed 41:37 — 04:20. Make declared *"No rule to make target"* for a file that had been on
disk for six minutes, in a directory holding the rule for it.

So all four hypotheses are dead, including the leading one: this was never "the object was
not built". It is **make not seeing a file that exists**. The remaining explanation that fits
every observation is make's cached directory listing predating the object — timing-dependent
on `-j`, and this host builds at `-j24` while the runner is capped at `-j3` for rustc OOM,
which is why it is deterministic per environment rather than flaky.

**That is a hypothesis, not a finding.** What makes it worth acting on is that the test and
the candidate fix are the same thing: the Build step now retries once on Windows, which
re-reads the directory. If the retry goes green the mechanism is supported and Windows
builds; if it fails identically the mechanism is wrong, at a cost of minutes.

**A retry-green Windows build is a workaround, not a fix**, and must never be recorded as a
clean build. The step emits a `::warning::` saying so, and a second log artifact
(`mach-build-retry.log`) exists only on runs that needed it.

Two supporting changes: a `platform` dispatch input builds one platform at a time, because
iterating Windows cost ~3 h of macOS and Linux runner time per attempt to re-prove what
§4j already records; and `publish-nightly` is now skipped for single-platform runs, which
would otherwise move the `nightly` tag and carry the other platforms forward from an older
build — the exact shape of result this file exists to stop being read as success.

Both were verified locally before pushing: platform selection across all six inputs
(empty/all/windows/linux/macos/bogus, the last failing loudly), and the retry across all
four outcomes — including that a failed retry still fails the step rather than masking it.

### Windows — the MAX_PATH diagnosis is confirmed (2026-09-21)

**The build succeeded.** First pass, no retry, `xul.dll` linked, and `mach package` wrote
`kavacha-153.4.0.en-US.win64.zip` after running NSIS (setup.exe, UPX, the 342 MB app.7z).
The failing object had been the *only* one over the limit, `KV_OBJDIR=D:/o` removed 66
characters, and the build cleared it. Three runs of "No rule to make target" for a file
that was on disk were a path-length limit, and nothing else.

**Then my own code failed the step.** `cmd_package` ended with a cosmetic
`find … -exec ls -la {} \;` that forks once per file, and MSYS2's fork aborted:
`child_info_fork::abort: msys-iconv-2.dll: Loaded to different address`. So a *listing*
failed a package step whose real work had already succeeded — and because the later steps
are not `if: always()`, it also cost the artifact upload, the network-silence test and the
Windows Marionette run. Replaced with globs (no fork), one `ls`, and `return 0`: the
listing is now incapable of failing the verb. This repo had already recorded MSYS2 fork
failures once (`xargs` in `copy_overlay`); the lesson did not generalise the first time.

**A latent publish bug, found while testing the fix.** `dist/` holds two zips: the 130 MB
browser and a 262 KB `…win64.xpt_artifacts.zip`. Both matched the upload's `*.zip` and the
publish job's `for f in …/*.zip; do cp "$f" out/…-windows-x86_64.zip; done`, which
overwrites the same name per file — so which one shipped depended on glob order. It
happened to be correct because "xpt" sorts before "zip"; a third zip or a different version
string would have published a 262 KB file as the Windows browser, with a green run and no
warning. Now excluded explicitly at upload, and the publish step selects by name and
**fails loudly** if it ever finds more than one candidate (verified for zero, one and two).

**Re-run: build and package both succeeded; the upload step failed.** Two things were
wrong with that step, one certain and one a removal of doubt:

- **Certain, and mine:** the `path:` value is a `|` block scalar, and I had put four
  explanatory lines beginning with `#` inside it. YAML does not strip comments from a
  literal block, so they were parsed as four path patterns. (`@actions/glob` treats a
  leading `#` as a comment, so they were probably inert — but they had no business being
  patterns at all.)
- **Doubt removed:** the step globbed the distributables *in place*, which on Windows
  means an **absolute** path (`D:/o/dist/…`, since `KV_OBJDIR` moves the objdir out of the
  tree) mixed with workspace-relative ones, and left the xpt exclusion duplicated per
  platform. Rather than reason about how `upload-artifact` resolves that, a **Stage
  distributables** step now copies them into `staging/` in the workspace and the upload is
  one relative glob, `staging/*`, identical on every platform.

The staging step also moves the "which files are distributables" decision into shell that
can be run locally, and it was: against the real `dist/` it stages exactly the installer
and the 130 MB zip, excludes `xpt_artifacts.zip`, and on an empty `dist/` exits 1 with
`::error::mach package succeeded but no distributable was found`. Both the `KV_OBJDIR` and
the in-tree branch were exercised.

**This is a fix for a definite defect plus a simplification — not a diagnosis.** The
upload step's actual error text has not been read. If the cause was something else, the
next run says so.

**Windows still does NOT claim:** an uploaded artifact, network silence (R3) on this
platform, or its Marionette run. The installer **does** now exist on the development
host's `dist/` next to the zip (85 MB), which is what the staging test staged, so the
packaging path is right; CI has yet to publish one.

### Linux — L4 verified in CI (2026-09-21)

**`marionette-ci.py` on the Linux artifact: 3/3 probes, 192 checks, 0 failures**, headless,
each probe on its own fresh profile — substrate **104**, Phase 7 **78**, restart **3 + 7**
across a real relaunch, against `obj-x86_64-pc-linux-gnu/dist/bin/kavacha`. This is the
first L4 evidence for any platform other than the Windows development host, and the first
time the probes have run on a binary this machine did not build.

Two fixes from 2026-09-20 are confirmed to hold off-Windows, by name in the transcript:

- `entity parser: single-character names are KEPT` — the `parseEntities` guard first
  diagnosed on the Zen base 2026-08-27 and re-fixed here (§4h).
- `notification default restored exactly — {"before":0,"after":0}` — focus mode's park
  pref, the `-1` sentinel resolution this port chose over the 2026-08-27 one.

**Two runner artefacts, neither a product defect, both recorded rather than filtered:**

- `Sandbox: CanCreateUserNamespace() unshare(CLONE_NEWPID): EPERM` on every launch. The
  content sandbox cannot create user namespaces on a GitHub runner. The probes are
  unaffected, but **nothing about sandboxing is proven by this run** — it ran degraded.
- `RenderCompositorSWGL failed mapping default framebuffer` on every launch: headless with
  no GPU. Expected, and every rendering-dependent assertion still passed.

One error worth keeping an eye on, seen once between the restart probe's phases, at
shutdown: `PrivateBrowsingUtils.sys.mjs:50 TypeError: can't access property
"QueryInterface", aWindow.docShell is null`. It did not fail the probe — phase 2 passed
7/7 — and it is on the quit path where the docshell is already torn down. Recorded as an
observation, not a defect, because one sighting in a passing run is not a diagnosis.

### macOS — L4 verified in CI (2026-09-21)

**3/3 probes, 192 checks, 0 failures**, headless, fresh profiles, on Apple Silicon
(`obj-aarch64-apple-darwin25.6.0/dist/Kavacha.app`). Counts identical to Linux: substrate
104, Phase 7 78, restart 3 + 7. The same two re-derived fixes pass by name here as well.

Two platform differences worth having on the record, neither a defect:

- `search panel built and open :: showing` where Linux reports `open`. XUL's `showing` is
  the transitional state — macOS is still animating at the probe's 400 ms mark. The
  assertion allows exactly `open` or `showing` and nothing else, so it would still catch a
  panel that failed to open; it is not a truthy check that accepts anything.
- macOS runs with `--no-sandbox` (`MOZ_DISABLE_CONTENT_SANDBOX=1`) for the indexer actor's
  content-process paths. So, as on Linux but for a different reason, **this run proves
  nothing about sandboxing.**

**The `PrivateBrowsingUtils` error is reproducible.** Recorded as a single observation on
Linux; it appears on macOS too, at the identical point — as the browser quits between the
restart probe's two phases. Two platforms, same place, so it is deterministic rather than
noise, and it is now an open defect in REMAINING_WORK §1 rather than a footnote here. It
remains non-fatal: phase 2 passes 7/7 on both.

**Two of three platforms are L4-verified on the Firefox ESR base.** Neither claims
Windows, R8, or M4. The gate is a green three-platform run with three assets and no
carried-forward warning.

### Third Windows run — the retry is refuted, and the cause is MAX_PATH

The one-shot retry (added to test whether make's cached directory listing explained the
failure) **failed identically**, and its log refutes the mechanism outright: a *fresh* make
process entered `…/goog_cc_scream_network_controller_gn` at 0:28.93, entered
`toolkit/library` at 0:42.94, and failed at 0:43.58 on the same target. Ordering honoured,
no cache to be stale, file on disk. So make genuinely could not `stat` that path.

**It is a path-length limit, and the arithmetic has no free parameters.** When make links
`xul.dll` it names each prerequisite relative to `toolkit/library/build` with three parent
hops, and hands that to the Win32 API **without normalising the `..`** — so MAX_PATH
applies to the string as given:

| | longest path of any object | over 260? |
|---|---|---|
| Runner, default objdir | **262** | yes, by 2 |
| This host, default objdir | **256** | no, by 4 |

Measured across all 4,668 objects in a real objdir: **exactly one** exceeds the limit on
the runner's prefix, and it is precisely the object that failed; **zero** exceed it here.
Six characters of prefix are the entire difference between the two machines. It accounts
for every observation at once — the file exists (the compile step reaches it by a short
relative path from inside its own directory), the rule exists, the ordering edge exists,
and a fresh process fails the same way, because the failure is in `stat`.

**Fix:** `KV_OBJDIR`, honoured by `bootstrap.sh`'s `write_mozconfig` and `objdir()` and by
`marionette-verify.py`'s `find_binary()`. Windows CI sets `D:/o` — worst case 196, **64
characters of headroom**. An in-tree `obj-win` would have given 17, one libwebrtc directory
level from recurrence. The retry is **removed**: retrying a path that is too long fails
twice. The diagnostics now also record the runner's `LongPathsEnabled`.

**One link not verified here:** this development host has `LongPathsEnabled=1`, so a
267-character path resolves fine in a local test and the runner's classic behaviour cannot
be reproduced without a machine-wide registry change. The arithmetic and the
present-file/no-rule behaviour both point one way; the next run settles it.

Verified locally before pushing, in a sandbox that could not touch the real mozconfig:
`write_mozconfig` emits exactly one `MOZ_OBJDIR` line in both modes (default unchanged,
`D:/o` when set); `find_binary()` resolves with and without `KV_OBJDIR`; the rewritten
network-silence and diagnostics fragments resolve the objdir both ways under the runner's
`bash -eo pipefail`. Shellcheck **0.9.0** — the version CI runs — caught an SC2015 in the
new `objdir()` guard, the same class that failed CI on 2026-09-20.

**Not claimed:** any Windows CI success, R8, or M4. The gate is a green run with three
assets and no carried-forward warning. This run produced two assets, and because it was the
first nightly there was no prior Windows binary to carry forward — so the release shows
macOS and Linux with **no warning marking the gap**, which is exactly the reading error this
file exists to prevent.

**Superseded by the above:** the note that no job had completed green. `validate` passed
after the SC2015 fix, and two of three `nightly-build` legs passed. See REMAINING_WORK's M4 note.

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
- [ ] **Windows native build** — was upstream-broken at the Zen pin (libwebrtc
      rule missing when linking xul.dll). Unblocked by ADR 0020. **Observed
      locally 2026-09-19** (§4e: build, package, installer, launch, R3 pass on
      this host); checked off only when CI publishes the installer (M4).
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
python3 build/marionette-ci.py            # every probe, each on its own fresh profile
```

That is the whole gate in one command, and it is what CI runs. By hand, to drive a
single probe, launch the browser in one shell and attach from another:

```
./build/marionette-verify.py --launch     # shell 1
./build/marionette-verify.py              # shell 2
```

It speaks length-prefixed JSON over TCP to port 2828 — no third-party deps — and
reports hard facts (loaded modules, element existence, geometry) rather than
screenshots. Extend it per feature rather than eyeballing; the 0030 → 0036 saga
is the argument for that.

**A probe run is only valid from a clean profile.** Chained through one profile on
2026-09-20 the restart probe read 4/7; from clean it reads 7/7 — the earlier number
was the previous probe's leftovers, not a defect. `marionette-ci.py` launches and
kills a browser per probe against a fresh `mkdtemp` profile for exactly this reason.

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
