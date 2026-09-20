/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* about:kavacha-welcome — first-run flow (ADR 0020 §4d). Privileged page.
 *
 * Steps kept from the Zen-era welcome (patches 0017/0032/0042/0068):
 *   appearance  → kavacha.theme.mode (dark|light|system), previewed live by
 *                 enabling the matching built-in theme. KavachaThemeEngine
 *                 (port milestone M3) becomes the authority for this pref and
 *                 will replace applyMode() below; the pref contract stays.
 *   accent      → kavacha.theme.accent (hex) or cleared for the system accent
 *                 (Kavacha ships no default accent — user decision 2026-07-13).
 *   new tab     → kavacha.newtab.dashboard (Zen's floating search is gone).
 *   import      → Firefox's migration wizard.
 *   menu hint   → text only.
 * Finishing sets kavacha.welcome.seen and closes the tab. */

"use strict";

const PREF_MODE = "kavacha.theme.mode";
const PREF_ACCENT = "kavacha.theme.accent";
const PREF_NEWTAB = "kavacha.newtab.dashboard";
const PREF_SEEN = "kavacha.welcome.seen";

const THEME_IDS = {
  dark: "firefox-compact-dark@mozilla.org",
  light: "firefox-compact-light@mozilla.org",
  system: "default-theme@mozilla.org",
};

// Same palette the Zen-era welcome offered (lifted into KavachaThemeEngine as
// KAVACHA_ACCENT_SWATCHES; kept in sync by the M3 port).
const SWATCHES = [
  "#8B7BD8", "#4AA3DF", "#5FBF77", "#E8A33D",
  "#F76F53", "#E05C5C", "#E285B2", "#8A939F",
];

const { AddonManager } = ChromeUtils.importESModule(
  "resource://gre/modules/AddonManager.sys.mjs"
);

async function applyMode(mode) {
  Services.prefs.setStringPref(PREF_MODE, mode);
  try {
    const addon = await AddonManager.getAddonByID(THEME_IDS[mode] || THEME_IDS.system);
    if (addon) {
      await addon.enable();
    }
  } catch (e) {
    console.error("kavacha-welcome: theme switch failed", e);
  }
}

function applyAccent(hex) {
  if (hex) {
    Services.prefs.setStringPref(PREF_ACCENT, hex);
    document.documentElement.style.setProperty("--kavacha-accent", hex);
  } else {
    Services.prefs.clearUserPref(PREF_ACCENT);
    document.documentElement.style.removeProperty("--kavacha-accent");
  }
}

function buildSwatches() {
  const row = document.getElementById("kw-swatches");
  const select = el => {
    for (const s of row.children) {
      s.toggleAttribute("selected", s === el);
    }
  };
  const system = document.createElement("button");
  system.className = "kw-swatch kw-swatch-system";
  system.style.background = "AccentColor";
  document.l10n.setAttributes(system, "kavacha-welcome-color-system");
  system.toggleAttribute("selected", !Services.prefs.prefHasUserValue(PREF_ACCENT));
  system.addEventListener("click", () => {
    applyAccent(null);
    select(system);
  });
  row.appendChild(system);
  const current = Services.prefs.getStringPref(PREF_ACCENT, "");
  for (const hex of SWATCHES) {
    const b = document.createElement("button");
    b.className = "kw-swatch";
    b.style.background = hex;
    b.title = hex;
    b.toggleAttribute("selected", current.toLowerCase() === hex.toLowerCase());
    b.addEventListener("click", () => {
      applyAccent(hex);
      select(b);
    });
    row.appendChild(b);
  }
}

function currentMode() {
  const v = Services.prefs.getStringPref(PREF_MODE, "dark");
  return THEME_IDS[v] ? v : "dark";
}

function finish() {
  Services.prefs.setBoolPref(PREF_SEEN, true);
  const win = window.browsingContext?.topChromeWindow;
  const tab = win?.gBrowser?.getTabForBrowser?.(window.browsingContext.embedderElement);
  if (win && tab && win.gBrowser.tabs.length > 1) {
    win.gBrowser.removeTab(tab);
  } else if (win?.gBrowser) {
    win.gBrowser.loadURI(Services.io.newURI("about:newtab"), {
      triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
    });
  }
}

window.addEventListener("DOMContentLoaded", () => {
  const mode = currentMode();
  document.querySelector(`input[name="mode"][value="${mode}"]`).checked = true;
  for (const input of document.querySelectorAll('input[name="mode"]')) {
    input.addEventListener("change", () => applyMode(input.value));
  }
  buildSwatches();
  const dashboard = Services.prefs.getBoolPref(PREF_NEWTAB, true);
  document.querySelector(`input[name="newtab"][value="${dashboard ? "dashboard" : "firefox"}"]`).checked = true;
  for (const input of document.querySelectorAll('input[name="newtab"]')) {
    input.addEventListener("change", () =>
      Services.prefs.setBoolPref(PREF_NEWTAB, input.value === "dashboard")
    );
  }
  document.getElementById("kw-import").addEventListener("click", () => {
    const { MigrationUtils } = ChromeUtils.importESModule(
      "resource:///modules/MigrationUtils.sys.mjs"
    );
    MigrationUtils.showMigrationWizard(window.browsingContext?.topChromeWindow, {
      entrypoint: MigrationUtils.MIGRATION_ENTRYPOINTS.NEWTAB,
    });
  });
  document.getElementById("kw-done").addEventListener("click", finish);
  // Probes read this.
  document.documentElement.dataset.kavachaWelcomeReady = "1";
});
