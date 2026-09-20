#!/usr/bin/env python3
"""Static checks over browser/overlay/ that catch failures a build cannot.

Both checks exist because the failure they catch is silent: the browser starts,
most of Kavacha works, and only the feature that lost the coin toss is missing.

1. DUPLICATE FLUENT IDS across the Kavacha .ftl files. Every window loads all
   of them into one bundle, so an id defined twice makes Fluent throw
   "Attempt to override an existing message" and the *second* definition is
   dropped — whichever file that happens to be. Under Zen these files were
   separate bundles (zen-command-palette.ftl vs zen-preferences.ftl) and the
   same id in both was harmless; on the Firefox base it is not.
   (Observed 2026-09-20: the ⚙ appearance panel and the Settings pane both
   defined kavacha-appearance-title.)

2. UNSORTED moz.build LISTS. EXTRA_JS_MODULES and friends are
   StrictOrderingOnAppendList: an out-of-order entry fails the moz.build read
   outright, before a single file compiles. mozbuild sorts case-insensitively
   (python/mozbuild/mozbuild/util.py, `key=lambda x: x.lower()`), which is NOT
   Python's default — "KavachaAIBridge" sorts before "KavachaAboutFocus" in
   ASCII and after it here. This is the defect the Zen-era Phase 7 build
   attempt found and that VERIFICATION.md §4d records as caught by no static
   gate; it is caught by this one. (Hit again 2026-09-20 on the port.)

3. TOP-LEVEL DECLARATIONS IN WINDOW SCRIPTS. Every file in
   content/**/*.js loaded by KavachaStartup runs via loadSubScript into the
   SAME window global as browser.js. A top-level `const lazy` there throws
   "redeclaration of const lazy" and aborts that whole file.
   (Observed 2026-09-20 in kavacha-universal-search.js; the same class of bug
   as the Zen-era patch 0059.) Window scripts must wrap their bodies in a
   block and assign what they export onto `window`.

Usage: build/check-overlay.py   (exit 1 on any finding)
"""

import os
import re
import sys

REPO = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
FTL_DIR = os.path.join(REPO, "browser", "overlay", "browser", "locales", "en-US", "browser", "kavacha")
CONTENT_DIR = os.path.join(REPO, "browser", "overlay", "browser", "components", "kavacha", "content")

MSG_RE = re.compile(r"^(-?[a-zA-Z][\w-]*) *=", re.M)
# Only the forms that THROW on redeclaration matter: const, let and class.
# `var` and `function` redeclare harmlessly and are the sanctioned way a
# window script exposes a global (kavacha-window.js declares `var gKavacha`).
DECL_RE = re.compile(r"^\s*(?:const|let|class)\s+([A-Za-z_$][\w$]*)")


def check_ftl():
    seen, problems = {}, []
    if not os.path.isdir(FTL_DIR):
        return problems
    for name in sorted(os.listdir(FTL_DIR)):
        if not name.endswith(".ftl"):
            continue
        with open(os.path.join(FTL_DIR, name), encoding="utf-8") as f:
            for msg in MSG_RE.findall(f.read()):
                if msg in seen:
                    problems.append(f"duplicate Fluent id '{msg}': {seen[msg]} and {name}")
                else:
                    seen[msg] = name
    return problems


MOZBUILD_LIST_RE = re.compile(
    r"^([A-Z][\w.]*) \+= \[\n(.*?)^\]", re.S | re.M
)
# Every StrictOrderingOnAppendList in a Kavacha moz.build. Listing the names
# rather than assuming all of them keeps this honest: a plain `List` may be
# unsorted and flagging it would be a false alarm.
STRICT_LISTS = {
    "EXTRA_JS_MODULES",
    "FINAL_TARGET_FILES.actors",
    "JAR_MANIFESTS",
    "XPCOM_MANIFESTS",
    "DIRS",
    "MOZ_SRC_FILES",
    "TESTING_JS_MODULES",
}


def check_mozbuild_sorted():
    problems = []
    for root, _, files in os.walk(os.path.join(REPO, "browser", "overlay")):
        for name in files:
            if name != "moz.build":
                continue
            path = os.path.join(root, name)
            rel = os.path.relpath(path, REPO).replace("\\", "/")
            with open(path, encoding="utf-8") as f:
                text = f.read()
            for var, body in MOZBUILD_LIST_RE.findall(text):
                if var not in STRICT_LISTS:
                    continue
                items = re.findall(r'"([^"]+)"', body)
                # mozbuild: sorted(l, key=lambda x: x.lower())
                want = sorted(items, key=lambda x: x.lower())
                if items != want:
                    for i, (got, exp) in enumerate(zip(items, want)):
                        if got != exp:
                            problems.append(
                                f"{rel}: {var} is unsorted at element {i}: has '{got}', "
                                f"expected '{exp}' (mozbuild sorts case-insensitively)"
                            )
                            break
    return problems


def check_window_scripts():
    problems = []
    if not os.path.isdir(CONTENT_DIR):
        return problems
    for root, _, files in os.walk(CONTENT_DIR):
        for name in sorted(files):
            if not name.endswith(".js"):
                continue
            path = os.path.join(root, name)
            rel = os.path.relpath(path, REPO).replace("\\", "/")
            with open(path, encoding="utf-8") as f:
                text = f.read()
            # Only scripts KavachaStartup subscripts into the browser window
            # share browser.js's scope. A directory holding a .html is an
            # about: page, which gets its own document and its own global.
            if any(n.endswith(".html") for n in os.listdir(root)):
                continue
            # Track brace depth so a body wrapped in `{ … }` — which is the
            # fix — reads as scoped. Strings and comments are skipped so a
            # brace inside them cannot shift the depth.
            depth = 0
            for lineno, line in enumerate(text.splitlines(), 1):
                if depth == 0:
                    m = DECL_RE.match(line)
                    if m:
                        problems.append(
                            f"{rel}:{lineno}: top-level `{m.group(1)}` in a window script "
                            f"— wrap the body in a block and assign exports onto `window`"
                        )
                stripped = re.sub(r"//.*$", "", line)
                stripped = re.sub(r"""(["'`])(?:\\.|(?!\1).)*\1""", "", stripped)
                depth += stripped.count("{") - stripped.count("}")
    return problems


def main():
    problems = check_ftl() + check_mozbuild_sorted() + check_window_scripts()
    for p in problems:
        print("ERROR:", p)
    if problems:
        print(f"{len(problems)} problem(s)")
        return 1
    print("overlay checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
