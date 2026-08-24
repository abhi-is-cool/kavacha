# Phase 7 logic tests

Exercises the **real** Phase 7 modules (patches 0082–0087) in Node, with Gecko's
globals stubbed. Same technique used to reproduce and re-verify defect D8 in
`KavachaUserCSS`.

```bash
node test/phase7-logic/phase7_logic_test.mjs
```

Exit `0` = all checks pass. No build required, no browser, no network.

## What it covers, and what it deliberately does not

It covers the parts of Phase 7 that are **pure logic** — the parts where a bug is a
wrong answer rather than a missing wire:

| Module | Checked |
|---|---|
| `KavachaCitations` | APA leading with the title when there is no author (the rule people get wrong by hand), `n.d.` for undated pages, MLA quoting, BibTeX escaping `&`/`%` and keying on host+year |
| `KavachaKnowledgeGraph` | `parseEntities` against prose-wrapped, fenced, malformed, non-array, unnamed, duplicate, over-long and refusal replies; `topTerms` ignoring stopwords |
| `KavachaKnowledge` | `keyFor` dropping the fragment, keeping the query, refusing `about:`/`file:`/junk |
| `KavachaTabHistory` | the classifier: reload, one-step back, **multi-step back**, forward, and the case the feature exists for — back-then-elsewhere produces a **sibling**, not a truncation |
| `KavachaWorkflows` | the non-schema half of validation: `javascript:`/`data:`/`about:` URLs refused, step cap, interval floor, Space trigger without a Space, and that the action allowlist matches `automation/workflow.schema.json`'s enum exactly |

It does **not** cover: anything that touches SQLite, the command registry, chrome UI,
the actor, or a real navigation. Those need the browser and live in
`build/marionette-phase7.py`. **Passing here is not L4 verification** — see
[VERIFICATION.md](../../documentation/VERIFICATION.md) §4d, and remember the 0059
saga: every static gate passed on four settings panes that had never once executed.

## Why it earns its place

Two of its checks were written before the code was verified and immediately found
real problems:

- The tab-tree classifier only recognised a **one-step** back, so using the Back
  button's dropdown (a jump of several entries) created a duplicate node instead of
  moving the cursor. Fixed by walking the whole ancestor chain.
- The schema/allowlist cross-check exists because the workflow schema is deliberately
  duplicated — embedded in the engine and kept in `automation/` — and the two drifting
  apart is a silent failure that fails closed on the user's real workflows.
