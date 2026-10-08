import type { Cents } from '../types';

/** Largest amount the app accepts: $9,999,999.99 */
export const MAX_MONEY_CENTS: Cents = 999_999_999;
/** Largest interest rate accepted: 100% (10,000 bps). */
export const MAX_RATE_BPS = 10_000;

export type MoneyParseResult = { ok: true; cents: Cents } | { ok: false; error: string };
export type RateParseResult = { ok: true; bps: number } | { ok: false; error: string };

/**
 * Parse user-typed money. Accepts "$1,234.56", "1234.5", "1234", " 12 ", ".5".
 * Strips "$", commas, spaces. Rejects negatives, letters, >2 decimals, empty, > MAX_MONEY_CENTS.
 * Errors are short plain-English sentences, e.g. "Please enter an amount like 25 or 25.50".
 * opts.allowZero defaults to true. opts.max defaults to MAX_MONEY_CENTS.
 */
export function parseMoney(input: string, opts?: { allowZero?: boolean; max?: Cents }): MoneyParseResult {
  throw new Error('TODO parseMoney');
}

/**
 * Format cents as US dollars.
 * showCents 'auto' (default): "$1,234" when cents are .00, otherwise "$1,234.56".
 * 'always': "$1,234.00". 'never': rounds half-up to whole dollars, "$1,235".
 * Negative values format as "-$12.50".
 */
export function formatMoney(cents: Cents, opts?: { showCents?: 'auto' | 'always' | 'never' }): string {
  throw new Error('TODO formatMoney');
}

/** Value for pre-filling an edit field: 123456 -> "1234.56", 120000 -> "1200", 0 -> "". */
export function centsToInput(cents: Cents): string {
  throw new Error('TODO centsToInput');
}

/** Integer a/b rounded half away from zero. b must be > 0. */
export function roundDiv(a: number, b: number): number {
  throw new Error('TODO roundDiv');
}

/** Integer a/b rounded UP (ceiling) for a >= 0, b > 0. */
export function ceilDiv(a: number, b: number): number {
  throw new Error('TODO ceilDiv');
}

/**
 * Round a list of cent amounts to whole dollars (results are multiples of 100) using the
 * largest-remainder method, so that sum(result) === round-half-up(sum(parts) / 100) * 100.
 * Used on Home so the big number and the breakdown always add up exactly.
 */
export function apportionDollars(parts: Cents[]): Cents[] {
  throw new Error('TODO apportionDollars');
}

/** Parse an interest rate like "6.8", "6.8%", "24.99". 0..100, max 2 decimals. Returns basis points. */
export function parseRate(input: string): RateParseResult {
  throw new Error('TODO parseRate');
}

/** 680 -> "6.8%", 2499 -> "24.99%", 0 -> "0%". */
export function formatRate(bps: number): string {
  throw new Error('TODO formatRate');
}

/** 680 -> "6.8" for pre-filling an edit field. */
export function rateToInput(bps: number): string {
  throw new Error('TODO rateToInput');
}
