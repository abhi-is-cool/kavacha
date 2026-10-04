# ADR 0022 — !bang shortcuts, resolved locally

**Status:** Accepted · 2026-10-04

## Context

A bang is a prefix that routes a query straight to a site: `!w kestrel` goes to Wikipedia's
search for *kestrel*, `!gh tabbrowser` to GitHub's. DuckDuckGo popularised them and carries
roughly 13,000; Helium ships them too and makes a point that theirs are **processed
locally**.

That last part is the whole reason this belongs in Kavacha rather than being a nice
convenience. DuckDuckGo's bangs work by sending the query *to DuckDuckGo*, which reads it,
matches the bang, and replies with a redirect. The shortcut is free; the privacy is not —
every bang query is a query the search engine saw. Kavacha already refuses to let a search
engine see what it does not need to (R3, ADR 0012), so a bang that round-trips is a bang
that contradicts the product.

## Decision

1. **Resolution is local and happens before any network request.** A recognised bang is
   turned into a destination URL in the parent process and navigated to directly. No
   search engine is contacted, not even the default one, and nothing is sent anywhere
   before the user presses Enter. This is the feature; the convenience is a side effect.

2. **A curated catalog Kavacha authors, not DuckDuckGo's list.** The scrapers that
   republish DDG's 13,000 entries (`ddg-bangs`, `KobeTools/bang`, and others) are
   MIT-licensed *as code*; that licenses the scraper, not the dataset. A selection and
   arrangement of 13,000 entries is plausibly protected, and Kavacha ships public
   binaries. So the built-in set is a few dozen destinations chosen here, each a plain URL
   template anyone would write the same way. **Breadth is not the goal** — the top handful
   of bangs are the overwhelming majority of real use.

3. **User-defined bangs are first-class, and are the answer to breadth.** `!mybank`,
   `!jira`, `!internal-wiki` are more valuable to one person than 13,000 generic ones, and
   they cannot exist in a hosted service that has to know every bang in advance. They live
   in `kavacha-bangs.json` in the profile and override built-ins of the same name.

4. **Importing a third-party list is the user's act, not ours.** If someone wants DDG's or
   Kagi's full set, Kavacha can import it *at their request, fetched by them*. Kavacha
   does not redistribute it.

5. **Delivered as a urlbar provider, not a patch.** A `UrlbarProvider` returning a
   heuristic result keeps this in `browser/overlay/` with no new entry in
   `browser/patches/`, which ADR 0020 caps deliberately.

6. **Both positions parse:** `!w kestrel` and `kestrel !w`. A bang with no query goes to
   the site's search or home page rather than erroring.

## Consequences

- One more thing the default search engine never sees. This is a privacy *improvement*
  that also happens to be faster, which is a rare combination and worth saying out loud.
- The built-in catalog will look thin next to "13,000". That is a deliberate trade and
  should be stated plainly in any comparison rather than quietly padded.
- A bang only helps if its target site keeps its URL shape. Templates will rot; the
  catalog needs an occasional check, and a bang that 404s should be reported as a defect
  rather than silently navigated to — the new tab photo (VERIFICATION §4p) is the standing
  lesson about silent fallbacks.
- Nothing here is claimed until a probe drives it. A urlbar provider that registers but
  never produces a result is exactly the 0059 shape.
