# Kavacha UI (Experience Layer)

Phase 2 deliverable: the best browser workspace experience. All components here are
chrome-level UI (XUL/HTML + CSS + JS) layered over Zen — no engine changes.

## `workspaces/` — Workspace System

Users create isolated environments (Personal, Work, School, Research). Each workspace
owns its tabs, cookies (via a dedicated Firefox container), extensions, theme, search
provider, and settings. Data model: [workspace.schema.json](workspaces/workspace.schema.json).

- Actions: create, rename, delete, switch
- Shortcut: `Ctrl/Cmd + Shift + W` cycles workspaces
- Switching a workspace swaps the visible tab set and active container; nothing is
  closed, only hidden/suspended

## `sidebar/` — Sidebar

The primary navigation surface: workspace list on top, vertical tabs below, `+` to
create. Width and position come from the layout engine
([default-layout.json](../customization/layout-engine/default-layout.json)); supports a
48 px icon-only rail.

## `tabs/` — Advanced Tab System

- **Vertical tabs by default** (horizontal remains available via layout setting)
- **Tab groups:** collapse, rename, color, drag-and-drop between groups and workspaces
- **Tab memory management:** a tab inactive for **30 minutes** has its state saved
  (scroll position, form data, session entry), is unloaded from memory, and restores
  transparently on activation. Exemptions: pinned tabs, tabs playing audio/video, tabs
  with unsubmitted form input, user-marked "keep alive" tabs.

## `command-palette/` — Command Palette

`Ctrl/Cmd + K`: fuzzy search over commands, open tabs (across workspaces), history,
bookmarks, and settings. Every UI action must be reachable from the palette — it is the
accessibility and power-user backbone, and later the surface for AI commands (Phase 6).

## `settings/` — Settings

Kavacha-native settings UI wrapping Firefox prefs plus Kavacha's own stores (layout,
themes, workspaces). Search-first, like the command palette.
