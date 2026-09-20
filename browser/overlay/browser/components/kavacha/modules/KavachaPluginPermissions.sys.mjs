// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Kavacha plugin permission model (ROADMAP Phase 3 "Kavacha SDK + plugin
// permission model"; ADR 0011).
//
// A plugin may touch the browser only through capabilities the USER has
// explicitly granted, and only four capabilities are grantable at all:
// workspaces, tabs, notes, and commands. These map 1:1 onto the command
// registry's capability enum (patch 0027). Passwords, saved credentials,
// autofill, and browsing history are NOT in the enum and can never be granted
// — that exclusion is structural, not a policy check that could be relaxed.
//
// Grants persist in the profile at kavacha-plugins/grants.json:
//   { "<pluginId>": { granted: ["workspaces", ...], ts: <epoch ms> } }
// IO mirrors the other engines (IOUtils/PathUtils, profile-relative; ADR 0008).

export const KavachaPermission = Object.freeze({
  WORKSPACES: "workspaces",
  TABS: "tabs",
  NOTES: "notes",
  COMMANDS: "commands",
});

// The complete set of grantable permission values, in display order. This is
// the ONLY set the user is ever offered — there is deliberately no "passwords",
// "history", or "autofill" value anywhere in Kavacha's plugin surface.
export const KAVACHA_GRANTABLE_PERMISSIONS = Object.freeze([
  KavachaPermission.WORKSPACES,
  KavachaPermission.TABS,
  KavachaPermission.NOTES,
  KavachaPermission.COMMANDS,
]);

// Plain-language copy for the about:plugins grant prompt. Each line says what
// the capability lets a plugin do AND names its limit, so the user grants with
// eyes open.
export const KavachaPermissionDescription = Object.freeze({
  [KavachaPermission.WORKSPACES]:
    "See your workspaces and create new ones from a template. Cannot delete workspaces or read their isolated cookies.",
  [KavachaPermission.TABS]:
    "See open tabs and open or close web (http/https) and about: tabs. Cannot open file:// or chrome:// pages, and never reads page contents.",
  [KavachaPermission.NOTES]:
    "Read and write the note attached to the current workspace. No access to any other workspace data.",
  [KavachaPermission.COMMANDS]:
    "Add commands to the Cmd+K palette. Disabling the plugin removes every command it added.",
});

const kPluginsDir = "kavacha-plugins";
const kGrantsFile = "grants.json";

function _grantsPath() {
  return PathUtils.join(PathUtils.profileDir, kPluginsDir, kGrantsFile);
}

/**
 * Reject anything outside the grantable enum. Defense in depth: even if a
 * manifest or a caller asks for "passwords" / "history" / "autofill", it never
 * reaches storage — the enum is the whole world of grantable permissions.
 */
export function assertNeverSensitive(perms) {
  if (!Array.isArray(perms)) {
    throw new Error("KavachaPluginPermissions: permissions must be an array");
  }
  for (const perm of perms) {
    if (!KAVACHA_GRANTABLE_PERMISSIONS.includes(perm)) {
      throw new Error(
        `KavachaPluginPermissions: "${perm}" is not a grantable permission ` +
          `(passwords, history, and autofill are never grantable)`
      );
    }
  }
  return perms;
}

async function _readAll() {
  try {
    const parsed = JSON.parse(await IOUtils.readUTF8(_grantsPath()));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (e) {
    return {}; // No grants file yet — nothing is granted.
  }
}

async function _writeAll(all) {
  await IOUtils.makeDirectory(PathUtils.join(PathUtils.profileDir, kPluginsDir), {
    ignoreExisting: true,
  });
  await IOUtils.writeUTF8(_grantsPath(), JSON.stringify(all, null, 2));
}

export const KavachaPluginPermissions = {
  permissions: KavachaPermission,
  grantable: KAVACHA_GRANTABLE_PERMISSIONS,
  descriptions: KavachaPermissionDescription,
  assertNeverSensitive,

  /** The permissions currently granted to a plugin (possibly []). */
  async getGrants(id) {
    const entry = (await _readAll())[id];
    return Array.isArray(entry?.granted) ? entry.granted.slice() : [];
  },

  /** Replace a plugin's granted permissions (validated) and stamp the time. */
  async setGrants(id, perms) {
    const clean = assertNeverSensitive([...new Set(perms || [])]);
    const all = await _readAll();
    all[id] = { granted: clean, ts: Date.now() };
    await _writeAll(all);
    return clean;
  },

  /** Whether a plugin currently holds a specific permission. */
  async hasPermission(id, perm) {
    return (await this.getGrants(id)).includes(perm);
  },

  /** Drop every permission a plugin holds (about:plugins "Revoke"). */
  async revoke(id) {
    const all = await _readAll();
    if (id in all) {
      delete all[id];
      await _writeAll(all);
    }
  },
};
