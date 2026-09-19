# Kavacha Differentiation

**Positioning:** Kavacha is not "Zen with privacy tweaks." Zen owns the "beautiful
Firefox power-user browser" niche. Kavacha is a browser that is **customizable,
private, intelligent, and owned by the user** — *your personal operating system for
the internet* — with room to become an ecosystem rather than another Firefox fork.

The full annotated feature list lives in [FEATURES.md](FEATURES.md); this document is
the strategic frame around it.

This document was originally grounded (2026-07) in an inventory of Zen's source tree: what
Kavacha inherited for free and where it had to add value. **Since 2026-09-19 Kavacha overlays
Firefox ESR directly** ([ADR 0020](decisions/0020-firefox-esr-direct-overlay.md)); the
comparison with Zen below is now competitive positioning, not an inheritance map.

## What Firefox provides — use, don't rebuild

| Firefox feature | What Kavacha builds on it |
|---|---|
| Containers (`userContextId`) | Per-space cookie/storage isolation (ADR 0003) |
| `SessionStore` custom tab/window values, `hideTab`/`showTab` | The workspaces model itself (ADR 0021) |
| Tab groups, pinned tabs | Grouping inside a space; pinned tabs are global across spaces |
| `sidebar.verticalTabs`, the sidebar | Vertical-tab layout as one pref; Kavacha's AI and Knowledge sidebars register alongside |
| Built-in light/dark themes, `CustomizableUI` | Theme mode with every Firefox surface following; the ⚙ menu button as a movable widget |
| Places, `nsIPermissionManager`, content-blocking log | History attribution, the permission manager, the Privacy Center |
| `about:` modules, JSWindowActors, `EXTRA_JS_MODULES` | Every Kavacha page and module — all vanilla mechanisms |

**What Zen provided and Kavacha now owns:** the workspaces model, the command palette
surface, first-run welcome, and startup wiring. **What Zen provided and Kavacha
deliberately dropped:** compact mode, split view, glance, mods/boosts, Zen sync.

## The four pillars — where Kavacha differentiates

### 1. Private — *verifiable*, not just configured

Zen inherits Firefox defaults and leaves privacy hardening mostly to the user; Kavacha
makes privacy a **testable guarantee**:

- **Network-silence guarantee:** a fresh idle profile produces zero third-party
  telemetry/ad/experiment requests — enforced by CI on every release, published with
  release notes. No other browser publishes this as a tested invariant.
- **Hardened defaults** shipped, not suggested (`privacy/tracker-controls/kavacha.js`),
  plus telemetry endpoints stripped at the source (patch 0002) as defense in depth.
- **Privacy dashboard:** live protection report (trackers blocked, fingerprint attempts
  prevented, cookies isolated) from the local content-blocking log.
- **Connection audit mode:** a user-visible view of every outbound connection the
  browser itself makes and *why* — turning "trust us" into "see for yourself."
- **Central permission manager** across camera/mic/location/notifications/clipboard.
- **Private search default** (Brave Search) with zero suggestion leakage until opt-in.

### 2. Intelligent — local-first AI (Zen has none)

No AI features exist anywhere in Zen's tree. Kavacha's Phase 6 is greenfield
differentiation, with a privacy contract competitors' cloud AI can't match:

- Page summarization, natural-language history search (local embeddings), tab assistant
  through the command palette — all via Ollama/llama.cpp, nothing leaves the device.
- Narrow, auditable API between AI and browser state; features degrade invisibly when
  no local model is installed.

### 3. Owned — user-controlled identity and data

Zen's sync (`src/zen/sync/`) is a layer over **Firefox Sync / Mozilla accounts** — your
workspace data lives under Mozilla's account system. Kavacha replaces the dependency:

- **Kavacha Account + E2E-encrypted sync:** client-generated keys, server stores
  ciphertext only (Phase 5).
- **Self-hostable sync server:** "owned by the user" must include the server; the Rust
  sync service ships as a container anyone can run.
- **Data sovereignty:** complete export/import of workspaces, themes, layouts, settings
  as documented, schema-validated files (the schemas already exist in this repo).
- **Ecosystem runway (Year 2+):** mail + aliases, drive, identity/passkeys — all under
  the same account and encryption model. This is the "ecosystem, not a fork" play, and
  it is *positioning, not plan*: those are separate products, gated on the browser
  having shipped and on Phase 5 defining the shared model. See
  [ECOSYSTEM.md](ECOSYSTEM.md).

### 4. Customizable — authoring, not just installing

Zen's `mods`/`boosts` let users *install other people's* CSS. Kavacha's Customization
Studio makes users *authors*:

- **Visual editor** (`about:studio`) over schema-validated documents — layouts and
  themes are JSON/CSS files that round-trip between GUI and hand-editing
  (schemas shipped: workspace, layout, theme manifest).
- **Safety rails Zen lacks:** versioned/revertible changes, safe-mode toggle so broken
  CSS can never brick the UI.
- **Marketplace with validation:** submissions statically checked against schemas,
  chrome-sandboxed, auto-updating.

## Visual identity — don't look like a Zen fork

*(2026-07-12)* If Kavacha's default look is Zen's look, users will reasonably ask
"why not just use Zen?" The out-of-box experience must read as its own product:

- **Distinct default layout** — e.g. **horizontal tabs by default** (Zen's signature
  is the vertical-tab sidebar; inverting the default is the fastest visual
  separation, and vertical stays one toggle away via the layout engine).
- **Kavacha default theme** (`kavacha-midnight`), not Zen's gradient look; own
  spacing/typography accents.
- **Own onboarding/welcome flow** — first-run should tour workspaces + privacy
  dashboard, not Zen's welcome.
- *(2026-09-19)* With the move to a direct Firefox overlay this concern inverts: the
  risk is now looking like *Firefox* with a theme. The same three answers apply —
  Kavacha's dashboard, theme and workspaces strip are what the user sees first.

## Litmus test for new features

Before building anything, it must pass one of:

1. Does Firefox already ship it? → use and extend, don't rebuild.
2. Does it make privacy *verifiable* rather than configurable?
3. Does it move data/identity ownership from a third party to the user?
4. Does it turn customization consumers into authors?
5. Does it use local intelligence no cloud browser can offer privately?

If none apply, it belongs upstream (contribute to Firefox), not in Kavacha.
