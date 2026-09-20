/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Kavacha window-scope boot. Loaded into every browser window by
 * KavachaStartup at "browser-window-before-show" (DOM ready, before first
 * paint) with Services.scriptloader.loadSubScript, so it runs in the window's
 * global like browser.js does — no browser.xhtml patch needed.
 *
 * It defines the window globals the ported code expects (gKavacha*, the
 * command <keyset>) and nothing else: process-wide work belongs in
 * KavachaStartup, per-feature work in that feature's module. Replaces the 20
 * ZenStartup hunks, ZenPreloadedScripts and zen-sets.js of the Zen era. */

"use strict";

// eslint-disable-next-line no-unused-vars
var gKavacha = {
  // Bumped by KavachaStartup once every window hook has run; the probe reads it.
  ready: false,
  version: Services.appinfo.version,

  /** The <keyset> Kavacha commands bind into (created on demand). */
  get keyset() {
    let ks = document.getElementById("kavacha-keyset");
    if (!ks) {
      ks = document.createXULElement("keyset");
      ks.id = "kavacha-keyset";
      document.getElementById("mainKeyset")?.after(ks) ||
        document.documentElement.appendChild(ks);
    }
    return ks;
  },
};
