# Kavacha Differentiation

**Positioning:** Kavacha is not "Zen with privacy tweaks." Zen owns the "beautiful
Firefox power-user browser" niche. Kavacha is a browser that is **customizable,
private, intelligent, and owned by the user** — *your personal operating system for
the internet* — with room to become an ecosystem rather than another Firefox fork.

The full annotated feature list lives in [FEATURES.md](FEATURES.md); this document is
the strategic frame around it.

This document is grounded in an inventory of Zen's actual source tree
(`browser/zen-upstream/src/zen/`, Firefox 152.x, 2026-07): what we inherit for free,
and where Kavacha must add value Zen doesn't (and won't) provide.

## What Zen already ships — inherit, don't rebuild

| Zen module | Feature | Master Plan phase it satisfies |
|---|---|---|
| `spaces`, `space-routing` | Workspaces + URL→workspace routing rules | Phase 2 (workspaces) |
| `tabs` (vertical), `folders`, `live-folders` | Vertical tabs, tab groups | Phase 2 (tabs/groups) |
| `split-view`, `glance`, `compact-mode` | Power-user viewing modes | Phase 2 (bonus) |
| command palette (`zen-command-palette`) | Command palette | Phase 2 (palette) |
| `mods` | Community theme/mod store | Phase 3 (partially) |
| `boosts` | Per-site CSS/JS injection | Phase 3 (partially) |
| `kbs` | Keyboard shortcut editor | Phase 3 (partially) |
| `sessionstore` | Session/tab persistence | Phase 2 (tab memory, partially) |

**Consequence for the roadmap:** Phase 2 shifts from *build* to *verify, harden, and
extend* (e.g. per-workspace search engine + extension sets on top of Zen spaces).
Engineering effort moves to the pillars below.

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
- **Ecosystem runway (Phase 7):** mail + aliases, drive, identity/passkeys — all under
  the same account and encryption model. This is the "ecosystem, not a fork" play.

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
- Zen's features stay (that's inherited machinery); it's the *defaults and skin*
  that must diverge. Track concrete changes in Phase 3 (Customization Studio +
  default layout work), where the layout engine makes this cheap.

## Litmus test for new features

Before building anything, it must pass one of:

1. Does Zen already ship it? → inherit and extend, don't rebuild.
2. Does it make privacy *verifiable* rather than configurable?
3. Does it move data/identity ownership from a third party to the user?
4. Does it turn customization consumers into authors?
5. Does it use local intelligence no cloud browser can offer privately?

If none apply, it belongs upstream (contribute to Zen), not in Kavacha.
