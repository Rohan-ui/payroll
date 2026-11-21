/**
 * The page numbers to show in a pager: the first, the last, and the current
 * page with one either side, with null where pages are skipped.
 * pageWindow(5, 56) → [1, null, 4, 5, 6, null, 56].
 */
export function pageWindow(current: number, total: number): (number | null)[] {
  const pages: (number | null)[] = [];
  for (let p = 1; p <= total; p += 1) {
    if (p === 1 || p === total || Math.abs(p - current) <= 1) pages.push(p);
    else if (pages[pages.length - 1] !== null) pages.push(null);
  }
  return pages;
}
