// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Registers the Kavacha AI sidebar with Firefox's own SidebarController
// (ADR 0014; ROADMAP Phase 6) and gives chrome callers a way to open it and
// hand it a job.
//
// WHY AT RUNTIME. Firefox declares its sidebars in a literal Map inside
// browser/components/sidebar/browser-sidebar.js — a file Zen already carries
// a patch against. Adding Kavacha's entry there would put a third party in
// that queue and hand us a rebase conflict on every Firefox uplift that
// touches the map. `registerPrefSidebar(pref, commandID, config)` is the same
// call Firefox uses for its own pref-gated sidebars (chat, page assist,
// passwords), and it appends to the map that is already built — so calling it
// per window at startup produces exactly the entry the declarative form
// would, and touches no upstream file.
//
// The registration is pref-gated on `kavacha.ai.enabled`, the same master
// switch the bridge honours (ADR 0013): switch AI off and the sidebar
// disappears from the switcher, and if it was open it closes. Registering
// costs no network request — the page probes for a runtime only when it is
// actually asked to do something.

const kSidebarId = "viewKavachaAISidebar";
const kEnabledPref = "kavacha.ai.enabled";
const kSidebarUrl = "chrome://browser/content/kavacha/ai/sidebar.html";

export const KavachaAISidebar = {
  /**
   * Register the sidebar in one chrome window. Idempotent — a second call for
   * the same window is a no-op, which matters because KavachaStartup runs per
   * window and SidebarController is per window too.
   */
  register(window) {
    try {
      const controller = window.SidebarController;
      if (!controller || controller.sidebars?.has?.(kSidebarId)) {
        return;
      }
      // Touching `sidebars` first is load-bearing: it is a lazy getter that
      // BUILDS the map. registerPrefSidebar writes straight to `_sidebars`,
      // so calling it before anything has read the getter would throw on
      // undefined — and then generateSidebarsMap() would later rebuild the
      // map from scratch and drop our entry anyway.
      controller.sidebars;
      controller.registerPrefSidebar(kEnabledPref, kSidebarId, {
        name: "kavachaai",
        elementId: "sidebar-switcher-kavacha-ai",
        url: kSidebarUrl,
        menuId: "menu_kavachaAISidebar",
        menuL10nId: "kavacha-ai-sidebar-menu",
        revampL10nId: "kavacha-ai-sidebar-menu",
        iconUrl: "chrome://global/skin/icons/highlights.svg",
      });
    } catch (e) {
      // A missing sidebar costs a feature, never a window. Zen reshuffles the
      // browser box heavily and this is upstream machinery we do not own.
      console.error("KavachaAISidebar: registration failed", e);
    }
  },

  /**
   * Open the sidebar and run `job` inside its page once it has loaded.
   * Returns the page's content window, or null if the sidebar could not open.
   *
   * The job is handed over by CALLING THE PAGE, not by setting a pref or
   * stashing state: the page owns its own request/abort lifecycle, and a
   * caller that opens the sidebar twice in a row must not leave a queued
   * intent behind to fire later.
   */
  async open(window, job) {
    try {
      if (!Services.prefs.getBoolPref(kEnabledPref, true)) {
        return null;
      }
      this.register(window);
      await window.SidebarController.show(kSidebarId);
      const page = window.SidebarController.browser?.contentWindow;
      if (page && typeof job === "function") {
        // The page installs KavachaAISidebarPage on itself at DOMContentLoaded;
        // show() resolves on load, so it is there. Guard anyway — a failed
        // load should not throw out of a palette command.
        if (page.KavachaAISidebarPage) {
          job(page.KavachaAISidebarPage);
        }
      }
      return page;
    } catch (e) {
      console.error("KavachaAISidebar: open failed", e);
      return null;
    }
  },

  /** Open the sidebar and summarize the window's current page. */
  summarizeActivePage(window) {
    return this.open(window, page => page.summarizeCurrentPage());
  },

  /** Open the sidebar in Ask mode, optionally with a question pre-filled. */
  ask(window, question = "") {
    return this.open(window, page => page.focusAsk(question));
  },
};
