import React, { useEffect, useId, useRef, useState } from 'react';
import { Lock } from 'lucide-react';
import type { LetterheadBox, LetterheadElement, LetterheadImageSlot, PageMargins } from '../../api/documents.api';
import {
  BOX_OF, PT, autoBox, clampHeight, detailsArea, footerLimits, growBox, headerLimits, letterheadAreas, moveBox, pageFrame, pageGuides, placeBox, pxPerMm, resizeBox,
  rotationTowards, snapToGuides, type Area, type Corner, type LetterheadLayout, type Page, type Rect,
} from './letterhead-geometry';
import { ELEMENT_LINE_HEIGHT, elementName, fontCss } from './letterhead-design';

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
const SLOTS: LetterheadImageSlot[] = ['logo', 'header', 'footer'];
const CORNERS: Corner[] = ['nw', 'ne', 'sw', 'se'];
const CORNER_CURSOR: Record<Corner, string> = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize' };
/** Pointer travel (px) before a press on an image becomes a move, so a click only selects. */
const DRAG_THRESHOLD_PX = 3;
/** How close (screen px) an edge or centre comes to a guide before it snaps: small, so placing freely stays easy. */
const SNAP_PX = 6;
/** Distance (px) of the rotation handle above a box. */
const ROTATE_HANDLE_PX = 22;
const FONT = 'Helvetica, Arial, sans-serif';

/** An image's box as the PDF draws it: its saved box, or where the automatic layout puts it. */
export function effectiveBox(slot: LetterheadImageSlot, layout: LetterheadLayout, image: CanvasImage, area: Area): { box: LetterheadBox; automatic: boolean } {
  const saved = layout[BOX_OF[slot]];
  return saved ? { box: placeBox(saved, area), automatic: false } : { box: autoBox(slot, image, area, layout.logoPosition), automatic: true };
}

/** The images the PDF prints: uploaded, not hidden, and no logo when there is header artwork. */
export function printedImages(images: Partial<Record<LetterheadImageSlot, CanvasImage>>, layout: Pick<LetterheadLayout, 'hiddenImages'>) {
  const shown = Object.fromEntries(SLOTS.filter((slot) => images[slot] && !layout.hiddenImages.includes(slot)).map((slot) => [slot, images[slot]])) as Partial<Record<LetterheadImageSlot, CanvasImage>>;
  if (shown.header) delete shown.logo;
  return shown;
}

/** An element's box on the page, kept on it as the PDF keeps it; text resizes freely, an image in proportion. */
export const elementBox = (element: LetterheadElement, page: Page): LetterheadBox =>
  ({ ...placeBox({ ...element, stretch: element.kind === 'TEXT' }, page), rotation: element.rotation });

/** What an element shows, filling its box: an image in proportion, or its lines of text centred in its height. */
export const ElementVisual: React.FC<{ element: LetterheadElement; image: CanvasImage | undefined; ppm: number }> = ({ element, image, ppm }) => {
  if (element.kind === 'IMAGE') {
    return image
      ? <img src={image.url} alt="" draggable={false} className="block w-full h-full pointer-events-none select-none" style={{ objectFit: 'contain' }} />
      : <span className="flex w-full h-full items-center justify-center border border-dashed border-slate-300 text-[10px] text-slate-400">Image</span>;
  }
  const align = element.align === 'left' ? 'flex-start' : element.align === 'right' ? 'flex-end' : 'center';
  return (
    <span
      className="flex flex-col justify-center w-full h-full pointer-events-none"
      style={{
        alignItems: align,
        fontFamily: fontCss(element.fontFamily),
        fontSize: (element.fontSizePt ?? 12) * PT * ppm,
        lineHeight: ELEMENT_LINE_HEIGHT,
        color: element.color ?? '#000000',
        fontWeight: element.bold ? 700 : 400,
        fontStyle: element.italic ? 'italic' : 'normal',
      }}
    >
      {(element.text ?? '').split('\n').map((line, i) => <span key={i} className="block whitespace-pre">{line || ' '}</span>)}
    </span>
  );
};

/**
 * Page elements as they print, without any editing: those behind the letter
 * text, or those in front of it. For the page a letter is written on.
 */
export const PageElements: React.FC<{ elements: LetterheadElement[]; images: Record<string, CanvasImage>; page: Page; zoom: number; layer: 'behind' | 'front' }> = ({ elements, images, page, zoom, layer }) => {
  const ppm = pxPerMm(zoom);
  const shown = elements.filter((e) => !e.hidden && e.aboveText === (layer === 'front'));
  if (!shown.length) return null;
  return (
    <div aria-hidden="true" className="absolute left-0 top-0 overflow-hidden pointer-events-none" style={{ width: page.width * ppm, height: page.height * ppm }}>
      {shown.map((element) => {
        const box = elementBox(element, page);
        return (
          <div key={element.id} className="absolute" style={{ left: box.x * ppm, top: box.y * ppm, width: box.width * ppm, height: box.height * ppm, transform: `rotate(${box.rotation ?? 0}deg)`, opacity: element.opacity }}>
            <ElementVisual element={element} image={element.imageId ? images[element.imageId] : undefined} ppm={ppm} />
          </div>
        );
      })}
    </div>
  );
};

/** Something on the page that can be selected, moved, resized and turned. */
interface CanvasObject {
  key: string;
  name: string;
  /** Where its position is measured from, in words. */
  where: string;
  /** The area it is placed in, on the page (mm). */
  area: Rect;
  /** Its box in that area, as drawn. */
  box: LetterheadBox;
  automatic: boolean;
  locked: boolean;
  opacity: number;
  visual: React.ReactNode;
  commit: (box: LetterheadBox, gesture: string) => void;
}

/**
 * The letterhead on a page, drawn to scale from millimetres: the header and
 * footer can be resized by dragging their boundaries; the logo, artwork and
 * page elements moved, resized (in proportion unless Shift is held, or the
 * image stretches) and turned, snapping to the page's guides when `snap` is
 * on. Every change is reported in millimetres through onChange, with a
 * gesture key so one drag is one undo step. Zoom changes only the drawing.
 */
export const LetterheadCanvas: React.FC<{
  page: Page;
  margins: PageMargins;
  zoom: number;
  layout: LetterheadLayout;
  details: LetterheadDetails;
  images: Partial<Record<LetterheadImageSlot, CanvasImage>>;
  /** Images of the page elements, by image id. */
  elementImages?: Record<string, CanvasImage>;
  editable: boolean;
  /** The selected object: an image slot or an element's id. */
  selected: string | null;
  onSelect: (key: string | null) => void;
  onChange: (patch: Partial<LetterheadLayout>, gesture: string) => void;
  /** Delete pressed on a selected object. */
  onDelete?: (key: string) => void;
  snap?: boolean;
  /** Only what prints of the header and footer (behind a document being written): no elements, guides, handles or sample text. */
  printOnly?: boolean;
}> = ({ page, margins, zoom, layout, details, images: uploaded, elementImages = {}, editable, selected, onSelect, onChange, onDelete, snap = false, printOnly = false }) => {
  const ids = useId();
  const [live, setLive] = useState<{ at: string; label: string } | null>(null);
  const [guideLines, setGuideLines] = useState<{ x: number | null; y: number | null } | null>(null);
  const stop = useRef<(() => void) | null>(null);
  const gestures = useRef(0);
  const boxes = useRef(new Map<string, HTMLDivElement>());
  useEffect(() => () => stop.current?.(), []);

  const images = printedImages(uploaded, layout);
  const ppm = pxPerMm(zoom);
  const px = (mm: number) => mm * ppm;
  const areas = letterheadAreas(page, margins, layout);
  const { header, footer } = areas;
  const { body } = pageFrame(page, margins, layout);
  const pageArea: Rect = { left: 0, top: 0, width: page.width, height: page.height };
  const hLimits = headerLimits(page, margins, layout);
  const fLimits = footerLimits(page, margins, layout);
  const guides = pageGuides(page, margins, areas);
  const gesture = () => `gesture:${(gestures.current += 1)}`;
  const mm = (n: number) => (Math.round(n * 10) / 10).toString();

  /** Follows the pointer from a press until it is released, reporting the travel in millimetres and the event. */
  const follow = (e: React.PointerEvent, onMove: (dx: number, dy: number, ev: PointerEvent) => void) => {
    if (!editable || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const x0 = e.clientX;
    const y0 = e.clientY;
    let moved = false;
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - x0, ev.clientY - y0) < DRAG_THRESHOLD_PX) return;
      moved = true;
      onMove((ev.clientX - x0) / ppm, (ev.clientY - y0) / ppm, ev);
    };
    const end = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      stop.current = null;
      setLive(null);
      setGuideLines(null);
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
    const area = isHeader ? header : footer;
    const set = (next: number, g: string) => {
      const height = clampHeight(next, limits);
      setLive({ at: which, label: `${name}: ${height} mm` });
      onChange({ [key]: height }, g);
    };
    // As for any slider: up and right make the value larger.
    const keyStep: Record<string, number> = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 5, PageDown: -5 };
    const top = isHeader ? header.top + header.height : footer.top;
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
        title={editable ? `Drag to change the ${which} height (${value} mm)` : undefined}
        className={`absolute z-20 group focus-visible:outline-none ${editable ? 'cursor-ns-resize' : ''}`}
        style={{ left: px(area.left), width: px(area.width), top: px(top) - 6, height: 12 }}
        onPointerDown={(e) => {
          const start = value;
          const g = gesture();
          setLive({ at: which, label: `${name}: ${start} mm` });
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
          <span aria-hidden="true" className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-2.5 rounded-full bg-teal-600 group-hover:bg-teal-700 group-focus-visible:ring-2 group-focus-visible:ring-teal-300" />
        )}
        {live?.at === which && (
          <span aria-hidden="true" data-live className={`absolute right-0 ${isHeader ? 'top-4' : '-top-7'} px-2 py-0.5 rounded bg-slate-900 text-white text-xs font-semibold tabular-nums whitespace-nowrap`}>
            {live.label}
          </span>
        )}
      </div>
    );
  };

  /** A box moved by (dx, dy) mm from where a drag started, snapped to a guide when near one. */
  const moved = (o: CanvasObject, start: LetterheadBox, dx: number, dy: number) => {
    let next = moveBox(start, dx, dy, o.area);
    if (!snap) return next;
    const hit = snapToGuides({ left: o.area.left + next.x, top: o.area.top + next.y, width: next.width, height: next.height, rotation: next.rotation }, guides, SNAP_PX / ppm);
    if (hit.dx || hit.dy) {
      const x = Math.round(Math.min(Math.max(0, next.x + hit.dx), o.area.width - next.width) * 10) / 10;
      const y = Math.round(Math.min(Math.max(0, next.y + hit.dy), o.area.height - next.height) * 10) / 10;
      next = { ...next, x, y };
    }
    setGuideLines(hit.lines.x === null && hit.lines.y === null ? null : hit.lines);
    return next;
  };

  const objectBox = (o: CanvasObject) => {
    const { box, area } = o;
    const isSelected = selected === o.key;
    const canMove = editable && !o.locked;
    const turn = box.rotation ?? 0;
    const report = (next: LetterheadBox, g: string, label: string) => {
      setLive({ at: o.key, label });
      o.commit(next, g);
    };
    const center = () => {
      const r = boxes.current.get(o.key)?.getBoundingClientRect();
      return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: 0, y: 0 };
    };
    return (
      <div
        key={o.key}
        ref={(el) => { if (el) boxes.current.set(o.key, el); else boxes.current.delete(o.key); }}
        className={`absolute ${isSelected ? 'z-30' : 'z-10'}`}
        style={{ left: px(area.left + box.x), top: px(area.top + box.y), width: px(box.width), height: px(box.height), transform: turn ? `rotate(${turn}deg)` : undefined }}
      >
        <button
          type="button"
          data-object={o.key}
          data-image={o.key}
          aria-pressed={isSelected}
          aria-label={`${o.name}, ${mm(box.width)} by ${mm(box.height)} mm, ${mm(box.x)} mm from the left and ${mm(box.y)} mm from the top of the ${o.where}${turn ? `, turned ${mm(turn)}°` : ''}${o.automatic ? ', placed automatically' : ''}${o.locked ? ', locked' : ''}`}
          aria-describedby={editable ? `${ids}-help` : undefined}
          className={`block w-full h-full p-0 bg-transparent focus-visible:outline-none ${canMove ? 'cursor-move' : 'cursor-default'} ${isSelected ? 'outline outline-2 outline-teal-600' : 'hover:outline hover:outline-1 hover:outline-teal-400'} focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-700`}
          onClick={() => onSelect(o.key)}
          onPointerDown={(e) => {
            onSelect(o.key);
            if (!canMove) return;
            const g = gesture();
            follow(e, (dx, dy) => {
              const next = moved(o, box, dx, dy);
              report(next, g, `${mm(next.x)}, ${mm(next.y)} mm`);
            });
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') return onSelect(null);
            if (!editable) return;
            if (e.key === 'Delete' && onDelete) {
              e.preventDefault();
              return onDelete(o.key);
            }
            if (o.locked) return;
            if (e.code === 'BracketLeft' || e.code === 'BracketRight') {
              // [ and ] turn by 1°, or 15° with Shift.
              e.preventDefault();
              onSelect(o.key);
              const step = (e.shiftKey ? 15 : 1) * (e.code === 'BracketLeft' ? -1 : 1);
              const rotation = Math.round((((turn + step + 540) % 360) - 180) * 10) / 10;
              return report({ ...box, rotation }, `keys:${o.key}:turn`, `${mm(rotation)}°`);
            }
            const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
            const step = arrows[e.key];
            if (!step) return;
            e.preventDefault();
            onSelect(o.key);
            // Shift resizes (in proportion unless the box stretches); otherwise the box moves.
            const next = e.shiftKey ? growBox(box, step[0], step[1], area) : moveBox(box, step[0], step[1], area);
            report(next, `keys:${o.key}:${e.shiftKey ? 'size' : 'move'}`, e.shiftKey ? `${mm(next.width)} × ${mm(next.height)} mm` : `${mm(next.x)}, ${mm(next.y)} mm`);
          }}
          onBlur={() => setLive((l) => (l?.at === o.key ? null : l))}
        >
          <span className="block w-full h-full" style={{ opacity: o.opacity }}>{o.visual}</span>
        </button>
        {isSelected && o.locked && (
          <span aria-hidden="true" className="absolute -top-2.5 -right-2.5 p-0.5 rounded-full bg-slate-900 text-white"><Lock className="w-3 h-3" /></span>
        )}
        {isSelected && canMove && (
          <>
            {CORNERS.map((corner) => (
              <span
                key={corner}
                aria-hidden="true"
                data-corner={corner}
                className="absolute w-3 h-3 -m-1.5 rounded-sm bg-white border-2 border-teal-600 touch-none"
                style={{ cursor: CORNER_CURSOR[corner], left: corner.endsWith('w') ? 0 : '100%', top: corner.startsWith('n') ? 0 : '100%' }}
                onPointerDown={(e) => {
                  const g = gesture();
                  follow(e, (dx, dy, ev) => {
                    const next = resizeBox(box, corner, dx, dy, area, ev.shiftKey);
                    report(next, g, `${mm(next.width)} × ${mm(next.height)} mm`);
                  });
                }}
              />
            ))}
            <span aria-hidden="true" className="absolute left-1/2 w-px bg-teal-600 pointer-events-none" style={{ top: -ROTATE_HANDLE_PX, height: ROTATE_HANDLE_PX }} />
            <span
              aria-hidden="true"
              data-rotate
              title="Drag to turn; hold Shift for 15° steps"
              className="absolute left-1/2 w-3.5 h-3.5 -ml-[7px] rounded-full bg-white border-2 border-teal-600 touch-none cursor-grab"
              style={{ top: -ROTATE_HANDLE_PX - 7 }}
              onPointerDown={(e) => {
                const g = gesture();
                const middle = center();
                follow(e, (_dx, _dy, ev) => {
                  const rotation = rotationTowards(middle, { x: ev.clientX, y: ev.clientY }, ev.shiftKey ? 15 : 1);
                  report({ ...box, rotation }, g, `${mm(rotation)}°`);
                });
              }}
            />
          </>
        )}
        {live?.at === o.key && (
          <span aria-hidden="true" data-live className="absolute left-0 -top-7 px-2 py-0.5 rounded bg-slate-900 text-white text-xs font-semibold tabular-nums whitespace-nowrap" style={{ transform: turn ? `rotate(${-turn}deg)` : undefined }}>
            {live.label}
          </span>
        )}
      </div>
    );
  };

  const slotObject = (slot: LetterheadImageSlot): CanvasObject | null => {
    const image = images[slot];
    if (!image) return null;
    const area = slot === 'footer' ? footer : header;
    const { box, automatic } = effectiveBox(slot, layout, image, area);
    return {
      key: slot,
      name: IMAGE_LABEL[slot],
      where: slot === 'footer' ? 'footer' : 'header',
      area,
      box,
      automatic,
      locked: layout.lockedImages.includes(slot),
      opacity: 1,
      visual: <img src={image.url} alt="" draggable={false} className="block w-full h-full pointer-events-none select-none" style={{ objectFit: box.stretch ? 'fill' : 'contain' }} />,
      commit: (next, g) => onChange({ [BOX_OF[slot]]: next }, g),
    };
  };

  const elementObject = (element: LetterheadElement): CanvasObject => ({
    key: element.id,
    name: elementName(element),
    where: 'page',
    area: pageArea,
    box: elementBox(element, page),
    automatic: false,
    locked: element.locked,
    opacity: element.opacity,
    visual: <ElementVisual element={element} image={element.imageId ? elementImages[element.imageId] : undefined} ppm={ppm} />,
    commit: (next, g) => onChange({ elements: layout.elements.map((e) => (e.id === element.id ? { ...e, x: next.x, y: next.y, width: next.width, height: next.height, rotation: next.rotation ?? 0 } : e)) }, g),
  });

  const printOnlyImage = (slot: LetterheadImageSlot) => {
    const o = slotObject(slot);
    if (!o) return null;
    return (
      <div key={slot} aria-hidden="true" className="absolute" style={{ left: px(o.area.left + o.box.x), top: px(o.area.top + o.box.y), width: px(o.box.width), height: px(o.box.height), transform: o.box.rotation ? `rotate(${o.box.rotation}deg)` : undefined }}>
        {o.visual}
      </div>
    );
  };

  // What the header prints: the artwork, or the logo with the company details.
  const logo = images.logo ? effectiveBox('logo', layout, images.logo, header) : null;
  const text = detailsArea(header, layout.logoPosition, logo);
  const contact = [details.phone, details.email, details.website].map((v) => v.trim()).filter(Boolean).join('  |  ');
  const footerText = [details.registrationText, details.footerText].map((v) => v.trim()).filter(Boolean).join('\n');
  const line = (size: number, bold = false): React.CSSProperties => ({ fontFamily: FONT, fontSize: px(size * PT), lineHeight: 1.15, fontWeight: bold ? 700 : 400, color: bold ? '#111111' : '#555555', marginBottom: px(2 * PT) });
  const visibleElements = printOnly ? [] : layout.elements.filter((e) => !e.hidden);
  const areaLabel = 'absolute px-1 text-[10px] font-semibold uppercase tracking-wide text-teal-700/70 pointer-events-none';

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
            Drag the dashed lines, or use the arrow keys on them, to change the header and footer heights. Select an image or watermark to move it by dragging or with the arrow keys, resize it from its corners or with Shift and the arrow keys, and turn it with the round handle or the bracket keys. Delete removes the selected object.
          </p>
          {/* Margins */}
          <div aria-hidden="true" className="absolute border border-dashed border-slate-300 pointer-events-none" style={{ left: px(margins.left), top: px(margins.top), width: px(page.width - margins.left - margins.right), height: px(page.height - margins.top - margins.bottom) }} />
          {/* Header and footer areas */}
          <div aria-hidden="true" className="absolute bg-teal-500/5 pointer-events-none" style={{ left: px(header.left), top: px(header.top), width: px(header.width), height: px(header.height) }} />
          <div aria-hidden="true" className="absolute bg-teal-500/5 pointer-events-none" style={{ left: px(footer.left), top: px(footer.top), width: px(footer.width), height: px(footer.height) }} />
          <span aria-hidden="true" className={areaLabel} style={{ left: px(header.left), top: px(header.top) }}>Header · {layout.headerHeightMm} mm</span>
          <span aria-hidden="true" className={areaLabel} style={{ left: px(footer.left), top: px(footer.top + footer.height) - 14 }}>Footer · {layout.footerHeightMm} mm</span>
        </>
      )}

      {/* Elements behind the letter text */}
      {visibleElements.filter((e) => !e.aboveText).map((e) => objectBox(elementObject(e)))}

      <div aria-hidden="true" className="absolute border-t border-[#CCCCCC] pointer-events-none" style={{ left: px(header.left), top: px(header.top + header.height + 5 * PT), width: px(header.width) }} />
      {!images.header && (
        <div
          aria-hidden="true"
          data-details
          className="absolute flex flex-col justify-center overflow-hidden pointer-events-none"
          style={{ left: px(header.left + text.x), top: px(header.top + text.y), width: px(text.width), height: px(text.height), textAlign: text.align }}
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
          style={{ left: px(footer.left), top: px(footer.top + 4 * PT), width: px(footer.width), height: px(Math.max(0, footer.height - 4 * PT)), fontFamily: FONT, fontSize: px(7.5 * PT), lineHeight: 1.15, color: '#555555' }}
        >
          {footerText}
        </div>
      )}

      {/* The letter's text, between the header and the footer */}
      {!printOnly && <div
        aria-hidden="true"
        data-body
        className="absolute flex flex-col gap-2 overflow-hidden pointer-events-none"
        style={{ left: px(body.left), top: px(body.top), width: px(body.width), height: px(Math.max(0, body.height)) }}
      >
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Letter text · {Math.max(0, Math.floor(body.height))} mm</span>
        {Array.from({ length: 6 }, (_, i) => <span key={i} className="block h-1.5 rounded bg-slate-200" style={{ width: `${[92, 100, 96, 88, 100, 60][i]}%` }} />)}
      </div>}

      {printOnly
        ? <>{printOnlyImage(images.header ? 'header' : 'logo')}{printOnlyImage('footer')}</>
        : [slotObject(images.header ? 'header' : 'logo'), slotObject('footer')].map((o) => o && objectBox(o))}

      {/* Elements in front of the letter text */}
      {visibleElements.filter((e) => e.aboveText).map((e) => objectBox(elementObject(e)))}

      {guideLines?.x !== null && guideLines?.x !== undefined && <span aria-hidden="true" data-guide="x" className="absolute top-0 bottom-0 w-px bg-fuchsia-500 pointer-events-none z-40" style={{ left: px(guideLines.x) }} />}
      {guideLines?.y !== null && guideLines?.y !== undefined && <span aria-hidden="true" data-guide="y" className="absolute left-0 right-0 h-px bg-fuchsia-500 pointer-events-none z-40" style={{ top: px(guideLines.y) }} />}
      {!printOnly && boundary('header')}
      {!printOnly && boundary('footer')}
    </div>
  );
};
