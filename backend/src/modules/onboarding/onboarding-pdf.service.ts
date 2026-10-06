import { Injectable } from '@nestjs/common';
import * as pdfkit from 'pdfkit';
import { DocNode } from './rich-document';
import { drawDocument, LayoutDoc } from './rich-pdf-layout';

// pdfkit is a CommonJS class export: the build (CommonJS) gets it directly, the ES-module test runner as `default`.
const PDFDocument = ((pdfkit as unknown as { default?: unknown }).default ?? pdfkit) as unknown as typeof import('pdfkit');
type Doc = InstanceType<typeof PDFDocument>;

export interface LetterPdf {
  companyName: string;
  reference: string;
  dateText: string;
  title: string;
  body: string;
  /**
   * The formatted letter (placeholders filled). When given it is the whole
   * letter, drawn as formatted in place of the heading and text above (which
   * then only name the file), and the reference and date are wherever it puts them.
   */
  document?: DocNode;
  /** An optional table of amounts, such as the offered pay. */
  table?: { heading: string; rows: [string, string][]; total?: [string, string] };
  footer?: string;
  /** Printed faintly across every page, for samples and previews that are not the final document. */
  watermark?: string;
}

/**
 * Where an image sits, set in the letterhead editor: millimetres from the
 * top-left corner of the header (or footer) area, which starts at the page
 * margins. `stretch` fills the box exactly; otherwise the image keeps its
 * proportions inside it.
 */
export interface ImageBox {
  x: number;
  y: number;
  width: number;
  height: number;
  stretch: boolean;
}

/**
 * A box placed in an area (both in points): where the editor put it, kept
 * inside the area: moved back in if it would run past an edge, and no larger
 * than the area. The editor applies the same rule, so what it shows is what prints.
 */
export function placeBox(box: ImageBox, area: { left: number; top: number; width: number; height: number }) {
  const width = Math.min(box.width * MM, area.width);
  const height = Math.min(box.height * MM, area.height);
  const left = Math.min(Math.max(area.left, area.left + box.x * MM), area.left + area.width - width);
  const top = Math.min(Math.max(area.top, area.top + box.y * MM), area.top + area.height - height);
  return { left, top, width, height };
}

/** A letterhead ready to draw: its details and the bytes of its images. */
export interface PdfLetterhead {
  companyName: string;
  addressText: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  registrationText: string | null;
  footerText: string | null;
  logoPosition: 'LEFT' | 'CENTER' | 'RIGHT';
  logo: Buffer | null;
  headerImage: Buffer | null;
  footerImage: Buffer | null;
  headerHeightMm: number;
  footerHeightMm: number;
  /** Boxes set in the editor; none (or absent): the automatic layout. */
  logoBox?: ImageBox | null;
  headerArtBox?: ImageBox | null;
  footerArtBox?: ImageBox | null;
}

export interface PdfLayout {
  pageSize: 'A4' | 'LETTER';
  marginMm: number;
  showPageNumbers: boolean;
  letterhead: PdfLetterhead | null;
}

/** The layout of documents made before layouts existed: plain A4. */
export const PLAIN_LAYOUT: PdfLayout = { pageSize: 'A4', marginMm: 20, showPageNumbers: false, letterhead: null };

const MM = 72 / 25.4;
const GREY = '#555555';

/**
 * The built-in PDF font covers Latin text only. Other characters are replaced
 * rather than risk a broken file: the rupee sign becomes "INR", anything else
 * outside the font becomes "?".
 */
export function pdfSafe(text: string) {
  return text.replace(/₹\s?/g, 'INR ').replace(/[^\n\r\t\x20-\x7E -ÿ–—‘’“”•…]/g, '?');
}

/** Whether pdfkit can place this image (a PNG or JPEG it can read), with its size in pixels. */
export function readableImage(bytes: Buffer): { width: number; height: number } | null {
  try {
    // openImage parses the file the way doc.image will; it is missing from pdfkit's type definitions.
    const image = (new PDFDocument({ autoFirstPage: false }) as unknown as { openImage(data: Buffer): { width: number; height: number } }).openImage(bytes);
    return image.width > 0 && image.height > 0 ? { width: image.width, height: image.height } : null;
  } catch {
    return null;
  }
}

/**
 * Letters as PDF files: the letterhead (or the company name on a plain page),
 * reference and date, the text, an optional table of amounts, and footer and
 * page numbers. The header and footer repeat on every page, and the text never
 * runs into them. A short paragraph, such as a signature block, is never split
 * across pages; nor is a table row.
 */
@Injectable()
export class OnboardingPdfService {
  render(letter: LetterPdf, layout: PdfLayout = PLAIN_LAYOUT): Promise<Buffer> {
    const letterhead = layout.letterhead;
    const margin = layout.marginMm * MM;
    const headerHeight = letterhead ? letterhead.headerHeightMm * MM : 0;
    const footerHeight = letterhead ? letterhead.footerHeightMm * MM : 0;
    const doc = new PDFDocument({
      size: layout.pageSize,
      bufferPages: true,
      margins: {
        top: margin + (letterhead ? headerHeight + 12 : 0),
        bottom: margin + (letterhead ? footerHeight + 8 : 0),
        left: margin,
        right: margin,
      },
      info: { Title: pdfSafe(letter.title), Author: pdfSafe(letterhead?.companyName ?? letter.companyName), Subject: letter.reference },
    });
    const chunks: Buffer[] = [];
    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    // Each image is read once and placed on every page as the same embedded object.
    const images = letterhead ? { ...letterhead, logo: this.open(doc, letterhead.logo), headerImage: this.open(doc, letterhead.headerImage), footerImage: this.open(doc, letterhead.footerImage) } : null;
    const width = doc.page.width - margin * 2;
    const bottom = () => doc.page.height - doc.page.margins.bottom;
    const usable = () => bottom() - doc.page.margins.top;
    /** Starts a new page when a block of this height would not fit, unless it is taller than a page anyway. */
    const keepTogether = (height: number) => {
      if (doc.y + height > bottom() && height <= usable()) doc.addPage();
    };

    const table = letter.table;
    if (letter.document) {
      drawDocument(doc as unknown as LayoutDoc, letter.document, { left: margin, width, table: table ? () => this.table(doc, table, margin, width, keepTogether) : undefined }, pdfSafe);
      // A letter that doesn't place the pay table gets it at the end, as before.
      if (table && !letter.document.content?.some((n) => n.type === 'compensationTable')) this.table(doc, table, margin, width, keepTogether);
    } else {
      if (!letterhead) doc.font('Helvetica-Bold').fontSize(15).text(pdfSafe(letter.companyName), margin, doc.y, { width }).moveDown(0.3);
      doc.font('Helvetica').fontSize(9).fillColor(GREY).text(`Ref: ${letter.reference}    Date: ${letter.dateText}`, margin, doc.y, { width });
      doc.moveDown(1.2).fillColor('#000000').font('Helvetica-Bold').fontSize(13);
      const title = pdfSafe(letter.title);
      keepTogether(doc.heightOfString(title, { width }) + 40);
      doc.text(title, margin, doc.y, { width });
      doc.moveDown(0.8).font('Helvetica').fontSize(10.5);
      for (const paragraph of pdfSafe(letter.body).split(/\n\s*\n/)) {
        const text = paragraph.trim();
        if (!text) continue;
        const height = doc.heightOfString(text, { width, lineGap: 2 });
        // Short blocks (a signature, a clause) stay whole; long ones flow across pages.
        if (height <= usable() * 0.5) keepTogether(height);
        doc.text(text, margin, doc.y, { width, align: 'left', lineGap: 2 });
        doc.moveDown(0.7);
      }
      if (table) this.table(doc, table, margin, width, keepTogether);
    }

    if (letter.footer) {
      doc.x = margin;
      doc.moveDown(1.5).font('Helvetica').fontSize(8.5).fillColor(GREY);
      const note = pdfSafe(letter.footer);
      keepTogether(doc.heightOfString(note, { width }));
      doc.text(note, margin, doc.y, { width });
    }

    // Header, footer, page numbers and watermark on every page, drawn once the page count is known.
    const range = doc.bufferedPageRange();
    for (let index = range.start; index < range.start + range.count; index += 1) {
      doc.switchToPage(index);
      const kept = { ...doc.page.margins };
      // Drawing inside the margins must not start new pages.
      doc.page.margins = { top: 0, bottom: 0, left: 0, right: 0 };
      if (images) {
        this.header(doc, images, margin, width, headerHeight);
        this.footer(doc, images, margin, width, footerHeight);
      }
      if (layout.showPageNumbers) {
        doc.font('Helvetica').fontSize(8).fillColor(GREY).text(`Page ${index - range.start + 1} of ${range.count}`, margin, doc.page.height - margin + Math.max(2, (margin - 8) / 2), { width, align: 'right', lineBreak: false });
      }
      if (letter.watermark) this.watermark(doc, pdfSafe(letter.watermark));
      doc.page.margins = kept;
    }
    doc.end();
    return done;
  }

  /**
   * An image opened once for the document. pdfkit's image() accepts an opened
   * image in place of the bytes (and then embeds it once), which its type
   * definitions leave out; hence the cast.
   */
  private open(doc: Doc, bytes: Buffer | null): Buffer | null {
    if (!bytes) return null;
    return (doc as unknown as { openImage(data: Buffer): Buffer }).openImage(bytes);
  }

  private table(doc: Doc, table: NonNullable<LetterPdf['table']>, margin: number, width: number, keepTogether: (height: number) => void) {
    const amountWidth = 160;
    const labelWidth = width - amountWidth - 10;
    doc.font('Helvetica').fontSize(10);
    const rowHeight = ([label, amount]: [string, string]) => Math.max(doc.heightOfString(pdfSafe(label), { width: labelWidth }), doc.heightOfString(pdfSafe(amount), { width: amountWidth })) + 4;
    const row = (cells: [string, string], bold = false) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(10);
      keepTogether(rowHeight(cells));
      const y = doc.y;
      doc.text(pdfSafe(cells[0]), margin, y, { width: labelWidth });
      const labelBottom = doc.y;
      doc.text(pdfSafe(cells[1]), margin + width - amountWidth, y, { width: amountWidth, align: 'right' });
      doc.y = Math.max(labelBottom, doc.y) + 4;
    };
    doc.moveDown(0.3).font('Helvetica-Bold').fontSize(11);
    const heading = pdfSafe(table.heading);
    // The heading never sits alone at the bottom of a page.
    keepTogether(doc.heightOfString(heading, { width }) + 8 + table.rows.slice(0, 2).reduce((sum, r) => sum + rowHeight(r), 0));
    doc.text(heading, margin, doc.y, { width });
    doc.moveDown(0.4);
    for (const r of table.rows) row(r);
    if (table.total) {
      keepTogether(rowHeight(table.total) + 8);
      doc.moveTo(margin, doc.y).lineTo(margin + width, doc.y).strokeColor('#999999').lineWidth(0.5).stroke();
      doc.y += 4;
      row(table.total, true);
    }
    doc.x = margin;
  }

  /** An image in its editor box within an area: stretched to fill it, or kept in proportion and centred in it. */
  private placed(doc: Doc, image: Buffer, box: ImageBox, area: { left: number; top: number; width: number; height: number }) {
    const rect = placeBox(box, area);
    if (box.stretch) doc.image(image, rect.left, rect.top, { width: rect.width, height: rect.height });
    else doc.image(image, rect.left, rect.top, { fit: [rect.width, rect.height], align: 'center', valign: 'center' });
    return rect;
  }

  /** The letterhead's top: its artwork, or the logo with the company's name, address and contacts. */
  private header(doc: Doc, letterhead: PdfLetterhead, margin: number, width: number, height: number) {
    const top = margin;
    const area = { left: margin, top, width, height };
    if (letterhead.headerImage && letterhead.headerArtBox) {
      this.placed(doc, letterhead.headerImage, letterhead.headerArtBox, area);
    } else if (letterhead.headerImage) {
      // fit keeps the image's proportions inside the header area.
      doc.image(letterhead.headerImage, margin, top, { fit: [width, height], align: 'center', valign: 'center' });
    } else {
      const contact = [letterhead.phone, letterhead.email, letterhead.website].filter(Boolean).join('  |  ');
      const lines: { text: string; bold?: boolean; size: number }[] = [
        { text: letterhead.companyName, bold: true, size: 13 },
        ...(letterhead.addressText ? [{ text: letterhead.addressText, size: 8 }] : []),
        ...(contact ? [{ text: contact, size: 8 }] : []),
      ];
      const centered = letterhead.logoPosition === 'CENTER';
      const logoHeight = centered ? height * 0.45 : height;
      const logoWidth = letterhead.logo ? Math.min(width * 0.3, 170) : 0;
      let textX = margin;
      let textWidth = width;
      let textTop = top;
      let align: 'left' | 'right' | 'center' = 'left';
      if (letterhead.logo && letterhead.logoBox) {
        // The logo where the editor put it; the details take the space beside (or, centred, below) it.
        const rect = this.placed(doc, letterhead.logo, letterhead.logoBox, area);
        if (centered) {
          textTop = rect.top + rect.height + 4;
          align = 'center';
        } else if (letterhead.logoPosition === 'LEFT') {
          textX = rect.left + rect.width + 12;
          textWidth = Math.max(40, margin + width - textX);
          align = 'right';
        } else {
          textWidth = Math.max(40, rect.left - 12 - margin);
        }
      } else if (letterhead.logo) {
        if (centered) {
          doc.image(letterhead.logo, margin + (width - logoWidth) / 2, top, { fit: [logoWidth, logoHeight], align: 'center', valign: 'center' });
          textTop = top + logoHeight + 4;
          align = 'center';
        } else if (letterhead.logoPosition === 'LEFT') {
          doc.image(letterhead.logo, margin, top, { fit: [logoWidth, logoHeight], valign: 'center' });
          textX = margin + logoWidth + 12;
          textWidth = width - logoWidth - 12;
          align = 'right';
        } else {
          doc.image(letterhead.logo, margin + width - logoWidth, top, { fit: [logoWidth, logoHeight], align: 'right', valign: 'center' });
          textWidth = width - logoWidth - 12;
        }
      } else if (centered) {
        align = 'center';
      }
      const textHeight = top + height - textTop;
      const blockHeight = lines.reduce((sum, l) => sum + doc.font(l.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(l.size).heightOfString(pdfSafe(l.text), { width: textWidth }) + 2, 0);
      let y = textTop + Math.max(0, (textHeight - blockHeight) / 2);
      for (const line of lines) {
        const remaining = top + height - y;
        if (remaining < line.size) break;
        doc.font(line.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(line.size).fillColor(line.bold ? '#111111' : GREY);
        doc.text(pdfSafe(line.text), textX, y, { width: textWidth, align, height: remaining, ellipsis: true });
        y = doc.y + 2;
      }
    }
    doc.moveTo(margin, top + height + 5).lineTo(margin + width, top + height + 5).strokeColor('#CCCCCC').lineWidth(0.5).stroke();
  }

  /** The letterhead's bottom: its artwork, or the registration details and footer text. */
  private footer(doc: Doc, letterhead: PdfLetterhead, margin: number, width: number, height: number) {
    const top = doc.page.height - margin - height;
    doc.moveTo(margin, top).lineTo(margin + width, top).strokeColor('#CCCCCC').lineWidth(0.5).stroke();
    if (letterhead.footerImage && letterhead.footerArtBox) {
      this.placed(doc, letterhead.footerImage, letterhead.footerArtBox, { left: margin, top, width, height });
      return;
    }
    if (letterhead.footerImage) {
      doc.image(letterhead.footerImage, margin, top + 3, { fit: [width, height - 3], align: 'center', valign: 'center' });
      return;
    }
    const text = [letterhead.registrationText, letterhead.footerText].filter(Boolean).join('\n');
    if (text) doc.font('Helvetica').fontSize(7.5).fillColor(GREY).text(pdfSafe(text), margin, top + 4, { width, align: 'center', height: height - 4, ellipsis: true });
  }

  private watermark(doc: Doc, text: string) {
    const { width, height } = doc.page;
    doc.save();
    doc.rotate(-35, { origin: [width / 2, height / 2] });
    doc.font('Helvetica-Bold').fontSize(64).fillColor('#999999').fillOpacity(0.15);
    doc.text(text, 0, height / 2 - 32, { width, align: 'center', lineBreak: false });
    doc.restore();
  }
}
