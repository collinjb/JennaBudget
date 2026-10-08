import type { Cents } from '../types';

/** Largest amount the app accepts: $9,999,999.99 */
export const MAX_MONEY_CENTS: Cents = 999_999_999;
/** Largest interest rate accepted: 100% (10,000 bps). */
export const MAX_RATE_BPS = 10_000;

export type MoneyParseResult = { ok: true; cents: Cents } | { ok: false; error: string };
export type RateParseResult = { ok: true; bps: number } | { ok: false; error: string };

/** User-facing parse errors (exported so UI/tests can compare). */
export const MONEY_ERRORS = {
  empty: 'Please enter an amount',
  format: 'Please enter an amount like 25 or 25.50',
  negative: "Amount can't be negative",
  decimals: 'Please use at most 2 decimal places, like 25.50',
  tooBig: "That's more than this app can handle",
  zero: "Amount can't be zero",
  comma: 'Use a period for cents, like 12.50',
} as const;

export const RATE_ERRORS = {
  empty: 'Please enter the interest rate, like 6.8',
  format: 'Please enter a rate like 6.8 or 24.99',
  negative: "Interest rate can't be negative",
  decimals: 'Please use at most 2 decimal places, like 24.99',
  tooBig: "Interest rate can't be more than 100%",
} as const;

/** Matches "123", "123.", "123.4", ".5" — at least one digit somewhere, at most one dot. */
const DECIMAL_RE = /^(\d*)(?:\.(\d*))?$/;

/**
 * Split an already-cleaned decimal string into exact integer parts, without floating point.
 * Returns null when it isn't a plain non-negative decimal.
 */
function splitDecimal(s: string): { whole: string; frac: string } | null {
  const m = DECIMAL_RE.exec(s);
  if (!m) return null;
  const whole = m[1] ?? '';
  const frac = m[2] ?? '';
  if (whole === '' && frac === '') return null;
  return { whole: whole.replace(/^0+(?=\d)/, ''), frac };
}

/** Commas are only accepted as thousands separators: "1,234" or "12,345,678.90". */
const THOUSANDS_RE = /^\d{1,3}(?:,\d{3})+(?:\.\d*)?$/;
const MINUS_RE = /^[-−]/;

/**
 * Parse user-typed money. Accepts "$1,234.56", "1234.5", "1234", " 12 ", ".5", "$ 12".
 * One leading "$" and surrounding spaces are fine; commas only as thousands separators (so "12,50" — a comma used
 * for cents — is an error, never $1,250). Rejects negatives, letters, inner spaces, >2 decimals, empty,
 * > MAX_MONEY_CENTS. Errors are short plain-English sentences, e.g. "Please enter an amount like 25 or 25.50".
 * opts.allowZero defaults to true. opts.max defaults to MAX_MONEY_CENTS.
 */
export function parseMoney(input: string, opts?: { allowZero?: boolean; max?: Cents }): MoneyParseResult {
  const allowZero = opts?.allowZero ?? true;
  const max = opts?.max ?? MAX_MONEY_CENTS;
  let s = String(input ?? '').trim();
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1).trim();
  }
  if (MINUS_RE.test(s)) {
    negative = true;
    s = s.slice(1).trim();
  }
  if (s.startsWith('$')) s = s.slice(1).trim();
  if (MINUS_RE.test(s)) {
    negative = true;
    s = s.slice(1).trim();
  }
  if (s === '') return { ok: false, error: negative ? MONEY_ERRORS.format : MONEY_ERRORS.empty };
  if (/[\s$]/.test(s)) return { ok: false, error: MONEY_ERRORS.format };
  if (s.includes(',')) {
    if (!THOUSANDS_RE.test(s)) {
      // Most likely a comma used for cents ("12,50"); only call it that if it's otherwise a number.
      return { ok: false, error: /^[\d,.]+$/.test(s) ? MONEY_ERRORS.comma : MONEY_ERRORS.format };
    }
    s = s.replace(/,/g, '');
  }
  const parts = splitDecimal(s);
  if (!parts) return { ok: false, error: MONEY_ERRORS.format };
  if (negative) return { ok: false, error: MONEY_ERRORS.negative };
  if (parts.frac.length > 2) return { ok: false, error: MONEY_ERRORS.decimals };
  // Anything with more than 13 whole-dollar digits is far beyond any sane max; avoid precision issues.
  if (parts.whole.length > 13) return { ok: false, error: tooBigError(max) };
  const dollars = parts.whole === '' ? 0 : Number(parts.whole);
  const centsPart = parts.frac === '' ? 0 : Number(parts.frac.padEnd(2, '0'));
  const cents = dollars * 100 + centsPart;
  if (cents > max) return { ok: false, error: tooBigError(max) };
  if (cents === 0 && !allowZero) return { ok: false, error: MONEY_ERRORS.zero };
  return { ok: true, cents };
}

function tooBigError(max: Cents): string {
  if (max === MAX_MONEY_CENTS) return MONEY_ERRORS.tooBig;
  return `Please enter ${formatMoney(max)} or less`;
}

const USD_WHOLE = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/**
 * Format cents as US dollars.
 * showCents 'auto' (default): "$1,234" when cents are .00, otherwise "$1,234.56".
 * 'always': "$1,234.00". 'never': rounds half-up to whole dollars, "$1,235".
 * Negative values format as "-$12.50".
 */
export function formatMoney(cents: Cents, opts?: { showCents?: 'auto' | 'always' | 'never' }): string {
  const mode = opts?.showCents ?? 'auto';
  const value = Math.round(Number.isFinite(cents) ? cents : 0);
  if (mode === 'never') {
    const dollars = roundDiv(value, 100);
    const sign = dollars < 0 ? '-' : '';
    return sign + USD_WHOLE.format(Math.abs(dollars));
  }
  const abs = Math.abs(value);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  const sign = value < 0 ? '-' : '';
  const showFrac = mode === 'always' || frac !== 0;
  // Intl formats the whole-dollar part ("$1,234"); cents are appended exactly (no float rounding).
  return sign + USD_WHOLE.format(whole) + (showFrac ? '.' + String(frac).padStart(2, '0') : '');
}

/** Value for pre-filling an edit field: 123456 -> "1234.56", 120000 -> "1200", 0 -> "". */
export function centsToInput(cents: Cents): string {
  if (!Number.isFinite(cents) || cents === 0) return '';
  const value = Math.round(cents);
  const abs = Math.abs(value);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  const sign = value < 0 ? '-' : '';
  return sign + String(whole) + (frac !== 0 ? '.' + String(frac).padStart(2, '0') : '');
}

/** Integer a/b rounded half away from zero. b must be > 0. */
export function roundDiv(a: number, b: number): number {
  const abs = Math.abs(a);
  const q = Math.floor((2 * abs + b) / (2 * b));
  if (q === 0) return 0; // avoid -0
  return a < 0 ? -q : q;
}

/** Integer a/b rounded UP (ceiling) for a >= 0, b > 0. */
export function ceilDiv(a: number, b: number): number {
  const q = Math.ceil(a / b);
  return q === 0 ? 0 : q; // avoid -0
}

/** Round DOWN to whole dollars (a multiple of 100 cents). For x >= 0. */
export function floorDollars(x: Cents): Cents {
  const v = Math.floor(x / 100) * 100;
  return v === 0 ? 0 : v;
}

/** Round UP to whole dollars (a multiple of 100 cents). */
export function ceilDollars(x: Cents): Cents {
  const v = Math.ceil(x / 100) * 100;
  return v === 0 ? 0 : v;
}

/** Round UP to a multiple of `step` cents (e.g. 10_000 = $100). */
export function ceilToStep(x: Cents, step: Cents): Cents {
  const v = Math.ceil(x / step) * step;
  return v === 0 ? 0 : v;
}

/**
 * Round a list of cent amounts to whole dollars (results are multiples of 100) using the
 * largest-remainder method, so that sum(result) === round-half-up(sum(parts) / 100) * 100.
 * Used on Home so the big number and the breakdown always add up exactly.
 */
export function apportionDollars(parts: Cents[]): Cents[] {
  const floors = parts.map((p) => Math.floor(p / 100));
  const rems = parts.map((p, i) => p - floors[i] * 100); // 0..99
  const remSum = rems.reduce((s, r) => s + r, 0);
  // Number of parts that get rounded up (half-up on the total of the remainders).
  let extra = Math.floor((remSum + 50) / 100);
  const order = rems
    .map((r, i) => ({ r, i }))
    .sort((x, y) => y.r - x.r || x.i - y.i);
  const result = floors.map((f) => f * 100);
  for (const { i, r } of order) {
    if (extra <= 0 || r <= 0) break;
    result[i] += 100;
    extra--;
  }
  return result.map((v) => (v === 0 ? 0 : v));
}

/** Parse an interest rate like "6.8", "6.8%", "24.99". 0..100, max 2 decimals. Returns basis points. */
export function parseRate(input: string): RateParseResult {
  const cleaned = String(input ?? '')
    .replace(/\s/g, '')
    .replace(/%$/, '');
  if (cleaned === '') return { ok: false, error: RATE_ERRORS.empty };
  if (/^[-−]/.test(cleaned)) {
    if (splitDecimal(cleaned.slice(1))) return { ok: false, error: RATE_ERRORS.negative };
    return { ok: false, error: RATE_ERRORS.format };
  }
  const parts = splitDecimal(cleaned);
  if (!parts) return { ok: false, error: RATE_ERRORS.format };
  if (parts.frac.length > 2) return { ok: false, error: RATE_ERRORS.decimals };
  if (parts.whole.length > 6) return { ok: false, error: RATE_ERRORS.tooBig };
  const whole = parts.whole === '' ? 0 : Number(parts.whole);
  const frac = parts.frac === '' ? 0 : Number(parts.frac.padEnd(2, '0'));
  const bps = whole * 100 + frac;
  if (bps > MAX_RATE_BPS) return { ok: false, error: RATE_ERRORS.tooBig };
  return { ok: true, bps };
}

/** 680 -> "6.8%", 2499 -> "24.99%", 0 -> "0%". */
export function formatRate(bps: number): string {
  return rateToInput(bps) + '%';
}

/** 680 -> "6.8" for pre-filling an edit field. */
export function rateToInput(bps: number): string {
  const value = Math.round(Number.isFinite(bps) ? bps : 0);
  const abs = Math.abs(value);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  const sign = value < 0 ? '-' : '';
  if (frac === 0) return sign + String(whole);
  return sign + String(whole) + '.' + String(frac).padStart(2, '0').replace(/0$/, '');
}
