# Kavacha Feature Inventory

The canonical differentiating-feature list. Positioning:

> Zen: "A beautiful browser for power users." · Brave: "A private browser with rewards."
> · Firefox: "An independent browser." · **Kavacha: "Your personal operating system for
> the internet."**

Each feature is annotated against the audit of Zen's actual source
(`src/zen/`, see [DIFFERENTIATION.md](DIFFERENTIATION.md)):
**inherit** (Zen ships it — adopt), **extend** (Zen ships the base — Kavacha adds the
differentiating layer), **new** (nothing upstream — Kavacha builds it).

Priority: **Y1** = first-year must-have · **later** = post-v1.

## 1. Personal Digital Environment (core differentiator)

| Feature | Status vs Zen | Priority |
|---|---|---|
| 1.1 **True workspace profiles** — each workspace is a complete digital identity: tabs, cookies, extensions, search engine, theme, AI settings, bookmarks, password vault, history. macOS Spaces + containers + profiles combined. | **extend** — Zen `spaces` gives tabs/theme; Kavacha adds per-workspace search, extensions, bookmarks/history/vault isolation, AI settings (schema shipped: `ui/workspaces/workspace.schema.json`) | **Y1** |
| 1.2 **Workspace templates** — installable environments: "Student" (Scholar, Zotero, citation tools), "Developer" (GitHub, docs sidebar), "Privacy" (Kagi, max blocking, no cookies) | **new** (`template` field already in schema) | **Y1** |

## 2. Customization (killer feature)

| Feature | Status vs Zen | Priority |
|---|---|---|
| 2.1 **Visual Browser Builder** — GUI editor: sidebar toggle/width, tab style (vertical/horizontal/Arc-style), toolbar component add/remove. Redesign the browser without CSS. | **new** — Zen `mods` installs others' CSS; the Studio makes users authors | **Y1** |
| 2.2 **Component marketplace** — VS Code-style: sidebar widgets, themes, layouts, tool panels; bundles like "Research Mode" (citation manager + notes panel + AI summary) | **extend** — Zen has a mods store; components (widgets/panels, not just CSS) are new | **Y1** |
| 2.3 **Community themes as complete experiences** — Minimalist, Hacker, Academic, Bloomberg Terminal, Studio | **extend** — theme packages + layout docs make full experiences shareable | **Y1** |

## 3. Privacy

| Feature | Status vs Zen | Priority |
|---|---|---|
| 3.1 **Privacy Center** — "Your Protection Today": trackers blocked, fingerprint attempts prevented, bandwidth saved. Make privacy visible. | **new** | **Y1** |
| 3.2 **Privacy Score** — health-style score (▓ 92%) with concrete improvement steps (third-party cookies, encrypted DNS) | **new** | later |
| 3.3 **Automatic cookie intelligence** — decide instead of asking: allow necessary, reject tracking, delete after session | **extend** — Firefox's Cookie Banner Blocker now on by default (`cookiebanners.service.mode=1` in `kavacha.js`); session-scoped deletion rules are new | **Y1** (base shipped) |
| 3.4 **Website trust profiles** — per-site rules (youtube.com: ✓ video ✓ login ✕ tracking ✕ third-party cookies) | **new** — UI over Firefox's per-site permission/exception stores | later |

## 4. Identity Protection (bigger than a browser)

| Feature | Status vs Zen | Priority |
|---|---|---|
| 4.1 **Email alias system** — shopping@kavacha.me, news@kavacha.me; destroy anytime | **new** (needs Kavacha Account + mail infra) | later |
| 4.2 **Identity containers** — beyond incognito: anonymous identity = no cookies + temp email + temp profile + fresh fingerprint | **new** | later |
| 4.3 **Password manager** — passwords, passkeys, 2FA codes; encrypted locally | **new** (Firefox's manager as interim) | later |

## 5. AI (local-first — Zen has none)

| Feature | Status vs Zen | Priority |
|---|---|---|
| 5.1 **Local AI assistant** — "Summarize these 20 research papers", "Find where I saw that battery article", "Organize my tabs"; local models + user-controlled APIs | **new** | **Y1** |
| 5.2 **AI memory (privacy-first)** — remembers preferences/workflows/knowledge; encrypted, user-controlled, exportable | **new** | later |
| 5.3 **AI tab management** — "Group tabs by topic", "Close duplicates", "Save this research session" | **new** (surfaces through inherited command palette) | **Y1** |

## 6. Knowledge Management

| Feature | Status vs Zen | Priority |
|---|---|---|
| 6.1 **Built-in notes** — per-page annotations | **new** | later |
| 6.2 **Web clipper** — pages, screenshots, PDFs, highlights (Pocket/Evernote/Notion-style, but local) | **new** | later |
| 6.3 **Personal knowledge graph** — the browser understands relationships between papers, sites, notes, conversations | **new** (long-term; builds on 8.2 + 6.1) | later |

## 7. Better Tab Management

| Feature | Status vs Zen | Priority |
|---|---|---|
| 7.1 **Tab history tree** — branching history instead of linear | **new** | later |
| 7.2 **Tab sessions** — save "Research Project: 50 tabs, 3 windows, 5 notes", restore anytime | **extend** — Zen `sessionstore` persists state; named/saved sessions are new | later |
| 7.3 **Automatic tab organization** — AI creates topic groups | **new** (= 5.3, via Zen `folders`) | **Y1** |

## 8. Search

| Feature | Status vs Zen | Priority |
|---|---|---|
| 8.1 **Search aggregator** — one query fanned to Brave/Kagi/Bing/Google, combined results | **new** | later |
| 8.2 **Personal search index** — local search over history, bookmarks, notes, saved pages ("the silicon battery article from last month") | **new** — also the retrieval backbone for 5.1 and 6.3 | **Y1** |

## 9. Sync and Ownership

| Feature | Status vs Zen | Priority |
|---|---|---|
| 9.1 **E2E-encrypted sync** — tabs, settings, themes, workspaces, bookmarks; server cannot read data | **new** — Zen sync rides Mozilla accounts; Kavacha removes that dependency | **Y1** |
| 9.2 **Data export** — one click "Export My Digital Life": bookmarks, history, settings, notes, passwords | **new** | **Y1** (cheap once stores are schema'd) |
| 9.3 **Self-hosting** — `kavacha-sync-server` on NAS/VPS/home server | **new** — ships as a container (see `sync/README.md`) | **Y1** (with 9.1) |

## 10. Business / Enterprise

| Feature | Status vs Zen | Priority |
|---|---|---|
| 10.1 Team workspaces (org → Marketing/Engineering/Research) | **new** | later |
| 10.2 Admin controls — extensions, privacy policies, accounts | **new** (Firefox enterprise policies as base) | later |
| 10.3 Compliance mode — audit logs, policy enforcement, data residency (schools, law firms, government) | **new** | later |

## 11. Small Features That Matter

| Feature | Status vs Zen | Priority |
|---|---|---|
| Command palette (`Ctrl+Shift+P`: change theme, switch workspace, search history, summarize page) | **inherit** — Zen ships one; Kavacha extends it with AI + studio commands | **Y1** (free) |
| Browser automation — "Open my morning workflow" → Gmail, Calendar, News, Tasks | **new** (natural fit on workspace templates) | later |
| Focus mode — block distracting sites + notifications | **new** | later |
| Offline mode — save pages, notes, documents | **new** (with web clipper) | later |

## Year-1 must-have summary

1. **Workspace identities** (1.1, 1.2) — extend Zen spaces into full environments + templates
2. **Customization Studio** (2.1) — visual builder writing schema-validated documents
3. **Privacy Dashboard** (3.1, 3.3) — protection report + cookie intelligence
4. **Encrypted sync + self-hosting + export** (9.1–9.3)
5. **Local AI assistant + AI tab management** (5.1, 5.3)
6. **Theme/component marketplace** (2.2, 2.3)
7. **Personal search index** (8.2) — doubles as AI retrieval backbone

Later: email aliases, password manager, notes system, cloud storage, enterprise.
