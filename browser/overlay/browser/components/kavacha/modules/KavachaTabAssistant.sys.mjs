// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Tab assistant (ADR 0014; ROADMAP Phase 6) — the three palette commands that
// act on a pile of open tabs: group them by topic, close the duplicates, save
// the session.
//
// TWO OF THE THREE NEED NO MODEL, AND THAT IS THE POINT. "Close duplicate
// tabs" is a set operation on URLs and "save this research session" is a
// snapshot; making either depend on a local model would be dressing
// deterministic work up as AI and breaking it for everyone without one. Only
// topic grouping genuinely needs a model — naming what a set of pages is
// ABOUT is the part an algorithm cannot do — and it is the only one that says
// "no local model found" when there isn't one.
//
// EVERYTHING DESTRUCTIVE ASKS FIRST. Closing tabs is the only thing here that
// can lose work, so it confirms with a count before it acts. Grouping is
// reversible and silent; saving only adds.
//
// MODEL OUTPUT IS NEVER TRUSTED AS CONTROL FLOW. The grouping prompt asks for
// JSON, and the parser treats the reply as a hostile string: extract the
// first array, validate every index against the real tab list, drop anything
// that does not check out. A confused model can produce a bad GROUPING; it
// cannot make this close, move or lose a tab.

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  KavachaAIBridge: "resource:///modules/KavachaAIBridge.sys.mjs",
  KavachaSpaceHistory: "resource:///modules/KavachaSpaceHistory.sys.mjs",
});

// Enough tabs to be worth grouping, few enough to keep the prompt bounded and
// a small local model coherent.
const kMaxTabsForGrouping = 60;
const kMinTabsForGrouping = 3;

// Firefox's own tab-group palette. Cycled so adjacent groups differ.
const kGroupColors = [
  "blue",
  "purple",
  "cyan",
  "orange",
  "yellow",
  "pink",
  "green",
  "gray",
  "red",
];

const kGroupSystem =
  "You group browser tabs by topic. You are given a numbered list of open " +
  "tabs. Reply with ONLY a JSON array, no prose and no code fence, shaped " +
  '[{"label":"Short Topic Name","tabs":[1,3,4]}]. Every number must come ' +
  "from the list. Put each tab in at most one group, use 2 to 6 groups, " +
  "give each label at most three words, and leave a tab out entirely if it " +
  "fits nowhere.";

const kNameSystem =
  "You name saved browsing sessions. Given a list of page titles, reply " +
  "with ONLY a short descriptive name of at most six words. No quotes, no " +
  "punctuation at the end, no explanation.";

export const KavachaTabAssistant = {
  /* ---------------------------------------------------------- duplicates */

  /**
   * Which tabs are duplicates. Returns `{doomed, keepers}` and changes
   * nothing — deciding and destroying are separate on purpose, so the choice
   * of what to close can be inspected (and tested) without a modal in the way
   * and without tabs already being gone by the time anything can look.
   *
   * Pinned tabs are never closed and never counted as duplicates to remove:
   * pinning is an explicit statement that a tab is wanted, and patch 0034's
   * D0 (a quit-time cleanup that destroyed pinned tabs) is the standing
   * reminder of what ignoring that costs.
   */
  planDuplicates(window) {
    const seen = new Map(); // normalized url -> keeper tab
    const doomed = [];

    for (const tab of window.gBrowser.tabs) {
      if (tab.closing || tab.pinned) {
        continue;
      }
      // Only within the active Space: tabs in other Spaces are a different
      // context, and silently reaching into them would be a surprise.
      if (!this._inActiveSpace(window, tab)) {
        continue;
      }
      const key = this._normalizeUrl(tab.linkedBrowser?.currentURI?.spec || "");
      if (!key) {
        continue;
      }
      const keeper = seen.get(key);
      if (!keeper) {
        seen.set(key, tab);
        continue;
      }
      // Keep the selected tab if one of the pair is selected, otherwise the
      // one that has been open longest — closing what the user is looking at
      // would be the one unforgivable outcome here.
      if (tab.selected) {
        doomed.push(keeper);
        seen.set(key, tab);
      } else {
        doomed.push(tab);
      }
    }
    return { doomed, keepers: [...seen.values()] };
  },

  /**
   * Close duplicate tabs, after confirming. Returns `{closed, kept,
   * cancelled}`.
   *
   * `confirm` is injectable so this can be exercised without a modal dialog
   * blocking the harness. It defaults to the real prompt, so no caller in the
   * browser can skip the confirmation by accident — closing tabs is the only
   * thing in the assistant that destroys anything.
   */
  async closeDuplicates(window, { confirm } = {}) {
    const { doomed, keepers } = this.planDuplicates(window);
    if (!doomed.length) {
      return { closed: 0, kept: keepers.length, cancelled: false };
    }

    const ask = confirm || (message => this._confirm(window, message));
    const ok = await ask(
      `Close ${doomed.length} duplicate ${
        doomed.length === 1 ? "tab" : "tabs"
      }? ${keepers.length} unique ${
        keepers.length === 1 ? "page stays" : "pages stay"
      } open. Pinned tabs are never closed.`
    );
    if (!ok) {
      return { closed: 0, kept: keepers.length, cancelled: true };
    }

    window.gBrowser.removeTabs(doomed, { animate: false });
    return { closed: doomed.length, kept: keepers.length, cancelled: false };
  },

  _confirm(window, message) {
    return (
      Services.prompt.confirmEx(
        window,
        "Close duplicate tabs",
        message,
        Services.prompt.STD_YES_NO_BUTTONS,
        null,
        null,
        null,
        null,
        {}
      ) === 0
    );
  },

  /* --------------------------------------------------------------- topics */

  /**
   * Ask the local model to cluster the active Space's tabs by topic, then
   * create a real tab group per cluster. Returns
   * `{groups, grouped, reason}` — `reason` set means nothing was done.
   */
  async groupByTopic(window) {
    const tabs = window.gBrowser.tabs.filter(
      tab =>
        !tab.closing &&
        !tab.pinned &&
        !tab.group &&
        this._inActiveSpace(window, tab)
    );
    if (tabs.length < kMinTabsForGrouping) {
      return { groups: 0, grouped: 0, reason: "too-few" };
    }

    const candidates = tabs.slice(0, kMaxTabsForGrouping);
    const status = await lazy.KavachaAIBridge.isAvailable();
    if (!status.available) {
      return { groups: 0, grouped: 0, reason: status.reason || "unavailable" };
    }

    const listing = candidates
      .map((tab, i) => `${i + 1}. ${tab.label} — ${this._host(tab)}`)
      .join("\n");

    let reply;
    try {
      reply = await lazy.KavachaAIBridge.generate(listing, {
        system: kGroupSystem,
      });
    } catch (e) {
      console.error("KavachaTabAssistant: grouping request failed", e);
      return { groups: 0, grouped: 0, reason: "error" };
    }

    const plan = this._parseGroups(reply, candidates.length);
    if (!plan.length) {
      return { groups: 0, grouped: 0, reason: "unparsable" };
    }

    let groups = 0;
    let grouped = 0;
    const used = new Set();
    for (const entry of plan) {
      const members = entry.tabs
        .filter(n => !used.has(n))
        .map(n => candidates[n - 1])
        .filter(Boolean);
      // A "group" of one is just a tab with a label on it.
      if (members.length < 2) {
        continue;
      }
      entry.tabs.forEach(n => used.add(n));
      try {
        window.gBrowser.addTabGroup(members, {
          label: entry.label,
          color: kGroupColors[groups % kGroupColors.length],
          // Required, not optional: Zen's fork of addTabGroup calls
          // `insertBefore.before(group)` unconditionally, so the upstream
          // default of null throws. The group goes where its first tab
          // already is, which is also Firefox's own convention (the split-view code
          // passes tabs[0]).
          insertBefore: members[0],
          isUserTriggered: true,
          telemetryUserCreateSource: "kavacha-tab-assistant",
        });
        groups++;
        grouped += members.length;
      } catch (e) {
        console.error("KavachaTabAssistant: could not create group", e);
      }
    }
    return { groups, grouped, reason: groups ? "" : "no-groups" };
  },

  /**
   * Parse the model's reply into `[{label, tabs:[n]}]`, discarding anything
   * that does not validate. Deliberately forgiving about FORMAT (models wrap
   * JSON in prose or a code fence constantly) and utterly unforgiving about
   * CONTENT — an index outside the real tab list is dropped, not clamped.
   */
  _parseGroups(reply, tabCount) {
    const text = String(reply || "");
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    if (start === -1 || end <= start) {
      return [];
    }
    let parsed;
    try {
      parsed = JSON.parse(text.slice(start, end + 1));
    } catch (e) {
      return [];
    }
    if (!Array.isArray(parsed)) {
      return [];
    }
    const out = [];
    for (const entry of parsed) {
      const label = String(entry?.label ?? "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 40);
      const tabs = Array.isArray(entry?.tabs)
        ? [
            ...new Set(
              entry.tabs
                .map(n => Number(n))
                .filter(n => Number.isInteger(n) && n >= 1 && n <= tabCount)
            ),
          ]
        : [];
      if (label && tabs.length) {
        out.push({ label, tabs });
      }
    }
    return out;
  },

  /* -------------------------------------------------------------- session */

  /**
   * Save the active Space as a named snapshot. The model suggests the name
   * from the tab titles; with no model the name is the Space and the date,
   * which is a worse name and a perfectly working feature.
   * Returns `{id, name, reason}`.
   */
  async saveSession(window) {
    const spaceUuid = window.gKavachaWorkspaces?.activeWorkspace;
    if (!spaceUuid) {
      return { id: null, name: "", reason: "no-space" };
    }
    const space = window.gKavachaWorkspaces.getWorkspaceFromId(spaceUuid);
    const titles = window.gBrowser.tabs
      .filter(
        tab =>
          !tab.closing &&
          this._inActiveSpace(window, tab)
      )
      .map(tab => tab.label)
      .filter(Boolean)
      .slice(0, 40);

    if (!titles.length) {
      return { id: null, name: "", reason: "empty" };
    }

    const name =
      (await this._suggestName(titles)) || this._fallbackName(space);

    const id = await lazy.KavachaSpaceHistory.snapshotSpace(
      window,
      spaceUuid,
      "session",
      { label: name, force: true }
    );
    return { id, name, reason: id ? "" : "failed" };
  },

  async _suggestName(titles) {
    try {
      const status = await lazy.KavachaAIBridge.isAvailable();
      if (!status.available) {
        return "";
      }
      const reply = await lazy.KavachaAIBridge.generate(titles.join("\n"), {
        system: kNameSystem,
      });
      // Models like to answer a request for a name with a sentence, a bullet,
      // or a "Name:" prefix. Take the first non-empty line and strip the
      // decoration — a name is a name.
      const line =
        String(reply || "")
          .split("\n")
          .map(l => l.trim())
          .find(Boolean) || "";
      return line
        .replace(/^[-*•\d.)\s]+/, "")
        .replace(/^(?:name|title)\s*:\s*/i, "")
        .replace(/^["'\s]+|["'.\s]+$/g, "")
        .slice(0, 60);
    } catch (e) {
      return "";
    }
  },

  _fallbackName(space) {
    const when = new Date().toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
    return `${space?.name || "Session"} — ${when}`;
  },

  /* -------------------------------------------------------------- helpers */

  _inActiveSpace(window, tab) {
    const active = window.gKavachaWorkspaces?.activeWorkspace;
    if (!active) {
      return true; // Spaces disabled: every tab is "the current context".
    }
    return tab.getAttribute("kavacha-space-id") === active;
  },

  // Two URLs are the same page if they differ only by fragment, a trailing
  // slash, or a "www." — the ways the same page ends up open twice. Query
  // strings are KEPT: ?id=2 is a different page, and treating it as a
  // duplicate would close real work.
  _normalizeUrl(spec) {
    if (!spec || spec === "about:blank") {
      return "";
    }
    try {
      const url = new URL(spec);
      url.hash = "";
      const host = url.host.replace(/^www\./, "");
      const path = url.pathname.replace(/\/+$/, "");
      return `${url.protocol}//${host}${path}${url.search}`;
    } catch (e) {
      return spec;
    }
  },

  _host(tab) {
    try {
      return new URL(tab.linkedBrowser.currentURI.spec).host.replace(
        /^www\./,
        ""
      );
    } catch (e) {
      return "";
    }
  },
};
