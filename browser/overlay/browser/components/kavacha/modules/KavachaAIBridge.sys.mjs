// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Kavacha local AI runtime bridge (ADR 0013; ROADMAP Phase 6). The whole
// contact between Kavacha and a language model — and nothing more. It talks
// HTTP to a LOCAL model server (Ollama's API by default) at the user's
// endpoint and NEVER falls back to a remote service: page text and history
// reach the model only at kavacha.ai.endpoint, or nowhere.
//
// Stateless by design: it holds no browser state and stores no prompts or
// responses. A feature gathers its own context and passes it in, so what the
// model sees is always visible at the call site. Availability is probed on
// demand, never in the background (a fresh profile stays silent — R3).
//
// Surface: isAvailable(), listModels(), generate(), chat(). That is all.

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  setTimeout: "resource://gre/modules/Timer.sys.mjs",
  clearTimeout: "resource://gre/modules/Timer.sys.mjs",
});

const kEnabledPref = "kavacha.ai.enabled";
const kEndpointPref = "kavacha.ai.endpoint";
const kModelPref = "kavacha.ai.model";
const kDefaultEndpoint = "http://localhost:11434";
const kProbeTimeoutMs = 2500;

export const KavachaAIBridge = {
  get enabled() {
    return Services.prefs.getBoolPref(kEnabledPref, true);
  },

  get endpoint() {
    // Trim a trailing slash so "…:11434/" + "/api/tags" doesn't double up.
    const raw =
      Services.prefs.getStringPref(kEndpointPref, kDefaultEndpoint) ||
      kDefaultEndpoint;
    return raw.replace(/\/+$/, "");
  },

  get defaultModel() {
    return Services.prefs.getStringPref(kModelPref, "");
  },

  /**
   * Is a local runtime reachable, and what models does it have? Short-timeout,
   * on-demand only. Returns { available, models: [names], reason }. Never
   * throws — callers branch on `available` and show `reason` when false.
   */
  async isAvailable() {
    if (!this.enabled) {
      return { available: false, models: [], reason: "disabled" };
    }
    try {
      const models = await this.listModels();
      return {
        available: true,
        models,
        reason: models.length ? "" : "no-models",
      };
    } catch (e) {
      // A refused connection (no runtime) and a timeout both land here; the UI
      // says the same thing — "no local model found".
      return { available: false, models: [], reason: "unreachable" };
    }
  },

  /** Model names from GET /api/tags. Throws when the runtime is unreachable. */
  async listModels() {
    const data = await this._request("/api/tags", { method: "GET" });
    return (data?.models || [])
      .map(m => m?.name)
      .filter(name => typeof name === "string");
  },

  /**
   * One-shot completion. `prompt` is the user/content text; `system` an
   * optional instruction. Non-streaming (the whole response at once) — the
   * consumers here are short. Pass `signal` to abort (a closed panel cancels).
   * Returns the response string. Throws on runtime/model errors.
   */
  async generate(prompt, { model, system, signal } = {}) {
    const chosen = model || (await this._pickModel());
    const body = {
      model: chosen,
      prompt: String(prompt || ""),
      stream: false,
    };
    if (system) {
      body.system = String(system);
    }
    const data = await this._request("/api/generate", {
      method: "POST",
      body,
      signal,
    });
    return (data?.response || "").trim();
  },

  /**
   * Multi-turn chat. `messages` is [{role, content}]. Non-streaming. Returns
   * the assistant message string.
   */
  async chat(messages, { model, signal } = {}) {
    const chosen = model || (await this._pickModel());
    const data = await this._request("/api/chat", {
      method: "POST",
      body: {
        model: chosen,
        messages: Array.isArray(messages) ? messages : [],
        stream: false,
      },
      signal,
    });
    return (data?.message?.content || "").trim();
  },

  /* -------------------------------------------------------------- internal */

  // The configured model, or the runtime's first one if none is set.
  async _pickModel() {
    const configured = this.defaultModel;
    if (configured) {
      return configured;
    }
    const models = await this.listModels();
    if (!models.length) {
      throw new Error("KavachaAIBridge: no model available");
    }
    return models[0];
  },

  async _request(path, { method = "GET", body, signal } = {}) {
    if (!this.enabled) {
      throw new Error("KavachaAIBridge: disabled");
    }
    // Only ever the configured endpoint — no remote fallback (ADR 0013).
    const url = this.endpoint + path;
    const controller = signal ? null : new AbortController();
    const timer = controller
      ? lazy.setTimeout(() => controller.abort(), kProbeTimeoutMs)
      : null;
    try {
      const res = await fetch(url, {
        method,
        signal: signal || controller.signal,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        throw new Error(`KavachaAIBridge: ${method} ${path} -> ${res.status}`);
      }
      return await res.json();
    } finally {
      if (timer) {
        lazy.clearTimeout(timer);
      }
    }
  },
};
