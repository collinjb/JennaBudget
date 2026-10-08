# Decisions

Choices made while building, so they're easy to revisit. Newest at the bottom of each section.

## Stack
- **Vite 8 + React 19 + TypeScript 6.0** (not TS 7): `typescript-eslint` currently supports TypeScript < 6.1.
- **vite-plugin-pwa 2** with `registerType: 'prompt'` so the app can show a "New version available" banner and never
  traps the user on stale code.
- **localStorage** for data (tiny JSON, synchronous, simple). A previous good copy is kept for recovery.
- No router, no state library, no chart library: fewer moving parts, smaller bundle.

## iPhone / PWA
- Status bar style **`default`** (not `black-translucent`, which would put white status-bar text over the light background).
- Updates: service worker in **prompt** mode. It checks on launch, when the app comes back to the foreground, when it goes
  back online, and hourly. A "A new version is ready · Refresh" banner applies it, so a stale cache can never trap the
  user, and an update never reloads the page in the middle of an edit.
- Launch (splash) screens generated for 12 iPhone sizes in light and dark, kept out of the offline cache (only the
  matching one is ever used).
- `saveData` validates before writing, so a bug can never store data the app can't read back. The previous good copy is
  kept under a second key for the recovery screen.
- Validation tidies small things instead of rejecting them (trims names to 60 characters, drops unknown fields, keeps only one
  safety-net goal). Dates must be between 1900 and 2999.
- `navigator.storage.persist()` is requested on startup (best effort). Home-screen apps are also exempt from Safari's
  7-day storage cleanup.

- **Minimum iOS: 16.4 or later** (the build's browser target; the app also uses `dvh` units, `color-mix()` and `inert`).
- Always link to the address **with the trailing slash** (`/JennaBudget/`); without it the page is outside the offline
  service worker's scope.
- Text scales with browser zoom and the layout is checked at 125–200%. iPhone's "Larger Text" setting
  (`-apple-system-body`) isn't wired in yet; that's a future option once the layout is proven at those sizes on a real phone.

## Access code (owner's request)
- **Once per device, not every launch:** the owner wanted strangers on new devices kept out, without being asked again on
  their own phone. A device is remembered by storing the code's hash; changing the code asks every device again.
- **Static site, so no server check:** the code is checked in the browser against a salted hash (SHA-256, re-hashed 1,000
  times) in `src/access.json`. That keeps casual visitors out but can't stop a determined, technical person (a 4-digit
  code's hash can be guessed offline, and the check runs on their device). The budget itself never leaves the phone.
- **Plain-JavaScript SHA-256** so the check also works on the http home-network test copy (Web Crypto needs https).
- 5 wrong codes → 30-second wait. Typing on a physical keyboard works too.
- **No welcome/setup screens:** after the code, a new budget opens straight on Home (owner's request). Home's empty states
  guide the first steps; example data and restoring a backup are in Settings. `settings.onboarded` stays in saved data
  only so older data and backups load unchanged.

## Interaction details
- **Toasts:** 7 s when they offer Undo, 5 s otherwise; up to 3 stack; the timer pauses while a toast is touched or focused.
  An Undo that would replace the whole budget (Smart Plan, example data, restore) closes as soon as anything else
  changes, so later edits are never thrown away.
- **Browser Back** closes an open dialog or sheet first, then a page.
- **Twice-a-month paydays** must be at least a week apart (otherwise both can land on Feb 28).
- **Debt slider** moves in $10 steps plus a stop at the exact planned extra amount; it can't go past $9,999,999.99.
- **Field errors** are linked to their field and announced once (politely) when Save is tapped.
- **Tab labels** wrap to two lines at most and are capped at 15px, like iOS.
- **Backups** record their own date as "Last backup", so restoring one shows when it was made.
- **Money input:** commas only as thousands separators ("12,50" asks for a period instead of becoming $1,250).
- **Saving:** the app keeps exactly what was saved (tidied and validated) and refuses a change that couldn't be saved,
  showing a message, instead of keeping it in memory where every later save would fail.

## Money & dates
- Money is integer cents everywhere; interest rates are integer basis points (6.8% = 680).
- Dates are local `YYYY-MM-DD` strings; helpers in `src/lib/dates.ts` avoid the UTC-parsing off-by-one-day bug.
- Lists show cents only when non-zero (`$1,450` vs `$1,450.50`), so totals are always exact sums of what's shown.
- Home shows whole dollars using largest-remainder rounding so the big number and the breakdown always add up.
  A Home figure can differ by $1 from the same total shown with cents on another screen; that's rounding, not a bug.

## Budget semantics
- "Paid this month" is stored as the month it was ticked (`paidMonth`), so it resets automatically on the 1st.
- Bills not due in the current month (quarterly/yearly) say "Not due this month" and don't count toward "X of Y paid".
- Debt minimums count as `min(minimum, balance)`; planned extra only counts while some debt remains.
- Debt payoff and goal projections assume the first payment/contribution happens **next month**.
- The payoff pool is constant each month (minimums + extra), so freed-up minimums roll over automatically.
- Paycheck Plan lists only bills and debt minimums; savings/fun are monthly amounts and come out of what's left.

## Smart Plan thresholds (`src/lib/planConfig.ts`)
| Setting | Value | Why |
|---|---|---|
| High-interest debt | ≥ 8% | Above typical savings/investment returns; paying it down is a guaranteed "return". |
| Low-interest debt | < 5% | Minimums are fine; split extra with goals. |
| Starter safety net | $1,000 or one month of bills + minimums + must-haves (rounded up to $100), whichever is larger | Common starter-emergency-fund guideline. |
| Safety net share | ≤ 40% of free money per month | Builds it fast without starving everything else. |
| Fun money | 10% of take-home (5% when free money < 15% of income), never more than half of free money | Budgets with zero fun get abandoned. |
| Buffer | min($100, 10% of what's left) | Small cushion for surprises. |
| Extra debt share | 75% with high-interest debt · 50% mid-rate · 25% low-rate only | Remainder goes to goals without a deadline. |
| Change threshold | $5 | The Home card only nudges about $5+ moves. The Smart Plan page still lists every change, so nothing changes silently. |
| Growing debt first | Enough extra to pay it off within 60 months, capped at 50% of free money, but always at least enough to stop it growing | A balance that grows every month beats every other goal. |

Other Smart Plan choices:
- Every suggested amount is capped at the app's limit ($9,999,999).
- Three kinds of debt warning: the payment is less than the interest (grows), equals it (never goes down), or there is
  no payment set (never paid down, including 0% debts). All three get the growing-debt money first.
- A safety net or Fun Money category is only created when there's money to put in it (an empty budget gets no suggestions).
- $0 bills/must-haves are never listed as things to cut; $0 minimum payments are left off the Paycheck Plan.
- A goal due later this month is not "past due": it needs the rest this month. Only a date that has gone by is past due.
