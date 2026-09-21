# Blocked on user action

Work that cannot be completed by an agent working in this repository, and why.
Everything here is a *hard* block — not "hard", not "slow", but genuinely
impossible without a decision, a credential, or a machine that only you have.

Companion to [VERIFICATION.md](VERIFICATION.md), which tracks what has and has
not been functionally verified. If an item is merely unverified, it belongs
there, not here.

Last reviewed: 2026-08-01.

---

## 1. Credentials — I must not, and will not, enter these

| # | Item | Why it is blocked | What unblocks it |
|---|---|---|---|
| **B1** | **Cross-Space sign-in carry-over test** (patch 0038) | The one untested arm of 0038 is "sign into google.com in Space A, confirm the session carries into Space B with `isolate-containers` off". It requires typing real account credentials into a browser. I do not enter passwords or account credentials into any field, regardless of instruction. | You run it manually — two Spaces, one real login, confirm the second Space is signed in. Or point it at a self-hosted login you don't mind scripting. |
| **B2** | **Signed builds** (Developer Preview release gate) | Requires an Apple Developer ID certificate and its private key, plus notarization credentials. These are secrets that must not be handled by an agent. | You provision the Developer ID cert + an app-specific password / notary API key, then wire them into the packaging step. |
| **B3** | **Any test needing a logged-in third-party account** | Same rule as B1: marketplace remote install, sync, and account-bound plugin flows all bottom out in a credential. | Manual runs, or dedicated throwaway test accounts whose credentials you inject via the environment, never through me. |

## 2. Hardware / environment I do not have

| # | Item | Why it is blocked | What unblocks it |
|---|---|---|---|
| **B4** | **Windows native build** | ~~Upstream-broken at the Zen pin (libwebrtc rule missing when linking `xul.dll`; Zen only cross-compiles Windows).~~ **Decided 2026-09-19 ([ADR 0020](decisions/0020-firefox-esr-direct-overlay.md)): the Zen base is retired; Kavacha overlays Firefox ESR directly, where native Windows is a tier-1 path.** No longer blocked on a decision — it is ordinary work: a native build on a Windows host (this box), then a CI leg. **M1 observed 2026-09-19** (VERIFICATION §4e: build, installer, launch, R3 pass on this host). **Regressed in CI 2026-09-20, diagnosed 2026-09-21:** three `windows-latest` runs failed at the *same* `no rule to make target … Unified_cpp_…gn0.obj` / `xul.dll` this row once attributed to Zen — on vanilla Firefox ESR 153, no Zen in the tree. **Cause: MAX_PATH.** make hands the link prerequisite to the Win32 API with its `..` hops un-normalised, and on the runner that string is 262 characters against a 260 limit; on the dev host, 256. Exactly one object in the tree exceeds it on the runner and it is the one that failed. Fixed by `KV_OBJDIR=D:/o` (64 characters of headroom). ADR 0020 reason 2 carries both amendments. macOS and Linux build green. **Awaiting a clean first-pass Windows run.** Stays listed until CI publishes a Windows asset (M4). | Nothing from you. Evidence: a green CI run. |
| **B5** | **Crash rate < 0.5 %** (v1.0 gate) | Kavacha ships no telemetry *by design*. There is no mechanism that could measure this, and inventing one is a product decision, not an implementation detail. | You decide the methodology: opt-in crash reporting, a manual soak-test protocol, or drop the numeric gate as unmeasurable-by-design. |

## 3. Decisions only you can make

| # | Item | The question | My recommendation |
|---|---|---|---|
| **B6** | ~~Keep patch 0034 at all?~~ **DECIDED 2026-08-01: finish it.** Superseded by defect **D6** in [VERIFICATION.md](VERIFICATION.md), which is ordinary outstanding work, not a blocker. | The cause is no longer unknown. `gBrowser.removeTab()` on a restored tab during startup never completes: the tab stays in `gBrowser.tabs` with `closing: true` and `linkedBrowser: null`, and anything enumerating tabs hits the null browser. Ruled out by measurement — not a race (fails 25s later), not selection (`selectedBrowserNull` false throughout), not workspaces (single workspace id). | No longer a decision for you. The earlier "Zen resists this" framing was wrong: four mechanisms had been tried without ever diagnosing the failure, and the diagnosis took one session once instrumentation went in through a pref instead of the dead trace channel. Remaining work is bounded: find what `_endRemoveTab` waits on, or close through SessionStore's API. |
| **B7** | **Subjective visual judgement** (patch 0033 contrast; ROADMAP D2 dashboard contrast) | Whether the darker theme tokens *look* right is not a probe-able property. WCAG AA ratios I can compute; "does this read as a premium dark UI" I cannot. | You look at it. I can compute and report every foreground/background contrast ratio against WCAG AA/AAA to narrow where to look — that part is not blocked. |
| **B8** | **Where CI runs** (network-silence test, reproducible builds) | The network-silence test — fresh idle profile ⇒ zero telemetry requests — is the load-bearing proof behind Kavacha's core privacy claim, and nothing currently tests it. Writing it is not blocked; *hosting* it is. GitHub Actions vs self-hosted changes the design, and a Firefox build needs a large runner. | Pick the CI host. I can then write the test and the workflow. |
| **B9** | **External review of the crypto design** (Phase 5, explicit blocker for shipping sync) | By definition requires a third party who is not me. An agent reviewing a design an agent helped shape is not an external review. | You engage a reviewer. I can prepare the threat model and design doc for them. |

## 4. Explicitly *not* blocked

Recorded so these do not get mistaken for blockers later. All of this is
ordinary outstanding work:

- **L4 verification of 0024 / 0025 / 0031** — needs probe-writing time, nothing else.
- **Plugin lifecycle test (0029)** — I can author a throwaway test plugin and
  sideload it; no credential is involved.
- **0035 content-edge-inset fix confirmation** — pure geometry, measurable.
- **D1 (⚙ panel 6px overhang)** — a `calc()` adjustment.
- **D5 (Midnight leaves `--kavacha-accent` empty)** — resolved as **intentional**,
  not a bug: `ui/defaults/kavacha-ux.js` records the 2026-07-13 decision that
  "picking a color is the user's" and ships no default accent, and the welcome
  flow asks. The real defect is that consumers fall back *silently*; the fix is
  a documented fallback token, not an accent value in the Midnight package.
- **Startup < 2 s** — measurable locally.
