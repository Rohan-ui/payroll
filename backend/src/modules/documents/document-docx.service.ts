import { Injectable } from '@nestjs/common';
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  UnderlineType,
  WidthType,
} from 'docx';
import { DocMark, DocNode, FontKey } from './rich-document';
import { PageMargins, PdfLayout, uniformMargins } from './document-pdf.service';

type AlignmentTypeValue = (typeof AlignmentType)[keyof typeof AlignmentType];
type HeadingLevelValue = (typeof HeadingLevel)[keyof typeof HeadingLevel];

const MM_TO_TWIP = 56.6929;
const PT_TO_HALF_PT = 2;
const PT_TO_TWIP = 20;

const FONT_MAP: Record<FontKey | string, string> = {
  helvetica: 'Arial',
  times: 'Times New Roman',
  courier: 'Courier New',
};

export interface DocxOptions {
  title?: string;
  companyName?: string;
  reference?: string;
  layout?: {
    pageSize?: 'A4' | 'LETTER';
    marginsMm?: PageMargins;
    showPageNumbers?: boolean;
    companyName?: string;
  };
}

@Injectable()
export class DocumentDocxService {
  async render(docNode: DocNode, options: DocxOptions = {}): Promise<Buffer> {
    const margins = options.layout?.marginsMm ?? uniformMargins(20);
    const showPageNumbers = options.layout?.showPageNumbers ?? true;
    const companyName = options.companyName ?? options.layout?.companyName ?? '';

    const children: (Paragraph | Table)[] = [];

    if (docNode && docNode.content && Array.isArray(docNode.content)) {
      for (const child of docNode.content) {
        this.convertNode(child, children);
      }
    }

    if (children.length === 0) {
      children.push(new Paragraph({ text: options.title || 'Document' }));
    }

    const doc = new Document({
      title: options.title,
      creator: companyName || 'HRMS',
      description: options.reference,
      sections: [
        {
          properties: {
            page: {
              size: {
                width: options.layout?.pageSize === 'LETTER' ? 12240 : 11906, // A4 default
                height: options.layout?.pageSize === 'LETTER' ? 15840 : 16838,
              },
              margin: {
                top: Math.round(margins.top * MM_TO_TWIP),
                right: Math.round(margins.right * MM_TO_TWIP),
                bottom: Math.round(margins.bottom * MM_TO_TWIP),
                left: Math.round(margins.left * MM_TO_TWIP),
              },
            },
          },
          headers: companyName
            ? {
                default: new Header({
                  children: [
                    new Paragraph({
                      alignment: AlignmentType.RIGHT,
                      children: [
                        new TextRun({
                          text: companyName,
                          bold: true,
                          size: 18,
                          color: '666666',
                        }),
                      ],
                    }),
                  ],
                }),
              }
            : undefined,
          footers: showPageNumbers
            ? {
                default: new Footer({
                  children: [
                    new Paragraph({
                      alignment: AlignmentType.CENTER,
                      children: [
                        new TextRun({
                          children: ['Page ', PageNumber.CURRENT, ' of ', PageNumber.TOTAL_PAGES],
                          size: 18,
                          color: '888888',
                        }),
                      ],
                    }),
                  ],
                }),
              }
            : undefined,
          children,
        },
      ],
    });

    return await Packer.toBuffer(doc);
  }

  private convertNode(node: DocNode, output: (Paragraph | Table)[], depth = 0) {
    switch (node.type) {
      case 'paragraph': {
        output.push(this.createParagraph(node));
        break;
      }
      case 'heading': {
        output.push(this.createHeading(node));
        break;
      }
      case 'bulletList': {
        if (node.content) {
          for (const item of node.content) {
            this.convertListItem(item, output, 'bullet', depth);
          }
        }
        break;
      }
      case 'orderedList': {
        let index = Number(node.attrs?.start ?? 1);
        if (node.content) {
          for (const item of node.content) {
            this.convertListItem(item, output, 'ordered', depth, index++);
          }
        }
        break;
      }
      case 'horizontalRule': {
        output.push(
          new Paragraph({
            border: {
              bottom: {
                color: '999999',
                space: 1,
                style: BorderStyle.SINGLE,
                size: 6,
              },
            },
            spacing: { before: 120, after: 120 },
          }),
        );
        break;
      }
      case 'compensationTable': {
        output.push(this.createCompensationTable());
        break;
      }
      default: {
        if (node.content) {
          for (const child of node.content) {
            this.convertNode(child, output, depth);
          }
        }
        break;
      }
    }
  }

  private convertListItem(itemNode: DocNode, output: (Paragraph | Table)[], listType: 'bullet' | 'ordered', depth: number, index = 1) {
    if (!itemNode.content) return;
    for (const child of itemNode.content) {
      if (child.type === 'paragraph') {
        const p = this.createParagraph(child, {
          bullet: listType === 'bullet' ? { level: depth } : undefined,
          prefix: listType === 'ordered' ? `${index}. ` : undefined,
        });
        output.push(p);
      } else {
        this.convertNode(child, output, depth + 1);
      }
    }
  }

  private getAlignment(textAlign?: string | null): AlignmentTypeValue {
    if (textAlign === 'center') return AlignmentType.CENTER;
    if (textAlign === 'right') return AlignmentType.RIGHT;
    if (textAlign === 'justify') return AlignmentType.JUSTIFIED;
    return AlignmentType.LEFT;
  }

  private createParagraph(node: DocNode, options: { bullet?: { level: number }; prefix?: string } = {}): Paragraph {
    const attrs = node.attrs ?? {};
    const textRuns: TextRun[] = [];

    if (options.prefix) {
      textRuns.push(new TextRun({ text: options.prefix, bold: true, size: 22 }));
    }

    if (node.content) {
      for (const inline of node.content) {
        this.convertInline(inline, textRuns);
      }
    }

    const beforeTwips = typeof attrs.spaceBefore === 'number' ? Math.round(attrs.spaceBefore * PT_TO_TWIP) : 0;
    const afterTwips = typeof attrs.spaceAfter === 'number' ? Math.round(attrs.spaceAfter * PT_TO_TWIP) : 120;
    const indentTwips = typeof attrs.indent === 'number' ? Math.round(attrs.indent * MM_TO_TWIP) : undefined;

    return new Paragraph({
      alignment: this.getAlignment(attrs.textAlign as string),
      spacing: {
        before: beforeTwips,
        after: afterTwips,
        line: attrs.lineHeight ? Math.round(Number(attrs.lineHeight) * 240) : undefined,
      },
      indent: indentTwips ? { left: indentTwips } : undefined,
      bullet: options.bullet,
      children: textRuns,
    });
  }

  private createHeading(node: DocNode): Paragraph {
    const attrs = node.attrs ?? {};
    const levelNum = Number(attrs.level ?? 1);
    const textRuns: TextRun[] = [];

    if (node.content) {
      for (const inline of node.content) {
        this.convertInline(inline, textRuns, { isHeading: true, headingLevel: levelNum });
      }
    }

    let heading: HeadingLevelValue = HeadingLevel.HEADING_1;
    if (levelNum === 2) heading = HeadingLevel.HEADING_2;
    else if (levelNum === 3) heading = HeadingLevel.HEADING_3;
    else if (levelNum === 4) heading = HeadingLevel.HEADING_4;

    const beforeTwips = typeof attrs.spaceBefore === 'number' ? Math.round(attrs.spaceBefore * PT_TO_TWIP) : (levelNum === 1 ? 0 : 200);
    const afterTwips = typeof attrs.spaceAfter === 'number' ? Math.round(attrs.spaceAfter * PT_TO_TWIP) : 160;

    return new Paragraph({
      heading,
      alignment: this.getAlignment(attrs.textAlign as string),
      spacing: { before: beforeTwips, after: afterTwips },
      children: textRuns,
    });
  }

  private convertInline(node: DocNode, output: TextRun[], context: { isHeading?: boolean; headingLevel?: number } = {}) {
    if (node.type === 'hardBreak') {
      output.push(new TextRun({ break: 1 }));
      return;
    }

    const text = node.type === 'placeholder' ? `{{${node.attrs?.key}}}` : node.text ?? '';
    if (!text) return;

    let bold = Boolean(context.isHeading);
    let italics = false;
    let underline = false;
    let strike = false;
    let subScript = false;
    let superScript = false;
    let fontSize = context.isHeading ? (context.headingLevel === 1 ? 32 : context.headingLevel === 2 ? 26 : 22) : 22;
    let color: string | undefined = undefined;
    let font: string = 'Arial';

    if (node.marks) {
      for (const m of node.marks) {
        if (m.type === 'bold') bold = true;
        if (m.type === 'italic') italics = true;
        if (m.type === 'underline') underline = true;
        if (m.type === 'strike') strike = true;
        if (m.type === 'subscript') subScript = true;
        if (m.type === 'superscript') superScript = true;
        if (m.type === 'textStyle' && m.attrs) {
          if (m.attrs.fontFamily && FONT_MAP[m.attrs.fontFamily]) {
            font = FONT_MAP[m.attrs.fontFamily];
          }
          if (typeof m.attrs.fontSize === 'number') {
            fontSize = Math.round(m.attrs.fontSize * PT_TO_HALF_PT);
          }
          if (m.attrs.color && /^#[0-9a-f]{6}$/i.test(m.attrs.color)) {
            color = m.attrs.color.replace('#', '');
          }
        }
      }
    }

    output.push(
      new TextRun({
        text,
        bold,
        italics,
        underline: underline ? { type: UnderlineType.SINGLE } : undefined,
        strike,
        subScript,
        superScript,
        size: fontSize,
        color,
        font: { name: font },
      }),
    );
  }

  private createCompensationTable(): Table {
    const cellBorder = {
      top: { style: BorderStyle.SINGLE, size: 4, color: 'D0D0D0' },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: 'D0D0D0' },
      left: { style: BorderStyle.SINGLE, size: 4, color: 'D0D0D0' },
      right: { style: BorderStyle.SINGLE, size: 4, color: 'D0D0D0' },
    };

    const headerCell = (text: string, align: AlignmentTypeValue = AlignmentType.LEFT) =>
      new TableCell({
        shading: { fill: 'F3F4F6', type: ShadingType.CLEAR },
        borders: cellBorder,
        children: [
          new Paragraph({
            alignment: align,
            children: [new TextRun({ text, bold: true, size: 20 })],
          }),
        ],
      });

    const dataCell = (text: string, align: AlignmentTypeValue = AlignmentType.LEFT, bold = false) =>
      new TableCell({
        borders: cellBorder,
        children: [
          new Paragraph({
            alignment: align,
            children: [new TextRun({ text, bold, size: 20 })],
          }),
        ],
      });

    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [headerCell('Salary Component'), headerCell('Annual Amount', AlignmentType.RIGHT)],
        }),
        new TableRow({
          children: [dataCell('Basic Salary'), dataCell('As per structure', AlignmentType.RIGHT)],
        }),
        new TableRow({
          children: [dataCell('House Rent Allowance (HRA)'), dataCell('As per structure', AlignmentType.RIGHT)],
        }),
        new TableRow({
          children: [dataCell('Special Allowance'), dataCell('As per structure', AlignmentType.RIGHT)],
        }),
        new TableRow({
          children: [dataCell('Total Cost to Company (CTC)', AlignmentType.LEFT, true), dataCell('Refer terms', AlignmentType.RIGHT, true)],
        }),
      ],
    });
  }
}
