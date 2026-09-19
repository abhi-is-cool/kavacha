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

`build/generate-branding.sh` renders a complete Firefox branding directory
(`browser/branding/kavacha/` inside the checkout, untracked) from `branding.json` and
`assets/logo.png`, using Firefox's `browser/branding/unofficial` as the template, and the
mozconfig selects it with `--with-branding=browser/branding/kavacha`. Kavacha's default
prefs (`privacy/tracker-controls/kavacha.js`, `ui/defaults/kavacha-ux.js`) are appended to
the branding's `firefox-branding.js`, which Firefox packages as application defaults.

## Asset checklist before first Nightly

- [x] App icons in all PNG sizes (rendered by the generator)
- [ ] macOS `.icns` (generated on macOS hosts) and Windows `.ico` (generated with Pillow —
      lands with the Firefox-base build tooling, port milestone M1)
- [ ] Wordmark SVG
- [ ] Installer imagery (Windows NSIS header/watermark bitmaps composed by the generator;
      macOS DMG background) — hand-made art can replace the generated fallbacks under
      `assets/`
