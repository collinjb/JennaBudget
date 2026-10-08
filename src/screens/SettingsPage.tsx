import { useRef } from 'react';
import { Card } from '../components/Card';
import { useConfirm } from '../components/ConfirmDialog';
import { IconRestore, IconShare } from '../components/Icons';
import { PageHeader } from '../components/PageHeader';
import { SegmentedControl } from '../components/Select';
import { useToast } from '../components/Toast';
import { formatDate } from '../lib/dates';
import { makeExampleBudget } from '../lib/exampleData';
import { METHOD_INFO } from '../lib/presets';
import { installContext } from '../pwa/standalone';
import { useBudget } from '../state/store';
import { useToday } from '../state/useToday';
import { shareOrDownloadBackup } from '../storage/storage';
import { DEFAULT_SETTINGS, emptyBudget, type PayoffMethod, type ThemeSetting } from '../types';
import { useNav } from './nav';
import { useRestoreBackup } from './useRestore';

/** Shown in About: the version in package.json (injected at build time by vite.config.ts). */
export const APP_VERSION = __APP_VERSION__;

export function SettingsPage() {
  const { data, actions } = useBudget();
  const today = useToday();
  const nav = useNav();
  const confirm = useConfirm();
  const toast = useToast();
  const restore = useRestoreBackup();
  const s = data.settings;
  const install = installContext();
  const backingUp = useRef(false);

  const backup = async () => {
    // A double tap must not open the share sheet twice (or share and also download).
    if (backingUp.current) return;
    backingUp.current = true;
    try {
      const result = await shareOrDownloadBackup(data, today);
      if (result === 'cancelled') return;
      actions.updateSettings({ lastBackupAt: today });
      toast.show({ message: result === 'shared' ? 'Backup saved' : 'Backup downloaded' });
    } finally {
      backingUp.current = false;
    }
  };

  const loadExample = async () => {
    const hasData =
      data.incomes.length + data.bills.length + data.debts.length + data.spending.length + data.goals.length > 0;
    if (hasData) {
      const ok = await confirm({
        title: 'Load the example budget?',
        message: 'This replaces your numbers with example ones. You can undo it right after.',
        confirmLabel: 'Load example',
      });
      if (!ok) return;
    }
    const previous = data;
    const example = makeExampleBudget(today);
    actions.replaceAll({ ...example, settings: { ...example.settings, theme: s.theme } });
    toast.show({
      message: 'Example budget loaded',
      actionLabel: 'Undo',
      onAction: () => actions.replaceAll(previous),
      dismissOnChange: true,
    });
    nav.back();
  };

  const clearExample = async () => {
    const ok = await confirm({
      title: 'Clear the example budget?',
      message: 'This removes the example numbers so you can set up your own.',
      confirmLabel: 'Clear',
    });
    if (!ok) return;
    actions.replaceAll({ ...emptyBudget(), settings: { ...DEFAULT_SETTINGS, theme: s.theme } });
    toast.show({ message: 'Example cleared. Start by adding your paycheck.' });
    nav.back();
  };

  const startOver = async () => {
    const first = await confirm({
      title: 'Start over?',
      message: 'This erases everything in Budget on this phone: paychecks, bills, debts, savings, and settings.',
      confirmLabel: 'Continue',
      destructive: true,
    });
    if (!first) return;
    const second = await confirm({
      title: 'Are you sure?',
      message: "This can't be undone. Back up first if you might want your numbers later.",
      confirmLabel: 'Erase everything',
      destructive: true,
    });
    if (!second) return;
    actions.reset();
    toast.show({ message: 'Everything was erased. Start by adding your paycheck.' });
    nav.back();
  };

  return (
    <div className="content stack settings">
      <PageHeader onBack={() => nav.back()} title="Settings" subtitle="Backups, look and feel, and help." />

      <Card title="Your data">
        <div className="settings-block">
          <button type="button" className="btn btn--primary btn--block" onClick={backup}>
            <IconShare size={20} /> Back up my data
          </button>
          <p className="field__helper settings-note">
            {s.lastBackupAt
              ? `Last backup: ${formatDate(s.lastBackupAt, 'short')}. Save it somewhere safe, like iCloud Drive.`
              : "You haven't made a backup yet. Your numbers only live on this phone, so back up now and then."}
          </p>
        </div>
        <div className="settings-block">
          <button type="button" className="btn btn--gray btn--block" onClick={restore.pick}>
            <IconRestore size={20} /> Restore from backup
          </button>
          <p className="field__helper settings-note">Pick a backup file you saved before. You'll see what's in it first.</p>
          {restore.input}
        </div>
      </Card>

      <Card title="Example budget">
        {s.isExample ? (
          <>
            <p className="muted small settings-note--top">You're looking at example numbers right now.</p>
            <button type="button" className="btn btn--secondary btn--block" onClick={clearExample}>
              Clear example budget
            </button>
          </>
        ) : (
          <>
            <p className="muted small settings-note--top">Want to see how it all works? Try it with made-up numbers.</p>
            <button type="button" className="btn btn--secondary btn--block" onClick={loadExample}>
              Load example budget
            </button>
          </>
        )}
      </Card>

      <Card title="Preferences">
        <div className="form">
          <SegmentedControl<ThemeSetting>
            label="Appearance"
            value={s.theme}
            onChange={(theme) => actions.updateSettings({ theme })}
            options={[
              { value: 'system', label: 'System' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
            helper={s.theme === 'system' ? 'Follows your iPhone’s light or dark setting.' : undefined}
          />
          <SegmentedControl<PayoffMethod>
            label="Which debt to pay off first"
            value={s.payoffMethod}
            onChange={(payoffMethod) => actions.updateSettings({ payoffMethod })}
            options={[
              { value: 'avalanche', label: METHOD_INFO.avalanche.label },
              { value: 'snowball', label: METHOD_INFO.snowball.label },
            ]}
            helper={METHOD_INFO[s.payoffMethod].text}
          />
        </div>
      </Card>

      <Card title="How to install on your iPhone">
        {install === 'installed' ? (
          <p className="notice notice--good settings-install-ok">
            <span>
              You're using the installed app<span aria-hidden="true"> ✓</span>
            </span>
          </p>
        ) : (
          <ol className="steps" role="list">
            <li>
              <span>Open this page in <strong>Safari</strong>.</span>
            </li>
            <li>
              <span>Tap the <strong>Share</strong> button (the square with an arrow pointing up).</span>
            </li>
            <li>
              <span>Scroll down and tap <strong>Add to Home Screen</strong>.</span>
            </li>
            <li>
              <span>Tap <strong>Add</strong>. Budget now opens like a regular app.</span>
            </li>
          </ol>
        )}
        <ul className="tips" role="list">
          <li>Your numbers stay on this phone. Nothing is sent anywhere.</li>
          <li>
            The home-screen app and Safari keep <strong>separate</strong> data, so enter your numbers in the home-screen
            app.
          </li>
          <li>Back up now and then (for example to iCloud Drive). Deleting the app icon can erase your numbers.</li>
        </ul>
      </Card>

      <Card title="About">
        <p className="about-line">
          <span>Budget</span>
          <span className="muted">Version {APP_VERSION}</span>
        </p>
        <p className="muted small">
          A simple budget that lives on your phone. No accounts, no ads, no tracking. These are general budgeting
          guidelines, not professional financial advice.
        </p>
      </Card>

      <button type="button" className="btn btn--danger-plain btn--block start-over" onClick={startOver}>
        Start over (erase everything)
      </button>
    </div>
  );
}
