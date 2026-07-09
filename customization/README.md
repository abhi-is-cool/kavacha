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
default (left sidebar, 250 px, vertical tabs, compact).

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

## `css-editor/`

In-browser editor for the Advanced tier: syntax highlighting, live apply, per-change
history so any customization can be reverted. A broken rule must never brick the UI —
the editor keeps a safe-mode toggle that disables all custom CSS.
