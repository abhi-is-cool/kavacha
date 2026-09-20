// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Kavacha citations (ROADMAP Phase 7, "power-user tooling — … citations").
//
// One job: turn the page in front of you into a citation you can paste,
// without retyping what the page already declares about itself. Scholarly
// sites publish `citation_*` meta tags and most others publish OpenGraph, so
// the metadata comes from the page (through the indexer actor, the same
// narrow content channel everything else uses) with the tab title and URL as
// the fallback that always works.
//
// WHAT IT DELIBERATELY IS NOT: a reference manager. There is no library, no
// BibTeX database, no sync, no de-duplication of authors. Kavacha's answer to
// "manage my references" is Zotero, which the Student template already
// recommends (patch 0053); this is the thirty-second job that sending someone
// to a reference manager makes worse — quote a page, cite it, move on.
//
// Three styles, because three cover almost everyone who asks: APA and MLA for
// prose, BibTeX for LaTeX. Each is BEST EFFORT and says so where it matters —
// with no author declared, APA correctly leads with the title rather than
// inventing "Anonymous", and the BibTeX key is derived from the host and year
// rather than from an author who may not exist.

export const KavachaCitationStyles = Object.freeze({
  APA: "apa",
  MLA: "mla",
  BIBTEX: "bibtex",
});

const kStylePref = "kavacha.citation.style";

export const KavachaCitations = {
  get defaultStyle() {
    const value = Services.prefs.getCharPref(
      kStylePref,
      KavachaCitationStyles.APA
    );
    return Object.values(KavachaCitationStyles).includes(value)
      ? value
      : KavachaCitationStyles.APA;
  },

  set defaultStyle(value) {
    if (Object.values(KavachaCitationStyles).includes(value)) {
      Services.prefs.setCharPref(kStylePref, value);
    }
  },

  /** Read what the page says about itself; fall back to the tab. */
  async metadataFor(window) {
    const browser = window.gBrowser?.selectedBrowser;
    const url = browser?.currentURI?.spec || "";
    const fallback = {
      url,
      title: window.gBrowser?.selectedTab?.label || url,
      author: "",
      site: this._host(url),
      published: "",
    };
    if (!/^https?:/.test(url)) {
      return fallback;
    }
    try {
      const actor =
        browser.browsingContext?.currentWindowGlobal?.getActor("KavachaIndexer");
      const meta = await actor?.sendQuery("KavachaIndexer:CaptureMeta");
      if (!meta) {
        return fallback;
      }
      return {
        url: meta.url || url,
        title: meta.title || fallback.title,
        author: meta.author || "",
        site: meta.site || this._host(meta.url || url),
        published: meta.published || "",
      };
    } catch (e) {
      return fallback;
    }
  },

  _host(url) {
    try {
      return new URL(url).host.replace(/^www\./, "");
    } catch (e) {
      return "";
    }
  },

  _year(published) {
    const match = /\d{4}/.exec(String(published || ""));
    return match ? match[0] : "";
  },

  _accessed(date = new Date()) {
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  },

  /** Format metadata in one style. Pure — which is what makes it testable. */
  format(meta, style = KavachaCitationStyles.APA, now = new Date()) {
    const title = (meta.title || meta.url || "").trim();
    const site = (meta.site || this._host(meta.url)).trim();
    const author = (meta.author || "").trim();
    const year = this._year(meta.published);

    switch (style) {
      case KavachaCitationStyles.MLA: {
        // "Author. "Title." Site, Date, URL."
        const parts = [];
        if (author) {
          parts.push(author + ".");
        }
        parts.push(`"${title}."`);
        if (site) {
          parts.push(site + ",");
        }
        if (year) {
          parts.push(year + ",");
        }
        parts.push(meta.url + ".");
        parts.push(`Accessed ${this._accessed(now)}.`);
        return parts.join(" ");
      }

      case KavachaCitationStyles.BIBTEX: {
        // The key is host+year, not author+year: an author is the field most
        // often missing, and a key of "undefined2026" is worse than one that
        // is merely unlovely.
        const key =
          (site || "web").replace(/[^a-z0-9]/gi, "").toLowerCase() +
          (year || String(now.getFullYear()));
        const lines = [
          `@misc{${key},`,
          `  title = {${this._tex(title)}},`,
        ];
        if (author) {
          lines.push(`  author = {${this._tex(author)}},`);
        }
        if (site) {
          lines.push(`  howpublished = {${this._tex(site)}},`);
        }
        if (year) {
          lines.push(`  year = {${year}},`);
        }
        lines.push(`  url = {${meta.url}},`);
        lines.push(`  note = {Accessed ${this._accessed(now)}}`);
        lines.push("}");
        return lines.join("\n");
      }

      default: {
        // APA. With no author, APA leads with the TITLE rather than inventing
        // "Anonymous" — the rule people get wrong by hand, which is half the
        // reason this exists.
        const head = author ? `${author}.` : `${title}.`;
        const dated = year ? ` (${year}).` : " (n.d.).";
        const body = author ? ` ${title}.` : "";
        const where = site ? ` ${site}.` : "";
        return `${head}${dated}${body}${where} ${meta.url}`.replace(/\s+/g, " ").trim();
      }
    }
  },

  // Escape the characters TeX treats as syntax, so a title containing & or %
  // does not silently break someone's build hours later.
  _tex(text) {
    return String(text).replace(/([&%$#_{}])/g, "\\$1");
  },

  /** Read the page, format, copy. Returns the citation text. */
  async copyForWindow(window, style = null) {
    const chosen = style || this.defaultStyle;
    const meta = await this.metadataFor(window);
    const citation = this.format(meta, chosen);
    try {
      Cc["@mozilla.org/widget/clipboardhelper;1"]
        .getService(Ci.nsIClipboardHelper)
        .copyString(citation);
    } catch (e) {
      console.error("KavachaCitations: copy failed", e);
    }
    return citation;
  },

  /**
   * The palette entry: ask which style (remembering the answer as the new
   * default), then copy. A prompt rather than three separate commands,
   * because three near-identical rows in the palette is how a palette stops
   * being useful.
   */
  async promptAndCopy(window) {
    const styles = [
      { id: KavachaCitationStyles.APA, label: "APA" },
      { id: KavachaCitationStyles.MLA, label: "MLA" },
      { id: KavachaCitationStyles.BIBTEX, label: "BibTeX" },
    ];
    const selected = { value: styles.findIndex(s => s.id === this.defaultStyle) };
    const ok = Services.prompt.select(
      window,
      "Kavacha",
      "Copy a citation for this page as:",
      styles.map(s => s.label),
      selected
    );
    if (!ok) {
      return null;
    }
    const style = styles[selected.value]?.id || KavachaCitationStyles.APA;
    this.defaultStyle = style;
    return this.copyForWindow(window, style);
  },
};
