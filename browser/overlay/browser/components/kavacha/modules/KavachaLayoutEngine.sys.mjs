// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Kavacha layout engine (ROADMAP Phase 3; ADR 0008). Reads a layout document
// (schema: customization/layout-engine/layout.schema.json) from the profile
// (kavacha-layout.json) and applies it LIVE to browser chrome: tab
// orientation, interface density, sidebar side/width, hidden elements, and
// per-component sizes. The document round-trips with the future about:studio
// GUI and is hand-editable.
//
// Runtime shape (shared with KavachaThemeEngine — ADR 0008): a process
// singleton whose init() installs the observers, a per-window applyToWindow()
// called from KavachaStartup, and applyToAllWindows() driven by a monotonic
// `kavacha.layout.revision` pref bump — the content->chrome "doorbell" a
// content page like about:studio uses, since it cannot call this chrome
// singleton directly. Same singleton + per-window pattern as KavachaTabMemory
// and KavachaUniversalSearch.
//
// What maps where:
//   tabStyle        -> the `zen.tabs.vertical` pref (Zen + patch 0010 already
//                      react live: CSS @media -moz-pref + gZenVerticalTabsManager).
//                      The engine only flips the pref; it never moves DOM.
//                      Patch 0058 adds "arc": a THIRD value, not a third
//                      orientation. Arc is vertical tabs with a different
//                      presentation, so it sets the same pref as "vertical"
//                      and additionally stamps kavacha-tab-style on the root
//                      for kavacha-arc-tabs.inc.css to bind to. Splitting
//                      "which way do tabs run" from "how do they look" is what
//                      lets a presentation be added without teaching Zen's tab
//                      code a new mode.
//   density/sidebar -> attributes on document.documentElement, consumed by the
//                      kavacha-layout.inc.css layer (a no-op at the defaults).
//   toolbar.visible -> kavacha-toolbar-hidden attribute (consumed by CSS).
//   toolbar.position-> kavacha-toolbar-position attribute: SUBSTRATE ONLY. No
//                      CSS binds to it yet and no Studio control offers it, so
//                      it is inert until a real bottom-toolbar layer lands.
//   sidebarWidth    -> the --kavacha-sidebar-width custom property.
//   hiddenElements  -> a generated author sheet per window (windowUtils),
//   /componentSizes    the same per-window AUTHOR_SHEET mechanism as patch 0012.

const kLayoutFile = "kavacha-layout.json";
const kRevisionPref = "kavacha.layout.revision";
const kVerticalPref = "sidebar.verticalTabs";

// The shipped default, mirroring customization/layout-engine/default-layout.json.
// tabStyle is (re)seeded from the live zen.tabs.vertical pref in _normalize(),
// so on a fresh profile the engine matches Kavacha's horizontal default look
// (ui/defaults/kavacha-ux.js) instead of forcing the schema's field value.
const DEFAULT_LAYOUT = {
  sidebar: "left",
  sidebarWidth: 250,
  tabStyle: "horizontal",
  density: "compact",
  toolbar: { position: "top", visible: true },
  hiddenElements: [],
  componentSizes: {},
  // Patch 0057: which dashboard widgets are shown, in order. null (the default)
  // means "never arranged — the widget host's built-ins, in their declared
  // order"; an explicit [] means "the user emptied the dashboard, keep it
  // empty". The two must stay distinct or an empty dashboard is impossible
  // (fixed in patch 0075). The built-in default lives in KavachaWidgetHost, not
  // here, so this engine never has to know what widgets exist.
  widgets: null,
};

// componentSizes is keyed by an abstract component id; a raw {id: px} can't
// know whether an id sizes width vs height, so only ids in this registry are
// sizable. Unknown keys are ignored. These selectors are trusted (ours);
// hiddenElements ids are user input and get CSS.escape'd before use.
const COMPONENT_REGISTRY = {
  sidebar: { selector: "#navigator-toolbox", prop: "width" },
  urlbar: { selector: "#urlbar-container", prop: "width" },
};

const kSidebars = ["left", "right", "hidden"];
const kTabStyles = ["vertical", "horizontal", "arc"];
const kDensities = ["compact", "normal", "comfortable"];
const kToolbarPositions = ["top", "bottom"];

export const KavachaLayoutEngine = {
  _initialized: false,
  _layout: null,
  // Per-window generated-sheet URI, so a re-apply can remove the previous one.
  _sheetByWindow: new WeakMap(),

  init() {
    if (this._initialized) {
      return;
    }
    this._initialized = true;
    Services.prefs.addObserver(kRevisionPref, this);
    // Follow tab-orientation changes made OUTSIDE the engine (Zen's Looks &
    // Feel toggle, about:config). Without this the engine's file wins on the
    // next window open and silently reverts the user's choice.
    Services.prefs.addObserver(kVerticalPref, this);
  },

  observe(subject, topic, data) {
    if (topic !== "nsPref:changed") {
      return;
    }
    if (data === kRevisionPref) {
      this.reloadFromFile();
    } else if (data === kVerticalPref) {
      this._reconcileTabStyleFromPref();
    }
  },

  // The pref changed. If it was the engine's own applyToWindow write, ignore
  // it; otherwise the user flipped orientation through Zen's UI, so update the
  // layout file to match instead of reverting them next window open. A bare
  // bool cannot carry "arc", so map true->vertical, false->horizontal; arc and
  // vertical both mean pref=true, so a genuine arc setup never reaches here.
  async _reconcileTabStyleFromPref() {
    if (this._suppressPrefReconcile) {
      return;
    }
    const layout = await this._load();
    const prefVertical = Services.prefs.getBoolPref(kVerticalPref, true);
    const fileVertical = layout.tabStyle !== "horizontal";
    if (prefVertical === fileVertical) {
      return; // already agree
    }
    await this.setLayout({ tabStyle: prefVertical ? "vertical" : "horizontal" });
  },

  get _profilePath() {
    return PathUtils.join(PathUtils.profileDir, kLayoutFile);
  },

  async _load() {
    if (this._layout) {
      return this._layout;
    }
    let doc = null;
    try {
      doc = JSON.parse(await IOUtils.readUTF8(this._profilePath));
    } catch (e) {
      // First run (no file) or unreadable — fall through to the seeded default.
    }
    this._layout = this._normalize(doc);
    if (!doc) {
      // Persist the seeded default so hand-editing / about:studio has a file.
      await this._save(this._layout).catch(() => {});
    }
    return this._layout;
  },

  _normalize(doc) {
    const out = { ...DEFAULT_LAYOUT, toolbar: { ...DEFAULT_LAYOUT.toolbar } };
    // Seed tabStyle from the live pref so we never fight the shipped look.
    // This is only a FALLBACK: the document's own value wins below when it has
    // one. It has to, or "arc" would be normalized back to "vertical" on every
    // read — the pref cannot distinguish the two (patch 0058).
    out.tabStyle = Services.prefs.getBoolPref(kVerticalPref, true)
      ? "vertical"
      : "horizontal";
    if (!doc || typeof doc !== "object") {
      return out;
    }
    if (kSidebars.includes(doc.sidebar)) {
      out.sidebar = doc.sidebar;
    }
    if (Number.isInteger(doc.sidebarWidth)) {
      out.sidebarWidth = Math.min(600, Math.max(48, doc.sidebarWidth));
    }
    if (kTabStyles.includes(doc.tabStyle)) {
      out.tabStyle = doc.tabStyle;
    }
    if (kDensities.includes(doc.density)) {
      out.density = doc.density;
    }
    if (doc.toolbar && typeof doc.toolbar === "object") {
      if (kToolbarPositions.includes(doc.toolbar.position)) {
        out.toolbar.position = doc.toolbar.position;
      }
      out.toolbar.visible = doc.toolbar.visible !== false;
    }
    if (Array.isArray(doc.hiddenElements)) {
      out.hiddenElements = doc.hiddenElements.filter(id => typeof id === "string");
    }
    if (Array.isArray(doc.widgets)) {
      // Ids only; the host validates them against what is actually
      // registered, since a widget can disappear with its component.
      out.widgets = doc.widgets.filter(id => typeof id === "string");
    }
    if (doc.componentSizes && typeof doc.componentSizes === "object") {
      out.componentSizes = {};
      for (const [k, v] of Object.entries(doc.componentSizes)) {
        if (COMPONENT_REGISTRY[k] && Number.isInteger(v) && v >= 0) {
          out.componentSizes[k] = v;
        }
      }
    }
    return out;
  },

  async _save(layout) {
    await IOUtils.writeUTF8(this._profilePath, JSON.stringify(layout, null, 2));
  },

  // ----- Public API (palette commands, future about:studio) --------------

  async getLayout() {
    return { ...(await this._load()) };
  },

  /** Merge a partial layout patch, persist it, and re-apply everywhere. */
  async setLayout(patch) {
    const current = await this._load();
    // Deep-merge nested objects: a shallow { ...current, ...patch } would
    // REPLACE the whole `toolbar` object, so a partial patch like
    // { toolbar: { position } } dropped `visible` (and _normalize then
    // back-filled it from DEFAULT_LAYOUT, resetting the user's choice) and
    // vice versa. Merge the sub-object so each control only touches its field.
    const merged = { ...current, ...patch };
    if (patch && patch.toolbar) {
      merged.toolbar = { ...current.toolbar, ...patch.toolbar };
    }
    this._layout = this._normalize(merged);
    await this._save(this._layout);
    // Bump the revision: the in-process observer re-applies to all windows,
    // and any content page (about:studio) watching the pref re-reads too.
    Services.prefs.setIntPref(
      kRevisionPref,
      Services.prefs.getIntPref(kRevisionPref, 0) + 1
    );
  },

  /** Re-read the file from disk (picks up hand-edits) and re-apply. */
  async reloadFromFile() {
    this._layout = null;
    await this._load();
    this.applyToAllWindows();
  },

  applyToAllWindows() {
    for (const win of Services.wm.getEnumerator("navigator:browser")) {
      if (!win.closed && win.document?.documentElement) {
        this.applyToWindow(win);
      }
    }
  },

  async applyToWindow(win) {
    const layout = await this._load();
    if (win.closed || !win.document?.documentElement) {
      return;
    }
    const root = win.document.documentElement;

    // tabStyle -> the pref Zen + patch 0010 already react to. Only touch the
    // pref when it actually differs, so we don't spuriously notify observers.
    // "arc" is a vertical layout, so anything that is not explicitly
    // horizontal wants the vertical strip.
    const wantVertical = layout.tabStyle !== "horizontal";
    if (Services.prefs.getBoolPref(kVerticalPref, true) !== wantVertical) {
      // Guard the pref observer: this write is the engine applying the file,
      // not the user choosing, so _reconcileTabStyleFromPref must ignore it.
      // setBoolPref notifies observers synchronously, so the flag is up for
      // the whole notification.
      this._suppressPrefReconcile = true;
      try {
        Services.prefs.setBoolPref(kVerticalPref, wantVertical);
      } finally {
        this._suppressPrefReconcile = false;
      }
    }
    // ...and the presentation, which the pref cannot express.
    root.setAttribute("kavacha-tab-style", layout.tabStyle);

    // density / sidebar / toolbar -> root attributes for kavacha-layout.inc.css.
    root.setAttribute("kavacha-density", layout.density);
    root.setAttribute("kavacha-sidebar", layout.sidebar);
    root.setAttribute("kavacha-toolbar-position", layout.toolbar.position);
    root.toggleAttribute("kavacha-toolbar-hidden", !layout.toolbar.visible);
    root.style.setProperty("--kavacha-sidebar-width", `${layout.sidebarWidth}px`);
    // Only claim the toolbox width when the user actually chose one. The CSS
    // rule behind this carries !important (it has to beat Zen's own sizing), so
    // while it was ungated it also beat the width Zen's #sidebar-splitter
    // writes on drag — the sidebar edge snapped back and the splitter looked
    // broken. Stamping the attribute only on a non-default width means the
    // shipped configuration leaves Zen's splitter alone, which is the same
    // "inert at the defaults" contract the rest of this layer keeps.
    root.toggleAttribute(
      "kavacha-sidebar-width-custom",
      layout.sidebarWidth !== DEFAULT_LAYOUT.sidebarWidth
    );

    this._applySheet(win, layout);
  },

  _applySheet(win, layout) {
    const utils = win.windowUtils;
    const prev = this._sheetByWindow.get(win);
    if (prev) {
      try {
        utils.removeSheetUsingURIString(prev, utils.AUTHOR_SHEET);
      } catch (e) {}
      this._sheetByWindow.delete(win);
    }
    const rules = [];
    for (const id of layout.hiddenElements) {
      // User input -> CSS.escape before composing a selector. Chrome CSS can't
      // execute script, but an unescaped id could still restyle unrelated UI.
      rules.push(`#${win.CSS.escape(id)} { display: none !important; }`);
    }
    for (const [k, px] of Object.entries(layout.componentSizes)) {
      const comp = COMPONENT_REGISTRY[k];
      if (comp) {
        rules.push(`${comp.selector} { ${comp.prop}: ${px}px !important; }`);
      }
    }
    if (!rules.length) {
      return;
    }
    const css =
      '@namespace url("http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul");\n' +
      '@namespace html url("http://www.w3.org/1999/xhtml");\n' +
      rules.join("\n");
    const uri = "data:text/css;charset=utf-8," + encodeURIComponent(css);
    try {
      utils.loadSheetUsingURIString(uri, utils.AUTHOR_SHEET);
      this._sheetByWindow.set(win, uri);
    } catch (e) {
      win.console?.error("KavachaLayoutEngine: failed to load layout sheet", e);
    }
  },
};
