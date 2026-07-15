# ADR 0005 — Per-workspace isolation: bookmarks isolate, history attributes, passwords stay global

**Status:** Accepted · 2026-07-14

## Context

Workspaces map to containers (ADR 0003), which isolate cookies and site
storage — but bookmarks, history, and saved passwords remain global across
every space. Phase 2's last design item is deciding which of the three to
scope per-workspace, and how, given that Places (the SQLite store behind
bookmarks and history) has no workspace dimension and ADR 0001 forbids
adding one to Gecko.

Audit findings that shaped this decision:

- **Zen already ships complete per-workspace bookmarks.** A
  `zen_bookmarks_workspaces` side table in places.sqlite maps bookmark GUID →
  workspace UUID, with sync change-tracking; the star-panel edit dialog has a
  Workspaces checkbox row writing through
  `PlacesUIUtils.updateBookmarkWorkspaces()`; toolbar and menus filter via
  `gZenWorkspaces.isBookmarkInAnotherWorkspace()` and rebuild on space
  switch. There is nothing to build here except convenience.
- **History has no Zen equivalent**, and hiding other spaces' history would
  be theater: the data still lives in one places.sqlite, is still queryable,
  and still syncs. As a privacy boundary it cannot deliver; as *attribution*
  (knowing which space a visit belonged to) it delivers exactly what it
  promises.
- **Passwords** scoping is a security-sensitive feature (which credentials
  are visible/autofillable per space) with real mis-scoping risk and little
  user demand. User decision 2026-07-14: keep global.

## Decision

1. **Bookmarks: adopt Zen's machinery, add auto-assignment.** The side-table
   pattern is the isolation mechanism; Kavacha adds
   `kavacha.workspaces.auto-assign-bookmarks` (default off, Settings
   checkbox): when on, a bookmark created by the user is assigned to the
   active space automatically (sync- and import-created bookmarks are never
   auto-assigned). Manual control stays in the star panel's Workspaces row.

2. **History: attribution, not isolation.** A `kavacha_history_workspaces`
   side table in places.sqlite records `(url, visit_time, workspace_uuid)`
   per top-level navigation. Attribution happens at the **tab layer** (a
   per-window tabs-progress listener reading the navigating tab's
   `zen-workspace-id`) because Places visit events carry no tab reference —
   this stays correct for background-tab loads and multi-space windows.
   Private windows, non-web schemes, same-document navigations, and
   space-less tabs (essentials) are not recorded. The UI must present this
   as organization ("visited in Job Hunt"), never as a privacy boundary.
   First surface: universal search history results carry their space badge.

3. **Passwords: global.** No per-space scoping of the login store.

## Consequences

- No Gecko changes, no schema migration of Places' own tables, and the
  side tables ride the profile like Zen's bookmark table already does.
- History attribution is best-effort by design: it reflects top-level
  navigations the listener saw, not every Places visit row (redirect hops
  and prefetches are deliberately out). That is sufficient for its
  organizational purpose and stated in the UI copy.
- Deleting a space leaves orphaned attribution rows keyed to a dead UUID;
  they are inert (no UI resolves them) and can be garbage-collected later.
- When Kavacha E2E sync (Phase 5) lands, bookmark assignments already have
  change-tracking to ride it; history attribution stays local-only until a
  deliberate decision to sync it.
