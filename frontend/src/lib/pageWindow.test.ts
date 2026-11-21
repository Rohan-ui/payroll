import { describe, expect, it } from 'vitest';
import { pageWindow } from './pageWindow';

describe('pageWindow', () => {
  it('shows the ends and the pages around the current one', () => {
    expect(pageWindow(1, 56)).toEqual([1, 2, null, 56]);
    expect(pageWindow(5, 56)).toEqual([1, null, 4, 5, 6, null, 56]);
    expect(pageWindow(56, 56)).toEqual([1, null, 55, 56]);
    expect(pageWindow(2, 4)).toEqual([1, 2, 3, 4]);
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(1, 0)).toEqual([]);
  });
});
