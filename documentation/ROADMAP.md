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
- [x] **Deliverable: first Kavacha Nightly artifact from CI** — `kavacha-nightly-macos`
      (174 MB DMG + update MAR) built and uploaded by run 29123975884 (2026-07-10).
      Linux expected green after portable-icon fix; Windows experimental
      (continue-on-error) — even Zen cross-compiles Windows from Linux.

> **Note (2026-07-09):** the Zen source audit ([DIFFERENTIATION.md](DIFFERENTIATION.md))
> showed Zen already ships workspaces (spaces), vertical tabs, tab groups (folders),
> split view, compact mode, and a command palette. Phases 2–3 shifted from *build* to
> *verify inherited features + build the differentiating layer*. Feature priorities
> come from [FEATURES.md](FEATURES.md) (year-1 must-haves marked **Y1**).

## Phase 2 — Workspace Identities (Months 2–4) — Y1

Inherited from Zen (verify + adopt): spaces, space-routing, vertical tabs, folders,
split view, command palette, session store.

- [x] Audit Zen spaces vs the workspace schema; adopt or extend (`ui/workspaces/`) —
      see [ZEN-SPACES-AUDIT.md](ZEN-SPACES-AUDIT.md) (2026-07-12): adopt Zen's space
      object + extend; ~60-70% of the environment concept already exists; gaps are
      exactly the Kavacha layer (search/extensions/settings/isolation/templates)
- [ ] Per-workspace search engine, extension set, and settings overrides
  - [x] Search engine (patch `0003-workspace-search-engine.patch`, 2026-07-12):
        `searchProvider` on the space object, applied at the switch chokepoint,
        set via the space actions menu; persists + syncs through Zen's machinery.
        Verified working in-app 2026-07-12 (menu populates, engine follows space)
  - [x] Extension set prototype (patch `0004-workspace-extensions.patch`,
        2026-07-12): `extensions` allowlist on the space object, toggled via
        AddonManager at switch time with a Kavacha-disabled tracking pref so
        user global disables are never overridden. **Verified working in-app
        2026-07-12 — ADR 0003 validated**; workspace templates unblocked.
        (Keep an eye on switch latency with heavy addon sets as usage grows.)
  - [x] Settings overrides (patch `0005-workspace-settings.patch`, 2026-07-12):
        curated allowlist — website color scheme, autoplay, notification
        prompts, password saving, search suggestions — with baseline restore;
        "Workspace Settings" submenu
- [ ] Per-workspace isolation options: bookmarks, history, password vault
- [ ] Per-workspace AI settings (schema shipped; wiring in Phase 6)
- [x] Workspace templates (patch `0006-workspace-templates.patch`, 2026-07-12):
      "New Space from Template" → Student / Developer / Private, each composing a
      dedicated container + themed gradient + search engine + settings overrides.
      Extension recommendations deferred until the marketplace can install them
- [ ] Tab memory management (30 min inactive → save → unload → restore)
- [ ] Workspace lifecycle: **archive/restore** + `description` metadata
      (see [PLATFORM_PLAN.md](PLATFORM_PLAN.md) — workspaces as persistent projects)
- [ ] **Workspace notes**: local markdown notes attached to a space (MVP item)
- [ ] Verify session-restore depth (scroll positions, page state) across restarts

## Phase 3 — Customization Studio & Marketplace (Months 4–6) — Y1

- [ ] **Distinct default look — must not read as a Zen fork** (see
      [DIFFERENTIATION.md](DIFFERENTIATION.md) § Visual identity): horizontal tabs
      by default, kavacha-midnight as default theme, own welcome flow
- [ ] Layout engine applies layout JSON live (default shipped: `customization/layout-engine/`)
- [ ] Theme engine loads theme packages (reference theme shipped: `kavacha-midnight`)
- [ ] **Visual Browser Builder** (`about:studio`): redesign the browser without CSS —
      sidebar, tab style (vertical/horizontal/Arc-style), toolbar components
- [ ] Live CSS editor with history + safe mode (Advanced tier)
- [ ] **Component marketplace** (supersedes theme-only marketplace): themes, layouts,
      sidebar widgets, tool panels; bundles like "Research Mode"
- [ ] **Command registry** on Zen's palette (Cmd+K): every Kavacha feature exposes
      commands — navigation / organization / productivity / automation
      (see [PLATFORM_PLAN.md](PLATFORM_PLAN.md)). Started 2026-07-12: template
      creation commands (patch `0007-command-registry-templates.patch`)
- [ ] Kavacha SDK + plugin permission model (workspaces/tabs/notes/commands behind
      explicit per-plugin permissions; never passwords or private data)

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
- [ ] **Personal search index**: local index over history, bookmarks, saved pages,
      PDFs, downloads, and workspace notes — SQLite FTS + metadata, optional local
      embeddings; local by default, encrypted-at-rest option, user-controlled
      deletion. Retrieval backbone for AI features and later knowledge graph
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
| Developer Preview | MVP scope in [PLATFORM_PLAN.md](PLATFORM_PLAN.md): Phase 1–2 complete incl. workspace notes + archiving, command registry, basic universal search, distinct default look; signed builds |
| Beta | + Phases 3–4; reproducible builds; disclosure program live |
| v1.0 Public | MVP checklist in MASTER_PLAN.md fully checked; startup < 2 s; crash rate < 0.5 % |
