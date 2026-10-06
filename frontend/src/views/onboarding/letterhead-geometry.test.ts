import { describe, expect, it } from 'vitest';
import {
  PAGE_SIZES, autoBox, bodyHeightMm, clampZoom, detailsArea, fitLayout, fitZoom, footerLimits, headerArea, headerLimits, imageSize, moveBox, placeBox, pxPerMm, resizeBox,
} from './letterhead-geometry';

const A4 = PAGE_SIZES.A4;
const header = headerArea(A4, 20, 30); // 170 × 30 mm
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
    expect(header).toEqual({ width: 170, height: 30 });
    expect(headerArea(PAGE_SIZES.LETTER, 10, 30).width).toBe(195.9);
    expect(bodyHeightMm(A4, 20, 30, 16)).toBeCloseTo(297 - 40 - 46 - 20 * (25.4 / 72), 6);
    expect(headerLimits(A4, 20, 16)).toEqual({ min: 15, max: 70 });
    expect(footerLimits(A4, 20, 30)).toEqual({ min: 8, max: 50 });
    // On a short page the header can't take the text's room.
    expect(headerLimits({ width: 100, height: 200 }, 20, 30)).toEqual({ min: 15, max: 62 });
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
    const shorter = fitLayout({ logoPosition: 'LEFT', headerHeightMm: 15, footerHeightMm: 16, logoBox: { ...logo, y: 10, height: 12 }, headerArtBox: null, footerArtBox: null }, A4, 20);
    expect(shorter.logoBox).toEqual({ ...logo, y: 3, height: 12 });
    const tiny = fitLayout({ logoPosition: 'LEFT', headerHeightMm: 15, footerHeightMm: 16, logoBox: { x: 0, y: 0, width: 80, height: 20, stretch: false }, headerArtBox: null, footerArtBox: null }, A4, 20);
    expect(tiny.logoBox).toEqual({ x: 0, y: 0, width: 60, height: 15, stretch: false });
    expect(fitLayout({ logoPosition: 'LEFT', headerHeightMm: 90, footerHeightMm: 2, logoBox: null, headerArtBox: null, footerArtBox: null }, A4, 20)).toMatchObject({ headerHeightMm: 70, footerHeightMm: 8 });
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
