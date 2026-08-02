# Kavacha — Remaining Work

**Defects and features.** Everything below is open as of 2026-08-02, consolidated from
[ROADMAP.md](ROADMAP.md), [MASTER_PLAN.md](MASTER_PLAN.md),
[PLATFORM_PLAN.md](PLATFORM_PLAN.md) and [FEATURES.md](FEATURES.md), which stay as the
record of *why* and of what is already done. This file is the record of what is *left to
build*.

Two things are deliberately elsewhere:

- **[SHIPPING.md](SHIPPING.md)** — everything needed to ship: release blockers, gate
  readiness, the L4 verification the Developer Preview gate requires, pre-ship hardening,
  and what is blocked on you. Nothing in *this* file gates a release; nothing in that one
  is a feature.
- **[ECOSYSTEM.md](ECOSYSTEM.md)** — Mail, Drive, Identity, search aggregator, Enterprise.
  Separate products, gated on the browser shipping.

Where we are: **Phases 1–3 essentially complete** (44 patches). **Phase 4 is current.**
**Phases 5, 6 and 7 have not started.**

---

## 1. Open defects

| # | Defect | Next step |
|---|---|---|
| **D8** | **`KavachaUserCSS.listHistory()` returns 0 entries after `setCSS()`.** Two consecutive `setCSS()` calls left history empty, so `revertTo(index)` has nothing to revert to and the history arm of patch 0025 cannot be exercised at all. Live-apply and safe-mode both pass, so this is isolated to persistence. | Call `_pushHistory()` (`KavachaUserCSS.sys.mjs:126`) directly and see whether the file appears — that separates "never called from `setCSS()` (`:101`)" from "called and throwing against the profile path (`:77`)". |
| — | **Patch 0034 residue.** The feature now works (0039 + 0044 resolved D0/D6: 2 pinned + 4 unpinned → exactly the 2 pinned, zombies 0, `sessionstore.jsonlz4` at 3021 bytes). Two test arms remain, tracked in [SHIPPING.md](SHIPPING.md) §3. | The pref stays `false` by default regardless of outcome — this is the only Kavacha behaviour that discards user data on an ordinary action, and *working* is not the same as *wanted on*. |
| — | **`kavacha-midnight/colors.json` is a maintenance trap** (D5, resolved as not-a-bug). The package carries values that can *never* take effect, because the engine clears overrides for the default theme — editing them looks like it should change the UI and does nothing. | Either align the package to the baked values or annotate the file. |
| — | **`--kavacha-accent` falls back silently.** Midnight leaves it empty at runtime by design (no default accent is a deliberate 2026-07-13 decision; the welcome flow asks), but consumers get an empty string with no defined behaviour. | Add a documented fallback token, rather than an accent value in the Midnight package. |

Resolved and recorded so they are not re-opened: D0, D0b–D0e, D1, D2, D5, D6, D7, D9 —
see [VERIFICATION.md](VERIFICATION.md) §4 for the evidence on each.

---

## 2. Phase 4 — Privacy Center (current phase)

- [ ] **Central permission manager** — one dashboard over `nsIPermissionManager` for
      camera, microphone, location, notifications and clipboard, instead of per-site
      digging.
- [ ] **Brave Search default + bundled alternatives** (DuckDuckGo, Kagi, Startpage,
      Google), changeable in one click — a privacy default should never feel like
      lock-in. **On the v1.0 MVP checklist and probably the cheapest item left in this
      file.**
- [ ] Privacy Center follow-ups: per-site drilldown, blocked-today badge surfaces.
- [ ] Later tier: privacy score (FEATURES 3.2), per-site trust profiles (3.4).
- [ ] Session-scoped cookie deletion rules (FEATURES 3.3 — the banner-blocker base
      shipped; "delete after session" did not).

The fifth Phase 4 item, the **network-silence test**, is a release blocker rather than a
feature — [SHIPPING.md](SHIPPING.md) R3.

---

## 3. Phase 2 & 3 follow-ups — open items on shipped features

**Workspaces / identity**

- [ ] **Named container sharing across spaces** — with isolation *on*, let chosen spaces
      share one named container, so "these three spaces are all me at work" is expressible
      instead of today's all-or-nothing switch. Design in the migration gotcha: moving a
      space to a different container leaves its cookies behind and reads to the user as
      being logged out — warn before switching.
- [ ] **Per-workspace AI settings** — schema shipped; wiring waits on Phase 6.
- [ ] Edit an existing space's description (creation-time only today).
- [ ] Markdown rendering in workspace notes.
- [ ] Extension *recommendations* in workspace templates — deferred at 0006 until the
      marketplace could install them; the marketplace now exists.

**Research continuity**

- [ ] Branch tree in the space switcher; pinned-tab fidelity on branch; compare/discard
      flows between a branch and its parent.
- [ ] Step-through replay for time travel (restore-as-branch works; replay does not exist).

**Search & palette**

- [ ] Universal search: dedicated shortcut, workspace filter toggle.
- [ ] Grouped palette-result renderer — patch 0027 already stamps `group` labels at the
      data layer; nothing renders them as groups yet.
- [ ] Per-space context-menu entries for snapshot / branch / timeline.

**Customization**

- [ ] **Widget host** — blocks the reserved `widget` and `panel` marketplace component
      types, and blocks user-defined dashboards (layout engine + sidebar widgets).
- [ ] Light themes for the theme engine (surfaces-only today).
- [ ] Arc-style tabs — not yet a layout-engine capability, which is why the Studio defers
      it.
- [ ] CSS editor syntax highlighting.
- [ ] Active-tab emphasis and tab-strip spacing polish.
- [ ] First-launch coach-mark on the ⚙ button.

**Marketplace**

- [ ] Remote install + ratings + auto-update — lands with Phase 5 accounts, and must land
      *behind* plugin compartment isolation ([SHIPPING.md](SHIPPING.md) §4).

---

## 4. Phase 5 — Kavacha Account & Ownership (0 of 5)

- [ ] Auth service (Rust): signup, login, device management.
- [ ] E2E-encrypted sync: settings, themes, bookmarks, workspaces — replacing Zen's
      Mozilla-account sync. Server stores ciphertext only; keys never leave the device.
      Not synced initially: passwords, history.
- [ ] `kavacha-sync-server` self-hostable container (NAS/VPS/home server). "Owned by the
      user" has to include the server.
- [ ] One-click **"Export My Digital Life"** — bookmarks, history, settings, workspaces.
      *Cheap once the stores are schema'd, and independent of the account — a candidate to
      pull forward ahead of the rest of Phase 5.*
- [ ] Google Takeout import (one-time, local) — the honest substitute for bookmark/history
      migration, given the ruling below.

Shipping sync additionally requires an external crypto review
([SHIPPING.md](SHIPPING.md) R9).

Ruled out and recorded so it is not re-litigated: **Google account sync** (ROADMAP Phase 5
note, 2026-07-31) — unavailable (Chrome Sync's OAuth scopes are restricted to Google's own
client IDs; Google cut third-party Chromium builds off in 2021, which is why Brave and
Vivaldi each built their own) and contrary to the north star. What users actually want
from it is cookie-based SSO across `*.google.com`, which already works in any browser; the
only thing that broke it in Kavacha was per-space containers, fixed by patch 0038.

## 5. Phase 6 — AI & Personal Search (0 of 5)

- [ ] Ollama / llama.cpp runtime bridge — model discovery, download management, inference,
      resource limits. Every feature must degrade *invisibly* (not break) when no local
      model is installed.
- [ ] **Personal search index** — local index over history, bookmarks, saved pages, PDFs,
      downloads and workspace notes; SQLite FTS + metadata, optional local embeddings;
      local by default, encrypted-at-rest option, user-controlled deletion.
      **Build this first**: it is the retrieval backbone for every other AI feature, it
      plugs into universal search as one more source behind the existing
      `{title, detail, workspaceId, score, action}` contract, and it is what grows into the
      north-star knowledge graph.
- [ ] Page summarization → sidebar.
- [ ] Natural-language history search over the index.
- [ ] Tab assistant via the command palette — "group tabs by topic", "close duplicates",
      "save this research session".

Ground rule carried from [ai/README.md](../ai/README.md): the AI layer reads browser state
through a narrow, auditable API and never gets blanket profile access. Any optional cloud
model must be off by default, clearly labeled, and per-request opt-in.

## 6. Phase 7 — Browser, later (post-v1.0)

Browser features, no servers, no accounts. Full list in [ROADMAP.md](ROADMAP.md):

- Knowledge management — per-page notes, web clipper, personal knowledge graph. On the
  north-star path: the Phase 6 index is what grows into the graph.
- Automation framework — workflow builder (trigger → actions), tab manipulation, data
  extraction, scheduled workflows, reusable templates. The `automation` command domain is
  already reserved in the patch-0027 registry.
- Power-user tooling as marketplace bundles — capture, annotation, citations, REST client,
  JSON viewer, writing mode.
- Focus mode · offline mode · tab history tree · named saved tab sessions.

---

## Suggested order

1. **Brave Search default** (§2) — cheapest open MVP-checklist item, and it closes a
   visible gap between the marketing claim and the product.
2. **D8** (§1) — small, unblocked, and it is the only thing standing between patch 0025
   and a complete verification.
3. **Central permission manager** (§2) to close Phase 4 as a feature phase.
4. **Personal search index** (§5) — the highest-leverage thing left in the plan, and the
   one the north star actually depends on. Everything in Phase 6 waits on it, and
   universal search gets better the day it lands.
5. Phase 2/3 follow-ups (§3) opportunistically — most are small, and the grouped palette
   renderer plus the ⚙ coach-mark directly address the "every feature is hidden" problem
   that patches 0030–0032 set out to solve.

Before any of this, read [SHIPPING.md](SHIPPING.md) — if the goal is a release rather than
a bigger feature set, that file's order beats this one.
