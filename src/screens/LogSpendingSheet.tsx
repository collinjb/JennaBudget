import { useEffect, useRef, useState } from 'react';
import { BottomSheet } from '../components/BottomSheet';
import { Chip, ChipRow } from '../components/Chip';
import { useConfirm } from '../components/ConfirmDialog';
import { DateInput, isUsableDate } from '../components/DateInput';
import { cleanName, TextField } from '../components/Field';
import { MoneyInput, useMoneyField } from '../components/MoneyInput';
import { useToast } from '../components/Toast';
import { addDays, compareISO, formatDate } from '../lib/dates';
import { newId } from '../lib/ids';
import { formatMoney } from '../lib/money';
import { categorySpend, KEEP_SPEND_DAYS, type CategorySpend } from '../lib/spending';
import { useBudget } from '../state/store';
import { useToday } from '../state/useToday';
import type { Cents, ISODate, SpendEntry } from '../types';
import { q } from './shared';
import { leftText, periodWord, rememberLastCategory, startingCategory } from './spendingParts';

interface LogSpendingSheetProps {
  /** Start on this category (e.g. the row the sheet was opened from). */
  categoryId?: string | null;
  /** Edit (or delete) this purchase instead of logging a new one. */
  entry?: SpendEntry | null;
  onClose: () => void;
}

/**
 * "Log spending": how much, from which spending money, what for (optional) and when (today unless changed).
 * Saving takes it out of that category's week or month and shows what's left, with Undo. With `entry` it edits one
 * logged purchase instead (and can delete it, with Undo).
 */
export function LogSpendingSheet({ categoryId, entry, onClose }: LogSpendingSheetProps) {
  const { data, actions } = useBudget();
  const today = useToday();
  const toast = useToast();
  const confirm = useConfirm();
  const editing = !!entry;
  const spending = data.spending;
  const [catId, setCatId] = useState<string | null>(() => entry?.categoryId ?? startingCategory(spending, categoryId));
  const amount = useMoneyField(entry?.amount ?? null, { required: true, allowZero: false });
  const [note, setNote] = useState(entry?.note ?? '');
  const [date, setDate] = useState<string>(entry?.date ?? today);
  const [dateError, setDateError] = useState<string | null>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const category = spending.find((s) => s.id === catId) ?? null;
  // Older purchases are trimmed from the log after about 13 months, so don't accept them in the first place.
  const minDate = addDays(today, -KEEP_SPEND_DAYS);

  // The amount comes first: put the cursor there (this runs after the sheet itself takes focus).
  useEffect(() => {
    if (!editing) amountRef.current?.focus({ preventScroll: true });
  }, [editing]);

  const checkDate = (d: string): string | null => {
    if (!isUsableDate(d)) return 'Please pick a date.';
    if (compareISO(d, today) > 0) return 'Please pick today or an earlier day.';
    if (compareISO(d, minDate) < 0) return 'Please pick a day in the last year.';
    return null;
  };

  // What's left before and after this purchase (an edited purchase doesn't count against itself).
  const others = entry ? data.spendLog.filter((e) => e.id !== entry.id) : data.spendLog;
  const spend = category ? categorySpend(category, others, today) : null;
  const inPeriod = (s: CategorySpend, d: ISODate) =>
    isUsableDate(d) && compareISO(d, s.range.start) >= 0 && compareISO(d, s.range.end) < 0;
  const datedEarlier = !!spend && isUsableDate(date) && compareISO(date, spend.range.start) < 0;

  const save = () => {
    const cents = amount.validate();
    const dErr = checkDate(date);
    setDateError(dErr);
    if (cents === null || dErr || !category) return false;
    const item: SpendEntry = {
      id: entry?.id ?? newId(),
      categoryId: category.id,
      amount: cents,
      date,
      note: cleanName(note, ''),
    };
    actions.upsert('spendLog', item);
    if (!editing) {
      rememberLastCategory(category.id);
      const after = categorySpend(category, [...data.spendLog, item], today);
      const logged = `Logged ${formatMoney(cents)} for ${category.name}`;
      toast.show({
        message: inPeriod(after, date)
          ? `${logged} · ${leftText(after, category.period)}`
          : `${logged} on ${formatDate(date, 'short')}`,
        actionLabel: 'Undo',
        onAction: () => actions.remove('spendLog', item.id),
      });
    }
    return true;
  };

  const remove = async () => {
    if (!entry) return false;
    const money = formatMoney(entry.amount);
    const ok = await confirm({
      title: 'Delete this purchase?',
      message: `${entry.note ? `${entry.note}, ` : ''}${money} on ${formatDate(entry.date, 'short')}. You can undo this right after.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return false;
    const removed = actions.remove('spendLog', entry.id);
    if (!removed) return false;
    toast.show({
      message: entry.note ? `Deleted ${q(entry.note)} (${money})` : `Deleted the ${money} purchase`,
      actionLabel: 'Undo',
      onAction: () => actions.restore(removed),
    });
    return true;
  };

  if (spending.length === 0) {
    return (
      <BottomSheet title="Log spending" onClose={onClose} cancelLabel="Close" testId="log-spending-sheet">
        <p className="sheet__intro">Add a spending category first, like Fun Money.</p>
      </BottomSheet>
    );
  }

  return (
    <BottomSheet
      title={editing ? 'Edit purchase' : 'Log spending'}
      onClose={onClose}
      onSave={save}
      bigSaveLabel={editing ? 'Save changes' : 'Log spending'}
      onDelete={editing ? remove : undefined}
      deleteLabel="Delete this purchase"
      testId={editing ? 'spend-entry-sheet' : 'log-spending-sheet'}
    >
      <MoneyInput label="How much did you spend?" {...amount.props} big inputRef={amountRef} />
      <div className="log-pick">
        <ChipRow title="Take it out of">
          {spending.map((s) => (
            <Chip key={s.id} emoji={s.emoji} label={s.name} selected={s.id === catId} onClick={() => setCatId(s.id)} />
          ))}
        </ChipRow>
        {category && spend && (
          <LeftPreview
            name={category.name}
            week={category.period === 'week'}
            spend={spend}
            draft={datedEarlier ? null : amount.peek()}
          />
        )}
      </div>
      <TextField
        label={
          <>
            What was it for? <span className="field__optional">(optional)</span>
          </>
        }
        value={note}
        onChange={setNote}
        placeholder="Like Movies"
        autoCapitalize="sentences"
      />
      <DateInput
        label="When?"
        value={date}
        min={minDate}
        max={today}
        onChange={(v) => {
          setDate(v);
          setDateError(null);
        }}
        error={dateError}
        helper={
          datedEarlier && category
            ? `That's before this ${periodWord(category.period)}, so it doesn't change what's left this ${periodWord(category.period)}.`
            : undefined
        }
      />
    </BottomSheet>
  );
}

/** "Fun Money has $13 left this week. After this: $1 left." (or "… This puts you $3 over.") */
function LeftPreview({
  name,
  week,
  spend,
  draft,
}: {
  name: string;
  week: boolean;
  spend: CategorySpend;
  /** The amount typed so far (null while empty or not a valid amount). */
  draft: Cents | null;
}) {
  const w = week ? 'week' : 'month';
  const after = draft !== null ? spend.left - draft : null;
  return (
    <p className="log-preview" data-testid="log-preview">
      {spend.over ? (
        <>
          {name} is already <strong>{formatMoney(-spend.left)} over</strong> this {w}.
        </>
      ) : (
        <>
          {name} has <strong>{formatMoney(spend.left)} left</strong> this {w}.
        </>
      )}
      {after !== null &&
        (after >= 0 ? (
          <>
            {' '}
            After this: <strong>{formatMoney(after)} left</strong>.
          </>
        ) : (
          <>
            {' '}
            After this: <strong className="log-preview__over">{formatMoney(-after)} over</strong>.
          </>
        ))}
    </p>
  );
}
