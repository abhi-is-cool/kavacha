# ADR 0010 — Component Marketplace (about:marketplace)

**Status:** Accepted · 2026-07-17

## Context

Phase 3 ships the customization *engines* (layout, patch 0022; theme, patch
0023 — [ADR 0008](0008-customization-engines.md)) and the visual editor over
them (about:studio, patches 0024/0025 — [ADR 0009](0009-customization-studio.md)).
ADR 0008 and ADR 0009 both named the marketplace as the remaining Phase-3 brick
and both scoped it, at the time, to *themes*. This ADR supersedes that
theme-only framing: the marketplace is now a **component** marketplace covering
themes, layouts, sidebar widgets, tool panels, and bundles that combine them
(the ROADMAP's "Research Mode" example).

Open questions this ADR settles: what a "component" is when the pieces are as
different as a color package and a layout preset; where a marketplace fits
without accounts or a network (both Phase 5); how it applies a component when
two engines already own application; and how installed components reach the
command palette without re-touching the registry or localization files.

## Decision

**Offline-first: a bundled, trusted catalog installed into the profile.**
Accounts, remote submission, ratings, and auto-update are all Phase 5. So
`KavachaMarketplace.sys.mjs` (a process singleton, same shape as the other
engines) ships a first-party **`BUILTIN_CATALOG`** array and installs entries
locally. Installed state is profile-local:

- `kavacha-marketplace/installed.json` — `{ installed: ["id", ...] }`.
- `kavacha-marketplace/catalog/<id>/` — optional sideloaded packages, discovered
  the way `KavachaThemeEngine` scans profile `kavacha-themes/`. Discovery is
  implemented but intentionally minimal; the shipped catalog is the built-in
  array.

**No new application path — the marketplace delegates to the existing engines.**
A component is `{ id, type, name, description, author, version, payload }`.
`apply(id)` dispatches on `type`:

- `theme` → `payload.builtinThemeId` → `KavachaThemeEngine.setActiveTheme`.
- `layout` → `payload` is a partial layout doc → `KavachaLayoutEngine.setLayout`
  (the engine merges + persists + bumps its own revision).
- `bundle` → `payload.steps[]` are applied in order through those same two
  calls. A bundle only *sequences* effects; there is no bundle-specific
  application logic. The shipped `research-mode` bundle is the Forest theme plus
  a comfortable reading layout.

Because application is entirely the engines' existing public APIs, the
marketplace holds no rendering state and cannot drift from about:studio or the
palette — they all drive the same engines.

**Component-type taxonomy, with reserved-but-hostless types.**
`KavachaComponentType` enumerates `theme`, `layout`, `bundle`, `widget`, and
`panel`. Only the first three have installers and catalog entries. **`widget`
and `panel` are reserved but hostless**: there is no sidebar-widget or tool-panel
host engine yet, so nothing could apply them. They exist in the enum now so the
taxonomy — and future package validation — is stable before their hosts land;
`install()` of such a type throws, and the bundled catalog carries none.

**Dogfooding the completed command registry (patch 0027) via source
attribution.** Each installed component registers an `"Apply: <name>"` palette
command through `KavachaCommandRegistry.register(cmd, { source: "marketplace:<id>" })`.
Uninstall drops the whole group with `unregisterBySource("marketplace:<id>")` —
exactly the plugin/marketplace revocation path 0027 built. Runtime commands
cannot add `.ftl` keys, so they carry a literal `rawLabel` and use `l10nId` as
identity only (the 0027 contract). A single `"Open Marketplace"` entry command
is registered once in `init()` under its own source (`kavacha-marketplace`);
registering it at runtime — rather than as a registry built-in — keeps this
patch from editing `KavachaCommandRegistry.sys.mjs` or the palette `.ftl`, and
decouples it from the SDK work (patch 0029). `init()` re-registers every
installed component's command at startup (the registry is per-process and starts
empty each launch) and reconciles on the `kavacha.marketplace.revision`
doorbell.

**about:marketplace is a privileged chrome page, like about:studio.**
`KavachaAboutMarketplace.sys.mjs` is a JS `nsIAboutModule` registered through
`components.conf` (contract `@mozilla.org/network/protocol/about;1?what=marketplace`,
a fresh cid), resolving `about:marketplace` to
`chrome://browser/content/kavacha-marketplace/marketplace.html` with
`ALLOW_SCRIPT | IS_SECURE_CHROME_UI`. No Gecko C++ redirector edit (MASTER_PLAN
Principle 1), identical to about:studio. The page runs with the system principal
and drives `KavachaMarketplace` directly; it renders the catalog grouped by type
(Themes / Layouts / Bundles) with Install|Remove + Apply controls, and observes
the revision pref to re-render.

**Trust boundary.** The bundled catalog is first-party and trusted. A sideloaded
theme package's manifest is validated against
`customization/themes/theme-manifest.schema.json` and its `style.css` is loaded
sandboxed as a chrome-only `AUTHOR_SHEET` (never web content, never script) —
the guarantees `customization/README.md` states for marketplace submissions.

## Consequences

- One marketplace surface covers every customization component, superseding the
  theme-only marketplace named in ADRs 0008/0009. Adding a new *applicable* type
  later means adding a host engine and one `switch` arm — installed-command
  wiring, state, and the page grouping already generalize over `type`.
- The marketplace has no state of its own beyond `installed.json`; it is a thin
  installer + dispatcher over the Theme/Layout engines and the command registry.
  This mirrors how about:studio is a thin view over the same engines.
- **Deferred to Phase 5 (accounts):** remote install, submission, ratings, and
  auto-update. `version` is carried on every component so update logic has a
  field to compare, but nothing checks it yet.
- **Known limitation:** `widget` and `panel` are reserved but cannot be
  installed or applied until their host engines exist; attempting to install one
  throws. This is deliberate — the type is declared before the mechanism so the
  taxonomy is stable, not faked.
- **Known limitation:** uninstalling a component never reverts the browser's
  current look. A theme or layout it applied stays until the user changes it,
  because the Theme/Layout engines own that state — the marketplace only installs
  and applies.
- Like 0022–0027, this patch was authored without a local build. It is
  `git apply`-consistent (numstat-validated; the four modified-file hunks apply
  against reconstructed context) but not yet Marionette-verified; the ROADMAP
  entry carries that gate.
