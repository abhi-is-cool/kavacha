# Kavacha Privacy Platform

Privacy is a default, not a feature. This directory holds everything that enforces that.

## Components

### `tracker-controls/`
[kavacha.js](tracker-controls/kavacha.js) — the hardened default pref set shipped with
every build: telemetry off, crash auto-submit off, studies off, sponsored content off,
strict tracking protection, Total Cookie Protection, fingerprinting protection,
speculative-connection/prefetch off, GPC on.

**Invariants** (release blockers if violated):
1. A fresh profile left idle must produce **zero** requests to telemetry, advertising,
   or experimentation endpoints. Verified by the network-silence test (planned:
   `privacy/tests/network-silence`).
2. These are *defaults*, not locks — users can override anything in `about:config`.
3. Every pref carries a comment explaining what it protects against.

### Privacy Center (Phase 4 — shipped)

All of Phase 4's privacy UI lives in one Settings pane (`paneKavachaPrivacy`), not in
this directory: patch 0021 built the pane, and patches 0047–0050 completed it. It is a
pure reader/editor over stores Firefox already keeps — nothing here collects anything.

- **Protection report** (0021) — trackers, tracking cookies, fingerprinters,
  cryptominers and social trackers, all-time / week / today, plus an *estimated*
  bandwidth figure. Counters come from `protections.sqlite` via `TrackingDBService` and
  `PrivacyMetricsService`.
- **Privacy score** (0050, FEATURES 3.2) — a count of active protections as a
  percentage, with a plain-language fix-it list and a one-click fix per item. Every
  check counts equally; weighting them would encode an undefendable opinion as
  arithmetic.
- **Central permission manager** (0048) — one dashboard over `nsIPermissionManager`:
  global default per capability, per-site exceptions, per-type and global clear.

  **Clipboard is not in it, and cannot be.** Firefox 152 does not persist clipboard
  access as a site permission — there is no `clipboard` permission type and no
  `permissions.default.clipboard`. A page that wants to read the clipboard gets a
  one-time in-content Paste confirmation and nothing is stored, so there is no grant to
  list, audit or revoke. Earlier drafts of this file listed it; that was wrong. Covered
  instead: location, camera, microphone, notifications, `xr`, `local-network`,
  `persistent-storage`, `midi`, `speaker-selection`, `autoplay-media`.
- **Site trust profiles** (0050, FEATURES 3.4) — the same data pivoted per site, so
  "what has this site talked me into" is one card, with Forget this site.
- **Session-scoped cookie rules** (0049, FEATURES 3.3) — per-site Keep / Session only /
  Block over Gecko's own `cookie` permission, plus delete-on-close. Both
  `privacy.sanitize.sanitizeOnShutdown` and
  `privacy.clearOnShutdown_v2.cookiesAndStorage` are required; setting either alone does
  nothing.

## Search defaults (Phase 4 — shipped, patch 0047)

Default engine: **Brave Search**, with DuckDuckGo, Kagi, Startpage and Google bundled and
switchable in one click from the Privacy Center.

This is wired through `configs/dumps/search-config-v2.json`, merged into the Remote
Settings dump at `npm run import` time. Upstream ships neither Brave nor Kagi, gates
Startpage behind an experiment, and sets `globalDefault` to `google` — so Zen's merger,
which could only *remove* records, gained `add` and `patch` operations. A `patch` rule
that matches nothing fails the build: the alternative is a release that quietly searches
with Google while this file claims otherwise, which is exactly what was true before 0047.

`specificDefaults` is cleared deliberately. Upstream uses it to hand whole regions and
distributions to other engines, which would override the privacy default for precisely
the users least able to notice. Neither added engine carries a `partnerCode` — Kavacha
takes no revenue share and sends no distribution identifier with your queries.
