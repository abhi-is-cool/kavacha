/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Kavacha saved-session manager and tab-history-tree panel (patch 0086,
 * ADR 0006/0019; ported to the Firefox base per ADR 0020).
 *
 * Both panels lived in Zen's popups.inc; on the Firefox base Kavacha owns no
 * chrome document, so they are built here with the same ids the modules and
 * the Phase 7 probe look for.
 *
 * Saved sessions list every labelled snapshot across every Space, with the two
 * operations a keeper needs: rename and delete. Delete matters more than it
 * looks — retention deliberately exempts labelled snapshots, so without it a
 * saved session is permanent. Restore goes through kavachaBranchSpace, so it
 * stays NON-DESTRUCTIVE (ADR 0006): restoring forks a branch, it never
 * overwrites the present. One mechanism, not two. */

"use strict";

{
  const ws = window.gKavachaWorkspaces;
  const doc = window.document;

  const history = () =>
    ChromeUtils.importESModule("resource:///modules/KavachaSpaceHistory.sys.mjs")
      .KavachaSpaceHistory;

  function panelWith(id, boxClass, parts) {
    let panel = doc.getElementById(id);
    if (panel) {
      return panel;
    }
    panel = doc.createXULElement("panel");
    panel.id = id;
    panel.setAttribute("type", "arrow");
    panel.setAttribute("orient", "vertical");
    const box = doc.createXULElement("vbox");
    box.className = boxClass;
    box.append(...parts(doc));
    panel.appendChild(box);
    (doc.getElementById("mainPopupSet") || doc.documentElement).appendChild(panel);
    return panel;
  }

  /** The tab-history tree panel; KavachaTabHistory.showPanel() fills it. */
  function buildTabTreePanel() {
    return panelWith("kavacha-tabtree-panel", "kavacha-tabtree-box", d => {
      const title = d.createXULElement("label");
      title.id = "kavacha-tabtree-title";
      d.l10n.setAttributes(title, "kavacha-tabtree-title");
      title.style.fontWeight = "600";
      const empty = d.createXULElement("label");
      empty.id = "kavacha-tabtree-empty";
      d.l10n.setAttributes(empty, "kavacha-tabtree-empty");
      empty.hidden = true;
      empty.style.opacity = "0.7";
      const list = d.createXULElement("vbox");
      list.id = "kavacha-tabtree-list";
      return [title, empty, list];
    });
  }

  function buildSessionsPanel() {
    return panelWith("kavacha-sessions-panel", "kavacha-sessions-box", d => {
      const title = d.createXULElement("label");
      title.id = "kavacha-sessions-title";
      d.l10n.setAttributes(title, "kavacha-sessions-title");
      title.style.fontWeight = "600";
      const empty = d.createXULElement("label");
      empty.id = "kavacha-sessions-empty";
      d.l10n.setAttributes(empty, "kavacha-sessions-empty");
      empty.hidden = true;
      empty.style.opacity = "0.7";
      const list = d.createXULElement("vbox");
      list.id = "kavacha-sessions-list";
      return [title, empty, list];
    });
  }

  async function openSavedSessions() {
    if (ws.privateWindowOrDisabled) {
      return;
    }
    const H = history();
    const panel = buildSessionsPanel();
    const sessions = await H.listSavedSessions();
    doc.getElementById("kavacha-sessions-empty").hidden = !!sessions.length;

    const list = doc.getElementById("kavacha-sessions-list");
    list.textContent = "";
    const fmt = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
    const [restoreLabel, renameLabel, deleteLabel, renamePrompt] = await doc.l10n.formatValues([
      { id: "kavacha-timeline-restore" },
      { id: "kavacha-sessions-rename" },
      { id: "kavacha-sessions-delete" },
      { id: "kavacha-sessions-rename-prompt" },
    ]);

    for (const session of sessions) {
      const space = ws.getWorkspaceFromId(session.spaceUuid);
      const row = doc.createXULElement("hbox");
      row.setAttribute("align", "center");
      row.style.gap = "6px";

      const label = doc.createXULElement("label");
      label.setAttribute("flex", "1");
      label.setAttribute("crop", "end");
      label.value = `${session.label} · ${space?.name || "—"} · ${session.tabCount} tabs · ${fmt.format(new Date(session.createdAt))}`;
      row.append(label);

      const restore = doc.createXULElement("button");
      restore.setAttribute("label", restoreLabel);
      restore.addEventListener("command", () => {
        panel.hidePopup();
        ws.kavachaBranchSpace(session.id).catch(e =>
          console.error("kavacha-sessions: restore failed", e)
        );
      });

      const rename = doc.createXULElement("button");
      rename.setAttribute("label", renameLabel);
      rename.addEventListener("command", async () => {
        const value = { value: session.label };
        if (Services.prompt.prompt(window, "Kavacha", renamePrompt, value, null, {}) &&
            value.value.trim()) {
          await H.renameSnapshot(session.id, value.value);
          openSavedSessions();
        }
      });

      const remove = doc.createXULElement("button");
      remove.setAttribute("label", deleteLabel);
      remove.addEventListener("command", async () => {
        // Confirmed, because retention exempts saved sessions: this is the
        // only way one goes away, so it must not be a stray click.
        const [body] = await doc.l10n.formatValues([
          { id: "kavacha-sessions-delete-confirm", args: { name: session.label } },
        ]);
        if (Services.prompt.confirm(window, "Kavacha", body)) {
          await H.deleteSnapshot(session.id);
          openSavedSessions();
        }
      });

      row.append(restore, rename, remove);
      list.append(row);
    }

    const anchor =
      ws.workspaceElement(ws.activeWorkspace) ||
      doc.getElementById("kavacha-spaces-strip") ||
      window.gURLBar?.textbox;
    panel.openPopup(anchor, "after_start", 0, 0, false, false);
  }

  // Both panels exist from window boot: KavachaTabHistory.showPanel() looks
  // its panel up by id and silently does nothing when it is absent.
  buildTabTreePanel();
  buildSessionsPanel();

  if (ws) {
    ws.kavachaOpenSavedSessions = openSavedSessions;
  }
}
