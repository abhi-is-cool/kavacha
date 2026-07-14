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

// Conventional new-tab behavior (user feedback 2026-07-13): open a page with
// the docked URL bar focused, not Zen's detached floating search box — the
// float is positioned for the vertical-sidebar layout and lands in the wrong
// place with the horizontal top bar.
pref("zen.urlbar.replace-newtab", false);
