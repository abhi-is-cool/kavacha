# ADR 0016 — The personal knowledge graph: one stored fact, everything else derived

**Status:** Accepted · 2026-08-17

## Context

The north star promises a browser that "connects people, organizations, articles,
papers, websites, and ideas into a dynamic relationship graph" (FEATURES 6.3). By
Phase 7 Kavacha already stores four things that look like graph material: the personal
index (page text, ADR 0012), the knowledge store (notes, highlights, clips, ADR 0015),
Places attribution (which Space a page was visited in, ADR 0005), and the snapshot
history (ADR 0006).

The temptation was to build a graph database over all of it. The question worth
answering first was: **what does a graph know that none of those stores already knows?**

## Decision

**Exactly one new fact is stored: that one page led to another.**

Places records that you visited page A and page B. It records no relationship between
them. That single edge — plus "B was opened in a new tab *from* A" — is the research
trail, and it is the only thing here that cannot be derived from an existing store.
So the graph materializes two edge kinds (`followed`, `opened-from`), deduplicated
into one row carrying a weight, and nothing else.

**Everything else is derived at query time.** Notes and clips come from ADR 0015,
similar pages from term overlap over ADR 0012's text, Space membership from ADR 0005's
attribution table. Materializing those as edges would create a second copy that can
disagree with the first, and a graph that disagrees with your own notes reads as the
browser being wrong about your work.

**Deletion follows Places — the opposite of the store next door.** An edge records
*where you went*, so clearing history must clear it. A note records what you *wrote*,
so clearing history must not (ADR 0015). One SQLite file cannot carry two deletion
contracts, which is the entire reason `kavacha-graph.sqlite` is separate from
`kavacha-knowledge.sqlite`.

**No edge is ever guessed.** `opened-from` is written only when tabbrowser actually set
`owner` on the new tab. If it did not, nothing is recorded — rather than inferring from
"whatever was selected at the time". A wrong edge is worse than a missing one, because
the graph is read as a record of what happened. Leaving the web (`about:`, `file:`)
forgets the trail rather than stitching the next page onto the last one across it, and
a self-edge is a reload, not a relationship.

**Entities are an enrichment, never a dependency, and never automatic.** Asking a local
model who and what a page is about is the one part of "understands relationships" that
needs a model. It runs when the user presses the button and at no other time: patch
0079's guarantee — a fresh profile makes zero AI requests until a feature is invoked
(SHIPPING R3) — survives this ADR intact. The reply is parsed as a hostile string
exactly as patch 0081 parses tab grouping; a confused model leaves a page un-enriched
and can write nothing else.

**The view is a list, not a force-directed picture.** A spring layout over a few
thousand pages looks like understanding and answers no question. `about:knowledge`
answers the three questions people actually ask of a page — what led me here, what did
I write about it, what else is like it — and the module API carries no presentation, so
a different view can be built on the same data later.

## Consequences

- Similarity is **lexical**: it finds the paper that also says "flood mapping" and
  misses the one that says "inundation modelling". ADR 0012's optional local embeddings
  are what would close that, and this is now the first caller that would benefit — the
  strongest argument yet for building them.
- The graph grows with ordinary browsing and needs no user action, which is what makes
  it worth having by the time someone opens it. The cost is one small write per
  top-level navigation, fire-and-forget.
- `about:knowledge` is also where "delete everything" lives, because the knowledge
  store deliberately does not follow history deletion and therefore needs its own
  door.
- Nothing here syncs. When Phase 5 exists, edges are a natural candidate and notes are
  a more valuable one; both are local-only until then.

## Alternatives considered

- **A real graph database (or RDF triples) over all four stores.** More power than any
  current question needs, plus a second source of truth for facts the other stores
  already own — the disagreement problem above.
- **Recording edges from the HTTP referrer.** Cheaper, but wrong in both directions: it
  misses navigations that suppress the referrer (a great many, under modern referrer
  policy) and attributes redirects to the wrong origin.
- **Extracting entities on every page load.** It would make the graph richer without
  the user asking — and would turn a local-first browser into one that runs a model
  continuously over everything read, which is exactly the thing ADR 0013's on-demand
  rule exists to prevent.
