import type { DebtType, PayoffMethod, SpendingCategory } from '../types';

// Quick-add chips used by the "add" sheets.

export interface BillPreset {
  name: string;
  emoji: string;
}

export const BILL_PRESETS: BillPreset[] = [
  { name: 'Rent', emoji: '🏠' },
  { name: 'Phone', emoji: '📱' },
  { name: 'Car Insurance', emoji: '🚗' },
  { name: 'Internet', emoji: '🌐' },
  { name: 'Utilities', emoji: '💡' },
  { name: 'Netflix', emoji: '🎬' },
  { name: 'Spotify', emoji: '🎵' },
  { name: 'Gym', emoji: '🏋️' },
];

export interface DebtPreset {
  name: string;
  type: DebtType;
}

export const DEBT_PRESETS: DebtPreset[] = [
  { name: 'Student Loan', type: 'student' },
  { name: 'Credit Card', type: 'credit' },
  { name: 'Car Loan', type: 'car' },
];

export const DEBT_TYPE_INFO: Record<DebtType, { label: string; emoji: string }> = {
  student: { label: 'Student loan', emoji: '🎓' },
  credit: { label: 'Credit card', emoji: '💳' },
  car: { label: 'Car loan', emoji: '🚙' },
  personal: { label: 'Personal loan', emoji: '🤝' },
  medical: { label: 'Medical bill', emoji: '🏥' },
  other: { label: 'Other', emoji: '📄' },
};

export interface SpendingPreset {
  name: string;
  emoji: string;
  kind: SpendingCategory['kind'];
}

export const SPENDING_PRESETS: SpendingPreset[] = [
  { name: 'Fun Money', emoji: '🎉', kind: 'fun' },
  { name: 'Groceries', emoji: '🛒', kind: 'need' },
  { name: 'Gas', emoji: '⛽', kind: 'need' },
  { name: 'Eating Out', emoji: '🍔', kind: 'fun' },
];

export interface GoalPreset {
  name: string;
  emoji: string;
  isEmergencyFund: boolean;
}

export const GOAL_PRESETS: GoalPreset[] = [
  { name: 'Trip', emoji: '✈️', isEmergencyFund: false },
  { name: 'Emergency Fund', emoji: '🛟', isEmergencyFund: true },
  { name: 'New Car', emoji: '🚘', isEmergencyFund: false },
];

/** Emoji choices offered in the emoji picker. */
export const EMOJI_CHOICES = [
  '🏠', '📱', '🚗', '🌐', '💡', '🎬', '🎵', '🏋️', '💧', '🔥', '🛡️', '🐶',
  '🛒', '⛽', '🍔', '☕', '🎉', '🎮', '👗', '💇', '🎁', '📚', '💊', '👶',
  '✈️', '🏖️', '🛟', '🚘', '💍', '🎓', '💻', '🏡', '🎄', '🐷', '💰', '📦',
];

/** Payoff methods in plain words (Debt screen toggle and Settings). */
export const METHOD_INFO: Record<PayoffMethod, { label: string; text: string }> = {
  avalanche: {
    label: 'Save the most money',
    text: 'Pays off the highest interest rate first. You pay the least interest overall.',
  },
  snowball: {
    label: 'Quick wins',
    text: 'Pays off the smallest balance first. You knock out whole debts sooner, which feels great.',
  },
};
