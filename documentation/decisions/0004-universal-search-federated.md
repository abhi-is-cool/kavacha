# ADR 0004 — Universal search starts federated, not indexed

**Status:** Accepted · 2026-07-14

## Context

Universal search is MVP item 5 (PLATFORM_PLAN.md): one query surface over
everything the user has accumulated — open tabs, history, bookmarks, workspace
notes, downloads — summoned from anywhere, distinct from URL-bar navigation.
The end-goal (ROADMAP.md north star) grows this into a local personal knowledge
graph with branching research and time travel.

The obvious build is a dedicated SQLite FTS database that everything gets
indexed into. But for the MVP's sources, local indexes already exist:

- **History + bookmarks** live in Places, which ships frecency ranking,
  incremental maintenance, and battle-tested query APIs. Duplicating them into
  our own store means sync drift, double writes, and a migration story —
  for zero retrieval gain at this scale.
- **Open tabs** are live browser state; indexing them would only add staleness.
- **Workspace notes** (patch 0008) are a small JSONFile — in-memory search is
  microseconds at any realistic size.
- **Downloads** are enumerable via the Downloads API.

The thing a dedicated index is actually FOR — full-text search over page
content, saved pages, and PDFs — is Phase 6 (personal search index) and needs
content capture infrastructure that does not exist yet.

## Decision

The MVP universal search is a **federated query layer**: one controller fans a
query out to the existing local stores (tabs live, Places for history and
bookmarks, notes JSONFile, Downloads API), merges and groups results, and
presents them in a dedicated panel. No new database.

Results are grouped by source (Tabs, Notes, Bookmarks, History, Downloads) with
per-source ranking (Places frecency for history; title/URL match quality
elsewhere). Every result row carries its workspace association where one exists
(tab's space, note's space) so the UI can badge it and later filter by it —
workspace-awareness is designed in from the start even though the MVP UI
searches globally.

When Phase 6 lands, the personal content index (SQLite FTS over page text,
saved pages, PDFs) plugs in as **one more federated source** behind the same
interface — the panel and controller do not change shape, and Places remains
authoritative for URL-level history rather than being swallowed by the new
index.

## Consequences

- Ships now with no schema-migration risk; search results can never disagree
  with the stores users see elsewhere in the browser.
- Query latency is bounded by the slowest source, so every source query gets a
  result cap and the panel renders incrementally.
- Full-text page content is out of scope until Phase 6 — universal search
  finds *things you touched* by title/URL/note text, not arbitrary words that
  appeared on pages you read. That boundary is stated in the UI copy.
- The controller interface (`source.search(query, limit) -> [{title, url,
  detail, workspaceId, action}]`) is the contract future sources (content
  index, knowledge graph) implement.
