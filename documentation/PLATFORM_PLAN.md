# Kavacha Platform Plan — the Power-User Layer

*Added 2026-07-12 from the "Privacy-First Power User Browser" development plan.
This is the layer above the browser: the browser should not just display
websites — it should organize, preserve, and accelerate everything users do
online. Positioning unchanged: a personal operating system for the web.*

```
Existing privacy browser (Zen fork — done, Phase 1)
        │
Power-user platform
 ┌─────────────────────┐
 │ Workspace System    │  ← in progress (Phase 2)
 │ Command Interface   │
 │ Knowledge Layer     │
 │ Automation Engine   │
 │ Plugin Ecosystem    │
 │ Optional AI Layer   │  ← AI is an interface to the user's data, not the product
 └─────────────────────┘
```

## Status mapping

| Platform plan phase | Kavacha status |
|---|---|
| 1. Workspace OS (workspaces as persistent projects) | **In progress** — identities shipped (patches 0003–0006: search/extensions/settings/templates on Zen spaces). New sub-items adopted below: archiving, richer metadata, workspace notes, deep session state |
| 2. Universal command system (Cmd+K) | Zen ships a command palette — **inherit + extend** with a command registry (every Kavacha feature exposes commands). Roadmap Phase 3 |
| 3. Personal knowledge layer (local index) | Matches roadmap Phase 6 personal search index — scope enriched: pages, bookmarks, saved pages, PDFs, downloads, notes; SQLite FTS; optional local embeddings; local-by-default, encrypted-at-rest option, user-controlled deletion |
| 4. Automation framework (workflows, triggers, macros) | Roadmap Phase 7 — detailed here: workflow builder (trigger → actions), tab manipulation, data extraction, scheduled workflows, reusable templates |
| 5. Power-user tooling (capture, annotation, citations, REST client, JSON viewer, writing mode) | Roadmap Phase 7 — candidates for marketplace bundles ("Research Mode", "Developer dashboard") rather than core |
| 6. Deep customization + dashboards | Roadmap Phase 3 (Customization Studio, component marketplace); user-defined dashboards = layout engine + sidebar widgets |
| 7. Plugin ecosystem (SDK + permission model) | Extends roadmap Phase 3 marketplace: Kavacha SDK exposing workspaces/tabs/notes/commands/workflows behind explicit per-plugin permissions (never passwords/private data). Integration targets: Zotero, Obsidian, GitHub, Notion |
| 8. Local intelligence layer | Roadmap Phase 6 — unchanged principle: AI arrives only after the browser has meaningful context, local models first |

## Workspace OS — target model (Phase 2 extension)

A workspace is a persistent project, not a pile of tabs:

- **Contains**: tabs, pinned resources, notes, files, history slice, workflows,
  settings (identity features already shipped: container, theme, search engine,
  extensions, settings overrides, template origin)
- **Lifecycle**: create → use → **archive** (out of the strip, fully restorable) →
  restore weeks later exactly where it was (tab groups, scroll positions, page state)
- **Metadata**: name, description, created/last-active dates, associated domains
  (Zen space-routing already covers domain association), template origin

## Command registry — design sketch

Every feature registers commands in Zen's palette; organize by domain:
navigation (open workspace, search tabs/history/bookmarks), organization
(group tabs, rename/archive workspace, move tabs, save page), productivity
(create note, export markdown, run workflow, capture page), automation
(run/edit workflows). The registry is also the surface plugins extend.

## MVP (Developer Preview) scope

Per the plan, the first public version is exactly:

1. Privacy browser foundation *(done)*
2. Workspace system *(identities done; archiving + notes to go)*
3. Persistent sessions *(Zen sessionstore inherited; verify scroll/page-state depth)*
4. Command palette *(inherited; registry extension)*
5. Universal search over the local index *(basic version)*
6. Local notes attached to workspaces
7. Deep customization *(Phase 3 baseline: distinct default look + layout engine)*

Identity: **a privacy-first browser that turns the chaos of the web into
organized, persistent workspaces.**
