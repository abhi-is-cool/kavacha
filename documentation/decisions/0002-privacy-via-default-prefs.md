# ADR 0002 — Enforce privacy through default prefs, not locks

**Status:** Accepted · 2026-07-09

## Context

"Privacy is a default, not a feature" needs a concrete mechanism. Options: locked prefs
(user cannot change), default prefs (user can override in about:config), or source
patches removing capabilities entirely.

## Decision

Primary mechanism is a **default prefs file** (`privacy/tracker-controls/kavacha.js`):
telemetry, crash auto-submit, studies/experiments, sponsored content, and speculative
connections off; strict tracking protection, Total Cookie Protection, fingerprinting
protection (FPP, not RFP), and GPC on.

- Defaults, **not locks** — a user-owned browser lets the user change anything.
- FPP rather than `resistFingerprinting` — RFP's site breakage is unacceptable as a
  default; RFP remains available as an opt-in "maximum" mode later.
- A source patch (`0002-strip-telemetry-endpoints.patch`) additionally removes upstream
  telemetry endpoints as defense in depth, so a pref regression cannot silently re-enable
  data flow.

## Consequences

- Every pref must carry a comment stating what it protects against; changes to the file
  are release blockers requiring explicit review (see CONTRIBUTING.md rule 2).
- The guarantee is testable: a fresh idle profile must produce zero third-party
  telemetry/ad/experiment requests — to be enforced by a network-silence test in CI
  (Phase 4 roadmap item).
