# Kavacha Master Development Plan

**Version 1.0 — Privacy-First, Fully Customizable Browser Platform**

## Product Vision

Kavacha is a user-owned digital environment: a privacy-first browser that replaces the
default assumptions of modern browsers.

The first product is a highly customizable Firefox-based browser combining:

- Zen Browser-style productivity UX
- Brave-level privacy defaults
- VS Code-level customization
- Local-first AI capabilities
- User-controlled identity and data

Long term, Kavacha expands into: private search, encrypted sync, email, cloud storage,
identity management, and a personal AI assistant.

## Strategic Principles

### Principle 1: Never Build a Browser Engine

Kavacha is an experience layer. Maintain compatibility with Mozilla Firefox, Gecko, and
Firefox extensions. Avoid modifying the Gecko rendering engine, JavaScript engine, or
networking stack.

### Principle 2: Privacy Is a Default, Not a Feature

Users should not configure privacy. Default: no telemetry, no advertising, no tracking,
no third-party data sharing.

### Principle 3: Customization Is the Killer Feature

Privacy gets users interested. Customization makes them stay. The goal:
*"The browser adapts to me."*

## System Architecture

```
+------------------------------------------------+
|           Kavacha Experience Layer              |
|  UI System · Workspace Manager · Theme Engine   |
|  Customization Studio · Privacy Dashboard       |
|  AI Interface                                   |
+------------------------------------------------+
                        |
+------------------------------------------------+
|           Firefox Integration Layer             |
|  Firefox Chrome UI · Extensions API             |
|  Containers · Preferences · Profiles            |
+------------------------------------------------+
                        |
+------------------------------------------------+
|                Gecko Engine                     |
|  Rendering · Networking · JavaScript · Security |
|                 (never modified)                |
+------------------------------------------------+
```

## Technology Stack

- **Browser:** Zen Browser fork on Firefox ESR — C++, Rust, JavaScript, CSS, HTML
- **Backend:** Rust services (auth, sync, encryption, accounts), PostgreSQL, Redis
- **Infrastructure:** GitHub Actions, Cloudflare, AWS/Fly.io initially; dedicated later

## Phase 1 — Foundation (Weeks 1–4)

Goal: a Kavacha-branded Firefox fork.

- Fork Zen: clone upstream, establish update strategy, create build pipeline
  → deliverable: **Kavacha Nightly builds**
- Branding replacement: app name, logos, icons, splash, about page, default URLs
  (`browser/branding/`)
- Build automation for Windows/macOS/Linux:
  push → build → test → installer → publish artifact

## Phase 2 — Core UX (Months 2–4)

Goal: the best browser workspace experience.

- **Workspace system:** user-created environments (Personal, Work, School, Research),
  each owning tabs, cookies, extensions, theme, search provider, settings.
  Sidebar UI; create/rename/delete/switch; `Ctrl+Shift+W`.
  Data model: `ui/workspaces/workspace.schema.json`.
- **Advanced tabs:** vertical tabs by default; tab groups (collapse, rename, color,
  drag/drop); memory management — inactive 30 min → save state → unload → restore on
  activation.

## Phase 3 — Customization Engine (Months 4–6)

Kavacha's main differentiator.

- **Customization Studio:** visual browser editor — Layout (sidebar/tabs/toolbar),
  Themes (colors/fonts/animations), Advanced (CSS/components).
- **Layout engine:** stored layouts (`{sidebar, sidebarWidth, tabStyle, density}`);
  move panels, resize components, hide elements.
- **Theme system:** package = `manifest.json` + `colors.json` + `icons/` + `fonts/` +
  `style.css`.
- **Community themes** (later in phase): marketplace — upload, rate, install, update.

## Phase 4 — Privacy Platform (Months 6–8)

- **Privacy dashboard:** protection report (trackers blocked, fingerprint attempts
  prevented, cookies isolated).
- **Permission manager:** central dashboard for camera, microphone, location,
  notifications, clipboard.
- **Search:** Brave Search default (`{"default": "brave"}`); available: Brave,
  DuckDuckGo, Kagi, Startpage, Google.

## Phase 5 — Kavacha Account (Months 8–10)

- **Authentication:** account creation, login, device management.
  Browser → Auth API → encrypted account database.
- **E2E-encrypted sync:** settings, themes, bookmarks, workspaces.
  Not synced initially: passwords, history.
  Client generates key → encrypts → uploads ciphertext; server stores encrypted blobs only.

## Phase 6 — AI Layer (Months 10–12)

Local AI via Ollama / llama.cpp.

- **Page summarization:** HTML → extraction → local model → summary
- **History search:** "Find that article about batteries" over local history,
  bookmarks, saved pages
- **Tab assistant:** "Group my tabs", "Close irrelevant tabs", "Summarize research"

## Phase 7 — Ecosystem Expansion (Year 2+)

- **Kavacha Mail:** private email, aliases, encryption
- **Kavacha Drive:** cloud storage, file sharing, encryption
- **Kavacha Identity:** password manager, passkeys, digital identity

## Testing Strategy

- Every release: unit tests, UI tests, security tests
- Compatibility: top 100 websites
- Performance targets: startup < 2 s; memory comparable to Firefox; crash rate < 0.5 %

## Security Requirements (mandatory)

Code signing · reproducible builds · dependency auditing · security disclosure program

## Release Strategy

1. **Developer Preview** — developers, privacy enthusiasts
2. **Beta** — power users
3. **Public Release** — Windows, macOS, Linux

## Team Requirements

1. Browser engineer — Firefox internals, Rust, JS/CSS
2. Backend/security engineer — Rust, cryptography, infrastructure
3. UX engineer — browser UI, design systems

## MVP Definition

Kavacha v1.0 ships when it has:

- [ ] Firefox/Zen foundation
- [ ] Vertical tabs
- [ ] Workspaces
- [ ] Tab groups
- [ ] Customization Studio
- [ ] Theme engine
- [ ] Privacy dashboard
- [ ] Brave Search default
- [ ] No telemetry by default
- [ ] Windows/macOS/Linux builds

Everything else is later.

## The One-Sentence Product Goal

**Build the first browser where privacy is automatic, customization is limitless, and
the user's digital environment belongs entirely to them.**
