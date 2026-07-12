# Zen Spaces Audit — Kavacha Workspace Identities (Phase 2)

*2026-07-12. Audited against upstream Zen source (`browser/zen-upstream/src/zen/`)
and Kavacha's [`ui/workspaces/workspace.schema.json`](../ui/workspaces/workspace.schema.json).
First Phase 2 deliverable per [ROADMAP.md](ROADMAP.md) and
[ADR 0003](decisions/0003-workspaces-on-containers.md).*

## Verdict

Zen's spaces already implement **60–70% of Kavacha's "workspace = complete
environment" concept** — identity (container binding), visual identity (per-space
gradient themes), organization (per-space tabs/pinned/essentials), and cross-device
sync all exist and are solid. What's missing is precisely Kavacha's differentiating
layer: per-workspace **search engine**, **extension set**, **settings overrides**,
**isolation options**, and **templates**. Strategy confirmed: **adopt Zen's space
object and extend it** — do not build a parallel workspace system.

## Schema field mapping

| Kavacha schema field | Zen today | Gap |
|---|---|---|
| `id` | `uuid` (UUID v4) — `ZenSpaceManager.mjs` `#createWorkspaceData()` | none — adopt |
| `name` | `name` | none — adopt |
| `icon` | `icon` (emoji or SVG URL) | none — adopt |
| `theme` | `theme` object: `{type: "gradient", gradientColors[≤3], opacity, texture}` (`ZenGradientGenerator.mjs`) | shape differs from our schema — map ours onto Zen's rather than replace |
| `containerId` | `containerTabId` → Firefox `userContextId`; routing-based, opt-in enforcement via `zen.workspaces.force-container-workspace` | adopt; consider stronger enforcement as a Kavacha isolation option |
| `searchProvider` | **absent** — search is profile-global | **build** (Phase 2) |
| `extensions` | **absent** — no `AddonManager` usage anywhere in spaces code; addons are profile-global | **build** — riskiest item, see prototype plan below |
| `settings` overrides | **absent** | **build** (Phase 2) |
| `isolation` (bookmarks/history/passwords) | **absent** — containers isolate cookies/storage only; Places and logins are profile-global | **build** (Phase 2, hardest of the three; needs Places query filtering, not a separate store) |
| `aiSettings` | **absent** | **build** (schema shipped; wiring lands Phase 6) |
| `template` | **absent** — every space is created blank | **build** (Phase 2) |

## Facts worth designing around

- **Persistence**: spaces live in `zen-sessions.jsonlz4` (LZ4 JSONFile), loaded by
  `ZenSessionManager.sys.mjs`; legacy Places-DB table `zen_workspaces` exists only as
  a one-time migration. New Kavacha fields ride along in the same JSON object — no
  storage work needed, but **sync and migration must tolerate unknown fields**
  (verify before shipping new ones).
- **Sync**: `ZenWorkspacesSync.sys.mjs` syncs spaces (`s~{uuid}` records, collection
  `"workspaces"`) *and* containers (`c~{userContextId}`) over Firefox Sync /
  Mozilla accounts. Any field we add to the space object should sync for free —
  but this deepens the Mozilla-account dependency Kavacha's own E2E sync (Phase 5)
  is meant to replace. Design new fields so the payload is transport-agnostic.
- **Switching**: `changeWorkspace()` → `#performWorkspaceChange()` hides tabs via
  CSS collapse (tabs stay loaded; explicit `unloadWorkspace()` exists). Switches are
  sequentialized through a promise — **per-workspace extension toggling can hook the
  same chokepoint**, and `unloadWorkspace()` is the natural base for Phase 2's tab
  memory management item.
- **Spaces are global per profile** (all windows), not per-window. Per-workspace
  settings must apply globally, not per-window.
- **Container binding is a default, not a wall**: new tabs inherit the space's
  `containerTabId` (`ZenSpaceRoutingManager.sys.mjs`), and space-routing can
  auto-route URLs, but nothing prevents off-container tabs. Kavacha's `isolation`
  options should offer the strict mode Zen doesn't.

## Prototype plan: per-workspace extension enablement (ADR 0003's riskiest assumption)

Firefox has **no per-container or per-window extension scoping** — an addon is
enabled or disabled for the whole profile. The only real mechanism is toggling
addons globally at workspace-switch time:

1. Store an allowlist in the space object (`extensions: [addonIds]`; absent =
   "all enabled", preserving Zen behavior).
2. Hook the switch chokepoint (`#performWorkspaceChange`): diff old vs new
   workspace's sets, then `AddonManager.getAddonByID(id).disable()/enable()`.
3. Measure what decides go/no-go:
   - **Switch latency** added by enable/disable round-trips (async; UI must not block).
   - **Addons that don't tolerate live toggling** (ones requiring restart, ones
     losing in-memory state — session managers, containers-style addons).
   - **Race behavior** under rapid space cycling (the promise-sequencing should
     serialize us, verify).
   - **Content-script side effects**: disabling an extension mid-page kills its
     scripts on *all* workspaces' loaded tabs — acceptable only because hidden
     tabs get the right set re-enabled when their space activates. Verify pages
     recover on re-enable.
4. Fallback if latency or breakage is unacceptable: scope down the feature to
   *UI-level* scoping (hide browser actions per space, keep addons running) and
   mark "hard" extension isolation as requiring separate profiles — which would
   reshape the Phase 2 schema (`extensions` becomes `extensionsUi`).

## Recommended build order (Phase 2)

1. **Per-workspace search provider** — smallest, self-contained
   (`Services.search.defaultEngine` swap at the switch chokepoint), proves the
   "extend the space object" pattern end to end including sync.
2. **Extension-enablement prototype** — de-risk ADR 0003 before building on it.
3. **Settings overrides** — pref push/pop at switch time using the same pattern.
4. **Templates** — pure data once 1–3 exist (a template is a pre-filled space
   object plus a container + set of installs).
5. **Isolation options** — largest; Places/logins filtering deserves its own ADR.
