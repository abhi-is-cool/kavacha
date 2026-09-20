// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Kavacha per-workspace Places attribution (ADR 0005; ROADMAP Phase 2).
//
// Two responsibilities, both riding side tables in places.sqlite so Places'
// own schema is never touched (ADR 0001):
//
// 1. HISTORY ATTRIBUTION — record which space each top-level navigation
//    happened in (`kavacha_history_workspaces`: url, visit_time,
//    workspace_uuid). Attribution happens at the TAB layer via a per-window
//    tabs-progress listener reading the navigating tab's kavacha-space-id;
//    Places visit events carry no tab reference, so this is the only way to
//    stay correct for background-tab loads. This is organization, not a
//    privacy boundary — the visits themselves still live in Places.
//
// 2. (Bookmark auto-assignment rode on Zen's `zen_bookmarks_workspaces` side
//    table. Per-space bookmarks are DEFERRED on the Firefox base — ADR 0021 —
//    so that half is gone until a Kavacha side table exists.)
//
// Process singleton: every window's KavachaStartup calls init(window); the
// first call wires the process-wide pieces, every call wires that window.

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  PlacesUtils: "resource://gre/modules/PlacesUtils.sys.mjs",
  PrivateBrowsingUtils: "resource://gre/modules/PrivateBrowsingUtils.sys.mjs",
});

// Batch visit rows so a burst of navigations costs one transaction, not N.
const kFlushDelayMs = 5000;
const kMaxQueued = 100;

export const KavachaPlacesAttribution = {
  _initialized: false,
  _tableReady: null,
  _queue: [],
  _flushTimer: null,

  init(win) {
    if (!this._initialized) {
      this._initialized = true;
      this._tableReady = this._ensureTable();
      Services.obs.addObserver(this, "quit-application-granted");
    }
    this._initWindow(win);
  },

  observe() {
    // Flush pending rows before shutdown so the last few navigations stick.
    this._flush();
  },

  /* -------------------------------------------------------------- storage */

  async _ensureTable() {
    await lazy.PlacesUtils.withConnectionWrapper(
      "KavachaPlacesAttribution.init",
      async db => {
        await db.execute(`
          CREATE TABLE IF NOT EXISTS kavacha_history_workspaces (
            id INTEGER PRIMARY KEY,
            url TEXT NOT NULL,
            visit_time INTEGER NOT NULL,
            workspace_uuid TEXT NOT NULL
          )
        `);
        await db.execute(`
          CREATE INDEX IF NOT EXISTS idx_kavacha_history_workspaces_url
            ON kavacha_history_workspaces(url, visit_time)
        `);
        await db.execute(`
          CREATE INDEX IF NOT EXISTS idx_kavacha_history_workspaces_space
            ON kavacha_history_workspaces(workspace_uuid, visit_time)
        `);
      }
    );
  },

  /* --------------------------------------------------- history attribution */

  _initWindow(win) {
    if (!win?.gBrowser || win.__kavachaAttributionWired) {
      return;
    }
    win.__kavachaAttributionWired = true;
    if (lazy.PrivateBrowsingUtils.isWindowPrivate(win)) {
      return; // never record private browsing
    }
    const self = this;
    win.gBrowser.addTabsProgressListener({
      onLocationChange(browser, webProgress, request, location, flags) {
        if (
          !webProgress.isTopLevel ||
          flags & Ci.nsIWebProgressListener.LOCATION_CHANGE_SAME_DOCUMENT
        ) {
          return;
        }
        if (!/^https?$/.test(location.scheme)) {
          return;
        }
        const tab = win.gBrowser.getTabForBrowser(browser);
        // Pinned tabs are cross-space by design — no single space to credit.
        const workspaceId = tab?.getAttribute("kavacha-space-id");
        if (!workspaceId || tab.pinned) {
          return;
        }
        self._record(location.spec, workspaceId);
      },
    });
  },

  _record(url, workspaceId) {
    this._queue.push({ url, time: Date.now(), workspaceId });
    if (this._queue.length >= kMaxQueued) {
      this._flush();
      return;
    }
    if (!this._flushTimer) {
      this._flushTimer = Cc["@mozilla.org/timer;1"].createInstance(
        Ci.nsITimer
      );
      this._flushTimer.initWithCallback(
        () => this._flush(),
        kFlushDelayMs,
        Ci.nsITimer.TYPE_ONE_SHOT
      );
    }
  },

  async _flush() {
    if (this._flushTimer) {
      this._flushTimer.cancel();
      this._flushTimer = null;
    }
    const rows = this._queue.splice(0);
    if (!rows.length) {
      return;
    }
    try {
      await this._tableReady;
      await lazy.PlacesUtils.withConnectionWrapper(
        "KavachaPlacesAttribution.flush",
        async db => {
          await db.executeTransaction(async () => {
            for (const row of rows) {
              await db.execute(
                `INSERT INTO kavacha_history_workspaces
                   (url, visit_time, workspace_uuid)
                 VALUES (:url, :time, :workspaceId)`,
                row
              );
            }
          });
        }
      );
    } catch (e) {
      console.error("KavachaPlacesAttribution: flush failed", e);
    }
  },

  /**
   * Latest-visit workspace for each of the given URLs (universal search
   * badges). Returns Map<url, workspaceUuid>; URLs never attributed are
   * absent.
   */
  async latestWorkspaceForUrls(urls) {
    const result = new Map();
    if (!urls.length) {
      return result;
    }
    await this._tableReady;
    // Flush first so just-visited pages resolve too.
    await this._flush();
    try {
      const placeholders = urls.map(() => "?").join(",");
      const rows = await lazy.PlacesUtils.withConnectionWrapper(
        "KavachaPlacesAttribution.lookup",
        db =>
          db.execute(
            `SELECT url, workspace_uuid, MAX(visit_time)
               FROM kavacha_history_workspaces
              WHERE url IN (${placeholders})
              GROUP BY url`,
            urls
          )
      );
      for (const row of rows) {
        result.set(
          row.getResultByName("url"),
          row.getResultByName("workspace_uuid")
        );
      }
    } catch (e) {
      console.error("KavachaPlacesAttribution: lookup failed", e);
    }
    return result;
  },
};
