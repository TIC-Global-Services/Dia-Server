/** Money is handled in integer minor units (paise/cents) to avoid float drift. */
export const toMinor = (amount: number): number => Math.round(amount * 100);
export const fromMinor = (minor: number): number => minor / 100;
