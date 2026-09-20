// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Kavacha: nsIAboutModule for about:studio — the Customization Studio /
// Visual Browser Builder (ROADMAP Phase 3; ADR 0009).
//
// This is the modern JS about-module pattern (mirrors the engine's
// AboutNewTabRedirector.sys.mjs): registered through components.conf against
// the contract `@mozilla.org/network/protocol/about;1?what=studio`, so NO
// Gecko C++ redirector edit is needed (MASTER_PLAN Principle 1 — never modify
// the engine). It resolves about:studio to a privileged chrome document.
//
// WHY PRIVILEGED (IS_SECURE_CHROME_UI, like about:preferences): studio.js has
// to drive the already-shipped chrome singletons — KavachaLayoutEngine (patch
// 0022), KavachaThemeEngine (patch 0023), and KavachaUserCSS (patch 0025) —
// through their public APIs. A secure-chrome-UI page loads in the parent
// process with the system principal (the chrome:// target is a UI resource,
// so the redirector keeps the system principal — see nsAboutRedirector.cpp),
// which is exactly the privilege about:preferences panes use to call Services
// and ChromeUtils.importESModule. The engines apply live to every browser
// window, so a Studio edit updates the real chrome immediately — the preview
// IS the browser.

const kChromeURL = "chrome://browser/content/kavacha/studio/studio.html";

export class AboutStudio {
  QueryInterface = ChromeUtils.generateQI(["nsIAboutModule"]);

  newChannel(aURI, aLoadInfo) {
    const chromeURI = Services.io.newURI(kChromeURL);
    // chrome:// is a UI resource, so the channel keeps the system principal
    // (we deliberately do NOT set a result-principal URI). Same shape as the
    // engine's AboutNewTabRedirector: build from the loadInfo, then re-point
    // originalURI so the address bar still reads "about:studio".
    const channel = Services.io.newChannelFromURIWithLoadInfo(
      chromeURI,
      aLoadInfo
    );
    channel.originalURI = aURI;
    return channel;
  }

  getURIFlags() {
    // Privileged chrome UI, scripts allowed — the about:preferences profile.
    // No URI_SAFE_FOR_UNTRUSTED_CONTENT: about:studio is never web content.
    return (
      Ci.nsIAboutModule.ALLOW_SCRIPT | Ci.nsIAboutModule.IS_SECURE_CHROME_UI
    );
  }

  getChromeURI() {
    return Services.io.newURI(kChromeURL);
  }
}
