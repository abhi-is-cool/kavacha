// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Kavacha knowledge store (ADR 0015; ROADMAP Phase 7) — the things the user
// WROTE or CHOSE TO KEEP about a page: a note attached to a URL, a highlight
// pulled from a selection, a clip of the whole readable page.
//
// THE DELETION CONTRACT IS THE OPPOSITE OF THE INDEX'S, AND THAT IS THE POINT.
// KavachaPersonalIndex (ADR 0012) follows Places: clearing history wipes it,
// because it is a derived cache of pages the browser happened to see. Nothing
// here is derived. A note is a document the user authored and a clip is
// something they deliberately saved, so clearing history must NOT destroy
// them — a browser that eats your notes when you clear your history has
// misunderstood which of the two is precious. Deletion here is explicit:
// per item in the sidebar, or "Delete everything" in about:knowledge.
//
// Consequence worth stating rather than discovering: this store therefore
// outlives history, so it is also the only Kavacha store that can reveal a
// page the user thought they had erased. That is why "Delete everything" is a
// first-class control and why the export is one call — keeping data means
// being able to get rid of it and take it with you.
//
// SHAPE. One table, three kinds:
//
//   note      — at most one per URL (partial UNIQUE index), free text, edited
//               in place. Empty body deletes the row: a note you cleared is
//               not a note.
//   highlight — a passage selected on the page, plus an optional comment.
//               This is FEATURES 6.1's "annotation": the quote is `body`'s
//               anchor, the comment is `comment`.
//   clip      — the readable text of the whole page at the moment it was
//               saved. This is also the honest half of "offline mode": the
//               text survives the site going away. It is not a byte-for-byte
//               archive; see ADR 0015 for why that is deliberate.
//
// URLs are normalized (fragment dropped, trailing "?" dropped) so a note
// written at #section-3 is the same page's note when you come back to the top.
// The query string is KEPT — ?id=42 is usually a different document.
//
// Storage is a separate SQLite file from the index on purpose: different
// lifetime, different deletion rules, different backup value.

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  Sqlite: "resource://gre/modules/Sqlite.sys.mjs",
});

const kEnabledPref = "kavacha.knowledge.enabled";
const kMaxClipCharsPref = "kavacha.knowledge.max-clip-chars";
const kDbFile = "kavacha-knowledge.sqlite";

export const KavachaKnowledgeKind = Object.freeze({
  NOTE: "note",
  HIGHLIGHT: "highlight",
  CLIP: "clip",
});

export const KavachaKnowledge = {
  _dbPromise: null,

  get enabled() {
    return Services.prefs.getBoolPref(kEnabledPref, true);
  },

  /* -------------------------------------------------------------- storage */

  _getDb() {
    if (!this._dbPromise) {
      this._dbPromise = (async () => {
        const db = await lazy.Sqlite.openConnection({
          path: PathUtils.join(PathUtils.profileDir, kDbFile),
        });
        await db.execute(`
          CREATE TABLE IF NOT EXISTS items (
            id INTEGER PRIMARY KEY,
            kind TEXT NOT NULL,
            url TEXT NOT NULL,
            title TEXT,
            body TEXT,
            comment TEXT,
            workspace_uuid TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          )
        `);
        // One note per page, enforced by the database rather than by a
        // read-then-write in JS: two windows open on the same page would
        // otherwise both find "no note" and both insert one. Partial indexes
        // are SQLite 3.8+, which every Gecko build ships.
        await db.execute(
          `CREATE UNIQUE INDEX IF NOT EXISTS idx_items_note_url
             ON items(url) WHERE kind = 'note'`
        );
        await db.execute(
          "CREATE INDEX IF NOT EXISTS idx_items_url ON items(url)"
        );
        await db.execute(
          "CREATE INDEX IF NOT EXISTS idx_items_updated ON items(updated_at)"
        );
        lazy.Sqlite.shutdown.addBlocker("KavachaKnowledge: close db", () =>
          db.close()
        );
        return db;
      })();
    }
    return this._dbPromise;
  },

  /**
   * The key a page is filed under. Fragment-insensitive (a note taken at
   * #results belongs to the page), query-sensitive (?v=… is a different
   * video). Returns "" for anything that is not an http(s) URL, which is the
   * signal every caller uses to refuse: about:, file: and chrome: pages are
   * not the user's web reading.
   */
  keyFor(url) {
    try {
      const uri = new URL(String(url || ""));
      if (uri.protocol !== "http:" && uri.protocol !== "https:") {
        return "";
      }
      uri.hash = "";
      let spec = uri.href;
      if (spec.endsWith("?")) {
        spec = spec.slice(0, -1);
      }
      return spec;
    } catch (e) {
      return "";
    }
  },

  /* --------------------------------------------------------------- writes */

  /**
   * Create or replace the note for a page. An empty (or whitespace-only) body
   * DELETES it, so clearing the box in the sidebar is how you remove a note —
   * there is no second gesture to learn. Returns the stored row, or null when
   * the note was deleted or the URL was not storable.
   */
  async saveNote({ url, title = "", body = "", workspaceUuid = null }) {
    const key = this.keyFor(url);
    if (!this.enabled || !key) {
      return null;
    }
    try {
      const db = await this._getDb();
      const text = String(body || "").trim();
      if (!text) {
        await db.execute(
          "DELETE FROM items WHERE kind = 'note' AND url = :key",
          { key }
        );
        return null;
      }
      const now = Date.now();
      await db.execute(
        `INSERT INTO items (kind, url, title, body, workspace_uuid, created_at, updated_at)
         VALUES ('note', :key, :title, :text, :workspaceUuid, :now, :now)
         ON CONFLICT(url) WHERE kind = 'note' DO UPDATE SET
           title = excluded.title, body = excluded.body,
           workspace_uuid = excluded.workspace_uuid,
           updated_at = excluded.updated_at`,
        { key, title, text, workspaceUuid, now }
      );
      return this.getNote(key);
    } catch (e) {
      console.error("KavachaKnowledge: saveNote failed", e);
      return null;
    }
  },

  /**
   * Save a highlight (a passage the user selected) or a clip (the readable
   * text of the whole page). Unlike notes these ACCUMULATE — highlighting two
   * passages on one page is two highlights, and clipping a page twice records
   * what it said on each occasion, which is the whole reason a clip beats a
   * bookmark. Returns the new row's id, or null.
   */
  async addItem({
    kind,
    url,
    title = "",
    body = "",
    comment = "",
    workspaceUuid = null,
  }) {
    const key = this.keyFor(url);
    if (!this.enabled || !key) {
      return null;
    }
    if (kind !== KavachaKnowledgeKind.HIGHLIGHT && kind !== KavachaKnowledgeKind.CLIP) {
      return null;
    }
    const text = String(body || "").trim();
    if (!text) {
      return null;
    }
    try {
      const db = await this._getDb();
      const cap = Services.prefs.getIntPref(kMaxClipCharsPref, 64_000);
      const now = Date.now();
      await db.execute(
        `INSERT INTO items (kind, url, title, body, comment, workspace_uuid, created_at, updated_at)
         VALUES (:kind, :key, :title, :text, :comment, :workspaceUuid, :now, :now)`,
        {
          kind,
          key,
          title,
          text: text.slice(0, cap),
          comment: String(comment || ""),
          workspaceUuid,
          now,
        }
      );
      const rows = await db.execute("SELECT last_insert_rowid() AS id");
      return rows[0].getResultByName("id");
    } catch (e) {
      console.error("KavachaKnowledge: addItem failed", e);
      return null;
    }
  },

  /** Attach or replace the comment on an existing highlight. */
  async setComment(id, comment) {
    try {
      const db = await this._getDb();
      await db.execute(
        "UPDATE items SET comment = :comment, updated_at = :now WHERE id = :id",
        { comment: String(comment || ""), now: Date.now(), id: Number(id) }
      );
      return true;
    } catch (e) {
      console.error("KavachaKnowledge: setComment failed", e);
      return false;
    }
  },

  /* --------------------------------------------------------------- reads */

  _row(r) {
    return {
      id: r.getResultByName("id"),
      kind: r.getResultByName("kind"),
      url: r.getResultByName("url"),
      title: r.getResultByName("title") || "",
      body: r.getResultByName("body") || "",
      comment: r.getResultByName("comment") || "",
      workspaceUuid: r.getResultByName("workspace_uuid"),
      createdAt: r.getResultByName("created_at"),
      updatedAt: r.getResultByName("updated_at"),
    };
  },

  async getNote(url) {
    const key = this.keyFor(url);
    if (!key) {
      return null;
    }
    try {
      const db = await this._getDb();
      const rows = await db.execute(
        "SELECT * FROM items WHERE kind = 'note' AND url = :key",
        { key }
      );
      return rows.length ? this._row(rows[0]) : null;
    } catch (e) {
      console.error("KavachaKnowledge: getNote failed", e);
      return null;
    }
  },

  /** Everything filed under one page: {note, highlights, clips}. */
  async forPage(url) {
    const empty = { note: null, highlights: [], clips: [] };
    const key = this.keyFor(url);
    if (!key) {
      return empty;
    }
    try {
      const db = await this._getDb();
      const rows = await db.execute(
        "SELECT * FROM items WHERE url = :key ORDER BY created_at DESC",
        { key }
      );
      const out = { note: null, highlights: [], clips: [] };
      for (const r of rows) {
        const item = this._row(r);
        if (item.kind === KavachaKnowledgeKind.NOTE) {
          out.note = item;
        } else if (item.kind === KavachaKnowledgeKind.HIGHLIGHT) {
          out.highlights.push(item);
        } else {
          out.clips.push(item);
        }
      }
      return out;
    } catch (e) {
      console.error("KavachaKnowledge: forPage failed", e);
      return empty;
    }
  },

  async get(id) {
    try {
      const db = await this._getDb();
      const rows = await db.execute("SELECT * FROM items WHERE id = :id", {
        id: Number(id),
      });
      return rows.length ? this._row(rows[0]) : null;
    } catch (e) {
      return null;
    }
  },

  /** Newest first, optionally one kind only. The library view's backing call. */
  async listRecent({ kind = null, limit = 100 } = {}) {
    try {
      const db = await this._getDb();
      const rows = await db.execute(
        `SELECT * FROM items ${kind ? "WHERE kind = :kind" : ""}
          ORDER BY updated_at DESC LIMIT :limit`,
        kind ? { kind, limit } : { limit }
      );
      return rows.map(r => this._row(r));
    } catch (e) {
      console.error("KavachaKnowledge: listRecent failed", e);
      return [];
    }
  },

  /**
   * Substring search over title, body and comment. Same LIKE-plus-JS shape as
   * the personal index and for the same reason (no FTS in Gecko's SQLite),
   * and the same ASCENDING score convention so universal search can merge the
   * two result lists without special-casing either.
   */
  async search(query, { limit = 10 } = {}) {
    const terms = String(query || "")
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    if (!terms.length) {
      return [];
    }
    try {
      const db = await this._getDb();
      const params = { limit: limit * 3 };
      const where = terms
        .map((t, i) => {
          params[`t${i}`] = "%" + t.replace(/[\\%_]/g, m => "\\" + m) + "%";
          return `(lower(title) LIKE :t${i} ESCAPE '\\'
                   OR lower(body) LIKE :t${i} ESCAPE '\\'
                   OR lower(comment) LIKE :t${i} ESCAPE '\\')`;
        })
        .join(" AND ");
      const rows = await db.execute(
        `SELECT * FROM items WHERE ${where}
          ORDER BY updated_at DESC LIMIT :limit`,
        params
      );
      const scored = rows.map(r => {
        const item = this._row(r);
        const hay = (
          item.title +
          " " +
          item.body +
          " " +
          item.comment
        ).toLowerCase();
        let occ = 0;
        for (const t of terms) {
          occ += hay.split(t).length - 1;
        }
        return {
          ...item,
          snippet: this._snippet(item.body || item.comment, terms),
          score: -occ - item.updatedAt / 1e15,
        };
      });
      scored.sort((a, b) => a.score - b.score);
      return scored.slice(0, limit);
    } catch (e) {
      console.error("KavachaKnowledge: search failed", e);
      return [];
    }
  },

  _snippet(text, terms, window = 90) {
    if (!text) {
      return "";
    }
    const lower = text.toLowerCase();
    let at = -1;
    for (const t of terms) {
      const i = lower.indexOf(t);
      if (i !== -1 && (at === -1 || i < at)) {
        at = i;
      }
    }
    if (at === -1) {
      return text.slice(0, window).replace(/\s+/g, " ").trim();
    }
    const start = Math.max(0, at - Math.floor(window / 3));
    const end = Math.min(text.length, start + window);
    return (
      (start > 0 ? "…" : "") +
      text.slice(start, end).replace(/\s+/g, " ").trim() +
      (end < text.length ? "…" : "")
    );
  },

  /* ------------------------------------------------------------- deletion */

  async remove(id) {
    try {
      const db = await this._getDb();
      await db.execute("DELETE FROM items WHERE id = :id", { id: Number(id) });
      return true;
    } catch (e) {
      console.error("KavachaKnowledge: remove failed", e);
      return false;
    }
  },

  /** Every item filed under one page. Used by "forget this page" flows. */
  async removeForUrl(url) {
    const key = this.keyFor(url);
    if (!key) {
      return false;
    }
    try {
      const db = await this._getDb();
      await db.execute("DELETE FROM items WHERE url = :key", { key });
      return true;
    } catch (e) {
      return false;
    }
  },

  async clearAll() {
    try {
      const db = await this._getDb();
      await db.execute("DELETE FROM items");
      return true;
    } catch (e) {
      console.error("KavachaKnowledge: clearAll failed", e);
      return false;
    }
  },

  /* ------------------------------------------------------- own it / stats */

  async stats() {
    try {
      const db = await this._getDb();
      const rows = await db.execute(
        "SELECT kind, COUNT(*) AS n FROM items GROUP BY kind"
      );
      const out = { note: 0, highlight: 0, clip: 0, bytes: 0 };
      for (const r of rows) {
        out[r.getResultByName("kind")] = r.getResultByName("n");
      }
      try {
        out.bytes = (
          await IOUtils.stat(PathUtils.join(PathUtils.profileDir, kDbFile))
        ).size;
      } catch (e) {}
      return out;
    } catch (e) {
      return { note: 0, highlight: 0, clip: 0, bytes: 0 };
    }
  },

  /**
   * Everything, as plain JSON. FEATURES 9.2 ("Export My Digital Life") in the
   * small: a store the user cannot get their writing back out of is not
   * theirs, and this one predates the Phase 5 export by whole phases.
   */
  async exportAll() {
    const items = await this.listRecent({ limit: 100_000 });
    return {
      format: "kavacha-knowledge",
      version: 1,
      exportedAt: new Date().toISOString(),
      items,
    };
  },
};
