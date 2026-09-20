/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Component Marketplace front-end (about:marketplace; ADR 0010). Runs in the
// parent process with the system principal (IS_SECURE_CHROME_UI — see
// KavachaAboutMarketplace.sys.mjs), so it drives the KavachaMarketplace chrome
// singleton directly through its public API. Install/uninstall/apply all bump
// `kavacha.marketplace.revision`; a pref doorbell re-renders so the grid stays
// in sync when state changes here or elsewhere.

/* global ChromeUtils, Services */

const { KavachaMarketplace } = ChromeUtils.importESModule(
  "resource:///modules/KavachaMarketplace.sys.mjs"
);

const kRevisionPref = "kavacha.marketplace.revision";

// Section order + titles for the component types the marketplace ships. Types
// without a host engine yet (widget/panel) are intentionally absent.
const SECTIONS = [
  { type: "theme", title: "Themes" },
  { type: "layout", title: "Layouts" },
  { type: "bundle", title: "Bundles" },
];

function qs(sel) {
  return document.querySelector(sel);
}

async function render() {
  const body = qs("#market-body");

  let catalog;
  let installed;
  try {
    catalog = await KavachaMarketplace.getCatalog();
    installed = new Set(await KavachaMarketplace.getInstalled());
  } catch (e) {
    console.error("Marketplace: failed to load catalog", e);
    return;
  }

  body.textContent = "";
  for (const section of SECTIONS) {
    const items = catalog.filter(c => c.type === section.type);
    if (!items.length) {
      continue;
    }
    body.append(sectionHeader(section.title));
    const grid = document.createElement("div");
    grid.className = "market-grid";
    for (const component of items) {
      grid.append(card(component, installed.has(component.id)));
    }
    body.append(grid);
  }
}

function sectionHeader(title) {
  const h = document.createElement("h2");
  h.className = "market-section";
  h.textContent = title;
  return h;
}

function card(component, isInstalled) {
  const el = document.createElement("article");
  el.className = "market-card";
  el.dataset.componentId = component.id;

  const name = document.createElement("h3");
  name.className = "market-name";
  name.textContent = component.name;
  el.append(name);

  const desc = document.createElement("p");
  desc.className = "market-desc";
  desc.textContent = component.description || "";
  el.append(desc);

  const meta = document.createElement("p");
  meta.className = "market-meta";
  meta.textContent = `${component.author} · v${component.version}`;
  el.append(meta);

  if (isInstalled) {
    const badge = document.createElement("span");
    badge.className = "market-installed-badge";
    badge.textContent = "Installed";
    el.append(badge);
  }

  const actions = document.createElement("div");
  actions.className = "market-actions";

  const installBtn = document.createElement("button");
  installBtn.className = "market-button " + (isInstalled ? "ghost" : "primary");
  installBtn.textContent = isInstalled ? "Remove" : "Install";
  installBtn.addEventListener("click", () =>
    toggleInstall(component.id, isInstalled)
  );

  const applyBtn = document.createElement("button");
  applyBtn.className = "market-button primary";
  applyBtn.textContent = "Apply";
  applyBtn.disabled = !isInstalled;
  applyBtn.addEventListener("click", () => apply(component.id));

  actions.append(installBtn, applyBtn);
  el.append(actions);
  return el;
}

async function toggleInstall(id, isInstalled) {
  try {
    if (isInstalled) {
      await KavachaMarketplace.uninstall(id);
    } else {
      await KavachaMarketplace.install(id);
    }
  } catch (e) {
    console.error("Marketplace: install toggle failed", e);
  }
  // The revision bump re-renders via the observer; render here too so the grid
  // updates even if the observer coalesces or misses this process's own write.
  await render();
}

async function apply(id) {
  try {
    await KavachaMarketplace.apply(id);
  } catch (e) {
    console.error("Marketplace: apply failed", e);
  }
}

const prefObserver = {
  observe(subject, topic, data) {
    if (data === kRevisionPref) {
      render();
    }
  },
};

document.addEventListener("DOMContentLoaded", async () => {
  await render();
  Services.prefs.addObserver(kRevisionPref, prefObserver);
  window.addEventListener(
    "unload",
    () => Services.prefs.removeObserver(kRevisionPref, prefObserver),
    { once: true }
  );
});
