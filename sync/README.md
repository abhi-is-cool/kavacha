# Kavacha Sync (Phase 5)

End-to-end encrypted sync behind the Kavacha Account. Rust on both sides.

## Trust model

The server is untrusted. Keys are generated client-side and never leave the device;
the server stores and relays **ciphertext blobs only**.

```
Client                                Server
──────                                ──────
generate key ─┐
              ├─ encrypt data ──────▶ store encrypted blob
              └─ (key never sent)     (no plaintext, ever)
```

## Scope

**Synced:** settings, themes, bookmarks, workspaces.
**Explicitly not synced initially:** passwords, history. (Revisit only after the sync
crypto design has shipped and been externally reviewed — see SECURITY.md.)

## Layout

- `client/` — Rust core integrated into the browser: key management, encryption,
  change tracking, conflict resolution (last-writer-wins per record to start).
- `server/` — Rust service: auth (Kavacha Account), device management, blob storage
  (PostgreSQL), session cache (Redis). Deploys on Fly.io/AWS initially.

## Hard rules

1. No custom cryptographic primitives — audited libraries only.
2. Any schema or crypto change requires an ADR before merge.
3. The server must function correctly while being fully unable to read user data —
   if a feature needs server-side plaintext, the feature is wrong.
