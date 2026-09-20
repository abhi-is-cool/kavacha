/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Kavacha workspace notes panel (patches 0008 / 0012 / 0052, ported — ADR
 * 0020/0021). The textarea is the single source of truth and autosaves; the
 * markdown preview is a sibling shown in its place, never an editable
 * rendering, and is built with KavachaMarkdown (nodes, never innerHTML — this
 * is chrome). Store: KavachaSpaceNotes (process-wide).
 *
 * Fills in three members of the gKavachaWorkspaces facade
 * (openWorkspaceNotes, kavachaGetAllNotes, kavachaSetNote) and adds the
 * "Workspace Notes" item to the space context menu. */

"use strict";

{
  const { KavachaSpaceNotes } = ChromeUtils.importESModule(
    "resource:///modules/KavachaSpaceNotes.sys.mjs"
  );
  const ws = window.gKavachaWorkspaces;
  const PANEL_ID = "kavacha-notes-panel";
  let saveTimer = null;

  function ensurePanel() {
    const doc = window.document;
    let panel = doc.getElementById(PANEL_ID);
    if (panel) {
      return panel;
    }
    panel = doc.createXULElement("panel");
    panel.id = PANEL_ID;
    panel.setAttribute("type", "arrow");
    panel.setAttribute("orient", "vertical");
    const box = doc.createXULElement("vbox");
    box.className = "kavacha-notes-box";
    const head = doc.createXULElement("hbox");
    head.setAttribute("align", "center");
    const title = doc.createXULElement("label");
    title.id = "kavacha-notes-title";
    title.setAttribute("flex", "1");
    title.style.fontWeight = "600";
    const toggle = doc.createXULElement("button");
    toggle.id = "kavacha-notes-preview-toggle";
    toggle.setAttribute("type", "checkbox");
    doc.l10n.setAttributes(toggle, "kavacha-notes-preview");
    toggle.addEventListener("command", () => setPreview(toggle.checked));
    head.append(title, toggle);
    const textarea = doc.createElementNS("http://www.w3.org/1999/xhtml", "textarea");
    textarea.id = "kavacha-notes-textarea";
    textarea.rows = 14;
    doc.l10n.setAttributes(textarea, "kavacha-notes-textarea");
    textarea.addEventListener("input", () => {
      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(flush, 500);
    });
    const preview = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
    preview.id = "kavacha-notes-preview";
    preview.hidden = true;
    box.append(head, textarea, preview);
    panel.appendChild(box);
    panel.addEventListener("popuphidden", () => {
      window.clearTimeout(saveTimer);
      flush();
      // Always reopen in edit mode: the panel is a notes FIELD.
      setPreview(false);
    });
    (doc.getElementById("mainPopupSet") || doc.documentElement).appendChild(panel);
    return panel;
  }

  function flush() {
    const panel = window.document.getElementById(PANEL_ID);
    const id = panel?.getAttribute("data-space-id");
    if (!id) {
      return;
    }
    const content = window.document.getElementById("kavacha-notes-textarea").value;
    KavachaSpaceNotes.set(id, content).catch(e => console.error("kavacha-space-notes: save failed", e));
  }

  function setPreview(on) {
    const doc = window.document;
    const textarea = doc.getElementById("kavacha-notes-textarea");
    const preview = doc.getElementById("kavacha-notes-preview");
    const toggle = doc.getElementById("kavacha-notes-preview-toggle");
    if (!textarea || !preview) {
      return;
    }
    toggle.checked = !!on;
    textarea.hidden = !!on;
    preview.hidden = !on;
    preview.textContent = "";
    if (!on) {
      textarea.focus();
      return;
    }
    doc.l10n
      .formatValue("kavacha-notes-preview-empty")
      .then(label => preview.setAttribute("data-empty-label", label))
      .catch(() => {});
    try {
      const { KavachaMarkdown } = ChromeUtils.importESModule(
        "resource:///modules/KavachaMarkdown.sys.mjs"
      );
      preview.appendChild(KavachaMarkdown.render(textarea.value, doc));
    } catch (e) {
      console.error("kavacha-space-notes: could not render preview", e);
      preview.appendChild(doc.createTextNode(textarea.value));
    }
  }

  async function openWorkspaceNotes(spaceId = null) {
    if (ws.privateWindowOrDisabled) {
      return;
    }
    const workspace = spaceId ? ws.getWorkspaceFromId(spaceId) : ws.getActiveWorkspaceFromCache();
    if (!workspace) {
      return;
    }
    const doc = window.document;
    const panel = ensurePanel();
    doc.l10n.setAttributes(doc.getElementById("kavacha-notes-title"), "kavacha-notes-title", {
      name: workspace.name,
    });
    panel.setAttribute("data-space-id", workspace.id);
    const textarea = doc.getElementById("kavacha-notes-textarea");
    textarea.value = await KavachaSpaceNotes.get(workspace.id);
    const anchor =
      ws.workspaceElement(workspace.id) ||
      doc.getElementById("kavacha-spaces-strip") ||
      window.gURLBar?.textbox;
    panel.openPopup(anchor, "after_start", 0, 0, false, false);
    textarea.focus();
  }

  if (ws) {
    ws.openWorkspaceNotes = openWorkspaceNotes;
    ws.kavachaGetAllNotes = () => KavachaSpaceNotes.getAll();
    ws.kavachaSetNote = (id, content) => KavachaSpaceNotes.set(id, content);
    ws.kavachaSetNotesPreview = setPreview;
    ws.addContextMenuBuilder((popup, spaceId, anchor) => {
      const item = popup.ownerDocument.createXULElement("menuitem");
      item.className = "kavacha-space-context-feature";
      item.id = "kavacha-space-context-notes";
      popup.ownerDocument.l10n.setAttributes(item, "kavacha-workspaces-panel-context-notes");
      item.addEventListener("command", () => openWorkspaceNotes(spaceId));
      popup.insertBefore(item, anchor);
    });
  }
}
