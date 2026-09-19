# Kavacha Automation

The workflow layer: **a trigger and a list of steps**. Shipped in ROADMAP Phase 7
(patch `0085`, ADR [0017](../documentation/decisions/0017-automation-workflows.md)),
built on the `automation` command domain that patch 0027 reserved for it three phases
earlier.

## The one rule

**A workflow is data, never code.** There is no script step, no `eval`, no expression
language, and there will not be one. A workflow file is user-editable JSON that also
arrives from imports and, later, from the marketplace — "run this arbitrary JS with
chrome privileges" is not a feature, it is the end of the security model.

Everything follows from that:

- Every step is one entry from a **fixed allowlist** with typed parameters
  ([workflow.schema.json](workflow.schema.json)).
- Documents are validated **fail-closed** — at save *and* again at run, because the
  file is plain JSON in the profile and can be edited in between.
- A step may only do what the user could do themselves: open a page, switch Space,
  close duplicates, snapshot, clip, focus, run a command already in the registry.
  There is deliberately **no** step that reads a page and sends it anywhere, writes
  prefs, or touches passwords, cookies or permissions — the ADR 0011 SDK boundary,
  held in a second place because this is the second surface that could break it.

## Guardrails

| Guardrail | Why |
|---|---|
| `run-command` refuses workflow-registered commands | Recursion becomes impossible by construction, not by a depth counter |
| Single-flight per workflow | A second trigger during a run is **dropped, not queued** — queueing turns a slow run into fifty tabs at once |
| `kavacha.workflows.max-actions` (25) | A bounded document, so an imported one is readable before it is trusted |
| `kavacha.workflows.max-tabs-per-run` (10) | The blast radius of a mistake is ten tabs, not the whole session |
| Interval floor of 15 minutes | A one-minute timer is a busy loop wearing a schedule |
| Never in a private window | Automation is memory acting on your behalf; a private window promises there is none |

## Triggers

- **manual** — a palette command (`Run: <name>`), registered at runtime with a
  `rawLabel` because a runtime command cannot add a Fluent key.
- **startup** — once per session, after the first window settles, so it never
  competes with session restore.
- **space-switch** — when a named Space becomes active, hooked at the same
  `changeWorkspace` chokepoint the snapshot substrate uses, fire-and-forget so a
  workflow can never make a Space switch wait.
- **interval** — a timer while the browser is open. **Missed windows are not caught
  up.** A scheduler that fires for the week you were away is a different feature and
  would surprise anyone who closed the browser for a holiday.

## Where things live

| Thing | Path |
|---|---|
| Engine | `browser/overlay/browser/components/kavacha/modules/KavachaWorkflows.sys.mjs` (Zen-era path: `patches-zen/` 0085) |
| Builder (`about:workflows`) | `browser/overlay/browser/components/kavacha/content/workflows/` (Zen-era path: `patches-zen/` 0085) |
| Documents | profile `kavacha-workflows.json` |
| Schema (design artifact) | [workflow.schema.json](workflow.schema.json) |

The engine carries an **embedded copy** of the schema, because sideloaded and imported
documents are not packaged with this repo file. The two must stay in sync — the same
arrangement patch 0076 made for component and theme manifests, and for the same reason.

## Adding an action

Add one entry to `KavachaWorkflowActions` in the engine (label + typed fields) and the
matching `enum` entry in both copies of the schema. The builder renders whatever the
engine declares, so it cannot offer a step the engine does not implement — the failure
mode a hand-written form eventually ships.
