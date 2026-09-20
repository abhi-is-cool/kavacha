// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Kavacha menu button + registry-driven panel (ROADMAP Phase 3 UX;
// discoverability). Until now every Kavacha feature was reachable ONLY through
// the Cmd+K command palette (ZenUBGlobalActions) — nothing surfaced them in the
// chrome, so a user who never learned the shortcut never found them. This adds
// a visible gear button to the top-right toolbar cluster
// (#nav-bar) that opens a panel listing everything.
//
// The panel is GENERATED FROM THE COMMAND REGISTRY (patch 0027), not a
// hand-maintained list, so it never drifts: it iterates
// KavachaCommandDomainOrder and, per domain, emits KavachaCommandRegistry
// .getByDomain(domain). Anything a future feature, the marketplace (patch 0028)
// or a plugin (patch 0029) registers appears here automatically, and anything a
// command's isAvailable() gates out is skipped. It is rebuilt on every
// popupshowing so runtime-registered and availability-gated commands stay live.
//
// The panel also carries a "Settings" row that opens about:preferences — the
// full settings surface — so the button is the single discoverable entry point
// to both Kavacha's features and Firefox/Zen preferences.
//
// Patch 0060 changed the panel's SHAPE, not what it contains. Generating from
// the registry is the right call and stays; rendering the result as one flat
// list was not. At the shipped registry that flat list is 22 command rows plus
// five domain headers plus Settings — ~720px of menu, which is why the CSS had
// to cap it against the viewport and scroll it. A menu you scroll to read is a
// list, not a menu. Nothing was removed; the same commands now arrive in three
// shapes instead of one (see _buildPanel).
//
// A process singleton (init) with per-window UI (setupWindow); KavachaStartup calls
// both per window, mirroring the layout/theme engines (ADR 0008).

import {
  KavachaCommandRegistry,
  KavachaCommandDomain,
  KavachaCommandDomainOrder,
  KavachaCommandDomainLabel,
} from "resource:///modules/KavachaCommandRegistry.sys.mjs";

import { KavachaAppearancePanel } from "resource:///modules/KavachaAppearancePanel.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  PrivateBrowsingUtils: "resource://gre/modules/PrivateBrowsingUtils.sys.mjs",
  // MOZ_SRC_FILES module — moz-src, not resource:///modules (same reader the
  // Privacy Center pane uses). The blocked-today count comes from the same
  // protections.sqlite ledger, so the menu badge and the pane never disagree.
  PrivacyMetricsService:
    "moz-src:///browser/components/protections/PrivacyMetricsService.sys.mjs",
});

// Same Fluent surface the palette uses (ZenUBGlobalActions): a sync-capable
// Localization over the command-palette strings. Built-in command labels and
// the domain headers resolve through it; runtime commands carry a literal
// rawLabel instead (patch 0027).
ChromeUtils.defineLazyGetter(lazy, "l10n", () => {
  return new Localization(["browser/kavacha/kavacha-commands.ftl"], true);
});

const kSettingsIcon = "chrome://global/skin/icons/settings.svg";
// The same icon the Appearance pane uses in the about:preferences nav, so the
// two entry points to appearance look like the same place.
const kAppearanceIcon = "chrome://global/skin/icons/eye.svg";
// The same icon the Privacy Center uses in the about:preferences nav, so its
// menu badge and pane read as one place.
const kPrivacyIcon = "chrome://browser/skin/tracking-protection.svg";

// Patch 0060: below this many commands the whole panel already fits without
// scrolling, and a filter field costs a row to save nothing. Above it the
// field is the fastest path to any command and earns its row.
const kFilterThreshold = 8;

const kHTML = "http://www.w3.org/1999/xhtml";

// Patch 0056: the first-launch coach mark. Patch 0030 added the button
// precisely because "every Kavacha feature was reachable ONLY through Cmd+K"
// — but a gear icon among other toolbar icons is not self-explanatory either,
// and a user who does not press it is in the same position as before.
//
// Shown ONCE, ever, per profile: the pref flips the moment it is shown, not
// when it is dismissed, so a crash between the two cannot resurrect it. No
// default is declared anywhere — the `false` fallback IS the default, which
// means a profile that has never seen it and a profile whose pref file was
// lost behave the same, and the pref can be flipped back by hand to see it
// again.
const kCoachMarkPref = "kavacha.menu.coachmark-shown";
const kCoachMarkDelayMs = 2500;

function _label(id, fallback) {
  try {
    return lazy.l10n.formatValueSync(id) || fallback;
  } catch (e) {
    return fallback;
  }
}

export const KavachaMenu = {
  _initialized: false,

  // Which domain's section is expanded, or null for "all collapsed" — the
  // resting state. Deliberately process-wide rather than per-window: it is a
  // preference about which part of the menu you use, and it would be odd for
  // that to differ between two windows of the same browser. Deliberately NOT a
  // pref either: it is a session convenience, not a setting worth persisting
  // to disk or syncing.
  _openDomain: null,

  /** Process-singleton init. Idempotent; per-window UI is setupWindow(). */
  init() {
    if (this._initialized) {
      return;
    }
    this._initialized = true;
  },

  /**
   * Build this window's UI: the toolbar button, the panel, and the wiring
   * between them. Idempotent per window (guarded on the button id) so a second
   * call — e.g. a re-init — never double-injects.
   */
  setupWindow(win) {
    const doc = win.document;
    if (!doc || doc.getElementById("kavacha-menu-button")) {
      return;
    }
    this._injectPanel(win);
    this._injectButton(win);
    this._maybeShowCoachMark(win);
  },

  /**
   * Point at the menu button once, on the first window of the first launch
   * that has never seen it.
   *
   * Deliberately NOT modal and not a popup that steals focus: it is an
   * explanation, and interrupting someone to explain a button they have not
   * asked about is worse than the button being unexplained. It closes on its
   * own, on any click, and on opening the menu.
   */
  _maybeShowCoachMark(win) {
    if (Services.prefs.getBoolPref(kCoachMarkPref, false)) {
      return;
    }
    if (lazy.PrivateBrowsingUtils.isWindowPrivate(win)) {
      // A private window is not somebody's first launch, and marking the
      // coach mark as shown from one would burn it silently.
      return;
    }
    // The button is injected with a retry loop against a toolbar cluster that
    // is built asynchronously, so anchoring immediately would anchor to
    // nothing. Waiting also means the mark appears after the window has
    // settled rather than during startup jitter.
    win.setTimeout(() => {
      const doc = win.document;
      const button = doc?.getElementById("kavacha-menu-button");
      if (win.closed || !button || !button.isConnected) {
        return;
      }
      // Flip the pref BEFORE showing: if anything below throws, or the browser
      // is killed while the mark is up, the user is not shown it forever.
      Services.prefs.setBoolPref(kCoachMarkPref, true);
      try {
        this._showCoachMark(win, button);
      } catch (e) {
        win.console?.error("KavachaMenu: coach mark failed", e);
      }
    }, kCoachMarkDelayMs);
  },

  _showCoachMark(win, button) {
    const doc = win.document;
    const popupSet = doc.getElementById("mainPopupSet");
    if (!popupSet || doc.getElementById("kavacha-coachmark")) {
      return;
    }
    const frag = win.MozXULElement.parseXULToFragment(`
      <panel id="kavacha-coachmark"
        type="arrow"
        orient="vertical"
        noautofocus="true"
        role="alert" />
    `);
    popupSet.appendChild(frag);
    const panel = doc.getElementById("kavacha-coachmark");

    const box = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
    box.className = "kavacha-coachmark-body";
    const title = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
    title.className = "kavacha-coachmark-title";
    title.textContent = _label("kavacha-coachmark-title", "Everything is here");
    const text = doc.createElementNS("http://www.w3.org/1999/xhtml", "div");
    text.className = "kavacha-coachmark-text";
    text.textContent = _label(
      "kavacha-coachmark-body",
      "Spaces, themes, layout, privacy and the rest of Kavacha live behind this button. Cmd+K opens the same list."
    );
    box.append(title, text);
    panel.appendChild(box);

    panel.addEventListener("popuphidden", () => panel.remove(), { once: true });
    // noautofocus keeps the caret where it is; the mark is an aside, not a
    // step in a flow.
    panel.openPopup(button, "bottomright topright", 0, 6, false, false);
  },

  // Leftmost/most-prominent button in the top-right cluster. The button belongs
  // in the customization-target hbox (falls back to the toolbar itself, then
  // the nav-bar). That cluster is built asynchronously during window setup, so
  // if it isn't in the DOM yet we retry briefly rather than silently give up —
  // that silent give-up was why the button never appeared.
  _injectButton(win, attempt = 0) {
    const doc = win.document;
    if (doc.getElementById("kavacha-menu-button")) {
      return;
    }
    const target =
      doc.getElementById("zen-sidebar-top-buttons-customization-target") ||
      doc.getElementById("nav-bar") ||
      doc.getElementById("nav-bar");
    if (!target) {
      if (attempt < 40) {
        win.setTimeout(() => this._injectButton(win, attempt + 1), 250);
      } else {
        win.console?.warn("KavachaMenu: no toolbar target for the menu button");
      }
      return;
    }
    const frag = win.MozXULElement.parseXULToFragment(`
      <toolbarbutton id="kavacha-menu-button"
        class="toolbarbutton-1 chromeclass-toolbar-additional"
        removable="false"
        skipintoolbarset="true"
        overflows="false" />
    `);
    if (target.id === "nav-bar") {
      target.appendChild(frag);
    } else {
      target.prepend(frag);
    }
    const button = doc.getElementById("kavacha-menu-button");
    const label = _label("kavacha-menu-button", "Menu");
    button.setAttribute("label", label);
    button.setAttribute("tooltiptext", label);
    button.addEventListener("command", () => this._openPanel(win));
  },

  // The panel lives in the window's mainPopupSet. Its content is (re)built on
  // every popupshowing so runtime-registered commands and per-window
  // availability stay live.
  _injectPanel(win) {
    const doc = win.document;
    const popupSet = doc.getElementById("mainPopupSet");
    if (!popupSet) {
      return;
    }
    const frag = win.MozXULElement.parseXULToFragment(`
      <panel id="kavacha-menu-panel"
        type="arrow"
        orient="vertical"
        role="menu"
        aria-label="${_label("kavacha-menu-button", "Menu")}" />
    `);
    popupSet.appendChild(frag);
    const panel = doc.getElementById("kavacha-menu-panel");
    panel.addEventListener("popupshowing", event => {
      if (event.target === panel) {
        this._buildPanel(win, panel);
      }
    });
    // Put the caret in the filter as the panel lands, so the fastest route to
    // any command is to open the menu and type. Wired once, at inject time,
    // rather than per build: _buildPanel replaces the panel's children on
    // every show, and re-adding listeners to the panel itself each time would
    // stack them.
    panel.addEventListener("popupshown", event => {
      if (event.target === panel) {
        panel.querySelector(".kavacha-menu-filter")?.focus();
      }
    });
    panel.addEventListener("keydown", event => this._onKeyDown(panel, event));
  },

  _openPanel(win) {
    const doc = win.document;
    const button = doc.getElementById("kavacha-menu-button");
    const panel = doc.getElementById("kavacha-menu-panel");
    if (button && panel) {
      panel.openPopup(button, "bottomright topright", 0, 0, false, false);
    }
  },

  // Clear + rebuild the panel from the live registry every show, so
  // runtime-registered commands and per-window availability stay live.
  //
  // The same commands, three shapes (patch 0060):
  //
  //   * Settings stays pinned at the top. It is what the button looks like it
  //     does, so it must not be something you expand a section to find.
  //   * Each domain collapses to ONE row carrying its command count. Opening a
  //     section closes the previous one, so the panel is never taller than its
  //     largest single domain and the resting state is seven rows instead of
  //     twenty-eight.
  //   * A filter searches every domain at once. For anyone who knows what they
  //     want this beats both the old flat list and the accordion, and it is
  //     what makes collapsing by default cheap rather than annoying.
  //
  // The accordion and the filter are the SAME nodes, not two renderings of the
  // registry: filtering expands every section and hides the rows that miss,
  // rather than building a second flat list. One node set means a row cannot
  // be stale in one view and current in the other, and it keeps a match's
  // domain visible instead of dropping the grouping the moment you type.
  _buildPanel(win, panel) {
    const doc = win.document;
    while (panel.firstChild) {
      panel.firstChild.remove();
    }

    // Resolve the registry ONCE. isAvailable() is evaluated here and nowhere
    // else below, so a command can never be counted in a section header and
    // then be missing from the section.
    const sections = [];
    let total = 0;
    for (const domain of KavachaCommandDomainOrder) {
      // Appearance is not a section any more (patch 0063). Its nine rows were
      // the longest in the menu and the least self-explanatory -- "Cycle
      // Interface Density" is a verb where the user wants a choice, and none of
      // them showed a colour. They live in the Appearance panel now, which
      // renders the same registry domain plus the controls a list cannot be:
      // theme swatches, an accent palette and segmented layout pickers.
      if (domain === KavachaCommandDomain.APPEARANCE) {
        continue;
      }
      const commands = KavachaCommandRegistry.getByDomain(domain).filter(
        cmd => !cmd.isAvailable || cmd.isAvailable(win)
      );
      if (!commands.length) {
        continue;
      }
      const labelId = KavachaCommandDomainLabel[domain];
      sections.push({
        domain,
        label: labelId ? _label(labelId, domain) : domain,
        commands,
        rows: [],
      });
      total += commands.length;
    }

    // The filter is a child of the PANEL, not of the scrollbox below it, so it
    // stays put while the results scroll under it.
    const filter =
      total > kFilterThreshold ? this._makeFilter(win, panel) : null;

    // Rows go inside a scrolling div, not straight into the panel. A XUL panel
    // lays its children out as a box, so a max-height on the panel COMPRESSES
    // the rows instead of overflowing them -- measured: content clamped to
    // 692px with scrollHeight == clientHeight, i.e. nothing to scroll and the
    // tail unreachable. The cap belongs on a scrolling block instead.
    const body = doc.createElementNS(kHTML, "div");
    body.className = "kavacha-menu-scrollbox";
    panel.appendChild(body);

    // The two pinned rows, above the collapsed sections. Both are destinations
    // rather than actions, which is why neither is behind a disclosure: the
    // gear looks like it opens settings, and appearance is the thing people
    // come to a gear menu to change.
    const pinned = [];
    const pin = ({ l10nId, fallback, icon, onCommand }) => {
      const label = _label(l10nId, fallback);
      const item = this._makeItem(win, { label, icon, onCommand });
      item.classList.add("kavacha-menu-pinned");
      body.appendChild(item);
      const entry = { item, search: label.toLowerCase() };
      pinned.push(entry);
      return entry;
    };

    pin({
      l10nId: "kavacha-menu-settings",
      fallback: "Settings",
      icon: kSettingsIcon,
      onCommand: () => {
        panel.hidePopup();
        win.openPreferences();
      },
    });

    // Patch 0063. Replaces the generated Appearance section skipped above.
    pin({
      l10nId: "kavacha-menu-appearance",
      fallback: "Appearance",
      icon: kAppearanceIcon,
      onCommand: () => {
        // Hide first, then open: the panel anchors to the same button, and two
        // arrow panels on one anchor is the dashboard's shipped behaviour too.
        panel.hidePopup();
        KavachaAppearancePanel.open(win);
      },
    });

    // Blocked-today badge (patch 0077): today's blocked-tracker count as a
    // pinned destination into the Privacy Center — the count was in the pane
    // but nowhere on a chrome surface. Private windows have no ledger to read.
    if (!lazy.PrivateBrowsingUtils.isWindowPrivate(win)) {
      const blocked = pin({
        l10nId: "kavacha-menu-blocked-loading",
        fallback: "Trackers blocked today",
        icon: kPrivacyIcon,
        onCommand: () => {
          panel.hidePopup();
          win.openPreferences("paneKavachaPrivacy");
        },
      });
      // The count is async; the row already shows a static label and its own
      // count fills in when the ledger resolves. The panel rebuilds on each
      // open, so the number is always today's. A dead build guards against a
      // late resolve after the panel closed.
      lazy.PrivacyMetricsService.getTodayStats()
        .then(stats => {
          if (!blocked.item.isConnected) {
            return;
          }
          let text;
          try {
            text = lazy.l10n.formatValueSync("kavacha-menu-blocked-today", {
              count: stats.total,
            });
          } catch (e) {
            return; // keep the static loading label
          }
          if (text) {
            blocked.item.setAttribute("label", text);
            blocked.search = text.toLowerCase();
          }
        })
        .catch(() => {});
    }

    // Generated sections: one per non-empty domain, in the registry's declared
    // order. Every Kavacha feature (plus marketplace/plugin runtime commands)
    // reaches the panel here — nothing is hand-listed.
    for (const section of sections) {
      section.header = this._makeSectionHeader(win, section);
      body.appendChild(section.header);

      section.body = doc.createElementNS(kHTML, "div");
      section.body.className = "kavacha-menu-section-body";
      section.body.hidden = true;
      body.appendChild(section.body);

      for (const cmd of section.commands) {
        const label = cmd.rawLabel ?? _label(cmd.l10nId, cmd.l10nId);
        const row = this._makeItem(win, {
          label,
          icon: cmd.icon,
          onCommand: () => {
            panel.hidePopup();
            this._invoke(win, cmd);
          },
        });
        row.setAttribute("data-kavacha-search", label.toLowerCase());
        section.rows.push(row);
        section.body.appendChild(row);
      }
    }

    const empty = doc.createElementNS(kHTML, "div");
    empty.className = "kavacha-menu-empty";
    empty.textContent = _label("kavacha-menu-no-results", "No matches");
    empty.hidden = true;
    body.appendChild(empty);

    // The single place that decides what is visible, for both modes. Called on
    // every keystroke and every section toggle; there is no other writer of
    // `hidden` on these nodes.
    const refresh = () => {
      const query = (filter?.value ?? "").trim().toLowerCase();
      const searching = !!query;
      let hits = 0;

      // The pinned rows are searchable too — typing "settings" or "appearance"
      // must not be the one query that finds nothing just because the row sits
      // above the sections.
      for (const { item, search } of pinned) {
        const hit = !searching || search.includes(query);
        item.hidden = !hit;
        hits += hit ? 1 : 0;
      }

      for (const section of sections) {
        let shown = 0;
        for (const row of section.rows) {
          const hit =
            !searching ||
            row.getAttribute("data-kavacha-search").includes(query);
          row.hidden = !hit;
          shown += hit ? 1 : 0;
        }
        // Searching opens every section that has a match and hides the rest
        // outright; not searching, the accordion decides.
        const open = searching
          ? shown > 0
          : this._openDomain === section.domain;
        section.header.hidden = searching && !shown;
        section.header.setAttribute("aria-expanded", open ? "true" : "false");
        section.body.hidden = !open;
        // While searching the count means "matches here", which is the more
        // useful number and the reason it is recomputed rather than static.
        section.count.textContent = String(
          searching ? shown : section.rows.length
        );
        hits += shown;
      }

      empty.hidden = hits > 0;
    };

    for (const section of sections) {
      section.header.addEventListener("click", () => {
        // Clicking the open section closes it, so "all collapsed" stays
        // reachable without hunting for a close affordance.
        this._openDomain =
          this._openDomain === section.domain ? null : section.domain;
        refresh();
      });
    }
    filter?.addEventListener("input", refresh);

    refresh();
  },

  // The filter field. Its placeholder is also its accessible name: the field
  // is the only control of its kind in the panel, and a visible label above it
  // would spend a row to say what the placeholder already says.
  _makeFilter(win, panel) {
    const doc = win.document;
    const wrap = doc.createElementNS(kHTML, "div");
    wrap.className = "kavacha-menu-search";
    const input = doc.createElementNS(kHTML, "input");
    const placeholder = _label("kavacha-menu-filter-placeholder", "Search");
    input.className = "kavacha-menu-filter";
    input.setAttribute("type", "text");
    input.setAttribute("placeholder", placeholder);
    input.setAttribute("aria-label", placeholder);
    wrap.appendChild(input);
    panel.appendChild(wrap);
    return input;
  },

  // A section header is an html:button, not a XUL toolbarbutton like the rows
  // it heads: it carries three pieces of content (chevron, label, count) and
  // MozToolbarbutton owns its anonymous children, so appending a third one to
  // it is not ours to do. A button also gets focus and Enter/Space for free.
  _makeSectionHeader(win, section) {
    const doc = win.document;
    const header = doc.createElementNS(kHTML, "button");
    header.className = "kavacha-menu-section";
    header.setAttribute("type", "button");
    header.setAttribute("aria-expanded", "false");

    const chevron = doc.createElementNS(kHTML, "span");
    chevron.className = "kavacha-menu-chevron";
    chevron.setAttribute("aria-hidden", "true");

    const label = doc.createElementNS(kHTML, "span");
    label.className = "kavacha-menu-section-label";
    label.textContent = section.label;

    const count = doc.createElementNS(kHTML, "span");
    count.className = "kavacha-menu-count";
    count.textContent = String(section.commands.length);

    header.append(chevron, label, count);
    section.count = count;
    return header;
  },

  _makeItem(win, { label, icon, onCommand }) {
    const item = win.document.createXULElement("toolbarbutton");
    item.className = "kavacha-menu-item subviewbutton";
    item.setAttribute("label", label ?? "");
    // Focusable so the arrow keys in _onKeyDown have somewhere to land. The
    // rows live in an HTML container rather than a <menupopup>, so none of a
    // menu's keyboard behaviour arrives on its own.
    item.setAttribute("tabindex", "0");
    if (icon) {
      item.setAttribute("image", icon);
    }
    item.addEventListener("command", onCommand);
    // Keyboard activation calls this directly instead of synthesising a click:
    // whether XULElement.click() reaches a `command` listener is exactly the
    // kind of thing that is true until it is not.
    item._kavachaActivate = onCommand;
    return item;
  },

  // Arrow keys walk the visible rows, Enter in the filter takes the first one,
  // and Escape clears a non-empty filter before it closes the panel — one
  // Escape to undo the typing, a second to leave.
  _onKeyDown(panel, event) {
    const filter = panel.querySelector(".kavacha-menu-filter");
    const target = event.target;

    if (event.key === "Escape" && filter?.value) {
      filter.value = "";
      filter.dispatchEvent(new panel.ownerGlobal.Event("input"));
      filter.focus();
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    const rows = this._navigableRows(panel);

    if (event.key === "Enter" && target === filter) {
      this._activate(rows[0]);
      event.preventDefault();
      return;
    }

    if (
      (event.key === "Enter" || event.key === " ") &&
      target?.classList?.contains("kavacha-menu-item")
    ) {
      this._activate(target);
      event.preventDefault();
      return;
    }

    const down = event.key === "ArrowDown";
    if ((!down && event.key !== "ArrowUp") || !rows.length) {
      return;
    }
    let next;
    if (target === filter) {
      next = down ? rows[0] : rows[rows.length - 1];
    } else {
      const i = rows.indexOf(target);
      if (i === -1) {
        next = rows[0];
      } else if (!down && i === 0 && filter) {
        // Back up out of the list and into the filter rather than wrapping
        // past it — the field is where the text is, so that is where "up from
        // the top" should go.
        next = filter;
      } else {
        next = rows[(i + (down ? 1 : -1) + rows.length) % rows.length];
      }
    }
    next?.focus();
    event.preventDefault();
  },

  // Section headers and command rows, in DOM order, minus anything hidden
  // itself or sitting inside a collapsed/filtered-out container.
  _navigableRows(panel) {
    return Array.from(
      panel.querySelectorAll(".kavacha-menu-section, .kavacha-menu-item")
    ).filter(el => !el.hidden && !el.parentElement?.closest("[hidden]"));
  },

  _activate(node) {
    if (!node) {
      return;
    }
    if (typeof node._kavachaActivate === "function") {
      node._kavachaActivate();
    } else {
      node.click();
    }
  },

  // A registry command's action is polymorphic (patch 0027): a function
  // command(window), or a string command/commandId naming a <command> node to
  // doCommand(). Handle both, and never let one command's failure break the
  // panel.
  _invoke(win, cmd) {
    try {
      if (typeof cmd.command === "function") {
        cmd.command(win);
      } else if (typeof cmd.command === "string") {
        win.document.getElementById(cmd.command)?.doCommand();
      } else if (typeof cmd.commandId === "string") {
        win.document.getElementById(cmd.commandId)?.doCommand();
      }
    } catch (e) {
      console.error("KavachaMenu: command failed", cmd?.l10nId, e);
    }
  },
};
