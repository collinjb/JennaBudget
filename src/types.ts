// Shared data contracts for the whole app. Every agent builds against these.
// Money is ALWAYS integer cents. Dates are ALWAYS local 'YYYY-MM-DD' strings.

/** Integer number of US cents. Never a fractional value. */
export type Cents = number;
/** Local calendar date, 'YYYY-MM-DD'. Never parse with `new Date(str)`. */
export type ISODate = string;
/** Calendar month, 'YYYY-MM'. */
export type MonthKey = string;

export type IncomeFrequency = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly';
export type BillFrequency = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly';

export interface Income {
  id: string;
  name: string;
  /** Take-home amount of ONE paycheck. */
  amount: Cents;
  frequency: IncomeFrequency;
  /**
   * Any real payday (past or upcoming). Anchor for weekly/biweekly (every 7/14 days from it)
   * and monthly (same day-of-month each month, clamped to month end). Ignored for semimonthly.
   */
  payDate: ISODate;
  /** Only for 'semimonthly': two days of the month, ascending. 31 means "last day of the month". */
  semimonthlyDays: [number, number];
}

export interface Bill {
  id: string;
  name: string;
  emoji: string;
  /** Amount of ONE occurrence. */
  amount: Cents;
  frequency: BillFrequency;
  /**
   * 1..31. Day of month the bill is due for monthly/quarterly/yearly
   * (29/30/31 fall on the last day of shorter months). Ignored for weekly/biweekly.
   */
  dueDay: number;
  /**
   * Any real due date (past or upcoming). Anchor for weekly/biweekly (every 7/14 days),
   * and supplies the MONTH for quarterly (every 3 months from it) and yearly (same month each year).
   * For monthly bills only its existence matters (dueDay rules).
   */
  dueDate: ISODate;
  /** 'YYYY-MM' of the month the user ticked "paid", or null. Paid-this-month = paidMonth === current month. */
  paidMonth: MonthKey | null;
}

export type DebtType = 'student' | 'credit' | 'car' | 'personal' | 'medical' | 'other';

export interface Debt {
  id: string;
  name: string;
  type: DebtType;
  balance: Cents;
  /** Interest rate (APR) in basis points: 6.8% => 680, 24.99% => 2499. Integer. */
  rateBps: number;
  /** Minimum monthly payment. */
  minPayment: Cents;
  /** 1..31 day of month the payment is due (31 = last day in shorter months). */
  dueDay: number;
  /**
   * Payments logged ("chipped away") during `month`; each one also lowered the balance. Only the latest month is
   * kept. Lets the debt show "$120 of $250 paid this month" against a goal that stays put all month.
   */
  monthPaid: { month: MonthKey; amount: Cents } | null;
}

/** A monthly spending bucket, e.g. Groceries (need) or Fun Money (fun). */
export interface SpendingCategory {
  id: string;
  name: string;
  emoji: string;
  monthly: Cents;
  /** 'need' = must-have (Smart Plan never changes it). 'fun' = nice-to-have (Smart Plan may adjust it). */
  kind: 'need' | 'fun';
}

export interface Goal {
  id: string;
  name: string;
  emoji: string;
  target: Cents;
  saved: Cents;
  /**
   * Planned monthly contribution for a goal WITHOUT a target date. A goal with a target date sets its own amount
   * (see projectGoal): this value is ignored then, and comes back if the date is removed.
   */
  monthly: Cents;
  /** Optional deadline. With one, the monthly amount is automatic and catches up after a short month. */
  targetDate: ISODate | null;
  /** True for the safety-net / emergency fund. At most one goal should have this. */
  isEmergencyFund: boolean;
  /**
   * Money put in (or taken out, negative) with "Add money" during `month`. Only the latest month is kept; it tells a
   * dated goal how much of this month's amount is already saved.
   */
  monthDeposit: { month: MonthKey; amount: Cents } | null;
}

export type AccountType = 'savings' | 'checking' | 'roth' | 'retirement' | 'investment' | 'other';

/** Money you have: a bank account, Roth IRA, retirement (e.g. SERS) or investment account. Counts toward net worth. */
export interface Account {
  id: string;
  name: string;
  type: AccountType;
  balance: Cents;
  /** When the balance was last updated. */
  updatedAt: ISODate;
}

/** One credit score check (300–850). */
export interface CreditScore {
  id: string;
  score: number;
  date: ISODate;
}

export type PayoffMethod = 'avalanche' | 'snowball';
export type ThemeSetting = 'system' | 'light' | 'dark';

export interface Settings {
  payoffMethod: PayoffMethod;
  /** Planned EXTRA monthly debt payment on top of all minimums (part of the budget). */
  extraDebtPayment: Cents;
  theme: ThemeSetting;
  /** Legacy: the old welcome/setup screens are gone; kept so older saved data and backups still load. */
  onboarded: boolean;
  /** True while the example budget is loaded. */
  isExample: boolean;
  /** Date of the last backup export, or null. */
  lastBackupAt: ISODate | null;
}

export const SCHEMA_VERSION = 1 as const;

export interface BudgetData {
  schemaVersion: typeof SCHEMA_VERSION;
  incomes: Income[];
  bills: Bill[];
  debts: Debt[];
  spending: SpendingCategory[];
  goals: Goal[];
  /** Money you have (savings, checking, Roth IRA, retirement…), for net worth. */
  accounts: Account[];
  /** Credit score checks, any order (sorted by date when shown). */
  creditScores: CreditScore[];
  settings: Settings;
}

/** The list-shaped collections in BudgetData. */
export type CollectionName = 'incomes' | 'bills' | 'debts' | 'spending' | 'goals' | 'accounts' | 'creditScores';
export type CollectionItem<K extends CollectionName> = BudgetData[K][number];

export const DEFAULT_SETTINGS: Settings = {
  payoffMethod: 'avalanche',
  extraDebtPayment: 0,
  theme: 'system',
  onboarded: false,
  isExample: false,
  lastBackupAt: null,
};

export function emptyBudget(): BudgetData {
  return {
    schemaVersion: SCHEMA_VERSION,
    incomes: [],
    bills: [],
    debts: [],
    spending: [],
    goals: [],
    accounts: [],
    creditScores: [],
    settings: { ...DEFAULT_SETTINGS },
  };
}
