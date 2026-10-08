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
| Change threshold | $5 | Avoids nagging about tiny differences. |
