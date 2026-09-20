/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Kavacha Privacy Center (ADR 0007; ROADMAP Phase 4). A pure reader over
// Firefox's tracking-protection ledger — protections.sqlite via
// TrackingDBService / PrivacyMetricsService — plus a live view of the
// protections Kavacha ships enabled. Collects nothing itself; everything
// shown is already on the device.

"use strict";

// NOTE: MOZ_SRC_FILES module (not EXTRA_JS_MODULES) — the resource:///modules/
// URI does not exist for this file.
const { PrivacyMetricsService } = ChromeUtils.importESModule(
  "moz-src:///browser/components/protections/PrivacyMetricsService.sys.mjs"
);

// Services.search no longer exists in Firefox 152 — the service is reached
// through moz-src, the same way patch 0003's per-workspace engine override
// does it.
//
// NAMED kavachaLazy, NOT `lazy`. Every pane script in about:preferences is a
// classic <script> sharing ONE global, and search.js already declares
// `const lazy` at top level. Two top-level `const lazy` in the same scope is a
// SyntaxError, which kills THIS ENTIRE FILE at parse time -- and because a
// parse failure means gKavachaPrivacyCenter never gets defined, the
// register_module() call for it in preferences.js then threw and aborted
// init_all(), taking every pane registered after it (the other three Kavacha
// panes, Firefox Labs, Sync) down with it. Observed as "Settings opens but
// nothing works". Any new top-level binding here needs a kavacha* prefix.
const kavachaLazy = {};
ChromeUtils.defineESModuleGetters(kavachaLazy, {
  SearchService: "moz-src:///toolkit/components/search/SearchService.sys.mjs",
});

// ADR 0007: Firefox counts blocked events but never measures bytes. This is
// a deliberately conservative average tracker payload (script + beacons +
// cookie round-trips); the UI labels the derived figure "estimated".
const KAVACHA_BYTES_PER_BLOCKED_EVENT = 35 * 1024;

// The capabilities the central permission manager covers (ROADMAP Phase 4).
// Order is deliberate: the four the plan names first -- location, camera,
// microphone, notifications -- then the rest of Gecko's persisted,
// privacy-relevant permissions, because "instead of per-site digging" is only
// true if the dashboard is where the digging ends.
//
// CLIPBOARD IS ABSENT, and that is a finding rather than an omission. Firefox
// 152 does not persist clipboard access as a site permission at all: there is
// no "clipboard" permission type and no permissions.default.clipboard pref
// (the other capabilities here all have one). A page that wants to read the
// clipboard gets a one-time in-content Paste confirmation and nothing is
// stored, so there is no grant to list, audit or revoke. Inventing a row for
// it would show the user a control over a thing that does not exist. The pane
// says so instead.
//
// `hasDefaultPref` marks the types with a permissions.default.<type> pref in
// firefox.js. Where there is none, the per-site list still works but there is
// no global default to offer, so no selector is rendered.
const KAVACHA_PERMISSION_TYPES = [
  { type: "geo", hasDefaultPref: true },
  { type: "camera", hasDefaultPref: true },
  { type: "microphone", hasDefaultPref: true },
  { type: "desktop-notification", hasDefaultPref: true },
  { type: "xr", hasDefaultPref: true },
  { type: "local-network", hasDefaultPref: true },
  { type: "persistent-storage", hasDefaultPref: false },
  { type: "midi", hasDefaultPref: false },
  { type: "speaker-selection", hasDefaultPref: false },
  { type: "autoplay-media", hasDefaultPref: false },
];

// nsIPermissionManager capabilities.
const KAVACHA_PERM_UNKNOWN = 0;
const KAVACHA_PERM_ALLOW = 1;
const KAVACHA_PERM_DENY = 2;
const KAVACHA_PERM_PROMPT = 3;
// nsICookiePermission.ACCESS_SESSION. Deliberately 8 rather than 3: cookie
// permissions share the capability space with the generic ones, so the values
// are spaced to avoid colliding.
const KAVACHA_PERM_SESSION = 8;

// Clearing cookies at shutdown needs BOTH prefs. sanitizeOnShutdown is the
// master switch for the whole sweep; the _v2 pref selects cookies as one of
// the things it sweeps. Setting only one silently does nothing, which is the
// kind of half-wired control this pane exists to avoid.
const KAVACHA_SANITIZE_ON_SHUTDOWN = "privacy.sanitize.sanitizeOnShutdown";
const KAVACHA_CLEAR_COOKIES = "privacy.clearOnShutdown_v2.cookiesAndStorage";
// The sibling clearOnShutdown_v2 sweeps. Several DEFAULT TO TRUE and sit inert
// only while the master switch is off, so arming the master without pinning
// these off would clear history/downloads/cache the cookie checkbox never
// mentioned. Firefox's own sanitize machinery re-syncs some of these behind
// us (formdata was observed flipping back to true), so their live values are
// not a reliable signal -- ownership tracking, not sibling reads, drives this.
const KAVACHA_SHUTDOWN_SIBLINGS = [
  "privacy.clearOnShutdown_v2.historyFormDataAndDownloads",
  "privacy.clearOnShutdown_v2.browsingHistoryAndDownloads",
  "privacy.clearOnShutdown_v2.cache",
  "privacy.clearOnShutdown_v2.siteSettings",
  "privacy.clearOnShutdown_v2.formdata",
];
// Set when it was THIS checkbox that armed sanitizeOnShutdown, so untick knows
// it may fully stand the sweep back down. If the user had already configured
// shutdown clearing in Firefox's own UI, the master was on before us, we never
// take ownership, and untick only removes cookies from their existing sweep.
const KAVACHA_OWNS_SANITIZE = "kavacha.privacy.owns-sanitize-on-shutdown";

var gKavachaPrivacyCenter = {
  _initted: false,

  init() {
    if (this._initted) {
      return;
    }
    this._initted = true;
    document
      .getElementById("kavachaPrivacyClearStats")
      .addEventListener("command", () => this._clearStats());
    document
      .getElementById("kavachaPrivacySearchEngine")
      .addEventListener("command", event =>
        this._setSearchEngine(event.target.value)
      );
    document
      .getElementById("kavachaPermissionsClearAll")
      .addEventListener("command", () => this._clearAllPermissions());
    document
      .getElementById("kavachaSitesPicker")
      .addEventListener("command", event => {
        this._selectedSite = event.target.value;
        this._renderSites();
      });
    document
      .getElementById("kavachaSitesForget")
      .addEventListener("command", () => this._forgetSite());
    document
      .getElementById("kavachaCookiesClearOnClose")
      .addEventListener("command", event =>
        this._setClearCookiesOnClose(event.target.checked)
      );
    document
      .getElementById("kavachaCookiesAddSession")
      .addEventListener("command", () => this._addSessionCookieRule());
    document
      .getElementById("kavachaCookiesDomain")
      .addEventListener("keydown", event => {
        if (event.key === "Enter") {
          this._addSessionCookieRule();
        }
      });
    document
      .getElementById("kavachaIndexEnabled")
      .addEventListener("command", event =>
        this._setIndexEnabled(event.target.checked)
      );
    document
      .getElementById("kavachaIndexClear")
      .addEventListener("command", () => this._clearIndex());
    document
      .getElementById("kavachaAIEnabled")
      .addEventListener("command", event =>
        this._setAIEnabled(event.target.checked)
      );
    document
      .getElementById("kavachaAIEndpoint")
      .addEventListener("change", event =>
        this._setAIEndpoint(event.target.value)
      );
    document
      .getElementById("kavachaAIModel")
      .addEventListener("command", event =>
        Services.prefs.setStringPref("kavacha.ai.model", event.target.value)
      );
    document
      .getElementById("kavachaAIRefresh")
      .addEventListener("command", () => this._renderAI());
    // The engine can also change from the workspace override (patch 0003),
    // about:preferences#search, or the search bar. Follow it rather than
    // letting this pane drift out of sync with the browser.
    Services.obs.addObserver(this, "browser-search-engine-modified");
    // Permissions change from the doorhanger and the identity panel while
    // this pane is open; "perm-changed" keeps the counts honest.
    Services.obs.addObserver(this, "perm-changed");
    window.addEventListener("unload", () => this.uninit(), { once: true });
    this._refresh();
  },

  uninit() {
    if (!this._initted) {
      return;
    }
    this._initted = false;
    Services.obs.removeObserver(this, "browser-search-engine-modified");
    Services.obs.removeObserver(this, "perm-changed");
  },

  observe(subject, topic, data) {
    if (topic === "browser-search-engine-modified" && data === "engine-default") {
      this._renderSearch();
    } else if (topic === "perm-changed") {
      this._renderPermissions();
      this._renderCookies();
      this._renderSites();
    }
  },

  get _trackingDB() {
    return Cc["@mozilla.org/tracking-db-service;1"].getService(
      Ci.nsITrackingDBService
    );
  },

  // ----- Site trust profiles (FEATURES 3.4; per-site drilldown) -----------

  // The origin whose card is showing. Kept across re-renders so a
  // perm-changed does not bounce the user back to the first site while they
  // are editing the fourth.
  _selectedSite: null,

  /** Origin -> [nsIPermission], for every type this pane can act on. */
  _sitesWithState() {
    const wanted = new Set([
      ...KAVACHA_PERMISSION_TYPES.map(p => p.type),
      "cookie",
    ]);
    const sites = new Map();
    for (const perm of Services.perms.all) {
      if (!wanted.has(perm.type) || perm.capability === KAVACHA_PERM_UNKNOWN) {
        continue;
      }
      const origin = perm.principal.origin;
      if (!sites.has(origin)) {
        sites.set(origin, []);
      }
      sites.get(origin).push(perm);
    }
    return new Map([...sites].sort((a, b) => a[0].localeCompare(b[0])));
  },

  _renderSites() {
    const picker = document.getElementById("kavachaSitesPicker");
    if (!picker) {
      return;
    }
    let sites;
    try {
      sites = this._sitesWithState();
    } catch (e) {
      console.error("KavachaPrivacyCenter: could not read site state", e);
      return;
    }

    const empty = document.getElementById("kavachaSitesEmpty");
    const row = document.getElementById("kavachaSitesPickerRow");
    const profile = document.getElementById("kavachaSitesProfile");
    empty.hidden = !!sites.size;
    row.hidden = !sites.size;
    profile.textContent = "";
    if (!sites.size) {
      this._selectedSite = null;
      return;
    }

    if (!sites.has(this._selectedSite)) {
      this._selectedSite = [...sites.keys()][0];
    }
    const popup = picker.menupopup;
    popup.textContent = "";
    for (const origin of sites.keys()) {
      const item = document.createXULElement("menuitem");
      item.setAttribute("label", origin);
      item.setAttribute("value", origin);
      popup.append(item);
    }
    picker.value = this._selectedSite;

    // The card: one row per capability this site has an opinion about, plus
    // its cookie rule. This is the drilldown -- the same facts the per-type
    // lists above hold, pivoted so a single site can be read at a glance.
    for (const perm of sites.get(this._selectedSite)) {
      const line = document.createXULElement("hbox");
      line.className = "kavacha-privacy-row";
      line.setAttribute("align", "center");

      const label = document.createXULElement("label");
      document.l10n.setAttributes(
        label,
        perm.type === "cookie"
          ? "kavacha-sites-cookie-row"
          : "kavacha-permission-" + perm.type
      );
      line.append(label);

      const spacer = document.createXULElement("spacer");
      spacer.setAttribute("flex", "1");
      line.append(spacer);

      const state = document.createXULElement("label");
      state.className = "kavacha-permission-state";
      document.l10n.setAttributes(state, this._stateLabel(perm));
      line.append(state);

      const remove = document.createXULElement("button");
      document.l10n.setAttributes(remove, "kavacha-permissions-remove");
      remove.addEventListener("command", () =>
        this._removePermission(perm.principal, perm.type)
      );
      line.append(remove);
      profile.append(line);
    }
  },

  _stateLabel(perm) {
    if (perm.type === "cookie") {
      if (perm.capability === KAVACHA_PERM_SESSION) {
        return "kavacha-cookies-state-session";
      }
      return perm.capability === KAVACHA_PERM_ALLOW
        ? "kavacha-cookies-state-allow"
        : "kavacha-cookies-state-block";
    }
    return this._genericStateLabel(perm.capability);
  },

  // ALLOW/DENY are the only firm states; PROMPT (and any extended capability
  // an autoplay-style type may carry) means "no standing decision", which must
  // read as "ask", never "Blocked" -- mislabelling "ask me" as blocked is a
  // correctness failure in the one screen that exists to report these.
  _genericStateLabel(capability) {
    switch (capability) {
      case KAVACHA_PERM_ALLOW:
        return "kavacha-permission-state-allow";
      case KAVACHA_PERM_DENY:
        return "kavacha-permission-state-block";
      case KAVACHA_PERM_PROMPT:
      default:
        return "kavacha-permission-state-ask";
    }
  },

  _forgetSite() {
    if (!this._selectedSite) {
      return;
    }
    const sites = this._sitesWithState();
    for (const perm of sites.get(this._selectedSite) || []) {
      try {
        Services.perms.removeFromPrincipal(perm.principal, perm.type);
      } catch (e) {
        console.error("KavachaPrivacyCenter: could not forget site", e);
      }
    }
    this._selectedSite = null;
    this._refresh();
  },

  // ----- Session-scoped cookie rules (FEATURES 3.3; Phase 4) --------------

  _renderCookies() {
    const clearBox = document.getElementById("kavachaCookiesClearOnClose");
    if (!clearBox) {
      return;
    }
    clearBox.checked =
      Services.prefs.getBoolPref(KAVACHA_SANITIZE_ON_SHUTDOWN, false) &&
      Services.prefs.getBoolPref(KAVACHA_CLEAR_COOKIES, false);
    document.getElementById("kavachaCookiesClearNote").hidden =
      !clearBox.checked;

    const host = document.getElementById("kavachaCookiesRules");
    host.textContent = "";
    let rules;
    try {
      rules = Services.perms.all.filter(
        p =>
          p.type === "cookie" &&
          (p.capability === KAVACHA_PERM_ALLOW ||
            p.capability === KAVACHA_PERM_DENY ||
            p.capability === KAVACHA_PERM_SESSION)
      );
    } catch (e) {
      console.error("KavachaPrivacyCenter: could not read cookie rules", e);
      return;
    }
    rules.sort((a, b) => a.principal.origin.localeCompare(b.principal.origin));

    if (!rules.length) {
      const empty = document.createXULElement("description");
      empty.className = "description-deemphasized";
      document.l10n.setAttributes(empty, "kavacha-cookies-empty");
      host.append(empty);
      return;
    }

    for (const rule of rules) {
      const row = document.createXULElement("hbox");
      row.className = "kavacha-permission-site";
      row.setAttribute("align", "center");

      const origin = document.createXULElement("label");
      origin.className = "kavacha-permission-origin";
      origin.setAttribute("value", rule.principal.origin);
      row.append(origin);

      const spacer = document.createXULElement("spacer");
      spacer.setAttribute("flex", "1");
      row.append(spacer);

      row.append(this._cookieStateMenu(rule));

      const remove = document.createXULElement("button");
      document.l10n.setAttributes(remove, "kavacha-cookies-remove");
      remove.addEventListener("command", () =>
        this._removeCookieRule(rule.principal)
      );
      row.append(remove);
      host.append(row);
    }
  },

  _cookieStateMenu(rule) {
    const list = document.createXULElement("menulist");
    const popup = document.createXULElement("menupopup");
    for (const [value, l10nId] of [
      [KAVACHA_PERM_ALLOW, "kavacha-cookies-state-allow"],
      [KAVACHA_PERM_SESSION, "kavacha-cookies-state-session"],
      [KAVACHA_PERM_DENY, "kavacha-cookies-state-block"],
    ]) {
      const item = document.createXULElement("menuitem");
      item.setAttribute("value", String(value));
      document.l10n.setAttributes(item, l10nId);
      popup.append(item);
    }
    list.append(popup);
    list.value = String(rule.capability);
    list.addEventListener("command", event => {
      this._setCookieRule(rule.principal, Number(event.target.value));
    });
    return list;
  },

  _setCookieRule(principal, capability) {
    try {
      Services.perms.addFromPrincipal(principal, "cookie", capability);
      if (capability === KAVACHA_PERM_SESSION) {
        // ACCESS_SESSION only downgrades cookies set AFTER the rule; the
        // site's already-stored cookies keep their persistent expiry and
        // would survive the next quit, contradicting "not kept after you
        // quit". Clear them now so the guarantee holds for them too — they
        // re-set as session cookies on the next visit.
        this._clearStoredCookies(principal);
      }
    } catch (e) {
      console.error("KavachaPrivacyCenter: could not set cookie rule", e);
    }
    this._renderCookies();
  },

  _clearStoredCookies(principal) {
    try {
      const host = principal.host || principal.URI?.host;
      if (host) {
        // Empty pattern: this host across every origin-attributes partition.
        Services.cookies.removeCookiesFromExactHost(host, "{}");
      }
    } catch (e) {
      console.error("KavachaPrivacyCenter: could not clear stored cookies", e);
    }
  },

  _removeCookieRule(principal) {
    try {
      Services.perms.removeFromPrincipal(principal, "cookie");
    } catch (e) {
      console.error("KavachaPrivacyCenter: could not remove cookie rule", e);
    }
    this._renderCookies();
  },

  _addSessionCookieRule() {
    const input = document.getElementById("kavachaCookiesDomain");
    const error = document.getElementById("kavachaCookiesAddError");
    const raw = input.value.trim();
    if (!raw) {
      return;
    }
    // Accept "example.com" as well as a full URL. A bare host has no scheme,
    // and createContentPrincipalFromOrigin requires one.
    const origin = /^https?:\/\//i.test(raw) ? raw : "https://" + raw;
    let principal;
    try {
      const uri = Services.io.newURI(origin);
      if (!uri.host) {
        throw new Error("no host");
      }
      principal =
        Services.scriptSecurityManager.createContentPrincipalFromOrigin(
          uri.prePath
        );
    } catch (e) {
      error.hidden = false;
      return;
    }
    error.hidden = true;
    input.value = "";
    this._setCookieRule(principal, KAVACHA_PERM_SESSION);
  },

  _setClearCookiesOnClose(on) {
    Services.prefs.setBoolPref(KAVACHA_CLEAR_COOKIES, on);
    if (on) {
      if (!Services.prefs.getBoolPref(KAVACHA_SANITIZE_ON_SHUTDOWN, false)) {
        // Kavacha is arming the master switch: pin the non-cookie sweeps off
        // so the shutdown sweep matches the checkbox label, and record that
        // the switch is ours to stand back down.
        for (const p of KAVACHA_SHUTDOWN_SIBLINGS) {
          Services.prefs.setBoolPref(p, false);
        }
        Services.prefs.setBoolPref(KAVACHA_OWNS_SANITIZE, true);
        Services.prefs.setBoolPref(KAVACHA_SANITIZE_ON_SHUTDOWN, true);
      }
      // Master already on: the user set up shutdown clearing themselves;
      // adding cookies to their existing sweep is all this checkbox may do.
    } else if (Services.prefs.getBoolPref(KAVACHA_OWNS_SANITIZE, false)) {
      // We own the switch -- undo exactly what enabling did, deterministically.
      // Reading the siblings back to decide is unreliable (Firefox re-syncs
      // some of them), so ownership is the sole authority: master off, our
      // pins cleared to their inert defaults, ownership released.
      Services.prefs.setBoolPref(KAVACHA_SANITIZE_ON_SHUTDOWN, false);
      for (const p of KAVACHA_SHUTDOWN_SIBLINGS) {
        Services.prefs.clearUserPref(p);
      }
      Services.prefs.clearUserPref(KAVACHA_OWNS_SANITIZE);
    }
    this._renderCookies();
  },

  // ----- Central permission manager (ROADMAP Phase 4) ---------------------

  // Which type rows the user has expanded. Kept across re-renders so a
  // perm-changed notification -- which fires on every removal -- does not
  // collapse the list the user is working in.
  _expandedPermissions: new Set(),

  /** Every stored site permission, grouped by type. */
  _permissionsByType() {
    const wanted = new Set(KAVACHA_PERMISSION_TYPES.map(p => p.type));
    const grouped = new Map(KAVACHA_PERMISSION_TYPES.map(p => [p.type, []]));
    for (const perm of Services.perms.all) {
      if (!wanted.has(perm.type)) {
        continue;
      }
      // UNKNOWN_ACTION is Gecko's "no opinion" -- a row that neither allows
      // nor blocks is not an exception the user made, so it is not one we
      // should show them.
      if (perm.capability === KAVACHA_PERM_UNKNOWN) {
        continue;
      }
      grouped.get(perm.type).push(perm);
    }
    for (const list of grouped.values()) {
      list.sort((a, b) => a.principal.origin.localeCompare(b.principal.origin));
    }
    return grouped;
  },

  _renderPermissions() {
    const host = document.getElementById("kavachaPermissionsList");
    if (!host) {
      return;
    }
    let grouped;
    try {
      grouped = this._permissionsByType();
    } catch (e) {
      console.error("KavachaPrivacyCenter: could not read permissions", e);
      return;
    }

    host.textContent = "";
    let total = 0;
    for (const { type, hasDefaultPref } of KAVACHA_PERMISSION_TYPES) {
      const perms = grouped.get(type);
      total += perms.length;
      host.append(this._permissionRow(type, hasDefaultPref, perms));
      if (this._expandedPermissions.has(type) && perms.length) {
        host.append(this._permissionSites(type, perms));
      }
    }
    document.getElementById("kavachaPermissionsClearAll").disabled = !total;
  },

  _permissionRow(type, hasDefaultPref, perms) {
    const row = document.createXULElement("hbox");
    row.className = "kavacha-privacy-row";
    row.setAttribute("align", "center");

    const label = document.createXULElement("label");
    document.l10n.setAttributes(label, "kavacha-permission-" + type);
    row.append(label);

    const spacer = document.createXULElement("spacer");
    spacer.setAttribute("flex", "1");
    row.append(spacer);

    const count = document.createXULElement("label");
    count.className = "kavacha-permission-count";
    document.l10n.setAttributes(count, "kavacha-permissions-sites", {
      count: perms.length,
    });
    row.append(count);

    if (perms.length) {
      const toggle = document.createXULElement("button");
      const expanded = this._expandedPermissions.has(type);
      document.l10n.setAttributes(
        toggle,
        expanded ? "kavacha-permissions-hide" : "kavacha-permissions-manage"
      );
      toggle.addEventListener("command", () => {
        if (expanded) {
          this._expandedPermissions.delete(type);
        } else {
          this._expandedPermissions.add(type);
        }
        this._renderPermissions();
      });
      row.append(toggle);
    }

    if (hasDefaultPref) {
      row.append(this._permissionDefaultMenu(type));
    }
    return row;
  },

  // The global default for a capability. This is the half that makes the pane
  // a manager rather than a list: "never ask me for notifications again" is
  // one control here instead of a decision repeated per site forever.
  _permissionDefaultMenu(type) {
    const pref = "permissions.default." + type;
    const list = document.createXULElement("menulist");
    const popup = document.createXULElement("menupopup");
    for (const [value, l10nId] of [
      [KAVACHA_PERM_UNKNOWN, "kavacha-permission-default-ask"],
      [KAVACHA_PERM_ALLOW, "kavacha-permission-default-allow"],
      [KAVACHA_PERM_DENY, "kavacha-permission-default-block"],
    ]) {
      const item = document.createXULElement("menuitem");
      item.setAttribute("value", String(value));
      document.l10n.setAttributes(item, l10nId);
      popup.append(item);
    }
    list.append(popup);
    list.value = String(
      Services.prefs.getIntPref(pref, KAVACHA_PERM_UNKNOWN)
    );
    list.addEventListener("command", event => {
      Services.prefs.setIntPref(pref, Number(event.target.value));
    });
    return list;
  },

  _permissionSites(type, perms) {
    const box = document.createXULElement("vbox");
    box.className = "kavacha-permission-sites";
    for (const perm of perms) {
      const row = document.createXULElement("hbox");
      row.className = "kavacha-permission-site";
      row.setAttribute("align", "center");

      const origin = document.createXULElement("label");
      origin.className = "kavacha-permission-origin";
      origin.setAttribute("value", perm.principal.origin);
      row.append(origin);

      const spacer = document.createXULElement("spacer");
      spacer.setAttribute("flex", "1");
      row.append(spacer);

      const state = document.createXULElement("label");
      state.className = "kavacha-permission-state";
      document.l10n.setAttributes(state, this._genericStateLabel(perm.capability));
      row.append(state);

      const remove = document.createXULElement("button");
      document.l10n.setAttributes(remove, "kavacha-permissions-remove");
      remove.addEventListener("command", () =>
        this._removePermission(perm.principal, type)
      );
      row.append(remove);
      box.append(row);
    }

    const clear = document.createXULElement("button");
    document.l10n.setAttributes(clear, "kavacha-permissions-clear-type");
    clear.className = "kavacha-permission-clear-type";
    clear.addEventListener("command", () => this._clearPermissionType(type));
    const footer = document.createXULElement("hbox");
    footer.setAttribute("pack", "end");
    footer.append(clear);
    box.append(footer);
    return box;
  },

  _removePermission(principal, type) {
    try {
      Services.perms.removeFromPrincipal(principal, type);
    } catch (e) {
      console.error("KavachaPrivacyCenter: could not remove permission", e);
    }
    // perm-changed re-renders, but not every path notifies synchronously.
    this._renderPermissions();
  },

  _clearPermissionType(type) {
    try {
      Services.perms.removeByType(type);
    } catch (e) {
      console.error("KavachaPrivacyCenter: could not clear permissions", e);
    }
    this._renderPermissions();
  },

  _clearAllPermissions() {
    for (const { type } of KAVACHA_PERMISSION_TYPES) {
      try {
        Services.perms.removeByType(type);
      } catch (e) {
        console.error("KavachaPrivacyCenter: could not clear permissions", e);
      }
    }
    this._expandedPermissions.clear();
    this._renderPermissions();
  },

  // The one-click escape from the privacy default. Brave Search is what
  // Kavacha ships (search config, ROADMAP Phase 4), but a default users cannot
  // leave is a lock-in, so the switch lives right next to the claim rather
  // than three panes away.
  async _renderSearch() {
    const list = document.getElementById("kavachaPrivacySearchEngine");
    try {
      await kavachaLazy.SearchService.promiseInitialized;
      const engines = await kavachaLazy.SearchService.getVisibleEngines();
      const current = kavachaLazy.SearchService.defaultEngine?.name || "";
      const popup = list.menupopup;
      popup.textContent = "";
      for (const engine of engines) {
        const item = document.createXULElement("menuitem");
        item.setAttribute("label", engine.name);
        item.setAttribute("value", engine.name);
        popup.appendChild(item);
      }
      list.value = current;
      list.disabled = !engines.length;
    } catch (e) {
      // A pane that silently shows an empty dropdown is worse than one that
      // admits it could not read the engine list.
      console.error("KavachaPrivacyCenter: could not list search engines", e);
      list.disabled = true;
    }
  },

  async _setSearchEngine(name) {
    try {
      await kavachaLazy.SearchService.promiseInitialized;
      const engine = kavachaLazy.SearchService.getEngineByName(name);
      if (!engine || engine === kavachaLazy.SearchService.defaultEngine) {
        return;
      }
      // CHANGE_REASON.USER matters: patch 0003 watches for a user-initiated
      // default change and adopts it into the active Space's override, so
      // switching here does not get reverted at the next workspace switch.
      await kavachaLazy.SearchService.setDefault(
        engine,
        kavachaLazy.SearchService.CHANGE_REASON.USER
      );
    } catch (e) {
      console.error("KavachaPrivacyCenter: could not set search engine", e);
      this._renderSearch(); // Put the control back to the real value.
    }
  },

  async _refresh() {
    this._renderPosture();
    this._renderSearch();
    this._renderPermissions();
    this._renderCookies();
    this._renderSites();
    this._renderIndex();
    this._renderAI();

    const recording = Services.prefs.getBoolPref(
      "browser.contentblocking.database.enabled",
      true
    );
    document.getElementById("kavachaPrivacyPaused").hidden = recording;

    try {
      const [week, today, allTime, earliest] = await Promise.all([
        PrivacyMetricsService.getWeeklyStats(),
        PrivacyMetricsService.getTodayStats(),
        this._trackingDB.sumAllEvents(),
        this._trackingDB.getEarliestRecordedDate(),
      ]);

      const fmt = new Intl.NumberFormat();
      this._setValue("kavachaPrivacyValueAllTime", fmt.format(allTime));
      this._setValue("kavachaPrivacyValueWeek", fmt.format(week.total));
      this._setValue("kavachaPrivacyValueToday", fmt.format(today.total));
      this._setValue(
        "kavachaPrivacyValueBandwidth",
        this._formatBytes(allTime * KAVACHA_BYTES_PER_BLOCKED_EVENT)
      );

      this._setValue("kavachaPrivacyRowTrackers", fmt.format(week.trackers));
      this._setValue("kavachaPrivacyRowCookies", fmt.format(week.cookies));
      this._setValue(
        "kavachaPrivacyRowFingerprinters",
        fmt.format(week.fingerprinters)
      );
      this._setValue(
        "kavachaPrivacyRowCryptominers",
        fmt.format(week.cryptominers)
      );
      this._setValue("kavachaPrivacyRowSocial", fmt.format(week.socialTrackers));

      const since = document.getElementById("kavachaPrivacyStatsSince");
      if (earliest) {
        document.l10n.setAttributes(since, "kavacha-privacy-stats-since", {
          date: new Intl.DateTimeFormat(undefined, {
            dateStyle: "medium",
          }).format(new Date(earliest)),
        });
        since.hidden = false;
      } else {
        since.hidden = true;
      }
    } catch (e) {
      console.error("KavachaPrivacyCenter: failed to read blocking stats", e);
    }
  },

  // One table drives three things: the Active Protections rows, the privacy
  // score, and the "to improve" list. They were three separate lists before
  // the score existed, and three lists of the same facts drift.
  //
  // `fix` is what the Turn on button does. A check with no fix is still
  // scored and still explained, but the button is not offered -- a control
  // that looks actionable and does nothing is worse than no control.
  get _postureChecks() {
    const prefs = Services.prefs;
    return [
      {
        id: "kavachaPostureEtp",
        improve: "kavacha-privacy-improve-etp",
        // Read the ACTUAL tracking-protection prefs, not
        // browser.contentblocking.category. The category is a UI summary with
        // no global observer (verified: setting it "strict" never flips
        // privacy.trackingprotection.enabled), so the old check-and-fix both
        // touched a pref that neither reports nor changes real protection —
        // the score could say ETP was on while it was off, and its "turn on"
        // did nothing. These are the prefs Kavacha ships for strict ETP.
        on: () =>
          prefs.getBoolPref("privacy.trackingprotection.enabled", false) &&
          prefs.getBoolPref(
            "privacy.trackingprotection.socialtracking.enabled",
            false
          ) &&
          prefs.getBoolPref(
            "privacy.trackingprotection.cryptomining.enabled",
            false
          ) &&
          prefs.getBoolPref(
            "privacy.trackingprotection.fingerprinting.enabled",
            false
          ),
        fix: () => {
          for (const p of [
            "privacy.trackingprotection.enabled",
            "privacy.trackingprotection.socialtracking.enabled",
            "privacy.trackingprotection.cryptomining.enabled",
            "privacy.trackingprotection.fingerprinting.enabled",
            "privacy.trackingprotection.emailtracking.enabled",
          ]) {
            prefs.setBoolPref(p, true);
          }
          // Keep the stock ETP UI's summary in step with what we just enabled.
          prefs.setStringPref("browser.contentblocking.category", "strict");
        },
      },
      {
        id: "kavachaPostureTcp",
        improve: "kavacha-privacy-improve-tcp",
        on: () => prefs.getIntPref("network.cookie.cookieBehavior", 0) === 5,
        fix: () => prefs.setIntPref("network.cookie.cookieBehavior", 5),
      },
      {
        id: "kavachaPostureFpp",
        improve: "kavacha-privacy-improve-fpp",
        on: () => prefs.getBoolPref("privacy.fingerprintingProtection", false),
        fix: () =>
          prefs.setBoolPref("privacy.fingerprintingProtection", true),
      },
      {
        id: "kavachaPostureQs",
        improve: "kavacha-privacy-improve-qs",
        on: () => prefs.getBoolPref("privacy.query_stripping.enabled", false),
        fix: () => prefs.setBoolPref("privacy.query_stripping.enabled", true),
      },
      {
        id: "kavachaPostureGpc",
        improve: "kavacha-privacy-improve-gpc",
        on: () =>
          prefs.getBoolPref("privacy.globalprivacycontrol.enabled", false),
        fix: () =>
          prefs.setBoolPref("privacy.globalprivacycontrol.enabled", true),
      },
      {
        id: "kavachaPostureBanners",
        improve: "kavacha-privacy-improve-banners",
        on: () => prefs.getIntPref("cookiebanners.service.mode", 0) >= 1,
        fix: () => prefs.setIntPref("cookiebanners.service.mode", 1),
      },
      {
        // trr.mode 2 is "encrypted, fall back to plain on failure"; 3 is
        // encrypted-only. Either counts as on -- 3 is a reliability choice,
        // not a stronger privacy one, and failing closed on DNS is not a
        // default we should score people down for declining.
        id: "kavachaPostureDoh",
        improve: "kavacha-privacy-improve-doh",
        on: () => prefs.getIntPref("network.trr.mode", 0) >= 2,
        fix: () => prefs.setIntPref("network.trr.mode", 2),
      },
      {
        id: "kavachaPostureClearCookies",
        improve: "kavacha-privacy-improve-cookies",
        on: () =>
          prefs.getBoolPref(KAVACHA_SANITIZE_ON_SHUTDOWN, false) &&
          prefs.getBoolPref(KAVACHA_CLEAR_COOKIES, false),
        fix: () => this._setClearCookiesOnClose(true),
      },
    ];
  },

  // ----- Personal search index (ADR 0012) --------------------------------

  get _personalIndex() {
    return ChromeUtils.importESModule(
      "resource:///modules/KavachaPersonalIndex.sys.mjs"
    ).KavachaPersonalIndex;
  },

  async _renderIndex() {
    const box = document.getElementById("kavachaIndexEnabled");
    if (!box) {
      return;
    }
    box.checked = Services.prefs.getBoolPref("kavacha.index.enabled", true);
    const status = document.getElementById("kavachaIndexStatus");
    try {
      const { pages, bytes } = await this._personalIndex.stats();
      document.l10n.setAttributes(status, "kavacha-index-status", {
        pages,
        size: this._formatBytes(bytes),
      });
    } catch (e) {
      status.textContent = "—";
    }
  },

  _setIndexEnabled(on) {
    Services.prefs.setBoolPref("kavacha.index.enabled", on);
    this._renderIndex();
  },

  async _clearIndex() {
    try {
      await this._personalIndex.clearAll();
    } catch (e) {
      console.error("KavachaPrivacyCenter: clear index failed", e);
    }
    this._renderIndex();
  },

  // ----- Local AI bridge (ADR 0013) --------------------------------------

  get _aiBridge() {
    return ChromeUtils.importESModule(
      "resource:///modules/KavachaAIBridge.sys.mjs"
    ).KavachaAIBridge;
  },

  async _renderAI() {
    const box = document.getElementById("kavachaAIEnabled");
    if (!box) {
      return;
    }
    const enabled = Services.prefs.getBoolPref("kavacha.ai.enabled", true);
    box.checked = enabled;
    document.getElementById("kavachaAIEndpoint").value =
      Services.prefs.getStringPref(
        "kavacha.ai.endpoint",
        "http://localhost:11434"
      );
    const status = document.getElementById("kavachaAIStatus");
    if (!enabled) {
      document.l10n.setAttributes(status, "kavacha-ai-status-disabled");
      return;
    }
    document.l10n.setAttributes(status, "kavacha-ai-status-checking");
    // Probe on demand (never in the background) and populate the model picker.
    let result;
    try {
      result = await this._aiBridge.isAvailable();
    } catch (e) {
      result = { available: false, models: [], reason: "unreachable" };
    }
    const menu = document.getElementById("kavachaAIModel");
    const popup = menu.menupopup || menu.querySelector("menupopup");
    while (popup.firstChild) {
      popup.firstChild.remove();
    }
    const chosen = Services.prefs.getStringPref("kavacha.ai.model", "");
    for (const name of result.models) {
      const item = document.createXULElement("menuitem");
      item.setAttribute("label", name);
      item.setAttribute("value", name);
      popup.append(item);
    }
    menu.disabled = !result.models.length;
    menu.value = chosen || result.models[0] || "";
    if (result.available && result.models.length) {
      document.l10n.setAttributes(status, "kavacha-ai-status-ready", {
        count: result.models.length,
      });
    } else if (result.available) {
      document.l10n.setAttributes(status, "kavacha-ai-status-no-models");
    } else {
      document.l10n.setAttributes(status, "kavacha-ai-status-unreachable");
    }
  },

  _setAIEnabled(on) {
    Services.prefs.setBoolPref("kavacha.ai.enabled", on);
    this._renderAI();
  },

  _setAIEndpoint(value) {
    const v = (value || "").trim() || "http://localhost:11434";
    Services.prefs.setStringPref("kavacha.ai.endpoint", v);
    this._renderAI();
  },

  _renderPosture() {
    const checks = this._postureChecks;
    const off = [];
    for (const check of checks) {
      const on = check.on();
      if (!on) {
        off.push(check);
      }
      const el = document.getElementById(check.id);
      if (!el) {
        continue;
      }
      document.l10n.setAttributes(
        el,
        on ? "kavacha-privacy-on" : "kavacha-privacy-off"
      );
      el.classList.toggle("on", on);
    }
    this._renderScore(checks.length, off);
  },

  // FEATURES 3.2. Every check counts the same. Weighting them would mean
  // asserting that, say, fingerprinting protection is worth 1.4 cookie
  // protections -- a number nobody could defend and which would quietly
  // encode an opinion as arithmetic. Equal weights are honest about what
  // this is: a count of protections that are on, shown as a percentage.
  _renderScore(total, off) {
    const score = Math.round(((total - off.length) / total) * 100);
    const value = document.getElementById("kavachaPrivacyScoreValue");
    if (!value) {
      return;
    }
    value.textContent = new Intl.NumberFormat(undefined, {
      style: "percent",
    }).format(score / 100);
    value.classList.toggle("good", !off.length);
    document.l10n.setAttributes(
      document.getElementById("kavachaPrivacyScoreSummary"),
      "kavacha-privacy-score-summary",
      { remaining: off.length }
    );

    const improve = document.getElementById("kavachaPrivacyImprove");
    const list = document.getElementById("kavachaPrivacyImproveList");
    list.textContent = "";
    improve.hidden = !off.length;
    for (const check of off) {
      const row = document.createXULElement("hbox");
      row.className = "kavacha-privacy-improve-row";
      row.setAttribute("align", "center");

      const text = document.createXULElement("description");
      text.className = "kavacha-privacy-improve-text";
      document.l10n.setAttributes(text, check.improve);
      row.append(text);

      if (check.fix) {
        const button = document.createXULElement("button");
        document.l10n.setAttributes(button, "kavacha-privacy-score-fix");
        button.addEventListener("command", () => {
          try {
            check.fix();
          } catch (e) {
            console.error("KavachaPrivacyCenter: could not apply fix", e);
          }
          this._refresh();
        });
        row.append(button);
      }
      list.append(row);
    }
  },

  async _clearStats() {
    try {
      await this._trackingDB.clearAll();
    } catch (e) {
      console.error("KavachaPrivacyCenter: clearAll failed", e);
    }
    this._refresh();
  },

  _setValue(id, text) {
    document.getElementById(id).textContent = text;
  },

  _formatBytes(bytes) {
    // Intl.NumberFormat's unit style handles the locale-correct "1.2 GB".
    const units = ["byte", "kilobyte", "megabyte", "gigabyte", "terabyte"];
    let i = 0;
    while (bytes >= 1024 && i < units.length - 1) {
      bytes /= 1024;
      i++;
    }
    return new Intl.NumberFormat(undefined, {
      style: "unit",
      unit: units[i],
      // CLDR's short form for the bare byte unit is the unabbreviated word,
      // so plain counts read better long ("0 bytes", "1 byte").
      unitDisplay: i === 0 ? "long" : "short",
      maximumFractionDigits: 1,
    }).format(bytes);
  },
};
