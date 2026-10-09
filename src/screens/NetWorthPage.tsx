import { useId, useMemo, useState } from 'react';
import { BottomSheet } from '../components/BottomSheet';
import { Card } from '../components/Card';
import { LineChart } from '../components/Charts';
import { useConfirm } from '../components/ConfirmDialog';
import { DateInput, isUsableDate } from '../components/DateInput';
import { EmptyState } from '../components/EmptyState';
import { cleanName, Field, TextField } from '../components/Field';
import { IconChevronRight, IconPlus } from '../components/Icons';
import { Money } from '../components/Money';
import { MoneyInput, useMoneyField } from '../components/MoneyInput';
import { PageHeader } from '../components/PageHeader';
import { ChoiceList, Select, type Option } from '../components/Select';
import { useToast } from '../components/Toast';
import { compareISO } from '../lib/dates';
import { newId } from '../lib/ids';
import { formatMoney } from '../lib/money';
import {
  ACCOUNT_TYPE_INFO,
  creditBand,
  isStale,
  MAX_CREDIT_SCORE,
  MIN_CREDIT_SCORE,
  netWorth,
  parseCreditScore,
  scoreSummary,
  sortScores,
} from '../lib/networth';
import { useBudget } from '../state/store';
import { useToday } from '../state/useToday';
import type { Account, AccountType, CreditScore, ISODate } from '../types';
import { useNav } from './nav';
import { BandBadge, bandOf, bandRangeText, ScoreChange, shortDate, signedMoney } from './netWorthParts';
import { useDeleteWithUndo } from './shared';

/** How many past credit checks show before "Show all". */
const HISTORY_SHOWN = 6;

type SheetState =
  | { kind: 'account'; account: Account | null }
  | { kind: 'balance'; account: Account }
  | { kind: 'score'; score: CreditScore | null };

export function NetWorthPage() {
  const { data } = useBudget();
  const today = useToday();
  const nav = useNav();
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [showAll, setShowAll] = useState(false);
  const heroId = useId();

  const accounts = data.accounts;
  const nw = useMemo(() => netWorth(accounts, data.debts), [accounts, data.debts]);
  const summary = useMemo(() => scoreSummary(data.creditScores), [data.creditScores]);
  const sorted = useMemo(() => sortScores(data.creditScores), [data.creditScores]);
  const newestFirst = useMemo(() => [...sorted].reverse(), [sorted]);
  const latest = summary.latest;
  const hasAccounts = accounts.length > 0;
  const negative = hasAccounts && nw.netWorth < 0;
  const history = showAll ? newestFirst : newestFirst.slice(0, HISTORY_SHOWN);

  const addAccount = () => setSheet({ kind: 'account', account: null });
  const addScore = () => setSheet({ kind: 'score', score: null });

  return (
    <div className="content stack networth">
      <PageHeader
        onBack={() => nav.back()}
        title="Net worth"
        subtitle="What you have, what you owe, and your credit score."
      />

      {/* 1. The big number, and the plain math behind it. */}
      <section className={`card nw-hero${negative ? ' nw-hero--neg' : ''}`} aria-labelledby={heroId}>
        <p className="bignum__label" id={heroId}>
          Your net worth
        </p>
        {hasAccounts ? (
          <p
            className={`nw-hero__value ${negative ? 'tone-over' : 'tone-left'}`}
            data-testid="networth-total"
            data-cents={nw.netWorth}
          >
            {signedMoney(nw.netWorth)}
          </p>
        ) : (
          <p className="nw-hero__prompt">Add your accounts below to see your net worth.</p>
        )}
        {(hasAccounts || nw.owed > 0) && (
          <dl className="nw-math">
            <div className="nw-math__row">
              <dt>What you have</dt>
              <dd>
                <Money cents={nw.assets} testId="networth-have" />
              </dd>
            </div>
            <div className="nw-math__row">
              <dt>What you owe</dt>
              <dd>
                <span className="nw-math__op" aria-hidden="true">
                  −{' '}
                </span>
                <Money cents={nw.owed} testId="networth-owe" />
              </dd>
            </div>
          </dl>
        )}
        <p className="muted small nw-hero__note">
          {negative
            ? "You owe more than you have right now. That's common while you're paying off debt, and it goes up with every payment. "
            : 'What you have minus what you owe. '}
          Your debts come from the Debt tab.
        </p>
        <button type="button" className="card__action" onClick={() => nav.goTab('debt')}>
          <span>{data.debts.length > 0 ? 'See your debts' : 'Go to the Debt tab'}</span>
          <IconChevronRight size={18} />
        </button>
      </section>

      {/* 2. Accounts: what you have. */}
      <div className="section-head section-head--spaced">
        <h2 className="section-title">Accounts</h2>
        {hasAccounts && (
          <span className="section-head__aside">
            <Money cents={nw.assets} /> in all
          </span>
        )}
      </div>
      <p className="section-note">What you have: money in the bank and saved for later.</p>
      {!hasAccounts ? (
        <EmptyState
          compact
          emoji="🏦"
          text="Add your savings, Roth IRA, retirement (like SERS) and other accounts."
          buttonLabel="Add an account"
          onClick={addAccount}
        />
      ) : (
        <>
          <ul className="list" role="list">
            {accounts.map((a) => (
              <AccountRow
                key={a.id}
                account={a}
                today={today}
                onEdit={() => setSheet({ kind: 'account', account: a })}
                onUpdate={() => setSheet({ kind: 'balance', account: a })}
              />
            ))}
          </ul>
          {nw.byType.length >= 2 && (
            <ul className="type-totals" role="list" aria-label="Totals by kind of account" data-testid="networth-by-type">
              {nw.byType.map((t) => (
                <li key={t.type} className="type-totals__item">
                  <span aria-hidden="true">{ACCOUNT_TYPE_INFO[t.type].emoji} </span>
                  {ACCOUNT_TYPE_INFO[t.type].short} <Money cents={t.total} className="type-totals__amt" />
                </li>
              ))}
            </ul>
          )}
          <button type="button" className="btn btn--secondary btn--block" onClick={addAccount}>
            <IconPlus size={18} /> Add an account
          </button>
        </>
      )}

      {/* 3. Credit score. */}
      <div className="section-head section-head--spaced">
        <h2 className="section-title">Credit score</h2>
      </div>
      <p className="section-note">You can find it free in your bank or credit card app.</p>
      {!latest ? (
        <EmptyState
          compact
          emoji="📊"
          text="Add your credit score to keep an eye on it."
          buttonLabel="Add your credit score"
          onClick={addScore}
        />
      ) : (
        <>
          <Card className="score-card">
            <p className="bignum__label">Your latest score</p>
            <div className="score-card__top">
              <p className="score-card__num" data-testid="credit-score-latest">
                {latest.score}
              </p>
              <BandBadge score={latest.score} testId="credit-score-band" />
            </div>
            <ScoreChange summary={summary} today={today} testId="credit-score-change" />
            <p className="muted small score-card__meta">
              Checked {latest.date === today ? 'today' : shortDate(latest.date, today)}. {bandRangeText(latest.score)}{' '}
              Scores go from {MIN_CREDIT_SCORE} to {MAX_CREDIT_SCORE}, and higher is better.
            </p>
            <button type="button" className="btn btn--secondary btn--block score-card__btn" onClick={addScore}>
              Update credit score
            </button>
          </Card>

          <Card title="Score history">
            {sorted.length >= 2 && <ScoreChart scores={sorted} today={today} />}
            <ul className="score-history" role="list">
              {history.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className="score-row"
                    aria-label={`${s.score}, ${creditBand(s.score).label}, checked ${shortDate(s.date, today)}. Edit`}
                    onClick={() => setSheet({ kind: 'score', score: s })}
                  >
                    <span className="score-row__date">{shortDate(s.date, today)}</span>
                    <span className="score-row__score">{s.score}</span>
                    <BandBadge score={s.score} small />
                    <IconChevronRight size={18} className="row__chev" />
                  </button>
                </li>
              ))}
            </ul>
            {newestFirst.length > HISTORY_SHOWN && (
              <button type="button" className="link-btn score-history__more" onClick={() => setShowAll((v) => !v)}>
                {showAll ? 'Show fewer' : `Show all ${newestFirst.length}`}
              </button>
            )}
          </Card>
        </>
      )}

      {sheet?.kind === 'account' && (
        <AccountSheet account={sheet.account} today={today} onClose={() => setSheet(null)} />
      )}
      {sheet?.kind === 'balance' && (
        <AccountBalanceSheet account={sheet.account} today={today} onClose={() => setSheet(null)} />
      )}
      {sheet?.kind === 'score' && (
        <CreditScoreSheet
          item={sheet.score}
          first={!latest}
          today={today}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  );
}

/** One account: tap the row to edit it; "Update" is a shortcut for just the balance. */
function AccountRow({
  account: a,
  today,
  onEdit,
  onUpdate,
}: {
  account: Account;
  today: ISODate;
  onEdit: () => void;
  onUpdate: () => void;
}) {
  const info = ACCOUNT_TYPE_INFO[a.type];
  const name = a.name.trim().toLowerCase();
  const showType = name !== info.short.toLowerCase() && name !== info.label.toLowerCase();
  const stale = isStale(a.updatedAt, today);
  const when = a.updatedAt === today ? 'today' : shortDate(a.updatedAt, today);
  return (
    <li className="acct" data-testid={`account-row-${a.id}`}>
      <button
        type="button"
        className="acct__tap"
        onClick={onEdit}
        aria-label={`${a.name}${showType ? `, ${info.short}` : ''}, ${formatMoney(a.balance)}, updated ${when}.${
          stale ? ' Time to update?' : ''
        } Edit`}
      >
        <span className="row__icon" aria-hidden="true">
          {info.emoji}
        </span>
        <span className="acct__main">
          <span className="row__title">{a.name}</span>
          {showType && <span className="row__sub">{info.short}</span>}
          <span className="acct__updated">Updated {when}</span>
          {stale && <span className="acct__stale">Time to update?</span>}
        </span>
        <span className="acct__end">
          <Money cents={a.balance} className="row__amount" />
          {/* Keeps room for the Update button, which sits on top of this spot (same size at any text size). */}
          <span className="btn btn--sm acct__slot" aria-hidden="true">
            Update
          </span>
        </span>
      </button>
      <button
        type="button"
        className="btn btn--secondary btn--sm acct__update"
        aria-label={`Update balance for ${a.name}`}
        onClick={onUpdate}
      >
        Update
      </button>
    </li>
  );
}

/** The score over time (oldest to newest), scaled to the scores themselves so a change of 10 points is visible. */
function ScoreChart({ scores, today }: { scores: CreditScore[]; today: ISODate }) {
  const values = scores.map((s) => s.score);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const min = Math.max(MIN_CREDIT_SCORE, Math.floor((lo - 20) / 50) * 50);
  const max = Math.min(MAX_CREDIT_SCORE, Math.ceil((hi + 20) / 50) * 50);
  const first = scores[0];
  const last = scores[scores.length - 1];
  return (
    <div className="score-chart">
      <LineChart
        values={values}
        tone="left"
        min={min}
        max={max}
        formatTop={(v) => String(v)}
        formatBottom={(v) => String(v)}
        startLabel={shortDate(first.date, today)}
        endLabel={shortDate(last.date, today)}
        ariaLabel={`Your credit score went from ${first.score} on ${shortDate(first.date, today)} to ${last.score} on ${shortDate(last.date, today)}.`}
      />
    </div>
  );
}

// The three the owner asked about first, then the rest.
const TYPE_ORDER: AccountType[] = ['savings', 'roth', 'retirement', 'checking', 'investment', 'other'];

const TYPE_HINTS: Record<AccountType, string> = {
  savings: 'Money in the bank that you set aside',
  roth: 'A retirement account you put money into yourself',
  retirement: 'Money for later through your job',
  checking: 'Your everyday bank account',
  investment: 'Stocks or funds you bought',
  other: 'Anything else that holds money for you',
};

const NAME_PLACEHOLDER: Record<AccountType, string> = {
  savings: 'Like Savings',
  roth: 'Like Roth IRA',
  retirement: 'Like SERS',
  checking: 'Like Checking',
  investment: 'Like Stocks',
  other: 'Like Cash at home',
};

const BALANCE_HELPER: Record<AccountType, string> = {
  savings: 'Check your bank app for the balance.',
  roth: 'Check the app or latest statement for your Roth IRA.',
  retirement: 'Check your latest SERS (or other retirement) statement or website.',
  checking: 'Check your bank app for the balance.',
  investment: 'Check the app or latest statement for what it’s worth now.',
  other: 'Your best guess is fine.',
};

const TYPE_CHOICES: Option<AccountType>[] = TYPE_ORDER.map((t) => ({
  value: t,
  label: ACCOUNT_TYPE_INFO[t].label,
  hint: TYPE_HINTS[t],
  emoji: ACCOUNT_TYPE_INFO[t].emoji,
}));

// The edit sheet's picker is one line wide, so the long retirement label gets a shorter form there.
const TYPE_SELECT: Option<AccountType>[] = TYPE_ORDER.map((t) => ({
  value: t,
  label: t === 'retirement' ? `${ACCOUNT_TYPE_INFO[t].short} (like SERS)` : ACCOUNT_TYPE_INFO[t].label,
}));

function AccountSheet({ account, today, onClose }: { account: Account | null; today: ISODate; onClose: () => void }) {
  const { actions } = useBudget();
  const del = useDeleteWithUndo();
  const [type, setType] = useState<AccountType>(account?.type ?? 'savings');
  const [name, setName] = useState(account?.name ?? '');
  const balance = useMoneyField(account?.balance ?? null, { required: true });

  const save = () => {
    const cents = balance.validate();
    if (cents === null) return false;
    actions.upsert('accounts', {
      id: account?.id ?? newId(),
      name: cleanName(name, ACCOUNT_TYPE_INFO[type].short),
      type,
      balance: cents,
      // Only a new balance counts as "updated" (renaming shouldn't hide the "Time to update?" hint).
      updatedAt: account && account.balance === cents ? account.updatedAt : today,
    });
    return true;
  };

  return (
    <BottomSheet
      title={account ? 'Edit account' : 'Add an account'}
      onClose={onClose}
      onSave={save}
      bigSaveLabel={account ? 'Save changes' : 'Add account'}
      onDelete={account ? () => del('accounts', account.id, account.name) : undefined}
      deleteLabel="Delete this account"
      testId="account-sheet"
    >
      {account ? (
        <Select
          label="What kind of account?"
          value={type}
          options={TYPE_SELECT}
          onChange={setType}
          decoration={ACCOUNT_TYPE_INFO[type].emoji}
        />
      ) : (
        <ChoiceList label="What kind of account?" value={type} options={TYPE_CHOICES} onChange={setType} />
      )}
      <TextField label="Name" value={name} onChange={setName} placeholder={NAME_PLACEHOLDER[type]} />
      <MoneyInput label="How much is in it now?" {...balance.props} big helper={BALANCE_HELPER[type]} />
    </BottomSheet>
  );
}

/** "Update balance": just the new balance (marks it updated today, even when it's the same). */
function AccountBalanceSheet({ account, today, onClose }: { account: Account; today: ISODate; onClose: () => void }) {
  const { actions } = useBudget();
  const balance = useMoneyField(account.balance, { required: true });
  const save = () => {
    const cents = balance.validate();
    if (cents === null) return false;
    actions.upsert('accounts', { ...account, balance: cents, updatedAt: today });
    return true;
  };
  return (
    <BottomSheet
      title="Update balance"
      onClose={onClose}
      onSave={save}
      bigSaveLabel="Update balance"
      testId="account-balance-sheet"
    >
      <p className="sheet__intro">
        <span aria-hidden="true">{ACCOUNT_TYPE_INFO[account.type].emoji} </span>
        Look up <strong>{account.name}</strong> in its app, website or latest statement, and enter what's in it now.
      </p>
      <MoneyInput label="Balance now" {...balance.props} big />
    </BottomSheet>
  );
}

function CreditScoreSheet({
  item,
  first,
  today,
  onClose,
}: {
  item: CreditScore | null;
  /** No scores yet ("Add your credit score" instead of "Update"). */
  first: boolean;
  today: ISODate;
  onClose: () => void;
}) {
  const { actions } = useBudget();
  const confirm = useConfirm();
  const toast = useToast();
  const [value, setValue] = useState(item ? String(item.score) : '');
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState<string>(item?.date ?? today);
  const [dateError, setDateError] = useState<string | null>(null);

  const checkDate = (d: string): string | null => {
    if (!isUsableDate(d)) return 'Please pick a date.';
    if (compareISO(d, today) > 0) return 'Please pick today or an earlier day.';
    return null;
  };

  const save = () => {
    const r = parseCreditScore(value);
    const dErr = checkDate(date);
    setError(r.ok ? null : r.error);
    setDateError(dErr);
    if (!r.ok || dErr) return false;
    actions.upsert('creditScores', { id: item?.id ?? newId(), score: r.score, date });
    return true;
  };

  const remove = async () => {
    if (!item) return false;
    const when = shortDate(item.date, today);
    const ok = await confirm({
      title: 'Delete this credit score?',
      message: `${item.score} from ${when}. You can undo this right after.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return false;
    const removed = actions.remove('creditScores', item.id);
    if (!removed) return false;
    toast.show({
      message: `Deleted the ${item.score} from ${when}`,
      actionLabel: 'Undo',
      onAction: () => actions.restore(removed),
    });
    return true;
  };

  const parsed = parseCreditScore(value);
  return (
    <BottomSheet
      title={item ? 'Edit credit score' : first ? 'Add your credit score' : 'Update credit score'}
      onClose={onClose}
      onSave={save}
      bigSaveLabel={item ? 'Save changes' : 'Save score'}
      onDelete={item ? remove : undefined}
      deleteLabel="Delete this score"
      testId="credit-score-sheet"
    >
      {!item && (
        <p className="sheet__intro">
          Look in your bank or credit card app; most show it for free. Checking it yourself never lowers it.
        </p>
      )}
      <Field
        label="Your credit score"
        error={error}
        helper={
          error
            ? undefined
            : parsed.ok
              ? `That's ${bandOf(parsed.score)}.`
              : `A number from ${MIN_CREDIT_SCORE} to ${MAX_CREDIT_SCORE}.`
        }
      >
        {({ inputId, describedBy, invalid }) => (
          <div className="field__control field__control--big">
            <input
              id={inputId}
              className="input input--score"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              enterKeyHint="done"
              value={value}
              aria-invalid={invalid || undefined}
              aria-describedby={describedBy}
              onChange={(e) => {
                setValue(e.target.value);
                if (error) setError(null);
              }}
              onBlur={() => {
                if (value.trim() === '') return;
                const r = parseCreditScore(value);
                setError(r.ok ? null : r.error);
              }}
            />
          </div>
        )}
      </Field>
      <DateInput
        label="When did you check it?"
        value={date}
        max={today}
        onChange={(v) => {
          setDate(v);
          setDateError(null);
        }}
        error={dateError}
      />
    </BottomSheet>
  );
}
