/**
 * Lightweight classname merger — no external dependencies.
 * Filters out falsy values and joins the rest.
 */
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}
