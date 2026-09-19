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
3. **Stay rebasable on upstream.** Kavacha tracks Firefox ESR directly, pinned by commit.
   Everything Kavacha authors is an overlay file under `browser/overlay/`; a patch is only
   for a file Firefox itself tracks, kept minimal and documented (see
   [build/README.md](build/README.md)).

## Development workflow

```bash
./build/bootstrap.sh setup  # one-time: fetch Firefox at the pin, overlay, patches, branding, mach bootstrap
./build/bootstrap.sh build  # full build
./build/bootstrap.sh fast   # repackage after JS/CSS/FTL/XHTML-only changes
./build/bootstrap.sh start  # run
```

## Overlay and patch workflow

Kavacha's own files live in `browser/overlay/`, mirroring Firefox's tree
(`browser/overlay/browser/components/kavacha/…`). Edit them in the checkout, then
`./build/bootstrap.sh overlay-export` copies them back; commit the result like any file.

Changes to files Firefox tracks are ordered, numbered patches in `browser/patches/`:

```
browser/patches/0001-build-wire-kavacha-component.patch
browser/patches/0002-browser-xhtml-kavacha-include.patch
```

- One logical change per patch; a patch never creates a Kavacha-authored file.
- Each patch starts with a comment block: what it does, why an overlay/pref couldn't
  do it, and which upstream files it touches.
- Regenerate with `./build/bootstrap.sh patch-export NNNN-name`, then
  `./build/bootstrap.sh roundtrip` must pass (reverse/forward, byte-identical).

## Commit conventions

- Present tense, imperative: `Add workspace switcher shortcut`, not `Added...`
- Scope prefix when useful: `privacy:`, `ui:`, `themes:`, `build:`, `docs:`
- Reference issues: `Fixes #42`

## Architecture decisions

Significant decisions are recorded as ADRs in `documentation/decisions/`. If your change
alters an existing decision, update or supersede the ADR in the same PR.
