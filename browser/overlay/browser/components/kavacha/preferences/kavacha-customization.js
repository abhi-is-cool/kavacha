/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Kavacha "Customization" Settings pane (ROADMAP Phase 3 UX; ADR 0009).
// about:preferences is the one settings home, so this pane is a THIN view over
// the already-shipped engines: the layout controls drive KavachaLayoutEngine
// (patch 0022) via getLayout()/setLayout(); the safe-mode checkbox drives
// KavachaUserCSS (patch 0025). Everything applies live to every window. The
// deep tools (visual CSS editor, marketplace, plugins) are one click away in
// about:studio / about:marketplace / about:plugins.

"use strict";

/* global ChromeUtils, Services, document, window, console, openTrustedLinkIn */

const { KavachaLayoutEngine } = ChromeUtils.importESModule(
  "resource:///modules/KavachaLayoutEngine.sys.mjs"
);
const { KavachaUserCSS } = ChromeUtils.importESModule(
  "resource:///modules/KavachaUserCSS.sys.mjs"
);

// Monotonic doorbell KavachaLayoutEngine bumps after every setLayout().
const kLayoutRevisionPref = "kavacha.layout.revision";
const kSafeModePref = "kavacha.usercss.safe-mode";

var gKavachaCustomization = {
  _initted: false,
  // Guards the layout observer against echoing our own writes back into a render.
  _writing: false,

  init() {
    if (this._initted) {
      return;
    }
    this._initted = true;

    this._tabStyle = document.getElementById("kavachaCustomizationTabStyle");
    this._sidebar = document.getElementById("kavachaCustomizationSidebar");
    this._density = document.getElementById("kavachaCustomizationDensity");
    this._toolbar = document.getElementById("kavachaCustomizationToolbarVisible");
    this._safeMode = document.getElementById("kavachaCustomizationSafeMode");

    this._tabStyle.addEventListener("command", () =>
      this._patchLayout({ tabStyle: this._tabStyle.value })
    );
    this._sidebar.addEventListener("command", () =>
      this._patchLayout({ sidebar: this._sidebar.value })
    );
    this._density.addEventListener("command", () =>
      this._patchLayout({ density: this._density.value })
    );
    this._toolbar.addEventListener("command", () =>
      this._patchLayout({ toolbar: { visible: this._toolbar.checked } })
    );
    this._safeMode.addEventListener("command", () =>
      KavachaUserCSS.setSafeMode(this._safeMode.checked)
    );
    document
      .getElementById("kavachaCustomizationCssLink")
      .addEventListener("command", () => this._openPage("about:studio"));
    document
      .getElementById("kavachaCustomizationMarketplaceLink")
      .addEventListener("command", () => this._openPage("about:marketplace"));
    document
      .getElementById("kavachaCustomizationPluginsLink")
      .addEventListener("command", () => this._openPage("about:plugins"));

    Services.prefs.addObserver(kLayoutRevisionPref, this);
    Services.prefs.addObserver(kSafeModePref, this);
    window.addEventListener("unload", () => this._uninit(), { once: true });

    this._renderLayout();
    this._renderSafeMode();
  },

  observe(subject, topic, data) {
    if (topic !== "nsPref:changed") {
      return;
    }
    if (data === kLayoutRevisionPref && !this._writing) {
      this._renderLayout();
    } else if (data === kSafeModePref) {
      this._renderSafeMode();
    }
  },

  _uninit() {
    Services.prefs.removeObserver(kLayoutRevisionPref, this);
    Services.prefs.removeObserver(kSafeModePref, this);
  },

  async _renderLayout() {
    try {
      const layout = await KavachaLayoutEngine.getLayout();
      this._tabStyle.value = layout.tabStyle;
      this._sidebar.value = layout.sidebar;
      this._density.value = layout.density;
      this._toolbar.checked = layout.toolbar.visible;
    } catch (e) {
      console.error("KavachaCustomization: failed to read layout", e);
    }
  },

  async _patchLayout(patch) {
    // setLayout() bumps the revision pref synchronously; the guard keeps that
    // notification from re-rendering (and clobbering) the control mid-edit.
    this._writing = true;
    try {
      await KavachaLayoutEngine.setLayout(patch);
    } catch (e) {
      console.error("KavachaCustomization: setLayout failed", e);
    } finally {
      this._writing = false;
    }
  },

  _renderSafeMode() {
    this._safeMode.checked = KavachaUserCSS.isSafeMode;
  },

  _openPage(url) {
    if (typeof openTrustedLinkIn === "function") {
      openTrustedLinkIn(url, "tab");
      return;
    }
    const win =
      window.browsingContext?.topChromeWindow ||
      Services.wm.getMostRecentBrowserWindow();
    win?.switchToTabHavingURI(url, true);
  },
};
