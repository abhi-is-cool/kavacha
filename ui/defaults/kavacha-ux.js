// Kavacha distinct default look — documentation/DIFFERENTIATION.md § "Visual
// identity": the out-of-box experience must not read as a Zen fork.
//
// Accent color is Kavacha gold (browser/branding/kavacha/branding.json →
// colors.accent) instead of the system accent.
//
// NOTE on horizontal tabs (2026-07-13): zen.tabs.vertical=false is NOT
// shippable — Zen's horizontal mode is vestigial. The JS layer still honors
// the pref (ZenUIManager flips orient/toolbars), but vertical-tabs.css
// hard-codes `flex-direction: column; height: 100%` on the tab strip with
// no pref gate, so tabs render vertically regardless. Horizontal-by-default
// needs a Kavacha CSS layer — tracked as Phase 3 layout-engine work.
//
// Shipped inside the app by build/generate-branding.sh, appended to the
// branding default prefs (which load after zen.js/firefox.js defaults and
// therefore win conflicts — libpref loads defaults reverse-alphabetically).
pref("zen.theme.accent-color", "#E8A33D");
