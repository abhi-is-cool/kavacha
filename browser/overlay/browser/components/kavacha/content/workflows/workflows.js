// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// about:workflows — the no-code automation builder (ADR 0017).
//
// THE BUILDER KNOWS NOTHING ABOUT INDIVIDUAL ACTIONS. It renders whatever
// KavachaWorkflowActions declares: a label, and a list of typed fields. Adding
// an action to the engine therefore adds it to this page for free, and — more
// importantly — this page cannot offer a step the engine does not implement,
// which is the failure mode a hand-written form would eventually ship.
//
// Every edit round-trips through KavachaWorkflows.save(), which validates
// fail-closed. The page never writes the store directly, so there is exactly
// one place a malformed workflow can be rejected, and it is the same place
// that rejects a hand-edited file at run time.
//
// Chrome-privileged: workflow names, URLs and command labels are strings from
// a file, and they reach the DOM only through textContent and input values.

"use strict";

/* global ChromeUtils, Services, document, window, console */

(() => {
  const { KavachaWorkflows, KavachaWorkflowActions } =
    ChromeUtils.importESModule("resource:///modules/KavachaWorkflows.sys.mjs");
  const { KavachaCommandRegistry } = ChromeUtils.importESModule(
    "resource:///modules/KavachaCommandRegistry.sys.mjs"
  );

  const $ = id => document.getElementById(id);
  const clear = node => {
    while (node.firstChild) {
      node.firstChild.remove();
    }
  };

  let selectedId = null;
  // The workflow being edited, held as a working copy so an invalid
  // half-finished edit is never written to the store.
  let draft = null;

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) {
      node.className = className;
    }
    if (text !== undefined) {
      node.textContent = text;
    }
    return node;
  }

  function spaces() {
    try {
      const chromeWindow = Services.wm.getMostRecentWindow("navigator:browser");
      return (chromeWindow?.gKavachaWorkspaces?.getWorkspaces?.() || [])
        .filter(space => !space.archived)
        .map(space => ({ id: space.uuid, name: space.name }));
    } catch (e) {
      return [];
    }
  }

  function commands() {
    return KavachaCommandRegistry.all()
      // A workflow cannot run a workflow (the engine refuses too; this keeps
      // the impossible option out of the menu rather than letting a user pick
      // it and be told no).
      .filter(command => !command.l10nId.startsWith("kavacha-workflow-"))
      .map(command => ({
        id: command.l10nId,
        // Runtime commands carry a real label; built-ins carry a Fluent id
        // this page cannot resolve (it is outside browser.xhtml's scope), so
        // the id is shown rather than a blank row — D0e's lesson, handled by
        // showing something true rather than something empty.
        label: command.rawLabel || command.l10nId,
      }));
  }

  /* ---------------------------------------------------------------- list */

  function renderList() {
    const list = $("kw-list");
    clear(list);
    const workflows = KavachaWorkflows.list();
    if (!workflows.length) {
      list.append(
        el(
          "p",
          "kw-empty",
          "No workflows yet. A first one worth having: open the three pages " +
            "you always start with."
        )
      );
      return;
    }
    for (const workflow of workflows) {
      const row = el("button", "kw-row");
      if (workflow.id === selectedId) {
        row.classList.add("is-active");
      }
      row.append(el("span", "kw-row-name", workflow.name));
      const meta = el("span", "kw-row-meta");
      meta.textContent =
        triggerSummary(workflow.trigger) +
        " · " +
        workflow.actions.length +
        (workflow.actions.length === 1 ? " step" : " steps") +
        (workflow.enabled === false ? " · off" : "");
      row.append(meta);
      row.addEventListener("click", () => select(workflow.id));
      list.append(row);
    }
  }

  function triggerSummary(trigger) {
    switch (trigger?.type) {
      case "startup":
        return "at startup";
      case "interval":
        return "every " + (trigger.minutes || 0) + " min";
      case "space-switch": {
        const space = spaces().find(s => s.id === trigger.spaceId);
        return "entering " + (space?.name || "a Space");
      }
      default:
        return "when you ask";
    }
  }

  /* -------------------------------------------------------------- editor */

  function select(id) {
    selectedId = id;
    draft = structuredClone(KavachaWorkflows.get(id));
    renderList();
    renderEditor();
  }

  function field(labelText, control) {
    const wrap = el("label", "kw-field");
    wrap.append(el("span", "kw-field-label", labelText));
    wrap.append(control);
    return wrap;
  }

  function select_(options, value, onChange) {
    const node = document.createElement("select");
    node.className = "kw-select";
    for (const option of options) {
      const item = document.createElement("option");
      item.value = option.id;
      item.textContent = option.label;
      if (option.id === value) {
        item.selected = true;
      }
      node.append(item);
    }
    node.addEventListener("change", () => onChange(node.value));
    return node;
  }

  function input(value, onChange, { type = "text" } = {}) {
    const node = document.createElement("input");
    node.className = "kw-input";
    node.type = type === "number" ? "number" : "text";
    node.value = value === undefined || value === null ? "" : String(value);
    node.addEventListener("input", () => onChange(node.value));
    return node;
  }

  function renderEditor() {
    const editor = $("kw-editor");
    clear(editor);
    if (!draft) {
      editor.append(el("p", "kw-empty", "Pick a workflow, or make one."));
      return;
    }

    editor.append(
      field(
        "Name",
        input(draft.name, value => {
          draft.name = value;
        })
      )
    );

    const enabled = document.createElement("input");
    enabled.type = "checkbox";
    enabled.checked = draft.enabled !== false;
    enabled.addEventListener("change", () => {
      draft.enabled = enabled.checked;
    });
    const enabledWrap = el("label", "kw-check");
    enabledWrap.append(enabled, el("span", "", "Enabled"));
    editor.append(enabledWrap);

    // -- trigger ------------------------------------------------------------
    const triggerBox = el("section", "kw-box");
    triggerBox.append(el("h2", "kw-heading", "Trigger"));
    triggerBox.append(
      select_(
        [
          { id: "manual", label: "When I ask (command palette)" },
          { id: "startup", label: "When Kavacha starts" },
          { id: "space-switch", label: "When I enter a Space" },
          { id: "interval", label: "Every so often" },
        ],
        draft.trigger.type,
        value => {
          draft.trigger = { type: value };
          if (value === "interval") {
            draft.trigger.minutes = 60;
          }
          if (value === "space-switch") {
            draft.trigger.spaceId = spaces()[0]?.id || "";
          }
          renderEditor();
        }
      )
    );
    if (draft.trigger.type === "space-switch") {
      const list = spaces();
      triggerBox.append(
        field(
          "Space",
          list.length
            ? select_(
                list.map(space => ({ id: space.id, label: space.name })),
                draft.trigger.spaceId,
                value => {
                  draft.trigger.spaceId = value;
                }
              )
            : el("span", "kw-note", "No Spaces to choose from.")
        )
      );
    }
    if (draft.trigger.type === "interval") {
      triggerBox.append(
        field(
          "Minutes (15 or more)",
          input(
            draft.trigger.minutes,
            value => {
              draft.trigger.minutes = Number(value);
            },
            { type: "number" }
          )
        )
      );
      triggerBox.append(
        el(
          "p",
          "kw-note",
          "Timed workflows run while Kavacha is open. Nothing is caught up " +
            "after a restart — a scheduler that fires for the week you were " +
            "away is a different feature."
        )
      );
    }
    editor.append(triggerBox);

    // -- steps --------------------------------------------------------------
    const stepBox = el("section", "kw-box");
    stepBox.append(el("h2", "kw-heading", "Steps"));
    draft.actions.forEach((action, index) => {
      stepBox.append(renderStep(action, index));
    });

    const addRow = el("div", "kw-row-tools");
    const adder = select_(
      [
        { id: "", label: "Add a step…" },
        ...Object.entries(KavachaWorkflowActions).map(([id, spec]) => ({
          id,
          label: spec.label,
        })),
      ],
      "",
      value => {
        if (!value) {
          return;
        }
        draft.actions.push({ type: value });
        renderEditor();
      }
    );
    addRow.append(adder);
    stepBox.append(addRow);
    editor.append(stepBox);

    // -- controls -----------------------------------------------------------
    const tools = el("div", "kw-tools");
    const save = el("button", "kw-primary", "Save");
    save.addEventListener("click", saveDraft);
    const run = el("button", "kw-secondary", "Run now");
    run.addEventListener("click", runDraft);
    const remove = el("button", "kw-secondary kw-danger", "Delete");
    remove.addEventListener("click", deleteDraft);
    tools.append(save, run, remove);
    editor.append(tools);

    editor.append(el("p", "kw-status", ""));
  }

  function renderStep(action, index) {
    const spec = KavachaWorkflowActions[action.type];
    const box = el("div", "kw-step");
    const head = el("div", "kw-step-head");
    head.append(el("span", "kw-step-index", String(index + 1)));
    head.append(el("span", "kw-step-name", spec?.label || action.type));

    const up = el("button", "kw-link", "↑");
    up.title = "Move up";
    up.addEventListener("click", () => move(index, -1));
    const down = el("button", "kw-link", "↓");
    down.title = "Move down";
    down.addEventListener("click", () => move(index, 1));
    const drop = el("button", "kw-link kw-danger", "Remove");
    drop.addEventListener("click", () => {
      draft.actions.splice(index, 1);
      if (!draft.actions.length) {
        draft.actions.push({ type: "open-url", url: "https://" });
      }
      renderEditor();
    });
    head.append(up, down, drop);
    box.append(head);

    for (const spec_field of spec?.fields || []) {
      let control;
      if (spec_field.type === "space") {
        const list = spaces();
        control = list.length
          ? select_(
              list.map(space => ({ id: space.id, label: space.name })),
              action[spec_field.name],
              value => {
                action[spec_field.name] = value;
              }
            )
          : el("span", "kw-note", "No Spaces to choose from.");
      } else if (spec_field.type === "command") {
        control = select_(
          commands().map(command => ({
            id: command.id,
            label: command.label,
          })),
          action[spec_field.name],
          value => {
            action[spec_field.name] = value;
          }
        );
      } else {
        control = input(
          action[spec_field.name],
          value => {
            action[spec_field.name] =
              spec_field.type === "number" ? Number(value) : value;
          },
          { type: spec_field.type === "number" ? "number" : "text" }
        );
      }
      box.append(field(spec_field.label, control));
    }
    return box;
  }

  function move(index, by) {
    const to = index + by;
    if (to < 0 || to >= draft.actions.length) {
      return;
    }
    const [action] = draft.actions.splice(index, 1);
    draft.actions.splice(to, 0, action);
    renderEditor();
  }

  function status(message) {
    const node = document.querySelector(".kw-status");
    if (node) {
      node.textContent = message;
    }
  }

  async function saveDraft() {
    const result = await KavachaWorkflows.save(structuredClone(draft));
    if (!result.saved) {
      // The engine's own reasons, verbatim: the page does not get to
      // paraphrase why a workflow was refused.
      status("Not saved — " + result.errors.join("; "));
      return;
    }
    selectedId = draft.id;
    renderList();
    status("Saved.");
  }

  async function runDraft() {
    const result = await KavachaWorkflows.save(structuredClone(draft));
    if (!result.saved) {
      status("Not run — " + result.errors.join("; "));
      return;
    }
    const report = await KavachaWorkflows.run(draft.id);
    if (!report.ran) {
      status("Did not run: " + report.reason);
      return;
    }
    status(
      "Ran " +
        report.steps +
        (report.steps === 1 ? " step" : " steps") +
        (report.skipped.length ? " · skipped: " + report.skipped.join("; ") : "")
    );
  }

  async function deleteDraft() {
    const chromeWindow = Services.wm.getMostRecentWindow("navigator:browser");
    const ok = Services.prompt.confirm(
      chromeWindow,
      "Kavacha",
      'Delete the workflow "' + draft.name + '"?'
    );
    if (!ok) {
      return;
    }
    await KavachaWorkflows.remove(draft.id);
    selectedId = null;
    draft = null;
    renderList();
    renderEditor();
  }

  async function init() {
    $("kw-new").addEventListener("click", async () => {
      draft = KavachaWorkflows.blank();
      const result = await KavachaWorkflows.save(structuredClone(draft));
      if (result.saved) {
        selectedId = draft.id;
      }
      renderList();
      renderEditor();
    });

    await KavachaWorkflows.init();
    renderList();
    renderEditor();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
