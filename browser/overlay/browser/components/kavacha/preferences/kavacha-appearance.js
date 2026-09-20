/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Kavacha "Appearance & Themes" Settings pane (ROADMAP Phase 3 UX; ADR 0009).
// about:preferences is the one settings home, so this pane is a THIN view over
// the already-shipped engines: the theme picker drives KavachaThemeEngine (patch
// 0023), the accent control writes the user-owned zen.theme.accent-color pref
// (never touched by the theme engine — ADR 0008), and the new-tab toggle flips
// zen.urlbar.replace-newtab. Everything applies live; the rich visual editor is
// one click away in about:studio.

"use strict";

/* global ChromeUtils, Services, document, window, console, openTrustedLinkIn */

const { KavachaThemeEngine } = ChromeUtils.importESModule(
  "resource:///modules/KavachaThemeEngine.sys.mjs"
);

const kThemePref = "kavacha.theme.active";
// The accent is user-owned and deliberately SEPARATE from the theme (ADR 0008).
const kAccentPref = "kavacha.theme.accent";
// true == floating search bar on new tabs; false == the Kavacha dashboard.
const kNewtabFloatingPref = "kavacha.newtab.dashboard";

var gKavachaAppearance = {
  _initted: false,
  // Bumped by every _renderThemes() run so a slower one cannot overwrite a
  // faster one's popup. See the note there.
  _themeGeneration: 0,

  init() {
    if (this._initted) {
      return;
    }
    this._initted = true;

    this._themeSelect = document.getElementById("kavachaAppearanceThemeSelect");
    this._accentInput = document.getElementById("kavachaAppearanceAccentInput");
    this._newtab = document.getElementById("kavachaAppearanceNewtabDashboard");

    this._themeSelect.addEventListener("command", () => this._onThemeChange());
    this._accentInput.addEventListener("change", () => this._onAccentChange());
    document
      .getElementById("kavachaAppearanceAccentReset")
      .addEventListener("command", () => this._resetAccent());
    this._newtab.addEventListener("command", () => this._onNewtabChange());
    document
      .getElementById("kavachaAppearanceStudioLink")
      .addEventListener("command", () => this._openPage("about:studio"));

    Services.prefs.addObserver(kThemePref, this);
    Services.prefs.addObserver(kAccentPref, this);
    Services.prefs.addObserver(kNewtabFloatingPref, this);
    window.addEventListener("unload", () => this._uninit(), { once: true });

    this._renderThemes();
    this._renderAccent();
    this._renderNewtab();
  },

  observe(subject, topic, data) {
    if (topic !== "nsPref:changed") {
      return;
    }
    if (data === kThemePref) {
      this._renderThemes();
    } else if (data === kAccentPref) {
      this._renderAccent();
    } else if (data === kNewtabFloatingPref) {
      this._renderNewtab();
    }
  },

  _uninit() {
    Services.prefs.removeObserver(kThemePref, this);
    Services.prefs.removeObserver(kAccentPref, this);
    Services.prefs.removeObserver(kNewtabFloatingPref, this);
  },

  // Rebuilt whenever kavacha.theme.active changes -- including by this pane's
  // own menulist, whose write comes straight back through the observer. The
  // previous version emptied the popup and THEN awaited resolveTheme() once per
  // theme, so a second run could start mid-loop: the two interleaved
  // remove()/appendChild() calls and left duplicate entries, or a `.value` that
  // matched no child and rendered as a blank menulist. Resolve everything
  // first, behind a generation guard, then swap the popup's contents in one go.
  async _renderThemes() {
    const generation = ++this._themeGeneration;
    try {
      const ids = await KavachaThemeEngine.listThemes();
      const entries = [];
      for (const id of ids) {
        let name = id;
        try {
          name = (await KavachaThemeEngine.resolveTheme(id)).name || id;
        } catch (e) {
          // Unreadable package — still offer its id so it can be selected.
        }
        entries.push({ id, name });
      }
      // A newer render started while we were reading; it owns the popup now.
      if (generation !== this._themeGeneration) {
        return;
      }
      const popup = this._themeSelect.menupopup;
      while (popup.firstChild) {
        popup.firstChild.remove();
      }
      for (const { id, name } of entries) {
        const item = document.createXULElement("menuitem");
        item.setAttribute("value", id);
        item.setAttribute("label", name);
        popup.appendChild(item);
      }
      // Read the active id AFTER the awaits: it may have changed during them,
      // and setting a stale value here is what leaves the control disagreeing
      // with the browser.
      this._themeSelect.value = KavachaThemeEngine.activeThemeId;
    } catch (e) {
      console.error("KavachaAppearance: failed to list themes", e);
    }
  },

  async _onThemeChange() {
    try {
      await KavachaThemeEngine.setActiveTheme(this._themeSelect.value);
    } catch (e) {
      console.error("KavachaAppearance: setActiveTheme failed", e);
    }
  },

  _renderAccent() {
    const raw = Services.prefs.getStringPref(kAccentPref, "");
    // <input type="color"> only accepts #rrggbb, so a system keyword
    // (AccentColor) or a gradient cannot be shown literally.
    if (/^#[0-9a-fA-F]{6}$/.test(raw)) {
      this._accentInput.value = raw.toLowerCase();
      return;
    }
    // ...but the guard used to end here, and "Use system accent" clears the
    // pref -- so `raw` became "", the test failed, and the input kept showing
    // the colour that had just been cleared. Clicking Reset did the right thing
    // and looked like it did nothing at all.
    //
    // Resolve the system accent through the style system and show THAT, which
    // is both what the browser will use and a real #rrggbb the input accepts.
    this._accentInput.value = this._resolveSystemAccent();
  },

  // AccentColor is a CSS system colour; getComputedStyle is the only thing that
  // knows what it currently is. The literal is Kavacha's documented
  // --kavacha-accent-fallback, used only if the resolve fails.
  _resolveSystemAccent() {
    try {
      const probe = document.createElementNS(
        "http://www.w3.org/1999/xhtml",
        "span"
      );
      probe.style.display = "none";
      probe.style.color = "AccentColor";
      document.documentElement.appendChild(probe);
      const rgb = window.getComputedStyle(probe).color;
      probe.remove();
      const m = rgb.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (m) {
        return (
          "#" +
          [m[1], m[2], m[3]]
            .map(n => Number(n).toString(16).padStart(2, "0"))
            .join("")
        );
      }
    } catch (e) {
      // Fall through to the documented fallback.
    }
    return "#8b7bd8";
  },

  _onAccentChange() {
    Services.prefs.setStringPref(kAccentPref, this._accentInput.value);
  },

  _resetAccent() {
    // Clearing the pref hands the accent back to the system/default.
    Services.prefs.clearUserPref(kAccentPref);
  },

  _renderNewtab() {
    // The pref is "floating search"; the checkbox offers the inverse.
    this._newtab.checked = !Services.prefs.getBoolPref(kNewtabFloatingPref, true);
  },

  _onNewtabChange() {
    Services.prefs.setBoolPref(kNewtabFloatingPref, !this._newtab.checked);
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
