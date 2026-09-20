// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// about:knowledge — the personal knowledge graph (ADR 0016; FEATURES 6.3).
//
// DELIBERATELY NOT A FORCE-DIRECTED BALL OF DOTS. A node-and-spring picture
// of a few thousand pages is a screensaver: it looks like understanding and
// answers no question. What a user actually asks is "what led me here, what
// did I write about it, and what else is like it" — so the page is a list of
// entry points and a detail view that answers exactly those three, per page.
// The graph is the DATA; this is one honest view of it, and the module's API
// is deliberately free of presentation so another view can be built later.
//
// Chrome-privileged page, so the same rule as every other Kavacha chrome
// surface: page titles, note text and model-extracted entity names are
// untrusted strings and reach the DOM only through textContent.

"use strict";

/* global ChromeUtils, Services, Ci, Cc, IOUtils, PathUtils, document, window, console */

(() => {
  const { KavachaKnowledgeGraph } = ChromeUtils.importESModule(
    "resource:///modules/KavachaKnowledgeGraph.sys.mjs"
  );
  const { KavachaKnowledge } = ChromeUtils.importESModule(
    "resource:///modules/KavachaKnowledge.sys.mjs"
  );
  const { KavachaPersonalIndex } = ChromeUtils.importESModule(
    "resource:///modules/KavachaPersonalIndex.sys.mjs"
  );

  const $ = id => document.getElementById(id);
  const clear = node => {
    while (node.firstChild) {
      node.firstChild.remove();
    }
  };

  let queryTimer = null;

  function prettyUrl(url) {
    try {
      const uri = new URL(url);
      return uri.host.replace(/^www\./, "") + uri.pathname.replace(/\/$/, "");
    } catch (e) {
      return url;
    }
  }

  function openUrl(url) {
    try {
      const chromeWindow = Services.wm.getMostRecentWindow("navigator:browser");
      chromeWindow?.openTrustedLinkIn(url, "tab");
    } catch (e) {
      console.error("about:knowledge: open failed", e);
    }
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) {
      node.className = className;
    }
    if (text !== undefined) {
      node.textContent = text;
    }
    return node;
  }

  /* ------------------------------------------------------------- entries */

  function listRow(entry) {
    const row = el("button", "kg-row");
    row.append(el("span", "kg-row-title", entry.title || prettyUrl(entry.url)));
    const meta = el("span", "kg-row-meta");
    meta.textContent = entry.meta || prettyUrl(entry.url);
    row.append(meta);
    row.addEventListener("click", () => showPage(entry.url));
    return row;
  }

  async function showHubs() {
    $("kg-list-heading").textContent = "Most connected";
    const hubs = await KavachaKnowledgeGraph.hubs({ limit: 25 });
    const list = $("kg-list");
    clear(list);
    if (!hubs.length) {
      list.append(
        el(
          "p",
          "kg-empty",
          "No trails yet. Follow a few links and this fills in — Kavacha " +
            "records that one page led to another, which your history never does."
        )
      );
      return;
    }
    for (const hub of hubs) {
      list.append(
        listRow({
          url: hub.url,
          title: prettyUrl(hub.url),
          meta: hub.degree + " connections",
        })
      );
    }
  }

  async function runSearch(query) {
    const list = $("kg-list");
    if (!query || query.length < 2) {
      showHubs();
      return;
    }
    $("kg-list-heading").textContent = "Results";
    const [pages, kept] = await Promise.all([
      KavachaPersonalIndex.search(query, { limit: 20 }),
      KavachaKnowledge.search(query, { limit: 20 }),
    ]);
    clear(list);
    const seen = new Set();
    for (const page of pages) {
      seen.add(page.url);
      list.append(
        listRow({
          url: page.url,
          title: page.title || prettyUrl(page.url),
          meta: page.snippet || prettyUrl(page.url),
        })
      );
    }
    for (const item of kept) {
      if (seen.has(item.url)) {
        continue;
      }
      seen.add(item.url);
      list.append(
        listRow({
          url: item.url,
          title: item.title || prettyUrl(item.url),
          meta: item.kind + " · " + (item.snippet || prettyUrl(item.url)),
        })
      );
    }
    if (!seen.size) {
      list.append(el("p", "kg-empty", "Nothing matches that."));
    }
  }

  /* -------------------------------------------------------------- detail */

  function section(title) {
    const wrap = el("section", "kg-section");
    wrap.append(el("h3", "kg-section-title", title));
    return wrap;
  }

  function linkRow(url, label, onClick) {
    const row = el("button", "kg-link-row");
    row.append(el("span", "kg-link-label", label));
    row.append(el("span", "kg-link-url", prettyUrl(url)));
    row.addEventListener("click", onClick || (() => showPage(url)));
    return row;
  }

  async function showPage(url) {
    const detail = $("kg-detail");
    clear(detail);
    detail.append(el("p", "kg-empty", "Reading…"));

    const info = await KavachaKnowledgeGraph.describe(url);
    clear(detail);

    const head = el("div", "kg-detail-head");
    head.append(el("h2", "kg-detail-title", info.title || prettyUrl(url)));
    const sub = el("div", "kg-detail-url");
    sub.textContent = info.url || url;
    head.append(sub);

    const tools = el("div", "kg-detail-tools");
    const open = el("button", "kg-link", "Open page");
    open.addEventListener("click", () => openUrl(info.url || url));
    tools.append(open);
    const map = el("button", "kg-link", "Find names on this page");
    map.addEventListener("click", () => mapEntities(info.url || url));
    tools.append(map);
    head.append(tools);
    detail.append(head);

    // -- what the user wrote ------------------------------------------------
    if (info.note || info.highlights.length || info.clips.length) {
      const kept = section("What you kept");
      if (info.note) {
        const note = el("div", "kg-note");
        note.append(el("div", "kg-kind", "Note"));
        note.append(el("div", "kg-note-body", info.note.body));
        kept.append(note);
      }
      for (const highlight of info.highlights) {
        const item = el("div", "kg-quote");
        item.append(el("div", "kg-kind", "Highlight"));
        item.append(el("blockquote", "kg-quote-body", highlight.body));
        if (highlight.comment) {
          item.append(el("div", "kg-note-body", highlight.comment));
        }
        kept.append(item);
      }
      if (info.clips.length) {
        kept.append(
          el(
            "div",
            "kg-muted",
            info.clips.length +
              (info.clips.length === 1 ? " clip saved" : " clips saved") +
              " — open them in the Notes & Clips sidebar."
          )
        );
      }
      detail.append(kept);
    }

    // -- how you got here ---------------------------------------------------
    const trail = section("Trail");
    const into = info.links.filter(l => l.direction === "from");
    const outOf = info.links.filter(l => l.direction === "to");
    if (!info.links.length) {
      trail.append(
        el("p", "kg-muted", "No recorded route in or out of this page yet.")
      );
    }
    for (const link of into) {
      trail.append(
        linkRow(
          link.url,
          (link.kind === "opened-from" ? "opened from" : "came from") +
            (link.weight > 1 ? " ×" + link.weight : ""),
          () => showPage(link.url)
        )
      );
    }
    for (const link of outOf) {
      trail.append(
        linkRow(
          link.url,
          "led to" + (link.weight > 1 ? " ×" + link.weight : ""),
          () => showPage(link.url)
        )
      );
    }
    detail.append(trail);

    // -- what it resembles --------------------------------------------------
    const related = section("Similar reading");
    if (!info.related.length) {
      related.append(
        el(
          "p",
          "kg-muted",
          info.indexed
            ? "Nothing else in your index shares this page's vocabulary."
            : "This page's text was never captured, so there is nothing to compare."
        )
      );
    }
    for (const item of info.related) {
      related.append(
        linkRow(
          item.url,
          item.title || prettyUrl(item.url),
          () => showPage(item.url)
        )
      );
    }
    detail.append(related);

    // -- names --------------------------------------------------------------
    const names = section("Names");
    names.id = "kg-entities";
    renderEntities(names, info.entities);
    detail.append(names);

    // -- spaces -------------------------------------------------------------
    if (info.spaces.length) {
      const spaces = section("Spaces");
      for (const uuid of info.spaces) {
        let label = uuid;
        try {
          const chromeWindow =
            Services.wm.getMostRecentWindow("navigator:browser");
          label =
            chromeWindow?.gKavachaWorkspaces?.getWorkspaceFromId?.(uuid)?.name ||
            uuid;
        } catch (e) {}
        spaces.append(el("div", "kg-chip", label));
      }
      detail.append(spaces);
    }
  }

  function renderEntities(container, entities) {
    for (const node of [...container.querySelectorAll(".kg-chip, .kg-muted")]) {
      node.remove();
    }
    if (!entities.length) {
      container.append(
        el(
          "p",
          "kg-muted",
          "None yet. “Find names on this page” asks your local model " +
            "who and what it is about — nothing is sent anywhere else, and " +
            "nothing happens without you asking."
        )
      );
      return;
    }
    for (const entity of entities) {
      const chip = el("button", "kg-chip", entity.name);
      chip.title = entity.kind;
      chip.addEventListener("click", async () => {
        const urls = await KavachaKnowledgeGraph.pagesForEntity(entity.name);
        $("kg-list-heading").textContent = "Pages mentioning " + entity.name;
        const list = $("kg-list");
        clear(list);
        for (const url of urls) {
          list.append(listRow({ url, title: prettyUrl(url) }));
        }
      });
      container.append(chip);
    }
  }

  async function mapEntities(url) {
    const container = $("kg-entities");
    if (!container) {
      return;
    }
    for (const node of [...container.querySelectorAll(".kg-chip, .kg-muted")]) {
      node.remove();
    }
    container.append(el("p", "kg-muted", "Asking your local model…"));
    const result = await KavachaKnowledgeGraph.extractEntities(url);
    for (const node of [...container.querySelectorAll(".kg-muted")]) {
      node.remove();
    }
    if (!result.available) {
      const why = {
        disabled: "AI is switched off in Settings → Privacy → Local AI.",
        unreachable:
          "No local model found. Kavacha only talks to a model server on " +
          "this machine.",
        "no-text":
          "This page's text was never captured, so there is nothing to read.",
        "not-a-page": "Names can only be found on web pages.",
      };
      container.append(
        el("p", "kg-muted", why[result.reason] || "That did not work.")
      );
      return;
    }
    renderEntities(container, result.entities);
  }

  /* -------------------------------------------------------------- footer */

  async function refreshStats() {
    const [graph, kept] = await Promise.all([
      KavachaKnowledgeGraph.stats(),
      KavachaKnowledge.stats(),
    ]);
    const stats = $("kg-stats");
    clear(stats);
    const parts = [
      graph.nodes + " pages connected",
      graph.edges + " links recorded",
      kept.note + " notes",
      kept.highlight + " highlights",
      kept.clip + " clips",
    ];
    for (const part of parts) {
      stats.append(el("span", "kg-stat", part));
    }
  }

  async function exportKnowledge() {
    try {
      const data = await KavachaKnowledge.exportAll();
      const dir = Services.dirsvc.get("DfltDwnld", Ci.nsIFile).path;
      const stamp = new Date().toISOString().slice(0, 10);
      const path = PathUtils.join(dir, `kavacha-knowledge-${stamp}.json`);
      await IOUtils.writeJSON(path, data);
      $("kg-footer-status").textContent =
        "Exported " + data.items.length + " items to " + path;
    } catch (e) {
      $("kg-footer-status").textContent = "Export failed.";
    }
  }

  // Both destructive buttons confirm, and they say what will and will not
  // survive. Deleting the graph leaves the writing; deleting everything does
  // not, and the store deliberately does not follow history deletion, so this
  // is the only place that can offer it.
  function confirmThen(message, run) {
    const chromeWindow = Services.wm.getMostRecentWindow("navigator:browser");
    const ok = Services.prompt.confirm(chromeWindow, "Kavacha", message);
    if (ok) {
      run();
    }
  }

  function init() {
    $("kg-query").addEventListener("input", () => {
      clearTimeout(queryTimer);
      queryTimer = setTimeout(
        () => runSearch($("kg-query").value.trim()),
        150
      );
    });
    $("kg-export").addEventListener("click", exportKnowledge);
    $("kg-forget").addEventListener("click", () =>
      confirmThen(
        "Delete the trail between pages and any names found on them?\n\n" +
          "Your notes, highlights and clips are not touched.",
        async () => {
          await KavachaKnowledgeGraph.clearAll();
          await refreshStats();
          showHubs();
          $("kg-footer-status").textContent = "Graph deleted.";
        }
      )
    );
    $("kg-forget-all").addEventListener("click", () =>
      confirmThen(
        "Delete everything Kavacha has kept: the trail between pages, and " +
          "all of your notes, highlights and clips.\n\nThis cannot be undone.",
        async () => {
          await KavachaKnowledgeGraph.clearAll();
          await KavachaKnowledge.clearAll();
          await refreshStats();
          showHubs();
          clear($("kg-detail"));
          $("kg-footer-status").textContent = "Everything deleted.";
        }
      )
    );

    refreshStats();
    showHubs();

    // about:knowledge?url=… opens straight onto one page, which is how the
    // palette command and the sidebar hand a page over.
    const params = new URLSearchParams(
      (window.location.search || "").replace(/^\?/, "")
    );
    const target = params.get("url");
    if (target) {
      showPage(target);
    }
  }

  window.KavachaKnowledgePageGraph = { showPage, runSearch };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
