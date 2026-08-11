# ADR 0012 — Personal search index: full-text over the pages you visited

**Status:** Accepted · 2026-08-10

## Context

Phase 6's foundation item, and the north star's spine: *"the browser indexes
everything you've chosen to keep"* so you can ask *"where did I find that
paper on flood mapping?"*. Universal search (ADR 0004) federates the live
stores — but Places stores only titles and URLs, so the one thing recall
actually runs on, **what the page said**, is searchable nowhere. Open
questions the roadmap deferred here: what gets captured, how, where it is
stored, and — for a privacy-first browser — the deletion story.

## Decision

**Scope: page text, and only page text.** The index captures the readable
text of top-level http(s) pages as you browse. Notes, bookmarks, tabs, and
downloads stay federated-live in universal search (ADR 0004) — indexing them
would only add staleness to stores that already answer in microseconds. PDFs
and downloads need content extraction and wait for a later brick; local
embeddings wait for the Ollama bridge. This index is the retrieval backbone
those will plug into.

**Capture: a JSWindowActor pair, at idle, capped.** A `KavachaIndexer`
child actor (registered for http/https only, like ZenGlance) waits ~2.5s
after DOMContentLoaded — long enough for SPA hydration, short enough to catch
short visits — then sends `document.title` + `body.innerText`, capped at
100k chars, to the parent. The parent is the policy gate: it drops private
windows, checks `kavacha.index.enabled`, reads the tab's `zen-workspace-id`
(the same tab-layer attribution as ADR 0005), and hands off to the module.
Text extraction is `innerText`, not Readability: we index for *recall*
("that page mentioned flood mapping"), not for reading view, and innerText
of the top frame is cheap, dependency-free, and good enough for FTS.

**Storage: `kavacha-index.sqlite`, one `pages` table, LIKE search — NOT
FTS.** Verification killed the first plan: mozStorage's SQLite ships with **no
full-text module at all** (fts5, fts4, and fts3 all fail to create — Firefox
strips them for attack surface, and Places itself uses frecency + LIKE, not
FTS). So one table holds url (UNIQUE), title, the page text, workspace_uuid,
and timestamps; search is `LIKE` with every term required (AND), the query
walking newest-first (indexed `visited_at`) and stopping once enough
candidates match. Ranking and `snippet()` — which bm25/FTS would have given
free — are done in JS: re-rank the candidates by term-occurrence count with
recency as the tiebreak, and build the excerpt by finding the first hit and
wrapping matches «…». Page text is capped at 32k chars (~5000 words) so the
substring scans stay bounded; the lead of a page carries the recall signal.
Revisiting a URL replaces its row (ON CONFLICT upsert) — the index answers
"where did I see this", not "every time"; per-visit history stays Places'
job. Count+age retention (`kavacha.index.max-pages` = 5000,
`kavacha.index.retention-days` = 90, GC on write) bounds the store the same
way ADR 0006 bounds snapshots.

**Deletion follows history — the index can never outlive what Places
remembers.** The module listens to Places: `history-cleared` wipes the index;
`page-removed` deletes that URL's row. So "Clear History" and "Forget About
This Site" behave exactly as a user expects, with no separate chore. On top
of that: private windows are never captured, `kavacha.index.enabled` turns
capture off (unlocked, like every Kavacha default), and the Privacy Center
gets a Personal Index control — status, the off switch, and "Clear index
now" — because a store of everything you read must be visible where privacy
is managed, not buried in about:config.

**Surface: a new universal-search source.** `search(query)` returns
bm25-ranked matches with snippets; universal search gains a "Page text"
group badged with workspace attribution like history. No new UI surface —
the index makes the existing search deeper, which is exactly how ADR 0004
said the personal index would arrive.

**Local-only, like everything else.** The file lives in the profile, nothing
leaves the device, and sync is explicitly out of scope until Phase 5's E2E
story exists. Encrypted-at-rest remains a later option; the index is no more
sensitive than places.sqlite sitting beside it.

## Consequences

- Patch 0078: `src/zen/kavacha-index/` (module + two actors), an actor
  registration in ZenActorsManager, a ZenStartup init, a universal-search
  source, a Privacy Center group, and prefs. New directory ⇒ engine symlink
  + DIRS registration (the patch-0016 lesson).
- The knowledge graph (Phase 6+) reads this store; its schema carries a
  version-ready shape (metadata separate from FTS) so columns can grow.
- Indexing volume is bounded by design: one row per URL, 100k chars, 5000
  pages, 90 days — tens of MB worst case.
