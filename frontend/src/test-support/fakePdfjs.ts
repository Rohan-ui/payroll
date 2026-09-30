import { vi } from 'vitest';

/**
 * A stand-in for pdf.js in tests (jsdom can't draw on a canvas): a document of
 * `pages` pages of the given size. Records which pages were drawn and whether
 * documents were destroyed. Empty data is refused as not a PDF.
 */
export function fakePdfjs(pages = 3, size = { width: 612, height: 792 }) {
  const drawn: number[] = [];
  const destroyed = { count: 0 };
  const getDocument = vi.fn(({ data }: { data: Uint8Array }) => ({
    promise:
      data.length === 0
        ? Promise.reject(new Error('Invalid PDF structure'))
        : Promise.resolve({
            numPages: pages,
            getPage: async (number: number) => ({
              getViewport: ({ scale }: { scale: number }) => ({ width: size.width * scale, height: size.height * scale }),
              render: () => {
                drawn.push(number);
                return { promise: Promise.resolve(), cancel: () => undefined };
              },
            }),
          }),
    destroy: async () => {
      destroyed.count += 1;
    },
  }));
  return { module: { getDocument, GlobalWorkerOptions: {} as { workerSrc?: string } }, getDocument, drawn, destroyed };
}
