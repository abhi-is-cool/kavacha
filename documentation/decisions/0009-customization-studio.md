# ADR 0009 — Customization Studio (about:studio) and the safe live CSS editor

**Status:** Accepted · 2026-07-16

## Context

Phase 3 already ships the two customization *engines* — layout (patch 0022) and
theme (patch 0023), decided in [ADR 0008](0008-customization-engines.md). ADR
0008 closed by naming what it did **not** cover: "the Visual Browser Builder
(about:studio), the live CSS editor, and the marketplace — later Phase-3 bricks
that build on these engines." This ADR covers the first two (patches 0024 and
0025); the marketplace stays future.

Open questions: how to give a customization GUI a stable, typed URL and the
privilege to drive the chrome engines without modifying the Gecko engine
(MASTER_PLAN Principle 1); how the GUI reflects live state and stays in sync
when the same settings change elsewhere; and how a raw-CSS editor can be as
powerful as userChrome.css without ever being able to brick the browser.

## Decision

**about:studio is a JS `nsIAboutModule`, not a Gecko C++ redirector edit.**
Firefox's modern about-module pattern (the engine's own
`AboutNewTabRedirector.sys.mjs`) lets a `components.conf` in the Zen overlay bind
the contract `@mozilla.org/network/protocol/about;1?what=studio` to a JS class
that resolves the URL to a chrome document. No `nsAboutRedirector.cpp` change, so
Principle 1 holds. A new `src/zen/kavacha-studio/` overlay dir carries the module
(`KavachaAboutStudio.sys.mjs`), its `components.conf`, the page assets
(`studio.html/css/js` via `jar.inc.mn`), and a `moz.build` — wired through
`src/zen/moz.build` DIRS and `zen-assets.jar.inc.mn`, exactly like the
kavacha-newtab dashboard (patch 0011).

**The page is a privileged chrome UI page (`IS_SECURE_CHROME_UI`), like
about:preferences.** The module's `getURIFlags()` returns
`ALLOW_SCRIPT | IS_SECURE_CHROME_UI` and points at a `chrome://` URL, which is a
UI resource — so the channel keeps the system principal (the same reason
about:preferences runs privileged; see `nsAboutRedirector.cpp`, which only
overrides the principal for non-UI targets). `studio.js` therefore
`ChromeUtils.importESModule`s the engines and calls their **existing public
APIs** (`KavachaLayoutEngine.getLayout/setLayout`,
`KavachaThemeEngine.listThemes/resolveTheme/setActiveTheme`). Those APIs already
apply to every open window, so **the preview is the real browser** — there is no
second rendering path to keep honest.

**No separate "apply" model — the doorbell keeps the GUI in sync both ways.**
The engines persist their documents and bump a monotonic revision (layout) or
change a value pref (theme); `studio.js` observes those prefs and re-renders, so
a palette command or a hand-edited `kavacha-layout.json` updates the Studio, and
a Studio control updates everything else. This is the ADR 0008 content→chrome
doorbell used in the other direction.

**The Advanced tier is userChrome.css made safe (patch 0025).**
`KavachaUserCSS.sys.mjs` follows the same singleton + per-window +
revision-doorbell shape as the other engines and applies the user's chrome CSS
as a per-window `AUTHOR_SHEET` (the chrome-only `windowUtils` mechanism from
patches 0012/0022/0023 — it styles chrome, never web content, and never gains
script execution). Three properties make it safe to expose raw CSS:

- **Versioned.** Every save snapshots the previous text; revert is itself a save
  (so restoring is undoable). History is capped
  (`kavacha.usercss.history-max`, default 50).
- **Safe mode.** `kavacha.usercss.safe-mode` disables *all* custom CSS in one
  flip. It is exposed as the palette command "Toggle Custom CSS Safe Mode", which
  keeps working even if a bad rule has made the chrome unusable — the escape
  hatch the README promised ("a broken rule must never brick the UI").
- **Insulated editor.** The AUTHOR_SHEET is loaded on the browser *window*'s
  `windowUtils`, which styles the XUL chrome. about:studio is a tab's *content*
  document, so user CSS never restyles the editor itself — you can always get
  back in to fix a mistake.

The XUL/html `@namespace` preamble userChrome.css requires is prepended
automatically, so users write selectors, not boilerplate.

**On-disk state (profile), local-only until Phase 5 sync:**

- `kavacha-user-chrome.css` — the current custom CSS text (hand-editable).
- `kavacha-usercss-history.json` — `[{ ts: <epoch ms>, css: <string> }, …]`,
  newest first, capped.

**Accent stays the user's (unchanged from ADR 0008).** The Themes tab switches
surface packages; it never sets `--zen-primary-color` / `zen.theme.accent-color`.
The Studio points users to Settings for the accent (the welcome-flow decision,
patch 0017).

## Consequences

- about:studio is the single visible home for customization: Layout + Themes
  (no-CSS, patch 0024) and Advanced CSS (patch 0025). The `about:` registration
  is pure overlay — zero engine C++ touched.
- The Studio has no state of its own; it is a thin, privileged view over the
  three engines. Adding an engine capability surfaces in the Studio by calling
  one more public method — no new IPC or message actor.
- **Known limitation:** the Layout tab's tab-style control offers vertical /
  horizontal (what KavachaLayoutEngine supports today). The ROADMAP's "Arc-style"
  is not yet an engine capability, so it is deliberately absent rather than faked.
- **Known limitation:** custom CSS and the layout engine's generated sheets are
  independent AUTHOR_SHEETs; a user rule can override engine styling by
  specificity. That is intended (it is *their* CSS), and safe mode is the reset.
- Like 0022/0023, these patches were authored without a local build; they are
  `git apply`-verified against the post-0023 tree but not yet Marionette-verified.
  The ROADMAP entries carry that gate.
- The marketplace (install/rate/update of theme + layout + CSS packages) remains
  the next Phase-3 brick; it plugs into the same engine APIs the Studio uses.
