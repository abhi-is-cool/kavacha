# Kavacha Ecosystem — Year 2+ product runway

**Status: not started, and not to be started.**

Nothing in this document is work. It is the product runway that opens *only* after
Kavacha the browser has shipped and someone explicitly decides to expand beyond it.
Split out of [ROADMAP.md](ROADMAP.md), [MASTER_PLAN.md](MASTER_PLAN.md) and
[FEATURES.md](FEATURES.md) on 2026-08-02 so that "Kavacha Drive" stops reading as
though it sits on the same track as the browser work. It does not.

Read this as positioning and long-term intent. For what is actually to be built, see
[REMAINING_WORK.md](REMAINING_WORK.md); for what it takes to release any of it,
[SHIPPING.md](SHIPPING.md).

## Why it is gated

Three independent reasons, each sufficient on its own:

1. **Everything here depends on Phase 5.** Mail, Drive and Identity are all
   accounts + encrypted storage under one key model. Phase 5 (Kavacha Account,
   E2E-encrypted sync, self-hostable server) does not exist yet — not a line of it.
   Building any of these first means building a second, worse account system.
2. **Each is a separate product, not a browser feature.** They need servers, an
   abuse story, deliverability (Mail), storage cost, support, and a business model.
   None of that is a patch in `browser/patches/`.
3. **The browser is not shipped.** The Developer Preview gate is not met — there is
   not yet an update service that could deliver a security fix to a user
   ([SHIPPING.md](SHIPPING.md) R1). Starting a mail service before that is finished
   is the failure mode this document exists to prevent.

## What is *not* in here

Deliberately excluded, because they are browser work scheduled late rather than
separate products — they stay on the roadmap:

- **Knowledge management** — notes, web clipper, personal knowledge graph. These are
  *on the north-star path*: the Phase 6 personal search index grows into the graph.
  Exiling them here would exile the end goal.
- **Automation engine, focus mode, offline mode, power-user tooling** (capture,
  annotation, citations, REST client, JSON viewer, writing mode). Browser features,
  tracked as "Phase 7 — Browser, later" in [ROADMAP.md](ROADMAP.md).

---

## Kavacha Mail

Private email under the Kavacha Account: aliases, encryption.

- **Email alias system** — `shopping@kavacha.me`, `news@kavacha.me`; destroy any
  alias at any time. Needs Kavacha Account + mail infrastructure.
  *(was FEATURES 4.1)*
- Private mailbox with encryption consistent with the Phase 5 key model.

Hard prerequisites beyond Phase 5: a domain, deliverability/reputation work, and an
abuse-handling policy. Alias systems are spam magnets; this is not a weekend service.

## Kavacha Drive

Cloud storage, file sharing, encryption — same trust model as sync: the server
stores ciphertext and cannot read user data (see [sync/README.md](../sync/README.md)
for the model it must inherit).

Prerequisite beyond Phase 5: a storage cost model. This is the only ecosystem item
whose unit economics are dominated by something other than engineering time.

## Kavacha Identity

- **Password manager** — passwords, passkeys, 2FA codes; encrypted locally.
  Firefox's built-in manager is the interim answer and is what ships today.
  *(was FEATURES 4.3)*
- **Identity containers** — beyond incognito: an anonymous identity is no cookies +
  temporary email + temporary profile + fresh fingerprint. *(was FEATURES 4.2)*
  Note the browser-only subset (temp profile, no cookies, fresh fingerprint) could
  in principle ship without mail infrastructure; the *temp email* half is what binds
  it to Kavacha Mail.

Structural note carried over from [ADR 0011](decisions/0011-kavacha-sdk-plugins.md)
and [sdk/README.md](../sdk/README.md): the plugin SDK has **no** permission for
passwords, credentials or autofill, and no method that could reach them. A Kavacha
password manager must not become the reason that changes.

## Search aggregator

One query fanned out to Brave / Kagi / Bing / Google with combined results.
*(was FEATURES 8.1)*

Distinct from **universal search** (patch 0012), which is shipped and searches the
*user's own* data — tabs, history, bookmarks, notes, downloads. The aggregator
searches the *web* through several engines. Do not conflate them; the shipped
feature already owns the phrase "search everything".

## Enterprise

*(was FEATURES § 10)*

- **Team workspaces** — an organization with Marketing / Engineering / Research spaces.
- **Admin controls** — extensions, privacy policies, accounts. Firefox enterprise
  policies are the base to build on rather than reinvent.
- **Compliance mode** — audit logs, policy enforcement, data residency, for schools,
  law firms and government.

Tension to resolve before any of this starts: compliance mode means audit logs, and
audit logs mean recording what users do. Kavacha's first principle is that it does
not do that. An enterprise product that violates the consumer product's core promise
needs an explicit boundary — most likely a separate build channel and a policy that
audit logging is impossible to enable without visible, unremovable user notice.

---

## The positioning claim this supports

From [DIFFERENTIATION.md](DIFFERENTIATION.md): mail + aliases, drive, and
identity/passkeys all live under the same account and encryption model. That shared
model is the "ecosystem, not a fork" play — and also the reason none of it can start
before Phase 5 defines the model.
