import type { LetterheadBox, LetterheadElement, LetterheadImageSlot, LetterheadPlacement, PageMargins } from '../../api/documents.api';

/**
 * The letterhead editor's geometry, in the PDF's own terms. Everything is
 * millimetres: the page, its margins, the header and footer areas (at the
 * margins, or where the letterhead is placed from the page edges), and image
 * boxes measured from the top-left of the header or footer area. Pixels exist only on screen, as
 * millimetres × zoom; nothing in pixels is stored.
 *
 * The placement rules mirror the PDF renderer (backend onboarding-pdf.service),
 * so what the editor shows is what documents print.
 */

/** One PDF point in millimetres. */
export const PT = 25.4 / 72;
export const PAGE_SIZES = { A4: { width: 210, height: 297 }, LETTER: { width: 215.9, height: 279.4 } } as const;
export type PageSizeName = keyof typeof PAGE_SIZES;
export interface Page { width: number; height: number }
export interface Area { width: number; height: number }
export interface Rect extends Area { left: number; top: number }

export const HEADER_LIMITS = { min: 15, max: 70 };
export const FOOTER_LIMITS = { min: 8, max: 50 };
/** The letter text always keeps at least this much of the page's height; the server refuses less. */
export const MIN_BODY_MM = 60;
/** Page margins, and a letterhead's distances from the page edges, in whole mm. */
export const MARGIN_LIMITS = { min: 0, max: 60 };
export const MIN_BOX_MM = 3;
/** Matches the server: the widest header or footer (a Letter page, placed at the edges). */
export const WIDEST_AREA_MM = 215.9;

export const ZOOM = { min: 0.25, max: 2, step: 0.1 };
const PX_PER_MM_AT_100 = 96 / 25.4;
/** Screen pixels per millimetre at a zoom (1 = 100 %, real size on a 96 dpi screen). */
export const pxPerMm = (zoom: number) => zoom * PX_PER_MM_AT_100;
export const clampZoom = (zoom: number) => Math.min(ZOOM.max, Math.max(ZOOM.min, Math.round(zoom * 100) / 100));
/** The zoom at which a page's width fills `availablePx`. */
export const fitZoom = (availablePx: number, page: Page) => clampZoom(Math.floor((availablePx / (page.width * PX_PER_MM_AT_100)) * 100) / 100);

const round1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
/** Pointer moves land on half millimetres. */
export const snap = (mm: number) => Math.round(mm * 2) / 2;

export const uniformMargins = (mm: number): PageMargins => ({ top: mm, right: mm, bottom: mm, left: mm });

/** Space the renderer leaves between the header and the text (12 pt), and the text and the footer (8 pt). */
const HEADER_GAP_MM = 12 * PT;
const FOOTER_GAP_MM = 8 * PT;

/** What decides where a letterhead's areas sit. */
export interface LetterheadFrameInput {
  headerHeightMm: number;
  footerHeightMm: number;
  placement: LetterheadPlacement | null;
}

/** The header and footer areas: where the letterhead is placed from the page edges, or at the page margins. */
export function letterheadAreas(page: Page, margins: PageMargins, letterhead: LetterheadFrameInput): { header: Rect; footer: Rect } {
  const at = letterhead.placement;
  const left = at ? at.sideOffsetMm : margins.left;
  const width = round1(page.width - left - (at ? at.sideOffsetMm : margins.right));
  return {
    header: { left, top: at ? at.headerOffsetMm : margins.top, width, height: letterhead.headerHeightMm },
    footer: { left, top: page.height - (at ? at.footerOffsetMm : margins.bottom) - letterhead.footerHeightMm, width, height: letterhead.footerHeightMm },
  };
}

/**
 * Where things go on a page, as the renderer's pageFrame: the letterhead's
 * areas, and the letter text inside the margins, at least 12 pt below the
 * header and 8 pt above the footer.
 */
export function pageFrame(page: Page, margins: PageMargins, letterhead: LetterheadFrameInput | null): { header: Rect | null; footer: Rect | null; body: Rect } {
  const { header, footer } = letterhead ? letterheadAreas(page, margins, letterhead) : { header: null, footer: null };
  const top = Math.max(margins.top, header ? header.top + header.height + HEADER_GAP_MM : 0);
  const bottom = Math.min(page.height - margins.bottom, footer ? footer.top - FOOTER_GAP_MM : page.height);
  return { header, footer, body: { left: margins.left, top, width: round1(page.width - margins.left - margins.right), height: bottom - top } };
}

/** How tall the header may be (whole mm), leaving the letter text its room. */
export function headerLimits(page: Page, margins: PageMargins, layout: LetterheadFrameInput) {
  const { body } = pageFrame(page, margins, layout);
  // The text's top follows the header's bottom, until the top margin holds it.
  const room = Math.floor(body.top + body.height - MIN_BODY_MM - HEADER_GAP_MM - (layout.placement ? layout.placement.headerOffsetMm : margins.top));
  return { min: HEADER_LIMITS.min, max: clamp(room, HEADER_LIMITS.min, HEADER_LIMITS.max) };
}
export function footerLimits(page: Page, margins: PageMargins, layout: LetterheadFrameInput) {
  const { body } = pageFrame(page, margins, layout);
  const room = Math.floor(page.height - (layout.placement ? layout.placement.footerOffsetMm : margins.bottom) - FOOTER_GAP_MM - MIN_BODY_MM - body.top);
  return { min: FOOTER_LIMITS.min, max: clamp(room, FOOTER_LIMITS.min, FOOTER_LIMITS.max) };
}
export const clampHeight = (mm: number, limits: { min: number; max: number }) => clamp(Math.round(mm), limits.min, limits.max);

/** The box as the PDF places it: no bigger than its area, and inside it (as the renderer's placeBox). */
export function placeBox(box: LetterheadBox, area: Area): LetterheadBox {
  const width = Math.min(box.width, area.width);
  const height = Math.min(box.height, area.height);
  return { ...box, width, height, x: clamp(box.x, 0, area.width - width), y: clamp(box.y, 0, area.height - height) };
}

/** A box shrunk (in proportion) and moved until it fits its area, at 0.1 mm. */
export function fitInside(box: LetterheadBox, area: Area): LetterheadBox {
  const scale = Math.min(1, area.width / box.width, area.height / box.height);
  const width = round1(Math.max(MIN_BOX_MM, box.width * scale));
  const height = round1(Math.max(MIN_BOX_MM, box.height * scale));
  return { ...box, width, height, x: round1(clamp(box.x, 0, area.width - width)), y: round1(clamp(box.y, 0, area.height - height)) };
}

/** A box moved by (dx, dy) mm, kept inside its area. */
export function moveBox(box: LetterheadBox, dx: number, dy: number, area: Area): LetterheadBox {
  return { ...box, x: round1(clamp(snap(box.x + dx), 0, area.width - box.width)), y: round1(clamp(snap(box.y + dy), 0, area.height - box.height)) };
}

export type Corner = 'nw' | 'ne' | 'sw' | 'se';

const radians = (degrees: number) => (degrees * Math.PI) / 180;

/** A corner of a box (sx, sy each −1 or 1) where it is drawn: turned with the box about its centre. */
function turnedCorner(box: LetterheadBox, sx: number, sy: number) {
  const t = radians(box.rotation ?? 0);
  const [dx, dy] = [(sx * box.width) / 2, (sy * box.height) / 2];
  return { x: box.x + box.width / 2 + dx * Math.cos(t) - dy * Math.sin(t), y: box.y + box.height / 2 + dx * Math.sin(t) + dy * Math.cos(t) };
}

/**
 * A box resized by dragging a corner (dx, dy mm on the page), the opposite
 * corner staying put. Unless it stretches (or `free`, such as with Shift held),
 * it keeps its proportions; either way it stays inside its area and at least
 * 3 mm each way. A turned box resizes along its own sides.
 */
export function resizeBox(start: LetterheadBox, corner: Corner, dx: number, dy: number, area: Area, free = false): LetterheadBox {
  if (start.rotation) return resizeTurned(start, corner, dx, dy, area, free);
  return resizeUpright(start, corner, dx, dy, area, free);
}

function resizeUpright(start: LetterheadBox, corner: Corner, dx: number, dy: number, area: Area, free: boolean): LetterheadBox {
  const east = corner.endsWith('e');
  const south = corner.startsWith('s');
  const maxWidth = east ? area.width - start.x : start.x + start.width;
  const maxHeight = south ? area.height - start.y : start.y + start.height;
  const rawWidth = start.width + (east ? dx : -dx);
  const rawHeight = start.height + (south ? dy : -dy);
  let width: number;
  let height: number;
  if (start.stretch || free) {
    width = clamp(snap(rawWidth), MIN_BOX_MM, maxWidth);
    height = clamp(snap(rawHeight), MIN_BOX_MM, maxHeight);
  } else {
    ({ width, height } = inProportion(start, rawWidth, rawHeight, maxWidth, maxHeight));
  }
  width = round1(width);
  height = round1(height);
  return { ...start, width, height, x: round1(east ? start.x : start.x + start.width - width), y: round1(south ? start.y : start.y + start.height - height) };
}

/** A size in the box's proportions, following whichever side the pointer pulled more, within limits. */
function inProportion(start: Area, rawWidth: number, rawHeight: number, maxWidth: number, maxHeight: number) {
  const byWidth = rawWidth / start.width;
  const byHeight = rawHeight / start.height;
  const wanted = Math.abs(byWidth - 1) >= Math.abs(byHeight - 1) ? byWidth : byHeight;
  const scale = clamp(wanted, Math.max(MIN_BOX_MM / start.width, MIN_BOX_MM / start.height), Math.min(maxWidth / start.width, maxHeight / start.height));
  return { width: start.width * scale, height: start.height * scale };
}

/** A turned box resized along its own sides, the opposite corner staying where it is drawn. */
function resizeTurned(start: LetterheadBox, corner: Corner, dx: number, dy: number, area: Area, free: boolean): LetterheadBox {
  const t = radians(start.rotation ?? 0);
  const east = corner.endsWith('e');
  const south = corner.startsWith('s');
  // The pointer's travel along the box's own width and height.
  const along = dx * Math.cos(t) + dy * Math.sin(t);
  const across = -dx * Math.sin(t) + dy * Math.cos(t);
  const rawWidth = start.width + (east ? along : -along);
  const rawHeight = start.height + (south ? across : -across);
  let { width, height } = start.stretch || free
    ? { width: clamp(snap(rawWidth), MIN_BOX_MM, area.width), height: clamp(snap(rawHeight), MIN_BOX_MM, area.height) }
    : inProportion(start, rawWidth, rawHeight, area.width, area.height);
  width = round1(width);
  height = round1(height);
  const [sx, sy] = [east ? -1 : 1, south ? -1 : 1];
  const anchor = turnedCorner(start, sx, sy);
  // The centre that puts the opposite corner back on its anchor.
  const [hx, hy] = [(sx * width) / 2, (sy * height) / 2];
  const cx = anchor.x - (hx * Math.cos(t) - hy * Math.sin(t));
  const cy = anchor.y - (hx * Math.sin(t) + hy * Math.cos(t));
  return { ...start, width, height, x: round1(clamp(cx - width / 2, 0, area.width - width)), y: round1(clamp(cy - height / 2, 0, area.height - height)) };
}

/**
 * The rotation (degrees clockwise, −180 to 180) that turns a box's top towards
 * a point, from its centre; to the nearest `step` degrees (1 unless given).
 */
export function rotationTowards(center: { x: number; y: number }, point: { x: number; y: number }, step = 1) {
  const degrees = (Math.atan2(point.y - center.y, point.x - center.x) * 180) / Math.PI + 90;
  const turned = Math.round(degrees / step) * step;
  const normal = ((((turned + 180) % 360) + 360) % 360) - 180;
  return normal === -180 ? 180 : normal;
}

/** Lines boxes snap to while moving, in mm on the page: down (x) and across (y). */
export interface Guides { x: number[]; y: number[] }

/** The page's centre lines, the margins, and the middle of the header and footer. */
export function pageGuides(page: Page, margins: PageMargins, areas: { header: Rect; footer: Rect } | null): Guides {
  const unique = (values: number[]) => [...new Set(values.map(round1))];
  return {
    x: unique([margins.left, page.width / 2, page.width - margins.right]),
    y: unique([margins.top, page.height / 2, page.height - margins.bottom, ...(areas ? [areas.header.top + areas.header.height / 2, areas.footer.top + areas.footer.height / 2] : [])]),
  };
}

/**
 * How far to move a box (page mm) so an edge or its centre lands on a guide
 * within `threshold` mm, and the guides it lands on. A turned box snaps by its centre only.
 */
export function snapToGuides(box: Rect & { rotation?: number }, guides: Guides, threshold: number) {
  const turned = Boolean(box.rotation);
  const best = (points: number[], lines: number[]) => {
    let hit: { shift: number; line: number } | null = null;
    for (const p of points) {
      for (const line of lines) {
        const shift = line - p;
        if (Math.abs(shift) <= threshold && (!hit || Math.abs(shift) < Math.abs(hit.shift))) hit = { shift, line };
      }
    }
    return hit;
  };
  const x = best(turned ? [box.left + box.width / 2] : [box.left, box.left + box.width / 2, box.left + box.width], guides.x);
  const y = best(turned ? [box.top + box.height / 2] : [box.top, box.top + box.height / 2, box.top + box.height], guides.y);
  return { dx: x?.shift ?? 0, dy: y?.shift ?? 0, lines: { x: x?.line ?? null, y: y?.line ?? null } };
}

/** A box resized from the keyboard: wider/taller by (dw, dh) mm from its top-left, in proportion unless it stretches. */
export function growBox(box: LetterheadBox, dw: number, dh: number, area: Area): LetterheadBox {
  return resizeBox(box, 'se', dw, dh, area);
}

/** The drawn size of an image fitted, in proportion, inside a width × height. */
function fit(image: { width: number; height: number }, width: number, height: number) {
  const scale = Math.min(width / image.width, height / image.height);
  return { width: image.width * scale, height: image.height * scale };
}

export type LogoPosition = 'LEFT' | 'CENTER' | 'RIGHT';
/** The logo's slot in the automatic layout: up to 30 % of the width (at most 170 pt), the header's height, or 45 % of it when centred. */
const autoLogoSlot = (area: Area, position: LogoPosition) => ({ width: Math.min(area.width * 0.3, 170 * PT), height: position === 'CENTER' ? area.height * 0.45 : area.height });

/**
 * Where the automatic layout draws an image (no box saved), as a box: the
 * starting point when the image is first moved or resized, so nothing jumps.
 */
export function autoBox(slot: LetterheadImageSlot, image: { width: number; height: number }, area: Area, position: LogoPosition): LetterheadBox {
  let rect: { x: number; y: number; width: number; height: number };
  if (slot === 'logo') {
    const logo = autoLogoSlot(area, position);
    const drawn = fit(image, logo.width, logo.height);
    const x = position === 'CENTER' ? (area.width - logo.width) / 2 + (logo.width - drawn.width) / 2 : position === 'RIGHT' ? area.width - drawn.width : 0;
    rect = { x, y: (logo.height - drawn.height) / 2, ...drawn };
  } else if (slot === 'header') {
    const drawn = fit(image, area.width, area.height);
    rect = { x: (area.width - drawn.width) / 2, y: (area.height - drawn.height) / 2, ...drawn };
  } else {
    // Footer artwork sits 3 pt below the footer's rule.
    const drawn = fit(image, area.width, area.height - 3 * PT);
    rect = { x: (area.width - drawn.width) / 2, y: 3 * PT + (area.height - 3 * PT - drawn.height) / 2, ...drawn };
  }
  return fitInside({ x: round1(rect.x), y: round1(rect.y), width: round1(Math.max(MIN_BOX_MM, rect.width)), height: round1(Math.max(MIN_BOX_MM, rect.height)), stretch: false }, area);
}

/** Where the renderer puts the company details in the header, beside (or, centred, below) the logo. */
export function detailsArea(area: Area, position: LogoPosition, logo: { box: LetterheadBox; automatic: boolean } | null) {
  const full = { x: 0, y: 0, width: area.width, height: area.height, align: (position === 'CENTER' ? 'center' : 'left') as 'left' | 'center' | 'right' };
  if (!logo) return full;
  if (logo.automatic) {
    const slot = autoLogoSlot(area, position);
    if (position === 'CENTER') return { ...full, y: slot.height + 4 * PT, height: area.height - slot.height - 4 * PT };
    const width = area.width - slot.width - 12 * PT;
    return position === 'LEFT' ? { ...full, x: slot.width + 12 * PT, width, align: 'right' as const } : { ...full, width };
  }
  const r = placeBox(logo.box, area);
  if (position === 'CENTER') return { ...full, y: r.y + r.height + 4 * PT, height: Math.max(0, area.height - r.y - r.height - 4 * PT) };
  if (position === 'LEFT') {
    const x = r.x + r.width + 12 * PT;
    return { ...full, x, width: Math.max(40 * PT, area.width - x), align: 'right' as const };
  }
  return { ...full, width: Math.max(40 * PT, r.x - 12 * PT) };
}

/** A PNG's or JPEG's pixel size, read from its header; null for anything else. */
export function imageSize(bytes: ArrayBuffer): { width: number; height: number } | null {
  const view = new DataView(bytes);
  if (view.byteLength >= 24 && view.getUint32(0) === 0x89504e47 && view.getUint32(12) === 0x49484452) {
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (view.byteLength >= 4 && view.getUint16(0) === 0xffd8) {
    let at = 2;
    while (at + 9 < view.byteLength) {
      if (view.getUint8(at) !== 0xff) return null;
      const marker = view.getUint8(at + 1);
      const length = view.getUint16(at + 2);
      // Start-of-frame markers (not DHT, JPG or DAC) carry the size.
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { width: view.getUint16(at + 7), height: view.getUint16(at + 5) };
      }
      at += 2 + length;
    }
  }
  return null;
}

export interface LetterheadLayout {
  logoPosition: LogoPosition;
  headerHeightMm: number;
  footerHeightMm: number;
  /** Null: at each template's margins. */
  placement: LetterheadPlacement | null;
  logoBox: LetterheadBox | null;
  headerArtBox: LetterheadBox | null;
  footerArtBox: LetterheadBox | null;
  /** Images kept but not printed, and images that can't be moved until unlocked. */
  hiddenImages: LetterheadImageSlot[];
  lockedImages: LetterheadImageSlot[];
  /** Page elements, in paint order: those behind the text first. */
  elements: LetterheadElement[];
}

export const BOX_OF: Record<LetterheadImageSlot, 'logoBox' | 'headerArtBox' | 'footerArtBox'> = { logo: 'logoBox', header: 'headerArtBox', footer: 'footerArtBox' };

/** A layout with its heights in range for the page and every saved box inside its area. */
export function fitLayout(layout: LetterheadLayout, page: Page, margins: PageMargins): LetterheadLayout {
  const headerHeightMm = clampHeight(layout.headerHeightMm, headerLimits(page, margins, layout));
  const footerHeightMm = clampHeight(layout.footerHeightMm, footerLimits(page, margins, { ...layout, headerHeightMm }));
  const { header, footer } = letterheadAreas(page, margins, { ...layout, headerHeightMm, footerHeightMm });
  const inside = (box: LetterheadBox | null, area: Area) => (box ? fitInside(box, area) : null);
  return {
    ...layout,
    headerHeightMm,
    footerHeightMm,
    logoBox: inside(layout.logoBox, header),
    headerArtBox: inside(layout.headerArtBox, header),
    footerArtBox: inside(layout.footerArtBox, footer),
  };
}
