# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

## Kavacha Settings panes (about:preferences). Linked from preferences.xhtml by
## patch 0004. Pane strings from the Zen-era zen-preferences.ftl hunks move here
## with each pane's port (M3); the nav titles are theirs.



kavacha-pane-placeholder = This pane is being ported to the Firefox base; its controls return in a later build.

## Pane strings recovered from the Zen-era zen-preferences.ftl hunks (2026-09-19).

kavacha-newtab-floating-search =
    .label = Open new tabs with the floating search bar
kavacha-newtab-floating-search-description = When turned off, new tabs open the Kavacha dashboard: a clock, a greeting, and a daily quote. Works entirely offline.
kavacha-settings-workspaces-auto-assign-bookmarks =
    .label = Add new bookmarks to the current Space only
kavacha-settings-workspaces-auto-assign-bookmarks-description = Bookmarks you save are shown only in the Space you saved them in. You can change a bookmark's Spaces anytime from its edit panel.
pane-kavacha-privacy-title = Privacy Center
kavacha-privacy-center-title = Privacy Center
kavacha-privacy-stats-header = Blocked on this device
kavacha-privacy-stats-description = What Kavacha's protections have stopped. Counted locally and never leaves your device.
kavacha-privacy-stats-since = Counting since { $date }.
kavacha-privacy-card-alltime = All time
kavacha-privacy-card-week = Past 7 days
kavacha-privacy-card-today = Today
kavacha-privacy-card-bandwidth = Bandwidth saved (estimated)
kavacha-privacy-breakdown-header = Past 7 days by type
kavacha-privacy-row-trackers = Trackers
kavacha-privacy-row-cookies = Tracking cookies
kavacha-privacy-row-fingerprinters = Fingerprinters
kavacha-privacy-row-cryptominers = Cryptominers
kavacha-privacy-row-social = Social media trackers
kavacha-privacy-stats-paused = Statistics are paused because blocking history is turned off in this profile.
kavacha-privacy-clear-stats = Clear statistics
kavacha-privacy-posture-header = Active protections
kavacha-privacy-posture-description = The defaults Kavacha ships with, read live from this profile.
kavacha-privacy-posture-etp = Enhanced Tracking Protection (strict)
kavacha-privacy-posture-tcp = Total Cookie Protection
kavacha-privacy-posture-fpp = Fingerprinting protection
kavacha-privacy-posture-qs = Link tracking-parameter stripping
kavacha-privacy-posture-gpc = Global Privacy Control
kavacha-privacy-posture-banners = Cookie banner auto-reject
kavacha-privacy-on = On
kavacha-privacy-off = Off
pane-kavacha-appearance-title = Appearance & Themes
kavacha-appearance-title = Appearance & Themes
kavacha-appearance-theme-header = Theme
kavacha-appearance-theme-description = Pick a theme for the browser chrome. Themes change surface colors; your accent color is set separately below.
kavacha-appearance-theme-label = Active theme
kavacha-appearance-accent-header = Accent color
kavacha-appearance-accent-description = The accent is yours — it stays put when you switch themes.
kavacha-appearance-accent-label = Accent color
kavacha-appearance-accent-system = Use system accent
kavacha-appearance-newtab-header = New tab
kavacha-appearance-newtab-dashboard =
    .label = Open the Kavacha dashboard instead of the floating search bar
kavacha-appearance-newtab-description = Choose what a new tab shows: the full Kavacha dashboard, or a minimal floating search bar.
kavacha-appearance-studio-link = Customize visually in the Studio →
pane-kavacha-customization-title = Customization
kavacha-customization-title = Customization
kavacha-customization-layout-header = Layout
kavacha-customization-layout-description = Arrange the browser chrome. Changes apply live to every window.
kavacha-customization-tabstyle-label = Tab bar
kavacha-customization-tabstyle-horizontal =
    .label = Horizontal
kavacha-customization-tabstyle-vertical =
    .label = Vertical
kavacha-customization-sidebar-label = Sidebar position
kavacha-customization-sidebar-left =
    .label = Left
kavacha-customization-sidebar-right =
    .label = Right
kavacha-customization-sidebar-hidden =
    .label = Hidden
kavacha-customization-density-label = Density
kavacha-customization-density-compact =
    .label = Compact
kavacha-customization-density-normal =
    .label = Normal
kavacha-customization-density-comfortable =
    .label = Comfortable
kavacha-customization-toolbar-visible =
    .label = Show the toolbar
kavacha-customization-advanced-header = Advanced CSS
kavacha-customization-advanced-description = Custom chrome CSS is applied live and versioned. Safe mode turns it all off if a rule ever breaks the interface.
kavacha-customization-safemode =
    .label = Custom CSS safe mode
kavacha-customization-css-link = Edit custom CSS in the Studio →
kavacha-customization-more-header = More
kavacha-customization-more-description = Browse installable components and manage plugins.
kavacha-customization-marketplace-link = Open Component Marketplace →
kavacha-customization-plugins-link = Manage Plugins →
pane-kavacha-workspaces-title = Workspaces
kavacha-workspaces-title = Workspaces
kavacha-workspaces-memory-header = Tab memory
kavacha-workspaces-memory-description = Background tabs you haven't opened in a while are put to sleep to free memory, then restored the moment you return to them.
kavacha-workspaces-unload-label = Sleep inactive background tabs after
kavacha-workspaces-unload-suffix = minutes (0 = never)
kavacha-workspaces-sleep-now = Sleep inactive tabs now
kavacha-workspaces-templates-header = New spaces
kavacha-workspaces-templates-description = Start a Space pre-arranged for a way of working. You can rename and reshape it afterwards.
kavacha-workspaces-template-student = Student
kavacha-workspaces-template-developer = Developer
kavacha-workspaces-template-private = Private
kavacha-workspaces-archived-header = Archived spaces
kavacha-workspaces-archived-description = Archived Spaces keep all their tabs and notes — they are just hidden from the strip. Bring one back at any time.
kavacha-workspaces-restore = Restore an archived space…
kavacha-workspaces-more-description = Snapshot, branch, and timeline for a Space live on the ⚙ menu (top right) and in the command palette (Cmd+K).
kavacha-workspaces-isolation-header = Space isolation
kavacha-workspaces-isolation-description = By default, Spaces share one set of logins — sign into Google, GitHub or Slack once and every Space is signed in. Turn this on to give each new template Space its own container instead, so it can hold a separate account for the same site.
kavacha-workspaces-isolate-checkbox =
    .label = Give new template Spaces their own container
kavacha-workspaces-isolation-note = Tracking protection does not depend on this. Total Cookie Protection already separates third-party cookies per site in every Space. Existing Spaces keep whatever container they already have, and the Private template is always isolated.
kavacha-workspaces-session-header = Tabs kept after quitting
kavacha-workspaces-session-description = By default Kavacha restores every tab you had open, like other browsers. Turn this on to keep only the tabs you pinned, so ordinary browsing tabs do not pile up across sessions.
kavacha-workspaces-clear-unpinned-checkbox =
    .label = After quitting, restore only pinned tabs
kavacha-workspaces-session-note = Pinning becomes the explicit "keep this" gesture. Discarded tabs still appear under Recently Closed for the rest of the session, so a mistake is undoable.
kavacha-privacy-search-header = Search engine
kavacha-privacy-search-description = Kavacha searches with Brave Search by default — an independent index that does not profile you. This is a default, not a lock-in: switch to any engine below and Kavacha will remember it.
kavacha-privacy-search-engine-label =
    .label = Default search engine
kavacha-privacy-search-note = Kavacha adds no affiliate or partner code to your searches, whichever engine you pick. Search suggestions stay off until you turn them on, so what you type is not sent anywhere until you press Enter.
kavacha-permissions-header = Site permissions
kavacha-permissions-description = Everything you have allowed or blocked, in one place. Set what Kavacha does by default for each capability, and review the sites you have made exceptions for — without opening each site in turn.
kavacha-permissions-clear-all =
    .label = Clear all site exceptions
kavacha-permissions-clipboard-note = Clipboard is missing from this list on purpose. Firefox does not store clipboard access as a site permission — a page asking to read your clipboard gets a one-time Paste confirmation instead, and nothing is remembered. There is no stored grant for Kavacha to show you or revoke.
kavacha-permissions-sites =
    { $count ->
        [0] No exceptions
        [one] { $count } site
       *[other] { $count } sites
    }
kavacha-permissions-manage =
    .label = Review…
kavacha-permissions-hide =
    .label = Hide
kavacha-permissions-remove =
    .label = Remove
    .tooltiptext = Forget this site's setting and ask again next time
kavacha-permissions-clear-type =
    .label = Clear all
kavacha-permission-default-ask =
    .label = Always ask
kavacha-permission-default-allow =
    .label = Allow
kavacha-permission-default-block =
    .label = Block
kavacha-permission-state-allow = Allowed
kavacha-permission-state-block = Blocked
kavacha-permission-geo = Location
kavacha-permission-camera = Camera
kavacha-permission-microphone = Microphone
kavacha-permission-desktop-notification = Notifications
kavacha-permission-xr = Virtual reality
kavacha-permission-local-network = Local network
kavacha-permission-persistent-storage = Persistent storage
kavacha-permission-midi = MIDI devices
kavacha-permission-speaker-selection = Speaker selection
kavacha-permission-autoplay-media = Autoplay
kavacha-cookies-header = Cookies and site data
kavacha-cookies-description = Kavacha already isolates third-party cookies per site with Total Cookie Protection, so trackers cannot follow you between sites. These rules control how long a site's own cookies survive.
kavacha-cookies-clear-on-close =
    .label = Delete cookies and site data when Kavacha closes
kavacha-cookies-clear-on-close-note = You will be signed out of everything on the next launch, except the sites you mark "Keep" below.
kavacha-cookies-rules-header = Site rules
kavacha-cookies-add-domain =
    .placeholder = example.com
kavacha-cookies-add-session =
    .label = Add as session-only
kavacha-cookies-add-invalid = That does not look like a site address.
kavacha-cookies-empty = No site rules yet. Sites follow the setting above.
kavacha-cookies-state-allow =
    .label = Keep
kavacha-cookies-state-session =
    .label = Session only
kavacha-cookies-state-block =
    .label = Block
    .value = Site
kavacha-cookies-remove =
    .label = Remove
    .tooltiptext = Forget this rule and treat the site like any other
kavacha-cookies-session-note = "Session only" clears that site's stored cookies now and keeps none after you quit, whatever the setting above says — useful for a site you sign into but do not want remembered (you may need to sign in again). "Keep" is the opposite: it survives the delete-on-close sweep.
kavacha-privacy-score-summary =
    { $remaining ->
        [0] Every protection Kavacha can turn on is on.
        [one] { $remaining } protection is off.
       *[other] { $remaining } protections are off.
    }
kavacha-privacy-score-improve = To improve
kavacha-privacy-score-fix =
    .label = Turn on
kavacha-privacy-improve-etp = Use strict tracking protection, which blocks known trackers on every site rather than only in private windows.
kavacha-privacy-improve-tcp = Turn on Total Cookie Protection so each site's cookies are confined to that site.
kavacha-privacy-improve-fpp = Turn on fingerprinting protection, which makes your browser harder to identify by its configuration.
kavacha-privacy-improve-qs = Strip tracking parameters from links you follow, so a click does not carry an identifier.
kavacha-privacy-improve-gpc = Send Global Privacy Control, a legally recognised "do not sell my data" signal.
kavacha-privacy-improve-banners = Reject cookie banners automatically instead of answering them yourself.
kavacha-privacy-improve-doh = Turn on encrypted DNS, so the addresses you look up are not visible to your network.
kavacha-privacy-improve-cookies = Delete cookies and site data when Kavacha closes.
kavacha-privacy-posture-doh = Encrypted DNS
kavacha-privacy-posture-clear-cookies = Delete cookies on close
kavacha-sites-header = Site trust profiles
kavacha-sites-description = Everything Kavacha has stored about one site, in one card — what it may use, and how long its cookies live. Sites appear here once you have allowed, blocked, or set a cookie rule for them.
kavacha-sites-empty = No sites have stored settings yet.
kavacha-sites-picker-label =
    .label = Site
kavacha-sites-cookie-row = Cookies
kavacha-sites-forget =
    .label = Forget this site
    .tooltiptext = Remove every stored permission and cookie rule for this site
kavacha-universal-search-shortcut = Search Everything
kavacha-customization-tabstyle-arc =
    .label = Arc
kavacha-permission-state-ask = Ask every time
kavacha-index-header = Personal index
kavacha-index-description = Kavacha keeps a private, on-device full-text index of the pages you visit, so Search Everything can find a page by what it said — not just its title. It never leaves your device.
kavacha-index-enabled =
    .label = Index the text of pages I visit
kavacha-index-status-label = Indexed
kavacha-index-status = { $pages } pages · { $size }
kavacha-index-clear = Clear index now
kavacha-index-note = Clearing your history also clears this index, and forgetting a site removes it here too — the index never remembers a page longer than your history does.
kavacha-ai-header = Local AI
kavacha-ai-description = Kavacha's AI features run against a model on your own machine (or a server you choose) and never a Kavacha-hosted service. Page text is sent only to the endpoint below, or nowhere.
kavacha-ai-enabled =
    .label = Enable local AI features
kavacha-ai-endpoint-label = Endpoint
kavacha-ai-model-label = Model
kavacha-ai-refresh = Refresh
kavacha-ai-status-label = Status
kavacha-ai-status-disabled = Off
kavacha-ai-status-checking = Checking…
kavacha-ai-status-ready = Ready · { $count } model(s)
kavacha-ai-status-no-models = Runtime found, but no models installed
kavacha-ai-status-unreachable = No local model runtime found
kavacha-ai-note = Availability is checked only when you use an AI feature or open this page — never in the background. Point the endpoint at a local model server such as Ollama (http://localhost:11434).
