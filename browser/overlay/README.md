# Kavacha overlay

Every file Kavacha authors lives here, at the path it will occupy in the Firefox tree
(`browser/components/kavacha/...`, `browser/locales/en-US/browser/kavacha/...`).
`build/bootstrap.sh setup` copies this directory onto `browser/firefox-source/` and commits
it locally on top of the pinned Firefox commit; `overlay-export` copies edits back.

Nothing here is a patch. Patches (`../patches/`) exist only for files Firefox itself tracks.
See [ADR 0020](../../documentation/decisions/0020-firefox-esr-direct-overlay.md).

Empty until port milestone M2 (the substrate); M1 builds vanilla Firefox ESR with Kavacha
branding and prefs only.
