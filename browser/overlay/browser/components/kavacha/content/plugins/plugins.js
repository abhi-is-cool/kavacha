/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// about:plugins front-end (ADR 0011). Runs in the parent process with the
// system principal (IS_SECURE_CHROME_UI — see KavachaAboutPlugins.sys.mjs), so
// it drives the plugin manager and permission model through their public APIs.
// It lists sideloaded plugins, shows each declared permission with a plain
// explanation, and offers grant/enable, disable, revoke, and uninstall. The
// page never reads plugin code or private data — only manifests and grants.

/* global ChromeUtils */

const { KavachaPluginManager } = ChromeUtils.importESModule(
  "resource:///modules/KavachaPluginManager.sys.mjs"
);
const { KavachaPluginPermissions } = ChromeUtils.importESModule(
  "resource:///modules/KavachaPluginPermissions.sys.mjs"
);

const PERM_DESCRIPTIONS = KavachaPluginPermissions.descriptions;

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") {
      node.className = v;
    } else if (k === "text") {
      node.textContent = v;
    } else if (k.startsWith("data-") || k === "role") {
      node.setAttribute(k, v);
    } else {
      node[k] = v;
    }
  }
  for (const child of children) {
    if (child) {
      node.append(child);
    }
  }
  return node;
}

function metaLine(plugin) {
  const m = plugin.manifest;
  const bits = [plugin.id, m.version ? `v${m.version}` : null, m.author].filter(
    Boolean
  );
  return bits.join("  ·  ");
}

// Build the permissions block. Each requested permission gets a checkbox that
// is pre-checked when the user has already granted it; the descriptions come
// from the permission model so the enum's limits are spelled out in plain
// language.
function permsBlock(plugin) {
  const requested = Array.isArray(plugin.manifest.permissions)
    ? plugin.manifest.permissions
    : [];
  const wrap = el("div", { class: "plugin-perms" }, el("h3", { text: "Permissions" }));

  if (!requested.length) {
    wrap.append(
      el("p", {
        class: "plugin-none-requested",
        text: "This plugin requests no permissions.",
      })
    );
    return { wrap, checkboxes: [] };
  }

  const checkboxes = [];
  for (const perm of requested) {
    const box = el("input", { type: "checkbox" });
    box.checked = plugin.grants.includes(perm);
    box.dataset.perm = perm;
    checkboxes.push(box);
    wrap.append(
      el(
        "label",
        { class: "perm-row" },
        box,
        el(
          "span",
          { class: "perm-copy" },
          el("span", { class: "perm-name", text: perm }),
          el("span", {
            class: "perm-desc",
            text: PERM_DESCRIPTIONS[perm] || "",
          })
        )
      )
    );
  }
  return { wrap, checkboxes };
}

function card(plugin) {
  const node = el("article", { class: "plugin-card", "data-id": plugin.id });

  // Enable/disable toggle.
  const toggle = el("input", { type: "checkbox" });
  toggle.checked = plugin.enabled;
  const toggleLabel = el(
    "label",
    { class: "plugin-toggle", "data-enabled": String(plugin.enabled) },
    toggle,
    el("span", { text: plugin.enabled ? "Enabled" : "Disabled" })
  );

  node.append(
    el(
      "div",
      { class: "plugin-card-head" },
      el(
        "div",
        {},
        el("h2", { class: "plugin-name", text: plugin.manifest.name || plugin.id }),
        el("p", { class: "plugin-meta", text: metaLine(plugin) })
      ),
      toggleLabel
    )
  );

  if (plugin.manifest.description) {
    node.append(el("p", { class: "plugin-desc", text: plugin.manifest.description }));
  }

  const { wrap, checkboxes } = permsBlock(plugin);
  node.append(wrap);

  const status = el("span", { class: "plugin-status", role: "status" });
  const grantBtn = el("button", {
    class: "pl-button primary",
    text: "Grant & enable",
  });
  const revokeBtn = el("button", { class: "pl-button danger", text: "Revoke" });
  const uninstallBtn = el("button", {
    class: "pl-button ghost",
    text: "Uninstall",
  });

  grantBtn.addEventListener("click", async () => {
    const perms = checkboxes.filter(b => b.checked).map(b => b.dataset.perm);
    status.textContent = "Saving…";
    try {
      await KavachaPluginManager.grant(plugin.id, perms);
    } catch (e) {
      console.error("about:plugins: grant failed", e);
      status.textContent = "Could not grant — see the Browser Console.";
      return;
    }
    await render();
  });

  revokeBtn.addEventListener("click", async () => {
    status.textContent = "Revoking…";
    try {
      await KavachaPluginPermissions.revoke(plugin.id);
      await KavachaPluginManager.disable(plugin.id);
    } catch (e) {
      console.error("about:plugins: revoke failed", e);
      status.textContent = "Could not revoke — see the Browser Console.";
      return;
    }
    await render();
  });

  uninstallBtn.addEventListener("click", async () => {
    status.textContent = "Removing…";
    try {
      await KavachaPluginManager.uninstall(plugin.id);
    } catch (e) {
      console.error("about:plugins: uninstall failed", e);
      status.textContent = "Could not uninstall — see the Browser Console.";
      return;
    }
    await render();
  });

  toggle.addEventListener("change", async () => {
    try {
      if (toggle.checked) {
        await KavachaPluginManager.enable(plugin.id);
      } else {
        await KavachaPluginManager.disable(plugin.id);
      }
    } catch (e) {
      console.error("about:plugins: toggle failed", e);
    }
    await render();
  });

  node.append(
    el("div", { class: "plugin-actions" }, grantBtn, revokeBtn, status, uninstallBtn)
  );
  return node;
}

async function render() {
  let plugins;
  try {
    plugins = await KavachaPluginManager.list();
  } catch (e) {
    console.error("about:plugins: list failed", e);
    plugins = [];
  }
  const list = document.getElementById("plugin-list");
  const empty = document.getElementById("plugins-empty");
  list.textContent = "";
  empty.hidden = plugins.length > 0;
  for (const plugin of plugins) {
    list.append(card(plugin));
  }
}

document.addEventListener("DOMContentLoaded", render);
