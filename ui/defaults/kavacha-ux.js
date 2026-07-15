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

// Cmd+T opens Zen's centered floating search (Zen default, kept on purpose —
// user decision 2026-07-14 after trying both): patch 0010 makes the float
// center correctly in horizontal mode, so the earlier
// zen.urlbar.replace-newtab=false workaround is retired.

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
