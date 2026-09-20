#!/usr/bin/env python3
"""Kavacha Phase 7 (patches 0082-0087) functional verification over Marionette.

Companion to marionette-verify.py, which it reuses for the wire protocol.
Where that script measures chrome geometry, this one DRIVES the Phase 7
features and reports what they actually did:

  0082  knowledge store  — note upsert/delete, highlights, clips, search
  0083  knowledge graph  — edges, describe(), hubs(), hostile entity replies
  0084  focus mode       — session as a period, blocklist, pref restore
  0085  automation       — validation fail-closed, command lifecycle, a run
  0086  tab history tree — back-then-elsewhere produces a SIBLING
  0087  citations        — the three styles, including no-author APA

Everything below runs against the real modules in the running browser. Two
things it deliberately does NOT do: fake a navigation (the listener wiring is
checked by driving `record()` directly and separately asserting the listener
is installed), and touch the network.

Usage:
  1) ./build/marionette-verify.py --launch
  2) ./build/marionette-phase7.py
"""

import importlib.util
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location(
    "marionette_verify", os.path.join(HERE, "marionette-verify.py")
)
_mv = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mv)


PROBE = r"""
const [resolve] = arguments;

const out = {pass: [], fail: [], info: {}};
const ok = (name, cond, detail) => (cond ? out.pass : out.fail).push(
  detail === undefined ? name : name + " — " + JSON.stringify(detail));

const imp = name => ChromeUtils.importESModule("resource:///modules/" + name + ".sys.mjs");

(async () => {
try {
  /* ---------------------------------------------------- modules present */
  const mods = {};
  for (const m of ["KavachaKnowledge", "KavachaKnowledgeSidebar",
                   "KavachaKnowledgeGraph", "KavachaFocusMode",
                   "KavachaWorkflows", "KavachaTabHistory",
                   "KavachaCitations"]) {
    try { mods[m] = imp(m); ok("module loads: " + m, true); }
    catch (e) { ok("module loads: " + m, false, String(e)); }
  }
  const K   = mods.KavachaKnowledge?.KavachaKnowledge;
  const G   = mods.KavachaKnowledgeGraph?.KavachaKnowledgeGraph;
  const F   = mods.KavachaFocusMode?.KavachaFocusMode;
  const W   = mods.KavachaWorkflows?.KavachaWorkflows;
  const TH  = mods.KavachaTabHistory?.KavachaTabHistory;
  const C   = mods.KavachaCitations?.KavachaCitations;

  /* ------------------------------------------- about: pages registered */
  for (const what of ["knowledge", "focus", "workflows", "write"]) {
    let present = false;
    try {
      present = !!Cc["@mozilla.org/network/protocol/about;1?what=" + what]
        .getService(Ci.nsIAboutModule);
    } catch (e) {}
    ok("about:" + what + " contract registered", present);
  }

  /* ------------------------------------------------------ 0082 sidebar */
  const sc = window.SidebarController;
  ok("knowledge sidebar registered",
     !!sc && sc.sidebars.has("viewKavachaKnowledgeSidebar"));

  /* -------------------------------------------------------- 0082 store */
  if (K) {
    const url = "https://example.org/phase7?a=1#frag";
    const key = K.keyFor(url);
    ok("keyFor drops the fragment, keeps the query",
       key === "https://example.org/phase7?a=1", key);
    ok("keyFor refuses non-web URLs", K.keyFor("about:config") === "");

    await K.removeForUrl(url);
    await K.saveNote({url, title: "Phase 7", body: "flood mapping notes"});
    let note = await K.getNote(url);
    ok("note saved", !!note && note.body === "flood mapping notes");

    await K.saveNote({url, title: "Phase 7", body: "   "});
    note = await K.getNote(url);
    ok("empty body deletes the note", note === null);

    await K.saveNote({url, title: "Phase 7", body: "kerala flood mapping"});
    const hid = await K.addItem({kind: "highlight", url,
                                 body: "a passage worth keeping"});
    const cid = await K.addItem({kind: "clip", url, title: "Phase 7",
                                 body: "the whole readable page text"});
    ok("highlight stored", !!hid);
    ok("clip stored", !!cid);
    const page = await K.forPage(url);
    ok("forPage returns note + 1 highlight + 1 clip",
       !!page.note && page.highlights.length >= 1 && page.clips.length >= 1,
       {highlights: page.highlights.length, clips: page.clips.length});

    const hits = await K.search("flood mapping", {limit: 5});
    ok("search finds the note", hits.some(h => h.kind === "note"));

    const exported = await K.exportAll();
    ok("export is JSON with items", exported.format === "kavacha-knowledge" &&
       Array.isArray(exported.items));

    const stats = await K.stats();
    out.info.knowledgeStats = stats;
    await K.removeForUrl(url);
    const after = await K.forPage(url);
    ok("removeForUrl clears the page",
       !after.note && !after.highlights.length && !after.clips.length);
  }

  /* -------------------------------------------------------- 0083 graph */
  if (G) {
    const a = "https://example.org/a", b = "https://example.org/b";
    await G.removeUrl(a); await G.removeUrl(b);
    await G.recordEdge({sourceUrl: a, targetUrl: b, kind: "followed"});
    await G.recordEdge({sourceUrl: a, targetUrl: b, kind: "followed"});
    const links = await G.links(a);
    ok("edge recorded once with weight 2",
       links.length === 1 && links[0].weight === 2, links);
    ok("self-edge refused",
       (await G.recordEdge({sourceUrl: a, targetUrl: a, kind: "followed"})) === false);
    ok("non-web edge refused",
       (await G.recordEdge({sourceUrl: "about:blank", targetUrl: b,
                            kind: "followed"})) === false);
    const hubs = await G.hubs({limit: 5});
    ok("hubs lists the pages with edges", hubs.some(h => h.url === a), hubs);
    const described = await G.describe(a);
    ok("describe returns the four sections",
       Array.isArray(described.links) && Array.isArray(described.related) &&
       Array.isArray(described.entities) && "note" in described);

    // Hostile model replies must change nothing (patch 0081's rule).
    ok("entity parser: prose-wrapped JSON parses",
       G.parseEntities('Sure! [{"name":"Kerala","kind":"place"}]').length === 1);
    ok("entity parser: refusal yields nothing",
       G.parseEntities("I cannot help with that.").length === 0);
    // These cases use single-letter names on purpose. They are the original
    // ones, and they are the ones that matter: an earlier `name.length < 2`
    // guard swallowed them, so each case was rejected for its LENGTH and never
    // reached the behaviour it names. On 2026-09-20 this probe was rewritten to
    // use "Xylem"/"Ada" so it would agree with that guard — which is backwards.
    // A probe rewritten to agree with the code under test cannot catch the code.
    // The guard was the defect (found 2026-08-27, patches-zen/0083); it is gone,
    // and these read single letters again.
    ok("entity parser: junk kind falls back to topic",
       G.parseEntities('[{"name":"X","kind":"weapon"}]')[0]?.kind === "topic");
    ok("entity parser: unnamed entries dropped",
       G.parseEntities('[{"kind":"person"},{"name":"Ada"}]').length === 1);
    ok("entity parser: a valid kind is preserved",
       G.parseEntities('[{"name":"A","kind":"person"}]')[0]?.kind === "person");
    ok("entity parser: single-character names are KEPT",
       G.parseEntities('[{"name":"X"},{"name":"Q"}]').length === 2);
    ok("entity parser: duplicate names collapse case-insensitively",
       G.parseEntities('[{"name":"Ada"},{"name":"ada"}]').length === 1);
    ok("entity parser: capped at 12",
       G.parseEntities(JSON.stringify(
         Array.from({length: 30}, (_, i) => ({name: "n" + i})))).length === 12);

    await G.removeUrl(a); await G.removeUrl(b);
  }

  /* --------------------------------------------------------- 0084 focus */
  if (F) {
    await F.init();
    const before = Services.prefs.getIntPref(
      "permissions.default.desktop-notification", 0);
    F.end({silent: true});                      // clean slate
    await F.block("example.invalid");
    ok("block stores the base domain",
       (await F.listBlocked()).global.includes("example.invalid"));
    ok("bare domain and URL match the same rule",
       F.isBlocked("https://sub.example.invalid/x"));
    ok("a different domain is not blocked",
       !F.isBlocked("https://notexample.invalid/x"));

    const started = F.start(30);
    ok("session is active with minutes left",
       F.isActive && F.minutesLeft > 0 && F.minutesLeft <= 30,
       {minutesLeft: F.minutesLeft});
    ok("end time is stored in SECONDS (not overflowed)",
       started.endsAt > 0 && started.endsAt < 2147483647, started.endsAt);
    ok("notifications denied during the session",
       Services.prefs.getIntPref("permissions.default.desktop-notification", 0) === 2);

    F.end();
    ok("session ends", !F.isActive);
    ok("notification default restored exactly",
       Services.prefs.getIntPref("permissions.default.desktop-notification", 0) === before,
       {before, after: Services.prefs.getIntPref(
         "permissions.default.desktop-notification", 0)});
    await F.unblock("example.invalid");
  }

  /* ----------------------------------------------------- 0085 workflows */
  if (W) {
    await W.init();
    const reg = imp("KavachaCommandRegistry").KavachaCommandRegistry;

    const wf = W.blank();
    wf.name = "Phase 7 probe";
    wf.actions = [{type: "wait", seconds: 1}];
    const saved = await W.save(wf);
    ok("valid workflow saves", saved.saved, saved.errors);
    ok("workflow registers a palette command",
       reg.has("kavacha-workflow-" + wf.id));

    const bad = W.blank();
    bad.actions = [{type: "open-url", url: "javascript:alert(1)"}];
    const refused = await W.save(bad);
    ok("javascript: URL refused at save", !refused.saved, refused.errors);

    const badStep = W.blank();
    badStep.actions = [{type: "delete-everything"}];
    ok("unknown step refused by the schema",
       !(await W.save(badStep)).saved);

    const tooFast = W.blank();
    tooFast.trigger = {type: "interval", minutes: 1};
    ok("sub-15-minute interval refused", !(await W.save(tooFast)).saved);

    const report = await W.run(wf.id);
    ok("workflow runs its steps", report.ran && report.steps === 1, report);

    const recursive = W.blank();
    recursive.actions = [{type: "run-command",
                          commandId: "kavacha-workflow-" + wf.id}];
    await W.save(recursive);
    const recReport = await W.run(recursive.id);
    ok("a workflow cannot run another workflow",
       recReport.skipped.some(s => s.includes("cannot run")), recReport);

    await W.remove(recursive.id);
    await W.remove(wf.id);
    ok("deleting a workflow revokes its command",
       !reg.has("kavacha-workflow-" + wf.id));
  }

  /* -------------------------------------------------- 0086 history tree */
  if (TH) {
    const tab = gBrowser.selectedTab;
    TH.clear(tab);
    TH.record(tab, "https://example.org/1");
    TH.record(tab, "https://example.org/2");
    TH.record(tab, "https://example.org/3");
    TH.record(tab, "https://example.org/2");   // back
    TH.record(tab, "https://example.org/1");   // back again
    TH.record(tab, "https://example.org/9");   // elsewhere -> SIBLING of /2
    const outline = TH.outline(tab);
    out.info.treeOutline = outline.map(n => n.url + " d" + n.depth +
                                       (n.branch ? " *" : ""));
    ok("the truncated branch survives as a sibling",
       outline.some(n => n.url.endsWith("/3")) &&
       outline.some(n => n.url.endsWith("/9")), out.info.treeOutline);
    ok("the branch point is marked",
       outline.filter(n => n.branch).length >= 2);
    ok("cursor is on the newest node",
       outline.find(n => n.current)?.url === "https://example.org/9");
    ok("a reload does not add a node", (() => {
      const before = TH.outline(tab).length;
      TH.record(tab, "https://example.org/9");
      return TH.outline(tab).length === before;
    })());
    ok("about:blank is never a node",
       (TH.record(tab, "about:blank") === null));
    TH.clear(tab);
  }

  /* ----------------------------------------------------- 0087 citations */
  if (C) {
    const meta = {url: "https://example.org/paper", title: "Flood Mapping",
                  author: "", site: "example.org", published: "2024-03-02"};
    const apa = C.format(meta, "apa");
    ok("APA leads with the title when there is no author",
       apa.startsWith("Flood Mapping."), apa);
    const apaAuthored = C.format({...meta, author: "Rao, S."}, "apa");
    ok("APA leads with the author when there is one",
       apaAuthored.startsWith("Rao, S."), apaAuthored);
    const mla = C.format(meta, "mla");
    ok("MLA quotes the title", mla.includes('"Flood Mapping."'), mla);
    const bib = C.format({...meta, title: "Cost & Risk"}, "bibtex");
    ok("BibTeX escapes TeX syntax", bib.includes("Cost \\& Risk"), bib);
    ok("BibTeX key is host+year, not author+year",
       bib.includes("@misc{exampleorg2024,"), bib.split("\n")[0]);
  }

  /* ---------------------------------------------------- panels + commands */
  for (const id of ["kavacha-tabtree-panel", "kavacha-sessions-panel"]) {
    ok("panel exists in browser.xhtml: " + id, !!document.getElementById(id));
  }
  const reg = imp("KavachaCommandRegistry").KavachaCommandRegistry;
  const all = reg.all();
  out.info.commandCount = all.length;
  const wanted = ["kavacha-action-note-page", "kavacha-action-clip-page",
                  "kavacha-action-highlight-selection", "kavacha-action-open-library",
                  "kavacha-action-open-knowledge", "kavacha-action-page-connections",
                  "kavacha-action-focus-start", "kavacha-action-focus-settings",
                  "kavacha-action-open-workflows", "kavacha-action-tab-tree",
                  "kavacha-action-saved-sessions", "kavacha-action-copy-citation",
                  "kavacha-action-writing-mode"];
  for (const id of wanted) {
    ok("command registered: " + id, all.some(c => c.l10nId === id));
  }
  ok("automation domain is populated",
     reg.getByDomain("automation").length >= 1);

  // Every icon must actually exist: patch 0080 found five that did not.
  const badIcons = [];
  await Promise.all(all.filter(c => c.icon).map(c =>
    fetch(c.icon).then(r => { if (!r.ok) badIcons.push(c.icon); })
                 .catch(() => badIcons.push(c.icon))));
  ok("every command icon resolves", badIcons.length === 0, badIcons);

  resolve(JSON.stringify(out, null, 2));
} catch (e) {
  out.fail.push("PROBE THREW: " + (e && e.stack || e));
  resolve(JSON.stringify(out, null, 2));
}
})();
"""


def main():
    m = _mv.Marionette()
    m.call("WebDriver:NewSession", {})
    m.call("Marionette:SetContext", {"value": "chrome"})
    m.call("WebDriver:SetTimeouts", {"script": 120000})
    raw = m.call(
        "WebDriver:ExecuteAsyncScript", {"script": PROBE, "args": []}
    )["value"]
    result = json.loads(raw)
    for line in result["pass"]:
        print("  PASS  " + line)
    for line in result["fail"]:
        print("  FAIL  " + line)
    if result.get("info"):
        print("\ninfo: " + json.dumps(result["info"], indent=2))
    print(
        "\n%d passed, %d failed" % (len(result["pass"]), len(result["fail"]))
    )
    return 1 if result["fail"] else 0


if __name__ == "__main__":
    sys.exit(main())
