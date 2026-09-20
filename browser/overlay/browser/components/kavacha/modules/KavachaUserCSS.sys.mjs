// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Kavacha user-CSS engine — the Customization Studio's "Advanced" tier
// (ROADMAP Phase 3 "Live CSS editor with history + safe mode"; ADR 0009).
//
// This is userChrome.css done safely: the user's chrome CSS is applied LIVE as
// a per-window AUTHOR_SHEET (windowUtils.loadSheetUsingURIString — the same
// chrome-only mechanism patches 0012/0022/0023 use; it styles the browser
// chrome, never web content and never gains script execution), it is VERSIONED
// (every save snapshots the previous text so any change can be reverted), and
// it has a SAFE MODE — a single pref that disables all custom CSS, so a broken
// rule can never brick the UI (the "Toggle Custom CSS Safe Mode" palette
// command flips it even if the chrome is unusable).
//
// Runtime shape mirrors KavachaLayoutEngine / KavachaThemeEngine (ADR 0008): a
// process singleton whose init() installs the observers, a per-window
// applyToWindow() called from KavachaStartup, and applyToAllWindows() driven by a
// monotonic `kavacha.usercss.revision` bump — the doorbell the about:studio
// editor rings after a save.
//
// State on disk (profile):
//   kavacha-user-chrome.css      current CSS text (hand-editable)
//   kavacha-usercss-history.json [{ ts:<epoch ms>, css:<string> }, ...]
//                                newest first, capped at history-max.

const kCssFile = "kavacha-user-chrome.css";
const kHistoryFile = "kavacha-usercss-history.json";
const kRevisionPref = "kavacha.usercss.revision";
const kSafeModePref = "kavacha.usercss.safe-mode";
const kHistoryMaxPref = "kavacha.usercss.history-max";
const kDefaultHistoryMax = 50;

// Prepended to every applied sheet so users don't have to remember the XUL
// namespace incantation that userChrome.css requires. Re-declaring the default
// namespace in the user's own CSS is still valid (last declaration wins).
const kNamespaces =
  '@namespace url("http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul");\n' +
  '@namespace html url("http://www.w3.org/1999/xhtml");\n';

export const KavachaUserCSS = {
  _initialized: false,
  _css: null,
  _sheetByWindow: new WeakMap(),
  // Every mutation runs through this chain, one at a time. Without it two
  // saves in flight — the Studio's Apply racing a palette command, or any
  // caller that does not await — both read the pre-write text, both conclude
  // there is nothing to snapshot, and the history is silently lost (D8).
  _mutations: Promise.resolve(),

  init() {
    if (this._initialized) {
      return;
    }
    this._initialized = true;
    Services.prefs.addObserver(kRevisionPref, this);
    Services.prefs.addObserver(kSafeModePref, this);
  },

  observe(subject, topic, data) {
    if (topic !== "nsPref:changed") {
      return;
    }
    if (data === kRevisionPref) {
      // Content (about:studio) saved new CSS — re-read from disk and re-apply.
      this._css = null;
      this.applyToAllWindows();
    } else if (data === kSafeModePref) {
      this.applyToAllWindows();
    }
  },

  get isSafeMode() {
    return Services.prefs.getBoolPref(kSafeModePref, false);
  },

  get _cssPath() {
    return PathUtils.join(PathUtils.profileDir, kCssFile);
  },

  get _historyPath() {
    return PathUtils.join(PathUtils.profileDir, kHistoryFile);
  },

  /** The CSS as it is on disk right now, bypassing the cache. */
  async _readCSSFromDisk() {
    try {
      return await IOUtils.readUTF8(this._cssPath);
    } catch (e) {
      if (e?.name !== "NotFoundError") {
        console.error("KavachaUserCSS: could not read custom CSS", e);
      }
      return ""; // First run — no file yet.
    }
  },

  async _loadCSS() {
    if (this._css !== null) {
      return this._css;
    }
    this._css = await this._readCSSFromDisk();
    return this._css;
  },

  // Run `fn` after every mutation already queued, and hand the caller its
  // result. A rejection propagates to that caller but must not poison the
  // chain, so the chain itself continues from a settled promise either way.
  _enqueue(fn) {
    const run = this._mutations.then(fn, fn);
    this._mutations = run.then(
      () => {},
      () => {}
    );
    return run;
  },

  // ----- Public API (about:studio Advanced tab, palette) ------------------

  /** The current custom CSS text (may be ""). */
  async getCSS() {
    return this._loadCSS();
  },

  /** Replace the CSS, snapshotting the previous text into history, then apply. */
  setCSS(text) {
    return this._enqueue(() => this._setCSSLocked(text));
  },

  // The write itself. Only ever called from inside _enqueue, so it may assume
  // no other mutation is in flight.
  async _setCSSLocked(text) {
    const css = typeof text === "string" ? text : "";
    // Read what we are about to overwrite from DISK, not from this._css: the
    // cache is invalidated asynchronously by the revision observer, so a
    // caller arriving mid-flight can find it holding either the old text or
    // null. Disk is the only value that is unambiguously "what is being
    // replaced" (D8).
    const previous = await this._readCSSFromDisk();
    // Snapshot even an empty baseline, so a user whose first-ever save is the
    // one that breaks their chrome still has something to revert TO. Skip only
    // a true no-op, which would otherwise fill the history with duplicates.
    if (previous !== css) {
      await this._pushHistory(previous);
    }
    await IOUtils.writeUTF8(this._cssPath, css);
    this._css = css;
    // Bump the revision: the observer re-applies to every window, and an
    // about:studio editor watching the pref re-reads too.
    Services.prefs.setIntPref(
      kRevisionPref,
      Services.prefs.getIntPref(kRevisionPref, 0) + 1
    );
  },

  async _readHistory() {
    let raw;
    try {
      raw = await IOUtils.readUTF8(this._historyPath);
    } catch (e) {
      if (e?.name !== "NotFoundError") {
        // Anything other than "no history yet" is worth saying out loud. An
        // unreadable history file otherwise presents exactly as an empty one,
        // which is what made D8 look like a missing feature for a day.
        console.error("KavachaUserCSS: could not read history", e);
      }
      return [];
    }
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error("KavachaUserCSS: history file is not valid JSON", e);
      return [];
    }
  },

  async _pushHistory(css) {
    const history = await this._readHistory();
    history.unshift({ ts: Date.now(), css });
    const max = Math.max(
      1,
      Services.prefs.getIntPref(kHistoryMaxPref, kDefaultHistoryMax)
    );
    history.length = Math.min(history.length, max);
    await IOUtils.writeUTF8(this._historyPath, JSON.stringify(history, null, 2));
  },

  /** History newest-first: [{ ts, css }]. */
  async listHistory() {
    return this._readHistory();
  },

  /** Restore a history entry as the current CSS (itself undoable — the write
   *  snapshots whatever is current before overwriting it). The read and the
   *  write share one turn of the queue, so a save landing in between cannot
   *  make this restore a different entry than the one that was clicked. */
  revertTo(index) {
    return this._enqueue(async () => {
      const history = await this._readHistory();
      const entry = history[index];
      if (entry) {
        await this._setCSSLocked(entry.css);
      }
    });
  },

  setSafeMode(on) {
    Services.prefs.setBoolPref(kSafeModePref, !!on);
  },

  toggleSafeMode() {
    this.setSafeMode(!this.isSafeMode);
  },

  // ----- Application ------------------------------------------------------

  applyToAllWindows() {
    for (const win of Services.wm.getEnumerator("navigator:browser")) {
      if (!win.closed && win.document?.documentElement) {
        this.applyToWindow(win);
      }
    }
  },

  async applyToWindow(win) {
    if (win.closed || !win.windowUtils) {
      return;
    }
    const utils = win.windowUtils;

    // Always tear down the previous sheet first, so re-apply/safe-mode/revert
    // all converge to "exactly the current CSS, or nothing".
    const prev = this._sheetByWindow.get(win);
    if (prev) {
      try {
        utils.removeSheetUsingURIString(prev, utils.AUTHOR_SHEET);
      } catch (e) {}
      this._sheetByWindow.delete(win);
    }

    if (this.isSafeMode) {
      return; // Escape hatch: no custom CSS at all.
    }
    const css = await this._loadCSS();
    if (!css.trim()) {
      return;
    }
    const uri =
      "data:text/css;charset=utf-8," + encodeURIComponent(kNamespaces + css);
    try {
      utils.loadSheetUsingURIString(uri, utils.AUTHOR_SHEET);
      this._sheetByWindow.set(win, uri);
    } catch (e) {
      win.console?.error("KavachaUserCSS: failed to apply custom CSS", e);
    }
  },
};
