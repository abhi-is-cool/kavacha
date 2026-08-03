# Kavacha — Shipping

**Everything that stands between the current build and a release.** Nothing here is a
feature; features and defects live in [REMAINING_WORK.md](REMAINING_WORK.md). If an item
would not stop a release, it does not belong in this file.

Split out 2026-08-02. Status as of that date.

**Where we stand: no gate is met, and one item is load-bearing for all three** — there
is no update service, so a shipped build cannot receive a security fix. Kavacha inherits
Firefox's CVE stream through the Zen pin at `425f0ae1`. Until R1 exists, shipping to
anyone — even a developer preview — means shipping something that cannot be patched.

---

## 1. Gate readiness at a glance

### Developer Preview

| Requirement | Status |
|---|---|
| MVP scope per [PLATFORM_PLAN.md](PLATFORM_PLAN.md): privacy foundation, workspaces, persistent sessions, command palette + registry, universal search, workspace notes, deep customization baseline | ✅ **Met.** All seven shipped (patches 0003–0032). |
| Workspace notes + archiving | ✅ Met (0008, 0009). |
| Command registry | ✅ Met (0027), L4 verified 2026-08-01. |
| Basic universal search | ⚠️ Shipped (0012); **functional L4 verification outstanding**. See §3. |
| Distinct default look | ✅ Met (horizontal tabs 0010, Midnight theme 0016, own welcome flow 0017). Subjective sign-off outstanding — B7. |
| **Signed builds** | ❌ **Not met** — R2, blocked on you. |
| **Update service live** | ❌ **Not met** — R1. *A build that cannot receive a security fix does not ship.* |
| L4 functional verification per [VERIFICATION.md](VERIFICATION.md) | ⚠️ **Partial** — 14 open arms, two of them significant. See §3. |

### Beta

| Requirement | Status |
|---|---|
| Everything above | ❌ |
| Phase 3 complete | ✅ Shipped, ⚠️ partially verified. |
| Phase 4 complete | ⚠️ **Features shipped, none build-verified.** Patches 0047–0050 (2026-08-02) closed every Phase 4 feature item; one follow-up (blocked-today badge surface) and R3 remain — see [REMAINING_WORK.md](REMAINING_WORK.md) §2. |
| Reproducible builds | ❌ Not started — R4. |
| Disclosure program live | ❌ Not started — R5. |

### v1.0 Public

| Requirement | Status |
|---|---|
| Everything above | ❌ |
| MVP checklist in [MASTER_PLAN.md](MASTER_PLAN.md) fully checked | ❌ **Currently unreadable** — every box is unchecked despite most having shipped, and one line is stale. See §6. |
| Windows / macOS / Linux builds | ⚠️ macOS ✅ (nightly DMG, CI run 29123975884, 2026-07-10) · Linux ✅ (2026-07-13) · **Windows ❌** — R8. |
| Startup < 2 s | ❌ Unmeasured — R6, not blocked. |
| Crash rate < 0.5 % | ❌ Unmeasurable as specified — R7, needs your decision. |

---

## 2. Release blockers

| # | Item | Gate | Detail |
|---|---|---|---|
| **R1** | **Update service `updates.kavacha.app`** | Dev Preview | The single most important item in the project. Needs: an AUS-compatible update endpoint serving XML per version/platform/channel; MAR signing keys; the signing step wired into CI; and a channel scheme (nightly/beta/release). `build/generate-branding.sh` already points `MOZ_APPUPDATE_HOST` at that host and CI already produces update MARs — but nothing serves them, so a shipped build checks a host that answers nothing. Patch 0002 deliberately stripped the upstream phone-home endpoints; this is the first-party replacement that has to exist before shipping to anyone. |
| **R2** | **Signed builds** | Dev Preview | Apple Developer ID certificate + private key, notarization credentials (app-specific password or notary API key), wired into the packaging step. **Blocked (B2)** — these are secrets an agent must not handle. |
| **R3** | **Network-silence test in CI** | Beta / Phase 4 | Fresh idle profile ⇒ **zero** requests to telemetry, advertising or experimentation endpoints. This is the load-bearing proof behind Kavacha's core privacy claim and *nothing currently tests it*. Writing the test is not blocked; **hosting it is** — GitHub Actions vs self-hosted changes the design and a Firefox build needs a large runner (B8). Name the host and I can write both the test and the workflow. |
| **R4** | **Reproducible builds** | Beta | Not started. |
| **R5** | **Security disclosure program live** | Beta | Not started. Policy + intake, see [SECURITY.md](../SECURITY.md). |
| **R6** | **Startup < 2 s** | v1.0 | Unmeasured. **Not blocked** — measurable locally today. |
| **R7** | **Crash rate < 0.5 %** | v1.0 | Kavacha ships no telemetry *by design*, so no mechanism could measure this, and inventing one is a product decision (B5). Pick one: opt-in crash reporting, a manual soak-test protocol, or drop the numeric gate as unmeasurable-by-design and replace it with something observable. |
| **R8** | **Windows native build** | v1.0 | Two compounding problems: this host is macOS, and the build is *upstream-broken at the pinned Zen commit* `425f0ae1` — the libwebrtc rule is missing when linking `xul.dll`, and Zen only cross-compiles Windows. Needs a Windows build host **and** a decision to adopt Zen's win-cross recipe or move the pin (B4). |
| **R9** | **External review of the crypto design** | Blocks sync | Explicit Phase 5 blocker. By definition requires a third party — an agent reviewing a design an agent shaped is not an external review (B9). I can prepare the threat model and design doc for whoever you engage. |

---

## 3. Functional verification required by the Dev Preview gate

The gate names L4 verification explicitly, so these are ship items, not nice-to-haves.
Evidence and per-patch test recipes in [VERIFICATION.md](VERIFICATION.md) §3. Run with:

```bash
./build/marionette-verify.py --launch
```

Then `./build/marionette-verify.py` in a second shell. It speaks length-prefixed JSON
over TCP port 2828, no third-party deps, and reports hard facts — loaded modules,
element existence, geometry — rather than screenshots. Extend it per feature rather than
eyeballing; the 0030 → 0036 saga is the argument for that.

**The two that matter most — where "renders" may have been mistaken for "works":**

- **0024 `about:studio`** — loads to `readyState: complete` with all three tabs and real,
  enabled controls. **It has never been shown that toggling a control changes the actual
  chrome.** A customization studio that renders but does not customize is the worst thing
  to discover after shipping.
- **0031 Appearance & Customization panes** — both render, 13 controls found, every label
  resolves to real text rather than a raw Fluent id. Same gap: operating a control has not
  been shown to change anything.

**Remaining open arms:**

| Patch | Unproven |
|---|---|
| 0012 | Universal search — named in the Dev Preview gate, no L4 probe has run. Note XUL panels do not appear in Marionette screenshots; verify with computed styles and rects, not pixels. |
| 0022 | `hiddenElements` / `componentSizes`; the four palette commands invoked individually |
| 0023 | Zero-flash on default Midnight; theme discovery from profile `kavacha-themes/` |
| 0025 | History + revert — **unblocked**; D8 fixed by patch 0045. Logic verified against the module; re-run through about:studio's Advanced tab on the next build. (The Advanced tab itself was driven on 2026-08-02 for patch 0056's highlighting, so the page and tab work; the history list was not exercised.) |
| 0026 | The **bright** custom-surface arm — the one that would actually prove the luminance branch flips `color-scheme` |
| 0028 | Bundle install ("Research Mode"). The reserved-type rejection arm is **retired**: patch 0057 supplied the host, so `widget`/`panel` are installable types now and applying each was verified — see [VERIFICATION.md](VERIFICATION.md) §4b |
| 0029 | **The entire plugin lifecycle.** Both modules import and `list()` returns `[]`, but nothing has been sideloaded: grant → enable → command reaches Cmd+K → disable → command leaves → revoke → uninstall. **Not blocked** — a throwaway test plugin needs no credentials. |
| 0030 | That a *marketplace-installed* command reaches the ⚙ panel (proven to reach the registry) |
| 0032 | "Sleep inactive tabs now"; unload-threshold write-back; template buttons; the **Restore an archived space…** picker; dashboard Settings link; welcome closing line |
| 0033 | Cold-start retry path finding the toolbar cluster |
| 0034 | Pref-OFF control arm on the current binary; no `beforeunload` prompt blocks quit. Pref stays `false` by default regardless. |
| 0035 | The vertical/sidebar arm — Zen's inset must be *kept* there (horizontal measured clean: gaps 0/0/0) |
| 0038 | Cross-Space sign-in carry-over — **blocked (B1)**, requires real credentials |
| 0004 | Tab-switch latency with heavy addon sets — flagged "keep an eye on" when shipped, never measured |
| 0047 | **That a fresh profile actually searches with Brave.** The config validates against Firefox's own schema, but no build has run a query. Pairs naturally with R3 — both are assertions about what a fresh profile talks to |
| 0048 | The permission dashboard against a live permission store: that clear-by-type empties it, and that the default selector changes what a site is asked |
| 0049 | **That cookies actually survive or vanish across a real quit.** The whole feature is a claim about what is on disk after the browser is gone; run it alongside 0034's quit/relaunch test |
| 0050 | The privacy-score fix buttons, and the per-site card against real stored permissions |

**Arms opened by patches 0051–0058** (2026-08-02). These eight were built and driven over
Marionette — 114 checks, 0 failures, [VERIFICATION.md](VERIFICATION.md) §4b — so what is
listed here is only what that pass could *not* settle, stated rather than implied:

| Patch | Unproven |
|---|---|
| 0051 | That a real container switch actually leaves the cookies behind — i.e. that the warning tells the truth. **Blocked (B1)**: it needs a real sign-in. The menu, the sharing counts and the confirm itself are verified |
| 0053 | The panel against a profile where the recommended extensions are actually installed (the "Already installed" state and "Run only these in this Space" writing the allowlist). No install was performed — that is the user's call, not the harness's |
| 0056 | How Arc and the light theme **look**. Tokens, attributes and `color-scheme` are asserted; appearance is subjective and needs a human. Also: the coach mark on a genuinely first-run profile, rather than one driven by resetting the pref |
| 0055 | The universal-search shortcut firing from a real key press. It ships **unbound** by design, so there is no default chord to press — verify after binding one |
| 0057 | A **sideloaded** (rather than bundled) widget component, which is the case the narrow `render(doc, win)` contract exists to contain. Pairs with 0029's plugin-lifecycle arm |

---

## 4. Pre-ship hardening

Not gate text, but things that would be bad to ship without.

- [ ] **Plugin compartment isolation** (ADR 0011). Granted plugins currently run in the
      parent module scope — trusted-on-grant sideloads. The SDK is the only *sanctioned*
      surface, not an enforced one. **Remote/marketplace plugin install must land behind
      this**, never before it. If plugins stay sideload-only for the first release, say so
      in the release notes rather than leaving users to infer it.
- [ ] **Dependency auditing** in CI — named as mandatory in [MASTER_PLAN.md](MASTER_PLAN.md)
      § Security Requirements, not yet implemented.
- [ ] **CI schema-conformance check** — nothing verifies that
      `sdk/kavacha-plugin.schema.json`, `customization/**/*.schema.json` and
      `ui/workspaces/*.schema.json` still match the modules that parse them. A schema and
      its consumer can drift silently, and these schemas become public API for plugin and
      theme authors the moment a release exists.
- [ ] **Subjective visual sign-off** on patch 0033's darker theme tokens (B7). WCAG ratios
      are computable and D2's dashboard failures are fixed and re-measured; "does this read
      as a premium dark UI" needs your eyes.
- [ ] Confirm `customization/layout-engine/default-layout.json` still matches shipped prefs.

---

## 5. Blocked on you

Full reasoning in [BLOCKED.md](BLOCKED.md).

| # | Item | What unblocks it |
|---|---|---|
| B1 | Cross-Space sign-in carry-over test (0038) | You run it manually — two Spaces, one real login — or point it at a scriptable self-hosted login. I do not enter credentials into any field. |
| B2 | Signed builds (R2) | You provision the Developer ID cert + notary credentials. |
| B3 | Any test needing a logged-in third-party account | Manual runs, or throwaway accounts whose credentials you inject via the environment. |
| B4 | Windows native build (R8) | A Windows host **and** a pin/recipe decision. |
| B5 | Crash-rate methodology (R7) | You pick: opt-in reporting, manual soak protocol, or drop the numeric gate. |
| B7 | Subjective visual judgement | You look at it. I can compute every foreground/background contrast ratio to narrow where. |
| B8 | Where CI runs (R3, R4) | You pick the host; I write the test and the workflow. |
| B9 | External crypto review (R9) | You engage a reviewer; I prepare the threat model. |

---

## 6. Reconcile before claiming any gate

- [ ] **The MVP checklist in [MASTER_PLAN.md](MASTER_PLAN.md) is entirely unchecked**
      despite most of it having shipped — so the v1.0 gate, defined as "that checklist
      fully checked", cannot currently be read at all. One line is also stale: it says
      **"Vertical tabs"** while Kavacha deliberately defaults to **horizontal** (patch
      0010, a differentiation decision) with vertical one toggle away. Fix the line, then
      check the boxes that are genuinely true.
- [ ] **Patch headers 0022–0034 say "authored without a local Zen checkout."** No longer
      true of this environment; they imply a retired risk to anyone auditing the series.
- [ ] **Patch 0036's header understates it** — it claims only that overflow placement was
      *captured*, while re-probing confirmed the fix post-change
      ([VERIFICATION.md](VERIFICATION.md) §3.1).
- [ ] **ADR coverage gap** — ADRs run 0001–0011 and stop at the SDK. The 0030–0032
      settings-consolidation decision and 0034's clear-unpinned-tabs behaviour change have
      no ADR. Both are user-visible decisions a reviewer would want the reasoning for.
- [ ] **[VERIFICATION.md](VERIFICATION.md) §5 is itself stale** — it says ROADMAP has zero
      references to patches 0033–0037; ROADMAP now carries a Post-build fix series entry
      covering exactly those.

---

## Order

1. **R1 update service.** Everything else is optional next to "can a user receive a
   security fix". It is also the longest-lead item — endpoint, keys, CI, channels.
2. **§3 verification of 0024 and 0031**, then 0029's plugin lifecycle. All unblocked, all
   cheap, and they answer whether shipped surfaces actually work before more is built on
   top of them.
3. **R3 network-silence test** as soon as you name a CI host — it is the proof behind the
   product's central claim, and a privacy browser that never tested its own silence is a
   liability at launch.
4. **R2 signed builds** once you have the certificate.
5. **§6 reconciliation**, so the gates can be read at all.
6. **R4 / R5** for Beta; **R6 / R7 / R8** for v1.0.
