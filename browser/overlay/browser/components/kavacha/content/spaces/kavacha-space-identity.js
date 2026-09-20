/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Kavacha space identity: per-space search engine (patch 0003), extension set
 * (patch 0004) and setting overrides (patch 0005), ported from the Zen-era
 * code that lived inside ZenSpaceManager (ADR 0020/0021).
 *
 * Two attachment points on gKavachaWorkspaces replace Zen's chokepoint and
 * context menu: addSwitchListener (applied on every space switch) and
 * addContextMenuBuilder (the three submenus on a space's context menu).
 * The "baseline" pattern is unchanged: the first override records the
 * profile's own value in a pref and spaces without an override restore it. */

"use strict";

{
  const { SearchService } = ChromeUtils.importESModule(
    "moz-src:///toolkit/components/search/SearchService.sys.mjs"
  );
  const { AddonManager } = ChromeUtils.importESModule(
    "resource://gre/modules/AddonManager.sys.mjs"
  );

  const ws = window.gKavachaWorkspaces;
  const FEATURE = "kavacha-space-context-feature";

  // ------------------------------------------------------------ settings
  // Curated per-space setting overrides (workspace.settings). Deliberately an
  // allowlist — spaces sync across devices, so arbitrary pref control would let
  // a synced payload flip security-critical prefs.
  const KAVACHA_SPACE_SETTINGS = [
    {
      key: "colorScheme", // "light" | "dark"; absent = browser default
      pref: "layout.css.prefers-color-scheme.content-override",
      kind: "int",
      menu: "radio",
      encode: v => ({ dark: 0, light: 1 })[v],
    },
    {
      key: "blockAutoplay",
      pref: "media.autoplay.default",
      kind: "int",
      menu: "checkbox",
      l10n: "kavacha-workspaces-settings-block-autoplay",
      encode: v => (v ? 5 /* BLOCKED_ALL */ : 1 /* BLOCKED (audible) */),
      decode: prefValue => prefValue === 5,
    },
    {
      key: "blockNotificationPrompts",
      pref: "permissions.default.desktop-notification",
      kind: "int",
      menu: "checkbox",
      l10n: "kavacha-workspaces-settings-block-notifications",
      encode: v => (v ? 2 /* block */ : 0 /* ask */),
      decode: prefValue => prefValue === 2,
    },
    {
      key: "rememberPasswords",
      pref: "signon.rememberSignons",
      kind: "bool",
      menu: "checkbox",
      l10n: "kavacha-workspaces-settings-remember-passwords",
      encode: v => !!v,
      decode: prefValue => !!prefValue,
    },
    {
      key: "searchSuggestions",
      pref: "browser.search.suggest.enabled",
      kind: "bool",
      menu: "checkbox",
      l10n: "kavacha-workspaces-settings-search-suggestions",
      encode: v => !!v,
      decode: prefValue => !!prefValue,
    },
  ];

  const SETTINGS_BASELINE_PREF = "kavacha.workspaces.settings-baseline";
  const ENGINE_BASELINE_PREF = "kavacha.workspaces.baseline-search-engine";
  const EXT_TRACK_PREF = "kavacha.workspaces.extensions-disabled";

  function applyWorkspaceSettings(workspace) {
    if (ws.privateWindowOrDisabled || !workspace) {
      return;
    }
    let baseline;
    try {
      baseline = JSON.parse(Services.prefs.getStringPref(SETTINGS_BASELINE_PREF, "{}"));
    } catch (e) {
      baseline = {};
    }
    const overrides = workspace.settings || {};
    for (const def of KAVACHA_SPACE_SETTINGS) {
      const getPref = () =>
        def.kind === "bool" ? Services.prefs.getBoolPref(def.pref) : Services.prefs.getIntPref(def.pref);
      const setPref = value =>
        def.kind === "bool" ? Services.prefs.setBoolPref(def.pref, value) : Services.prefs.setIntPref(def.pref, value);
      if (Object.prototype.hasOwnProperty.call(overrides, def.key)) {
        const value = def.encode(overrides[def.key]);
        if (value === undefined) {
          continue;
        }
        if (!(def.key in baseline)) {
          baseline[def.key] = getPref();
        }
        if (getPref() !== value) {
          setPref(value);
        }
      } else if (def.key in baseline) {
        if (getPref() !== baseline[def.key]) {
          setPref(baseline[def.key]);
        }
        delete baseline[def.key];
      }
    }
    Services.prefs.setStringPref(SETTINGS_BASELINE_PREF, JSON.stringify(baseline));
  }

  // -------------------------------------------------------- search engine
  let visibleEngines = [];
  let applyingEngine = false;
  const refreshEngineCache = () => {
    SearchService.promiseInitialized
      .then(() => SearchService.getVisibleEngines())
      .then(engines => {
        visibleEngines = engines;
      })
      .catch(e => console.error("kavacha-space-identity: error caching search engines", e));
  };

  async function applyWorkspaceSearchEngine(workspace) {
    if (ws.privateWindowOrDisabled || !workspace) {
      return;
    }
    await SearchService.promiseInitialized;
    const override = workspace.searchProvider;
    try {
      applyingEngine = true;
      if (override) {
        const engine = SearchService.getEngineByName(override);
        if (!engine || engine.hidden) {
          return; // not installed on this device — leave the default alone
        }
        if (SearchService.defaultEngine?.name !== override) {
          if (!Services.prefs.prefHasUserValue(ENGINE_BASELINE_PREF)) {
            Services.prefs.setStringPref(ENGINE_BASELINE_PREF, SearchService.defaultEngine?.name || "");
          }
          await SearchService.setDefault(engine, SearchService.CHANGE_REASON.USER);
        }
      } else if (Services.prefs.prefHasUserValue(ENGINE_BASELINE_PREF)) {
        const baselineName = Services.prefs.getStringPref(ENGINE_BASELINE_PREF);
        Services.prefs.clearUserPref(ENGINE_BASELINE_PREF);
        const engine = baselineName && SearchService.getEngineByName(baselineName);
        if (engine && !engine.hidden && SearchService.defaultEngine?.name !== baselineName) {
          await SearchService.setDefault(engine, SearchService.CHANGE_REASON.USER);
        }
      }
    } finally {
      applyingEngine = false;
    }
  }

  // The user changed the default engine themselves while an override is
  // active: adopt it as the space's engine rather than revert it next switch.
  function onDefaultSearchEngineChanged() {
    if (applyingEngine || ws.privateWindowOrDisabled) {
      return;
    }
    const workspace = ws.getActiveWorkspaceFromCache();
    if (!workspace?.searchProvider) {
      return;
    }
    const newName = SearchService.defaultEngine?.name;
    if (newName && workspace.searchProvider !== newName) {
      workspace.searchProvider = newName;
      ws.saveWorkspace(workspace);
    }
  }

  // ---------------------------------------------------------- extensions
  // Firefox has no per-container extension scoping, so this toggles addons
  // globally at switch time. A tracking pref records which addons *Kavacha*
  // disabled, so a space without a list only re-enables those — a user's own
  // global disables are never overridden.
  let extensions = [];
  const refreshExtensionCache = () => {
    AddonManager.getAddonsByTypes(["extension"])
      .then(addons => {
        extensions = addons.filter(a => !a.isSystem && !a.isBuiltin && !a.hidden);
      })
      .catch(e => console.error("kavacha-space-identity: error caching extensions", e));
  };
  let extensionChain = Promise.resolve();

  function applyWorkspaceExtensions(workspace) {
    if (ws.privateWindowOrDisabled || !workspace) {
      return extensionChain;
    }
    extensionChain = extensionChain
      .then(() => doApplyWorkspaceExtensions(workspace))
      .catch(e => console.error("kavacha-space-identity: error applying extensions", e));
    return extensionChain;
  }

  async function doApplyWorkspaceExtensions(workspace) {
    const list = workspace.extensions;
    const addons = (await AddonManager.getAddonsByTypes(["extension"])).filter(
      a => !a.isSystem && !a.isBuiltin && !a.hidden
    );
    let tracked;
    try {
      tracked = new Set(JSON.parse(Services.prefs.getStringPref(EXT_TRACK_PREF, "[]")));
    } catch (e) {
      tracked = new Set();
    }
    const ops = [];
    if (Array.isArray(list)) {
      const wanted = new Set(list);
      for (const addon of addons) {
        if (wanted.has(addon.id)) {
          if (addon.userDisabled && tracked.has(addon.id)) {
            ops.push(addon.enable());
            tracked.delete(addon.id);
          }
        } else if (!addon.userDisabled) {
          ops.push(addon.disable());
          tracked.add(addon.id);
        }
      }
    } else {
      for (const addon of addons) {
        if (addon.userDisabled && tracked.has(addon.id)) {
          ops.push(addon.enable());
          tracked.delete(addon.id);
        }
      }
    }
    Services.prefs.setStringPref(EXT_TRACK_PREF, JSON.stringify([...tracked]));
    await Promise.all(ops);
  }

  // ------------------------------------------------------------- menus
  function submenu(popup, anchor, l10nId, id) {
    const doc = popup.ownerDocument;
    const menu = doc.createXULElement("menu");
    menu.id = id;
    menu.className = FEATURE;
    doc.l10n.setAttributes(menu, l10nId);
    const sub = doc.createXULElement("menupopup");
    menu.appendChild(sub);
    popup.insertBefore(menu, anchor);
    return sub;
  }

  function buildSearchEngineMenu(popup, spaceId, anchor) {
    const doc = popup.ownerDocument;
    const workspace = ws.getWorkspaceFromId(spaceId);
    const sub = submenu(popup, anchor, "kavacha-workspaces-panel-context-search-engine", "kavacha-space-context-search-engine");
    const pick = async name => {
      if (name) {
        workspace.searchProvider = name;
      } else {
        delete workspace.searchProvider;
      }
      ws.saveWorkspace(workspace);
      if (ws.isWorkspaceActive(workspace)) {
        await applyWorkspaceSearchEngine(workspace);
      }
    };
    const defaultItem = doc.createXULElement("menuitem");
    defaultItem.setAttribute("type", "radio");
    doc.l10n.setAttributes(defaultItem, "kavacha-workspaces-search-engine-default");
    if (!workspace.searchProvider) {
      defaultItem.setAttribute("checked", "true");
    }
    defaultItem.addEventListener("command", () => pick(null));
    sub.appendChild(defaultItem);
    sub.appendChild(doc.createXULElement("menuseparator"));
    for (const engine of visibleEngines) {
      const item = doc.createXULElement("menuitem");
      item.setAttribute("type", "radio");
      item.setAttribute("label", engine.name);
      if (workspace.searchProvider === engine.name) {
        item.setAttribute("checked", "true");
      }
      item.classList.add("menuitem-iconic");
      item.addEventListener("command", () => pick(engine.name));
      sub.appendChild(item);
      engine.getIconURL().then(url => url && item.setAttribute("image", url)).catch(() => {});
    }
  }

  function buildExtensionsMenu(popup, spaceId, anchor) {
    const doc = popup.ownerDocument;
    const workspace = ws.getWorkspaceFromId(spaceId);
    const sub = submenu(popup, anchor, "kavacha-workspaces-panel-context-extensions", "kavacha-space-context-extensions");
    const list = workspace.extensions;
    const commit = async () => {
      ws.saveWorkspace(workspace);
      if (ws.isWorkspaceActive(workspace)) {
        await applyWorkspaceExtensions(workspace);
      }
    };
    const allItem = doc.createXULElement("menuitem");
    allItem.setAttribute("type", "radio");
    doc.l10n.setAttributes(allItem, "kavacha-workspaces-extensions-all");
    if (!Array.isArray(list)) {
      allItem.setAttribute("checked", "true");
    }
    allItem.addEventListener("command", () => {
      delete workspace.extensions;
      commit();
    });
    sub.appendChild(allItem);
    sub.appendChild(doc.createXULElement("menuseparator"));
    for (const addon of extensions) {
      const item = doc.createXULElement("menuitem");
      item.setAttribute("type", "checkbox");
      item.setAttribute("closemenu", "none");
      item.setAttribute("label", addon.name);
      if (Array.isArray(list) ? list.includes(addon.id) : !addon.userDisabled) {
        item.setAttribute("checked", "true");
      }
      if (addon.iconURL) {
        item.setAttribute("image", addon.iconURL);
        item.classList.add("menuitem-iconic");
      }
      item.addEventListener("command", () => {
        if (!Array.isArray(workspace.extensions)) {
          workspace.extensions = extensions.filter(a => !a.userDisabled).map(a => a.id);
        }
        const idx = workspace.extensions.indexOf(addon.id);
        if (idx === -1) {
          workspace.extensions.push(addon.id);
        } else {
          workspace.extensions.splice(idx, 1);
        }
        commit();
      });
      sub.appendChild(item);
    }
  }

  function buildSettingsMenu(popup, spaceId, anchor) {
    const doc = popup.ownerDocument;
    const workspace = ws.getWorkspaceFromId(spaceId);
    const sub = submenu(popup, anchor, "kavacha-workspaces-panel-context-settings", "kavacha-space-context-settings");
    const overrides = workspace.settings || {};
    const commit = () => {
      if (workspace.settings && !Object.keys(workspace.settings).length) {
        delete workspace.settings;
      }
      ws.saveWorkspace(workspace);
      if (ws.isWorkspaceActive(workspace)) {
        applyWorkspaceSettings(workspace);
      }
    };
    for (const [value, l10nId] of [
      ["", "kavacha-workspaces-settings-color-default"],
      ["light", "kavacha-workspaces-settings-color-light"],
      ["dark", "kavacha-workspaces-settings-color-dark"],
    ]) {
      const item = doc.createXULElement("menuitem");
      item.setAttribute("type", "radio");
      item.setAttribute("name", "kavacha-space-colorscheme");
      item.setAttribute("closemenu", "none");
      doc.l10n.setAttributes(item, l10nId);
      if ((overrides.colorScheme || "") === value) {
        item.setAttribute("checked", "true");
      }
      item.addEventListener("command", () => {
        workspace.settings = workspace.settings || {};
        if (value) {
          workspace.settings.colorScheme = value;
        } else {
          delete workspace.settings.colorScheme;
        }
        commit();
      });
      sub.appendChild(item);
    }
    sub.appendChild(doc.createXULElement("menuseparator"));
    for (const def of KAVACHA_SPACE_SETTINGS) {
      if (def.menu !== "checkbox") {
        continue;
      }
      const item = doc.createXULElement("menuitem");
      item.setAttribute("type", "checkbox");
      item.setAttribute("closemenu", "none");
      doc.l10n.setAttributes(item, def.l10n);
      const checked = Object.prototype.hasOwnProperty.call(overrides, def.key)
        ? !!overrides[def.key]
        : def.decode(def.kind === "bool" ? Services.prefs.getBoolPref(def.pref) : Services.prefs.getIntPref(def.pref));
      if (checked) {
        item.setAttribute("checked", "true");
      }
      item.addEventListener("command", () => {
        workspace.settings = workspace.settings || {};
        // Checkbox menuitems autotoggle before command fires.
        workspace.settings[def.key] = item.getAttribute("checked") === "true";
        commit();
      });
      sub.appendChild(item);
    }
    sub.appendChild(doc.createXULElement("menuseparator"));
    const reset = doc.createXULElement("menuitem");
    doc.l10n.setAttributes(reset, "kavacha-workspaces-settings-reset");
    reset.addEventListener("command", () => {
      delete workspace.settings;
      commit();
    });
    sub.appendChild(reset);
  }

  // ---------------------------------------------------------- wiring
  if (ws && !ws.privateWindowOrDisabled) {
    refreshEngineCache();
    refreshExtensionCache();
    const searchObserver = (subject, topic, data) => {
      if (data === "engine-default") {
        onDefaultSearchEngineChanged();
      }
      refreshEngineCache();
    };
    Services.obs.addObserver(searchObserver, "browser-search-engine-modified");
    const addonListener = {
      onInstalled: refreshExtensionCache,
      onUninstalled: refreshExtensionCache,
      onEnabled: refreshExtensionCache,
      onDisabled: refreshExtensionCache,
    };
    AddonManager.addAddonListener(addonListener);
    window.addEventListener(
      "unload",
      () => {
        Services.obs.removeObserver(searchObserver, "browser-search-engine-modified");
        AddonManager.removeAddonListener(addonListener);
      },
      { once: true }
    );

    ws.addSwitchListener(workspace => {
      // Settings are synchronous pref flips; engine and extensions are
      // fire-and-forget so the switch is never blocked on them.
      try {
        applyWorkspaceSettings(workspace);
      } catch (e) {
        console.error("kavacha-space-identity: settings failed", e);
      }
      applyWorkspaceSearchEngine(workspace).catch(e =>
        console.error("kavacha-space-identity: search engine failed", e)
      );
      applyWorkspaceExtensions(workspace);
    });
    ws.addContextMenuBuilder(buildSearchEngineMenu);
    ws.addContextMenuBuilder(buildExtensionsMenu);
    ws.addContextMenuBuilder(buildSettingsMenu);

    // Apply for the space this window starts in (a switch never happened).
    ws.init().then(() => {
      const current = ws.getActiveWorkspaceFromCache();
      if (current) {
        applyWorkspaceSettings(current);
        applyWorkspaceSearchEngine(current).catch(() => {});
        applyWorkspaceExtensions(current);
      }
    });
  }

  // For probes and the Settings pane.
  window.gKavachaSpaceIdentity = {
    settings: KAVACHA_SPACE_SETTINGS,
    applyWorkspaceSettings,
    applyWorkspaceSearchEngine,
    applyWorkspaceExtensions,
  };
}
