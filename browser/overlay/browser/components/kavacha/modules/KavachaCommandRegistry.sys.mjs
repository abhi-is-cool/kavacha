// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Ported 2026-09-19 from the Zen-era src/zen/common/sys/KavachaCommandRegistry.sys.mjs
// (patches 0018/0027/0055/0063/0080-0087) — ADR 0020. Changes: gZenWorkspaces ->
// gKavachaWorkspaces; Zen icon URLs -> Firefox skin icons; the palette is
// KavachaPalette (content/palette/), not ZenUBGlobalActions.

// Kavacha command registry (ROADMAP Phase 3; PLATFORM_PLAN.md § "Command
// registry"). Every Kavacha feature exposes itself here as a Cmd+K command,
// organized by domain, and it is the surface plugins and the marketplace
// extend.
//
// The palette (KavachaPalette) spreads all() into its action list at
// import and binds live sinks so register()/unregister() calls made at runtime
// — by late-initializing features, marketplace components, or plugins — appear
// in and disappear from the live palette immediately.
//
// A command is: { l10nId, command(window)|"commandId", icon, domain,
// isAvailable?(window), capability? }. `domain` drives palette grouping (see
// KavachaCommandDomainOrder / KavachaCommandDomainLabel); `capability` is
// metadata the plugin permission model reads (built-ins leave it unset — they
// are trusted). The l10nId keys browser/kavacha/kavacha-commands.ftl; a domain's
// group-header label keys it too (kavacha-command-domain-*).

export const KavachaCommandDomain = Object.freeze({
  NAVIGATION: "navigation",
  ORGANIZATION: "organization",
  PRODUCTIVITY: "productivity",
  APPEARANCE: "appearance",
  PRIVACY: "privacy",
  // Reserved for Phase 7 workflow/automation commands. No built-in targets it
  // yet; it exists now so the marketplace and plugins have a stable home and
  // the palette grouping already knows where automation commands sort.
  AUTOMATION: "automation",
});

// Palette display order + localized group-header labels. The palette
// reads these to cluster Kavacha commands by domain (closing patch 0018's
// deferred "domain-grouped display") and to stamp a `group` label on each
// action's payload. Domains not listed sort last.
export const KavachaCommandDomainOrder = [
  KavachaCommandDomain.NAVIGATION,
  KavachaCommandDomain.ORGANIZATION,
  KavachaCommandDomain.PRODUCTIVITY,
  KavachaCommandDomain.APPEARANCE,
  KavachaCommandDomain.PRIVACY,
  KavachaCommandDomain.AUTOMATION,
];

export const KavachaCommandDomainLabel = Object.freeze({
  [KavachaCommandDomain.NAVIGATION]: "kavacha-command-domain-navigation",
  [KavachaCommandDomain.ORGANIZATION]: "kavacha-command-domain-organization",
  [KavachaCommandDomain.PRODUCTIVITY]: "kavacha-command-domain-productivity",
  [KavachaCommandDomain.APPEARANCE]: "kavacha-command-domain-appearance",
  [KavachaCommandDomain.PRIVACY]: "kavacha-command-domain-privacy",
  [KavachaCommandDomain.AUTOMATION]: "kavacha-command-domain-automation",
});

// Capabilities a command may declare. The plugin permission model (ROADMAP
// Phase 3 "Kavacha SDK + plugin permission model") reads these to decide
// whether a plugin may register or invoke a command: the Kavacha SDK stamps a
// plugin command's capability from the plugin's granted permissions, and the
// registry is the enforcement surface. Built-in commands leave it unset.
export const KavachaCommandCapability = Object.freeze({
  WORKSPACES: "workspaces",
  TABS: "tabs",
  NOTES: "notes",
  COMMANDS: "commands",
  WORKFLOWS: "workflows",
});

const kNotPrivate = window => !window.gKavachaWorkspaces?.privateWindowOrDisabled;
const kHasBackgroundSpaces = window =>
  kNotPrivate(window) &&
  window.gKavachaWorkspaces?.getWorkspaces?.().filter(w => !w.archived).length > 1;

// Built-in Kavacha commands. Ordered by domain for readability; all() re-sorts
// by KavachaCommandDomainOrder so runtime registrations cluster with them.
const BUILTIN = [
  // -- Navigation ----------------------------------------------------------
  {
    l10nId: "kavacha-action-universal-search",
    command: window => window.gKavachaUniversalSearch.open(),
    icon: "chrome://global/skin/icons/search-glass.svg",
    domain: KavachaCommandDomain.NAVIGATION,
  },

  // -- Organization --------------------------------------------------------
  {
    l10nId: "kavacha-action-new-space-student",
    command: window =>
      window.gKavachaWorkspaces.createWorkspaceFromTemplate("student"),
    icon: "chrome://global/skin/icons/lightbulb.svg",
    domain: KavachaCommandDomain.ORGANIZATION,
    isAvailable: kNotPrivate,
  },
  {
    l10nId: "kavacha-action-new-space-developer",
    command: window =>
      window.gKavachaWorkspaces.createWorkspaceFromTemplate("developer"),
    icon: "chrome://global/skin/icons/developer.svg",
    domain: KavachaCommandDomain.ORGANIZATION,
    isAvailable: kNotPrivate,
  },
  {
    l10nId: "kavacha-action-new-space-privacy",
    command: window =>
      window.gKavachaWorkspaces.createWorkspaceFromTemplate("privacy"),
    icon: "chrome://global/skin/icons/security.svg",
    domain: KavachaCommandDomain.ORGANIZATION,
    isAvailable: kNotPrivate,
  },
  {
    l10nId: "kavacha-action-space-timeline",
    command: window => window.gKavachaWorkspaces.kavachaOpenSpaceTimeline(),
    icon: "chrome://browser/skin/history.svg",
    domain: KavachaCommandDomain.NAVIGATION,
    isAvailable: kNotPrivate,
  },
  {
    l10nId: "kavacha-action-branch-space",
    command: window => window.gKavachaWorkspaces.kavachaBranchSpace(),
    icon: "chrome://browser/skin/tabs.svg",
    domain: KavachaCommandDomain.ORGANIZATION,
    isAvailable: kNotPrivate,
  },
  {
    // Patch 0054: only offered on a Space that actually is a branch, since
    // comparing a root Space with a parent it does not have is not a thing.
    l10nId: "kavacha-action-compare-branch",
    command: window => window.gKavachaWorkspaces.kavachaCompareWithParent(),
    icon: "chrome://browser/skin/window.svg",
    domain: KavachaCommandDomain.ORGANIZATION,
    isAvailable: window =>
      kNotPrivate(window) &&
      !!window.gKavachaWorkspaces?.getActiveWorkspaceFromCache?.()?.parentSpaceId,
  },
  {
    // Patch 0053: the recommendations panel opens once when a template Space
    // is created. Available only where there is something to recommend, so it
    // does not sit dead in the palette for hand-made Spaces.
    l10nId: "kavacha-action-space-recommendations",
    command: window => window.gKavachaWorkspaces.kavachaShowRecommendedExtensions(),
    icon: "chrome://global/skin/icons/plugin.svg",
    domain: KavachaCommandDomain.ORGANIZATION,
    isAvailable: window =>
      kNotPrivate(window) &&
      !!window.gKavachaWorkspaces?.kavachaHasRecommendations?.(),
  },
  {
    l10nId: "kavacha-action-archive-space",
    command: window => window.gKavachaWorkspaces.archiveWorkspace(),
    icon: "chrome://browser/skin/mail.svg",
    domain: KavachaCommandDomain.ORGANIZATION,
    isAvailable: kHasBackgroundSpaces,
  },

  // -- Productivity --------------------------------------------------------
  {
    l10nId: "kavacha-action-workspace-notes",
    command: window => window.gKavachaWorkspaces.openWorkspaceNotes(),
    icon: "chrome://browser/skin/tab.svg",
    domain: KavachaCommandDomain.PRODUCTIVITY,
    isAvailable: kNotPrivate,
  },
  {
    l10nId: "kavacha-action-snapshot-space",
    command: window =>
      ChromeUtils.importESModule(
        "resource:///modules/KavachaSpaceHistory.sys.mjs"
      ).KavachaSpaceHistory.snapshotSpace(
        window,
        window.gKavachaWorkspaces.activeWorkspace,
        "manual"
      ),
    icon: "chrome://browser/skin/screenshot.svg",
    domain: KavachaCommandDomain.PRODUCTIVITY,
    isAvailable: kNotPrivate,
  },
  {
    l10nId: "kavacha-action-sleep-tabs",
    command: () =>
      ChromeUtils.importESModule(
        "resource:///modules/KavachaTabMemory.sys.mjs"
      ).KavachaTabMemory.sleepBackgroundTabsNow(),
    icon: "chrome://browser/skin/history.svg",
    domain: KavachaCommandDomain.PRODUCTIVITY,
  },
  {
    l10nId: "kavacha-action-summarize-page",
    command: window => kavachaAISidebar().summarizeActivePage(window),
    // Not selectable/edit.svg: patch 0079 used it and it is not in the icon
    // set, so this command has rendered as a missing image since it shipped.
    icon: "chrome://browser/skin/tab.svg",
    domain: KavachaCommandDomain.PRODUCTIVITY,
    isAvailable: kNotPrivate,
  },
  {
    l10nId: "kavacha-action-ask-history",
    command: window => kavachaAISidebar().ask(window),
    icon: "chrome://global/skin/icons/search-glass.svg",
    domain: KavachaCommandDomain.PRODUCTIVITY,
    isAvailable: kNotPrivate,
  },
  {
    l10nId: "kavacha-action-group-tabs",
    command: window => runTabAssistant(window, "group"),
    icon: "chrome://global/skin/icons/folder.svg",
    domain: KavachaCommandDomain.ORGANIZATION,
    isAvailable: kNotPrivate,
  },
  {
    l10nId: "kavacha-action-close-duplicates",
    command: window => runTabAssistant(window, "duplicates"),
    icon: "chrome://global/skin/icons/close.svg",
    domain: KavachaCommandDomain.ORGANIZATION,
  },
  {
    l10nId: "kavacha-action-save-session",
    command: window => runTabAssistant(window, "session"),
    icon: "chrome://browser/skin/screenshot.svg",
    domain: KavachaCommandDomain.PRODUCTIVITY,
    isAvailable: kNotPrivate,
  },
  // Knowledge capture (patch 0082; ADR 0015). All four are unavailable in a
  // private window: writing something down that a private window promised not
  // to remember is exactly the trust this browser sells.
  {
    l10nId: "kavacha-action-note-page",
    command: window => kavachaKnowledgeSidebar().noteCurrentPage(window),
    icon: "chrome://global/skin/icons/page-portrait.svg",
    domain: KavachaCommandDomain.PRODUCTIVITY,
    isAvailable: kNotPrivate,
  },
  {
    l10nId: "kavacha-action-clip-page",
    command: window => kavachaKnowledgeSidebar().clipCurrentPage(window),
    icon: "chrome://browser/skin/save.svg",
    domain: KavachaCommandDomain.PRODUCTIVITY,
    isAvailable: kNotPrivate,
  },
  {
    l10nId: "kavacha-action-highlight-selection",
    command: window => kavachaKnowledgeSidebar().highlightSelection(window),
    icon: "chrome://global/skin/icons/highlights.svg",
    domain: KavachaCommandDomain.PRODUCTIVITY,
    isAvailable: kNotPrivate,
  },
  {
    l10nId: "kavacha-action-open-library",
    command: window => kavachaKnowledgeSidebar().openLibrary(window),
    icon: "chrome://browser/skin/library.svg",
    domain: KavachaCommandDomain.PRODUCTIVITY,
    isAvailable: kNotPrivate,
  },
  // Power-user tooling (patch 0087). Capture is Firefox's own Screenshots
  // component surfaced in the palette rather than a Kavacha reimplementation
  // — the honest answer when the browser already ships the feature.
  {
    l10nId: "kavacha-action-copy-citation",
    command: window =>
      ChromeUtils.importESModule(
        "resource:///modules/KavachaCitations.sys.mjs"
      ).KavachaCitations.promptAndCopy(window),
    icon: "chrome://global/skin/icons/edit-copy.svg",
    domain: KavachaCommandDomain.PRODUCTIVITY,
    isAvailable: window =>
      /^https?:/.test(window.gBrowser?.selectedBrowser?.currentURI?.spec || ""),
  },
  {
    l10nId: "kavacha-action-screenshot",
    command: window => window.ScreenshotsUtils?.notify(window, "Kavacha"),
    icon: "chrome://browser/skin/screenshot.svg",
    domain: KavachaCommandDomain.PRODUCTIVITY,
    isAvailable: window =>
      !!window.ScreenshotsUtils &&
      /^https?:/.test(window.gBrowser?.selectedBrowser?.currentURI?.spec || ""),
  },
  {
    l10nId: "kavacha-action-writing-mode",
    command: window => window.openTrustedLinkIn("about:write", "tab"),
    icon: "chrome://global/skin/icons/edit.svg",
    domain: KavachaCommandDomain.PRODUCTIVITY,
    isAvailable: kNotPrivate,
  },
  // Tab history tree + saved sessions (patch 0086; FEATURES 7.1, 7.2).
  {
    l10nId: "kavacha-action-tab-tree",
    command: window =>
      ChromeUtils.importESModule(
        "resource:///modules/KavachaTabHistory.sys.mjs"
      ).KavachaTabHistory.showPanel(window),
    icon: "chrome://browser/skin/history.svg",
    domain: KavachaCommandDomain.NAVIGATION,
    isAvailable: kNotPrivate,
  },
  {
    l10nId: "kavacha-action-saved-sessions",
    command: window => window.gKavachaWorkspaces.kavachaOpenSavedSessions(),
    icon: "chrome://browser/skin/library.svg",
    domain: KavachaCommandDomain.NAVIGATION,
    isAvailable: kNotPrivate,
  },
  // Automation (patch 0085; ADR 0017). The entry point into the builder; the
  // per-workflow "Run:" commands are registered at runtime by KavachaWorkflows
  // itself, in the AUTOMATION domain patch 0027 reserved for them.
  {
    l10nId: "kavacha-action-open-workflows",
    command: window => window.openTrustedLinkIn("about:workflows", "tab"),
    icon: "chrome://global/skin/icons/lightbulb.svg",
    domain: KavachaCommandDomain.AUTOMATION,
    isAvailable: kNotPrivate,
  },
  // Focus mode (patch 0084). Start uses the default length so the command is
  // one keystroke and done; about:focus is where a different length, the
  // blocklist and "end early" live. Ending is a separate command rather than
  // a toggle on the same one, because a palette entry that means two
  // different things depending on hidden state is how you end a session you
  // meant to start.
  {
    l10nId: "kavacha-action-focus-start",
    command: () => kavachaFocus().start(),
    icon: "chrome://browser/skin/history.svg",
    domain: KavachaCommandDomain.PRODUCTIVITY,
    isAvailable: window => kNotPrivate(window) && !kavachaFocus().isActive,
  },
  {
    l10nId: "kavacha-action-focus-end",
    command: () => kavachaFocus().end(),
    icon: "chrome://global/skin/icons/close.svg",
    domain: KavachaCommandDomain.PRODUCTIVITY,
    isAvailable: () => kavachaFocus().isActive,
  },
  {
    l10nId: "kavacha-action-focus-settings",
    command: window => window.openTrustedLinkIn("about:focus", "tab"),
    icon: "chrome://global/skin/icons/block.svg",
    domain: KavachaCommandDomain.PRODUCTIVITY,
    isAvailable: kNotPrivate,
  },
  // Knowledge graph (patch 0083; ADR 0016).
  {
    l10nId: "kavacha-action-open-knowledge",
    command: window => window.openTrustedLinkIn("about:knowledge", "tab"),
    icon: "chrome://global/skin/icons/developer.svg",
    domain: KavachaCommandDomain.NAVIGATION,
    isAvailable: kNotPrivate,
  },
  {
    // Opens the graph already focused on the page in front of you, which is
    // the only question worth asking from a page: "what does this connect to".
    l10nId: "kavacha-action-page-connections",
    command: window => {
      const url = window.gBrowser?.selectedBrowser?.currentURI?.spec || "";
      window.openTrustedLinkIn(
        "about:knowledge?url=" + encodeURIComponent(url),
        "tab"
      );
    },
    icon: "chrome://global/skin/icons/link.svg",
    domain: KavachaCommandDomain.NAVIGATION,
    isAvailable: window =>
      kNotPrivate(window) &&
      /^https?:/.test(
        window.gBrowser?.selectedBrowser?.currentURI?.spec || ""
      ),
  },

  // -- Appearance ----------------------------------------------------------
  {
    l10nId: "kavacha-action-toggle-newtab",
    // Flip between Firefox's new tab and the Kavacha dashboard; KavachaNewTab
    // observes the pref and re-points about:newtab live. (Zen's floating
    // search, the other half of the old toggle, does not exist on the Firefox
    // base — ADR 0020.)
    command: () => {
      const on = Services.prefs.getBoolPref("kavacha.newtab.dashboard", true);
      Services.prefs.setBoolPref("kavacha.newtab.dashboard", !on);
    },
    icon: "chrome://browser/skin/window.svg",
    domain: KavachaCommandDomain.APPEARANCE,
  },
  {
    l10nId: "kavacha-action-toggle-tab-layout",
    // Cycles all THREE styles. It used to be a two-way toggle written before
    // patch 0058 added Arc, so running it from Arc silently dropped you to
    // vertical with no way back except about:studio -- the layout engine
    // accepts "arc" (kTabStyles), but nothing outside the Studio ever offered
    // it. The Appearance panel (patch 0063) offers all three directly; this
    // keeps the palette honest about the same set.
    command: async () => {
      const e = ChromeUtils.importESModule(
        "resource:///modules/KavachaLayoutEngine.sys.mjs"
      ).KavachaLayoutEngine;
      const layout = await e.getLayout();
      const order = ["horizontal", "vertical", "arc"];
      const next = order[(order.indexOf(layout.tabStyle) + 1) % order.length];
      await e.setLayout({ tabStyle: next });
    },
    icon: "chrome://browser/skin/window.svg",
    domain: KavachaCommandDomain.APPEARANCE,
  },
  {
    l10nId: "kavacha-action-cycle-sidebar",
    command: async () => {
      const e = ChromeUtils.importESModule(
        "resource:///modules/KavachaLayoutEngine.sys.mjs"
      ).KavachaLayoutEngine;
      const order = ["left", "right", "hidden"];
      const layout = await e.getLayout();
      const next = order[(order.indexOf(layout.sidebar) + 1) % order.length];
      await e.setLayout({ sidebar: next });
    },
    icon: "chrome://browser/skin/window.svg",
    domain: KavachaCommandDomain.APPEARANCE,
  },
  {
    l10nId: "kavacha-action-cycle-density",
    command: async () => {
      const e = ChromeUtils.importESModule(
        "resource:///modules/KavachaLayoutEngine.sys.mjs"
      ).KavachaLayoutEngine;
      const order = ["compact", "normal", "comfortable"];
      const layout = await e.getLayout();
      const next = order[(order.indexOf(layout.density) + 1) % order.length];
      await e.setLayout({ density: next });
    },
    icon: "chrome://browser/skin/window.svg",
    domain: KavachaCommandDomain.APPEARANCE,
  },
  {
    l10nId: "kavacha-action-reload-layout",
    command: () =>
      ChromeUtils.importESModule(
        "resource:///modules/KavachaLayoutEngine.sys.mjs"
      ).KavachaLayoutEngine.reloadFromFile(),
    icon: "chrome://browser/skin/window.svg",
    domain: KavachaCommandDomain.APPEARANCE,
  },
  {
    l10nId: "kavacha-action-switch-theme",
    command: async () => {
      const e = ChromeUtils.importESModule(
        "resource:///modules/KavachaThemeEngine.sys.mjs"
      ).KavachaThemeEngine;
      const ids = await e.listThemes();
      if (ids.length < 2) {
        return;
      }
      const i = ids.indexOf(e.activeThemeId);
      await e.setActiveTheme(ids[(i + 1) % ids.length]);
    },
    icon: "chrome://browser/skin/window.svg",
    domain: KavachaCommandDomain.APPEARANCE,
  },
  {
    // Patch 0057: the dashboard. Also the reason the widget host exists —
    // without a surface, `widget` and `panel` components would install into
    // nothing.
    l10nId: "kavacha-action-open-dashboard",
    command: window =>
      ChromeUtils.importESModule(
        "resource:///modules/KavachaWidgetHost.sys.mjs"
      ).KavachaWidgetHost.openDashboard(window),
    icon: "chrome://browser/skin/topsites.svg",
    domain: KavachaCommandDomain.APPEARANCE,
  },
  {
    l10nId: "kavacha-action-open-studio",
    // about:studio is a privileged chrome page (ADR 0009); reuse an existing
    // tab if one is already open rather than piling up duplicates.
    command: window => window.switchToTabHavingURI("about:studio", true),
    icon: "chrome://browser/skin/window.svg",
    domain: KavachaCommandDomain.APPEARANCE,
  },
  {
    l10nId: "kavacha-action-usercss-safe-mode",
    // The escape hatch: disables ALL custom chrome CSS so a broken rule can
    // never brick the UI. Reachable from the palette even if chrome is
    // unusable (ADR 0009).
    command: () =>
      ChromeUtils.importESModule(
        "resource:///modules/KavachaUserCSS.sys.mjs"
      ).KavachaUserCSS.toggleSafeMode(),
    icon: "chrome://browser/skin/window.svg",
    domain: KavachaCommandDomain.APPEARANCE,
  },

  // -- Privacy ---------------------------------------------------------------
  {
    l10nId: "kavacha-action-privacy-center",
    command: window => window.openPreferences("paneKavachaPrivacy"),
    icon: "chrome://browser/skin/tracking-protection.svg",
    domain: KavachaCommandDomain.PRIVACY,
  },

  // -- Organization (restore) ----------------------------------------------
  // Restore-archived-space stayed menu-driven because it needs a picker and
  // (per 0018/0027) had no clean single-call opener. The opener is clean now
  // — gKavachaWorkspaces.unarchiveWorkspace(uuid) (patch 0009) un-hides the space
  // and switches to it — so the only missing piece was the picker, supplied
  // here with Services.prompt.select.
  {
    l10nId: "kavacha-action-restore-space",
    icon: "chrome://browser/skin/mail.svg",
    domain: KavachaCommandDomain.ORGANIZATION,
    isAvailable: window =>
      kNotPrivate(window) &&
      !!window.gKavachaWorkspaces?.getWorkspaces?.().some(w => w.archived),
    command: window => {
      const spaces = window.gKavachaWorkspaces;
      const archived =
        spaces?.getWorkspaces?.().filter(w => w.archived) || [];
      if (!archived.length) {
        return;
      }
      // Label each space by name, prefixed with its emoji icon when it has
      // one — mirroring the Archived Spaces submenu (patch 0009).
      const labels = archived.map(w =>
        w.icon && !w.icon.endsWith(".svg") ? `${w.icon}  ${w.name}` : w.name
      );
      const selected = { value: 0 };
      const ok = Services.prompt.select(
        window,
        "Restore Archived Space",
        "Choose a space to bring back:",
        labels,
        selected
      );
      if (ok) {
        spaces.unarchiveWorkspace(archived[selected.value].uuid).catch(e =>
          console.error("Kavacha: restore archived space failed", e)
        );
      }
    },
  },
];

// Runtime commands as { command, source } so a source (plugin / marketplace
// component id) can be revoked as a group. _sinks/_removalSinks are the live
// palette bindings (the palette).
const _registered = [];
const _sinks = [];
const _removalSinks = [];

// The AI commands ("Summarize This Page", "Ask Your History") both open the
// Kavacha AI sidebar and hand it the job (ADR 0014). Patch 0079 ran summarize
// inline here and printed into an arrow panel; the sidebar replaced that
// because a summary is something you READ WHILE BROWSING — an arrow panel
// dismisses on the first click into the page it just summarized, cannot be
// resized, and has nowhere to put the source list that ask-your-history needs.
// The panel markup stays: it is the right surface for the tab assistant's
// short reports, which are a sentence, not a document.
const kavachaAISidebar = () =>
  ChromeUtils.importESModule("resource:///modules/KavachaAISidebar.sys.mjs")
    .KavachaAISidebar;

const kavachaFocus = () =>
  ChromeUtils.importESModule("resource:///modules/KavachaFocusMode.sys.mjs")
    .KavachaFocusMode;

const kavachaKnowledgeSidebar = () =>
  ChromeUtils.importESModule(
    "resource:///modules/KavachaKnowledgeSidebar.sys.mjs"
  ).KavachaKnowledgeSidebar;

// Tab assistant (patch 0081). Each command does its work in the module and
// reports one sentence in the AI panel — the surface 0079 built and the
// sidebar did NOT take over, because these results are a sentence, not a
// document, and a panel that dismisses on the next click is exactly right for
// "closed 4 duplicate tabs".
async function runTabAssistant(window, action) {
  const doc = window.document;
  const panel = doc.getElementById("kavacha-ai-panel");
  const body = doc.getElementById("kavacha-ai-body");
  const title = doc.getElementById("kavacha-ai-title");

  const show = text => {
    if (!panel || !body) {
      return;
    }
    body.textContent = text;
    if (panel.state === "open") {
      return;
    }
    const anchor =
      doc.getElementById("kavacha-menu-button") ||
      doc.getElementById("PanelUI-menu-button") ||
      window.gBrowser.selectedTab;
    try {
      panel.openPopup(anchor, "bottomright topright", 0, 0, false, false);
    } catch (e) {
      panel.openPopupAtScreen(200, 120, false);
    }
  };

  const t = async (id, fallback) => {
    try {
      return (await doc.l10n.formatValue(id)) || fallback;
    } catch (e) {
      return fallback;
    }
  };

  if (title) {
    title.textContent = await t("kavacha-tabs-assistant-title", "Tab assistant");
  }

  try {
    const { KavachaTabAssistant } = ChromeUtils.importESModule(
      "resource:///modules/KavachaTabAssistant.sys.mjs"
    );

    if (action === "duplicates") {
      // No panel before the confirmation: an arrow panel open behind a modal
      // prompt is just clutter the user has to dismiss afterwards.
      const r = await KavachaTabAssistant.closeDuplicates(window);
      if (r.cancelled) {
        return;
      }
      show(
        r.closed
          ? `Closed ${r.closed} duplicate ${r.closed === 1 ? "tab" : "tabs"}. ${r.kept} unique ${r.kept === 1 ? "page" : "pages"} left open.`
          : "No duplicate tabs found in this Space."
      );
      return;
    }

    if (action === "session") {
      show("Saving this session…");
      const r = await KavachaTabAssistant.saveSession(window);
      show(
        r.id
          ? `Saved as "${r.name}". Find it in Space Timeline; saved sessions are kept regardless of snapshot retention.`
          : r.reason === "empty"
            ? "There is nothing to save — this Space has no pages open."
            : "Could not save this session."
      );
      return;
    }

    // Grouping is the one that needs a model.
    show("Grouping tabs by topic…");
    const r = await KavachaTabAssistant.groupByTopic(window);
    if (r.groups) {
      show(
        `Grouped ${r.grouped} tabs into ${r.groups} ${r.groups === 1 ? "group" : "groups"}.`
      );
      return;
    }
    const why = {
      "too-few": "There are too few loose tabs in this Space to group.",
      "no-groups": "The model did not find any topics worth grouping.",
      unparsable:
        "The model's reply could not be read as a grouping, so nothing was changed.",
      error: await t(
        "kavacha-ai-error",
        "The local model could not complete the request."
      ),
    };
    show(
      why[r.reason] ||
        (await t(
          "kavacha-ai-unavailable",
          "No local model found. Install a local model runtime (for example " +
            "Ollama) and check Settings → Privacy → Local AI."
        ))
    );
  } catch (e) {
    console.error("KavachaCommandRegistry: tab assistant failed", e);
    show(
      await t(
        "kavacha-ai-error",
        "The local model could not complete the request."
      )
    );
  }
}

const _domainRank = domain => {
  const i = KavachaCommandDomainOrder.indexOf(domain);
  return i === -1 ? KavachaCommandDomainOrder.length : i;
};

// Stable sort by domain order so the palette clusters commands by domain
// (patch 0018's deferred "domain-grouped display"). Equal domains keep
// insertion order — hence the index tie-breaker rather than Array.sort alone.
const _byDomain = commands =>
  commands
    .map((command, i) => ({ command, i }))
    .sort((a, b) => {
      const d = _domainRank(a.command.domain) - _domainRank(b.command.domain);
      return d !== 0 ? d : a.i - b.i;
    })
    .map(entry => entry.command);

function _validate(command) {
  if (!command || typeof command !== "object") {
    throw new Error("KavachaCommandRegistry: command must be an object");
  }
  if (typeof command.l10nId !== "string" || !command.l10nId) {
    throw new Error("KavachaCommandRegistry: command needs an l10nId");
  }
  if (
    typeof command.command !== "function" &&
    typeof command.commandId !== "string"
  ) {
    throw new Error(
      `KavachaCommandRegistry: "${command.l10nId}" needs command(window) or commandId`
    );
  }
}

export const KavachaCommandRegistry = {
  domains: KavachaCommandDomain,
  domainOrder: KavachaCommandDomainOrder,
  capabilities: KavachaCommandCapability,

  /**
   * Register a command at runtime (late features, marketplace components,
   * plugins). `options.source` attributes the command to its owner so it can
   * be revoked as a group with unregisterBySource — the plugin permission
   * model (ROADMAP Phase 3) relies on this to drop every command a disabled
   * plugin added. Throws on a malformed command or a duplicate l10nId. Returns
   * an unregister function; the live palette picks it up via the onRegister
   * sink and drops it via the onUnregister sink.
   */
  register(command, options = {}) {
    _validate(command);
    if (this.has(command.l10nId)) {
      throw new Error(
        `KavachaCommandRegistry: "${command.l10nId}" is already registered`
      );
    }
    const source = options.source || "runtime";
    _registered.push({ command, source });
    for (const sink of _sinks) {
      sink(command);
    }
    return () => this.unregister(command.l10nId);
  },

  /** Remove a single runtime command by l10nId (built-ins are permanent). */
  unregister(l10nId) {
    const i = _registered.findIndex(e => e.command.l10nId === l10nId);
    if (i < 0) {
      return false;
    }
    const [entry] = _registered.splice(i, 1);
    for (const sink of _removalSinks) {
      sink(entry.command);
    }
    return true;
  },

  /**
   * Remove every runtime command a source registered (plugin disable /
   * marketplace-component uninstall). Returns the number removed.
   */
  unregisterBySource(source) {
    let removed = 0;
    for (const entry of _registered.filter(e => e.source === source)) {
      if (this.unregister(entry.command.l10nId)) {
        removed++;
      }
    }
    return removed;
  },

  /** Whether a command with this l10nId exists (built-in or runtime). */
  has(l10nId) {
    return (
      BUILTIN.some(c => c.l10nId === l10nId) ||
      _registered.some(e => e.command.l10nId === l10nId)
    );
  },

  /** All commands (built-ins then runtime), clustered by domain order. */
  all() {
    return _byDomain([...BUILTIN, ..._registered.map(e => e.command)]);
  },

  /** Commands in a single domain, in display order. */
  getByDomain(domain) {
    return this.all().filter(c => c.domain === domain);
  },

  /** The l10n id for a domain's palette group header (or null if unknown). */
  domainLabel(domain) {
    return KavachaCommandDomainLabel[domain] || null;
  },

  /** The palette binds a sink so runtime registrations reach it. */
  onRegister(sink) {
    _sinks.push(sink);
  },

  /** ...and one so runtime unregistrations leave the live palette. */
  onUnregister(sink) {
    _removalSinks.push(sink);
  },
};
