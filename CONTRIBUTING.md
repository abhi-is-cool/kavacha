# Contributing to Kavacha

Thanks for your interest. Kavacha is in Phase 1 (Foundation) — the surface area is small
and the conventions below keep it maintainable as it grows.

## Ground rules

1. **Never touch the engine.** No patches to Gecko rendering, SpiderMonkey, or the
   networking stack. Kavacha is an experience layer. If a change seems to require an
   engine patch, open an issue first — there is almost always a chrome-UI or prefs-level
   alternative.
2. **Privacy regressions are release blockers.** Any change that introduces a network
   request to a third party, enables telemetry, or weakens a default in
   `privacy/tracker-controls/` must be flagged in the PR description and reviewed
   explicitly.
3. **Stay rebasable on upstream.** Kavacha tracks Zen Browser, which tracks Firefox ESR.
   Prefer overlay files and prefs over invasive patches; when a patch is unavoidable,
   keep it minimal and documented (see [build/README.md](build/README.md)).

## Development workflow

```bash
./build/bootstrap.sh        # one-time setup: fetch upstream, install deps
./build/bootstrap.sh build  # full build
./build/bootstrap.sh ui     # fast rebuild for UI-only changes
./build/bootstrap.sh start  # run
```

## Patch workflow

Kavacha-specific changes to upstream files live in `browser/patches/` as ordered,
numbered patches:

```
browser/patches/0001-branding-kavacha.patch
browser/patches/0002-disable-telemetry-endpoints.patch
```

- One logical change per patch.
- Each patch starts with a comment block: what it does, why an overlay/pref couldn't
  do it, and which upstream files it touches.
- After an upstream update, patches must apply cleanly (`./build/bootstrap.sh` verifies).

## Commit conventions

- Present tense, imperative: `Add workspace switcher shortcut`, not `Added...`
- Scope prefix when useful: `privacy:`, `ui:`, `themes:`, `build:`, `docs:`
- Reference issues: `Fixes #42`

## Architecture decisions

Significant decisions are recorded as ADRs in `documentation/decisions/`. If your change
alters an existing decision, update or supersede the ADR in the same PR.
