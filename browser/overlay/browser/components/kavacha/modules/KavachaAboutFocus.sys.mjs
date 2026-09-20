// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Kavacha: nsIAboutModule for about:focus — both the block page a focus
// session shows in place of a distracting site, and the place the blocklist
// is edited (ROADMAP Phase 7; FEATURES 11).
//
// ONE PAGE FOR BOTH JOBS, deliberately. The moment a user is most motivated
// to change what is blocked is the moment they just hit the block, and
// sending them somewhere else to do it is how a rule that no longer makes
// sense survives for months.
//
// Same JS about-module pattern as about:studio / about:knowledge, fresh cid,
// registered through components.conf so no Gecko C++ redirector is edited.
// Privileged chrome UI: the page drives KavachaFocusMode directly, and it is
// never web content.

const kChromeURL = "chrome://browser/content/kavacha/focus/focus.html";

export class AboutFocus {
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
