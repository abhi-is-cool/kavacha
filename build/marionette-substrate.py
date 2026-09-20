#!/usr/bin/env python3
"""Port milestone M2 probe: the Kavacha substrate on the Firefox ESR base.

Asserts, against a RUNNING build launched with `marionette-verify.py --launch`:
  * KavachaStartup and KavachaWorkspaces import and the startup service ran;
  * the window script ran (gKavacha.ready) and the stylesheet applied;
  * >= 1 space exists; creating a second, opening a tab in it, switching back
    hides that tab (tab.hidden === true) and switching forward shows it;
  * the tab carries the SessionStore custom value kavachaSpaceId;
  * the strip widget is in the tab strip with one button per visible space;
  * archive hides the space from the strip, unarchive restores it;
  * cleanup: the probe space is deleted and its tab moved home, so the profile
    is left with what it started with.

  * the command palette opens on its key and lists the registry;
  * about:kavacha-welcome loads as secure chrome UI;
  * the Kavacha Settings panes select and expand.

Exit 1 on any failure. The restart round-trip (a tab's space surviving a
relaunch) is marionette-restart.py, run in two phases around a relaunch.
"""

import importlib.util
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("mv", os.path.join(HERE, "marionette-verify.py"))
_mv = importlib.util.module_from_spec(spec)
spec.loader.exec_module(_mv)

SCRIPT = r"""
const [resolve] = arguments;
(async () => {
  const out = { pass: [], fail: [] };
  const ok = (name, cond, extra) => (cond ? out.pass : out.fail).push(name + (extra ? " :: " + extra : ""));
  // Closing the window's last tab closes the WINDOW, which unloads the chrome
  // document this script runs in — the probe then dies with "Document was
  // unloaded" and reports nothing. Never let tab count reach zero.
  const closeTab = t => {
    if (t && !t.closing && gBrowser.tabs.length > 1) { gBrowser.removeTab(t); }
  };
  const imp = m => { try { return ChromeUtils.importESModule("resource:///modules/" + m + ".sys.mjs"); } catch (e) { return null; } };

  const S = imp("KavachaStartup");
  ok("KavachaStartup imports", !!S);
  ok("KavachaStartup ran (initialized)", !!S?.KavachaStartup?.initialized);
  const W = imp("KavachaWorkspaces");
  ok("KavachaWorkspaces imports", !!W);
  ok("window script ran (gKavacha.ready)", window.gKavacha?.ready === true);
  ok("stylesheet applied (--kavacha-sheet-loaded)", getComputedStyle(document.documentElement).getPropertyValue("--kavacha-sheet-loaded").trim() === "1");

  const ws = window.gKavachaWorkspaces;
  ok("gKavachaWorkspaces defined", !!ws);
  if (!ws) { resolve(JSON.stringify(out)); return; }
  await ws.init();
  const before = ws.getWorkspaces();
  ok("at least one space", before.length >= 1, "count=" + before.length);
  const home = ws.getActiveWorkspaceFromCache();
  ok("active space is a record", !!home, home?.name);

  const strip = document.getElementById("kavacha-spaces-strip");
  ok("strip node in the tab strip", !!strip && !!strip.closest("#TabsToolbar"), strip?.parentElement?.id);

  // Create a probe space and switch to it.
  const probe = await ws.createAndSaveWorkspace("Probe", "\u{1F9EA}");
  ok("createAndSaveWorkspace returns record", !!probe?.id);
  ok("switch to probe space", ws.activeWorkspace === probe.id);
  // about:robots, not about:blank: KavachaSpaceHistory deliberately skips
  // blank placeholders, so a blank tab yields no snapshot and the branch /
  // timeline / compare chain below would never run.
  const tab = gBrowser.addTrustedTab("about:robots", { skipAnimation: true });
  await new Promise(r => setTimeout(r, 50));
  ok("new tab joined the active (probe) space", ws.spaceIdOfTab(tab) === probe.id, ws.spaceIdOfTab(tab));
  ok("SessionStore carries kavachaSpaceId", SessionStore.getCustomTabValue(tab, "kavachaSpaceId") === probe.id);
  ok("strip shows both spaces", strip && strip.querySelectorAll(".kavacha-space-button").length === ws.getWorkspaces().filter(s => !s.archived).length,
     strip && strip.querySelectorAll(".kavacha-space-button").length);

  // Back home: the probe tab must hide; forward: it must show.
  await ws.changeWorkspace(home);
  ok("switched home", ws.activeWorkspace === home.id);
  ok("probe tab hidden after switching away", tab.hidden === true);
  ok("selected tab belongs to home", ws.spaceIdOfTab(gBrowser.selectedTab) === home.id || gBrowser.selectedTab.pinned);
  await ws.changeWorkspace(probe);
  ok("probe tab shown after switching back", tab.hidden === false);
  // The space re-selects its LAST-selected tab (its new-tab page), not the
  // tab added in the background; both belong to the probe space.
  ok("selected tab belongs to probe space", ws.spaceIdOfTab(gBrowser.selectedTab) === probe.id);

  // Space identity (M3 subsystem 2: per-space settings + search engine on the switch).
  {
    const idn = window.gKavachaSpaceIdentity;
    ok("gKavachaSpaceIdentity defined", !!idn);
    if (idn) {
      ok("settings allowlist has 5 entries", idn.settings.length === 5);
      const before = Services.prefs.getIntPref("media.autoplay.default");
      probe.settings = { blockAutoplay: true };
      ws.saveWorkspace(probe);
      await ws.changeWorkspace(home);
      await ws.changeWorkspace(probe);
      ok("settings override applied on switch (media.autoplay.default=5)", Services.prefs.getIntPref("media.autoplay.default") === 5, Services.prefs.getIntPref("media.autoplay.default"));
      await ws.changeWorkspace(home);
      ok("baseline restored on switching away", Services.prefs.getIntPref("media.autoplay.default") === before, Services.prefs.getIntPref("media.autoplay.default"));
      delete probe.settings; ws.saveWorkspace(probe);
      const { SearchService } = ChromeUtils.importESModule("moz-src:///toolkit/components/search/SearchService.sys.mjs");
      await SearchService.promiseInitialized;
      const engines = await SearchService.getVisibleEngines();
      const current = SearchService.defaultEngine?.name;
      const other = engines.find(e => e.name !== current && !e.hidden);
      if (other) {
        probe.searchProvider = other.name; ws.saveWorkspace(probe);
        await ws.changeWorkspace(probe);
        await idn.applyWorkspaceSearchEngine(probe);
        ok("per-space search engine applied", SearchService.defaultEngine?.name === other.name, SearchService.defaultEngine?.name);
        await ws.changeWorkspace(home);
        await idn.applyWorkspaceSearchEngine(home);
        ok("default engine restored on switching away", SearchService.defaultEngine?.name === current, SearchService.defaultEngine?.name);
        delete probe.searchProvider; ws.saveWorkspace(probe);
      } else {
        ok("per-space search engine (skipped: only one engine)", true);
      }
      await ws.changeWorkspace(probe);
    }
  }

  // Universal search (ADR 0004; patches 0012/0055 on the Firefox base).
  {
    const us = window.gKavachaUniversalSearch;
    ok("gKavachaUniversalSearch defined", !!us);
    if (us) {
      await us.open();
      await new Promise(r => setTimeout(r, 400));
      const sp = document.getElementById("kavacha-search-panel");
      ok("search panel built and open", sp && (sp.state === "open" || sp.state === "showing"), sp?.state);
      ok("search input present", !!document.getElementById("kavacha-search-input"));
      ok("scope toggle present", !!document.getElementById("kavacha-search-scope-toggle"));
      const input = document.getElementById("kavacha-search-input");
      input.value = "about";
      input.dispatchEvent(new window.Event("input", { bubbles: true }));
      await new Promise(r => setTimeout(r, 900));
      const rows = document.querySelectorAll("#kavacha-search-results .kavacha-search-row");
      ok("search returns results for an open tab", rows.length > 0, "rows=" + rows.length);
      us.close();
      await new Promise(r => setTimeout(r, 200));
    }
  }

  // Research continuity: snapshot, branch, timeline, compare (ADR 0006;
  // patches 0019/0020/0054 on the Firefox base).
  {
    const H = imp("KavachaSpaceHistory");
    ok("KavachaSpaceHistory imports", !!H);
    ok("branch/timeline/compare on the facade", ["kavachaBranchSpace","kavachaOpenSpaceTimeline","kavachaCompareWithParent"].every(m => typeof ws[m] === "function"));
    if (H) {
      // Snapshot the probe space (it has a real tab), then branch from it.
      const snapId = await H.KavachaSpaceHistory.snapshotSpace(window, probe.id, "manual");
      ok("snapshot written", typeof snapId === "number" || snapId === null, String(snapId));
      const snaps = await H.KavachaSpaceHistory.listSnapshots(probe.id);
      ok("snapshot listed for the space", snaps.length >= 1, "count=" + snaps.length);
      if (snaps.length) {
        const branch = await ws.kavachaBranchSpace(snaps[0].id);
        ok("branch created from the snapshot", !!branch?.id);
        ok("branch records its parent", branch?.parentSpaceId === probe.id, branch?.parentSpaceId);
        ok("branch depth is 1", ws.kavachaBranchDepth(branch) === 1, ws.kavachaBranchDepth(branch));
        await ws.kavachaOpenSpaceTimeline(probe.id);
        await new Promise(r => setTimeout(r, 400));
        const tp = document.getElementById("kavacha-timeline-panel");
        ok("timeline panel opens", tp && (tp.state === "open" || tp.state === "showing"), tp?.state);
        ok("timeline lists the snapshot", document.querySelectorAll("#kavacha-timeline-list > hbox").length >= 1);
        tp?.hidePopup();
        await new Promise(r => setTimeout(r, 200));
        await ws.kavachaCompareWithParent(branch.id);
        await new Promise(r => setTimeout(r, 400));
        const cp = document.getElementById("kavacha-compare-panel");
        ok("compare panel opens for a branch", cp && (cp.state === "open" || cp.state === "showing"), cp?.state);
        cp?.hidePopup();
        await new Promise(r => setTimeout(r, 200));
        // Clean up: the branch's tabs go home with it.
        // deleteWorkspace moves the branch's tabs home; no manual removal.
        await ws.changeWorkspace(probe);
        await ws.deleteWorkspace(branch.id);
        ok("branch deleted", !ws.getWorkspaceFromId(branch.id));
      }
    }
  }

  // Workspace notes (patches 0008/0012/0052 on the Firefox base).
  {
    const N = imp("KavachaSpaceNotes"), Md = imp("KavachaMarkdown");
    ok("KavachaSpaceNotes imports", !!N);
    ok("KavachaMarkdown imports", !!Md);
    await ws.kavachaSetNote(probe.id, "hello **probe**");
    const all = await ws.kavachaGetAllNotes();
    ok("kavachaSetNote/kavachaGetAllNotes round-trip", all[probe.id]?.content === "hello **probe**");
    await ws.openWorkspaceNotes(probe.id);
    await new Promise(r => setTimeout(r, 300));
    const npanel = document.getElementById("kavacha-notes-panel");
    ok("notes panel opens", npanel && (npanel.state === "open" || npanel.state === "showing"), npanel?.state);
    ok("notes textarea shows the note", document.getElementById("kavacha-notes-textarea")?.value === "hello **probe**");
    ws.kavachaSetNotesPreview(true);
    ok("markdown preview renders", !!document.getElementById("kavacha-notes-preview")?.querySelector("strong"));
    npanel?.hidePopup();
    await new Promise(r => setTimeout(r, 200));
    await ws.kavachaSetNote(probe.id, "");
    ok("empty note deletes", !(await ws.kavachaGetAllNotes())[probe.id]);
  }

  // Archive / unarchive.
  await ws.archiveWorkspace(probe.id);
  ok("archive leaves home active", ws.activeWorkspace === home.id);
  ok("archived space not in strip", strip && !strip.querySelector(`.kavacha-space-button[data-space-id="${probe.id}"]`));
  ok("archived flag persisted", ws.getWorkspaceFromId(probe.id)?.archived === true);
  await ws.unarchiveWorkspace(probe.id);
  ok("unarchive re-activates", ws.activeWorkspace === probe.id);

  // Theme / layout / user CSS engines (M3 subsystem 1, ADR 0008/0009 on the Firefox base).
  {
    const T = imp("KavachaThemeEngine"), L = imp("KavachaLayoutEngine"), U = imp("KavachaUserCSS");
    ok("KavachaThemeEngine imports", !!T);
    ok("KavachaLayoutEngine imports", !!L);
    ok("KavachaUserCSS imports", !!U);
    if (T) {
      ok("active theme is kavacha-midnight", T.KavachaThemeEngine.activeThemeId === "kavacha-midnight", T.KavachaThemeEngine.activeThemeId);
      let stamped = false;
      for (let i = 0; i < 30 && !stamped; i++) { await new Promise(r => setTimeout(r, 100)); stamped = document.documentElement.hasAttribute("kavacha-theme-mode"); }
      ok("kavacha-theme-mode stamped on the root", stamped, document.documentElement.getAttribute("kavacha-theme-mode"));
      const surface = getComputedStyle(document.documentElement).getPropertyValue("--kavacha-surface").trim();
      ok("--kavacha-surface computes", !!surface, surface);
      const mode = Services.prefs.getStringPref("kavacha.theme.mode", "");
      ok("kavacha.theme.mode mirrors the engine", ["dark", "light", "system"].includes(mode), mode);
      const { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
      let active = null;
      for (let i = 0; i < 30 && !active; i++) { await new Promise(r => setTimeout(r, 100)); const a = await AddonManager.getAddonByID(mode === "light" ? "firefox-compact-light@mozilla.org" : mode === "system" ? "default-theme@mozilla.org" : "firefox-compact-dark@mozilla.org"); if (a?.isActive) active = a.id; }
      ok("matching built-in Firefox theme enabled", !!active, active);
    }
    if (L) {
      const layout = await L.KavachaLayoutEngine.getLayout();
      ok("layout document resolves", !!layout && typeof layout === "object", layout && layout.tabStyle);
    }
  }

  // Menu button + panel, Studio, Appearance pane (M3 subsystem 1b).
  {
    const M = imp("KavachaMenu"), A = imp("KavachaAppearancePanel"), St = imp("KavachaAboutStudio");
    ok("KavachaMenu imports", !!M);
    ok("KavachaAppearancePanel imports", !!A);
    ok("KavachaAboutStudio imports", !!St);
    let btn = null;
    for (let i = 0; i < 40 && !btn; i++) { await new Promise(r => setTimeout(r, 100)); btn = document.getElementById("kavacha-menu-button"); }
    ok("menu button injected", !!btn, btn?.parentElement?.id);
    ok("menu button lives in the nav bar", !!btn && !!btn.closest("#nav-bar"));
    const panel = document.getElementById("kavacha-menu-panel");
    ok("menu panel injected", !!panel);
    try {
      const stab = gBrowser.addTrustedTab("about:studio", { skipAnimation: true });
      const sb = stab.linkedBrowser;
      let sready = false;
      for (let i = 0; i < 80 && !sready; i++) { await new Promise(r => setTimeout(r, 100)); sready = sb.contentDocument?.readyState === "complete" && sb.currentURI?.spec === "about:studio" && !!sb.contentDocument.querySelector("[data-l10n-id], .studio, #studio, main, body > *"); }
      ok("about:studio loads", sready, sb.currentURI?.spec);
      ok("about:studio is chrome UI (in-process)", sb.browsingContext?.currentWindowGlobal?.isInProcess === true);
      closeTab(stab);
    } catch (e) { ok("about:studio", false, e.message); }
    try {
      const atab = gBrowser.addTrustedTab("about:preferences#kavachaAppearance", { skipAnimation: true });
      const ab = atab.linkedBrowser;
      let sel = null;
      for (let i = 0; i < 60 && !sel; i++) { await new Promise(r => setTimeout(r, 100)); sel = ab.contentDocument?.getElementById("kavachaAppearanceThemeSelect"); if (sel && sel.closest("[hidden]")) sel = null; }
      ok("Appearance pane renders its theme control", !!sel, sel ? "options=" + (sel.itemCount ?? sel.children.length) : "no control");
      closeTab(atab);
    } catch (e) { ok("appearance pane", false, e.message); }
  }

  // Workspaces-cluster leaves (M3 subsystem 2): new-tab dashboard, tab memory,
  // snapshots substrate, session cleanup, history attribution.
  {
    for (const m of ["KavachaNewTab", "KavachaTabMemory", "KavachaSpaceHistory", "KavachaSessionCleanup", "KavachaPlacesAttribution"]) {
      ok(m + " imports", !!imp(m));
    }
    const { AboutNewTab } = ChromeUtils.importESModule("resource:///modules/AboutNewTab.sys.mjs");
    const dash = Services.prefs.getBoolPref("kavacha.newtab.dashboard", true);
    ok("about:newtab routed per kavacha.newtab.dashboard", dash ? AboutNewTab.newTabURL === "chrome://browser/content/kavacha/newtab/index.html" : AboutNewTab.newTabURL !== "chrome://browser/content/kavacha/newtab/index.html", AboutNewTab.newTabURL);
    try {
      const { PlacesUtils } = ChromeUtils.importESModule("resource://gre/modules/PlacesUtils.sys.mjs");
      const rows = await PlacesUtils.withConnectionWrapper("probe", db => db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='kavacha_history_workspaces'"));
      ok("kavacha_history_workspaces table exists in places.sqlite", rows.length === 1);
    } catch (e) { ok("places attribution table", false, e.message); }
  }

  // Command palette (ADR 0020 §4c).
  const pal = window.gKavachaPalette;
  ok("gKavachaPalette defined", !!pal);
  if (pal) {
    ok("Ctrl/Cmd+K key registered", !!document.getElementById("key_kavachaPalette"));
    ok("Firefox key_search displaced", document.getElementById("key_search")?.getAttribute("disabled") === "true");
    await pal.open();
    await new Promise(r => setTimeout(r, 300));
    ok("palette panel open", pal.isOpen, document.getElementById("kavacha-palette")?.state);
    const ids = pal.visibleCommandIds;
    ok("palette lists commands", ids.length > 0, "rows=" + ids.length);
    ok("palette lists the template commands", ids.includes("kavacha-action-new-space-student"));
    const R = imp("KavachaCommandRegistry");
    ok("KavachaCommandRegistry imports", !!R && typeof R.KavachaCommandRegistry.all === "function");
    ok("registry has built-ins", R && R.KavachaCommandRegistry.all().length > 20, R && R.KavachaCommandRegistry.all().length);
    pal.close();
    await new Promise(r => setTimeout(r, 200));
    ok("palette closes", !pal.isOpen);
  }

  // Welcome page (ADR 0020 §4d): about:kavacha-welcome resolves and loads.
  try {
    const wtab = gBrowser.addTrustedTab("about:kavacha-welcome", { skipAnimation: true });
    const wb = wtab.linkedBrowser;
    // An about: page keeps its about: URI as documentURI; the chrome URL is
    // only the channel's source. The page marks itself ready once its script
    // ran, and it is in-process (secure chrome UI), so contentDocument is live.
    let ready = false;
    for (let i = 0; i < 80 && !ready; i++) {
      await new Promise(r => setTimeout(r, 100));
      ready = wb.contentDocument?.documentElement?.dataset?.kavachaWelcomeReady === "1";
    }
    ok("about:kavacha-welcome loads and its script runs", ready, wb.currentURI?.spec);
    ok("welcome runs in the parent (secure chrome UI)", wb.browsingContext?.currentWindowGlobal?.isInProcess === true);
    ok("welcome renders its steps", (wb.contentDocument?.querySelectorAll(".kw-step").length || 0) === 4);
    // Default branch: Marionette's own test prefs give the profile a user value of about:blank.
    ok("startup.homepage_welcome_url default points at it", Services.prefs.getDefaultBranch("").getStringPref("startup.homepage_welcome_url") === "about:kavacha-welcome");
    closeTab(wtab);
  } catch (e) {
    ok("welcome page", false, e.message);
  }

  // Settings panes (patch 0004 + overlay placeholders): the Kavacha nav
  // buttons exist and about:preferences#kavachaPrivacy selects its pane.
  try {
    const ptab = gBrowser.addTrustedTab("about:preferences#kavachaPrivacy", { skipAnimation: true });
    const pb = ptab.linkedBrowser;
    let pdoc = null, selected = false;
    for (let i = 0; i < 100 && !selected; i++) {
      await new Promise(r => setTimeout(r, 100));
      pdoc = pb.contentDocument;
      const btn = pdoc?.getElementById("category-kavacha-privacy");
      selected = !!btn && (btn.hasAttribute("selected") || btn.getAttribute("aria-selected") === "true" || pdoc.getElementById("categories")?.currentView === "paneKavachaPrivacy");
    }
    ok("about:preferences has the Kavacha nav buttons", !!pdoc?.getElementById("category-kavacha-workspaces"));
    ok("about:preferences#kavachaPrivacy selects the pane", selected, pdoc?.getElementById("categories")?.currentView);
    // gotoPref un-hides [data-category] nodes after the view change; wait for it.
    let cat = null;
    for (let i = 0; i < 30 && !(cat && !cat.hidden); i++) {
      await new Promise(r => setTimeout(r, 100));
      cat = pdoc?.getElementById("kavachaPrivacyCategory");
    }
    ok("Privacy Center pane body rendered", !!cat && !cat.hidden, cat ? "hidden=" + cat.hidden : "no node");
    // The real pane (patches 0021/0048/0049/0050) renders live counters from
    // Firefox's own blocking ledger and the permission/cookie stores.
    ok("privacy stats group present", !!pdoc?.getElementById("kavachaPrivacyStatsGroup"));
    ok("permission manager group present", !!pdoc?.getElementById("kavachaPermissionsGroup"));
    ok("cookie rules group present", !!pdoc?.getElementById("kavachaCookiesGroup"));
    let counter = null;
    for (let i = 0; i < 40 && !counter; i++) {
      await new Promise(r => setTimeout(r, 100));
      const v = pdoc?.getElementById("kavachaPrivacyValueAllTime")?.textContent?.trim();
      if (v && v !== "—") { counter = v; }
    }
    ok("all-time blocked counter resolves from the ledger", !!counter, counter);
    ok("pane labels localize (no raw fluent ids)", !/^kavacha-/.test(pdoc?.querySelector("#kavachaPrivacyStatsGroup label h2")?.textContent || "x"));
    closeTab(ptab);
  } catch (e) {
    ok("settings panes", false, e.message);
  }

  // Every ported module imports, and every about: page resolves AND executes.
  // This is the 0059 check: "present and packaged" is not "works" — a JS
  // about-module that registers but does not resolve looks identical from the
  // outside until you open it.
  {
    const MODULES = [
      "KavachaAIBridge", "KavachaAISidebar", "KavachaAskHistory", "KavachaTabAssistant",
      "KavachaPersonalIndex", "KavachaMarketplace", "KavachaSDK", "KavachaPluginManager",
      "KavachaPluginPermissions", "KavachaWidgetHost", "KavachaKnowledge",
      "KavachaKnowledgeGraph", "KavachaKnowledgeSidebar", "KavachaFocusMode",
      "KavachaWorkflows", "KavachaTabHistory", "KavachaCitations", "KavachaAppearancePanel",
    ];
    const missing = MODULES.filter(m => !imp(m));
    ok("every ported module imports", missing.length === 0, missing.join(", "));

    const PAGES = ["about:studio", "about:marketplace", "about:plugins", "about:knowledge",
                   "about:focus", "about:workflows", "about:write"];
    const bad = [];
    for (const url of PAGES) {
      try {
        const t = gBrowser.addTrustedTab(url, { skipAnimation: true });
        let loaded = false;
        for (let i = 0; i < 60 && !loaded; i++) {
          await new Promise(r => setTimeout(r, 100));
          const d = t.linkedBrowser.contentDocument;
          loaded = d?.readyState === "complete" && !!d.body && d.body.childElementCount > 0;
        }
        if (!loaded) { bad.push(url); }
        closeTab(t);
      } catch (e) {
        bad.push(url + " (" + e.message + ")");
      }
    }
    ok("every Kavacha about: page loads with content", bad.length === 0, bad.join(", "));

    // The indexer actor is what citations and the personal index both read
    // through. It matches http/https only, so it is correctly absent on an
    // about: page, and probing the live registry destructively (re-register /
    // unregister) unloaded the chrome document — don't. Assert what CAN be
    // asserted without a network page: both actor modules are packaged at the
    // resource:///actors/ URI the registration names, and they parse. Runtime
    // attachment on a real http(s) page is an L4 arm (M5), not this probe.
    const actors = ["KavachaIndexerParent", "KavachaIndexerChild"].filter(a => {
      try { return !!ChromeUtils.importESModule(`resource:///actors/${a}.sys.mjs`); }
      catch (e) { return false; }
    });
    ok("indexer actor modules packaged at resource:///actors/", actors.length === 2, actors.join(", "));
  }

  // Cleanup: delete probe (its tab moves home), then close that tab.
  await ws.deleteWorkspace(probe.id);
  ok("probe space deleted", !ws.getWorkspaceFromId(probe.id));
  ok("probe tab moved home", ws.spaceIdOfTab(tab) === home.id);
  closeTab(tab);
  ok("space count restored", ws.getWorkspaces().length === before.length);
  resolve(JSON.stringify(out));
})().catch(e => resolve(JSON.stringify({ pass: [], fail: ["exception: " + e.message + "\n" + e.stack] })));
"""


def main():
    m = _mv.Marionette()
    m.call("WebDriver:NewSession", {})
    m.call("Marionette:SetContext", {"value": "chrome"})
    m.call("WebDriver:SetTimeouts", {"script": 120000})
    raw = m.call("WebDriver:ExecuteAsyncScript", {"script": SCRIPT, "args": []})["value"]
    result = json.loads(raw)
    for p in result["pass"]:
        print("  PASS", p)
    for f in result["fail"]:
        print("  FAIL", f)
    print("%d passed, %d failed" % (len(result["pass"]), len(result["fail"])))
    return 1 if result["fail"] else 0


if __name__ == "__main__":
    sys.exit(main())
