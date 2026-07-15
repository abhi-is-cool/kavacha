# ADR 0006 — Workspace state-history substrate (snapshots for branching & time-travel)

**Status:** Accepted · 2026-07-15

## Context

Phase 2.5 needs a shared foundation for research branching and time-travel:
point-in-time snapshots of a workspace that can later be listed, compared,
restored, or forked. The north star's knowledge graph will read the same
history. Open questions the roadmap deferred to this ADR: snapshot shape and
granularity, capture triggers, retention, and the sync stance.

## Decision

**Granularity: per-space, not per-window.** A snapshot captures ONE
workspace: its identity metadata, its tabs, and its note. Spaces are the
project unit everywhere else in Kavacha (ADR 0003, notes, archiving,
attribution); windows are incidental. Multi-window later composes from
per-space snapshots rather than complicating the unit now.

**Tab state: lean on SessionStore, never reimplement.** Each tab is captured
as `SessionStore.getTabState(tab)` — the same serialized state (history
entries, scroll, form data) that session restore and the tab-unloader
already round-trip, so restore fidelity is exactly what patch-0013/restart
testing verified. Essentials are excluded (cross-space by design); pinned
tabs are included with a flag. The active tab index is recorded.

**Notes are embedded, not referenced.** The space's note text is copied into
the snapshot. Notes are small, and a snapshot that says what you were
*thinking* at the time is the whole point for time-travel and the future
graph; a reference would silently rot as the live note changes.

**Storage: its own SQLite file, `kavacha-snapshots.sqlite`, append-only.**
Not JSONFile (snapshots are bulky and append-only wants indexed pruning; the
notes-file pattern doesn't scale to this). Not a places.sqlite side table
(this is not Places data; keep the profile stores separable). Schema:
`snapshots(id, space_uuid, created_at, reason, structure_hash, payload)` with
an index on `(space_uuid, created_at)`. `payload` is versioned JSON
(`version: 1`) so the shape can evolve.

**Triggers: meaningful moments, not a clock.**
- *space switch* — the outgoing space is snapshotted at the `changeWorkspace`
  chokepoint (the same chokepoint patches 0003/0005 hook); switching away is
  the natural "end of a work moment",
- *archive* — the state you may want back weeks later,
- *quit* — the active space at shutdown,
- *manual* — a "Snapshot this Space" command (registry, patch 0018).
No interval timer in v1: switch+quit already bound staleness by session, and
a timer mostly generates dedup-discarded noise.

**Dedup: structural hash.** A snapshot is skipped when its *structure* —
ordered tab URLs + active index + note text — matches the space's previous
snapshot. Full tab-state strings are deliberately excluded from the hash
(they carry volatile fields like lastAccessed and would defeat dedup);
scroll-position-only changes are not worth a history entry.

**Retention: bounded by count and age.** Per space, keep at most
`kavacha.history.max-snapshots-per-space` (default 100) and delete
snapshots older than `kavacha.history.retention-days` (default 90); GC runs
after each write. Deleting a space leaves its snapshots until age/GC — they
are exactly what "restore a deleted line of thought" needs (branching will
resurrect from them).

**Sync: local-only until Phase 5.** Same stance as notes: snapshots never
ride Mozilla-account sync; they are candidates for Kavacha E2E sync later.
Encrypted-at-rest arrives with the Phase 5 profile-encryption story rather
than a bespoke scheme here.

## Consequences

- Branching = "create a space from snapshot N with a parent pointer";
  time-travel = "list snapshots, restore/replay one" — both are pure
  consumers of `snapshot()/listSnapshots()/getSnapshot()`.
- Restore fidelity is capped by SessionStore's (verified: scroll/form/nav
  history survive; collaborative SPAs reload-and-resync by design).
- A snapshot is a copy, not a live view: tabs opened after the snapshot are
  not in it. That is the feature, not a bug.
- Payload rows can reach hundreds of KB for tab-heavy spaces; count+age GC
  bounds the file, and `structure_hash` dedup keeps switch-thrash cheap.
