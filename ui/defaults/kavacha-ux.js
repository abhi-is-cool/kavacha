// Kavacha distinct default look — documentation/DIFFERENTIATION.md § "Visual
// identity": the out-of-box experience must not read as a Zen fork.
//
// Zen's signature is the vertical-tab sidebar, so Kavacha defaults to
// horizontal tabs — a supported Zen layout, and vertical stays one toggle
// away (Settings → Browser Layout). Accent color is Kavacha gold
// (browser/branding/kavacha/branding.json → colors.accent) instead of the
// system accent.
//
// Shipped inside the app by build/generate-branding.sh, appended to the
// branding default prefs (which load after zen.js/firefox.js defaults and
// therefore win conflicts — libpref loads defaults reverse-alphabetically).
pref("zen.tabs.vertical", false);
pref("zen.theme.accent-color", "#E8A33D");
