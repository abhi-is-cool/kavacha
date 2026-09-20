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
  "chrome://browser/content/kavacha/palette/kavacha-palette.js",
];
const WINDOW_SHEET = "chrome://browser/skin/kavacha/kavacha.css";
const WINDOW_FTL = [
  "browser/kavacha/kavacha.ftl",
  "browser/kavacha/kavacha-workspaces.ftl",
  "browser/kavacha/kavacha-commands.ftl",
  "browser/kavacha/kavacha-palette.ftl",
];

/**
 * Process singletons, brought up once at profile-after-change, in order.
 * { module: "KavachaFoo", init: "init" } calls KavachaFoo.init().
 * Order matters where noted (the Zen-era comments are kept as the reason).
 */
const PROCESS_MODULES = [
  { module: "KavachaWorkspaces" }, // ADR 0021: the Spaces store
  // Filled in by port milestone M3, subsystem by subsystem. Known order from
  // the Zen-era ZenStartup: NewTab, TabMemory, SpaceHistory, LayoutEngine,
  // ThemeEngine, UserCSS, WidgetHost (must precede Marketplace), Marketplace,
  // PluginManager, Menu, SessionCleanup, PersonalIndex, KnowledgeGraph,
  // FocusMode (must run even with no session: it ends expired ones),
  // Workflows.
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
  // M3: PlacesAttribution.init(window), LayoutEngine.applyToWindow,
  // ThemeEngine.applyToWindow, UserCSS.applyToWindow, Menu.setupWindow,
  // KnowledgeGraph.attachToWindow, TabHistory.attachToWindow, Workflows.onStartup.
];

/** Per-window hooks that need the window painted (toolbars built, SidebarController ready). */
const DELAYED_WINDOW_HOOKS = [
  { global: "gKavachaWorkspaces", call: "render" }, // the strip widget exists by now
  // M3: AISidebar.register(window), KnowledgeSidebar.register(window).
];

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
    try {
      // Author-level sheet so the token floor and every Kavacha rule cascade
      // like a chrome stylesheet would; loaded before first paint.
      win.windowUtils.loadSheetUsingURIString(
        WINDOW_SHEET,
        win.windowUtils.AUTHOR_SHEET
      );
      for (const ftl of WINDOW_FTL) {
        win.MozXULElement.insertFTLIfNeeded(ftl);
      }
      for (const script of WINDOW_SCRIPTS) {
        Services.scriptloader.loadSubScript(script, win);
      }
    } catch (e) {
      lazy.log.error("window boot failed", e);
      return;
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
