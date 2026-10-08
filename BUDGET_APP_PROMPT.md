# Build Me a Simple iPhone Budget App (Home-Screen Web App)

## Your mission

Build a complete, polished, bug-free budgeting web app that I can open in Safari on my iPhone and save to my home screen as an app icon. When I tap that icon, it should open full-screen like a real app, with no Safari address bar, and it should work offline.

**The most important requirement is that it's simple.** I am not a finance person. Every screen should make sense at a glance. If you ever have to choose between "more powerful" and "easier to understand," choose easier.

**Work on your own until it's 100% done.** Don't stop to ask me questions unless you need something only I can do, like logging into a hosting account. Otherwise make a sensible decision, write it in `docs/DECISIONS.md`, and keep going. Don't call it finished until every item in the **Definition of Done** at the bottom is checked off and verified.

---

## What the app does (in plain English)

1. **Money In:** I enter my paycheck(s): how much I take home and how often I get paid.
2. **Bills:** I enter my bills (rent, phone, car insurance, subscriptions, etc.). Each one comes out of my income.
3. **Debt:** I enter my debts (student loans, credit cards, car loan, etc.) with the balance, interest rate, and minimum payment. The app tells me **when I'll be debt-free at my current pace** and how to get there faster.
4. **Savings & Fun:** I make my own categories, like "Fun Money", "Groceries", "Gas", or savings goals like "Trip to Florida". Savings goals have a target amount and show my progress.
5. **Left Over:** The app always shows one big, clear number: **how much money I have left after everything**. Green if positive, red if I'm over.
6. **Smart Plan:** The app looks at everything and suggests **the best way to split my money**: bills covered, debts paid down efficiently, savings goals on track, fun money included, plus a little extra. Each suggestion comes with a plain-English "why". I can apply the whole plan with one tap (and undo it).

---

## App name and basics

- **App name:** `Budget` (this is the label under the home-screen icon. Keep it 12 characters or fewer so iPhone doesn't cut it off.)
- **Currency:** US dollars. Format with `Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })`.
- **Language:** English, plain and friendly, with no finance jargon.
- **Privacy:** All data stays on my phone. No accounts, no logins, no servers, no analytics, no trackers, and no external requests at runtime (that includes no Google Fonts CDN; use the iPhone system font).

---

## Tech stack (use this unless you have a strong reason not to; if you change it, write why in DECISIONS.md)

- **Vite + React + TypeScript** (strict mode on)
- **vite-plugin-pwa** for the web app manifest and service worker (offline support and auto-updates)
- Plain CSS with CSS variables (CSS Modules or one well-organized stylesheet). Keep dependencies minimal.
- Charts: hand-drawn SVG (a simple stacked bar or donut, plus a simple line for debt payoff). No heavy chart library.
- **Vitest** for unit tests. **Playwright** for end-to-end tests, run on **WebKit** with iPhone device profiles, since WebKit is Safari's engine.
- Storage: `localStorage` (or IndexedDB through a tiny wrapper), with a `schemaVersion` field and a migration function.

---

## Screens and navigation

Use a **bottom tab bar** with 5 tabs: big icons, short labels, at least 44×44pt tap targets, and padding for the iPhone home indicator.

| Tab | Label | What it shows |
|---|---|---|
| 1 | **Home** | The overview (see below) |
| 2 | **Money In** | Paychecks and income sources |
| 3 | **Bills** | Bills list plus a monthly total |
| 4 | **Savings & Fun** | Spending categories and savings goals |
| 5 | **Debt** | Debts, debt-free date, and the payoff plan |

A **gear icon** at the top of Home opens **Settings**.

### Home screen (the most important screen)
From top to bottom:
1. **The big number:** "Left over this month: **$342**", green when positive. If negative it turns red: "You're **$120 over**. Here's how to fix it →", with a link to the Smart Plan.
2. **Where your money goes:** one simple horizontal stacked bar (or donut) with a legend: Bills, Debt, Savings, Fun/Spending, Left Over. Each color is used consistently everywhere in the app.
3. **Next paycheck card:** "Next payday: **Fri, Oct 10** · $1,450. Bills due before the following payday: Rent $900, Phone $60. **$490 left from this paycheck.**" Tapping it opens the **Paycheck Plan**.
4. **Debt-free date card:** "At this pace you'll be debt-free in **March 2029** (3 yrs 5 mo)." Tapping it goes to Debt.
5. **Smart Plan card:** "We found a better way to split your money", with a button.
6. **Savings goals:** progress rings or bars ("Florida Trip: $400 of $1,500 · on track for June").

### Money In
- List of income sources (allow more than one, e.g., two jobs, a side gig, or a partner's income).
- Fields: name, **take-home amount** (helper text: "What actually hits your bank account, after taxes"), how often (weekly / every 2 weeks / twice a month / monthly), and the next payday date (or the two days of the month for "twice a month", default 1st & 15th).
- Show the monthly total. Converted amounts get an "≈" and a "How we calculate this" explainer.
- If I'm paid every 2 weeks, show a friendly heads-up for the months with **3 paychecks** ("Heads up: you get 3 paychecks in January!").

### Bills
- List with emoji icon, name, amount, how often, and due day of month.
- Frequencies: monthly, weekly, every 2 weeks, every 3 months, yearly. Show the monthly equivalent ("$600/yr ≈ $50/mo").
- **"Paid this month" checkboxes** that reset automatically at the start of each month, with a progress line: "4 of 7 bills paid · $1,280 to go".
- Sort by due date. Total at the top.

### Savings & Fun
Two simple kinds of buckets, both created by me with an emoji, name, and amount:
- **Spending money** (e.g., Fun Money, Groceries, Gas, Eating Out): a monthly amount.
- **Savings goals** (e.g., Trip to Florida, Emergency Fund, New Car): target amount, amount saved so far, monthly contribution, and an optional target date.
  - Show: "At $150/month you'll reach this by **June 2027**."
  - If a target date is set: "To reach $1,500 by May, save **$275/month**." Flag it when the current amount won't make it.
  - An **"Add money"** button to log a deposit, which updates progress. A small celebration (confetti or checkmark) when a goal is reached, respecting reduced-motion settings.

### Debt
- Fields: name, type (student loan, credit card, car, personal, medical, other), current balance, **interest rate** (helper: "The APR % on your statement"), minimum monthly payment, due day.
- Top of screen: **"Debt-free by March 2029"**, total debt, total interest you'll pay at this pace.
- **Extra payment slider:** "What if I paid $__ extra each month?" Updates live: "You'd be debt-free **14 months sooner** and save **$2,310** in interest."
- **Payoff method** toggle with plain-English explanations:
  - **"Save the most money"** (avalanche: highest interest rate first)
  - **"Quick wins"** (snowball: smallest balance first)
- **Payoff order list:** each debt with its own payoff date, in the order they'll be paid off.
- A simple line chart of total debt falling over time.
- "Update balance" button so I can keep it accurate from my statements.

### Paycheck Plan (opened from the Home card)
- Show the next 4 paydays (across all income sources). Under each payday, list the bills and debt payments **due on or after that payday and before the next one**, the total, and **what's left from that paycheck**.
- If a window's bills cost more than that paycheck: "⚠️ This paycheck is short by $210. Set aside $210 from the paycheck before."

### Smart Plan (the "most optimal way" feature)
A **deterministic, rule-based, explainable** engine (no AI calls) that builds a suggested monthly split in this priority order:
1. **Bills first.** Must-pays are covered.
2. **All minimum debt payments.** Never suggest less than the minimums.
3. **Starter emergency fund.** If there's no emergency fund goal, suggest creating one with a target of $1,000 or one month of bills (whichever is larger). Fund it until it's reached.
4. **Fun money is included, not cut to zero.** Suggest a reasonable guilt-free amount (e.g., around 5–10% of take-home, adjusted down when money is tight). A budget with zero fun gets abandoned.
5. **Savings goals with deadlines** get what they need to be on time, nearest deadline first.
6. **High-interest debt** (rate at or above 8%) gets the extra, using the chosen payoff method.
7. **Low-interest debt** (under 5%, e.g., many student loans) stays at minimums unless everything above is handled; the remainder is split between goals and extra payments.
8. Leave a small buffer of "left over" money when possible (e.g., $50–100).

**Explainability:**
- Show the plan as a clear before/after: "Fun Money: $100 → $150", and so on.
- Every line has a **"Why?"** in one plain sentence ("Your credit card charges 24% interest, so every extra dollar there saves you the most money.").
- Show the impact: "With this plan you'd be debt-free **Aug 2028** instead of **Mar 2029**, and reach your Florida trip goal by **May**."
- **"Use this plan"** applies everything at once, with a confirmation screen and an **Undo** button afterward.
- If income can't cover bills plus minimums, don't pretend. Say kindly and clearly how much is missing, and list the biggest levers (largest bills, subscriptions, etc.).
- Footer disclaimer: "These are general budgeting guidelines, not professional financial advice."
- Keep these thresholds (8%, 5%, $1,000, fun %, buffer) in one config constants file, documented in DECISIONS.md.

### Settings
- **Back up my data:** export a `.json` file. Use the iPhone share sheet via `navigator.share` with a File when available; otherwise fall back to a download.
- **Restore from backup:** import a `.json` file. Validate it fully, show a preview of what will be restored, then confirm.
- **Start over:** erase all data, behind a typed or double confirmation.
- **Load example budget / Clear example budget:** for trying the app out.
- Payoff method default, theme (System / Light / Dark), and an About section with the app version.
- A short "How to install on your iPhone" help section (see below).

### First launch (onboarding)
A friendly 4-step setup wizard, one question per screen, with big inputs, a progress dots indicator, and **Skip** always available:
1. "How much do you take home, and how often?"
2. "What bills do you pay every month?" (quick-add chips like Rent, Phone, Car Insurance, Internet, Netflix, Spotify, Utilities, so one tap pre-fills the name and emoji)
3. "Do you have any debt?" (chips: Student Loan, Credit Card, Car Loan; "No debt 🎉" button)
4. "What do you want money for?" (chips: Fun Money, Groceries, Gas, Trip, Emergency Fund)

The wizard ends on the Home screen with the big number already filled in. Also offer **"Just let me look around with example numbers"**.

---

## Ease-of-use rules (apply everywhere)

- Every screen has a **one-line explanation** under its title (e.g., Bills: "Things you have to pay, like rent and your phone.").
- **Empty states** are helpful, not blank: an emoji, one sentence, and one big "Add your first bill" button.
- Add and edit happen in a **bottom sheet** with large fields. Money fields use `type="text" inputmode="decimal"`, accept "$1,234.56", "1234.5", or "1234", strip `$` and commas, reject negatives and letters, and allow at most 2 decimals. Show inline errors in plain words.
- **All input font sizes must be at least 16px**, or iPhone Safari zooms in on focus.
- Deleting asks for confirmation and shows an **Undo** toast for about 5 seconds.
- No hover-only interactions. Swipe actions are fine only as a shortcut; there must always be a visible button as well.
- One primary action per screen. Large tap targets (44pt+), generous spacing, high contrast.
- Numbers: big and bold for totals, rounded to whole dollars in summaries (`$342`), with cents shown in detail/edit views.
- Consistent color meaning: Bills = blue, Debt = orange/red, Savings = green, Fun/Spending = purple, Left Over = teal (positive) / red (negative). Never use color alone; always pair it with text or an icon.
- Replace jargon: say "interest rate", not "APR" (the helper text can mention APR). Say "take-home pay", not "net income". Never use "allocation", "amortization", or "zero-based".

## Design direction

- Clean, calm, friendly, and modern. Think Apple's own apps: rounded cards, soft shadows, plenty of white space, and the system font stack (`-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif`).
- **Light and dark mode** that follows the iPhone setting, with a manual override in Settings.
- Subtle, quick animations (sheets sliding up, numbers updating). Respect `prefers-reduced-motion`.
- Emoji as category icons: friendly and zero-cost.
- A beautiful **app icon**. Design it as an SVG (e.g., a simple, bold symbol like a wallet, piggy bank, or dollar sign on a soft gradient) and generate all PNG sizes with a script (`sharp` or similar):
  - `apple-touch-icon.png` **180×180, no transparency** (iOS fills transparent areas with black)
  - 192×192 and 512×512 for the manifest, plus a 512×512 **maskable** version with a safe-zone margin
  - favicon
- Matching `theme-color` and `background_color` so launch doesn't flash an off-color screen.

---

## iPhone / home-screen requirements (critical; get every one right)

- `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`
- `<meta name="apple-mobile-web-app-capable" content="yes">` and `<meta name="mobile-web-app-capable" content="yes">`
- `<meta name="apple-mobile-web-app-status-bar-style" content="default">` (or `black-translucent` with correct padding; pick whichever looks best in both themes)
- `<meta name="apple-mobile-web-app-title" content="Budget">`
- `<link rel="apple-touch-icon" href="/apple-touch-icon.png">`
- `<meta name="theme-color">` for light and dark (using `media` attributes)
- `manifest.webmanifest` with `name`, `short_name`, `display: "standalone"`, `start_url`, `scope`, `theme_color`, `background_color`, and icons including maskable
- **Safe areas:** use `env(safe-area-inset-top/bottom/left/right)` so nothing hides under the notch, Dynamic Island, or home indicator. This is especially important for the bottom tab bar and bottom sheets.
- Use `100dvh` (not `100vh`) for full-height layouts.
- `overscroll-behavior: none` on the app shell so the whole app doesn't rubber-band. Scrolling content areas still scroll normally.
- `-webkit-tap-highlight-color: transparent`, and make sure taps feel instant.
- When the keyboard opens in a bottom sheet, the focused field must stay visible and the Save button must stay reachable.
- **Offline:** the service worker precaches the whole app, so it fully works in airplane mode.
- **Updates:** when I deploy a new version, the installed app picks it up (auto-update, or a small "New version available, tap to refresh" banner). Make sure stale caches can't trap me on an old version.
- Call `navigator.storage.persist()` on startup to ask the browser to keep data.
- No links that open outside the app unexpectedly (in standalone mode `target="_blank"` jumps out to Safari).
- Test layouts at **iPhone SE (375×667)**, **iPhone 15/16 (393×852)**, and **iPhone Pro Max (430×932)**, in both light and dark mode, in portrait. Landscape shouldn't break.

---

## Money math rules (this is where bugs hide; be careful)

- **Store all money as integer cents.** Never do math with floating-point dollars. Convert to dollars only for display.
- Frequency to monthly conversion (document it in-app in the "How we calculate this" explainer):
  - weekly × 52 ÷ 12 · every 2 weeks × 26 ÷ 12 · twice a month × 2 · monthly × 1 · every 3 months ÷ 3 · yearly ÷ 12
  - Round once at the end, consistently (round half up to the nearest cent).
- **Dates:** store as `YYYY-MM-DD` local-date strings. **Never** use `new Date('2026-10-10')` directly, because it parses as UTC and shows the previous day in US time zones. Write and use small local-date helpers.
- A bill due on the 29th/30th/31st in a shorter month is due on the **last day** of that month.
- Debt payoff simulation (month by month):
  - interest for the month = balance × (rate ÷ 100 ÷ 12), rounded to cents
  - pay minimums on all debts; the extra goes to the target debt (by the chosen method)
  - when a debt is paid off, its minimum **rolls over** to the next target debt
  - the final payment is only what's owed (no overpaying)
  - 0% interest debts must work
  - **If a minimum payment is less than or equal to the monthly interest, the debt never gets paid off.** Detect this and show a clear warning ("Your $25 payment doesn't cover the $31 of interest each month, so this balance will keep growing."). Never loop forever; cap at 600 months and say "more than 50 years".
- Goal projections: months to goal = ceil(remaining ÷ monthly contribution). Handle a contribution of 0 ("Add a monthly amount to see when you'll get there"). Handle already-reached goals.
- The Left Over number = monthly income − bills − debt payments (minimums + extra) − spending categories − savings contributions. Every displayed total must equal the sum of its displayed parts.

---

## How to organize the work: use subagents

Act as the **lead engineer**. Use the Agent tool to spin up specialized subagents. Run them **in parallel** whenever their work doesn't overlap. Give each one a self-contained brief (they don't see this conversation), the exact folders it owns, and what to report back.

### Phase 1: Plan (you, the lead)
1. Write `docs/SPEC.md`: every screen, the data model (TypeScript types), every formula, the Smart Plan rules, and acceptance criteria for each feature. Derive it from this prompt.
2. Scaffold the project (Vite + React + TS + vite-plugin-pwa + Vitest + Playwright). Commit to git.
3. Write the **shared contracts first**: `src/types.ts` (all data types), the store/persistence API signature, and the `src/lib` function signatures. This lets parallel agents build against the same interfaces without conflicts.

### Phase 2: Build (parallel subagents, each owning separate folders)
- **Agent 1, Money Math Engine** (owns `src/lib/`, `src/lib/**/*.test.ts`): money parsing/formatting (cents), local-date helpers, frequency conversion, monthly summary, payday schedule and Paycheck Plan windows, 3-paycheck-month detection, debt payoff simulator (avalanche/snowball/extra/rollover/never-payoff), goal projections, and the Smart Plan engine. **Write thorough Vitest tests**, including hand-verified examples (e.g., a known loan amortization checked against a standard calculator) and every edge case listed above. Pure functions only; no UI.
- **Agent 2, Design & UI** (owns `src/components/`, `src/screens/`, `src/styles/`): the design tokens (colors, spacing, type scale, light/dark), reusable components (Card, BigNumber, BottomSheet, MoneyInput, TabBar, ProgressBar, EmptyState, Toast with Undo, ConfirmDialog, simple SVG charts), all screens, onboarding, and all user-facing copy. Use the `src/lib` signatures (stub temporarily if needed).
- **Agent 3, iPhone & PWA** (owns `public/`, `index.html`, `vite.config.ts` PWA section, `scripts/`, `src/pwa/`, `src/storage/`): app icon SVG plus a PNG generation script, manifest, all Apple meta tags, the service worker and update flow, safe-area base styles, persistent storage plus schema versioning and migrations, corrupt-data recovery (never a white screen; offer a reset or restore), and backup export/import with validation.

Then **you integrate**: wire everything together, run the app, fix integration bugs, and make sure `npm run build`, `npm run test`, and type-checking all pass.

### Phase 3: Ease-of-use pass (subagent)
- **Agent 4, First-Time User / UX Reviewer:** run the app in Playwright WebKit with iPhone SE and iPhone Pro Max profiles, take screenshots of every screen and state (empty, filled, over budget, light, dark), and **role-play a non-technical person** who has never budgeted before. Report anything confusing, cramped, misaligned, clipped, too small, jargon-y, or that takes more than 2–3 taps for a common task. Then fix the issues (or report them back for you to fix), and re-screenshot to confirm.

### Phase 4: Verification (parallel review subagents; this is the "make sure everything is flawless" phase)
Launch these reviewers **in parallel**. Each one returns a list of issues with severity (Critical / High / Medium / Low), exact steps to reproduce, and a suggested fix.

1. **QA End-to-End Tester:** writes and runs Playwright tests on **WebKit with iPhone device profiles** covering every flow: onboarding (complete and skip), add/edit/delete for every item type, undo delete, totals updating live, the over-budget state, bill paid checkboxes and the monthly reset (mock the clock), goals with "Add money" and goal completion, debt payoff with the slider and method toggle, Smart Plan apply plus undo, Paycheck Plan, data persisting after a reload, a backup export→import round trip, offline mode, and the example data load/clear.
2. **Math Auditor:** builds 3 realistic sample budgets (tight, comfortable, and over budget with a never-payoff debt), **independently recalculates every number by hand or with a separate script**, and compares the results to what the app displays. Any mismatch, even by one cent, is a bug.
3. **Bug Hunter / Edge-Case Breaker:** tries to break it. Ideas: zero and empty values, $0.01, $9,999,999.99, pasted text, emoji in names, very long names, 50+ items, deleting everything, a 0% debt, a payment below interest, goals already reached, past target dates, Feb 29, bills on the 31st, paydays at month boundaries, corrupted localStorage, malformed backup files, double-tapping Save, rapid tab switching, and app reload mid-edit.
4. **iPhone/PWA Compliance Auditor:** checks every item in the "iPhone / home-screen requirements" section. Verifies that the manifest and icons are valid and load (no 404s), the 180×180 apple-touch-icon has no transparency, the service worker registers and serves offline, safe areas are respected in screenshots, there's no zoom on input focus, and there's no horizontal scrolling at 375px width.
5. **Accessibility & Readability Auditor:** color contrast (WCAG AA), labels on all inputs and icon buttons, VoiceOver-friendly structure (headings, landmarks, live region for the big number), focus order, Dynamic Type friendliness (text can scale), and nothing communicated by color alone.
6. **Code Quality Reviewer:** TypeScript strict with zero errors, zero ESLint errors, no console errors or warnings at runtime, no unused code or dependencies, a reasonable bundle size, no `any` in money logic, and clear structure.

**Then:** fix every Critical, High, and Medium issue (and the cheap Low ones). **Re-run the reviewers that found problems** until they come back clean. Repeat this loop as many times as needed. Don't skip this.

### Phase 5: Deploy and hand-off
1. Deploy to a **free HTTPS host** (the service worker and home-screen app need HTTPS). Check which of these is already logged in on this machine and use it: GitHub Pages (via `gh` CLI plus a GitHub Actions workflow), Netlify CLI, Vercel CLI, or Cloudflare Pages. If none is logged in, pick the easiest one and **pause only to walk me step-by-step through the login**, then continue.
2. Make sure the deployed site is served at a **stable URL that won't change**. Data on the phone is tied to the web address, so changing the URL later would mean starting over (or restoring from a backup).
3. Run the Playwright suite against the **live URL** as a final smoke test.
4. Write `README.md` with:
   - The live URL
   - **How to install on iPhone:** open the URL in **Safari** → tap the **Share** button (square with an up arrow) → scroll and tap **Add to Home Screen** → tap **Add**
   - Important notes in plain English: data lives only on this phone; the home-screen app keeps its own data separate from the Safari tab, so enter data **in the home-screen app**; **back up regularly** from Settings (e.g., save the backup to iCloud Drive/Files); deleting the home-screen icon may erase the data.
   - How to make changes and redeploy later
5. Generate a **QR code** image of the live URL (e.g., `docs/qr.png`) so I can just point my iPhone camera at my computer screen to open it.

---

## Definition of Done (verify each one before saying you're finished)

- [ ] All features above work: Money In, Bills (with paid checkboxes), Savings & Fun (spending + goals), Debt (payoff date, slider, both methods, never-payoff warning), Paycheck Plan, Smart Plan (with why, impact, apply, undo), Settings (backup, restore, reset, example data, theme), and onboarding
- [ ] The Home screen clearly shows Left Over, where the money goes, the next paycheck, the debt-free date, the Smart Plan prompt, and goal progress
- [ ] All money math uses integer cents; every displayed total equals the sum of its parts; the Math Auditor found zero mismatches
- [ ] Vitest: all unit tests pass, with thorough coverage of `src/lib`
- [ ] Playwright (WebKit, iPhone profiles): all E2E tests pass locally **and** against the live URL
- [ ] `npm run build` succeeds, with zero TypeScript errors, zero lint errors, and zero runtime console errors
- [ ] Looks great and nothing clips or overflows on iPhone SE, standard, and Pro Max sizes, in light and dark mode (verified by screenshots)
- [ ] Works fully offline after the first load; updates arrive after a redeploy
- [ ] Installs to the iPhone home screen with the custom icon and the name "Budget", and opens full-screen (standalone) with correct safe areas
- [ ] Data survives app restarts; backup → restore round-trips perfectly; corrupted data never causes a blank screen
- [ ] All Phase 4 reviewers re-ran and reported **no Critical/High/Medium issues**
- [ ] Deployed to a stable HTTPS URL; README and QR code done
- [ ] `docs/SPEC.md` and `docs/DECISIONS.md` are up to date

**Out of scope for now (don't build these; keep it simple):** bank account syncing, logins/cloud sync, logging every individual purchase, multiple currencies, investment tracking, and AI/chat features.

When everything is checked off, give me a short summary: the live URL, how to install it on my iPhone, what the reviewers found and fixed, and anything I should know.
