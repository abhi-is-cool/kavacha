/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Kavacha command palette — the surface over KavachaCommandRegistry
 * (ADR 0020 §4c). Replaces Zen's ZenUBGlobalActions binding: a centred
 * <panel> with a text field and a list, grouped by command domain, opened
 * with Ctrl/Cmd+K (Firefox's key_search is displaced — see kavacha-window.js).
 *
 * Commands are { l10nId, command(window) | commandId, icon, domain,
 * isAvailable?(window) }. Labels come from kavacha-commands.ftl. Runtime
 * registrations reach the open palette through the registry's sinks. */

"use strict";

{
  const { KavachaCommandRegistry } = ChromeUtils.importESModule(
    "resource:///modules/KavachaCommandRegistry.sys.mjs"
  );

  const PANEL_ID = "kavacha-palette";
  const KEY_ID = "key_kavachaPalette";
  const MAX_ROWS = 60;

  class KavachaPalette {
    #win;
    #panel = null;
    #input = null;
    #list = null;
    #labels = new Map(); // l10nId -> localized label
    #rows = []; // currently rendered { command, node }
    #selected = -1;
    #dirty = true;
    #initialized = false;

    constructor(win) {
      this.#win = win;
    }

    init() {
      if (this.#initialized) {
        return;
      }
      this.#initialized = true;
      const doc = this.#win.document;
      // Ctrl/Cmd+K opens the palette. Firefox binds that to key_search /
      // key_search2 (focus the search field); Kavacha's registry is the more
      // useful target and the address bar is one Ctrl+L away.
      for (const id of ["key_search", "key_search2"]) {
        doc.getElementById(id)?.setAttribute("disabled", "true");
      }
      const key = doc.createXULElement("key");
      key.id = KEY_ID;
      key.setAttribute("modifiers", "accel");
      key.setAttribute("key", "K");
      key.addEventListener("command", () => this.toggle());
      this.#win.gKavacha.keyset.appendChild(key);
      KavachaCommandRegistry.onRegister(() => {
        this.#dirty = true;
        if (this.isOpen) {
          this.#filter();
        }
      });
      KavachaCommandRegistry.onUnregister(() => {
        this.#dirty = true;
        if (this.isOpen) {
          this.#filter();
        }
      });
    }

    get isOpen() {
      return this.#panel?.state === "open" || this.#panel?.state === "showing";
    }

    toggle() {
      return this.isOpen ? this.close() : this.open();
    }

    close() {
      this.#panel?.hidePopup();
    }

    async open() {
      const win = this.#win;
      const panel = this.#ensurePanel();
      await this.#ensureLabels();
      this.#input.value = "";
      this.#filter();
      // Centre horizontally near the top of the content area.
      const x = win.mozInnerScreenX + win.innerWidth / 2 - 280;
      const y = win.mozInnerScreenY + Math.min(120, win.innerHeight * 0.15);
      panel.openPopupAtScreen(Math.round(x), Math.round(y), false);
    }

    #ensurePanel() {
      if (this.#panel) {
        return this.#panel;
      }
      const doc = this.#win.document;
      const panel = doc.createXULElement("panel");
      panel.id = PANEL_ID;
      panel.setAttribute("type", "arrow");
      panel.setAttribute("noautofocus", "false");
      panel.setAttribute("consumeoutsideclicks", "true");
      panel.setAttribute("level", "top");

      const box = doc.createXULElement("vbox");
      box.className = "kavacha-palette-box";
      const input = doc.createElementNS("http://www.w3.org/1999/xhtml", "input");
      input.className = "kavacha-palette-input";
      input.setAttribute("type", "text");
      doc.l10n.setAttributes(input, "kavacha-palette-input");
      input.addEventListener("input", () => this.#filter());
      input.addEventListener("keydown", e => this.#onKey(e));
      const list = doc.createXULElement("vbox");
      list.className = "kavacha-palette-list";
      list.setAttribute("role", "listbox");
      box.append(input, list);
      panel.appendChild(box);
      panel.addEventListener("popupshown", () => input.focus());
      panel.addEventListener("popuphidden", () => {
        this.#selected = -1;
      });
      (doc.getElementById("mainPopupSet") || doc.documentElement).appendChild(panel);
      this.#panel = panel;
      this.#input = input;
      this.#list = list;
      return panel;
    }

    async #ensureLabels() {
      if (!this.#dirty) {
        return;
      }
      this.#dirty = false;
      const doc = this.#win.document;
      const ids = [];
      for (const c of KavachaCommandRegistry.all()) {
        if (!this.#labels.has(c.l10nId)) {
          ids.push(c.l10nId);
        }
      }
      for (const d of KavachaCommandRegistry.domainOrder) {
        const id = KavachaCommandRegistry.domainLabel(d);
        if (id && !this.#labels.has(id)) {
          ids.push(id);
        }
      }
      if (!ids.length) {
        return;
      }
      let values = [];
      try {
        values = await doc.l10n.formatValues(ids.map(id => ({ id })));
      } catch (e) {
        console.error("KavachaPalette: l10n failed", e);
      }
      ids.forEach((id, i) => this.#labels.set(id, values[i] || id));
    }

    #available(command) {
      try {
        return typeof command.isAvailable !== "function" || !!command.isAvailable(this.#win);
      } catch (e) {
        return false;
      }
    }

    #filter() {
      const doc = this.#win.document;
      const q = (this.#input?.value || "").trim().toLowerCase();
      const terms = q.split(/\s+/).filter(Boolean);
      const commands = KavachaCommandRegistry.all().filter(c => this.#available(c));
      const matches = commands.filter(c => {
        const label = (this.#labels.get(c.l10nId) || c.l10nId).toLowerCase();
        return terms.every(t => label.includes(t));
      });
      const frag = doc.createDocumentFragment();
      this.#rows = [];
      let lastDomain = null;
      for (const c of matches.slice(0, MAX_ROWS)) {
        if (c.domain !== lastDomain) {
          lastDomain = c.domain;
          const h = doc.createXULElement("label");
          h.className = "kavacha-palette-group";
          h.setAttribute("value", this.#labels.get(KavachaCommandRegistry.domainLabel(c.domain)) || c.domain);
          frag.appendChild(h);
        }
        const row = doc.createXULElement("hbox");
        row.className = "kavacha-palette-row";
        row.setAttribute("role", "option");
        row.dataset.l10nId = c.l10nId;
        if (c.icon) {
          const img = doc.createXULElement("image");
          img.className = "kavacha-palette-icon";
          img.setAttribute("src", c.icon);
          row.appendChild(img);
        }
        const label = doc.createXULElement("label");
        label.className = "kavacha-palette-label";
        label.setAttribute("value", this.#labels.get(c.l10nId) || c.l10nId);
        row.appendChild(label);
        row.addEventListener("click", () => this.#run(c));
        const index = this.#rows.length;
        row.addEventListener("mousemove", () => this.#select(index));
        frag.appendChild(row);
        this.#rows.push({ command: c, node: row });
      }
      if (!this.#rows.length) {
        const empty = doc.createXULElement("label");
        empty.className = "kavacha-palette-empty";
        doc.l10n.setAttributes(empty, "kavacha-palette-empty");
        frag.appendChild(empty);
      }
      this.#list.replaceChildren(frag);
      this.#select(this.#rows.length ? 0 : -1);
    }

    #select(index) {
      if (this.#selected >= 0 && this.#rows[this.#selected]) {
        this.#rows[this.#selected].node.removeAttribute("selected");
      }
      this.#selected = index;
      const row = this.#rows[index];
      if (row) {
        row.node.setAttribute("selected", "true");
        row.node.scrollIntoView?.({ block: "nearest" });
      }
    }

    #onKey(event) {
      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          if (this.#rows.length) {
            this.#select((this.#selected + 1) % this.#rows.length);
          }
          break;
        case "ArrowUp":
          event.preventDefault();
          if (this.#rows.length) {
            this.#select((this.#selected - 1 + this.#rows.length) % this.#rows.length);
          }
          break;
        case "Enter": {
          event.preventDefault();
          const row = this.#rows[this.#selected];
          if (row) {
            this.#run(row.command);
          }
          break;
        }
        case "Escape":
          event.preventDefault();
          this.close();
          break;
      }
    }

    #run(command) {
      this.close();
      try {
        if (typeof command.command === "function") {
          const r = command.command(this.#win);
          if (r?.then) {
            r.catch(e => console.error(`KavachaPalette: ${command.l10nId} rejected`, e));
          }
        } else if (command.commandId) {
          this.#win.document.getElementById(command.commandId)?.doCommand();
        }
      } catch (e) {
        console.error(`KavachaPalette: ${command.l10nId} threw`, e);
      }
    }

    /** For probes: the visible rows' l10n ids. */
    get visibleCommandIds() {
      return this.#rows.map(r => r.command.l10nId);
    }
  }

  window.gKavachaPalette = new KavachaPalette(window);
}
