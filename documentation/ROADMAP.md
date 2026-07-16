# Kavacha Roadmap

Working checklist derived from the [Master Plan](MASTER_PLAN.md). Dates are relative to
project start (2026-07-09).

## End Goal — North Star (added 2026-07-14)

> Tabs remain a core part of the browsing experience, but the browser treats
> them as temporary windows into larger projects. Every action — pages
> visited, searches performed, files downloaded, text copied, notes written,
> and conversations had — is continuously indexed into a local-first personal
> knowledge graph stored entirely on your device. Users can organize work
> around goals such as "Apply to College," "Research Remote Sensing
> Conferences," or "Build a Discord Bot," with the browser automatically
> linking related tabs, resources, and discoveries across time. Research can
> branch into multiple paths, allowing users to explore alternatives without
> losing context, while a full time-travel system makes it possible to
> restore or replay any previous browser state and revisit past lines of
> thought. A built-in local AI understands the context behind your activity,
> connecting people, organizations, articles, papers, websites, and ideas
> into a dynamic relationship graph. Because the browser indexes everything
> you've chosen to keep, you can ask questions such as "Where did I find that
> paper on flood mapping?" or "Show me every source related to my scholarship
> applications." An observing agent, running entirely on-device, can
> passively monitor workflow patterns and occasionally ask questions like
> "Are these tabs part of the same research project?" or "Would you like to
> save this as a new branch of your investigation?" to improve organization
> and context awareness. Rather than replacing tabs, the browser augments
> them with memory, structure, and long-term understanding, transforming
> them from isolated pages into components of a persistent, searchable
> knowledge workspace.

Every phase below is a step toward this. The through-line: workspaces are the
projects, the personal index (Phase 6) grows into the knowledge graph, session
depth (Phase 2) grows into branching + time travel, and the AI layer stays a
local interface to the user's own data. Universal search is the first
user-visible surface of the index and starts now (see Phase 3 checklist).

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
      **Linux landed 2026-07-13**: `kavacha-nightly-linux` (165 MB) — fixes were
      resource caps (-j2, no debug symbols; hosted runners OOM-kill otherwise).
      Windows native is upstream-broken at this pin (libwebrtc rule missing when
      linking xul.dll; Zen only cross-compiles Windows) — stays experimental
      until we adopt Zen's win-cross recipe.

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
- [x] Per-workspace isolation options (ADR 0005 + patch
      `0015-workspace-places-attribution.patch`, 2026-07-14): bookmarks isolate
      via Zen's inherited side-table machinery plus a Kavacha auto-assign-to-
      current-Space option; history gets per-space ATTRIBUTION (side table,
      tab-layer recording, badges in universal search) — organization, not a
      privacy boundary, by design; passwords stay global (user decision)
- [ ] Per-workspace AI settings (schema shipped; wiring in Phase 6)
- [x] Workspace templates (patch `0006-workspace-templates.patch`, 2026-07-12):
      "New Space from Template" → Student / Developer / Private, each composing a
      dedicated container + themed gradient + search engine + settings overrides.
      Extension recommendations deferred until the marketplace can install them
- [x] Tab memory management (patch `0013-tab-memory-management.patch`, 2026-07-14):
      background tabs untouched > `kavacha.tabs.unload-after-minutes` (default 30)
      are discarded to free memory, kept in the strip, restored on click; the
      timer-driven counterpart to Firefox's memory-pressure TabUnloader
- [x] Workspace lifecycle: **archive/restore** (patch `0009-workspace-archiving.patch`,
      2026-07-12): archived spaces hidden from strip/navigation with tabs unloaded,
      all data kept + synced; restore via "Archived Spaces" submenu or after sync.
      Optional space `description` added (patch `0014-workspace-description.patch`,
      2026-07-14): free-text field in the Create a Space card, stored on the space
      object; editing an existing space's description is a follow-up
- [x] **Workspace notes** (patch `0008-workspace-notes.patch`, 2026-07-12):
      autosaving notes panel per space (actions menu + palette command); stored
      locally in profile `kavacha-notes.json` — never on the synced space object;
      rides Kavacha E2E sync in Phase 5. Markdown rendering: later enhancement
- [x] Verify session-restore depth (2026-07-14, verified in real use): tabs restore
      at their scroll positions and page state across restart; collaborative SPAs
      (Google Docs/Sheets, Figma, Notion) reload-and-resync by design — correct
      behavior, not lost depth. Same reload happens when the tab-unloader (0013)
      discards them, for the same reason

## Phase 2.5 — Research Continuity: branching & time-travel — Y1

Added 2026-07-15 to close a gap: the [End Goal](#end-goal--north-star-added-2026-07-14)
names two capabilities the phased plan didn't yet cover — *"research can branch
into multiple paths"* and *"a full time-travel system … to restore or replay any
previous browser state."* Both **extend foundations already shipped** (workspaces,
session store, verified session-restore depth, the command registry) and do **not**
depend on the Phase 6 AI/graph, so they are buildable now — and their snapshots +
branch relationships become early edges of the Phase 6 knowledge graph.

- [x] **Workspace state-history substrate** (ADR 0006 + patch
      `0019-workspace-state-history.patch`, 2026-07-15): kavacha-snapshots.sqlite
      stores per-space snapshots — tabs as SessionStore state strings, active
      index, space metadata, an embedded copy of the note. Triggers: space
      switch (outgoing), archive, quit, "Snapshot This Space" palette command.
      Structural-hash dedup; count+age retention (100 / 90d prefs); local-only
      until Phase 5 sync. snapshot()/listSnapshots()/getSnapshot() is the API
      branching and time-travel consume
- [x] **Research branching** (patch `0020-research-branching-time-travel.patch`,
      2026-07-15): "Branch This Space" (palette) forks the active space — or any
      snapshot — into "Parent / branch": parent pointer + snapshot id +
      branchedAt on the space object, same container, note copied, tabs rebuilt
      lazily from captured SessionStore state (activation restores the real
      page). Follow-ups: branch tree in the switcher, pinned fidelity,
      compare/discard flows
- [x] **Time-travel** (same patch): "Space Timeline" (palette) lists the active
      space's snapshots (when / tabs / trigger); "Restore as branch" forks any
      of them. Restore semantics decided: NON-destructive — restoring never
      overwrites the present; branching is the single mechanism under both
      features. Step-through replay is a follow-up
- Ties to the north star: the observing agent's *"save this as a new branch of
      your investigation?"* suggestion lands as a registered command (patch 0018)
      that forks a branch; the snapshot history is raw material the knowledge graph
      later reads.

## Phase 3 — Customization Studio & Marketplace (Months 4–6) — Y1

- [x] **Distinct default look — must not read as a Zen fork** (see
      [DIFFERENTIATION.md](DIFFERENTIATION.md) § Visual identity)
  - [x] ~~Kavacha gold accent by default~~ reverted 2026-07-13 (user decision:
        no default accent — picking a color is the user's; `ui/defaults/kavacha-ux.js`)
  - [x] **Horizontal tabs by default** (patch `0010-horizontal-tabs.patch` +
        `zen.tabs.vertical=false` in branding prefs, 2026-07-13): functional —
        Marionette-verified tab rendering, click selection, URL bar navigation,
        content layout, and workspace switching. Zen's signature sidebar is
        gone from Kavacha's default look; vertical remains one pref away.
        Chrome-convention URL row landed 2026-07-13/14 after user visual passes:
        nav buttons left of a full-width omnibox, traffic lights in the strip,
        layout survives Zen's toolbar reshuffles (top-layer-popover urlbar and
        UA-important flex quirks documented in the patch header). New tabs open
        on the right (`zen.view.show-newtab-button-top=false`). Cmd+T keeps
        Zen's centered floating search, now optional: Settings > Looks and Feel
        toggle; when off, new tabs open the offline Kavacha dashboard —
        gradient of the day, clock, greeting, daily quote (patch
        `0011-kavacha-newtab-dashboard.patch`, 2026-07-14).
        Polish remaining: active-tab emphasis, strip spacing
  - [x] kavacha-midnight as default theme (patch `0016-kavacha-midnight-theme.patch`,
        2026-07-14): surface tokens from customization/themes/kavacha-midnight
        override Zen's base variables (everything else re-derives via Zen's
        color-mix chains); dark scheme default via branding prefs; accent still
        deliberately unset — the welcome flow asks
  - [x] Own welcome flow (patch `0017-kavacha-welcome.patch`, 2026-07-14):
        Zen's welcome framework with Kavacha pages — import + search kept,
        Zen-branded pages removed, added Choose your look (Midnight/Light/Auto),
        Pick your color (the no-default-accent decision becomes the user's),
        and new-tab style (floating search vs dashboard). Title: "Welcome to /
        your personal internet"
- [x] **Layout engine applies layout JSON live** (patch `0022-layout-engine.patch`,
      2026-07-15; ADR 0008): KavachaLayoutEngine reads a per-profile `kavacha-layout.json`
      and applies it live to chrome — tab orientation (via `zen.tabs.vertical`), interface
      density, sidebar side/width, hidden elements — with palette commands (Toggle Tab
      Layout, Cycle Sidebar, Cycle Density, Reload Layout). `default-layout.json` reconciled
      to the horizontal default. **Build/Marionette verification pending** — authored without
      a local Zen checkout; hunks need `git apply --check` against upstream first
- [x] **Theme engine loads theme packages** (patch `0023-theme-engine.patch`, 2026-07-15;
      ADR 0008): KavachaThemeEngine loads packages (manifest + colors + optional style.css)
      and applies the active one (`kavacha.theme.active`) live by overriding patch 0016's
      base tokens so Zen re-tints; default stays the baked Midnight floor (zero flash). Ships
      a second bundled dark theme (Kavacha Forest) + user themes from the profile
      `kavacha-themes/`; "Switch Theme" palette command. Surfaces-only (accent stays
      user-owned); light themes a follow-up. Same build-verification caveat
- [x] **Visual Browser Builder** (`about:studio`, patch `0024-customization-studio.patch`,
      2026-07-16; ADR 0009): redesign the browser without CSS — a Layout tab (tab
      orientation, sidebar side/width, density, toolbar) driving KavachaLayoutEngine and
      a Themes tab switching packages via KavachaThemeEngine. Registered as a JS
      nsIAboutModule → privileged chrome page (IS_SECURE_CHROME_UI) whose script calls
      the engines' public APIs, so the preview IS the live browser; "Open Customization
      Studio" palette command. Arc-style tabs deferred (not yet an engine capability).
      **Build/Marionette verification pending** — `git apply`-clean on the post-0023
      tree, authored without a local build.
- [x] **Live CSS editor with history + safe mode** (Advanced tier; patch
      `0025-css-editor.patch`, 2026-07-16; ADR 0009): KavachaUserCSS applies the user's
      chrome CSS as an AUTHOR_SHEET (chrome only, never web content), snapshots every
      save to `kavacha-usercss-history.json` so any change reverts, and a safe-mode pref
      + "Toggle Custom CSS Safe Mode" palette command disable all custom CSS so a bad
      rule can never brick the UI. Ships as the Advanced tab in about:studio. Same
      build-verify gate. Marketplace is the next Phase-3 brick.
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
- [x] Privacy Center dashboard (ADR 0007 + patch `0021-privacy-center.patch`,
      2026-07-15): "Privacy Center" pane in Settings + "Open Privacy Center"
      palette command — all-time / 7-day / today blocked counts and per-category
      breakdown read from Firefox's own protections.sqlite ledger (nothing new
      collected), bandwidth saved as a labeled estimate (events x 35 KB), an
      Active Protections list read live from prefs, and clear-statistics.
      Later: per-site drilldown, blocked-today badge surfaces
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
