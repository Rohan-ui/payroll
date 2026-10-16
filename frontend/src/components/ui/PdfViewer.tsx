import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Download, Maximize2, Minimize2, X, ZoomIn, ZoomOut } from 'lucide-react';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { loadPdfjs } from '../../lib/pdfjs';
import { cn } from '../../utils/cn';

export interface PdfViewerProps {
  /** What the document is, e.g. "Offer OFR-2026-100001". */
  title: string;
  description?: string;
  /** Fetches the file's bytes through the caller's authorized route. Called again by Retry. */
  load: () => Promise<ArrayBuffer>;
  /** The file name the Download button saves under. Without it there is no Download button. */
  downloadName?: string;
  /** A note shown above the pages, such as that this is a sample and not the final document. */
  notice?: string;
  /** Controls shown above the pages, such as a choice of which template to print with. */
  controls?: React.ReactNode;
  onClose: () => void;
}

/** PDF points to CSS pixels: at 100% a page shows at its printed size. */
const CSS_UNITS = 96 / 72;
const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4];
const MIN_ZOOM = ZOOM_STEPS[0];
const MAX_ZOOM = ZOOM_STEPS[ZOOM_STEPS.length - 1];
/** Largest canvas drawn for one page; beyond it the page is drawn at a lower resolution rather than exhaust memory. */
const MAX_CANVAS_PIXELS = 16_777_216;
const PADDING = 16;
/** Pages drawn ahead of and behind the visible ones; the rest are released. */
const RENDER_MARGIN = '1200px 0px';

type Fit = 'auto' | 'width' | 'page' | null;
type Status = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready' };

const clampZoom = (zoom: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
const buttonClass =
  'inline-flex items-center justify-center gap-1 h-8 min-w-8 px-2 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 disabled:opacity-40 disabled:hover:bg-transparent';

/**
 * The app's PDF viewer: a large in-app view with page navigation, zoom
 * (in and out, fit to width, fit to page, actual size), full screen and an
 * explicit Download. Pages are drawn with pdf.js on canvases, only near the
 * visible part of the document, so long files stay responsive; no browser
 * plugin or embedded frame is used, which the security policy forbids.
 *
 * Keys: + and - zoom, 0 actual size, ← and → previous and next page,
 * Home and End first and last page, Esc closes.
 */
export const PdfViewer: React.FC<PdfViewerProps> = ({ title, description, load, downloadName, notice, controls, onClose }) => {
  const ids = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const docRef = useRef<PDFDocumentProxy | null>(null);
  const bytesRef = useRef<ArrayBuffer | null>(null);
  const loadRef = useRef(load);
  loadRef.current = load;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<Status>({ kind: 'loading' });
  const [sizes, setSizes] = useState<{ width: number; height: number }[]>([]);
  const [zoom, setZoom] = useState(1);
  const [fit, setFit] = useState<Fit>('auto');
  const [page, setPage] = useState(1);
  const pageRef = useRef(1);
  pageRef.current = page;
  const [pageInput, setPageInput] = useState('1');
  const [fullscreen, setFullscreen] = useState(false);
  const [visibleTick, setVisibleTick] = useState(0);
  const visible = useRef(new Set<number>());
  const rendered = useRef(new Map<number, number>());
  const anchor = useRef<{ page: number; ratio: number } | null>(null);
  const canFullscreen = typeof document !== 'undefined' && Boolean(document.fullscreenEnabled);

  // ── Loading ─────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    let destroy: (() => Promise<void>) | null = null;
    setStatus({ kind: 'loading' });
    setSizes([]);
    rendered.current.clear();
    (async () => {
      let bytes: ArrayBuffer;
      try {
        bytes = await loadRef.current();
      } catch (error) {
        throw error instanceof Error ? error : new Error('The PDF could not be loaded.');
      }
      const pdfjs = await loadPdfjs();
      // A copy: pdf.js hands its buffer to its worker, and Download needs the original.
      const task = pdfjs.getDocument({ data: new Uint8Array(bytes.slice(0)) });
      destroy = () => task.destroy();
      let doc: PDFDocumentProxy;
      try {
        doc = await task.promise;
      } catch {
        throw new Error('This file could not be read as a PDF.');
      }
      const pageSizes: { width: number; height: number }[] = [];
      for (let number = 1; number <= doc.numPages; number += 1) {
        const viewport = (await doc.getPage(number)).getViewport({ scale: 1 });
        pageSizes.push({ width: viewport.width, height: viewport.height });
      }
      if (cancelled) return;
      docRef.current = doc;
      bytesRef.current = bytes;
      setSizes(pageSizes);
      setPage(1);
      setPageInput('1');
      setFit('auto');
      setStatus({ kind: 'ready' });
    })().catch((error: Error) => {
      if (!cancelled) setStatus({ kind: 'error', message: error.message || 'The PDF could not be loaded.' });
    });
    return () => {
      cancelled = true;
      docRef.current = null;
      destroy?.().catch(() => undefined);
    };
  }, [attempt]);

  // ── Zoom ────────────────────────────────────────────────────
  const fitZoom = useCallback(
    (mode: Exclude<Fit, null>) => {
      const scroller = scrollRef.current;
      const size = sizes[Math.max(0, page - 1)] ?? sizes[0];
      if (!size) return 1;
      const widest = Math.max(...sizes.map((s) => s.width));
      const width = Math.max(200, (scroller?.clientWidth || 800) - PADDING * 2);
      const height = Math.max(200, (scroller?.clientHeight || 600) - PADDING * 2);
      const byWidth = width / (widest * CSS_UNITS);
      if (mode === 'width') return clampZoom(byWidth);
      if (mode === 'page') return clampZoom(Math.min(width / (size.width * CSS_UNITS), height / (size.height * CSS_UNITS)));
      // Opening view: the width of the window, but never larger than 125%.
      return clampZoom(Math.min(byWidth, 1.25));
    },
    [sizes, page],
  );

  /** Changes the zoom keeping the same part of the current page in view. */
  const applyZoom = (next: number, mode: Fit) => {
    const scroller = scrollRef.current;
    const element = pageRefs.current[page - 1];
    if (scroller && element && element.offsetHeight > 0) {
      anchor.current = { page, ratio: Math.min(1, Math.max(0, (scroller.scrollTop - element.offsetTop) / element.offsetHeight)) };
    }
    setFit(mode);
    setZoom(clampZoom(next));
  };

  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    const kept = anchor.current;
    anchor.current = null;
    if (!scroller || !kept) return;
    const element = pageRefs.current[kept.page - 1];
    if (element) scroller.scrollTop = element.offsetTop + kept.ratio * element.offsetHeight;
  }, [zoom]);

  // Fitted views follow the window's size.
  useEffect(() => {
    if (status.kind !== 'ready' || fit === null) return;
    const update = () => setZoom(fitZoom(fit));
    update();
    const scroller = scrollRef.current;
    if (!scroller || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [status.kind, fit, fitZoom]);

  const zoomIn = () => applyZoom(ZOOM_STEPS.find((step) => step > zoom + 0.001) ?? MAX_ZOOM, null);
  const zoomOut = () => applyZoom([...ZOOM_STEPS].reverse().find((step) => step < zoom - 0.001) ?? MIN_ZOOM, null);

  // ── Pages ───────────────────────────────────────────────────
  const goTo = useCallback((number: number) => {
    const target = Math.min(Math.max(1, number), pageRefs.current.length || 1);
    const element = pageRefs.current[target - 1];
    if (scrollRef.current && element) scrollRef.current.scrollTop = element.offsetTop - PADDING;
    setPage(target);
    setPageInput(String(target));
  }, []);

  const onScroll = () => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const line = scroller.scrollTop + scroller.clientHeight * 0.35;
    let current = 1;
    pageRefs.current.forEach((element, index) => {
      if (element && element.offsetTop <= line) current = index + 1;
    });
    if (current !== page) {
      setPage(current);
      setPageInput(String(current));
    }
  };

  // Which pages are near the view: only those are drawn.
  useEffect(() => {
    if (status.kind !== 'ready') return;
    const scroller = scrollRef.current;
    if (!scroller || typeof IntersectionObserver === 'undefined') {
      sizes.forEach((_s, index) => visible.current.add(index + 1));
      setVisibleTick((n) => n + 1);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const number = Number((entry.target as HTMLElement).dataset.page);
          if (entry.isIntersecting) visible.current.add(number);
          else visible.current.delete(number);
        }
        setVisibleTick((n) => n + 1);
      },
      { root: scroller, rootMargin: RENDER_MARGIN },
    );
    pageRefs.current.forEach((element) => element && observer.observe(element));
    return () => observer.disconnect();
  }, [status.kind, sizes]);

  // Draws the visible pages at the current zoom and releases the others.
  useEffect(() => {
    const doc = docRef.current;
    if (status.kind !== 'ready' || !doc) return;
    let cancelled = false;
    let task: RenderTask | null = null;
    for (const [number] of rendered.current) {
      if (!visible.current.has(number)) {
        pageRefs.current[number - 1]?.querySelector('[data-canvas-holder]')?.replaceChildren();
        rendered.current.delete(number);
      }
    }
    (async () => {
      for (const number of [...visible.current].sort((a, b) => Math.abs(a - pageRef.current) - Math.abs(b - pageRef.current))) {
        if (cancelled) return;
        if (rendered.current.get(number) === zoom) continue;
        const holder = pageRefs.current[number - 1]?.querySelector('[data-canvas-holder]');
        if (!holder) continue;
        const pdfPage = await doc.getPage(number);
        if (cancelled) return;
        const cssViewport = pdfPage.getViewport({ scale: zoom * CSS_UNITS });
        const wanted = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
        const outputScale = Math.min(wanted, Math.sqrt(MAX_CANVAS_PIXELS / Math.max(1, cssViewport.width * cssViewport.height)));
        const viewport = pdfPage.getViewport({ scale: zoom * CSS_UNITS * outputScale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${cssViewport.width}px`;
        canvas.style.height = `${cssViewport.height}px`;
        canvas.style.display = 'block';
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', `Page ${number} of ${sizes.length}`);
        task = pdfPage.render({ canvas, viewport });
        try {
          await task.promise;
        } catch {
          // Cancelled by a newer zoom or scroll, or one page failed: the others still show.
          if (cancelled) return;
          continue;
        }
        if (cancelled) return;
        holder.replaceChildren(canvas);
        rendered.current.set(number, zoom);
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [status.kind, zoom, visibleTick, sizes.length]);

  // ── Full screen, focus, keys ────────────────────────────────
  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === panelRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      if (document.fullscreenElement && document.fullscreenElement === panelRef.current) document.exitFullscreen?.().catch(() => undefined);
    };
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => undefined);
    else panelRef.current?.requestFullscreen?.().catch(() => undefined);
  };

  useEffect(() => {
    const returnTo = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    scrollRef.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      returnTo?.focus?.();
    };
  }, []);

  const onKeyDown = (event: React.KeyboardEvent) => {
    const typing = (event.target as HTMLElement).tagName === 'INPUT';
    if (event.key === 'Escape') {
      if (!document.fullscreenElement) {
        event.stopPropagation();
        onCloseRef.current();
      }
      return;
    }
    if (event.key === 'Tab') {
      const focusable = [...(panelRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input, [tabindex="0"]') ?? [])];
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
      return;
    }
    if (typing || status.kind !== 'ready') return;
    const withModifier = event.ctrlKey || event.metaKey;
    if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      zoomIn();
    } else if (event.key === '-') {
      event.preventDefault();
      zoomOut();
    } else if (event.key === '0' && !withModifier) {
      event.preventDefault();
      applyZoom(1, null);
    } else if (event.key === 'ArrowRight' && !withModifier) {
      event.preventDefault();
      goTo(page + 1);
    } else if (event.key === 'ArrowLeft' && !withModifier) {
      event.preventDefault();
      goTo(page - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      goTo(1);
    } else if (event.key === 'End') {
      event.preventDefault();
      goTo(sizes.length);
    }
  };

  /** Saves the file only when asked to. */
  const download = () => {
    const bytes = bytesRef.current;
    if (!bytes || !downloadName) return;
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = downloadName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const ready = status.kind === 'ready';
  const total = sizes.length;
  pageRefs.current.length = total;

  return createPortal(
    <div className="fixed inset-0 z-[60] bg-slate-900/70 sm:p-4" role="presentation" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${ids}-title`}
        aria-describedby={description ? `${ids}-description` : undefined}
        onKeyDown={onKeyDown}
        className="flex flex-col w-full h-full sm:rounded-2xl overflow-hidden bg-white dark:bg-[#181724] shadow-2xl"
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 border-b border-slate-200 dark:border-[#2B293E]">
          <div className="min-w-0 flex-1 basis-48">
            <h2 id={`${ids}-title`} className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">{title}</h2>
            {description && <p id={`${ids}-description`} className="text-xs text-slate-500 dark:text-slate-400 truncate">{description}</p>}
          </div>

          <div className="flex flex-wrap items-center gap-1" role="toolbar" aria-label="PDF controls">
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => goTo(page - 1)} disabled={!ready || page <= 1} className={buttonClass} aria-label="Previous page" title="Previous page (←)">
                <ChevronLeft className="w-4 h-4" aria-hidden="true" />
              </button>
              <input
                value={pageInput}
                disabled={!ready}
                onChange={(e) => setPageInput(e.target.value.replace(/\D/g, ''))}
                onKeyDown={(e) => e.key === 'Enter' && goTo(Number(pageInput) || page)}
                onBlur={() => setPageInput(String(page))}
                inputMode="numeric"
                aria-label="Page number"
                className="w-10 h-8 text-center text-xs rounded-lg border border-slate-200 dark:border-[#2B293E] bg-white dark:bg-[#1E1D2D] focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              <span className="text-xs text-slate-600 dark:text-slate-400 tabular-nums" aria-label={`of ${total} pages`}>/ {total || '–'}</span>
              <button type="button" onClick={() => goTo(page + 1)} disabled={!ready || page >= total} className={buttonClass} aria-label="Next page" title="Next page (→)">
                <ChevronRight className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <span className="w-px h-6 bg-slate-200 dark:bg-[#2B293E] mx-1" aria-hidden="true" />

            <div className="flex items-center gap-1">
              <button type="button" onClick={zoomOut} disabled={!ready || zoom <= MIN_ZOOM} className={buttonClass} aria-label="Zoom out" title="Zoom out (-)">
                <ZoomOut className="w-4 h-4" aria-hidden="true" />
              </button>
              <output aria-live="polite" aria-label="Zoom" className="w-12 text-center text-xs font-semibold tabular-nums text-slate-800 dark:text-slate-100">{Math.round(zoom * 100)}%</output>
              <button type="button" onClick={zoomIn} disabled={!ready || zoom >= MAX_ZOOM} className={buttonClass} aria-label="Zoom in" title="Zoom in (+)">
                <ZoomIn className="w-4 h-4" aria-hidden="true" />
              </button>
              <button type="button" onClick={() => applyZoom(fitZoom('width'), 'width')} disabled={!ready} aria-pressed={fit === 'width'} className={cn(buttonClass, fit === 'width' && 'bg-teal-50 text-teal-800 dark:bg-teal-900/30 dark:text-teal-200')}>
                Fit width
              </button>
              <button type="button" onClick={() => applyZoom(fitZoom('page'), 'page')} disabled={!ready} aria-pressed={fit === 'page'} className={cn(buttonClass, fit === 'page' && 'bg-teal-50 text-teal-800 dark:bg-teal-900/30 dark:text-teal-200')}>
                Fit page
              </button>
              <button type="button" onClick={() => applyZoom(1, null)} disabled={!ready} aria-label="Actual size" title="Actual size (0)" className={buttonClass}>
                100%
              </button>
            </div>

            <span className="w-px h-6 bg-slate-200 dark:bg-[#2B293E] mx-1" aria-hidden="true" />

            {canFullscreen && (
              <button type="button" onClick={toggleFullscreen} className={buttonClass} aria-label={fullscreen ? 'Exit full screen' : 'Full screen'} title={fullscreen ? 'Exit full screen' : 'Full screen'}>
                {fullscreen ? <Minimize2 className="w-4 h-4" aria-hidden="true" /> : <Maximize2 className="w-4 h-4" aria-hidden="true" />}
              </button>
            )}
            {downloadName && (
              <button type="button" onClick={download} disabled={!ready} className={buttonClass}>
                <Download className="w-4 h-4" aria-hidden="true" />
                Download
              </button>
            )}
            <button type="button" onClick={onClose} className={buttonClass} aria-label="Close" title="Close (Esc)">
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {controls && <div className="px-4 py-2 border-b border-slate-200 dark:border-[#2B293E]">{controls}</div>}
        {notice && <p className="px-4 py-2 text-xs font-semibold border-b border-amber-200 bg-amber-50 text-amber-900">{notice}</p>}

        <div ref={scrollRef} tabIndex={0} onScroll={onScroll} aria-label="Document pages" className="relative flex-1 overflow-auto bg-slate-200 dark:bg-[#0F0E17] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-500">
          {status.kind === 'loading' && (
            <p role="status" className="absolute inset-0 flex items-center justify-center text-sm text-slate-600 dark:text-slate-300">Loading the PDF…</p>
          )}
          {status.kind === 'error' && (
            <div role="alert" className="max-w-md mx-auto mt-16 p-4 rounded-xl border border-red-200 bg-white text-sm text-red-800 text-center">
              <p className="font-semibold">The PDF could not be shown.</p>
              <p className="mt-1">{status.message}</p>
              <button type="button" onClick={() => setAttempt((n) => n + 1)} className="mt-3 px-3 py-1.5 text-xs font-semibold rounded-lg bg-teal-500 hover:bg-teal-600 text-white">
                Try again
              </button>
            </div>
          )}
          {ready && total === 0 && <p className="mt-16 text-center text-sm text-slate-600">This PDF has no pages.</p>}
          {ready && total > 0 && (
            <div className="w-max min-w-full flex flex-col items-center gap-4" style={{ padding: PADDING }}>
              {sizes.map((size, index) => (
                <div
                  key={index}
                  ref={(element) => {
                    pageRefs.current[index] = element;
                  }}
                  data-page={index + 1}
                  className="relative bg-white shadow-md"
                  style={{ width: size.width * zoom * CSS_UNITS, height: size.height * zoom * CSS_UNITS }}
                >
                  <div data-canvas-holder className="absolute inset-0" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};
