// Kavacha default preferences — privacy is a default, not a feature.
//
// Shipped as a default prefs file (ends up in defaults/pref/ in the built app),
// applied on top of Zen's defaults. Users can override anything in about:config;
// these are defaults, not locks.
//
// Rule: every pref here needs a comment saying what it protects against.
// Changing any value in this file is a release blocker requiring explicit review.

// ---------------------------------------------------------------------------
// Telemetry & data reporting — Kavacha sends nothing home.
// ---------------------------------------------------------------------------
pref("datareporting.healthreport.uploadEnabled", false);
pref("datareporting.policy.dataSubmissionEnabled", false);
pref("toolkit.telemetry.enabled", false);
pref("toolkit.telemetry.unified", false);
pref("toolkit.telemetry.archive.enabled", false);
pref("toolkit.telemetry.newProfilePing.enabled", false);
pref("toolkit.telemetry.updatePing.enabled", false);
pref("toolkit.telemetry.firstShutdownPing.enabled", false);
pref("toolkit.telemetry.shutdownPingSender.enabled", false);
pref("toolkit.telemetry.bhrPing.enabled", false);
pref("toolkit.telemetry.server", "data:,");
pref("toolkit.coverage.opt-out", true);
pref("browser.ping-centre.telemetry", false);
pref("browser.newtabpage.activity-stream.feeds.telemetry", false);
pref("browser.newtabpage.activity-stream.telemetry", false);

// Crash reports: never auto-submit. (Manual submission stays possible.)
pref("browser.tabs.crashReporting.sendReport", false);
pref("breakpad.reportURL", "");

// Shield studies / experiments: Kavacha does not experiment on users.
pref("app.shield.optoutstudies.enabled", false);
pref("app.normandy.enabled", false);
pref("app.normandy.api_url", "");
pref("messaging-system.rsexperimentloader.enabled", false);

// ---------------------------------------------------------------------------
// Advertising, sponsorship, recommendations — none.
// ---------------------------------------------------------------------------
pref("extensions.pocket.enabled", false);
pref("browser.newtabpage.activity-stream.showSponsored", false);
pref("browser.newtabpage.activity-stream.showSponsoredTopSites", false);
pref("browser.newtabpage.activity-stream.feeds.section.topstories", false);
pref("browser.urlbar.suggest.quicksuggest.sponsored", false);
pref("browser.urlbar.suggest.quicksuggest.nonsponsored", false);
pref("browser.discovery.enabled", false);
pref("extensions.getAddons.showPane", true); // keep add-on discovery UI, but:
pref("extensions.htmlaboutaddons.recommendations.enabled", false);
// Privacy-preserving ad attribution: off — it is still an advertising API.
pref("dom.private-attribution.submission.enabled", false);

// ---------------------------------------------------------------------------
// Tracking protection — strict by default.
// ---------------------------------------------------------------------------
pref("browser.contentblocking.category", "strict");
pref("privacy.trackingprotection.enabled", true);
pref("privacy.trackingprotection.pbmode.enabled", true);
pref("privacy.trackingprotection.socialtracking.enabled", true);
pref("privacy.trackingprotection.emailtracking.enabled", true);
pref("privacy.trackingprotection.cryptomining.enabled", true);
pref("privacy.trackingprotection.fingerprinting.enabled", true);

// Total Cookie Protection: isolate cookies per site (dashboard's "cookies isolated").
pref("network.cookie.cookieBehavior", 5);
pref("network.cookie.cookieBehavior.pbmode", 5);

// Fingerprinting protection (FPP, not RFP — RFP breaks too many sites for a default).
pref("privacy.fingerprintingProtection", true);
pref("privacy.fingerprintingProtection.pbmode", true);

// Strip known tracking params from URLs; enable Global Privacy Control.
pref("privacy.query_stripping.enabled", true);
pref("privacy.query_stripping.enabled.pbmode", true);
pref("privacy.globalprivacycontrol.enabled", true);

// Referrer: trim cross-origin referrers to origin only.
pref("network.http.referer.XOriginTrimmingPolicy", 2);

// ---------------------------------------------------------------------------
// Network-level leaks
// ---------------------------------------------------------------------------
// No speculative connections/prefetch — the browser should not talk to sites
// the user never clicked.
pref("network.prefetch-next", false);
pref("network.dns.disablePrefetch", true);
pref("network.predictor.enabled", false);
pref("browser.urlbar.speculativeConnect.enabled", false);
// Captive portal & connectivity beacons off (they ping third-party endpoints).
pref("network.captive-portal-service.enabled", false);
pref("network.connectivity-service.enabled", false);
// Disable hyperlink auditing (<a ping>) and beacon-style click tracking.
pref("browser.send_pings", false);

// ---------------------------------------------------------------------------
// Search & new tab
// ---------------------------------------------------------------------------
// Default engine is Brave Search — wired via search config (see privacy/README.md);
// engine choice pref intentionally not hardcoded here.
// No search suggestions to any engine until the user opts in.
pref("browser.search.suggest.enabled", false);
pref("browser.urlbar.suggest.searches", false);
pref("browser.newtabpage.activity-stream.default.sites", "");

// ---------------------------------------------------------------------------
// Cookie intelligence — handle consent banners for the user (reject tracking
// where the site supports it, instead of asking "Accept cookies?").
// Uses Firefox's built-in Cookie Banner Blocker; mode 1 = reject-all when
// possible, do nothing otherwise (never silently accepts).
// ---------------------------------------------------------------------------
pref("cookiebanners.service.mode", 1);
pref("cookiebanners.service.mode.privateBrowsing", 1);

// ---------------------------------------------------------------------------
// Misc data-sharing defaults
// ---------------------------------------------------------------------------
// Password manager: keep local manager, disable breach-alert network calls for now.
pref("signon.management.page.breach-alerts.enabled", false);
// Form autofill telemetry-adjacent heuristics stay local; no change needed.
// WebRTC: don't leak local IPs when not in a call.
pref("media.peerconnection.ice.default_address_only", true);
