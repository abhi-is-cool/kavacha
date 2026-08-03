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

Where we are: **Phases 1–4 complete** (58 patches). **Phases 5, 6 and 7 have not
started.** Patches 0045–0050 (2026-08-02) closed the open defects and the Phase 4 feature
list; patches 0051–0058 (same day) closed fifteen of the seventeen Phase 2/3 follow-ups in
§3 and were build- and Marionette-verified. What is left in Phase 4 is one follow-up and
the release blockers in [SHIPPING.md](SHIPPING.md); what is left in §3 is two items gated
on Phases 5 and 6.

---

## 1. Open defects

| # | Defect | Next step |
|---|---|---|
| — | **Patch 0034 residue.** The feature now works (0039 + 0044 resolved D0/D6: 2 pinned + 4 unpinned → exactly the 2 pinned, zombies 0, `sessionstore.jsonlz4` at 3021 bytes). Two test arms remain, tracked in [SHIPPING.md](SHIPPING.md) §3. | The pref stays `false` by default regardless of outcome — this is the only Kavacha behaviour that discards user data on an ordinary action, and *working* is not the same as *wanted on*. |

Closed 2026-08-02:

- **D8 — `listHistory()` returned 0 entries after `setCSS()`.** Fixed by **patch 0045**.
  Root cause was not persistence: `setCSS()` read the text it was about to overwrite
  from the in-memory cache, and that cache is invalidated *asynchronously* by the
  revision observer `setCSS()` itself rings. Two overlapping saves therefore both read
  the pre-write file, both computed `previous === ""`, and neither pushed history —
  silently, since nothing threw. Marionette's `execute_script` does not await promises,
  which is exactly that shape, but so is the Studio's Apply racing a palette command.
  Fixed with a mutation queue plus a from-disk read of the previous text. The empty
  baseline is now snapshotted too, so a user whose *first* save breaks their chrome has
  something to revert to — the case the feature exists for. Reproduced and re-verified
  against the real module with Gecko's globals stubbed: 0 → 2 history entries in all
  three call shapes, and the revert arm 0025 could never reach now runs.
- **`kavacha-midnight/colors.json` maintenance trap (D5).** Annotated rather than
  aligned, because the values are already identical to the baked floor — the trap was
  never drift, it was that *nothing in the file said it was inert*. `colors.json` and
  `style.css` now carry a `$readBeforeEditing` note naming both real sources
  (patch 0016's baked floor and `BUILTIN_THEMES` in `KavachaThemeEngine.sys.mjs`) and
  recording that only surface/text/border are baked at all — 11 of the 18 tokens can
  never take effect for the default theme.
- **`--kavacha-accent` silent fallback.** Fixed by **patch 0046**: a documented
  `--kavacha-accent-fallback` token replaces the same `#8b7bd8` hardcoded separately in
  `studio.css`, `marketplace.css` and `plugins.css`. Rendering is unchanged; the absent
  accent is now a *defined* state. Note the token is necessarily declared twice — the
  three about: pages are content documents and the chrome token floor is not in their
  cascade, which is the underlying reason they hardcode fallbacks for every
  `--kavacha-*` token. Folding them into one shared content stylesheet needs jar +
  moz.build wiring that cannot be verified without a build; left as a follow-up.

Resolved and recorded so they are not re-opened: D0, D0b–D0e, D1, D2, D5, D6, D7, D8, D9
— see [VERIFICATION.md](VERIFICATION.md) §4 for the evidence on each.

---

## 2. Phase 4 — Privacy Center

Shipped 2026-08-02 as patches 0047–0050. One follow-up remains.

- [x] **Central permission manager** (0048) — one dashboard over `nsIPermissionManager`,
      with a global default per capability, per-site exceptions, per-type clear and
      clear-all. **Correction to the spec above: clipboard is not implementable as
      written.** Firefox 152 does not persist clipboard access as a site permission at
      all — there is no `clipboard` permission type and no
      `permissions.default.clipboard`; a page gets a one-time in-content Paste
      confirmation and nothing is stored, so there is no grant to list or revoke. The
      pane says so rather than rendering a control over state that does not exist. The
      other four shipped, plus `xr`, `local-network`, `persistent-storage`, `midi`,
      `speaker-selection` and `autoplay-media`.
- [x] **Brave Search default + bundled alternatives** (0047) — DuckDuckGo, Kagi,
      Startpage, Google, switchable from the Privacy Center. Upstream shipped neither
      Brave nor Kagi and gated Startpage behind an experiment, and `globalDefault` was
      `google` — so the Brave claim in `privacy/README.md` was, until now, untrue of any
      build. Zen's dump merger gained `add`/`patch` operations to express it; a patch
      rule that matches nothing now fails the build, because the failure mode is a
      release that quietly searches with Google.
- [x] Privacy Center follow-up: **per-site drilldown** (0050) — shipped as the same
      feature as trust profiles below.
- [x] Later tier: **privacy score** (FEATURES 3.2) and **per-site trust profiles** (3.4),
      both 0050. The score drives the Active Protections rows, the percentage and a
      fix-it list from one table, and adds two protections that were not previously
      surfaced anywhere: encrypted DNS and delete-cookies-on-close.
- [x] **Session-scoped cookie deletion rules** (0049, FEATURES 3.3) — per-site Keep /
      Session only / Block over Gecko's own `cookie` permission, plus a delete-on-close
      switch that correctly drives *both* required prefs and does not silently disable
      the user's unrelated history or cache clearing when switched off.
- [ ] **Blocked-today badge surface** — the count is in the pane; putting it on a chrome
      surface (toolbar or ⚙ menu) means touching `KavachaMenu` and chrome markup rather
      than the settings pane, so it was left out of 0050 rather than folded in.

The fifth Phase 4 item, the **network-silence test**, is a release blocker rather than a
feature — [SHIPPING.md](SHIPPING.md) R3. It is now also the natural place to prove that a
fresh profile really does search with Brave, which 0047 asserts but cannot demonstrate
without a build.

None of 0047–0050 is build-verified. Each was checked as far as is possible without one:
schema validation against Firefox's own `search-config-v2-schema.json`, `node --check`,
XML well-formedness of the pane fragment, and a cross-check that all 87 Fluent ids the
Privacy Center references resolve — the last because D0e shipped blank controls that
measured correctly in every geometry probe.

---

## 3. Phase 2 & 3 follow-ups — open items on shipped features

Shipped 2026-08-02 as patches 0051–0058. **Fifteen of the seventeen items are done and
build-verified**; the two that are left are blocked on other phases, not on effort.

**Workspaces / identity**

- [x] **Named container sharing across spaces** (0051) — the space-actions submenu now
      lists every container with how many *other* Spaces share it, radio-checks the
      current one instead of hiding it, and can create the first container. Zen's menu
      could never express sharing because it hid exactly the fact that matters. The
      migration gotcha landed as asked: a switch confirms first, naming the container
      being left, because containers are separate first-party cookie jars and a move
      reads as being signed out everywhere.
- [ ] **Per-workspace AI settings** — schema shipped; wiring waits on Phase 6. *Not
      attempted: there is nothing to wire it to until the Ollama bridge exists.*
- [x] Edit an existing space's description (0051). Two halves had to land together —
      patch 0014 stored the description and **nothing in the browser ever read it**, so
      it is now editable *and* shown, as the strip button's tooltip.
- [x] Markdown rendering in workspace notes (0052) — a Preview toggle over a new
      `KavachaMarkdown` renderer that builds DOM nodes and never parses HTML. That is a
      security requirement, not a style choice: the notes panel is chrome, so innerHTML
      on note text would be script execution with system privileges.
- [x] Extension *recommendations* in workspace templates (0053). **The premise was
      wrong**: the marketplace installs Kavacha components, not WebExtensions, so it was
      never going to be the installer and waiting for it would have deferred this
      forever. Recommendations route through the real installer — "Get extension" opens
      the AMO listing and Firefox's own permission prompt. Nothing installs automatically.

**Research continuity**

- [x] Branch tree in the space switcher; pinned-tab fidelity on branch; compare/discard
      flows (0054). Both halves were the same shape of bug: 0020 wrote `parentSpaceId`
      and nothing ever read it, and 0019 captured `pinned` while 0020 ignored it, so
      every branch came back with the user's pinned working set demoted.
- [x] Step-through replay for time travel (0054). The list answers "when were the
      moments"; replay answers "what was I looking at then". Stepping is read-only and
      restore stays non-destructive in both modes.

**Search & palette**

- [x] Universal search: dedicated shortcut and workspace filter toggle (0055). The
      shortcut ships **unbound** — every accel combination worth having is already taken,
      and silently stealing one from an upgrading user is worse than making them choose.
- [x] Grouped palette-result renderer (0055). The missing piece was not the header but
      the *ordering*: the results learner sorts by usage, which interleaves domains, and
      a header only means something if its group's rows are adjacent.
- [x] Per-space context-menu entries for snapshot / branch / timeline (0055) — all three
      were palette commands hard-wired to the *active* Space.

**Customization**

- [x] **Widget host** (0057) — the engine ADR 0010 said was missing, unblocking the
      reserved `widget` and `panel` component types and user-arrangeable dashboards. The
      contract is `{id, name, render(doc, win) -> Node}` and deliberately nothing more:
      `widget` is a type the *marketplace* can install, so the surface a third-party
      component gets must not be usable to reshape the browser.
- [x] Light themes for the theme engine (0056) — the light half of patch 0016's token
      bridge, gated on a mode the engine *derives* from surface luminance, so user and
      marketplace theme packages get light support without declaring anything.
- [x] Arc-style tabs (0058). Small once the framing was right: Arc is not a third
      orientation, it is vertical tabs with a different presentation.
- [x] CSS editor syntax highlighting (0056) — a transparent textarea over a scroll-synced
      highlight layer, so caret, selection, undo, IME and screen-reader support all stay
      native and nothing about editing can regress.
- [x] Active-tab emphasis and tab-strip spacing polish (0056) — emphasis on three
      independent channels so it survives any one being washed out.
- [x] First-launch coach-mark on the ⚙ button (0056) — once per profile, non-modal, and
      never in a private window.

**Marketplace**

- [ ] Remote install + ratings + auto-update — lands with Phase 5 accounts, and must land
      *behind* plugin compartment isolation ([SHIPPING.md](SHIPPING.md) §4). *Not
      attempted: it is gated on both an account service that does not exist and a
      security boundary that is a release blocker.*

Found and fixed in passing, by auditing rather than by looking: eleven palette and menu
entries pointed at `zen-icons/selectable/clock.svg` and `.../window.svg`, neither of which
exists in the icon set or the jar. They had rendered as missing images since patches
0013/0022/0023/0025/0028/0029.

**Verification.** 114 functional checks over Marionette against the built browser, 0
failures — see [VERIFICATION.md](VERIFICATION.md) §4b. The chain round-trips
byte-identically over 34 files.

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

1. **Finish functionally verifying 0047–0050.** This item paid for itself the first time
   anyone opened Settings: the Privacy Center pane had **never once executed**. A
   duplicate top-level `const lazy` (shared with upstream `search.js`, since every pane
   script lives in one global scope) meant `kavacha-privacy.js` failed to *parse*, which
   left `gKavachaPrivacyCenter` undefined, which made `init_all()` throw — killing every
   pane registered after it: the other three Kavacha panes, Firefox Labs, and Sync. Fixed
   in patch 0059, which also makes pane registration `typeof`-guarded so a broken pane
   can never again take down the ones after it.

   Note what that says about the earlier verification: every file was present, every id
   and FTL key reached the package, and the feature was dead. Static checks cannot catch
   this class; **loading the page once** can.

   Now settled live: all four panes register, expand and populate; the Privacy Center
   shows real ledger data (77 blocked all-time, per-type breakdown, estimated bandwidth);
   the search-engine dropdown lists 5 engines and is enabled. Still unsettled, and still
   only a real session can settle them: does a *fresh* profile actually search with Brave
   (this profile predates 0047 and is on Google — the default only applies to new
   profiles, so this is unproven either way); do cookies actually survive or vanish across
   a real quit; does the permission dashboard operate a live permission store (the
   permission and cookie-rule lists were empty here, which on this profile is plausible
   rather than proof).
2. **Personal search index** (§5) — the highest-leverage thing left in the plan, and the
   one the north star actually depends on. Everything in Phase 6 waits on it, and
   universal search gets better the day it lands.
3. **Blocked-today badge surface** (§2) — the last open Phase 4 follow-up, and small.
4. ~~Phase 2/3 follow-ups (§3)~~ — **done** (0051–0058). The two that remain are gated on
   Phases 5 and 6 and cannot be pulled forward.

Before any of this, read [SHIPPING.md](SHIPPING.md) — if the goal is a release rather than
a bigger feature set, that file's order beats this one.
