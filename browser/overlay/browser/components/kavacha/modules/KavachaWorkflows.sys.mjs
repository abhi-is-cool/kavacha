// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Kavacha automation framework (ADR 0017; ROADMAP Phase 7; PLATFORM_PLAN.md
// row 4) — workflows: a trigger and a list of actions.
//
// A WORKFLOW IS DATA, NEVER CODE. There is no script action, no eval, no
// expression language, and there never will be one: a workflow file is
// user-editable JSON that also arrives from imports and, one day, from the
// marketplace, and "run this arbitrary JS with chrome privileges" is not a
// feature, it is the end of the security model. Every step is one entry from
// a fixed allowlist with typed parameters, validated FAIL-CLOSED against an
// embedded JSON schema before anything runs (patch 0076's precedent, applied
// to a store that executes rather than one that renders).
//
// WHAT AN ACTION MAY DO IS BOUNDED BY WHAT THE USER COULD DO. Open a page,
// switch Space, close duplicates, snapshot, clip, focus, run another
// registered command. There is deliberately no action that reads a page and
// sends it anywhere, no action that writes prefs, and no action that touches
// passwords, cookies or permissions — the SDK boundary from ADR 0011, held in
// a second place because this is the second surface that could break it.
//
// RECURSION IS IMPOSSIBLE BY CONSTRUCTION. `run-command` refuses any command
// registered by a workflow (source prefix "workflow:"), so a pair of
// workflows cannot call each other into an infinite loop. Every run is also
// capped in steps, capped in tabs opened, and single-flight per workflow: a
// second trigger while a run is in progress is dropped rather than queued,
// because the failure mode of queueing is fifty tabs at once.
//
// TRIGGERS. manual (a palette command in the `automation` domain — the domain
// patch 0027 reserved for exactly this, three phases early), startup (once,
// after the first window settles), space-switch (when a named Space becomes
// active), and interval (a timer, minimum 15 minutes, NOT persisted across
// restarts — a scheduler that fires for missed windows is a different feature
// and would surprise a user who closed the browser for a week).
//
// NEVER IN A PRIVATE WINDOW. Automation is memory acting on your behalf, and
// a private window's promise is that there is none.

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  JSONFile: "resource://gre/modules/JSONFile.sys.mjs",
  KavachaCommandRegistry: "resource:///modules/KavachaCommandRegistry.sys.mjs",
  KavachaFocusMode: "resource:///modules/KavachaFocusMode.sys.mjs",
  KavachaKnowledge: "resource:///modules/KavachaKnowledge.sys.mjs",
  KavachaSpaceHistory: "resource:///modules/KavachaSpaceHistory.sys.mjs",
  KavachaTabAssistant: "resource:///modules/KavachaTabAssistant.sys.mjs",
  clearTimeout: "resource://gre/modules/Timer.sys.mjs",
  setInterval: "resource://gre/modules/Timer.sys.mjs",
  clearInterval: "resource://gre/modules/Timer.sys.mjs",
  setTimeout: "resource://gre/modules/Timer.sys.mjs",
});

const { JsonSchema } = ChromeUtils.importESModule(
  "resource://gre/modules/JsonSchema.sys.mjs"
);

const kEnabledPref = "kavacha.workflows.enabled";
const kMaxActionsPref = "kavacha.workflows.max-actions";
const kMaxTabsPref = "kavacha.workflows.max-tabs-per-run";
const kStoreFile = "kavacha-workflows.json";
const kMinIntervalMinutes = 15;
const kStartupDelayMs = 8000;

// The action vocabulary. Adding an entry here is the ONLY way to add a
// capability to automation, which is the property the whole design exists to
// have. `label` and `fields` are what about:workflows renders, so a new
// action shows up in the builder without the page learning about it.
export const KavachaWorkflowActions = Object.freeze({
  "open-url": {
    label: "Open a page",
    fields: [{ name: "url", label: "Address", type: "url" }],
    countsAsTab: true,
  },
  "switch-space": {
    label: "Switch to Space",
    fields: [{ name: "spaceId", label: "Space", type: "space" }],
  },
  "close-duplicate-tabs": { label: "Close duplicate tabs", fields: [] },
  "group-tabs": { label: "Group tabs by topic (needs a local model)", fields: [] },
  "snapshot-space": { label: "Snapshot this Space", fields: [] },
  "save-session": {
    label: "Save this session",
    fields: [{ name: "name", label: "Name", type: "text" }],
  },
  "clip-page": { label: "Clip the current page", fields: [] },
  "start-focus": {
    label: "Start a focus session",
    fields: [{ name: "minutes", label: "Minutes", type: "number" }],
  },
  "end-focus": { label: "End the focus session", fields: [] },
  "run-command": {
    label: "Run a Kavacha command",
    fields: [{ name: "commandId", label: "Command", type: "command" }],
  },
  wait: {
    label: "Wait",
    fields: [{ name: "seconds", label: "Seconds", type: "number" }],
  },
});

// Embedded copy of automation/workflow.schema.json. Sideloaded and imported
// documents are not packaged with that repo file, so the schema travels with
// the code; the repo copy is the design artifact and CI validates it. Both
// must stay in sync — the same arrangement patch 0076 made for manifests, and
// for the same reason.
const WORKFLOW_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  required: ["id", "name", "trigger", "actions"],
  // Fail-closed all the way down: an unknown field is a document this build
  // does not understand, and running the steps it DOES understand out of a
  // document written for something else is how automation surprises people.
  additionalProperties: false,
  properties: {
    id: { type: "string", minLength: 1, maxLength: 64 },
    name: { type: "string", minLength: 1, maxLength: 120 },
    enabled: { type: "boolean" },
    trigger: {
      type: "object",
      required: ["type"],
      additionalProperties: false,
      properties: {
        type: {
          type: "string",
          enum: ["manual", "startup", "space-switch", "interval"],
        },
        spaceId: { type: "string", maxLength: 64 },
        minutes: { type: "number", minimum: 1, maximum: 10080 },
      },
    },
    actions: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        required: ["type"],
        additionalProperties: false,
        properties: {
          type: { type: "string", enum: Object.keys(KavachaWorkflowActions) },
          url: { type: "string", maxLength: 2000 },
          spaceId: { type: "string", maxLength: 64 },
          name: { type: "string", maxLength: 120 },
          commandId: { type: "string", maxLength: 120 },
          minutes: { type: "number", minimum: 1, maximum: 1440 },
          seconds: { type: "number", minimum: 1, maximum: 300 },
        },
      },
    },
  },
};

export const KavachaWorkflows = {
  _initialized: false,
  _store: null,
  _intervals: new Map(),
  _running: new Set(),
  _commandSources: new Set(),
  _startupDone: false,
  _lastSpace: null,

  get enabled() {
    return Services.prefs.getBoolPref(kEnabledPref, true);
  },

  async init() {
    if (this._initialized) {
      return;
    }
    this._initialized = true;
    await this._load();
    this._registerCommands();
    this._armIntervals();
  },

  async _load() {
    if (!this._store) {
      this._store = new lazy.JSONFile({
        path: PathUtils.join(PathUtils.profileDir, kStoreFile),
      });
      await this._store.load();
      if (!Array.isArray(this._store.data.workflows)) {
        this._store.data.workflows = [];
      }
    }
    return this._store;
  },

  /* ------------------------------------------------------------- documents */

  list() {
    return [...(this._store?.data.workflows || [])];
  },

  get(id) {
    return this.list().find(w => w.id === id) || null;
  },

  /**
   * Validate a workflow document. Returns {valid, errors}. Called before
   * anything is stored AND before anything is run: a file the user edited by
   * hand between those two moments is exactly the case fail-closed exists for.
   */
  validate(workflow) {
    const result = JsonSchema.validate(workflow, WORKFLOW_SCHEMA);
    if (!result.valid) {
      return { valid: false, errors: ["does not match the workflow schema"] };
    }
    const errors = [];
    const maxActions = Services.prefs.getIntPref(kMaxActionsPref, 25);
    if (workflow.actions.length > maxActions) {
      errors.push(`more than ${maxActions} steps`);
    }
    for (const action of workflow.actions) {
      // Schema says the field is a string; this says it is a WEB address.
      // Automation must not be a way to open privileged pages, and
      // javascript:/data: URLs in an automated navigation are the classic
      // way to turn a config file into code execution.
      if (action.type === "open-url" && !/^https?:\/\/\S+$/i.test(action.url || "")) {
        errors.push("an Open a page step needs an http(s) address");
      }
      if (action.type === "run-command" && !action.commandId) {
        errors.push("a Run a Kavacha command step needs a command");
      }
    }
    if (
      workflow.trigger.type === "interval" &&
      Number(workflow.trigger.minutes || 0) < kMinIntervalMinutes
    ) {
      errors.push(`intervals must be at least ${kMinIntervalMinutes} minutes`);
    }
    if (workflow.trigger.type === "space-switch" && !workflow.trigger.spaceId) {
      errors.push("a Space trigger needs a Space");
    }
    return { valid: !errors.length, errors };
  },

  /** Create or replace one workflow. Refuses to store an invalid document. */
  async save(workflow) {
    await this._load();
    const check = this.validate(workflow);
    if (!check.valid) {
      return { saved: false, errors: check.errors };
    }
    const list = this._store.data.workflows;
    const at = list.findIndex(w => w.id === workflow.id);
    if (at === -1) {
      list.push(workflow);
    } else {
      list[at] = workflow;
    }
    this._store.saveSoon();
    this._registerCommands();
    this._armIntervals();
    return { saved: true, errors: [] };
  },

  async remove(id) {
    await this._load();
    const list = this._store.data.workflows;
    const at = list.findIndex(w => w.id === id);
    if (at === -1) {
      return false;
    }
    list.splice(at, 1);
    this._store.saveSoon();
    this._registerCommands();
    this._armIntervals();
    return true;
  },

  /** A blank document, so the builder and the module agree on the shape. */
  blank() {
    return {
      // Not Math.random(): an id collision would silently overwrite another
      // workflow. generateUUID is the same source the Space objects use.
      id: Services.uuid.generateUUID().toString().slice(1, -1),
      name: "New workflow",
      enabled: true,
      trigger: { type: "manual" },
      actions: [{ type: "open-url", url: "https://" }],
    };
  },

  /* -------------------------------------------------------------- commands */

  _registerCommands() {
    // Rebuild wholesale from the sources we actually registered — not from
    // the current workflow list, which is exactly the mistake that leaves a
    // DELETED workflow's command in the palette forever (the shape of patch
    // 0075's widget-lifecycle bug: a register with no matching unregister).
    for (const source of this._commandSources) {
      lazy.KavachaCommandRegistry.unregisterBySource(source);
    }
    this._commandSources.clear();
    if (!this.enabled) {
      return;
    }
    for (const workflow of this.list()) {
      if (workflow.enabled === false) {
        continue;
      }
      const l10nId = "kavacha-workflow-" + workflow.id;
      if (lazy.KavachaCommandRegistry.has(l10nId)) {
        continue;
      }
      const source = "workflow:" + workflow.id;
      try {
        lazy.KavachaCommandRegistry.register(
          {
            l10nId,
            // rawLabel, because a runtime command cannot add a Fluent key
            // (patch 0027's reason for the field).
            rawLabel: "Run: " + workflow.name,
            command: window => this.run(workflow.id, window),
            icon: "chrome://global/skin/icons/lightbulb.svg",
            domain: lazy.KavachaCommandRegistry.domains.AUTOMATION,
          },
          { source }
        );
        this._commandSources.add(source);
      } catch (e) {
        console.error("KavachaWorkflows: could not register command", e);
      }
    }
  },

  /* -------------------------------------------------------------- triggers */

  _armIntervals() {
    for (const timer of this._intervals.values()) {
      lazy.clearInterval(timer);
    }
    this._intervals.clear();
    if (!this.enabled) {
      return;
    }
    for (const workflow of this.list()) {
      if (workflow.enabled === false || workflow.trigger?.type !== "interval") {
        continue;
      }
      const minutes = Math.max(
        kMinIntervalMinutes,
        Number(workflow.trigger.minutes || kMinIntervalMinutes)
      );
      this._intervals.set(
        workflow.id,
        lazy.setInterval(() => this.run(workflow.id), minutes * 60_000)
      );
    }
  },

  /** Called once per session by KavachaStartup, after the first window settles. */
  onStartup(window) {
    if (this._startupDone || !this.enabled) {
      return;
    }
    this._startupDone = true;
    lazy.setTimeout(() => {
      for (const workflow of this.list()) {
        if (workflow.enabled !== false && workflow.trigger?.type === "startup") {
          this.run(workflow.id, window);
        }
      }
    }, kStartupDelayMs);
  },

  /** Called when a Space becomes active. */
  onSpaceChanged(spaceUuid, window) {
    if (!this.enabled || !spaceUuid || spaceUuid === this._lastSpace) {
      return;
    }
    this._lastSpace = spaceUuid;
    for (const workflow of this.list()) {
      if (
        workflow.enabled !== false &&
        workflow.trigger?.type === "space-switch" &&
        workflow.trigger.spaceId === spaceUuid
      ) {
        this.run(workflow.id, window);
      }
    }
  },

  /* --------------------------------------------------------------- running */

  _window(window) {
    const win =
      window || Services.wm.getMostRecentWindow("navigator:browser") || null;
    if (!win || win.closed || win.gKavachaWorkspaces?.privateWindowOrDisabled) {
      return null;
    }
    return win;
  },

  /**
   * Run one workflow. Returns a report: {ran, steps, skipped, reason} — the
   * builder shows it, and it is also what makes this testable without a UI.
   */
  async run(id, window) {
    const report = { ran: false, steps: 0, skipped: [], reason: "" };
    if (!this.enabled) {
      report.reason = "disabled";
      return report;
    }
    const workflow = this.get(id);
    if (!workflow) {
      report.reason = "missing";
      return report;
    }
    // Single-flight: a second trigger during a run is dropped, not queued.
    if (this._running.has(id)) {
      report.reason = "already-running";
      return report;
    }
    // Re-validate at run time, not just at save time: the file is plain JSON
    // in the profile and may have been edited since.
    const check = this.validate(workflow);
    if (!check.valid) {
      report.reason = "invalid";
      report.skipped = check.errors;
      return report;
    }
    const win = this._window(window);
    if (!win) {
      report.reason = "no-window";
      return report;
    }

    this._running.add(id);
    const maxTabs = Services.prefs.getIntPref(kMaxTabsPref, 10);
    let opened = 0;
    try {
      for (const action of workflow.actions) {
        const spec = KavachaWorkflowActions[action.type];
        if (!spec) {
          report.skipped.push(action.type + ": unknown step");
          continue;
        }
        if (spec.countsAsTab && opened >= maxTabs) {
          report.skipped.push("stopped after " + maxTabs + " tabs");
          break;
        }
        try {
          const result = await this._perform(action, win);
          if (result?.openedTab) {
            opened++;
          }
          if (result?.skipped) {
            report.skipped.push(action.type + ": " + result.skipped);
          } else {
            report.steps++;
          }
        } catch (e) {
          console.error("KavachaWorkflows: step failed", action.type, e);
          report.skipped.push(action.type + ": failed");
        }
        if (win.closed) {
          report.skipped.push("the window was closed");
          break;
        }
      }
      report.ran = true;
    } finally {
      this._running.delete(id);
    }
    return report;
  },

  async _perform(action, win) {
    switch (action.type) {
      case "open-url": {
        if (!/^https?:\/\//i.test(action.url || "")) {
          return { skipped: "not a web address" };
        }
        win.openTrustedLinkIn(action.url, "tab", { inBackground: true });
        return { openedTab: true };
      }

      case "switch-space": {
        if (!action.spaceId) {
          return { skipped: "no Space" };
        }
        await win.gKavachaWorkspaces?.changeWorkspaceWithID(action.spaceId);
        return {};
      }

      case "close-duplicate-tabs": {
        // Automation runs unattended, so the interactive confirmation is
        // replaced with an explicit yes — the user's yes was pressing Run on
        // a workflow whose steps they can read. Passing a confirm function is
        // patch 0081's own seam for exactly this.
        const result = await lazy.KavachaTabAssistant.closeDuplicates(win, {
          confirm: () => true,
        });
        return result?.closed ? {} : { skipped: "nothing to close" };
      }

      case "group-tabs": {
        const result = await lazy.KavachaTabAssistant.groupByTopic(win);
        return result?.groups ? {} : { skipped: result?.reason || "no groups" };
      }

      case "snapshot-space": {
        const spaceUuid = win.gKavachaWorkspaces?.activeWorkspace;
        if (!spaceUuid) {
          return { skipped: "no Space" };
        }
        const snapshot = await lazy.KavachaSpaceHistory.snapshotSpace(
          win,
          spaceUuid,
          "workflow"
        );
        return snapshot ? {} : { skipped: "nothing to snapshot" };
      }

      case "save-session": {
        // A name the user typed beats a name a model would suggest, and
        // taking that path also means saving works with no model at all.
        if (action.name) {
          const spaceUuid = win.gKavachaWorkspaces?.activeWorkspace;
          if (!spaceUuid) {
            return { skipped: "no Space" };
          }
          const id = await lazy.KavachaSpaceHistory.snapshotSpace(
            win,
            spaceUuid,
            "session",
            { label: action.name, force: true }
          );
          return id ? {} : { skipped: "nothing to save" };
        }
        const result = await lazy.KavachaTabAssistant.saveSession(win);
        return result?.id ? {} : { skipped: result?.reason || "not saved" };
      }

      case "clip-page": {
        const browser = win.gBrowser?.selectedBrowser;
        const captured = await this._capture(browser);
        if (!captured?.text) {
          return { skipped: "no readable text" };
        }
        const stored = await lazy.KavachaKnowledge.addItem({
          kind: "clip",
          url: captured.url,
          title: captured.title,
          body: captured.text,
          workspaceUuid:
            win.gKavachaWorkspaces?.getActiveWorkspaceFromCache?.()?.uuid || null,
        });
        return stored ? {} : { skipped: "not stored" };
      }

      case "start-focus": {
        lazy.KavachaFocusMode.start(Number(action.minutes || 0));
        return {};
      }

      case "end-focus": {
        lazy.KavachaFocusMode.end();
        return {};
      }

      case "run-command": {
        // The recursion refusal comes FIRST, before the command is even
        // looked up: it is a security property, and a security check that
        // runs only when an earlier lookup happens to succeed is one
        // refactor away from not running at all.
        if (String(action.commandId).startsWith("kavacha-workflow-")) {
          return { skipped: "a workflow cannot run another workflow" };
        }
        const entry = lazy.KavachaCommandRegistry.all().find(
          c => c.l10nId === action.commandId
        );
        if (!entry) {
          return { skipped: "no such command" };
        }
        if (typeof entry.command === "function") {
          await entry.command(win);
        } else if (entry.commandId) {
          win.document.getElementById(entry.commandId)?.doCommand();
        }
        return {};
      }

      case "wait": {
        const seconds = Math.min(300, Math.max(1, Number(action.seconds || 1)));
        await new Promise(resolve =>
          lazy.setTimeout(resolve, seconds * 1000)
        );
        return {};
      }

      default:
        return { skipped: "unknown step" };
    }
  },

  async _capture(browser) {
    try {
      const actor =
        browser?.browsingContext?.currentWindowGlobal?.getActor("KavachaIndexer");
      return await actor?.sendQuery("KavachaIndexer:Capture");
    } catch (e) {
      return null;
    }
  },
};
