// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Kavacha: nsIAboutModule for about:workflows — the no-code workflow builder
// (ADR 0017; ROADMAP Phase 7; PLATFORM_PLAN row 4).
//
// Same JS about-module pattern as about:studio / about:knowledge / about:focus
// with a fresh cid, registered through components.conf so no Gecko C++
// redirector is edited. Privileged chrome UI: the builder calls
// KavachaWorkflows directly, and its whole content is the user's own local
// automation documents.

const kChromeURL = "chrome://browser/content/kavacha/workflows/workflows.html";

export class AboutWorkflows {
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
