import { BadRequestException } from '@nestjs/common';
import type { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { z } from 'zod';

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  size: z.coerce.number().int().min(1).max(100).default(20),
});

export type Pagination = z.infer<typeof paginationSchema>;

export interface Paginated<T> {
  items: T[];
  /** Exact up to COUNT_CAP; beyond that it is COUNT_CAP and `capped` is true. */
  total: number;
  capped?: boolean;
  page: number;
  size: number;
}

export const uuidParam = z.uuid();

/** Deepest row an admin list can be paged to. Beyond it, filter or search instead. */
export const MAX_OFFSET = 10_000;
/** Counting stops here, so "how many" never scans millions of rows. */
export const COUNT_CAP = 100_000;

/**
 * One page of a query, plus a bounded total. The count runs beside the page query and never
 * reads more than COUNT_CAP + 1 matching rows, so list endpoints stay fast as tables grow.
 * `countQb` is the same filters without joins that only exist to show data.
 */
export async function paginateQb<T extends ObjectLiteral>(
  dataQb: SelectQueryBuilder<T>,
  countQb: SelectQueryBuilder<ObjectLiteral>,
  { page, size }: Pagination,
): Promise<Paginated<T>> {
  const offset = (page - 1) * size;
  if (offset >= MAX_OFFSET) {
    throw new BadRequestException(
      `Lists can be paged through the first ${MAX_OFFSET.toLocaleString('en-IN')} results. Narrow the list with a filter, a date range or a search.`,
    );
  }
  const [sql, params] = countQb
    .clone()
    .select('1')
    .orderBy()
    .limit(COUNT_CAP + 1)
    .getQueryAndParameters();
  const [items, counted] = await Promise.all([
    dataQb.offset(offset).limit(size).getMany(),
    countQb.connection.query(`SELECT count(*)::int AS n FROM (${sql}) t`, params) as Promise<{ n: number }[]>,
  ]);
  const n = counted[0]?.n ?? 0;
  return { items, total: Math.min(n, COUNT_CAP), capped: n > COUNT_CAP, page, size };
}

/** Escapes LIKE wildcards in what a person typed into a search box. */
export const likeOf = (q: string): string => `%${q.replace(/[%_\\]/g, '\\$&')}%`;
