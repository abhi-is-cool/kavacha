// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// !bang shortcuts, resolved LOCALLY (ADR 0022).
//
// `!w kestrel` goes straight to Wikipedia's search for kestrel. The point is
// not the keystrokes saved: DuckDuckGo's bangs work by sending the query to
// DuckDuckGo, which reads it and replies with a redirect, so every bang query
// is a query the search engine saw. Here the destination is computed in the
// parent process and navigated to directly — no engine is contacted, not even
// the default one, and nothing leaves the machine before Enter.
//
// The catalog is deliberately small and Kavacha-authored. The scrapers that
// republish DuckDuckGo's ~13,000 entries are MIT-licensed as code, which
// licenses the scraper and not the dataset; Kavacha ships public binaries, so
// the built-ins are a few dozen plain URL templates chosen here. Breadth comes
// from USER bangs (`kavacha-bangs.json`), which are worth more anyway: !jira
// and !internal-wiki cannot exist in a hosted service that must know every
// bang up front.
//
// Catalog is embedded rather than fetched so resolution is synchronous — a
// urlbar provider has to answer during a keystroke, not a microtask later.

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  JSONFile: "resource://gre/modules/JSONFile.sys.mjs",
});

const kUserFile = "kavacha-bangs.json";
const kEnabledPref = "kavacha.bangs.enabled";

// {q} is replaced with the URI-encoded query. `home` is where a bare bang with
// no query goes. Every template here is the obvious search URL for that site.
const BUILTIN = {
  // reference
  w: ["Wikipedia", "https://en.wikipedia.org/w/index.php?search={q}", "https://en.wikipedia.org/"],
  wt: ["Wiktionary", "https://en.wiktionary.org/w/index.php?search={q}", "https://en.wiktionary.org/"],
  imdb: ["IMDb", "https://www.imdb.com/find/?q={q}", "https://www.imdb.com/"],
  osm: ["OpenStreetMap", "https://www.openstreetmap.org/search?query={q}", "https://www.openstreetmap.org/"],
  arxiv: ["arXiv", "https://arxiv.org/abs/{q}", "https://arxiv.org/"],
  scholar: ["Google Scholar", "https://scholar.google.com/scholar?q={q}", "https://scholar.google.com/"],
  pubmed: ["PubMed", "https://pubmed.ncbi.nlm.nih.gov/?term={q}", "https://pubmed.ncbi.nlm.nih.gov/"],

  // code
  gh: ["GitHub", "https://github.com/search?q={q}", "https://github.com/"],
  ghr: ["GitHub repo", "https://github.com/{q}", "https://github.com/"],
  gl: ["GitLab", "https://gitlab.com/search?search={q}", "https://gitlab.com/"],
  so: ["Stack Overflow", "https://stackoverflow.com/search?q={q}", "https://stackoverflow.com/"],
  mdn: ["MDN", "https://developer.mozilla.org/en-US/search?q={q}", "https://developer.mozilla.org/"],
  npm: ["npm", "https://www.npmjs.com/search?q={q}", "https://www.npmjs.com/"],
  crates: ["crates.io", "https://crates.io/search?q={q}", "https://crates.io/"],
  pypi: ["PyPI", "https://pypi.org/search/?q={q}", "https://pypi.org/"],
  rustdoc: ["docs.rs", "https://docs.rs/releases/search?query={q}", "https://docs.rs/"],
  bugzilla: ["Bugzilla", "https://bugzilla.mozilla.org/buglist.cgi?quicksearch={q}", "https://bugzilla.mozilla.org/"],
  searchfox: ["Searchfox", "https://searchfox.org/mozilla-central/search?q={q}", "https://searchfox.org/"],
  caniuse: ["Can I use", "https://caniuse.com/?search={q}", "https://caniuse.com/"],

  // search engines, for when you want a different one just this once
  ddg: ["DuckDuckGo", "https://duckduckgo.com/?q={q}", "https://duckduckgo.com/"],
  brave: ["Brave Search", "https://search.brave.com/search?q={q}", "https://search.brave.com/"],
  g: ["Google", "https://www.google.com/search?q={q}", "https://www.google.com/"],
  b: ["Bing", "https://www.bing.com/search?q={q}", "https://www.bing.com/"],
  sp: ["Startpage", "https://www.startpage.com/sp/search?query={q}", "https://www.startpage.com/"],
  yt: ["YouTube", "https://www.youtube.com/results?search_query={q}", "https://www.youtube.com/"],

  // shopping / media / social
  az: ["Amazon", "https://www.amazon.com/s?k={q}", "https://www.amazon.com/"],
  ebay: ["eBay", "https://www.ebay.com/sch/i.html?_nkw={q}", "https://www.ebay.com/"],
  gm: ["Google Maps", "https://www.google.com/maps/search/{q}", "https://www.google.com/maps"],
  reddit: ["Reddit", "https://www.reddit.com/search/?q={q}", "https://www.reddit.com/"],
  hn: ["Hacker News", "https://hn.algolia.com/?q={q}", "https://news.ycombinator.com/"],
  archive: ["Wayback Machine", "https://web.archive.org/web/*/{q}", "https://web.archive.org/"],
};

export const KavachaBangs = {
  _user: null,
  _userStore: null,

  get enabled() {
    return Services.prefs.getBoolPref(kEnabledPref, true);
  },

  async init() {
    if (this._userStore) {
      return;
    }
    try {
      this._userStore = new lazy.JSONFile({
        path: PathUtils.join(PathUtils.profileDir, kUserFile),
      });
      await this._userStore.load();
      if (!this._userStore.data.bangs) {
        this._userStore.data.bangs = {};
      }
      this._user = this._userStore.data.bangs;
    } catch (e) {
      // A broken user file must not take the built-ins down with it.
      console.error("KavachaBangs: user bangs unavailable", e);
      this._user = {};
    }
  },

  /** Every bang, user entries overriding built-ins of the same name. */
  all() {
    const out = {};
    for (const [key, [title, template, home]] of Object.entries(BUILTIN)) {
      out[key] = { key, title, template, home, builtin: true };
    }
    for (const [key, v] of Object.entries(this._user || {})) {
      if (v && typeof v.template === "string") {
        out[key.toLowerCase()] = {
          key: key.toLowerCase(),
          title: v.title || key,
          template: v.template,
          home: v.home || "",
          builtin: false,
        };
      }
    }
    return out;
  },

  /**
   * Pull a bang out of raw urlbar input.
   *
   * Both positions are accepted because both are habits: `!w kestrel` reads
   * like a command, `kestrel !w` is what you type when you have already
   * written the query and then decide where it should go.
   *
   * Returns { key, query } or null. Never throws — this runs on a keystroke.
   */
  parse(input) {
    const text = String(input || "").trim();
    if (!text.includes("!")) {
      return null;
    }
    // Leading: "!w kestrel" / bare "!w"
    let m = text.match(/^!([A-Za-z0-9_.+-]+)(?:\s+([\s\S]*))?$/);
    if (m) {
      return { key: m[1].toLowerCase(), query: (m[2] || "").trim() };
    }
    // Trailing: "kestrel !w"
    m = text.match(/^([\s\S]*?)\s+!([A-Za-z0-9_.+-]+)$/);
    if (m) {
      return { key: m[2].toLowerCase(), query: (m[1] || "").trim() };
    }
    return null;
  },

  /**
   * Resolve parsed input to a destination URL, or null if the bang is unknown.
   * An unknown bang resolves to NOTHING on purpose: falling back to a search
   * would quietly send "!notabang secret" to the engine, which is the exact
   * leak this feature exists to prevent.
   */
  resolve(input) {
    if (!this.enabled) {
      return null;
    }
    const parsed = this.parse(input);
    if (!parsed) {
      return null;
    }
    const bang = this.all()[parsed.key];
    if (!bang) {
      return null;
    }
    if (!parsed.query) {
      return { bang, url: bang.home || bang.template.replace(/\{q\}/g, "") };
    }
    const url = bang.template.replace(/\{q\}/g, encodeURIComponent(parsed.query));
    return { bang, url };
  },

  /* ----------------------------------------------------------- user bangs */

  async setUserBang(key, { title = "", template = "", home = "" }) {
    await this.init();
    const k = String(key || "").toLowerCase().replace(/^!/, "");
    if (!k || !/^[a-z0-9_.+-]+$/.test(k) || !template.includes("{q}")) {
      return false;
    }
    // Only http(s): a bang is a navigation, and javascript:/data: here would
    // be a self-inflicted injection with a very short path to the parent.
    if (!/^https?:\/\//i.test(template)) {
      return false;
    }
    this._user[k] = { title: title || k, template, home };
    this._userStore.saveSoon();
    return true;
  },

  async removeUserBang(key) {
    await this.init();
    const k = String(key || "").toLowerCase().replace(/^!/, "");
    if (!(k in (this._user || {}))) {
      return false;
    }
    delete this._user[k];
    this._userStore.saveSoon();
    return true;
  },
};
