// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Kavacha personal search index (ADR 0012; ROADMAP Phase 6). Full-text over
// the readable text of pages the user visited — the store behind "where did
// I find that paper?". Capture happens in the KavachaIndexer actor pair
// (http/https top frames, at idle, never in private windows); this module
// owns storage, ranking, retention, and the deletion contract.
//
// DELETION FOLLOWS HISTORY: the index can never outlive what Places
// remembers. "Clear History" wipes it; "Forget About This Site" (or any
// page-removed) drops that URL. On top of that, kavacha.index.enabled stops
// capture (unlocked default, Privacy Center exposes it) and clearAll() backs
// the "Clear index now" button.
//
// Process singleton; init from KavachaStartup is idempotent. Everything is
// fire-and-forget safe: indexing failures must never break browsing.

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  Sqlite: "resource://gre/modules/Sqlite.sys.mjs",
});

const kEnabledPref = "kavacha.index.enabled";
const kMaxPagesPref = "kavacha.index.max-pages";
const kRetentionDaysPref = "kavacha.index.retention-days";
const kDbFile = "kavacha-index.sqlite";

export const KavachaPersonalIndex = {
  _initialized: false,
  _dbPromise: null,

  init() {
    if (this._initialized) {
      return;
    }
    this._initialized = true;
    // The deletion contract (ADR 0012): follow Places. PlacesObservers is a
    // window-less global in the parent process.
    try {
      PlacesObservers.addListener(
        ["history-cleared", "page-removed"],
        this._onPlacesEvents
      );
    } catch (e) {
      console.error("KavachaPersonalIndex: Places listener failed", e);
    }
  },

  _onPlacesEvents: events => {
    for (const event of events) {
      if (event.type === "history-cleared") {
        KavachaPersonalIndex.clearAll();
      } else if (event.type === "page-removed" && event.url) {
        KavachaPersonalIndex.remove(event.url);
      }
    }
  },

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
        // mozStorage's SQLite ships with NO full-text module (fts5/4/3 all
        // fail to create — Firefox strips them for attack surface; Places
        // itself uses frecency + LIKE, not FTS). So one table holds the page
        // text and search is LIKE with an early-terminating recency walk; an
        // index on visited_at makes the ORDER BY / LIMIT cheap.
        await db.execute(`
          CREATE TABLE IF NOT EXISTS pages (
            id INTEGER PRIMARY KEY,
            url TEXT NOT NULL UNIQUE,
            title TEXT,
            text TEXT,
            workspace_uuid TEXT,
            visited_at INTEGER NOT NULL,
            indexed_at INTEGER NOT NULL
          )
        `);
        await db.execute(
          "CREATE INDEX IF NOT EXISTS idx_pages_visited ON pages(visited_at)"
        );
        lazy.Sqlite.shutdown.addBlocker("KavachaPersonalIndex: close db", () =>
          db.close()
        );
        return db;
      })();
    }
    return this._dbPromise;
  },

  /* -------------------------------------------------------------- capture */

  /**
   * Upsert one page. One row per URL (ADR 0012): a revisit replaces the old
   * text — the index answers "where did I see this", Places keeps per-visit
   * history. Never throws.
   */
  async indexPage({ url, title = "", text = "", workspaceUuid = null }) {
    try {
      if (!this.enabled || !url || !text) {
        return;
      }
      const db = await this._getDb();
      const now = Date.now();
      // One row per URL: a revisit replaces the old text (ADR 0012). URL is
      // UNIQUE, so ON CONFLICT upserts atomically.
      await db.execute(
        `INSERT INTO pages (url, title, text, workspace_uuid, visited_at, indexed_at)
         VALUES (:url, :title, :text, :workspaceUuid, :now, :now)
         ON CONFLICT(url) DO UPDATE SET
           title = excluded.title, text = excluded.text,
           workspace_uuid = excluded.workspace_uuid,
           visited_at = excluded.visited_at, indexed_at = excluded.indexed_at`,
        { url, title, text, workspaceUuid, now }
      );
      await this._gc(db);
    } catch (e) {
      console.error("KavachaPersonalIndex: indexPage failed", e);
    }
  },

  async _gc(db) {
    const maxPages = Services.prefs.getIntPref(kMaxPagesPref, 5000);
    const retentionDays = Services.prefs.getIntPref(kRetentionDaysPref, 90);
    const cutoff = Date.now() - retentionDays * 86_400_000;
    await db.execute(
      `DELETE FROM pages WHERE visited_at < :cutoff
        OR id NOT IN (SELECT id FROM pages ORDER BY visited_at DESC LIMIT :maxPages)`,
      { cutoff, maxPages }
    );
  },

  /* ---------------------------------------------------------------- query */

  /** A query string split into the terms searchTerms() matches on. */
  terms(query) {
    return String(query || "")
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
  },

  /**
   * Matches where every query term appears in title or text (AND). SQL walks
   * newest-first and stops early once `limit` candidates match — cheap for the
   * common case; JS then builds a snippet and re-ranks by how many times the
   * terms occur (a page that says "flood" ten times beats one that says it
   * once), recency breaking ties. Returns
   * [{url, title, snippet, workspaceUuid, visitedAt, score}] with score
   * ASCENDING (better first) so it sorts the same way as the other sources.
   */
  async search(query, { limit = 10 } = {}) {
    return this.searchTerms(this.terms(query), { limit });
  },

  /**
   * The same search over an already-split term list, with a `mode`:
   *
   *   "all" (default) — every term must appear. What the universal-search box
   *                     wants: the user typed the words they expect to see.
   *   "any"           — at least one term appears, ranked by how MANY distinct
   *                     terms a page carries. Ask-your-history (ADR 0014) needs
   *                     this: a natural-language question carries terms no
   *                     single page will hold all of, and "all" over eight
   *                     words reliably matches nothing.
   *
   * Results also carry `matched` (distinct terms present) so a caller can tell
   * a strong hit from an incidental one. Ranking is by distinct terms first,
   * then occurrences, then recency — which is why `matched` dominates the
   * score: under "any" a page mentioning three of the terms once each should
   * beat one that repeats a single common word.
   *
   * `withText` returns each page's whole stored text (up to 32k chars each).
   * Off by default on purpose: the search box needs the snippet only, and 30
   * candidate rows of full text is about a megabyte per keystroke-driven query.
   * Ask-your-history turns it on because it has to build passages.
   */
  async searchTerms(terms, { limit = 10, mode = "all", withText = false } = {}) {
    try {
      if (!Array.isArray(terms) || !terms.length) {
        return [];
      }
      const db = await this._getDb();
      // LIKE escapes %/_ so a query like "50%" is a literal, not a wildcard.
      const params = { limit: limit * 3 }; // over-fetch, re-rank, then trim
      const where = terms
        .map((t, i) => {
          params[`t${i}`] = "%" + this._likeEscape(t) + "%";
          return `(lower(title) LIKE :t${i} ESCAPE '\\' OR lower(text) LIKE :t${i} ESCAPE '\\')`;
        })
        .join(mode === "any" ? " OR " : " AND ");
      const rows = await db.execute(
        `SELECT url, title, text, workspace_uuid, visited_at
           FROM pages WHERE ${where}
          ORDER BY visited_at DESC LIMIT :limit`,
        params
      );
      const scored = rows.map(r => {
        const url = r.getResultByName("url");
        const title = r.getResultByName("title") || url;
        const text = r.getResultByName("text") || "";
        const hay = (title + " " + text).toLowerCase();
        let occ = 0;
        let matched = 0;
        for (const t of terms) {
          const n = hay.split(t).length - 1;
          occ += n;
          if (n) {
            matched++;
          }
        }
        return {
          url,
          title,
          text: withText ? text : undefined,
          matched,
          snippet: this._snippet(text, terms),
          workspaceUuid: r.getResultByName("workspace_uuid"),
          visitedAt: r.getResultByName("visited_at"),
          // Ascending score, so negate: more distinct terms first, then more
          // occurrences, then recency as a tiny fractional tiebreak. The
          // 1e4 weight makes "matched" strictly dominant — occurrence counts
          // stay well under it for a 32k-char page.
          score:
            -(matched * 1e4) - occ - r.getResultByName("visited_at") / 1e15,
        };
      });
      scored.sort((a, b) => a.score - b.score);
      return scored.slice(0, limit);
    } catch (e) {
      console.error("KavachaPersonalIndex: search failed", e);
      return [];
    }
  },

  _likeEscape(s) {
    return s.replace(/[\\%_]/g, m => "\\" + m);
  },

  // A window of text around the first term hit, with every term occurrence
  // wrapped «…». SQLite has no snippet() without FTS, so this is JS.
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
      return "";
    }
    let start = Math.max(0, at - Math.floor(window / 3));
    let end = Math.min(text.length, start + window);
    let slice = text.slice(start, end);
    // Highlight each term (case-insensitive) in the slice.
    for (const t of terms) {
      slice = slice.replace(
        new RegExp(this._reEscape(t), "gi"),
        m => "«" + m + "»"
      );
    }
    return (start > 0 ? "…" : "") + slice.trim() + (end < text.length ? "…" : "");
  },

  _reEscape(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  },

  /** {pages, bytes} for the Privacy Center's status line. */
  async stats() {
    try {
      const db = await this._getDb();
      const rows = await db.execute("SELECT COUNT(*) AS n FROM pages");
      let bytes = 0;
      try {
        bytes = (await IOUtils.stat(PathUtils.join(PathUtils.profileDir, kDbFile)))
          .size;
      } catch (e) {}
      return { pages: rows[0].getResultByName("n"), bytes };
    } catch (e) {
      return { pages: 0, bytes: 0 };
    }
  },

  /** The stored text for one URL, or "" if it was never indexed. */
  async getText(url) {
    try {
      const spec = url instanceof Ci.nsIURI ? url.spec : String(url);
      const db = await this._getDb();
      const rows = await db.execute(
        "SELECT text FROM pages WHERE url = :spec",
        { spec }
      );
      return rows.length ? rows[0].getResultByName("text") || "" : "";
    } catch (e) {
      return "";
    }
  },

  /* ------------------------------------------------------------- deletion */

  async remove(url) {
    try {
      const spec = url instanceof Ci.nsIURI ? url.spec : String(url);
      const db = await this._getDb();
      await db.execute("DELETE FROM pages WHERE url = :spec", { spec });
    } catch (e) {
      console.error("KavachaPersonalIndex: remove failed", e);
    }
  },

  async clearAll() {
    try {
      const db = await this._getDb();
      await db.execute("DELETE FROM pages");
    } catch (e) {
      console.error("KavachaPersonalIndex: clearAll failed", e);
    }
  },
};
