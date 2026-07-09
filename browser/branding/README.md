# Kavacha Branding

Everything that makes the build *Kavacha* instead of Zen/Firefox.

[kavacha/branding.json](kavacha/branding.json) is the single source of truth for the
application name, app ID, binary name, brand colors, and default URLs. Branding patches
and build config read from it — never hardcode brand strings elsewhere.

## What branding replacement covers (Phase 1)

- Application name (`Kavacha` / `Kavacha Nightly` for pre-release channels)
- Logos, icons (all required Firefox sizes: 16–256 px PNG, `.icns`, `.ico`), splash
- About page (`about:kavacha`)
- Default URLs: homepage, support, release notes, privacy policy
- **Removal** of upstream default endpoints: telemetry, crash-report submission,
  sponsored content, Pocket (`removedUpstreamUrls` — `null` means "must not exist")

## Where it plugs in

Zen's build system exposes branding via its `configs/` + `surfer.json` brand entries.
The Kavacha branding patch (`browser/patches/0001-branding-kavacha.patch`, to be
generated) adds a `kavacha` brand alongside Zen's existing brands and points the build
at it.

## Asset checklist before first Nightly

- [ ] App icons in all sizes listed in `branding.json → assets.icons`
- [ ] macOS `.icns` and Windows `.ico`
- [ ] Wordmark SVG
- [ ] Installer imagery (Windows NSIS sidebar, macOS DMG background)
