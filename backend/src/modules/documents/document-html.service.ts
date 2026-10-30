import { Injectable } from '@nestjs/common';
import { cleanDocumentForRender, DocMark, DocNode, DOCUMENT_STYLE, FONT_FAMILIES, FontKey } from './rich-document';
import { LetterPdf, PdfElement, PdfLayout, PdfLetterhead, PdfTable, PLAIN_LAYOUT } from './document-pdf.service';

const PAGE_DIMENSIONS_MM = {
  A4: { width: 210, height: 297 },
  LETTER: { width: 215.9, height: 279.4 },
};

function escapeHtml(str: unknown): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function bufferToDataUri(buffer?: Buffer | null, fallbackMime = 'image/png'): string | null {
  if (!buffer || buffer.length === 0) return null;
  const isJpg = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const mime = isJpg ? 'image/jpeg' : fallbackMime;
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

@Injectable()
export class DocumentHtmlService {
  /**
   * Generates a self-contained, print-compatible HTML document for rendering to PDF.
   * Matches the template editor's typography, margins, tables, images, and page dimensions exactly.
   */
  generateHtml(letter: LetterPdf, layout: PdfLayout = PLAIN_LAYOUT): string {
    const rawSize = String(layout.pageSize || '').trim().toUpperCase();
    const pageSizeKey: 'A4' | 'LETTER' = rawSize === 'LETTER' ? 'LETTER' : 'A4';
    const pageDim = PAGE_DIMENSIONS_MM[pageSizeKey];
    const m = layout.marginsMm || { top: 20, right: 20, bottom: 20, left: 20 };
    const lh = layout.letterhead;
    const at = lh?.placement;

    const left = at ? at.sideOffsetMm : m.left;
    const right = at ? at.sideOffsetMm : m.right;
    const headerOffset = at ? at.headerOffsetMm : m.top;
    const footerOffset = at ? at.footerOffsetMm : m.bottom;
    const headerH = lh ? lh.headerHeightMm : 0;
    const footerH = lh ? lh.footerHeightMm : 0;

    const bodyTop = Math.max(m.top, headerH > 0 ? headerOffset + headerH + 4 : m.top);
    const bodyBottom = Math.max(m.bottom, footerH > 0 ? footerOffset + footerH + 3 : m.bottom);
    const contentWidthMm = Math.max(50, pageDim.width - m.left - m.right);

    const s = DOCUMENT_STYLE;
    const bodyFont = FONT_FAMILIES[s.fontFamily]?.css || 'Helvetica, Arial, sans-serif';

    const headerHtml = this.renderHeader(lh, letter.companyName, headerOffset, headerH, left, right, pageDim.width);
    const footerHtml = this.renderFooter(lh, letter.footer, footerOffset, footerH, left, right, pageDim.width);
    const elementsHtml = this.renderElements(lh?.elements, letter.watermark, pageDim);
    const cleanedDoc = letter.document ? cleanDocumentForRender(letter.document) : undefined;
    const bodyHtml = cleanedDoc
      ? this.renderDocNode(cleanedDoc, letter)
      : this.renderLegacyBody(letter, contentWidthMm);

    const pageNumberBottomMargin = Math.max(8, Math.round(bodyBottom / 2));

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(letter.title || 'Document')}</title>
  <style>
    @page {
      size: ${pageSizeKey === 'LETTER' ? 'letter portrait' : 'A4 portrait'};
      margin: 0 0 ${pageNumberBottomMargin}mm 0;
      ${
        layout.showPageNumbers
          ? `
      @bottom-right {
        content: "Page " counter(page) " of " counter(pages);
        font-family: ${bodyFont};
        font-size: 8pt;
        color: #555555;
        padding-right: ${m.right}mm;
        padding-bottom: 2mm;
      }`
          : ''
      }
    }

    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    html, body {
      margin: 0;
      padding: 0;
      width: ${pageDim.width}mm;
      background: #ffffff;
      font-family: ${bodyFont};
      font-size: ${s.fontSize}pt;
      line-height: ${s.lineHeight};
      color: ${s.color};
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }

    /* Print Document Table Layout (Running Header & Footer) */
    table.doc-layout {
      width: 100%;
      border-collapse: collapse;
      border-spacing: 0;
      position: relative;
      z-index: 10;
    }

    thead.doc-thead {
      display: table-header-group;
    }

    tfoot.doc-tfoot {
      display: table-footer-group;
    }

    tbody.doc-tbody {
      display: table-row-group;
    }

    .header-cell {
      padding: 0;
      vertical-align: top;
      height: ${bodyTop}mm;
    }

    .footer-cell {
      padding: 0;
      vertical-align: bottom;
      height: ${bodyBottom - pageNumberBottomMargin}mm;
    }

    .body-cell {
      padding: 0 ${m.right}mm 0 ${m.left}mm;
      vertical-align: top;
    }

    /* Content Typography Matching Template Editor */
    .document-body {
      width: 100%;
      white-space: pre-wrap;
      word-wrap: break-word;
      overflow-wrap: break-word;
    }

    .document-body p {
      margin: ${s.paragraph.spaceBefore}pt 0 ${s.paragraph.spaceAfter}pt 0;
    }

    .document-body h1 {
      font-size: ${s.headings[1].fontSize}pt;
      font-weight: ${s.headings[1].bold ? 700 : 400};
      color: ${s.headings[1].color};
      line-height: ${s.headingLineHeight};
      margin: ${s.headings[1].spaceBefore}pt 0 ${s.headings[1].spaceAfter}pt 0;
      break-after: avoid;
      page-break-after: avoid;
    }

    .document-body h2 {
      font-size: ${s.headings[2].fontSize}pt;
      font-weight: ${s.headings[2].bold ? 700 : 400};
      color: ${s.headings[2].color};
      line-height: ${s.headingLineHeight};
      margin: ${s.headings[2].spaceBefore}pt 0 ${s.headings[2].spaceAfter}pt 0;
      break-after: avoid;
      page-break-after: avoid;
    }

    .document-body h3 {
      font-size: ${s.headings[3].fontSize}pt;
      font-weight: ${s.headings[3].bold ? 700 : 400};
      color: ${s.headings[3].color};
      line-height: ${s.headingLineHeight};
      margin: ${s.headings[3].spaceBefore}pt 0 ${s.headings[3].spaceAfter}pt 0;
      break-after: avoid;
      page-break-after: avoid;
    }

    .document-body h4 {
      font-size: ${s.headings[4].fontSize}pt;
      font-weight: ${s.headings[4].bold ? 700 : 400};
      font-style: ${s.headings[4].italic ? 'italic' : 'normal'};
      color: ${s.headings[4].color};
      line-height: ${s.headingLineHeight};
      margin: ${s.headings[4].spaceBefore}pt 0 ${s.headings[4].spaceAfter}pt 0;
      break-after: avoid;
      page-break-after: avoid;
    }

    .document-body > :first-child {
      margin-top: 0 !important;
    }

    .document-body ul, .document-body ol {
      margin: 0;
      padding-left: ${s.listIndentMm}mm;
    }

    .document-body ul {
      list-style-type: disc;
    }

    .document-body ol {
      list-style-type: decimal;
    }

    .document-body li > p {
      margin: ${s.listParagraph.spaceBefore}pt 0 ${s.listParagraph.spaceAfter}pt 0;
    }

    .document-body hr {
      border: 0;
      border-top: ${s.rule.thickness}pt solid ${s.rule.color};
      margin: ${s.rule.spaceBefore}pt 0 ${s.rule.spaceAfter}pt 0;
    }

    .document-body strong {
      font-weight: 700;
    }

    .document-body sup {
      font-size: ${s.script.scale * 100}%;
      vertical-align: ${s.script.raise / s.script.scale}em;
      line-height: 0;
    }

    .document-body sub {
      font-size: ${s.script.scale * 100}%;
      vertical-align: -${s.script.drop / s.script.scale}em;
      line-height: 0;
    }

    /* Page Breaks */
    .letter-page-break {
      break-after: page;
      page-break-after: always;
      height: 0;
      margin: 0;
      padding: 0;
      border: none;
      visibility: hidden;
    }

    /* Custom Tables Matching Editor */
    table.letter-custom-table {
      border-collapse: collapse;
      table-layout: fixed;
      width: 100%;
      margin: ${s.table.spaceBefore}pt 0 ${s.table.spaceAfter}pt 0;
      box-sizing: border-box;
    }

    table.letter-custom-table tr {
      break-inside: avoid;
      page-break-inside: avoid;
    }

    table.letter-custom-table thead {
      display: table-header-group;
    }

    table.letter-custom-table td,
    table.letter-custom-table th {
      vertical-align: top;
      box-sizing: border-box;
      position: relative;
      border: 0.75pt solid #cbd5e1;
      padding: 3pt 5pt;
      min-height: 14pt;
      word-wrap: break-word;
      overflow-wrap: break-word;
    }

    table.letter-custom-table th {
      font-weight: 600;
      background-color: #f8fafc;
    }

    /* Compensation Pay Tables */
    .letter-pay-table {
      margin: ${s.table.spaceBefore}pt 0 ${s.table.spaceAfter}pt 0;
      font-size: 10pt;
      border: 1px dashed #94a3b8;
      border-radius: 4px;
      padding: 4pt 6pt;
      color: #334155;
      break-inside: avoid;
      page-break-inside: avoid;
    }

    .letter-pay-heading {
      font-weight: 700;
      font-size: 11pt;
      margin-bottom: 3pt;
    }

    .letter-pay-row {
      display: flex;
      justify-content: space-between;
      padding: 1pt 0;
    }

    .letter-pay-total {
      font-weight: 700;
      border-top: 0.5pt solid #999999;
      margin-top: 2pt;
      padding-top: 3pt;
    }

    .letter-pay-note {
      margin-top: 3pt;
      font-size: 8pt;
      color: #64748b;
      font-style: italic;
    }

    /* Watermarks & Fixed Canvas Elements */
    .watermark-overlay {
      position: fixed;
      top: 35%;
      left: 10%;
      width: 80%;
      text-align: center;
      transform: rotate(-35deg);
      font-size: 64pt;
      font-weight: 700;
      color: rgba(15, 118, 110, 0.12);
      pointer-events: none;
      z-index: 0;
      letter-spacing: 0.2em;
      text-transform: uppercase;
    }
  </style>
</head>
<body>
  ${elementsHtml}
  <table class="doc-layout">
    <thead class="doc-thead">
      <tr>
        <td class="header-cell">
          ${headerHtml}
        </td>
      </tr>
    </thead>
    <tfoot class="doc-tfoot">
      <tr>
        <td class="footer-cell">
          ${footerHtml}
        </td>
      </tr>
    </tfoot>
    <tbody class="doc-tbody">
      <tr>
        <td class="body-cell">
          <div class="document-body">
            ${bodyHtml}
          </div>
        </td>
      </tr>
    </tbody>
  </table>
</body>
</html>`;
  }

  private renderHeader(
    lh: PdfLetterhead | null,
    companyName: string,
    topOffsetMm: number,
    heightMm: number,
    leftMm: number,
    rightMm: number,
    pageWidthMm: number,
  ): string {
    if (!lh && !companyName) return '';
    const containerStyle = `padding-top: ${topOffsetMm}mm; padding-left: ${leftMm}mm; padding-right: ${rightMm}mm; width: ${pageWidthMm}mm;`;

    if (lh?.headerImage) {
      const src = bufferToDataUri(lh.headerImage);
      const stretch = lh.headerArtBox?.stretch ?? false;
      return `<div style="${containerStyle}">
        <img src="${src}" alt="" style="width: 100%; height: ${heightMm}mm; object-fit: ${stretch ? 'fill' : 'contain'}; display: block;" />
      </div>`;
    }

    const logoSrc = bufferToDataUri(lh?.logo);
    const cName = lh?.companyName || companyName;
    const addr = lh?.addressText || '';
    const phone = lh?.phone || '';
    const email = lh?.email || '';
    const web = lh?.website || '';
    const reg = lh?.registrationText || '';

    const contacts = [phone ? `Tel: ${escapeHtml(phone)}` : '', email ? escapeHtml(email) : '', web ? escapeHtml(web) : ''].filter(Boolean).join(' · ');

    return `<div style="${containerStyle}">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; height: ${heightMm || 28}mm; border-bottom: 1.5pt solid #0d9488; padding-bottom: 2mm;">
        <div style="max-width: 60%;">
          <div style="font-size: 14pt; font-weight: 700; color: #0f766e; letter-spacing: -0.01em;">${escapeHtml(cName)}</div>
          ${addr ? `<div style="font-size: 8pt; color: #555555; margin-top: 1mm; line-height: 1.3; white-space: pre-line;">${escapeHtml(addr)}</div>` : ''}
          ${contacts ? `<div style="font-size: 7.5pt; color: #64748b; margin-top: 1mm;">${contacts}</div>` : ''}
          ${reg ? `<div style="font-size: 7pt; color: #94a3b8; margin-top: 0.5mm;">${escapeHtml(reg)}</div>` : ''}
        </div>
        ${
          logoSrc
            ? `<div style="display: flex; justify-content: flex-end; align-items: flex-start;">
                <img src="${logoSrc}" alt="" style="max-height: ${Math.min(heightMm || 25, 25)}mm; max-width: 55mm; object-fit: contain; display: block;" />
              </div>`
            : ''
        }
      </div>
    </div>`;
  }

  private renderFooter(
    lh: PdfLetterhead | null,
    extraFooter: string | undefined,
    bottomOffsetMm: number,
    heightMm: number,
    leftMm: number,
    rightMm: number,
    pageWidthMm: number,
  ): string {
    const footerText = lh?.footerText || extraFooter || '';
    const containerStyle = `padding-bottom: ${bottomOffsetMm}mm; padding-left: ${leftMm}mm; padding-right: ${rightMm}mm; width: ${pageWidthMm}mm;`;

    if (lh?.footerImage) {
      const src = bufferToDataUri(lh.footerImage);
      const stretch = lh.footerArtBox?.stretch ?? false;
      return `<div style="${containerStyle}">
        <img src="${src}" alt="" style="width: 100%; height: ${heightMm}mm; object-fit: ${stretch ? 'fill' : 'contain'}; display: block;" />
      </div>`;
    }

    if (!footerText) {
      return `<div style="${containerStyle}"></div>`;
    }

    return `<div style="${containerStyle}">
      <div style="display: flex; justify-content: space-between; align-items: center; border-top: 0.75pt solid #cbd5e1; padding-top: 1.5mm; font-size: 8pt; color: #64748b;">
        <span>${escapeHtml(footerText)}</span>
      </div>
    </div>`;
  }

  private renderElements(elements: PdfElement[] | undefined, watermark: string | undefined, pageDim: { width: number; height: number }): string {
    const parts: string[] = [];
    if (watermark) {
      parts.push(`<div class="watermark-overlay">${escapeHtml(watermark)}</div>`);
    }

    for (const el of elements ?? []) {
      const x = el.x;
      const y = el.y;
      const w = el.width;
      const h = el.height;
      const rot = el.rotation || 0;
      const op = el.opacity ?? 1;
      const z = el.aboveText ? 50 : 0;

      if (el.image) {
        const src = bufferToDataUri(el.image);
        parts.push(
          `<div style="position: fixed; left: ${x}mm; top: ${y}mm; width: ${w}mm; height: ${h}mm; transform: rotate(${rot}deg); opacity: ${op}; z-index: ${z}; pointer-events: none;">
            <img src="${src}" alt="" style="width: 100%; height: 100%; object-fit: contain;" />
          </div>`,
        );
      } else if (el.text) {
        const t = el.text;
        const font = FONT_FAMILIES[t.fontFamily]?.css || 'Helvetica, Arial, sans-serif';
        const align = t.align || 'center';
        parts.push(
          `<div style="position: fixed; left: ${x}mm; top: ${y}mm; width: ${w}mm; height: ${h}mm; transform: rotate(${rot}deg); opacity: ${op}; z-index: ${z}; font-family: ${font}; font-size: ${t.fontSizePt}pt; color: ${t.color}; font-weight: ${t.bold ? 700 : 400}; font-style: ${t.italic ? 'italic' : 'normal'}; text-align: ${align}; pointer-events: none; display: flex; align-items: center; justify-content: ${align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center'};">
            ${escapeHtml(t.content)}
          </div>`,
        );
      }
    }

    return parts.join('\n');
  }

  private renderDocNode(node: DocNode, letter: LetterPdf): string {
    const s = DOCUMENT_STYLE;

    switch (node.type) {
      case 'doc':
        return (node.content || []).map((child) => this.renderDocNode(child, letter)).join('\n');

      case 'paragraph': {
        const attrs = node.attrs || {};
        const styles: string[] = [];
        if (attrs.textAlign) styles.push(`text-align: ${attrs.textAlign};`);
        if (attrs.lineHeight) styles.push(`line-height: ${attrs.lineHeight};`);
        if (typeof attrs.spaceBefore === 'number') styles.push(`margin-top: ${attrs.spaceBefore}pt;`);
        if (typeof attrs.spaceAfter === 'number') styles.push(`margin-bottom: ${attrs.spaceAfter}pt;`);
        if (attrs.indent) styles.push(`margin-left: ${attrs.indent}mm;`);

        const inner = (node.content || []).map((c) => this.renderInlineNode(c)).join('');
        return `<p${styles.length ? ` style="${styles.join(' ')}"` : ''}>${inner || '&nbsp;'}</p>`;
      }

      case 'heading': {
        const attrs = node.attrs || {};
        const level = [1, 2, 3, 4].includes(Number(attrs.level)) ? Number(attrs.level) : 1;
        const styles: string[] = [];
        if (attrs.textAlign) styles.push(`text-align: ${attrs.textAlign};`);
        if (attrs.lineHeight) styles.push(`line-height: ${attrs.lineHeight};`);
        if (typeof attrs.spaceBefore === 'number') styles.push(`margin-top: ${attrs.spaceBefore}pt;`);
        if (typeof attrs.spaceAfter === 'number') styles.push(`margin-bottom: ${attrs.spaceAfter}pt;`);
        if (attrs.indent) styles.push(`margin-left: ${attrs.indent}mm;`);

        const inner = (node.content || []).map((c) => this.renderInlineNode(c)).join('');
        return `<h${level}${styles.length ? ` style="${styles.join(' ')}"` : ''}>${inner || '&nbsp;'}</h${level}>`;
      }

      case 'bulletList':
        return `<ul>${(node.content || []).map((c) => this.renderDocNode(c, letter)).join('')}</ul>`;

      case 'orderedList': {
        const start = Number(node.attrs?.start ?? 1);
        return `<ol start="${start}">${(node.content || []).map((c) => this.renderDocNode(c, letter)).join('')}</ol>`;
      }

      case 'listItem':
        return `<li>${(node.content || []).map((c) => this.renderDocNode(c, letter)).join('')}</li>`;

      case 'horizontalRule':
        return '<hr />';

      case 'hardBreak':
        return '<br />';

      case 'pageBreak':
        return '<div class="letter-page-break"></div>';

      case 'compensationTable':
        return this.renderCompensationTable(letter.table);

      case 'table':
        return this.renderCustomTable(node, letter);

      case 'documentImage':
        return this.renderDocumentImage(node, letter);

      default:
        if (node.content) {
          return node.content.map((c) => this.renderDocNode(c, letter)).join('');
        }
        return '';
    }
  }

  private renderInlineNode(node: DocNode): string {
    if (node.type === 'hardBreak') return '<br />';
    if (node.type === 'placeholder') {
      return `<span class="letter-placeholder">${escapeHtml(`{{${node.attrs?.key || ''}}}`)}</span>`;
    }
    if (node.type !== 'text') return '';

    let text = escapeHtml(node.text || '');
    if (!node.marks || node.marks.length === 0) return text;

    let spanStyles: string[] = [];

    for (const mark of node.marks) {
      if (mark.type === 'bold') text = `<strong>${text}</strong>`;
      else if (mark.type === 'italic') text = `<em>${text}</em>`;
      else if (mark.type === 'underline') text = `<u>${text}</u>`;
      else if (mark.type === 'strike') text = `<s>${text}</s>`;
      else if (mark.type === 'subscript') text = `<sub>${text}</sub>`;
      else if (mark.type === 'superscript') text = `<sup>${text}</sup>`;
      else if (mark.type === 'textStyle' && mark.attrs) {
        if (mark.attrs.fontFamily) {
          const font = FONT_FAMILIES[mark.attrs.fontFamily as FontKey]?.css;
          if (font) spanStyles.push(`font-family: ${font};`);
        }
        if (typeof mark.attrs.fontSize === 'number') {
          spanStyles.push(`font-size: ${mark.attrs.fontSize}pt;`);
        }
        if (mark.attrs.color) {
          spanStyles.push(`color: ${mark.attrs.color};`);
        }
        if (mark.attrs.backgroundColor) {
          spanStyles.push(`background-color: ${mark.attrs.backgroundColor};`);
        }
      }
    }

    if (spanStyles.length) {
      return `<span style="${spanStyles.join(' ')}">${text}</span>`;
    }
    return text;
  }

  private renderCustomTable(tableNode: DocNode, letter: LetterPdf): string {
    const rows = tableNode.content || [];
    if (rows.length === 0) return '';

    const rowsHtml = rows
      .map((rowNode) => {
        const cellsHtml = (rowNode.content || [])
          .map((cellNode) => {
            const isHeader = cellNode.type === 'tableHeader';
            const tag = isHeader ? 'th' : 'td';
            const attrs = cellNode.attrs || {};
            const styles: string[] = [];

            if (attrs.borderTop) styles.push(`border-top: ${attrs.borderTop};`);
            if (attrs.borderBottom) styles.push(`border-bottom: ${attrs.borderBottom};`);
            if (attrs.borderLeft) styles.push(`border-left: ${attrs.borderLeft};`);
            if (attrs.borderRight) styles.push(`border-right: ${attrs.borderRight};`);
            if (attrs.backgroundColor) styles.push(`background-color: ${attrs.backgroundColor};`);
            if (attrs.verticalAlign) styles.push(`vertical-align: ${attrs.verticalAlign};`);
            if (typeof attrs.padding === 'number') {
              styles.push(`padding: ${attrs.padding}pt ${attrs.padding + 2}pt;`);
            }
            if (typeof attrs.rowHeight === 'number') {
              styles.push(`height: ${attrs.rowHeight}pt;`);
            }

            const colwidth = Array.isArray(attrs.colwidth) && attrs.colwidth.length > 0 ? attrs.colwidth[0] : null;
            if (typeof colwidth === 'number' && colwidth > 0) {
              styles.push(`width: ${colwidth}px;`);
            }

            const colspan = Number(attrs.colspan || 1);
            const rowspan = Number(attrs.rowspan || 1);
            const attrParts: string[] = [];
            if (colspan > 1) attrParts.push(`colspan="${colspan}"`);
            if (rowspan > 1) attrParts.push(`rowspan="${rowspan}"`);
            if (styles.length) attrParts.push(`style="${styles.join(' ')}"`);

            const cellInner = (cellNode.content || []).map((c) => this.renderDocNode(c, letter)).join('');
            return `<${tag}${attrParts.length ? ` ${attrParts.join(' ')}` : ''}>${cellInner || '&nbsp;'}</${tag}>`;
          })
          .join('');

        return `<tr>${cellsHtml}</tr>`;
      })
      .join('');

    return `<table class="letter-custom-table">${rowsHtml}</table>`;
  }

  private renderCompensationTable(table?: PdfTable): string {
    if (!table) return '';
    const rowsHtml = (table.rows || [])
      .map((r) => {
        const label = r[0] || '';
        const amount = r[1] || '';
        return `<div class="letter-pay-row"><span>${escapeHtml(label)}</span><span>${escapeHtml(amount)}</span></div>`;
      })
      .join('');

    const totalsHtml = (table.totals || (table.total ? [table.total] : []))
      .map(([label, amount]) => `<div class="letter-pay-row letter-pay-total"><span>${escapeHtml(label)}</span><span>${escapeHtml(amount)}</span></div>`)
      .join('');

    return `<div class="letter-pay-table">
      <div class="letter-pay-heading">${escapeHtml(table.heading || 'Compensation Details')}</div>
      ${rowsHtml}
      ${totalsHtml}
    </div>`;
  }

  private renderDocumentImage(node: DocNode, letter: LetterPdf): string {
    const attrs = node.attrs as Record<string, unknown> | undefined;
    if (!attrs) return '';

    const key = (attrs.assetId as string) || (attrs.id as string);
    let src = '';
    if (key && letter.images?.[key]) {
      src = bufferToDataUri(letter.images[key]) || '';
    }
    if (!src && typeof attrs.src === 'string' && attrs.src) {
      src = attrs.src;
    }
    if (!src) return '';

    const widthMm = Number(attrs.widthMm) || 45;
    const heightMm = Number(attrs.heightMm) || 20;
    const opacity = Number(attrs.opacity) ?? 1;
    const alignment = (attrs.alignment as string) || 'left';
    const alignStyle = alignment === 'center' ? 'text-align: center;' : alignment === 'right' ? 'text-align: right;' : 'text-align: left;';

    return `<div style="${alignStyle} margin: 8pt 0; break-inside: avoid; page-break-inside: avoid;">
      <img src="${src}" alt="${escapeHtml(attrs.alt || '')}" style="width: ${widthMm}mm; height: ${heightMm}mm; opacity: ${opacity}; object-fit: contain; display: inline-block;" />
    </div>`;
  }

  private renderLegacyBody(letter: LetterPdf, widthMm: number): string {
    const parts: string[] = [];
    if (letter.reference || letter.dateText) {
      parts.push(`<p style="font-size: 9pt; color: #555555; margin-bottom: 12pt;">Ref: ${escapeHtml(letter.reference)} &nbsp;&nbsp;&nbsp;&nbsp; Date: ${escapeHtml(letter.dateText)}</p>`);
    }
    if (letter.title) {
      parts.push(`<h1 style="font-size: 14pt; margin-bottom: 12pt;">${escapeHtml(letter.title)}</h1>`);
    }
    for (const paragraph of (letter.body || '').split(/\n\s*\n/)) {
      const trimmed = paragraph.trim();
      if (trimmed) {
        parts.push(`<p style="line-height: 1.35; margin-bottom: 8pt;">${escapeHtml(trimmed)}</p>`);
      }
    }
    if (letter.table) {
      parts.push(this.renderCompensationTable(letter.table));
    }
    return parts.join('\n');
  }
}
