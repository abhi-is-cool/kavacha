# ADR 0011 — Kavacha SDK, plugin permission model, and about:plugins

**Status:** Accepted · 2026-07-17

## Context

Phase 3 has shipped the customization engines (ADR 0008), the Customization
Studio and safe CSS editor (ADR 0009), the completed command registry
(patch 0027), and the component marketplace (patch 0028). PLATFORM_PLAN.md § 7
("Plugin ecosystem — SDK + permission model") names the next brick: a Kavacha
SDK exposing *workspaces / tabs / notes / commands* behind **explicit per-plugin
permissions**, and it is emphatic about the boundary — *"never passwords or
private data."*

Open questions this ADR answers: what surface plugins get (and, crucially, what
they can never get); how permissions are requested, granted, and persisted; how
a plugin's commands reach and leave the palette; where plugins come from; and
where a management UI lives without touching the Gecko engine.

## Decision

**The SDK is the only sanctioned surface.** A plugin never touches Gecko, the
DOM, or Kavacha's engines directly. It exports `activate(sdk)` (and optionally
`deactivate()`), and the `sdk` it receives is `KavachaSDK.forPlugin(id)` — a
small facade with exactly four capability groups:

- `workspaces` — `list()`, `current()`, `createFromTemplate(kind)`. Read plus
  **safe create only**; there is deliberately no delete/archive.
- `tabs` — `list()`, `open(url)`, `close(tabId)` on the active window. `open`
  validates the scheme: **http / https / about only**, never `file://` or
  `chrome://`.
- `notes` — `read()` / `write(text)` for the current workspace's note.
- `commands` — `register({ label, run })`, adding a Cmd+K command.

Every method first checks the plugin's **live** grants via
`KavachaPluginPermissions.hasPermission(id, …)` and throws if the capability was
not granted, so a permission revoked at runtime fails the plugin's very next
call.

**Passwords, history, and autofill are structurally excluded — not policy-gated.**
The grantable permission enum is precisely `workspaces | tabs | notes | commands`
(`KAVACHA_GRANTABLE_PERMISSIONS`). There is no enum value for passwords, saved
credentials, autofill, or raw browsing history, and there is no SDK method that
could reach them. `assertNeverSensitive(perms)` rejects anything outside the
enum as defense-in-depth, so even a malformed manifest or a buggy caller cannot
smuggle a sensitive capability into storage. Widening the surface means adding a
capability to the enum on purpose — it can never happen by configuration.

**Permissions are per-plugin, user-granted, and persisted in the profile.**
`kavacha-plugins/grants.json` holds
`{ "<pluginId>": { granted: ["workspaces", …], ts: <epoch ms> } }`. The
`grant(id, perms)` path (the *only* privilege-widening path) runs the request
through the validator and then enables the plugin. IO mirrors the other engines
(IOUtils/PathUtils, profile-relative; ADR 0008). The grant copy shown at
about:plugins names each capability's *limit*, so the user grants with eyes open.

**Command registration + revocation dogfood the patch-0027 registry.** A plugin
command is registered with a literal `rawLabel` (runtime commands can't add
`.ftl` keys), an identity `l10nId` (`kavacha-plugin-<id>-<slug>`), the
`AUTOMATION` domain, the `commands` capability, and — critically —
`{ source: "plugin:<id>" }`. Disabling or uninstalling a plugin calls
`KavachaCommandRegistry.unregisterBySource("plugin:<id>")`, so every command it
added leaves the live palette immediately. The registry source is the source of
truth, so this holds even if the plugin's `deactivate()` is buggy or absent.

**about:plugins is a JS `nsIAboutModule`, exactly like about:studio (ADR 0009).**
`KavachaAboutPlugins.sys.mjs` binds
`@mozilla.org/network/protocol/about;1?what=plugins` to a privileged chrome page
(`ALLOW_SCRIPT | IS_SECURE_CHROME_UI`, fresh cid distinct from about:studio's) —
no `nsAboutRedirector.cpp` edit, so MASTER_PLAN Principle 1 holds. The page runs
with the system principal and `ChromeUtils.importESModule`s the plugin manager
and permission model to list plugins, show each declared permission with a
plain-language explanation, grant/revoke, enable/disable, and uninstall.

**Sideload now; marketplace distribution later.** Plugins are sideloaded into
`kavacha-plugins/<id>/` (manifest `kavacha-plugin.json` +
`entry` ES module). The manager (`KavachaPluginManager`, a process singleton
init'd from ZenStartup after the marketplace) scans that directory and activates
each plugin that is both **enabled** (`kavacha-plugins/state.json`) and holds at
least one grant. Installing plugins *from* the marketplace (patch 0028) is a
later integration.

## Consequences

- The plugin surface is small and auditable: four capabilities, one facade, one
  enforcement point. Adding a capability is a deliberate enum change plus one
  facade method — visible in review, never a config toggle.
- **Known limitation (hardening follow-up):** granted plugins currently run in
  the parent module scope — they are *trusted-on-grant sideloads*, and the SDK
  is the only *sanctioned* surface, not yet an *enforced* boundary. A real JS
  isolation boundary (a separate compartment/sandbox per plugin) is the next
  security brick, and remote/marketplace install **must** land behind it. Until
  then: only sideload plugins you trust.
- **Known limitation:** `sdk.notes.write(text)` needs a public
  `gZenWorkspaces.kavachaSetNote(uuid, text)` accessor (patch 0008 keeps the
  notes JSONFile private and only writes through the panel). The SDK reads notes
  today via `kavachaGetAllNotes()` and throws a clear error on `write` until the
  setter lands; it deliberately does not reach into private fields.
- Like the other Phase-3 patches, 0029 was authored without a local build. It is
  `git apply`-clean against the reconstructed post-0028 tree but not yet
  Marionette-verified; the ROADMAP entry carries that gate.
