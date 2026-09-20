/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Kavacha Settings pane "Customization" — PLACEHOLDER (M2). The real pane object from
 * the Zen-era kavacha-customization.js replaces this in port milestone M3. Registered by
 * preferences.js (patch 0004) as "paneKavachaCustomization"; a missing or throwing pane object
 * costs this pane only, never the Settings UI. */

"use strict";

// eslint-disable-next-line no-unused-vars
var gKavachaCustomization = {
  init() {
    document.getElementById("kavachaCustomizationCategory")?.toggleAttribute("kavacha-placeholder", true);
  },
};
