// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Kavacha tab history TREE (ROADMAP Phase 7; FEATURES 7.1 "branching history
// instead of linear").
//
// THE PROBLEM IS ONE SENTENCE. Every browser's session history is a list with
// a cursor: go back three pages, follow a different link, and the three pages
// you came from are GONE — silently truncated, with no gesture anywhere that
// brings them back. That is the single most common way people lose their
// place while researching, and it is a data-model choice, not a law.
//
// This module keeps the tree Gecko throws away. It does NOT replace session
// history — Back and Forward keep their normal meaning, because rewiring them
// would break every muscle memory a user has. It records, alongside, what the
// shape of the walk actually was, and offers the abandoned branches back.
//
// HOW A NAVIGATION IS CLASSIFIED, in order, against the node the tab is
// currently sitting on:
//
//   same URL              → a reload; refresh the title, move nothing.
//   the parent's URL      → the user went BACK; move the cursor up.
//   a child's URL         → the user went FORWARD; move the cursor down.
//   anything else         → a new node, parented at the cursor. If the cursor
//                           had moved up first, this is a SECOND child, and
//                           the branch that would have been truncated is now
//                           simply a sibling.
//
// That last line is the whole feature.
//
// PERSISTENCE RIDES SESSIONSTORE, deliberately: setCustomTabValue is per tab,
// survives restart and window-to-window moves, and is dropped when the tab is
// closed for good. A tree that outlived its tab would be a second, worse
// history store — and one that did not survive a restart would lose the
// branch exactly when the user most wants it.
//
// Never records in a private window.

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  PrivateBrowsingUtils: "resource://gre/modules/PrivateBrowsingUtils.sys.mjs",
  SessionStore: "resource:///modules/sessionstore/SessionStore.sys.mjs",
});

const kEnabledPref = "kavacha.tabhistory.enabled";
const kMaxNodesPref = "kavacha.tabhistory.max-nodes";
const kStoreKey = "kavacha-tab-tree";

export const KavachaTabHistory = {
  // browser -> tree. Weak so a closed tab's tree is collectable; SessionStore
  // holds the durable copy.
  _trees: new WeakMap(),

  get enabled() {
    return Services.prefs.getBoolPref(kEnabledPref, true);
  },

  /* -------------------------------------------------------------- plumbing */

  attachToWindow(window) {
    try {
      if (window.gKavachaWorkspaces?.privateWindowOrDisabled) {
        return;
      }
      const gBrowser = window.gBrowser;
      if (!gBrowser) {
        return;
      }
      const listener = {
        QueryInterface: ChromeUtils.generateQI([
          "nsIWebProgressListener",
          "nsISupportsWeakReference",
        ]),
        // The browser comes FIRST for a tabs listener (tabbrowser unshifts
        // it). Reading this signature the window-level way makes
        // `webProgress` the browser, so isTopLevel is undefined and NOTHING
        // is ever recorded — silently.
        onLocationChange: (browser, webProgress, request, uri, flags) => {
          try {
            if (!webProgress?.isTopLevel) {
              return;
            }
            const target = browser || gBrowser.selectedBrowser;
            this.record(gBrowser.getTabForBrowser(target), uri?.spec || "");
          } catch (e) {
            // Recording a shape must never break a navigation.
          }
        },
      };
      gBrowser.addTabsProgressListener(listener);
      window.addEventListener(
        "unload",
        () => {
          try {
            gBrowser.removeTabsProgressListener(listener);
          } catch (e) {}
        },
        { once: true }
      );
    } catch (e) {
      console.error("KavachaTabHistory: attachToWindow failed", e);
    }
  },

  /* ------------------------------------------------------------------ tree */

  _blank() {
    return { nodes: {}, root: null, current: null, next: 1 };
  },

  /**
   * The tree for a tab, rehydrated from SessionStore on first touch so a
   * restored tab keeps the branches it had before the restart.
   */
  treeFor(tab) {
    const browser = tab?.linkedBrowser;
    if (!browser) {
      return null;
    }
    let tree = this._trees.get(browser);
    if (tree) {
      return tree;
    }
    tree = this._blank();
    try {
      const stored = lazy.SessionStore.getCustomTabValue(tab, kStoreKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === "object" && parsed.nodes) {
          tree = parsed;
        }
      }
    } catch (e) {
      // A corrupt value is not worth a broken tab: start a fresh tree.
    }
    this._trees.set(browser, tree);
    return tree;
  },

  _persist(tab, tree) {
    try {
      lazy.SessionStore.setCustomTabValue(tab, kStoreKey, JSON.stringify(tree));
    } catch (e) {
      // Losing persistence costs the branch after a restart, not the session.
    }
  },

  /** Record one top-level navigation. Returns the current node, or null. */
  record(tab, url) {
    if (!this.enabled || !tab || !url) {
      return null;
    }
    if (!/^(https?|about|file):/.test(url)) {
      return null;
    }
    // about:blank is the gap between two real pages, not a place anyone went.
    if (url === "about:blank") {
      return null;
    }
    try {
      if (lazy.PrivateBrowsingUtils.isBrowserPrivate(tab.linkedBrowser)) {
        return null;
      }
    } catch (e) {}

    const tree = this.treeFor(tab);
    if (!tree) {
      return null;
    }
    const title = tab.label || url;
    const current = tree.current ? tree.nodes[tree.current] : null;

    if (current && current.url === url) {
      current.title = title;
      current.at = Date.now();
      this._persist(tab, tree);
      return current;
    }
    // Back — and back MORE THAN ONE STEP, which is a real gesture: the Back
    // button's dropdown and a long press both jump several entries at once.
    // Checking only the immediate parent would classify that as a brand new
    // page and quietly duplicate a node the tree already has. The ancestor
    // chain is bounded, so walking it is cheap; descendants are not, which is
    // why forward is still only checked one level down.
    let ancestor = current?.parent ?? null;
    while (ancestor !== null && ancestor !== undefined) {
      const node = tree.nodes[ancestor];
      if (!node) {
        break;
      }
      if (node.url === url) {
        tree.current = node.id;
        this._persist(tab, tree);
        return node;
      }
      ancestor = node.parent;
    }
    if (current) {
      const child = Object.values(tree.nodes).find(
        node => node.parent === current.id && node.url === url
      );
      if (child) {
        tree.current = child.id; // forward, down an existing branch
        this._persist(tab, tree);
        return child;
      }
    }

    const node = {
      id: tree.next++,
      url,
      title,
      parent: current ? current.id : null,
      at: Date.now(),
    };
    tree.nodes[node.id] = node;
    tree.current = node.id;
    if (!tree.root) {
      tree.root = node.id;
    }
    this._trim(tree);
    this._persist(tab, tree);
    return node;
  },

  /**
   * Keep the tree bounded. Only LEAVES are dropped, oldest first, and never
   * the cursor or anything on the path back to the root: trimming an interior
   * node would orphan a whole branch, which is the one thing this module
   * exists to prevent.
   */
  _trim(tree) {
    const max = Services.prefs.getIntPref(kMaxNodesPref, 200);
    const ids = Object.keys(tree.nodes);
    if (ids.length <= max) {
      return;
    }
    const protectedIds = new Set();
    let walk = tree.current;
    while (walk) {
      protectedIds.add(String(walk));
      walk = tree.nodes[walk]?.parent;
    }
    const parents = new Set(
      Object.values(tree.nodes)
        .map(node => node.parent)
        .filter(id => id !== null && id !== undefined)
        .map(String)
    );
    const leaves = ids
      .filter(id => !parents.has(id) && !protectedIds.has(id))
      .sort((a, b) => tree.nodes[a].at - tree.nodes[b].at);
    for (const id of leaves) {
      if (Object.keys(tree.nodes).length <= max) {
        break;
      }
      delete tree.nodes[id];
    }
  },

  /**
   * The tree as a flat, depth-annotated list in walk order — what a panel
   * renders. `branch` marks a node whose parent has more than one child:
   * those are the only rows that would not exist in ordinary Back/Forward,
   * so they are the rows worth calling out.
   */
  outline(tab) {
    const tree = this.treeFor(tab);
    if (!tree || !tree.root || !tree.nodes[tree.root]) {
      return [];
    }
    const childrenOf = new Map();
    for (const node of Object.values(tree.nodes)) {
      const key = node.parent === null ? "root" : String(node.parent);
      if (!childrenOf.has(key)) {
        childrenOf.set(key, []);
      }
      childrenOf.get(key).push(node);
    }
    for (const list of childrenOf.values()) {
      list.sort((a, b) => a.at - b.at);
    }
    const out = [];
    const visit = (node, depth) => {
      const siblings = childrenOf.get(String(node.parent ?? "root")) || [];
      out.push({
        id: node.id,
        url: node.url,
        title: node.title,
        depth,
        at: node.at,
        current: node.id === tree.current,
        branch: siblings.length > 1,
      });
      for (const child of childrenOf.get(String(node.id)) || []) {
        visit(child, depth + 1);
      }
    };
    visit(tree.nodes[tree.root], 0);
    return out;
  },

  /**
   * Move a tab to one node of its tree. This is an ORDINARY navigation, which
   * is what keeps the model honest: the next onLocationChange classifies it
   * with the same rules as any other, so the cursor lands where the user can
   * see it did.
   */
  goTo(tab, nodeId) {
    const tree = this.treeFor(tab);
    const node = tree?.nodes?.[nodeId];
    if (!node) {
      return false;
    }
    try {
      tab.ownerGlobal.gBrowser.selectedTab = tab;
      tab.linkedBrowser.fixupAndLoadURIString(node.url, {
        triggeringPrincipal:
          Services.scriptSecurityManager.getSystemPrincipal(),
      });
      return true;
    } catch (e) {
      console.error("KavachaTabHistory: goTo failed", e);
      return false;
    }
  },

  /**
   * Populate and open the tree panel for the selected tab.
   *
   * The rows are built here rather than in a content page because this is a
   * per-TAB view: an about: page would have to be opened in some other tab
   * and then reach back for the one the user actually meant.
   */
  async showPanel(window) {
    const tab = window.gBrowser?.selectedTab;
    const panel = window.document.getElementById("kavacha-tabtree-panel");
    if (!tab || !panel) {
      return;
    }
    const outline = this.outline(tab);
    window.document.getElementById("kavacha-tabtree-empty").hidden =
      !!outline.length;

    const list = window.document.getElementById("kavacha-tabtree-list");
    list.textContent = "";
    for (const row of outline) {
      const item = window.document.createXULElement("hbox");
      item.setAttribute("align", "center");
      item.style.gap = "6px";
      item.style.paddingInlineStart = Math.min(row.depth, 8) * 12 + "px";

      const label = window.document.createXULElement("label");
      label.setAttribute("flex", "1");
      label.setAttribute("crop", "end");
      // `value` and not textContent: a XUL label renders its value attribute,
      // and a title from a web page is untrusted text either way.
      label.value =
        (row.current ? "● " : row.branch ? "├ " : "· ") +
        (row.title || row.url);
      label.style.opacity = row.current ? "1" : "0.85";
      if (row.current) {
        label.style.fontWeight = "600";
      }
      item.append(label);

      if (!row.current) {
        const button = window.document.createXULElement("button");
        button.setAttribute(
          "label",
          await window.document.l10n.formatValue("kavacha-tabtree-go")
        );
        button.addEventListener("command", () => {
          panel.hidePopup();
          this.goTo(tab, row.id);
        });
        item.append(button);
      }
      list.append(item);
    }

    const anchor = window.gURLBar?.textbox || window.gBrowser.selectedTab;
    panel.openPopup(anchor, "after_start", 0, 0, false, false);
  },

  /** Forget one tab's tree — the branches, not the browsing history. */
  clear(tab) {
    try {
      this._trees.delete(tab.linkedBrowser);
      lazy.SessionStore.setCustomTabValue(tab, kStoreKey, "");
      return true;
    } catch (e) {
      return false;
    }
  },
};
