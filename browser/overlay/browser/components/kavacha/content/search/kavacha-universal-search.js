// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Kavacha universal search (PLATFORM_PLAN.md MVP item 5; ADR 0004).
//
// One query surface over everything local: open tabs, history, bookmarks,
// workspace notes, and downloads. Federated by design — each source is
// queried through its existing store (Places stays authoritative for
// history/bookmarks); the Phase 6 personal content index plugs in as one
// more source behind the same interface. Every result carries its
// workspace association where one exists so the UI can badge it now and
// filter by it later.

// Wrapped in a block: every window script shares ONE global scope, and a
// top-level `const lazy` here collides with browser.js's, which aborts this
// whole file with "redeclaration of const lazy" (the failure patch 0059
// documented, observed again on the Firefox base 2026-09-20).
{
const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  Downloads: "resource://gre/modules/Downloads.sys.mjs",
  PlacesUtils: "resource://gre/modules/PlacesUtils.sys.mjs",
});

const kMaxPerSource = 12;
const kMinQueryLength = 2;

class nsKavachaUniversalSearch {
  #panel = null;
  #input = null;
  #list = null;
  #results = [];
  #selectedIndex = -1;
  #queryToken = 0;
  #debounceTimer = null;
  #groupLabels = null;
  // Patch 0055: restrict results to the Space that is active when the panel
  // opens. Held per-panel rather than per-query so it survives typing, and
  // captured at open() so switching Spaces mid-search cannot silently change
  // what "this Space" meant.
  #scopeToggle = null;
  #scopeWorkspaceId = null;

  init() {
    // The stylesheet rides kavacha.css, loaded per window by KavachaStartup.
    // Nothing else to do at init: the panel is built on first use.
  }

  /**
   * Build the panel. Under Zen this markup lived in popups.inc; on the
   * Firefox base (ADR 0020) Kavacha owns no chrome document, so the surface
   * is constructed here — same ids, same structure, same stylesheet.
   */
  #buildPanel() {
    const doc = document;
    const panel = doc.createXULElement("panel");
    panel.id = "kavacha-search-panel";
    panel.setAttribute("orient", "vertical");
    panel.setAttribute("noautofocus", "false");
    panel.setAttribute("consumeoutsideclicks", "true");
    panel.setAttribute("level", "top");
    const box = doc.createXULElement("vbox");
    box.id = "kavacha-search-box";
    const input = doc.createElementNS("http://www.w3.org/1999/xhtml", "input");
    input.id = "kavacha-search-input";
    input.setAttribute("type", "text");
    doc.l10n.setAttributes(input, "kavacha-search-input");
    const scope = doc.createElementNS("http://www.w3.org/1999/xhtml", "label");
    scope.id = "kavacha-search-scope";
    const scopeToggle = doc.createElementNS("http://www.w3.org/1999/xhtml", "input");
    scopeToggle.id = "kavacha-search-scope-toggle";
    scopeToggle.setAttribute("type", "checkbox");
    const scopeLabel = doc.createElementNS("http://www.w3.org/1999/xhtml", "span");
    scope.append(scopeToggle, scopeLabel);
    const hint = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
    hint.id = "kavacha-search-hint";
    doc.l10n.setAttributes(hint, "kavacha-search-hint");
    const results = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
    results.id = "kavacha-search-results";
    results.setAttribute("empty", "true");
    box.append(input, scope, hint, results);
    panel.appendChild(box);
    (doc.getElementById("mainPopupSet") || doc.documentElement).appendChild(panel);
    return panel;
  }

  get panel() {
    if (!this.#panel) {
      this.#panel =
        document.getElementById("kavacha-search-panel") || this.#buildPanel();
      this.#input = document.getElementById("kavacha-search-input");
      this.#list = document.getElementById("kavacha-search-results");
      this.#input.addEventListener("input", () => {
        clearTimeout(this.#debounceTimer);
        this.#debounceTimer = setTimeout(() => {
          this.#runQuery(this.#input.value.trim());
        }, 120);
      });
      this.#input.addEventListener("keydown", e => this.#onKeyDown(e));
      this.#scopeToggle = document.getElementById(
        "kavacha-search-scope-toggle"
      );
      this.#scopeToggle.addEventListener("change", () => {
        clearTimeout(this.#debounceTimer);
        this.#runQuery(this.#input.value.trim());
      });
      this.#list.addEventListener("click", e => {
        const row = e.target.closest(".kavacha-search-row");
        if (row) {
          this.#activate(this.#results[Number(row.dataset.index)]);
        }
      });
      this.#panel.addEventListener("popuphidden", () => {
        this.#input.value = "";
        // The scope is a per-search decision, not a setting. Leaving it on
        // would make the next search silently miss things.
        this.#scopeToggle.checked = false;
        this.#renderEmpty();
      });
    }
    return this.#panel;
  }

  async open() {
    const panel = this.panel;
    if (!this.#groupLabels) {
      const ids = [
        "tabs",
        "notes",
        "bookmarks",
        "history",
        "downloads",
        "pagetext",
        "pagenotes",
        "clips",
      ];
      const values = await document.l10n.formatValues(
        ids.map(id => ({ id: `kavacha-search-group-${id}` }))
      );
      this.#groupLabels = Object.fromEntries(ids.map((id, i) => [id, values[i]]));
    }
    this.#scopeWorkspaceId = gKavachaWorkspaces?.privateWindowOrDisabled
      ? null
      : gKavachaWorkspaces?.activeWorkspace || null;
    const scopeName = this.#scopeWorkspaceId
      ? gKavachaWorkspaces.getWorkspaceFromId(this.#scopeWorkspaceId)?.name
      : null;
    // With no Space to scope to, the toggle would be a control that does
    // nothing. Hide it rather than show a dead checkbox.
    document.getElementById("kavacha-search-scope").hidden = !scopeName;
    if (scopeName) {
      document.l10n.setAttributes(
        this.#scopeToggle.nextElementSibling,
        "kavacha-search-scope-label",
        { name: scopeName }
      );
    }

    const width = Math.min(680, window.innerWidth * 0.7);
    panel.style.setProperty("--kavacha-search-width", `${width}px`);
    panel.openPopupAtScreen(
      window.mozInnerScreenX + (window.innerWidth - width) / 2,
      window.mozInnerScreenY + Math.min(160, window.innerHeight * 0.18),
      false
    );
    this.#renderEmpty();
    this.#input.focus();
  }

  close() {
    this.panel.hidePopup();
  }

  /* ------------------------------------------------------------- sources */

  #searchTabs(q) {
    const seen = new Set();
    const out = [];
    for (const tab of gBrowser.tabs) {
      if (tab.closing) {
        continue;
      }
      const label = tab.label || "";
      const url = tab.linkedBrowser?.currentURI?.spec || "";
      if (!this.#matches(q, label, url) || seen.has(tab)) {
        continue;
      }
      seen.add(tab);
      out.push({
        group: "tabs",
        title: label,
        detail: this.#prettyUrl(url),
        workspaceId: tab.getAttribute("kavacha-space-id") || null,
        score: this.#score(q, label, url) + (tab.selected ? -1 : 0),
        action: () => this.#selectTab(tab),
      });
      if (out.length >= kMaxPerSource) {
        break;
      }
    }
    return out;
  }

  #searchPlaces(q, type) {
    const history = lazy.PlacesUtils.history;
    const query = history.getNewQuery();
    query.searchTerms = q;
    const options = history.getNewQueryOptions();
    options.queryType =
      type === "bookmarks"
        ? options.QUERY_TYPE_BOOKMARKS
        : options.QUERY_TYPE_HISTORY;
    options.sortingMode = options.SORT_BY_FRECENCY_DESCENDING;
    options.maxResults = kMaxPerSource;
    const root = history.executeQuery(query, options).root;
    const out = [];
    try {
      root.containerOpen = true;
      for (let i = 0; i < root.childCount; i++) {
        const node = root.getChild(i);
        out.push({
          group: type,
          title: node.title || node.uri,
          detail: this.#prettyUrl(node.uri),
          url: node.uri,
          workspaceId: null,
          score: this.#score(q, node.title || "", node.uri) + i * 0.1,
          action: () => {
            this.close();
            window.openTrustedLinkIn(node.uri, "tab");
          },
        });
      }
    } finally {
      root.containerOpen = false;
    }
    return out;
  }

  // History results carry the space they were last visited in (ADR 0005
  // attribution table) so the badge renderer can label them.
  async #searchHistoryWithBadges(q) {
    const results = this.#searchPlaces(q, "history");
    try {
      const { KavachaPlacesAttribution } = ChromeUtils.importESModule(
        "resource:///modules/KavachaPlacesAttribution.sys.mjs"
      );
      const spaceByUrl = await KavachaPlacesAttribution.latestWorkspaceForUrls(
        results.map(r => r.url).filter(Boolean)
      );
      for (const r of results) {
        r.workspaceId = spaceByUrl.get(r.url) || null;
      }
    } catch (e) {
      console.error("KavachaUniversalSearch: attribution lookup failed", e);
    }
    return results;
  }

  async #searchNotes(q) {
    if (gKavachaWorkspaces.privateWindowOrDisabled) {
      return [];
    }
    const notes = await gKavachaWorkspaces.kavachaGetAllNotes();
    const out = [];
    for (const [uuid, note] of Object.entries(notes)) {
      const content = note?.content || "";
      const idx = content.toLowerCase().indexOf(q.toLowerCase());
      if (idx < 0) {
        continue;
      }
      const workspace = gKavachaWorkspaces.getWorkspaceFromId(uuid);
      const start = Math.max(0, idx - 30);
      out.push({
        group: "notes",
        title: workspace?.name || "Workspace note",
        detail:
          (start > 0 ? "…" : "") +
          content.slice(start, idx + q.length + 50).replace(/\s+/g, " ") +
          "…",
        workspaceId: uuid,
        score: this.#score(q, content.slice(idx, idx + 40), ""),
        action: () => {
          this.close();
          gKavachaWorkspaces.openWorkspaceNotes(uuid);
        },
      });
      if (out.length >= kMaxPerSource) {
        break;
      }
    }
    return out;
  }

  async #searchDownloads(q) {
    const list = await lazy.Downloads.getList(lazy.Downloads.ALL);
    const all = await list.getAll();
    const out = [];
    for (const dl of all.reverse()) {
      const path = dl.target?.path || "";
      const name = PathUtils.filename(path || "") || "";
      if (!name.toLowerCase().includes(q.toLowerCase())) {
        continue;
      }
      out.push({
        group: "downloads",
        title: name,
        detail: this.#prettyUrl(dl.source?.url || ""),
        workspaceId: null,
        score: this.#score(q, name, ""),
        action: () => {
          this.close();
          try {
            const file = Cc["@mozilla.org/file/local;1"].createInstance(
              Ci.nsIFile
            );
            file.initWithPath(path);
            file.reveal();
          } catch (e) {
            console.error("KavachaUniversalSearch: cannot reveal download", e);
          }
        },
      });
      if (out.length >= kMaxPerSource / 2) {
        break;
      }
    }
    return out;
  }

  // Personal index (ADR 0012): full-text over the pages you actually read —
  // the one source that matches what a page SAID, not just its title/URL.
  // The snippet is the detail line, because "…«flood mapping» in Sentinel-1
  // imagery…" is the whole reason this group exists.
  async #searchIndex(q) {
    try {
      const { KavachaPersonalIndex } = ChromeUtils.importESModule(
        "resource:///modules/KavachaPersonalIndex.sys.mjs"
      );
      const rows = await KavachaPersonalIndex.search(q, {
        limit: Math.floor(kMaxPerSource / 2),
      });
      return rows.map(r => ({
        group: "pagetext",
        title: r.title,
        detail: r.snippet || this.#prettyUrl(r.url),
        url: r.url,
        workspaceId: r.workspaceUuid || null,
        score: r.score, // ascending = better, matching the group sort
        action: () => {
          this.close();
          window.openTrustedLinkIn(r.url, "tab");
        },
      }));
    } catch (e) {
      console.error("KavachaUniversalSearch: index search failed", e);
      return [];
    }
  }

  // Knowledge store (ADR 0015): what the user WROTE or KEPT about a page.
  // Two groups rather than one, because they answer different questions —
  // "what did I think about this page" and "what did I save from it" — and a
  // merged group would bury a three-line note under a 30,000-character clip.
  // Both open the Knowledge sidebar on the page they belong to, rather than
  // just navigating: the point of the result is the writing, not the URL.
  async #searchKnowledge(q) {
    if (gKavachaWorkspaces.privateWindowOrDisabled) {
      return [];
    }
    try {
      const { KavachaKnowledge } = ChromeUtils.importESModule(
        "resource:///modules/KavachaKnowledge.sys.mjs"
      );
      const rows = await KavachaKnowledge.search(q, { limit: kMaxPerSource });
      const sidebar = ChromeUtils.importESModule(
        "resource:///modules/KavachaKnowledgeSidebar.sys.mjs"
      ).KavachaKnowledgeSidebar;
      return rows.map(r => ({
        group: r.kind === "note" ? "pagenotes" : "clips",
        title: r.title || this.#prettyUrl(r.url),
        detail: r.snippet || this.#prettyUrl(r.url),
        url: r.url,
        workspaceId: r.workspaceUuid || null,
        score: r.score,
        action: () => {
          this.close();
          window.openTrustedLinkIn(r.url, "tab");
          sidebar.open(window);
        },
      }));
    } catch (e) {
      console.error("KavachaUniversalSearch: knowledge search failed", e);
      return [];
    }
  }

  /* ------------------------------------------------------------ querying */

  async #runQuery(q) {
    const token = ++this.#queryToken;
    if (q.length < kMinQueryLength) {
      this.#renderEmpty();
      return;
    }
    const settled = await Promise.allSettled([
      Promise.resolve().then(() => this.#searchTabs(q)),
      this.#searchNotes(q),
      Promise.resolve().then(() => this.#searchPlaces(q, "bookmarks")),
      this.#searchHistoryWithBadges(q),
      this.#searchDownloads(q),
      this.#searchIndex(q),
      this.#searchKnowledge(q),
    ]);
    if (token !== this.#queryToken) {
      return; // a newer query superseded this one
    }
    for (const s of settled) {
      if (s.status === "rejected") {
        console.error("KavachaUniversalSearch source failed:", s.reason);
      }
    }
    const groups = settled
      .filter(s => s.status === "fulfilled")
      .map(s => s.value.sort((a, b) => a.score - b.score));
    // Dedup URL-level results across sources: an open tab beats its own
    // bookmark, a bookmark beats its history entry.
    const seenDetails = new Set();
    this.#results = [];
    for (const group of groups) {
      for (const r of group) {
        // Notes, page notes and clips are never deduped against a page: they
        // are the user's own writing ABOUT that page, and dropping a note
        // because its page is already in the list loses the only result that
        // was not just a URL.
        const key =
          r.group === "notes" || r.group === "pagenotes" || r.group === "clips"
            ? Symbol()
            : `${r.title}|${r.detail}`;
        if (typeof key === "string" && seenDetails.has(key)) {
          continue;
        }
        if (typeof key === "string") {
          seenDetails.add(key);
        }
        this.#results.push(r);
      }
    }
    if (this.#scopeToggle?.checked && this.#scopeWorkspaceId) {
      // Only results Kavacha can actually attribute to a Space survive. A
      // bookmark or download has no Space, and guessing one for it would make
      // the filter lie -- dropping them is the honest reading of "only this
      // Space".
      this.#results = this.#results.filter(
        r => r.workspaceId === this.#scopeWorkspaceId
      );
    }
    this.#selectedIndex = this.#results.length ? 0 : -1;
    this.#render();
  }

  #matches(q, ...haystacks) {
    const needle = q.toLowerCase();
    return haystacks.some(h => h && h.toLowerCase().includes(needle));
  }

  #score(q, title, url) {
    const needle = q.toLowerCase();
    const t = (title || "").toLowerCase();
    if (t.startsWith(needle)) {
      return 0;
    }
    if (t.includes(needle)) {
      return 1;
    }
    if ((url || "").toLowerCase().includes(needle)) {
      return 2;
    }
    return 3;
  }

  #prettyUrl(url) {
    try {
      const u = new URL(url);
      return u.host + (u.pathname === "/" ? "" : u.pathname);
    } catch (e) {
      return url;
    }
  }

  /* ----------------------------------------------------------- rendering */

  #renderEmpty() {
    this.#results = [];
    this.#selectedIndex = -1;
    this.#list.textContent = "";
    this.#list.toggleAttribute("empty", true);
  }

  #render() {
    this.#list.textContent = "";
    this.#list.toggleAttribute("empty", !this.#results.length);
    let lastGroup = null;
    for (let i = 0; i < this.#results.length; i++) {
      const r = this.#results[i];
      if (r.group !== lastGroup) {
        lastGroup = r.group;
        const header = document.createElement("div");
        header.className = "kavacha-search-group";
        header.textContent = this.#groupLabels?.[r.group] || r.group;
        this.#list.append(header);
      }
      const row = document.createElement("div");
      row.className = "kavacha-search-row";
      row.dataset.index = i;
      row.toggleAttribute("selected", i === this.#selectedIndex);
      const title = document.createElement("span");
      title.className = "kavacha-search-title";
      title.textContent = r.title;
      row.append(title);
      if (r.workspaceId) {
        const badge = document.createElement("span");
        badge.className = "kavacha-search-badge";
        badge.textContent =
          gKavachaWorkspaces.getWorkspaceFromId(r.workspaceId)?.name || "";
        if (badge.textContent) {
          row.append(badge);
        }
      }
      const detail = document.createElement("span");
      detail.className = "kavacha-search-detail";
      detail.textContent = r.detail;
      row.append(detail);
      this.#list.append(row);
    }
  }

  #onKeyDown(event) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!this.#results.length) {
        return;
      }
      const delta = event.key === "ArrowDown" ? 1 : -1;
      this.#selectedIndex =
        (this.#selectedIndex + delta + this.#results.length) %
        this.#results.length;
      const rows = this.#list.querySelectorAll(".kavacha-search-row");
      rows.forEach(row =>
        row.toggleAttribute(
          "selected",
          Number(row.dataset.index) === this.#selectedIndex
        )
      );
      rows[this.#selectedIndex]?.scrollIntoView({ block: "nearest" });
    } else if (event.key === "Enter") {
      event.preventDefault();
      this.#activate(this.#results[this.#selectedIndex]);
    }
  }

  async #activate(result) {
    if (!result) {
      return;
    }
    this.close();
    await result.action();
  }

  async #selectTab(tab) {
    const workspaceId = tab.getAttribute("kavacha-space-id");
    if (workspaceId && workspaceId !== gKavachaWorkspaces.activeWorkspace) {
      const workspace = gKavachaWorkspaces.getWorkspaceFromId(workspaceId);
      if (workspace) {
        await gKavachaWorkspaces.changeWorkspace(workspace);
      }
    }
    gBrowser.selectedTab = tab;
  }
}

window.gKavachaUniversalSearch = new nsKavachaUniversalSearch();

window.gKavachaUniversalSearch.init();
}
