# Budget — Product & Technical Spec

Source of truth for every agent. Derived from `BUDGET_APP_PROMPT.md` (the owner's request). If this spec and the prompt
disagree, the prompt wins; record the resolution in `docs/DECISIONS.md`.

**North star: super simple.** A non-finance person must understand every screen at a glance. When torn between
"more powerful" and "easier to understand", choose easier.

---

## 1. Architecture

- Vite 8 + React 19 + TypeScript 6 (strict). vite-plugin-pwa 2 (service worker, manifest). Plain CSS + CSS variables.
- Vitest (unit, `src/**/*.test.ts`), Playwright on WebKit with iPhone profiles (`e2e/`).
- No router library: tab state + full-screen "pages" pushed on top (Settings, Paycheck Plan, Smart Plan) + bottom sheets.
- No runtime network requests. System font. No analytics.

### Folder ownership (parallel agents must stay inside their folders)

| Path | Owner |
|---|---|
| `src/types.ts`, `src/state/`, `src/main.tsx`, `docs/`, root configs (`package.json`, tsconfigs, `eslint.config.js`, `vitest.config.ts`, `playwright.config.ts`) | Lead |
| `src/lib/**` (+ tests) | Agent 1 — Money Math Engine |
| `src/App.tsx`, `src/components/`, `src/screens/`, `src/styles/` | Agent 2 — Design & UI |
| `public/`, `index.html`, `vite.config.ts`, `scripts/`, `src/pwa/`, `src/storage/` | Agent 3 — iPhone & PWA |
| `e2e/` | QA agents (later phases) |

Need a change outside your folder? Don't make it — report it to the lead in your final message.

### Shared contracts
- `src/types.ts` — all data types. **Money = integer cents. Dates = local `YYYY-MM-DD`. Months = `YYYY-MM`.**
- `src/lib/*.ts` — pure functions (signatures + doc comments are the contract).
- `src/storage/storage.ts` — persistence API.
- `src/state/store.tsx` — `BudgetProvider` + `useBudget()` → `{ data, status, corruptRaw, saveError, actions }`.
  `actions`: `upsert`, `remove` (returns `Removed` for undo), `restore`, `updateSettings`, `replaceAll`, `setBillPaid`,
  `addToGoal`, `reset`. Saves to storage on every change.
- `src/state/useToday.ts` — `useToday()` local ISO date that updates on foreground/minute. **Use it everywhere instead of
  calling `new Date()` in components** (so Playwright's clock mocking works and month rollover is live).
- `src/lib/ids.ts` — `newId()`.
- `src/lib/presets.ts` — quick-add chips, debt type labels/emoji, emoji picker choices.

---

## 2. Data semantics (see `src/types.ts` doc comments for field-level detail)

- **Income**: `amount` = ONE take-home paycheck. Frequencies: weekly, biweekly ("every 2 weeks"), semimonthly ("twice a
  month", days default [1, 15]; 31 = last day), monthly. `payDate` = any real payday (anchor).
- **Bill**: `amount` per occurrence. Frequencies: weekly, biweekly, monthly, quarterly, yearly. Monthly bills: due on
  `dueDay` (clamped to month end). Quarterly: every 3 months starting from `dueDate`'s month, on `dueDay`. Yearly: each
  year in `dueDate`'s month, on `dueDay`. Weekly/biweekly: every 7/14 days from `dueDate`.
  **Paid tracking:** `paidMonth === currentMonth` means paid this month. It resets automatically when the month changes
  (no writes needed). Bills not due in the current month (e.g. a quarterly bill) show "Not due this month" and don't count
  in "X of Y paid".
- **Debt**: `rateBps` = APR in basis points (6.8% = 680). Minimum payment due monthly on `dueDay`.
- **SpendingCategory**: monthly amount; `kind` `'need'` (must-have, Smart Plan never changes it) or `'fun'`
  (nice-to-have, Smart Plan may adjust it).
- **Goal**: target, saved, monthly contribution, optional `targetDate`, `isEmergencyFund` (at most one).
- **Settings**: `payoffMethod`, `extraDebtPayment` (planned extra on top of minimums, part of the budget), `theme`,
  `onboarded`, `isExample`, `lastBackupAt`.

---

## 3. Calculations

All in `src/lib`. Integer cents only; round half-up once at the end of each conversion.

- **Monthly equivalents** (`toMonthly`): weekly ×52÷12 · biweekly ×26÷12 · semimonthly ×2 · monthly ×1 ·
  quarterly ÷3 · yearly ÷12. Show "≈" for weekly/biweekly/quarterly/yearly.
- **Monthly summary**: income − bills − (debt minimums + extra) − spending − savings = **Left Over**.
  Debt minimum counted as `min(minPayment, balance)` for debts with balance > 0. Extra only counts while any debt has a
  balance. Savings counts goals not yet reached.
- **Home rounding**: Home shows whole dollars via `homeBreakdown` (largest-remainder rounding) so the big number and
  the breakdown always add up exactly. Other screens use `formatMoney` "auto" (cents only when non-zero), so lists and
  their totals are exact.
- **Paydays**: weekly/biweekly every 7/14 days from `payDate` (both directions); monthly on `payDate`'s day each month
  (clamped); semimonthly on the two days (clamped; 31 = last day). Paychecks on the same date from different incomes merge.
- **Paycheck Plan**: next 4 paydays on/after today. Window i = [payday_i, payday_{i+1}). Items = bill occurrences + debt
  minimum payments due in the window. `left = paycheck − total`; `shortBy = max(0, total − paycheck)`.
  Message when short: "⚠️ This paycheck is short by $210. Set aside $210 from the paycheck before."
  Footer note: "Savings and fun money come out of what's left."
- **Extra-paycheck months**: biweekly → months with 3 paydays; weekly → months with 5. Next 12 months.
- **Debt payoff** (`simulatePayoff`): the first payment is next month; result month = current month + N.
  Each month: accrue interest `round(balance × rateBps / 120000)` on every active debt → constant pool
  (sum of minimums + extra) → pay each debt `min(minPayment, balance)` → leftover pool to debts in payoff order
  (avalanche: highest rate first; snowball: smallest balance first), cascading, never overpaying. Freed minimums roll
  over automatically because the pool stays constant. Cap 600 months → `months: null` → UI says "more than 50 years".
  0% debts work. **Warning** (`interestWarnings`): min payment ≤ first month's interest →
  "Your $25 payment doesn't cover the $31 of interest each month, so this balance will keep growing."
- **Goals** (`projectGoal`): first contribution next month. months to goal = ceil(remaining ÷ monthly); reach month =
  current month + that. With a deadline: monthsLeft = targetMonth − currentMonth; needed/month = ceil(remaining ÷
  monthsLeft); `on-track` if monthly ≥ needed, else `behind`; deadline this month or earlier and not reached → `past-due`.

---

## 4. Smart Plan (`buildSmartPlan`) — exact algorithm

Deterministic and **idempotent** (applying the plan, then rebuilding it, yields no changes). Thresholds live in
`src/lib/planConfig.ts`. All suggested amounts are **whole dollars** (multiples of 100 cents): allocations use
`floorDollars`, needs use `ceilDollars`. Rounding residue ends up in Left Over.

```
S = monthlySummary(data); income = S.income
fixed = S.bills + S.debtMinimums + S.spendingNeeds
R = income − fixed
if R < 0 → feasible=false, shortfall=−R, levers = biggest bills + must-have spending categories by monthly amount
           (max 4, desc), lines=[], changes=[], hasSuggestions=false. Impact before = after (current).
tight = R < income × TIGHT_RATIO

A) Safety net. ef = first goal with isEmergencyFund.
   If none: newGoal = { name 'Emergency Fund', emoji '🛟', target = max(STARTER_EMERGENCY_FUND, ceil-to-$100(fixed)),
   saved 0, targetDate null, isEmergencyFund true }.
   efMonthly = remaining > 0 ? min(ceilDollars(remaining), floorDollars(R × EMERGENCY_FUND_SHARE)) : 0.  R −= efMonthly
B) Fun. funTarget = floorDollars(income × (tight ? FUN_PCT_TIGHT : FUN_PCT_COMFORTABLE))
   fun = min(funTarget, floorDollars(R × FUN_MAX_SHARE)).  R −= fun
   Split across existing 'fun' categories in proportion to their current amounts (equal split if all are 0),
   whole dollars, largest remainder. No fun category and fun > 0 → newSpending { 'Fun Money', '🎉', kind 'fun' }.
C) Buffer. buffer = min(BUFFER_MAX, floorDollars(R × BUFFER_SHARE)).  R −= buffer   (stays as Left Over)
D) Goals with a future deadline (not EF, not reached, not past-due), nearest deadline first (then name):
   give = min(ceilDollars(neededPerMonth), floorDollars(R)).  R −= give
E) Open goals = not EF, not reached, and (no deadline OR past-due).
   activeDebts = balance > 0.
   debtShare = 0 if no active debts; 1 if no open goals; HIGH_INTEREST_DEBT_SHARE if any active debt ≥ HIGH_INTEREST_BPS;
   LOW_INTEREST_DEBT_SHARE if every active debt < LOW_INTEREST_BPS; otherwise OTHER_DEBT_SHARE.
   extra = floorDollars(R × debtShare).  R −= extra
F) Open goals split floorDollars(R) equally (whole dollars, extra dollars to earliest-listed), each capped at
   ceilDollars(remaining); overflow re-split among the rest; any final overflow → extra if active debts exist, else stays.
leftOverAfter = income − fixed − everything allocated above.
```

**Lines** (every adjustable item, `from` = current, `to` = suggested): EF (existing or new), each fun category
(+ newSpending), each goal from D/E/F, and `extraDebt` (only when active debts exist). Reached non-EF goals are not
listed. **Changes** = lines with |to − from| ≥ MIN_CHANGE, plus new items. `hasSuggestions = feasible && changes.length > 0`.

**Why sentences** (one plain sentence each, no jargon; examples):
- New safety net: "A $1,000 safety net keeps a surprise, like a car repair, from turning into new debt."
- Safety net in progress: "Building your safety net first means surprises don't end up on a credit card."
- Safety net full: "Your safety net is full. Nice work!"
- Fun: "Budgets with zero fun don't last. This is guilt-free money to enjoy." Tight: "Money is tight, so this is
  smaller, but you still get some fun."
- Deadline goal fully funded: "This is what it takes to reach $1,500 by May 2027." Short: "This is all that's left
  for it, so it won't reach $1,500 by May 2027. A later date would help."
- Past-due goal: "The date for this goal has passed. Pick a new date to get an exact amount."
- Open goal: "Steady progress toward this goal."
- Extra debt, high interest, avalanche: "Your Credit Card charges 24.99% interest, so every extra dollar there saves
  you the most money." Snowball: "Paying off your smallest debt (Store Card) first gives you a quick win."
- Extra debt, low interest only: "Your debts have low interest rates, so extra money is split between them and your goals."
- Extra debt 0: "There's no extra money for debt right now. Your minimums are covered."
- Levers: bills "Could you lower, switch, or cancel this?"; must-haves "Even a small trim here helps."

**Impact**: debt-free before (current extra) vs after (plan extra), interest before/after, and each goal's reach month
before/after. **applySmartPlan** returns new data with the `to` amounts, adds newGoal/newSpending. UI: confirmation
screen → apply → toast with **Undo** (restores the exact previous data via `replaceAll`).

Disclaimer footer: "These are general budgeting guidelines, not professional financial advice."

---

## 5. Screens

Global: bottom tab bar (Home · Money In · Bills · Savings & Fun · Debt), icons + labels, ≥44pt targets, padded for the
home indicator. Each screen: large title + one-line explanation. Add/edit via bottom sheets. Delete = confirm → Undo
toast (~5 s). Empty states: emoji + one sentence + one big button.

Screen explanations:
- Home: "Here's your month at a glance."
- Money In: "The money you take home from work and side gigs."
- Bills: "Things you have to pay, like rent and your phone."
- Savings & Fun: "Money for everyday spending, fun, and the things you're saving up for."
- Debt: "What you owe, and when you'll be free of it."

### Home
1. Big number "Left over this month" (whole dollars, teal). Negative → red "You're $120 over" + "Here's how to fix it →"
   (opens Smart Plan). `aria-live="polite"`.
2. "Where your money goes": stacked bar + legend (Bills blue, Debt orange, Savings green, Spending & Fun purple,
   Left over teal) with whole-dollar amounts from `homeBreakdown`.
3. Next paycheck card (first Paycheck Plan window): "Next payday: Fri, Oct 10 · $1,450", items due before the following
   payday, "$490 left from this paycheck". Tap → Paycheck Plan. No income → "Add your paycheck" prompt.
4. Debt-free card: "At this pace you'll be debt-free in March 2029 (3 yrs 5 mo)." Tap → Debt tab. Never-payoff →
   warning wording. No debts → hide (or "No debt 🎉" if they said so).
5. Smart Plan card: `hasSuggestions` → "We found a better way to split your money" + button; infeasible → "Your bills
   are more than your income" + button; else "Your plan looks great ✓".
6. Savings goals progress (bars) with status line.
Gear icon (top right) → Settings. Example-data banner when `settings.isExample`: "You're looking at example numbers" +
"Start my own budget" (clears data → onboarding).

### Money In
List incomes: name, amount + frequency ("$1,450 every 2 weeks"), "≈ $3,142/mo", next payday. Total monthly at top with
"How we calculate this" explainer (the conversion rules). Extra-paycheck heads-up for biweekly/weekly.
Sheet fields: Name (default "Paycheck"), Take-home amount (helper "What actually hits your bank account, after taxes"),
How often (segmented/select), Next payday (date) or the two days for twice-a-month.

### Bills
Top: monthly total; progress "4 of 7 bills paid · $1,280 to go". List (due this month by due date, then "Not due this
month"): emoji, name, amount + frequency, due ("Due Oct 15" / "Due the 15th"), monthly equivalent for non-monthly,
**Paid checkbox** (large). Sheet: quick-add chips, emoji, name, amount, how often, due day (monthly) or date.

### Savings & Fun
Two sections: "Spending money" (needs + fun; each shows monthly amount and a Must-have / Nice-to-have tag) and
"Savings goals" (progress bar, "$400 of $1,500", status line, "Add money" button). Goal statuses:
- reached: "🎉 You did it!" · on-track: "On track for May 2027" · behind: "To reach $1,500 by May, save $275/month" (warning
  style) · past-due: "This date has passed. Pick a new one?" · no-deadline: "At $150/month you'll reach this by June
  2027" · no-contribution: "Add a monthly amount to see when you'll get there".
"Add money" sheet: amount → `addToGoal`; crossing the target → celebration (confetti or big check; reduced-motion =
static). Sheets: spending (emoji, name, monthly, Must-have/Nice-to-have) and goal (emoji, name, target, saved so far,
monthly, optional target date, "This is my safety net (emergency fund)" toggle).

### Debt
Top: "Debt-free by March 2029", total debt, "Total interest at this pace: $X". Warnings from `interestWarnings`.
Extra slider "What if I paid $__ extra each month?" ($0–$1,000 in $10 steps, plus current planned extra) → live
`compareExtra`: "You'd be debt-free 14 months sooner and save $2,310 in interest." + button "Add $X extra to my budget"
(sets `settings.extraDebtPayment`). Payoff method toggle: "Save the most money" (highest interest first) / "Quick wins"
(smallest balance first), with one-line explanations. Payoff order list with each debt's payoff month. Line chart of total
balance over time (SVG). Each debt: emoji by type, name, balance, rate, minimum, "Update balance" quick action.
Sheet: name, type, balance, interest rate (helper "The APR % on your statement"), minimum monthly payment, due day.

### Paycheck Plan (page from Home)
Next 4 paydays. Each: date + amount (+ sources), items list, total, "Left from this paycheck", short-by warning.
Extra-paycheck heads-up. Empty (no income) → prompt to add income.

### Smart Plan (page)
Before → after list of changes with "Why?" for each, impact summary, "Use this plan" → confirm → apply + Undo toast.
Infeasible → kind, clear shortfall message and levers. Disclaimer footer.

### Settings (page)
Back up my data (share sheet / download; updates `lastBackupAt`; shows "Last backup: Oct 3"), Restore from backup
(file picker → validate → preview counts → confirm), Load example budget / Clear example budget, Payoff method default,
Theme (System / Light / Dark), "How to install on your iPhone" (Safari → Share → Add to Home Screen → Add; data stays on
this phone; home-screen app and Safari keep separate data; back up regularly), About (app version), Start over (double
confirmation: confirm dialog + type "ERASE" or second confirm).

### Onboarding (first launch: `!settings.onboarded`)
Welcome → 4 steps (progress dots, Skip always visible, Back):
1. "How much do you take home, and how often?" — amount, frequency, next payday.
2. "What bills do you pay every month?" — chips (BILL_PRESETS) add a row with amount + due day; "Something else" adds a
   blank row.
3. "Do you have any debt?" — chips (DEBT_PRESETS) add a row with balance, rate, minimum; "No debt 🎉" moves on.
4. "What do you want money for?" — chips (SPENDING_PRESETS + GOAL_PRESETS): spending → monthly amount; goals → target.
Finish → Home with the big number filled in. Welcome screen also offers "Just let me look around with example numbers".

---

## 6. Inputs & formatting rules
- Money inputs: `type="text" inputmode="decimal"`, parsed with `parseMoney` (accepts "$1,234.56", "1234.5", "1234";
  rejects negatives/letters/>2 decimals). Inline plain-English error. Rate inputs via `parseRate`.
- All inputs ≥ 16px font. Names: trimmed, 1–40 chars (default name if blank where sensible).
- Display: `formatMoney` auto; Home uses whole dollars from `homeBreakdown`.
- Dates: `formatDate`/`formatMonth`; never `toLocaleDateString` on `new Date(isoString)`.

## 7. iPhone / PWA
See the prompt's "iPhone / home-screen requirements" — every item is mandatory. Icons generated from `scripts/` source
SVG via sharp. Update flow: "New version available — Refresh" banner (registerType prompt) and auto-check on foreground.
Storage persistence requested on startup. Recovery screen on corrupt data (restore previous copy / restore backup file /
download the unreadable data / start fresh) — never a white screen. Also a top-level React error boundary.

## 8. Acceptance criteria (summary — Definition of Done in the prompt is authoritative)
- Every feature in §5 works on WebKit iPhone SE / 15 / Pro Max, light + dark.
- Every displayed total equals the sum of its displayed parts.
- Unit tests cover every `src/lib` function incl. edge cases; E2E covers every flow.
- Offline after first load; installable with icon + name "Budget"; standalone with safe areas.
- Data survives reload; backup → restore round-trips; corrupt data never blanks the screen.
