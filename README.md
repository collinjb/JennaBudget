# Budget

A super simple budget app for iPhone. Add your paychecks, bills, debt, savings goals, and fun money, and it shows you
how much is left over, when you'll be debt-free, and a Smart Plan for splitting your money.

**Live app:** https://collinjb.github.io/JennaBudget/

## Install it on your iPhone

1. Open **https://collinjb.github.io/JennaBudget/** in **Safari**.
2. Tap the **Share** button (the square with an arrow pointing up).
3. Scroll down and tap **Add to Home Screen**.
4. Tap **Add**.

The **Budget** icon is now on your home screen. It opens full-screen like a normal app and works without internet.

Tip: on your computer, open `docs/qr.png` and point your iPhone camera at it to open the link.

## Your data (please read)

- **Everything stays on your phone.** No account, no login, nothing is sent anywhere.
- **Use the home-screen icon, not a Safari tab.** iPhone keeps them separate, so data typed into a Safari tab won't show up
  in the home-screen app (and the other way around).
- **Back up every week or two:** open the app → ⚙️ Settings → **Back up my data** → save the file to iCloud Drive (Files),
  email it to yourself, or AirDrop it. To get your data back (new phone, deleted icon), open the app → Settings →
  **Restore from backup** and pick that file.
- **Deleting the home-screen icon, or clearing Safari's website data, can erase your budget.** Back up first.
- **Updates:** when a new version is published, the app shows "A new version is ready". Tap **Refresh**. Your data stays.

## For making changes later

Requirements: Node.js 22+.

```bash
npm install          # once
npm run dev          # run locally at http://localhost:5173
npm test             # unit tests (money math, storage)
npx playwright install webkit   # once, for end-to-end tests
npm run e2e          # end-to-end tests on Safari's engine with iPhone screen sizes
npm run lint         # code checks
npm run build        # production build into dist/
```

**Publishing:** every push to `main` on GitHub automatically checks, builds, and publishes the app to GitHub Pages
(`.github/workflows/deploy.yml`). One-time setup in the repo: Settings → Pages → Source: **GitHub Actions**.
Installed copies pick up the new version automatically.

**Never change the web address** (repo name, `BASE_PATH`, or host) after installing. The iPhone ties the app and its
data to the address. If it ever has to change, back up first and restore in the new app.

Other scripts: `npm run icons` regenerates the app icon and launch screens from `scripts/icon.svg`;
`npm run qr -- <url>` writes `docs/qr.png`. Smoke-test the live site with
`BASE_URL=https://collinjb.github.io/JennaBudget/ npx playwright test`.

## How it's built

- Vite + React + TypeScript, plain CSS, no runtime network requests.
- `src/lib/`: all money math (integer cents, local dates): monthly totals, paydays, debt payoff, goals, Smart Plan.
- `src/storage/`: saving to the phone, backups, and recovery from damaged data.
- `src/pwa/`: home-screen app pieces (update banner, error and recovery screens, theme).
- `src/screens/`, `src/components/`, `src/styles/`: the UI.
- `docs/SPEC.md`: what the app does, every formula, and the Smart Plan rules. `docs/DECISIONS.md`: why things are the way they are.

The Smart Plan uses general budgeting guidelines, not professional financial advice.
