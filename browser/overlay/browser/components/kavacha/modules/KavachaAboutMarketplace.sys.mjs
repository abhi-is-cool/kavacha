// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Kavacha: nsIAboutModule for about:marketplace — the Component Marketplace
// (ROADMAP Phase 3; ADR 0010).
//
// Same modern JS about-module pattern as about:studio's KavachaAboutStudio
// (mirrors the engine's AboutNewTabRedirector.sys.mjs): registered through
// components.conf against `@mozilla.org/network/protocol/about;1?what=marketplace`,
// so NO Gecko C++ redirector edit is needed (MASTER_PLAN Principle 1). It
// resolves about:marketplace to a privileged chrome document.
//
// WHY PRIVILEGED (IS_SECURE_CHROME_UI, like about:preferences): marketplace.js
// drives the chrome singleton KavachaMarketplace (ADR 0010) — and, through it,
// the Theme/Layout engines — via their public APIs. A secure-chrome-UI page
// loads in the parent process with the system principal (the chrome:// target
// is a UI resource, so the redirector keeps the system principal — see
// nsAboutRedirector.cpp), which is exactly the privilege about:preferences uses
// to ChromeUtils.importESModule and call Services.

const kChromeURL =
  "chrome://browser/content/kavacha/marketplace/marketplace.html";

export class AboutMarketplace {
  QueryInterface = ChromeUtils.generateQI(["nsIAboutModule"]);

  newChannel(aURI, aLoadInfo) {
    const chromeURI = Services.io.newURI(kChromeURL);
    // chrome:// is a UI resource, so the channel keeps the system principal
    // (we deliberately do NOT set a result-principal URI). Same shape as the
    // engine's AboutNewTabRedirector: build from the loadInfo, then re-point
    // originalURI so the address bar still reads "about:marketplace".
    const channel = Services.io.newChannelFromURIWithLoadInfo(
      chromeURI,
      aLoadInfo
    );
    channel.originalURI = aURI;
    return channel;
  }

  getURIFlags() {
    // Privileged chrome UI, scripts allowed — the about:preferences profile.
    // No URI_SAFE_FOR_UNTRUSTED_CONTENT: about:marketplace is never web content.
    return (
      Ci.nsIAboutModule.ALLOW_SCRIPT | Ci.nsIAboutModule.IS_SECURE_CHROME_UI
    );
  }

  getChromeURI() {
    return Services.io.newURI(kChromeURL);
  }
}
