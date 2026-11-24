import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Starting shipping set-up for a Tamil Nadu house delivering across India.
 * Amounts are in paise. Only runs on an empty shipping set-up, so it never overrides edits.
 */
export class IndiaShipping1794640000000 implements MigrationInterface {
  name = 'IndiaShipping1794640000000';

  public async up(q: QueryRunner): Promise<void> {
    const [{ n }] = (await q.query(`SELECT count(*)::int AS n FROM "shipping_zones"`)) as { n: number }[];
    if (n > 0) return;

    const zones: {
      name: string;
      states: string[];
      priority: number;
      rates: [code: string, name: string, base: number, freeOver: number | null, min: number, max: number][];
    }[] = [
      {
        name: 'Tamil Nadu',
        states: ['Tamil Nadu'],
        priority: 20,
        rates: [
          ['standard', 'Insured delivery', 0, null, 1, 3],
          ['express', 'Express insured delivery', 19900, null, 1, 2],
        ],
      },
      {
        name: 'Rest of India',
        states: [],
        priority: 10,
        rates: [
          ['standard', 'Insured delivery', 0, null, 3, 6],
          ['express', 'Express insured delivery', 39900, null, 2, 3],
        ],
      },
    ];

    for (const z of zones) {
      const [{ id }] = (await q.query(
        `INSERT INTO "shipping_zones" ("name","countries","states","postalPrefixes","priority","isActive")
         VALUES ($1, '["IN"]', $2, '[]', $3, true) RETURNING "id"`,
        [z.name, JSON.stringify(z.states), z.priority],
      )) as { id: string }[];
      for (const [code, name, base, freeOver, min, max] of z.rates) {
        await q.query(
          `INSERT INTO "shipping_rates" ("zoneId","code","name","baseMinor","perKgMinor","freeOverMinor","minDays","maxDays","isActive")
           VALUES ($1,$2,$3,$4,0,$5,$6,$7,true)`,
          [id, code, name, base, freeOver, min, max],
        );
      }
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DELETE FROM "shipping_zones" WHERE "name" IN ('Tamil Nadu','Rest of India')`);
  }
}
