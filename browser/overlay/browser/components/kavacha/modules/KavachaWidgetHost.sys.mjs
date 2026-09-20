// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Kavacha widget host (ROADMAP Phase 3 follow-up: "Widget host — blocks the
// reserved `widget` and `panel` marketplace component types, and blocks
// user-defined dashboards"; ADR 0010).
//
// ADR 0010 reserved `widget` and `panel` in the marketplace taxonomy and
// shipped no installer for either, with the note "there is no sidebar-widget
// or tool-panel host engine yet". This is that engine. It is the missing piece
// three separate follow-ups were waiting on, so it is deliberately the
// smallest thing that genuinely unblocks all three rather than a dashboard
// framework.
//
// WHAT A WIDGET IS: { id, name, render(doc, win) -> Node }. That is the whole
// contract. A widget returns a Node and the host places it; it gets no hook
// into chrome layout, no persistent process, and no way to run at startup.
// Built-ins are declared here; the marketplace registers `widget` components
// through register() with a source, exactly as it already does for commands,
// so an uninstall drops them as a group.
//
// WHERE THEY GO: a dashboard panel, not a docked sidebar column. A docked
// region would have to fight Zen's chrome layout in both tab orientations —
// a large amount of risk for a surface nobody has asked to be permanent. The
// panel is a real, arrangeable dashboard today, and if a docked mode is wanted
// later the widget contract does not have to change for it.
//
// ARRANGEMENT lives in the layout document (kavacha-layout.json ->
// `widgets: ["id", ...]`), because that file already IS "how the user has
// arranged their browser", and it already round-trips with about:studio and
// with the marketplace's `layout` components. An absent list means "the
// built-ins, in their declared order", so an existing profile gets a working
// dashboard without a migration.
//
// Everything the built-in widgets read is data Kavacha already holds locally.
// No widget performs network I/O and the host offers no way to.

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  KavachaLayoutEngine: "resource:///modules/KavachaLayoutEngine.sys.mjs",
  KavachaMarkdown: "resource:///modules/KavachaMarkdown.sys.mjs",
  KavachaSpaceHistory: "resource:///modules/KavachaSpaceHistory.sys.mjs",
});

const kHtmlNS = "http://www.w3.org/1999/xhtml";
const kMaxTimelineRows = 5;

function el(doc, tag, className, text) {
  const node = doc.createElementNS(kHtmlNS, tag);
  if (className) {
    node.className = className;
  }
  if (text != null) {
    node.textContent = text;
  }
  return node;
}

function card(doc, title) {
  const box = el(doc, "section", "kavacha-widget");
  box.appendChild(el(doc, "h2", "kavacha-widget-title", title));
  return box;
}

// ---------------------------------------------------------------- built-ins

const BUILTIN_WIDGETS = [
  {
    id: "spaces",
    name: "Spaces",
    render(doc, win) {
      const box = card(doc, "Spaces");
      const spaces =
        win.gKavachaWorkspaces?.getWorkspaces?.().filter(w => !w.archived) || [];
      if (!spaces.length) {
        box.appendChild(el(doc, "p", "kavacha-widget-empty", "No Spaces yet."));
        return box;
      }
      const list = el(doc, "div", "kavacha-widget-rows");
      for (const space of spaces) {
        const row = el(doc, "button", "kavacha-widget-row");
        row.type = "button";
        row.appendChild(
          el(doc, "span", "kavacha-widget-row-name", space.name || "Space")
        );
        // A branch is marked here for the same reason the strip marks it
        // (patch 0054): a list of names cannot say which came from which.
        if (win.gKavachaWorkspaces.kavachaBranchDepth?.(space)) {
          row.appendChild(el(doc, "span", "kavacha-widget-badge", "branch"));
        }
        if (space.id === win.gKavachaWorkspaces.activeWorkspace) {
          row.setAttribute("aria-current", "true");
        }
        row.addEventListener("click", () => {
          win.gKavachaWorkspaces.changeWorkspaceWithID(space.id);
        });
        list.appendChild(row);
      }
      box.appendChild(list);
      return box;
    },
  },
  {
    id: "space-note",
    name: "This Space's note",
    render(doc, win) {
      const box = card(doc, "Note");
      const body = el(doc, "div", "kavacha-widget-note");
      box.appendChild(body);
      // Notes are async; return the card now and fill it when the read lands,
      // so one slow source cannot hold up the whole dashboard.
      (async () => {
        try {
          const uuid = win.gKavachaWorkspaces?.activeWorkspace;
          const notes = await win.gKavachaWorkspaces?.kavachaGetAllNotes?.();
          const content = uuid ? notes?.[uuid]?.content || "" : "";
          if (!content.trim()) {
            body.appendChild(
              el(doc, "p", "kavacha-widget-empty", "No note in this Space.")
            );
            return;
          }
          // Same renderer as the notes panel (patch 0052): builds nodes, never
          // parses HTML. This is chrome, so that is not a style preference.
          body.appendChild(lazy.KavachaMarkdown.render(content, doc));
        } catch (e) {
          win.console?.error("KavachaWidgetHost: note widget failed", e);
        }
      })();
      return box;
    },
  },
  {
    id: "timeline",
    name: "Recent snapshots",
    render(doc, win) {
      const box = card(doc, "Recent snapshots");
      const body = el(doc, "div", "kavacha-widget-rows");
      box.appendChild(body);
      (async () => {
        try {
          const uuid = win.gKavachaWorkspaces?.activeWorkspace;
          if (!uuid) {
            return;
          }
          const snapshots = await lazy.KavachaSpaceHistory.listSnapshots(uuid);
          if (!snapshots.length) {
            body.appendChild(
              el(doc, "p", "kavacha-widget-empty", "No snapshots yet.")
            );
            return;
          }
          const fmt = new Intl.DateTimeFormat(undefined, {
            dateStyle: "short",
            timeStyle: "short",
          });
          for (const snap of snapshots.slice(0, kMaxTimelineRows)) {
            const row = el(doc, "button", "kavacha-widget-row");
            row.type = "button";
            row.appendChild(
              el(
                doc,
                "span",
                "kavacha-widget-row-name",
                `${fmt.format(new Date(snap.createdAt))} · ${snap.tabCount} tabs`
              )
            );
            row.appendChild(el(doc, "span", "kavacha-widget-badge", "restore"));
            row.addEventListener("click", () => {
              // Restore stays non-destructive here too: it forks a branch
              // (patch 0020), it never overwrites the present.
              KavachaWidgetHost.closeDashboard(win);
              win.gKavachaWorkspaces
                .kavachaBranchSpace(snap.id)
                .catch(e =>
                  win.console?.error("KavachaWidgetHost: restore failed", e)
                );
            });
            body.appendChild(row);
          }
        } catch (e) {
          win.console?.error("KavachaWidgetHost: timeline widget failed", e);
        }
      })();
      return box;
    },
  },
];

// Runtime widgets as { widget, source } so a marketplace component or plugin
// can be revoked as a group — the same shape KavachaCommandRegistry uses.
const _registered = [];

function _validate(widget) {
  if (!widget || typeof widget !== "object") {
    throw new Error("KavachaWidgetHost: widget must be an object");
  }
  if (typeof widget.id !== "string" || !widget.id) {
    throw new Error("KavachaWidgetHost: widget needs an id");
  }
  if (typeof widget.render !== "function") {
    throw new Error(`KavachaWidgetHost: "${widget.id}" needs render(doc, win)`);
  }
}

export const KavachaWidgetHost = {
  _initialized: false,

  init() {
    this._initialized = true;
  },

  /** Every known widget: built-ins first, then runtime registrations. */
  all() {
    return [...BUILTIN_WIDGETS, ..._registered.map(e => e.widget)];
  },

  get(id) {
    return this.all().find(w => w.id === id) || null;
  },

  has(id) {
    return !!this.get(id);
  },

  /**
   * Register a widget at runtime (marketplace `widget` component, plugin).
   * Throws on a malformed widget or a duplicate id. Returns an unregister
   * function.
   */
  register(widget, options = {}) {
    _validate(widget);
    if (this.has(widget.id)) {
      throw new Error(`KavachaWidgetHost: "${widget.id}" is already registered`);
    }
    _registered.push({ widget, source: options.source || "runtime" });
    return () => this.unregister(widget.id);
  },

  unregister(id) {
    const i = _registered.findIndex(e => e.widget.id === id);
    if (i < 0) {
      return false;
    }
    _registered.splice(i, 1);
    return true;
  },

  /** Drop every widget a source registered (component uninstall). */
  unregisterBySource(source) {
    let removed = 0;
    for (const entry of _registered.filter(e => e.source === source)) {
      if (this.unregister(entry.widget.id)) {
        removed++;
      }
    }
    return removed;
  },

  // ----- Arrangement ------------------------------------------------------

  /**
   * The widget ids to show, in order. An absent list (null) means "the
   * built-ins, in their declared order"; an explicit empty list means the
   * dashboard was emptied on purpose and stays empty. Unknown ids are dropped
   * rather than surfaced as an error: a widget can vanish simply because its
   * component was uninstalled, which is not a fault condition.
   */
  async enabledIds() {
    let configured = null;
    try {
      configured = (await lazy.KavachaLayoutEngine.getLayout())?.widgets;
    } catch (e) {
      // Layout unreadable — fall through to the built-in default.
    }
    // null/absent = "never arranged" -> the built-ins. An explicit [] = the
    // user emptied the dashboard and it must STAY empty. The old `!length`
    // test conflated the two, so removing the last widget resurrected every
    // built-in (a dashboard could never be empty) and a panel of unresolved
    // ids silently became the full default set. (patch 0075)
    if (!Array.isArray(configured)) {
      return BUILTIN_WIDGETS.map(w => w.id);
    }
    return configured.filter(id => this.has(id));
  },

  /** Persist a new arrangement through the layout engine. */
  async setEnabledIds(ids) {
    const clean = (Array.isArray(ids) ? ids : []).filter(id => this.has(id));
    await lazy.KavachaLayoutEngine.setLayout({ widgets: clean });
  },

  async toggle(id, on) {
    const ids = await this.enabledIds();
    const has = ids.includes(id);
    if (on && !has) {
      ids.push(id);
    } else if (!on && has) {
      ids.splice(ids.indexOf(id), 1);
    } else {
      return;
    }
    await this.setEnabledIds(ids);
  },

  async move(id, delta) {
    const ids = await this.enabledIds();
    const i = ids.indexOf(id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= ids.length) {
      return;
    }
    ids.splice(j, 0, ids.splice(i, 1)[0]);
    await this.setEnabledIds(ids);
  },

  // ----- The dashboard surface -------------------------------------------

  closeDashboard(win) {
    win.document.getElementById("kavacha-dashboard-panel")?.hidePopup();
  },

  async openDashboard(win) {
    const doc = win.document;
    let panel = doc.getElementById("kavacha-dashboard-panel");
    if (!panel) {
      const popupSet = doc.getElementById("mainPopupSet");
      if (!popupSet) {
        return;
      }
      popupSet.appendChild(
        win.MozXULElement.parseXULToFragment(`
          <panel id="kavacha-dashboard-panel"
            type="arrow"
            orient="vertical"
            role="dialog" />
        `)
      );
      panel = doc.getElementById("kavacha-dashboard-panel");
    }
    await this.renderInto(win, panel);
    const anchor =
      doc.getElementById("kavacha-menu-button") ||
      doc.getElementById("nav-bar") ||
      win.gURLBar.textbox;
    panel.openPopup(anchor, "bottomright topright", 0, 6, false, false);
  },

  /** (Re)build the dashboard's contents. Exposed so edits can refresh it. */
  async renderInto(win, panel) {
    const doc = win.document;
    panel.textContent = "";
    const body = el(doc, "div", "kavacha-dashboard");
    panel.appendChild(body);

    const ids = await this.enabledIds();
    for (const id of ids) {
      const widget = this.get(id);
      if (!widget) {
        continue;
      }
      let node = null;
      try {
        node = widget.render(doc, win);
      } catch (e) {
        // One broken widget — including a marketplace-installed one — must not
        // take the whole dashboard down with it.
        win.console?.error(`KavachaWidgetHost: widget "${id}" failed`, e);
        continue;
      }
      if (!node) {
        continue;
      }
      const slot = el(doc, "div", "kavacha-dashboard-slot");
      slot.setAttribute("data-widget-id", id);
      slot.appendChild(node);
      slot.appendChild(this._slotControls(doc, win, panel, id, ids));
      body.appendChild(slot);
    }

    body.appendChild(this._addRow(doc, win, panel, ids));
  },

  // Per-widget arrangement controls, inline rather than behind an "edit mode":
  // a dashboard nobody can rearrange without first discovering a hidden mode
  // is a dashboard nobody rearranges.
  _slotControls(doc, win, panel, id, ids) {
    const bar = el(doc, "div", "kavacha-dashboard-controls");
    const mk = (label, title, handler, disabled) => {
      const b = el(doc, "button", "kavacha-dashboard-control", label);
      b.type = "button";
      b.title = title;
      if (disabled) {
        b.disabled = true;
      }
      b.addEventListener("click", async () => {
        await handler();
        await this.renderInto(win, panel);
      });
      return b;
    };
    const i = ids.indexOf(id);
    bar.append(
      mk("↑", "Move up", () => this.move(id, -1), i <= 0),
      mk(
        "↓",
        "Move down",
        () => this.move(id, 1),
        i < 0 || i >= ids.length - 1
      ),
      mk("✕", "Remove from dashboard", () => this.toggle(id, false))
    );
    return bar;
  },

  _addRow(doc, win, panel, ids) {
    const missing = this.all().filter(w => !ids.includes(w.id));
    const row = el(doc, "div", "kavacha-dashboard-add");
    if (!missing.length) {
      return row;
    }
    row.appendChild(el(doc, "span", "kavacha-dashboard-add-label", "Add:"));
    for (const widget of missing) {
      const b = el(doc, "button", "kavacha-dashboard-control", widget.name);
      b.type = "button";
      b.addEventListener("click", async () => {
        await this.toggle(widget.id, true);
        await this.renderInto(win, panel);
      });
      row.appendChild(b);
    }
    return row;
  },
};
