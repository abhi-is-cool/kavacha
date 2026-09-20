/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Kavacha dashboard new tab. Everything is local: gradient of the day,
// clock, greeting, and a quote from the bundled list. No network requests.

"use strict";

const $ = id => document.getElementById(id);

// Local (YYYY-M-D) key so the day rolls over at local midnight, not UTC.
const now = new Date();
const dateKey = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;

// Small deterministic string hash for stable picks of the day.
function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

/* ---------------------------------------------------------------- storage
   The page is served from chrome:// and may run with the system principal,
   where DOM storage is unavailable — fall back to the pref service, which
   privileged pages can reach. Either way the name never leaves the profile. */
const store = (() => {
  try {
    const k = "__kavacha_probe__";
    localStorage.setItem(k, "1");
    localStorage.removeItem(k);
    return {
      get: k => localStorage.getItem(k),
      set: (k, v) => localStorage.setItem(k, v),
    };
  } catch (e) {
    // fall through
  }
  try {
    const prefs = Services.prefs;
    const P = "kavacha.newtab.";
    return {
      get: k => (prefs.prefHasUserValue(P + k) ? prefs.getStringPref(P + k) : null),
      set: (k, v) => prefs.setStringPref(P + k, String(v)),
    };
  } catch (e) {
    const mem = {};
    return { get: k => mem[k] ?? null, set: (k, v) => (mem[k] = v) };
  }
})();

/* ------------------------------------------------------------------- name */
function firstName() {
  const n = store.get("name") || "";
  return n.trim().split(/\s+/)[0] || "";
}

function showOnboarding() {
  $("dash").classList.add("hidden");
  $("onboarding").classList.remove("hidden");
  const input = $("name-input");
  input.value = store.get("name") || "";
  input.focus();
  input.select();
}

function startDashboard() {
  $("onboarding").classList.add("hidden");
  $("dash").classList.remove("hidden");
  tick();
  renderGreeting();
}

/* --------------------------------------------------------------- greeting */
function greetingWord(h) {
  if (h < 12) {
    return "Good Morning";
  }
  if (h < 18) {
    return "Good Afternoon";
  }
  return "Good Evening";
}

function renderGreeting() {
  const word = greetingWord(new Date().getHours());
  const name = firstName();
  const el = $("greeting");
  el.textContent = "";
  if (name) {
    el.append(`${word}, `);
    const span = document.createElement("span");
    span.className = "name";
    span.textContent = name;
    el.append(span, ".");
  } else {
    el.append(`${word}.`);
  }
}

/* ------------------------------------------------------------------ clock */
function tick() {
  const d = new Date();
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, "0");
  h = h % 12 || 12;
  $("clock").textContent = `${h}:${m}`;
}
setInterval(() => {
  tick();
  renderGreeting();
}, 15000);

/* ------------------------------------------------------------- background
   Gradient of the day: four-stop palettes tuned for white text. Bundled
   photos were considered and dropped — the Momentum catalog is not
   redistributable — so the look is generated, weighs nothing, and never
   needs the network. */
const PALETTES = [
  { g1: "#1c2733", g2: "#2b3a55", g3: "#16324f", g4: "#0d1420" }, // harbor night
  { g1: "#2d1b3d", g2: "#5c2a5e", g3: "#31214f", g4: "#140d20" }, // dusk violet
  { g1: "#0f2b26", g2: "#1e4d3a", g3: "#123a33", g4: "#081512" }, // deep forest
  { g1: "#33261b", g2: "#7a4a2b", g3: "#4f3121", g4: "#170f0a" }, // ember
  { g1: "#12303e", g2: "#20647a", g3: "#154254", g4: "#081820" }, // fjord
  { g1: "#251f38", g2: "#3d3a6e", g3: "#2a2452", g4: "#0f0c1c" }, // late aurora
  { g1: "#30222c", g2: "#6e3a52", g3: "#472a3e", g4: "#150d12" }, // plum dawn
  { g1: "#1f2a20", g2: "#3f5c35", g3: "#2b4029", g4: "#0d130d" }, // meadow dark
  { g1: "#222b36", g2: "#46607a", g3: "#2e4257", g4: "#0e141b" }, // north sea
  { g1: "#2e2617", g2: "#6b5a25", g3: "#463c1c", g4: "#14100a" }, // golden hour
  { g1: "#101f33", g2: "#274a7a", g3: "#1a3355", g4: "#070e18" }, // midnight blue
  { g1: "#292020", g2: "#5e4340", g3: "#3d2c2a", g4: "#120d0d" }, // clay
];

function setupBackground() {
  const p = PALETTES[hash(dateKey + "bg") % PALETTES.length];
  const bg = $("bg");
  for (const [k, v] of Object.entries(p)) {
    bg.style.setProperty(`--${k}`, v);
  }
  bg.classList.add("loaded");
  setupPhoto();
}

/* Wikimedia Commons featured picture of the day, from the bundled catalog
   (metadata only — 2,548 free-licensed images, credited bottom-right).
   The gradient paints first and stays as the offline fallback; the photo
   fades in over it once fetched. The single image GET to
   upload.wikimedia.org is the dashboard's only network access; set
   kavacha.newtab.network-backgrounds=false for gradients only. */
const kThumbWidth = 2560;

function thumbUrl(url) {
  // .../commons/X/XY/Name.ext -> .../commons/thumb/X/XY/Name.ext/2560px-Name.ext
  const m = url.match(
    /^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/(.\/..)\/(.+)$/
  );
  if (!m) {
    return url;
  }
  return `https://upload.wikimedia.org/wikipedia/commons/thumb/${m[1]}/${m[2]}/${kThumbWidth}px-${m[2]}`;
}

function networkBackgroundsEnabled() {
  try {
    return Services.prefs.getBoolPref(
      "kavacha.newtab.network-backgrounds",
      true
    );
  } catch (e) {
    return true;
  }
}

async function setupPhoto() {
  if (!networkBackgroundsEnabled() || !navigator.onLine) {
    return;
  }
  let catalog;
  try {
    const res = await fetch(
      "chrome://browser/content/kavacha/newtab/featured.json"
    );
    catalog = (await res.json()).backgrounds;
  } catch (e) {
    return;
  }
  if (!catalog?.length) {
    return;
  }

  // Deterministic photo of the day; remember it so it's stable all day.
  let saved = null;
  try {
    saved = JSON.parse(store.get("photo"));
  } catch (e) {
    // no saved pick
  }
  const index =
    saved && saved.date === dateKey && saved.index < catalog.length
      ? saved.index
      : hash(dateKey) % catalog.length;
  store.set("photo", JSON.stringify({ date: dateKey, index }));
  const photo = catalog[index];

  const show = url => {
    $("photo").style.backgroundImage = `url("${url}")`;
    $("photo").classList.add("loaded");
    $("scrim").classList.remove("hidden");
    const credit = $("credit");
    const by = photo.author ? ` — ${photo.author}` : "";
    credit.textContent = `${photo.title}${by} · ${photo.license} · Wikimedia Commons`;
    credit.href =
      photo.sourceUrl ||
      "https://commons.wikimedia.org/wiki/Commons:Featured_pictures";
    credit.classList.remove("hidden");
  };

  // Bounded thumbnail first; original if the thumb render fails (e.g. the
  // source is narrower than the requested width); gradient if both fail.
  const tryLoad = url =>
    new Promise(resolve => {
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = url;
    });

  const thumb = thumbUrl(photo.url);
  if (await tryLoad(thumb)) {
    show(thumb);
  } else if (thumb !== photo.url && (await tryLoad(photo.url))) {
    show(photo.url);
  }
}

/* ------------------------------------------------------------------ quote */
async function setupQuote() {
  try {
    const res = await fetch("chrome://browser/content/kavacha/newtab/quotes.json");
    const list = await res.json();
    const q = list[hash(dateKey + "q") % list.length];
    $("quote-text").textContent = `"${q.text}"`;
    $("quote-author").textContent = q.author || "Unknown";
  } catch (e) {
    // No quote, no problem.
  }
}

/* ------------------------------------------------------------------- boot */
$("name-form").addEventListener("submit", e => {
  e.preventDefault();
  const val = $("name-input").value.trim();
  if (!val) {
    return;
  }
  store.set("name", val);
  startDashboard();
});

$("name-skip").addEventListener("click", () => {
  store.set("name", " ");
  startDashboard();
});

$("greeting").addEventListener("click", showOnboarding);

setupBackground();
setupQuote();
if (store.get("name") !== null) {
  startDashboard();
} else {
  showOnboarding();
}

// Leave the cursor in the URL bar on fresh tabs so a new tab is ready to
// type into (user decision 2026-07-15; the earlier focus-steal predated the
// horizontal URL-row hardening that made the floating urlbar center
// correctly over the dashboard). Onboarding is the exception: typing a
// name needs the page's input.
setTimeout(() => {
  if (!document.getElementById("onboarding").classList.contains("hidden")) {
    window.focus();
    document.getElementById("name-input").focus();
  }
}, 60);
