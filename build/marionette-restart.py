#!/usr/bin/env python3
"""Restart round-trip for the Kavacha workspaces model (ADR 0021 / M2 gate).

Two phases around a browser relaunch on the SAME profile:

  phase 1 (browser running via marionette-verify.py --launch):
      create a space "Restart", open about:robots in it, switch home (the tab
      hides), flush SessionStore, quit the browser cleanly.
  phase 2 (after marionette-verify.py --launch again):
      the restored tab still carries kavachaSpaceId for "Restart", is hidden
      while home is active, the strip lists "Restart"; switching to it shows
      the tab. Cleanup: delete the space (tab moves home), close the tab.

Usage:
  ./build/marionette-verify.py --launch
  ./build/marionette-restart.py 1        # exits the browser at the end
  ./build/marionette-verify.py --launch
  ./build/marionette-restart.py 2
"""

import importlib.util
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("mv", os.path.join(HERE, "marionette-verify.py"))
_mv = importlib.util.module_from_spec(spec)
spec.loader.exec_module(_mv)

PHASE1 = r"""
const [resolve] = arguments;
(async () => {
  const out = { pass: [], fail: [] };
  const ok = (n, c, x) => (c ? out.pass : out.fail).push(n + (x ? " :: " + x : ""));
  const ws = window.gKavachaWorkspaces;
  await ws.init();
  const home = ws.getActiveWorkspaceFromCache();
  const space = await ws.createAndSaveWorkspace("Restart", "\u{1F501}");
  ok("space created + active", ws.activeWorkspace === space.id);
  const tab = gBrowser.addTrustedTab("about:robots", { skipAnimation: true });
  await new Promise(r => setTimeout(r, 500));
  ok("tab in Restart space", ws.spaceIdOfTab(tab) === space.id);
  await ws.changeWorkspace(home);
  ok("tab hidden after switching home", tab.hidden === true);
  // Persist: SessionStore writes on its own timer; force it, then quit cleanly
  // so the session file is final (no crash-resume path involved).
  await SessionStore.flushAllWindowsAsync?.() ?? null;
  const { SessionSaver } = ChromeUtils.importESModule("resource:///modules/sessionstore/SessionSaver.sys.mjs");
  await SessionSaver.run();
  Services.prefs.setIntPref("browser.startup.page", 3); // restore previous session on next launch
  out.spaceId = space.id;
  resolve(JSON.stringify(out));
  setTimeout(() => Services.startup.quit(Services.startup.eForceQuit), 300);
})().catch(e => resolve(JSON.stringify({ pass: [], fail: ["exception: " + e.message] })));
"""

PHASE2 = r"""
const [spaceId, resolve] = arguments;
(async () => {
  const out = { pass: [], fail: [] };
  const ok = (n, c, x) => (c ? out.pass : out.fail).push(n + (x ? " :: " + x : ""));
  await SessionStore.promiseAllWindowsRestored;
  const ws = window.gKavachaWorkspaces;
  await ws.init();
  await new Promise(r => setTimeout(r, 1500));
  const space = ws.getWorkspaceFromId(spaceId);
  ok("Restart space persisted in the store", !!space, spaceId);
  const tab = Array.from(gBrowser.tabs).find(t => (t.linkedBrowser.currentURI?.spec === "about:robots") || SessionStore.getCustomTabValue(t, "kavachaSpaceId") === spaceId);
  ok("about:robots tab restored", !!tab);
  ok("restored tab still in Restart space (SessionStore custom value)", tab && ws.spaceIdOfTab(tab) === spaceId, tab && ws.spaceIdOfTab(tab));
  ok("home is the active space after restart", ws.activeWorkspace !== spaceId);
  ok("restored tab hidden while home is active", tab && tab.hidden === true);
  const strip = document.getElementById("kavacha-spaces-strip");
  ok("strip lists Restart", !!strip?.querySelector(`.kavacha-space-button[data-space-id="${spaceId}"]`));
  if (space) {
    await ws.changeWorkspace(space);
    ok("switching to Restart shows the tab", tab && tab.hidden === false);
    await ws.deleteWorkspace(spaceId);
  }
  if (tab) { gBrowser.removeTab(tab); }
  Services.prefs.clearUserPref("browser.startup.page");
  resolve(JSON.stringify(out));
})().catch(e => resolve(JSON.stringify({ pass: [], fail: ["exception: " + e.message] })));
"""

STATE = os.path.join(os.path.dirname(HERE), "browser", "firefox-source", ".kavacha-restart-probe.json")


def run(script, args):
    m = _mv.Marionette()
    m.call("WebDriver:NewSession", {})
    m.call("Marionette:SetContext", {"value": "chrome"})
    m.call("WebDriver:SetTimeouts", {"script": 120000})
    return json.loads(m.call("WebDriver:ExecuteAsyncScript", {"script": script, "args": args})["value"])


def report(result):
    for p in result["pass"]:
        print("  PASS", p)
    for f in result["fail"]:
        print("  FAIL", f)
    print("%d passed, %d failed" % (len(result["pass"]), len(result["fail"])))
    return 1 if result["fail"] else 0


def main():
    phase = sys.argv[1] if len(sys.argv) > 1 else "1"
    if phase == "1":
        result = run(PHASE1, [])
        with open(STATE, "w") as f:
            json.dump({"spaceId": result.get("spaceId")}, f)
        print("browser quitting; relaunch, then run phase 2")
        return report(result)
    with open(STATE) as f:
        space_id = json.load(f)["spaceId"]
    result = run(PHASE2, [space_id])
    try:
        os.remove(STATE)
    except OSError:
        pass
    return report(result)


if __name__ == "__main__":
    sys.exit(main())
