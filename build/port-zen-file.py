#!/usr/bin/env python3
"""Port one Kavacha-authored file from the Zen-era reconstruction into the overlay.

Copies <recon>/<src> to browser/overlay/<dst> applying the mechanical renames of
ADR 0020 §4e/§4g (tokens, element ids, prefs, globals, chrome URLs) and prints
every Zen reference that survives, so the reviewer sees exactly what still needs
a hand-written change. Never edits files in place: the overlay copy is the port.

Usage:
  build/port-zen-file.py <src-relative-to-recon> <dst-relative-to-overlay> [--dry]
  build/port-zen-file.py --list-map

<recon> defaults to $KAVACHA_ZEN_RECON or browser/patches-zen/.recon (see
documentation/VERIFICATION.md §4f for how the reconstruction was made).
"""

import os
import re
import sys

REPO = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
RECON = os.environ.get("KAVACHA_ZEN_RECON") or os.path.join(REPO, "browser", "patches-zen", ".recon")
OVERLAY = os.path.join(REPO, "browser", "overlay")

# Ordered: longer keys first where prefixes overlap.
TOKENS = [
    ("--zen-primary-color", "--kavacha-accent"),
    ("--zen-branding-dark", "--kavacha-surface"),
    ("--zen-branding-paper", "--kavacha-surface-light"),
    ("--zen-branding-bg-reverse", "--kavacha-surface-reverse"),
    ("--zen-colors-border", "--kavacha-border"),
    ("--zen-colors-secondary", "--kavacha-surface-2"),
    ("--zen-colors-tertiary", "--kavacha-surface-3"),
    ("--zen-essential-tab-icon", "--kavacha-pinned-icon"),
    ("--zen-urlbar-background", "--kavacha-urlbar-background"),
    ("--zen-urlbar-filter", "--kavacha-urlbar-filter"),
    ("--zen-urlbar-top", "--kavacha-urlbar-top"),
    ("--zen-main-browser-background", "--kavacha-content-bg"),
    ("--zen-element-separation", "--kavacha-gap"),
    ("--zen-dialog-background", "--kavacha-dialog-bg"),
    ("--zen-toolbar-element-bg-hover", "--kavacha-toolbar-element-bg-hover"),
    ("--zen-toolbar-element-bg", "--kavacha-toolbar-element-bg"),
    ("--zen-themed-toolbar-bg-transparent", "--kavacha-surface"),
]
IDS = [
    ("#zen-sidebar-top-buttons-customization-target", "#nav-bar-customization-target"),
    ("#zen-sidebar-top-buttons", "#nav-bar"),
    ("#zen-workspaces-button", "#kavacha-spaces-strip"),
    ("#zen-tabbox-wrapper", "#tabbrowser-tabbox"),
    ("#zen-appcontent-wrapper", "#appcontent"),
    ("#zen-tabs-wrapper", "#tabbrowser-tabs"),
    ("#zen-essentials", "#pinned-tabs-container"),
    ("#zen-sidebar-splitter", "#sidebar-splitter"),
    ("#zen-toast-container", "#kavacha-toast-container"),
    ('getElementById("zen-sidebar-top-buttons")', 'getElementById("nav-bar")'),
    ('getElementById("zen-workspaces-button")', 'getElementById("kavacha-spaces-strip")'),
    ('getElementById("zen-essentials")', 'getElementById("pinned-tabs-container")'),
]
PREFS = [
    ('"zen.tabs.vertical"', '"sidebar.verticalTabs"'),
    ("-moz-pref(\"zen.tabs.vertical\")", "-moz-pref(\"sidebar.verticalTabs\")"),
    ('"zen.theme.accent-color"', '"kavacha.theme.accent"'),
    ('"zen.urlbar.replace-newtab"', '"kavacha.newtab.dashboard"'),
    ('"zen.welcome-screen.seen"', '"kavacha.welcome.seen"'),
    ('"zen.workspaces.force-container-workspace"', '"kavacha.workspaces.force-container"'),
]
GLOBALS = [
    ("gZenWorkspaces", "gKavachaWorkspaces"),
    ("zen-workspace-id", "kavacha-space-id"),
    ("ZenStartup", "KavachaStartup"),
]
CHROME = [
    ("chrome://browser/content/kavacha-theme/", "chrome://browser/content/kavacha/theme/"),
    ("chrome://browser/content/kavacha-studio/", "chrome://browser/content/kavacha/studio/"),
    ("chrome://browser/content/kavacha-marketplace/", "chrome://browser/content/kavacha/marketplace/"),
    ("chrome://browser/content/kavacha-plugins/", "chrome://browser/content/kavacha/plugins/"),
    ("chrome://browser/content/kavacha-newtab/", "chrome://browser/content/kavacha/newtab/"),
    ("chrome://browser/content/kavacha-search/", "chrome://browser/content/kavacha/search/"),
    ("chrome://browser/content/kavacha-knowledge/", "chrome://browser/content/kavacha/knowledge/"),
    ("chrome://browser/content/kavacha-focus/", "chrome://browser/content/kavacha/focus/"),
    ("chrome://browser/content/kavacha-workflows/", "chrome://browser/content/kavacha/workflows/"),
    ("chrome://browser/content/kavacha-write/", "chrome://browser/content/kavacha/write/"),
    ("chrome://browser/content/kavacha-ai/", "chrome://browser/content/kavacha/ai/"),
    ("browser/zen-command-palette.ftl", "browser/kavacha/kavacha-commands.ftl"),
    ("browser/preferences/zen-preferences.ftl", "browser/kavacha/kavacha-preferences.ftl"),
    ("browser/zen-workspaces.ftl", "browser/kavacha/kavacha-workspaces.ftl"),
]
ZEN_ICONS = {
    "zen-icons/selectable/layers.svg": "chrome://browser/skin/window.svg",
    "zen-icons/selectable/time.svg": "chrome://browser/skin/history.svg",
    "zen-icons/selectable/page.svg": "chrome://browser/skin/tab.svg",
    "zen-icons/selectable/inbox.svg": "chrome://browser/skin/mail.svg",
    "zen-icons/selectable/school.svg": "chrome://global/skin/icons/lightbulb.svg",
    "zen-icons/selectable/code.svg": "chrome://global/skin/icons/developer.svg",
    "zen-icons/selectable/extension-puzzle.svg": "chrome://global/skin/icons/plugin.svg",
    "zen-icons/selectable/flag.svg": "chrome://global/skin/icons/highlights.svg",
    "zen-icons/selectable/folder.svg": "chrome://global/skin/icons/folder.svg",
    "zen-icons/selectable/grid-2x2.svg": "chrome://browser/skin/topsites.svg",
    "zen-icons/selectable/lock-closed.svg": "chrome://global/skin/icons/security.svg",
    "zen-icons/selectable/shapes.svg": "chrome://global/skin/icons/plugin.svg",
    "zen-icons/search-glass.svg": "chrome://global/skin/icons/search-glass.svg",
    "zen-icons/library.svg": "chrome://browser/skin/library.svg",
    "zen-icons/history.svg": "chrome://browser/skin/history.svg",
    "zen-icons/close.svg": "chrome://global/skin/icons/close.svg",
    "zen-icons/camera.svg": "chrome://browser/skin/screenshot.svg",
    "zen-icons/screenshot.svg": "chrome://browser/skin/screenshot.svg",
    "zen-icons/tracking-protection.svg": "chrome://browser/skin/tracking-protection.svg",
    "zen-icons/text-size.svg": "chrome://global/skin/icons/edit.svg",
    "zen-icons/algorithm.svg": "chrome://global/skin/icons/developer.svg",
    "zen-icons/block.svg": "chrome://global/skin/icons/block.svg",
    "zen-icons/bolt.svg": "chrome://global/skin/icons/lightbulb.svg",
    "zen-icons/duplicate-tab.svg": "chrome://browser/skin/tabs.svg",
    "zen-icons/edit-copy.svg": "chrome://global/skin/icons/edit-copy.svg",
    "zen-icons/link.svg": "chrome://global/skin/icons/link.svg",
    "zen-icons/page-portrait.svg": "chrome://global/skin/icons/page-portrait.svg",
    "zen-icons/save.svg": "chrome://browser/skin/save.svg",
    "zen-icons/paintbrush.svg": "chrome://global/skin/icons/eye.svg",
    "zen-icons/sliders.svg": "chrome://browser/skin/customize.svg",
    "zen-icons/window.svg": "chrome://browser/skin/window.svg",
    "zen-icons/settings.svg": "chrome://global/skin/icons/settings.svg",
    "zen-icons/plus.svg": "chrome://global/skin/icons/plus.svg",
    "zen-icons/edit.svg": "chrome://global/skin/icons/edit.svg",
    "zen-icons/delete.svg": "chrome://global/skin/icons/delete.svg",
    "zen-icons/info.svg": "chrome://global/skin/icons/info.svg",
    "zen-icons/warning.svg": "chrome://global/skin/icons/warning.svg",
    "zen-icons/check.svg": "chrome://global/skin/icons/check.svg",
    "zen-icons/menu.svg": "chrome://browser/skin/menu.svg",
    "zen-icons/sidebar.svg": "chrome://browser/skin/sidebar-collapsed.svg",
}

ZEN_LEFT = re.compile(r"\bg?Zen[A-Z]\w*|zen\.[\w.-]+|--zen-[\w-]+|[#.]zen-[\w-]+|chrome://browser/[a-z]+/zen[\w/.-]*|zen-workspace-id|zen-essential|zen-empty-tab|%include")


def port(text):
    for a, b in TOKENS + IDS + PREFS + GLOBALS + CHROME:
        text = text.replace(a, b)
    for a, b in ZEN_ICONS.items():
        text = text.replace("chrome://browser/skin/" + a, b)
    return text


def main(argv):
    if "--list-map" in argv:
        for a, b in TOKENS + IDS + PREFS + GLOBALS + CHROME:
            print(f"{a:50} -> {b}")
        return 0
    if len(argv) < 3:
        print(__doc__)
        return 2
    src, dst = argv[1], argv[2]
    dry = "--dry" in argv
    spath = os.path.join(RECON, src)
    dpath = os.path.join(OVERLAY, dst)
    with open(spath, encoding="utf-8") as f:
        text = f.read()
    ported = port(text)
    left = sorted(set(m.group(0) for m in ZEN_LEFT.finditer(ported)))
    if not dry:
        os.makedirs(os.path.dirname(dpath), exist_ok=True)
        with open(dpath, "w", encoding="utf-8", newline="\n") as f:
            f.write(ported)
    print(f"{'DRY ' if dry else ''}{src} -> {dst}: {text.count(chr(10))} lines, {sum(1 for a, b in TOKENS + IDS + PREFS + GLOBALS + CHROME if a in text)} rule(s) hit")
    if left:
        print("  remaining Zen references:", ", ".join(left))
        for i, line in enumerate(ported.splitlines(), 1):
            if ZEN_LEFT.search(line):
                print(f"    {i:5}: {line.strip()[:120]}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
