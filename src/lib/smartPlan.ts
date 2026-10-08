import type { BudgetData, Cents, Debt, Goal, ISODate, MonthKey, PayoffMethod, SpendingCategory } from '../types';
import { compareISO, formatMonth, monthKey } from './dates';
import { payoffOrder, simulatePayoff } from './debt';
import { billMonthly } from './frequency';
import { projectGoal, type GoalProjection } from './goals';
import { newId } from './ids';
import { ceilDollars, ceilToStep, floorDollars, formatMoney, formatRate } from './money';
import { PLAN_CONFIG } from './planConfig';
import { monthlySummary } from './summary';

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

/** Plain-English "why" sentences. Exported so the UI and tests can reuse the exact wording. */
export const PLAN_WHY = {
  newSafetyNet: (target: Cents) =>
    `A ${formatMoney(target)} safety net keeps a surprise, like a car repair, from turning into new debt.`,
  safetyNetBuilding: "Building your safety net first means surprises don't end up on a credit card.",
  safetyNetNoRoom: "There's no money free for your safety net right now. It comes first as soon as there is.",
  safetyNetFull: 'Your safety net is full. Nice work!',
  fun: "Budgets with zero fun don't last. This is guilt-free money to enjoy.",
  funTight: 'Money is tight, so this is smaller, but you still get some fun.',
  funTrimmed: 'This trims fun money a bit so everything else fits. You still get guilt-free money to enjoy.',
  funNone: "There's no room for fun money right now, but it comes back as soon as there is.",
  deadlineFunded: (target: Cents, month: MonthKey) =>
    `This is what it takes to reach ${formatMoney(target)} by ${formatMonth(month)}.`,
  deadlineShort: (target: Cents, month: MonthKey) =>
    `This is all that's left for it, so it won't reach ${formatMoney(target)} by ${formatMonth(month)}. A later date would help.`,
  pastDue: 'The date for this goal has passed. Pick a new date to get an exact amount.',
  openGoal: 'Steady progress toward this goal.',
  openGoalFinishes: 'This is enough to reach this goal next month.',
  openGoalNone: "There's no money left for this goal right now.",
  debtHighAvalanche: (name: string, rateBps: number) =>
    `Your ${name} charges ${formatRate(rateBps)} interest, so every extra dollar there saves you the most money.`,
  debtSnowball: (name: string) => `Paying off your smallest debt (${name}) first gives you a quick win.`,
  debtLowOnly: 'Your debts have low interest rates, so extra money is split between them and your goals.',
  debtMid: 'Your debts have medium interest rates, so extra money is split between them and your goals.',
  debtFocus: (name: string, rateBps: number) =>
    rateBps > 0
      ? `Paying extra on your ${name} (${formatRate(rateBps)} interest) gets you debt-free sooner and saves you money.`
      : `Paying extra on your ${name} gets you debt-free sooner.`,
  debtNone: "There's no extra money for debt right now. Your minimums are covered.",
  leverBill: 'Could you lower, switch, or cancel this?',
  leverNeed: 'Even a small trim here helps.',
} as const;

/** Display name/emoji for the extra-debt line and for items the plan creates. */
export const EXTRA_DEBT_LINE = { name: 'Extra debt payment', emoji: '💪' } as const;
export const NEW_EMERGENCY_FUND = { name: 'Emergency Fund', emoji: '🛟' } as const;
export const NEW_FUN_MONEY = { name: 'Fun Money', emoji: '🎉' } as const;

const C = PLAN_CONFIG;

/** A ratio from planConfig as integer basis points (0.15 -> 1500), so the math stays in integers. */
function ratioBps(ratio: number): number {
  return Math.round(ratio * 10_000);
}

/** floorDollars(x × ratio) computed exactly with integers (x >= 0 cents). */
function shareDollars(x: Cents, ratio: number): Cents {
  if (!(x > 0)) return 0;
  return Math.floor((x * ratioBps(ratio)) / 1_000_000) * 100;
}

/**
 * Split `units` whole units across weights in proportion (largest remainder; ties go to the earlier item).
 * All-zero weights => equal split. Uses BigInt so huge amounts can't lose precision.
 */
export function splitByWeight(units: number, weights: number[]): number[] {
  const n = weights.length;
  if (n === 0) return [];
  const positive = weights.map((x) => (x > 0 ? BigInt(Math.round(x)) : 0n));
  const positiveTotal = positive.reduce((s, x) => s + x, 0n);
  const ws = positiveTotal === 0n ? weights.map(() => 1n) : positive;
  const total = positiveTotal === 0n ? BigInt(n) : positiveTotal;
  const U = BigInt(Math.max(0, Math.floor(units)));
  const base = ws.map((x) => (U * x) / total);
  const rem = ws.map((x, i) => U * x - base[i] * total);
  let left = U - base.reduce((s, x) => s + x, 0n);
  const order = rem
    .map((r, i) => ({ r, i }))
    .sort((a, b) => (a.r === b.r ? a.i - b.i : a.r > b.r ? -1 : 1));
  const out = base.map((x) => Number(x));
  for (const { i } of order) {
    if (left <= 0n) break;
    out[i] += 1;
    left -= 1n;
  }
  return out;
}

/**
 * Equal split of `units` with per-item caps ("water filling"): items whose cap is at or below the fair share
 * get their cap and the rest is re-split among the others. Leftover single units go to the earliest-listed
 * items. Returns what each item gets and what couldn't be placed (because every item hit its cap).
 */
export function splitEquallyWithCaps(units: number, caps: number[]): { gives: number[]; overflow: number } {
  const gives = caps.map(() => 0);
  let pool = Math.max(0, Math.floor(units));
  let open = caps.map((_, i) => i);
  while (open.length > 0 && pool > 0) {
    const n = open.length;
    const capped = open.filter((i) => caps[i] * n <= pool);
    if (capped.length === 0) {
      const base = Math.floor(pool / n);
      const extra = pool - base * n;
      open.forEach((i, k) => {
        gives[i] = base + (k < extra ? 1 : 0);
      });
      pool = 0;
      break;
    }
    for (const i of capped) {
      gives[i] = Math.max(0, caps[i]);
      pool -= gives[i];
    }
    open = open.filter((i) => !capped.includes(i));
  }
  return { gives, overflow: pool };
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, 'en-US', { sensitivity: 'base' }) || (a < b ? -1 : a > b ? 1 : 0);
}

type DebtClass = 'none' | 'all' | 'high' | 'low' | 'other';

/** Deterministic, rule-based. Algorithm specified in docs/SPEC.md (Smart Plan). Must be idempotent. */
export function buildSmartPlan(data: BudgetData, today: ISODate): SmartPlan {
  const S = monthlySummary(data);
  const income = S.income;
  const fixed = S.bills + S.debtMinimums + S.spendingNeeds;
  const startMonth = monthKey(today);
  const method = data.settings.payoffMethod;
  const activeDebts = data.debts.filter((d) => d.balance > 0);
  const before = simulatePayoff(data.debts, { method, extra: S.debtExtra, startMonth });
  const projections = new Map<Goal, GoalProjection>();
  const project = (g: Goal): GoalProjection => {
    let p = projections.get(g);
    if (!p) {
      p = projectGoal(g, today);
      projections.set(g, p);
    }
    return p;
  };

  let R = income - fixed;

  // ----- Not enough for bills, minimums and must-haves: be honest and list the biggest levers. -----
  if (R < 0) {
    const candidates: (PlanLever & { rank: number })[] = [
      ...data.bills.map((b) => ({
        name: b.name,
        emoji: b.emoji,
        monthly: billMonthly(b),
        tip: PLAN_WHY.leverBill,
        rank: 0,
      })),
      ...data.spending
        .filter((s) => s.kind === 'need')
        .map((s) => ({ name: s.name, emoji: s.emoji, monthly: s.monthly, tip: PLAN_WHY.leverNeed, rank: 1 })),
    ];
    const levers = candidates
      .filter((c) => c.monthly > 0)
      .sort((a, b) => b.monthly - a.monthly || a.rank - b.rank || compareText(a.name, b.name))
      .slice(0, 4)
      .map(({ name, emoji, monthly, tip }) => ({ name, emoji, monthly, tip }));
    return {
      feasible: false,
      shortfall: -R,
      levers,
      lines: [],
      changes: [],
      newGoal: null,
      newSpending: null,
      leftOverBefore: S.leftOver,
      leftOverAfter: S.leftOver,
      impact: {
        debtFreeBefore: before.debtFreeMonth,
        debtFreeAfter: before.debtFreeMonth,
        monthsBefore: before.months,
        monthsAfter: before.months,
        interestBefore: before.totalInterest,
        interestAfter: before.totalInterest,
        goals: data.goals
          .filter((g) => project(g).status !== 'reached')
          .map((g) => ({
            id: g.id,
            name: g.name,
            emoji: g.emoji,
            before: project(g).reachMonth,
            after: project(g).reachMonth,
          })),
      },
      hasSuggestions: false,
    };
  }

  const tight = R * 10_000 < income * ratioBps(C.TIGHT_RATIO);
  const lines: PlanLine[] = [];
  /** Goal lines paired with their goal (for the impact section). */
  const goalLines: { line: PlanLine; goal: Goal }[] = [];

  // ----- A) Safety net -----
  const ef = data.goals.find((g) => g.isEmergencyFund) ?? null;
  const efTarget = ef ? ef.target : Math.max(C.STARTER_EMERGENCY_FUND, ceilToStep(fixed, 10_000));
  const efRemaining = Math.max(0, efTarget - (ef ? ef.saved : 0));
  const efMonthly =
    efRemaining > 0 ? Math.min(ceilDollars(efRemaining), shareDollars(R, C.EMERGENCY_FUND_SHARE)) : 0;
  R -= efMonthly;
  let newGoal: Goal | null = null;
  if (ef) {
    const why =
      efRemaining <= 0
        ? PLAN_WHY.safetyNetFull
        : efMonthly > 0
          ? PLAN_WHY.safetyNetBuilding
          : PLAN_WHY.safetyNetNoRoom;
    const line: PlanLine = {
      kind: 'goal',
      id: ef.id,
      name: ef.name,
      emoji: ef.emoji,
      from: ef.monthly,
      to: efMonthly,
      why,
    };
    lines.push(line);
    goalLines.push({ line, goal: ef });
  } else if (efMonthly > 0) {
    // Only suggest creating a safety net when there's money to put in it (an empty budget gets no suggestions).
    newGoal = {
      id: newId(),
      name: NEW_EMERGENCY_FUND.name,
      emoji: NEW_EMERGENCY_FUND.emoji,
      target: efTarget,
      saved: 0,
      monthly: efMonthly,
      targetDate: null,
      isEmergencyFund: true,
    };
    const line: PlanLine = {
      kind: 'newGoal',
      id: null,
      name: newGoal.name,
      emoji: newGoal.emoji,
      from: 0,
      to: efMonthly,
      why: PLAN_WHY.newSafetyNet(efTarget),
    };
    lines.push(line);
    goalLines.push({ line, goal: newGoal });
  }

  // ----- B) Fun money -----
  const funTarget = shareDollars(income, tight ? C.FUN_PCT_TIGHT : C.FUN_PCT_COMFORTABLE);
  const fun = Math.min(funTarget, shareDollars(R, C.FUN_MAX_SHARE));
  R -= fun;
  const funWhy = fun === 0 ? PLAN_WHY.funNone : tight ? PLAN_WHY.funTight : PLAN_WHY.fun;
  const funCats = data.spending.filter((s) => s.kind !== 'need');
  let newSpending: SpendingCategory | null = null;
  if (funCats.length > 0) {
    const split = splitByWeight(
      fun / 100,
      funCats.map((c) => c.monthly),
    );
    funCats.forEach((c, i) => {
      const to = split[i] * 100;
      lines.push({
        kind: 'spending',
        id: c.id,
        name: c.name,
        emoji: c.emoji,
        from: c.monthly,
        to,
        // A cut needs its own explanation; "budgets with zero fun don't last" reads oddly next to a smaller number.
        why: fun > 0 && !tight && to < c.monthly ? PLAN_WHY.funTrimmed : funWhy,
      });
    });
  } else if (fun > 0) {
    newSpending = { id: newId(), name: NEW_FUN_MONEY.name, emoji: NEW_FUN_MONEY.emoji, monthly: fun, kind: 'fun' };
    lines.push({
      kind: 'newSpending',
      id: null,
      name: newSpending.name,
      emoji: newSpending.emoji,
      from: 0,
      to: fun,
      why: funWhy,
    });
  }

  // ----- C) Buffer (simply stays as Left Over) -----
  const buffer = Math.min(C.BUFFER_MAX, shareDollars(R, C.BUFFER_SHARE));
  R -= buffer;

  // ----- D) Goals with a future deadline, nearest deadline first -----
  const others = data.goals.filter((g) => g !== ef && project(g).status !== 'reached');
  const deadlineGoals = others
    .map((g, index) => ({ g, index }))
    .filter(({ g }) => g.targetDate !== null && project(g).status !== 'past-due')
    .sort(
      (a, b) =>
        compareISO(a.g.targetDate ?? '', b.g.targetDate ?? '') || compareText(a.g.name, b.g.name) || a.index - b.index,
    )
    .map(({ g }) => g);
  for (const g of deadlineGoals) {
    const needed = ceilDollars(project(g).neededPerMonth ?? 0);
    const give = Math.min(needed, floorDollars(R));
    R -= give;
    const month = monthKey(g.targetDate ?? today);
    const why = give >= needed ? PLAN_WHY.deadlineFunded(g.target, month) : PLAN_WHY.deadlineShort(g.target, month);
    const line: PlanLine = { kind: 'goal', id: g.id, name: g.name, emoji: g.emoji, from: g.monthly, to: give, why };
    lines.push(line);
    goalLines.push({ line, goal: g });
  }

  // ----- E) Extra debt payments -----
  const openGoals = others.filter((g) => g.targetDate === null || project(g).status === 'past-due');
  let debtClass: DebtClass;
  let debtShare: number;
  if (activeDebts.length === 0) {
    debtClass = 'none';
    debtShare = 0;
  } else if (openGoals.length === 0) {
    debtClass = 'all';
    debtShare = 1;
  } else if (activeDebts.some((d) => d.rateBps >= C.HIGH_INTEREST_BPS)) {
    debtClass = 'high';
    debtShare = C.HIGH_INTEREST_DEBT_SHARE;
  } else if (activeDebts.every((d) => d.rateBps < C.LOW_INTEREST_BPS)) {
    debtClass = 'low';
    debtShare = C.LOW_INTEREST_DEBT_SHARE;
  } else {
    debtClass = 'other';
    debtShare = C.OTHER_DEBT_SHARE;
  }
  let extra = shareDollars(R, debtShare);
  R -= extra;

  // ----- F) Open goals (no deadline, or the deadline passed): equal split, capped at what's left to save -----
  const caps = openGoals.map((g) => ceilDollars(project(g).remaining) / 100);
  const { gives, overflow } = splitEquallyWithCaps(floorDollars(R) / 100, caps);
  openGoals.forEach((g, i) => {
    const give = gives[i] * 100;
    R -= give;
    const p = project(g);
    let why: string;
    if (p.status === 'past-due') why = PLAN_WHY.pastDue;
    else if (give === 0) why = PLAN_WHY.openGoalNone;
    else if (give >= p.remaining) why = PLAN_WHY.openGoalFinishes;
    else why = PLAN_WHY.openGoal;
    const line: PlanLine = { kind: 'goal', id: g.id, name: g.name, emoji: g.emoji, from: g.monthly, to: give, why };
    lines.push(line);
    goalLines.push({ line, goal: g });
  });
  if (overflow > 0 && activeDebts.length > 0) {
    extra += overflow * 100;
    R -= overflow * 100;
  }

  if (activeDebts.length > 0) {
    lines.push({
      kind: 'extraDebt',
      id: null,
      name: EXTRA_DEBT_LINE.name,
      emoji: EXTRA_DEBT_LINE.emoji,
      from: S.debtExtra,
      to: extra,
      why: extraDebtWhy(extra, debtClass, activeDebts, method),
    });
  }

  const allocated = lines.reduce((s, l) => s + l.to, 0);
  const leftOverAfter = income - fixed - allocated;
  const changes = lines.filter(
    (l) => l.kind === 'newGoal' || l.kind === 'newSpending' || Math.abs(l.to - l.from) >= C.MIN_CHANGE,
  );
  const after = activeDebts.length > 0 ? simulatePayoff(data.debts, { method, extra, startMonth }) : before;

  return {
    feasible: true,
    shortfall: 0,
    levers: [],
    lines,
    changes,
    newGoal,
    newSpending,
    leftOverBefore: S.leftOver,
    leftOverAfter,
    impact: {
      debtFreeBefore: before.debtFreeMonth,
      debtFreeAfter: after.debtFreeMonth,
      monthsBefore: before.months,
      monthsAfter: after.months,
      interestBefore: before.totalInterest,
      interestAfter: after.totalInterest,
      goals: goalLines.map(({ line, goal }) => ({
        id: goal.id,
        name: goal.name,
        emoji: goal.emoji,
        before: line.kind === 'newGoal' ? null : projectGoal({ ...goal, monthly: line.from }, today).reachMonth,
        after: projectGoal({ ...goal, monthly: line.to }, today).reachMonth,
      })),
    },
    hasSuggestions: changes.length > 0,
  };
}

function extraDebtWhy(extra: Cents, debtClass: DebtClass, activeDebts: Debt[], method: PayoffMethod): string {
  if (extra <= 0) return PLAN_WHY.debtNone;
  if (debtClass === 'low') return PLAN_WHY.debtLowOnly;
  if (method === 'snowball') return PLAN_WHY.debtSnowball(payoffOrder(activeDebts, 'snowball')[0].name);
  const target = payoffOrder(activeDebts, 'avalanche')[0];
  if (target.rateBps >= C.HIGH_INTEREST_BPS) return PLAN_WHY.debtHighAvalanche(target.name, target.rateBps);
  if (debtClass === 'other') return PLAN_WHY.debtMid;
  return PLAN_WHY.debtFocus(target.name, target.rateBps);
}

/** Returns NEW data with plan amounts applied (and new goal/category added). Never mutates input. */
export function applySmartPlan(data: BudgetData, plan: SmartPlan): BudgetData {
  const spendingTo = new Map<string, Cents>();
  const goalTo = new Map<string, Cents>();
  let extraTo: Cents | null = null;
  let addGoal: Goal | null = null;
  let addSpending: SpendingCategory | null = null;
  if (plan.feasible) {
    for (const line of plan.lines) {
      switch (line.kind) {
        case 'spending':
          if (line.id !== null) spendingTo.set(line.id, line.to);
          break;
        case 'goal':
          if (line.id !== null) goalTo.set(line.id, line.to);
          break;
        case 'extraDebt':
          extraTo = line.to;
          break;
        case 'newGoal':
          if (plan.newGoal) addGoal = { ...plan.newGoal, monthly: line.to };
          break;
        case 'newSpending':
          if (plan.newSpending) addSpending = { ...plan.newSpending, monthly: line.to };
          break;
      }
    }
  }
  const spending = data.spending.map((s) => {
    const to = spendingTo.get(s.id);
    return to === undefined ? s : { ...s, monthly: to };
  });
  if (addSpending) spending.push(addSpending);
  const goals = data.goals.map((g) => {
    const to = goalTo.get(g.id);
    return to === undefined ? g : { ...g, monthly: to };
  });
  if (addGoal) goals.push(addGoal);
  return {
    ...data,
    incomes: [...data.incomes],
    bills: [...data.bills],
    debts: [...data.debts],
    spending,
    goals,
    settings: extraTo === null ? { ...data.settings } : { ...data.settings, extraDebtPayment: extraTo },
  };
}
