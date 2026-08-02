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
| **B4** | **Windows native build** | Two compounding problems: this box is macOS (`darwin`, aarch64), and the build is *upstream-broken at the pinned Zen commit* `425f0ae1` — the libwebrtc rule is missing when linking `xul.dll`. Even with a Windows machine, the pin needs Zen's win-cross recipe adopted first. | A Windows build host **and** a decision to adopt Zen's win-cross recipe (or move the pin to a commit where it works). |
| **B5** | **Crash rate < 0.5 %** (v1.0 gate) | Kavacha ships no telemetry *by design*. There is no mechanism that could measure this, and inventing one is a product decision, not an implementation detail. | You decide the methodology: opt-in crash reporting, a manual soak-test protocol, or drop the numeric gate as unmeasurable-by-design. |

## 3. Decisions only you can make

| # | Item | The question | My recommendation |
|---|---|---|---|
| **B6** | **Keep patch 0034 at all?** | It has now consumed two debugging sessions and **five** rebuilds across four mechanisms (quit-granted, quit-requested, restore-observer, restore-promise). Each fixed the measured failure and exposed the next. The data loss is fixed, but the feature still cannot be switched on: enabling it leaves the window with no browser element on the next start, cause undiagnosed. It is the only Kavacha behaviour that discards user data. | **Genuinely unsure - the one I'd most want your call on.** The data-loss fix is worth keeping regardless. But four mechanisms in, the evidence is that Zen's tab/session layer resists closing tabs around startup and shutdown alike, and I can no longer promise a cheap finish. Deleting 0034 and keeping only the fixes is defensible and I'd do it cleanly; so is one more focused diagnosis session against the existing binary. |
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
