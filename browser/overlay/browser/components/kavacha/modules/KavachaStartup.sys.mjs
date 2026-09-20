/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * KavachaStartup — the one place Kavacha attaches to Firefox's lifecycle.
 *
 * Registered in components.conf under the "profile-after-change" category, so
 * Firefox constructs it once in the parent process as soon as the profile is
 * usable. From there it:
 *
 *   1. brings up the process-wide Kavacha modules, in the order the Zen-era
 *      ZenStartup hunks established (PROCESS_MODULES);
 *   2. at "browser-window-before-show" (DOM ready, before first paint) loads
 *      the window script, the Kavacha stylesheet and the Kavacha FTL into each
 *      browser window, then runs the per-window hooks (WINDOW_HOOKS);
 *   3. at "browser-delayed-startup-finished" runs the post-paint hooks
 *      (DELAYED_WINDOW_HOOKS — sidebar registration, coach marks);
 *   4. at "quit-application-granted" lets modules flush.
 *
 * Every entry is a module name plus the calls to make; the lists are the
 * port's ledger — a feature is "wired" when its line is here (ADR 0020 §4a).
 * Modules are imported lazily and a failing module is logged and skipped, so
 * one broken feature cannot take the window down with it.
 */

/** Window-scope scripts, loaded in order into every browser window. */
const WINDOW_SCRIPTS = [
  "chrome://browser/content/kavacha/kavacha-window.js",
  "chrome://browser/content/kavacha/spaces/kavacha-workspaces.js",
  "chrome://browser/content/kavacha/spaces/kavacha-space-identity.js",
  "chrome://browser/content/kavacha/spaces/kavacha-space-notes.js",
  "chrome://browser/content/kavacha/spaces/kavacha-space-research.js",
  "chrome://browser/content/kavacha/spaces/kavacha-sessions.js",
  "chrome://browser/content/kavacha/search/kavacha-universal-search.js",
  "chrome://browser/content/kavacha/palette/kavacha-palette.js",
];
const WINDOW_SHEET = "chrome://browser/skin/kavacha/kavacha.css";
const WINDOW_FTL = [
  "browser/kavacha/kavacha.ftl",
  "browser/kavacha/kavacha-workspaces.ftl",
  "browser/kavacha/kavacha-commands.ftl",
  "browser/kavacha/kavacha-palette.ftl",
  "browser/kavacha/kavacha-preferences.ftl",
];

/**
 * Process singletons, brought up once at profile-after-change, in order.
 * { module: "KavachaFoo", init: "init" } calls KavachaFoo.init().
 * Order matters where noted (the Zen-era comments are kept as the reason).
 */
const PROCESS_MODULES = [
  { module: "KavachaWorkspaces" }, // ADR 0021: the Spaces store
  { module: "KavachaNewTab" }, // dashboard new tab (patch 0011)
  { module: "KavachaTabMemory" }, // sleep idle background tabs (patch 0013)
  { module: "KavachaSpaceHistory" }, // ADR 0006 snapshots substrate
  { module: "KavachaLayoutEngine" }, // ADR 0008
  { module: "KavachaThemeEngine" }, // ADR 0008; theme-mode authority (§4e)
  { module: "KavachaUserCSS" }, // ADR 0009
  { module: "KavachaMenu" }, // the ⚙ menu (patch 0030); per-window UI below
  // WidgetHost must precede Marketplace: the marketplace registers `widget`
  // components into it as it re-applies what is installed (ADR 0010).
  { module: "KavachaWidgetHost" },
  { module: "KavachaMarketplace" }, // ADR 0010
  { module: "KavachaPluginManager" }, // ADR 0011
  { module: "KavachaSessionCleanup" }, // pinned-only restore, pref-gated (patch 0034)
  { module: "KavachaPersonalIndex" }, // ADR 0012
  { module: "KavachaKnowledgeGraph" }, // ADR 0016 (owns the Places deletion contract)
  // FocusMode must come up even with no session running: init() is what ENDS
  // a session whose clock ran out while the browser was closed, restoring the
  // notification default it changed (ADR 0018).
  { module: "KavachaFocusMode" },
  { module: "KavachaWorkflows" }, // ADR 0017
];

/**
 * Per-window hooks, run at browser-window-before-show after the window
 * scripts. Either { module: "KavachaFoo", call: "applyToWindow" } →
 * KavachaFoo.applyToWindow(window), or { global: "gKavachaFoo", call: "init" }
 * → window.gKavachaFoo.init().
 */
const WINDOW_HOOKS = [
  { global: "gKavachaWorkspaces", call: "init" },
  { global: "gKavachaPalette", call: "init" },
  { module: "KavachaLayoutEngine", call: "applyToWindow" },
  { module: "KavachaThemeEngine", call: "applyToWindow" },
  { module: "KavachaUserCSS", call: "applyToWindow" },
  { module: "KavachaMenu", call: "setupWindow" },
  { module: "KavachaPlacesAttribution", call: "init" }, // ADR 0005: per-space history attribution (window listener)
  // Records the two relationships Places never stores — page A led to page B,
  // and B was opened FROM A. Refuses private windows itself (ADR 0016).
  { module: "KavachaKnowledgeGraph", call: "attachToWindow" },
  // The branches ordinary session history truncates (ADR 0019); per window,
  // since it listens to that window's tab navigations.
  { module: "KavachaTabHistory", call: "attachToWindow" },
];

/** Per-window hooks that need the window painted (toolbars built, SidebarController ready). */
const DELAYED_WINDOW_HOOKS = [
  { global: "gKavachaWorkspaces", call: "render" }, // the strip widget exists by now
  // Firefox's fresh-profile setup enables default-theme AFTER our
  // before-show apply, disabling ours; re-assert now that startup has
  // settled (idempotent — see reassertBuiltInTheme).
  { module: "KavachaThemeEngine", call: "reassertBuiltInTheme" },
  // Per window because SidebarController is; costs no network request — the
  // page probes only when asked to do something (ADR 0014).
  { module: "KavachaAISidebar", call: "register" },
  // Separate from the AI sidebar because it must keep working with AI
  // switched off; per window for the same reason (ADR 0015).
  { module: "KavachaKnowledgeSidebar", call: "register" },
  // Startup-triggered workflows run after a delay so they never compete with
  // session restore (ADR 0017).
  { module: "KavachaWorkflows", call: "onStartup" },
];

/**
 * JSWindowActors Kavacha registers. Under Zen these were entries in
 * ZenActorsManager; on the Firefox base each is registered here, which is
 * also where they are documented.
 */
const WINDOW_ACTORS = {
  // Personal index (ADR 0012, patch 0078): captures readable page text for
  // local full-text search. http/https only; the parent actor is the policy
  // gate (enabled pref, private windows, attribution).
  KavachaIndexer: {
    parent: { esModuleURI: "resource:///actors/KavachaIndexerParent.sys.mjs" },
    child: {
      esModuleURI: "resource:///actors/KavachaIndexerChild.sys.mjs",
      events: { DOMContentLoaded: {}, pageshow: {} },
    },
    matches: ["https://*/*", "http://*/*"],
  },
};

function registerActors() {
  for (const [name, config] of Object.entries(WINDOW_ACTORS)) {
    try {
      ChromeUtils.registerWindowActor(name, config);
    } catch (e) {
      // Already registered (a second process init) is not an error.
      if (e.result !== Cr.NS_ERROR_NOT_AVAILABLE) {
        lazy.log.error(`actor ${name} failed to register`, e);
      }
    }
  }
}

/** CustomizableUI widgets are process-wide; register once, render per window. */
function registerWidgets() {
  const { CustomizableUI } = ChromeUtils.importESModule(
    "moz-src:///browser/components/customizableui/CustomizableUI.sys.mjs"
  );
  const id = "kavacha-spaces-strip";
  if (CustomizableUI.getWidget(id)?.provider === CustomizableUI.PROVIDER_API) {
    return;
  }
  CustomizableUI.createWidget({
    id,
    type: "custom",
    defaultArea: CustomizableUI.AREA_TABSTRIP,
    onBuild(doc) {
      const node = doc.createXULElement("toolbaritem");
      node.id = id;
      node.setAttribute("removable", "true");
      node.setAttribute("overflows", "false");
      node.classList.add("chromeclass-toolbar-additional");
      return node;
    },
  });
  // First registration only: put the strip before the tabs. A user who moves
  // it later keeps their placement (CustomizableUI persists it).
  const placement = CustomizableUI.getPlacementOfWidget(id);
  if (!placement || placement.area !== CustomizableUI.AREA_TABSTRIP) {
    CustomizableUI.addWidgetToArea(id, CustomizableUI.AREA_TABSTRIP, 0);
  }
}

const lazy = {};
ChromeUtils.defineLazyGetter(lazy, "log", () => {
  const { ConsoleAPI } = ChromeUtils.importESModule(
    "resource://gre/modules/Console.sys.mjs"
  );
  return new ConsoleAPI({ prefix: "KavachaStartup", maxLogLevelPref: "kavacha.startup.loglevel" });
});

function isBrowserWindow(win) {
  return (
    win?.document?.documentElement?.getAttribute("windowtype") ===
    "navigator:browser"
  );
}

function importModule(name) {
  return ChromeUtils.importESModule(`resource:///modules/${name}.sys.mjs`)[name];
}

function runHooks(hooks, win, phase) {
  for (const hook of hooks) {
    try {
      let result;
      if (hook.global) {
        const target = win[hook.global];
        if (!target) {
          lazy.log.warn(`${hook.global} missing on window (${phase})`);
          continue;
        }
        result = target[hook.call]();
      } else {
        const mod = importModule(hook.module);
        result = mod[hook.call](win);
      }
      if (result?.then) {
        result.catch(e => lazy.log.error(`${hook.module}.${hook.call} (${phase}) rejected`, e));
      }
    } catch (e) {
      lazy.log.error(`${hook.module}.${hook.call} (${phase}) threw`, e);
    }
  }
}

export class KavachaStartup {
  static #instance = null;

  QueryInterface = ChromeUtils.generateQI(["nsIObserver"]);

  constructor() {
    if (KavachaStartup.#instance) {
      return KavachaStartup.#instance;
    }
    KavachaStartup.#instance = this;
    try {
      registerWidgets();
    } catch (e) {
      lazy.log.error("widget registration failed", e);
    }
    registerActors();
    this.#initProcess();
    for (const topic of [
      "browser-window-before-show",
      "browser-delayed-startup-finished",
      "quit-application-granted",
    ]) {
      Services.obs.addObserver(this, topic);
    }
    lazy.log.debug("process init done; observers registered");
  }

  /** True once the constructor ran — the Marionette probe reads this. */
  static get initialized() {
    return !!KavachaStartup.#instance;
  }

  observe(subject, topic) {
    switch (topic) {
      case "browser-window-before-show":
        this.#beforeShow(subject);
        break;
      case "browser-delayed-startup-finished":
        if (isBrowserWindow(subject)) {
          runHooks(DELAYED_WINDOW_HOOKS, subject, "delayed");
        }
        break;
      case "quit-application-granted":
        this.#onQuit();
        break;
    }
  }

  #initProcess() {
    for (const entry of PROCESS_MODULES) {
      try {
        const result = importModule(entry.module)[entry.init ?? "init"]();
        if (result?.then) {
          result.catch(e => lazy.log.error(`${entry.module} init rejected`, e));
        }
      } catch (e) {
        lazy.log.error(`${entry.module} init threw`, e);
      }
    }
  }

  #beforeShow(win) {
    if (!isBrowserWindow(win)) {
      return;
    }
    // Each piece is isolated: a stylesheet that fails to load, a missing FTL,
    // or one window script that throws must cost exactly itself. Wrapping the
    // whole block and returning on the first error meant a single bad script
    // silently skipped every later script AND every window hook — the window
    // then came up with no menu button, no palette and no theme, and nothing
    // said why. (Observed 2026-09-20; the probe caught it as a wave of
    // unrelated failures.)
    try {
      // Author-level sheet so the token floor and every Kavacha rule cascade
      // like a chrome stylesheet would; loaded before first paint.
      win.windowUtils.loadSheetUsingURIString(
        WINDOW_SHEET,
        win.windowUtils.AUTHOR_SHEET
      );
    } catch (e) {
      lazy.log.error("stylesheet failed to load", e);
    }
    for (const ftl of WINDOW_FTL) {
      try {
        win.MozXULElement.insertFTLIfNeeded(ftl);
      } catch (e) {
        lazy.log.error(`FTL ${ftl} failed to load`, e);
      }
    }
    for (const script of WINDOW_SCRIPTS) {
      try {
        Services.scriptloader.loadSubScript(script, win);
      } catch (e) {
        lazy.log.error(`window script ${script} threw`, e);
      }
    }
    runHooks(WINDOW_HOOKS, win, "before-show");
    if (win.gKavacha) {
      win.gKavacha.ready = true;
    }
  }

  #onQuit() {
    // Modules that need a synchronous flush register here via
    // KavachaStartup.onQuit(fn) rather than each observing quit themselves.
    for (const fn of this.#quitHooks) {
      try {
        fn();
      } catch (e) {
        lazy.log.error("quit hook threw", e);
      }
    }
  }

  #quitHooks = [];

  static onQuit(fn) {
    KavachaStartup.#instance?.#quitHooks.push(fn);
  }
}
