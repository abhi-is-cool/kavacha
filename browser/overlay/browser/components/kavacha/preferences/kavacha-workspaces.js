/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Kavacha "Workspaces" Settings pane (ROADMAP Phase 3 UX; ADR 0009/0021 pane
// pattern). about:preferences is the one settings home, so this pane is a THIN
// view over already-shipped features:
//   - Tab memory: the inactivity threshold pref KavachaTabMemory watches
//     (patch 0013) plus a manual "sleep now" (patch 0018).
//   - New spaces: seeds a Space from a built-in template via
//     gKavachaWorkspaces.createWorkspaceFromTemplate (patch 0009 / registry).
//   - Archived spaces: reuses the exact "Restore Archived Space" picker the
//     command palette runs (KavachaCommandRegistry, patch 0032).
// gKavachaWorkspaces / KavachaTabMemory live on the top chrome window, not in the
// about:preferences document, so everything routes through _topWin.

"use strict";

/* global ChromeUtils, Services, document, window, console */

const kUnloadPref = "kavacha.tabs.unload-after-minutes";
// Mirrors KavachaTabMemory's own code default (patch 0013).
const kUnloadDefaultMinutes = 30;
// Patch 0038: opt-in per-Space containers. Default OFF so one Google/GitHub
// sign-in carries across Spaces; Total Cookie Protection keeps third-party
// state partitioned either way. Read with the same `false` fallback the space
// manager uses, so pane and behaviour cannot disagree if the pref is missing.
const kIsolatePref = "kavacha.workspaces.isolate-containers";
// Patch 0034 / defect D0b: "restore only pinned tabs after quitting". Declared
// in ui/defaults/kavacha-ux.js and default FALSE -- it discards tabs, so it is
// opt-in. Same `false` fallback KavachaSessionCleanup uses, so the pane and the
// behaviour cannot disagree if the pref is somehow missing.
const kClearUnpinnedPref = "kavacha.session.clear-unpinned-on-quit";

var gKavachaWorkspaces = {
  _initted: false,

  init() {
    if (this._initted) {
      return;
    }
    this._initted = true;

    this._unload = document.getElementById("kavachaWorkspacesUnloadMinutes");
    this._unload.addEventListener("change", () => this._onUnloadChange());
    this._isolate = document.getElementById("kavachaWorkspacesIsolateContainers");
    this._isolate.addEventListener("command", () => this._onIsolateChange());
    this._clearUnpinned = document.getElementById("kavachaWorkspacesClearUnpinned");
    this._clearUnpinned.addEventListener("command", () =>
      this._onClearUnpinnedChange()
    );
    document
      .getElementById("kavachaWorkspacesSleepNow")
      .addEventListener("command", () => this._sleepNow());
    document
      .getElementById("kavachaWorkspacesTemplateStudent")
      .addEventListener("command", () => this._createFromTemplate("student"));
    document
      .getElementById("kavachaWorkspacesTemplateDeveloper")
      .addEventListener("command", () => this._createFromTemplate("developer"));
    document
      .getElementById("kavachaWorkspacesTemplatePrivate")
      .addEventListener("command", () => this._createFromTemplate("privacy"));
    document
      .getElementById("kavachaWorkspacesRestore")
      .addEventListener("command", () => this._restoreArchived());

    Services.prefs.addObserver(kUnloadPref, this);
    Services.prefs.addObserver(kIsolatePref, this);
    Services.prefs.addObserver(kClearUnpinnedPref, this);
    window.addEventListener("unload", () => this._uninit(), { once: true });

    this._renderUnload();
    this._renderIsolate();
    this._renderClearUnpinned();
    this._renderArchivedAvailability();
  },

  observe(subject, topic, data) {
    if (topic !== "nsPref:changed") {
      return;
    }
    if (data === kUnloadPref) {
      this._renderUnload();
    } else if (data === kIsolatePref) {
      this._renderIsolate();
    } else if (data === kClearUnpinnedPref) {
      this._renderClearUnpinned();
    }
  },

  _uninit() {
    Services.prefs.removeObserver(kUnloadPref, this);
    Services.prefs.removeObserver(kIsolatePref, this);
    Services.prefs.removeObserver(kClearUnpinnedPref, this);
  },

  // The top chrome window owns gKavachaWorkspaces; about:preferences does not.
  get _topWin() {
    return (
      window.browsingContext?.topChromeWindow ||
      Services.wm.getMostRecentBrowserWindow()
    );
  },

  _renderUnload() {
    this._unload.value = Services.prefs.getIntPref(
      kUnloadPref,
      kUnloadDefaultMinutes
    );
  },

  _onUnloadChange() {
    // 0 (or blank/negative) means never auto-sleep; KavachaTabMemory reads the
    // same pref and reschedules its timer live (patch 0013).
    let minutes = parseInt(this._unload.value, 10);
    if (isNaN(minutes) || minutes < 0) {
      minutes = 0;
    }
    Services.prefs.setIntPref(kUnloadPref, minutes);
  },

  _renderIsolate() {
    this._isolate.checked = Services.prefs.getBoolPref(kIsolatePref, false);
  },

  _renderClearUnpinned() {
    this._clearUnpinned.checked = Services.prefs.getBoolPref(
      kClearUnpinnedPref,
      false
    );
  },

  _onClearUnpinnedChange() {
    // Takes effect on the NEXT start: KavachaSessionCleanup drops the restored
    // unpinned tabs at "sessionstore-windows-restored". Nothing is discarded at
    // quit time, so toggling this never destroys what is currently open.
    Services.prefs.setBoolPref(kClearUnpinnedPref, this._clearUnpinned.checked);
  },

  _onIsolateChange() {
    // Only governs Spaces created from here on: existing Spaces keep whatever
    // container they already hold, because clearing containerTabId would orphan
    // the cookies inside that container and read to the user as being signed
    // out everywhere. The Private template ignores this pref entirely.
    Services.prefs.setBoolPref(kIsolatePref, this._isolate.checked);
  },

  _sleepNow() {
    // patch 0018: discard every eligible background tab now, ignoring the
    // inactivity threshold.
    ChromeUtils.importESModule(
      "resource:///modules/KavachaTabMemory.sys.mjs"
    ).KavachaTabMemory.sleepBackgroundTabsNow();
  },

  _createFromTemplate(kind) {
    // patch 0009: seed a new Space pre-arranged for a way of working.
    const win = this._topWin;
    win?.gKavachaWorkspaces
      ?.createWorkspaceFromTemplate(kind)
      .catch(e =>
        console.error("KavachaWorkspaces: create-from-template failed", e)
      );
  },

  _restoreArchived() {
    // Run the same picker the "Restore Archived Space" command runs, on the
    // top chrome window — no duplicated restore logic (patch 0032).
    const win = this._topWin;
    if (!win) {
      return;
    }
    const { KavachaCommandRegistry } = ChromeUtils.importESModule(
      "resource:///modules/KavachaCommandRegistry.sys.mjs"
    );
    const cmd = KavachaCommandRegistry.all().find(
      c => c.l10nId === "kavacha-action-restore-space"
    );
    cmd?.command(win);
    this._renderArchivedAvailability();
  },

  _renderArchivedAvailability() {
    const win = this._topWin;
    const hasArchived = !!win?.gKavachaWorkspaces
      ?.getWorkspaces?.()
      .some(w => w.archived);
    document.getElementById("kavachaWorkspacesRestore").disabled = !hasArchived;
  },
};
