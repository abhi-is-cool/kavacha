# ADR 0019 — The tab history tree: keeping the branches Gecko truncates

**Status:** Accepted · 2026-08-17

## Context

FEATURES 7.1 asks for "branching history instead of linear". The underlying problem is
one sentence: **every browser's session history is a list with a cursor**. Go back
three pages, follow a different link, and the three pages you came from are gone —
silently truncated, with no gesture anywhere that brings them back. For anyone doing
research in a single tab, that is the most common way to lose their place, and it is a
data-model choice rather than a law of browsers.

Kavacha already has adjacent machinery — Space snapshots (ADR 0006), the personal index
(ADR 0012), the knowledge graph's `followed` edges (ADR 0016) — none of which answers
"what did this *tab* have in its forward history before I truncated it".

## Decision

**Record the tree alongside Gecko's session history; do not replace it.** Back and
Forward keep their exact meaning, because changing what Back does breaks muscle memory
every user already has. The tree is recorded in parallel and offers the abandoned
branches back.

**Jumping to a node is an ordinary navigation.** No history surgery, no `nsISHistory`
manipulation. The next location change is then classified by the same rules as any
other, so the cursor visibly lands where it should — the model stays honest because it
has no privileged path into itself.

**Classification, in order, against the node the tab sits on:**

| Observed | Meaning |
|---|---|
| same URL | reload — refresh the title, move nothing |
| the parent's URL | back — move the cursor up |
| a child's URL | forward — move the cursor down |
| anything else | a new node, parented at the cursor |

That last row is the whole feature: if the cursor had moved up first, the new node is a
**second child**, and the branch Gecko would have truncated is now a sibling.

**Trimming only ever drops leaves**, oldest first, and never the cursor or anything on
its path to the root. Dropping an interior node would orphan a whole branch — the one
thing this exists to prevent.

**Persistence rides SessionStore's `setCustomTabValue`.** Per tab, survives a restart,
dies when the tab is closed for good. A tree that outlived its tab would be a second
and worse history store; one that did not survive a restart would lose the branch
exactly when it is most wanted.

**The view is a panel, not an `about:` page**, because this is a per-tab view: an
`about:` page would have to be opened in some other tab and then reach back for the one
the user actually meant.

## Consequences

- The tree is per tab and does not merge across tabs. "Where did this page come from,
  in general" is the knowledge graph's question (ADR 0016), and answering it twice with
  two mechanisms would be a disagreement waiting to happen.
- A tab that has only ever gone forwards shows a plain list — correct, and the honest
  signal that nothing was truncated. Only rows whose parent has more than one child are
  marked, because those are the only ones ordinary Back/Forward could not reach.
- Nothing is recorded in private windows, and `about:blank` is skipped: it is the gap
  between two real pages, not a place anyone went.
- Restoring a *session* is a different feature with a different mechanism (ADR 0006's
  non-destructive branch-on-restore), and both now have a manager.

## Alternatives considered

- **Manipulating `nsISHistory` so Forward really keeps both branches.** The faithful
  version of the feature. Rejected for now: session history is deeply coupled to
  bfcache, process switching and session restore, and a bug there breaks navigation
  itself rather than a Kavacha feature.
- **Deriving the tree from Places.** Places has visits and (patchily) referrers, not
  per-tab position, so it cannot tell a second visit from a return, which is exactly
  the distinction this needs.
- **Storing trees in their own SQLite file.** Then closing a tab would either leak a
  tree forever or need its own garbage collection. `setCustomTabValue` already has
  precisely the lifetime we want.
