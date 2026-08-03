# Kavacha Roadmap

Working checklist derived from the [Master Plan](MASTER_PLAN.md). Dates are relative to
project start (2026-07-09).

> **Looking for what to do next?** [REMAINING_WORK.md](REMAINING_WORK.md) holds the open
> defects and features; [SHIPPING.md](SHIPPING.md) holds everything that gates a release —
> blockers, gate readiness, required verification, and what is blocked on you. This
> document keeps the full history — what shipped, when, and why — which is what makes it
> long. Year-2+ products live in [ECOSYSTEM.md](ECOSYSTEM.md) and are not current work.

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

## Phase 1 — Foundation (Weeks 1–4)

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
- [ ] **Update service (`updates.kavacha.app`) — blocker for any public release**
      (added 2026-07-31). `build/generate-branding.sh` points `MOZ_APPUPDATE_HOST`
      at `updates.kavacha.app` and CI already produces update MARs — but nothing
      serves them, so a shipped build checks a host that answers nothing. Kavacha
      inherits Firefox's CVE stream through the Zen pin, so until this exists there
      is **no path to deliver a security fix to a user**. Needs: an AUS-compatible
      update endpoint (XML per version/platform/channel), MAR signing keys plus the
      signing step in CI, and a channel scheme (nightly/beta/release). Patch 0002
      deliberately stripped the upstream phone-home endpoints; this is the
      first-party replacement that has to exist before shipping to anyone.

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
- [x] **Cross-workspace identity — shared sign-in by default** (patch
      `0038-optional-space-containers.patch`, 2026-07-31). Correction to an earlier
      claim here: spaces do **not** all sit on their own containers.
      `ZenSpaceCreation.mjs:260` assigns no container to a normally-created space;
      only the three *templates* forced one, which is why a Google / GitHub / Slack
      login made in a template space did not carry anywhere else. Per-Space
      containers are now a pref, `kavacha.workspaces.isolate-containers`, **default
      off**, with a checkbox in Settings › Workspaces. Off means one set of logins
      across all spaces. The Private template is exempt and always gets a container —
      isolation is the only thing it promises. Non-retroactive by design: the pref
      governs space *creation*, so existing spaces keep their container rather than
      being silently signed out. Costs no tracking protection either way, because
      `network.cookie.cookieBehavior=5` (Total Cookie Protection) already partitions
      third-party state by top-level site independently of containers; what
      containers uniquely provide is *simultaneous distinct first-party logins to
      the same site*. See the Phase 5 note on Google sync for why this — not a
      Google integration — is the right fix. **Not yet L4-verified** (VERIFICATION.md §3).
- [ ] **Named container sharing across spaces** — the remaining half of the above.
      With isolation *on*, let chosen spaces share one named container, so "these
      three spaces are all me at work" is expressible, rather than the current
      all-or-nothing switch. Migration gotcha to design for: moving a space to a
      different container leaves its existing cookies behind, which reads to the
      user as being logged out — warn before switching.
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

- [x] **Universal search** (patch `0012-universal-search.patch`; ADR 0004): one query
      surface over open tabs, history, bookmarks, workspace notes and downloads,
      opened from the palette as "Search Everything"; results grouped by source and
      workspace-badged, URL-level dedup (tab > bookmark > history). Federated, not
      indexed — each source is queried through its existing store, and Phase 6's
      personal content index plugs in as one more source behind the same
      `{title, detail, workspaceId, score, action}` contract. Checkbox added
      2026-07-31: the phase intro promised universal search here and the Developer
      Preview gate names "basic universal search", but no item tracked it, so the
      gate could not be read. Follow-ups: dedicated shortcut, workspace filter
      toggle. Functional (L4) verification outstanding — see
      [VERIFICATION.md](VERIFICATION.md); note XUL panels do not appear in Marionette
      screenshots, so verify with computed styles and rects, not pixels.

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
      to the horizontal default. **L4 verified 2026-08-01** (core): density, sidebar side
      and sidebar width all applied live without restart. `hiddenElements` /
      `componentSizes` and the four palette commands remain unexercised — see
      [VERIFICATION.md](VERIFICATION.md) §3.
- [x] **Theme engine loads theme packages** (patch `0023-theme-engine.patch`, 2026-07-15;
      ADR 0008): KavachaThemeEngine loads packages (manifest + colors + optional style.css)
      and applies the active one (`kavacha.theme.active`) live by overriding patch 0016's
      base tokens so Zen re-tints; default stays the baked Midnight floor (zero flash). Ships
      a second bundled dark theme (Kavacha Forest) + user themes from the profile
      `kavacha-themes/`; "Switch Theme" palette command. Surfaces-only (accent stays
      user-owned); light themes a follow-up. **L4 verified 2026-08-01** (core): switching
      to Forest retinted 19 `--kavacha-*` tokens live and restoring returned to Midnight.
      Zero-flash and profile `kavacha-themes/` discovery still unexercised, and the probe
      found defect D5 (Midnight leaves `--kavacha-accent` empty).
- [x] **Visual Browser Builder** (`about:studio`, patch `0024-customization-studio.patch`,
      2026-07-16; ADR 0009): redesign the browser without CSS — a Layout tab (tab
      orientation, sidebar side/width, density, toolbar) driving KavachaLayoutEngine and
      a Themes tab switching packages via KavachaThemeEngine. Registered as a JS
      nsIAboutModule → privileged chrome page (IS_SECURE_CHROME_UI) whose script calls
      the engines' public APIs, so the preview IS the live browser; "Open Customization
      Studio" palette command. Arc-style tabs deferred (not yet an engine capability).
      **Functional (L4) verification outstanding** — the chain builds and packages; no
      runtime probe has yet opened about:studio.
- [x] **Live CSS editor with history + safe mode** (Advanced tier; patch
      `0025-css-editor.patch`, 2026-07-16; ADR 0009): KavachaUserCSS applies the user's
      chrome CSS as an AUTHOR_SHEET (chrome only, never web content), snapshots every
      save to `kavacha-usercss-history.json` so any change reverts, and a safe-mode pref
      + "Toggle Custom CSS Safe Mode" palette command disable all custom CSS so a bad
      rule can never brick the UI. Ships as the Advanced tab in about:studio. Same
      functional (L4) gate — no runtime probe has applied a rule, tripped safe mode, or
      confirmed the escape-hatch palette command works while the chrome is broken.
      Marketplace is the next Phase-3 brick.
- [x] **Command registry** on Zen's palette (Cmd+K): every Kavacha feature exposes
      commands — navigation / organization / productivity / appearance / privacy,
      with automation reserved for Phase 7 (see [PLATFORM_PLAN.md](PLATFORM_PLAN.md)).
      Started 2026-07-12 (patch `0007`); infrastructure in patch `0018`.
      **Completed** patch `0027-command-registry-complete.patch` (2026-07-17):
      domain-grouped palette display (0018's deferred enhancement, done at the
      data layer) + the plugin/marketplace surface — `register(command, {source})`
      with validation/dedup, `unregister`/`unregisterBySource`, a live-removal
      sink so revoked commands leave the palette, `getByDomain`/`has`/capability
      metadata, and `rawLabel` for runtime (plugin/marketplace) commands that
      can't add `.ftl` keys. No new feature commands — the registry mechanism
      itself. **L4 verified 2026-08-01**: 22 commands registered, domains emit in order
      with `clusteredByDomain: true`, and runtime `register()`/`unregister()` move the
      palette count 22 -> 23 -> 22.
- [x] **Component marketplace** (supersedes theme-only marketplace; patch
      `0028-component-marketplace.patch`, 2026-07-17; ADR 0010): `about:marketplace`
      — an offline-first bundled catalog of themes / layouts / bundles ("Research
      Mode") that installs into the profile and applies via the Layout + Theme
      engines (no new application path); each installed component registers palette
      commands through the patch-0027 registry (source-attributed, revoked on
      uninstall). Sidebar widgets / tool panels are reserved component types
      pending a widget host; remote install + ratings + auto-update land with
      Kavacha accounts (Phase 5). **L4 verified 2026-08-01**: installing `theme-forest`
      registered its `Apply:` command and uninstalling revoked it; an unknown component
      id throws. Bundle install and the reserved `widget`/`panel` rejection untested.
- [x] Kavacha SDK + plugin permission model (patch `0029-kavacha-sdk-plugins.patch`,
      2026-07-17; ADR 0011): a permissioned SDK exposing only
      workspaces / tabs / notes / commands — never passwords or private data —
      behind explicit per-plugin, user-granted permissions; `KavachaPluginManager`
      sideloads plugins from the profile and `about:plugins` manages grants;
      plugin commands register through the patch-0027 registry (source `plugin:<id>`)
      and are revoked on disable. Compartment isolation is a hardening follow-up;
      remote plugin distribution via the marketplace is a later integration.
      **Partially verified 2026-08-01**: both modules import in the running build and
      `list()` returns `[]`, but no plugin has been sideloaded, so the grant / enable /
      command / revoke lifecycle is untested.
- [x] **Unified settings menu + discoverability** (patches `0030`–`0032`, 2026-07-17):
      closes the "every feature is hidden in Cmd+K" gap that made the browser feel
      empty. `0030` adds a top-right ⚙ **menu button** whose panel is *generated from
      the command registry* (patch 0027) — every feature plus a Settings row into
      about:preferences, so newly registered features (incl. plugin/marketplace
      commands) appear automatically. `0031` makes **about:preferences the single
      settings home** with **Appearance & Themes** and **Customization** panes — thin
      views over the Theme / Layout / UserCSS engines with links to about:studio /
      marketplace / plugins (via the patch-0021 pane recipe). `0032` adds a
      **Workspaces** pane, a **Restore Archived Space** command with a picker (closes
      the 0018/0027 gap; uses `gZenWorkspaces.unarchiveWorkspace`), and first-run
      pointers to the menu (dashboard ⚙ link + welcome closing line). **Partially verified 2026-08-01**: the
      panel opens and lists Settings first then all six domain sections (21 items), and
      the Workspaces pane renders with non-zero rects; still unproven that invoking a
      panel row runs its command, and the 0031 panes have never been probed at runtime.
      Follow-ups noted while building: a grouped palette-result
      renderer (0027 already stamps `group` labels); per-space context-menu entries
      for snapshot/branch/timeline; a first-launch coach-mark on the ⚙ button; and a
      dashboard contrast pass (low-opacity links likely below WCAG AA).

- [x] **Post-build fix series** (patches `0033`–`0037`, 2026-07-18 → 2026-07-31).
      These landed after the first local build made runtime probing possible and
      were previously absent from this roadmap entirely.
      `0033-menu-visibility-and-theme-contrast` gives the ⚙ button a painted glyph
      (`-moz-context-properties: fill`) and darkens the theme tokens — **L4 verified
      2026-08-01** for the glyph; contrast is subjective and still needs a human look.
      `0034-clear-unpinned-tabs-on-quit` is a **user-facing behaviour change** that had
      no roadmap entry: with it on, a quit keeps only pinned tabs. It shipped
      **broken and destroying pinned tabs** (defect D0) and its pref was declared in no
      prefs file at all (D0b); both are addressed in the 2026-08-01 session — see
      [VERIFICATION.md](VERIFICATION.md) §4.
      `0035-content-edge-inset-horizontal-tabs` removes Zen's content inset in
      horizontal mode — cause measured live, **fix still unconfirmed**.
      `0036-menu-button-no-overflow` keeps the ⚙ button out of `widget-overflow-list`
      and `0037-menu-panel-scrolling` makes the panel scroll — both **L4 verified
      2026-08-01**.
- [x] **Optional per-Space containers** (patch `0038-optional-space-containers.patch`,
      2026-07-31; Phase 2 identity follow-up): `kavacha.workspaces.isolate-containers`,
      default **off**, so Spaces share one set of logins; the Private template stays
      exempt. **L4 verified 2026-08-01** across all three arms, including that the
      Settings checkbox follows an externally-set pref.

### Phase 2 / 2.5 / 3 follow-ups closed 2026-08-02 (patches 0051–0058)

Everything the phases above left as "follow-up" is now built and verified, except two
items gated on later phases. Full list and reasoning: [REMAINING_WORK.md](REMAINING_WORK.md)
§3; evidence: [VERIFICATION.md](VERIFICATION.md) §4b (114 Marionette checks, 0 failures).

- **Phase 2** — named container sharing across Spaces with the migration warning
  (`0051`); an editable *and, for the first time, visible* Space description (`0051`);
  markdown in workspace notes (`0052`); recommended extensions per template (`0053`).
- **Phase 2.5** — branch lineage in the switcher, pinned-tab fidelity on branch,
  compare/discard between a branch and its parent, and step-through replay (`0054`).
  Two of these were the same shape of bug: 0020 wrote `parentSpaceId` and nothing read
  it; 0019 captured `pinned` and 0020 ignored it.
- **Phase 3** — the universal-search shortcut and Space filter, the grouped palette
  renderer 0027 had been stamping labels for, and per-Space snapshot/branch/timeline
  entries (`0055`); light themes, CSS syntax highlighting, tab emphasis and the ⚙
  coach-mark (`0056`); the **widget host** ADR 0010 said was missing, which unblocks the
  reserved `widget`/`panel` component types and user-arrangeable dashboards (`0057`);
  Arc-style tabs as a layout-engine capability (`0058`).

Still open, and gated rather than deferred: **per-workspace AI settings** (nothing to
wire to until the Phase 6 Ollama bridge exists) and **marketplace remote install**
(needs Phase 5 accounts *and* must land behind plugin compartment isolation, a release
blocker).

One correction the work forced: patch 0006 deferred extension recommendations "until the
marketplace could install them", but the marketplace installs Kavacha components, not
WebExtensions — it was never going to be that installer. Recommendations route through
Firefox's own install path instead.

---

## Phase 4 — Privacy Center (Months 6–8) — Y1 ← **feature-complete 2026-08-02**

- [x] Cookie intelligence base: Firefox Cookie Banner Blocker on by default
      (`cookiebanners.service.mode=1`)
- [x] Privacy Center dashboard (ADR 0007 + patch `0021-privacy-center.patch`,
      2026-07-15): "Privacy Center" pane in Settings + "Open Privacy Center"
      palette command — all-time / 7-day / today blocked counts and per-category
      breakdown read from Firefox's own protections.sqlite ledger (nothing new
      collected), bandwidth saved as a labeled estimate (events x 35 KB), an
      Active Protections list read live from prefs, and clear-statistics.
- [x] Session-scoped cookie deletion rules (patch `0049-session-scoped-cookie-rules.patch`,
      2026-08-02): per-site Keep / Session only / Block over Gecko's own `cookie`
      permission, plus delete-on-close driving both required prefs
- [x] Central permission manager (patch `0048-central-permission-manager.patch`,
      2026-08-02): global default per capability, per-site exceptions, per-type and
      global clear. **Clipboard was dropped as unimplementable** — Firefox 152 does not
      persist clipboard access as a site permission, so there is no grant to show or
      revoke; the pane says so instead of faking a control
- [x] Brave Search default + bundled alternatives (DDG, Kagi, Startpage, Google)
      (patch `0047-brave-search-default.patch`, 2026-08-02). Upstream carried neither
      Brave nor Kagi and defaulted to Google, so Zen's dump merger gained `add`/`patch`
      operations; a rule matching nothing now fails the build
- [x] Privacy score + per-site trust profiles, the latter doubling as the per-site
      drilldown (patch `0050-privacy-score-and-site-profiles.patch`, 2026-08-02).
      Also adds encrypted DNS and delete-cookies-on-close to the posture list
- [ ] Blocked-today badge on a chrome surface — needs `KavachaMenu` and chrome markup,
      so it was left out of 0050 rather than folded in
- [ ] Network-silence test in CI (fresh idle profile ⇒ zero telemetry requests)

**None of 0047–0050 is build-verified.** Each was checked as far as is possible without
a build — schema validation, `node --check`, XML well-formedness, and a Fluent-id
cross-check — but the arms that matter (does a fresh profile search with Brave; do
cookies vanish across a real quit) need a build. See [SHIPPING.md](SHIPPING.md) §3.

## Phase 5 — Kavacha Account & Ownership (Months 8–10) — Y1

> **Ruled out (2026-07-31): Google account sync.** Considered as an opt-in setting,
> rejected on two independent grounds — recorded here so it is not re-litigated.
> **(1) Not available.** Chrome Sync's OAuth scopes are restricted to Google's own
> client IDs; Google cut third-party Chromium builds off from them in 2021, which is
> precisely why Brave and Vivaldi each built their own sync instead of reusing it.
> The browser-level account binding (Mirror / `X-Chrome-Connected` account-consistency
> headers) is likewise Chrome-proprietary and not an open protocol. **(2) Contradicts
> the north star.** It would ship bookmarks/history to Google and stand up a second,
> non-E2E sync path competing with the one this phase exists to build; being opt-in
> does not fix that, it just makes the familiar path the default choice. What users
> actually want from it — "sign into Google once and Gmail/Docs/Drive all work" — is
> cookie-based SSO across `*.google.com` and **already works in any browser**. The
> only thing breaking it in Kavacha is per-space containers, addressed by
> cross-workspace identity in Phase 2. Google Takeout import (one-time, local) is the
> honest substitute for bookmark/history migration.

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

## Phase 7 — Browser, later (post-v1.0)

Browser work deliberately scheduled after v1.0. Still browser features — patches in
`browser/patches/`, no servers, no accounts:

- [ ] Knowledge management — per-page notes, web clipper, personal knowledge graph.
      On the north-star path: the Phase 6 personal search index is what grows into
      the graph (see [PLATFORM_PLAN.md](PLATFORM_PLAN.md) row 3)
- [ ] Automation framework — workflow builder (trigger → actions), tab manipulation,
      data extraction, scheduled workflows, reusable templates; the `automation`
      command domain is already reserved in the patch-0027 registry
- [ ] Power-user tooling — capture, annotation, citations, REST client, JSON viewer,
      writing mode. Candidates for marketplace *bundles* rather than core
- [ ] Focus mode — block distracting sites + notifications
- [ ] Offline mode — save pages, notes, documents (pairs with the web clipper)
- [ ] Tab history tree (FEATURES 7.1) and named/saved tab sessions (7.2)

## Ecosystem (Year 2+) — separate document, deliberately

Kavacha Mail, Drive, Identity, the search aggregator and Enterprise are **separate
products**, not browser features: each needs servers, an account, and a business
model, and all of them depend on Phase 5 existing first. They have been moved out of
this roadmap so they cannot be mistaken for current work — see
[ECOSYSTEM.md](ECOSYSTEM.md), which is explicitly gated on the browser having shipped.

## Release gates

Requirements below; **current readiness against each is tracked in
[SHIPPING.md](SHIPPING.md) §1**, which is the file to read before claiming a gate.

| Gate | Requirement |
|---|---|
| Developer Preview | MVP scope in [PLATFORM_PLAN.md](PLATFORM_PLAN.md): Phase 1–2 complete incl. workspace notes + archiving, command registry, basic universal search, distinct default look; signed builds; **update service live** (a build that cannot receive a security fix does not ship); L4 functional verification per [VERIFICATION.md](VERIFICATION.md) |
| Beta | + Phases 3–4; reproducible builds; disclosure program live |
| v1.0 Public | MVP checklist in MASTER_PLAN.md fully checked; startup < 2 s; crash rate < 0.5 % |
