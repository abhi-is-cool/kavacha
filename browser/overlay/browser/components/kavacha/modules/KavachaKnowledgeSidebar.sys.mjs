// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Registers the Kavacha Knowledge sidebar — notes, highlights and clips for
// the page in front of you (ADR 0015; ROADMAP Phase 7).
//
// Same runtime registration as the AI sidebar (ADR 0014): SidebarController's
// own `registerPrefSidebar`, so no upstream file is edited and a Firefox
// uplift that reshuffles the sidebar map cannot conflict with us.
//
// WHY IT IS NOT A MODE INSIDE THE AI SIDEBAR, which was the cheaper option:
// that sidebar is gated on `kavacha.ai.enabled`, and writing a note about a
// page must not require a local model — or any model. Notes and clips work on
// a machine with no AI runtime, in exactly the same way, and folding them in
// would have made the browser's note-taking disappear when the user switched
// AI off. They are two surfaces because they have two dependencies.
//
// Gated instead on `kavacha.knowledge.enabled`, which is also the switch that
// stops the store accepting writes.

const kSidebarId = "viewKavachaKnowledgeSidebar";
const kEnabledPref = "kavacha.knowledge.enabled";
const kSidebarUrl = "chrome://browser/content/kavacha/knowledge/knowledge.html";

export const KavachaKnowledgeSidebar = {
  register(window) {
    try {
      const controller = window.SidebarController;
      if (!controller || controller.sidebars?.has?.(kSidebarId)) {
        return;
      }
      // Read the lazy getter before writing through registerPrefSidebar —
      // see KavachaAISidebar for why skipping this silently drops the entry.
      controller.sidebars;
      controller.registerPrefSidebar(kEnabledPref, kSidebarId, {
        name: "kavachaknowledge",
        elementId: "sidebar-switcher-kavacha-knowledge",
        url: kSidebarUrl,
        menuId: "menu_kavachaKnowledgeSidebar",
        menuL10nId: "kavacha-knowledge-sidebar-menu",
        revampL10nId: "kavacha-knowledge-sidebar-menu",
        // Every icon here is checked against zen-icons/jar.inc.mn before it
        // ships: patch 0080 found five Kavacha commands pointing at SVGs that
        // are not in the set, which render as a missing image and nothing else.
        iconUrl: "chrome://browser/skin/library.svg",
      });
    } catch (e) {
      console.error("KavachaKnowledgeSidebar: registration failed", e);
    }
  },

  /** Open the sidebar and run `job` against its page object. */
  async open(window, job) {
    try {
      if (!Services.prefs.getBoolPref(kEnabledPref, true)) {
        return null;
      }
      this.register(window);
      await window.SidebarController.show(kSidebarId);
      const page = window.SidebarController.browser?.contentWindow;
      if (page?.KavachaKnowledgePage && typeof job === "function") {
        job(page.KavachaKnowledgePage);
      }
      return page;
    } catch (e) {
      console.error("KavachaKnowledgeSidebar: open failed", e);
      return null;
    }
  },

  /** Open on the current page's note, with the cursor in it. */
  noteCurrentPage(window) {
    return this.open(window, page => page.focusNote());
  },

  /** Clip the whole readable page, then show what was saved. */
  clipCurrentPage(window) {
    return this.open(window, page => page.clipPage());
  },

  /** Save the current selection as a highlight. */
  highlightSelection(window) {
    return this.open(window, page => page.clipSelection());
  },

  /** Open on the library (everything kept, newest first). */
  openLibrary(window) {
    return this.open(window, page => page.selectMode("library"));
  },
};
