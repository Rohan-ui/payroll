import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

/**
 * The portal's colours come from semantic tokens defined once per theme in
 * index.css. These checks keep both themes complete and readable (WCAG AA,
 * 4.5:1 for text) so a token change cannot quietly break one of them.
 */

type Rgb = [number, number, number];

const css = readFileSync(join(process.cwd(), 'src', 'index.css'), 'utf8');

function tokens(theme: 'light' | 'dark'): Record<string, Rgb> {
  const block = css.match(new RegExp(`:root\\[data-hq-theme='${theme}'\\] \\{([^}]*)\\}`));
  if (!block) throw new Error(`No ${theme} token block in index.css`);
  return Object.fromEntries(
    [...block[1].matchAll(/--hq-([\w-]+):\s*(\d+) (\d+) (\d+);/g)].map((match) => [
      match[1],
      [Number(match[2]), Number(match[3]), Number(match[4])] as Rgb,
    ]),
  );
}

const luminance = (color: Rgb) => {
  const [r, g, b] = color.map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = (a: Rgb, b: Rgb) => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
};

/** A colour at the given opacity over a background, as `bg-hq-success/10` renders. */
const over = (color: Rgb, background: Rgb, alpha: number) =>
  color.map((channel, index) => Math.round(channel * alpha + background[index] * (1 - alpha))) as Rgb;

const TEXT = ['foreground', 'muted-foreground', 'subtle-foreground', 'link', 'danger', 'success', 'warning', 'info', 'neutral'];
const SURFACES = ['background', 'card', 'muted', 'accent', 'input'];
const TINTED = ['danger', 'success', 'warning', 'info', 'neutral', 'link'];

describe.each(['light', 'dark'] as const)('%s theme tokens', (theme) => {
  const palette = tokens(theme);

  it('defines the same tokens as the other theme', () => {
    const other = tokens(theme === 'light' ? 'dark' : 'light');
    expect(Object.keys(palette).sort()).toEqual(Object.keys(other).sort());
  });

  it.each(TEXT.flatMap((text) => SURFACES.map((surface) => [text, surface])))('%s text is readable on %s', (text, surface) => {
    expect(contrast(palette[text], palette[surface])).toBeGreaterThanOrEqual(4.5);
  });

  it.each(TINTED)('%s text is readable on its own tinted badge', (status) => {
    expect(contrast(palette[status], over(palette[status], palette.card, 0.1))).toBeGreaterThanOrEqual(4.5);
  });

  it.each([
    ['primary-foreground', 'primary'],
    ['primary-foreground', 'primary-hover'],
    ['destructive-foreground', 'destructive'],
    ['destructive-foreground', 'destructive-hover'],
  ])('%s is readable on %s buttons', (text, surface) => {
    expect(contrast(palette[text], palette[surface])).toBeGreaterThanOrEqual(4.5);
  });

  it('shows a visible focus ring on cards (3:1 for UI)', () => {
    expect(contrast(palette.ring, palette.card)).toBeGreaterThanOrEqual(3);
  });
});

describe('Tailwind mapping', () => {
  it('maps every token to an hq-* colour', () => {
    const config = readFileSync(join(process.cwd(), 'tailwind.config.js'), 'utf8');
    for (const token of Object.keys(tokens('light'))) {
      expect([token, config.includes(`'${token}'`)]).toEqual([token, true]);
    }
  });
});
