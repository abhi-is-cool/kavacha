// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Kavacha: nsIAboutModule for about:plugins — the plugin manager UI (ROADMAP
// Phase 3 "Kavacha SDK + plugin permission model"; ADR 0011).
//
// Same modern JS about-module pattern as about:studio (ADR 0009 /
// KavachaAboutStudio.sys.mjs): registered through components.conf against the
// contract `@mozilla.org/network/protocol/about;1?what=plugins`, so NO Gecko
// C++ redirector edit is needed (MASTER_PLAN Principle 1). It resolves
// about:plugins to a privileged chrome document.
//
// WHY PRIVILEGED (IS_SECURE_CHROME_UI, like about:preferences / about:studio):
// plugins.js drives KavachaPluginManager and KavachaPluginPermissions through
// their public APIs to list, enable/disable, grant/revoke, and uninstall
// sideloaded plugins. A secure-chrome-UI page loads in the parent process with
// the system principal (the chrome:// target keeps that principal — see
// nsAboutRedirector.cpp), which is what lets it call ChromeUtils.importESModule
// on those modules. It is never web content (no URI_SAFE_FOR_UNTRUSTED_CONTENT).

const kChromeURL = "chrome://browser/content/kavacha/plugins/plugins.html";

export class AboutPlugins {
  QueryInterface = ChromeUtils.generateQI(["nsIAboutModule"]);

  newChannel(aURI, aLoadInfo) {
    const chromeURI = Services.io.newURI(kChromeURL);
    // chrome:// is a UI resource, so the channel keeps the system principal (we
    // deliberately do NOT set a result-principal URI). Same shape as
    // KavachaAboutStudio: build from the loadInfo, then re-point originalURI so
    // the address bar still reads "about:plugins".
    const channel = Services.io.newChannelFromURIWithLoadInfo(
      chromeURI,
      aLoadInfo
    );
    channel.originalURI = aURI;
    return channel;
  }

  getURIFlags() {
    // Privileged chrome UI, scripts allowed — the about:preferences profile.
    // No URI_SAFE_FOR_UNTRUSTED_CONTENT: about:plugins is never web content.
    return (
      Ci.nsIAboutModule.ALLOW_SCRIPT | Ci.nsIAboutModule.IS_SECURE_CHROME_UI
    );
  }

  getChromeURI() {
    return Services.io.newURI(kChromeURL);
  }
}
