# ADR 0013 — Local AI runtime bridge

**Status:** Accepted · 2026-08-14

## Context

Phase 6's AI features — "summarize these papers", "where did I read about X",
"group my tabs" (FEATURES 5.1/5.3) — all need one thing first: a way to run a
language model. The north star is explicit that this stays *local-first* and
that a "built-in local AI understands the context behind your activity" without
that context leaving the device. Every AI feature depends on this bridge, and
none should exist without it. Open questions: what runtime, what endpoint
policy (the privacy crux), how features behave when no model is present, and
how narrow the surface is.

## Decision

**Runtime: a local HTTP model server, Ollama's API by default.** Ollama
(`http://localhost:11434`) is the common local-LLM runtime and its REST API
(`/api/tags`, `/api/generate`, `/api/chat`) is a stable, llama.cpp-compatible
shape many servers speak. Kavacha talks to it over HTTP rather than embedding a
runtime: no native code in the overlay, the user owns the models, and
llama.cpp/LM-Studio/any OpenAI-ish local server can be pointed at by changing
one pref. We ship no model and bundle no runtime.

**Endpoint policy — the privacy line. The endpoint is localhost by default and
whatever the user sets, and Kavacha NEVER falls back to a remote service.**
`kavacha.ai.endpoint` defaults to `http://localhost:11434`. If the user points
it at their own hosted model, that is their choice (FEATURES 5.1: "local models
+ user-controlled APIs"); Kavacha itself hosts nothing and defaults nowhere
remote. Page text and history only ever reach the model at that one endpoint —
the same guarantee the network-silence test (R3) enforces for everything else,
and the bridge is a natural thing to assert in it.

**Graceful degradation — availability is probed on demand, never in the
background.** No startup probe (that would be a network request on every
launch for a feature the user may not use, and R3 exists to keep fresh profiles
silent). `isAvailable()` does a short-timeout GET `/api/tags` only when a
feature is invoked or the AI settings are opened; it returns
`{available, models, reason}`. Every AI feature checks it first and, when the
runtime or a model is absent, hides or disables itself with a plain "no local
model found" rather than erroring. `kavacha.ai.enabled` (default true, unlocked)
is the master off switch; off means the bridge never touches the network.

**Surface — narrow and auditable.** `KavachaAIBridge` exposes exactly:
`isAvailable()`, `listModels()`, `generate(prompt, {model, system, signal})`,
and `chat(messages, {model, signal})`. That is the whole contact with the
model. It holds no browser state and reaches into nothing — a feature gathers
its own context (page text, index hits) and passes it in, so what the model
sees is always visible at the call site, not hidden in the bridge. Requests are
abortable (AbortSignal) so a closed panel cancels an in-flight generation.

**First consumer: "Summarize this page" (palette command).** A bridge with no
user is untestable and unproven, so this brick ships one vertical slice: a
palette command sends the current page's text to `generate()` with a summarize
system prompt and shows the result in an arrow panel. It also validates the
whole path (config → availability → generate → display) and is the template
the later consumers (ask-my-history over the personal index, tab assistant)
follow. AI settings live in the Privacy Center — a new "Local AI" group with
the enabled toggle, endpoint field, model picker, and live status — because a
feature that reads your pages belongs where privacy is managed.

**Local-only, and nothing is remembered by the bridge.** The bridge is
stateless; it stores no prompts or responses. AI "memory" (FEATURES 5.2) is a
later, explicitly-opt-in feature with its own store, not a side effect here.

## Consequences

- Patch 0079: `KavachaAIBridge.sys.mjs`, a Privacy Center "Local AI" group,
  a "Summarize this page" palette command + result panel, prefs, and l10n.
- Verifiable without a real model: a mock Ollama server proves the protocol
  (availability, models, generate) and the summarize round-trip; no-server
  proves graceful degradation; localhost-only is assertable via R3. Real model
  quality needs a real model and is out of scope for the engineering gate.
- The retrieval half (personal index, ADR 0012) plus this generation half are
  the two pieces the north star's "ask questions about what you kept" needs;
  wiring them into natural-language history search is the next brick.
