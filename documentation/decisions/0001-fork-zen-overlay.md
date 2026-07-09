# ADR 0001 — Fork Zen Browser via an overlay repo; never touch Gecko

**Status:** Accepted · 2026-07-09

## Context

Kavacha needs Zen-style UX, Firefox extension compatibility, and a small team that can
absorb upstream security updates indefinitely. Full forks of Firefox that vendor the
source tree (à la early forks) historically drown in merge debt.

## Decision

1. Base Kavacha on **Zen Browser** (itself Firefox-based, MPL-2.0, built with the
   `surfer` toolchain), not raw Firefox — Zen already delivers vertical tabs, compact
   UX, and a maintained Firefox-tracking pipeline (Firefox 152.x at time of writing).
2. Structure Kavacha as an **overlay repository**: upstream is cloned by
   `build/bootstrap.sh` into a gitignored directory; Kavacha applies ordered patches,
   branding config, prefs, and chrome overlays on top. No Firefox/Zen source is
   committed here.
3. **Gecko is never modified** — no patches to rendering, SpiderMonkey, or networking.
   Anything that seems to need one gets redesigned at the chrome/prefs layer.

## Consequences

- Upstream updates are `bootstrap.sh update` + patch-conflict fixes, not tree merges.
- Security fixes arrive by tracking Zen/Firefox releases; we can never skip them.
- We inherit a dependency on Zen's release cadence; if Zen stalls, the fallback is
  re-pointing the overlay at Firefox ESR directly (the patch/pref/overlay mechanisms
  are upstream-agnostic by design).
- CI verifies every patch still applies cleanly on each push.
