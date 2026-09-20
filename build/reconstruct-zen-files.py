#!/usr/bin/env python3
"""Reconstruct the Kavacha-authored files of the retired Zen-era series.

The 87 patches in browser/patches-zen/ CREATE 119 files (every Kavacha module,
page, stylesheet and manifest) and later patches modify them. Applying the
series to an empty git repo, restricted to those created paths, rebuilds every
file at its final Zen-era state without the Zen tree — the input the port
(build/port-zen-file.py) reads from. Zen's own files are not reconstructed;
the Kavacha hunks they received are extracted separately where needed
(see VERIFICATION.md §4f).

Three patches (0060, 0063, 0077) do not apply cleanly this way because an
earlier hunk shifted their context; they are re-applied with GNU patch and
fuzz, which recovers everything except one comment-only hunk in
kavacha-menu.inc.css.

Usage:  build/reconstruct-zen-files.py [out-dir]   (default: browser/patches-zen/.recon, git-ignored)
"""

import glob
import io
import os
import re
import shutil
import subprocess
import sys

REPO = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
PATCHES = sorted(glob.glob(os.path.join(REPO, "browser", "patches-zen", "*.patch")))


def created_paths():
    created = set()
    for p in PATCHES:
        s = io.open(p, encoding="utf-8", errors="replace").read()
        created |= set(re.findall(r"^diff --git a/(\S+) b/\S+\nnew file mode", s, re.M))
    return created


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(REPO, "browser", "patches-zen", ".recon")
    if os.path.isdir(out):
        shutil.rmtree(out)
    os.makedirs(out)
    subprocess.run(["git", "-C", out, "init", "-q"], check=True)
    created = created_paths()
    print(f"{len(PATCHES)} patches; {len(created)} created files")
    failed = []
    for p in PATCHES:
        s = io.open(p, encoding="utf-8", errors="replace").read()
        touched = set(re.findall(r"^diff --git a/(\S+) b/", s, re.M))
        inc = [f for f in touched if f in created]
        if not inc:
            continue
        r = subprocess.run(
            ["git", "-C", out, "apply", "--whitespace=nowarn"] + [f"--include={f}" for f in inc] + [p],
            capture_output=True, text=True,
        )
        if r.returncode != 0:
            failed.append((p, inc))
    for p, inc in failed:
        s = io.open(p, encoding="utf-8", errors="replace").read()
        chunks = re.split(r"(?=^diff --git )", s, flags=re.M)
        keep = [c for c in chunks if c.startswith("diff --git") and re.match(r"diff --git a/(\S+)", c).group(1) in created]
        filt = os.path.join(out, os.path.basename(p) + ".filtered")
        io.open(filt, "w", encoding="utf-8", newline="\n").write("".join(keep))
        r = subprocess.run(["patch", "-p1", "--forward", "--fuzz=3", "--no-backup-if-mismatch", "-i", filt],
                           cwd=out, capture_output=True, text=True)
        print(f"fuzz-applied {os.path.basename(p)}: rc={r.returncode}")
        print("  " + "\n  ".join(l for l in (r.stdout + r.stderr).splitlines() if "FAILED" in l or "succeeded" in l))
        os.remove(filt)
    rejects = [os.path.join(d, f) for d, _, fs in os.walk(out) for f in fs if f.endswith(".rej")]
    for rj in rejects:
        print("reject (review by hand):", os.path.relpath(rj, out))
    n = sum(len(fs) for d, _, fs in os.walk(out) if ".git" not in d)
    print(f"reconstructed {n} files into {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
