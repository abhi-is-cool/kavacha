// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Kavacha markdown renderer (ROADMAP Phase 2 follow-up: "Markdown rendering in
// workspace notes").
//
// A deliberately small CommonMark SUBSET, rendered by BUILDING DOM NODES —
// never by assigning a string to innerHTML. That is the whole security design
// and it is not negotiable: workspace notes are chrome-privileged content
// (the notes panel lives in the browser window, not in a content document), so
// a single innerHTML on user text would turn "I pasted a snippet into my
// notes" into script execution with system privileges. Because this renderer
// only ever calls createElement/createTextNode there is no HTML parse step at
// all and so no sanitiser to get wrong — raw HTML in a note renders as the
// literal characters the user typed, which is also the honest behaviour for a
// notes field.
//
// Link hrefs are additionally scheme-checked (http/https/mailto only), so a
// `[click](javascript:...)` note cannot produce a clickable javascript: URI.
// Anything else renders as plain text rather than being silently dropped —
// the user should see what they wrote.
//
// Supported: ATX headings, fenced and indented code, blockquotes, unordered
// and ordered lists, thematic breaks, paragraphs, and inline code / strong /
// emphasis / links. Everything else is text.
//
// The renderer is a pure function of (markdown, document): it touches no
// globals, which is what lets it be unit-tested outside a browser.

const kSafeLinkSchemes = new Set(["http:", "https:", "mailto:"]);

// Both renderers recurse: blockquotes nest blocks, emphasis nests inlines. The
// input is a text field the user can paste anything into, and `"> ".repeat(n)`
// is n levels of recursion and n levels of DOM for one pasted line. Past a
// handful of levels the nesting is not meaningful to a reader anyway, so cap
// it and render the remainder flat rather than growing the stack.
const kMaxBlockDepth = 8;
const kMaxInlineDepth = 12;

/** True if `href` is a scheme we are willing to make clickable. */
function isSafeHref(href) {
  try {
    return kSafeLinkSchemes.has(
      new URL(href, "https://invalid.invalid/").protocol
    );
  } catch (e) {
    return false;
  }
}

// ---------------------------------------------------------------- inline ---

// Inline grammar, tried in order at each position. Kept as an ordered table so
// the precedence is readable: code spans win over emphasis (so `*` inside
// backticks stays literal), and `**` must be tried before `*`.
const INLINE_RULES = [
  { re: /^`([^`\n]+)`/, tag: "code", raw: true },
  { re: /^\*\*([^*\n]+)\*\*/, tag: "strong" },
  { re: /^__([^_\n]+)__/, tag: "strong" },
  { re: /^\*([^*\n]+)\*/, tag: "em" },
  { re: /^_([^_\n]+)_/, tag: "em" },
];

const LINK_RE = /^\[([^\]\n]*)\]\(([^)\s]+)\)/;

/**
 * Append the inline rendering of `text` to `parent`.
 *
 * @param {string} text One logical line (or joined paragraph) of markdown.
 * @param {Node} parent Node to append into.
 * @param {Document} doc Owner document.
 * @param {number} depth Current nesting depth; at the cap everything left is
 *   emitted as literal text instead of recursing.
 */
function renderInline(text, parent, doc, depth = 0) {
  if (depth >= kMaxInlineDepth) {
    if (text) {
      parent.appendChild(doc.createTextNode(text));
    }
    return;
  }
  let rest = text;
  let literal = "";

  const flush = () => {
    if (literal) {
      parent.appendChild(doc.createTextNode(literal));
      literal = "";
    }
  };

  while (rest) {
    const link = LINK_RE.exec(rest);
    if (link && isSafeHref(link[2])) {
      flush();
      const a = doc.createElement("a");
      a.setAttribute("href", link[2]);
      // Notes are chrome UI: a note's link must not be able to reach its
      // opener, and this panel is not a browsing context we want replaced.
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noopener noreferrer");
      renderInline(link[1], a, doc, depth + 1);
      parent.appendChild(a);
      rest = rest.slice(link[0].length);
      continue;
    }

    let matched = false;
    for (const rule of INLINE_RULES) {
      const m = rule.re.exec(rest);
      if (!m) {
        continue;
      }
      flush();
      const el = doc.createElement(rule.tag);
      if (rule.raw) {
        el.appendChild(doc.createTextNode(m[1]));
      } else {
        renderInline(m[1], el, doc, depth + 1);
      }
      parent.appendChild(el);
      rest = rest.slice(m[0].length);
      matched = true;
      break;
    }
    if (matched) {
      continue;
    }

    // No rule applied here: take exactly one character as literal text and
    // advance. Consuming one character is what guarantees termination — every
    // branch of this loop shortens `rest`.
    literal += rest[0];
    rest = rest.slice(1);
  }
  flush();
}

// ----------------------------------------------------------------- block ---

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const UL_RE = /^[-*+]\s+(.*)$/;
const OL_RE = /^(\d+)[.)]\s+(.*)$/;
const HR_RE = /^\s*([-*_])(?:\s*\1){2,}\s*$/;
const FENCE_RE = /^\s*(```|~~~)\s*(\S*)\s*$/;
const QUOTE_RE = /^>\s?(.*)$/;
const INDENTED_RE = /^(?: {4}|\t)/;

export const KavachaMarkdown = {
  /**
   * Render markdown to a DocumentFragment of chrome DOM nodes.
   *
   * @param {string} markdown Source text.
   * @param {Document} doc Document used to create the nodes.
   * @returns {DocumentFragment} Newly built nodes; never reuses `doc`'s tree.
   */
  render(markdown, doc, depth = 0) {
    const frag = doc.createDocumentFragment();
    const lines = String(markdown ?? "")
      .replace(/\r\n?/g, "\n")
      .split("\n");
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      if (!line.trim()) {
        i++;
        continue;
      }

      const fence = FENCE_RE.exec(line);
      if (fence) {
        const marker = fence[1];
        const body = [];
        i++;
        while (i < lines.length) {
          const closing = FENCE_RE.exec(lines[i]);
          if (closing && closing[1] === marker) {
            i++;
            break;
          }
          body.push(lines[i]);
          i++;
        }
        frag.appendChild(this._codeBlock(body.join("\n"), fence[2], doc));
        continue;
      }

      if (HR_RE.test(line)) {
        frag.appendChild(doc.createElement("hr"));
        i++;
        continue;
      }

      const heading = HEADING_RE.exec(line);
      if (heading) {
        const h = doc.createElement("h" + heading[1].length);
        renderInline(heading[2].trim(), h, doc);
        frag.appendChild(h);
        i++;
        continue;
      }

      if (QUOTE_RE.test(line)) {
        const body = [];
        while (i < lines.length && QUOTE_RE.test(lines[i])) {
          body.push(QUOTE_RE.exec(lines[i])[1]);
          i++;
        }
        const quote = doc.createElement("blockquote");
        if (depth + 1 >= kMaxBlockDepth) {
          // At the cap: keep the quote element, drop the nesting.
          const flat = doc.createElement("p");
          renderInline(body.join(" "), flat, doc);
          quote.appendChild(flat);
        } else {
          quote.appendChild(this.render(body.join("\n"), doc, depth + 1));
        }
        frag.appendChild(quote);
        continue;
      }

      if (UL_RE.test(line) || OL_RE.test(line)) {
        const ordered = !UL_RE.test(line);
        const list = doc.createElement(ordered ? "ol" : "ul");
        while (i < lines.length) {
          const m = ordered ? OL_RE.exec(lines[i]) : UL_RE.exec(lines[i]);
          if (!m) {
            break;
          }
          const li = doc.createElement("li");
          renderInline(ordered ? m[2] : m[1], li, doc);
          list.appendChild(li);
          i++;
        }
        frag.appendChild(list);
        continue;
      }

      // Indented code: four spaces or a tab, run until the indent stops.
      if (INDENTED_RE.test(line)) {
        const body = [];
        while (i < lines.length && INDENTED_RE.test(lines[i])) {
          body.push(lines[i].replace(INDENTED_RE, ""));
          i++;
        }
        frag.appendChild(this._codeBlock(body.join("\n"), "", doc));
        continue;
      }

      // Paragraph: consume until a blank line or the start of another block.
      const para = [];
      while (
        i < lines.length &&
        lines[i].trim() &&
        !this._startsBlock(lines[i])
      ) {
        para.push(lines[i].trim());
        i++;
      }
      if (!para.length) {
        // Defensive: _startsBlock claimed this line begins a block, but every
        // branch above declined it. Emit it as a paragraph and advance rather
        // than spinning forever.
        para.push(lines[i].trim());
        i++;
      }
      const p = doc.createElement("p");
      renderInline(para.join(" "), p, doc);
      frag.appendChild(p);
    }

    return frag;
  },

  _codeBlock(text, language, doc) {
    const pre = doc.createElement("pre");
    const code = doc.createElement("code");
    if (language) {
      code.setAttribute("data-language", language);
    }
    code.appendChild(doc.createTextNode(text));
    pre.appendChild(code);
    return pre;
  },

  // Whether a line begins a new block, and so must not be swallowed into the
  // paragraph currently being accumulated.
  _startsBlock(line) {
    return (
      HEADING_RE.test(line) ||
      HR_RE.test(line) ||
      FENCE_RE.test(line) ||
      QUOTE_RE.test(line) ||
      UL_RE.test(line) ||
      OL_RE.test(line) ||
      INDENTED_RE.test(line)
    );
  },
};
