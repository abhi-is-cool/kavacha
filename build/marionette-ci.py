#!/usr/bin/env python3
"""Run every Kavacha Marionette probe in sequence, each from a clean profile.

The probes are written to attach to a browser someone else launched
(`marionette-verify.py --launch`) and leave it running. That is right for
hand-driven work and wrong for CI in one specific way: chaining probes
through a single profile lets one probe's leftovers change the next one's
answer. The restart probe reported 4/7 that way on 2026-09-20 and 7/7 from
clean. So this driver gives every probe its own profile directory and its own
browser process, and kills that process before the next probe starts.

The restart probe is the one exception: its two phases must share a profile
(that is what it is testing), so phase 1 quits the browser itself and this
driver relaunches on the same profile for phase 2.

Usage:
  python3 build/marionette-ci.py [--headless] [--bin PATH] [--no-sandbox]

Exit status is 0 only if every probe passed. Each probe's own PASS/FAIL lines
are printed as it runs.
"""

import argparse
import importlib.util
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))


def _load(name, filename):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, filename))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


_mv = _load("mv", "marionette-verify.py")


class Browser:
    """A launched build, held by handle so it can be killed deterministically.

    marionette-verify.py's own launch() drops the Popen object on purpose (it
    hands the browser to a human and exits). Here we keep it: pkill/taskkill by
    name would also hit a browser the developer has open.
    """

    def __init__(self, binary, profile, headless=False, no_sandbox=False, port=None):
        self.binary = binary
        self.profile = profile
        self.headless = headless
        self.no_sandbox = no_sandbox
        self.port = port or _mv.PORT
        self.proc = None

    def start(self, purge_cache=True):
        cache = os.path.join(self.profile, "startupCache")
        if purge_cache and os.path.isdir(cache):
            # A rebuild leaves a stale compiled copy of every module here, and
            # ChromeUtils.importESModule keeps returning it.
            shutil.rmtree(cache)
        os.makedirs(self.profile, exist_ok=True)
        env = dict(os.environ)
        if self.no_sandbox:
            env["MOZ_DISABLE_CONTENT_SANDBOX"] = "1"
        cmd = [self.binary, "-marionette", "-remote-allow-system-access",
               "-no-remote", "-profile", self.profile]
        if self.headless:
            cmd.append("-headless")
        kwargs = {}
        if os.name == "nt":
            kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
        self.proc = subprocess.Popen(cmd, env=env, **kwargs)
        for _ in range(90):
            if self.proc.poll() is not None:
                raise RuntimeError("browser exited during startup (code %s)" % self.proc.returncode)
            try:
                socket.create_connection((_mv.HOST, self.port), timeout=1).close()
                return
            except OSError:
                time.sleep(1)
        self.stop()
        raise RuntimeError("Marionette did not come up on %s:%d within 90s"
                           % (_mv.HOST, self.port))

    def stop(self):
        if self.proc is None or self.proc.poll() is not None:
            self.proc = None
            return
        self.proc.terminate()
        try:
            self.proc.wait(timeout=30)
        except subprocess.TimeoutExpired:
            self.proc.kill()
            self.proc.wait(timeout=30)
        self.proc = None

    def wait_for_exit(self, timeout=60):
        """The probe asked the browser to quit; wait for it rather than kill."""
        if self.proc is None:
            return
        try:
            self.proc.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            self.stop()
        self.proc = None


def run_probe(label, module_file, browser_args, phases=("",)):
    """Launch, run each phase of one probe, then kill. Returns 0 on success."""
    profile = tempfile.mkdtemp(prefix="kavacha-ci-%s-" % label)
    browser = Browser(profile=profile, **browser_args)
    rc = 0
    try:
        for i, phase in enumerate(phases):
            if i > 0:
                # Phase 1 quit the browser; come back up on the SAME profile.
                browser.wait_for_exit()
                browser.start(purge_cache=False)
            else:
                browser.start()
            print("\n--- %s%s ---" % (label, (" phase " + phase) if phase else ""))
            mod = _load("probe_%s_%s" % (label, i), module_file)
            argv = sys.argv
            sys.argv = [module_file] + ([phase] if phase else [])
            try:
                rc |= mod.main() or 0
            finally:
                sys.argv = argv
    finally:
        browser.stop()
        shutil.rmtree(profile, ignore_errors=True)
    return rc


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--bin", help="browser binary (default: auto-detect under browser/firefox-source/obj-*/dist)")
    p.add_argument("--headless", action="store_true")
    p.add_argument("--no-sandbox", action="store_true",
                   help="set MOZ_DISABLE_CONTENT_SANDBOX=1 (macOS actor paths)")
    args = p.parse_args()

    binary = args.bin or _mv.find_binary()
    if not binary or not os.path.exists(binary):
        print("no built browser found under browser/firefox-source/obj-*/dist (pass --bin)",
              file=sys.stderr)
        return 1
    print("probing %s" % binary)

    browser_args = {"binary": binary, "headless": args.headless,
                    "no_sandbox": args.no_sandbox}

    probes = [
        ("substrate", "marionette-substrate.py", ("",)),
        ("phase7", "marionette-phase7.py", ("",)),
        ("restart", "marionette-restart.py", ("1", "2")),
    ]

    failed = []
    for label, filename, phases in probes:
        try:
            rc = run_probe(label, os.path.join(HERE, filename), browser_args, phases)
        except Exception as e:  # a launch failure is a probe failure, not a crash
            print("  FAIL %s: %s" % (label, e))
            rc = 1
        if rc:
            failed.append(label)

    print("\n=== %d/%d probes passed ===" % (len(probes) - len(failed), len(probes)))
    if failed:
        print("failed: %s" % ", ".join(failed))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
