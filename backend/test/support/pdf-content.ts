import { inflateSync } from 'zlib';

/**
 * Reads what pdfkit drew: each page's content stream, inflated, with every
 * piece of text (its baseline measured from the top of the page, and its font
 * size) and every image placement (its drawn width and height).
 */
export function inspectPdf(pdf: Buffer, pageHeight: number) {
  const raw = pdf.toString('latin1');
  const pages = [...raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)]
    .map((m) => {
      try {
        return inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1');
      } catch {
        return '';
      }
    })
    .filter((content) => /\nBT\n/.test(content));
  const decode = (tj: string) => [...tj.matchAll(/<([0-9a-f]*)>/g)].map((m) => Buffer.from(m[1], 'hex').toString('latin1')).join('');
  return pages.map((content) => ({
    texts: [...content.matchAll(/1 0 0 1 ([\d.]+) ([\d.]+) Tm\n\/F\d+ ([\d.]+) Tf\n\[(.*?)\] TJ/g)].map((m) => ({ top: pageHeight - Number(m[2]), size: Number(m[3]), text: decode(m[4]) })),
    images: [...content.matchAll(/([\d.]+) 0 0 -([\d.]+) [\d.]+ [\d.]+ cm\n\/(I\d+) Do/g)].map((m) => ({ width: Number(m[1]), height: Number(m[2]), name: m[3] })),
  }));
}

/** All text of a PDF, page by page, for comparing two documents' content. */
export const pdfTexts = (pdf: Buffer, pageHeight = 841.89) => inspectPdf(pdf, pageHeight).map((page) => page.texts.map((t) => t.text));
