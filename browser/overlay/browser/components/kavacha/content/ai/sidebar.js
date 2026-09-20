// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Kavacha AI sidebar (ADR 0014; ROADMAP Phase 6) — the surface for the two
// things a local model does with the user's own data: summarize the page in
// front of them, and answer questions about everything they have kept.
//
// This is a CHROME document in a non-remote <browser>, exactly like Firefox's
// own history and bookmarks sidebars, so it can import the Kavacha modules
// directly. Two consequences it never gets to forget:
//
//   * Model output is UNTRUSTED TEXT rendered with SYSTEM PRIVILEGES. It is
//     therefore only ever put on screen through KavachaMarkdown (patch 0052),
//     which BUILDS DOM NODES and never parses HTML, or through textContent.
//     An innerHTML here would be script execution as chrome — the same
//     reasoning that governs the workspace notes panel.
//   * Every request is abortable and superseded requests are dropped, because
//     a sidebar is closed and re-opened constantly and a generation can take
//     tens of seconds.
//
// Strings are literal English, matching the other Kavacha chrome pages
// (studio.html, marketplace.html, plugins.html). That is deliberate: these
// pages are not in browser.xhtml's Fluent scope, and D0e is the standing
// reminder of what a mis-wired .ftl id ships as — a control that measures
// perfectly and has no label.

"use strict";

/* global ChromeUtils, Services, document, window, console */

(() => {
  const { KavachaAIBridge } = ChromeUtils.importESModule(
    "resource:///modules/KavachaAIBridge.sys.mjs"
  );
  const { KavachaAskHistory } = ChromeUtils.importESModule(
    "resource:///modules/KavachaAskHistory.sys.mjs"
  );
  const { KavachaPersonalIndex } = ChromeUtils.importESModule(
    "resource:///modules/KavachaPersonalIndex.sys.mjs"
  );
  const { KavachaMarkdown } = ChromeUtils.importESModule(
    "resource:///modules/KavachaMarkdown.sys.mjs"
  );

  const kSummarizeSystem =
    "You are a concise assistant. Summarize the web page below in 4-6 short " +
    "bullet points, then one sentence on why it might matter. Use only the " +
    "text provided; do not speculate about anything it does not say.";

  const kUnavailable =
    "No local model found. Kavacha talks only to a model server on this " +
    "machine — install one (Ollama, for example), then check Settings → " +
    "Privacy → Local AI.";

  // The chrome window this sidebar lives in. topChromeWindow is the supported
  // way across; the chromeEventHandler walk is the fallback for the same
  // reason Firefox's own sidebars keep one.
  const chromeWindow =
    window.browsingContext?.topChromeWindow ||
    window.docShell?.chromeEventHandler?.ownerGlobal ||
    window.top;

  const $ = id => document.getElementById(id);

  // One in-flight request at a time, per view. A new request aborts the old.
  const inflight = { summarize: null, ask: null };

  /* ------------------------------------------------------------ rendering */

  const clear = node => {
    while (node.firstChild) {
      node.firstChild.remove();
    }
  };

  function setStatus(node, message, { action } = {}) {
    clear(node);
    if (!message) {
      node.hidden = true;
      return;
    }
    node.hidden = false;
    node.append(document.createTextNode(message));
    if (action) {
      const button = document.createElement("button");
      button.className = "ai-link";
      button.textContent = action.label;
      button.addEventListener("click", action.run);
      node.append(document.createElement("br"), button);
    }
  }

  // Turn "[1]" in the model's prose into a control that reveals the source it
  // points at. Walks TEXT NODES of the already-built fragment — the citation
  // markers arrive as text, and they stay text until we replace them with
  // elements we created ourselves.
  function linkCitations(fragment, sources) {
    if (!sources.length) {
      return;
    }
    const walker = document.createTreeWalker(fragment, NodeFilter.SHOW_TEXT);
    const targets = [];
    while (walker.nextNode()) {
      if (/\[\d{1,2}\]/.test(walker.currentNode.nodeValue)) {
        targets.push(walker.currentNode);
      }
    }
    for (const textNode of targets) {
      const parts = textNode.nodeValue.split(/(\[\d{1,2}\])/);
      const replacement = document.createDocumentFragment();
      for (const part of parts) {
        const m = /^\[(\d{1,2})\]$/.exec(part);
        const source = m ? sources[Number(m[1]) - 1] : null;
        if (!source) {
          // Either ordinary text, or a citation number the model invented
          // that points at no source. Leave it as literal text rather than
          // wiring a control to nothing.
          replacement.append(document.createTextNode(part));
          continue;
        }
        const cite = document.createElement("button");
        cite.className = "ai-cite";
        cite.textContent = part;
        cite.title = source.title || source.url;
        cite.addEventListener("click", () => openSource(source.url));
        replacement.append(cite);
      }
      textNode.replaceWith(replacement);
    }
  }

  function renderMarkdown(node, text, sources = []) {
    clear(node);
    const fragment = KavachaMarkdown.render(text, document);
    linkCitations(fragment, sources);
    node.append(fragment);
  }

  function openSource(url) {
    try {
      chromeWindow.openTrustedLinkIn(url, "tab");
    } catch (e) {
      console.error("Kavacha AI sidebar: could not open source", e);
    }
  }

  function renderSources(node, sources, { numbered = 0 } = {}) {
    clear(node);
    if (!sources.length) {
      return;
    }
    const header = document.createElement("div");
    header.className = "ai-sources-header";
    header.textContent = numbered ? "Sources" : "From your history";
    node.append(header);

    sources.forEach((source, i) => {
      const item = document.createElement("button");
      item.className = "ai-source";

      const title = document.createElement("div");
      title.className = "ai-source-title";
      // Only the first `numbered` sources were shown to the model, so only
      // those carry a citation number the answer can refer to.
      if (i < numbered) {
        const index = document.createElement("span");
        index.className = "ai-source-index";
        index.textContent = `[${i + 1}] `;
        title.append(index);
      }
      title.append(document.createTextNode(source.title || source.url));

      const meta = document.createElement("div");
      meta.className = "ai-source-meta";
      meta.textContent = [prettyHost(source.url), prettyDate(source.visitedAt)]
        .filter(Boolean)
        .join(" · ");

      item.append(title, meta);

      if (source.snippet) {
        const snippet = document.createElement("div");
        snippet.className = "ai-source-snippet";
        // The index wraps matches in guillemets for its own snippet display;
        // they are noise here.
        snippet.textContent = source.snippet.replace(/[«»]/g, "");
        item.append(snippet);
      }

      item.addEventListener("click", () => openSource(source.url));
      node.append(item);
    });
  }

  function prettyHost(url) {
    try {
      return new URL(url).host.replace(/^www\./, "");
    } catch (e) {
      return url || "";
    }
  }

  function prettyDate(ms) {
    if (!ms) {
      return "";
    }
    try {
      return new Date(ms).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch (e) {
      return "";
    }
  }

  /* --------------------------------------------------------------- modes */

  function selectMode(mode) {
    const summarize = mode === "summarize";
    $("mode-summarize").setAttribute("aria-selected", String(summarize));
    $("mode-ask").setAttribute("aria-selected", String(!summarize));
    $("view-summarize").hidden = !summarize;
    $("view-ask").hidden = summarize;
  }

  /* ----------------------------------------------------------- summarize */

  function currentBrowser() {
    return chromeWindow.gBrowser?.selectedBrowser || null;
  }

  function refreshPageHeader() {
    const browser = currentBrowser();
    const url = browser?.currentURI?.spec || "";
    $("page-title").textContent =
      chromeWindow.gBrowser?.selectedTab?.label || url || "—";
    $("page-host").textContent = prettyHost(url);
    // about:, file: and PDFs have no readable text for us to send.
    $("summarize-run").disabled = !/^https?:/.test(url);
  }

  // The page's readable text. Asking the indexer actor for a LIVE capture
  // first is what makes summarizing independent of the index: the index is a
  // storage feature the user may have switched off, and "summarize what I am
  // looking at" should not require having stored it. The stored text is the
  // fallback for a page whose actor is gone (bfcache, a torn-down frame).
  async function pageText(browser) {
    try {
      const actor =
        browser.browsingContext?.currentWindowGlobal?.getActor("KavachaIndexer");
      const captured = await actor?.sendQuery("KavachaIndexer:Capture");
      if (captured?.text) {
        return captured.text;
      }
    } catch (e) {
      // No actor for this page (not http/https), or the frame went away.
    }
    try {
      return await KavachaPersonalIndex.getText(browser.currentURI?.spec || "");
    } catch (e) {
      return "";
    }
  }

  async function summarizeCurrentPage() {
    const status = $("summarize-status");
    const out = $("summarize-out");
    const button = $("summarize-run");

    inflight.summarize?.abort();
    const controller = new AbortController();
    inflight.summarize = controller;

    clear(out);
    refreshPageHeader();
    const browser = currentBrowser();
    const url = browser?.currentURI?.spec || "";
    if (!/^https?:/.test(url)) {
      setStatus(status, "This page has no readable text to summarize.");
      return;
    }

    button.disabled = true;
    setStatus(status, "Reading the page…");
    try {
      const available = await KavachaAIBridge.isAvailable();
      if (controller.signal.aborted) {
        return;
      }
      if (!available.available) {
        setStatus(status, kUnavailable, {
          action: { label: "Open AI settings", run: openSettings },
        });
        return;
      }

      const text = await pageText(browser);
      if (controller.signal.aborted) {
        return;
      }
      if (!text) {
        setStatus(
          status,
          "Kavacha could not read any text from this page — it may still be " +
            "loading, or it may be a document with no text layer."
        );
        return;
      }

      setStatus(status, "Summarizing…");
      const summary = await KavachaAIBridge.generate(text, {
        system: kSummarizeSystem,
        signal: controller.signal,
      });
      if (controller.signal.aborted) {
        return;
      }
      if (!summary) {
        setStatus(status, "The model returned nothing.");
        return;
      }
      setStatus(status, "");
      renderMarkdown(out, summary);
    } catch (e) {
      if (e?.name === "AbortError" || controller.signal.aborted) {
        return;
      }
      console.error("Kavacha AI sidebar: summarize failed", e);
      setStatus(status, "The local model could not complete the request.");
    } finally {
      if (inflight.summarize === controller) {
        inflight.summarize = null;
      }
      button.disabled = false;
      refreshPageHeader();
    }
  }

  /* ----------------------------------------------------------------- ask */

  const kReasonText = {
    "no-terms":
      "That question is all common words — try naming something specific you " +
      "remember seeing.",
    "no-sources": "Nothing in your history matches that.",
    disabled: "Local AI is switched off, so here is what your history holds.",
    unreachable:
      "No local model is running, so here is what your history holds.",
    "no-models":
      "The model server is running but has no models installed, so here is " +
      "what your history holds.",
    "no-text":
      "These pages were visited before their text was indexed, so they can " +
      "be listed but not read.",
    empty: "The model returned nothing, so here is what your history holds.",
    error:
      "The local model could not answer, so here is what your history holds.",
  };

  // `exact` and `relaxed` say different things and must not be collapsed: a
  // question can turn up one page carrying every word AND a pile of near
  // misses, and telling the user "nothing matched every word" there is simply
  // false.
  function relaxationNote({ exact, relaxed }) {
    if (!relaxed) {
      return "";
    }
    return exact
      ? "Pages matching only some of your words are included below."
      : "No page matched every word, so these are the closest ones.";
  }

  async function runAsk() {
    const question = $("ask-input").value.trim();
    if (!question) {
      return;
    }
    const status = $("ask-status");
    const out = $("ask-out");
    const sourcesNode = $("ask-sources");

    inflight.ask?.abort();
    const controller = new AbortController();
    inflight.ask = controller;

    clear(out);
    clear(sourcesNode);
    $("ask-run").disabled = true;
    $("ask-stop").hidden = false;
    setStatus(status, "Searching your history…");

    try {
      const result = await KavachaAskHistory.ask(question, {
        signal: controller.signal,
      });
      if (controller.signal.aborted) {
        return;
      }

      if (result.degraded) {
        if (result.reason !== "aborted") {
          setStatus(status, kReasonText[result.reason] || kReasonText.error);
        }
        renderSources(sourcesNode, result.sources);
        return;
      }

      setStatus(status, relaxationNote(result));
      renderMarkdown(out, result.answer, result.cited || []);
      renderSources(sourcesNode, result.sources, {
        numbered: (result.cited || []).length,
      });
    } catch (e) {
      if (e?.name === "AbortError" || controller.signal.aborted) {
        return;
      }
      console.error("Kavacha AI sidebar: ask failed", e);
      setStatus(status, "The local model could not complete the request.");
    } finally {
      if (inflight.ask === controller) {
        inflight.ask = null;
      }
      $("ask-run").disabled = false;
      $("ask-stop").hidden = true;
    }
  }

  function focusAsk(question = "") {
    selectMode("ask");
    const input = $("ask-input");
    if (question) {
      input.value = question;
    }
    input.focus();
    if (question) {
      runAsk();
    }
  }

  /* -------------------------------------------------------------- footer */

  function openSettings() {
    try {
      chromeWindow.openPreferences("paneKavachaPrivacy");
    } catch (e) {
      console.error("Kavacha AI sidebar: could not open settings", e);
    }
  }

  // Named on demand only. Probing here would put a network request behind
  // merely opening the sidebar, and R3 (fresh profile makes no requests) plus
  // ADR 0013's "never in the background" both say no.
  function refreshFooter() {
    const enabled = Services.prefs.getBoolPref("kavacha.ai.enabled", true);
    const model = Services.prefs.getStringPref("kavacha.ai.model", "");
    $("ai-footer-status").textContent = !enabled
      ? "Local AI is off"
      : model
        ? `Local model: ${model}`
        : "Local model on this device only";
  }

  /* ---------------------------------------------------------------- init */

  function init() {
    $("mode-summarize").addEventListener("click", () =>
      selectMode("summarize")
    );
    $("mode-ask").addEventListener("click", () => selectMode("ask"));
    $("summarize-run").addEventListener("click", summarizeCurrentPage);
    $("ask-run").addEventListener("click", runAsk);
    $("ask-stop").addEventListener("click", () => inflight.ask?.abort());
    $("ai-settings").addEventListener("click", openSettings);
    $("ask-input").addEventListener("keydown", event => {
      // Enter asks; Shift+Enter is a newline, because a question can be long.
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        runAsk();
      }
    });

    // Follow the window's current tab, so the Summarize view always names the
    // page the user is looking at. Deliberately does NOT re-summarize: that
    // would fire a model request on every tab switch.
    const onTabChange = () => refreshPageHeader();
    chromeWindow.addEventListener("TabSelect", onTabChange, true);

    // TabSelect alone would miss navigation WITHIN the selected tab, which is
    // the common case: read an article, follow a link, hit Summarize, and get
    // the previous page's title.
    const progressListener = {
      QueryInterface: ChromeUtils.generateQI([
        "nsIWebProgressListener",
        "nsISupportsWeakReference",
      ]),
      onLocationChange: () => refreshPageHeader(),
    };
    try {
      chromeWindow.gBrowser?.addProgressListener(progressListener);
    } catch (e) {
      console.error("Kavacha AI sidebar: no progress listener", e);
    }

    window.addEventListener(
      "unload",
      () => {
        inflight.summarize?.abort();
        inflight.ask?.abort();
        chromeWindow.removeEventListener("TabSelect", onTabChange, true);
        try {
          chromeWindow.gBrowser?.removeProgressListener(progressListener);
        } catch (e) {}
      },
      { once: true }
    );

    refreshPageHeader();
    refreshFooter();
  }

  // The chrome-side opener (KavachaAISidebar) calls into this once the page
  // has loaded, rather than the page polling for an intent.
  window.KavachaAISidebarPage = {
    summarizeCurrentPage,
    focusAsk,
    selectMode,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
