#!/usr/bin/env python3
"""!bang shortcuts, driven at runtime (ADR 0022).

Two things need proving and they are different:

  1. Resolution is correct AND LOCAL -- the destination is computed in the
     parent process from a template, so nothing is sent to a search engine.
  2. The urlbar actually offers it as the HEURISTIC result, because that is
     what Enter activates. A provider that registers and returns nothing is
     the patch-0059 shape: every static gate passes and the feature is dead.

The second is the one that cannot be checked by reading source.
"""

import importlib.util
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location(
    "mv", os.path.join(HERE, "marionette-verify.py")
)
_mv = importlib.util.module_from_spec(spec)
spec.loader.exec_module(_mv)

SCRIPT = r"""
const [testPage, resolve] = arguments;
(async () => {
  const out = { pass: [], fail: [] };
  const ok = (n, c, x) => (c ? out.pass : out.fail).push(n + (x ? " :: " + x : ""));
  const { KavachaBangs } = ChromeUtils.importESModule(
    "resource:///modules/KavachaBangs.sys.mjs");
  await KavachaBangs.init();

  /* ------------------------------------------------------------- parsing */
  ok("leading bang parses",
     JSON.stringify(KavachaBangs.parse("!w kestrel")) ===
     JSON.stringify({ key: "w", query: "kestrel" }));
  ok("trailing bang parses",
     JSON.stringify(KavachaBangs.parse("kestrel !w")) ===
     JSON.stringify({ key: "w", query: "kestrel" }));
  ok("bare bang parses with an empty query",
     JSON.stringify(KavachaBangs.parse("!w")) ===
     JSON.stringify({ key: "w", query: "" }));
  ok("bang names are case-insensitive", KavachaBangs.parse("!W x").key === "w");
  ok("plain text is not a bang", KavachaBangs.parse("kestrel") === null);
  ok("a bare ! is not a bang", KavachaBangs.parse("!") === null);
  ok("mid-string ! is not a bang", KavachaBangs.parse("a!b c") === null);

  /* ----------------------------------------------------------- resolution */
  const w = KavachaBangs.resolve("!w kestrel");
  ok("resolves to the site's own search URL",
     w && w.url === "https://en.wikipedia.org/w/index.php?search=kestrel", w && w.url);
  ok("query is URI-encoded",
     KavachaBangs.resolve("!w a b&c").url.includes("a%20b%26c"),
     KavachaBangs.resolve("!w a b&c").url);
  ok("bare bang goes to the site home",
     KavachaBangs.resolve("!w").url === "https://en.wikipedia.org/");
  ok("trailing form resolves identically",
     KavachaBangs.resolve("kestrel !w").url === w.url);

  // The privacy-critical one: an UNKNOWN bang must resolve to nothing, so the
  // urlbar falls through to normal handling rather than us inventing a target.
  ok("an unknown bang does not resolve",
     KavachaBangs.resolve("!notarealbang secret") === null);

  /* ----------------------------------------------------------- user bangs */
  const added = await KavachaBangs.setUserBang("probe", {
    title: "Probe", template: "https://example.org/s?q={q}" });
  ok("a user bang can be added", added === true);
  ok("user bang resolves",
     KavachaBangs.resolve("!probe hello")?.url === "https://example.org/s?q=hello",
     KavachaBangs.resolve("!probe hello")?.url);
  ok("a user bang overrides a built-in of the same name",
     (await KavachaBangs.setUserBang("w", {
        title: "Mine", template: "https://example.net/?x={q}" })) &&
     KavachaBangs.resolve("!w kestrel").url === "https://example.net/?x=kestrel");
  ok("a template without {q} is refused",
     (await KavachaBangs.setUserBang("bad1", { template: "https://example.org/" })) === false);
  ok("a non-http template is refused",
     (await KavachaBangs.setUserBang("bad2", { template: "javascript:alert(1)//{q}" })) === false);
  ok("a bang can be removed", (await KavachaBangs.removeUserBang("w")) === true);
  ok("removing restores the built-in",
     KavachaBangs.resolve("!w kestrel").url === w.url);

  /* -------------------------------------------- the urlbar actually uses it */
  // A provider that registers but never yields a result is the 0059 shape.
  // Firefox 153 has no global providers singleton: ProvidersManager is a class
  // with one instance per search access point, so check the "urlbar" one.
  const { ProvidersManager } = ChromeUtils.importESModule(
    "moz-src:///browser/components/urlbar/UrlbarProvidersManager.sys.mjs");
  const mgr = ProvidersManager.getInstanceForSap("urlbar");
  const provider = mgr.getProvider("KavachaBangs");
  ok("the bang provider is registered on the urlbar", !!provider);

  if (provider) {
    const context = { searchString: "!w kestrel", isPrivate: false };
    ok("provider is active for a known bang", await provider.isActive(context));
    ok("provider is NOT active for plain text",
       !(await provider.isActive({ searchString: "kestrel", isPrivate: false })));
    ok("provider is NOT active for an unknown bang",
       !(await provider.isActive({ searchString: "!notarealbang x", isPrivate: false })));

    const got = [];
    provider.startQuery(context, (_p, r) => got.push(r));
    ok("startQuery yielded a result", got.length === 1, String(got.length));
    ok("it is the HEURISTIC result, so Enter goes there", got[0]?.heuristic === true);
    ok("it points at the resolved URL, not a search engine",
       got[0]?.payload?.url === w.url, got[0]?.payload?.url);
    // registerProvider keeps heuristic providers at the front; sitting behind
    // the default search heuristic would mean Enter still searches.
    const firstNonHeuristic =
      mgr.providers.findIndex(p => p.type !== provider.type);
    ok("it sorts among the heuristic providers",
       mgr.providers.indexOf(provider) >= 0 &&
       (firstNonHeuristic === -1 ||
        mgr.providers.indexOf(provider) < firstNonHeuristic),
       mgr.providers.indexOf(provider) + " of " + mgr.providers.length);
  }

  /* ------------------------------- END TO END: typed, selected, Enter */
  // Everything above tests the provider in isolation. This types into the REAL
  // address bar, lets the full urlbar pipeline run, and presses Enter -- which
  // is the only thing that proves a bang actually takes you somewhere.
  //
  // The bang points at the local test server rather than Wikipedia: a probe
  // that depends on a third party measures the third party, and 2026-10-04's
  // new-tab investigation already produced one false finding that way.
  if (!testPage) {
    out.fail.push("end-to-end skipped: KAVACHA_TEST_PAGE unset (run via marionette-ci.py)");
  } else {
    const target = testPage + "?q=kestrel";
    await KavachaBangs.setUserBang("e2e", {
      title: "E2E", template: testPage + "?q={q}" });

    const typed = "!e2e kestrel";
    gURLBar.focus();
    gURLBar.value = typed;
    gURLBar.userTypedValue = typed;
    gURLBar.startQuery({ searchString: typed });

    // Wait for the query to settle rather than guessing a delay.
    let sel = null;
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 100));
      sel = gURLBar.view?.selectedResult;
      if (sel) { break; }
    }
    ok("typing a bang selects a result in the urlbar view", !!sel,
       sel ? sel.providerName : "none (view open: " + gURLBar.view?.isOpen + ")");
    ok("the selected result is the bang provider's",
       sel?.providerName === "KavachaBangs", sel?.providerName);
    ok("the selected result is heuristic", sel?.heuristic === true);
    ok("the selected result points at the resolved URL",
       sel?.payload?.url === target, sel?.payload?.url);

    // Enter.
    const navigated = new Promise(res => {
      const t = setTimeout(() => res("timeout"), 20000);
      const l = {
        onStateChange(wp, req, flags) {
          if (wp.isTopLevel && flags & Ci.nsIWebProgressListener.STATE_STOP) {
            gBrowser.removeProgressListener(l); clearTimeout(t);
            res(gBrowser.selectedBrowser.currentURI.spec);
          }
        },
        QueryInterface: ChromeUtils.generateQI(["nsIWebProgressListener",
                                                "nsISupportsWeakReference"]),
      };
      gBrowser.addProgressListener(l);
    });
    gURLBar.handleCommand();
    const landed = await navigated;
    ok("Enter navigated to the bang's destination", landed === target, landed);
    ok("the search engine was never involved",
       !/duckduckgo|google|bing|search\?/i.test(String(landed)), landed);

    await KavachaBangs.removeUserBang("e2e");
  }

  await KavachaBangs.removeUserBang("probe");
  resolve(JSON.stringify(out));
})().catch(e => resolve(JSON.stringify(
  { pass: [], fail: ["exception: " + e.message + "\n" + e.stack] })));
"""


def main():
    m = _mv.Marionette()
    m.call("WebDriver:NewSession", {})
    m.call("Marionette:SetContext", {"value": "chrome"})
    m.call("WebDriver:SetTimeouts", {"script": 120000})
    raw = m.call("WebDriver:ExecuteAsyncScript", {"script": SCRIPT, "args": [os.environ.get("KAVACHA_TEST_PAGE", "")]})["value"]
    result = json.loads(raw)
    for p in result["pass"]:
        print("  PASS", p)
    for f in result["fail"]:
        print("  FAIL", f)
    print("%d passed, %d failed" % (len(result["pass"]), len(result["fail"])))
    return 1 if result["fail"] else 0


if __name__ == "__main__":
    sys.exit(main())
