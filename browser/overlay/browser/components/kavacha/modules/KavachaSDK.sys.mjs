// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Kavacha SDK — the capability facade a plugin calls (ROADMAP Phase 3 "Kavacha
// SDK + plugin permission model"; ADR 0011). KavachaSDK.forPlugin(id) hands a
// plugin a small object whose every method is gated by
// KavachaPluginPermissions.hasPermission(id, ...): if the user has not granted
// the capability, the call throws instead of acting. Grants are read live, so a
// permission revoked at runtime fails the plugin's very next call.
//
// This is the ONLY sanctioned surface a plugin has. It deliberately exposes
// four capabilities and nothing else:
//   workspaces — list / current / create-from-template (read + safe create; no delete)
//   tabs       — list / open (http/https + a few safe about: pages, as an
//                unprivileged load) / close, on the active window
//   notes      — read / write the current workspace note
//   commands   — register a Cmd+K command (revocable as a group by source)
//
// It NEVER exposes passwords, saved credentials, autofill, raw browsing
// history, or chrome internals — those are not part of the permission enum and
// there is no method here that could reach them. Widening this surface means
// adding a capability to KavachaPermission first, on purpose.

import {
  KavachaPluginPermissions,
  KavachaPermission,
} from "resource:///modules/KavachaPluginPermissions.sys.mjs";
import {
  KavachaCommandRegistry,
  KavachaCommandDomain,
  KavachaCommandCapability,
} from "resource:///modules/KavachaCommandRegistry.sys.mjs";

function _activeWindow() {
  const win = Services.wm.getMostRecentWindow("navigator:browser");
  if (!win || win.closed) {
    throw new Error("KavachaSDK: no active browser window");
  }
  return win;
}

function _slug(label) {
  return (
    String(label || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "command"
  );
}

// The only about: pages a plugin may open. "about:" as a whole is NOT safe:
// about:config, about:logins, about:profiles, about:preferences, about:studio
// and others are privileged UI, so the tabs capability must not reach them —
// an allowlist of benign, content-loadable pages is the whole grant.
const kOpenableAboutPages = new Set([
  "about:blank",
  "about:newtab",
  "about:home",
]);

// Only web URLs and the few safe about: pages above may be opened by a plugin.
// file:// and chrome:// are refused so a plugin can never reach local files or
// privileged UI through the tabs capability.
function _assertOpenableUrl(url) {
  let uri;
  try {
    uri = Services.io.newURI(String(url));
  } catch (e) {
    throw new Error(`KavachaSDK: invalid url "${url}"`);
  }
  if (uri.scheme === "about") {
    const base = uri.spec.replace(/[?#].*$/, "").toLowerCase();
    if (!kOpenableAboutPages.has(base)) {
      throw new Error(
        `KavachaSDK: refusing to open "${uri.spec}" — of about: pages only ` +
          `about:blank, about:newtab and about:home may be opened by a plugin`
      );
    }
    return uri.spec;
  }
  if (!["http", "https"].includes(uri.scheme)) {
    throw new Error(
      `KavachaSDK: refusing to open "${uri.scheme}:" — only http, https, and a ` +
        `few safe about: pages are allowed`
    );
  }
  return uri.spec;
}

function _publicWorkspace(w) {
  return w ? { id: w.id, name: w.name, archived: !!w.archived } : null;
}

export const KavachaSDK = {
  /**
   * The capability facade for one plugin. Every method checks the plugin's
   * live grants first; a revoked permission fails the very next call. The
   * facade holds no privileged references itself — it resolves the active
   * window (and its gKavachaWorkspaces / gBrowser) at call time.
   */
  forPlugin(id) {
    const require = async perm => {
      if (!(await KavachaPluginPermissions.hasPermission(id, perm))) {
        throw new Error(`Kavacha plugin "${id}" lacks the "${perm}" permission`);
      }
    };
    // Passed to a plugin's command handler so it can call back into its SDK.
    const context = { pluginId: id, sdk: null };

    const api = {
      pluginId: id,

      workspaces: {
        async list() {
          await require(KavachaPermission.WORKSPACES);
          const gz = _activeWindow().gKavachaWorkspaces;
          return (gz?.getWorkspaces?.() || []).map(_publicWorkspace);
        },
        async current() {
          await require(KavachaPermission.WORKSPACES);
          const gz = _activeWindow().gKavachaWorkspaces;
          return _publicWorkspace(gz?.getWorkspaceFromId?.(gz.activeWorkspace));
        },
        // Read + safe create only — there is deliberately no delete/archive.
        async createFromTemplate(kind) {
          await require(KavachaPermission.WORKSPACES);
          return _activeWindow().gKavachaWorkspaces?.createWorkspaceFromTemplate(
            kind
          );
        },
      },

      tabs: {
        async list() {
          await require(KavachaPermission.TABS);
          const gBrowser = _activeWindow().gBrowser;
          return (gBrowser?.tabs || []).map((tab, i) => ({
            id: i,
            url: tab.linkedBrowser?.currentURI?.spec || "",
            title: tab.label || "",
            selected: !!tab.selected,
          }));
        },
        async open(url) {
          await require(KavachaPermission.TABS);
          const spec = _assertOpenableUrl(url);
          // A plugin is not the user: a plugin-initiated load must NOT carry the
          // system principal (which bypasses the security checks a normal
          // content load gets). A fresh null principal makes the load
          // unprivileged, the correct provenance for "some code asked to open
          // a page".
          return _activeWindow().gBrowser?.addTab(spec, {
            triggeringPrincipal:
              Services.scriptSecurityManager.createNullPrincipal({}),
          });
        },
        async close(tabId) {
          await require(KavachaPermission.TABS);
          const gBrowser = _activeWindow().gBrowser;
          const tab = gBrowser?.tabs?.[tabId];
          if (tab) {
            gBrowser.removeTab(tab);
          }
        },
      },

      notes: {
        async read() {
          await require(KavachaPermission.NOTES);
          const gz = _activeWindow().gKavachaWorkspaces;
          const notes = (await gz?.kavachaGetAllNotes?.()) || {};
          return notes[gz.activeWorkspace]?.content ?? "";
        },
        async write(text) {
          await require(KavachaPermission.NOTES);
          const gz = _activeWindow().gKavachaWorkspaces;
          // TODO(ADR 0011): gKavachaWorkspaces owns the single notes JSONFile and
          // has no public setter yet — patch 0008 keeps #notesFile private and
          // only writes via the panel's #flushWorkspaceNotes. A
          // gKavachaWorkspaces.kavachaSetNote(uuid, text) accessor mirroring
          // kavachaGetAllNotes() is the clean home for this; wire this call to
          // it when it lands. Authored blind — do NOT reach into private fields.
          if (typeof gz?.kavachaSetNote === "function") {
            return gz.kavachaSetNote(gz.activeWorkspace, String(text ?? ""));
          }
          throw new Error(
            "KavachaSDK: notes.write needs gKavachaWorkspaces.kavachaSetNote (pending; see ADR 0011)"
          );
        },
      },

      commands: {
        async register({ label, run } = {}) {
          await require(KavachaPermission.COMMANDS);
          if (typeof run !== "function" || !label) {
            throw new Error(
              "KavachaSDK: commands.register needs { label, run }"
            );
          }
          // Dogfoods the patch-0027 registry: literal rawLabel (no .ftl key for
          // runtime commands), identity l10nId namespaced by plugin id, and a
          // source of "plugin:<id>" so disabling the plugin drops it as a group.
          return KavachaCommandRegistry.register(
            {
              l10nId: `kavacha-plugin-${id}-${_slug(label)}`,
              rawLabel: label,
              command: () => run(context),
              icon: "chrome://global/skin/icons/plugin.svg",
              domain: KavachaCommandDomain.AUTOMATION,
              capability: KavachaCommandCapability.COMMANDS,
            },
            { source: `plugin:${id}` }
          );
        },
      },
    };

    context.sdk = api;
    return api;
  },
};
