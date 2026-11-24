/**
 * TypeORM refuses `undefined` in a where clause (it would silently match every row).
 * Optional filters go through this so an absent filter is simply left out.
 */
export function defined<T extends Record<string, unknown>>(
  filter: T,
): Partial<T> {
  return Object.fromEntries(
    Object.entries(filter).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
}
