// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Content half of the Kavacha personal index (ADR 0012). After a page settles,
// ships title + capped innerText to the parent, which is the policy gate
// (enabled pref, private windows, attribution). Top frames only; the actor is
// registered for http/https matches.

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  // A CHROME timer, not this.contentWindow.setTimeout: the content timer is
  // throttled and frozen with the page (background tabs, bfcache), so the
  // delayed capture would fire only sometimes. This one is reliable.
  setTimeout: "resource://gre/modules/Timer.sys.mjs",
});

// innerText over Readability on purpose: this index exists for RECALL, not
// reading view, and body.innerText is dependency-free and good enough for
// substring match (ADR 0012). 32k chars (~5000 words) keeps the store — and
// the LIKE scans over it — bounded; the lead of a page carries the recall
// signal anyway.
const kCaptureDelayMs = 2500;
const kMaxChars = 32_000;

export class KavachaIndexerChild extends JSWindowActorChild {
  #captured = false;

  // Two triggers, because ONE is not reliable enough for a passive indexer:
  // DOMContentLoaded catches the common case early but its delayed capture can
  // miss on a fast load; `pageshow` is delivered after the full load (and on
  // bfcache restore) and reliably fires. Whichever wins first captures; the
  // parent upserts by URL, and #captured guards against indexing the same load
  // twice within the actor's life, so a second trigger is harmless.
  handleEvent(event) {
    if (event.type !== "DOMContentLoaded" && event.type !== "pageshow") {
      return;
    }
    // Top frame only — iframes get their own actor instances.
    if (this.browsingContext !== this.browsingContext.top) {
      return;
    }
    if (!this.contentWindow) {
      return;
    }
    lazy.setTimeout(() => this.#capture(), kCaptureDelayMs);
  }

  didDestroy() {
    // Window gone before a delay elapsed — nothing to do; the timers died with
    // their window. Kept explicit so nobody "fixes" a leak that isn't one.
  }

  // On-demand extraction for the AI sidebar (ADR 0014). Returns the text
  // rather than sending it to the index: summarizing what you are looking at
  // must not depend on having STORED it, so this path works with the index
  // switched off and stores nothing by itself.
  //
  // Patch 0082 adds a second, narrower query: the current SELECTION, for the
  // knowledge sidebar's highlight. Same actor rather than a new one, because
  // the policy that matters — http/https only, top frame, nothing stored as a
  // side effect — is already stated here and would otherwise be restated
  // (and eventually diverge) somewhere else.
  receiveMessage(message) {
    if (
      message.name !== "KavachaIndexer:Capture" &&
      message.name !== "KavachaIndexer:CaptureSelection" &&
      message.name !== "KavachaIndexer:CaptureMeta"
    ) {
      return null;
    }
    try {
      const doc = this.document;
      if (!doc || !/^https?:$/.test(doc.location?.protocol || "")) {
        return null;
      }
      // Patch 0087: the metadata a citation is built from. Scholarly sites
      // publish `citation_*` meta tags and most others publish OpenGraph, so
      // reading them beats asking the user to retype what the page already
      // says. Returned raw — the citation formatter does the deciding.
      if (message.name === "KavachaIndexer:CaptureMeta") {
        const meta = name => {
          const node =
            doc.querySelector(`meta[name="${name}" i]`) ||
            doc.querySelector(`meta[property="${name}" i]`);
          return (node?.getAttribute("content") || "").trim();
        };
        return {
          url: doc.location.href,
          title: meta("citation_title") || meta("og:title") || doc.title || "",
          author:
            meta("citation_author") || meta("author") || meta("article:author"),
          site: meta("og:site_name") || meta("citation_journal_title"),
          published:
            meta("citation_publication_date") ||
            meta("article:published_time") ||
            meta("date"),
        };
      }
      let text;
      if (message.name === "KavachaIndexer:CaptureSelection") {
        // No selection is not an error: the sidebar says "select something
        // first", which is better than saving an empty highlight.
        text = String(this.contentWindow?.getSelection?.() || "").trim();
        if (!text) {
          return null;
        }
      } else {
        text = (doc.body?.innerText || "").slice(0, kMaxChars).trim();
      }
      return {
        url: doc.location.href,
        title: doc.title || "",
        text: text.slice(0, kMaxChars),
      };
    } catch (e) {
      return null;
    }
  }

  #capture() {
    if (this.#captured) {
      return;
    }
    try {
      const doc = this.document;
      const win = this.contentWindow;
      if (!doc || !win || !/^https?:$/.test(doc.location?.protocol || "")) {
        return;
      }
      const text = (doc.body?.innerText || "").slice(0, kMaxChars).trim();
      if (!text) {
        return;
      }
      this.#captured = true;
      this.sendAsyncMessage("KavachaIndexer:PageText", {
        url: doc.location.href,
        title: doc.title || "",
        text,
      });
    } catch (e) {
      // Indexing must never break a page. Swallow and move on.
    }
  }
}
