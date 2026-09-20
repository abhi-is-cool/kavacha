// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Parent half of the Kavacha personal index (ADR 0012): the POLICY GATE.
// The child only extracts; every decision about whether a page may enter the
// index — feature enabled, never private windows, workspace attribution —
// happens here, in the privileged process, where the child can't lie about it.

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  KavachaPersonalIndex: "resource:///modules/KavachaPersonalIndex.sys.mjs",
  PrivateBrowsingUtils: "resource://gre/modules/PrivateBrowsingUtils.sys.mjs",
});

export class KavachaIndexerParent extends JSWindowActorParent {
  receiveMessage(message) {
    if (message.name !== "KavachaIndexer:PageText") {
      return;
    }
    try {
      if (!lazy.KavachaPersonalIndex.enabled) {
        return;
      }
      const browser = this.browsingContext.top.embedderElement;
      if (!browser || lazy.PrivateBrowsingUtils.isBrowserPrivate(browser)) {
        return;
      }
      // Tab-layer workspace attribution, same as ADR 0005: the tab knows its
      // Space; PlacesVisit events never did.
      let workspaceUuid = null;
      try {
        const tab = browser.ownerGlobal.gBrowser?.getTabForBrowser(browser);
        workspaceUuid = tab?.getAttribute("kavacha-space-id") || null;
      } catch (e) {}
      const { url, title, text } = message.data || {};
      // Fire-and-forget: indexing must never block or break browsing.
      lazy.KavachaPersonalIndex.indexPage({ url, title, text, workspaceUuid });
    } catch (e) {
      console.error("KavachaIndexerParent: capture dropped", e);
    }
  }
}
