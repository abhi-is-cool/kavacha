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
