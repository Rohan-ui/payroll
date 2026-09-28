import DOMPurify from 'dompurify';

/**
 * Sanitisation policy for rich text authored inside the app, such as quotation
 * scope bodies and document editor content.
 *
 * This content is stored and later rendered back into the tenant workspace, so
 * an unsanitised value is stored cross-site scripting: script saved by one user
 * would execute for everyone who opens the record, on the tenant origin, with
 * access to whatever that origin holds.
 *
 * DOMPurify is used rather than a hand-written filter because HTML sanitisation
 * has a long tail of parser edge cases (mutation XSS, namespace confusion,
 * malformed markup) that a bespoke implementation reliably gets wrong.
 */

/** Formatting a document editor legitimately produces. */
const ALLOWED_TAGS = [
  'p', 'br', 'hr', 'div', 'span',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'sub', 'sup', 'mark', 'small',
  'ul', 'ol', 'li',
  'blockquote', 'pre', 'code',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
  'a', 'img',
];

const ALLOWED_ATTR = [
  'href', 'target', 'rel', 'title',
  'src', 'alt', 'width', 'height',
  'colspan', 'rowspan',
  'style', 'class', 'align',
];

/**
 * Inline styles are kept because the editor writes them, but only these
 * properties. This blocks the styling tricks used for click-jacking and
 * content spoofing, such as position/z-index overlays.
 */
const ALLOWED_STYLE_PROPERTIES = new Set([
  'color', 'background-color', 'font-size', 'font-family', 'font-weight', 'font-style',
  'text-align', 'text-decoration', 'line-height', 'letter-spacing',
  'margin', 'margin-top', 'margin-bottom', 'margin-left', 'margin-right',
  'padding', 'padding-top', 'padding-bottom', 'padding-left', 'padding-right',
  'border', 'border-color', 'border-width', 'border-style', 'border-collapse',
  'width', 'height', 'vertical-align', 'list-style-type',
]);

/**
 * Attributes on the allow list that never hold a URL. They bypass the URI
 * check so a strict scheme policy does not strip ordinary formatting.
 */
const NON_URL_ATTRIBUTES = [
  'target', 'rel', 'title', 'alt',
  'width', 'height', 'align',
  'colspan', 'rowspan',
];

let hooksInstalled = false;

function installHooks(): void {
  if (hooksInstalled) return;

  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (!(node instanceof Element)) return;

    // Keep only style properties on the allow list.
    const style = node.getAttribute('style');
    if (style) {
      const kept = style
        .split(';')
        .map((declaration) => declaration.trim())
        .filter((declaration) => {
          const property = declaration.split(':')[0]?.trim().toLowerCase();
          if (!property) return false;
          if (!ALLOWED_STYLE_PROPERTIES.has(property)) return false;
          // url() can reference external resources and leak that the content was viewed.
          return !/url\s*\(/i.test(declaration);
        });

      if (kept.length > 0) {
        node.setAttribute('style', `${kept.join('; ')};`);
      } else {
        node.removeAttribute('style');
      }
    }

    // Links that open a new tab must not hand the opener to the destination.
    if (node.tagName === 'A' && node.getAttribute('target') === '_blank') {
      node.setAttribute('rel', 'noopener noreferrer');
    }
  });

  hooksInstalled = true;
}

/**
 * Returns the value with anything executable removed. Safe to call on both the
 * write path and the render path; it is idempotent.
 */
export function sanitizeRichText(html: string | null | undefined): string {
  if (!html) return '';

  installHooks();

  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    // Block every URI scheme that can execute, such as javascript: and data:.
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:|#|\/)/i,
    // The regexp above is applied to any attribute not known to be non-URL,
    // which would otherwise strip ordinary values like colspan="2". These
    // carry no URL, so they skip that check. href and src are deliberately
    // absent so they stay subject to it.
    ADD_URI_SAFE_ATTR: NON_URL_ATTRIBUTES,
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'link', 'base'],
    FORBID_ATTR: ['srcset', 'formaction', 'xlink:href'],
    // Reject markup that changes meaning when re-parsed (mutation XSS).
    SANITIZE_DOM: true,
    KEEP_CONTENT: true,
  });
}

/** Convenience wrapper for React's dangerouslySetInnerHTML. */
export function sanitizedHtmlProps(html: string | null | undefined): {
  dangerouslySetInnerHTML: { __html: string };
} {
  return { dangerouslySetInnerHTML: { __html: sanitizeRichText(html) } };
}
