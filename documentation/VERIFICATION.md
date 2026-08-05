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
