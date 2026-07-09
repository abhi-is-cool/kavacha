# ADR 0003 — Workspaces map 1:1 to Firefox containers

**Status:** Accepted · 2026-07-09

## Context

Workspaces must isolate cookies and site storage per environment (Personal, Work,
School, Research). Building custom storage partitioning would violate ADR 0001 (engine
work); Firefox already ships **containers** (contextual identities) with exactly this
isolation, exposed at the integration layer.

## Decision

Each workspace owns a dedicated Firefox container. The workspace manager
(`ui/workspaces/`) stores the mapping in the workspace record
(`containerId` in `workspace.schema.json`) and layers the rest — tab set, theme, search
provider, per-workspace extension enablement, settings overrides — on top as
experience-layer state. Switching workspaces swaps the visible tab set and active
container; tabs are hidden/suspended, never closed.

## Consequences

- Cookie/storage isolation is inherited from a battle-tested upstream feature; zero
  engine risk.
- Deleting a workspace must also delete its container's data (cookies, storage) after
  explicit confirmation — the container is invisible plumbing to the user.
- Container UI from stock Firefox/Zen is hidden/absorbed into the workspace UI to avoid
  presenting two overlapping concepts.
- Per-workspace extension enablement is experience-layer filtering (extensions API),
  not container-native — flagged as the riskiest part of the design to prototype first.
