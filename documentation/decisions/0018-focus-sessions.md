# ADR 0018 — Focus sessions: a period, not a mode

**Status:** Accepted · 2026-08-17

## Context

FEATURES 11 asks for "focus mode — block distracting sites + notifications". The
mechanism is easy; the semantics are where these features usually go wrong. Blocking
tools split into two camps: a toggle the user flips (which they flip back the moment it
is inconvenient, so it does nothing) and a lock they cannot escape (which they
eventually defeat by quitting, uninstalling, or editing a file — and resent).

## Decision

**A focus session is a period with an end time, and the end time is the only state.**
Everything — the request check, the palette availability, the block page, the settings
page — reads one clock. Consequences fall out for free rather than needing handling:

- A crash or a lost timer cannot strand the browser in a permanently blocked state:
  the session is over when the clock says so.
- The block check never has to trust that some earlier cleanup ran.
- The end time is stored in **seconds**, because prefs are 32-bit signed integers and a
  millisecond timestamp overflows into a negative number — the shape of bug that ships
  as "focus mode randomly does nothing".

**Sessions survive a restart, and ending one is a single click.** Quitting the browser
is the most obvious way to defeat a self-imposed block, so a focus feature a restart
switches off is decoration — hence a pref rather than memory. But it is explicitly not
a lock: the block page says, in as many words, that ending early is one click and that
the point is to make the distraction *deliberate*, not impossible. Tools that try to be
locks are defeated in ways that also destroy the user's trust in the tool.

**Top-level pages only, never subresources.** Kavacha already ships tracking protection
for the other job. Quietly breaking embeds inside pages the user deliberately opened
would make "focus mode" mean "the web is subtly broken now". Matching is on eTLD+1, so
a rule for `youtube.com` covers `m.youtube.com` and does not cover `notyoutube.com`.

**The notification default is restored exactly.** During a session,
`permissions.default.desktop-notification` is set to DENY; the previous value is parked
in its own pref (so it outlives the process, as the session does) and written back only
if the current value is still the one we set. If it moved underneath us, the user's
value wins and we drop our bookkeeping. This is patch 0066's lesson applied *before*
the bug: that patch armed a shared shutdown pref, could not distinguish "I set this"
from "the user set this", and wiped browsing history on every quit for two weeks.

**Cancel, then redirect off the notification stack.** A blocked channel is cancelled
inside `http-on-modify-request`, but the block page is loaded from
`dispatchToMainThread` — navigating a docshell from inside that observer re-enters the
machinery that is mid-flight.

**One page is both the wall and the settings.** `about:focus` leads with the block when
it was reached by being blocked (`?url=`) and is the blocklist editor otherwise. The
moment someone most wants to change a rule is the moment they just hit it; sending them
elsewhere is how a rule that no longer makes sense survives for months.

## Consequences

- Per-Space blocklists are **additive** ("also block these"), not scoped ("only here").
  Asking which Space a request belongs to at `http-on-modify-request` time is neither
  cheap nor reliable, and a session is one span of attention anyway. The other reading
  is reasonable, so the code says which one is implemented.
- Focus mode is reachable from automation (`start-focus` / `end-focus` steps in
  ADR 0017), which is where "start my writing session" becomes one command.
- There is no per-site allowance ("5 more minutes on this one site"). If it is added,
  it belongs as an explicit, expiring exception, not as a weakening of the rule.

## Alternatives considered

- **An `nsIContentPolicy` implementation** — the "correct" blocking hook, but requires
  XPCOM component registration and gives no better outcome for top-level documents.
- **A WebExtension** — would mean shipping and trusting an extension for a core
  feature, and it would appear in the user's add-on list as something removable.
- **Blocking by closing or redirecting the tab** — destroys the user's tab and their
  place in it. Cancelling the load and showing a page keeps Back working.
