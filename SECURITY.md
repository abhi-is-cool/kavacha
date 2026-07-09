# Kavacha Security Policy

## Reporting a vulnerability

Kavacha is pre-release software. Until a dedicated disclosure program launches
(planned before public release), report vulnerabilities privately:

- **Do not** open a public GitHub issue for security bugs.
- Use GitHub's private vulnerability reporting on this repository, or email the
  maintainers (address to be published with the Developer Preview).

You can expect an acknowledgment within 72 hours.

## Scope

- Kavacha experience-layer code in this repository (UI, customization, privacy layer,
  sync client/server, AI integrations).
- Kavacha build and release pipeline (supply-chain issues).

Vulnerabilities in Gecko/Firefox itself should be reported to
[Mozilla](https://www.mozilla.org/en-US/security/bug-bounty/); vulnerabilities in Zen
Browser to the [Zen project](https://github.com/zen-browser/desktop/security). Kavacha
ships upstream security fixes by tracking Zen/Firefox ESR point releases.

## Security requirements for releases

Every Kavacha release must satisfy (see Master Plan §Security Requirements):

- Signed binaries on all platforms (code signing + notarization on macOS)
- Reproducible builds
- Dependency audit (`cargo audit`, `npm audit`) with no known-critical findings
- No telemetry or third-party data flows enabled by default

## Cryptography ground rules (Sync, Phase 5)

- Keys are generated and held client-side only; the server stores ciphertext blobs.
- No custom primitives — audited libraries only (e.g. libsodium / RustCrypto).
- Any change to the encryption design requires an ADR and external review before merge.
