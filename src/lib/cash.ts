import type { Account, BudgetData, Cents, ISODate } from '../types';
import { compareISO } from './dates';
import { nextPaydays, paycheckPlanDetailed, type PayDay, type PlanItem } from './schedule';

/** "Right now": what's in checking, what it has to cover before paychecks catch up, and what's safe to use. */
export interface RightNow {
  /** Sum of the checking accounts (from Net worth). */
  checking: Cents;
  accounts: Account[];
  /** When the checking balance was last updated (the oldest one, if there are several), or null with no accounts. */
  updatedAt: ISODate | null;
  /** The next payday, or null with no income. */
  nextPayday: PayDay | null;
  /** Unpaid bills and debt payments due from today until the next payday. */
  dueItems: PlanItem[];
  dueBeforeNext: Cents;
  /** Money the upcoming paychecks can't cover on their own (e.g. a car payment before a small paycheck). */
  keepForLater: Cents;
  /** dueBeforeNext + keepForLater: what checking has to hold. */
  need: Cents;
  /** max(0, checking − need): safe to move to savings or spend today. */
  safeNow: Cents;
  /** max(0, need − checking): how much checking is short. */
  shortNow: Cents;
}

/** The "right now" picture, or null when no checking account has been added. */
export function rightNow(data: BudgetData, today: ISODate): RightNow | null {
  const accounts = data.accounts.filter((a) => a.type === 'checking');
  if (accounts.length === 0) return null;
  const checking = accounts.reduce((s, a) => s + Math.max(0, a.balance), 0);
  const updatedAt = accounts.map((a) => a.updatedAt).sort(compareISO)[0] ?? null;
  const plan = paycheckPlanDetailed(data, today, 4);
  const dueItems = plan.beforeNextPayday;
  const dueBeforeNext = dueItems.reduce((s, it) => s + it.amount, 0);
  const keepForLater = Math.max(0, plan.needFromNow - dueBeforeNext);
  const need = dueBeforeNext + keepForLater;
  return {
    checking,
    accounts,
    updatedAt,
    nextPayday: nextPaydays(data.incomes, today, 1)[0] ?? null,
    dueItems,
    dueBeforeNext,
    keepForLater,
    need,
    safeNow: Math.max(0, checking - need),
    shortNow: Math.max(0, need - checking),
  };
}
