# Kavacha Patches

Ordered patches applied on top of upstream Zen Browser by `build/bootstrap.sh`.

Naming: `NNNN-short-kebab-name.patch`, applied in numeric order.

**Patches are a last resort.** Prefer, in order:

1. Prefs (`privacy/tracker-controls/kavacha.js`) — survive every upstream update
2. Branding config (`browser/branding/`)
3. Chrome CSS/JS overlays (`ui/`, `customization/`)
4. A patch — only when the change cannot be expressed any other way

Every patch must begin with a header comment stating what it does, why an
overlay/pref could not do it, and which upstream files it touches.

## Planned Phase 1 patches

| Patch | Purpose |
|---|---|
| `0001-branding-kavacha.patch` | Register the `kavacha` brand in Zen's build config |
| `0002-strip-telemetry-endpoints.patch` | Remove telemetry/crash-report submission URLs at the source (defense in depth on top of prefs) |
