#!/usr/bin/env python3
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

"""Kavacha network-silence test (SHIPPING.md R3).

Launches a FRESH-profile Kavacha, lets it sit idle, and asserts it makes
**zero** contact with telemetry / advertising / experimentation endpoints —
the load-bearing proof behind Kavacha's core privacy claim (patch 0002 strips
the endpoints; the privacy prefs disable the pings; this proves the result on
a real build).

How it sees traffic: Firefox's own MOZ_LOG. `nsHostResolver` logs every DNS
lookup and `nsHttp` logs every channel's host, so HTTPS destinations are
captured by hostname *before* TLS — no proxy or MITM needed.

What it does NOT do: assert zero total network. Kavacha legitimately fetches
security data (tracking-protection and add-on blocklists via Mozilla Remote
Settings, OCSP) and, in dashboard mode, a Wikimedia image. The test targets a
DENYLIST of telemetry/ads/experimentation hosts, matching R3's wording, and
prints every contacted host so a reviewer can eyeball the rest.

Host-agnostic on purpose: it takes the app path and runs anywhere. The CI
wiring (which runner, how long, artifact upload) is a separate, small workflow
that depends on the hosting decision R3 flags — see README.md.

Usage:
  python3 network_silence_test.py --app /path/to/Kavacha.app [--idle 45]
Exit code 0 = silent, 1 = a denylisted host was contacted (or launch failed).
"""

import argparse
import os
import re
import shutil
import signal
import subprocess
import sys
import tempfile
import time

# Hosts a fresh idle profile must NEVER contact. Substring/suffix match on the
# resolved hostname. Kept deliberately specific to telemetry / advertising /
# experimentation — NOT all of mozilla.org, because the tracking-protection and
# add-on blocklists Kavacha relies on come from *.settings.services.mozilla.com
# (Remote Settings) and must be allowed for protection to work at all.
DENY_HOST_SUFFIXES = [
    # Telemetry
    "incoming.telemetry.mozilla.org",
    "telemetry.mozilla.org",
    "telemetry-coverage.mozilla.org",
    "telemetry-incoming.r53-2.services.mozilla.com",
    # Advertising / sponsored content
    "contile.services.mozilla.com",
    "spocs.getpocket.com",
    "getpocket.cdn.mozilla.net",
    "google-analytics.com",
    "www.googletagmanager.com",
    "doubleclick.net",
    "adservice.google.com",
    # Experimentation / studies / heartbeat
    "normandy.cdn.mozilla.net",
    "normandy.services.mozilla.com",
    "experiments.mozilla.org",
    "targeting.services.mozilla.com",
    # Region / location profiling
    "location.services.mozilla.com",
]

# Substrings that, anywhere in a hostname, are always suspect.
DENY_HOST_SUBSTRINGS = ["telemetry", "normandy", "google-analytics", "doubleclick"]

# NOTABLE (not a hard fail, but a phone-home worth a reviewer's eye): update /
# push / codec endpoints that reveal the client to a third party on a fresh
# idle profile even though they are not telemetry/ads/experimentation. Printed
# prominently so the report is honest about ALL contact, not just R3's three
# categories.
NOTABLE_HOST_SUFFIXES = [
    "aus5.mozilla.org",  # app + GMP (OpenH264/Widevine) update ballots
    "push.services.mozilla.com",  # Web Push connection with no subscriptions
    "update.googleapis.com",  # Widevine CDM component update (Google)
    "edgedl.me.gvt1.com",  # Google component downloads
    "gvt1.com",  # Google component downloads
    "dl.google.com",  # Widevine CDM binary (Google)
    "ciscobinary.openh264.org",  # OpenH264 binary (Cisco)
]

# The one authoritative signal that a host was really reached: nsHostResolver
# calling getaddrinfo. Parsing this (not a blanket FQDN sweep of the verbose
# log) is what keeps module names like "utils.sys.mjs" and cert-chain filenames
# out of the host list.
GETADDRINFO_RE = re.compile(
    r"Calling getaddrinfo for host \[([a-z0-9][a-z0-9.-]+\.[a-z]{2,})\]", re.I
)

# Hostnames that are noise, not destinations.
IGNORE = {
    "localhost",
    "updates.kavacha.app",  # patch 0002 points here; it must not resolve to anyone
}


def macos_binary(app_path):
    """Resolve a .app bundle to its launchable binary."""
    if app_path.endswith(".app"):
        macos = os.path.join(app_path, "Contents", "MacOS")
        for name in ("zen", "kavacha", "firefox"):
            cand = os.path.join(macos, name)
            if os.path.exists(cand):
                return cand
        # Fall back to the first executable in MacOS/
        for f in os.listdir(macos):
            cand = os.path.join(macos, f)
            if os.access(cand, os.X_OK):
                return cand
    return app_path


def run(app_path, idle_seconds):
    binary = macos_binary(app_path)
    if not os.path.exists(binary):
        print(f"ERROR: browser binary not found at {binary}", file=sys.stderr)
        return 1

    profile = tempfile.mkdtemp(prefix="kavacha-silence-")
    log_file = os.path.join(profile, "moz_http.log")
    # A fresh profile inherits the app's baked privacy defaults. Pin the two
    # things a first run would otherwise do that are not the point of the test.
    with open(os.path.join(profile, "user.js"), "w") as f:
        f.write('user_pref("browser.shell.checkDefaultBrowser", false);\n')
        f.write('user_pref("zen.welcome-screen.seen", true);\n')

    env = dict(os.environ)
    env["MOZ_LOG"] = "timestamp,nsHostResolver:5,nsHttp:4"
    env["MOZ_LOG_FILE"] = log_file
    env["MOZ_DISABLE_SAFE_MODE_KEY"] = "1"

    print(f"Launching {binary}\n  profile: {profile}\n  idle: {idle_seconds}s")
    proc = subprocess.Popen(
        [binary, "-no-remote", "-profile", profile, "about:blank"],
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        time.sleep(idle_seconds)
    finally:
        proc.send_signal(signal.SIGTERM)
        try:
            proc.wait(timeout=20)
        except subprocess.TimeoutExpired:
            proc.kill()
        # MOZ_LOG_FILE is per-child-process (parent + content); collect all.
        time.sleep(1)

    hosts = set()
    for path in _log_files(log_file):
        try:
            text = open(path, "r", errors="replace").read()
        except OSError:
            continue
        for m in GETADDRINFO_RE.finditer(text):
            hosts.add(m.group(1).lower())

    hosts = {h for h in hosts if h not in IGNORE and not h.endswith(".local")}
    shutil.rmtree(profile, ignore_errors=True)
    return report(hosts)


def _log_files(base):
    # MOZ_LOG_FILE appends .child-<pid> for content processes.
    d = os.path.dirname(base)
    name = os.path.basename(base)
    out = []
    if os.path.exists(base):
        out.append(base)
    for f in os.listdir(d) if os.path.isdir(d) else []:
        if f.startswith(name) and os.path.join(d, f) not in out:
            out.append(os.path.join(d, f))
    return out


def _suffix_match(host, suffixes):
    for suf in suffixes:
        if host == suf or host.endswith("." + suf) or host.endswith(suf):
            return True
    return False


def is_denied(host):
    if _suffix_match(host, DENY_HOST_SUFFIXES):
        return True
    return any(sub in host for sub in DENY_HOST_SUBSTRINGS)


def is_notable(host):
    return _suffix_match(host, NOTABLE_HOST_SUFFIXES)


def report(hosts):
    denied = sorted(h for h in hosts if is_denied(h))
    notable = sorted(h for h in hosts if not is_denied(h) and is_notable(h))
    ok = sorted(h for h in hosts if not is_denied(h) and not is_notable(h))
    print("\n=== Hosts a fresh idle profile actually resolved (getaddrinfo) ===")
    for h in ok:
        print(f"  ok       {h}")
    for h in notable:
        print(f"  NOTABLE  {h}")
    for h in denied:
        print(f"  DENY     {h}")
    print(
        f"\n{len(hosts)} unique host(s); {len(denied)} denylisted, "
        f"{len(notable)} notable phone-home."
    )
    if notable:
        print(
            "\nNOTABLE (not an R3 failure, but a fresh-profile phone-home worth a\n"
            "product decision — update/push/codec endpoints reveal the client):"
        )
        for h in notable:
            print(f"  - {h}")
    if denied:
        print("\nNETWORK-SILENCE FAILED: telemetry/ads/experimentation contact:")
        for h in denied:
            print(f"  - {h}")
        return 1
    print("\nNETWORK-SILENCE PASSED (R3): no telemetry/ads/experimentation contact.")
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--app", required=True, help="Path to Kavacha.app or its binary")
    ap.add_argument("--idle", type=int, default=45, help="Seconds to sit idle")
    args = ap.parse_args()
    sys.exit(run(args.app, args.idle))
