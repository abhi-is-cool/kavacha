/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * KavachaWorkspaces — the process-wide workspaces ("Spaces") model (ADR 0021).
 *
 * Owns the records and their persistence; nothing here touches a window. The
 * per-window half (tab membership, switching, the strip) is
 * content/spaces/kavacha-workspaces.js, exposed as window.gKavachaWorkspaces.
 *
 * Record: ui/workspaces/workspace.schema.json — `id` (uuid), `name`, `icon`
 * (emoji or chrome:// SVG), `containerId` (Firefox userContextId, optional),
 * `searchProvider`, `extensions`, `settings`, `template`, `archived`,
 * `description`, `parentSpaceId`, `accent`, `order`, `createdAt`,
 * `lastActiveAt`.
 *
 * Store: <profile>/kavacha-workspaces.json via JSONFile, {version, spaces}.
 * Every mutation goes through saveWorkspace()/deleteWorkspace() so the
 * "kavacha-workspaces-changed" notification (data: JSON {kind, id}) reaches
 * every window's strip.
 */

import { JSONFile } from "resource://gre/modules/JSONFile.sys.mjs";

const STORE_FILE = "kavacha-workspaces.json";
const STORE_VERSION = 1;
export const TOPIC_CHANGED = "kavacha-workspaces-changed";
export const PREF_ENABLED = "kavacha.workspaces.enabled";
export const PREF_ISOLATE = "kavacha.workspaces.isolate-containers";

/**
 * Templates (patch 0006 semantics): a pre-filled space plus, when container
 * isolation is on — or always, for Private, whose only promise is isolation
 * (patch 0038) — a dedicated Firefox container. Extensions stay at "all".
 */
export const KAVACHA_SPACE_TEMPLATES = [
  {
    id: "student",
    l10nId: "kavacha-space-template-student",
    name: "Student",
    icon: "\u{1F393}",
    container: { name: "Student", icon: "briefcase", color: "blue" },
    accent: "#3B82F6",
    settings: { blockAutoplay: true, blockNotificationPrompts: true },
  },
  {
    id: "developer",
    l10nId: "kavacha-space-template-developer",
    name: "Developer",
    icon: "\u{1F4BB}",
    container: { name: "Developer", icon: "circle", color: "green" },
    accent: "#22C55E",
    settings: { searchSuggestions: false },
  },
  {
    id: "privacy",
    l10nId: "kavacha-space-template-privacy",
    name: "Private",
    icon: "\u{1F512}",
    container: { name: "Private", icon: "fingerprint", color: "purple" },
    accent: "#8B5CF6",
    searchProvider: "DuckDuckGo",
    settings: {
      rememberPasswords: false,
      searchSuggestions: false,
      blockNotificationPrompts: true,
    },
    alwaysIsolate: true,
  },
];

const lazy = {};
ChromeUtils.defineLazyGetter(lazy, "log", () => {
  const { ConsoleAPI } = ChromeUtils.importESModule(
    "resource://gre/modules/Console.sys.mjs"
  );
  return new ConsoleAPI({
    prefix: "KavachaWorkspaces",
    maxLogLevelPref: "kavacha.workspaces.loglevel",
  });
});

function newId() {
  return Services.uuid.generateUUID().toString().slice(1, -1);
}

export const KavachaWorkspaces = {
  _store: null,
  _initPromise: null,

  /** Idempotent; resolves once the store is loaded and has ≥ 1 space. */
  init() {
    if (!this._initPromise) {
      this._initPromise = this._load();
    }
    return this._initPromise;
  },

  get ready() {
    return !!this._store?.dataReady;
  },

  get enabled() {
    return Services.prefs.getBoolPref(PREF_ENABLED, true);
  },

  async _load() {
    this._store = new JSONFile({
      path: PathUtils.join(PathUtils.profileDir, STORE_FILE),
      dataPostProcessor: data => {
        if (!data || typeof data !== "object") {
          data = {};
        }
        if (!Array.isArray(data.spaces)) {
          data.spaces = [];
        }
        data.version = STORE_VERSION;
        return data;
      },
    });
    await this._store.load();
    if (!this._store.data.spaces.length) {
      this._store.data.spaces.push(this._newRecord({ name: "Personal", icon: "\u{1F3E0}" }));
      this._store.saveSoon();
    }
    lazy.log.debug(`loaded ${this._store.data.spaces.length} space(s)`);
  },

  _newRecord(fields) {
    const spaces = this._store?.data.spaces ?? [];
    const order = spaces.reduce((m, s) => Math.max(m, s.order ?? 0), -1) + 1;
    const record = {
      id: newId(),
      name: String(fields.name || "").slice(0, 64) || "Space",
      icon: fields.icon || "\u{1F5C2}️",
      order,
      createdAt: new Date().toISOString(),
    };
    for (const k of [
      "containerId", "searchProvider", "extensions", "settings", "template",
      "description", "parentSpaceId", "accent", "theme",
    ]) {
      if (fields[k] !== undefined && fields[k] !== null && fields[k] !== 0) {
        record[k] = fields[k];
      }
    }
    return record;
  },

  _notify(kind, id) {
    Services.obs.notifyObservers(null, TOPIC_CHANGED, JSON.stringify({ kind, id }));
  },

  // ------------------------------------------------------------------ reads

  /** All spaces, archived included, in strip order. */
  getWorkspaces() {
    const spaces = this._store?.data.spaces ?? [];
    return [...spaces].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  },

  getWorkspaceFromId(id) {
    return this._store?.data.spaces.find(s => s.id === id) ?? null;
  },

  // ----------------------------------------------------------------- writes

  createWorkspace(fields) {
    const record = this._newRecord(fields);
    this._store.data.spaces.push(record);
    this._store.saveSoon();
    this._notify("create", record.id);
    return record;
  },

  /** Upsert by id; the object passed in becomes (or replaces) the record. */
  saveWorkspace(workspace) {
    if (!workspace?.id) {
      throw new Error("saveWorkspace: record has no id");
    }
    const spaces = this._store.data.spaces;
    const i = spaces.findIndex(s => s.id === workspace.id);
    if (i === -1) {
      spaces.push(workspace);
    } else if (spaces[i] !== workspace) {
      spaces[i] = workspace;
    }
    this._store.saveSoon();
    this._notify("update", workspace.id);
  },

  deleteWorkspace(id) {
    const spaces = this._store.data.spaces;
    const i = spaces.findIndex(s => s.id === id);
    if (i === -1) {
      return false;
    }
    spaces.splice(i, 1);
    this._store.saveSoon();
    this._notify("delete", id);
    return true;
  },

  reorder(ids) {
    ids.forEach((id, order) => {
      const s = this.getWorkspaceFromId(id);
      if (s) {
        s.order = order;
      }
    });
    this._store.saveSoon();
    this._notify("reorder", null);
  },

  /** Synchronous flush (quit). */
  flush() {
    return this._store?.dataReady ? this._store.saveSoon() : undefined;
  },

  async finalize() {
    if (this._store?.dataReady) {
      await this._store.finalize();
    }
  },
};
