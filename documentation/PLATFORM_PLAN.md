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
| 3. Personal knowledge layer (local index) | Roadmap Phase 6 personal search index (patch 0078) **plus** the Phase 7 layer above it: notes/highlights/clips (0082, ADR 0015) and the knowledge graph (0083, ADR 0016). Note two corrections to this row: mozStorage ships no SQLite FTS, so retrieval is LIKE plus JS ranking; and bookmarks, PDFs and downloads are still uncaptured. Optional embeddings and encryption-at-rest remain open |
| 4. Automation framework (workflows, triggers, macros) | **Shipped 2026-08-17** (patch 0085, ADR 0017): `about:workflows` — trigger → steps, with the governing decision that a workflow is DATA and never code. Data extraction is deliberately absent: reading a value off a page and using it needs an expression language, which is the thing the ADR rules out |
| 5. Power-user tooling (capture, annotation, citations, REST client, JSON viewer, writing mode) | **Mostly shipped 2026-08-17** (patch 0087). Capture = Firefox Screenshots, JSON viewer = Firefox's own (both already in the build), annotation = patch 0082; citations and writing mode built here. The **REST client** remains the genuine marketplace-bundle candidate this row was about |
| 6. Deep customization + dashboards | Roadmap Phase 3 (Customization Studio, component marketplace); user-defined dashboards = layout engine + sidebar widgets |
| 7. Plugin ecosystem (SDK + permission model) | Extends roadmap Phase 3 marketplace: Kavacha SDK exposing workspaces/tabs/notes/commands/workflows behind explicit per-plugin permissions (never passwords/private data). Integration targets: Zotero, Obsidian, GitHub, Notion |
| 8. Local intelligence layer | Roadmap Phase 6 — unchanged principle: AI arrives only after the browser has meaningful context, local models first |

**"Shipped 2026-08-17" in rows 3, 4 and 5 is now backed by a run.** Patches 0082–0087
were built and L4-verified 2026-08-27 (`build/marionette-phase7.py` 75/75, three
run-only defects fixed), and re-verified on the Firefox ESR base 2026-09-20 (78/78);
see [VERIFICATION.md](VERIFICATION.md) §4d (Zen) and §4h (Firefox ESR).

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
