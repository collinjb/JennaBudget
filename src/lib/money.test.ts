import { describe, expect, it } from 'vitest';
import {
  MAX_MONEY_CENTS,
  MAX_RATE_BPS,
  MONEY_ERRORS,
  RATE_ERRORS,
  apportionDollars,
  ceilDiv,
  ceilDollars,
  ceilToStep,
  centsToInput,
  floorDollars,
  formatMoney,
  formatRate,
  parseMoney,
  parseRate,
  rateToInput,
  roundDiv,
} from './money';

function ok(input: string, opts?: Parameters<typeof parseMoney>[1]): number {
  const r = parseMoney(input, opts);
  if (!r.ok) throw new Error(`expected "${input}" to parse, got error: ${r.error}`);
  return r.cents;
}

function err(input: string, opts?: Parameters<typeof parseMoney>[1]): string {
  const r = parseMoney(input, opts);
  if (r.ok) throw new Error(`expected "${input}" to fail, got ${r.cents}`);
  return r.error;
}

describe('parseMoney', () => {
  it.each([
    ['$1,234.56', 123456],
    ['1234.5', 123450],
    ['1234', 123400],
    [' 12 ', 1200],
    ['.5', 50],
    ['.05', 5],
    ['0.01', 1],
    ['1,000', 100000],
    ['1,000.50', 100050],
    ['1,234,567.89', 123_456_789],
    ['$ 25', 2500],
    ['25.', 2500],
    ['0', 0],
    ['0.00', 0],
    ['007', 700],
    ['$9,999,999.99', 999_999_999],
    ['  $1,450  ', 145000],
    ['\t42\n', 4200],
  ])('accepts %j => %i cents', (input, cents) => {
    expect(ok(input)).toBe(cents);
  });

  it('parses without floating point error', () => {
    // 0.29 * 100 = 28.999999999999996 in floating point; string parsing must give exactly 29.
    expect(ok('0.29')).toBe(29);
    expect(ok('1.15')).toBe(115);
    expect(ok('4.35')).toBe(435);
    expect(ok('1234567.89')).toBe(123456789);
    for (let c = 0; c < 10_000; c += 7) {
      const s = `${Math.floor(c / 100)}.${String(c % 100).padStart(2, '0')}`;
      expect(ok(s)).toBe(c);
    }
  });

  it.each([
    ['', MONEY_ERRORS.empty],
    ['   ', MONEY_ERRORS.empty],
    ['$', MONEY_ERRORS.empty],
    ['-5', MONEY_ERRORS.negative],
    ['-$5.00', MONEY_ERRORS.negative],
    ['$-5', MONEY_ERRORS.negative],
    ['abc', MONEY_ERRORS.format],
    ['12abc', MONEY_ERRORS.format],
    ['1e5', MONEY_ERRORS.format],
    ['1.2.3', MONEY_ERRORS.format],
    ['.', MONEY_ERRORS.format],
    ['+5', MONEY_ERRORS.format],
    ['5-', MONEY_ERRORS.format],
    ['12.345', MONEY_ERRORS.decimals],
    ['0.001', MONEY_ERRORS.decimals],
    ['$10,000,000', MONEY_ERRORS.tooBig],
    ['10000000.00', MONEY_ERRORS.tooBig],
    ['99999999999999999999', MONEY_ERRORS.tooBig],
    // A comma is only a thousands separator; as a decimal mark it would make the amount 100x too big.
    ['12,50', MONEY_ERRORS.comma],
    ['12,34', MONEY_ERRORS.comma],
    ['1,23', MONEY_ERRORS.comma],
    ['1,2,3', MONEY_ERRORS.comma],
    ['1,0000', MONEY_ERRORS.comma],
    [',5', MONEY_ERRORS.comma],
    ['1 234', MONEY_ERRORS.format],
    ['12\n34', MONEY_ERRORS.format],
    ['$$5', MONEY_ERRORS.format],
    ['5$', MONEY_ERRORS.format],
    ['(5)', MONEY_ERRORS.negative],
  ])('rejects %j', (input, error) => {
    expect(err(input)).toBe(error);
  });

  it('MAX boundary: $9,999,999.99 ok, one cent more rejected', () => {
    expect(ok('9999999.99')).toBe(MAX_MONEY_CENTS);
    expect(err('10000000')).toBe(MONEY_ERRORS.tooBig);
    expect(err('$10,000,000.00')).toBe(MONEY_ERRORS.tooBig);
  });

  it('allowZero: false rejects zero amounts', () => {
    expect(err('0', { allowZero: false })).toBe(MONEY_ERRORS.zero);
    expect(err('$0.00', { allowZero: false })).toBe(MONEY_ERRORS.zero);
    expect(ok('0.01', { allowZero: false })).toBe(1);
    expect(ok('0')).toBe(0);
  });

  it('custom max gives a specific message', () => {
    expect(ok('500', { max: 50_000 })).toBe(50_000);
    expect(err('500.01', { max: 50_000 })).toBe('Please enter $500 or less');
  });

  it('errors are short friendly sentences', () => {
    for (const e of Object.values(MONEY_ERRORS)) {
      expect(e.length).toBeLessThan(60);
      expect(e).toMatch(/^[A-Z]/);
    }
  });
});

describe('formatMoney', () => {
  it('auto (default) shows cents only when non-zero', () => {
    expect(formatMoney(123400)).toBe('$1,234');
    expect(formatMoney(123456)).toBe('$1,234.56');
    expect(formatMoney(123450)).toBe('$1,234.50');
    expect(formatMoney(5)).toBe('$0.05');
    expect(formatMoney(0)).toBe('$0');
    expect(formatMoney(999_999_999)).toBe('$9,999,999.99');
    expect(formatMoney(100_000_000_000)).toBe('$1,000,000,000');
  });

  it('always shows two decimals', () => {
    expect(formatMoney(123400, { showCents: 'always' })).toBe('$1,234.00');
    expect(formatMoney(1, { showCents: 'always' })).toBe('$0.01');
    expect(formatMoney(0, { showCents: 'always' })).toBe('$0.00');
  });

  it('never rounds half-up to whole dollars', () => {
    expect(formatMoney(123450, { showCents: 'never' })).toBe('$1,235');
    expect(formatMoney(123449, { showCents: 'never' })).toBe('$1,234');
    expect(formatMoney(50, { showCents: 'never' })).toBe('$1');
    expect(formatMoney(49, { showCents: 'never' })).toBe('$0');
    expect(formatMoney(0, { showCents: 'never' })).toBe('$0');
  });

  it('negatives format as -$12.50 (and never "-$0")', () => {
    expect(formatMoney(-1250)).toBe('-$12.50');
    expect(formatMoney(-1200)).toBe('-$12');
    expect(formatMoney(-12000, { showCents: 'always' })).toBe('-$120.00');
    expect(formatMoney(-12050, { showCents: 'never' })).toBe('-$121');
    expect(formatMoney(-40, { showCents: 'never' })).toBe('$0');
    expect(formatMoney(-5)).toBe('-$0.05');
  });

  it('round-trips with parseMoney', () => {
    for (const c of [0, 1, 99, 100, 101, 123456, 999_999_999]) {
      expect(ok(formatMoney(c))).toBe(c);
      expect(ok(formatMoney(c, { showCents: 'always' }))).toBe(c);
    }
  });
});

describe('centsToInput', () => {
  it('pre-fills edit fields', () => {
    expect(centsToInput(123456)).toBe('1234.56');
    expect(centsToInput(120000)).toBe('1200');
    expect(centsToInput(0)).toBe('');
    expect(centsToInput(5)).toBe('0.05');
    expect(centsToInput(50)).toBe('0.50');
    expect(centsToInput(123450)).toBe('1234.50');
  });
  it('round-trips with parseMoney', () => {
    for (const c of [1, 50, 99, 100, 123456, 999_999_999]) expect(ok(centsToInput(c))).toBe(c);
  });
});

describe('roundDiv / ceilDiv', () => {
  it('rounds half away from zero', () => {
    expect(roundDiv(5, 2)).toBe(3);
    expect(roundDiv(4, 2)).toBe(2);
    expect(roundDiv(7, 2)).toBe(4);
    expect(roundDiv(1, 3)).toBe(0);
    expect(roundDiv(2, 3)).toBe(1);
    expect(roundDiv(-5, 2)).toBe(-3);
    expect(roundDiv(-7, 2)).toBe(-4);
    expect(roundDiv(-4, 3)).toBe(-1);
    expect(roundDiv(-5, 3)).toBe(-2);
    expect(Object.is(roundDiv(-1, 3), 0)).toBe(true);
    expect(roundDiv(0, 7)).toBe(0);
    expect(roundDiv(3_770_000, 12)).toBe(314_167);
    expect(roundDiv(150, 100)).toBe(2);
    expect(roundDiv(149, 100)).toBe(1);
  });
  it('matches Math.round for positives over many values', () => {
    for (let a = 0; a < 3000; a++) {
      for (const b of [2, 3, 7, 12, 100]) {
        expect(roundDiv(a, b)).toBe(Math.floor(a / b + 0.5 + 1e-12));
      }
    }
  });
  it('ceilDiv', () => {
    expect(ceilDiv(10, 5)).toBe(2);
    expect(ceilDiv(11, 5)).toBe(3);
    expect(ceilDiv(0, 5)).toBe(0);
    expect(ceilDiv(1, 1000)).toBe(1);
    expect(ceilDiv(110_000, 8)).toBe(13_750);
  });
});

describe('dollar rounding helpers', () => {
  it('floorDollars / ceilDollars / ceilToStep', () => {
    expect(floorDollars(12_399)).toBe(12_300);
    expect(floorDollars(12_300)).toBe(12_300);
    expect(floorDollars(99)).toBe(0);
    expect(ceilDollars(12_301)).toBe(12_400);
    expect(ceilDollars(12_300)).toBe(12_300);
    expect(ceilDollars(0)).toBe(0);
    expect(ceilToStep(160_049, 10_000)).toBe(170_000);
    expect(ceilToStep(170_000, 10_000)).toBe(170_000);
  });
});

describe('apportionDollars', () => {
  const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

  it('rounds to whole dollars and keeps the total exact', () => {
    // 100.40 + 100.40 + 100.20 = 301.00
    const r = apportionDollars([10040, 10040, 10020]);
    expect(r).toEqual([10100, 10000, 10000]);
    expect(sum(r)).toBe(30100);
    expect(r.every((x) => x % 100 === 0)).toBe(true);
  });

  it('gives the extra dollar to the largest remainder (ties to the earlier item)', () => {
    expect(apportionDollars([10060, 10040, 10000])).toEqual([10100, 10000, 10000]);
    expect(apportionDollars([10050, 10050])).toEqual([10100, 10000]);
    expect(apportionDollars([33333, 33333, 33334])).toEqual([33300, 33300, 33400]);
    expect(apportionDollars([0, 0, 0])).toEqual([0, 0, 0]);
    expect(apportionDollars([])).toEqual([]);
    expect(apportionDollars([12345])).toEqual([12300]);
    expect(apportionDollars([12350])).toEqual([12400]);
  });

  it('property: sum(result) === roundHalfUp(sum(parts)/100)*100, each part moves < $1', () => {
    let seed = 12345;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let t = 0; t < 2000; t++) {
      const n = 1 + Math.floor(rand() * 7);
      const parts = Array.from({ length: n }, () => Math.floor(rand() * (rand() < 0.3 ? 300 : 500_000)));
      const r = apportionDollars(parts);
      expect(r).toHaveLength(n);
      expect(sum(r)).toBe(roundDiv(sum(parts), 100) * 100);
      r.forEach((x, i) => {
        expect(x % 100).toBe(0);
        expect(Math.abs(x - parts[i])).toBeLessThan(100);
      });
    }
  });
});

describe('parseRate / formatRate / rateToInput', () => {
  it.each([
    ['6.8', 680],
    ['6.8%', 680],
    ['6.80 %', 680],
    ['24.99', 2499],
    ['0', 0],
    ['100', 10_000],
    ['100.00', 10_000],
    ['.5', 50],
    [' 7 ', 700],
  ])('accepts %j => %i bps', (input, bps) => {
    expect(parseRate(input)).toEqual({ ok: true, bps });
  });

  it.each([
    ['101', RATE_ERRORS.tooBig],
    ['100.01', RATE_ERRORS.tooBig],
    ['-1', RATE_ERRORS.negative],
    ['6.888', RATE_ERRORS.decimals],
    ['', RATE_ERRORS.empty],
    ['%', RATE_ERRORS.empty],
    ['abc', RATE_ERRORS.format],
    ['6..8', RATE_ERRORS.format],
    ['99999999', RATE_ERRORS.tooBig],
  ])('rejects %j', (input, error) => {
    expect(parseRate(input)).toEqual({ ok: false, error });
  });

  it('formats', () => {
    expect(formatRate(680)).toBe('6.8%');
    expect(formatRate(2499)).toBe('24.99%');
    expect(formatRate(0)).toBe('0%');
    expect(formatRate(700)).toBe('7%');
    expect(formatRate(1050)).toBe('10.5%');
    expect(formatRate(5)).toBe('0.05%');
    expect(formatRate(MAX_RATE_BPS)).toBe('100%');
    expect(rateToInput(680)).toBe('6.8');
    expect(rateToInput(2499)).toBe('24.99');
    expect(rateToInput(0)).toBe('0');
  });

  it('round-trips every rate', () => {
    for (let bps = 0; bps <= MAX_RATE_BPS; bps++) {
      expect(parseRate(rateToInput(bps))).toEqual({ ok: true, bps });
      expect(parseRate(formatRate(bps))).toEqual({ ok: true, bps });
    }
  });
});
