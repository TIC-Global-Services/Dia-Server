import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

const TZ = 'Asia/Kolkata';
const DAYS = 30;
const FRESH_MS = 15_000;
const STALE_MS = 120_000;

/** Shop-local calendar day, e.g. 2026-11-14, for a given instant. */
const dayKey = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);

@Injectable()
export class StatsService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  private snapshot: { at: number; value: Awaited<ReturnType<StatsService['compute']>> } | null = null;
  private inflight: Promise<unknown> | null = null;

  /**
   * Everything the admin overview shows. The numbers are aggregates over every order, so they are
   * computed once and shared: fresh for FRESH_MS, then served while one background refresh runs.
   * Under load that is one set of queries per refresh, not one per request.
   */
  async overview() {
    const age = this.snapshot ? Date.now() - this.snapshot.at : Infinity;
    if (this.snapshot && age < FRESH_MS) return this.snapshot.value;
    if (this.snapshot && age < STALE_MS) {
      void this.refresh().catch(() => undefined);
      return this.snapshot.value;
    }
    await this.refresh();
    return this.snapshot!.value;
  }

  private refresh(): Promise<unknown> {
    this.inflight ??= this.compute()
      .then((value) => (this.snapshot = { at: Date.now(), value }))
      .finally(() => (this.inflight = null));
    return this.inflight;
  }

  private async compute() {
    const [byStatus, daily, oldest, catalogue, categories, thumbs] =
      await Promise.all([
        this.db.query(
          `SELECT status, count(*)::int AS n FROM orders GROUP BY status`,
        ),
        this.db.query(
          `SELECT to_char(("createdAt" AT TIME ZONE $1)::date, 'YYYY-MM-DD') AS day,
                count(*)::int AS orders,
                COALESCE(sum("totalMinor"), 0)::bigint AS revenue
           FROM orders
          WHERE status <> 'cancelled' AND "createdAt" >= now() - interval '${DAYS + 1} days'
          GROUP BY 1`,
          [TZ],
        ),
        this.db.query(
          // One min() per status: each reads the first entry of the (status, createdAt) index.
          // A single IN (...) made Postgres walk the whole date index (15 s at 1M orders).
          `SELECT min(at) AS at FROM (
             SELECT min("createdAt") AS at FROM orders WHERE status = 'confirmed'
             UNION ALL SELECT min("createdAt") FROM orders WHERE status = 'processing') t`,
        ),
        this.db.query(
          `SELECT count(*)::int AS total,
                count(*) FILTER (WHERE p.status = 'active')::int AS active,
                count(*) FILTER (WHERE p.status = 'draft')::int AS draft,
                count(*) FILTER (WHERE p.status = 'archived')::int AS archived,
                count(*) FILTER (WHERE p.status = 'active' AND p.price IS NOT NULL)::int AS priced,
                count(*) FILTER (WHERE p.status = 'active' AND COALESCE(s."onHand" - s."reserved", 0) > 0)::int AS "inStock",
                count(*) FILTER (WHERE p.status = 'active' AND jsonb_array_length(p.colors) > 0)::int AS "withPhotos",
                count(*) FILTER (WHERE p.status = 'active' AND p."categoryId" IS NOT NULL)::int AS "inCollection"
           FROM products p LEFT JOIN stock s ON s."productId" = p.id`,
        ),
        this.db.query(
          `SELECT c.id, c.name, c.slug, count(p.id)::int AS pieces
           FROM categories c LEFT JOIN products p ON p."categoryId" = c.id AND p.status = 'active'
          WHERE c."isActive" GROUP BY c.id ORDER BY c."sortOrder", c.name`,
        ),
        this.db.query(
          `SELECT "categoryId", image FROM (
           SELECT "categoryId", colors->0->>'image' AS image,
                  row_number() OVER (PARTITION BY "categoryId" ORDER BY "isNewArrival" DESC, "sortOrder") AS rn
             FROM products WHERE status = 'active' AND jsonb_array_length(colors) > 0
         ) t WHERE rn <= 4 ORDER BY "categoryId", rn`,
        ),
      ]);

    const counts: Record<string, number> = {};
    for (const r of byStatus as { status: string; n: number }[])
      counts[r.status] = r.n;

    // One entry per day for the last DAYS days, zeros included, so the chart is honest.
    const found = new Map(
      (daily as { day: string; orders: number; revenue: string }[]).map((r) => [
        r.day,
        r,
      ]),
    );
    const series: { day: string; orders: number; revenueMinor: number }[] = [];
    for (let i = DAYS - 1; i >= 0; i--) {
      const day = dayKey(new Date(Date.now() - i * 86_400_000));
      const hit = found.get(day);
      series.push({
        day,
        orders: hit?.orders ?? 0,
        revenueMinor: Number(hit?.revenue ?? 0),
      });
    }

    const images = new Map<string, string[]>();
    for (const t of thumbs as { categoryId: string; image: string }[]) {
      images.set(t.categoryId, [...(images.get(t.categoryId) ?? []), t.image]);
    }

    return {
      orders: {
        pendingPayment: counts.pending_payment ?? 0,
        toPack: (counts.confirmed ?? 0) + (counts.processing ?? 0),
        shipped: counts.shipped ?? 0,
        delivered: counts.delivered ?? 0,
        cancelled: counts.cancelled ?? 0,
        total: Object.values(counts).reduce((a, b) => a + b, 0),
        oldestToPackAt: (oldest as { at: Date | null }[])[0]?.at ?? null,
        byStatus: counts,
      },
      series,
      catalogue: (catalogue as Record<string, number>[])[0],
      categories: (
        categories as {
          id: string;
          name: string;
          slug: string;
          pieces: number;
        }[]
      ).map((c) => ({
        ...c,
        images: images.get(c.id) ?? [],
      })),
    };
  }
}
