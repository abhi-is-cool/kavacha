# ADR 0021 — Kavacha owns the workspaces model

**Status:** Accepted · 2026-09-19 · Supersedes the verdict of
[ZEN-SPACES-AUDIT.md](../ZEN-SPACES-AUDIT.md) ("adopt Zen's space object and extend it") and
**decision 1 of [ADR 0005](0005-workspace-isolation.md)** (bookmarks via Zen's side table).
[ADR 0003](0003-workspaces-on-containers.md) (isolation on Firefox containers, opt-in since
patch 0038) and ADR 0005 decisions 2–3 (history *attributes*, passwords stay global) stand.

## Context

Under Zen, a Kavacha workspace was Zen's space object with seven Kavacha fields written onto it
(`settings`, `description`, `extensions`, `searchProvider`, `archived`, `template`,
`parentSpaceId`), persisted through `gZenWorkspaces.saveWorkspace()` into
`zen-sessions.jsonlz4`, and switched at Zen's `#performWorkspaceChange()` chokepoint. 34 patches
call `gZenWorkspaces` through 21 distinct members. Firefox has no native workspaces
([ADR 0020](0020-firefox-esr-direct-overlay.md)), so the model has to be Kavacha's.

The schema for that model already exists and predates the Zen dependency:
[`ui/workspaces/workspace.schema.json`](../../ui/workspaces/workspace.schema.json).

## Decision

1. **Record.** A space is the `workspace.schema.json` object plus `order`, `description` and
   `parentSpaceId` (branching, ADR 0006). Notes stay in `kavacha-notes.json`.
2. **Store.** `kavacha-workspaces.json` in the profile via `JSONFile`
   (`{version: 1, spaces: [...]}`); `saveWorkspace()` is upsert + `saveSoon()`. No migration
   from `zen-sessions.jsonlz4` — there are no users to migrate.
3. **Tab membership** is a `SessionStore` custom tab value, `kavachaSpaceId`, mirrored to a
   `kavacha-space-id` attribute for CSS; the active space per window is a custom window value.
   Both survive restart natively. A restored tab with no value joins the first space — a tab is
   never orphaned.
4. **Switching** hides and shows tabs with `gBrowser.hideTab(tab, "kavacha")` /
   `gBrowser.showTab(tab)`, serialized through one promise. That promise is the chokepoint where
   per-space search engine (0003), extension set (0004) and settings overrides (0005) hook,
   exactly as they hooked Zen's. **Pinned tabs are global across spaces** — `hideTab` refuses
   pinned tabs, and that is the behaviour Zen's "essentials" gave us; it is now a property of
   the model rather than a feature.
5. **Containers** follow ADR 0003 as amended by 0038: a space may carry a `containerId`; when
   isolation is on, fresh tabs in that space open with its `userContextId`.
6. **Compatibility facade.** `window.gKavachaWorkspaces` exposes exactly the 21 members the
   ported code uses, with Zen's names and signatures, so the workspace cluster ports by rename
   and review rather than by rewrite.
7. **Per-space bookmarks are deferred.** They were Zen's table and Zen's Places UI filtering
   (the only thing Kavacha *adopted* rather than built); the schema default is
   `isolation.bookmarks: false`; no user has them. The `kavacha.workspaces.auto-assign-bookmarks`
   pref and Settings checkbox are removed until a Kavacha side table exists.
8. **History attribution stays** (ADR 0005 decision 2), keyed by `kavacha-space-id` in
   Kavacha's own `kavacha_history_workspaces` side table.

## Consequences

- One JSON store owned by Kavacha replaces a dependency on Zen's session file; Phase 5 sync
  gets a single, schema-validated document to encrypt.
- Hidden tabs are excluded from the tab strip, Ctrl+Tab and `visibleTabs` by Firefox itself;
  the model does no DOM rebuilding on switch. The substrate probe measures a switch at 200 tabs.
- Losing per-space bookmarks is a real regression against the Zen build and is recorded as such
  in `REMAINING_WORK.md`; it is a feature to build, not a blocker.
- `ZEN-SPACES-AUDIT.md` remains as the historical record of *why* the fields are what they are.
