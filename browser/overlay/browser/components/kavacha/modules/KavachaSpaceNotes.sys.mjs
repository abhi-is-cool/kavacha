/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * KavachaSpaceNotes — the workspace-notes store (patch 0008 semantics,
 * ADR 0020/0021). Notes live in a profile-local JSONFile
 * (kavacha-notes.json) keyed by space id — deliberately NOT on the space
 * record: they would bloat the workspaces document and, one day, sync.
 * One process-wide JSONFile instance owns the file (two instances would
 * clobber each other's saves — the Zen-era version was per window, which
 * universal search then had to route around). Last-write-wins across windows.
 */

import { JSONFile } from "resource://gre/modules/JSONFile.sys.mjs";

const FILE = "kavacha-notes.json";

export const KavachaSpaceNotes = {
  _file: null,
  _loading: null,

  async _ensure() {
    if (!this._file) {
      this._file = new JSONFile({
        path: PathUtils.join(PathUtils.profileDir, FILE),
        dataPostProcessor: data => {
          if (!data || typeof data !== "object") {
            data = {};
          }
          data.notes ||= {};
          return data;
        },
      });
      this._loading = this._file.load();
    }
    await this._loading;
    return this._file;
  },

  /** { [spaceId]: { content, updatedAt } } — the live object, do not mutate. */
  async getAll() {
    return (await this._ensure()).data.notes;
  },

  async get(spaceId) {
    return (await this._ensure()).data.notes[spaceId]?.content ?? "";
  },

  /** Empty (whitespace-only) content deletes the note — clearing the box IS the gesture. */
  async set(spaceId, content) {
    const file = await this._ensure();
    if (content && content.trim()) {
      file.data.notes[spaceId] = { content, updatedAt: new Date().toISOString() };
    } else {
      delete file.data.notes[spaceId];
    }
    file.saveSoon();
    Services.obs.notifyObservers(null, "kavacha-space-notes-changed", spaceId);
  },

  async remove(spaceId) {
    return this.set(spaceId, "");
  },
};
