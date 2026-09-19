# Kavacha Patches (Firefox ESR series)

Ordered patches applied on top of the pinned Firefox ESR checkout by `build/bootstrap.sh`.
Started 2026-09-19 with the move off Zen ([ADR 0020](../../documentation/decisions/0020-firefox-esr-direct-overlay.md));
the retired Zen-era series is in [`../patches-zen/`](../patches-zen/README.md) for reference
until parity.

Naming: `NNNN-short-kebab-name.patch`, applied in numeric order.

**A patch is only for a file Firefox tracks.** Everything Kavacha authors — modules, pages,
styles, locale files, manifests — is a plain file under [`../overlay/`](../overlay/) and is
copied onto the checkout, never diffed. Prefer, in order:

1. Prefs (`privacy/tracker-controls/kavacha.js`, `ui/defaults/kavacha-ux.js`) — survive every upstream update
2. Branding config (`browser/branding/`)
3. Overlay files (`browser/overlay/`)
4. A patch — only when a tracked Firefox file must change

Every patch must begin with a header comment stating what it does, why an overlay/pref could
not do it, and which upstream files it touches. Regenerate with
`./build/bootstrap.sh patch-export NNNN-name`; `./build/bootstrap.sh roundtrip` must pass.

## Current patches

| Patch | Purpose |
|---|---|
| *(none yet — the series starts at port milestone M2)* | |

Planned first entries: `0001-build-wire-kavacha-component` (`browser/components/moz.build`
`DIRS`), `0002-browser-xhtml-kavacha-include` (one `<script>` + one `<link>`),
`0003-preferences-kavacha-panes` (`preferences.xhtml`/`.js`/`jar.mn`),
`0004-search-config-brave-default` (`services/settings/dumps/main/search-config-v2.json`).
