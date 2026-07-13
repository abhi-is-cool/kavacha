// Kavacha distinct default look — documentation/DIFFERENTIATION.md § "Visual
// identity": the out-of-box experience must not read as a Zen fork.
//
// Deliberately empty of appearance opinions right now (user decision
// 2026-07-13: no default accent color — picking a color is the user's).
// Horizontal-tabs-by-default ships once the Kavacha horizontal CSS layer
// (patch 0010) is proven.
//
// Shipped inside the app by build/generate-branding.sh, appended to the
// branding default prefs (which load after zen.js/firefox.js defaults and
// therefore win conflicts — libpref loads defaults reverse-alphabetically).
