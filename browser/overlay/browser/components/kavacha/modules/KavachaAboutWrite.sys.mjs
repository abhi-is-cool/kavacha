// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Kavacha: nsIAboutModule for about:write — writing mode (ROADMAP Phase 7,
// "power-user tooling — … writing mode").
//
// Firefox ships Reader Mode: one page, stripped of everything that is not the
// text. This is the same idea pointed the other way — a whole tab containing
// nothing but what you are writing. It is not a new store: it edits the notes
// that already exist (a Space's note from patch 0008, or a page's note from
// patch 0082), which is what keeps writing mode a VIEW rather than a fourth
// place your words could be.
//
// Same JS about-module pattern and a fresh cid; privileged chrome UI because
// it drives gKavachaWorkspaces' note store and KavachaKnowledge directly.

const kChromeURL = "chrome://browser/content/kavacha/write/write.html";

export class AboutWrite {
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
