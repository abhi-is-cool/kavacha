// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Kavacha "clear unpinned tabs on quit" (ROADMAP Phase 3 UX). Zen restores the
// previous session on launch, which brings back EVERY tab. Kavacha's rule is
// the opposite for casual tabs: ordinary tabs should not survive a quit, and
// only the tabs you deliberately PINNED should come back. Pinning is the
// explicit "keep this" gesture.
//
// Mechanism: a process singleton that observes "sessionstore-windows-restored"
// and closes the non-pinned tabs the session just restored. The user-visible
// result is the advertised one — after a quit, only pinned tabs are there — but
// the work happens at STARTUP, with the browser fully running, instead of
// during shutdown. That is not a stylistic choice; see D0 below.
//
// D0 (2026-08-01): doing this during shutdown destroyed PINNED tabs, and no
// shutdown timing works. Three engine facts, all read from engine/:
//
//   1. SessionStore registers its observers in init(), before any browser
//      window exists (SessionStore.sys.mjs:1310), so its
//      "quit-application-granted" handler always runs FIRST and snapshots every
//      window via _collectWindowData().
//   2. getCurrentState() re-collects window data only `if (RunState.isRunning)`
//      (SessionStore.sys.mjs:5630), so once shutdown starts the state that will
//      be written is frozen at that snapshot. Removing tabs afterwards cannot
//      influence the saved session.
//   3. Removing them actively CORRUPTS it. The removed tab elements stay in
//      gKavachaWorkspaces.allStoredTabs with a null linkedBrowser, and the next
//      _collectWindowData() dereferences `browser.audioMuted` with no null
//      guard (TabState.sys.mjs:79). Since _collectWindowData assigns
//      `winData.tabs = []` before its loop, that throw truncates the tab array
//      and aborts the shutdown save: sessionstore.jsonlz4 is never produced and
//      the next start restores nothing at all.
//
// Moving the work earlier, to "quit-application-requested", does NOT help:
// nsAppStartup::Quit fires "requested" and "granted" in one synchronous
// sequence, so the detached tabs are still lingering when SessionStore
// collects. Measured on buildID 20260801085833, fresh profile, pref on: 4
// TabState TypeErrors, no sessionstore.jsonlz4, and startup parsed zero
// windows. The only safe place left is after the restore has completed.
//
// Closing restored tabs is cheap because browser.sessionstore.restore_on_demand
// defaults to true (firefox.js:1491): restored background tabs are lazy, so
// they are discarded before they ever hit the network. They also land in the
// normal "recently closed" list, so the user can undo.
//
// Gated on the pref kavacha.session.clear-unpinned-on-quit, declared in
// ui/defaults/kavacha-ux.js and defaulting to FALSE — this discards tabs, so it
// is opt-in. skipPermitUnload avoids beforeunload prompts on tabs the user
// never interacted with; closeWindowWithLastTab:false keeps removeTab from
// tearing down a window that restored nothing but unpinned tabs.

const PREF = "kavacha.session.clear-unpinned-on-quit";

export const KavachaSessionCleanup = {
  _initialized: false,

  /** Process-singleton init. Idempotent — safe to call once per window. */
  init() {
    if (this._initialized) {
      return;
    }
    this._initialized = true;

    // Wait on SessionStore.promiseAllWindowsRestored rather than observing
    // "sessionstore-windows-restored". The notification is a one-shot: init()
    // runs from KavachaStartup, which can be LATE — measured on buildID
    // 20260801151610, the observer registered after the notification had
    // already fired, so the cleanup never ran and the feature was a silent
    // no-op (pinned tabs survived, but so did every unpinned one). The promise
    // resolves at exactly the same three sites the notification fires
    // (SessionStore.sys.mjs:2149/2177/7817 vs :2144/2171/7815) and can be
    // awaited after the fact, so this cannot be missed however init() is
    // ordered.
    const { SessionStore } = ChromeUtils.importESModule(
      "resource:///modules/sessionstore/SessionStore.sys.mjs"
    );
    SessionStore.promiseAllWindowsRestored
      .then(() => {
        // Read the pref here, not at init: the user may have flipped it in
        // Settings during startup, and this is the moment it takes effect.
        if (!Services.prefs.getBoolPref(PREF, false)) {
          return;
        }
        // Yield one turn before touching tabs. promiseAllWindowsRestored
        // resolves from inside SessionStore's own restore path, and closing
        // tabs synchronously from there races its bookkeeping.
        Services.tm.dispatchToMainThread(() =>
          this._clearRestoredUnpinnedTabs()
        );
      })
      .catch(e => console.error("KavachaSessionCleanup: restore hook failed", e));
  },

  _clearRestoredUnpinnedTabs() {
    for (const win of Services.wm.getEnumerator("navigator:browser")) {
      const gBrowser = win.gBrowser;
      if (!gBrowser || win.closed) {
        continue;
      }
      // Snapshot first: removeTab mutates gBrowser.tabs while we iterate.
      const unpinned = Array.prototype.filter.call(
        gBrowser.tabs,
        tab => !tab.pinned && !tab.closing
      );
      // Never leave a window with nothing in it: if every restored tab was
      // unpinned, keep the last one rather than closing into an empty window.
      const keepOne = unpinned.length === gBrowser.tabs.length;
      const doomed = keepOne ? unpinned.slice(0, -1) : unpinned;
      if (!doomed.length) {
        continue;
      }
      // Move selection off a doomed tab BEFORE closing anything. Closing the
      // selected tab mid-startup can leave the window with no linked browser —
      // observed on buildID 20260801154708 as Marionette failing to attach with
      // `browserElement is null`, i.e. a window the user would find broken.
      const survivor =
        Array.prototype.find.call(
          gBrowser.tabs,
          tab => !doomed.includes(tab) && !tab.closing
        ) || null;
      if (!survivor) {
        continue;
      }
      if (doomed.includes(gBrowser.selectedTab)) {
        try {
          gBrowser.selectedTab = survivor;
        } catch (e) {
          win.console?.error("KavachaSessionCleanup: could not reselect", e);
          continue;
        }
      }
      for (const tab of doomed) {
        try {
          gBrowser.removeTab(tab, {
            animate: false,
            skipPermitUnload: true,
            closeWindowWithLastTab: false,
          });
        } catch (e) {
          win.console?.error("KavachaSessionCleanup: removeTab failed", e);
        }
      }
    }
  },
};
