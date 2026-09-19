# Kavacha

**Your personal operating system for the internet.**

Kavacha is a user-owned digital environment — a Firefox-based browser where privacy is
automatic, customization is limitless, and your digital environment belongs entirely to
you. Not another Firefox fork, but the foundation of an ecosystem: see
[DIFFERENTIATION.md](documentation/DIFFERENTIATION.md) for how Kavacha differs from
Zen, Brave, and Firefox, and [FEATURES.md](documentation/FEATURES.md) for the full
feature inventory.

> **Status: Pre-alpha — re-platforming onto Firefox ESR 153 (2026-09-19).** Phases 1–4, 6
> and 7 were built as an overlay on Zen Browser; that base is retired
> ([ADR 0020](documentation/decisions/0020-firefox-esr-direct-overlay.md)) and the feature
> set is being ported to a direct Firefox overlay, milestone by milestone, with native
> Windows support arriving first. Nothing is shippable yet, because no update service exists
> to deliver a security fix. **[Shipping](documentation/SHIPPING.md)** is what stands between
> a build and a release; **[Remaining Work](documentation/REMAINING_WORK.md)** is the open
> defect and feature list. The [Master Plan](documentation/MASTER_PLAN.md) and
> [Roadmap](documentation/ROADMAP.md) hold the rationale and the record of what is done.
> Year-2+ products (Mail, Drive, Identity) are gated in
> [ECOSYSTEM.md](documentation/ECOSYSTEM.md) and are **not** current work.

## What Kavacha is

A highly customizable browser built directly on **Firefox ESR**, combining:

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
├── browser/            Firefox integration layer
│   ├── branding/       Kavacha name, logos, URLs, app identity
│   ├── overlay/        Kavacha-authored files, mirrored onto the Firefox tree (no patches)
│   ├── patches/        The few patches to files Firefox itself tracks
│   └── patches-zen/    The retired Zen-era series, reference only until parity
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

Kavacha does not vendor Firefox source in this repository. The bootstrap script fetches
Firefox ESR at a pinned commit, lays Kavacha's overlay and patches on it, and drives `mach`.

**Prerequisites:** ~40 GB free disk and Git. `mach bootstrap` fetches the compilers.
(macOS: Xcode Command Line Tools. Windows: MozillaBuild, run the commands in its shell.
Linux: build essentials + GTK dev headers.)

```bash
./build/bootstrap.sh setup  # fetch Firefox at the pin, copy overlay, apply patches, brand, mach bootstrap
./build/bootstrap.sh build  # full build (first build takes 1–4 hours)
./build/bootstrap.sh start  # run the browser
./build/bootstrap.sh fast   # repackage after JS/CSS/FTL/XHTML-only changes
```

See [build/README.md](build/README.md) for details and the patch workflow.

## License

[MPL-2.0](LICENSE) — the same license as Firefox and Zen Browser.
