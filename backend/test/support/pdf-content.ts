import { inflateSync } from 'zlib';

/**
 * Reads what pdfkit drew: each page's content stream, inflated, with every
 * piece of text (its left edge, its baseline measured from the top of the
 * page, its font size and font name) and every image placement (its drawn width and height, and its left
 * edge and top measured from the top-left of the page).
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
  // Stretched spaces (justified text) are drawn as gaps of a few hundred thousandths of an em: read back as spaces.
  const decode = (tj: string) =>
    [...tj.matchAll(/<([0-9a-f]*)>|(-?[\d.]+)/g)].map((m) => (m[1] !== undefined ? Buffer.from(m[1], 'hex').toString('latin1') : Number(m[2]) <= -200 ? ' ' : '')).join('');
  // Font resources (/F1 …) to the fonts they name.
  const objects = new Map([...raw.matchAll(/(\d+) 0 obj\s*<<\s*\/Type \/Font\s*\/BaseFont \/(\S+)/g)].map((m) => [m[1], m[2]]));
  const fonts = new Map([...raw.matchAll(/\/(F\d+) (\d+) 0 R/g)].map((m) => [m[1], objects.get(m[2]) ?? m[1]]));
  return pages.map((content) => ({
    texts: [...content.matchAll(/1 0 0 1 ([\d.]+) ([\d.]+) Tm\n\/(F\d+) ([\d.]+) Tf\n\[(.*?)\] TJ/g)].map((m) => ({
      x: Number(m[1]), top: pageHeight - Number(m[2]), font: fonts.get(m[3]) ?? m[3], size: Number(m[4]), text: decode(m[5]),
      /** Drawn with widened spaces (justified). */
      stretched: [...m[5].matchAll(/(-?[\d.]+)(?![^<]*>)/g)].some((g) => Number(g[1]) <= -200),
    })),
    images: [...content.matchAll(/([\d.]+) 0 0 -([\d.]+) ([\d.]+) ([\d.]+) cm\n\/(I\d+) Do/g)].map((m) => ({
      width: Number(m[1]), height: Number(m[2]), left: Number(m[3]), top: Number(m[4]) - Number(m[2]), name: m[5],
    })),
  }));
}

/** All text of a PDF, page by page, for comparing two documents' content. */
export const pdfTexts = (pdf: Buffer, pageHeight = 841.89) => inspectPdf(pdf, pageHeight).map((page) => page.texts.map((t) => t.text));
