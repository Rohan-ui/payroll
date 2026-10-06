import React, { useEffect, useId, useRef, useState } from 'react';
import type { LetterheadBox, LetterheadImageSlot } from '../../api/onboarding.api';
import {
  BOX_OF, PT, autoBox, bodyHeightMm, clampHeight, detailsArea, footerArea, footerLimits, growBox, headerArea, headerLimits, moveBox, placeBox, pxPerMm, resizeBox,
  type Area, type Corner, type LetterheadLayout, type Page,
} from './letterhead-geometry';

export interface CanvasImage { url: string; width: number; height: number }
export interface LetterheadDetails {
  companyName: string;
  addressText: string;
  phone: string;
  email: string;
  website: string;
  registrationText: string;
  footerText: string;
}

export const IMAGE_LABEL: Record<LetterheadImageSlot, string> = { logo: 'Logo', header: 'Header artwork', footer: 'Footer artwork' };
const CORNERS: Corner[] = ['nw', 'ne', 'sw', 'se'];
const CORNER_CURSOR: Record<Corner, string> = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize' };
/** Pointer travel (px) before a press on an image becomes a move, so a click only selects. */
const DRAG_THRESHOLD_PX = 3;
const FONT = 'Helvetica, Arial, sans-serif';

/** An image's box as the PDF draws it: its saved box, or where the automatic layout puts it. */
export function effectiveBox(slot: LetterheadImageSlot, layout: LetterheadLayout, image: CanvasImage, area: Area): { box: LetterheadBox; automatic: boolean } {
  const saved = layout[BOX_OF[slot]];
  return saved ? { box: placeBox(saved, area), automatic: false } : { box: autoBox(slot, image, area, layout.logoPosition), automatic: true };
}

/**
 * The letterhead on a page, drawn to scale from millimetres: the header and
 * footer can be resized by dragging their boundaries, and the images moved and
 * resized. Every change is reported in millimetres through onChange, with a
 * gesture key so one drag is one undo step.
 */
export const LetterheadCanvas: React.FC<{
  page: Page;
  marginMm: number;
  zoom: number;
  layout: LetterheadLayout;
  details: LetterheadDetails;
  images: Partial<Record<LetterheadImageSlot, CanvasImage>>;
  editable: boolean;
  selected: LetterheadImageSlot | null;
  onSelect: (slot: LetterheadImageSlot | null) => void;
  onChange: (patch: Partial<LetterheadLayout>, gesture: string) => void;
  /** Only what prints (behind a document being written): no guides, handles or sample text. */
  printOnly?: boolean;
}> = ({ page, marginMm, zoom, layout, details, images, editable, selected, onSelect, onChange, printOnly = false }) => {
  const ids = useId();
  const [live, setLive] = useState<{ at: 'header' | 'footer' | LetterheadImageSlot; label: string } | null>(null);
  const stop = useRef<(() => void) | null>(null);
  const gestures = useRef(0);
  useEffect(() => () => stop.current?.(), []);

  const ppm = pxPerMm(zoom);
  const px = (mm: number) => mm * ppm;
  const header = headerArea(page, marginMm, layout.headerHeightMm);
  const footer = footerArea(page, marginMm, layout.footerHeightMm);
  const footerTop = page.height - marginMm - layout.footerHeightMm;
  const hLimits = headerLimits(page, marginMm, layout.footerHeightMm);
  const fLimits = footerLimits(page, marginMm, layout.headerHeightMm);
  const body = bodyHeightMm(page, marginMm, layout.headerHeightMm, layout.footerHeightMm);
  const gesture = () => `gesture:${(gestures.current += 1)}`;
  const mm = (n: number) => (Math.round(n * 10) / 10).toString();

  /** Follows the pointer from a press until it is released, reporting the travel in millimetres. */
  const follow = (e: React.PointerEvent, onMove: (dx: number, dy: number) => void) => {
    if (!editable || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const x0 = e.clientX;
    const y0 = e.clientY;
    let moved = false;
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < DRAG_THRESHOLD_PX) return;
      moved = true;
      onMove((ev.clientX - x0) / ppm, (ev.clientY - y0) / ppm);
    };
    const end = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      stop.current = null;
      setLive(null);
    };
    stop.current?.();
    stop.current = end;
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };

  const boundary = (which: 'header' | 'footer') => {
    const isHeader = which === 'header';
    const value = isHeader ? layout.headerHeightMm : layout.footerHeightMm;
    const limits = isHeader ? hLimits : fLimits;
    const key = isHeader ? 'headerHeightMm' : 'footerHeightMm';
    const name = isHeader ? 'Header' : 'Footer';
    const set = (next: number, g: string) => {
      const height = clampHeight(next, limits);
      setLive({ at: which, label: `${name} ${height} mm` });
      onChange({ [key]: height }, g);
    };
    const keyStep: Record<string, number> = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 5, PageDown: -5 };
    const top = isHeader ? marginMm + value : footerTop;
    return (
      <div
        role="slider"
        tabIndex={editable ? 0 : -1}
        aria-label={`${name} height`}
        aria-orientation="vertical"
        aria-valuemin={limits.min}
        aria-valuemax={limits.max}
        aria-valuenow={value}
        aria-valuetext={`${value} mm`}
        aria-disabled={!editable}
        aria-describedby={`${ids}-help`}
        data-boundary={which}
        className={`absolute z-20 group focus-visible:outline-none ${editable ? 'cursor-ns-resize' : ''}`}
        style={{ left: px(marginMm), width: px(header.width), top: px(top) - 6, height: 12 }}
        onPointerDown={(e) => {
          const start = value;
          const g = gesture();
          setLive({ at: which, label: `${name} ${start} mm` });
          // Dragging down makes the header taller and the footer shorter.
          follow(e, (_dx, dy) => set(isHeader ? start + dy : start - dy, g));
        }}
        onKeyDown={(e) => {
          if (!editable) return;
          const step = keyStep[e.key];
          const next = step !== undefined ? value + step : e.key === 'Home' ? limits.min : e.key === 'End' ? limits.max : null;
          if (next === null) return;
          e.preventDefault();
          set(next, `keys:${which}`);
        }}
        onBlur={() => setLive((l) => (l?.at === which ? null : l))}
      >
        <span aria-hidden="true" className={`absolute inset-x-0 top-1/2 -translate-y-1/2 border-t-2 border-dashed ${editable ? 'border-teal-500 group-hover:border-teal-700 group-focus-visible:border-solid group-focus-visible:border-teal-700' : 'border-slate-300'}`} />
        {editable && (
          <span aria-hidden="true" className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-2.5 rounded-full bg-teal-600 group-focus-visible:ring-2 group-focus-visible:ring-teal-300" />
        )}
        {live?.at === which && (
          <span aria-hidden="true" data-live className="absolute right-0 -top-7 px-2 py-0.5 rounded bg-slate-900 text-white text-xs font-semibold tabular-nums whitespace-nowrap">
            {live.label}
          </span>
        )}
      </div>
    );
  };

  const imageBox = (slot: LetterheadImageSlot) => {
    const image = images[slot];
    if (!image) return null;
    const area = slot === 'footer' ? footer : header;
    const areaTop = slot === 'footer' ? footerTop : marginMm;
    const { box, automatic } = effectiveBox(slot, layout, image, area);
    if (printOnly) {
      return (
        <div key={slot} aria-hidden="true" className="absolute" style={{ left: px(marginMm + box.x), top: px(areaTop + box.y), width: px(box.width), height: px(box.height) }}>
          <img src={image.url} alt="" draggable={false} className="block w-full h-full" style={{ objectFit: box.stretch ? 'fill' : 'contain' }} />
        </div>
      );
    }
    const key = BOX_OF[slot];
    const isSelected = selected === slot;
    const name = IMAGE_LABEL[slot];
    const where = slot === 'footer' ? 'footer' : 'header';
    const report = (next: LetterheadBox, g: string, label: string) => {
      setLive({ at: slot, label });
      onChange({ [key]: next }, g);
    };
    return (
      <div key={slot} className="absolute z-10" style={{ left: px(marginMm + box.x), top: px(areaTop + box.y), width: px(box.width), height: px(box.height) }}>
        <button
          type="button"
          data-image={slot}
          aria-pressed={isSelected}
          aria-label={`${name}, ${mm(box.width)} by ${mm(box.height)} mm, ${mm(box.x)} mm from the left and ${mm(box.y)} mm from the top of the ${where}${automatic ? ', placed automatically' : ''}`}
          aria-describedby={editable ? `${ids}-help` : undefined}
          className={`block w-full h-full p-0 bg-transparent focus-visible:outline-none ${editable ? 'cursor-move' : 'cursor-default'} ${isSelected ? 'outline outline-2 outline-teal-600' : 'hover:outline hover:outline-1 hover:outline-teal-400'} focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-700`}
          onClick={() => onSelect(slot)}
          onPointerDown={(e) => {
            onSelect(slot);
            const g = gesture();
            follow(e, (dx, dy) => {
              const next = moveBox(box, dx, dy, area);
              report(next, g, `${mm(next.x)}, ${mm(next.y)} mm`);
            });
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') return onSelect(null);
            const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
            const step = arrows[e.key];
            if (!editable || !step) return;
            e.preventDefault();
            onSelect(slot);
            // Shift resizes (in proportion unless the image stretches); otherwise the image moves.
            const next = e.shiftKey ? growBox(box, step[0], step[1], area) : moveBox(box, step[0], step[1], area);
            report(next, `keys:${slot}:${e.shiftKey ? 'size' : 'move'}`, e.shiftKey ? `${mm(next.width)} × ${mm(next.height)} mm` : `${mm(next.x)}, ${mm(next.y)} mm`);
          }}
          onBlur={() => setLive((l) => (l?.at === slot ? null : l))}
        >
          <img src={image.url} alt="" draggable={false} className="block w-full h-full pointer-events-none select-none" style={{ objectFit: box.stretch ? 'fill' : 'contain' }} />
        </button>
        {isSelected && editable &&
          CORNERS.map((corner) => (
            <span
              key={corner}
              aria-hidden="true"
              data-corner={corner}
              className="absolute w-3 h-3 -m-1.5 rounded-sm bg-white border-2 border-teal-600 touch-none"
              style={{ cursor: CORNER_CURSOR[corner], left: corner.endsWith('w') ? 0 : '100%', top: corner.startsWith('n') ? 0 : '100%' }}
              onPointerDown={(e) => {
                const g = gesture();
                follow(e, (dx, dy) => {
                  const next = resizeBox(box, corner, dx, dy, area);
                  report(next, g, `${mm(next.width)} × ${mm(next.height)} mm`);
                });
              }}
            />
          ))}
        {live?.at === slot && (
          <span aria-hidden="true" data-live className="absolute left-0 -top-7 px-2 py-0.5 rounded bg-slate-900 text-white text-xs font-semibold tabular-nums whitespace-nowrap">
            {live.label}
          </span>
        )}
      </div>
    );
  };

  // What the header prints: the artwork, or the logo with the company details.
  const logo = !images.header && images.logo ? effectiveBox('logo', layout, images.logo, header) : null;
  const text = detailsArea(header, layout.logoPosition, logo);
  const contact = [details.phone, details.email, details.website].map((v) => v.trim()).filter(Boolean).join('  |  ');
  const footerText = [details.registrationText, details.footerText].map((v) => v.trim()).filter(Boolean).join('\n');
  const line = (size: number, bold = false): React.CSSProperties => ({ fontFamily: FONT, fontSize: px(size * PT), lineHeight: 1.15, fontWeight: bold ? 700 : 400, color: bold ? '#111111' : '#555555', marginBottom: px(2 * PT) });

  return (
    <div
      role={printOnly ? undefined : 'group'}
      aria-label={printOnly ? undefined : 'Letterhead page'}
      aria-hidden={printOnly || undefined}
      className={`relative mx-auto bg-white select-none ${printOnly ? '' : 'shadow-sm ring-1 ring-slate-300'}`}
      style={{ width: px(page.width), height: px(page.height) }}
      onPointerDown={(e) => { if (e.target === e.currentTarget) onSelect(null); }}
    >
      {!printOnly && (
        <>
          <p id={`${ids}-help`} className="sr-only">
            Drag the dashed lines, or use the arrow keys on them, to change the header and footer heights. Select an image to move it by dragging or with the arrow keys, and resize it from its corners or with Shift and the arrow keys.
          </p>
          {/* Margins */}
          <div aria-hidden="true" className="absolute border border-dashed border-slate-300 pointer-events-none" style={{ left: px(marginMm), top: px(marginMm), width: px(page.width - 2 * marginMm), height: px(page.height - 2 * marginMm) }} />
          {/* Header and footer areas */}
          <div aria-hidden="true" className="absolute bg-teal-500/5 pointer-events-none" style={{ left: px(marginMm), top: px(marginMm), width: px(header.width), height: px(layout.headerHeightMm) }} />
          <div aria-hidden="true" className="absolute bg-teal-500/5 pointer-events-none" style={{ left: px(marginMm), top: px(footerTop), width: px(footer.width), height: px(layout.footerHeightMm) }} />
        </>
      )}
      <div aria-hidden="true" className="absolute border-t border-[#CCCCCC] pointer-events-none" style={{ left: px(marginMm), top: px(marginMm + layout.headerHeightMm + 5 * PT), width: px(header.width) }} />

      {!images.header && (
        <div
          aria-hidden="true"
          data-details
          className="absolute flex flex-col justify-center overflow-hidden pointer-events-none"
          style={{ left: px(marginMm + text.x), top: px(marginMm + text.y), width: px(text.width), height: px(text.height), textAlign: text.align }}
        >
          <span className="block break-words" style={line(13, true)}>{details.companyName.trim() || 'Company name'}</span>
          {details.addressText.trim() && <span className="block break-words whitespace-pre-line" style={line(8)}>{details.addressText.trim()}</span>}
          {contact && <span className="block break-words" style={line(8)}>{contact}</span>}
        </div>
      )}
      {!images.footer && footerText && (
        <div
          aria-hidden="true"
          className="absolute overflow-hidden text-center whitespace-pre-line pointer-events-none"
          style={{ left: px(marginMm), top: px(footerTop + 4 * PT), width: px(footer.width), height: px(Math.max(0, layout.footerHeightMm - 4 * PT)), fontFamily: FONT, fontSize: px(7.5 * PT), lineHeight: 1.15, color: '#555555' }}
        >
          {footerText}
        </div>
      )}

      {/* The letter's text, between the header and the footer */}
      {!printOnly && <div
        aria-hidden="true"
        className="absolute flex flex-col gap-2 overflow-hidden pointer-events-none"
        style={{ left: px(marginMm), top: px(marginMm + layout.headerHeightMm + 12 * PT), width: px(header.width), height: px(Math.max(0, body)) }}
      >
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Letter text · {Math.floor(body)} mm</span>
        {Array.from({ length: 6 }, (_, i) => <span key={i} className="block h-1.5 rounded bg-slate-200" style={{ width: `${[92, 100, 96, 88, 100, 60][i]}%` }} />)}
      </div>}

      {images.header ? imageBox('header') : imageBox('logo')}
      {imageBox('footer')}
      {!printOnly && boundary('header')}
      {!printOnly && boundary('footer')}
    </div>
  );
};
