import { BlockAlign, DocMark, DocNode, DOCUMENT_STYLE, FONT_FAMILIES, FontKey } from './rich-document';

/**
 * Lays a formatted document out on PDF pages, the way the editor (a browser)
 * lays it out: each line as tall as its largest text times the line height,
 * text sharing a baseline, paragraph spacing collapsing (the larger of the
 * space after one block and before the next), alignment per paragraph and
 * justified lines stretched at their spaces. Lines move to a new page when
 * they would run into the footer; short paragraphs (a signature) and headings
 * with what follows them are kept together.
 */

const MM = 72 / 25.4;
const S = DOCUMENT_STYLE;

/** The pdfkit document, as much of it as the layout uses. */
export interface LayoutDoc {
  y: number;
  page: { height: number; margins: { top: number; bottom: number } };
  font(name: string): LayoutDoc;
  fontSize(size: number): LayoutDoc;
  fillColor(color: string): LayoutDoc;
  widthOfString(text: string): number;
  text(text: string, x: number, y: number, options: Record<string, unknown>): LayoutDoc;
  rect(x: number, y: number, w: number, h: number): LayoutDoc;
  fill(color: string): LayoutDoc;
  moveTo(x: number, y: number): LayoutDoc;
  lineTo(x: number, y: number): LayoutDoc;
  lineWidth(w: number): LayoutDoc;
  strokeColor(color: string): LayoutDoc;
  stroke(): LayoutDoc;
  addPage(): LayoutDoc;
}

interface Run {
  text: string;
  font: string;
  size: number;
  /** Raised (positive) or lowered (negative) from the baseline, in points. */
  shift: number;
  color: string;
  background: string | null;
  underline: boolean;
  strike: boolean;
}
type Piece = Run | 'break';
interface Segment { run: Run; text: string; width: number; spaces: number }
interface Line { segments: Segment[]; width: number; spaces: number; above: number; below: number; endsParagraph: boolean; endsWithBreak: boolean }

/** A block's settings with the defaults filled in. */
interface BlockStyle { font: FontKey; size: number; bold: boolean; italic: boolean; color: string; lineHeight: number; spaceBefore: number; spaceAfter: number; align: BlockAlign; indent: number }

export interface LayoutContext {
  left: number;
  width: number;
  /** Draws the pay table at the current position (offer letters). */
  table?: () => void;
}

/** A font's ascent and descent at a size, in points. */
function metrics(doc: LayoutDoc, font: string, size: number) {
  const f = (doc.font(font) as unknown as { _font: { ascender: number; descender: number } })._font;
  return { ascent: (f.ascender / 1000) * size, descent: (-f.descender / 1000) * size };
}

function fontName(key: FontKey, bold: boolean, italic: boolean) {
  const f = FONT_FAMILIES[key];
  return bold && italic ? f.boldItalic : bold ? f.bold : italic ? f.italic : f.regular;
}

/** The inline content of a paragraph as styled runs and line breaks. */
function pieces(nodes: DocNode[] | undefined, base: BlockStyle, safe: (t: string) => string): Piece[] {
  const out: Piece[] = [];
  for (const n of nodes ?? []) {
    if (n.type === 'hardBreak') {
      out.push('break');
      continue;
    }
    const text = n.type === 'text' ? n.text ?? '' : n.type === 'placeholder' ? `{{${n.attrs?.key}}}` : '';
    if (!text) continue;
    const has = (t: DocMark['type']) => (n.marks ?? []).some((m) => m.type === t);
    const style = (n.marks ?? []).find((m) => m.type === 'textStyle')?.attrs ?? {};
    const size = style.fontSize ?? base.size;
    const script = has('superscript') ? 1 : has('subscript') ? -1 : 0;
    out.push({
      text: safe(text),
      font: fontName((style.fontFamily as FontKey | null) ?? base.font, base.bold || has('bold'), base.italic || has('italic')),
      size: script ? size * S.script.scale : size,
      shift: script > 0 ? size * S.script.raise : script < 0 ? -size * S.script.drop : 0,
      color: style.color ?? base.color,
      background: style.backgroundColor ?? null,
      underline: has('underline'),
      strike: has('strike'),
    });
  }
  return out;
}

/** Breaks runs into lines no wider than `width`, at spaces (or inside a word too long for a line). */
function breakLines(doc: LayoutDoc, runs: Piece[], width: number, base: BlockStyle): Line[] {
  const strut = metrics(doc, fontName(base.font, base.bold, base.italic), base.size);
  const half = (size: number, m: { ascent: number; descent: number }) => (base.lineHeight * size - (m.ascent + m.descent)) / 2;
  const strutAbove = strut.ascent + half(base.size, strut);
  const strutBelow = strut.descent + half(base.size, strut);
  const lines: Line[] = [];
  let line: Line = { segments: [], width: 0, spaces: 0, above: strutAbove, below: strutBelow, endsParagraph: false, endsWithBreak: false };
  let trailing = 0; // width of spaces at the end of the line, which don't count if it wraps there

  const measure = (run: Run, text: string) => doc.font(run.font).fontSize(run.size).widthOfString(text);
  const add = (run: Run, text: string, w: number) => {
    const last = line.segments[line.segments.length - 1];
    const spaces = (text.match(/ /g) ?? []).length;
    if (last && last.run === run) {
      last.text += text;
      last.width += w;
      last.spaces += spaces;
    } else {
      line.segments.push({ run, text, width: w, spaces });
      const m = metrics(doc, run.font, run.size);
      // The text's own line box, raised or lowered with it.
      const room = (base.lineHeight * (run.shift ? run.size / S.script.scale : run.size) - (m.ascent + m.descent)) / 2;
      line.above = Math.max(line.above, m.ascent + room + run.shift);
      line.below = Math.max(line.below, m.descent + room - run.shift);
    }
    line.width += w;
    line.spaces += spaces;
  };
  const finish = (endsWithBreak: boolean) => {
    // Spaces at a wrap hang past the edge, as in the editor.
    for (let i = line.segments.length - 1; i >= 0 && !endsWithBreak; i -= 1) {
      const seg = line.segments[i];
      const kept = seg.text.replace(/ +$/, '');
      if (kept === seg.text) break;
      const width = kept ? measure(seg.run, kept) : 0;
      line.width -= seg.width - width;
      line.spaces -= seg.spaces - (kept.match(/ /g) ?? []).length;
      seg.text = kept;
      seg.width = width;
      seg.spaces = (kept.match(/ /g) ?? []).length;
      if (kept) break;
    }
    line.endsWithBreak = endsWithBreak;
    lines.push(line);
    line = { segments: [], width: 0, spaces: 0, above: strutAbove, below: strutBelow, endsParagraph: false, endsWithBreak: false };
    trailing = 0;
  };

  for (const piece of runs) {
    if (piece === 'break') {
      finish(true);
      continue;
    }
    for (const token of piece.text.match(/ +|[^ ]+/g) ?? []) {
      const w = measure(piece, token);
      if (token.startsWith(' ')) {
        add(piece, token, w);
        trailing += w;
        continue;
      }
      if (line.width - trailing + w > width && line.segments.length) finish(false);
      if (w > width) {
        // A word longer than the line: split it where it must.
        let part = '';
        for (const ch of token) {
          if (part && measure(piece, part + ch) > width - line.width) {
            add(piece, part, measure(piece, part));
            finish(false);
            part = '';
          }
          part += ch;
        }
        if (part) add(piece, part, measure(piece, part));
      } else {
        add(piece, token, w);
      }
      trailing = 0;
    }
  }
  finish(false);
  lines[lines.length - 1].endsParagraph = true;
  return lines;
}

/** Draws a document, from the current position (doc.y) on, within left…left+width. */
export function drawDocument(doc: LayoutDoc, root: DocNode, ctx: LayoutContext, safe: (t: string) => string) {
  const bottom = () => doc.page.height - doc.page.margins.bottom;
  const usable = () => bottom() - doc.page.margins.top;
  const atTop = () => Math.abs(doc.y - doc.page.margins.top) < 0.01;
  let pending = 0; // space owed after the last block
  let first = true;

  const styleOf = (n: DocNode, inList: boolean): BlockStyle => {
    const a = n.attrs ?? {};
    const heading = n.type === 'heading' ? S.headings[Number(a.level) as 1 | 2 | 3 | 4] : null;
    const spacing = heading ?? (inList ? S.listParagraph : S.paragraph);
    const value = (v: unknown, fallback: number) => (typeof v === 'number' ? v : fallback);
    return {
      font: S.fontFamily,
      size: heading?.fontSize ?? S.fontSize,
      bold: heading?.bold ?? false,
      italic: heading?.italic ?? false,
      color: heading?.color ?? S.color,
      lineHeight: value(a.lineHeight, heading ? S.headingLineHeight : S.lineHeight),
      spaceBefore: value(a.spaceBefore, spacing.spaceBefore),
      spaceAfter: value(a.spaceAfter, spacing.spaceAfter),
      align: (a.textAlign as BlockAlign | null) ?? 'left',
      indent: value(a.indent, 0) * MM,
    };
  };

  /** Moves down by the larger of the owed and wanted space (none at the top of a page). */
  const space = (before: number) => {
    const gap = first ? before : Math.max(pending, before);
    first = false;
    pending = 0;
    if (!atTop()) doc.y += gap;
  };

  const paragraph = (n: DocNode, left: number, width: number, inList: boolean, marker: string | null, keepWithNext: number) => {
    const style = styleOf(n, inList);
    const x0 = left + style.indent;
    const w = Math.max(10, width - style.indent);
    const lines = breakLines(doc, pieces(n.content, style, safe), w, style);
    const height = lines.reduce((sum, l) => sum + l.above + l.below, 0);
    space(style.spaceBefore);
    // Short paragraphs (a signature, a clause) and headings with what follows stay whole.
    const whole = height + keepWithNext;
    if (whole <= usable() * 0.5 && doc.y + whole > bottom()) doc.addPage();

    lines.forEach((line, index) => {
      if (doc.y + line.above + line.below > bottom() + 0.01 && !atTop()) doc.addPage();
      const baseline = doc.y + line.above;
      const free = w - line.width;
      const justify = style.align === 'justify' && !line.endsParagraph && !line.endsWithBreak && line.spaces > 0;
      const extra = justify ? free / line.spaces : 0;
      let x = x0 + (style.align === 'center' ? free / 2 : style.align === 'right' ? free : 0);
      if (marker && index === 0) {
        const font = fontName(style.font, false, false);
        const markerWidth = doc.font(font).fontSize(style.size).widthOfString(marker);
        doc.fillColor(style.color).text(marker, x0 - 2 * MM - markerWidth, baseline, { lineBreak: false, baseline: 'alphabetic' });
      }
      for (const seg of line.segments) {
        const run = seg.run;
        const segWidth = seg.width + extra * seg.spaces;
        const y = baseline - run.shift;
        const m = metrics(doc, run.font, run.size);
        if (run.background) doc.rect(x, y - m.ascent, segWidth, m.ascent + m.descent).fill(run.background);
        if (seg.text) doc.font(run.font).fontSize(run.size).fillColor(run.color).text(seg.text, x, y, { lineBreak: false, baseline: 'alphabetic', ...(extra ? { wordSpacing: extra } : {}) });
        const rule = (at: number) => doc.moveTo(x, at).lineTo(x + segWidth, at).lineWidth(Math.max(0.5, run.size / 16)).strokeColor(run.color).stroke();
        if (run.underline) rule(y + run.size * 0.12);
        if (run.strike) rule(y - run.size * 0.28);
        x += segWidth;
      }
      doc.y = baseline + line.below;
    });
    pending = style.spaceAfter;
  };

  const blocks = (nodes: DocNode[] | undefined, left: number, width: number, inList: boolean) => {
    (nodes ?? []).forEach((n, i) => {
      if (n.type === 'paragraph' || n.type === 'heading') {
        // A heading keeps at least two lines of what follows on its page.
        const next = n.type === 'heading' && nodes![i + 1] ? 2 * S.lineHeight * S.fontSize : 0;
        paragraph(n, left, width, inList, null, next);
      } else if (n.type === 'bulletList' || n.type === 'orderedList') {
        const indent = S.listIndentMm * MM;
        n.content?.forEach((item, k) => {
          const marker = n.type === 'bulletList' ? '•' : `${Number(n.attrs?.start ?? 1) + k}.`;
          item.content?.forEach((child, c) => {
            if ((child.type === 'paragraph' || child.type === 'heading') && c === 0) paragraph(child, left + indent, width - indent, true, marker, 0);
            else blocks([child], left + indent, width - indent, true);
          });
        });
      } else if (n.type === 'horizontalRule') {
        space(S.rule.spaceBefore);
        if (doc.y + S.rule.thickness > bottom()) doc.addPage();
        doc.moveTo(left, doc.y + S.rule.thickness / 2).lineTo(left + width, doc.y + S.rule.thickness / 2).lineWidth(S.rule.thickness).strokeColor(S.rule.color).stroke();
        doc.y += S.rule.thickness;
        pending = S.rule.spaceAfter;
      } else if (n.type === 'compensationTable' && ctx.table) {
        space(S.table.spaceBefore);
        ctx.table();
        pending = S.table.spaceAfter;
      }
    });
  };

  blocks(root.content, ctx.left, ctx.width, false);
  doc.y += pending;
}
