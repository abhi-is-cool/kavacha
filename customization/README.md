# Customization Engine

Kavacha's main differentiator (Phase 3): VS Code-level customization of the browser
itself. Everything here edits **browser chrome**, never web content.

## Customization Studio

A visual editor built into the browser (`about:studio`), three tiers of depth:

1. **Layout** — move/resize/hide sidebar, tabs, toolbar. Writes layout JSON
   ([layout-engine/layout.schema.json](layout-engine/layout.schema.json)); applied live.
2. **Themes** — colors, fonts, animations via pickers. Writes theme packages
   ([themes/theme-manifest.schema.json](themes/theme-manifest.schema.json)).
3. **Advanced** — raw CSS editor (`css-editor/`) with live preview, targeting chrome
   the way userChrome.css does, but sandboxed, versioned, and revertible.

Every visual edit round-trips: Studio ⇄ JSON/CSS files, so power users can edit files
directly and share them.

## `layout-engine/`

Applies a layout document to the chrome: panel placement, sizes, density, hidden
elements. [default-layout.json](layout-engine/default-layout.json) is the shipped
default (left sidebar, 250 px, horizontal tabs, compact — matching Kavacha's
horizontal default look). The runtime engine that applies this document live now
ships as `KavachaLayoutEngine` (patch 0022); the theme engine ships as
`KavachaThemeEngine` (patch 0023). The visual Studio GUI over both ships as
**`about:studio`** (patch 0024; ADR 0009) — a privileged chrome page whose
Layout and Themes tabs call those engines' public APIs, so every control updates
the live browser. Open it with the "Open Customization Studio" palette command.

## `themes/`

Theme package format:

```
theme/
├── manifest.json    (see theme-manifest.schema.json)
├── colors.json      (tokens → --kavacha-* CSS custom properties)
├── style.css        (optional chrome CSS, tokens only — no hardcoded colors)
├── icons/           (optional icon overrides)
└── fonts/           (optional bundled woff2)
```

Reference implementation: [kavacha-midnight/](themes/kavacha-midnight/), the default
dark theme.

**Marketplace (later in Phase 3):** upload, rate, install, auto-update. Submissions are
statically validated against the schemas; `style.css` is reviewed/sandboxed — theme CSS
must never gain script execution or touch web content.

## Advanced tier — live CSS editor

Ships as the **Advanced** tab of `about:studio`, backed by `KavachaUserCSS`
(patch 0025; ADR 0009). It is userChrome.css made safe: the user's chrome CSS is
applied live as a chrome-only `AUTHOR_SHEET` (never web content, never script),
every Apply snapshots the previous text to profile `kavacha-usercss-history.json`
so any change reverts, and a safe-mode pref — reachable as the "Toggle Custom CSS
Safe Mode" palette command even if the chrome is unusable — disables all custom
CSS so a broken rule can never brick the UI. The XUL `@namespace` preamble is
added for you. Syntax highlighting is a later enhancement.
