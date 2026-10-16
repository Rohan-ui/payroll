import { describe, expect, it } from 'vitest';
import {
  PAGE_SIZES, PT, autoBox, pageGuides, rotationTowards, snapToGuides, clampZoom, detailsArea, fitLayout, fitZoom, footerLimits, headerLimits, imageSize, letterheadAreas, moveBox, pageFrame, placeBox, pxPerMm, resizeBox, uniformMargins,
} from './letterhead-geometry';

const A4 = PAGE_SIZES.A4;
const M20 = uniformMargins(20);
const AT_MARGINS = { headerHeightMm: 30, footerHeightMm: 16, placement: null };
const { header } = letterheadAreas(A4, M20, AT_MARGINS); // 170 × 30 mm
const logo = { x: 10, y: 5, width: 40, height: 10, stretch: false };

describe('letterhead geometry', () => {
  it('turns millimetres into screen pixels by zoom only', () => {
    expect(pxPerMm(1)).toBeCloseTo(96 / 25.4, 6);
    expect(pxPerMm(0.5) * 210).toBeCloseTo(396.85, 1);
    expect(clampZoom(5)).toBe(2);
    expect(clampZoom(0.01)).toBe(0.25);
    // A4 at 100 % is about 794 px wide.
    expect(fitZoom(794, A4)).toBe(1);
    expect(fitZoom(397, A4)).toBe(0.5);
  });

  it('measures header and footer areas from the margins, and keeps the letter text room', () => {
    expect(header).toEqual({ left: 20, top: 20, width: 170, height: 30 });
    expect(letterheadAreas(PAGE_SIZES.LETTER, uniformMargins(10), AT_MARGINS).header.width).toBe(195.9);
    expect(pageFrame(A4, M20, AT_MARGINS).body.height).toBeCloseTo(297 - 40 - 46 - 20 * PT, 6);
    expect(headerLimits(A4, M20, AT_MARGINS)).toEqual({ min: 15, max: 70 });
    expect(footerLimits(A4, M20, AT_MARGINS)).toEqual({ min: 8, max: 50 });
    // On a short page the header can't take the text's room.
    expect(headerLimits({ width: 100, height: 200 }, M20, { ...AT_MARGINS, footerHeightMm: 30 })).toEqual({ min: 15, max: 62 });
  });

  it('places a letterhead from the page edges when it says so, the text keeping each margin', () => {
    const edges = { ...AT_MARGINS, placement: { headerOffsetMm: 0, footerOffsetMm: 0, sideOffsetMm: 0 } };
    const margins = { top: 10, right: 15, bottom: 25, left: 30 };
    const frame = pageFrame(A4, margins, edges);
    expect(frame.header).toEqual({ left: 0, top: 0, width: 210, height: 30 });
    expect(frame.footer).toEqual({ left: 0, top: 281, width: 210, height: 16 });
    // Below the header (the top margin is above it), and above the 25 mm bottom margin (the footer is lower).
    expect(frame.body.left).toBe(30);
    expect(frame.body.width).toBe(165);
    expect(frame.body.top).toBeCloseTo(30 + 12 * PT, 6);
    expect(frame.body.top + frame.body.height).toBeCloseTo(272, 6);
    // A top margin below the letterhead holds the text down; no letterhead, the margins alone, to the edge.
    expect(pageFrame(A4, { ...margins, top: 50 }, edges).body.top).toBe(50);
    expect(pageFrame(A4, uniformMargins(0), null).body).toEqual({ left: 0, top: 0, width: 210, height: 297 });
    // With wide margins the header may be taller from the edge than at the margins, the text keeping its 60 mm.
    const deep = { ...AT_MARGINS, footerHeightMm: 50 };
    expect(headerLimits(PAGE_SIZES.LETTER, uniformMargins(60), deep).max).toBe(Math.floor(279.4 - 60 - 50 - 8 * PT - 60 - 12 * PT - 60));
    expect(headerLimits(PAGE_SIZES.LETTER, uniformMargins(60), { ...deep, placement: edges.placement }).max).toBe(70);
  });

  it('places images where the PDF’s automatic layout draws them', () => {
    expect(autoBox('logo', { width: 400, height: 100 }, header, 'LEFT')).toEqual({ x: 0, y: 8.6, width: 51, height: 12.8, stretch: false });
    expect(autoBox('logo', { width: 400, height: 100 }, header, 'RIGHT')).toMatchObject({ x: 119, width: 51 });
    expect(autoBox('logo', { width: 400, height: 100 }, header, 'CENTER')).toEqual({ x: 59.5, y: 0.4, width: 51, height: 12.8, stretch: false });
    expect(autoBox('header', { width: 1200, height: 180 }, header, 'LEFT')).toEqual({ x: 0, y: 2.3, width: 170, height: 25.5, stretch: false });
    expect(autoBox('footer', { width: 1200, height: 90 }, { width: 170, height: 16 }, 'LEFT')).toEqual({ x: 0, y: 2.2, width: 170, height: 12.8, stretch: false });
  });

  it('puts the company details beside a placed logo, as the PDF does', () => {
    const pt = 25.4 / 72;
    expect(detailsArea(header, 'LEFT', { box: logo, automatic: false })).toMatchObject({ x: 50 + 12 * pt, align: 'right' });
    expect(detailsArea(header, 'RIGHT', { box: { ...logo, x: 120 }, automatic: false })).toMatchObject({ x: 0, width: 120 - 12 * pt, align: 'left' });
    expect(detailsArea(header, 'CENTER', { box: logo, automatic: false })).toMatchObject({ y: 15 + 4 * pt, align: 'center' });
    expect(detailsArea(header, 'LEFT', null)).toEqual({ x: 0, y: 0, width: 170, height: 30, align: 'left' });
  });

  it('resizes from a corner in proportion, the opposite corner staying put', () => {
    expect(resizeBox(logo, 'se', 20, 0, header)).toEqual({ ...logo, width: 60, height: 15 });
    expect(resizeBox(logo, 'nw', -10, 0, header)).toEqual({ ...logo, x: 0, y: 2.5, width: 50, height: 12.5 });
    // No bigger than the header allows, no smaller than 3 mm.
    expect(resizeBox(logo, 'se', 200, 0, header)).toEqual({ ...logo, width: 100, height: 25 });
    expect(resizeBox(logo, 'se', -100, 0, header)).toEqual({ ...logo, width: 12, height: 3 });
  });

  it('resizes each way on its own when the image stretches', () => {
    expect(resizeBox({ ...logo, stretch: true }, 'se', 20, -5, header)).toEqual({ ...logo, stretch: true, width: 60, height: 5 });
    expect(resizeBox({ ...logo, stretch: true }, 'se', 0, 100, header)).toMatchObject({ width: 40, height: 25 });
  });

  it('moves a box in half millimetres, inside its area', () => {
    expect(moveBox(logo, 10.2, 2.4, header)).toMatchObject({ x: 20, y: 7.5 });
    expect(moveBox(logo, 500, 500, header)).toMatchObject({ x: 130, y: 20 });
    expect(moveBox(logo, -500, -500, header)).toMatchObject({ x: 0, y: 0 });
  });

  it('keeps a box inside its area as the PDF does, and inside a shorter header', () => {
    expect(placeBox({ ...logo, x: 150 }, header)).toMatchObject({ x: 130, width: 40 });
    const shorter = fitLayout({ logoPosition: 'LEFT', headerHeightMm: 15, footerHeightMm: 16, logoBox: { ...logo, y: 10, height: 12 }, placement: null, headerArtBox: null, footerArtBox: null, hiddenImages: [], lockedImages: [], elements: [] }, A4, M20);
    expect(shorter.logoBox).toEqual({ ...logo, y: 3, height: 12 });
    const tiny = fitLayout({ logoPosition: 'LEFT', headerHeightMm: 15, footerHeightMm: 16, logoBox: { x: 0, y: 0, width: 80, height: 20, stretch: false }, placement: null, headerArtBox: null, footerArtBox: null, hiddenImages: [], lockedImages: [], elements: [] }, A4, M20);
    expect(tiny.logoBox).toEqual({ x: 0, y: 0, width: 60, height: 15, stretch: false });
    expect(fitLayout({ logoPosition: 'LEFT', headerHeightMm: 90, footerHeightMm: 2, logoBox: null, placement: null, headerArtBox: null, footerArtBox: null, hiddenImages: [], lockedImages: [], elements: [] }, A4, M20)).toMatchObject({ headerHeightMm: 70, footerHeightMm: 8 });
  });

  it('resizes a turned box along its own sides, the opposite corner staying where it is drawn', () => {
    const area = { width: 210, height: 297 };
    const start = { x: 50, y: 100, width: 40, height: 20, stretch: true, rotation: 90 };
    // Turned a quarter clockwise, the box's width runs down the page: dragging down widens it.
    const wider = resizeBox(start, 'se', 0, 10, area);
    expect([wider.width, wider.height]).toEqual([50, 20]);
    const corner = (b: { x: number; y: number; width: number; height: number; rotation?: number }, sx: number, sy: number) => {
      const t = ((b.rotation ?? 0) * Math.PI) / 180;
      const [dx, dy] = [(sx * b.width) / 2, (sy * b.height) / 2];
      return [b.x + b.width / 2 + dx * Math.cos(t) - dy * Math.sin(t), b.y + b.height / 2 + dx * Math.sin(t) + dy * Math.cos(t)].map((n) => Math.round(n * 10) / 10);
    };
    expect(corner(wider, -1, -1)).toEqual(corner(start, -1, -1));
    // In proportion unless free.
    expect(resizeBox({ ...start, stretch: false }, 'se', 0, 10, area)).toMatchObject({ width: 50, height: 25 });
    expect(resizeBox({ ...start, stretch: false }, 'se', 0, 10, area, true)).toMatchObject({ width: 50, height: 20 });
  });

  it('turns towards the pointer, clockwise, in steps when asked', () => {
    const c = { x: 0, y: 0 };
    expect(rotationTowards(c, { x: 0, y: -10 })).toBe(0);
    expect(rotationTowards(c, { x: 10, y: 0 })).toBe(90);
    expect(rotationTowards(c, { x: 0, y: 10 })).toBe(180);
    expect(rotationTowards(c, { x: -10, y: 0 })).toBe(-90);
    expect(rotationTowards(c, { x: 10, y: -9 }, 15)).toBe(45);
  });

  it('snaps an edge or the centre to the nearest guide within reach, a turned box by its centre', () => {
    const guides = pageGuides(A4, M20, letterheadAreas(A4, M20, AT_MARGINS));
    expect(guides).toEqual({ x: [20, 105, 190], y: [20, 148.5, 277, 35, 269] });
    expect(snapToGuides({ left: 21, top: 50, width: 40, height: 10 }, guides, 1.5)).toEqual({ dx: -1, dy: 0, lines: { x: 20, y: null } });
    expect(snapToGuides({ left: 84, top: 143, width: 40, height: 10 }, guides, 1.5)).toEqual({ dx: 1, dy: 0.5, lines: { x: 105, y: 148.5 } });
    expect(snapToGuides({ left: 30, top: 50, width: 40, height: 10 }, guides, 1.5).lines).toEqual({ x: null, y: null });
    // Turned: the left edge at 20 doesn't count, the centre does.
    expect(snapToGuides({ left: 20, top: 50, width: 170, height: 10, rotation: 45 }, guides, 1.5).lines.x).toBe(105);
    expect(snapToGuides({ left: 21, top: 50, width: 40, height: 10, rotation: 45 }, guides, 1.5).lines.x).toBeNull();
  });

  it('reads a PNG’s or JPEG’s size from its header', () => {
    const png = new Uint8Array(24);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
    new DataView(png.buffer).setUint32(16, 400);
    new DataView(png.buffer).setUint32(20, 100);
    expect(imageSize(png.buffer)).toEqual({ width: 400, height: 100 });
    // SOI, an APP0 segment, then a baseline frame of 120 × 640.
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0, 0, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x78, 0x02, 0x80, 0x03, 0, 0, 0]);
    expect(imageSize(jpeg.buffer)).toEqual({ width: 640, height: 120 });
    expect(imageSize(new Uint8Array([0x89, 0x50]).buffer)).toBeNull();
  });
});
