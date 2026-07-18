#!/usr/bin/env python3
"""Kavacha chrome-UI verification over Marionette.

Drives the built browser and reports hard facts instead of screenshots:
  * which Kavacha modules the build actually loaded
  * whether the top-right menu button exists, and its geometry
  * the geometry of the chrome containers, to locate the content inset
    that shows as an accent-coloured frame on the right/bottom edges

Usage:
  1) launch the build with Marionette enabled:
       ./build/marionette-verify.py --launch
     (or manually:  <dist>/Kavacha.app/Contents/MacOS/zen -marionette -no-remote \
                      -profile /tmp/kavacha-mn-profile)
  2) then, in another shell:
       ./build/marionette-verify.py

No third-party deps: Marionette is length-prefixed JSON over TCP.
"""

import json
import os
import socket
import subprocess
import sys
import time

HOST, PORT = "127.0.0.1", 2828
DIST = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..", "browser", "zen-upstream", "engine",
    "obj-aarch64-apple-darwin", "dist",
)
BIN = os.path.normpath(os.path.join(DIST, "Kavacha.app", "Contents", "MacOS", "zen"))
PROFILE = "/tmp/kavacha-mn-profile"


class Marionette:
    def __init__(self):
        self.sock = socket.create_connection((HOST, PORT), timeout=30)
        self.buf = b""
        self.msgid = 0
        self._recv()  # server handshake

    def _recv(self):
        while b":" not in self.buf:
            self.buf += self.sock.recv(65536)
        length, _, rest = self.buf.partition(b":")
        n = int(length)
        while len(rest) < n:
            rest += self.sock.recv(65536)
        self.buf = rest[n:]
        return json.loads(rest[:n])

    def call(self, command, params=None):
        self.msgid += 1
        payload = json.dumps([0, self.msgid, command, params or {}]).encode()
        self.sock.sendall(b"%d:%s" % (len(payload), payload))
        resp = self._recv()
        if resp[2]:
            raise RuntimeError("%s failed: %s" % (command, resp[2]))
        return resp[3]

    def script(self, js):
        return self.call("WebDriver:ExecuteScript", {"script": js, "args": []})["value"]


PROBE = r"""
const doc = document;
const rect = el => { if (!el) return null; const r = el.getBoundingClientRect();
  return {x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
          right: Math.round(r.right), bottom: Math.round(r.bottom)}; };
const box = el => { if (!el) return null; const s = getComputedStyle(el);
  return {margin: s.margin, padding: s.padding, border: s.border,
          borderRadius: s.borderRadius, background: s.backgroundColor}; };
const pick = id => doc.getElementById(id);

const btn = pick("kavacha-menu-button");
const containers = {};
for (const sel of ["#navigator-toolbox", "#browser", "#appcontent",
                   "#tabbrowser-tabbox", "#tabbrowser-tabpanels",
                   "#zen-sidebar-top-buttons", "#zen-sidebar-top-buttons-customization-target"]) {
  const el = doc.querySelector(sel);
  if (el) { containers[sel] = {rect: rect(el), box: box(el)}; }
}
const stack = doc.querySelector(".browserStack");
if (stack) { containers[".browserStack"] = {rect: rect(stack), box: box(stack)}; }

// which Kavacha modules are actually loaded in this build
const loaded = [];
for (const m of ["KavachaMenu", "KavachaSessionCleanup", "KavachaMarketplace",
                 "KavachaSDK", "KavachaPluginManager", "KavachaCommandRegistry",
                 "KavachaThemeEngine", "KavachaLayoutEngine"]) {
  try {
    ChromeUtils.importESModule("resource:///modules/" + m + ".sys.mjs");
    loaded.push(m);
  } catch (e) { /* not in this build */ }
}

return JSON.stringify({
  menuButton: btn
    ? {found: true, rect: rect(btn), hidden: btn.hidden,
       parent: btn.parentElement && btn.parentElement.id,
       listStyleImage: getComputedStyle(btn).listStyleImage,
       fill: getComputedStyle(btn).fill,
       contextProps: getComputedStyle(btn).MozContextProperties}
    : {found: false},
  loadedModules: loaded,
  window: {innerW: window.innerWidth, innerH: window.innerHeight,
           outerW: window.outerWidth, outerH: window.outerHeight},
  containers,
}, null, 2);
"""


def launch():
    os.makedirs(PROFILE, exist_ok=True)
    print("launching %s with -marionette ..." % BIN)
    subprocess.Popen([BIN, "-marionette", "-remote-allow-system-access", "-no-remote", "-profile", PROFILE])
    print("waiting for Marionette on %s:%d ..." % (HOST, PORT))
    for _ in range(60):
        try:
            socket.create_connection((HOST, PORT), timeout=1).close()
            print("Marionette is up. Now run:  ./build/marionette-verify.py")
            return 0
        except OSError:
            time.sleep(1)
    print("timed out waiting for Marionette", file=sys.stderr)
    return 1


def main():
    if "--launch" in sys.argv:
        return launch()
    m = Marionette()
    m.call("WebDriver:NewSession", {})
    m.call("Marionette:SetContext", {"value": "chrome"})
    print(m.script(PROBE))
    return 0


if __name__ == "__main__":
    sys.exit(main())
