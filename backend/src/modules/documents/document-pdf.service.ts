import { BadRequestException, Injectable } from '@nestjs/common';
import { execFile } from 'child_process';
import { existsSync, promises as fsPromises } from 'fs';
import { randomUUID } from 'crypto';
import * as pdfkit from 'pdfkit';
import { DocNode, FONT_FAMILIES, FontKey } from './rich-document';
import { drawDocument, LayoutDoc } from './rich-pdf-layout';
import { DocumentHtmlService } from './document-html.service';

const CHROME_PATHS = ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
export function getChromePath(): string | null {
  for (const p of CHROME_PATHS) {
    if (existsSync(p)) return p;
  }
  return null;
}

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
  /** An optional table of amounts, such as the offered pay or a quotation's lines. */
  table?: PdfTable;
  footer?: string;
  /** Printed faintly across every page, for samples and previews that are not the final document. */
  watermark?: string;
  /** Images stored by assetId or id, mapping to Buffer */
  images?: Record<string, Buffer>;
}

/**
 * A table of amounts. Without columns, each row is a label and an amount. With
 * columns, each row has one cell per column (widths are shares of the line),
 * and `totals` follow as label and amount, like a two-column table.
 */
export interface PdfTable {
  heading: string;
  columns?: { label: string; width: number; align?: 'left' | 'right' }[];
  rows: string[][];
  totals?: [string, string][];
  total?: [string, string];
}

/**
 * Where an image sits, set in the letterhead editor: millimetres from the
 * top-left corner of the header (or footer) area. `stretch` fills the box
 * exactly; otherwise the image keeps its proportions inside it.
 */
export interface ImageBox {
  x: number;
  y: number;
  width: number;
  height: number;
  stretch: boolean;
  /** Degrees clockwise about the box's centre; none: upright. */
  rotation?: number;
}

/** A text element's text and how it looks. Lines break only where the text has line breaks. */
export interface ElementText {
  content: string;
  fontFamily: FontKey;
  fontSizePt: number;
  bold: boolean;
  italic: boolean;
  color: string;
  align: 'left' | 'center' | 'right';
}

/**
 * A design element on every page, such as a watermark: a box in millimetres
 * from the page's top-left (kept on the page as placeBox keeps it), turned
 * clockwise about its centre, at an opacity from 0 to 1. Elements behind the
 * text are drawn before it on each page, those in front after everything else.
 * An image keeps its proportions inside the box.
 */
export interface PdfElement {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  aboveText: boolean;
  image: Buffer | null;
  text: ElementText | null;
}

/** Text elements' line height, as a multiple of the font size; the editor uses the same. */
export const ELEMENT_LINE_HEIGHT = 1.2;

/**
 * A box placed in an area (both in points): where the editor put it, kept
 * inside the area: moved back in if it would run past an edge, and no larger
 * than the area. The editor applies the same rule, so what it shows is what prints.
 */
export function placeBox(box: Pick<ImageBox, 'x' | 'y' | 'width' | 'height'> & Partial<ImageBox>, area: { left: number; top: number; width: number; height: number }) {
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
  /** Where the header and footer sit; none (or absent): at the page margins. */
  placement?: LetterheadPlacement | null;
  /** Boxes set in the editor; none (or absent): the automatic layout. */
  logoBox?: ImageBox | null;
  headerArtBox?: ImageBox | null;
  footerArtBox?: ImageBox | null;
  /** Elements to draw (hidden ones left out), in paint order. */
  elements?: PdfElement[];
}

/**
 * Where a letterhead sits, in millimetres: its header from the page's top
 * edge, its footer from the bottom edge, and both from the left and right
 * edges. 0 puts it at the edge of the paper.
 */
export interface LetterheadPlacement {
  headerOffsetMm: number;
  footerOffsetMm: number;
  sideOffsetMm: number;
}

/** The page margins in millimetres: the letter text stays inside them. */
export interface PageMargins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface PdfLayout {
  pageSize: 'A4' | 'LETTER';
  marginsMm: PageMargins;
  showPageNumbers: boolean;
  letterhead: PdfLetterhead | null;
}

export const uniformMargins = (mm: number): PageMargins => ({ top: mm, right: mm, bottom: mm, left: mm });

/** The layout of documents made before layouts existed: plain A4. */
export const PLAIN_LAYOUT: PdfLayout = { pageSize: 'A4', marginsMm: uniformMargins(20), showPageNumbers: false, letterhead: null };

const MM = 72 / 25.4;
const GREY = '#555555';
/** Page sizes in points, as pdfkit has them. */
const PAGE_POINTS = { A4: { width: 595.28, height: 841.89 }, LETTER: { width: 612, height: 792 } };
/** The letter text always keeps at least this much of the page's height (margins of at most 60 mm leave it at least 90 mm wide). */
export const MIN_TEXT_MM = 60;

type Rect = { left: number; top: number; width: number; height: number };

/**
 * Where things go on a page, in points: the header and footer where the
 * letterhead is placed (at the page margins unless it says otherwise), and the
 * text inside the margins, at least 12 pt below the header and 8 pt above the
 * footer. The template editor applies the same rule.
 */
export function pageFrame(layout: PdfLayout) {
  const page = PAGE_POINTS[layout.pageSize];
  const m = layout.marginsMm;
  const lh = layout.letterhead;
  const at = lh?.placement;
  const left = (at ? at.sideOffsetMm : m.left) * MM;
  const width = page.width - left - (at ? at.sideOffsetMm : m.right) * MM;
  const header: Rect | null = lh ? { left, top: (at ? at.headerOffsetMm : m.top) * MM, width, height: lh.headerHeightMm * MM } : null;
  const footerHeight = lh ? lh.footerHeightMm * MM : 0;
  const footer: Rect | null = lh ? { left, top: page.height - (at ? at.footerOffsetMm : m.bottom) * MM - footerHeight, width, height: footerHeight } : null;
  const top = Math.max(m.top * MM, header ? header.top + header.height + 12 : 0);
  const bottom = Math.min(page.height - m.bottom * MM, footer ? footer.top - 8 : page.height);
  return { page, header, footer, body: { left: m.left * MM, top, width: page.width - (m.left + m.right) * MM, height: bottom - top } };
}

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
export class DocumentPdfService {
  constructor(private readonly htmlService?: DocumentHtmlService) {}

  async render(
    letter: LetterPdf,
    layout: PdfLayout = PLAIN_LAYOUT,
    options?: { engine?: 'chromium' | 'pdfkit' },
  ): Promise<Buffer> {
    const chromePath = getChromePath();
    const isTest = process.env.JEST_WORKER_ID !== undefined;
    const forcePdfkit = options?.engine === 'pdfkit' || process.env.PDF_ENGINE === 'pdfkit';
    const forceChromium = options?.engine === 'chromium';

    if (chromePath && !forcePdfkit && (forceChromium || !isTest)) {
      try {
        return await this.renderChromium(letter, layout, chromePath);
      } catch (err) {
        console.warn('Chromium PDF render failed, falling back to pdfkit:', (err as Error)?.message);
      }
    }

    return this.renderPdfkit(letter, layout);
  }

  async renderChromium(letter: LetterPdf, layout: PdfLayout = PLAIN_LAYOUT, chromePath = '/usr/bin/google-chrome'): Promise<Buffer> {
    const htmlGenerator = this.htmlService || new DocumentHtmlService();
    const html = htmlGenerator.generateHtml(letter, layout);
    const id = randomUUID();
    const tempHtml = `/tmp/rnd-pdf-${id}.html`;
    const tempPdf = `/tmp/rnd-pdf-${id}.pdf`;

    try {
      await fsPromises.writeFile(tempHtml, html, 'utf8');
      await new Promise<void>((resolve, reject) => {
        execFile(
          chromePath,
          [
            '--headless=new',
            '--disable-gpu',
            '--no-sandbox',
            '--no-pdf-header-footer',
            `--print-to-pdf=${tempPdf}`,
            tempHtml,
          ],
          { timeout: 20000 },
          (error) => {
            if (error) return reject(error);
            resolve();
          },
        );
      });
      return await fsPromises.readFile(tempPdf);
    } finally {
      fsPromises.unlink(tempHtml).catch(() => undefined);
      fsPromises.unlink(tempPdf).catch(() => undefined);
    }
  }

  renderPdfkit(letter: LetterPdf, layout: PdfLayout = PLAIN_LAYOUT): Promise<Buffer> {
    const letterhead = layout.letterhead;
    const frame = pageFrame(layout);
    const { page, body } = frame;
    // Text squeezed into a sliver would print a line or two a page, or never fit at all.
    if (body.height < MIN_TEXT_MM * MM - 0.01) {
      return Promise.reject(
        new BadRequestException(
          `The letter text needs at least ${MIN_TEXT_MM} mm of the page’s height. Make the template’s margins smaller, or the letterhead’s header or footer shorter or closer to the page edge.`,
        ),
      );
    }
    const margin = body.left;
    const doc = new PDFDocument({
      size: layout.pageSize,
      bufferPages: true,
      margins: {
        top: body.top,
        bottom: page.height - body.top - body.height,
        left: body.left,
        right: page.width - body.left - body.width,
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
    const opened = new Map<Buffer, Buffer>();
    const open = (bytes: Buffer | null) => {
      if (!bytes) return null;
      if (!opened.has(bytes)) opened.set(bytes, this.open(doc, bytes));
      return opened.get(bytes) ?? null;
    };
    const images = letterhead ? { ...letterhead, logo: open(letterhead.logo), headerImage: open(letterhead.headerImage), footerImage: open(letterhead.footerImage) } : null;
    const elements = (letterhead?.elements ?? []).map((e) => ({ ...e, image: open(e.image) }));
    const behind = elements.filter((e) => !e.aboveText);
    const inFront = elements.filter((e) => e.aboveText);
    // Elements behind the text go on each page as it starts, before any of its text.
    if (behind.length) {
      const drawBehind = () => this.background(doc, behind);
      drawBehind();
      doc.on('pageAdded', drawBehind);
    }
    const width = body.width;
    const bottom = () => doc.page.height - doc.page.margins.bottom;
    const usable = () => bottom() - doc.page.margins.top;
    /** Starts a new page when a block of this height would not fit, unless it is taller than a page anyway. */
    const keepTogether = (height: number) => {
      if (doc.y + height > bottom() && height <= usable()) doc.addPage();
    };

    const table = letter.table;
    const docImages: Record<string, unknown>[] = [];
    const collectImages = (node?: DocNode) => {
      if (!node) return;
      if (node.type === 'documentImage' && node.attrs) {
        docImages.push(node.attrs);
      }
      node.content?.forEach(collectImages);
    };
    collectImages(letter.document);

    const resolveBuffer = (attrs: Record<string, unknown>): Buffer | null => {
      const key = (attrs.assetId as string) || (attrs.id as string);
      if (letter.images?.[key]) return letter.images[key];
      const src = attrs.src as string;
      if (src && src.startsWith('data:image/')) {
        const parts = src.split(',');
        if (parts[1]) return Buffer.from(parts[1], 'base64');
      }
      return null;
    };

    const drawImage = (node: DocNode, left: number, width: number) => {
      const attrs = node.attrs as Record<string, unknown> | undefined;
      if (!attrs) return;
      const mode = (attrs.positionMode as string) || 'front';
      if (mode === 'behind' || mode === 'front') return; // Handled in page-level pass

      const buf = resolveBuffer(attrs);
      if (!buf) return;
      const opened = open(buf);
      if (!opened) return;

      const widthPt = (Number(attrs.widthMm) || 45) * MM;
      const heightPt = (Number(attrs.heightMm) || 20) * MM;
      if (doc.y + heightPt > bottom() && heightPt <= usable()) doc.addPage();

      const align = (attrs.alignment as string) || 'left';
      const x = align === 'center' ? left + (width - widthPt) / 2 : align === 'right' ? left + width - widthPt : left;
      doc.save();
      const opacity = Number(attrs.opacity);
      if (Number.isFinite(opacity) && opacity < 1 && opacity >= 0) doc.opacity(opacity);
      doc.image(opened, x, doc.y, { width: widthPt, height: heightPt });
      doc.restore();
      doc.y += heightPt + 8;
    };

    if (letter.document) {
      drawDocument(
        doc as unknown as LayoutDoc,
        letter.document,
        {
          left: margin,
          width,
          table: table ? () => this.table(doc, table, margin, width, keepTogether) : undefined,
          drawImage,
        },
        pdfSafe,
      );
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

    // Header, footer, page numbers, watermark and free-position images on every page.
    const range = doc.bufferedPageRange();
    for (let index = range.start; index < range.start + range.count; index += 1) {
      doc.switchToPage(index);
      const pageNumber = index - range.start + 1;
      const kept = { ...doc.page.margins };
      // Drawing inside the margins must not start new pages.
      doc.page.margins = { top: 0, bottom: 0, left: 0, right: 0 };

      // 1. Draw 'behind' free-positioned images on this page
      const behindImages = docImages.filter((img) => (Number(img.page) || 1) === pageNumber && img.positionMode === 'behind');
      for (const img of behindImages) {
        const buf = resolveBuffer(img);
        if (buf) {
          const opened = open(buf);
          if (opened) {
            doc.save();
            const opacity = Number(img.opacity);
            if (Number.isFinite(opacity) && opacity < 1 && opacity >= 0) doc.opacity(opacity);
            const x = (Number(img.xMm) || 0) * MM;
            const y = (Number(img.yMm) || 0) * MM;
            const w = (Number(img.widthMm) || 45) * MM;
            const h = (Number(img.heightMm) || 20) * MM;
            doc.image(opened, x, y, { width: w, height: h });
            doc.restore();
          }
        }
      }

      if (images && frame.header && frame.footer) {
        this.header(doc, images, frame.header);
        this.footer(doc, images, frame.footer);
      }
      if (layout.showPageNumbers) {
        // In the space below the footer (or the text); just above the footer when that space is too small.
        const below = frame.footer ? frame.footer.top + frame.footer.height : body.top + body.height;
        const room = page.height - below;
        const y = room >= 10 ? below + Math.max(2, (room - 8) / 2) : (frame.footer?.top ?? below) - 10;
        doc.font('Helvetica').fontSize(8).fillColor(GREY).text(`Page ${index - range.start + 1} of ${range.count}`, margin, y, { width, align: 'right', lineBreak: false });
      }
      for (const element of inFront) this.element(doc, element);

      // 2. Draw 'front' free-positioned images on this page, ordered by zIndex
      const frontImages = docImages
        .filter((img) => (Number(img.page) || 1) === pageNumber && (img.positionMode === 'front' || !img.positionMode))
        .sort((a, b) => (Number(a.zIndex) || 10) - (Number(b.zIndex) || 10));
      for (const img of frontImages) {
        const buf = resolveBuffer(img);
        if (buf) {
          const opened = open(buf);
          if (opened) {
            doc.save();
            const opacity = Number(img.opacity);
            if (Number.isFinite(opacity) && opacity < 1 && opacity >= 0) doc.opacity(opacity);
            const x = (Number(img.xMm) || 0) * MM;
            const y = (Number(img.yMm) || 0) * MM;
            const w = (Number(img.widthMm) || 45) * MM;
            const h = (Number(img.heightMm) || 20) * MM;
            doc.image(opened, x, y, { width: w, height: h });
            doc.restore();
          }
        }
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
  private open(doc: Doc, bytes: Buffer): Buffer {
    return (doc as unknown as { openImage(data: Buffer): Buffer }).openImage(bytes);
  }

  /**
   * Elements drawn on a page as it starts, leaving the text where it was: the
   * position, the font (pdfkit keeps it outside the page's graphics state, and
   * a paragraph running onto this page goes on in it) and the margins.
   */
  private background(doc: Doc, elements: PdfElement[]) {
    const state = doc as unknown as { x: number; y: number; _font: unknown; _fontSize: number };
    const kept = { x: state.x, y: state.y, font: state._font, fontSize: state._fontSize, margins: { ...doc.page.margins } };
    doc.page.margins = { top: 0, bottom: 0, left: 0, right: 0 };
    for (const element of elements) this.element(doc, element);
    doc.page.margins = kept.margins;
    state._font = kept.font;
    state._fontSize = kept.fontSize;
    state.x = kept.x;
    state.y = kept.y;
  }

  /** One element, on the page, turned about its centre and at its opacity. */
  private element(doc: Doc, element: PdfElement) {
    const { left, top, width, height } = placeBox(element, { left: 0, top: 0, width: doc.page.width, height: doc.page.height });
    doc.save();
    if (element.rotation) doc.rotate(element.rotation, { origin: [left + width / 2, top + height / 2] });
    doc.opacity(element.opacity);
    if (element.image) {
      doc.image(element.image, left, top, { fit: [width, height], align: 'center', valign: 'center' });
    } else if (element.text) {
      const t = element.text;
      const family = FONT_FAMILIES[t.fontFamily];
      doc.font(t.bold && t.italic ? family.boldItalic : t.bold ? family.bold : t.italic ? family.italic : family.regular).fontSize(t.fontSizePt).fillColor(t.color);
      const lines = pdfSafe(t.content).split('\n');
      const lineHeight = t.fontSizePt * ELEMENT_LINE_HEIGHT;
      // The lines centred in the box's height, each centred in its line height, as the editor shows them.
      let y = top + (height - lines.length * lineHeight) / 2 + (lineHeight - doc.currentLineHeight()) / 2;
      for (const line of lines) {
        doc.text(line, left, y, { width, align: t.align, lineBreak: false });
        y += lineHeight;
      }
    }
    doc.restore();
  }

  private table(doc: Doc, table: PdfTable, margin: number, width: number, keepTogether: (height: number) => void) {
    const amountWidth = 160;
    const labelWidth = width - amountWidth - 10;
    doc.font('Helvetica').fontSize(10);
    const pairHeight = ([label, amount]: string[]) => Math.max(doc.heightOfString(pdfSafe(label ?? ''), { width: labelWidth }), doc.heightOfString(pdfSafe(amount ?? ''), { width: amountWidth })) + 4;
    const pair = (cells: string[], bold = false) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(10);
      keepTogether(pairHeight(cells));
      const y = doc.y;
      doc.text(pdfSafe(cells[0] ?? ''), margin, y, { width: labelWidth });
      const labelBottom = doc.y;
      doc.text(pdfSafe(cells[1] ?? ''), margin + width - amountWidth, y, { width: amountWidth, align: 'right' });
      doc.y = Math.max(labelBottom, doc.y) + 4;
    };
    // Columns: each cell in its share of the line, a little apart.
    const gap = 6;
    const columns = table.columns?.map((c) => ({ ...c, w: c.width * width - gap }));
    const cellsHeight = (cells: string[]) => Math.max(...(columns ?? []).map((c, i) => doc.heightOfString(pdfSafe(cells[i] ?? ''), { width: c.w }))) + 4;
    const cellsRow = (cells: string[], bold = false) => {
      if (!columns) return pair(cells, bold);
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(columns.length > 3 ? 9 : 10);
      keepTogether(cellsHeight(cells));
      const y = doc.y;
      let x = margin;
      let bottom = y;
      columns.forEach((c, i) => {
        doc.text(pdfSafe(cells[i] ?? ''), x, y, { width: c.w, align: c.align ?? 'left' });
        bottom = Math.max(bottom, doc.y);
        x += c.w + gap;
      });
      doc.y = bottom + 4;
    };
    const rule = () => {
      doc.moveTo(margin, doc.y).lineTo(margin + width, doc.y).strokeColor('#999999').lineWidth(0.5).stroke();
      doc.y += 4;
    };
    doc.moveDown(0.3).font('Helvetica-Bold').fontSize(11);
    const heading = pdfSafe(table.heading);
    const firstRows = table.rows.slice(0, 2).reduce((sum, r) => sum + (columns ? cellsHeight(r) : pairHeight(r)), 0);
    // The heading never sits alone at the bottom of a page.
    keepTogether(doc.heightOfString(heading, { width }) + 8 + firstRows + (columns ? 20 : 0));
    doc.text(heading, margin, doc.y, { width });
    doc.moveDown(0.4);
    if (columns) {
      cellsRow(columns.map((c) => c.label), true);
      rule();
    }
    for (const r of table.rows) cellsRow(r);
    if (table.totals?.length) {
      rule();
      for (const t of table.totals) pair(t);
    }
    if (table.total) {
      keepTogether(pairHeight(table.total) + 8);
      rule();
      pair(table.total, true);
    }
    doc.x = margin;
  }

  /** An image in its editor box within an area: stretched to fill it, or kept in proportion and centred in it. */
  private placed(doc: Doc, image: Buffer, box: ImageBox, area: { left: number; top: number; width: number; height: number }) {
    const rect = placeBox(box, area);
    doc.save();
    if (box.rotation) doc.rotate(box.rotation, { origin: [rect.left + rect.width / 2, rect.top + rect.height / 2] });
    if (box.stretch) doc.image(image, rect.left, rect.top, { width: rect.width, height: rect.height });
    else doc.image(image, rect.left, rect.top, { fit: [rect.width, rect.height], align: 'center', valign: 'center' });
    doc.restore();
    return rect;
  }

  /** The letterhead's top: its artwork, or the logo with the company's name, address and contacts. */
  private header(doc: Doc, letterhead: PdfLetterhead, area: Rect) {
    const { left, top, width, height } = area;
    if (letterhead.headerImage && letterhead.headerArtBox) {
      this.placed(doc, letterhead.headerImage, letterhead.headerArtBox, area);
    } else if (letterhead.headerImage) {
      // fit keeps the image's proportions inside the header area.
      doc.image(letterhead.headerImage, left, top, { fit: [width, height], align: 'center', valign: 'center' });
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
      let textX = left;
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
          textWidth = Math.max(40, left + width - textX);
          align = 'right';
        } else {
          textWidth = Math.max(40, rect.left - 12 - left);
        }
      } else if (letterhead.logo) {
        if (centered) {
          doc.image(letterhead.logo, left + (width - logoWidth) / 2, top, { fit: [logoWidth, logoHeight], align: 'center', valign: 'center' });
          textTop = top + logoHeight + 4;
          align = 'center';
        } else if (letterhead.logoPosition === 'LEFT') {
          doc.image(letterhead.logo, left, top, { fit: [logoWidth, logoHeight], valign: 'center' });
          textX = left + logoWidth + 12;
          textWidth = width - logoWidth - 12;
          align = 'right';
        } else {
          doc.image(letterhead.logo, left + width - logoWidth, top, { fit: [logoWidth, logoHeight], align: 'right', valign: 'center' });
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
    doc.moveTo(left, top + height + 5).lineTo(left + width, top + height + 5).strokeColor('#CCCCCC').lineWidth(0.5).stroke();
  }

  /** The letterhead's bottom: its artwork, or the registration details and footer text. */
  private footer(doc: Doc, letterhead: PdfLetterhead, area: Rect) {
    const { left, top, width, height } = area;
    doc.moveTo(left, top).lineTo(left + width, top).strokeColor('#CCCCCC').lineWidth(0.5).stroke();
    if (letterhead.footerImage && letterhead.footerArtBox) {
      this.placed(doc, letterhead.footerImage, letterhead.footerArtBox, area);
      return;
    }
    if (letterhead.footerImage) {
      doc.image(letterhead.footerImage, left, top + 3, { fit: [width, height - 3], align: 'center', valign: 'center' });
      return;
    }
    const text = [letterhead.registrationText, letterhead.footerText].filter(Boolean).join('\n');
    if (text) doc.font('Helvetica').fontSize(7.5).fillColor(GREY).text(pdfSafe(text), left, top + 4, { width, align: 'center', height: height - 4, ellipsis: true });
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
