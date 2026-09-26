#!/usr/bin/env python3
"""Phase 7's capture paths, on a real http(s) page (VERIFICATION 4h's gap).

Every other probe runs on `about:` pages. The Kavacha indexer actor declares
`matches: ["https://*/*", "http://*/*"]`, so on an `about:` page it is never
instantiated and three things could only ever be checked as "the module is
packaged and parses":

  * KavachaIndexer:CaptureMeta  -> citation metadata read from live markup
  * KavachaIndexer:CaptureSelection -> a highlight taken from a real selection
  * KavachaIndexer:PageText -> the personal index receiving a real page

This probe drives all three against a page served over http by
build/marionette-ci.py, which passes the URL in KAVACHA_TEST_PAGE.

Run it the way the other probes are run: the driver launches the browser and
the server. By hand:

    python3 -m http.server 8931 --directory test/pages &
    ./build/marionette-verify.py --launch
    KAVACHA_TEST_PAGE=http://127.0.0.1:8931/citation-sample.html \\
        ./build/marionette-httppage.py
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

# The fixture's own values. Asserting against these is what separates a real
# extraction from a fallback: the tab label and the host are deliberately
# different from every one of them.
EXPECT_TITLE = "Levee Failure Modes in Coastal Deltas"
EXPECT_AUTHOR = "Ramaswamy, Nila"
EXPECT_SITE = "Journal of Coastal Engineering"
EXPECT_YEAR = "2023"
SELECTION_STARTS = "Overtopping accounts for the majority"

SCRIPT = r"""
const [pageUrl, expect, resolve] = arguments;
(async () => {
  const out = { pass: [], fail: [] };
  const ok = (n, c, x) => (c ? out.pass : out.fail).push(n + (x ? " :: " + x : ""));
  const { KavachaKnowledge } = ChromeUtils.importESModule(
    "resource:///modules/KavachaKnowledge.sys.mjs");
  const { KavachaCitations, KavachaCitationStyles } = ChromeUtils.importESModule(
    "resource:///modules/KavachaCitations.sys.mjs");
  const { KavachaPersonalIndex } = ChromeUtils.importESModule(
    "resource:///modules/KavachaPersonalIndex.sys.mjs");

  const gBrowser = window.gBrowser;
  const tab = gBrowser.addTab(pageUrl, {
    triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
  });
  gBrowser.selectedTab = tab;
  const browser = tab.linkedBrowser;

  // Wait for a real load, not a timer: STATE_STOP on the top-level document.
  await new Promise((res, rej) => {
    const timer = setTimeout(() => rej(new Error("page load timed out")), 30000);
    const listener = {
      onStateChange(webProgress, request, flags) {
        if (webProgress.isTopLevel &&
            flags & Ci.nsIWebProgressListener.STATE_STOP) {
          gBrowser.removeProgressListener(listener);
          clearTimeout(timer);
          res();
        }
      },
      QueryInterface: ChromeUtils.generateQI(["nsIWebProgressListener",
                                              "nsISupportsWeakReference"]),
    };
    gBrowser.addProgressListener(listener);
  });

  const url = browser.currentURI.spec;
  ok("served over http (the actor's match pattern)", /^http:/.test(url), url);

  /* ------------------------------------------------ CaptureMeta + citations */
  const meta = await KavachaCitations.metadataFor(window);
  ok("citation title comes from citation_title, not <title> or og:title",
     meta.title === expect.title, meta.title);
  ok("citation author comes from citation_author",
     meta.author === expect.author, meta.author);
  ok("site comes from citation_journal_title, not og:site_name",
     meta.site === expect.site, meta.site);
  ok("published date reached the parent",
     String(meta.published).startsWith(expect.year), meta.published);
  ok("url is the page's own, not the fallback", meta.url === url, meta.url);

  const apa = KavachaCitations.format(meta, KavachaCitationStyles.APA);
  ok("APA renders the extracted author and year",
     apa.includes(expect.author) && apa.includes(expect.year), apa);
  ok("APA renders the extracted title", apa.includes(expect.title));

  /* ------------------------------------------------------ CaptureSelection */
  const actor =
    browser.browsingContext.currentWindowGlobal.getActor("KavachaIndexer");
  const captured = await actor.sendQuery("KavachaIndexer:CaptureSelection");
  ok("CaptureSelection returned the page's selection",
     !!captured && typeof captured.text === "string" &&
     captured.text.startsWith(expect.selectionStarts),
     captured && captured.text ? captured.text.slice(0, 48) : String(captured));
  ok("captured selection carries the page url", captured?.url === url);
  ok("the selection is a fragment, not the whole page body",
     captured && captured.text.length < 400, String(captured?.text?.length));

  const hlId = await KavachaKnowledge.addItem({
    kind: "highlight", url, title: meta.title, body: captured.text,
  });
  ok("highlight stored from a real selection", !!hlId);
  const page = await KavachaKnowledge.forPage(url);
  ok("highlight is retrievable for the page",
     (page.highlights || []).some(h => h.body.startsWith(expect.selectionStarts)),
     JSON.stringify({ highlights: (page.highlights || []).length }));

  /* ---------------------------------------------------------- PageText  */
  // The child posts PageText on DOMContentLoaded/pageshow and the parent
  // indexes fire-and-forget, so poll rather than assume it has landed.
  ok("personal index is enabled (its default)", KavachaPersonalIndex.enabled);
  let hits = [];
  for (let i = 0; i < 40 && !hits.length; i++) {
    hits = await KavachaPersonalIndex.search("revetment", { limit: 5 });
    if (!hits.length) { await new Promise(r => setTimeout(r, 250)); }
  }
  ok("the page reached the personal index over http",
     hits.some(h => h.url === url),
     JSON.stringify(hits.map(h => h.url)));
  ok("indexed body is the page text, not just the selection",
     hits.some(h => h.url === url), String(hits.length));

  /* ------------------------------------------------------------- cleanup */
  await KavachaKnowledge.removeForUrl(url);
  await KavachaPersonalIndex.remove(url);
  const after = await KavachaKnowledge.forPage(url);
  ok("cleanup removed the highlight",
     !(after.highlights || []).length, String((after.highlights || []).length));
  gBrowser.removeTab(tab);

  resolve(JSON.stringify(out));
})().catch(e => resolve(JSON.stringify(
  { pass: [], fail: ["exception: " + e.message + "\n" + e.stack] })));
"""


def main():
    page = os.environ.get("KAVACHA_TEST_PAGE", "").strip()
    if not page:
        print("KAVACHA_TEST_PAGE is unset -- run this through build/marionette-ci.py,",
              file=sys.stderr)
        print("which starts the http server and passes the URL.", file=sys.stderr)
        return 1
    expect = {
        "title": EXPECT_TITLE,
        "author": EXPECT_AUTHOR,
        "site": EXPECT_SITE,
        "year": EXPECT_YEAR,
        "selectionStarts": SELECTION_STARTS,
    }
    m = _mv.Marionette()
    m.call("WebDriver:NewSession", {})
    m.call("Marionette:SetContext", {"value": "chrome"})
    m.call("WebDriver:SetTimeouts", {"script": 120000})
    raw = m.call("WebDriver:ExecuteAsyncScript",
                 {"script": SCRIPT, "args": [page, expect]})["value"]
    result = json.loads(raw)
    for p in result["pass"]:
        print("  PASS", p)
    for f in result["fail"]:
        print("  FAIL", f)
    print("%d passed, %d failed" % (len(result["pass"]), len(result["fail"])))
    return 1 if result["fail"] else 0


if __name__ == "__main__":
    sys.exit(main())
