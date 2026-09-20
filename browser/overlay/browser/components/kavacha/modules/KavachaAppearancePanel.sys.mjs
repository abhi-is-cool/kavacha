// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// The Appearance panel (patch 0063) — one home for how Kavacha looks.
//
// WHY. Appearance was spread across five places and none of them was the
// obvious one: nine command rows in the ⚙ menu's generated Appearance section,
// a theme dropdown and accent picker in about:preferences#paneKavachaAppearance,
// layout controls in a DIFFERENT preferences pane, the Studio at about:studio,
// and Zen's own Look and Feel pane. Worse, the ⚙ menu showed no colour at all:
// the accent — the control people look for first — was two clicks deep in
// Settings, and the theme list was names with nothing to look at. You could not
// see a theme before choosing it.
//
// So this panel gathers the lot, and shows the colours:
//
//   * Dark / Light / Auto, which Kavacha had no control for at all. Light and
//     dark used to be a side effect of which theme you happened to pick, while
//     Zen's own `zen.view.window.scheme` pref pointed somewhere else entirely
//     (patch 0061 made the theme authoritative; this is where you steer it).
//   * Theme cards painted from each theme's OWN tokens, so the palette is
//     visible before you commit — and badged when patch 0061's contrast check
//     says the theme cannot be read.
//   * The accent palette, inline. Same eight swatches as the welcome flow,
//     which now share one exported constant instead of two literal arrays.
//   * Tab style, density and sidebar, over KavachaLayoutEngine.
//   * Everything else the registry has in the Appearance domain, still
//     GENERATED — so a marketplace component or a plugin that registers an
//     appearance command still appears here without anyone editing this file.
//
// SHAPE. A sibling <panel> in mainPopupSet anchored to #kavacha-menu-button,
// which is the shipped Kavacha idiom (KavachaWidgetHost.openDashboard). Not a
// panelmultiview subview: no Kavacha panel uses one, and hide-then-open is what
// the menu already does for the dashboard.

import {
  KavachaCommandRegistry,
  KavachaCommandDomain,
} from "resource:///modules/KavachaCommandRegistry.sys.mjs";

import {
  KavachaThemeEngine,
  KAVACHA_ACCENT_SWATCHES,
} from "resource:///modules/KavachaThemeEngine.sys.mjs";

import { KavachaLayoutEngine } from "resource:///modules/KavachaLayoutEngine.sys.mjs";

const kHTML = "http://www.w3.org/1999/xhtml";
const kPanelId = "kavacha-appearance-panel";
const kAnchorId = "kavacha-menu-button";
const kAccentPref = "kavacha.theme.accent";

// Inputs to the measured height cap in open(). The cap applies to the SCROLLING
// BODY, so the panel's own padding and border have to come out of the budget
// too -- leaving them in is how a cap that looks right still overhangs by
// exactly the chrome you forgot (see the panel padding in kavacha-menu.inc.css).
const kAnchorGap = 6; // panel offset below the button
// Clearance kept above the window bottom. 12 rather than something rounder
// because it is the difference between the shipped three-theme panel fitting a
// 758px window and scrolling it: measured, that panel's body is 595px and the
// budget at 12px of margin is 603px. Bigger margins look tidier on paper and
// cost a scrollbar on a laptop.
const kBottomMargin = 12;
// The panel's own furniture around the scrolling body: 10px padding each side,
// the border, and the arrow box. MEASURED 2026-08-03 at 54px (panel 666px
// around a 612px body); 56 rounds it up. This is a seed, not a promise — see
// the popupshown correction in _ensurePanel, which fixes it if it is ever wrong.
const kPanelChrome = 56;

const lazy = {};

// Same Fluent bundle the menu and the palette use.
ChromeUtils.defineLazyGetter(lazy, "l10n", () => {
  return new Localization(["browser/kavacha/kavacha-commands.ftl"], true);
});

function _label(id, fallback) {
  try {
    return lazy.l10n.formatValueSync(id) || fallback;
  } catch (e) {
    return fallback;
  }
}

// The swatch bands on a theme card, in the order they read as a palette:
// the page, the raised surface, the selected tab, the accent, the text.
// Deliberately five rather than the whole eighteen — a card is a preview, and
// eighteen 4px bands is a barcode, not a palette.
const kSwatchTokens = [
  "surface",
  "surfaceElevated",
  "tabActiveBackground",
  "accent",
  "textPrimary",
];

// Mirrors KavachaLayoutEngine's kTabStyles / kDensities / kSidebars. Not
// imported because the engine does not export them; if it grows a value, this
// list and the engine's must both learn it.
const kLayoutControls = [
  {
    key: "tabStyle",
    labelId: "kavacha-appearance-layout-tabs",
    fallback: "Tabs",
    values: [
      ["horizontal", "kavacha-appearance-tabs-horizontal", "Horizontal"],
      ["vertical", "kavacha-appearance-tabs-vertical", "Vertical"],
      // Arc was reachable ONLY from about:studio: the palette's tab-layout
      // command toggled two ways and the Customization pane listed two options,
      // so anyone on Arc who touched either was silently dropped to vertical.
      ["arc", "kavacha-appearance-tabs-arc", "Arc"],
    ],
  },
  {
    key: "density",
    labelId: "kavacha-appearance-layout-density",
    fallback: "Density",
    values: [
      ["compact", "kavacha-appearance-density-compact", "Compact"],
      ["normal", "kavacha-appearance-density-normal", "Normal"],
      ["comfortable", "kavacha-appearance-density-comfortable", "Comfortable"],
    ],
  },
  {
    key: "sidebar",
    labelId: "kavacha-appearance-layout-sidebar",
    fallback: "Sidebar",
    values: [
      ["left", "kavacha-appearance-sidebar-left", "Left"],
      ["right", "kavacha-appearance-sidebar-right", "Right"],
      ["hidden", "kavacha-appearance-sidebar-hidden", "Hidden"],
    ],
  },
];

// Registry commands this panel replaces with a real control. They stay
// registered — the command palette still offers them, and they are still how a
// keyboard shortcut reaches these settings — but listing them again under
// "More" beneath the segmented control that does the same thing better would
// be exactly the clutter this panel exists to remove.
const kSupersededCommands = new Set([
  "kavacha-action-toggle-tab-layout",
  "kavacha-action-cycle-sidebar",
  "kavacha-action-cycle-density",
  "kavacha-action-switch-theme",
]);

export const KavachaAppearancePanel = {
  // Bumped on every build, so an async fill that resolves after the panel was
  // closed and reopened cannot write into the new DOM.
  _generation: 0,

  /** Open (building fresh) against this window's menu button. */
  open(win) {
    const panel = this._ensurePanel(win);
    const anchor = win.document.getElementById(kAnchorId);
    if (!panel || !anchor) {
      return;
    }

    // Cap the scrolling body against the space actually below the anchor,
    // measured, rather than against `100vh`.
    //
    // MEASURED 2026-08-03: inside a XUL popup `100vh` resolves to 808px in a
    // 758px window -- the popup's viewport is not the browser window's. The
    // menu's `calc(100vh - 10rem)` therefore yields 648px where it means ~598,
    // which is exactly the class of drift patch 0060's D1 note warns about
    // ("re-measure the ANCHOR rather than the overhang"). The anchor is the
    // input, so take it directly: this is correct at any window size, on any
    // display, and cannot rot when the toolbar moves.
    const rect = anchor.getBoundingClientRect();
    const available = Math.max(
      240,
      Math.round(
        win.innerHeight -
          rect.bottom -
          kAnchorGap -
          kBottomMargin -
          kPanelChrome
      )
    );
    panel.style.setProperty("--kavacha-appearance-max", `${available}px`);

    panel.openPopup(anchor, "bottomright topright", 0, kAnchorGap, false, false);
  },

  _ensurePanel(win) {
    const doc = win.document;
    let panel = doc.getElementById(kPanelId);
    if (panel) {
      return panel;
    }
    const popupSet = doc.getElementById("mainPopupSet");
    if (!popupSet) {
      return null;
    }
    const frag = win.MozXULElement.parseXULToFragment(`
      <panel id="${kPanelId}"
        type="arrow"
        orient="vertical"
        role="dialog"
        aria-label="${_label("kavacha-appearance-panel-title", "Appearance")}" />
    `);
    popupSet.appendChild(frag);
    panel = doc.getElementById(kPanelId);
    // Rebuilt on every show: themes, layout and accent are all live state that
    // the Studio, Settings or a command may have changed since last time.
    panel.addEventListener("popupshowing", event => {
      if (event.target === panel) {
        this._build(win, panel);
      }
    });
    // Self-correcting cap. open() budgets the body against the space below the
    // anchor minus kPanelChrome, but that constant is a measurement of the
    // panel's arrow, border and padding, and a measurement can go stale — a
    // theme with a taller arrow, a different platform, a future restyle. Once
    // the panel is actually laid out its overhang is knowable exactly, so if
    // there is any, take it straight off the cap. Runs at most once per open
    // and is a no-op in the common case where the panel already fits.
    panel.addEventListener("popupshown", event => {
      if (event.target !== panel) {
        return;
      }
      const overhang =
        panel.getBoundingClientRect().bottom - (win.innerHeight - kBottomMargin);
      if (overhang <= 0) {
        return;
      }
      const body = panel.querySelector(".kavacha-appearance-body");
      if (!body) {
        return;
      }
      const cap = Math.max(240, body.getBoundingClientRect().height - overhang);
      panel.style.setProperty("--kavacha-appearance-max", `${Math.round(cap)}px`);
    });
    return panel;
  },

  // --------------------------------------------------------------------------

  _build(win, panel) {
    const doc = win.document;
    const generation = ++this._generation;
    while (panel.firstChild) {
      panel.firstChild.remove();
    }

    const body = doc.createElementNS(kHTML, "div");
    body.className = "kavacha-appearance-body";
    panel.appendChild(body);

    // Everything below is built synchronously so the panel has its final size
    // before it is shown; the parts that need disk (theme names, the layout
    // document) fill in afterwards behind the generation guard. A panel that
    // resizes after opening is worse than one that fills in.
    body.appendChild(this._buildMode(win));
    body.appendChild(
      this._section(doc, "kavacha-appearance-theme-heading", "Theme")
    );
    const themes = doc.createElementNS(kHTML, "div");
    themes.className = "kavacha-appearance-themes";
    body.appendChild(themes);

    body.appendChild(
      this._section(doc, "kavacha-appearance-accent-heading", "Accent")
    );
    body.appendChild(this._buildAccent(win));

    const layout = doc.createElementNS(kHTML, "div");
    layout.className = "kavacha-appearance-layout";
    body.appendChild(layout);

    body.appendChild(this._buildFooter(win, panel));

    this._fillThemes(win, themes, generation);
    this._fillLayout(win, layout, generation);
  },

  _section(doc, l10nId, fallback) {
    const h = doc.createElementNS(kHTML, "div");
    h.className = "kavacha-appearance-heading";
    h.textContent = _label(l10nId, fallback);
    return h;
  },

  // ----- Dark / Light / Auto ------------------------------------------------

  _buildMode(win) {
    const row = this._segmented(win, {
      labelId: null,
      values: [
        ["dark", "kavacha-appearance-mode-dark", "Dark"],
        ["light", "kavacha-appearance-mode-light", "Light"],
        ["system", "kavacha-appearance-mode-system", "Auto"],
      ],
      onSelect: mode =>
        KavachaThemeEngine.setMode(mode).catch(e =>
          win.console?.error("KavachaAppearancePanel: setMode failed", e)
        ),
    });
    row.classList.add("kavacha-appearance-mode");
    // Async, because classifying a user theme means reading it off disk.
    KavachaThemeEngine.currentMode()
      .then(mode => this._select(row, mode))
      .catch(() => {});
    return row;
  },

  // ----- Themes -------------------------------------------------------------

  async _fillThemes(win, host, generation) {
    const doc = win.document;
    let ids;
    try {
      ids = await KavachaThemeEngine.listThemes();
    } catch (e) {
      return;
    }
    const active = KavachaThemeEngine.activeThemeId;

    // Resolve every package FIRST, then render once. Rendering inside the loop
    // is what makes the Settings pane's theme list flicker and duplicate: each
    // await is a window in which another caller can start the same rebuild.
    const themes = [];
    for (const id of ids) {
      try {
        themes.push(await KavachaThemeEngine.resolveTheme(id));
      } catch (e) {
        // Unreadable package: still offer it by id so it can be selected (or
        // switched away from), just without a palette to show.
        themes.push({ id, name: id, colors: {} });
      }
    }
    if (generation !== this._generation || !host.isConnected) {
      return;
    }

    for (const theme of themes) {
      host.appendChild(this._themeCard(win, doc, theme, theme.id === active));
    }
  },

  _themeCard(win, doc, theme, isActive) {
    const card = doc.createElementNS(kHTML, "button");
    card.className = "kavacha-appearance-card";
    card.setAttribute("type", "button");
    card.setAttribute("aria-pressed", isActive ? "true" : "false");

    // The palette, which is the whole point: you can see what a theme looks
    // like before you wear it.
    const swatch = doc.createElementNS(kHTML, "span");
    swatch.className = "kavacha-appearance-swatch";
    swatch.setAttribute("aria-hidden", "true");
    for (const token of kSwatchTokens) {
      const band = doc.createElementNS(kHTML, "span");
      band.className = "kavacha-appearance-band";
      const value = theme.colors?.[token];
      if (value) {
        band.style.background = value;
      }
      swatch.appendChild(band);
    }
    card.appendChild(swatch);

    const name = doc.createElementNS(kHTML, "span");
    name.className = "kavacha-appearance-card-name";
    name.textContent = theme.name || theme.id;
    card.appendChild(name);

    // Patch 0061 measures text-on-surface on every apply and repairs a theme
    // that fails. Saying so here is the other half: a repaired theme does not
    // look like its author intended, and silently changing someone's colours
    // without telling them is its own bug.
    const contrast = KavachaThemeEngine.contrastOf(theme.colors || {}, win);
    if (theme.colors && Object.keys(theme.colors).length && !contrast.passes) {
      const badge = doc.createElementNS(kHTML, "span");
      badge.className = "kavacha-appearance-warn";
      badge.textContent = _label(
        "kavacha-appearance-low-contrast",
        "Low contrast"
      );
      badge.setAttribute(
        "title",
        `${contrast.primary.toFixed(1)}:1 — below the 4.5:1 minimum for readable text`
      );
      card.appendChild(badge);
    }

    card.addEventListener("click", () => {
      KavachaThemeEngine.setActiveTheme(theme.id).catch(e =>
        win.console?.error("KavachaAppearancePanel: setActiveTheme failed", e)
      );
      for (const sibling of card.parentElement?.children || []) {
        sibling.setAttribute(
          "aria-pressed",
          sibling === card ? "true" : "false"
        );
      }
    });
    return card;
  },

  // ----- Accent -------------------------------------------------------------

  _buildAccent(win) {
    const doc = win.document;
    const row = doc.createElementNS(kHTML, "div");
    row.className = "kavacha-appearance-accents";

    const current = Services.prefs.getStringPref(kAccentPref, "");
    const mark = chosen => {
      for (const el of row.children) {
        el.setAttribute(
          "aria-pressed",
          el.dataset.accent === chosen ? "true" : "false"
        );
      }
    };

    // "System" first, and it is the state a fresh profile is in: Kavacha ships
    // no default accent by decision, and clearing the pref is how you say so.
    const system = doc.createElementNS(kHTML, "button");
    system.className =
      "kavacha-appearance-accent kavacha-appearance-accent-system";
    system.setAttribute("type", "button");
    system.dataset.accent = "";
    const systemLabel = _label(
      "kavacha-appearance-panel-accent-system",
      "Use the system accent"
    );
    system.setAttribute("aria-label", systemLabel);
    system.setAttribute("title", systemLabel);
    system.addEventListener("click", () => {
      Services.prefs.clearUserPref(kAccentPref);
      mark("");
    });
    row.appendChild(system);

    for (const color of KAVACHA_ACCENT_SWATCHES) {
      const swatch = doc.createElementNS(kHTML, "button");
      swatch.className = "kavacha-appearance-accent";
      swatch.setAttribute("type", "button");
      swatch.style.background = color;
      swatch.dataset.accent = color;
      swatch.setAttribute("aria-label", color);
      swatch.setAttribute("title", color);
      swatch.addEventListener("click", () => {
        Services.prefs.setStringPref(kAccentPref, color);
        mark(color);
      });
      row.appendChild(swatch);
    }

    // Any colour at all, for anyone the eight do not suit. The native picker is
    // the right control here — writing our own would be a worse one.
    const custom = doc.createElementNS(kHTML, "input");
    custom.className =
      "kavacha-appearance-accent kavacha-appearance-accent-custom";
    custom.setAttribute("type", "color");
    const customLabel = _label(
      "kavacha-appearance-accent-custom",
      "Choose a custom accent"
    );
    custom.setAttribute("aria-label", customLabel);
    custom.setAttribute("title", customLabel);
    if (/^#[0-9a-fA-F]{6}$/.test(current)) {
      custom.value = current.toLowerCase();
    }
    custom.addEventListener("change", () => {
      Services.prefs.setStringPref(kAccentPref, custom.value);
      mark(custom.value);
    });
    row.appendChild(custom);

    mark(current);
    return row;
  },

  // ----- Layout -------------------------------------------------------------

  async _fillLayout(win, host, generation) {
    let layout;
    try {
      layout = await KavachaLayoutEngine.getLayout();
    } catch (e) {
      return;
    }
    if (generation !== this._generation || !host.isConnected) {
      return;
    }
    for (const control of kLayoutControls) {
      const row = this._segmented(win, {
        labelId: control.labelId,
        labelFallback: control.fallback,
        values: control.values,
        onSelect: value =>
          KavachaLayoutEngine.setLayout({ [control.key]: value }).catch(e =>
            win.console?.error("KavachaAppearancePanel: setLayout failed", e)
          ),
      });
      this._select(row, layout[control.key]);
      host.appendChild(row);
    }
  },

  // ----- Generic segmented control -----------------------------------------

  /**
   * A labelled row of mutually exclusive buttons. `values` is
   * [value, l10nId, fallback] triples. Selection is expressed with
   * aria-pressed, which is both the accessible state and the CSS hook — one
   * attribute rather than a class that could drift from it.
   */
  _segmented(win, { labelId, labelFallback, values, onSelect }) {
    const doc = win.document;
    const row = doc.createElementNS(kHTML, "div");
    row.className = "kavacha-appearance-row";

    if (labelId) {
      const label = doc.createElementNS(kHTML, "span");
      label.className = "kavacha-appearance-row-label";
      label.textContent = _label(labelId, labelFallback);
      row.appendChild(label);
    }

    const group = doc.createElementNS(kHTML, "div");
    group.className = "kavacha-appearance-segments";
    group.setAttribute("role", "group");
    for (const [value, l10nId, fallback] of values) {
      const button = doc.createElementNS(kHTML, "button");
      button.className = "kavacha-appearance-segment";
      button.setAttribute("type", "button");
      button.setAttribute("aria-pressed", "false");
      button.dataset.value = value;
      button.textContent = _label(l10nId, fallback);
      button.addEventListener("click", () => {
        this._select(row, value);
        onSelect(value);
      });
      group.appendChild(button);
    }
    row.appendChild(group);
    return row;
  },

  _select(row, value) {
    for (const button of row.querySelectorAll(".kavacha-appearance-segment")) {
      button.setAttribute(
        "aria-pressed",
        button.dataset.value === value ? "true" : "false"
      );
    }
  },

  // ----- Footer: links out, plus whatever the registry still has -----------

  _buildFooter(win, panel) {
    const doc = win.document;
    const footer = doc.createElementNS(kHTML, "div");
    footer.className = "kavacha-appearance-footer";

    const link = (label, onCommand) => {
      const item = doc.createXULElement("toolbarbutton");
      item.className = "kavacha-menu-item subviewbutton";
      item.setAttribute("label", label);
      item.setAttribute("tabindex", "0");
      item.addEventListener("command", onCommand);
      footer.appendChild(item);
    };

    // The registry is still the source of truth for what Appearance contains:
    // marketplace components and plugins register here at runtime, and a panel
    // that hand-listed its contents would stop showing them the day someone
    // installed one.
    for (const cmd of KavachaCommandRegistry.getByDomain(
      KavachaCommandDomain.APPEARANCE
    )) {
      if (kSupersededCommands.has(cmd.l10nId)) {
        continue;
      }
      if (cmd.isAvailable && !cmd.isAvailable(win)) {
        continue;
      }
      link(cmd.rawLabel ?? _label(cmd.l10nId, cmd.l10nId), () => {
        panel.hidePopup();
        this._invoke(win, cmd);
      });
    }

    link(_label("kavacha-appearance-all-settings", "All appearance settings"), () => {
      panel.hidePopup();
      win.openTrustedLinkIn("about:preferences#paneKavachaAppearance", "tab");
    });
    return footer;
  },

  // Same polymorphic contract as the menu (patch 0027): a function
  // command(window), or a string naming a <command> node.
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
      console.error("KavachaAppearancePanel: command failed", cmd?.l10nId, e);
    }
  },
};
