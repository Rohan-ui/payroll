/**
 * pdf.js, loaded only when a PDF is first shown. Its worker is bundled and
 * served from the app's own address, which the security policy allows
 * (worker-src falls back to script-src 'self').
 */
export async function loadPdfjs() {
  const [pdfjs, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  return pdfjs;
}
