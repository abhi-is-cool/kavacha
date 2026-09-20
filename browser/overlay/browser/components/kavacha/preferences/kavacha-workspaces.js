/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Kavacha Settings pane "Workspaces" — PLACEHOLDER (M2). The real pane object from
 * the Zen-era kavacha-workspaces.js replaces this in port milestone M3. Registered by
 * preferences.js (patch 0004) as "paneKavachaWorkspaces"; a missing or throwing pane object
 * costs this pane only, never the Settings UI. */

"use strict";

// eslint-disable-next-line no-unused-vars
var gKavachaWorkspaces = {
  init() {
    document.getElementById("kavachaWorkspacesCategory")?.toggleAttribute("kavacha-placeholder", true);
  },
};
