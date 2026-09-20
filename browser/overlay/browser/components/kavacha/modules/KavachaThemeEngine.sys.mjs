// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Kavacha theme engine (ROADMAP Phase 3; ADR 0008). Loads theme packages
// (manifest.json + colors.json + optional style.css — see
// customization/themes/theme-manifest.schema.json) and applies the active one
// LIVE to browser chrome, swappable at runtime via the `kavacha.theme.active`
// pref.
//
// Relationship to patch 0016 (Kavacha Midnight baked floor): 0016 %includes the
// midnight tokens into zen-theme.css at build time and sets
// `--kavacha-surface: var(--kavacha-surface)` so Zen's whole color-mix chain
// derives from it. This engine RE-USES that bridge: to switch themes it only
// needs to override the base --kavacha-* tokens (inline, !important, on the
// chrome root) and Zen re-tints. The floor's job is the pre-JS paint; the
// engine's job is every theme including the default.
//
// Accent policy (ADR 0008): themes tint SURFACES only. The engine never writes
// --kavacha-accent / zen.theme.accent-color — the accent is owned by the
// user (welcome flow, patch 0017; Settings; the Appearance panel, patch 0063).
// A theme's accent tokens land as inert --kavacha-accent* custom properties.
//
// ---------------------------------------------------------------------------
// PATCH 0061 — what was wrong, and the shape of the fix.
//
// 1. THE DEFAULT THEME TOOK A DIFFERENT CODE PATH. `kavacha-midnight` returned
//    early, before the token loop, on the theory that the baked floor already
//    provided its colours. The floor provided SIX of eighteen. So at the
//    shipped default `--kavacha-accent`, `--kavacha-tab-active-background`,
//    `--kavacha-tab-hover-background` and nine more were undefined, and their
//    consumers fell back to `color-mix(currentColor …)` — a TEXT-derived
//    colour. Switch to Forest and those became real colours; switch back and
//    they became text again. That is most of what "the theme settings are
//    glitchy" describes. The floor now carries all eighteen and there is no
//    early return: every theme, default included, takes one path.
//
// 2. TWO AUTHORITIES FOR LIGHT/DARK. `themeMode()` read the theme's DECLARED
//    surface and stamped the attribute; `_applyColorScheme()` read the COMPUTED
//    one and wrote `root.style.colorScheme`. The old header claimed they could
//    not disagree because they shared a threshold — but they never shared an
//    input. Worse, the inline `colorScheme` write reached `:root` and nothing
//    else, while Zen applies color-scheme to `:root, panel, menupopup, browser
//    [type=content]` and more (zen-theme.css) gated on a pref that knows
//    nothing about Kavacha themes. A light theme therefore produced a light
//    toolbar over dark popups and dark content. Now: ONE derivation, from the
//    computed surface, stamping ONE attribute (`kavacha-theme-mode`), and the
//    CSS layers own every selector that needs it.
//
// 3. COLOURS THE BROWSER UNDERSTANDS BUT THE PARSER DID NOT. The old
//    `parseCssColor` accepted hex and rgb() only, returned null for `hsl()`,
//    `oklch()`, `color-mix()` or a named colour, and null meant "dark" —
//    silently. A white theme authored in oklch rendered as dark-mode chrome:
//    white on white, no console line. Colours are now resolved by the style
//    system itself (_resolveColor), so whatever CSS accepts, this accepts.
//
// 4. NOBODY CHECKED CONTRAST. Now every apply measures the real WCAG ratio
//    (relative luminance, gamma-linearised — the old formula skipped
//    linearisation, which is fine for a light/dark guess and wrong for a
//    ratio) for text-on-surface, and substitutes a readable text colour rather
//    than shipping chrome you cannot read. `contrastOf()` exposes the verdict
//    so the Appearance panel can badge a failing theme.
//
// 5. ORDERING AND LIFETIME. Teardown ran BEFORE the theme resolved, so a
//    corrupt package stripped the current theme and installed nothing;
//    `applyToAllWindows` never awaited, so a slow on-disk theme could land its
//    writes on top of a faster switch and leave the chrome showing a theme the
//    pref says is inactive; and `_managedProps` was one process-wide Set used
//    to tear down PER-WINDOW inline styles. Fixed by resolving first, by a
//    generation counter that drops stale applies, and by keying the managed
//    props per window like `_sheetByWindow` already was.
// ---------------------------------------------------------------------------

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  JsonSchema: "resource://gre/modules/JsonSchema.sys.mjs",
  setTimeout: "resource://gre/modules/Timer.sys.mjs",
});

// Embedded copy of customization/themes/theme-manifest.schema.json (ADR 0010).
// Sideloaded packages are NOT packaged with that repo file, so the schema is
// carried here; the two must stay in sync (CI validates the file, this guards
// the runtime). A sideloaded manifest is untrusted third-party data whose
// `id`, `colors` and `style` fields compose file paths, so it is validated
// FAIL-CLOSED — an invalid package is neither listed nor applied — which is
// the guarantee ADR 0010 and customization/README.md state.
const THEME_MANIFEST_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  required: ["name", "id", "version", "colors"],
  additionalProperties: false,
  properties: {
    $schema: { type: "string" },
    id: { type: "string", pattern: "^[a-z0-9]+(-[a-z0-9]+)*$" },
    name: { type: "string", minLength: 1, maxLength: 80 },
    version: { type: "string", pattern: "^\\d+\\.\\d+\\.\\d+$" },
    author: { type: "string" },
    description: { type: "string", maxLength: 500 },
    license: { type: "string" },
    kavachaMinVersion: { type: "string" },
    colors: { type: "string", const: "colors.json" },
    style: { type: "string" },
    icons: { type: "string" },
    fonts: { type: "array", items: { type: "string", pattern: "\\.woff2$" } },
    supports: {
      type: "array",
      items: { type: "string", enum: ["light", "dark"] },
      minItems: 1,
    },
  },
};

const kThemePref = "kavacha.theme.active";
const kDefaultTheme = "kavacha-midnight";
const kUserThemesDir = "kavacha-themes";

// Light/dark as a USER CHOICE rather than a side effect of which theme you
// happen to have picked (patch 0063). `kavacha.theme.active` remains the single
// authority for what is applied — these three only decide what gets written
// into it, so every existing consumer (Studio, Settings, marketplace) keeps
// working untouched.
const kFollowSystemPref = "kavacha.theme.follow-system";
const kDarkPickPref = "kavacha.theme.active-dark";
const kLightPickPref = "kavacha.theme.active-light";

const kDefaultDarkTheme = "kavacha-midnight";
const kDefaultLightTheme = "kavacha-daylight";

// Firefox's own light/dark authority is the enabled built-in theme: it decides
// `color-scheme` on panels, menus and content, --toolbox-textcolor and the
// lwt variables. _stampMode keeps it in step with the active Kavacha theme
// (ADR 0020 §4e) — the Firefox-base equivalent of the Zen-era
// zen.view.window.scheme alignment. kavacha.theme.mode mirrors the result for
// consumers that cannot read the engine (about:kavacha-welcome writes it too).
const kModePref = "kavacha.theme.mode";
const kAccentPref = "kavacha.theme.accent";
const kBuiltInThemeIds = Object.freeze({
  dark: "firefox-compact-dark@mozilla.org",
  light: "firefox-compact-light@mozilla.org",
  system: "default-theme@mozilla.org",
});

// The token vocabulary, in the order a palette should be read. Exported because
// three surfaces need to agree on it: the baked floor mirrors it, the
// Appearance panel paints swatches from it, and the content pages (patch 0062)
// stamp exactly these onto documents that cannot see the chrome cascade.
export const KAVACHA_THEME_TOKENS = Object.freeze([
  "surface",
  "surfaceElevated",
  "surfaceSunken",
  "border",
  "textPrimary",
  "textSecondary",
  "textDisabled",
  "accent",
  "accentHover",
  "accentText",
  "tabActiveBackground",
  "tabHoverBackground",
  "sidebarBackground",
  "urlbarBackground",
  "success",
  "warning",
  "danger",
  "privacyShield",
]);

// Kavacha's accent palette. Lifted here from ZenWelcome.mjs, where it was a
// literal array: the welcome flow and the Appearance panel offer the same
// swatches, and two copies of a palette drift.
export const KAVACHA_ACCENT_SWATCHES = Object.freeze([
  "#8B7BD8",
  "#4AA3DF",
  "#5FBF77",
  "#E8A33D",
  "#F76F53",
  "#E05C5C",
  "#E285B2",
  "#8A939F",
]);

// WCAG 2.1 AA for body text. Checked on apply; see _guardContrast.
const kMinContrast = 4.5;

// Below this relative luminance a surface is treated as dark. Relative
// luminance is gamma-correct (unlike the old weighted average of raw
// channels), so the midpoint sits lower than the 0.45 the previous code used.
const kLightSurfaceThreshold = 0.18;

// Built-in packages. These MUST stay in step with the baked floor in
// src/zen/kavacha-theme/kavacha-midnight.inc.css: the floor paints before this
// module runs, so a mismatch is a flash at every startup. Midnight's values are
// the ones patch 0033 tuned and users actually see; before patch 0061 they
// disagreed with both this map and the floor, and the copy nobody edited was
// the copy that won.
const BUILTIN_THEMES = {
  "kavacha-midnight": {
    name: "Kavacha Midnight",
    colors: {
      surface: "#0B0912",
      surfaceElevated: "#16131F",
      surfaceSunken: "#060409",
      border: "#322B4A",
      textPrimary: "#F6F4FC",
      textSecondary: "#CABFE6",
      textDisabled: "#8A80A8",
      // No accent tokens: Kavacha's default look ships no accent (user
      // decision 2026-07-13). Leaving accent/accentHover/accentText unset
      // lets every consumer fall to --kavacha-accent-fallback until the user
      // picks one. A selected theme (Forest/Daylight) MAY carry an accent —
      // choosing it is a user act — but the shipped default must not.
      tabActiveBackground: "#241D3A",
      tabHoverBackground: "#1A1530",
      sidebarBackground: "#060409",
      urlbarBackground: "#16131F",
      success: "#5FBF77",
      warning: "#E8A33D",
      danger: "#E05C5C",
      privacyShield: "#8B7BD8",
    },
  },
  "kavacha-forest": {
    name: "Kavacha Forest",
    colors: {
      surface: "#0C1610",
      surfaceElevated: "#142019",
      surfaceSunken: "#070F0A",
      border: "#2B4636",
      textPrimary: "#EAF4ED",
      textSecondary: "#B4CDBE",
      textDisabled: "#6E8A7A",
      accent: "#E0A458",
      accentHover: "#F0B972",
      accentText: "#0C1610",
      tabActiveBackground: "#1F3527",
      tabHoverBackground: "#182A1E",
      sidebarBackground: "#070F0A",
      urlbarBackground: "#142019",
      success: "#63C185",
      warning: "#E0A458",
      danger: "#DE6B5F",
      privacyShield: "#6FB58F",
    },
  },
  // The light theme, and the proof the light half of the bridge works.
  "kavacha-daylight": {
    name: "Kavacha Daylight",
    colors: {
      surface: "#F7F6FB",
      surfaceElevated: "#FFFFFF",
      surfaceSunken: "#ECEAF4",
      border: "#D6D2E4",
      textPrimary: "#1B1830",
      textSecondary: "#4B4670",
      textDisabled: "#928DAD",
      accent: "#5B4BC4",
      accentHover: "#4A3BB0",
      accentText: "#FFFFFF",
      tabActiveBackground: "#FFFFFF",
      tabHoverBackground: "#EFEDF8",
      sidebarBackground: "#ECEAF4",
      urlbarBackground: "#FFFFFF",
      success: "#1F7A42",
      warning: "#8A5600",
      danger: "#B32D2D",
      privacyShield: "#5B4BC4",
    },
  },
};

export const KavachaThemeEngine = {
  _initialized: false,
  // Custom-property names this engine has set, PER WINDOW, so a switch removes
  // exactly what that window carries. Process-wide state cannot do this job:
  // two windows can be mid-apply on different themes.
  _managedProps: new WeakMap(),
  // Per-window style.css sheet URI (user themes), so a switch can remove it.
  _sheetByWindow: new WeakMap(),
  // Bumped on every reason-to-reapply. An apply that finishes after a newer one
  // started is stale and must not write.
  _generation: 0,

  init() {
    if (this._initialized) {
      return;
    }
    this._initialized = true;
    Services.prefs.addObserver(kThemePref, this);
    Services.prefs.addObserver(kFollowSystemPref, this);
    Services.prefs.addObserver(kAccentPref, this);
    // "Follow the system" has to hear the system change its mind. This is the
    // notification Gecko fires for exactly that, so no window needs to be open
    // and no matchMedia listener needs tearing down.
    Services.obs.addObserver(this, "look-and-feel-changed");
  },

  observe(subject, topic, data) {
    if (topic === "look-and-feel-changed") {
      this._syncFollowSystem();
      return;
    }
    if (topic !== "nsPref:changed") {
      return;
    }
    if (data === kFollowSystemPref) {
      this._syncFollowSystem();
      return;
    }
    if (data === kAccentPref) {
      this.applyToAllWindows();
      return;
    }
    if (data === kThemePref) {
      // Remember the pick per side, so the Appearance panel's Dark and Light
      // buttons return you to the theme you last chose there rather than to a
      // hardcoded default.
      this._rememberPick(this.activeThemeId);
      this.applyToAllWindows();
    }
  },

  get activeThemeId() {
    return Services.prefs.getStringPref(kThemePref, kDefaultTheme);
  },

  // ----- Light / dark as a user choice ------------------------------------

  get followsSystem() {
    return Services.prefs.getBoolPref(kFollowSystemPref, false);
  },

  /** "dark" | "light" | "system" — what the Appearance panel shows selected. */
  async currentMode() {
    if (this.followsSystem) {
      return "system";
    }
    return (await this.modeOf(this.activeThemeId)) ?? "dark";
  },

  /**
   * Pick the light/dark side. "system" hands the choice to the OS and keeps
   * following it; "dark"/"light" pin it to the theme last chosen on that side.
   */
  async setMode(mode) {
    if (mode === "system") {
      Services.prefs.setBoolPref(kFollowSystemPref, true);
      return;
    }
    Services.prefs.setBoolPref(kFollowSystemPref, false);
    await this.setActiveTheme(await this.pickFor(mode));
  },

  /** The theme this side would activate: the remembered pick, or the default. */
  async pickFor(mode) {
    const pref = mode === "light" ? kLightPickPref : kDarkPickPref;
    const fallback = mode === "light" ? kDefaultLightTheme : kDefaultDarkTheme;
    const remembered = Services.prefs.getStringPref(pref, "");
    if (remembered) {
      const known = await this.listThemes();
      if (known.includes(remembered)) {
        return remembered;
      }
    }
    return fallback;
  },

  _rememberPick(id) {
    // Built-ins are cheap to classify; a user package needs a read, so this is
    // fire-and-forget rather than awaited — nothing downstream blocks on it.
    this.modeOf(id)
      .then(mode => {
        if (!mode) {
          return;
        }
        Services.prefs.setStringPref(
          mode === "light" ? kLightPickPref : kDarkPickPref,
          id
        );
      })
      .catch(() => {});
  },

  _systemPrefersDark() {
    const win = Services.wm.getMostRecentBrowserWindow();
    // No window yet (early startup): assume dark, which is Kavacha's default
    // look, so the first paint never has to be corrected.
    return win ? win.matchMedia("(prefers-color-scheme: dark)").matches : true;
  },

  async _syncFollowSystem() {
    if (!this.followsSystem) {
      return;
    }
    const want = await this.pickFor(
      this._systemPrefersDark() ? "dark" : "light"
    );
    if (want !== this.activeThemeId) {
      Services.prefs.setStringPref(kThemePref, want);
    }
  },

  // ----- Package loading --------------------------------------------------

  /** All installed theme ids: built-ins first, then user packages. */
  async listThemes() {
    const ids = Object.keys(BUILTIN_THEMES);
    for (const id of await this._userThemeIds()) {
      if (!ids.includes(id)) {
        ids.push(id);
      }
    }
    return ids;
  },

  async _userThemeIds() {
    const out = [];
    const dir = PathUtils.join(PathUtils.profileDir, kUserThemesDir);
    try {
      for (const child of await IOUtils.getChildren(dir)) {
        const info = await IOUtils.stat(child);
        if (info.type !== "directory") {
          continue;
        }
        const id = PathUtils.filename(child);
        // Fail-closed (ADR 0010): only surface a sideloaded theme whose
        // manifest validates, so an invalid package never reaches the
        // Appearance panel or setActiveTheme's known-ids check.
        if (await this._userThemeIsValid(child, id)) {
          out.push(id);
        }
      }
    } catch (e) {
      // No user themes directory yet — fine.
    }
    return out;
  },

  async _userThemeIsValid(base, id) {
    try {
      const manifest = JSON.parse(
        await IOUtils.readUTF8(PathUtils.join(base, "manifest.json"))
      );
      return this._validateManifest(manifest, id).ok;
    } catch (e) {
      return false;
    }
  },

  /** Resolve an id to { id, name, colors, styleCss }. Built-in or on-disk. */
  /**
   * Validate a sideloaded theme manifest fail-closed (ADR 0010). Built-ins
   * skip this — they are first-party. Returns { ok, why }.
   */
  _validateManifest(manifest, id) {
    let result;
    try {
      result = lazy.JsonSchema.validate(manifest, THEME_MANIFEST_SCHEMA);
    } catch (e) {
      return { ok: false, why: String(e?.message || e) };
    }
    if (!result.valid) {
      const first = result.errors?.[0];
      return { ok: false, why: first?.error || first?.message || "schema mismatch" };
    }
    // The directory the package lives in is authoritative; a manifest must not
    // claim a different id (it would shadow another theme's tokens/paths).
    if (manifest.id !== id) {
      return { ok: false, why: `manifest id "${manifest.id}" != directory "${id}"` };
    }
    return { ok: true };
  },

  async resolveTheme(id) {
    if (BUILTIN_THEMES[id]) {
      return { id, ...BUILTIN_THEMES[id], styleCss: null };
    }
    const base = PathUtils.join(PathUtils.profileDir, kUserThemesDir, id);
    const manifest = JSON.parse(
      await IOUtils.readUTF8(PathUtils.join(base, "manifest.json"))
    );
    const check = this._validateManifest(manifest, id);
    if (!check.ok) {
      // Fail-closed: an untrusted package that does not match the schema does
      // not load. Callers (applyToWindow, modeOf) already keep the current
      // theme on a throw.
      throw new Error(`KavachaThemeEngine: theme "${id}" rejected — ${check.why}`);
    }
    const colors = JSON.parse(
      await IOUtils.readUTF8(PathUtils.join(base, colorsFileOf(manifest)))
    );
    let styleCss = null;
    if (manifest.style) {
      try {
        styleCss = await IOUtils.readUTF8(PathUtils.join(base, manifest.style));
      } catch (e) {
        // Optional file; a theme may ship colors only.
      }
    }
    return { id, name: manifest.name || id, colors, styleCss };
  },

  // ----- Queries the UI needs ---------------------------------------------

  /**
   * "dark" | "light" for a theme WITHOUT applying it — used to group the
   * Appearance panel's cards and to remember the per-side pick.
   *
   * This is a query about a package, not the authority over applied state:
   * what the chrome is actually wearing is decided once, in _stampMode, from
   * the computed surface. Confusing the two is what patch 0061 untangled.
   */
  async modeOf(id) {
    let colors;
    try {
      colors = (await this.resolveTheme(id)).colors;
    } catch (e) {
      return null;
    }
    const rgb = this._resolveColor(null, colors?.surface);
    if (!rgb) {
      return null;
    }
    return relativeLuminance(rgb) < kLightSurfaceThreshold ? "dark" : "light";
  },

  /**
   * Measure a theme's readability: { primary, secondary, passes }, where the
   * two numbers are WCAG contrast ratios. The Appearance panel badges a theme
   * that fails; _guardContrast repairs one before it reaches the screen.
   */
  contrastOf(colors, win = null) {
    const surface = this._resolveColor(win, colors?.surface);
    const elevated =
      this._resolveColor(win, colors?.surfaceElevated) || surface;
    const primary = this._resolveColor(win, colors?.textPrimary);
    const secondary = this._resolveColor(win, colors?.textSecondary);
    const p = surface && primary ? contrastRatio(primary, surface) : 0;
    const s = elevated && secondary ? contrastRatio(secondary, elevated) : 0;
    return {
      primary: p,
      secondary: s,
      passes: p >= kMinContrast && s >= kMinContrast,
    };
  },

  // ----- Public API -------------------------------------------------------

  async setActiveTheme(id) {
    const known = await this.listThemes();
    if (!known.includes(id)) {
      throw new Error(`KavachaThemeEngine: unknown theme "${id}"`);
    }
    // Choosing a theme by hand ends "follow the system". Without this the next
    // time the OS changed appearance -- or the next restart -- _syncFollowSystem
    // would quietly put the theme back, and the user would have no idea why
    // their choice did not stick. Note this is deliberately NOT in
    // _syncFollowSystem's own path: that one writes the pref directly.
    if (this.followsSystem) {
      Services.prefs.setBoolPref(kFollowSystemPref, false);
    }
    // The pref observer drives the actual application.
    Services.prefs.setStringPref(kThemePref, id);
  },

  // ----- Application ------------------------------------------------------

  applyToAllWindows() {
    const generation = ++this._generation;
    for (const win of Services.wm.getEnumerator("navigator:browser")) {
      if (!win.closed && win.document?.documentElement) {
        this.applyToWindow(win, generation);
      }
    }
  },

  async applyToWindow(win, generation = ++this._generation) {
    if (win.closed || !win.document?.documentElement) {
      return;
    }

    // RESOLVE FIRST. Teardown used to run up here, which meant a corrupt or
    // deleted package stripped the theme the window was wearing and then
    // failed to install anything — every window open repeating it. Load
    // everything that can fail while the current look is still on screen.
    const id = this.activeThemeId;
    let theme;
    try {
      theme = await this.resolveTheme(id);
    } catch (e) {
      win.console?.error(
        `KavachaThemeEngine: failed to load theme "${id}"; keeping the current one`,
        e
      );
      return;
    }

    // A newer apply started while we were reading. Its writes are the ones the
    // user asked for; ours would land on top of them.
    if (generation !== this._generation || win.closed) {
      return;
    }

    const root = win.document.documentElement;
    const utils = win.windowUtils;

    // Tear down this window's previous overrides.
    const prevSheet = this._sheetByWindow.get(win);
    if (prevSheet) {
      try {
        utils.removeSheetUsingURIString(prevSheet, utils.AUTHOR_SHEET);
      } catch (e) {}
      this._sheetByWindow.delete(win);
    }
    for (const prop of this._managedProps.get(win) || []) {
      root.style.removeProperty(prop);
    }

    // Base --kavacha-* tokens, inline !important. 0016's
    // `--kavacha-surface: var(--kavacha-surface)` bridge re-derives Zen's
    // chrome from these. Every theme takes this path, the default included —
    // so the set of defined tokens is the same whatever you have picked.
    const colors = this._guardContrast(win, theme);
    const managed = new Set();
    for (const [token, value] of Object.entries(colors)) {
      if (token.startsWith("$")) {
        continue; // colors.json may carry a $comment
      }
      const prop =
        "--kavacha-" + token.replace(/[A-Z]/g, m => "-" + m.toLowerCase());
      managed.add(prop);
      root.style.setProperty(prop, value, "important");
    }
    this._applyAccent(win, root, managed);
    this._managedProps.set(win, managed);

    // Optional style.css (user themes) -> chrome-only AUTHOR_SHEET for this
    // window. Loaded BEFORE the mode is stamped, because it may itself
    // redeclare --kavacha-surface and the mode is derived from what actually
    // computes.
    if (theme.styleCss) {
      const uri =
        "data:text/css;charset=utf-8," + encodeURIComponent(theme.styleCss);
      try {
        utils.loadSheetUsingURIString(uri, utils.AUTHOR_SHEET);
        this._sheetByWindow.set(win, uri);
      } catch (e) {
        win.console?.error("KavachaThemeEngine: failed to load style.css", e);
      }
    }

    this._stampMode(win, root);
  },

  /**
   * THE one place light/dark is decided for applied chrome.
   *
   * Reads the COMPUTED --kavacha-surface, so it reflects whatever set it: this
   * engine, the baked floor, a user theme's style.css, or a live edit from
   * about:studio. Stamps `kavacha-theme-mode` and stops there — the CSS layers
   * (kavacha-theme-light.inc.css / kavacha-theme-dark.inc.css) own every
   * selector that needs to change, which is the part an inline
   * `root.style.colorScheme` could never reach: it applies to :root, while Zen
   * schemes `panel`, `menupopup` and `browser[type=content]` too, and those
   * stayed dark under a light theme.
   */
  _stampMode(win, root) {
    const rgb = this._resolveColor(win, "var(--kavacha-surface)");
    // Unreadable surface: leave the attribute alone rather than guessing. The
    // previous code guessed "dark", which is how a white theme became white
    // text on white.
    if (!rgb) {
      win.console?.warn(
        "KavachaThemeEngine: could not resolve --kavacha-surface; leaving the appearance mode unchanged"
      );
      return;
    }
    const mode =
      relativeLuminance(rgb) < kLightSurfaceThreshold ? "dark" : "light";
    root.setAttribute("kavacha-theme-mode", mode);

    // ...and tell Firefox, because one authority is still left standing: the
    // enabled built-in theme decides `color-scheme` on panels, menus and
    // content, `--toolbox-textcolor` and every lwt variable. Enable the side
    // that matches the Kavacha theme ("follow system" enables the system
    // theme). Guarded on a difference and fire-and-forget: AddonManager is
    // async and this must never block a window's apply. No feedback loop —
    // this engine observes its own prefs and look-and-feel-changed only.
    const wantMode = this.followsSystem ? "system" : mode;
    if (Services.prefs.getStringPref(kModePref, "") !== wantMode) {
      Services.prefs.setStringPref(kModePref, wantMode);
    }
    this._enableBuiltInTheme(wantMode).catch(e =>
      win.console?.warn(
        `KavachaThemeEngine: could not enable the ${wantMode} built-in theme`,
        e
      )
    );
  },

  /**
   * Re-assert the built-in theme after startup has settled.
   *
   * On a FRESH PROFILE Kavacha enables its theme at browser-window-before-show
   * and Firefox's own first-run setup then enables default-theme, which
   * disables ours — the chrome ends up on Firefox's default while
   * kavacha-theme-mode says "dark". Enabling a theme is idempotent (the call
   * checks isActive first), so re-asserting once at
   * browser-delayed-startup-finished costs nothing on a warm profile and
   * settles the race on a cold one. Found 2026-09-20 on a from-scratch
   * verification run; invisible on any profile that had already run once,
   * because the theme was left enabled from before.
   */
  async reassertBuiltInTheme(_win) {
    const mode = this.followsSystem
      ? "system"
      : Services.prefs.getStringPref(kModePref, "dark");
    const wanted = kBuiltInThemeIds[mode] || kBuiltInThemeIds.system;
    if (wanted === kBuiltInThemeIds.system) {
      return; // we WANT the default theme; nothing to defend against
    }
    try {
      const { AddonManager } = ChromeUtils.importESModule(
        "resource://gre/modules/AddonManager.sys.mjs"
      );
      // Bounded, and deliberately narrow. The ONLY thing this re-takes the
      // theme from is default-theme@mozilla.org, because that is the one
      // XPIProvider installs itself, and installing it makes it active. A
      // theme the USER picked is never overridden — if they chose Alpenglow,
      // that is what stays.
      for (let i = 0; i < 20; i++) {
        await this._enableBuiltInTheme(mode);
        await new Promise(r => lazy.setTimeout(r, 500));
        const active = (await AddonManager.getAddonsByTypes(["theme"])).filter(
          t => t.isActive
        );
        if (active.some(t => t.id === wanted)) {
          return; // ours is on — done
        }
        if (!active.some(t => t.id === kBuiltInThemeIds.system)) {
          return; // something else is on, and it is not the install race
        }
      }
      console.warn(
        "KavachaThemeEngine: gave up re-asserting the built-in theme; " +
          "default-theme kept taking it back"
      );
    } catch (e) {
      console.error("KavachaThemeEngine: could not re-assert the built-in theme", e);
    }
  },

  _builtInPending: null,
  async _enableBuiltInTheme(mode) {
    const id = kBuiltInThemeIds[mode] || kBuiltInThemeIds.system;
    // Serialize: two windows applying at once must not race AddonManager.
    this._builtInPending = (this._builtInPending || Promise.resolve()).then(async () => {
      const { AddonManager } = ChromeUtils.importESModule(
        "resource://gre/modules/AddonManager.sys.mjs"
      );
      // WAIT FOR THE ADDON MANAGER. This runs at browser-window-before-show,
      // which on a COLD PROFILE is before AddonManager startup completes —
      // getAddonByID then answers for a manager that knows about no themes
      // yet, we enable nothing, and nothing ever retries. The result was a
      // fresh profile keeping Firefox's default theme while Kavacha's own
      // kavacha-theme-mode said "dark": the chrome disagreed with the theme.
      // Invisible on any profile that had already run once, which is why it
      // only showed up on a from-scratch verification run (2026-09-20).
      if (!AddonManager.isReady) {
        await AddonManager.readyPromise;
      }
      const addon = await AddonManager.getAddonByID(id);
      if (addon && !addon.isActive) {
        await addon.enable();
      }
    });
    return this._builtInPending;
  },

  /**
   * The user's accent (kavacha.theme.accent, a hex string; absent = the
   * theme's own accent, or none — Kavacha ships no default accent, user
   * decision 2026-07-13). Stamped after the theme tokens so it wins.
   */
  _applyAccent(win, root, managed) {
    const accent = Services.prefs.getStringPref(kAccentPref, "").trim();
    if (/^#[0-9a-f]{6}$/i.test(accent)) {
      root.style.setProperty("--kavacha-accent", accent, "important");
      managed.add("--kavacha-accent");
    }
  },

  /**
   * Keep text readable. A theme package is arbitrary user/marketplace data and
   * nothing stopped it from putting 2:1 text on its own surface; the browser
   * then had no readable chrome and no way back except editing a pref by hand.
   *
   * Returns the colours to apply — the theme's own when they pass, otherwise a
   * copy with the failing text tokens replaced by the higher-contrast of black
   * and white. Deliberately a repair, not a rejection: the user asked for this
   * theme, so they get its surfaces, just with text they can read.
   */
  _guardContrast(win, theme) {
    const colors = theme.colors || {};
    const report = this.contrastOf(colors, win);
    if (report.passes) {
      return colors;
    }
    const surface = this._resolveColor(win, colors.surface);
    if (!surface) {
      return colors;
    }
    const elevated = this._resolveColor(win, colors.surfaceElevated) || surface;
    const fixed = { ...colors };
    if (report.primary < kMinContrast) {
      fixed.textPrimary = bestTextOn(surface);
    }
    if (report.secondary < kMinContrast) {
      // Secondary text should still read as secondary, so step it back toward
      // the surface as far as contrast allows rather than matching primary.
      fixed.textSecondary = dimmedTextOn(elevated);
    }
    win.console?.warn(
      `KavachaThemeEngine: theme "${theme.id}" fails WCAG AA ` +
        `(text ${report.primary.toFixed(2)}:1, secondary ` +
        `${report.secondary.toFixed(2)}:1, minimum ${kMinContrast}:1); ` +
        `substituting readable text colours`
    );
    return fixed;
  },

  /**
   * Resolve any CSS colour to [r, g, b] using the style system itself, so this
   * accepts exactly what CSS accepts — named colours, hsl(), oklch(),
   * color-mix(), and `var(--kavacha-surface)` resolved in the chrome cascade.
   *
   * The old hand-written parser knew four syntaxes and answered null for the
   * rest, and null was treated as "dark", so an oklch light theme rendered as
   * dark chrome with no diagnostic.
   *
   * `win` may be null for package-level queries (modeOf, contrastOf from a
   * settings page); it then borrows the most recent browser window, and falls
   * back to the literal parser if there is none.
   */
  _resolveColor(win, value) {
    if (!value) {
      return null;
    }
    const target = win || Services.wm.getMostRecentBrowserWindow();
    const doc = target?.document;
    if (!doc?.documentElement) {
      return parseLiteralColor(value);
    }
    let probe;
    try {
      probe = doc.createElementNS("http://www.w3.org/1999/xhtml", "span");
      // display:none still resolves `color`, and costs no layout.
      probe.style.display = "none";
      probe.style.color = value;
      // Must be in the tree: var() resolves against the cascade, and an
      // orphaned node has none.
      doc.documentElement.appendChild(probe);
      const computed = target.getComputedStyle(probe).color;
      return parseLiteralColor(computed) || parseLiteralColor(value);
    } catch (e) {
      return parseLiteralColor(value);
    } finally {
      probe?.remove();
    }
  },
};

// The manifest fixes colors to "colors.json", but read it from the manifest so
// a future package format stays honored.
function colorsFileOf(manifest) {
  return typeof manifest.colors === "string" ? manifest.colors : "colors.json";
}

// Last-resort literal parser, and the reader for the rgb()/rgba() the style
// system hands back. Not the primary path any more — see _resolveColor.
function parseLiteralColor(str) {
  if (!str) {
    return null;
  }
  const s = String(str).trim();
  let m = s.match(/^#([0-9a-f]{3})$/i);
  if (m) {
    return m[1].split("").map(c => parseInt(c + c, 16));
  }
  m = s.match(/^#([0-9a-f]{6})$/i);
  if (m) {
    return [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16));
  }
  // The style system hands anything that went through color-mix() back as
  // `color(srgb r g b / a)`, with 0..1 channels — not rgb(). Reading only rgb()
  // meant _resolveColor answered null for those, and null is "leave the mode
  // unchanged", so a theme whose surface was built from a color-mix() would
  // never get a mode stamped and would silently keep the previous theme's
  // light/dark. Found while auditing this file's own probe, which had the same
  // gap and reported zero unreadable elements on a strip where every one of the
  // 21 was unreadable.
  m = s.match(/^color\(srgb\s+([^)]+)\)$/i);
  if (m) {
    const parts = m[1]
      .split(/[\s/]+/)
      .filter(Boolean)
      .slice(0, 3)
      .map(Number);
    if (parts.length === 3 && parts.every(n => !Number.isNaN(n))) {
      return parts.map(n => Math.round(Math.min(1, Math.max(0, n)) * 255));
    }
  }
  m = s.match(/^rgba?\(([^)]+)\)$/i);
  if (m) {
    const parts = m[1]
      .split(/[,\s/]+/)
      .filter(Boolean)
      .slice(0, 3)
      .map(Number);
    if (parts.length === 3 && parts.every(n => !Number.isNaN(n))) {
      return parts;
    }
  }
  return null;
}

// WCAG 2.1 relative luminance. The gamma linearisation is the part the previous
// weighted average omitted: without it the number is not a luminance and any
// contrast ratio built on it is wrong, which is why light/dark used to be
// decided at a threshold of 0.45 on raw channels.
function relativeLuminance([r, g, b]) {
  const lin = c => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrastRatio(fg, bg) {
  const a = relativeLuminance(fg);
  const b = relativeLuminance(bg);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/** Whichever of white/black reads better on this background. */
function bestTextOn(bg) {
  return relativeLuminance(bg) < 0.18 ? "#FFFFFF" : "#000000";
}

/**
 * Secondary text: the best text colour stepped back toward the surface as far
 * as still clears AA, so it reads as subordinate rather than as a second
 * primary. Walks down in tenths and keeps the last passing blend.
 */
function dimmedTextOn(bg) {
  const best = bestTextOn(bg) === "#FFFFFF" ? [255, 255, 255] : [0, 0, 0];
  let chosen = best;
  for (let mix = 0.1; mix <= 0.5; mix += 0.1) {
    const blend = best.map((c, i) => Math.round(c + (bg[i] - c) * mix));
    if (contrastRatio(blend, bg) < kMinContrast) {
      break;
    }
    chosen = blend;
  }
  return `rgb(${chosen[0]}, ${chosen[1]}, ${chosen[2]})`;
}
