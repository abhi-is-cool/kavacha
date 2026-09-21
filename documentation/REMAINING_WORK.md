# Kavacha — Remaining Work

<!-- PHASE7-TEST-STATUS: TESTED aff0e3d (build 20260920090557) -->
> ## READ FIRST — the re-platform: M0–M3 and M5 done, M4 (CI) open
>
> **2026-09-19:** Kavacha is moving off Zen onto a direct **Firefox ESR 153** overlay built
> with `mach`, with native Windows first ([ADR 0020](decisions/0020-firefox-esr-direct-overlay.md),
> [ADR 0021](decisions/0021-kavacha-owned-workspaces.md)). The Zen-era series is in
> `browser/patches-zen/` as reference only. Work proceeds by milestone, each with a gate that
> must be *observed*, never inferred:
>
> | | Milestone | Gate | Status |
> |---|---|---|---|
> | M0 | ADRs + docs; series moved to `patches-zen/` | docs consistent | **done 2026-09-19** |
> | M1 | Firefox ESR 153 + Kavacha branding builds and launches on the Windows host | `kavacha.exe` launches; network-silence test passes | **done 2026-09-19** ([VERIFICATION](VERIFICATION.md) §4e; patches 0001/0002 came out of it) |
> | M2 | Substrate: startup, workspaces model, palette, welcome, theme tokens, Settings panes | `build/marionette-substrate.py` + `marionette-restart.py` | **done 2026-09-19** (43/43 + 7/7, [VERIFICATION](VERIFICATION.md) §4f; patches 0003/0004) |
> | M3 | Port every Zen-era feature into `browser/overlay/` | substrate probe 104/104 on a fresh profile | **done 2026-09-20** ([VERIFICATION](VERIFICATION.md) §4g) |
> | M4 | Three-platform CI incl. Windows installer + Marionette step | one green scheduled run, three assets | **open — the only milestone left** (workflow written and locally pre-flighted; see below) |
> | M5 | **Phase 7 on the Firefox ESR base** | `marionette-phase7.py` 78/78 on a fresh profile | **done 2026-09-20** ([VERIFICATION](VERIFICATION.md) §4h) |
>
> **M4 status, 2026-09-20.** `.github/workflows/ci.yml` has had a `windows-latest` leg,
> a `check-overlay.py` step and a Marionette step for some time; **none of it has ever
> run**, and that — not the writing — is the milestone. What has been done since is to
> remove the failures that were predictable from this host: the probe step now runs
> `build/marionette-ci.py` and asserts (it was `continue-on-error` and informational);
> `python3` is resolved per-runner because Git Bash on `windows-latest` does not reliably
> have it; the Package step's comment claimed a `mach build installer` call that does not
> exist. Five of `validate`'s six steps were run on this host and pass (JSON, schemas,
> shellcheck, `node --check` over 66 overlay scripts, `check-overlay.py`); the sixth
> applies the series to a sparse checkout of the pin, which `roundtrip` covers locally.
> **None of that closes M4.** The gate is one green scheduled run publishing three
> assets, which needs a push and a `workflow_dispatch` with `full_build: true`, and
> until that transcript exists the row above stays open and SHIPPING R8 stays open.
> Two questions only a real run answers: whether MozillaBuild drives non-interactively
> on a runner, and whether macOS and Linux still build on the Firefox base at all —
> neither has been built on it.
>
> **M4, 2026-09-21.** `validate` is green. **macOS and Linux build on the Firefox ESR
> base** — the first time either has, retiring a real risk the port carried. **Windows has
> failed twice**, both times at the same libwebrtc object needed by `xul.dll`: the same
> failure ADR 0020 attributed to Zen, reproduced on vanilla Firefox
> ([VERIFICATION](VERIFICATION.md) §4j; the ADR is amended). Instrumented diagnostics ruled
> out backend generation, disk, the ordering edge and "the object was never built" — the
> object is on disk six minutes before make says it has no rule for it. A one-shot retry on
> the Windows leg tests the one remaining mechanism. **If that retry is what makes Windows
> green it is a workaround, not a fix, and the run will carry a `::warning::` saying so.**
> Use the new `platform` dispatch input to iterate one platform instead of paying ~3 h of
> runner time per other platform; single-platform runs deliberately do not publish.
> **Run 3 (with the retry) also failed; the plan of record is [§0](#0-m4--windows-ci-plan-of-record-2026-09-21).**
>
> **Phase 7 on the Firefox ESR base passes 78/78** (2026-09-20); the marker above is
> flipped on that transcript, not on a hope. **This was not Phase 7's first run** — an
> earlier version of this block said it was, which was false. Phase 7 was first built and
> probed on the **Zen** base on 2026-08-27 (75/75, Apple Silicon, commit `dd49da9`), and
> that run found three defects no static gate caught: the knowledge-graph module created
> but never registered in `EXTRA_JS_MODULES` (dead in a packaged build), its entity parser
> dropping every one-character name, and focus mode leaving notifications permanently
> denied because its park pref shipped a default libpref pruned
> ([VERIFICATION](VERIFICATION.md) §4d). The re-platform branched from before those fixes,
> so two of the three were re-derived independently on the Firefox base rather than
> inherited (§4h). Everything in this file below now runs on the Firefox base; what a
> *release* still waits on is unchanged (R1 update service, R2 signing).
>
> **Known regression against the Zen build, accepted deliberately:** per-space bookmarks
> (ADR 0005 decision 1 relied on Zen's Places side table) are deferred; the schema default
> was already `isolation.bookmarks: false`. Feature to build later, not a blocker.
>
> Harness notes that still apply: `env -u CLAUDECODE -u CLAUDE_CODE` before any `mach`
> command (it hides errors under an agent); purge `startupCache` in the probe profile after
> every rebuild; `MOZ_DISABLE_CONTENT_SANDBOX=1` only for the macOS actor paths.
> The 0059 saga is still why: four settings panes passed every static gate, shipped, and
> had never once executed.

**Defects and features.** Everything below is open as of 2026-08-17, consolidated from
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

Where we are: **Phases 1–4, 6 and 7 feature-complete** through patch 0087 (2026-08-17)
— Phase 7's six patches were **built and L4-verified on the Zen base** (75/75,
2026-08-27), and since 2026-09-20 all of it is ported to the Firefox ESR base and
probe-verified, Phase 7 included (§6; [VERIFICATION](VERIFICATION.md) §4d/§4g/§4h),
**except** the open Phase 1 **update-service blocker** (see ROADMAP.md — no path to ship a
security fix until `updates.kavacha.app` exists) and the release gates in
[SHIPPING.md](SHIPPING.md). **Phase 5 (accounts and sync) has not started** and is now
the only unstarted phase — and the only unstarted Y1 one. Phase 7 landed early, out of
order, for the same reason Phase 6 did: none of it needs an account. It moves no gate;
what a release still waits on is unchanged. Phase 6 landed out of order because none
of it needs an account: patches 0078–0079 built the index and the model bridge, 0080–0081
built the surfaces (§5). Patches 0045–0050
(2026-08-02) closed the open defects and the Phase 4 feature list; 0051–0058 closed
fifteen of seventeen Phase 2/3 follow-ups (§3). A post-merge audit (2026-08-03) then found
and fixed a wave of defects in the 0022–0065 work — patches 0059 (repair) and 0066–0074,
all Marionette-verified; a handful of non-critical audit items remain open (see the
"Post-merge audit" section of ROADMAP.md). What is left in §3 is one item gated on Phase 5
(marketplace remote install) and one newly unblocked by Phase 6 (per-workspace AI
settings).

---

## 0. M4 — Windows CI: plan of record (2026-09-21)

**Where this stands.** `validate` is green. macOS and Linux build on the Firefox ESR base.
**Windows has now failed three times** at the same libwebrtc object needed by `xul.dll`
(runs 1–2 confirmed from logs; run 3 — the one with the one-shot retry — reported failed,
log not yet read). The second run's diagnostics ruled out backend generation, disk, the
ordering edge and "the object was never built": the object was on disk, with its rule, six
minutes before make declared it had no rule ([VERIFICATION](VERIFICATION.md) §4j). The
third run tested whether a second `mach build` pass would see it. It did not go green, so
the directory-cache mechanism is **not supported** — and the run's log is what says
whether it is refuted (retry failed identically) or the run failed some other way.

Everything below is ordered by evidence per runner-hour. Each Windows-only iteration costs
~40 min with a warm sccache; use `platform: windows` on dispatch, which also skips
publishing.

### 0.1 Diagnosed 2026-09-21 — MAX_PATH. Fix pushed, awaiting a run

The retry failed identically and its log refuted the directory-cache mechanism. The cause
is a path-length limit: make hands the `xul.dll` link prerequisite to the Win32 API with
its `..` hops un-normalised, and on the runner that string is **262** characters against a
260 limit (**256** on this host). Exactly one object in the tree exceeds it on the runner,
and it is the one that failed. See [VERIFICATION](VERIFICATION.md) §4j and
[ADR 0020](decisions/0020-firefox-esr-direct-overlay.md) reason 2, second amendment.

**Fixed** by `KV_OBJDIR=D:/o` on the Windows leg — 64 characters of headroom. The retry is
removed; `~/.mozbuild` staying on `C:` is no longer urgent but remains worth doing.

- [ ] **Run `platform: windows` and confirm a clean first pass.** ~40 min. This is the
      only open item in §0.
- [x] **Linux Marionette step: 3/3 probes, 192 checks, 0 failures** (2026-09-21) —
      substrate 104, Phase 7 78, restart 3 + 7, headless, fresh profiles. First L4
      evidence off the Windows dev host; recorded in [VERIFICATION](VERIFICATION.md) §4j.
- [ ] **Same for macOS** once that leg finishes.
- [ ] **Move `~/.mozbuild` off the runner's `C:`** (12.9 GB free 15.5) before a toolchain
      bump exhausts it silently mid-build. `MOZBUILD_STATE_PATH` exists for this.

### 0.2 If the clean run still fails

Then the arithmetic is right but something else is also wrong, and the ladder is
unchanged, cheapest first: `KV_NO_SCCACHE=1` (22 cache errors, 12 write errors were the
only other anomaly), then `-j4`, then `mozmake --version` against this host. If all three
fail, **file upstream** with §4j's evidence rather than starting a fifth hypothesis — a
`stat` that silently fails past MAX_PATH is a Firefox build-system bug whatever we do
about it locally.

### 0.3 Closing M4 — a decision for the owner, not the agent

The gate reads *one green scheduled run, three assets, no carried-forward warning*. If
Windows only ever goes green through a workaround (a retry, or a two-step build), that
satisfies the letter and not the spirit. **Decide now whether M4 and R8 close on a
workaround with a recorded `::warning::`, or only on a clean first-pass build.**
Recommendation: close on the workaround *if* §0.2 fails to remove it — a shipped
installer with an honest annotation beats an open milestone — and say so in SHIPPING R8.
Nothing flips until a full three-platform run is read.

### 0.4 After M4, in order

1. [ ] **Phase 7's unproven arms** (§4h "still not claimed"): capture, highlights and
       citation metadata need a real `http(s)` page. `marionette-ci.py` can start a
       `python -m http.server` on localhost and kill it like the browser. No
       infrastructure; a day.
2. [ ] **Per-space bookmarks** — the one deliberate regression from Zen (ADR 0021).
       Design against `PlacesUtils` with a Kavacha side table; the Zen table is gone.
3. [ ] **`patches-zen/` retention.** The plan said delete at M3 parity; M3 is done; it
       still holds 87 patches, now including the 2026-08-27 findings. Keep it as the
       historical record and amend the plan, or delete it. Recommendation: keep, amend.
4. [ ] **The nightly cron** (08:00 UTC, three platforms) is ~9 runner-hours a day cold.
       Confirm sccache actually persists across runs — it is showing errors — before the
       schedule spends freely.

### 0.5 Release gates that are the owner's

Unchanged, restated so CI does not hide them: **R2 signing** and **R1 update service** need
credentials and infrastructure the agent must not handle (BLOCKED B2/B3); **R9 crypto
review** needs a third party (B9). Once M4 closes these are the critical path.

### 0.6 Two rules from this week

**No hypothesis without the log.** Twice wrong on CI failures diagnosed from local
reproduction; each time the log settled it in one step. **No silent green.** A two-asset
release with no warning, `EXIT=0` on a failed build, a probe rewritten to agree with the
bug — all read as success. Every CI signal added from here fails loudly or annotates.

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
- [x] **Blocked-today badge surface** (patch 0077, 2026-08-07) — a third pinned row in the
      ⚙ menu, beside Settings and Appearance, reading "N trackers blocked today" and
      opening the Privacy Center. The count comes from the same PrivacyMetricsService
      ledger the pane reads, filled in async; private windows get no row. Chosen over a
      toolbar button to avoid touching the horizontal URL row and the customizable-widget
      layer. This closes the Phase 4 feature list (the network-silence test remains, but
      it is a release gate in SHIPPING.md, not a feature).

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
- [ ] **Per-workspace AI settings** — schema shipped. **No longer blocked** as of
      2026-08-15: the bridge (0079) and its consumers (0080–0081) exist, so there is
      now something to wire it to. What a Space could plausibly override: the model
      (a small fast one for a browsing Space, a larger one for research), whether the
      personal index captures at all, and whether AI features appear. The Space object
      already carries per-Space overrides for search engine, extensions and settings
      (patches 0003–0005), so this is that pattern again rather than new machinery.
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

## 5. Phase 6 — AI & Personal Search (5 of 5) — **feature-complete 2026-08-15**

- [x] **Ollama / llama.cpp runtime bridge** (ADR 0013, patch 0078→0079).
- [x] **Personal search index** (ADR 0012, patch 0078). Storage note: mozStorage ships no
      SQLite FTS, so it is LIKE + JS-built snippets, not FTS5 — which is precisely why
      natural-language search needed a retrieval layer rather than a prompt.
- [x] **Page summarization → sidebar** (ADR 0014, patch 0080).
- [x] **Natural-language history search over the index** (ADR 0014, patch 0080).
- [x] **Tab assistant via the command palette** (ADR 0014, patch 0081) — group by topic,
      close duplicates, save this research session. Only the first needs a model.

All four Phase 6 patches are L4-verified against the built browser
([VERIFICATION.md](VERIFICATION.md) §4c), with the model mocked: a mock proves the
protocol and the plumbing, never the quality of a real model's answers.

Follow-ups, none blocking:

- [ ] Optional local **embeddings** and an **encrypted-at-rest** index (ADR 0012's own
      follow-ups). Today's retrieval is lexical, so it finds "flood mapping" and not
      "inundation modelling" — embeddings are what close that gap.
- [ ] Index **bookmarks, workspace notes, downloads and PDFs**, not just visited page
      text. The Phase 6 spec named all of them; 0078 shipped page text.
- [ ] **Streaming responses.** The bridge is non-streaming, so a long summary shows a
      spinner rather than filling in.
- [ ] **AI memory** (FEATURES 5.2) — explicitly opt-in, with its own store. Deliberately
      not a side effect of the bridge, which is stateless.
- [ ] Check the **passive page indexer on a packaged build**. Actor child scripts do not
      load in the content process on a local macOS build (the content sandbox refuses
      symlinks pointing out of the app bundle; Zen's own actors fail identically), so
      0078's passive capture has only ever been exercised with the sandbox disabled. CI
      packages by copying, so this is expected to be fine — but "expected to be fine" is
      what §4c exists to stop us writing.

Ground rule carried from [ai/README.md](../ai/README.md): the AI layer reads browser state
through a narrow, auditable API and never gets blanket profile access. Any optional cloud
model must be off by default, clearly labeled, and per-request opt-in. Patch 0079's
endpoint guarantee holds for all of Phase 6 — page text, questions and tab titles reach
`kavacha.ai.endpoint` or nowhere.

## 6. Phase 7 — Browser, later (6 of 6, patches 0082–0087; **built + L4-verified 2026-08-27 on Zen; ported and re-verified 2026-09-20 on Firefox ESR**)

Browser features, no servers, no accounts. Built ahead of its post-v1.0 slot because
none of it needs an account; **it moves no release gate**. Per-item reasoning in
[ROADMAP.md](ROADMAP.md); decisions in ADRs 0015–0019.

- [x] **Knowledge capture** (0082, ADR 0015) — per-page notes, highlights with comments,
      web clips, a Knowledge sidebar, two new universal-search sources, JSON export.
      Also the honest half of offline mode: the saved copy renders from the store.
- [x] **Personal knowledge graph** (0083, ADR 0016) — `about:knowledge`. One stored
      fact (this page led to that one); everything else derived at query time.
- [x] **Focus mode** (0084, ADR 0018) — `about:focus`, sessions as periods.
- [x] **Automation** (0085, ADR 0017) — `about:workflows`; workflows are data, never
      code. Design artifacts in [automation/](../automation/README.md).
- [x] **Tab history tree + saved sessions** (0086, ADR 0019) — FEATURES 7.1 and 7.2.
- [x] **Power-user tooling** (0087) — citations and writing mode built; capture,
      annotation and the JSON viewer were already shipped (see below).

**Open, and stated rather than implied:**

- [x] **A completed build of 0082–0087** (2026-08-27, Apple Silicon, ~57 min). The
      first build caught nothing extra by itself; the *probe* did the finding. Note the
      series carries TWO distinct unsorted/omitted `EXTRA_JS_MODULES` bugs: the Workflows
      one fixed pre-commit, and the KnowledgeGraph one fixed now (0083) — the module was
      created but never registered, so it never packaged.
- [x] **Functional (L4) verification of 0082–0087** — `build/marionette-phase7.py`
      **75/75** on the fixed build, launched with `MOZ_DISABLE_CONTENT_SANDBOX=1` on a
      fresh profile. Three defects found and fixed (graph registration, entity-name
      guard, focus notification-restore pref pruning); re-probed clean. Exactly the 0059
      class — present, packaged, and (for the graph) dead — caught this time by a run.
      See [VERIFICATION.md](VERIFICATION.md) §4d.
- [ ] **REST client.** Deliberately not built (0087). A developer tool with its own
      request store, auth handling and history is a product inside a product, and the
      roadmap already calls this row a marketplace-bundle candidate. This is the item
      that row was about.
- [ ] **DOM-anchored highlights.** Today a highlight stores the quote and its comment;
      real annotation software re-renders the mark on the live page. That needs an
      anchoring scheme that survives page changes plus content-script rendering on
      every visit (ADR 0015 § Alternatives).
- [ ] **Full-fidelity offline archiving.** Clips keep the text, not the bytes. A real
      archive re-fetches subresources on the user's behalf at a time they did not
      choose — a different feature with a different threat model, worth doing
      deliberately or not at all.
- [ ] **Sync for notes and clips.** They are local-only, like everything else, until
      Phase 5 exists. Of all Kavacha's stores this is the one a user would most expect
      to follow them to another machine.

Corrections the work forced, recorded so they are not re-litigated:

- **Three of the six "power-user tooling" items did not need building.** Capture is
  Firefox's own Screenshots component (on in this build), annotation shipped inside
  0082, and the JSON viewer is enabled by default (`devtools.jsonview.enabled=true`,
  checked in the engine tree). The roadmap line had been reading as six missing
  features for months.
- **"Offline mode" and "web clipper" were one feature, not two.** Saving the readable
  text is what makes a page survive the site going away; the roadmap listed them
  separately and they landed in one patch.

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
2. ~~Personal search index~~ and ~~the rest of Phase 6~~ — **done** (0078–0081,
   2026-08-10 → 2026-08-15). The index is in, and universal search gained a "Page Text"
   source the day it landed.
3. ~~Blocked-today badge surface~~ — **done** (0077).
4. ~~Phase 2/3 follow-ups (§3)~~ — **done** (0051–0058).
5. ~~Build Phase 7, then functionally verify it (§6).~~ — **done** (2026-08-27):
   first completed build + `marionette-phase7.py` 75/75, three run-only defects fixed.
   The 0059 argument held: the knowledge graph was present, packaged, and dead until the
   probe drove it.
6. **Phase 5 — accounts and sync** (§4) is now the only unstarted phase, and it is
   the one with real prerequisites: a service to run, and an external crypto review
   before sync can ship (SHIPPING R9). The one piece that does **not** depend on the
   account — **"Export My Digital Life"** — is worth pulling forward on its own, and
   patch 0082 already exports the knowledge store, so the shape is proven.
7. **Per-workspace AI settings** (§3) — small, and newly unblocked by Phase 6.

Before any of this, read [SHIPPING.md](SHIPPING.md) — if the goal is a release rather than
a bigger feature set, that file's order beats this one.
