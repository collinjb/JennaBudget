import { formatDate, isoParts } from '../lib/dates';
import { formatMoney } from '../lib/money';
import { creditBand, MAX_CREDIT_SCORE, MIN_CREDIT_SCORE, type CreditBand, type ScoreSummary } from '../lib/networth';
import type { Cents, ISODate } from '../types';

/**
 * "$3,530" or "−$3,530": a negative net worth gets a real minus sign (spoken as "minus"), so it never relies on
 * its red color alone.
 */
export function signedMoney(cents: Cents, showCents: 'auto' | 'never' = 'auto'): string {
  const s = formatMoney(Math.abs(cents), { showCents });
  // A word joiner keeps the sign on the same line as the amount.
  return cents < 0 && s !== '$0' ? `−⁠${s}` : s;
}

/** "Oct 1", with the year only when it isn't this year: "Dec 3, 2025". */
export function shortDate(d: ISODate, today: ISODate): string {
  const s = formatDate(d, 'short');
  const year = isoParts(d).year;
  return year === isoParts(today).year ? s : `${s}, ${year}`;
}

/** Meaning color behind each band's word (the word carries the meaning; the color only backs it up). */
const BAND_TONE: Record<CreditBand, 'savings' | 'left' | 'warn' | 'over'> = {
  exceptional: 'savings',
  'very-good': 'savings',
  good: 'left',
  fair: 'warn',
  poor: 'over',
};

/** Each band's score range, worked out from creditBand itself so the two can never disagree. */
const BAND_RANGES: Map<CreditBand, [number, number]> = (() => {
  const out = new Map<CreditBand, [number, number]>();
  for (let s = MIN_CREDIT_SCORE; s <= MAX_CREDIT_SCORE; s++) {
    const { band } = creditBand(s);
    const r = out.get(band);
    if (r) r[1] = s;
    else out.set(band, [s, s]);
  }
  return out;
})();

/** "Good is 670 to 739." */
export function bandRangeText(score: number): string {
  const { band, label } = creditBand(score);
  const r = BAND_RANGES.get(band);
  return r ? `${label} is ${r[0]} to ${r[1]}.` : '';
}

/** "very good (740 to 799)", for the middle of a sentence. */
export function bandOf(score: number): string {
  const { band, label } = creditBand(score);
  const r = BAND_RANGES.get(band);
  const word = label.toLowerCase();
  return r ? `${word} (${r[0]} to ${r[1]})` : word;
}

/** The band's name ("Good") in a small colored pill. */
export function BandBadge({ score, small, testId }: { score: number; small?: boolean; testId?: string }) {
  const { band, label } = creditBand(score);
  return (
    <span className={`band band--${BAND_TONE[band]}${small ? ' band--sm' : ''}`} data-testid={testId}>
      {label}
    </span>
  );
}

/** "▲ 10 points since Aug 3" / "▼ 5 points since Aug 3" / "Same as on Aug 3". Nothing with only one score. */
export function ScoreChange({
  summary,
  today,
  testId,
  className,
}: {
  summary: ScoreSummary;
  today: ISODate;
  testId?: string;
  className?: string;
}) {
  const { change, previous } = summary;
  if (change === null || !previous) return null;
  const since = shortDate(previous.date, today);
  const cls = ['score-change', className].filter(Boolean).join(' ');
  if (change === 0) {
    return (
      <p className={`${cls} score-change--same`} data-testid={testId}>
        Same as on {since}
      </p>
    );
  }
  const up = change > 0;
  const n = Math.abs(change);
  return (
    <p className={`${cls} ${up ? 'score-change--up' : 'score-change--down'}`} data-testid={testId}>
      <span aria-hidden="true">{up ? '▲' : '▼'} </span>
      <span className="sr-only">{up ? 'Up ' : 'Down '}</span>
      {n} {n === 1 ? 'point' : 'points'} since {since}
    </p>
  );
}
