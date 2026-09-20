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
  const tab = gBrowser.addTrustedTab("about:blank", { skipAnimation: true });
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

  // Archive / unarchive.
  await ws.archiveWorkspace(probe.id);
  ok("archive leaves home active", ws.activeWorkspace === home.id);
  ok("archived space not in strip", strip && !strip.querySelector(`.kavacha-space-button[data-space-id="${probe.id}"]`));
  ok("archived flag persisted", ws.getWorkspaceFromId(probe.id)?.archived === true);
  await ws.unarchiveWorkspace(probe.id);
  ok("unarchive re-activates", ws.activeWorkspace === probe.id);

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
    gBrowser.removeTab(wtab);
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
    ok("pane script ran (gKavachaPrivacyCenter.init)", cat?.hasAttribute("kavacha-placeholder") === true);
    gBrowser.removeTab(ptab);
  } catch (e) {
    ok("settings panes", false, e.message);
  }

  // Cleanup: delete probe (its tab moves home), then close that tab.
  await ws.deleteWorkspace(probe.id);
  ok("probe space deleted", !ws.getWorkspaceFromId(probe.id));
  ok("probe tab moved home", ws.spaceIdOfTab(tab) === home.id);
  gBrowser.removeTab(tab);
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
