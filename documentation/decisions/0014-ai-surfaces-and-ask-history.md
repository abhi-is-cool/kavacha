# ADR 0014 — AI surfaces: the sidebar, retrieval-augmented history, and the tab assistant

**Status:** Accepted · 2026-08-15

## Context

ADR 0012 gave Kavacha a local index of the text of pages the user visited, and
ADR 0013 gave it a narrow bridge to a local language model. Phase 6's remaining
three items — page summarization in a sidebar, natural-language history search,
and a tab assistant — are what those two engines are *for*. The open questions
were where AI output belongs in the UI, how a natural-language question is
supposed to reach a LIKE-based index, and how much of a "tab assistant" should
depend on a model at all.

## Decision

**One sidebar, not a panel per feature.** Patch 0079 shipped summarization into
an arrow panel and that was the wrong surface: a summary is read *while*
browsing, and an arrow panel dismisses on the first click into the page it
just summarized, cannot be resized, and has nowhere to put a source list. The
Kavacha AI sidebar hosts both summarize and ask, because they are the same
question — "what is this?" and "where did I see this?" — asked of the same two
engines. The 0079 panel is kept for the tab assistant's one-sentence reports,
where dismiss-on-click is correct.

**The sidebar registers at runtime, through Firefox's own entry point.**
Firefox declares its sidebars in a literal `Map` inside
`browser/components/sidebar/browser-sidebar.js` — a file Zen already patches.
`SidebarController.registerPrefSidebar(pref, id, config)` is the same call
Firefox uses for its own pref-gated sidebars (chat, page assist, passwords),
and it appends to the map that is already built. Calling it once per window
from `ZenStartup` produces exactly the entry the declarative form would and
touches no upstream file, so a Firefox uplift that reshuffles that Map costs
Kavacha nothing. The classic sidebar's `<browser>` is non-remote, so the page
is chrome-privileged and calls the engines directly.

**Natural-language search is a RETRIEVAL layer, not a prompt.** This is the
substantive decision. The index matches with LIKE and ANDs every term, because
mozStorage ships no FTS5 (ADR 0012). Handed "where did I read about flood
mapping in Kerala?" it searches for a single page containing *where* AND *did*
AND *read* AND … and returns nothing, every time. No prompt fixes that. So
`KavachaAskHistory` does four things before the model is involved:

1. **Reduce the question to content terms** — stopwords carry no signal but do
   carry the AND that kills the query. Quoted phrases survive as single terms.
2. **Try AND first, relax to OR when thin.** A precise multi-word hit is the
   best evidence there is; when there are fewer than three, add pages carrying
   *any* term, ranked by how many distinct terms each holds.
3. **Add Places title/URL hits.** A page visited before the index existed, or
   while it was switched off, still answers "where did I see it".
4. **Hand the model numbered passages and require `[n]` citations.**

`exact` (how many pages carried every term) and `relaxed` (whether partial
matches were added) are reported separately, because collapsing them puts a
false sentence on screen the moment one strong hit arrives alongside weak ones.

**Degradation is a first-class outcome, not an error path.** No model, model
switched off, endpoint unreachable, or candidates with no captured text all
return the ranked source list with a plain sentence saying why. The question
simply becomes a search. Retrieval never needed the model; only the prose did.
For the same reason, summarization captures page text on demand through the
indexer actor rather than reading the stored copy: summarizing what you are
looking at must not require having *stored* it, so it works with the index off.

**Most of the tab assistant deliberately does not use AI.** "Close duplicate
tabs" is a set operation over normalized URLs; "save this research session" is
a snapshot. Making either depend on a local model would dress deterministic
work up as AI and break it for everyone without one. Only topic grouping needs
a model, because naming what a set of pages is *about* is the part no algorithm
does — and it is the only one that ever says "no local model found".

**Model output is untrusted input, twice over.** It is rendered by a
chrome-privileged document, so it reaches the screen only through
`KavachaMarkdown` (patch 0052), which builds DOM nodes and never parses HTML,
or through `textContent`; an `innerHTML` here would be script execution with
system privileges. And it is never trusted as control flow: the grouping
parser validates every tab index against the real tab list and drops what does
not check out, so a confused model can produce a bad grouping but cannot close,
move, or lose a tab. Deciding and destroying are separated — `planDuplicates()`
reports what would close and changes nothing.

## Consequences

- Patch 0080: `KavachaAISidebar` + the `chrome://browser/content/kavacha-ai/`
  page, `KavachaAskHistory`, `KavachaPersonalIndex.searchTerms()`, an on-demand
  Capture query on the indexer actor, and the repointed summarize command.
- Patch 0081: `KavachaTabAssistant`, three palette commands, and `label` /
  `force` on `KavachaSpaceHistory` so a saved session is named and survives
  retention — count-and-age retention deleting something the user named would
  be data loss on a feature whose promise is "keep this".
- Verified against the built browser with a mock Ollama: sidebar registration
  and load, summarization of real captured page text, retrieval and relaxation,
  cited answers whose citations open their source, all four degradation paths,
  duplicate planning and closing (pinned tabs untouched, cancel a no-op,
  idempotent), grouping from a fenced-JSON reply, and grouping refusing to act
  on five shapes of bad reply. See VERIFICATION.md §4c.
- The bridge stays the only path to a model, so the ADR 0013 endpoint guarantee
  covers all three features unchanged: page text, questions and tab titles
  reach `kavacha.ai.endpoint` or nowhere.
- Not done here, and deliberately: no embeddings and no encrypted-at-rest index
  (ADR 0012 follow-ups), no streaming responses, and no AI memory of past
  conversations (FEATURES 5.2 — an opt-in feature with its own store, not a
  side effect of these).
