// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// The urlbar half of !bangs (ADR 0022). KavachaBangs decides where a bang
// goes; this makes the urlbar offer it.
//
// It returns a HEURISTIC result, which is the part that matters for privacy
// rather than for presentation: the heuristic is what Enter activates by
// default, so a recognised bang navigates to the resolved URL instead of
// falling through to the default engine. A non-heuristic suggestion would
// still leave Enter sending the query to a search engine, which is the leak
// this feature exists to close.
//
// Registered as an overlay module rather than a patch: ADR 0020 caps
// browser/patches/ deliberately, and UrlbarProvidersManager takes
// registrations at runtime.

import {
  UrlbarProvider,
  UrlbarUtils,
} from "moz-src:///browser/components/urlbar/UrlbarUtils.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  KavachaBangs: "resource:///modules/KavachaBangs.sys.mjs",
  UrlbarResult: "chrome://browser/content/urlbar/UrlbarResult.mjs",
  // moz-src, not resource:///. In Firefox 153 there is no global providers
  // singleton either: ProvidersManager is a CLASS with one instance per search
  // access point, reached through getInstanceForSap(). Both of those were
  // wrong in the first draft and neither failed loudly -- KavachaStartup's
  // per-module try/catch would have swallowed the whole registration.
  ProvidersManager: "moz-src:///browser/components/urlbar/UrlbarProvidersManager.sys.mjs",
});

class ProviderKavachaBangs extends UrlbarProvider {
  get name() {
    return "KavachaBangs";
  }

  get type() {
    return UrlbarUtils.PROVIDER_TYPE.HEURISTIC;
  }

  /**
   * Active only when the input actually resolves to a known bang. An unknown
   * bang deliberately does not activate: see KavachaBangs.resolve().
   */
  async isActive(queryContext) {
    return (
      !queryContext.isPrivate ||
      Services.prefs.getBoolPref("kavacha.bangs.in-private-windows", true)
        ? !!lazy.KavachaBangs.resolve(queryContext.searchString)
        : false
    );
  }

  getPriority() {
    // Above the default search heuristic, which is what we are displacing.
    return 1;
  }

  startQuery(queryContext, addCallback) {
    const hit = lazy.KavachaBangs.resolve(queryContext.searchString);
    if (!hit) {
      return;
    }
    const result = new lazy.UrlbarResult({
      type: UrlbarUtils.RESULT_TYPE.URL,
      source: UrlbarUtils.RESULT_SOURCE.OTHER_LOCAL,
      // `heuristic` is a CONSTRUCTOR parameter in Firefox 153, backed by a
      // private field with a getter only -- assigning result.heuristic after
      // construction throws "setting getter-only property". The probe caught
      // that on its first run; nothing static would have.
      heuristic: true,
      payload: {
        url: hit.url,
        title: `${hit.bang.title} — resolved on this device`,
        icon: UrlbarUtils.getIconForUrl(hit.url),
      },
    });
    addCallback(this, result);
  }
}

export const KavachaBangProvider = {
  _provider: null,

  async init() {
    if (this._provider) {
      return;
    }
    await lazy.KavachaBangs.init();
    this._provider = new ProviderKavachaBangs();
    // "urlbar" is the address bar's SAP. registerProvider puts heuristic
    // providers at the front of the list for us.
    lazy.ProvidersManager.getInstanceForSap("urlbar").registerProvider(
      this._provider
    );
  },

  uninit() {
    if (this._provider) {
      lazy.ProvidersManager.getInstanceForSap("urlbar").unregisterProvider(
        this._provider
      );
      this._provider = null;
    }
  },
};
