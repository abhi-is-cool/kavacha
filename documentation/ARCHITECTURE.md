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
A workspace can optionally sit on a Firefox **container** (contextual identity) for
cookie/storage separation, but this is **off by default** (patch 0038,
`kavacha.workspaces.isolate-containers`): superseding ADR 0003's original
one-container-per-workspace design, ordinary spaces share the default container so
tabs move between them freely, and templates that need a boundary (e.g. Private) opt
in. Per-space *bookmarks* isolate and *history* is attributed per space via Places
side tables (ADR 0005), independent of containers. The workspace manager owns the
mapping (workspace ⇄ optional container ⇄ tab set ⇄ theme ⇄ search provider) — see
`workspace.schema.json`.

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
- [0003 — Workspaces map to Firefox containers](decisions/0003-workspaces-on-containers.md) — *superseded on defaults by patch 0038: per-space containers are opt-in, off by default*
- [0004 — Federated universal search](decisions/0004-universal-search-federated.md)
- [0005 — Per-workspace isolation: bookmarks isolate, history attributes, passwords global](decisions/0005-workspace-isolation.md)
- [0006 — Workspace state-history substrate (snapshots)](decisions/0006-workspace-state-history.md)
- [0007 — Privacy Center over Firefox's blocking ledger](decisions/0007-privacy-center.md)
- [0008 — Customization engines (layout + theme)](decisions/0008-customization-engines.md)
- [0009 — Customization Studio (about:studio)](decisions/0009-customization-studio.md)
- [0010 — Component marketplace](decisions/0010-component-marketplace.md)
- [0011 — Kavacha SDK + plugin permission model](decisions/0011-kavacha-sdk-plugins.md)
