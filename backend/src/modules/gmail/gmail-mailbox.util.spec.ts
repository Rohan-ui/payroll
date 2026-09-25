import { emailTextPreview, extractTextFromHtml, inspectBodyStructure } from './gmail-mailbox.util';

describe('inspectBodyStructure', () => {
  it('finds nested text bodies and attachments without treating attachments as message bodies', () => {
    const parts = inspectBodyStructure({
      type: 'multipart/mixed',
      childNodes: [
        {
          type: 'multipart/alternative',
          childNodes: [
            { part: '1.1', type: 'text/plain', size: 20 },
            { part: '1.2', type: 'text/html', size: 40 },
          ],
        },
        {
          part: '2',
          type: 'application/pdf',
          size: 123456,
          disposition: 'attachment',
          dispositionParameters: { filename: 'invoice.pdf' },
        },
      ],
    });

    expect(parts).toEqual({
      plain: ['1.1'],
      html: ['1.2'],
      attachments: [{ id: '2', filename: 'invoice.pdf', contentType: 'application/pdf', size: 123456 }],
    });
  });

  it('extracts readable text from email HTML without leaking markup or image placeholders', () => {
    const html = `
      <style>.hidden { display: none }</style>
      <p>Hello&nbsp;<strong>Sahil</strong> &amp; team.</p>
      <img alt="Tracking image" src="https://example.com/tracker.gif">
      <div>Invoice &#35;42 is ready.</div>
      <span class="truncated"
    `;

    expect(extractTextFromHtml(html)).toBe('Hello Sahil & team.\nInvoice #42 is ready.');
    expect(
      emailTextPreview(
        `[image: Logo] @font-face{font-family:Tracker;src:url(https://example.com/font.woff2)} \u034f [https://example.com/tracker.gif] ${html}`,
      ),
    ).toBe('Hello Sahil & team. Invoice #42 is ready.');
  });
});
