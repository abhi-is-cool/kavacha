/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Kavacha: nsIAboutModule for about:kavacha-welcome — the first-run flow
// (ADR 0020 §4d). Replaces the Zen-era ZenWelcome edits (patches 0017, 0032,
// 0042, 0068): Firefox's about:welcome is disabled by pref and
// startup.homepage_welcome_url points here, so a new profile opens this page
// on its first run and nothing else.
//
// Same JS about-module pattern as every Kavacha about: page — registered in
// components.conf, no Gecko C++ redirector edit. Privileged chrome UI: the page
// writes prefs and enables built-in themes; it is never web content.

const kChromeURL = "chrome://browser/content/kavacha/welcome/welcome.html";

export class AboutKavachaWelcome {
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
