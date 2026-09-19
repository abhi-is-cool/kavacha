// Exercise Phase 7's pure logic against the REAL modules with Gecko's globals
// stubbed — the same technique used to re-verify D8. Covers what does not need
// a browser: citation formatting, hostile entity replies, the tab-tree
// classifier, URL keying, and the non-schema half of workflow validation.

const prefs = new Map([
  ["kavacha.tabhistory.enabled", true],
  ["kavacha.tabhistory.max-nodes", 200],
  ["kavacha.knowledge.enabled", true],
  ["kavacha.workflows.enabled", true],
  ["kavacha.workflows.max-actions", 25],
  ["kavacha.citation.style", "apa"],
]);

globalThis.Services = {
  prefs: {
    getBoolPref: (k, d) => (prefs.has(k) ? prefs.get(k) : d),
    getIntPref: (k, d) => (prefs.has(k) ? prefs.get(k) : d),
    getCharPref: (k, d) => (prefs.has(k) ? prefs.get(k) : d),
    setCharPref: (k, v) => prefs.set(k, v),
    setIntPref: (k, v) => prefs.set(k, v),
    prefHasUserValue: k => prefs.has(k),
    clearUserPref: k => prefs.delete(k),
  },
  uuid: { generateUUID: () => ({ toString: () => "{" + "x".repeat(36) + "}" }) },
};
globalThis.ChromeUtils = {
  defineESModuleGetters: () => {},
  importESModule: () => ({
    // JsonSchema stub: this harness tests the checks the SCHEMA does not do.
    JsonSchema: { validate: () => ({ valid: true }) },
  }),
  generateQI: () => () => {},
};
globalThis.PathUtils = { join: (...a) => a.join("/"), profileDir: "/tmp" };
globalThis.console = console;

const here = new URL(".", import.meta.url);
// The real modules live in the overlay (ADR 0020), so this runs with no Firefox
// checkout at all. Until port milestone M3 moves them there, resolution fails.
const base = new URL("../../browser/overlay/browser/components/kavacha/modules/", here).href;
const results = { pass: [], fail: [] };
const ok = (name, cond, detail) =>
  (cond ? results.pass : results.fail).push(
    detail === undefined ? name : `${name} — ${JSON.stringify(detail)}`
  );

/* ------------------------------------------------------------- citations */
const { KavachaCitations } = await import(base + "KavachaCitations.sys.mjs");
const meta = {
  url: "https://example.org/paper",
  title: "Flood Mapping",
  author: "",
  site: "example.org",
  published: "2024-03-02",
};
const apa = KavachaCitations.format(meta, "apa");
ok("APA leads with the title when there is no author", apa.startsWith("Flood Mapping."), apa);
ok("APA marks an undated page n.d.", KavachaCitations.format({ ...meta, published: "" }, "apa").includes("(n.d.)"));
ok("APA leads with the author when present", KavachaCitations.format({ ...meta, author: "Rao, S." }, "apa").startsWith("Rao, S."));
const mla = KavachaCitations.format(meta, "mla");
ok("MLA quotes the title", mla.includes('"Flood Mapping."'), mla);
const bib = KavachaCitations.format({ ...meta, title: "Cost & Risk 100%" }, "bibtex");
ok("BibTeX escapes & and %", bib.includes("Cost \\& Risk 100\\%"), bib.split("\n")[1]);
ok("BibTeX key is host+year", bib.startsWith("@misc{exampleorg2024,"), bib.split("\n")[0]);
ok("BibTeX omits an absent author", !bib.includes("author ="));

/* ------------------------------------------------- graph: entity parsing */
const { KavachaKnowledgeGraph } = await import(base + "KavachaKnowledgeGraph.sys.mjs");
const P = r => KavachaKnowledgeGraph.parseEntities(r);
ok("prose-wrapped JSON parses", P('Sure! [{"name":"Kerala","kind":"place"}] hope that helps').length === 1);
ok("fenced JSON parses", P('```json\n[{"name":"Kerala","kind":"place"}]\n```').length === 1);
ok("a refusal yields nothing", P("I'm sorry, I can't do that.").length === 0);
ok("malformed JSON yields nothing", P("[{name: Kerala}").length === 0);
ok("a bare object (not array) yields nothing", P('{"name":"Kerala"}').length === 0);
ok("unknown kind falls back to topic", P('[{"name":"Xylem","kind":"weapon"}]')[0].kind === "topic");
ok("unnamed entries are dropped", P('[{"kind":"person"},{"name":"Alice"}]').length === 1);
ok("duplicates are collapsed case-insensitively", P('[{"name":"Kerala"},{"name":"kerala"}]').length === 1);
ok("one-character names are dropped", P('[{"name":"K"},{"name":"Kerala"}]').length === 1);
ok("capped at 12", P(JSON.stringify(Array.from({ length: 30 }, (_, i) => ({ name: "n" + i })))).length === 12);
const terms = KavachaKnowledgeGraph.topTerms(
  "Flood mapping in Kerala. The flood mapping used Sentinel imagery. Flood mapping again.", 5);
ok("topTerms finds the repeated content words, not stopwords",
   terms.includes("flood") && terms.includes("mapping") && !terms.includes("the"), terms);

/* ---------------------------------------------------------- knowledge key */
const { KavachaKnowledge } = await import(base + "KavachaKnowledge.sys.mjs");
ok("keyFor drops the fragment", KavachaKnowledge.keyFor("https://a.test/p?x=1#s") === "https://a.test/p?x=1");
ok("keyFor keeps the query", KavachaKnowledge.keyFor("https://a.test/p?v=42") === "https://a.test/p?v=42");
ok("keyFor drops a bare trailing ?", KavachaKnowledge.keyFor("https://a.test/p?") === "https://a.test/p");
ok("keyFor refuses about:", KavachaKnowledge.keyFor("about:config") === "");
ok("keyFor refuses file:", KavachaKnowledge.keyFor("file:///etc/passwd") === "");
ok("keyFor refuses junk", KavachaKnowledge.keyFor("not a url") === "");

/* --------------------------------------------------------- tab tree logic */
const stored = new Map();
globalThis.ChromeUtils.defineESModuleGetters = (obj, spec) => {
  for (const key of Object.keys(spec)) {
    Object.defineProperty(obj, key, {
      get() {
        if (key === "SessionStore") {
          return {
            getCustomTabValue: (tab, k) => stored.get(tab.id + k) || "",
            setCustomTabValue: (tab, k, v) => stored.set(tab.id + k, v),
          };
        }
        if (key === "PrivateBrowsingUtils") {
          return { isBrowserPrivate: () => false };
        }
        return {};
      },
      configurable: true,
    });
  }
};
const { KavachaTabHistory } = await import(base + "KavachaTabHistory.sys.mjs");
const tab = { id: "t1", label: "page", linkedBrowser: { id: "b1" } };
const walk = ["https://e.test/1", "https://e.test/2", "https://e.test/3",
              "https://e.test/2", "https://e.test/1", "https://e.test/9"];
for (const url of walk) {
  tab.label = url;
  KavachaTabHistory.record(tab, url);
}
const outline = KavachaTabHistory.outline(tab);
const urls = outline.map(n => n.url);
ok("the truncated branch survives", urls.includes("https://e.test/3") && urls.includes("https://e.test/9"), urls);
ok("the new node is a SIBLING of /2, not its child",
   outline.find(n => n.url.endsWith("/9")).depth === outline.find(n => n.url.endsWith("/2")).depth,
   outline.map(n => n.url.slice(-2) + ":d" + n.depth));
ok("the cursor is on the newest node", outline.find(n => n.current)?.url === "https://e.test/9");
ok("the branch point is marked", outline.filter(n => n.branch).length >= 2);
const before = KavachaTabHistory.outline(tab).length;
KavachaTabHistory.record(tab, "https://e.test/9");
ok("a reload adds no node", KavachaTabHistory.outline(tab).length === before);
ok("about:blank is never a node", KavachaTabHistory.record(tab, "about:blank") === null);
// From /9, /2 is NOT an ancestor (the chain is /9 -> /1), so walking to it is
// a genuinely new step and gets a node — the honest model of "I went 9 -> 2".
KavachaTabHistory.record(tab, "https://e.test/2");
ok("a sideways jump to an unrelated node is a new step",
   KavachaTabHistory.outline(tab).length === before + 1);
// Multi-step back: from that node the chain is /2 -> /9 -> /1, so returning
// to /1 must MOVE the cursor rather than duplicate it.
KavachaTabHistory.record(tab, "https://e.test/1");
ok("multi-step back moves the cursor instead of duplicating",
   KavachaTabHistory.outline(tab).length === before + 1 &&
   KavachaTabHistory.outline(tab).find(n => n.current).url === "https://e.test/1",
   KavachaTabHistory.outline(tab).map(n => n.url.slice(-2) + (n.current ? "*" : "")));

/* -------------------------------------------- workflow validation (non-schema) */
const { KavachaWorkflows } = await import(base + "KavachaWorkflows.sys.mjs");
const wf = t => ({ id: "x", name: "n", trigger: { type: "manual" }, actions: t });
ok("javascript: URL refused", !KavachaWorkflows.validate(wf([{ type: "open-url", url: "javascript:alert(1)" }])).valid);
ok("data: URL refused", !KavachaWorkflows.validate(wf([{ type: "open-url", url: "data:text/html,x" }])).valid);
ok("about: URL refused", !KavachaWorkflows.validate(wf([{ type: "open-url", url: "about:config" }])).valid);
ok("http(s) URL accepted", KavachaWorkflows.validate(wf([{ type: "open-url", url: "https://ok.test/" }])).valid);
ok("run-command without an id refused", !KavachaWorkflows.validate(wf([{ type: "run-command" }])).valid);
ok("over the step cap refused",
   !KavachaWorkflows.validate(wf(Array.from({ length: 26 }, () => ({ type: "wait", seconds: 1 })))).valid);
const fast = { id: "x", name: "n", trigger: { type: "interval", minutes: 1 }, actions: [{ type: "wait", seconds: 1 }] };
ok("sub-15-minute interval refused", !KavachaWorkflows.validate(fast).valid);
const spaceless = { id: "x", name: "n", trigger: { type: "space-switch" }, actions: [{ type: "wait", seconds: 1 }] };
ok("space trigger without a Space refused", !KavachaWorkflows.validate(spaceless).valid);
ok("the action allowlist and the schema enum agree",
   JSON.stringify(Object.keys((await import(base + "KavachaWorkflows.sys.mjs")).KavachaWorkflowActions)) ===
   JSON.stringify(JSON.parse(
     (await import("node:fs")).readFileSync(
       new URL("../../automation/workflow.schema.json", here), "utf8"
     )).properties.actions.items.properties.type.enum));

for (const line of results.pass) console.log("  PASS  " + line);
for (const line of results.fail) console.log("  FAIL  " + line);
console.log(`\n${results.pass.length} passed, ${results.fail.length} failed`);
process.exit(results.fail.length ? 1 : 0);
