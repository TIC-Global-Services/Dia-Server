/** GST on jewellery (gold, silver, platinum, diamond), applied on the whole subtotal. */
export const GST_MULTIPLIER = 1.03;

export const METALS = ['gold', 'silver', 'platinum'] as const;
export type Metal = (typeof METALS)[number];

/** Settings key holding each metal's rate per gram. */
export const METAL_RATE_KEY: Record<Metal, string> = {
  gold: 'GOLD_RATE_PER_GRAM',
  silver: 'SILVER_RATE_PER_GRAM',
  platinum: 'PLATINUM_RATE_PER_GRAM',
};

export interface PriceInput {
  /** W: net metal weight in grams. */
  netMetalWeight: number;
  /** R: rate per gram of that metal. */
  metalRate: number;
  /** P: making charge, percent of the metal value. */
  makingChargePercent: number;
  /** Other stones, flat. */
  stoneCharges: number;
  diamondCarats: number;
  diamondRatePerCarat: number;
}

export interface PriceBreakdown {
  metalValue: number;
  makingCharge: number;
  diamondValue: number;
  stoneCharges: number;
  subtotal: number;
  gst: number;
  total: number;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 *   G = W x R                  metal value
 *   M = G x P / 100            making charge
 *   D = carats x rate/carat    diamond value
 *   S = D + other stones
 *   F = (G + M + S) x 1.03
 */
export function jewelleryPrice(i: PriceInput): PriceBreakdown {
  const metalValue = round2(i.netMetalWeight * i.metalRate);
  const makingCharge = round2((metalValue * i.makingChargePercent) / 100);
  const diamondValue = round2(i.diamondCarats * i.diamondRatePerCarat);
  const subtotal = round2(metalValue + makingCharge + diamondValue + i.stoneCharges);
  const total = round2(subtotal * GST_MULTIPLIER);
  return { metalValue, makingCharge, diamondValue, stoneCharges: i.stoneCharges, subtotal, gst: round2(total - subtotal), total };
}
