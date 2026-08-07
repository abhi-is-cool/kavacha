# Network-silence test (SHIPPING.md R3)

Proves Kavacha's core privacy claim on a real build: **a fresh, idle profile
makes zero contact with telemetry, advertising, or experimentation
endpoints.** Patch 0002 strips the phone-home endpoints and the privacy prefs
disable the pings; this is the test that the *result* holds.

## Run it

```
python3 test/network-silence/network_silence_test.py --app /path/to/Kavacha.app [--idle 45]
```

Exit `0` = silent (no denylisted host), `1` = a denylisted host was contacted.

## How it works

Firefox's own `MOZ_LOG=nsHostResolver:5` records every DNS `getaddrinfo`, so
every destination — including HTTPS, by hostname, before TLS — is captured with
no proxy or MITM. The test launches a fresh profile, idles, then reads which
hosts were actually resolved and classifies them:

- **DENY** — telemetry / advertising / experimentation. Any hit fails the test.
  This is R3's exact scope.
- **NOTABLE** — update / push / codec endpoints (aus5 GMP ballot, Widevine,
  OpenH264, Web Push). These reveal the client to a third party on a fresh
  profile but are *not* R3 categories; printed for review, they do not fail.
- **ok** — security/functional (Remote Settings blocklists + the
  tracking-protection lists, content-signature verification). Deliberately
  allowed: without these, tracking protection has no lists to block with.

It does **not** assert zero total network — that would forbid the very
blocklists that make the browser private.

## Current result (2026-08-07, local build 152.0.6)

**PASSES R3** — 0 telemetry/ads/experimentation hosts. Notable phone-home a
fresh profile still makes, surfaced by this test and pending a product
decision (see below): `aus5.mozilla.org` (app + **GMP** media-plugin update
ballot), `update.googleapis.com` / `dl.google.com` (Widevine CDM),
`ciscobinary.openh264.org` (OpenH264), `push.services.mozilla.com` (Web Push).

The GMP ballot to `aus5.mozilla.org` is the sharpest: it fires on a fresh idle
profile *before any media plays*, sending version / buildID / OS / the
`kavacha` channel to Mozilla. Patch 0002 redirected the app-update host and
disabled system-addon updates but did not touch `media.gmp-manager.url`.
Whether to silence it (and Web Push, and Widevine) is a product call — it
trades a fresh-profile phone-home against codec/DRM/notification functionality
— so it is left for the maintainer rather than changed here.

## CI wiring — the one open decision (R3)

Writing the test was not blocked; **hosting it is.** A run needs a built
`Kavacha.app`, i.e. the same large runner the nightly build uses. Two shapes:

- **On the nightly runner** — add a step after `package` that runs this against
  the just-built app. Cheapest; couples the privacy gate to the build.
- **Self-hosted / scheduled** — a dedicated job that downloads the latest
  nightly and runs the test. Decouples it; needs a host.

Both are a few lines once the host is named. The test itself is host-agnostic
and already validated locally.
