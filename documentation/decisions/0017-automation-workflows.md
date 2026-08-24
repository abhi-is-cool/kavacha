# ADR 0017 — Automation: workflows are data, never code

**Status:** Accepted · 2026-08-17

## Context

PLATFORM_PLAN.md row 4 asks for "workflow builder (trigger → actions), tab
manipulation, data extraction, scheduled workflows, reusable templates", and patch 0027
reserved an `automation` command domain for it three phases early. Kavacha already has
a plugin SDK with a permission model (ADR 0011) and a marketplace that installs
components (ADR 0010), so the shape of "user-installable behaviour" is settled.

The decision that matters is what a workflow *is*. Every automation feature in every
tool eventually faces the same fork: a scripting language, or a fixed vocabulary.

## Decision

**A workflow is a JSON document: a trigger and an ordered list of steps from a fixed
allowlist. There is no script step, no `eval`, no expression language, and there will
not be one.**

The reason is not aesthetic. A workflow file is user-editable, arrives from imports,
and will one day arrive from the marketplace. "Run this arbitrary JS with chrome
privileges" is not a feature — it is the end of the security model that ADR 0011 spent
a whole phase establishing. Once a script step exists, every workflow becomes
untrusted code, the permission model has to be rebuilt around it, and there is no way
back.

Everything else follows:

- **Validated fail-closed** against a JSON schema, at save *and again at run* — the
  file is plain JSON in the profile and can be edited in between. This is patch 0076's
  manifest-validation precedent applied to a store that *executes* rather than one that
  renders.
- **A step may only do what the user could do themselves**: open a page, switch Space,
  close duplicates, snapshot, clip, focus, run a command already in the registry.
  There is deliberately no step that reads a page and sends it anywhere, none that
  writes prefs, and none that touches passwords, cookies or permissions.
- **`open-url` is re-checked for http(s) beyond the schema.** A `javascript:` or
  `data:` URL in an automated navigation is the classic way to turn a config file back
  into code execution — the exact hole the no-script rule exists to close.
- **Recursion is impossible by construction**, not by a depth counter: `run-command`
  refuses any command a workflow registered, and the builder does not offer them.

**Guardrails are part of the design, not hardening added later.** Runs are
single-flight per workflow — a second trigger during a run is *dropped, not queued*,
because queueing turns one slow run into fifty tabs at once. Steps per workflow and
tabs per run are both capped by prefs. Nothing runs in a private window: automation is
memory acting on your behalf, and a private window promises there is none.

**Timers do not catch up.** An interval workflow runs while Kavacha is open; missed
windows are not replayed at the next launch. A scheduler that fires for the week you
were away is a different feature and would astonish anyone who closed the browser for a
holiday — so the builder says so, in the builder.

**The builder renders the engine's vocabulary.** `about:workflows` reads
`KavachaWorkflowActions` — a label and typed fields per step — and renders whatever is
there. A new step therefore appears in the UI for free, and, more importantly, the page
*cannot* offer a step the engine does not implement. That divergence is the failure
mode a hand-written form eventually ships.

## Consequences

- Adding a capability to automation means adding one entry to the allowlist and the
  matching `enum` in both copies of the schema (embedded and `automation/`). That
  friction is the point: it is a review checkpoint on the security boundary.
- Workflows are trivially shareable and inspectable — a user can read a workflow before
  running it, which is not true of any scripted alternative. That is what would make
  marketplace distribution safe later.
- Some things people will want are unreachable by design: conditionals, loops, reading
  a value off a page and using it. If those ever become necessary, they arrive as
  *named steps with parameters*, not as an expression language.
- The engine's `run()` returns a structured report (steps, skipped, reason), so the
  feature is testable without any UI — which is how it will be verified.

## Alternatives considered

- **A scripting step (JS in a sandbox).** Powerful and familiar. Rejected: a sandbox
  that is actually safe against chrome-privileged escape is a research problem, and
  ADR 0011 already notes plugin compartment isolation as an open release blocker. We
  are not adding a second, larger version of that problem.
- **Wiring workflows to the plugin SDK instead.** Plugins are code with granted
  permissions; workflows are documents a non-programmer writes in a form. Same
  registry, deliberately different trust class.
- **Cron-style persistent scheduling.** Rejected above: catching up missed windows is
  surprising, and a background scheduler in a browser that promises to be quiet when
  idle is a poor fit (see SHIPPING R3, network silence).
