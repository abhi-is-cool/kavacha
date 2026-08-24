// Kavacha distinct default look — documentation/DIFFERENTIATION.md § "Visual
// identity": the out-of-box experience must not read as a Zen fork.
//
// No default accent color (user decision 2026-07-13: picking a color is
// the user's).
//
// Horizontal tabs by default (user decision 2026-07-13: no users yet, and
// defaulting on makes testing the patch-0010 CSS layer easier). Vertical
// remains one pref away: zen.tabs.vertical=true.
//
// Shipped inside the app by build/generate-branding.sh, appended to the
// branding default prefs (which load after zen.js/firefox.js defaults and
// therefore win conflicts — libpref loads defaults reverse-alphabetically).
pref("zen.tabs.vertical", false);

// Cmd+T opens a real new tab (user decision 2026-08-02): patch 0042 sets
// zen.urlbar.replace-newtab=false in prefs/zen/zen-urlbar.yaml. The pref lives
// there, not here. (Earlier, 2026-07-14, the floating search was kept on
// purpose; that was reversed after more use.) When the dashboard new tab is
// enabled, patch 0011 leaves the cursor in the URL bar so typing still summons
// the centered floating search — the best of both.

// New tabs open at the END of the strip (the right, in horizontal), like
// other browsers. Zen's default (true) is "newest on top" for the vertical
// sidebar: tabbrowser inserts new tabs right after the pinned section, which
// reads as "new tabs open on the left" in a top bar. Also moves the new-tab
// button to follow the last tab. Zen exposes this in Settings > Looks & Feel.
pref("zen.view.show-newtab-button-top", false);

// Tab memory management (KavachaTabMemory.sys.mjs): discard background tabs
// untouched for this many minutes, freeing their memory while keeping them in
// the strip (Firefox restores them on click). 0 disables. The module reads
// this pref live; the code default matches this value.
pref("kavacha.tabs.unload-after-minutes", 30);

// Kavacha Midnight is the default look: dark chrome (zen.view.window.scheme
// 0=dark 1=light 2=auto) over the midnight surface palette %-included into
// zen-theme.css. The welcome flow offers light/auto; no accent is set here
// (user decision 2026-07-13 — the welcome flow asks).
pref("zen.view.window.scheme", 0);

// Workspace state-history (ADR 0006): per-space snapshot retention bounds.
pref("kavacha.history.max-snapshots-per-space", 100);
pref("kavacha.history.retention-days", 90);

// Kavacha layout engine (patch 0022; ADR 0008): monotonic revision counter.
// KavachaLayoutEngine persists the layout to kavacha-layout.json and bumps
// this pref; its observer (and any content page like about:studio) re-reads on
// change. The engine sizes/positions chrome from that document live.
pref("kavacha.layout.revision", 0);

// Kavacha theme engine (patch 0023; ADR 0008): the active theme package id.
// kavacha-midnight is the baked default (patch 0016); any other id overrides
// its base --kavacha-* tokens live so Zen re-tints. User theme packages live
// in the profile kavacha-themes/ directory.
pref("kavacha.theme.active", "kavacha-midnight");

// Per-Space containers (patch 0038; ROADMAP Phase 2 "Cross-workspace identity").
// OFF by default: Spaces share one set of logins, so signing into Google /
// GitHub / Slack once signs you in everywhere. Turning it on gives each new
// TEMPLATE Space its own container, which is what lets two Spaces hold two
// accounts on the same site — the only thing containers uniquely provide.
// Costs no tracking protection either way: Total Cookie Protection
// (network.cookie.cookieBehavior=5, privacy/tracker-controls/kavacha.js) already
// partitions third-party state per top-level site. Governs Space CREATION only —
// existing Spaces keep their container, and the Private template always gets one.
// Code defaults in ZenSpaceManager.mjs / kavacha-workspaces.js match this value.
pref("kavacha.workspaces.isolate-containers", false);

// Clear unpinned tabs on quit (patch 0034; KavachaSessionCleanup.sys.mjs).
// When on, quitting discards every non-pinned tab so the next launch restores
// ONLY the tabs you deliberately pinned; pinning becomes the explicit "keep
// this" gesture. Closed tabs still land in the undoable "recently closed" list.
//
// OFF by default (decision 2026-08-01). This is the one Kavacha behaviour that
// destroys user data on an ordinary action, and every other browser restores
// what you left open, so it must be opt-in rather than a surprise. Declaring it
// here also closes defect D0b: the pref previously existed in no prefs file at
// all (getPrefType() returned 0 = PREF_INVALID) and the destructive path was
// enabled solely by a hardcoded `true` fallback in getBoolPref(PREF, true),
// making it invisible to pref auditing and absent from about:config.
// The code default in KavachaSessionCleanup.sys.mjs matches this value.
pref("kavacha.session.clear-unpinned-on-quit", false);

// Personal search index (ADR 0012 / patch 0078): full-text over the readable
// text of pages you visit, so universal search can answer "where did I read
// about X". Local-only, deletion follows Places (Clear History wipes it).
// Unlocked, privacy-first: on by default, the Privacy Center exposes an off
// switch and "Clear index now". Bounds: rows and days.
pref("kavacha.index.enabled", true);
pref("kavacha.index.max-pages", 5000);
pref("kavacha.index.retention-days", 90);

// Local AI runtime bridge (ADR 0013 / patch 0079): Kavacha's AI features talk
// to a LOCAL model server (Ollama's API by default) at this endpoint and never
// fall back to a remote service. Unlocked, privacy-first: the feature is on but
// inert until a local runtime is present (availability is probed on demand, so
// a fresh profile with no model makes no network request). Point the endpoint
// at your own local model server; pick a model or let it use the first found.
pref("kavacha.ai.enabled", true);
pref("kavacha.ai.endpoint", "http://localhost:11434");
pref("kavacha.ai.model", "");

// Knowledge capture (ADR 0015 / patch 0082): per-page notes, highlights and
// clips, in kavacha-knowledge.sqlite. Note the deletion contract is the
// OPPOSITE of the index's above — this store does NOT follow Places, because
// clearing history must not destroy notes the user wrote. Off means the
// sidebar still reads what is already stored but accepts no new writes.
pref("kavacha.knowledge.enabled", true);
// Cap on one clip's stored text. Higher than the index's 32k per page: a clip
// is a deliberate save of one document, not a passive capture of everything.
pref("kavacha.knowledge.max-clip-chars", 64000);

// Knowledge graph (ADR 0016 / patch 0083): record that one page led to
// another, which Places never stores — it remembers both visits and no
// relationship between them. Deletion FOLLOWS Places here (unlike the notes
// store above): an edge is a record of where you went, so clearing history
// clears it. Off means no new edges; what is already recorded still reads.
pref("kavacha.knowledge.record-links", true);

// Focus mode (patch 0084): a session is a PERIOD, and this pref holds when it
// ends (unix SECONDS — prefs are 32-bit signed, and a millisecond timestamp
// overflows into a negative number). 0 means no session. It lives in a pref
// rather than memory so a session survives a restart: quitting the browser is
// the most obvious way to defeat a self-imposed block, and a focus feature a
// restart switches off is decoration.
pref("kavacha.focus.session-ends-at", 0);
pref("kavacha.focus.default-minutes", 50);
// While a session runs, websites cannot ask to send notifications. The value
// that was there before is parked in the second pref and written back when the
// session ends — explicit ownership, which is what patch 0066 cost us to learn.
pref("kavacha.focus.block-notifications", true);
pref("kavacha.focus.saved-notification-default", 0);

// Automation (ADR 0017 / patch 0085): workflows are documents — a trigger and
// a list of steps from a fixed allowlist — never code. The caps are the
// guardrails that make an imported or hand-edited workflow safe to run: a
// bounded number of steps, and a bounded number of tabs one run may open.
pref("kavacha.workflows.enabled", true);
pref("kavacha.workflows.max-actions", 25);
pref("kavacha.workflows.max-tabs-per-run", 10);

// Tab history tree (patch 0086; FEATURES 7.1): record the branches ordinary
// session history truncates — go back three pages, follow a different link,
// and every browser silently throws the first three away. The tree rides
// SessionStore per tab, so it survives a restart and dies with the tab.
pref("kavacha.tabhistory.enabled", true);
pref("kavacha.tabhistory.max-nodes", 200);

// Citations (patch 0087): the style "Copy Citation" uses. The command asks
// and remembers the answer here, so the second citation is one keystroke.
// apa | mla | bibtex.
pref("kavacha.citation.style", "apa");
