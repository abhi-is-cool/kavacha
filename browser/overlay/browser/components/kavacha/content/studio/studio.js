/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Customization Studio front-end (about:studio; ADR 0009). Runs in the parent
// process with the system principal (IS_SECURE_CHROME_UI — see
// KavachaAboutStudio.sys.mjs), so it drives the chrome singletons directly
// through their public APIs. The engines apply live to every browser window,
// so every control here updates the real chrome immediately — no separate
// "preview". A pref doorbell keeps the Studio in sync when the same settings
// are changed elsewhere (palette commands, hand-edited JSON).

/* global ChromeUtils, Services */

const { KavachaLayoutEngine } = ChromeUtils.importESModule(
  "resource:///modules/KavachaLayoutEngine.sys.mjs"
);
const { KavachaThemeEngine } = ChromeUtils.importESModule(
  "resource:///modules/KavachaThemeEngine.sys.mjs"
);
const { KavachaUserCSS } = ChromeUtils.importESModule(
  "resource:///modules/KavachaUserCSS.sys.mjs"
);

const kLayoutRevisionPref = "kavacha.layout.revision";
const kThemePref = "kavacha.theme.active";
const kUserCSSRevisionPref = "kavacha.usercss.revision";
const kUserCSSSafeModePref = "kavacha.usercss.safe-mode";

// ---- Small helpers --------------------------------------------------------

function qs(sel) {
  return document.querySelector(sel);
}

/** Reflect a segmented radiogroup's selection. */
function selectSegment(group, value) {
  for (const btn of group.querySelectorAll("[role='radio']")) {
    btn.setAttribute("aria-checked", String(btn.dataset.value === value));
  }
}

function onSegment(group, handler) {
  group.addEventListener("click", event => {
    const btn = event.target.closest("[role='radio']");
    if (btn && group.contains(btn)) {
      handler(btn.dataset.value);
    }
  });
}

// ---- Tabs -----------------------------------------------------------------

function initTabs() {
  const tabs = [...document.querySelectorAll(".studio-tab")];
  for (const tab of tabs) {
    tab.addEventListener("click", () => {
      for (const t of tabs) {
        const selected = t === tab;
        t.setAttribute("aria-selected", String(selected));
        document.getElementById(t.getAttribute("aria-controls")).hidden =
          !selected;
      }
    });
  }
}

// ---- Layout panel ---------------------------------------------------------

const Layout = {
  // Guards the pref observer against echoing our own writes back into a render.
  _writing: false,

  async render() {
    const layout = await KavachaLayoutEngine.getLayout();

    selectSegment(qs("[data-control='tabStyle']"), layout.tabStyle);
    selectSegment(qs("[data-control='sidebar']"), layout.sidebar);
    selectSegment(qs("[data-control='density']"), layout.density);

    const width = qs("[data-control='sidebarWidth']");
    width.value = layout.sidebarWidth;
    qs("#sidebar-width-value").textContent = `${layout.sidebarWidth}px`;

    qs("[data-control='toolbarVisible']").checked = layout.toolbar.visible;

    // The sidebar card is meaningless in horizontal mode. Arc is a vertical
    // layout with a different presentation (patch 0058), so it keeps the
    // sidebar controls -- testing for "not horizontal" rather than for
    // "vertical" is what stops a future fourth style from silently losing
    // them too.
    qs(".studio-card[data-requires='vertical']").hidden =
      layout.tabStyle === "horizontal";
  },

  async commit(patch) {
    this._writing = true;
    try {
      await KavachaLayoutEngine.setLayout(patch);
    } catch (e) {
      console.error("Studio: setLayout failed", e);
    } finally {
      this._writing = false;
    }
    await this.render();
  },

  init() {
    onSegment(qs("[data-control='tabStyle']"), v =>
      this.commit({ tabStyle: v })
    );
    onSegment(qs("[data-control='sidebar']"), v => this.commit({ sidebar: v }));
    onSegment(qs("[data-control='density']"), v => this.commit({ density: v }));

    const width = qs("[data-control='sidebarWidth']");
    // 'input' updates the readout live; commit on 'change' so we don't rewrite
    // the layout file on every pixel of the drag.
    width.addEventListener("input", () => {
      qs("#sidebar-width-value").textContent = `${width.value}px`;
    });
    width.addEventListener("change", () =>
      this.commit({ sidebarWidth: Number(width.value) })
    );

    qs("[data-control='toolbarVisible']").addEventListener("change", event =>
      this.commit({ toolbar: { visible: event.target.checked } })
    );

    qs("#reset-layout").addEventListener("click", () =>
      this.commit({
        sidebar: "left",
        sidebarWidth: 250,
        tabStyle: "horizontal",
        density: "compact",
        toolbar: { position: "top", visible: true },
      })
    );
  },
};

// ---- Themes panel ---------------------------------------------------------

const Themes = {
  async render() {
    const grid = qs("#theme-grid");
    const ids = await KavachaThemeEngine.listThemes();
    const active = KavachaThemeEngine.activeThemeId;
    grid.textContent = "";

    for (const id of ids) {
      let theme;
      try {
        theme = await KavachaThemeEngine.resolveTheme(id);
      } catch (e) {
        console.error(`Studio: could not load theme "${id}"`, e);
        continue;
      }
      grid.append(this._card(theme, id === active));
    }
  },

  _card(theme, isActive) {
    const c = theme.colors || {};
    const card = document.createElement("button");
    card.className = "theme-card";
    card.type = "button";
    card.setAttribute("role", "radio");
    card.setAttribute("aria-checked", String(isActive));
    card.dataset.themeId = theme.id;

    const swatch = document.createElement("div");
    swatch.className = "theme-swatch";
    for (const token of ["surface", "tabActiveBackground", "accent", "textPrimary"]) {
      const band = document.createElement("span");
      band.style.background = c[token] || "transparent";
      swatch.append(band);
    }

    const meta = document.createElement("div");
    meta.className = "theme-meta";
    const name = document.createElement("span");
    name.className = "theme-name";
    name.textContent = theme.name || theme.id;
    const badge = document.createElement("span");
    badge.className = "theme-active-badge";
    badge.textContent = "Active";
    meta.append(name, badge);

    card.append(swatch, meta);
    card.addEventListener("click", () => this._select(theme.id));
    return card;
  },

  async _select(id) {
    try {
      await KavachaThemeEngine.setActiveTheme(id);
    } catch (e) {
      console.error("Studio: setActiveTheme failed", e);
    }
    await this.render();
  },
};

// ---- Advanced panel (live CSS editor + history + safe mode) ---------------

function formatTs(ts) {
  try {
    return new Date(ts).toLocaleString();
  } catch (e) {
    return "";
  }
}

function firstLine(css) {
  const line = String(css || "").split("\n").find(l => l.trim()) || "";
  // The history now records the empty baseline, so the oldest entry on a
  // profile that started with no custom CSS has nothing to preview. Say so —
  // an unlabelled Restore button reads as a rendering bug.
  if (!line) {
    return "(no custom CSS)";
  }
  return line.length > 60 ? line.slice(0, 57) + "…" : line;
}

// ---- CSS syntax highlighting (patch 0056) ---------------------------------
//
// A textarea cannot render styled text, so the standard shape applies: the
// textarea stays the real editing surface — caret, selection, undo, IME,
// spellcheck, screen-reader support all remain native — and is made
// transparent; a <pre> behind it in the same box, with byte-identical
// typography, paints the colours and is kept scroll-synced. Nothing about
// editing is reimplemented, so nothing about editing can regress.
//
// Tokens are built with createElement/createTextNode, never innerHTML.
// about:studio runs with the system principal (KavachaAboutStudio), so
// assigning the user's CSS text to innerHTML would be script execution with
// chrome privileges — the same rule KavachaMarkdown follows for notes.

// Ordered scanner. Every alternative is anchored and consumes at least one
// character, which is what guarantees the loop terminates on any input.
const CSS_TOKENS = [
  { type: "comment", re: /^\/\*[\s\S]*?(?:\*\/|$)/ },
  { type: "string", re: /^"(?:[^"\\\n]|\\.)*"?/ },
  { type: "string", re: /^'(?:[^'\\\n]|\\.)*'?/ },
  { type: "atrule", re: /^@[-\w]+/ },
  { type: "number", re: /^-?\d*\.?\d+[a-z%]*/i },
  { type: "color", re: /^#[0-9a-f]{3,8}\b/i },
  { type: "punct", re: /^[{}();:,]/ },
  { type: "important", re: /^!\s*important\b/i },
  { type: "word", re: /^[-\w]+/ },
  { type: "other", re: /^[\s\S]/ },
];

// Cheap guard: a very large sheet would otherwise build one span per token on
// every keystroke. Past this the editor keeps working, unhighlighted — the
// editing surface is the textarea, so plain text is a degradation, not a
// failure.
const kMaxHighlightChars = 60000;

function highlightCss(text, container) {
  container.textContent = "";
  if (text.length > kMaxHighlightChars) {
    container.appendChild(document.createTextNode(text));
    return;
  }
  let rest = text;
  // Tracks whether a `word` is a property (before the colon of a declaration)
  // or part of a selector, which is the only context CSS colouring really
  // needs and the difference a reader actually looks for.
  let inBlock = false;
  let afterColon = false;
  const flushable = [];

  while (rest) {
    let matched = null;
    for (const rule of CSS_TOKENS) {
      const m = rule.re.exec(rest);
      if (m && m[0]) {
        matched = { type: rule.type, text: m[0] };
        break;
      }
    }
    // CSS_TOKENS ends with a catch-all single character, so `matched` is
    // always set; the guard is here so a future edit to that table cannot
    // turn this into an infinite loop.
    if (!matched) {
      matched = { type: "other", text: rest[0] };
    }
    let cls = matched.type;
    if (matched.type === "punct") {
      if (matched.text === "{") {
        inBlock = true;
        afterColon = false;
      } else if (matched.text === "}") {
        inBlock = false;
        afterColon = false;
      } else if (matched.text === ":") {
        afterColon = inBlock;
      } else if (matched.text === ";") {
        afterColon = false;
      }
    } else if (matched.type === "word") {
      cls = inBlock ? (afterColon ? "value" : "property") : "selector";
    }
    flushable.push({ cls, text: matched.text });
    rest = rest.slice(matched.text.length);
  }

  // Merge adjacent same-class runs before building nodes: a selector like
  // `#a .b > .c` is a dozen tokens and one visual run.
  let current = null;
  for (const token of flushable) {
    if (current && current.cls === token.cls) {
      current.text += token.text;
      continue;
    }
    if (current) {
      container.appendChild(cssTokenNode(current));
    }
    current = { ...token };
  }
  if (current) {
    container.appendChild(cssTokenNode(current));
  }
}

function cssTokenNode(token) {
  if (token.cls === "other") {
    return document.createTextNode(token.text);
  }
  const span = document.createElement("span");
  span.className = `tok-${token.cls}`;
  span.textContent = token.text;
  return span;
}

const Advanced = {
  // True while the editor holds edits the user hasn't Applied. A pref-doorbell
  // re-render must not clobber those, so render() leaves the textarea alone
  // when dirty.
  _dirty: false,

  async render() {
    if (!this._dirty) {
      qs("#css-editor").value = await KavachaUserCSS.getCSS();
    }
    this._paint();
    qs("[data-control='safeMode']").checked = KavachaUserCSS.isSafeMode;
    await this._renderHistory();
    this._status();
  },

  _status(msg) {
    const el = qs("#css-status");
    if (msg) {
      el.textContent = msg;
      return;
    }
    if (KavachaUserCSS.isSafeMode) {
      el.textContent = "Safe mode on — custom CSS is disabled.";
    } else {
      el.textContent = this._dirty ? "Unsaved changes." : "";
    }
  },

  async _renderHistory() {
    const list = qs("#css-history");
    const history = await KavachaUserCSS.listHistory();
    list.textContent = "";
    if (!history.length) {
      const empty = document.createElement("li");
      empty.className = "css-history-empty";
      empty.textContent = "No previous versions yet.";
      list.append(empty);
      return;
    }
    history.forEach((entry, i) => {
      const li = document.createElement("li");
      li.className = "css-history-item";

      const meta = document.createElement("div");
      meta.className = "css-history-meta";
      const when = document.createElement("span");
      when.className = "css-history-when";
      when.textContent = formatTs(entry.ts);
      const preview = document.createElement("span");
      preview.className = "css-history-preview";
      preview.textContent = firstLine(entry.css);
      meta.append(when, preview);

      const restore = document.createElement("button");
      restore.className = "studio-button ghost small";
      restore.textContent = "Restore";
      restore.addEventListener("click", () => this._revert(i));

      li.append(meta, restore);
      list.append(li);
    });
  },

  async _apply() {
    try {
      await KavachaUserCSS.setCSS(qs("#css-editor").value);
    } catch (e) {
      console.error("Studio: setCSS failed", e);
      this._status("Could not apply — see the Browser Console.");
      return;
    }
    this._dirty = false;
    await this._renderHistory();
    this._status("Applied.");
  },

  async _revert(index) {
    await KavachaUserCSS.revertTo(index);
    this._dirty = false;
    await this.render();
    this._status("Restored.");
  },

  // Repaint the highlight layer and keep it aligned with the textarea.
  _paint() {
    const editor = qs("#css-editor");
    const code = qs("#css-highlight-code");
    if (!editor || !code) {
      return;
    }
    // A trailing newline collapses in a <pre> but not in a textarea, so the
    // last line would drift by one line height without this.
    highlightCss(editor.value + "\n", code);
    this._syncScroll();
  },

  _syncScroll() {
    const editor = qs("#css-editor");
    const pre = qs("#css-highlight");
    if (editor && pre) {
      pre.scrollTop = editor.scrollTop;
      pre.scrollLeft = editor.scrollLeft;
    }
  },

  init() {
    const editor = qs("#css-editor");
    editor.addEventListener("input", () => {
      this._dirty = true;
      this._paint();
      this._status();
    });
    editor.addEventListener("scroll", () => this._syncScroll());
    qs("#apply-css").addEventListener("click", () => this._apply());
    qs("#revert-css").addEventListener("click", async () => {
      this._dirty = false;
      editor.value = await KavachaUserCSS.getCSS();
      this._paint();
      this._status("Reverted to last applied.");
    });
    qs("[data-control='safeMode']").addEventListener("change", event =>
      KavachaUserCSS.setSafeMode(event.target.checked)
    );
  },
};

// ---- Pref doorbell: stay in sync with changes made elsewhere --------------

const kWatchedPrefs = [
  kLayoutRevisionPref,
  kThemePref,
  kUserCSSRevisionPref,
  kUserCSSSafeModePref,
];

const prefObserver = {
  observe(subject, topic, data) {
    if (data === kLayoutRevisionPref && !Layout._writing) {
      Layout.render();
    } else if (data === kThemePref) {
      Themes.render();
    } else if (data === kUserCSSRevisionPref || data === kUserCSSSafeModePref) {
      Advanced.render();
    }
  },
};

document.addEventListener("DOMContentLoaded", async () => {
  initTabs();
  Layout.init();
  Advanced.init();
  await Layout.render();
  await Themes.render();
  await Advanced.render();

  for (const pref of kWatchedPrefs) {
    Services.prefs.addObserver(pref, prefObserver);
  }
  window.addEventListener(
    "unload",
    () => {
      for (const pref of kWatchedPrefs) {
        Services.prefs.removeObserver(pref, prefObserver);
      }
    },
    { once: true }
  );
});
