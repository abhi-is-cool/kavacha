# Kavacha Patches

Ordered patches applied on top of upstream Zen Browser by `build/bootstrap.sh`.

Naming: `NNNN-short-kebab-name.patch`, applied in numeric order.

**Patches are a last resort.** Prefer, in order:

1. Prefs (`privacy/tracker-controls/kavacha.js`) — survive every upstream update
2. Branding config (`browser/branding/`)
3. Chrome CSS/JS overlays (`ui/`, `customization/`)
4. A patch — only when the change cannot be expressed any other way

Every patch must begin with a header comment stating what it does, why an
overlay/pref could not do it, and which upstream files it touches.

## Current patches

| Patch | Purpose |
|---|---|
| `0001-branding-kavacha.patch` | Register the `kavacha` brand in Zen's build config (surfer.json) |
| `0002-strip-phone-home-endpoints.patch` | Point `updateHostname` at updates.kavacha.app so installs stop pinging Zen's update server; fails closed until Kavacha update infra exists |
| `0003-workspace-search-engine.patch` | Per-workspace search engine: optional `searchProvider` on the space object, applied at the workspace-switch chokepoint, with a "Set Search Engine" submenu in the space actions menu (Phase 2 Workspace Identities) |
| `0004-workspace-extensions.patch` | Per-workspace extension set (ADR 0003 prototype): optional `extensions` allowlist on the space object, addons toggled globally at switch time; only re-enables addons Kavacha itself disabled, never overriding user global disables |
| `0005-workspace-settings.patch` | Per-workspace setting overrides — curated allowlist only (website color scheme, autoplay, notification prompts, password saving, search suggestions), applied at switch with baseline restore; "Workspace Settings" submenu |
| `0006-workspace-templates.patch` | Workspace templates: Student/Developer/Private presets in the create (+) menu; each creates a space with a dedicated container, themed gradient, search engine and settings overrides — a complete identity in one click |
| `0007-command-registry-templates.patch` | Command-registry start: template creation exposed as commands in Zen's palette ("New Space from Template: …") |
| `0008-workspace-notes.patch` | Workspace notes (MVP): autosaving notes panel per space, opened from the space actions menu or the palette; stored locally in profile `kavacha-notes.json`, never on the synced space object |
| `0009-workspace-archiving.patch` | Workspace archiving (MVP): archived spaces vanish from strip/navigation with tabs unloaded, but keep all data and stay in session store + sync; restore via "Archived Spaces" submenu |
| `0010-horizontal-tabs.patch` | Horizontal tabs mode — Kavacha's default look (`zen.tabs.vertical=false` shipped in branding prefs). Functionally verified: strip, navigation, content, workspace switching. Vertical remains one pref away |
| `0022-layout-engine.patch` | Layout engine: KavachaLayoutEngine applies a per-profile kavacha-layout.json to chrome live (tab orientation, density, sidebar, hidden elements) with palette commands; the CSS layer is gated on non-default attributes so it is a no-op at the default look (ROADMAP Phase 3; ADR 0008) |
| `0023-theme-engine.patch` | Theme engine: KavachaThemeEngine loads theme packages and applies the active one live by overriding patch 0016's base `--kavacha-*` tokens; bundles a second dark theme (Forest) + loads user themes from the profile; "Switch Theme" command; accent stays user-owned (ROADMAP Phase 3; ADR 0008) |
| `0026-chrome-polish.patch` | Chrome-familiarity polish: global kavacha-polish.inc.css adds hover/press states, a faint liquid-glass tab divider, softer selection, smaller/spaced nav icons, and reduced-motion-gated animations (new-tab, panel pop, press); KavachaThemeEngine derives chrome `color-scheme` from the active surface's luminance so text stays readable on dark themes and bright about:studio surfaces alike. All local, no data (ROADMAP Phase 3; ADR 0008) |
| `0045-fix-d8-usercss-history-race.patch` | Fix D8: serialize KavachaUserCSS mutations so two saves in flight cannot both skip the history snapshot; read the previous text from disk rather than the observer-invalidated cache; record the empty baseline so a first save is revertible |
| `0046-documented-accent-fallback-token.patch` | Replace three separately hardcoded `#8b7bd8` accent fallbacks with a documented `--kavacha-accent-fallback` token, so "no accent chosen yet" is a defined state (ROADMAP Phase 3 defect) |
| `0047-brave-search-default.patch` | Brave Search as the shipped default with DuckDuckGo/Kagi/Startpage/Google bundled and switchable from the Privacy Center; adds `add`/`patch` operations to Zen's dump merger, since upstream carries neither Brave nor Kagi and defaulted to Google (ROADMAP Phase 4) |
| `0048-central-permission-manager.patch` | Central permission dashboard over `nsIPermissionManager` — global default per capability, per-site exceptions, per-type and global clear. Clipboard is deliberately absent: Firefox 152 does not persist it as a site permission (ROADMAP Phase 4) |
| `0049-session-scoped-cookie-rules.patch` | Session-scoped cookie deletion (FEATURES 3.3): per-site Keep / Session only / Block over Gecko's `cookie` permission, plus a delete-on-close switch that drives both required prefs without disabling unrelated clearing |
| `0050-privacy-score-and-site-profiles.patch` | Privacy score (FEATURES 3.2) with a fix-it list, and per-site trust profiles (3.4) doubling as the per-site drilldown; adds encrypted DNS and delete-cookies-on-close to the posture list (ROADMAP Phase 4) |
| `0051-space-container-sharing-and-description.patch` | Named container sharing across Spaces: the space-actions submenu now says which other Spaces share each container and can create the first one, and warns before a switch (containers are separate first-party cookie jars, so a move reads as being signed out). Also makes patch 0014's Space description editable and, for the first time, visible — as the strip button's tooltip |
| `0052-markdown-workspace-notes.patch` | Markdown preview for workspace notes. New `KavachaMarkdown` renderer builds DOM nodes and never parses HTML — the notes panel is chrome, so innerHTML on note text would be script execution with system privileges; link hrefs restricted to http/https/mailto, recursion depth-capped |
| `0053-template-extension-recommendations.patch` | Recommended extensions per workspace template. Deferred at 0006 "until the marketplace could install them" — but the marketplace installs Kavacha components, not WebExtensions, so this routes through the real installer: "Get extension" opens the AMO listing and Firefox's own permission prompt. Nothing is installed automatically |
| `0054-research-continuity.patch` | Closes all four Phase 2.5 follow-ups: branch lineage in the Space strip (0020 wrote `parentSpaceId` and nothing ever read it), pinned-tab fidelity on branch (0019 captured `pinned`, 0020 ignored it), compare-with-parent and discard-branch, and step-through timeline replay |
| `0055-search-and-palette.patch` | Universal search gets its own rebindable shortcut (KBS migration 19→20, ships unbound) and an "only this Space" scope toggle; the palette finally RENDERS the group labels 0027 has been stamping since then (clustering by domain so a header means something); snapshot/branch/timeline become per-Space context-menu entries |
| `0056-customization-polish.patch` | Light themes — the light half of patch 0016's token bridge, gated on a mode the engine DERIVES from surface luminance, plus a built-in light theme; CSS syntax highlighting in the Studio (transparent textarea over a scroll-synced highlight layer, nodes not innerHTML); active-tab emphasis on three channels; a once-per-profile coach mark on the ⚙ button. Also repoints eleven palette icons that pointed at SVGs which do not exist |
| `0057-widget-host.patch` | The widget host ADR 0010 said was missing, unblocking the reserved `widget` and `panel` marketplace component types and user-arrangeable dashboards. Contract is `{id, name, render(doc, win) -> Node}` and nothing more; arrangement lives in the layout document |
| `0058-arc-style-tabs.patch` | Arc-style tabs as a layout-engine capability. Arc is not a third orientation — it is vertical tabs with a different presentation, so it sets the same `zen.tabs.vertical` pref and stamps `kavacha-tab-style` for a CSS layer, which is what made it small |
| `0059-settings-pane-scope-collision.patch` | **Settings was dead.** `kavacha-privacy.js` and upstream `search.js` both declared `const lazy` at top level, and every pane script shares one global scope — so the file never parsed, `gKavachaPrivacyCenter` stayed undefined, and the bare `register_module()` call for it threw and aborted `init_all()`, killing every pane after it (three Kavacha panes, Labs, Sync). Renames to `kavachaLazy` and makes pane registration `typeof`-guarded so one broken pane costs one pane |

Audit note (2026-07-09): Zen's tracked sources contain no analytics/crash SDKs.
Mozilla telemetry is already compiled out by Zen's build config; remaining automatic
Mozilla endpoints (region ping, contile, system add-on updates, Windows default-browser
agent) are disabled via prefs in `privacy/tracker-controls/kavacha.js`. Deliberately
kept: Safe Browsing, Remote Settings, extension version checks (they protect users).
Zen mods auto-update stays enabled — it only fires for user-installed mods and stale
mods are a security risk.
