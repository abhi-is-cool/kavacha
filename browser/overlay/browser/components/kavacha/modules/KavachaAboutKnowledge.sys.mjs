// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Kavacha: nsIAboutModule for about:knowledge — the personal knowledge graph
// (ADR 0016; ROADMAP Phase 7; FEATURES 6.3).
//
// Same JS about-module pattern as about:studio / about:marketplace /
// about:plugins, with a fresh cid: registered through components.conf against
// `@mozilla.org/network/protocol/about;1?what=knowledge`, so no Gecko C++
// redirector is edited (MASTER_PLAN Principle 1).
//
// Privileged chrome UI (IS_SECURE_CHROME_UI) for the same reason about:studio
// is: the page calls KavachaKnowledgeGraph, KavachaKnowledge and
// KavachaPersonalIndex directly through ChromeUtils.importESModule. It shows
// nothing but the user's own local data and never loads a remote resource —
// its CSP is default-src chrome:.

const kChromeURL = "chrome://browser/content/kavacha/knowledge/graph.html";

export class AboutKnowledge {
  QueryInterface = ChromeUtils.generateQI(["nsIAboutModule"]);

  newChannel(aURI, aLoadInfo) {
    const chromeURI = Services.io.newURI(kChromeURL);
    const channel = Services.io.newChannelFromURIWithLoadInfo(
      chromeURI,
      aLoadInfo
    );
    channel.originalURI = aURI;
    return channel;
  }

  getURIFlags() {
    return (
      Ci.nsIAboutModule.ALLOW_SCRIPT | Ci.nsIAboutModule.IS_SECURE_CHROME_UI
    );
  }

  getChromeURI() {
    return Services.io.newURI(kChromeURL);
  }
}
