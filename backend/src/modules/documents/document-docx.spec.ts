import { DocumentDocxService } from './document-docx.service';
import { DocNode } from './rich-document';

describe('DocumentDocxService', () => {
  let service: DocumentDocxService;

  beforeEach(() => {
    service = new DocumentDocxService();
  });

  it('renders a valid .docx document buffer with paragraphs and headings', async () => {
    const docNode: DocNode = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1, textAlign: 'center' },
          content: [{ type: 'text', text: 'OFFER LETTER' }],
        },
        {
          type: 'paragraph',
          attrs: { textAlign: 'justify', spaceBefore: 12, spaceAfter: 6 },
          content: [{ type: 'text', text: 'We are pleased to offer you employment.' }],
        },
      ],
    };

    const buffer = await service.render(docNode, {
      title: 'Offer Letter',
      companyName: 'RND Technosoft',
    });

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(1000);
    // DOCX files are zip archives starting with 'PK' (0x50 0x4B 0x03 0x04)
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
  });

  it('renders custom tables with rows, columns, merged cells, borders, and shading in DOCX', async () => {
    const tableDoc: DocNode = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [{ type: 'text', text: 'SALARY STRUCTURE (ANNEXURE-A)' }],
        },
        {
          type: 'table',
          attrs: { alignment: 'center' },
          content: [
            {
              type: 'tableRow',
              attrs: { rowHeight: 28 },
              content: [
                {
                  type: 'tableHeader',
                  attrs: {
                    colspan: 3,
                    backgroundColor: '#e2e8f0',
                    borderTop: '1pt solid #000000',
                    borderBottom: '1pt solid #000000',
                    textAlign: 'center',
                    verticalAlign: 'middle',
                  },
                  content: [
                    {
                      type: 'paragraph',
                      attrs: { textAlign: 'center' },
                      content: [{ type: 'text', text: 'Compensation Breakdown', marks: [{ type: 'bold' }] }],
                    },
                  ],
                },
              ],
            },
            {
              type: 'tableRow',
              content: [
                {
                  type: 'tableHeader',
                  attrs: { colwidth: [80], borderBottom: '1pt solid #000000' },
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Sec' }] }],
                },
                {
                  type: 'tableHeader',
                  attrs: { colwidth: [240], borderBottom: '1pt solid #000000' },
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Head Of Account' }] }],
                },
                {
                  type: 'tableHeader',
                  attrs: { colwidth: [120], borderBottom: '1pt solid #000000', textAlign: 'right' },
                  content: [{ type: 'paragraph', attrs: { textAlign: 'right' }, content: [{ type: 'text', text: 'Amount (INR)' }] }],
                },
              ],
            },
            {
              type: 'tableRow',
              content: [
                {
                  type: 'tableCell',
                  attrs: { rowspan: 2, verticalAlign: 'middle', textAlign: 'center', borderRight: '0.5pt solid #000000' },
                  content: [{ type: 'paragraph', attrs: { textAlign: 'center' }, content: [{ type: 'text', text: 'A' }] }],
                },
                {
                  type: 'tableCell',
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Basic Salary' }] }],
                },
                {
                  type: 'tableCell',
                  attrs: { textAlign: 'right' },
                  content: [{ type: 'paragraph', attrs: { textAlign: 'right' }, content: [{ type: 'text', text: '50,000.00' }] }],
                },
              ],
            },
            {
              type: 'tableRow',
              content: [
                {
                  type: 'tableCell',
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'House Rent Allowance' }] }],
                },
                {
                  type: 'tableCell',
                  attrs: { textAlign: 'right' },
                  content: [{ type: 'paragraph', attrs: { textAlign: 'right' }, content: [{ type: 'text', text: '25,000.00' }] }],
                },
              ],
            },
          ],
        },
      ],
    };

    const buffer = await service.render(tableDoc, {
      title: 'Salary Structure',
      companyName: 'RND Technosoft',
    });

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(1500);
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
  });
});
