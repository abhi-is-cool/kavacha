// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Natural-language search over the user's own history (ADR 0014; ROADMAP
// Phase 6). The retrieval half of "Where did I find that paper on flood
// mapping?" — it turns a QUESTION into evidence from the personal index
// (ADR 0012) and Places, then asks the local model (ADR 0013) to answer from
// that evidence and cite it.
//
// WHY THIS MODULE EXISTS AT ALL. The index matches with LIKE and ANDs every
// term (mozStorage ships no FTS5 — see ADR 0012). Hand it "where did I read
// about flood mapping in Kerala?" and it looks for a single page containing
// all of "where", "did", "read", "about", … and returns nothing, every time.
// Natural-language search is therefore not a prompt-engineering job on top of
// the existing search; it is a retrieval layer:
//
//   1. strip the question down to content terms (stopwords carry no signal
//      but do carry the AND that kills the query),
//   2. try "all" first — a precise multi-word hit is the best evidence there
//      is — and RELAX to "any" when that is thin,
//   3. add Places title/URL matches, because a page visited before the index
//      existed (or with the index off) still answers "where did I see it",
//   4. hand the model numbered passages and require citations.
//
// Every step degrades on its own: no model still returns ranked sources — the
// question becomes a search — and no index still returns Places hits.

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  KavachaAIBridge: "resource:///modules/KavachaAIBridge.sys.mjs",
  KavachaPersonalIndex: "resource:///modules/KavachaPersonalIndex.sys.mjs",
  PlacesUtils: "resource://gre/modules/PlacesUtils.sys.mjs",
});

// Deliberately small and English-only. It exists to drop words that would
// AND a query to death, not to do linguistics; an over-long list starts
// eating real query terms ("time", "work" and "state" are all stopwords in
// some canonical lists and all plausible things to have read about).
// prettier-ignore
const kStopWords = new Set([
  "a", "about", "after", "again", "all", "also", "am", "an", "and", "any",
  "anything", "are", "around", "as", "at", "back", "be", "because", "been",
  "before", "being", "between", "both", "but", "by", "can", "could", "did",
  "do", "does", "doing", "done", "down", "during", "each", "else", "ever",
  "every", "find", "for", "found", "from", "get", "give", "go", "had", "has",
  "have", "he", "her", "here", "hers", "him", "his", "how", "i", "if", "in",
  "into", "is", "it", "its", "just", "know", "like", "look", "looking", "me",
  "more", "most", "much", "my", "need", "no", "not", "of", "off", "on",
  "once", "one", "only", "or", "other", "our", "out", "over", "own", "page",
  "pages", "put", "read", "reading", "recall", "remember", "said", "same",
  "saw", "say", "see", "seen", "she", "should", "site", "so", "some",
  "something", "such", "take", "tell", "than", "that", "the", "their", "them",
  "then", "there", "these", "they", "thing", "things", "this", "those",
  "through", "to", "too", "under", "until", "up", "us", "use", "very", "want",
  "was", "we", "web", "website", "well", "went", "were", "what", "when",
  "where", "which", "while", "who", "whom", "why", "will", "with", "would",
  "you", "your", "yours",
]);

// A question rarely needs more than a handful of content words, and each one
// is another LIKE scan over the text column.
const kMaxTerms = 8;
// How many sources the model is shown. Small local models lose the thread in
// long contexts, and the honest answer to "where did I see it" is a short
// list, not twenty maybes.
const kMaxContextSources = 5;
const kPassageChars = 1100;
const kMaxContextChars = 6000;
// Below this many strong hits, relax the AND to an OR.
const kRelaxBelow = 3;

const kSystemPrompt =
  "You answer questions about the user's own browsing history. Use ONLY the " +
  "numbered sources given to you — they are pages this user actually " +
  "visited. Cite every claim with the source number in square brackets, like " +
  "[1] or [2]. If the sources do not contain the answer, say plainly that " +
  "you could not find it in their history; never guess a source and never " +
  "invent a URL. Answer in at most four sentences.";

export const KavachaAskHistory = {
  /**
   * Content terms from a natural-language question: lowercased, punctuation
   * stripped, stopwords and one-character fragments dropped, deduped, and
   * capped. Quoted phrases survive as single terms, which is how a user pins
   * an exact string ("flood mapping") through the relaxation below.
   */
  extractTerms(question) {
    const text = String(question || "").toLowerCase();
    const terms = [];
    const seen = new Set();
    const push = raw => {
      const t = raw.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "").trim();
      if (t.length < 2 || seen.has(t)) {
        return;
      }
      seen.add(t);
      terms.push(t);
    };
    // Quoted phrases first, then remove them so their words are not repeated
    // as loose terms.
    let rest = text;
    for (const m of text.matchAll(/"([^"]{2,60})"/g)) {
      push(m[1]);
      rest = rest.replace(m[0], " ");
    }
    for (const word of rest.split(/[^\p{L}\p{N}'’.-]+/u)) {
      const w = word.replace(/^[.'’-]+|[.'’-]+$/g, "");
      if (!w || kStopWords.has(w)) {
        continue;
      }
      push(w);
    }
    return terms.slice(0, kMaxTerms);
  },

  /**
   * Evidence for a question. Returns `{terms, sources, exact, relaxed}` where
   * each source is
   * `{url, title, snippet, text, visitedAt, workspaceUuid, matched, indexed}`.
   * Index hits (which carry text, so they can be quoted) come first; Places
   * hits fill in pages whose text was never captured.
   *
   * `exact` is how many pages carried EVERY term and `relaxed` whether
   * partial matches were added. They are reported separately because they are
   * different things to tell the user — "nothing matched all your words" and
   * "there are also some near misses below" — and conflating them puts a
   * false statement on screen whenever one strong hit came back alongside
   * weaker ones.
   */
  async retrieve(question, { limit = 8 } = {}) {
    const terms = this.extractTerms(question);
    if (!terms.length) {
      return { terms, sources: [], exact: 0, relaxed: false };
    }

    let relaxed = false;
    let exact = 0;
    let hits = [];
    try {
      hits = await lazy.KavachaPersonalIndex.searchTerms(terms, {
        limit,
        mode: "all",
        withText: true,
      });
      exact = hits.length;
      if (hits.length < kRelaxBelow && terms.length > 1) {
        // The AND found little. Ask for anything carrying ANY of the terms —
        // searchTerms ranks by how many distinct terms a page holds, so the
        // strongest partial matches still surface first.
        const any = await lazy.KavachaPersonalIndex.searchTerms(terms, {
          limit: limit * 2,
          mode: "any",
          withText: true,
        });
        const seen = new Set(hits.map(h => h.url));
        for (const h of any) {
          if (!seen.has(h.url)) {
            seen.add(h.url);
            hits.push(h);
            relaxed = true;
          }
        }
      }
    } catch (e) {
      console.error("KavachaAskHistory: index retrieval failed", e);
    }

    const sources = hits.slice(0, limit).map(h => ({
      url: h.url,
      title: h.title || h.url,
      snippet: h.snippet || "",
      text: h.text || "",
      visitedAt: h.visitedAt || 0,
      workspaceUuid: h.workspaceUuid || null,
      matched: h.matched || 0,
      indexed: true,
    }));

    // Places fills the gap the index cannot: anything visited before the
    // index existed, or while it was switched off, has a title and a URL and
    // no text. Those cannot be quoted, but they can absolutely be the answer
    // to "where did I see it".
    try {
      const seen = new Set(sources.map(s => s.url));
      for (const row of await this._searchPlaces(terms, limit)) {
        if (sources.length >= limit + kMaxContextSources) {
          break;
        }
        if (!seen.has(row.url)) {
          seen.add(row.url);
          sources.push(row);
        }
      }
    } catch (e) {
      console.error("KavachaAskHistory: places retrieval failed", e);
    }

    return { terms, sources, exact, relaxed };
  },

  /**
   * Answer a question from the user's history. Returns
   * `{answer, sources, degraded, reason, relaxed, terms}`.
   *
   * `degraded: true` means no answer was generated — no local model, or the
   * model failed — and the caller should present `sources` as search results.
   * That is a first-class outcome, not an error: the retrieval is the part
   * that is always available, and the north star's question ("where did I
   * find that paper") is answered by a ranked list even with no model at all.
   */
  async ask(question, { signal, limit = 8 } = {}) {
    const { terms, sources, exact, relaxed } = await this.retrieve(question, {
      limit,
    });
    const base = { sources, exact, relaxed, terms, answer: "" };

    if (!terms.length) {
      return { ...base, degraded: true, reason: "no-terms" };
    }
    if (!sources.length) {
      return { ...base, degraded: true, reason: "no-sources" };
    }

    let status;
    try {
      status = await lazy.KavachaAIBridge.isAvailable();
    } catch (e) {
      status = { available: false, reason: "unreachable" };
    }
    if (!status.available) {
      return { ...base, degraded: true, reason: status.reason || "unavailable" };
    }

    const cited = this._contextSources(sources);
    if (!cited.length) {
      // Every candidate came from Places with no captured text. Titles alone
      // are not evidence worth asking a model to reason over — it would
      // confabulate from URLs. Show the list instead.
      return { ...base, degraded: true, reason: "no-text" };
    }

    try {
      const answer = await lazy.KavachaAIBridge.generate(
        this._buildPrompt(question, cited),
        { system: kSystemPrompt, signal }
      );
      if (!answer) {
        return { ...base, degraded: true, reason: "empty" };
      }
      // Only the sources the model could actually see are citable; renumber
      // nothing, so [n] in the answer indexes `cited` positionally.
      return {
        ...base,
        answer,
        cited,
        degraded: false,
        reason: "",
      };
    } catch (e) {
      if (e?.name === "AbortError") {
        return { ...base, degraded: true, reason: "aborted" };
      }
      console.error("KavachaAskHistory: generation failed", e);
      return { ...base, degraded: true, reason: "error" };
    }
  },

  /* -------------------------------------------------------------- internal */

  // The sources the model is shown: text-bearing, best-ranked first, capped
  // both in count and in total characters.
  _contextSources(sources) {
    const cited = [];
    let budget = kMaxContextChars;
    for (const s of sources) {
      if (cited.length >= kMaxContextSources || budget <= 0) {
        break;
      }
      if (!s.text) {
        continue;
      }
      const passage = this._passage(s.text, budget);
      if (!passage) {
        continue;
      }
      budget -= passage.length;
      cited.push({ ...s, passage });
    }
    return cited;
  },

  // A page's most relevant stretch of text. The index already put the best
  // match at the start of `snippet`; anchor on that, and otherwise take the
  // lead, which for an article is the abstract or the first paragraphs.
  _passage(text, budget) {
    const max = Math.min(kPassageChars, budget);
    if (text.length <= max) {
      return text;
    }
    return text.slice(0, max).trimEnd() + "…";
  },

  _buildPrompt(question, cited) {
    const blocks = cited.map(
      (s, i) =>
        `[${i + 1}] ${s.title}\nURL: ${s.url}\n${s.passage}`
    );
    return (
      `Question: ${String(question || "").trim()}\n\n` +
      `Sources:\n\n${blocks.join("\n\n---\n\n")}`
    );
  },

  // Title/URL matches from Places, for pages the index never captured.
  // Read-only connection: this only ever reads history the browser already
  // keeps, and never writes to it.
  async _searchPlaces(terms, limit) {
    const db = await lazy.PlacesUtils.promiseDBConnection();
    const params = { limit };
    const where = terms
      .map((t, i) => {
        params[`t${i}`] = "%" + t.replace(/[\\%_]/g, m => "\\" + m) + "%";
        return `(lower(p.title) LIKE :t${i} ESCAPE '\\' OR lower(p.url) LIKE :t${i} ESCAPE '\\')`;
      })
      .join(" OR ");
    // execute(), not executeCached(): the SQL text varies with the number of
    // terms, so caching it would fill the statement cache with near-duplicates.
    const rows = await db.execute(
      `SELECT p.url AS url, p.title AS title, p.last_visit_date AS visited
         FROM moz_places p
        WHERE p.hidden = 0 AND p.last_visit_date NOTNULL AND (${where})
        ORDER BY p.frecency DESC
        LIMIT :limit`,
      params
    );
    return rows.map(r => {
      const url = r.getResultByName("url");
      const title = r.getResultByName("title") || url;
      const hay = (title + " " + url).toLowerCase();
      return {
        url,
        title,
        snippet: "",
        text: "",
        // Places stores microseconds.
        visitedAt: Math.floor((r.getResultByName("visited") || 0) / 1000),
        workspaceUuid: null,
        matched: terms.filter(t => hay.includes(t)).length,
        indexed: false,
      };
    });
  },
};
