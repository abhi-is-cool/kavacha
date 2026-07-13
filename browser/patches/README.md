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

## Current patches

| Patch | Purpose |
|---|---|
| `0001-branding-kavacha.patch` | Register the `kavacha` brand in Zen's build config (surfer.json) |
| `0002-strip-phone-home-endpoints.patch` | Point `updateHostname` at updates.kavacha.app so installs stop pinging Zen's update server; fails closed until Kavacha update infra exists |
| `0003-workspace-search-engine.patch` | Per-workspace search engine: optional `searchProvider` on the space object, applied at the workspace-switch chokepoint, with a "Set Search Engine" submenu in the space actions menu (Phase 2 Workspace Identities) |
| `0004-workspace-extensions.patch` | Per-workspace extension set (ADR 0003 prototype): optional `extensions` allowlist on the space object, addons toggled globally at switch time; only re-enables addons Kavacha itself disabled, never overriding user global disables |
| `0005-workspace-settings.patch` | Per-workspace setting overrides — curated allowlist only (website color scheme, autoplay, notification prompts, password saving, search suggestions), applied at switch with baseline restore; "Workspace Settings" submenu |
| `0006-workspace-templates.patch` | Workspace templates: Student/Developer/Private presets in the create (+) menu; each creates a space with a dedicated container, themed gradient, search engine and settings overrides — a complete identity in one click |
| `0007-command-registry-templates.patch` | Command-registry start: template creation exposed as commands in Zen's palette ("New Space from Template: …") |
| `0008-workspace-notes.patch` | Workspace notes (MVP): autosaving notes panel per space, opened from the space actions menu or the palette; stored locally in profile `kavacha-notes.json`, never on the synced space object |
| `0009-workspace-archiving.patch` | Workspace archiving (MVP): archived spaces vanish from strip/navigation with tabs unloaded, but keep all data and stay in session store + sync; restore via "Archived Spaces" submenu |
| `0010-horizontal-tabs-experimental.patch` | EXPERIMENTAL horizontal-tabs CSS layer, opt-in via `zen.tabs.vertical=false` (zero effect at default). Toolbar merge works; tab strip height + URL bar interaction still broken — see patch header for findings |

Audit note (2026-07-09): Zen's tracked sources contain no analytics/crash SDKs.
Mozilla telemetry is already compiled out by Zen's build config; remaining automatic
Mozilla endpoints (region ping, contile, system add-on updates, Windows default-browser
agent) are disabled via prefs in `privacy/tracker-controls/kavacha.js`. Deliberately
kept: Safe Browsing, Remote Settings, extension version checks (they protect users).
Zen mods auto-update stays enabled — it only fires for user-installed mods and stale
mods are a security risk.
