// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Kavacha plugin manager (ROADMAP Phase 3 "Kavacha SDK + plugin permission
// model"; ADR 0011). A process singleton that sideloads plugins from the
// profile and runs the granted ones with least privilege.
//
// Plugins live at kavacha-plugins/<id>/ with a kavacha-plugin.json manifest
// (see sdk/kavacha-plugin.schema.json) and an `entry` ES module exporting
// activate(sdk) (and optionally deactivate()). On init() every plugin that is
// BOTH enabled AND holds at least one granted permission is activated with a
// KavachaSDK.forPlugin(id) facade limited to what the user granted. Enabled
// flags live in kavacha-plugins/state.json; grants in kavacha-plugins/grants.json
// (owned by KavachaPluginPermissions).
//
// SECURITY:
//  - Least privilege: a plugin only ever receives the SDK facade, and every
//    facade method is gated on the user's live grants. The manager never grants
//    a permission the user did not approve — grant() is the only widening path
//    and it runs the request through the permission model's validator, which
//    rejects anything outside the grantable enum.
//  - Revocation: disable(id) calls the plugin's deactivate() (if any) and then
//    KavachaCommandRegistry.unregisterBySource("plugin:"+id), so every command
//    the plugin registered leaves the live palette immediately — the registry
//    source is the source of truth, so this holds even if deactivate() is buggy
//    or absent.
//  - NOT YET a sandbox: granted plugins currently run in the parent module
//    scope — they are trusted-on-grant sideloads and the SDK is the only
//    *sanctioned* surface. A real JS isolation boundary (a separate
//    compartment/sandbox per plugin) is a hardening follow-up (ADR 0011), and
//    remote install via the Marketplace is a later integration that MUST land
//    behind that boundary. Until then, only sideload plugins you trust.

import {
  KavachaCommandRegistry,
  KavachaCommandDomain,
} from "resource:///modules/KavachaCommandRegistry.sys.mjs";
import { KavachaPluginPermissions } from "resource:///modules/KavachaPluginPermissions.sys.mjs";
import { KavachaSDK } from "resource:///modules/KavachaSDK.sys.mjs";

const kPluginsDir = "kavacha-plugins";
const kManifestName = "kavacha-plugin.json";
const kStateFile = "state.json";

function _pluginsRoot() {
  return PathUtils.join(PathUtils.profileDir, kPluginsDir);
}

function _statePath() {
  return PathUtils.join(_pluginsRoot(), kStateFile);
}

export const KavachaPluginManager = {
  _initialized: false,
  // id -> { deactivate } for currently active plugins, so disable() can tear down.
  _active: new Map(),

  async init() {
    if (this._initialized) {
      return;
    }
    this._initialized = true;
    this._registerOpenCommand();
    try {
      for (const plugin of await this.list()) {
        if (plugin.enabled && plugin.grants.length) {
          await this._activate(plugin);
        }
      }
    } catch (e) {
      console.error("KavachaPluginManager: init scan failed", e);
    }
  },

  // The palette entry to reach about:plugins. Registered once (guarded), with a
  // source so it is clearly the manager's and not any plugin's.
  _registerOpenCommand() {
    if (KavachaCommandRegistry.has("kavacha-plugins-open")) {
      return;
    }
    KavachaCommandRegistry.register(
      {
        l10nId: "kavacha-plugins-open",
        rawLabel: "Manage Plugins",
        command: window => window.switchToTabHavingURI("about:plugins", true),
        icon: "chrome://global/skin/icons/plugin.svg",
        domain: KavachaCommandDomain.AUTOMATION,
      },
      { source: "kavacha-plugin-manager" }
    );
  },

  // ----- Discovery --------------------------------------------------------

  async _readState() {
    try {
      const parsed = JSON.parse(await IOUtils.readUTF8(_statePath()));
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (e) {
      return {}; // No state file yet — nothing enabled.
    }
  },

  async _writeState(state) {
    await IOUtils.makeDirectory(_pluginsRoot(), { ignoreExisting: true });
    await IOUtils.writeUTF8(_statePath(), JSON.stringify(state, null, 2));
  },

  async _readManifest(id) {
    const path = PathUtils.join(_pluginsRoot(), id, kManifestName);
    const manifest = JSON.parse(await IOUtils.readUTF8(path));
    if (manifest.id && manifest.id !== id) {
      throw new Error(
        `KavachaPluginManager: manifest id "${manifest.id}" != directory "${id}"`
      );
    }
    return manifest;
  },

  /**
   * Installed plugins: [{ id, manifest, enabled, grants }]. A directory with a
   * malformed or missing manifest is skipped (logged), never crashing the scan.
   */
  async list() {
    const out = [];
    const state = await this._readState();
    let children;
    try {
      children = await IOUtils.getChildren(_pluginsRoot());
    } catch (e) {
      return out; // No plugins directory yet.
    }
    for (const child of children) {
      let info;
      try {
        info = await IOUtils.stat(child);
      } catch (e) {
        continue;
      }
      if (info.type !== "directory") {
        continue;
      }
      const id = PathUtils.filename(child);
      let manifest;
      try {
        manifest = await this._readManifest(id);
      } catch (e) {
        console.error(`KavachaPluginManager: skipping "${id}"`, e);
        continue;
      }
      out.push({
        id,
        manifest,
        enabled: state[id] === true,
        grants: await KavachaPluginPermissions.getGrants(id),
      });
    }
    return out;
  },

  async _get(id) {
    return (await this.list()).find(p => p.id === id) || null;
  },

  // ----- Lifecycle --------------------------------------------------------

  async _activate(plugin) {
    if (this._active.has(plugin.id)) {
      return;
    }
    const entryPath = PathUtils.join(
      _pluginsRoot(),
      plugin.id,
      plugin.manifest.entry
    );
    let mod;
    try {
      // Load from the profile file the user sideloaded; nothing is fetched from
      // the network. (No sandbox yet — trusted-on-grant; see the file header.)
      mod = ChromeUtils.importESModule(PathUtils.toFileURI(entryPath));
    } catch (e) {
      console.error(`KavachaPluginManager: cannot load "${plugin.id}"`, e);
      return;
    }
    const sdk = KavachaSDK.forPlugin(plugin.id);
    try {
      await mod.activate?.(sdk);
    } catch (e) {
      console.error(
        `KavachaPluginManager: activate() threw in "${plugin.id}"`,
        e
      );
    }
    this._active.set(plugin.id, { deactivate: mod.deactivate });
  },

  async _deactivate(id) {
    const entry = this._active.get(id);
    if (entry) {
      try {
        await entry.deactivate?.();
      } catch (e) {
        console.error(`KavachaPluginManager: deactivate() threw in "${id}"`, e);
      }
      this._active.delete(id);
    }
    // Drop every command the plugin registered, whether or not it had a
    // deactivate() — the registry source is the source of truth.
    KavachaCommandRegistry.unregisterBySource(`plugin:${id}`);
  },

  // ----- Public API (about:plugins) --------------------------------------

  /** Enable a plugin: persist the flag and activate it if it has grants. */
  async enable(id) {
    const state = await this._readState();
    state[id] = true;
    await this._writeState(state);
    const plugin = await this._get(id);
    if (plugin?.grants.length) {
      await this._activate(plugin);
    }
  },

  /** Disable a plugin: tear it down and clear the flag. Grants are kept. */
  async disable(id) {
    await this._deactivate(id);
    const state = await this._readState();
    delete state[id];
    await this._writeState(state);
  },

  /**
   * Grant a set of permissions (validated by the permission model, which
   * rejects anything outside the grantable enum) and enable the plugin. This is
   * the only path that widens a plugin's privileges.
   */
  async grant(id, perms) {
    await KavachaPluginPermissions.setGrants(id, perms);
    await this.enable(id);
  },

  /** Remove a plugin's directory, grants, enabled flag, and live commands. */
  async uninstall(id) {
    await this._deactivate(id);
    const state = await this._readState();
    delete state[id];
    await this._writeState(state);
    await KavachaPluginPermissions.revoke(id);
    try {
      await IOUtils.remove(PathUtils.join(_pluginsRoot(), id), {
        recursive: true,
        ignoreAbsent: true,
      });
    } catch (e) {
      console.error(`KavachaPluginManager: could not remove "${id}"`, e);
    }
  },
};
