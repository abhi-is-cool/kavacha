# Kavacha Architecture

## Three layers, one rule

Kavacha is strictly layered; the rule that keeps it maintainable is **the bottom layer
is never modified**.

| Layer | Contents | Kavacha's relationship |
|---|---|---|
| **Kavacha Experience Layer** | UI system, workspace manager, theme engine, Customization Studio, privacy dashboard, AI interface | We own and build all of it |
| **Firefox Integration Layer** | Firefox chrome UI, Extensions API, containers, preferences, profiles | We configure and extend it (prefs, branding, chrome overlays, minimal patches) |
| **Gecko Engine** | Rendering, networking, JavaScript, security | **Never modified.** Security and web compat flow in from upstream |

## How Kavacha attaches to upstream

This is an **overlay repository** — no vendored Firefox/Zen source. See
[build/README.md](../build/README.md).

```
kavacha repo ──patches/branding/prefs──▶ zen-upstream (surfer) ──▶ firefox source ──▶ binary
```

Mechanisms, in order of preference (most to least update-resilient):

1. **Prefs** — `privacy/tracker-controls/kavacha.js`, shipped as defaults
2. **Branding config** — `browser/branding/kavacha/branding.json`
3. **Chrome overlays** — CSS/JS in `ui/` and `customization/` loaded into browser chrome
4. **Patches** — `browser/patches/*.patch`, last resort, one logical change each

## Key subsystem designs

### Workspaces (`ui/workspaces/`)
Isolation is delegated to Firefox **containers** (contextual identities): one container
per workspace gives cookie/storage separation for free, without engine work. The
workspace manager owns the mapping (workspace ⇄ container ⇄ tab set ⇄ theme ⇄ search
provider) — see `workspace.schema.json`.

### Customization (`customization/`)
Everything is a document: layouts and themes are JSON (+ CSS) validated by schemas.
The Studio is a GUI over those documents; files remain hand-editable and shareable.
Theme CSS is chrome-only and token-driven (`--kavacha-*` custom properties).

### Privacy (`privacy/`)
Defaults, not features: a prefs file the user can override but never has to touch.
Dashboard counters read Firefox's per-tab content-blocking log locally.
Invariant: fresh idle profile ⇒ zero third-party telemetry/ads/experiment requests.

### Sync (`sync/`)
Untrusted-server E2E encryption: keys client-side only, server stores ciphertext blobs.
Rust client core + Rust server (PostgreSQL, Redis).

### AI (`ai/`)
Local-first via Ollama/llama.cpp; narrow auditable API to browser state; features
disappear gracefully when no model is installed.

## Decision log

Significant choices are ADRs in [decisions/](decisions/):

- [0001 — Fork Zen via an overlay repo, never touch Gecko](decisions/0001-fork-zen-overlay.md)
- [0002 — Enforce privacy through default prefs, not locks](decisions/0002-privacy-via-default-prefs.md)
- [0003 — Workspaces map to Firefox containers](decisions/0003-workspaces-on-containers.md)
