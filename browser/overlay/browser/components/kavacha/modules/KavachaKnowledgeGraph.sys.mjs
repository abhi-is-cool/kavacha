// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Kavacha personal knowledge graph (ADR 0016; ROADMAP Phase 7; FEATURES 6.3)
// — the north-star item: "the browser understands relationships between
// papers, sites, notes, conversations".
//
// WHAT IS ACTUALLY STORED IS SMALL, AND THAT IS THE DESIGN. Two tables:
//
//   edges    — how you got from one page to another. `followed` (you
//              navigated A → B in the same tab) and `opened-from` (B opened
//              in a new tab from A). This is the research trail, and it is
//              the one thing no other store in Kavacha holds: Places records
//              that you visited both pages, never that one led to the other.
//   entities — names a local model pulled out of a page, ON DEMAND ONLY.
//
// Everything else the graph shows is DERIVED AT QUERY TIME from stores that
// already exist: the personal index (ADR 0012) supplies page text and term
// overlap, the knowledge store (ADR 0015) supplies notes/highlights/clips,
// and the Places attribution table (ADR 0005) supplies which Space a page
// belongs to. Materializing those as edges would mean a second copy that can
// disagree with the first, and disagreement in a graph reads as the browser
// being wrong about your own work.
//
// DELETION FOLLOWS PLACES, unlike the knowledge store next door and for the
// exact reason that one does not: an edge is a record of WHERE YOU WENT, so
// clearing history has to clear it. That difference in lifetime is why this
// is a separate SQLite file rather than two more tables in
// kavacha-knowledge.sqlite — one file cannot have two deletion contracts.
//
// NO BACKGROUND MODEL CALLS. Entity extraction happens when the user invokes
// it on a page, never on a timer and never on page load. Patch 0079's
// guarantee — a fresh profile makes zero AI requests until a feature is
// actually invoked (SHIPPING R3) — survives this patch, and the verification
// for it is the same mock-Ollama request count.

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  KavachaAIBridge: "resource:///modules/KavachaAIBridge.sys.mjs",
  KavachaKnowledge: "resource:///modules/KavachaKnowledge.sys.mjs",
  KavachaPersonalIndex: "resource:///modules/KavachaPersonalIndex.sys.mjs",
  KavachaPlacesAttribution:
    "resource:///modules/KavachaPlacesAttribution.sys.mjs",
  Sqlite: "resource://gre/modules/Sqlite.sys.mjs",
});

const kEnabledPref = "kavacha.knowledge.enabled";
const kRecordLinksPref = "kavacha.knowledge.record-links";
const kDbFile = "kavacha-graph.sqlite";

export const KavachaGraphEdge = Object.freeze({
  FOLLOWED: "followed",
  OPENED_FROM: "opened-from",
});

// Words that carry no relationship signal. Same spirit as the ask-history
// stop list (patch 0080): a graph edge built on "the" is noise wearing the
// costume of a finding.
const kStopWords = new Set(
  ("the a an and or but of in on at to for with from by as is are was were be " +
    "been this that these those it its their his her our your my we you they " +
    "i he she them us not no yes if then than so such can could would should " +
    "will may might must have has had do does did about into over under more " +
    "most other some any all each new use used using page site web home read")
    .split(" ")
);

// Kept next to the parser it feeds, so the shape asked for and the shape
// validated cannot drift apart.
const kEntitySystem =
  "List the people, organizations, places and topics the page below is " +
  'about. Reply with ONLY a JSON array of {"name": string, "kind": ' +
  '"person"|"organization"|"place"|"topic"} — at most 12 entries, no ' +
  "commentary, no code fence. Use only names the text actually contains.";

export const KavachaKnowledgeGraph = {
  _initialized: false,
  _dbPromise: null,
  // browser -> last top-level URL, so a navigation can be recorded as an edge
  // from where the tab WAS. Weak because it must not keep a browser alive.
  _lastUrl: new WeakMap(),
  // browser -> the URL a tab was opened from, held until that tab's first
  // real load. At TabOpen the new tab is still about:blank, so the edge
  // cannot be written yet.
  _pendingOpener: new WeakMap(),

  get enabled() {
    return Services.prefs.getBoolPref(kEnabledPref, true);
  },

  get recordingLinks() {
    return this.enabled && Services.prefs.getBoolPref(kRecordLinksPref, true);
  },

  init() {
    if (this._initialized) {
      return;
    }
    this._initialized = true;
    try {
      PlacesObservers.addListener(
        ["history-cleared", "page-removed"],
        this._onPlacesEvents
      );
    } catch (e) {
      console.error("KavachaKnowledgeGraph: Places listener failed", e);
    }
  },

  _onPlacesEvents: events => {
    for (const event of events) {
      if (event.type === "history-cleared") {
        KavachaKnowledgeGraph.clearAll();
      } else if (event.type === "page-removed" && event.url) {
        KavachaKnowledgeGraph.removeUrl(event.url);
      }
    }
  },

  /* -------------------------------------------------------------- storage */

  _getDb() {
    if (!this._dbPromise) {
      this._dbPromise = (async () => {
        const db = await lazy.Sqlite.openConnection({
          path: PathUtils.join(PathUtils.profileDir, kDbFile),
        });
        await db.execute(`
          CREATE TABLE IF NOT EXISTS edges (
            id INTEGER PRIMARY KEY,
            source_url TEXT NOT NULL,
            target_url TEXT NOT NULL,
            kind TEXT NOT NULL,
            weight INTEGER NOT NULL DEFAULT 1,
            workspace_uuid TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          )
        `);
        // The same trail walked twice is one edge with weight 2, not two
        // edges: "I keep coming back to this from there" is the signal.
        await db.execute(
          `CREATE UNIQUE INDEX IF NOT EXISTS idx_edges_triple
             ON edges(source_url, target_url, kind)`
        );
        await db.execute(
          "CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_url)"
        );
        await db.execute(
          "CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_url)"
        );
        await db.execute(`
          CREATE TABLE IF NOT EXISTS entities (
            id INTEGER PRIMARY KEY,
            url TEXT NOT NULL,
            name TEXT NOT NULL,
            kind TEXT,
            created_at INTEGER NOT NULL
          )
        `);
        await db.execute(
          `CREATE UNIQUE INDEX IF NOT EXISTS idx_entities_pair
             ON entities(url, name)`
        );
        await db.execute(
          "CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(name)"
        );
        lazy.Sqlite.shutdown.addBlocker("KavachaKnowledgeGraph: close db", () =>
          db.close()
        );
        return db;
      })();
    }
    return this._dbPromise;
  },

  /** http/https only, fragment dropped — the same key space as the store. */
  keyFor(url) {
    return lazy.KavachaKnowledge.keyFor(url);
  },

  /* -------------------------------------------------------------- writing */

  async recordEdge({ sourceUrl, targetUrl, kind, workspaceUuid = null }) {
    try {
      if (!this.recordingLinks) {
        return false;
      }
      const source = this.keyFor(sourceUrl);
      const target = this.keyFor(targetUrl);
      // A self-edge is a reload, not a relationship.
      if (!source || !target || source === target) {
        return false;
      }
      const db = await this._getDb();
      const now = Date.now();
      await db.execute(
        `INSERT INTO edges (source_url, target_url, kind, weight, workspace_uuid, created_at, updated_at)
         VALUES (:source, :target, :kind, 1, :workspaceUuid, :now, :now)
         ON CONFLICT(source_url, target_url, kind) DO UPDATE SET
           weight = weight + 1, updated_at = excluded.updated_at`,
        { source, target, kind, workspaceUuid, now }
      );
      return true;
    } catch (e) {
      console.error("KavachaKnowledgeGraph: recordEdge failed", e);
      return false;
    }
  },

  /* ------------------------------------------------------- window plumbing */

  /**
   * Watch one chrome window for the two relationships worth recording.
   *
   * Never records in a private window: a graph is memory, and a private
   * window's whole promise is that there is none.
   */
  attachToWindow(window) {
    try {
      if (window.gKavachaWorkspaces?.privateWindowOrDisabled) {
        return;
      }
      const gBrowser = window.gBrowser;
      if (!gBrowser) {
        return;
      }

      const spaceOf = browser => {
        try {
          return (
            gBrowser.getTabForBrowser(browser)?.getAttribute("kavacha-space-id") ||
            null
          );
        } catch (e) {
          return null;
        }
      };

      const onTabOpen = event => {
        // `owner` is what tabbrowser sets when a tab is opened FROM another
        // tab. If it is not there we record nothing rather than guessing from
        // "whatever was selected" — a wrong edge is worse than a missing one,
        // because the graph is read as a record of what actually happened.
        const opener = event.target?.owner || event.target?.openerTab || null;
        const from = opener?.linkedBrowser?.currentURI?.spec || "";
        const browser = event.target?.linkedBrowser;
        if (from && browser) {
          this._pendingOpener.set(browser, from);
        }
      };
      gBrowser.tabContainer.addEventListener("TabOpen", onTabOpen);

      const listener = {
        QueryInterface: ChromeUtils.generateQI([
          "nsIWebProgressListener",
          "nsISupportsWeakReference",
        ]),
        onLocationChange: (browser, webProgress, request, uri, flags) => {
          try {
            if (!webProgress?.isTopLevel) {
              return;
            }
            // A TabsProgressListener receives the browser FIRST — tabbrowser
            // unshifts it in _callProgressListeners — unlike a window-level
            // listener, which receives none. Guarded either way.
            const target = browser || gBrowser.selectedBrowser;
            const url = uri?.spec || "";
            if (!this.keyFor(url)) {
              // Left the web (about:, file:). Forget the trail rather than
              // stitching the next web page onto the last one across it.
              this._lastUrl.delete(target);
              return;
            }
            const pending = this._pendingOpener.get(target);
            if (pending) {
              this._pendingOpener.delete(target);
              this.recordEdge({
                sourceUrl: pending,
                targetUrl: url,
                kind: KavachaGraphEdge.OPENED_FROM,
                workspaceUuid: spaceOf(target),
              });
            } else {
              const previous = this._lastUrl.get(target);
              if (previous) {
                this.recordEdge({
                  sourceUrl: previous,
                  targetUrl: url,
                  kind: KavachaGraphEdge.FOLLOWED,
                  workspaceUuid: spaceOf(target),
                });
              }
            }
            this._lastUrl.set(target, url);
          } catch (e) {
            // Recording a relationship must never break a navigation.
          }
        },
      };
      gBrowser.addTabsProgressListener(listener);

      window.addEventListener(
        "unload",
        () => {
          try {
            gBrowser.tabContainer.removeEventListener("TabOpen", onTabOpen);
            gBrowser.removeTabsProgressListener(listener);
          } catch (e) {}
        },
        { once: true }
      );
    } catch (e) {
      console.error("KavachaKnowledgeGraph: attachToWindow failed", e);
    }
  },

  /* -------------------------------------------------------------- reading */

  /** Edges touching a URL, in both directions, heaviest first. */
  async links(url, { limit = 20 } = {}) {
    const key = this.keyFor(url);
    if (!key) {
      return [];
    }
    try {
      const db = await this._getDb();
      const rows = await db.execute(
        `SELECT source_url, target_url, kind, weight, updated_at
           FROM edges WHERE source_url = :key OR target_url = :key
          ORDER BY weight DESC, updated_at DESC LIMIT :limit`,
        { key, limit }
      );
      return rows.map(r => {
        const source = r.getResultByName("source_url");
        const target = r.getResultByName("target_url");
        const outgoing = source === key;
        return {
          url: outgoing ? target : source,
          direction: outgoing ? "to" : "from",
          kind: r.getResultByName("kind"),
          weight: r.getResultByName("weight"),
          at: r.getResultByName("updated_at"),
        };
      });
    } catch (e) {
      console.error("KavachaKnowledgeGraph: links failed", e);
      return [];
    }
  },

  /**
   * Pages that share vocabulary with this one, from the personal index.
   *
   * Lexical, not semantic: it finds the paper that also says "flood mapping"
   * and misses the one that says "inundation modelling". ADR 0012's optional
   * local embeddings are what would close that, and this is the caller that
   * would benefit first — recorded here rather than hidden in a backlog.
   */
  async related(url, { limit = 8 } = {}) {
    const key = this.keyFor(url);
    if (!key) {
      return [];
    }
    try {
      const text = await lazy.KavachaPersonalIndex.getText(key);
      const terms = this.topTerms(text, 8);
      if (!terms.length) {
        return [];
      }
      const rows = await lazy.KavachaPersonalIndex.searchTerms(terms, {
        limit: limit + 4,
        mode: "any",
      });
      return rows
        .filter(r => this.keyFor(r.url) !== key)
        .slice(0, limit)
        .map(r => ({
          url: r.url,
          title: r.title,
          matched: r.matched,
          snippet: r.snippet,
        }));
    } catch (e) {
      console.error("KavachaKnowledgeGraph: related failed", e);
      return [];
    }
  },

  /** The most distinctive words in a page's text, by frequency. */
  topTerms(text, count = 8) {
    const seen = new Map();
    for (const raw of String(text || "")
      .toLowerCase()
      .split(/[^a-z0-9'-]+/)) {
      const word = raw.replace(/^[-']+|[-']+$/g, "");
      if (word.length < 4 || kStopWords.has(word)) {
        continue;
      }
      seen.set(word, (seen.get(word) || 0) + 1);
    }
    return [...seen.entries()]
      .filter(([, n]) => n > 1)
      .sort((a, b) => b[1] - a[1])
      .slice(0, count)
      .map(([word]) => word);
  },

  /**
   * Everything Kavacha knows about one page, assembled from the four stores.
   * This is what about:knowledge renders and what the sidebar's "related"
   * strip would consume.
   */
  async describe(url) {
    const key = this.keyFor(url);
    const out = {
      url: key,
      title: "",
      indexed: false,
      spaces: [],
      note: null,
      highlights: [],
      clips: [],
      links: [],
      related: [],
      entities: [],
    };
    if (!key) {
      return out;
    }
    const [text, page, links, related, entities] = await Promise.all([
      lazy.KavachaPersonalIndex.getText(key),
      lazy.KavachaKnowledge.forPage(key),
      this.links(key),
      this.related(key),
      this.entitiesFor(key),
    ]);
    out.indexed = !!text;
    out.note = page.note;
    out.highlights = page.highlights;
    out.clips = page.clips;
    out.links = links;
    out.related = related;
    out.entities = entities;
    out.title =
      page.note?.title ||
      page.clips[0]?.title ||
      page.highlights[0]?.title ||
      "";
    try {
      const byUrl = await lazy.KavachaPlacesAttribution.latestWorkspaceForUrls([
        key,
      ]);
      const space = byUrl.get(key);
      if (space) {
        out.spaces = [space];
      }
    } catch (e) {}
    return out;
  },

  /**
   * Start points for a graph with no selected page: the pages with the most
   * relationships. A knowledge graph whose front door is an empty search box
   * is a knowledge graph nobody opens twice.
   */
  async hubs({ limit = 15 } = {}) {
    try {
      const db = await this._getDb();
      const rows = await db.execute(
        `SELECT url, SUM(weight) AS degree, MAX(updated_at) AS at FROM (
           SELECT source_url AS url, weight, updated_at FROM edges
           UNION ALL
           SELECT target_url AS url, weight, updated_at FROM edges
         ) GROUP BY url ORDER BY degree DESC, at DESC LIMIT :limit`,
        { limit }
      );
      return rows.map(r => ({
        url: r.getResultByName("url"),
        degree: r.getResultByName("degree"),
        at: r.getResultByName("at"),
      }));
    } catch (e) {
      console.error("KavachaKnowledgeGraph: hubs failed", e);
      return [];
    }
  },

  /* ------------------------------------------------------------- entities */

  async entitiesFor(url) {
    const key = this.keyFor(url);
    if (!key) {
      return [];
    }
    try {
      const db = await this._getDb();
      const rows = await db.execute(
        "SELECT name, kind FROM entities WHERE url = :key ORDER BY name",
        { key }
      );
      return rows.map(r => ({
        name: r.getResultByName("name"),
        kind: r.getResultByName("kind") || "",
      }));
    } catch (e) {
      return [];
    }
  },

  /** Pages that mention the same entity. The "who else wrote about X" query. */
  async pagesForEntity(name) {
    try {
      const db = await this._getDb();
      const rows = await db.execute(
        "SELECT DISTINCT url FROM entities WHERE lower(name) = :name LIMIT 50",
        { name: String(name || "").toLowerCase() }
      );
      return rows.map(r => r.getResultByName("url"));
    } catch (e) {
      return [];
    }
  },

  /**
   * Ask the local model which people, organizations and topics a page is
   * about, and store the answer.
   *
   * ON DEMAND ONLY (see the header): nothing calls this on a timer or on
   * load. With no runtime it returns {available:false} and the graph simply
   * has no entities for that page — every other view still works, because
   * entities are an enrichment and never a dependency.
   *
   * The reply is treated as a hostile string, the same way patch 0081 treats
   * tab grouping: find a JSON array, keep the entries that are objects with a
   * plausible name, drop everything else. A confused model can leave the page
   * un-enriched; it cannot write anything else into the store.
   */
  async extractEntities(url, { signal } = {}) {
    const key = this.keyFor(url);
    if (!key) {
      return { available: false, reason: "not-a-page", entities: [] };
    }
    const status = await lazy.KavachaAIBridge.isAvailable();
    if (!status.available) {
      return {
        available: false,
        reason: status.reason || "unavailable",
        entities: [],
      };
    }
    const text = await lazy.KavachaPersonalIndex.getText(key);
    if (!text) {
      return { available: false, reason: "no-text", entities: [] };
    }
    let reply = "";
    try {
      reply = await lazy.KavachaAIBridge.generate(text.slice(0, 8000), {
        system: kEntitySystem,
        signal,
      });
    } catch (e) {
      return { available: false, reason: "error", entities: [] };
    }
    const entities = this.parseEntities(reply);
    if (entities.length) {
      try {
        const db = await this._getDb();
        const now = Date.now();
        for (const entity of entities) {
          await db.execute(
            `INSERT INTO entities (url, name, kind, created_at)
             VALUES (:key, :name, :kind, :now)
             ON CONFLICT(url, name) DO UPDATE SET kind = excluded.kind`,
            { key, name: entity.name, kind: entity.kind, now }
          );
        }
      } catch (e) {
        console.error("KavachaKnowledgeGraph: entity write failed", e);
      }
    }
    return { available: true, entities };
  },

  /** Exported for the same reason 0081 exports its parser: it is testable. */
  parseEntities(reply) {
    const text = String(reply || "");
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    if (start === -1 || end <= start) {
      return [];
    }
    let parsed;
    try {
      parsed = JSON.parse(text.slice(start, end + 1));
    } catch (e) {
      return [];
    }
    if (!Array.isArray(parsed)) {
      return [];
    }
    const kinds = new Set(["person", "organization", "place", "topic"]);
    const seen = new Set();
    const out = [];
    for (const raw of parsed) {
      const name = String(raw?.name || "").trim().slice(0, 80);
      if (!name || name.length < 2 || seen.has(name.toLowerCase())) {
        continue;
      }
      seen.add(name.toLowerCase());
      const kind = String(raw?.kind || "").toLowerCase();
      out.push({ name, kind: kinds.has(kind) ? kind : "topic" });
      if (out.length >= 12) {
        break;
      }
    }
    return out;
  },

  /* ------------------------------------------------------------- deletion */

  async removeUrl(url) {
    try {
      const key = this.keyFor(url);
      if (!key) {
        return;
      }
      const db = await this._getDb();
      await db.execute(
        "DELETE FROM edges WHERE source_url = :key OR target_url = :key",
        { key }
      );
      await db.execute("DELETE FROM entities WHERE url = :key", { key });
    } catch (e) {
      console.error("KavachaKnowledgeGraph: removeUrl failed", e);
    }
  },

  async clearAll() {
    try {
      const db = await this._getDb();
      await db.execute("DELETE FROM edges");
      await db.execute("DELETE FROM entities");
      return true;
    } catch (e) {
      console.error("KavachaKnowledgeGraph: clearAll failed", e);
      return false;
    }
  },

  async stats() {
    try {
      const db = await this._getDb();
      const edges = await db.execute("SELECT COUNT(*) AS n FROM edges");
      const entities = await db.execute("SELECT COUNT(*) AS n FROM entities");
      const nodes = await db.execute(
        `SELECT COUNT(*) AS n FROM (
           SELECT source_url AS u FROM edges UNION SELECT target_url FROM edges
         )`
      );
      return {
        edges: edges[0].getResultByName("n"),
        entities: entities[0].getResultByName("n"),
        nodes: nodes[0].getResultByName("n"),
      };
    } catch (e) {
      return { edges: 0, entities: 0, nodes: 0 };
    }
  },
};
