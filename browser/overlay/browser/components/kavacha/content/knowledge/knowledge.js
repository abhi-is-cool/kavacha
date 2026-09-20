// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Kavacha Knowledge sidebar (ADR 0015; ROADMAP Phase 7) — the surface for
// FEATURES 6.1 (per-page notes and annotations) and 6.2 (the web clipper).
//
// Three views, in the order a user meets them:
//
//   page    — the note for whatever tab is in front of them, plus everything
//             already saved from it. The note autosaves; clearing it deletes.
//   library — everything kept, newest first, filterable. Also where deletion
//             lives, because the store deliberately does NOT follow history
//             deletion (ADR 0015) and so must offer its own.
//   reader  — one clip's saved text, rendered from the store. This is the
//             offline half: the page can be gone and the words are still here.
//
// This is a CHROME document, so the two rules the AI sidebar states apply
// unchanged and for the same reasons:
//
//   * Page text and note text are UNTRUSTED and rendered with SYSTEM
//     PRIVILEGES. Everything reaches the DOM through textContent or
//     KavachaMarkdown (which builds nodes and never parses HTML). A single
//     innerHTML here would turn "clip a page" into "run that page's markup as
//     chrome".
//   * Strings are literal English rather than Fluent ids: this document is
//     not in browser.xhtml's l10n scope, and D0e is the standing reminder of
//     what a mis-scoped id ships as — a perfectly measurable blank control.

"use strict";

/* global ChromeUtils, Services, Cc, Ci, IOUtils, PathUtils, document, window, console */

(() => {
  const { KavachaKnowledge } = ChromeUtils.importESModule(
    "resource:///modules/KavachaKnowledge.sys.mjs"
  );
  const { KavachaMarkdown } = ChromeUtils.importESModule(
    "resource:///modules/KavachaMarkdown.sys.mjs"
  );

  const chromeWindow =
    window.browsingContext?.topChromeWindow ||
    window.docShell?.chromeEventHandler?.ownerGlobal ||
    window.top;

  const $ = id => document.getElementById(id);

  // Autosave debounce. Long enough that a normal typing burst is one write,
  // short enough that closing the sidebar right after typing does not lose
  // the sentence — and the flush on unload covers the rest.
  const kSaveDebounceMs = 700;

  let saveTimer = null;
  let filterTimer = null;
  let currentUrl = "";
  let libraryKind = "";
  let previewOn = false;

  /* ------------------------------------------------------------ rendering */

  const clear = node => {
    while (node.firstChild) {
      node.firstChild.remove();
    }
  };

  function setStatus(node, message) {
    clear(node);
    if (!message) {
      node.hidden = true;
      return;
    }
    node.hidden = false;
    node.append(document.createTextNode(message));
  }

  function prettyHost(url) {
    try {
      return new URL(url).host.replace(/^www\./, "");
    } catch (e) {
      return "";
    }
  }

  function whenText(ms) {
    if (!ms) {
      return "";
    }
    const date = new Date(ms);
    const days = Math.floor((Date.now() - ms) / 86_400_000);
    if (days === 0) {
      return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    }
    if (days === 1) {
      return "yesterday";
    }
    if (days < 7) {
      return days + " days ago";
    }
    return date.toLocaleDateString();
  }

  const kKindLabel = {
    note: "Note",
    highlight: "Highlight",
    clip: "Clip",
  };

  /**
   * One row in a list of saved items. Deliberately built node by node: `item`
   * carries text the page authored.
   */
  function itemRow(item, { showPage = false } = {}) {
    const row = document.createElement("div");
    row.className = "kn-item";
    row.dataset.id = String(item.id);

    const head = document.createElement("div");
    head.className = "kn-item-head";
    const kind = document.createElement("span");
    kind.className = "kn-kind kn-kind-" + item.kind;
    kind.textContent = kKindLabel[item.kind] || item.kind;
    const when = document.createElement("span");
    when.className = "kn-when";
    when.textContent = whenText(item.updatedAt);
    head.append(kind, when);
    row.append(head);

    if (showPage) {
      const page = document.createElement("div");
      page.className = "kn-item-page";
      page.textContent = item.title || prettyHost(item.url) || item.url;
      page.title = item.url;
      row.append(page);
    }

    const body = document.createElement("div");
    body.className = "kn-item-body";
    // A clip is thousands of characters; the row shows its opening and the
    // reader view shows the rest.
    const preview =
      item.kind === "clip" ? item.body.slice(0, 220) : item.body.slice(0, 400);
    body.textContent = preview + (item.body.length > preview.length ? "…" : "");
    row.append(body);

    if (item.comment) {
      const comment = document.createElement("div");
      comment.className = "kn-item-comment";
      comment.textContent = item.comment;
      row.append(comment);
    }

    const tools = document.createElement("div");
    tools.className = "kn-item-tools";

    if (item.kind === "clip") {
      const read = document.createElement("button");
      read.className = "kn-link";
      read.textContent = "Open saved copy";
      read.addEventListener("click", () => showReader(item));
      tools.append(read);
    }

    const visit = document.createElement("button");
    visit.className = "kn-link";
    visit.textContent = "Open page";
    visit.addEventListener("click", () => openUrl(item.url));
    tools.append(visit);

    const copy = document.createElement("button");
    copy.className = "kn-link";
    copy.textContent = "Copy";
    copy.addEventListener("click", () => copyText(item.body));
    tools.append(copy);

    const remove = document.createElement("button");
    remove.className = "kn-link kn-danger";
    remove.textContent = "Delete";
    remove.addEventListener("click", async () => {
      await KavachaKnowledge.remove(item.id);
      row.remove();
      refreshFooter();
    });
    tools.append(remove);

    row.append(tools);
    return row;
  }

  function renderItems(container, items, options) {
    clear(container);
    for (const item of items) {
      container.append(itemRow(item, options));
    }
  }

  /* --------------------------------------------------------- chrome hooks */

  function currentBrowser() {
    return chromeWindow.gBrowser?.selectedBrowser || null;
  }

  function openUrl(url) {
    try {
      chromeWindow.openTrustedLinkIn(url, "tab");
    } catch (e) {
      console.error("KavachaKnowledge: open failed", e);
    }
  }

  function copyText(text) {
    try {
      Cc["@mozilla.org/widget/clipboardhelper;1"]
        .getService(Ci.nsIClipboardHelper)
        .copyString(String(text || ""));
    } catch (e) {
      console.error("KavachaKnowledge: copy failed", e);
    }
  }

  function activeWorkspaceUuid() {
    try {
      return (
        chromeWindow.gKavachaWorkspaces?.getActiveWorkspaceFromCache?.()?.uuid ||
        null
      );
    } catch (e) {
      return null;
    }
  }

  /**
   * Ask the page for text through the KavachaIndexer actor (patch 0078). The
   * actor is the ONLY way this chrome document touches web content — it never
   * reaches into a content window directly, and the actor already refuses
   * anything that is not http/https.
   */
  async function askContent(message) {
    const browser = currentBrowser();
    if (!browser) {
      return null;
    }
    try {
      const actor =
        browser.browsingContext?.currentWindowGlobal?.getActor("KavachaIndexer");
      return await actor?.sendQuery(message);
    } catch (e) {
      // No actor (not a web page), or the frame went away mid-query.
      return null;
    }
  }

  /* -------------------------------------------------------------- actions */

  async function clipPage() {
    selectMode("page");
    const captured = await askContent("KavachaIndexer:Capture");
    if (!captured?.text) {
      setStatus(
        $("page-status"),
        "Nothing to clip — this page has no readable text, or it is not a web page."
      );
      return;
    }
    const id = await KavachaKnowledge.addItem({
      kind: "clip",
      url: captured.url,
      title: captured.title,
      body: captured.text,
      workspaceUuid: activeWorkspaceUuid(),
    });
    setStatus(
      $("page-status"),
      id
        ? "Clipped " + captured.text.length.toLocaleString() + " characters."
        : "Could not clip this page."
    );
    await refreshPageItems();
    refreshFooter();
  }

  async function clipSelection() {
    selectMode("page");
    const captured = await askContent("KavachaIndexer:CaptureSelection");
    if (!captured?.text) {
      setStatus(
        $("page-status"),
        "Select some text on the page first, then highlight it."
      );
      return;
    }
    const id = await KavachaKnowledge.addItem({
      kind: "highlight",
      url: captured.url,
      title: captured.title,
      body: captured.text,
      workspaceUuid: activeWorkspaceUuid(),
    });
    setStatus($("page-status"), id ? "Highlight saved." : "Could not save that.");
    await refreshPageItems();
    refreshFooter();
  }

  function queueNoteSave() {
    clearTimeout(saveTimer);
    $("note-saved").textContent = "";
    saveTimer = setTimeout(saveNoteNow, kSaveDebounceMs);
  }

  async function saveNoteNow() {
    clearTimeout(saveTimer);
    const browser = currentBrowser();
    const url = browser?.currentURI?.spec || "";
    if (!KavachaKnowledge.keyFor(url)) {
      return;
    }
    const body = $("note-input").value;
    await KavachaKnowledge.saveNote({
      url,
      title: chromeWindow.gBrowser?.selectedTab?.label || url,
      body,
      workspaceUuid: activeWorkspaceUuid(),
    });
    $("note-saved").textContent = body.trim() ? "Saved" : "";
    refreshFooter();
    if (previewOn) {
      renderPreview();
    }
  }

  function renderPreview() {
    const target = $("note-preview");
    clear(target);
    const text = $("note-input").value.trim();
    if (!text) {
      target.append(document.createTextNode("Nothing to preview yet."));
      return;
    }
    // Same renderer as the workspace notes panel (patch 0052): DOM nodes, no
    // HTML parsing.
    target.append(KavachaMarkdown.render(text, document));
  }

  function togglePreview() {
    previewOn = !previewOn;
    $("note-preview").hidden = !previewOn;
    $("note-input").hidden = previewOn;
    $("note-preview-toggle").textContent = previewOn ? "Edit" : "Preview";
    if (previewOn) {
      renderPreview();
    }
  }

  /* ---------------------------------------------------------------- views */

  function selectMode(mode) {
    const known = mode === "library" || mode === "reader" ? mode : "page";
    for (const name of ["page", "library", "reader"]) {
      $("view-" + name).hidden = name !== known;
    }
    // The reader is reached from a row, not from the tab strip, so it leaves
    // whichever tab was selected looking selected.
    if (known !== "reader") {
      $("mode-page").setAttribute("aria-selected", String(known === "page"));
      $("mode-library").setAttribute(
        "aria-selected",
        String(known === "library")
      );
      $("mode-page").classList.toggle("is-active", known === "page");
      $("mode-library").classList.toggle("is-active", known === "library");
    }
    if (known === "library") {
      refreshLibrary();
    }
  }

  function showReader(item) {
    $("reader-title").textContent = item.title || item.url;
    $("reader-meta").textContent =
      prettyHost(item.url) + " · saved " + whenText(item.createdAt);
    const body = $("reader-body");
    clear(body);
    // Paragraph per blank-line block, as text nodes. The saved copy is read
    // here rather than re-fetched — that is what makes it work offline.
    for (const para of String(item.body).split(/\n{2,}/)) {
      const p = document.createElement("p");
      p.textContent = para.trim();
      if (p.textContent) {
        body.append(p);
      }
    }
    selectMode("reader");
  }

  async function refreshPageHeader() {
    const browser = currentBrowser();
    const url = browser?.currentURI?.spec || "";
    $("page-title").textContent =
      chromeWindow.gBrowser?.selectedTab?.label || url || "—";
    $("page-host").textContent = prettyHost(url);
    const storable = !!KavachaKnowledge.keyFor(url);
    $("clip-page").disabled = !storable;
    $("clip-selection").disabled = !storable;
    $("note-input").disabled = !storable;
    if (!storable) {
      setStatus(
        $("page-status"),
        "Notes and clips attach to web pages. This is not one."
      );
    } else {
      setStatus($("page-status"), "");
    }
    return url;
  }

  /**
   * Load the note + saved items for whatever tab is selected. Ordered so a
   * fast tab switch cannot write the previous page's note onto the new one:
   * the pending save is flushed for the OLD url first, then the box is
   * repopulated.
   */
  async function onTabChange() {
    if (saveTimer) {
      await saveNoteNow();
    }
    const url = await refreshPageHeader();
    currentUrl = url;
    const note = await KavachaKnowledge.getNote(url);
    // A slower load may have been superseded while we awaited.
    if (currentUrl !== url) {
      return;
    }
    $("note-input").value = note?.body || "";
    $("note-saved").textContent = note ? "Saved" : "";
    if (previewOn) {
      renderPreview();
    }
    await refreshPageItems();
  }

  async function refreshPageItems() {
    const url = currentBrowser()?.currentURI?.spec || "";
    const { highlights, clips } = await KavachaKnowledge.forPage(url);
    const items = [...highlights, ...clips].sort(
      (a, b) => b.createdAt - a.createdAt
    );
    $("page-items-heading").hidden = !items.length;
    renderItems($("page-items"), items);
  }

  async function refreshLibrary() {
    const filter = $("library-filter").value.trim();
    let items = filter
      ? await KavachaKnowledge.search(filter, { limit: 200 })
      : await KavachaKnowledge.listRecent({ limit: 200 });
    if (libraryKind) {
      items = items.filter(i => i.kind === libraryKind);
    }
    setStatus(
      $("library-status"),
      items.length
        ? ""
        : filter
          ? "Nothing matches that."
          : "Nothing saved yet. Clip a page or write a note and it lands here."
    );
    renderItems($("library-items"), items, { showPage: true });
  }

  async function refreshFooter() {
    const stats = await KavachaKnowledge.stats();
    $("kn-footer-status").textContent =
      stats.note +
      " notes · " +
      stats.highlight +
      " highlights · " +
      stats.clip +
      " clips";
  }

  /**
   * Write the whole store to a JSON file in the downloads folder. Deliberately
   * a plain file rather than a picker: the sidebar is a narrow surface, the
   * user asked for their data, and a modal file dialog opened from a sidebar
   * is a good way to lose the answer behind the browser window.
   */
  async function exportAll() {
    try {
      const data = await KavachaKnowledge.exportAll();
      const dir = Services.dirsvc.get("DfltDwnld", Ci.nsIFile).path;
      const stamp = new Date().toISOString().slice(0, 10);
      const path = PathUtils.join(dir, `kavacha-knowledge-${stamp}.json`);
      await IOUtils.writeJSON(path, data);
      $("kn-footer-status").textContent =
        "Exported " + data.items.length + " items to " + path;
    } catch (e) {
      console.error("KavachaKnowledge: export failed", e);
      $("kn-footer-status").textContent = "Export failed.";
    }
  }

  /* ------------------------------------------------------------------ init */

  function init() {
    $("mode-page").addEventListener("click", () => selectMode("page"));
    $("mode-library").addEventListener("click", () => selectMode("library"));
    $("clip-page").addEventListener("click", clipPage);
    $("clip-selection").addEventListener("click", clipSelection);
    $("note-input").addEventListener("input", queueNoteSave);
    $("note-preview-toggle").addEventListener("click", togglePreview);
    $("reader-back").addEventListener("click", () => selectMode("library"));
    $("kn-export").addEventListener("click", exportAll);
    $("library-filter").addEventListener("input", () => {
      clearTimeout(filterTimer);
      filterTimer = setTimeout(refreshLibrary, 150);
    });
    for (const chip of document.querySelectorAll(".kn-chip")) {
      chip.addEventListener("click", () => {
        libraryKind = chip.dataset.kind || "";
        for (const other of document.querySelectorAll(".kn-chip")) {
          other.classList.toggle("is-active", other === chip);
        }
        refreshLibrary();
      });
    }

    chromeWindow.addEventListener("TabSelect", onTabChange, true);
    // TabSelect misses navigation within the selected tab, which is the
    // common case for note-taking: you read on, the note should follow.
    const progressListener = {
      QueryInterface: ChromeUtils.generateQI([
        "nsIWebProgressListener",
        "nsISupportsWeakReference",
      ]),
      onLocationChange: (webProgress, request, uri, flags) => {
        if (webProgress.isTopLevel) {
          onTabChange();
        }
      },
    };
    try {
      chromeWindow.gBrowser?.addProgressListener(progressListener);
    } catch (e) {
      console.error("KavachaKnowledge: no progress listener", e);
    }

    window.addEventListener(
      "unload",
      () => {
        // Flush, do not queue: the document is going away and the timer with
        // it. This is why saveNoteNow reads the box directly rather than
        // trusting state captured when the timer was set.
        if (saveTimer) {
          saveNoteNow();
        }
        chromeWindow.removeEventListener("TabSelect", onTabChange, true);
        try {
          chromeWindow.gBrowser?.removeProgressListener(progressListener);
        } catch (e) {}
      },
      { once: true }
    );

    onTabChange();
    refreshFooter();
  }

  // The chrome callers (KavachaKnowledgeSidebar) drive the page through this.
  window.KavachaKnowledgePage = {
    selectMode,
    clipPage,
    clipSelection,
    focusNote() {
      selectMode("page");
      if (previewOn) {
        togglePreview();
      }
      $("note-input").focus();
    },
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
