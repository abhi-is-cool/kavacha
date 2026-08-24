# ADR 0015 — Knowledge capture: notes, highlights and clips, and why they do not follow history

**Status:** Accepted · 2026-08-17

## Context

Phase 6 gave Kavacha a memory of what the user *read*: the personal index (ADR 0012)
captures the readable text of visited pages, and the AI surfaces (ADR 0014) answer
questions over it. Nothing recorded what the user *thought*. FEATURES 6.1 (per-page
notes and annotations) and 6.2 (the web clipper) are the first Phase 7 items, and they
are also the raw material the knowledge graph (ADR 0016) reads.

The open questions were: what the storage lifetime should be relative to browsing
history, whether this belongs in the AI sidebar, and how far "offline" should go.

## Decision

**A separate store with the opposite deletion contract.** The personal index follows
Places — "Clear History" wipes it, "Forget About This Site" drops that URL — because
the index is a derived cache of pages the browser happened to see. Nothing in the
knowledge store is derived. A note is a document the user authored; a clip is
something they deliberately kept. **Clearing history must not destroy either.** A
browser that eats your notes when you clear your history has confused which of the two
was precious.

Two consequences, stated rather than discovered:

1. This is the only Kavacha store that can outlive history, so it can surface a page
   the user believed they had erased. Per-item deletion, "forget this page", a
   Delete-everything control in `about:knowledge`, and a one-call JSON export are
   therefore all part of the first version, not follow-ups.
2. One SQLite file cannot carry two deletion contracts, which is why the graph's edges
   (ADR 0016) live in their own file rather than as two more tables here.

**Three kinds, one table.**

| Kind | Cardinality | Meaning |
|---|---|---|
| `note` | at most one per URL, enforced by a partial UNIQUE index | free text; **empty deletes it**, so clearing the box *is* the delete gesture |
| `highlight` | many | a selected passage plus an optional comment — FEATURES 6.1's annotation |
| `clip` | many | the readable text of the whole page at the moment it was saved |

One-note-per-page is enforced by the *database*, not by read-then-write in JS: two
windows on the same page would both find "no note" and both insert one.

**URL normalization is product behaviour, not a detail.** The fragment is dropped, so a
note taken at `#section-3` is the page's note when you return to the top. The query
string is kept, because `?v=…` is usually a different document. Non-http(s) URLs are
refused everywhere, which is how `about:`, `file:` and `chrome:` stay out.

**A separate sidebar from the AI sidebar.** Folding notes into the ADR 0014 surface was
cheaper and wrong: that sidebar is gated on `kavacha.ai.enabled`, and writing a note
must not require a model — or any model. Two surfaces because they have two
dependencies. Both register through `SidebarController.registerPrefSidebar`, so neither
edits an upstream file.

**Offline means the text, not the page.** A clip preserves what the page *said*; it is
not a byte-for-byte archive. Full-fidelity archiving means fetching and rewriting
subresources, which is a different feature with a different threat model (it re-fetches
from the network on the user's behalf, at a time they did not choose, and stores
third-party bytes). The saved copy is rendered from the store, so it works with the
site gone and with the network gone — which is what "offline mode" was for.

## Consequences

- Notes, highlights and clips are searchable through universal search as two new
  groups (`pagenotes`, `clips`), never deduplicated against the page they annotate —
  dropping a note because its page is already in the results loses the only result
  that was not just a URL.
- The clipper reads page content through the **existing** `KavachaIndexer` actor
  (one added query, `CaptureSelection`), so the policy that content is only ever read
  from an http/https top frame is stated in one place and cannot drift.
- Everything renders through `textContent` or `KavachaMarkdown`. The sidebar is chrome:
  an `innerHTML` on clipped page text would be script execution with system privileges.
- The store is one call away from a full JSON export, which makes FEATURES 9.2
  ("Export My Digital Life") true of this data phases before Phase 5 exists.

## Alternatives considered

- **Notes on the Space object** — rejected for the same reason patch 0008 rejected it:
  it bloats the session file and rides Mozilla-account sync.
- **Notes in the personal index** — one store, one lifetime, and the wrong one: the
  index is wiped by an action ("clear history") that must never touch notes.
- **Highlights anchored to DOM ranges**, so they re-render on the live page — real
  annotation software does this and it is the correct long-term shape. It needs a
  robust anchoring scheme that survives page changes, plus content-script rendering on
  every visit. Deferred; the quote plus its comment is the durable part, and it is what
  survives the page being rewritten anyway.
