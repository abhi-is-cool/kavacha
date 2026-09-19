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

This is an **overlay repository** — no vendored Firefox source. See
[build/README.md](../build/README.md). Since 2026-09-19 the base is **Firefox ESR directly**
([ADR 0020](decisions/0020-firefox-esr-direct-overlay.md)); the Zen Browser base is retired.

```
kavacha repo ──overlay + patches + branding + prefs──▶ browser/firefox-source (mach) ──▶ binary
```

Mechanisms, in order of preference (most to least update-resilient):

1. **Prefs** — `privacy/tracker-controls/kavacha.js`, shipped as defaults
2. **Branding config** — `browser/branding/kavacha/branding.json`
3. **Overlay files** — everything Kavacha authors, under `browser/overlay/` mirroring
   Firefox's tree (`browser/components/kavacha/…`), copied onto the checkout, never a patch
4. **Patches** — `browser/patches/*.patch`, only for files Firefox tracks, last resort, one
   logical change each

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

### Knowledge (`kavacha-knowledge.sqlite` + `kavacha-graph.sqlite`)
Two stores with **deliberately opposite deletion contracts**, which is why they are two
files. What the user *wrote or kept* — notes, highlights, clips (ADR 0015) — does NOT
follow history deletion: clearing history must not destroy a document the user authored.
What the browser *observed* — the trail from one page to the next (ADR 0016) — does
follow Places, exactly like the personal index (ADR 0012), because it is a record of
where you went. The graph stores only that one fact and derives everything else at
query time from the index, the knowledge store and Space attribution, so there is never
a second copy that can disagree with the first.

### Automation (`automation/`)
Workflows are **documents, not code**: a trigger and an ordered list of steps from a
fixed allowlist, schema-validated fail-closed at save and again at run (ADR 0017).
There is no script step and no expression language — a workflow arrives from imports
and one day from the marketplace, and arbitrary JS with chrome privileges would end the
plugin security model (ADR 0011). Adding a capability means adding an allowlist entry,
which is the review checkpoint that keeps the boundary meaningful.

## Decision log

Significant choices are ADRs in [decisions/](decisions/):

- [0001 — Fork Zen via an overlay repo, never touch Gecko](decisions/0001-fork-zen-overlay.md) — *superseded by 0020 on the choice of base; overlay-repo and never-touch-Gecko stand*
- [0002 — Enforce privacy through default prefs, not locks](decisions/0002-privacy-via-default-prefs.md)
- [0003 — Workspaces map to Firefox containers](decisions/0003-workspaces-on-containers.md) — *superseded on defaults by patch 0038: per-space containers are opt-in, off by default*
- [0004 — Federated universal search](decisions/0004-universal-search-federated.md)
- [0005 — Per-workspace isolation: bookmarks isolate, history attributes, passwords global](decisions/0005-workspace-isolation.md) — *decision 1 (bookmarks via Zen's table) superseded by 0021; history attribution and global passwords stand*
- [0006 — Workspace state-history substrate (snapshots)](decisions/0006-workspace-state-history.md)
- [0007 — Privacy Center over Firefox's blocking ledger](decisions/0007-privacy-center.md)
- [0008 — Customization engines (layout + theme)](decisions/0008-customization-engines.md)
- [0009 — Customization Studio (about:studio)](decisions/0009-customization-studio.md)
- [0010 — Component marketplace](decisions/0010-component-marketplace.md)
- [0011 — Kavacha SDK + plugin permission model](decisions/0011-kavacha-sdk-plugins.md)
- [0012 — Personal search index](decisions/0012-personal-search-index.md)
- [0013 — Local AI runtime bridge](decisions/0013-local-ai-bridge.md)
- [0014 — AI surfaces: sidebar, ask-your-history, tab assistant](decisions/0014-ai-surfaces-and-ask-history.md)
- [0015 — Knowledge capture: notes, highlights and clips, and why they do not follow history](decisions/0015-knowledge-capture.md)
- [0016 — The personal knowledge graph: one stored fact, everything else derived](decisions/0016-personal-knowledge-graph.md)
- [0017 — Automation: workflows are data, never code](decisions/0017-automation-workflows.md)
- [0018 — Focus sessions: a period, not a mode](decisions/0018-focus-sessions.md)
- [0019 — The tab history tree: keeping the branches Gecko truncates](decisions/0019-tab-history-tree.md)
- [0020 — Overlay Firefox ESR directly; build with mach; Windows is a native target](decisions/0020-firefox-esr-direct-overlay.md)
- [0021 — Kavacha owns the workspaces model](decisions/0021-kavacha-owned-workspaces.md)
