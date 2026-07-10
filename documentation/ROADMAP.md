# Kavacha Roadmap

Working checklist derived from the [Master Plan](MASTER_PLAN.md). Dates are relative to
project start (2026-07-09).

## Phase 1 — Foundation (Weeks 1–4) ← **current**

- [x] Repository created; structure, license (MPL-2.0), docs, ADRs
- [x] Update strategy defined (overlay repo + ordered patches — see build/README.md)
- [x] Bootstrap tooling (`build/bootstrap.sh`: setup/build/ui/start/update)
- [x] CI skeleton (validate on push; nightly build matrix for win/mac/linux)
- [x] Privacy default prefs (`privacy/tracker-controls/kavacha.js`)
- [x] Privacy prefs shipped inside the app (appended to branding prefs by
      generate-branding.sh; verified in Kavacha.app defaults/preferences, 2026-07-09)
- [x] Branding source of truth (`browser/branding/kavacha/branding.json`)
- [x] First local build of unmodified Zen via bootstrap (verified 2026-07-09, ~99 min on Apple Silicon)
- [x] Patch `0001-branding-kavacha.patch` — Kavacha brand registered; verified: build
      produces Kavacha.app with Kavacha strings + icon (2026-07-09)
- [x] Patch `0002-strip-phone-home-endpoints.patch` — update pings no longer go to
      Zen's server; residual Mozilla endpoints (region/contile/system-addons/WDBA)
      disabled via prefs (2026-07-09)
- [x] Brand assets: lotus-shield logo → all icon sizes + .icns via
      build/generate-branding.sh (Windows .ico/.bmp installer imagery still placeholder)
- [ ] **Deliverable: first Kavacha Nightly artifact from CI**

> **Note (2026-07-09):** the Zen source audit ([DIFFERENTIATION.md](DIFFERENTIATION.md))
> showed Zen already ships workspaces (spaces), vertical tabs, tab groups (folders),
> split view, compact mode, and a command palette. Phases 2–3 shifted from *build* to
> *verify inherited features + build the differentiating layer*. Feature priorities
> come from [FEATURES.md](FEATURES.md) (year-1 must-haves marked **Y1**).

## Phase 2 — Workspace Identities (Months 2–4) — Y1

Inherited from Zen (verify + adopt): spaces, space-routing, vertical tabs, folders,
split view, command palette, session store.

- [ ] Audit Zen spaces vs the workspace schema; adopt or extend (`ui/workspaces/`)
- [ ] Per-workspace search engine, extension set, and settings overrides
- [ ] Per-workspace isolation options: bookmarks, history, password vault
- [ ] Per-workspace AI settings (schema shipped; wiring in Phase 6)
- [ ] Workspace templates: install "Student" / "Developer" / "Privacy" environments
- [ ] Tab memory management (30 min inactive → save → unload → restore)

## Phase 3 — Customization Studio & Marketplace (Months 4–6) — Y1

- [ ] Layout engine applies layout JSON live (default shipped: `customization/layout-engine/`)
- [ ] Theme engine loads theme packages (reference theme shipped: `kavacha-midnight`)
- [ ] **Visual Browser Builder** (`about:studio`): redesign the browser without CSS —
      sidebar, tab style (vertical/horizontal/Arc-style), toolbar components
- [ ] Live CSS editor with history + safe mode (Advanced tier)
- [ ] **Component marketplace** (supersedes theme-only marketplace): themes, layouts,
      sidebar widgets, tool panels; bundles like "Research Mode"

## Phase 4 — Privacy Center (Months 6–8) — Y1

- [x] Cookie intelligence base: Firefox Cookie Banner Blocker on by default
      (`cookiebanners.service.mode=1`)
- [ ] Privacy Center dashboard (trackers blocked / fingerprints prevented / bandwidth saved)
- [ ] Network-silence test in CI (fresh idle profile ⇒ zero telemetry requests)
- [ ] Central permission manager
- [ ] Brave Search default + bundled alternatives (DDG, Kagi, Startpage, Google)
- [ ] Later: privacy score, per-site trust profiles

## Phase 5 — Kavacha Account & Ownership (Months 8–10) — Y1

- [ ] Auth service (Rust): signup, login, device management
- [ ] E2E-encrypted sync: settings, themes, bookmarks, workspaces (replaces Zen's
      Mozilla-account sync)
- [ ] `kavacha-sync-server` self-hostable container (NAS/VPS/home server)
- [ ] One-click "Export My Digital Life" (bookmarks, history, settings, workspaces)
- [ ] External review of the crypto design (blocker for shipping sync)

## Phase 6 — AI & Personal Search (Months 10–12) — Y1

- [ ] Ollama/llama.cpp runtime bridge
- [ ] **Personal search index**: local index over history, bookmarks, saved pages —
      retrieval backbone for AI features and later knowledge graph
- [ ] Page summarization → sidebar
- [ ] Natural-language history search (on the personal index)
- [ ] Tab assistant via command palette ("group tabs by topic", "close duplicates",
      "save this research session")

## Phase 7 — Ecosystem (Year 2+)

Kavacha Mail (+ email aliases, identity containers) · Kavacha Drive · Kavacha Identity
(password manager, passkeys) · Knowledge management (notes, web clipper, knowledge
graph) · Search aggregator · Enterprise (team workspaces, admin controls, compliance
mode) · Automation, focus mode, offline mode

## Release gates

| Gate | Requirement |
|---|---|
| Developer Preview | Phase 1–2 complete; signed builds |
| Beta | + Phases 3–4; reproducible builds; disclosure program live |
| v1.0 Public | MVP checklist in MASTER_PLAN.md fully checked; startup < 2 s; crash rate < 0.5 % |
