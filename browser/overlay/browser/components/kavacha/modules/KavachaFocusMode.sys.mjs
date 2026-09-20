// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Kavacha focus mode (ROADMAP Phase 7; FEATURES 11 "Focus mode — block
// distracting sites + notifications").
//
// A focus session is a PERIOD, not a mode flag: it has an end time, and the
// end time is what everything reads. That one decision settles the awkward
// cases without extra machinery — a crash or a restart cannot strand the
// browser in a permanently blocked state (the session is over when the clock
// says so, whether or not a timer survived), and the block check never has to
// trust that some earlier cleanup ran.
//
// SESSIONS SURVIVE A RESTART, on purpose. Quitting the browser is the most
// obvious way to defeat a self-imposed block, and a focus feature that a
// restart switches off is decoration. The end time lives in a pref, so it
// outlives the process; the user can still end a session deliberately, which
// is the difference between a tool and a lock.
//
// WHAT IS BLOCKED IS TOP-LEVEL PAGES, NOT SUBRESOURCES. This is a
// concentration tool, not a content blocker: Kavacha already ships tracking
// protection for the other job, and quietly breaking embeds inside pages the
// user deliberately opened would make "focus mode" mean "the web is subtly
// broken now". Matching is on the base domain (eTLD+1), so blocking
// `youtube.com` covers `m.youtube.com` and does not cover `notyoutube.com`.
//
// NOTIFICATIONS: the desktop-notification permission default is switched to
// DENY for the session and RESTORED EXACTLY at the end — including the case
// where the user had already set it to something themselves. That is patch
// 0066's lesson applied before the bug rather than after: the shutdown-cookie
// feature armed a shared pref, could not tell "I set this" from "the user set
// this", and wiped browsing history for two weeks. Here the previous value is
// recorded when the session starts and written back when it ends, and if the
// pref moved underneath us we leave it alone.

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  JSONFile: "resource://gre/modules/JSONFile.sys.mjs",
  setTimeout: "resource://gre/modules/Timer.sys.mjs",
  clearTimeout: "resource://gre/modules/Timer.sys.mjs",
});

const kEndsAtPref = "kavacha.focus.session-ends-at";
const kDefaultMinutesPref = "kavacha.focus.default-minutes";
const kBlockNotificationsPref = "kavacha.focus.block-notifications";
// Where the pre-session notification default is parked so it can be restored.
// A pref rather than memory: the session outlives the process, so the thing
// needed to undo it has to as well.
const kSavedNotificationPref = "kavacha.focus.saved-notification-default";
const kNotificationDefaultPref = "permissions.default.desktop-notification";
const kStoreFile = "kavacha-focus.json";
const kBlockPage = "about:focus";

export const KavachaFocusMode = {
  _initialized: false,
  _store: null,
  _timer: null,
  _observing: false,

  async init() {
    if (this._initialized) {
      return;
    }
    this._initialized = true;
    await this._load();
    // A session that was running when the browser closed is still running if
    // its end time has not passed. Re-arm; otherwise clean up whatever the
    // last run left behind.
    if (this.isActive) {
      this._arm();
    } else if (Services.prefs.prefHasUserValue(kEndsAtPref)) {
      this.end({ silent: true });
    }
  },

  async _load() {
    if (!this._store) {
      this._store = new lazy.JSONFile({
        path: PathUtils.join(PathUtils.profileDir, kStoreFile),
      });
      await this._store.load();
      if (!this._store.data.global) {
        this._store.data.global = [];
      }
      if (!this._store.data.spaces) {
        this._store.data.spaces = {};
      }
    }
    return this._store;
  },

  /* --------------------------------------------------------------- session */

  get endsAt() {
    return Services.prefs.getIntPref(kEndsAtPref, 0);
  },

  get isActive() {
    const ends = this.endsAt;
    return ends > 0 && ends * 1000 > Date.now();
  },

  /** Whole minutes left, 0 when no session is running. */
  get minutesLeft() {
    if (!this.isActive) {
      return 0;
    }
    return Math.max(1, Math.ceil((this.endsAt * 1000 - Date.now()) / 60_000));
  },

  /**
   * Start (or extend) a focus session.
   *
   * Seconds are stored rather than milliseconds because prefs are 32-bit
   * signed integers: a millisecond timestamp overflows and would read back as
   * a negative number, which is exactly the shape of bug that ships as "focus
   * mode randomly does nothing".
   */
  start(minutes = 0) {
    const length =
      Number(minutes) > 0
        ? Number(minutes)
        : Services.prefs.getIntPref(kDefaultMinutesPref, 50);
    const endsAt = Math.floor((Date.now() + length * 60_000) / 1000);
    Services.prefs.setIntPref(kEndsAtPref, endsAt);
    this._muteNotifications();
    this._arm();
    return { endsAt, minutes: length };
  },

  /** End the session now. `silent` skips the notification restore chatter. */
  end({ silent = false } = {}) {
    Services.prefs.clearUserPref(kEndsAtPref);
    if (this._timer) {
      lazy.clearTimeout(this._timer);
      this._timer = null;
    }
    this._restoreNotifications();
    this._stopObserving();
    if (!silent) {
      Services.obs.notifyObservers(null, "kavacha-focus-changed");
    }
    return true;
  },

  _arm() {
    this._startObserving();
    if (this._timer) {
      lazy.clearTimeout(this._timer);
    }
    const ms = Math.max(1000, this.endsAt * 1000 - Date.now());
    // The timer is a courtesy — it makes the session END on time rather than
    // at the next request. Correctness does not depend on it: every check
    // compares the clock.
    this._timer = lazy.setTimeout(() => this.end(), ms);
    Services.obs.notifyObservers(null, "kavacha-focus-changed");
  },

  /* --------------------------------------------------------- notifications */

  /** The saved pre-session notification default, or -1 when nothing is saved. */
  get _savedNotificationDefault() {
    return Services.prefs.getIntPref(kSavedNotificationPref, -1);
  },

  _muteNotifications() {
    try {
      if (!Services.prefs.getBoolPref(kBlockNotificationsPref, true)) {
        return;
      }
      // Already muted by an earlier session? Do not overwrite the saved value
      // with our own, or ending the session would restore "blocked" forever.
      //
      // The sentinel is -1, and the test is "is something saved", NOT
      // prefHasUserValue. In Gecko, setIntPref(p, v) where v equals p's
      // DEFAULT clears the user value instead of storing one. This pref used
      // to default to 0 — the same value permissions.default.desktop-
      // notification normally has ("ask") — so saving 0 stored nothing,
      // _restoreNotifications then found no saved value and returned early,
      // and notifications stayed BLOCKED permanently after every session.
      // Found 2026-09-20, the first time Phase 7 was ever executed.
      if (this._savedNotificationDefault >= 0) {
        return;
      }
      const previous = Services.prefs.getIntPref(kNotificationDefaultPref, 0);
      Services.prefs.setIntPref(kSavedNotificationPref, previous);
      Services.prefs.setIntPref(kNotificationDefaultPref, 2); // DENY
    } catch (e) {
      console.error("KavachaFocusMode: could not mute notifications", e);
    }
  },

  _restoreNotifications() {
    try {
      const saved = this._savedNotificationDefault;
      if (saved < 0) {
        return; // nothing saved — this session never muted anything
      }
      const current = Services.prefs.getIntPref(kNotificationDefaultPref, 0);
      // If it is not what we set, the user (or something else) changed it
      // during the session. Their value wins; we just drop our bookkeeping.
      if (current === 2) {
        if (saved === 0) {
          Services.prefs.clearUserPref(kNotificationDefaultPref);
        } else {
          Services.prefs.setIntPref(kNotificationDefaultPref, saved);
        }
      }
      Services.prefs.setIntPref(kSavedNotificationPref, -1);
    } catch (e) {
      console.error("KavachaFocusMode: could not restore notifications", e);
    }
  },

  /* -------------------------------------------------------------- blocking */

  _startObserving() {
    if (this._observing) {
      return;
    }
    Services.obs.addObserver(this, "http-on-modify-request");
    this._observing = true;
  },

  _stopObserving() {
    if (!this._observing) {
      return;
    }
    try {
      Services.obs.removeObserver(this, "http-on-modify-request");
    } catch (e) {}
    this._observing = false;
  },

  observe(subject, topic) {
    if (topic !== "http-on-modify-request") {
      return;
    }
    try {
      if (!this.isActive) {
        // The clock, not the timer, is the authority. An expired session
        // stops blocking on the next request even if nothing cleaned up.
        this.end();
        return;
      }
      const channel = subject.QueryInterface(Ci.nsIHttpChannel);
      const loadInfo = channel.loadInfo;
      // Top-level page loads only — see the header on why subresources are
      // deliberately untouched.
      if (
        loadInfo.externalContentPolicyType !==
        Ci.nsIContentPolicy.TYPE_DOCUMENT
      ) {
        return;
      }
      const uri = channel.URI;
      if (!this.isBlockedUri(uri)) {
        return;
      }
      const context =
        loadInfo.targetBrowsingContext || loadInfo.browsingContext || null;
      const browser = context?.top?.embedderElement;
      channel.cancel(Cr.NS_BINDING_ABORTED);
      if (!browser) {
        return;
      }
      // Off the notification stack before touching the docshell: loading
      // inside http-on-modify-request re-enters the very machinery that is
      // mid-flight.
      Services.tm.dispatchToMainThread(() => {
        try {
          browser.fixupAndLoadURIString(
            kBlockPage + "?url=" + encodeURIComponent(uri.spec),
            {
              triggeringPrincipal:
                Services.scriptSecurityManager.getSystemPrincipal(),
            }
          );
        } catch (e) {
          console.error("KavachaFocusMode: could not show the block page", e);
        }
      });
    } catch (e) {
      // Never break a load because focus mode had an opinion about it.
    }
  },

  /* ------------------------------------------------------------- blocklist */

  /** eTLD+1, so a rule for youtube.com covers m.youtube.com. */
  baseDomain(uriOrString) {
    try {
      const uri =
        typeof uriOrString === "string"
          ? Services.io.newURI(uriOrString)
          : uriOrString;
      if (uri.scheme !== "http" && uri.scheme !== "https") {
        return "";
      }
      try {
        return Services.eTLD.getBaseDomain(uri);
      } catch (e) {
        // Single-label hosts and IP literals throw; the host itself is then
        // the only sensible key.
        return uri.host;
      }
    } catch (e) {
      return "";
    }
  },

  /** The blocked set for right now: the global list plus the active Space's. */
  blockedFor(spaceUuid = null) {
    const data = this._store?.data || { global: [], spaces: {} };
    const list = [...(data.global || [])];
    if (spaceUuid && Array.isArray(data.spaces?.[spaceUuid])) {
      list.push(...data.spaces[spaceUuid]);
    }
    return new Set(list);
  },

  isBlockedUri(uri) {
    const domain = this.baseDomain(uri);
    if (!domain) {
      return false;
    }
    const data = this._store?.data;
    if (!data) {
      return false;
    }
    if ((data.global || []).includes(domain)) {
      return true;
    }
    // Per-Space rules apply wherever the user is: a session is one span of
    // attention, and asking which Space a request came from at
    // http-on-modify-request time is neither cheap nor reliable. A Space
    // list is therefore "also block these", not "only block these here" —
    // stated because a user could reasonably expect the other reading.
    for (const list of Object.values(data.spaces || {})) {
      if (Array.isArray(list) && list.includes(domain)) {
        return true;
      }
    }
    return false;
  },

  isBlocked(url) {
    try {
      return this.isBlockedUri(Services.io.newURI(String(url)));
    } catch (e) {
      return false;
    }
  },

  async listBlocked() {
    await this._load();
    return {
      global: [...(this._store.data.global || [])],
      spaces: { ...(this._store.data.spaces || {}) },
    };
  },

  /** Add a site. Accepts a URL or a bare domain; stores the base domain. */
  async block(site, { spaceUuid = null } = {}) {
    await this._load();
    let domain = this.baseDomain(site);
    if (!domain) {
      // A bare "youtube.com" is not a URI; give it a scheme and retry, which
      // is what a user typing into a settings box will always do.
      domain = this.baseDomain("https://" + String(site || "").trim());
    }
    if (!domain) {
      return null;
    }
    const list = spaceUuid
      ? (this._store.data.spaces[spaceUuid] ||= [])
      : this._store.data.global;
    if (!list.includes(domain)) {
      list.push(domain);
      list.sort();
      this._store.saveSoon();
    }
    return domain;
  },

  async unblock(domain, { spaceUuid = null } = {}) {
    await this._load();
    const list = spaceUuid
      ? this._store.data.spaces[spaceUuid]
      : this._store.data.global;
    if (!Array.isArray(list)) {
      return false;
    }
    const at = list.indexOf(domain);
    if (at === -1) {
      return false;
    }
    list.splice(at, 1);
    this._store.saveSoon();
    return true;
  },

  /** State for the block page, the settings page and the palette. */
  status() {
    return {
      active: this.isActive,
      endsAt: this.endsAt * 1000,
      minutesLeft: this.minutesLeft,
      blocked: this._store ? [...this.blockedFor()] : [],
    };
  },
};
