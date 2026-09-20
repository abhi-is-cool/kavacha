/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Kavacha Spaces — the per-window half of the workspaces model (ADR 0021).
 * Loaded into every browser window by KavachaStartup after kavacha-window.js;
 * exposed as window.gKavachaWorkspaces.
 *
 * Firefox primitives only:
 *   membership  SessionStore custom tab value "kavachaSpaceId" (restart-safe)
 *               mirrored to the tab attribute kavacha-space-id for CSS;
 *   switching   gBrowser.showTab / hideTab(tab, "kavacha"); the target tab is
 *               selected BEFORE the others hide (hideTab refuses the selected
 *               tab); pinned tabs are never hidden, so they are global;
 *   containers  a space's containerId is the userContextId fresh tabs get;
 *   strip       a CustomizableUI widget in the tab strip, rendered here.
 *
 * The public surface is the 21-member facade the Zen-era code called on
 * gZenWorkspaces, kept name-for-name so that code ports by rename. Members
 * whose feature has not been ported yet log and return empty (see
 * #notPorted) rather than throw. */

"use strict";

{
  const { KavachaWorkspaces, KAVACHA_SPACE_TEMPLATES, TOPIC_CHANGED, PREF_ENABLED, PREF_ISOLATE } =
    ChromeUtils.importESModule("resource:///modules/KavachaWorkspaces.sys.mjs");
  const { PrivateBrowsingUtils } = ChromeUtils.importESModule(
    "resource://gre/modules/PrivateBrowsingUtils.sys.mjs"
  );
  const { ContextualIdentityService } = ChromeUtils.importESModule(
    "resource://gre/modules/ContextualIdentityService.sys.mjs"
  );

  const KEY_TAB = "kavachaSpaceId";
  const KEY_ACTIVE = "kavachaActiveSpaceId";
  const ATTR = "kavacha-space-id";
  const HIDDEN_BY = "kavacha";
  const STRIP_ID = "kavacha-spaces-strip";
  const CONTEXT_ID = "kavacha-space-context";

  class KavachaWorkspacesWindow {
    #win;
    #activeId = null;
    #switching = Promise.resolve();
    #lastSelected = new Map();
    #switchListeners = new Set();
    #contextSpaceId = null;
    #initialized = false;
    #observer = null;

    constructor(win) {
      this.#win = win;
    }

    // ------------------------------------------------------------- lifecycle

    async init() {
      if (this.#initialized) {
        return;
      }
      this.#initialized = true;
      await KavachaWorkspaces.init();
      if (this.privateWindowOrDisabled) {
        return;
      }
      const win = this.#win;
      const { gBrowser, SessionStore } = win;
      const spaces = this.#visible();
      const stored = SessionStore.getCustomWindowValue(win, KEY_ACTIVE);
      this.#activeId = spaces.find(s => s.id === stored)?.id ?? spaces[0]?.id ?? null;

      gBrowser.tabContainer.addEventListener("TabOpen", this);
      gBrowser.tabContainer.addEventListener("TabSelect", this);
      gBrowser.tabContainer.addEventListener("TabClose", this);
      gBrowser.tabContainer.addEventListener("SSTabRestoring", this);
      win.addEventListener("SSWindowRestored", this);
      win.addEventListener("unload", this, { once: true });
      this.#observer = () => this.render();
      Services.obs.addObserver(this.#observer, TOPIC_CHANGED);

      for (const tab of gBrowser.tabs) {
        this.#adopt(tab);
      }
      this.#applyVisibility();
      this.render();
    }

    handleEvent(event) {
      switch (event.type) {
        case "TabOpen": {
          // Session restore creates its tabs (TabOpen) BEFORE it applies their
          // saved state, so a restored tab has no custom value yet at this
          // point. Restore applies that state synchronously right after
          // creating the tabs; deferring one task lets the saved space win
          // and only genuinely new tabs get the active space.
          const tab = event.target;
          const active = this.#activeId;
          this.#win.setTimeout(() => {
            if (!tab.closing && tab.isConnected && !this.spaceIdOfTab(tab)) {
              this.#adopt(tab, active);
            }
          }, 0);
          break;
        }
        case "SSTabRestoring": {
          // The saved value is authoritative: resync the attribute from it.
          const tab = event.target;
          const saved = this.#win.SessionStore.getCustomTabValue(tab, KEY_TAB);
          if (saved && this.getWorkspaceFromId(saved)) {
            tab.setAttribute(ATTR, saved);
          } else {
            this.#adopt(tab);
          }
          break;
        }
        case "SSWindowRestored":
          for (const tab of this.#win.gBrowser.tabs) {
            this.#adopt(tab);
          }
          this.#applyVisibility();
          this.render();
          break;
        case "TabSelect": {
          // A hidden tab can still be selected (switch-to-tab from the address
          // bar, session restore): follow it into its space.
          const tab = event.target;
          const sid = this.spaceIdOfTab(tab);
          if (sid && sid !== this.#activeId && !tab.pinned) {
            const ws = this.getWorkspaceFromId(sid);
            if (ws) {
              this.changeWorkspace(ws, { selectTab: tab });
            }
          }
          break;
        }
        case "TabClose":
          for (const [id, t] of this.#lastSelected) {
            if (t === event.target) {
              this.#lastSelected.delete(id);
            }
          }
          break;
        case "unload":
          Services.obs.removeObserver(this.#observer, TOPIC_CHANGED);
          break;
      }
    }

    // ----------------------------------------------------------- membership

    get privateWindowOrDisabled() {
      return (
        PrivateBrowsingUtils.isWindowPrivate(this.#win) ||
        !Services.prefs.getBoolPref(PREF_ENABLED, true)
      );
    }

    spaceIdOfTab(tab) {
      // The SessionStore value is the record; the attribute is a mirror for
      // CSS and can lag it across a restore.
      const saved = this.#win.SessionStore.getCustomTabValue(tab, KEY_TAB);
      if (saved) {
        if (tab.getAttribute(ATTR) !== saved) {
          tab.setAttribute(ATTR, saved);
        }
        return saved;
      }
      return tab.getAttribute(ATTR) || null;
    }

    assignTab(tab, id) {
      this.#win.SessionStore.setCustomTabValue(tab, KEY_TAB, id);
      tab.setAttribute(ATTR, id);
    }

    /** Give a tab a space if it has none (restored value wins over fallback). */
    #adopt(tab, fallbackId = null) {
      const existing = this.spaceIdOfTab(tab);
      if (existing && this.getWorkspaceFromId(existing)) {
        if (!tab.hasAttribute(ATTR)) {
          tab.setAttribute(ATTR, existing);
        }
        return existing;
      }
      const id = fallbackId || this.#activeId || this.#visible()[0]?.id;
      if (id) {
        this.assignTab(tab, id);
      }
      return id;
    }

    tabsInSpace(id) {
      return Array.from(this.#win.gBrowser.tabs).filter(
        t => !t.pinned && !t.closing && this.spaceIdOfTab(t) === id
      );
    }

    #applyVisibility() {
      const { gBrowser } = this.#win;
      for (const tab of gBrowser.tabs) {
        if (tab.pinned || tab.closing) {
          continue;
        }
        const sid = this.spaceIdOfTab(tab) || this.#adopt(tab);
        if (sid === this.#activeId) {
          if (tab.hidden) {
            gBrowser.showTab(tab);
          }
        } else if (!tab.hidden && !tab.selected) {
          gBrowser.hideTab(tab, HIDDEN_BY);
        }
      }
    }

    #visible() {
      return this.getWorkspaces().filter(s => !s.archived);
    }

    #containerFor(ws) {
      return ws?.containerId ? Number(ws.containerId) : 0;
    }

    #openTabInSpace(ws) {
      const { gBrowser } = this.#win;
      const url = this.#win.BROWSER_NEW_TAB_URL || "about:newtab";
      const opts = { skipAnimation: true };
      const ctx = this.#containerFor(ws);
      if (ctx) {
        opts.userContextId = ctx;
      }
      const tab = gBrowser.addTrustedTab(url, opts);
      this.assignTab(tab, ws.id);
      return tab;
    }

    // -------------------------------------------------------------- facade

    get activeWorkspace() {
      return this.#activeId;
    }

    getActiveWorkspaceFromCache() {
      return this.getWorkspaceFromId(this.#activeId);
    }

    getWorkspaces() {
      return KavachaWorkspaces.getWorkspaces();
    }

    getWorkspaceFromId(id) {
      return KavachaWorkspaces.getWorkspaceFromId(id);
    }

    isWorkspaceActive(ws) {
      return !!ws && ws.id === this.#activeId;
    }

    saveWorkspace(ws) {
      KavachaWorkspaces.saveWorkspace(ws);
    }

    get allStoredTabs() {
      return Array.from(this.#win.gBrowser.tabs);
    }

    workspaceElement(id) {
      return this.#win.document.querySelector(
        `#${STRIP_ID} .kavacha-space-button[data-space-id="${id}"]`
      );
    }

    /** Called by features that must run at the switch (search engine, extensions, settings). */
    addSwitchListener(fn) {
      this.#switchListeners.add(fn);
      return () => this.#switchListeners.delete(fn);
    }

    /**
     * Features add their submenus to the space context menu here:
     * builder(popup, spaceId, insertBefore) runs on every popupshowing, after
     * the built-in items and before the Delete section; nodes it appends must
     * carry class "kavacha-space-context-feature" (they are cleared each time).
     */
    addContextMenuBuilder(fn) {
      this.#menuBuilders.add(fn);
      return () => this.#menuBuilders.delete(fn);
    }
    #menuBuilders = new Set();

    /** The space a context-menu action targets (null for the "+" button). */
    get contextSpaceId() {
      return this.#contextSpaceId;
    }

    async createAndSaveWorkspace(name, icon, dontChange = false, containerTabId = 0, extra = {}) {
      const ws = KavachaWorkspaces.createWorkspace({
        name,
        icon,
        containerId: containerTabId || undefined,
      });
      if (typeof extra.beforeChangeCallback === "function") {
        await extra.beforeChangeCallback(ws);
        this.saveWorkspace(ws);
      }
      if (!dontChange) {
        await this.changeWorkspace(ws);
      }
      return ws;
    }

    async createWorkspaceFromTemplate(templateId) {
      const template = KAVACHA_SPACE_TEMPLATES.find(t => t.id === templateId);
      if (!template || this.privateWindowOrDisabled) {
        return null;
      }
      let containerTabId = 0;
      const isolate =
        template.alwaysIsolate || Services.prefs.getBoolPref(PREF_ISOLATE, false);
      if (isolate) {
        try {
          const existing = ContextualIdentityService.getPublicIdentities().find(
            identity => identity.name === template.container.name
          );
          const identity =
            existing ||
            ContextualIdentityService.create(
              template.container.name,
              template.container.icon,
              template.container.color
            );
          containerTabId = identity.userContextId;
        } catch (e) {
          console.error("gKavachaWorkspaces: could not create template container", e);
        }
      }
      return this.createAndSaveWorkspace(template.name, template.icon, false, containerTabId, {
        beforeChangeCallback: async ws => {
          ws.accent = template.accent;
          if (template.searchProvider) {
            ws.searchProvider = template.searchProvider;
          }
          if (template.settings) {
            ws.settings = { ...template.settings };
          }
          ws.template = template.id;
        },
      });
    }

    async openWorkspaceCreation(event) {
      if (this.privateWindowOrDisabled) {
        return null;
      }
      const l10n = this.#win.document.l10n;
      const [title, text] = await l10n.formatValues([
        "kavacha-space-new-title",
        "kavacha-space-new-text",
      ]);
      const value = { value: "" };
      if (!Services.prompt.prompt(this.#win, title, text, value, null, { value: false })) {
        return null;
      }
      const name = value.value.trim();
      if (!name) {
        return null;
      }
      return this.createAndSaveWorkspace(name, "\u{1F5C2}️");
    }

    changeWorkspaceWithID(id) {
      return this.changeWorkspace(this.getWorkspaceFromId(id));
    }

    /** The switch chokepoint. Serialized: a second call waits for the first. */
    changeWorkspace(ws, options = {}) {
      this.#switching = this.#switching
        .then(() => this.#doChange(ws, options))
        .catch(e => console.error("gKavachaWorkspaces: switch failed", e));
      return this.#switching;
    }

    async #doChange(ws, { selectTab = null } = {}) {
      if (!ws || ws.archived || this.privateWindowOrDisabled) {
        return;
      }
      const win = this.#win;
      const { gBrowser, SessionStore } = win;
      const prev = this.#activeId;
      if (prev && gBrowser.selectedTab && !gBrowser.selectedTab.pinned) {
        this.#lastSelected.set(prev, gBrowser.selectedTab);
      }
      this.#activeId = ws.id;
      SessionStore.setCustomWindowValue(win, KEY_ACTIVE, ws.id);

      let target = selectTab;
      if (!target || target.closing) {
        const last = this.#lastSelected.get(ws.id);
        target = last && !last.closing && last.isConnected ? last : null;
      }
      if (!target) {
        target = this.tabsInSpace(ws.id)[0] ?? null;
      }
      if (!target) {
        target = this.#openTabInSpace(ws);
      }
      if (target.hidden) {
        gBrowser.showTab(target);
      }
      gBrowser.selectedTab = target;
      this.#applyVisibility();

      ws.lastActiveAt = new Date().toISOString();
      this.saveWorkspace(ws);
      this.render();
      for (const fn of this.#switchListeners) {
        try {
          const r = fn(ws, prev ? this.getWorkspaceFromId(prev) : null);
          if (r?.then) {
            r.catch(e => console.error("gKavachaWorkspaces: switch listener rejected", e));
          }
        } catch (e) {
          console.error("gKavachaWorkspaces: switch listener threw", e);
        }
      }
      Services.obs.notifyObservers(win, "kavacha-space-changed", ws.id);
    }

    moveTabToWorkspace(tab, id) {
      const { gBrowser } = this.#win;
      if (!tab || !this.getWorkspaceFromId(id)) {
        return;
      }
      this.assignTab(tab, id);
      if (tab.pinned) {
        return;
      }
      if (id === this.#activeId) {
        if (tab.hidden) {
          gBrowser.showTab(tab);
        }
      } else if (!tab.selected) {
        gBrowser.hideTab(tab, HIDDEN_BY);
      } else {
        // Selected tab leaving the active space: select something else first.
        const stay = this.tabsInSpace(this.#activeId).find(t => t !== tab);
        if (stay) {
          gBrowser.selectedTab = stay;
          gBrowser.hideTab(tab, HIDDEN_BY);
        }
      }
    }

    async archiveWorkspace(workspaceId = null) {
      const id = workspaceId || this.#activeId;
      const ws = this.getWorkspaceFromId(id);
      const visible = this.#visible();
      if (!ws || ws.archived || visible.length <= 1) {
        return;
      }
      if (this.isWorkspaceActive(ws)) {
        const next = visible.find(w => w.id !== ws.id);
        await this.changeWorkspace(next);
      }
      ws.archived = true;
      this.saveWorkspace(ws);
      const tabs = this.tabsInSpace(ws.id).filter(t => !t.hasAttribute("pending"));
      if (tabs.length) {
        try {
          await this.#win.gBrowser.explicitUnloadTabs(tabs);
        } catch (e) {
          console.error("gKavachaWorkspaces: unload on archive failed", e);
        }
      }
      this.render();
    }

    async unarchiveWorkspace(workspaceId) {
      const ws = this.getWorkspaceFromId(workspaceId);
      if (!ws?.archived) {
        return;
      }
      delete ws.archived;
      this.saveWorkspace(ws);
      this.render();
      await this.changeWorkspace(ws);
    }

    async deleteWorkspace(workspaceId) {
      const ws = this.getWorkspaceFromId(workspaceId);
      const others = this.getWorkspaces().filter(w => w.id !== workspaceId && !w.archived);
      if (!ws || !others.length) {
        return false;
      }
      // Tabs are never destroyed by a space action: they move to a neighbour.
      const home = others.find(w => w.id === this.#activeId) ?? others[0];
      if (this.isWorkspaceActive(ws)) {
        await this.changeWorkspace(home);
      }
      for (const tab of this.tabsInSpace(ws.id)) {
        this.moveTabToWorkspace(tab, home.id);
      }
      this.#lastSelected.delete(ws.id);
      KavachaWorkspaces.deleteWorkspace(ws.id);
      this.render();
      return true;
    }

    async renameWorkspace(workspaceId, name) {
      const ws = this.getWorkspaceFromId(workspaceId);
      const clean = String(name ?? "").trim().slice(0, 64);
      if (!ws || !clean) {
        return;
      }
      ws.name = clean;
      this.saveWorkspace(ws);
      this.render();
    }

    kavachaBranchDepth(ws) {
      let depth = 0;
      let cur = ws;
      const seen = new Set();
      while (cur?.parentSpaceId && !seen.has(cur.id)) {
        seen.add(cur.id);
        cur = this.getWorkspaceFromId(cur.parentSpaceId);
        depth++;
      }
      return depth;
    }

    // Facade members whose feature lands with its port (M3). Kept so callers
    // resolve; each logs once and returns an empty value.
    #notPorted(name, value = null) {
      if (!this.#warned.has(name)) {
        this.#warned.add(name);
        console.warn(`gKavachaWorkspaces.${name}: not ported yet (port milestone M3)`);
      }
      return value;
    }
    #warned = new Set();
    openWorkspaceNotes() { return this.#notPorted("openWorkspaceNotes"); }
    kavachaGetAllNotes() { return this.#notPorted("kavachaGetAllNotes", []); }
    kavachaSetNote() { return this.#notPorted("kavachaSetNote"); }
    kavachaBranchSpace() { return this.#notPorted("kavachaBranchSpace"); }
    kavachaShowRecommendedExtensions() { return this.#notPorted("kavachaShowRecommendedExtensions"); }
    kavachaOpenSpaceTimeline() { return this.#notPorted("kavachaOpenSpaceTimeline"); }
    kavachaOpenSavedSessions() { return this.#notPorted("kavachaOpenSavedSessions"); }
    kavachaCompareWithParent() { return this.#notPorted("kavachaCompareWithParent"); }

    // ---------------------------------------------------------------- strip

    /** The strip node lives in the tab strip (CustomizableUI widget); (re)fill it. */
    render() {
      const doc = this.#win.document;
      const strip = doc.getElementById(STRIP_ID);
      if (!strip || this.privateWindowOrDisabled) {
        return;
      }
      const frag = doc.createDocumentFragment();
      for (const ws of this.#visible()) {
        const btn = doc.createXULElement("toolbarbutton");
        btn.className = "kavacha-space-button toolbarbutton-1";
        btn.dataset.spaceId = ws.id;
        btn.setAttribute("label", `${ws.icon ? ws.icon + " " : ""}${ws.name}`);
        btn.setAttribute("tooltiptext", ws.description || ws.name);
        if (ws.accent) {
          btn.style.setProperty("--kavacha-space-accent", ws.accent);
        }
        if (ws.id === this.#activeId) {
          btn.setAttribute("active", "true");
        }
        btn.addEventListener("command", () => this.changeWorkspaceWithID(ws.id));
        btn.addEventListener("contextmenu", e => this.#openContextMenu(e, ws.id));
        frag.appendChild(btn);
      }
      const add = doc.createXULElement("toolbarbutton");
      add.className = "kavacha-space-add toolbarbutton-1";
      add.setAttribute("label", "+");
      doc.l10n.setAttributes(add, "kavacha-spaces-new");
      add.addEventListener("command", () => this.openWorkspaceCreation());
      add.addEventListener("contextmenu", e => this.#openContextMenu(e, null));
      frag.appendChild(add);
      strip.replaceChildren(frag);
    }

    #contextMenu() {
      const doc = this.#win.document;
      let popup = doc.getElementById(CONTEXT_ID);
      if (popup) {
        return popup;
      }
      popup = doc.createXULElement("menupopup");
      popup.id = CONTEXT_ID;
      const item = (l10n, cmd, id) => {
        const el = doc.createXULElement("menuitem");
        el.id = id;
        doc.l10n.setAttributes(el, l10n);
        el.addEventListener("command", cmd);
        popup.appendChild(el);
        return el;
      };
      item("kavacha-space-context-new", () => this.openWorkspaceCreation(), "kavacha-space-context-new");
      const tmpl = doc.createXULElement("menu");
      tmpl.id = "kavacha-space-context-templates";
      doc.l10n.setAttributes(tmpl, "kavacha-space-context-templates");
      const tmplPopup = doc.createXULElement("menupopup");
      for (const t of KAVACHA_SPACE_TEMPLATES) {
        const el = doc.createXULElement("menuitem");
        el.setAttribute("label", `${t.icon} ${t.name}`);
        doc.l10n.setAttributes(el, t.l10nId);
        el.addEventListener("command", () => this.createWorkspaceFromTemplate(t.id));
        tmplPopup.appendChild(el);
      }
      tmpl.appendChild(tmplPopup);
      popup.appendChild(tmpl);
      popup.appendChild(doc.createXULElement("menuseparator"));
      item("kavacha-space-context-rename", () => this.#renameFromMenu(), "kavacha-space-context-rename");
      item("kavacha-space-context-archive", () => this.archiveWorkspace(this.#contextSpaceId), "kavacha-space-context-archive");
      const archived = doc.createXULElement("menu");
      archived.id = "kavacha-space-context-archived";
      doc.l10n.setAttributes(archived, "kavacha-space-context-archived");
      const archivedPopup = doc.createXULElement("menupopup");
      archivedPopup.addEventListener("popupshowing", () => {
        archivedPopup.replaceChildren();
        for (const ws of this.getWorkspaces().filter(w => w.archived)) {
          const el = doc.createXULElement("menuitem");
          el.setAttribute("label", `${ws.icon ? ws.icon + " " : ""}${ws.name}`);
          el.addEventListener("command", () => this.unarchiveWorkspace(ws.id));
          archivedPopup.appendChild(el);
        }
      });
      archived.appendChild(archivedPopup);
      popup.appendChild(archived);
      // Feature submenus (search engine, extensions, settings, notes…) are
      // inserted before this separator by the registered builders.
      const featureAnchor = doc.createXULElement("menuseparator");
      featureAnchor.id = "kavacha-space-context-feature-anchor";
      popup.appendChild(featureAnchor);
      item("kavacha-space-context-delete", () => this.deleteWorkspace(this.#contextSpaceId), "kavacha-space-context-delete");
      popup.addEventListener("popupshowing", () => {
        const ws = this.getWorkspaceFromId(this.#contextSpaceId);
        const visible = this.#visible();
        const forSpace = !!ws;
        for (const old of popup.querySelectorAll(".kavacha-space-context-feature")) {
          old.remove();
        }
        if (forSpace) {
          for (const build of this.#menuBuilders) {
            try {
              build(popup, ws.id, featureAnchor);
            } catch (e) {
              console.error("gKavachaWorkspaces: context menu builder threw", e);
            }
          }
        }
        featureAnchor.hidden = !popup.querySelector(".kavacha-space-context-feature");
        for (const id of ["kavacha-space-context-rename", "kavacha-space-context-archive", "kavacha-space-context-delete"]) {
          doc.getElementById(id).hidden = !forSpace;
        }
        doc.getElementById("kavacha-space-context-archive").disabled = visible.length <= 1;
        doc.getElementById("kavacha-space-context-delete").disabled = visible.length <= 1;
        archived.hidden = !this.getWorkspaces().some(w => w.archived);
      });
      (doc.getElementById("mainPopupSet") || doc.documentElement).appendChild(popup);
      return popup;
    }

    #openContextMenu(event, spaceId) {
      event.preventDefault();
      event.stopPropagation();
      this.#contextSpaceId = spaceId;
      this.#contextMenu().openPopupAtScreen(event.screenX, event.screenY, true, event);
    }

    async #renameFromMenu() {
      const ws = this.getWorkspaceFromId(this.#contextSpaceId);
      if (!ws) {
        return;
      }
      const [title, text] = await this.#win.document.l10n.formatValues([
        "kavacha-space-rename-title",
        "kavacha-space-rename-text",
      ]);
      const value = { value: ws.name };
      if (Services.prompt.prompt(this.#win, title, text, value, null, { value: false })) {
        await this.renameWorkspace(ws.id, value.value);
      }
    }
  }

  window.gKavachaWorkspaces = new KavachaWorkspacesWindow(window);
}
