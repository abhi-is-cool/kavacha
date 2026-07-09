# Kavacha

**Your personal operating system for the internet.**

Kavacha is a user-owned digital environment — a Firefox-based browser where privacy is
automatic, customization is limitless, and your digital environment belongs entirely to
you. Not another Firefox fork, but the foundation of an ecosystem: see
[DIFFERENTIATION.md](documentation/DIFFERENTIATION.md) for how Kavacha differs from
Zen, Brave, and Firefox, and [FEATURES.md](documentation/FEATURES.md) for the full
feature inventory.

> **Status: Pre-alpha — Phase 1 (Foundation).** Nothing is shippable yet. See the
> [Master Plan](documentation/MASTER_PLAN.md) and [Roadmap](documentation/ROADMAP.md).

## What Kavacha is

A highly customizable browser built on [Zen Browser](https://github.com/zen-browser/desktop)
(itself a Firefox fork), combining:

- **Zen-style productivity UX** — vertical tabs, workspaces, compact density
- **Brave-level privacy defaults** — no telemetry, no ads, no tracking, out of the box
- **VS Code-level customization** — a visual Customization Studio, theme engine, live CSS
- **Local-first AI** — summarization, history search, and tab management via local models
- **User-controlled identity** — end-to-end encrypted sync; the server only ever sees ciphertext

## Strategic principles

1. **Never build a browser engine.** Kavacha is an experience layer over Gecko. We never
   modify the rendering engine, JS engine, or networking stack.
2. **Privacy is a default, not a feature.** Users should not have to configure privacy.
3. **Customization is the killer feature.** Privacy gets users interested; customization
   makes them stay.

## Repository structure

```
kavacha/
├── browser/            Firefox/Zen integration layer
│   ├── branding/       Kavacha name, logos, URLs, app identity
│   └── patches/        Kavacha patches applied on top of upstream Zen
├── ui/                 Experience layer UI
│   ├── sidebar/        Workspace + tab sidebar
│   ├── tabs/           Vertical tabs, groups, memory management
│   ├── workspaces/     Workspace system (data model + manager)
│   ├── command-palette/
│   └── settings/
├── customization/      The Customization Studio
│   ├── themes/         Theme engine + bundled themes
│   ├── css-editor/     Live userChrome CSS editing
│   └── layout-engine/  Movable/resizable UI layout system
├── privacy/            Privacy platform
│   ├── tracker-controls/  Hardened default prefs
│   ├── dashboard/      Protection report UI
│   └── permissions/    Central permission manager
├── sync/               E2E-encrypted sync (Phase 5)
├── ai/                 Local AI layer (Phase 6)
├── build/              Bootstrap + build tooling
└── documentation/      Plans, architecture, ADRs
```

## Getting started (development)

Kavacha does not vendor Firefox/Zen source in this repository. The bootstrap script
fetches upstream and applies Kavacha's overlay.

**Prerequisites:** ~30 GB free disk, Git, Python 3, Node.js 21+, Rust/Cargo, sccache.
(macOS: Xcode Command Line Tools. Windows: MozillaBuild + VS C++ workload.)

```bash
./build/bootstrap.sh        # clone upstream Zen, install deps, init Firefox source
./build/bootstrap.sh build  # full build (first build takes 1–3 hours)
./build/bootstrap.sh start  # run the browser
./build/bootstrap.sh ui     # fast rebuild after UI-only changes
```

See [build/README.md](build/README.md) for details and the patch workflow.

## License

[MPL-2.0](LICENSE) — the same license as Firefox and Zen Browser.
