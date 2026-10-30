import { Injectable } from '@nestjs/common';
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  HeightRule,
  ImageRun,
  Packer,
  PageBreak,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  UnderlineType,
  VerticalAlign,
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
  images?: Record<string, Buffer>;
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
        this.convertNode(child, children, 0, options);
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

  private convertNode(node: DocNode, output: (Paragraph | Table)[], depth = 0, options: DocxOptions = {}) {
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
      case 'table': {
        output.push(this.createCustomTable(node));
        break;
      }
      case 'pageBreak': {
        output.push(new Paragraph({ children: [new PageBreak()] }));
        break;
      }
      case 'documentImage': {
        const attrs = node.attrs as Record<string, unknown> | undefined;
        if (!attrs) break;
        const key = (attrs.assetId as string) || (attrs.id as string);
        let buffer: Buffer | null = options.images?.[key] ?? null;
        if (!buffer && typeof attrs.src === 'string' && attrs.src.startsWith('data:image/')) {
          const parts = attrs.src.split(',');
          if (parts[1]) buffer = Buffer.from(parts[1], 'base64');
        }
        if (buffer) {
          const widthMm = Number(attrs.widthMm) || 45;
          const heightMm = Number(attrs.heightMm) || 20;
          const widthPx = Math.max(16, Math.min(800, Math.round(widthMm * 3.7795)));
          const heightPx = Math.max(16, Math.min(800, Math.round(heightMm * 3.7795)));
          const align = attrs.alignment === 'center' ? AlignmentType.CENTER : attrs.alignment === 'right' ? AlignmentType.RIGHT : AlignmentType.LEFT;
          const isJpg = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
          const imgType: 'png' | 'jpg' = isJpg ? 'jpg' : 'png';
          output.push(
            new Paragraph({
              alignment: align,
              children: [
                new ImageRun({
                  data: buffer,
                  transformation: {
                    width: widthPx,
                    height: heightPx,
                  },
                  type: imgType,
                }),
              ],
            }),
          );
        }
        break;
      }
      default: {
        if (node.content) {
          for (const child of node.content) {
            this.convertNode(child, output, depth, options);
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

  private createCustomTable(tableNode: DocNode): Table {
    const rows = tableNode.content ?? [];
    const parseDocxBorder = (spec?: unknown) => {
      if (typeof spec !== 'string' || !spec) {
        return { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' };
      }
      const s = spec.trim().toLowerCase();
      if (s === 'none' || s === '0' || s === '0pt') {
        return { style: BorderStyle.NONE, size: 0, color: 'auto' };
      }
      const m = s.match(/^([0-9]+(\.[0-9]+)?pt)\s+(solid|dashed|dotted)\s+(#[0-9a-f]{6})$/i);
      if (m) {
        const pt = parseFloat(m[1]);
        const size = Math.round(pt * 8);
        let style: (typeof BorderStyle)[keyof typeof BorderStyle] = BorderStyle.SINGLE;
        if (m[3] === 'dashed') style = BorderStyle.DASHED;
        else if (m[3] === 'dotted') style = BorderStyle.DOTTED;
        const color = m[4].replace('#', '');
        return { style, size, color };
      }
      return { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' };
    };

    let maxCols = 0;
    const rawColWidths: number[] = [];

    rows.forEach((rowNode) => {
      let colIdx = 0;
      (rowNode.content ?? []).forEach((cellNode) => {
        const attrs = cellNode.attrs ?? {};
        const colspan = Math.max(1, Number(attrs.colspan ?? 1));
        const cw = attrs.colwidth;
        if (Array.isArray(cw) && cw.length > 0) {
          if (colspan === 1 && typeof cw[0] === 'number') {
            rawColWidths[colIdx] = Math.max(rawColWidths[colIdx] || 0, cw[0]);
          }
        }
        colIdx += colspan;
      });
      if (colIdx > maxCols) maxCols = colIdx;
    });

    const TOTAL_TABLE_WIDTH_TWIPS = 9000;
    let colWidthsTwips: number[] = [];
    if (maxCols > 0) {
      const sumRaw = rawColWidths.reduce((a, b) => a + (b || 0), 0);
      if (sumRaw > 0 && rawColWidths.length === maxCols && rawColWidths.every((w) => w > 0)) {
        colWidthsTwips = rawColWidths.map((w) => Math.round((w / sumRaw) * TOTAL_TABLE_WIDTH_TWIPS));
      } else {
        const uniform = Math.round(TOTAL_TABLE_WIDTH_TWIPS / maxCols);
        colWidthsTwips = new Array(maxCols).fill(uniform);
      }
    }

    const docxRows: TableRow[] = [];

    rows.forEach((rowNode, rIndex) => {
      const isHeaderRow = rIndex === 0 && (rowNode.content ?? []).some((c) => c.type === 'tableHeader');
      const rowAttrs = rowNode.attrs ?? {};
      const rowHeightPt = typeof rowAttrs.rowHeight === 'number' ? rowAttrs.rowHeight : undefined;
      const rowHeightTwips = rowHeightPt ? Math.round(rowHeightPt * PT_TO_TWIP) : undefined;

      let currentColIdx = 0;
      const rowCells: TableCell[] = [];

      (rowNode.content ?? []).forEach((cellNode) => {
        const isHeader = cellNode.type === 'tableHeader';
        const attrs = cellNode.attrs ?? {};
        const colspan = Math.max(1, Number(attrs.colspan ?? 1));
        const rowspan = Math.max(1, Number(attrs.rowspan ?? 1));

        let cellWidthTwips: number | undefined = undefined;
        if (colWidthsTwips.length >= currentColIdx + colspan) {
          let sum = 0;
          for (let i = 0; i < colspan; i += 1) {
            sum += colWidthsTwips[currentColIdx + i] || 0;
          }
          cellWidthTwips = sum;
        }

        const paddingPt = typeof attrs.padding === 'number' ? attrs.padding : 4;
        const paddingTwips = Math.round(paddingPt * PT_TO_TWIP);

        const vAlign = attrs.verticalAlign as string | undefined;
        let verticalAlign: (typeof VerticalAlign)[keyof typeof VerticalAlign] = VerticalAlign.TOP;
        if (vAlign === 'middle') verticalAlign = VerticalAlign.CENTER;
        else if (vAlign === 'bottom') verticalAlign = VerticalAlign.BOTTOM;

        const bgColor = typeof attrs.backgroundColor === 'string' && /^#[0-9a-f]{6}$/i.test(attrs.backgroundColor)
          ? attrs.backgroundColor.replace('#', '')
          : isHeader
          ? 'F8FAFC'
          : undefined;

        const cellParagraphs: Paragraph[] = [];
        if (cellNode.content && Array.isArray(cellNode.content)) {
          for (const block of cellNode.content) {
            if (block.type === 'paragraph') {
              if (attrs.textAlign && !block.attrs?.textAlign) {
                block.attrs = { ...(block.attrs ?? {}), textAlign: attrs.textAlign };
              }
              cellParagraphs.push(this.createParagraph(block));
            } else if (block.type === 'heading') {
              cellParagraphs.push(this.createHeading(block));
            }
          }
        }
        if (cellParagraphs.length === 0) {
          cellParagraphs.push(new Paragraph({ children: [] }));
        }

        rowCells.push(
          new TableCell({
            columnSpan: colspan > 1 ? colspan : undefined,
            rowSpan: rowspan > 1 ? rowspan : undefined,
            width: cellWidthTwips ? { size: cellWidthTwips, type: WidthType.DXA } : undefined,
            shading: bgColor ? { fill: bgColor, type: ShadingType.CLEAR } : undefined,
            verticalAlign,
            margins: {
              top: paddingTwips,
              bottom: paddingTwips,
              left: paddingTwips,
              right: paddingTwips,
            },
            borders: {
              top: parseDocxBorder(attrs.borderTop),
              bottom: parseDocxBorder(attrs.borderBottom),
              left: parseDocxBorder(attrs.borderLeft),
              right: parseDocxBorder(attrs.borderRight),
            },
            children: cellParagraphs,
          }),
        );

        currentColIdx += colspan;
      });

      docxRows.push(
        new TableRow({
          tableHeader: isHeaderRow,
          cantSplit: true,
          height: rowHeightTwips ? { value: rowHeightTwips, rule: HeightRule.ATLEAST } : undefined,
          children: rowCells,
        }),
      );
    });

    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      columnWidths: colWidthsTwips.length ? colWidthsTwips : undefined,
      rows: docxRows,
    });
  }
}
