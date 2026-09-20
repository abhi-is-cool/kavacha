/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Kavacha Settings pane "Appearance" — PLACEHOLDER (M2). The real pane object from
 * the Zen-era kavacha-appearance.js replaces this in port milestone M3. Registered by
 * preferences.js (patch 0004) as "paneKavachaAppearance"; a missing or throwing pane object
 * costs this pane only, never the Settings UI. */

"use strict";

// eslint-disable-next-line no-unused-vars
var gKavachaAppearance = {
  init() {
    document.getElementById("kavachaAppearanceCategory")?.toggleAttribute("kavacha-placeholder", true);
  },
};
