import type { Account, AccountType, Cents, CreditScore, Debt, ISODate } from '../types';
import { compareISO, diffDays } from './dates';

export const MIN_CREDIT_SCORE = 300;
export const MAX_CREDIT_SCORE = 850;

/** Plain-English names and icons for account types (pickers, rows, totals). */
export const ACCOUNT_TYPE_INFO: Record<AccountType, { label: string; short: string; emoji: string }> = {
  savings: { label: 'Savings account', short: 'Savings', emoji: '🏦' },
  checking: { label: 'Checking account', short: 'Checking', emoji: '🏧' },
  roth: { label: 'Roth IRA', short: 'Roth IRA', emoji: '🌱' },
  retirement: { label: 'Retirement or pension (like SERS or a 401k)', short: 'Retirement', emoji: '🏛️' },
  investment: { label: 'Investments', short: 'Investments', emoji: '📈' },
  other: { label: 'Something else', short: 'Other', emoji: '💼' },
};

export const ACCOUNT_TYPES: AccountType[] = ['savings', 'checking', 'roth', 'retirement', 'investment', 'other'];

export interface NetWorth {
  /** Sum of account balances (what you have). */
  assets: Cents;
  /** Sum of debt balances (what you owe). */
  owed: Cents;
  /** assets − owed (can be negative). */
  netWorth: Cents;
  /** Account totals per type, in ACCOUNT_TYPES order, types with no accounts left out. */
  byType: { type: AccountType; total: Cents; count: number }[];
}

export function netWorth(accounts: Account[], debts: Debt[]): NetWorth {
  const assets = accounts.reduce((s, a) => s + Math.max(0, a.balance), 0);
  const owed = debts.reduce((s, d) => s + Math.max(0, d.balance), 0);
  const byType = ACCOUNT_TYPES.map((type) => {
    const of = accounts.filter((a) => a.type === type);
    return { type, total: of.reduce((s, a) => s + Math.max(0, a.balance), 0), count: of.length };
  }).filter((t) => t.count > 0);
  return { assets, owed, netWorth: assets - owed, byType };
}

export type CreditBand = 'exceptional' | 'very-good' | 'good' | 'fair' | 'poor';

/** The common FICO-style ranges: 800+ exceptional, 740–799 very good, 670–739 good, 580–669 fair, below 580 poor. */
export function creditBand(score: number): { band: CreditBand; label: string } {
  if (score >= 800) return { band: 'exceptional', label: 'Exceptional' };
  if (score >= 740) return { band: 'very-good', label: 'Very good' };
  if (score >= 670) return { band: 'good', label: 'Good' };
  if (score >= 580) return { band: 'fair', label: 'Fair' };
  return { band: 'poor', label: 'Poor' };
}

/** A whole number from 300 to 850 typed by the person, or a plain-English error. */
export function parseCreditScore(input: string): { ok: true; score: number } | { ok: false; error: string } {
  const s = String(input ?? '').trim();
  if (s === '') return { ok: false, error: 'Please enter your score, like 712' };
  if (!/^\d+$/.test(s)) return { ok: false, error: 'Please enter a whole number, like 712' };
  const score = Number(s);
  if (score < MIN_CREDIT_SCORE || score > MAX_CREDIT_SCORE) {
    return { ok: false, error: `Credit scores go from ${MIN_CREDIT_SCORE} to ${MAX_CREDIT_SCORE}` };
  }
  return { ok: true, score };
}

/** Oldest first (ties keep their order). */
export function sortScores(scores: CreditScore[]): CreditScore[] {
  return scores
    .map((s, i) => ({ s, i }))
    .sort((a, b) => compareISO(a.s.date, b.s.date) || a.i - b.i)
    .map(({ s }) => s);
}

export interface ScoreSummary {
  latest: CreditScore | null;
  previous: CreditScore | null;
  /** latest − previous, or null when there's only one (or none). */
  change: number | null;
}

export function scoreSummary(scores: CreditScore[]): ScoreSummary {
  const sorted = sortScores(scores);
  const latest = sorted.at(-1) ?? null;
  const previous = sorted.length > 1 ? sorted[sorted.length - 2] : null;
  return { latest, previous, change: latest && previous ? latest.score - previous.score : null };
}

/** True when a balance hasn't been updated in more than `days` days (a gentle "time to update" hint). */
export function isStale(updatedAt: ISODate, today: ISODate, days = 45): boolean {
  return diffDays(updatedAt, today) > days;
}
