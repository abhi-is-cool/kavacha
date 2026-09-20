/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Kavacha research continuity — branching, the time-travel timeline with
 * step-through replay, and branch compare/discard (patches 0019/0020/0054,
 * ADR 0006; ported to the Firefox base per ADR 0020/0021).
 *
 * Restore is deliberately NON-destructive everywhere: a snapshot is restored
 * by forking it as a branch, never by overwriting the present. Compare is
 * read-only and runs against the parent's LIVE tabs, because the branch is an
 * alternative to the parent as it is now. Discard is the one destructive
 * action and confirms, naming the Space; it refuses anything that is not a
 * branch, so it can never become a softer-sounding Delete Space.
 *
 * Panels are built here: under Zen this markup lived in popups.inc, and on
 * the Firefox base Kavacha owns no chrome document. Same ids, same stylesheet. */

"use strict";

{
  const ws = window.gKavachaWorkspaces;
  const doc = window.document;

  const history = () =>
    ChromeUtils.importESModule("resource:///modules/KavachaSpaceHistory.sys.mjs")
      .KavachaSpaceHistory;

  let timelineSnapshots = [];
  let replayIndex = -1;

  function prettyUrl(url) {
    try {
      const u = new URL(url);
      return u.host + (u.pathname === "/" ? "" : u.pathname);
    } catch (e) {
      return url || "";
    }
  }

  function anchorNode(spaceId) {
    return (
      ws.workspaceElement(spaceId) ||
      doc.getElementById("kavacha-spaces-strip") ||
      window.gURLBar?.textbox
    );
  }

  /* ------------------------------------------------------------ timeline */

  function buildTimelinePanel() {
    let panel = doc.getElementById("kavacha-timeline-panel");
    if (panel) {
      return panel;
    }
    panel = doc.createXULElement("panel");
    panel.id = "kavacha-timeline-panel";
    panel.setAttribute("type", "arrow");
    panel.setAttribute("orient", "vertical");
    const box = doc.createXULElement("vbox");
    box.className = "kavacha-timeline-box";
    const title = doc.createXULElement("label");
    title.id = "kavacha-timeline-title";
    title.style.fontWeight = "600";
    const empty = doc.createXULElement("label");
    empty.id = "kavacha-timeline-empty";
    doc.l10n.setAttributes(empty, "kavacha-timeline-empty");
    empty.hidden = true;
    empty.style.opacity = "0.7";
    const list = doc.createXULElement("vbox");
    list.id = "kavacha-timeline-list";
    const replayBtn = doc.createXULElement("button");
    replayBtn.id = "kavacha-timeline-replay";
    doc.l10n.setAttributes(replayBtn, "kavacha-timeline-replay");
    replayBtn.addEventListener("command", () =>
      enterReplay().catch(e => console.error("kavacha-space-research: replay failed", e))
    );

    // Replay view: step counter, tab list, prev/next, restore, back.
    const view = doc.createXULElement("vbox");
    view.id = "kavacha-timeline-replay-view";
    view.hidden = true;
    const step = doc.createXULElement("label");
    step.id = "kavacha-timeline-step";
    step.style.fontWeight = "600";
    const stepTabs = doc.createXULElement("vbox");
    stepTabs.id = "kavacha-timeline-step-tabs";
    const nav = doc.createXULElement("hbox");
    nav.setAttribute("align", "center");
    const prev = doc.createXULElement("button");
    prev.id = "kavacha-timeline-prev";
    doc.l10n.setAttributes(prev, "kavacha-timeline-prev");
    prev.addEventListener("command", () => replayStep(replayIndex + 1));
    const next = doc.createXULElement("button");
    next.id = "kavacha-timeline-next";
    doc.l10n.setAttributes(next, "kavacha-timeline-next");
    next.addEventListener("command", () => replayStep(replayIndex - 1));
    const spacer = doc.createXULElement("spacer");
    spacer.setAttribute("flex", "1");
    const restore = doc.createXULElement("button");
    restore.id = "kavacha-timeline-restore-step";
    doc.l10n.setAttributes(restore, "kavacha-timeline-restore-step");
    restore.addEventListener("command", () =>
      restoreReplayStep().catch(e => console.error("kavacha-space-research: restore failed", e))
    );
    const back = doc.createXULElement("button");
    back.id = "kavacha-timeline-exit-replay";
    doc.l10n.setAttributes(back, "kavacha-timeline-exit-replay");
    back.addEventListener("command", exitReplay);
    nav.append(prev, next, spacer, restore, back);
    view.append(step, stepTabs, nav);

    box.append(title, empty, list, view, replayBtn);
    panel.appendChild(box);
    (doc.getElementById("mainPopupSet") || doc.documentElement).appendChild(panel);
    return panel;
  }

  function exitReplay() {
    replayIndex = -1;
    const view = doc.getElementById("kavacha-timeline-replay-view");
    if (!view) {
      return;
    }
    view.hidden = true;
    doc.getElementById("kavacha-timeline-list").hidden = false;
    // Replay is only offered when there is more than one moment to step
    // between; with a single snapshot the list already IS the replay.
    doc.getElementById("kavacha-timeline-replay").hidden = timelineSnapshots.length < 2;
  }

  async function enterReplay() {
    if (timelineSnapshots.length < 2) {
      return;
    }
    doc.getElementById("kavacha-timeline-list").hidden = true;
    doc.getElementById("kavacha-timeline-replay").hidden = true;
    doc.getElementById("kavacha-timeline-replay-view").hidden = false;
    // Snapshots arrive newest-first; replay starts at the OLDEST so stepping
    // forward runs the way the work actually happened.
    await replayStep(timelineSnapshots.length - 1);
  }

  async function replayStep(index) {
    if (!timelineSnapshots.length) {
      return;
    }
    const clamped = Math.min(Math.max(index, 0), timelineSnapshots.length - 1);
    replayIndex = clamped;
    // Oldest is step 1, so "3 of 7" reads forwards even though the array is
    // newest-first.
    doc.l10n.setAttributes(doc.getElementById("kavacha-timeline-step"), "kavacha-timeline-step", {
      step: timelineSnapshots.length - clamped,
      total: timelineSnapshots.length,
    });
    doc.getElementById("kavacha-timeline-prev").disabled = clamped >= timelineSnapshots.length - 1;
    doc.getElementById("kavacha-timeline-next").disabled = clamped <= 0;
    const list = doc.getElementById("kavacha-timeline-step-tabs");
    list.textContent = "";
    let snapshot = null;
    try {
      snapshot = await history().getSnapshot(timelineSnapshots[clamped].id);
    } catch (e) {
      console.error("kavacha-space-research: could not read snapshot", e);
    }
    if (replayIndex !== clamped) {
      return; // a faster click superseded this step
    }
    for (const tab of snapshot?.payload?.tabs || []) {
      const row = doc.createXULElement("label");
      row.setAttribute("crop", "end");
      row.style.opacity = tab.pinned ? "1" : "0.85";
      if (tab.pinned) {
        row.style.fontWeight = "600";
      }
      row.value = prettyUrl(tab.url);
      row.setAttribute("tooltiptext", tab.url || "");
      list.append(row);
    }
  }

  async function restoreReplayStep() {
    const snapshot = timelineSnapshots[replayIndex];
    if (!snapshot) {
      return;
    }
    doc.getElementById("kavacha-timeline-panel").hidePopup();
    await branchSpace(snapshot.id);
  }

  async function openSpaceTimeline(spaceId = null) {
    if (ws.privateWindowOrDisabled) {
      return;
    }
    const space = spaceId ? ws.getWorkspaceFromId(spaceId) : ws.getActiveWorkspaceFromCache();
    if (!space) {
      return;
    }
    const panel = buildTimelinePanel();
    const snapshots = await history().listSnapshots(space.id);
    timelineSnapshots = snapshots;
    doc.l10n.setAttributes(doc.getElementById("kavacha-timeline-title"), "kavacha-timeline-title", {
      name: space.name,
    });
    doc.getElementById("kavacha-timeline-empty").hidden = !!snapshots.length;

    const list = doc.getElementById("kavacha-timeline-list");
    list.textContent = "";
    const fmt = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
    const restoreLabel = await doc.l10n.formatValue("kavacha-timeline-restore");
    for (const snap of snapshots) {
      const row = doc.createXULElement("hbox");
      row.setAttribute("align", "center");
      row.style.gap = "8px";
      const label = doc.createXULElement("label");
      label.setAttribute("flex", "1");
      label.style.opacity = "0.9";
      label.value = `${fmt.format(new Date(snap.createdAt))} · ${snap.tabCount} tabs · ${snap.reason}`;
      const btn = doc.createXULElement("button");
      btn.setAttribute("label", restoreLabel);
      btn.addEventListener("command", () => {
        panel.hidePopup();
        branchSpace(snap.id).catch(e =>
          console.error("kavacha-space-research: restore failed", e)
        );
      });
      row.append(label, btn);
      list.append(row);
    }
    exitReplay();
    panel.openPopup(anchorNode(space.id), "after_start", 0, 0, false, false);
  }

  /* ----------------------------------------------------------- branching */

  async function branchSpace(snapshotId = null) {
    if (ws.privateWindowOrDisabled) {
      return null;
    }
    const H = history();
    let snapshot = null;
    if (snapshotId == null) {
      const id = ws.activeWorkspace;
      // Snapshot the branch point; dedup returning null means the latest
      // stored snapshot already IS the current state — use it.
      const newId = await H.snapshotSpace(window, id, "branch");
      const snapId = newId ?? (await H.listSnapshots(id))[0]?.id;
      snapshot = snapId != null ? await H.getSnapshot(snapId) : null;
    } else {
      snapshot = await H.getSnapshot(snapshotId);
    }
    if (!snapshot) {
      return null;
    }
    const payload = snapshot.payload;
    const parent = ws.getWorkspaceFromId(snapshot.spaceUuid);
    const branchName = `${payload.spaceName || parent?.name || "Space"} / branch`;
    const space = await ws.createAndSaveWorkspace(
      branchName,
      payload.spaceIcon || parent?.icon,
      false,
      payload.containerId ?? 0,
      {
        beforeChangeCallback: async record => {
          record.parentSpaceId = snapshot.spaceUuid;
          record.branchedFromSnapshotId = snapshot.id;
          record.branchedAt = Date.now();
        },
      }
    );
    if (!space) {
      return null;
    }
    // Rebuild the snapshot's tabs in the branch (now the active space) as
    // LAZY tabs: real URL up front (readable strip, no blank-tab dedup), full
    // captured state seeded through TabStateCache so activation restores
    // scroll/form/history.
    const { TabStateCache } = ChromeUtils.importESModule(
      "resource:///modules/sessionstore/TabStateCache.sys.mjs"
    );
    for (const t of payload.tabs) {
      try {
        const tab = window.gBrowser.addTrustedTab(t.url || "about:blank", {
          createLazyBrowser: true,
          inBackground: true,
        });
        ws.assignTab(tab, space.id);
        // TabStateCache holds per-datum fields (history nested), not
        // getTabState's flat JSON — reshape or activation restores blank.
        const st = JSON.parse(t.state);
        const cached = { history: { entries: st.entries, index: st.index } };
        if (st.scroll) {
          cached.scroll = st.scroll;
        }
        if (st.formdata) {
          cached.formdata = st.formdata;
        }
        if (st.image) {
          cached.image = st.image;
        }
        TabStateCache.update(tab.linkedBrowser.permanentKey, cached);
        ws.moveTabToWorkspace(tab, space.id);
        // Pin AFTER the move: pinning re-parents the tab, and doing it first
        // leaves the move fighting for the same element. (Pinned tabs are
        // global across spaces — ADR 0021 — so this restores the user's
        // working set rather than the branch's membership.)
        if (t.pinned) {
          try {
            window.gBrowser.pinTab(tab);
          } catch (e) {
            console.error("kavacha-space-research: could not re-pin tab", e);
          }
        }
      } catch (e) {
        console.error("kavacha-space-research: tab restore failed", e);
      }
    }
    if (payload.note) {
      await ws.kavachaSetNote(space.id, payload.note);
    }
    ws.render();
    return space;
  }

  /* ------------------------------------------------------------- compare */

  function buildComparePanel() {
    let panel = doc.getElementById("kavacha-compare-panel");
    if (panel) {
      return panel;
    }
    panel = doc.createXULElement("panel");
    panel.id = "kavacha-compare-panel";
    panel.setAttribute("type", "arrow");
    panel.setAttribute("orient", "vertical");
    const box = doc.createXULElement("vbox");
    box.className = "kavacha-compare-box";
    const title = doc.createXULElement("label");
    title.id = "kavacha-compare-title";
    title.style.fontWeight = "600";
    const body = doc.createXULElement("vbox");
    body.id = "kavacha-compare-body";
    const discard = doc.createXULElement("button");
    discard.id = "kavacha-compare-discard";
    doc.l10n.setAttributes(discard, "kavacha-compare-discard");
    discard.addEventListener("command", () => {
      const id = panel.getAttribute("data-space-id");
      panel.hidePopup();
      if (id) {
        discardBranch(id).catch(e =>
          console.error("kavacha-space-research: discard failed", e)
        );
      }
    });
    box.append(title, body, discard);
    panel.appendChild(box);
    (doc.getElementById("mainPopupSet") || doc.documentElement).appendChild(panel);
    return panel;
  }

  function tabUrls(spaceId) {
    const out = new Map();
    for (const tab of window.gBrowser.tabs) {
      if (ws.spaceIdOfTab(tab) !== spaceId || tab.closing) {
        continue;
      }
      const url = tab.linkedBrowser?.currentURI?.spec || "";
      if (!url || url === "about:blank") {
        continue;
      }
      if (!out.has(url)) {
        out.set(url, tab.label || prettyUrl(url));
      }
    }
    return out;
  }

  async function compareWithParent(spaceId = null) {
    if (ws.privateWindowOrDisabled) {
      return;
    }
    const branch = spaceId ? ws.getWorkspaceFromId(spaceId) : ws.getActiveWorkspaceFromCache();
    const parent = branch?.parentSpaceId ? ws.getWorkspaceFromId(branch.parentSpaceId) : null;
    if (!branch || !parent) {
      return;
    }
    const mine = tabUrls(branch.id);
    const theirs = tabUrls(parent.id);
    const onlyMine = [...mine].filter(([url]) => !theirs.has(url));
    const onlyTheirs = [...theirs].filter(([url]) => !mine.has(url));
    const shared = [...mine].filter(([url]) => theirs.has(url));

    const panel = buildComparePanel();
    doc.l10n.setAttributes(doc.getElementById("kavacha-compare-title"), "kavacha-compare-title", {
      branch: branch.name || "",
      parent: parent.name || "",
    });
    panel.setAttribute("data-space-id", branch.id);

    const body = doc.getElementById("kavacha-compare-body");
    body.textContent = "";
    for (const [headerId, entries, args] of [
      ["kavacha-compare-only-branch", onlyMine, { name: branch.name || "" }],
      ["kavacha-compare-only-parent", onlyTheirs, { name: parent.name || "" }],
      ["kavacha-compare-shared", shared, { name: "" }],
    ]) {
      const header = doc.createXULElement("label");
      header.style.fontWeight = "600";
      header.style.opacity = "0.8";
      doc.l10n.setAttributes(header, headerId, { ...args, count: entries.length });
      body.append(header);
      if (!entries.length) {
        const none = doc.createXULElement("label");
        none.style.opacity = "0.6";
        doc.l10n.setAttributes(none, "kavacha-compare-none");
        body.append(none);
        continue;
      }
      for (const [url, title] of entries) {
        const row = doc.createXULElement("label");
        row.setAttribute("crop", "end");
        row.style.opacity = "0.85";
        row.value = title || prettyUrl(url);
        row.setAttribute("tooltiptext", url);
        body.append(row);
      }
    }
    panel.openPopup(anchorNode(branch.id), "after_start", 0, 0, false, false);
  }

  async function discardBranch(spaceId) {
    const branch = ws.getWorkspaceFromId(spaceId);
    // Only a branch may be discarded through this path: a Space with no
    // parent is somebody's actual work and has its own Delete Space item.
    if (!branch?.parentSpaceId) {
      return;
    }
    const [title, accept] = await doc.l10n.formatValues([
      { id: "kavacha-compare-discard-title" },
      { id: "kavacha-compare-discard-accept" },
    ]);
    const body = await doc.l10n.formatValue("kavacha-compare-discard-body", {
      name: branch.name || "",
    });
    const flags =
      Services.prompt.BUTTON_TITLE_IS_STRING * Services.prompt.BUTTON_POS_0 +
      Services.prompt.BUTTON_TITLE_CANCEL * Services.prompt.BUTTON_POS_1;
    if (
      Services.prompt.confirmEx(window, title, body, flags, accept, null, null, null, {}) !== 0
    ) {
      return;
    }
    if (ws.isWorkspaceActive(branch)) {
      const parent = ws.getWorkspaceFromId(branch.parentSpaceId);
      if (parent) {
        await ws.changeWorkspace(parent);
      }
    }
    await ws.deleteWorkspace(branch.id);
  }

  /* -------------------------------------------------------------- wiring */

  if (ws) {
    ws.kavachaBranchSpace = branchSpace;
    ws.kavachaOpenSpaceTimeline = openSpaceTimeline;
    ws.kavachaCompareWithParent = compareWithParent;
    ws.kavachaDiscardBranch = discardBranch;
    ws.kavachaEnterReplay = enterReplay;
    ws.kavachaExitReplay = exitReplay;
    ws.kavachaReplayStep = replayStep;
    Object.defineProperty(ws, "kavachaReplayIndex", { get: () => replayIndex, configurable: true });

    ws.addContextMenuBuilder((popup, spaceId, anchor) => {
      const d = popup.ownerDocument;
      const add = (id, l10nId, fn) => {
        const item = d.createXULElement("menuitem");
        item.className = "kavacha-space-context-feature";
        item.id = id;
        d.l10n.setAttributes(item, l10nId);
        item.addEventListener("command", () =>
          fn().catch(e => console.error(`kavacha-space-research: ${id} failed`, e))
        );
        popup.insertBefore(item, anchor);
        return item;
      };
      add("kavacha-space-context-snapshot", "kavacha-workspaces-panel-context-snapshot", () =>
        history().snapshotSpace(window, spaceId, "manual")
      );
      add("kavacha-space-context-branch", "kavacha-workspaces-panel-context-branch", () =>
        branchSpace()
      );
      add("kavacha-space-context-timeline", "kavacha-workspaces-panel-context-timeline", () =>
        openSpaceTimeline(spaceId)
      );
      // "Compare with Parent" only makes sense for a branch; a Space that is
      // not one has no parent to compare against.
      const space = ws.getWorkspaceFromId(spaceId);
      if (space?.parentSpaceId && ws.getWorkspaceFromId(space.parentSpaceId)) {
        add("kavacha-space-context-compare", "kavacha-workspaces-panel-context-compare", () =>
          compareWithParent(spaceId)
        );
      }
    });
  }
}
