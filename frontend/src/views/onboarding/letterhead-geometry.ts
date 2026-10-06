import type { LetterheadBox, LetterheadImageSlot } from '../../api/onboarding.api';

/**
 * The letterhead editor's geometry, in the PDF's own terms. Everything is
 * millimetres: the page, its margins, the header (from the top margin down)
 * and footer (from the bottom margin up), and image boxes measured from the
 * top-left of the header or footer area. Pixels exist only on screen, as
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

export const HEADER_LIMITS = { min: 15, max: 70 };
export const FOOTER_LIMITS = { min: 8, max: 50 };
/** The letter text always keeps at least this much of the page. */
export const MIN_BODY_MM = 60;
/** Space the renderer leaves between the header and the text (12 pt) and the text and the footer (8 pt). */
const BODY_GAPS_MM = 20 * PT;
export const MIN_BOX_MM = 3;
/** Matches the server: the widest header or footer (Letter less 10 mm margins). */
export const WIDEST_AREA_MM = 195.9;

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

export const headerArea = (page: Page, marginMm: number, headerHeightMm: number): Area => ({ width: round1(page.width - 2 * marginMm), height: headerHeightMm });
export const footerArea = (page: Page, marginMm: number, footerHeightMm: number): Area => ({ width: round1(page.width - 2 * marginMm), height: footerHeightMm });

/** Height left for the letter text between the header and the footer. */
export const bodyHeightMm = (page: Page, marginMm: number, headerHeightMm: number, footerHeightMm: number) =>
  page.height - 2 * marginMm - headerHeightMm - footerHeightMm - BODY_GAPS_MM;

/** How tall the header may be (whole mm), leaving the letter text its room. */
export function headerLimits(page: Page, marginMm: number, footerHeightMm: number) {
  const room = Math.floor(bodyHeightMm(page, marginMm, 0, footerHeightMm) - MIN_BODY_MM);
  return { min: HEADER_LIMITS.min, max: clamp(room, HEADER_LIMITS.min, HEADER_LIMITS.max) };
}
export function footerLimits(page: Page, marginMm: number, headerHeightMm: number) {
  const room = Math.floor(bodyHeightMm(page, marginMm, headerHeightMm, 0) - MIN_BODY_MM);
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

/**
 * A box resized by dragging a corner (dx, dy mm), the opposite corner staying
 * put. Unless it stretches, it keeps its proportions; either way it stays
 * inside its area and at least 3 mm each way.
 */
export function resizeBox(start: LetterheadBox, corner: Corner, dx: number, dy: number, area: Area): LetterheadBox {
  const east = corner.endsWith('e');
  const south = corner.startsWith('s');
  const maxWidth = east ? area.width - start.x : start.x + start.width;
  const maxHeight = south ? area.height - start.y : start.y + start.height;
  const rawWidth = start.width + (east ? dx : -dx);
  const rawHeight = start.height + (south ? dy : -dy);
  let width: number;
  let height: number;
  if (start.stretch) {
    width = clamp(snap(rawWidth), MIN_BOX_MM, maxWidth);
    height = clamp(snap(rawHeight), MIN_BOX_MM, maxHeight);
  } else {
    // Follow whichever side the pointer pulled more.
    const byWidth = rawWidth / start.width;
    const byHeight = rawHeight / start.height;
    const wanted = Math.abs(byWidth - 1) >= Math.abs(byHeight - 1) ? byWidth : byHeight;
    const scale = clamp(wanted, Math.max(MIN_BOX_MM / start.width, MIN_BOX_MM / start.height), Math.min(maxWidth / start.width, maxHeight / start.height));
    width = start.width * scale;
    height = start.height * scale;
  }
  width = round1(width);
  height = round1(height);
  return { ...start, width, height, x: round1(east ? start.x : start.x + start.width - width), y: round1(south ? start.y : start.y + start.height - height) };
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
  logoBox: LetterheadBox | null;
  headerArtBox: LetterheadBox | null;
  footerArtBox: LetterheadBox | null;
}

export const BOX_OF: Record<LetterheadImageSlot, 'logoBox' | 'headerArtBox' | 'footerArtBox'> = { logo: 'logoBox', header: 'headerArtBox', footer: 'footerArtBox' };

/** A layout with its heights in range for the page and every saved box inside its area. */
export function fitLayout(layout: LetterheadLayout, page: Page, marginMm: number): LetterheadLayout {
  const headerHeightMm = clampHeight(layout.headerHeightMm, headerLimits(page, marginMm, layout.footerHeightMm));
  const footerHeightMm = clampHeight(layout.footerHeightMm, footerLimits(page, marginMm, headerHeightMm));
  const header = headerArea(page, marginMm, headerHeightMm);
  const footer = footerArea(page, marginMm, footerHeightMm);
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
