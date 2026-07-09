# Kavacha AI Layer (Phase 6)

Local-first AI. Models run on the user's machine via **Ollama** or **llama.cpp**;
no page content, history, or prompts leave the device by default.

## Layout

- `local-models/` — runtime integration: model discovery, download management,
  inference bridge (Ollama HTTP API / llama.cpp bindings), resource limits.
- `integrations/` — browser features built on the runtime.

## Features

**Page summarization**
```
page HTML → readable-content extraction → local model → summary in sidebar
```

**History search** — natural-language recall over local history, bookmarks, and saved
pages ("find that article about batteries"), backed by a local embedding index.

**Tab assistant** — commands via the command palette: "group my tabs",
"close irrelevant tabs", "summarize research".

## Ground rules

1. Local by default. Any optional cloud model integration must be off by default,
   clearly labeled, and per-request opt-in.
2. The AI layer reads browser state through a narrow, auditable API — it never gets
   blanket access to profile data.
3. Degrade gracefully: every feature must be invisible (not broken) when no local
   model is installed.
