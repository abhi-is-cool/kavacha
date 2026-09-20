// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// about:focus (ROADMAP Phase 7; FEATURES 11) — the block page AND the
// blocklist editor, for the reason stated in KavachaAboutFocus.sys.mjs: the
// moment someone most wants to change a rule is the moment they just hit it.
//
// The page has two faces and picks one from its own URL: with ?url= it was
// reached by being blocked, and leads with that; without, it is the settings
// page. Chrome-privileged, so every string that came from outside — the
// blocked URL, a domain in the list — goes in through textContent.

"use strict";

/* global ChromeUtils, Services, document, window, console */

(() => {
  const { KavachaFocusMode } = ChromeUtils.importESModule(
    "resource:///modules/KavachaFocusMode.sys.mjs"
  );

  const $ = id => document.getElementById(id);
  const clear = node => {
    while (node.firstChild) {
      node.firstChild.remove();
    }
  };

  const params = new URLSearchParams(
    (window.location.search || "").replace(/^\?/, "")
  );
  const blockedUrl = params.get("url") || "";

  function prettyHost(url) {
    try {
      return new URL(url).host.replace(/^www\./, "");
    } catch (e) {
      return url;
    }
  }

  function endsAtText(status) {
    if (!status.active) {
      return "No session running.";
    }
    const end = new Date(status.endsAt);
    return (
      status.minutesLeft +
      (status.minutesLeft === 1 ? " minute left" : " minutes left") +
      " — until " +
      end.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    );
  }

  function render() {
    const status = KavachaFocusMode.status();

    // A blocked page whose session has since ended is just a page: say so
    // rather than showing a wall with nothing behind it.
    const showBlock = !!blockedUrl && status.active;
    $("kf-blocked").hidden = !showBlock;
    $("kf-idle").hidden = showBlock;

    if (showBlock) {
      $("kf-blocked-site").textContent = prettyHost(blockedUrl);
      $("kf-remaining").textContent = endsAtText(status);
    }

    $("kf-state").textContent = status.active
      ? endsAtText(status)
      : "Start a session and the sites below are set aside until it ends.";
    $("kf-end-2").hidden = !status.active;

    renderList();
  }

  async function renderList() {
    const { global: globals, spaces } = await KavachaFocusMode.listBlocked();
    const list = $("kf-list");
    clear(list);

    const rows = [
      ...globals.map(domain => ({ domain, spaceUuid: null })),
      // Per-Space entries are shown with their Space's name so a rule that
      // only makes sense in one project is legible here, where it is edited.
      ...Object.entries(spaces).flatMap(([uuid, domains]) =>
        (domains || []).map(domain => ({ domain, spaceUuid: uuid }))
      ),
    ];

    $("kf-list-empty").hidden = !!rows.length;

    for (const row of rows) {
      const item = document.createElement("div");
      item.className = "kf-item";
      const name = document.createElement("span");
      name.className = "kf-item-name";
      name.textContent = row.domain;
      item.append(name);

      if (row.spaceUuid) {
        const badge = document.createElement("span");
        badge.className = "kf-badge";
        badge.textContent = spaceName(row.spaceUuid);
        item.append(badge);
      }

      const remove = document.createElement("button");
      remove.className = "kf-link kf-danger";
      remove.textContent = "Remove";
      remove.addEventListener("click", async () => {
        await KavachaFocusMode.unblock(row.domain, {
          spaceUuid: row.spaceUuid,
        });
        renderList();
      });
      item.append(remove);
      list.append(item);
    }
  }

  function spaceName(uuid) {
    try {
      const chromeWindow = Services.wm.getMostRecentWindow("navigator:browser");
      return (
        chromeWindow?.gKavachaWorkspaces?.getWorkspaceFromId?.(uuid)?.name || "Space"
      );
    } catch (e) {
      return "Space";
    }
  }

  async function addSite() {
    const value = $("kf-add-input").value.trim();
    if (!value) {
      return;
    }
    const stored = await KavachaFocusMode.block(value);
    $("kf-add-input").value = "";
    if (!stored) {
      $("kf-add-input").placeholder = "That is not a site address";
    }
    renderList();
  }

  function goBack() {
    // The blocked load was cancelled, so there is usually a real previous
    // page. If there is not, the new tab page is the honest destination —
    // better than leaving the block page as the only thing in the tab.
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    try {
      const chromeWindow = Services.wm.getMostRecentWindow("navigator:browser");
      chromeWindow?.BrowserCommands?.home?.();
    } catch (e) {}
  }

  function init() {
    $("kf-back").addEventListener("click", goBack);
    for (const id of ["kf-end", "kf-end-2"]) {
      $(id).addEventListener("click", () => {
        KavachaFocusMode.end();
        render();
      });
    }
    for (const button of document.querySelectorAll(".kf-start")) {
      button.addEventListener("click", () => {
        KavachaFocusMode.start(Number(button.dataset.minutes));
        render();
      });
    }
    $("kf-add").addEventListener("click", addSite);
    $("kf-add-input").addEventListener("keydown", event => {
      if (event.key === "Enter") {
        addSite();
      }
    });

    // The module is a process singleton, but this page can be the first thing
    // to touch it in a session that started before the browser restarted.
    KavachaFocusMode.init().then(render, render);

    // The countdown is the only live thing on the page; a minute is the
    // resolution the copy promises, so a minute is what it costs.
    window.setInterval(render, 60_000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
