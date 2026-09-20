// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Kavacha tab memory management (ROADMAP Phase 2; PLATFORM_PLAN.md — tabs as
// temporary windows into projects). Background tabs untouched for longer than
// `kavacha.tabs.unload-after-minutes` are DISCARDED: their browser is torn
// down to free memory while the tab stays in the strip, and Firefox restores
// it automatically (from flushed session state) when the user next selects it.
//
// This is the timer-driven counterpart to Firefox's TabUnloader, which only
// fires under OS memory pressure. It reuses the same primitive Zen's space
// archiving uses — gBrowser.explicitUnloadTabs() — which flushes tab state
// before discarding, so form input and scroll position survive the round trip.
//
// Process singleton: every window's KavachaStartup calls init(); only the first
// wires the timer, which then sweeps all browser windows.

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  PrivateBrowsingUtils: "resource://gre/modules/PrivateBrowsingUtils.sys.mjs",
});

const kThresholdPref = "kavacha.tabs.unload-after-minutes";
const kDefaultThresholdMinutes = 30;
// A coarse sweep is fine — the threshold is measured in tens of minutes, so a
// minute of slack on when a tab actually sleeps is imperceptible and keeps the
// timer cheap.
const kSweepIntervalMs = 60_000;

export const KavachaTabMemory = {
  _initialized: false,
  _timer: null,

  init() {
    if (this._initialized) {
      return;
    }
    this._initialized = true;
    Services.prefs.addObserver(kThresholdPref, this);
    this._reschedule();
  },

  observe() {
    this._reschedule();
  },

  get _thresholdMinutes() {
    return Services.prefs.getIntPref(kThresholdPref, kDefaultThresholdMinutes);
  },

  _reschedule() {
    if (this._timer) {
      this._timer.cancel();
      this._timer = null;
    }
    if (this._thresholdMinutes <= 0) {
      return; // 0 or negative disables auto-unloading entirely
    }
    this._timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
    this._timer.initWithCallback(
      () => this._sweep(),
      kSweepIntervalMs,
      Ci.nsITimer.TYPE_REPEATING_SLACK
    );
  },

  // Manual "sleep now" (command palette): discard every eligible background
  // tab immediately, ignoring the inactivity threshold — cutoff = now, so
  // any tab not currently selected qualifies. Frees memory on demand.
  async sleepBackgroundTabsNow() {
    await this._sweep(Date.now());
  },

  async _sweep(forcedCutoff) {
    const minutes = this._thresholdMinutes;
    if (forcedCutoff === undefined && minutes <= 0) {
      return;
    }
    const cutoff =
      forcedCutoff !== undefined ? forcedCutoff : Date.now() - minutes * 60_000;
    for (const win of Services.wm.getEnumerator("navigator:browser")) {
      if (win.closed || !win.gBrowser) {
        continue;
      }
      // Private-window tabs aren't session-persisted, so discarding one would
      // lose its state with no way to restore it — leave them resident.
      if (lazy.PrivateBrowsingUtils.isWindowPrivate(win)) {
        continue;
      }
      const candidates = [];
      for (const tab of win.gBrowser.tabs) {
        if (this._shouldUnload(tab, cutoff)) {
          candidates.push(tab);
        }
      }
      if (candidates.length) {
        try {
          // explicitUnloadTabs flushes each tab's state, switches away from
          // any that are selected (none here — we exclude them), and discards.
          await win.gBrowser.explicitUnloadTabs(candidates);
        } catch (e) {
          console.error("KavachaTabMemory: failed to unload tabs", e);
        }
      }
    }
  },

  _shouldUnload(tab, cutoff) {
    // Never touch the tab the user is looking at, or one they've pinned.
    if (tab.selected || tab.pinned) {
      return false;
    }
    // Already discarded — its browser is gone, nothing to reclaim.
    if (tab.hasAttribute("pending")) {
      return false;
    }
    // (Zen's essentials and placeholder empty tab have no Firefox equivalent;
    // pinned tabs — checked above — are the structural ones here.)
    // Anything actively doing something the user would notice being killed.
    if (
      tab.hasAttribute("soundplaying") ||
      tab.hasAttribute("pictureinpicture") ||
      tab.hasAttribute("sharing")
    ) {
      return false;
    }
    // lastAccessed is Infinity while a tab is the selected one in its window,
    // and a real timestamp otherwise — so this also double-guards selection.
    return tab.lastAccessed <= cutoff;
  },
};
