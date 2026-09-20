// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Shared theming for Kavacha's own pages (patch 0062).
//
// THE PROBLEM. about:studio, about:marketplace, about:plugins and the new-tab
// dashboard are CONTENT documents. The --kavacha-* token floor lives in
// zen-theme.css, which is chrome, and a content document is simply not in that
// cascade -- so every `var(--kavacha-surface, #14111f)` in studio.css,
// marketplace.css and plugins.css always resolved to its literal fallback, and
// newtab.css did not even pretend, hardcoding `color: #fff; background:
// #1c1d22`. All four then pinned `color-scheme: dark` to match.
//
// The result: pick Kavacha Daylight and you get a light browser with four black
// pages, one of which is the Customization Studio you picked the theme from.
// Their own header comments claimed "the theme engine re-tints --kavacha-* live"
// -- true of chrome, never true of them. Patch 0046 diagnosed this exactly and
// deferred the fix.
//
// THE FIX. These four pages are privileged (IS_SECURE_CHROME_UI for the three
// about: pages; the new tab is a chrome:// URL that already calls
// Services.prefs), so they can ask the engine directly. This script stamps the
// resolved theme onto the document root as inline custom properties, which puts
// the same vocabulary in the content cascade that the chrome gets from the
// build-time floor. The pages keep their `var(--kavacha-*, literal)` chains
// untouched; the difference is that the var now resolves.
//
// A stylesheet could not do this job: the token values are chosen at runtime
// from the active package, and a static sheet cannot know them. Hence a script,
// loaded synchronously from <head> so the first paint is already themed.
//
// Loaded by: kavacha-studio/studio.html, kavacha-marketplace/marketplace.html,
// kavacha-plugins/plugins.html, kavacha-newtab/index.html.

"use strict";

/* global ChromeUtils, Services, document, window, console */

(() => {
  const { KavachaThemeEngine } = ChromeUtils.importESModule(
    "resource:///modules/KavachaThemeEngine.sys.mjs"
  );

  const kThemePref = "kavacha.theme.active";
  // The accent is user-owned and deliberately separate from the theme (ADR
  // 0008). It never reached these pages either: --kavacha-accent is a chrome
  // token, so the documented
  // `var(--kavacha-accent, var(--kavacha-accent, var(--kavacha-accent-fallback)))`
  // chain fell through to the fallback on every one of them, and the colour the
  // user picked in Settings was invisible in the Studio forever.
  const kAccentPref = "kavacha.theme.accent";

  const root = document.documentElement;

  const toCustomProperty = token =>
    "--kavacha-" + token.replace(/[A-Z]/g, m => "-" + m.toLowerCase());

  // Track what we set so a theme switch removes exactly what the previous one
  // added -- the same contract KavachaThemeEngine keeps for chrome windows.
  let managed = new Set();

  async function applyTheme() {
    let theme;
    try {
      theme = await KavachaThemeEngine.resolveTheme(
        KavachaThemeEngine.activeThemeId
      );
    } catch (e) {
      // Keep whatever is on screen. The page's own literal fallbacks are a
      // readable dark theme, so a broken package costs colour, not legibility.
      console.error("Kavacha content theme: could not resolve the theme", e);
      return;
    }

    const next = new Set();
    for (const [token, value] of Object.entries(theme.colors || {})) {
      if (token.startsWith("$")) {
        continue; // colors.json may carry a $comment
      }
      const prop = toCustomProperty(token);
      next.add(prop);
      root.style.setProperty(prop, value);
    }
    for (const prop of managed) {
      if (!next.has(prop)) {
        root.style.removeProperty(prop);
      }
    }
    managed = next;

    // Mirror the chrome's own signal, both as an attribute (so page CSS can
    // branch on it the way kavacha-theme-light.inc.css does) and as
    // color-scheme (so native form controls, scrollbars and the default canvas
    // follow). Inline is the right instrument HERE, unlike in chrome: a content
    // document has no competing pref-gated rule for it to lose to.
    const mode =
      (await KavachaThemeEngine.modeOf(KavachaThemeEngine.activeThemeId)) ||
      "dark";
    root.setAttribute("kavacha-theme-mode", mode);
    root.style.colorScheme = mode;
  }

  function applyAccent() {
    const raw = Services.prefs.getStringPref(kAccentPref, "");
    if (raw) {
      root.style.setProperty("--kavacha-accent", raw);
    } else {
      // Cleared means "use the system accent", and the CSS chain's next arm
      // (--kavacha-accent, then --kavacha-accent-fallback) is the right answer
      // -- so remove rather than substitute.
      root.style.removeProperty("--kavacha-accent");
    }
  }

  const observer = {
    observe(subject, topic, data) {
      if (topic !== "nsPref:changed") {
        return;
      }
      if (data === kThemePref) {
        applyTheme();
      } else if (data === kAccentPref) {
        applyAccent();
      }
    },
  };

  Services.prefs.addObserver(kThemePref, observer);
  Services.prefs.addObserver(kAccentPref, observer);
  window.addEventListener(
    "unload",
    () => {
      Services.prefs.removeObserver(kThemePref, observer);
      Services.prefs.removeObserver(kAccentPref, observer);
    },
    { once: true }
  );

  applyAccent();
  applyTheme();
})();
