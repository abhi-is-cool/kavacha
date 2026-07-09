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

### `dashboard/` (Phase 4)
Protection report UI: trackers blocked today, fingerprint attempts prevented, cookies
isolated. Counters come from Firefox's content-blocking log (per-tab
`ContentBlockingLog`) aggregated locally — the dashboard itself must not phone home.

### `permissions/` (Phase 4)
Central permission manager: camera, microphone, location, notifications, clipboard —
one dashboard over Firefox's permission store (`nsIPermissionManager`) instead of
per-site digging.

## Search defaults (Phase 4)

Default engine: **Brave Search**, configured via the build's search config:

```json
{ "default": "brave" }
```

Bundled alternatives: DuckDuckGo, Kagi, Startpage, Google. The default must be
changeable in one click from settings — a privacy default should never feel like a lock-in.
