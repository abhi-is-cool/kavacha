// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// about:write — writing mode (ROADMAP Phase 7).
//
// A VIEW, NOT A STORE. Everything typed here goes into a note that already
// exists: the active Space's note (patch 0008) by default, or one page's note
// (patch 0082) when opened as about:write?url=…. Nothing is written anywhere
// else, so there is never a copy of your words that only writing mode knows
// about — which is the failure that makes "distraction-free editors" inside
// other apps untrustworthy.
//
// Autosave with a flush on unload, same contract as the sidebar: what you can
// see in the box is what is in the store within a second of you stopping.

"use strict";

/* global ChromeUtils, Services, document, window, console */

(() => {
  const { KavachaKnowledge } = ChromeUtils.importESModule(
    "resource:///modules/KavachaKnowledge.sys.mjs"
  );
  const { KavachaMarkdown } = ChromeUtils.importESModule(
    "resource:///modules/KavachaMarkdown.sys.mjs"
  );

  const $ = id => document.getElementById(id);
  const kSaveDebounceMs = 700;

  const params = new URLSearchParams(
    (window.location.search || "").replace(/^\?/, "")
  );
  const pageUrl = params.get("url") || "";

  let saveTimer = null;
  let previewOn = false;
  let target = null; // {kind: "space"|"page", id, label}

  function chromeWindow() {
    return Services.wm.getMostRecentWindow("navigator:browser");
  }

  function counts(text) {
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    return (
      words +
      (words === 1 ? " word · " : " words · ") +
      text.length +
      " characters"
    );
  }

  async function resolveTarget() {
    if (pageUrl) {
      const note = await KavachaKnowledge.getNote(pageUrl);
      return {
        kind: "page",
        id: pageUrl,
        label: note?.title || pageUrl,
        body: note?.body || "",
      };
    }
    const win = chromeWindow();
    const space = win?.gKavachaWorkspaces?.getActiveWorkspaceFromCache?.();
    if (!space) {
      return { kind: "none", id: "", label: "Nothing to write in", body: "" };
    }
    const notes = await win.gKavachaWorkspaces.kavachaGetAllNotes();
    return {
      kind: "space",
      id: space.uuid,
      label: space.name,
      body: notes[space.uuid]?.content || "",
    };
  }

  function queueSave() {
    clearTimeout(saveTimer);
    $("kwr-saved").textContent = "";
    saveTimer = setTimeout(saveNow, kSaveDebounceMs);
  }

  async function saveNow() {
    clearTimeout(saveTimer);
    saveTimer = null;
    if (!target || target.kind === "none") {
      return;
    }
    const body = $("kwr-input").value;
    if (target.kind === "space") {
      await chromeWindow()?.gKavachaWorkspaces?.kavachaSetNote(target.id, body);
    } else {
      await KavachaKnowledge.saveNote({
        url: target.id,
        title: target.label,
        body,
      });
    }
    $("kwr-saved").textContent = "Saved";
  }

  function togglePreview() {
    previewOn = !previewOn;
    const rendered = $("kwr-rendered");
    $("kwr-input").hidden = previewOn;
    rendered.hidden = !previewOn;
    $("kwr-preview").textContent = previewOn ? "Edit" : "Preview";
    if (previewOn) {
      while (rendered.firstChild) {
        rendered.firstChild.remove();
      }
      // KavachaMarkdown builds DOM nodes and never parses HTML — mandatory
      // here, because this is a chrome document rendering the user's text.
      rendered.append(KavachaMarkdown.render($("kwr-input").value, document));
    }
  }

  async function init() {
    target = await resolveTarget();
    $("kwr-target").textContent =
      target.kind === "page"
        ? "Note on " + target.label
        : target.kind === "space"
          ? "Notes — " + target.label
          : target.label;
    const input = $("kwr-input");
    input.value = target.body;
    input.disabled = target.kind === "none";
    $("kwr-count").textContent = counts(input.value);

    input.addEventListener("input", () => {
      $("kwr-count").textContent = counts(input.value);
      queueSave();
    });
    $("kwr-preview").addEventListener("click", togglePreview);
    document.addEventListener("keydown", event => {
      // Escape leaves writing mode the way Reader Mode's shortcut leaves it:
      // the tab goes back to whatever it was showing before.
      if (event.key === "Escape" && window.history.length > 1) {
        window.history.back();
      }
    });
    window.addEventListener(
      "unload",
      () => {
        if (saveTimer) {
          saveNow();
        }
      },
      { once: true }
    );
    input.focus();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
