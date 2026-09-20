// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Kavacha component marketplace (ROADMAP Phase 3 "Component marketplace";
// ADR 0010). Offline-first: it ships a BUNDLED, trusted catalog of components
// and installs them into the profile. It has NO application path of its own —
// every component delegates to an engine that already ships (KavachaThemeEngine
// patch 0023, KavachaLayoutEngine patch 0022). Remote install, ratings, and
// auto-update arrive with Kavacha accounts in Phase 5.
//
// Component types (KavachaComponentType):
//   theme  -> payload { builtinThemeId }; apply = KavachaThemeEngine.setActiveTheme.
//   layout -> payload is a partial layout doc; apply = KavachaLayoutEngine.setLayout.
//   bundle -> payload { steps:[{type, ...}] }; apply runs each step in order.
//   widget  -> payload { builtinWidgetId }; apply = KavachaWidgetHost.
//     Unblocked by patch 0057, which supplied the host ADR 0010 said was
//     missing. A `widget` component adds a card to the dashboard.
//   panel   -> payload { widgets: ["id", ...] }; apply = the same host, as a
//     whole dashboard ARRANGEMENT rather than a single card. A "panel" is a
//     curated set, which is what the reserved type was always for.
//
// State (profile, local-only until Phase 5 sync):
//   kavacha-marketplace/installed.json  -> { installed: ["id", ...] }
//   kavacha-marketplace/catalog/<id>/   -> optional sideloaded packages,
//     discovered the way KavachaThemeEngine scans profile kavacha-themes/.
//
// Trust: the bundled catalog is first-party and trusted. A sideloaded theme
// package's manifest is validated against
// customization/themes/theme-manifest.schema.json and its style.css is loaded
// sandboxed as a chrome-only AUTHOR_SHEET (never web content, never script) —
// the same guarantees customization/README.md states for the marketplace.
//
// Dogfooding patch 0027: each installed component registers an "Apply: <name>"
// palette command attributed to source "marketplace:<id>", so uninstall drops
// it as a group via KavachaCommandRegistry.unregisterBySource. Runtime commands
// cannot add .ftl keys, so they carry a literal rawLabel and use l10nId only as
// identity (patch 0027).

const { KavachaThemeEngine } = ChromeUtils.importESModule(
  "resource:///modules/KavachaThemeEngine.sys.mjs"
);
const { KavachaLayoutEngine } = ChromeUtils.importESModule(
  "resource:///modules/KavachaLayoutEngine.sys.mjs"
);
const { KavachaWidgetHost } = ChromeUtils.importESModule(
  "resource:///modules/KavachaWidgetHost.sys.mjs"
);
const { KavachaCommandRegistry, KavachaCommandDomain } =
  ChromeUtils.importESModule(
    "resource:///modules/KavachaCommandRegistry.sys.mjs"
  );
const { JsonSchema } = ChromeUtils.importESModule(
  "resource://gre/modules/JsonSchema.sys.mjs"
);

// A sideloaded component.json is untrusted third-party data, so it is
// validated FAIL-CLOSED before it is listed (ADR 0010): an invalid package is
// skipped, never surfaced. The bundled catalog is first-party and skips this.
// `type` must be a known value and `payload` an object; the rest are the
// descriptor fields the listing renders. additionalProperties stays open —
// per-type payloads vary, and _applyComponent + APPLICABLE_TYPES already gate
// what a type may actually do.
const COMPONENT_MANIFEST_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  required: ["type", "name", "version"],
  properties: {
    type: {
      type: "string",
      enum: ["theme", "layout", "bundle", "widget", "panel"],
    },
    name: { type: "string", minLength: 1, maxLength: 80 },
    version: { type: "string", pattern: "^\\d+\\.\\d+\\.\\d+$" },
    description: { type: "string", maxLength: 500 },
    author: { type: "string" },
    payload: { type: "object" },
  },
};

const kRevisionPref = "kavacha.marketplace.revision";
const kMarketDir = "kavacha-marketplace";
const kInstalledFile = "installed.json";
const kCatalogDir = "catalog";

// Component type taxonomy. All five have installers as of patch 0057.
export const KavachaComponentType = Object.freeze({
  THEME: "theme",
  LAYOUT: "layout",
  BUNDLE: "bundle",
  WIDGET: "widget", // one dashboard card (KavachaWidgetHost)
  PANEL: "panel", // a whole dashboard arrangement (KavachaWidgetHost)
});

// Types this engine can actually apply. A component whose type is not in this
// set (an unknown sideloaded type) is listed but not installable — the
// installer is the guard. widget/panel joined the set in patch 0057, once
// KavachaWidgetHost existed to apply them.
const APPLICABLE_TYPES = new Set([
  KavachaComponentType.THEME,
  KavachaComponentType.LAYOUT,
  KavachaComponentType.BUNDLE,
  KavachaComponentType.WIDGET,
  KavachaComponentType.PANEL,
]);

// The bundled, trusted catalog. theme payloads name a KavachaThemeEngine
// built-in (patch 0023); layout payloads are partial layout docs
// KavachaLayoutEngine.setLayout merges (patch 0022); the bundle sequences the
// two. No widget/panel entries — those types have no host engine yet.
const BUILTIN_CATALOG = [
  {
    id: "theme-midnight",
    type: KavachaComponentType.THEME,
    name: "Midnight",
    description: "Kavacha's default deep-indigo dark surface theme.",
    author: "Kavacha",
    version: "1.0.0",
    payload: { builtinThemeId: "kavacha-midnight" },
  },
  {
    id: "theme-forest",
    type: KavachaComponentType.THEME,
    name: "Forest",
    description: "A deep-evergreen dark theme — greener surfaces, warm accent.",
    author: "Kavacha",
    version: "1.0.0",
    payload: { builtinThemeId: "kavacha-forest" },
  },
  {
    id: "layout-focus-reading",
    type: KavachaComponentType.LAYOUT,
    name: "Focus Reading",
    description:
      "Comfortable density with a left sidebar — roomy and distraction-light.",
    author: "Kavacha",
    version: "1.0.0",
    payload: { density: "comfortable", sidebar: "left" },
  },
  {
    id: "layout-developer",
    type: KavachaComponentType.LAYOUT,
    name: "Developer",
    description:
      "Vertical tabs in a wide left sidebar — built for many tabs at once.",
    author: "Kavacha",
    version: "1.0.0",
    payload: { tabStyle: "vertical", sidebar: "left", sidebarWidth: 320 },
  },
  {
    id: "panel-research-desk",
    type: KavachaComponentType.PANEL,
    name: "Research Desk",
    description:
      "A dashboard for long-running research: the Space's note first, then its snapshots.",
    author: "Kavacha",
    version: "1.0.0",
    payload: { widgets: ["space-note", "timeline", "spaces"] },
  },
  {
    id: "widget-spaces",
    type: KavachaComponentType.WIDGET,
    name: "Spaces card",
    description: "Every Space, with branches marked, one click to switch.",
    author: "Kavacha",
    version: "1.0.0",
    payload: { builtinWidgetId: "spaces" },
  },
  {
    id: "research-mode",
    type: KavachaComponentType.BUNDLE,
    name: "Research Mode",
    description:
      "One click: the Forest theme plus a comfortable reading layout.",
    author: "Kavacha",
    version: "1.0.0",
    payload: {
      steps: [
        { type: KavachaComponentType.THEME, builtinThemeId: "kavacha-forest" },
        {
          type: KavachaComponentType.LAYOUT,
          density: "comfortable",
          sidebar: "left",
        },
      ],
    },
  },
];

export const KavachaMarketplace = {
  types: KavachaComponentType,

  _initialized: false,
  // Cache of installed ids (Set<string>); null until first load.
  _installed: null,
  // The "marketplace:<id>" sources we have registered palette commands under,
  // so a reconcile can drop the ones no longer installed.
  _commandSources: new Set(),

  init() {
    if (this._initialized) {
      return;
    }
    this._initialized = true;
    // The registry is per-process and starts empty every launch, so re-register
    // a palette command for each already-installed component and the single
    // "Open Marketplace" entry command.
    this._registerEntryCommand();
    this._loadInstalled()
      .then(() => this._reconcileCommands())
      .catch(e => console.error("KavachaMarketplace: init failed", e));
    // The content->chrome doorbell: about:marketplace bumps this pref; installed
    // state may also be hand-edited. Reload and reconcile on a bump.
    Services.prefs.addObserver(kRevisionPref, this);
  },

  observe(subject, topic, data) {
    if (topic === "nsPref:changed" && data === kRevisionPref) {
      this._installed = null;
      this._loadInstalled()
        .then(() => this._reconcileCommands())
        .catch(e => console.error("KavachaMarketplace: reload failed", e));
    }
  },

  // ----- Profile state ----------------------------------------------------

  get _dirPath() {
    return PathUtils.join(PathUtils.profileDir, kMarketDir);
  },
  get _installedPath() {
    return PathUtils.join(this._dirPath, kInstalledFile);
  },
  get _catalogPath() {
    return PathUtils.join(this._dirPath, kCatalogDir);
  },

  async _loadInstalled() {
    if (this._installed) {
      return this._installed;
    }
    let ids = [];
    try {
      const doc = JSON.parse(await IOUtils.readUTF8(this._installedPath));
      if (doc && Array.isArray(doc.installed)) {
        ids = doc.installed.filter(id => typeof id === "string");
      }
    } catch (e) {
      // First run (no file) or unreadable — start from an empty install set.
    }
    this._installed = new Set(ids);
    return this._installed;
  },

  async _saveInstalled() {
    await IOUtils.makeDirectory(this._dirPath, { ignoreExisting: true });
    await IOUtils.writeUTF8(
      this._installedPath,
      JSON.stringify({ installed: [...this._installed] }, null, 2)
    );
  },

  _bumpRevision() {
    Services.prefs.setIntPref(
      kRevisionPref,
      Services.prefs.getIntPref(kRevisionPref, 0) + 1
    );
  },

  // ----- Catalog ----------------------------------------------------------

  /** Built-in catalog plus any sideloaded packages under catalog/<id>/. */
  async getCatalog() {
    const catalog = BUILTIN_CATALOG.map(c => ({ ...c, builtin: true }));
    const seen = new Set(catalog.map(c => c.id));
    for (const component of await this._discoverUserComponents()) {
      if (!seen.has(component.id)) {
        catalog.push(component);
        seen.add(component.id);
      }
    }
    return catalog;
  },

  // Sideloaded packages live under kavacha-marketplace/catalog/<id>/ with a
  // component.json manifest — discovered the way KavachaThemeEngine scans
  // profile kavacha-themes/. Deliberately minimal: the descriptor is read but
  // the shipped catalog is the trusted built-in array. (A theme package's
  // manifest would be schema-validated and its style.css sandboxed before use;
  // built-in entries are trusted and skip that path.)
  async _discoverUserComponents() {
    const out = [];
    let children;
    try {
      children = await IOUtils.getChildren(this._catalogPath);
    } catch (e) {
      return out; // No sideload directory yet — fine.
    }
    for (const child of children) {
      try {
        const info = await IOUtils.stat(child);
        if (info.type !== "directory") {
          continue;
        }
        const id = PathUtils.filename(child);
        const manifest = JSON.parse(
          await IOUtils.readUTF8(PathUtils.join(child, "component.json"))
        );
        // Fail-closed: skip a package whose manifest does not validate.
        let check;
        try {
          check = JsonSchema.validate(manifest, COMPONENT_MANIFEST_SCHEMA);
        } catch (e) {
          continue;
        }
        if (!check.valid) {
          continue;
        }
        out.push({
          id,
          type: manifest.type,
          name: manifest.name || id,
          description: manifest.description || "",
          author: manifest.author || "Unknown",
          version: manifest.version || "0.0.0",
          payload: manifest.payload || {},
          builtin: false,
        });
      } catch (e) {
        // Skip a malformed package rather than failing the whole listing.
      }
    }
    return out;
  },

  /** Resolve an id to its component descriptor (built-in or sideloaded). */
  async resolveComponent(id) {
    return (await this.getCatalog()).find(c => c.id === id) || null;
  },

  // ----- Install state ----------------------------------------------------

  async getInstalled() {
    return [...(await this._loadInstalled())];
  },

  async isInstalled(id) {
    return (await this._loadInstalled()).has(id);
  },

  /**
   * Install a component: add it to the installed set, persist, register its
   * palette command, and bump the revision. An unknown sideloaded type throws
   * — there is no host that can apply it.
   */
  async install(id) {
    const component = await this.resolveComponent(id);
    if (!component) {
      throw new Error(`KavachaMarketplace: unknown component "${id}"`);
    }
    if (!APPLICABLE_TYPES.has(component.type)) {
      throw new Error(
        `KavachaMarketplace: component type "${component.type}" has no host yet`
      );
    }
    const installed = await this._loadInstalled();
    if (!installed.has(id)) {
      installed.add(id);
      await this._saveInstalled();
    }
    this._registerCommandFor(component);
    this._bumpRevision();
  },

  /**
   * Uninstall a component: remove it from the installed set, persist, drop its
   * palette command group and any custom widgets it registered, take a widget
   * component's card back off the dashboard, and bump the revision.
   *
   * A theme or layout the component applied stays put — reverting it would need
   * the pre-apply state, which the engines don't keep. A widget is different:
   * putting a card ON the dashboard is cleanly reversible (take it off), so an
   * uninstalled widget component leaves no card behind. A PANEL replaced the
   * whole arrangement with no memory of what preceded it, so it is left as-is
   * like a theme.
   */
  async uninstall(id) {
    const component = await this.resolveComponent(id);
    const installed = await this._loadInstalled();
    if (installed.has(id)) {
      installed.delete(id);
      await this._saveInstalled();
    }
    const source = "marketplace:" + id;
    KavachaCommandRegistry.unregisterBySource(source);
    this._commandSources.delete(source);
    // Drop any custom widgets this component registered (a future component
    // that brings its own widget definitions); a no-op for the built-in-
    // referencing components shipped today, but it completes the lifecycle the
    // widget host's register()/unregisterBySource() was built for.
    KavachaWidgetHost.unregisterBySource(source);
    // Take a widget component's built-in card back off the dashboard.
    if (
      component?.type === KavachaComponentType.WIDGET &&
      component.payload?.builtinWidgetId
    ) {
      await KavachaWidgetHost.toggle(component.payload.builtinWidgetId, false);
    }
    this._bumpRevision();
  },

  // ----- Application (delegates to the existing engines) ------------------

  /** Apply a component's effect through the engine that owns it. */
  async apply(id) {
    const component = await this.resolveComponent(id);
    if (!component) {
      throw new Error(`KavachaMarketplace: unknown component "${id}"`);
    }
    await this._applyComponent(component);
  },

  async _applyComponent(component) {
    switch (component.type) {
      case KavachaComponentType.THEME:
        await KavachaThemeEngine.setActiveTheme(component.payload.builtinThemeId);
        break;
      case KavachaComponentType.LAYOUT:
        await KavachaLayoutEngine.setLayout(component.payload);
        break;
      case KavachaComponentType.BUNDLE:
        await this._applyBundle(component.payload);
        break;
      case KavachaComponentType.WIDGET:
        // Applying a widget means putting its card ON the dashboard. Adding
        // it to the arrangement is the whole effect — the host owns what it
        // renders.
        await KavachaWidgetHost.toggle(component.payload?.builtinWidgetId, true);
        break;
      case KavachaComponentType.PANEL:
        // A panel is a curated ARRANGEMENT, so it replaces the list rather
        // than appending to it — that is what makes it one click.
        await KavachaWidgetHost.setEnabledIds(component.payload?.widgets || []);
        break;
      default:
        throw new Error(
          `KavachaMarketplace: no host for component type "${component.type}"`
        );
    }
  },

  // A bundle only sequences other component effects (Research Mode = a theme
  // step + a layout step); there is no bundle-specific application path, just
  // the same engine calls the individual types use.
  async _applyBundle(payload) {
    for (const step of payload?.steps || []) {
      if (step.type === KavachaComponentType.THEME) {
        await KavachaThemeEngine.setActiveTheme(step.builtinThemeId);
      } else if (step.type === KavachaComponentType.LAYOUT) {
        const { type, ...layoutPatch } = step;
        await KavachaLayoutEngine.setLayout(layoutPatch);
      } else if (step.type === KavachaComponentType.PANEL) {
        await KavachaWidgetHost.setEnabledIds(step.widgets || []);
      } else if (step.type === KavachaComponentType.WIDGET) {
        await KavachaWidgetHost.toggle(step.builtinWidgetId, true);
      }
      // Unknown/hostless step types are skipped.
    }
  },

  // ----- Palette commands (dogfoods the patch-0027 registry) --------------

  // One "Apply: <name>" command per installed component, sourced
  // "marketplace:<id>" so uninstall revokes it as a group. rawLabel because a
  // runtime command cannot add an .ftl key; l10nId is identity only (patch
  // 0027). Guarded against double-register with registry.has().
  _registerCommandFor(component) {
    const l10nId = "kavacha-marketplace-apply-" + component.id;
    if (KavachaCommandRegistry.has(l10nId)) {
      return;
    }
    const source = "marketplace:" + component.id;
    KavachaCommandRegistry.register(
      {
        l10nId,
        rawLabel: "Apply: " + component.name,
        command: () => this.apply(component.id),
        icon: "chrome://global/skin/icons/plugin.svg",
        domain: KavachaCommandDomain.APPEARANCE,
      },
      { source }
    );
    this._commandSources.add(source);
  },

  // The single entry command that opens about:marketplace. Registered once in
  // init() with its own source ("kavacha-marketplace"), decoupled from the per-
  // component commands. Registering it here (a runtime rawLabel command) avoids
  // editing KavachaCommandRegistry / the .ftl (that stays patch 0029's concern).
  _registerEntryCommand() {
    const l10nId = "kavacha-marketplace-open";
    if (KavachaCommandRegistry.has(l10nId)) {
      return;
    }
    KavachaCommandRegistry.register(
      {
        l10nId,
        rawLabel: "Open Marketplace",
        command: window =>
          window.switchToTabHavingURI("about:marketplace", true),
        icon: "chrome://global/skin/icons/plugin.svg",
        domain: KavachaCommandDomain.NAVIGATION,
      },
      { source: "kavacha-marketplace" }
    );
  },

  // Bring the live palette in line with the installed set: add a command for
  // every installed, applicable component that hasn't one, and drop any command
  // whose component is no longer installed (e.g. installed.json was hand-edited
  // and the revision bumped). Idempotent — has() guards the adds.
  async _reconcileCommands() {
    const installed = await this._loadInstalled();
    const wanted = new Set();
    for (const id of installed) {
      const component = await this.resolveComponent(id);
      if (component && APPLICABLE_TYPES.has(component.type)) {
        this._registerCommandFor(component);
        wanted.add("marketplace:" + id);
      }
    }
    for (const source of [...this._commandSources]) {
      if (!wanted.has(source)) {
        KavachaCommandRegistry.unregisterBySource(source);
        this._commandSources.delete(source);
      }
    }
  },
};
