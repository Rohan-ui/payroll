import { Prisma } from '@prisma/client';

/** A decimal for the API: a plain string, or null. */
export const text = (value: Prisma.Decimal | null | undefined) => (value === null || value === undefined ? null : value.toString());

/** A decimal string from the API for storing, or null. */
export const decimal = (value: string | null | undefined) => (value === null || value === undefined || value === '' ? null : new Prisma.Decimal(value));

/** Page and size of a list request: 25 a page by default, at most 100. */
export function pageOf(query: { page?: number; limit?: number }) {
  const page = query.page ?? 1;
  const limit = Math.min(query.limit ?? 25, 100);
  return { page, limit, skip: (page - 1) * limit };
}

export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/** A delete the database refused because something still refers to the row. */
export function isForeignKeyViolation(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') return true;
  const text = error instanceof Error ? error.message : '';
  return text.includes('23503') || text.includes('foreign key');
}

/** Why an item can't be deleted, naming what uses it. */
export const inUseMessage = (code: string, uses: string[]) =>
  `${code} can’t be deleted because it is used by ${uses.slice(0, 5).join(', ')}${uses.length > 5 ? ` and ${uses.length - 5} more` : ''}. Archive it instead to keep it out of new work.`;

/** Active and archived counts of a library, for its tabs. */
export const statusCounts = (groups: { status: string; count: number }[]) => ({
  active: groups.find((g) => g.status === 'ACTIVE')?.count ?? 0,
  archived: groups.find((g) => g.status === 'ARCHIVED')?.count ?? 0,
});

/** An employee's name as people read it. */
export const personName = (e: { first_name: string; last_name: string | null; preferred_name?: string | null }) =>
  `${e.preferred_name || e.first_name} ${e.last_name ?? ''}`.trim();
