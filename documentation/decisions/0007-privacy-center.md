# ADR 0007 — Privacy Center: dashboard on Firefox's own blocking ledger

**Status:** Accepted · 2026-07-15

## Context

Phase 4's headline item is a Privacy Center dashboard: trackers blocked,
fingerprinters prevented, bandwidth saved. Kavacha already ships strict ETP,
Total Cookie Protection, fingerprinting protection, query stripping, GPC,
and cookie-banner auto-reject as locked defaults (ADR 0002) — the browser
is already doing the work; nothing *shows* it. Open questions: where the
surface lives, where the numbers come from, and what to do about
"bandwidth saved," which Firefox does not measure.

## Decision

**Data: read Firefox's existing ledger, collect nothing new.** Firefox
records every blocked tracker, tracking cookie, fingerprinter, cryptominer,
and social tracker into `protections.sqlite` via `TrackingDBService`
(gated by `browser.contentblocking.database.enabled`, on by default).
`PrivacyMetricsService` already aggregates today/this-week per category;
`sumAllEvents()` + `getEarliestRecordedDate()` give the all-time line. The
Privacy Center is a pure reader over this store — no new collection, no new
database, nothing leaves the device. This is the same posture as ADR 0005's
attribution: surface what the profile already knows.

**Surface: a Kavacha pane in Settings, not a new about: page.** A
`paneKavachaPrivacy` pane follows the exact recipe Zen's own panes use
(nav button in preferences.xhtml, an `.inc.xhtml` include, a module
registered in preferences.js) — one place users already visit, zero new
page registration, and the pane sits beside the controls it reports on.
`about:protections` stays reachable but is not the Kavacha surface: it is
Mozilla-styled, carries promo real estate (already pref-locked off by Zen),
and duplicating its graphs buys nothing the cards don't. A palette command
("Open Privacy Center") makes it reachable from anywhere per the
command-registry rule that every feature is a command.

**"Bandwidth saved" is an honest estimate, labeled as one.** Firefox counts
blocked events; it does not measure bytes. Real byte accounting would mean
instrumenting the request layer — disproportionate for a dashboard number.
We estimate `blocked events × 35 KB` (a conservative average tracker
payload: script + beacons + cookies round-trips) and label the figure
"estimated." If a later phase instruments real sizes, the label drops.

**Show posture, not just counts.** Counters are zero on a fresh profile and
that must not read as "doing nothing." The pane lists the active
protections (ETP strict, Total Cookie Protection, fingerprinting
protection, query stripping, GPC, cookie-banner auto-reject) read live from
their prefs, so the dashboard is informative from minute one and doubles as
verification that Kavacha's defaults survived.

**Scope: dashboard only in this brick.** The central permission manager,
the network-silence CI test, and the Brave-default search change are
separate Phase 4 bricks with their own patches; jamming them into one pane
patch would make each harder to verify and revert.

## Consequences

- Patch 0021 touches only the preferences layer + command registry; the
  data layer ships with Firefox and is already exercised by about:protections.
- Numbers depend on `browser.contentblocking.database.enabled`; if a user
  flips it off, the pane says stats are paused rather than showing zeros.
- The 35 KB heuristic is a constant in one place, documented, and the UI
  string says "estimated" — no false precision.
- Clearing statistics uses `TrackingDBService.clearAll()`, the same call
  the stock UI uses; it clears the ledger, not browsing data.
