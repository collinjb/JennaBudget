import { describe, expect, it } from 'vitest';
import type { Account, CreditScore } from '../types';
import { creditBand, isStale, netWorth, parseCreditScore, scoreSummary, sortScores } from './networth';
import { debt } from './testUtils';

const acct = (over: Partial<Account> = {}): Account => ({
  id: Math.random().toString(36).slice(2),
  name: 'Savings',
  type: 'savings',
  balance: 100_000,
  updatedAt: '2026-10-08',
  ...over,
});

describe('netWorth', () => {
  it('what you have minus what you owe', () => {
    const nw = netWorth(
      [acct({ balance: 215_000 }), acct({ type: 'roth', balance: 640_000 }), acct({ type: 'retirement', balance: 1_180_000 })],
      [debt({ balance: 240_000 }), debt({ balance: 1_442_000 })],
    );
    expect(nw.assets).toBe(2_035_000);
    expect(nw.owed).toBe(1_682_000);
    expect(nw.netWorth).toBe(353_000);
    expect(nw.byType.map((t) => [t.type, t.total])).toEqual([
      ['savings', 215_000],
      ['roth', 640_000],
      ['retirement', 1_180_000],
    ]);
  });

  it('can be negative, and works with nothing entered', () => {
    expect(netWorth([acct({ balance: 50_000 })], [debt({ balance: 2_000_000 })]).netWorth).toBe(-1_950_000);
    expect(netWorth([], [])).toEqual({ assets: 0, owed: 0, netWorth: 0, byType: [] });
  });

  it('groups several accounts of the same type', () => {
    const nw = netWorth([acct({ balance: 1_000 }), acct({ balance: 2_500 })], []);
    expect(nw.byType).toEqual([{ type: 'savings', total: 3_500, count: 2 }]);
  });
});

describe('credit score', () => {
  it('bands', () => {
    expect([300, 579, 580, 669, 670, 739, 740, 799, 800, 850].map((s) => creditBand(s).label)).toEqual([
      'Poor', 'Poor', 'Fair', 'Fair', 'Good', 'Good', 'Very good', 'Very good', 'Exceptional', 'Exceptional',
    ]);
  });

  it('parsing', () => {
    expect(parseCreditScore(' 712 ')).toEqual({ ok: true, score: 712 });
    expect(parseCreditScore('300')).toEqual({ ok: true, score: 300 });
    expect(parseCreditScore('850')).toEqual({ ok: true, score: 850 });
    for (const bad of ['', 'abc', '712.5', '-700', '299', '851', '7 12']) expect(parseCreditScore(bad).ok).toBe(false);
    expect(parseCreditScore('900')).toEqual({ ok: false, error: 'Credit scores go from 300 to 850' });
  });

  it('latest, previous and change (by date, not entry order)', () => {
    const scores: CreditScore[] = [
      { id: 'b', score: 702, date: '2026-08-01' },
      { id: 'c', score: 712, date: '2026-10-01' },
      { id: 'a', score: 690, date: '2026-06-01' },
    ];
    expect(sortScores(scores).map((s) => s.id)).toEqual(['a', 'b', 'c']);
    expect(scoreSummary(scores)).toMatchObject({ latest: { score: 712 }, previous: { score: 702 }, change: 10 });
    expect(scoreSummary([scores[0]])).toMatchObject({ latest: { score: 702 }, previous: null, change: null });
    expect(scoreSummary([])).toEqual({ latest: null, previous: null, change: null });
  });

  it('stale balances', () => {
    expect(isStale('2026-08-01', '2026-10-08')).toBe(true);
    expect(isStale('2026-09-30', '2026-10-08')).toBe(false);
  });
});
