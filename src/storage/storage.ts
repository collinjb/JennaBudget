import type { BudgetData, ISODate } from '../types';

// Persistence contract. Implemented by the iPhone & PWA agent.
// Storage: localStorage key STORAGE_KEY holds JSON BudgetData. The previous good copy is kept under BACKUP_KEY.

export const STORAGE_KEY = 'budget.data';
export const BACKUP_KEY = 'budget.data.previous';

export type LoadResult =
  | { status: 'ok'; data: BudgetData; migrated: boolean }
  | { status: 'empty' }
  | { status: 'corrupt'; raw: string; error: string };

/** Read + migrate + validate. Never throws (localStorage access itself may throw in private mode). */
export function loadData(): LoadResult {
  throw new Error('TODO loadData');
}

/** Write data (and rotate the previous good copy into BACKUP_KEY). Never throws. */
export function saveData(data: BudgetData): { ok: true } | { ok: false; error: string } {
  throw new Error('TODO saveData');
}

/** Remove all app data from storage. */
export function clearData(): void {
  throw new Error('TODO clearData');
}

/** The previous good copy, if one exists and validates (used by the recovery screen). */
export function loadPreviousData(): BudgetData | null {
  throw new Error('TODO loadPreviousData');
}

/** Bring older/partial shapes up to the current schema. Unknown input passes through for validation. */
export function migrate(raw: unknown): unknown {
  throw new Error('TODO migrate');
}

/**
 * Strictly validate (after migrate): every field present with the right type, money fields are
 * non-negative integers <= MAX_MONEY_CENTS, dates are valid ISO dates, enums are known values,
 * days are 1..31, ids are unique non-empty strings, names are strings (trimmed, max 60 chars).
 * Returns a cleaned copy.
 */
export function validateBudget(raw: unknown): { ok: true; data: BudgetData } | { ok: false; error: string } {
  throw new Error('TODO validateBudget');
}

export interface BackupSummary {
  incomes: number;
  bills: number;
  debts: number;
  spending: number;
  goals: number;
  /** ISO timestamp from the file, or null if absent. */
  exportedAt: string | null;
}

/** Backup file = { app: 'budget', version: 1, exportedAt: ISO timestamp, data: BudgetData }. */
export function makeBackup(data: BudgetData, today: ISODate): { filename: string; json: string } {
  throw new Error('TODO makeBackup');
}

/** Parse + validate a backup file's text. Also accepts a bare BudgetData object. Plain-English errors. */
export function parseBackup(
  text: string,
): { ok: true; data: BudgetData; summary: BackupSummary } | { ok: false; error: string } {
  throw new Error('TODO parseBackup');
}

/** iPhone share sheet with a File when supported, else a download. */
export async function shareOrDownloadBackup(
  data: BudgetData,
  today: ISODate,
): Promise<'shared' | 'downloaded' | 'cancelled'> {
  throw new Error('TODO shareOrDownloadBackup');
}

/** navigator.storage.persist() when available. Never throws. */
export async function requestPersistentStorage(): Promise<boolean> {
  throw new Error('TODO requestPersistentStorage');
}
