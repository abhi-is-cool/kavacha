// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Kavacha: route new tabs to the bundled dashboard page while
// kavacha.newtab.dashboard is true (the default; the welcome flow and the
// Appearance pane flip it). Process singleton — windows call init() freely;
// only the first call wires anything. Ported from the Zen era (ADR 0020),
// where the switch was Zen's inverted "floating search" pref.

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  AboutNewTab: "resource:///modules/AboutNewTab.sys.mjs",
  NewTabPagePreloading:
    "moz-src:///browser/components/tabbrowser/NewTabPagePreloading.sys.mjs",
});

const kDashboardPref = "kavacha.newtab.dashboard";
const kDashboardURL = "chrome://browser/content/kavacha/newtab/index.html";
const kPreloadPref = "browser.newtab.preload";

export const KavachaNewTab = {
  _initialized: false,

  init() {
    if (this._initialized) {
      return;
    }
    this._initialized = true;
    Services.prefs.addObserver(kDashboardPref, this);
    this._apply();
  },

  observe() {
    this._apply();
  },

  _apply() {
    const defaults = Services.prefs.getDefaultBranch("");
    if (!Services.prefs.getBoolPref(kDashboardPref, true)) {
      // Firefox's own new tab page.
      lazy.AboutNewTab.resetNewTabURL();
      defaults.setBoolPref(kPreloadPref, true);
    } else {
      lazy.AboutNewTab.newTabURL = kDashboardURL;
      // The preloaded new-tab browser is created for about:newtab's content
      // process; a chrome:// document cannot load there and every new tab
      // after the first came up BLANK. The dashboard is a local static page
      // — preloading buys nothing. Also evict any browser preloaded before
      // the flip.
      defaults.setBoolPref(kPreloadPref, false);
      for (const win of Services.wm.getEnumerator("navigator:browser")) {
        try {
          lazy.NewTabPagePreloading.removePreloadedBrowser(win);
        } catch (e) {
          // window mid-teardown; nothing to evict
        }
      }
    }
  },
};
