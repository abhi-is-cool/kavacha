// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Kavacha workspace state-history substrate (ADR 0006; ROADMAP Phase 2.5).
//
// An append-only, local-only store of point-in-time workspace snapshots —
// the foundation research branching and time-travel consume, and raw
// material for the Phase 6 knowledge graph. A snapshot captures one space:
// its tabs as SessionStore tab-state strings (the exact serialization
// session restore round-trips, so fidelity is what restart testing
// verified), the active tab index, and a copy of the space's note.
//
// Triggers (wired elsewhere): space switch (outgoing space), archive, quit,
// and the "Snapshot this Space" palette command. Structural dedup skips a
// snapshot when ordered tab URLs + active index + note match the previous
// one; count+age retention bounds the store.
//
// Process singleton; init from KavachaStartup is idempotent.

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  SessionStore: "resource:///modules/sessionstore/SessionStore.sys.mjs",
  Sqlite: "resource://gre/modules/Sqlite.sys.mjs",
  TabStateFlusher: "resource:///modules/sessionstore/TabStateFlusher.sys.mjs",
  PrivateBrowsingUtils: "resource://gre/modules/PrivateBrowsingUtils.sys.mjs",
});

const kMaxPerSpacePref = "kavacha.history.max-snapshots-per-space";
const kRetentionDaysPref = "kavacha.history.retention-days";
const kPayloadVersion = 1;

function structureHash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  }
  return String(h >>> 0);
}

export const KavachaSpaceHistory = {
  _initialized: false,
  _dbPromise: null,

  init() {
    if (this._initialized) {
      return;
    }
    this._initialized = true;
    Services.obs.addObserver(this, "quit-application-granted");
  },

  observe(subject, topic) {
    if (topic === "quit-application-granted") {
      // Best-effort: capture each window's active space on the way out.
      for (const win of Services.wm.getEnumerator("navigator:browser")) {
        const uuid = win.gKavachaWorkspaces?.activeWorkspace;
        if (uuid) {
          this.snapshotSpace(win, uuid, "quit", { flush: false });
        }
      }
    }
  },

  /* -------------------------------------------------------------- storage */

  _getDb() {
    if (!this._dbPromise) {
      this._dbPromise = (async () => {
        const db = await lazy.Sqlite.openConnection({
          path: PathUtils.join(PathUtils.profileDir, "kavacha-snapshots.sqlite"),
        });
        await db.execute(`
          CREATE TABLE IF NOT EXISTS snapshots (
            id INTEGER PRIMARY KEY,
            space_uuid TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            reason TEXT NOT NULL,
            structure_hash TEXT NOT NULL,
            tab_count INTEGER NOT NULL,
            payload TEXT NOT NULL
          )
        `);
        await db.execute(`
          CREATE INDEX IF NOT EXISTS idx_snapshots_space
            ON snapshots(space_uuid, created_at)
        `);
        // Patch 0081: `label` names a user-saved session. It has to be a
        // COLUMN rather than another payload field, because listSnapshots
        // renders the timeline and deliberately never parses payloads —
        // those hold every tab's full SessionStore state, and reading them
        // all to fetch one string would make opening the timeline cost
        // megabytes. CREATE TABLE IF NOT EXISTS does nothing for profiles
        // that already have the table, so existing ones are migrated here.
        const columns = await db.execute("PRAGMA table_info(snapshots)");
        const hasLabel = columns.some(
          c => c.getResultByName("name") === "label"
        );
        if (!hasLabel) {
          await db.execute("ALTER TABLE snapshots ADD COLUMN label TEXT");
        }
        lazy.Sqlite.shutdown.addBlocker(
          "KavachaSpaceHistory: close db",
          () => db.close()
        );
        return db;
      })();
    }
    return this._dbPromise;
  },

  /* -------------------------------------------------------------- capture */

  /**
   * Snapshot one space as it exists in `win` right now. Fire-and-forget
   * safe: never throws, resolves to the new snapshot id, or null when
   * skipped (dedup, empty space, private window).
   */
  // `label` names a snapshot the user deliberately saved ("Save This Research
  // Session", patch 0081) and `force` skips the structural-hash dedup for it.
  // Both exist for the same reason: an automatic snapshot is a safety net and
  // a duplicate of it is noise, but a SAVED session is an act of intent — the
  // user pressing save and getting silently nothing back because the tab set
  // has not changed since the last space switch is a bug, not a de-duplication.
  // Labelled snapshots also survive retention (see _gc).
  async snapshotSpace(
    win,
    spaceUuid,
    reason,
    { flush = true, label = "", force = false } = {}
  ) {
    try {
      if (
        !win?.gBrowser ||
        win.closed ||
        lazy.PrivateBrowsingUtils.isWindowPrivate(win)
      ) {
        return null;
      }
      const tabs = win.gBrowser.tabs.filter(
        tab =>
          tab.getAttribute("kavacha-space-id") === spaceUuid &&
          !tab.pinned && // pinned tabs are global across spaces (ADR 0021)
          !tab.closing
      );
      if (!tabs.length) {
        return null;
      }
      if (flush) {
        // Scroll/form state lives in the content process until flushed.
        await Promise.all(
          tabs.map(tab =>
            lazy.TabStateFlusher.flush(tab.linkedBrowser).catch(() => {})
          )
        );
      }

      const captured = [];
      for (const tab of tabs) {
        try {
          const state = lazy.SessionStore.getTabState(tab);
          const parsed = JSON.parse(state);
          const entry = parsed.entries?.[(parsed.index || 1) - 1];
          const url = entry?.url || "about:blank";
          // Placeholder pages carry no work state — snapshotting them only
          // adds noise to timelines and branches.
          if (
            url === "about:blank" ||
            url.startsWith("chrome://browser/content/kavacha/newtab/")
          ) {
            continue;
          }
          captured.push({
            state,
            pinned: !!tab.pinned,
            url,
          });
        } catch (e) {
          // A tab mid-teardown or unrestorable; skip it, keep the rest.
        }
      }
      if (!captured.length) {
        return null;
      }
      const activeIndex = tabs.indexOf(win.gBrowser.selectedTab);

      let note = "";
      try {
        const notes = await win.gKavachaWorkspaces.kavachaGetAllNotes();
        note = notes[spaceUuid]?.content || "";
      } catch (e) {
        // notes unavailable (private/disabled) — snapshot without
      }
      const space = win.gKavachaWorkspaces.getWorkspaceFromId(spaceUuid);

      const hash = structureHash(
        JSON.stringify({
          urls: captured.map(t => t.url),
          activeIndex,
          note,
        })
      );

      const db = await this._getDb();
      const last = await db.execute(
        `SELECT structure_hash FROM snapshots
          WHERE space_uuid = :spaceUuid
          ORDER BY created_at DESC LIMIT 1`,
        { spaceUuid }
      );
      if (
        !force &&
        last.length &&
        last[0].getResultByName("structure_hash") === hash
      ) {
        return null; // nothing structural changed since the previous snapshot
      }

      const payload = JSON.stringify({
        version: kPayloadVersion,
        label,
        spaceName: space?.name || "",
        spaceIcon: space?.icon || null,
        containerId: space?.containerId ?? 0,
        activeIndex,
        note,
        tabs: captured,
      });
      const now = Date.now();
      await db.execute(
        `INSERT INTO snapshots
           (space_uuid, created_at, reason, structure_hash, tab_count, payload,
            label)
         VALUES (:spaceUuid, :now, :reason, :hash, :tabCount, :payload,
                 :label)`,
        {
          spaceUuid,
          now,
          reason,
          hash,
          tabCount: captured.length,
          payload,
          label,
        }
      );
      const idRow = await db.execute(
        "SELECT last_insert_rowid() AS id"
      );
      await this._gc(db, spaceUuid);
      return idRow[0].getResultByName("id");
    } catch (e) {
      console.error("KavachaSpaceHistory: snapshot failed", e);
      return null;
    }
  },

  // Retention applies to AUTOMATIC snapshots only. A saved session (patch
  // 0081) is something the user named and expects to still be there in six
  // months; count-and-age retention silently deleting it would be data loss
  // on a feature whose entire promise is "keep this". Saved sessions are
  // excluded from both the per-space cap and the age cutoff, and they are
  // excluded from the cap's own ordering too — otherwise they would occupy
  // the newest-100 window and evict the automatic history they sit beside.
  async _gc(db, spaceUuid) {
    const maxPerSpace = Services.prefs.getIntPref(kMaxPerSpacePref, 100);
    const retentionDays = Services.prefs.getIntPref(kRetentionDaysPref, 90);
    await db.execute(
      `DELETE FROM snapshots
        WHERE space_uuid = :spaceUuid
          AND reason != 'session'
          AND id NOT IN (
            SELECT id FROM snapshots
             WHERE space_uuid = :spaceUuid AND reason != 'session'
             ORDER BY created_at DESC LIMIT :maxPerSpace
          )`,
      { spaceUuid, maxPerSpace }
    );
    const cutoff = Date.now() - retentionDays * 86_400_000;
    await db.execute(
      "DELETE FROM snapshots WHERE created_at < :cutoff AND reason != 'session'",
      { cutoff }
    );
  },

  /* ---------------------------------------------------------------- query */

  /** Newest-first snapshot metadata for one space (no payloads). */
  async listSnapshots(spaceUuid) {
    const db = await this._getDb();
    const rows = await db.execute(
      `SELECT id, created_at, reason, tab_count, label FROM snapshots
        WHERE space_uuid = :spaceUuid ORDER BY created_at DESC`,
      { spaceUuid }
    );
    return rows.map(r => ({
      id: r.getResultByName("id"),
      createdAt: r.getResultByName("created_at"),
      reason: r.getResultByName("reason"),
      tabCount: r.getResultByName("tab_count"),
      label: r.getResultByName("label") || "",
    }));
  },

  /**
   * Every SAVED session, across all Spaces, newest first (patch 0086;
   * FEATURES 7.2). A saved session is a snapshot with a label — the thing
   * patch 0081 started recording and gave no way to find again except by
   * remembering which Space it belonged to, which is exactly the thing a
   * person forgets. Payloads are never read here: the list is metadata, and
   * a payload holds every tab's full SessionStore state.
   */
  async listSavedSessions() {
    const db = await this._getDb();
    const rows = await db.execute(
      `SELECT id, space_uuid, created_at, reason, tab_count, label
         FROM snapshots
        WHERE label IS NOT NULL AND label != ''
        ORDER BY created_at DESC`
    );
    return rows.map(r => ({
      id: r.getResultByName("id"),
      spaceUuid: r.getResultByName("space_uuid"),
      createdAt: r.getResultByName("created_at"),
      reason: r.getResultByName("reason"),
      tabCount: r.getResultByName("tab_count"),
      label: r.getResultByName("label") || "",
    }));
  },

  /** Rename a saved session. An empty label would un-save it, so it is refused. */
  async renameSnapshot(id, label) {
    const text = String(label || "").trim();
    if (!text) {
      return false;
    }
    const db = await this._getDb();
    await db.execute("UPDATE snapshots SET label = :text WHERE id = :id", {
      text,
      id,
    });
    return true;
  },

  /**
   * Delete one snapshot. The only way a saved session can be removed, since
   * retention deliberately exempts labelled ones (patch 0081) — count-and-age
   * silently deleting something the user named would be data loss on a
   * feature whose whole promise is "keep this".
   */
  async deleteSnapshot(id) {
    const db = await this._getDb();
    await db.execute("DELETE FROM snapshots WHERE id = :id", { id });
    return true;
  },

  /** One full snapshot: metadata + parsed payload; null if unknown id. */
  async getSnapshot(id) {
    const db = await this._getDb();
    const rows = await db.execute(
      `SELECT space_uuid, created_at, reason, payload
         FROM snapshots WHERE id = :id`,
      { id }
    );
    if (!rows.length) {
      return null;
    }
    const r = rows[0];
    return {
      id,
      spaceUuid: r.getResultByName("space_uuid"),
      createdAt: r.getResultByName("created_at"),
      reason: r.getResultByName("reason"),
      payload: JSON.parse(r.getResultByName("payload")),
    };
  },
};
