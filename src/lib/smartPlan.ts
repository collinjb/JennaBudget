import type { BudgetData, Cents, Goal, ISODate, MonthKey, SpendingCategory } from '../types';

export type PlanLineKind = 'spending' | 'goal' | 'extraDebt' | 'newGoal' | 'newSpending';

export interface PlanLine {
  kind: PlanLineKind;
  /** Existing item id; null for extraDebt and new items. */
  id: string | null;
  name: string;
  emoji: string;
  from: Cents;
  to: Cents;
  /** One plain-English sentence, no jargon. */
  why: string;
}

export interface PlanLever {
  name: string;
  emoji: string;
  monthly: Cents;
  tip: string;
}

export interface SmartPlan {
  /** false when income can't cover bills + debt minimums + must-have spending. */
  feasible: boolean;
  /** How much is missing per month when infeasible, else 0. */
  shortfall: Cents;
  /** When infeasible: the biggest things to look at (top bills and must-haves by monthly amount, max 4). */
  levers: PlanLever[];
  /** Every adjustable line (fun spending, goals, extra debt, new items) with its suggested amount. */
  lines: PlanLine[];
  /** Lines that change by >= PLAN_CONFIG.MIN_CHANGE, plus any new items. */
  changes: PlanLine[];
  /** Emergency fund the plan wants to create (no existing isEmergencyFund goal), else null. */
  newGoal: Goal | null;
  /** "Fun Money" category the plan wants to create (no existing fun category), else null. */
  newSpending: SpendingCategory | null;
  leftOverBefore: Cents;
  leftOverAfter: Cents;
  impact: {
    debtFreeBefore: MonthKey | null;
    debtFreeAfter: MonthKey | null;
    monthsBefore: number | null;
    monthsAfter: number | null;
    interestBefore: Cents;
    interestAfter: Cents;
    goals: { id: string; name: string; emoji: string; before: MonthKey | null; after: MonthKey | null }[];
  };
  /** True when feasible and changes.length > 0. Drives the Home card wording. */
  hasSuggestions: boolean;
}

/** Deterministic, rule-based. Algorithm specified in docs/SPEC.md (Smart Plan). Must be idempotent. */
export function buildSmartPlan(data: BudgetData, today: ISODate): SmartPlan {
  throw new Error('TODO buildSmartPlan');
}

/** Returns NEW data with plan amounts applied (and new goal/category added). Never mutates input. */
export function applySmartPlan(data: BudgetData, plan: SmartPlan): BudgetData {
  throw new Error('TODO applySmartPlan');
}
