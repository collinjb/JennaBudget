// Every Smart Plan threshold lives here. Documented in docs/DECISIONS.md.
export const PLAN_CONFIG = {
  /** Debts at or above this rate are "high interest" and get extra money. 8% */
  HIGH_INTEREST_BPS: 800,
  /** Debts below this rate are "low interest" (minimums are fine). 5% */
  LOW_INTEREST_BPS: 500,
  /** Starter safety net target floor: $1,000 */
  STARTER_EMERGENCY_FUND: 100_000,
  /** At most this share of free money goes to the safety net each month. */
  EMERGENCY_FUND_SHARE: 0.4,
  /** Fun money as a share of take-home pay when there is breathing room. */
  FUN_PCT_COMFORTABLE: 0.1,
  /** Fun money share of take-home when money is tight. */
  FUN_PCT_TIGHT: 0.05,
  /** "Tight" = free money (after bills, minimums, must-haves) is less than this share of income. */
  TIGHT_RATIO: 0.15,
  /** Fun money never takes more than this share of the free money remaining at that step. */
  FUN_MAX_SHARE: 0.5,
  /** Left-over cushion: min(BUFFER_MAX, BUFFER_SHARE x free money remaining at that step). */
  BUFFER_MAX: 10_000,
  BUFFER_SHARE: 0.1,
  /** With high-interest debt, this share of what is left goes to extra debt payments (rest to goals without a deadline). */
  HIGH_INTEREST_DEBT_SHARE: 0.75,
  /** Mid-rate debt (5% to under 8%): share of what is left that goes to extra debt payments (rest to goals). */
  OTHER_DEBT_SHARE: 0.5,
  /** Only low-rate debt (all under 5%): share of what is left that goes to extra debt payments (rest to goals). */
  LOW_INTEREST_DEBT_SHARE: 0.25,
  /** A debt whose minimum doesn't cover its interest gets enough extra (first) to be paid off within this many months... */
  GROWING_DEBT_PAYOFF_MONTHS: 60,
  /** ...but that target never takes more than this share of free money (it always gets at least enough to stop growing). */
  GROWING_DEBT_MAX_SHARE: 0.5,
  /** A line counts as "changed" only if it moves by at least $5. */
  MIN_CHANGE: 500,
} as const;
