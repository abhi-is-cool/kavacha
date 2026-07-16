# ADR 0008 — Customization engines: applying layout & theme documents live

**Status:** Accepted · 2026-07-15

## Context

Phase 3 ships two engines that turn Kavacha's already-shipped customization
*documents* into live, swappable customization: the layout engine
(`customization/layout-engine/`) and the theme engine (`customization/themes/`).
Until now those documents were inert — the only theming that reached the browser
was patch 0016, which bakes Kavacha Midnight into `zen-theme.css` at build time.
Open questions: how a runtime engine overrides build-time chrome CSS without
touching web content, how it coexists with 0016, how "live" application works,
and how themes relate to the user-owned accent.

## Decision

**Reuse the per-window author-sheet mechanism already in the tree, not
`nsIStyleSheetService`.** Patch 0012 already injects chrome-only CSS via
`window.windowUtils.loadSheetUsingURIString(uri, AUTHOR_SHEET)` — one chrome
document, no web-content leakage, no `@-moz-document` (which is unreliable for
service-registered author sheets). Both engines use this for generated sheets,
and the theme engine sets color tokens as inline `!important` custom properties
on each window's `documentElement`. A process singleton `init()` installs pref
observers; a per-window `applyToWindow()` runs from `ZenStartup`;
`applyToAllWindows()` re-applies on change — the KavachaTabMemory (singleton) +
KavachaUniversalSearch (per-window) pattern.

**Keep patch 0016 as the baked floor and derivation bridge.** 0016 sets
`--zen-branding-dark: var(--kavacha-surface)`, from which Zen's whole color-mix
chain derives. The theme engine reuses that bridge: to switch themes it
overrides only the base `--kavacha-*` tokens and Zen re-tints. When the active
theme is the default `kavacha-midnight`, the engine registers nothing and lets
0016's build-time floor show — zero flash for the default look. Only non-default
themes get runtime overrides. This keeps one derivation path and avoids a
startup flash for the overwhelmingly common case.

**Themes tint surfaces; the accent stays the user's.** The engine never writes
`--zen-primary-color` or `zen.theme.accent-color` — the accent is chosen in the
welcome flow (patch 0017, the "no default accent" decision). A theme's accent
tokens land only as inert `--kavacha-accent*` custom properties.

**Live application via a singleton + per-window apply + a revision doorbell.**
The layout engine persists `kavacha-layout.json` and bumps a monotonic
`kavacha.layout.revision` pref; its observer re-applies to every window, and a
content page (the future about:studio) can bump the same pref since it cannot
call the chrome singleton directly. Hand-edits are picked up by a "Reload Layout
from File" palette command. Tab orientation is delegated to the existing
`zen.tabs.vertical` pref (Zen + patch 0010 already react live) rather than moving
DOM.

**Built-in themes are embedded; user themes load from the profile.** Built-in
packages (kavacha-midnight, kavacha-forest) are embedded token maps in the
engine, mirroring how 0016 embeds midnight's colors.json — no jar round-trip, no
startup async fetch. User / marketplace packages load from the profile
`kavacha-themes/<id>/` directory (manifest + colors + optional style.css)
through the same apply path, so the "loads theme packages" capability is real
for the extensible case.

## Consequences

- Patches 0022 (layout) and 0023 (theme) touch only chrome modules + the command
  registry + a gated CSS include; the default out-of-box look is unchanged
  because the CSS layer is inert at defaults and Midnight stays the baked floor.
- **Known limitation:** overriding base `--kavacha-*` tokens fills only the dark
  half of `light-dark()`, so both bundled themes are dark. Light themes need the
  engine to emit its own light surfaces — a follow-up.
- `hiddenElements` / `componentSizes` selectors are user input, so they are
  `CSS.escape`'d and (for sizes) resolved through a component→property registry
  before composing chrome CSS.
- These patches were authored without a local Zen checkout, so they are not yet
  build- or Marionette-verified; the ROADMAP entries record that gate.
- The snapshots this doesn't cover — the Visual Browser Builder (about:studio),
  the live CSS editor, and the marketplace — are later Phase-3 bricks that build
  on these engines.
