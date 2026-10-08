import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonthsClamped,
  addMonthsToKey,
  compareISO,
  dateInMonth,
  dayOfWeek,
  daysInMonth,
  diffDays,
  formatDate,
  formatDuration,
  formatMonth,
  fromISODate,
  isValidISODate,
  isValidMonthKey,
  monthFromIndex,
  monthIndex,
  monthKey,
  monthStart,
  monthsBetween,
  ordinal,
  toISODate,
  todayISO,
} from './dates';

describe('local date conversion', () => {
  it('todayISO / toISODate use LOCAL parts', () => {
    expect(todayISO(new Date(2026, 9, 8, 23, 59))).toBe('2026-10-08');
    expect(todayISO(new Date(2026, 0, 1, 0, 0))).toBe('2026-01-01');
    expect(toISODate(new Date(2028, 1, 29, 12))).toBe('2028-02-29');
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('fromISODate returns local midnight on the same calendar day', () => {
    const d = fromISODate('2026-10-10');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(9);
    expect(d.getDate()).toBe(10);
    expect(d.getHours()).toBe(0);
    expect(toISODate(fromISODate('2026-03-08'))).toBe('2026-03-08');
    expect(toISODate(fromISODate('2026-11-01'))).toBe('2026-11-01');
    expect(toISODate(fromISODate('0099-05-05'))).toBe('0099-05-05');
  });

  it('round-trips every day for several years', () => {
    let d = '2025-01-01';
    for (let i = 0; i < 365 * 4 + 1; i++) {
      expect(toISODate(fromISODate(d))).toBe(d);
      d = addDays(d, 1);
    }
    expect(d).toBe('2029-01-01');
  });
});

describe('isValidISODate', () => {
  it.each(['2026-10-08', '2028-02-29', '2026-12-31', '2026-01-01', '2000-02-29'])('accepts %s', (s) => {
    expect(isValidISODate(s)).toBe(true);
  });
  it.each([
    '2026-02-30',
    '2026-02-29',
    '1900-02-29',
    '2026-13-01',
    '2026-00-10',
    '2026-04-31',
    '2026-10-00',
    '2026-1-5',
    '26-10-08',
    '2026/10/08',
    'garbage',
    '',
    '2026-10-08T00:00',
    ' 2026-10-08',
  ])('rejects %j', (s) => {
    expect(isValidISODate(s)).toBe(false);
  });
  it('rejects non-strings', () => {
    expect(isValidISODate(undefined as unknown as string)).toBe(false);
    expect(isValidISODate(20261008 as unknown as string)).toBe(false);
  });
  it('isValidMonthKey', () => {
    expect(isValidMonthKey('2026-10')).toBe(true);
    expect(isValidMonthKey('2026-13')).toBe(false);
    expect(isValidMonthKey('2026-1')).toBe(false);
  });
});

describe('day and month arithmetic', () => {
  it('addDays across month/year ends and leap days', () => {
    expect(addDays('2026-10-08', 1)).toBe('2026-10-09');
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2026-10-08', 0)).toBe('2026-10-08');
    expect(addDays('2026-10-08', 365)).toBe('2027-10-08');
  });

  it('addDays across US DST changes (2026-03-08, 2026-11-01)', () => {
    expect(addDays('2026-03-07', 1)).toBe('2026-03-08');
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09');
    expect(addDays('2026-03-01', 14)).toBe('2026-03-15');
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02');
    expect(addDays('2026-10-25', 14)).toBe('2026-11-08');
    expect(addDays('2026-11-08', -14)).toBe('2026-10-25');
  });

  it('diffDays is DST-safe', () => {
    expect(diffDays('2026-03-07', '2026-03-09')).toBe(2);
    expect(diffDays('2026-03-01', '2026-03-31')).toBe(30);
    expect(diffDays('2026-10-31', '2026-11-02')).toBe(2);
    expect(diffDays('2026-11-02', '2026-10-31')).toBe(-2);
    expect(diffDays('2026-01-01', '2027-01-01')).toBe(365);
    expect(diffDays('2028-01-01', '2029-01-01')).toBe(366);
    expect(diffDays('2026-10-08', '2026-10-08')).toBe(0);
    for (let n = -400; n <= 400; n += 13) expect(diffDays('2026-10-08', addDays('2026-10-08', n))).toBe(n);
  });

  it('addMonthsClamped clamps to month end', () => {
    expect(addMonthsClamped('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonthsClamped('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonthsClamped('2026-03-31', 1)).toBe('2026-04-30');
    expect(addMonthsClamped('2026-01-31', 2)).toBe('2026-03-31');
    expect(addMonthsClamped('2026-12-15', 1)).toBe('2027-01-15');
    expect(addMonthsClamped('2026-01-15', -1)).toBe('2025-12-15');
    expect(addMonthsClamped('2028-02-29', 12)).toBe('2029-02-28');
    expect(addMonthsClamped('2026-10-08', 0)).toBe('2026-10-08');
    expect(addMonthsClamped('2026-10-08', -22)).toBe('2024-12-08');
  });

  it('daysInMonth and dateInMonth', () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2100, 2)).toBe(28);
    expect(daysInMonth(2000, 2)).toBe(29);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 12)).toBe(31);
    expect(dateInMonth(2026, 2, 31)).toBe('2026-02-28');
    expect(dateInMonth(2028, 2, 30)).toBe('2028-02-29');
    expect(dateInMonth(2026, 4, 31)).toBe('2026-04-30');
    expect(dateInMonth(2026, 10, 8)).toBe('2026-10-08');
  });

  it('month keys', () => {
    expect(monthKey('2026-10-08')).toBe('2026-10');
    expect(monthStart('2026-10')).toBe('2026-10-01');
    expect(addMonthsToKey('2026-10', 3)).toBe('2027-01');
    expect(addMonthsToKey('2026-01', -1)).toBe('2025-12');
    expect(addMonthsToKey('2026-10', 41)).toBe('2030-03');
    expect(monthIndex('2026-01')).toBe(2026 * 12);
    expect(monthFromIndex(monthIndex('2029-03'))).toBe('2029-03');
    expect(monthsBetween('2026-10', '2027-05')).toBe(7);
    expect(monthsBetween('2027-05', '2026-10')).toBe(-7);
    expect(monthsBetween('2026-10', '2026-10')).toBe(0);
  });

  it('compareISO sorts chronologically', () => {
    expect(['2026-10-10', '2025-12-31', '2026-01-05'].sort(compareISO)).toEqual([
      '2025-12-31',
      '2026-01-05',
      '2026-10-10',
    ]);
    expect(compareISO('2026-10-10', '2026-10-10')).toBe(0);
  });

  it('dayOfWeek', () => {
    expect(dayOfWeek('2026-10-09')).toBe(5); // Friday
    expect(dayOfWeek('2026-10-11')).toBe(0); // Sunday
    expect(dayOfWeek('2028-02-29')).toBe(2); // Tuesday
  });
});

describe('formatting', () => {
  it('formatDate styles', () => {
    expect(formatDate('2026-10-10', 'short')).toBe('Oct 10');
    expect(formatDate('2026-10-09', 'weekday')).toBe('Fri, Oct 9');
    expect(formatDate('2026-10-10', 'weekday')).toBe('Sat, Oct 10');
    expect(formatDate('2026-10-10', 'long')).toBe('October 10, 2026');
    expect(formatDate('2026-10-10', 'numeric')).toBe('10/10/2026');
    expect(formatDate('2026-03-08', 'short')).toBe('Mar 8');
    expect(formatDate('2026-11-01', 'long')).toBe('November 1, 2026');
    expect(formatDate('2027-01-01', 'numeric')).toBe('1/1/2027');
  });

  it('formatMonth styles', () => {
    expect(formatMonth('2029-03')).toBe('March 2029');
    expect(formatMonth('2029-03', 'long')).toBe('March 2029');
    expect(formatMonth('2029-03', 'short')).toBe('Mar 2029');
    expect(formatMonth('2029-03', 'month')).toBe('March');
    expect(formatMonth('2026-12', 'month')).toBe('December');
    expect(formatMonth('2027-01', 'short')).toBe('Jan 2027');
  });

  it('formatters never throw on bad input', () => {
    expect(formatDate('2026-02-30', 'long')).toBe('2026-02-30');
    expect(formatDate('garbage', 'short')).toBe('garbage');
    expect(formatMonth('2026-13')).toBe('2026-13');
  });

  it('formatDuration', () => {
    expect(formatDuration(41)).toBe('3 yrs 5 mo');
    expect(formatDuration(12)).toBe('1 yr');
    expect(formatDuration(24)).toBe('2 yrs');
    expect(formatDuration(13)).toBe('1 yr 1 mo');
    expect(formatDuration(7)).toBe('7 mo');
    expect(formatDuration(1)).toBe('1 mo');
    expect(formatDuration(0)).toBe('this month');
    expect(formatDuration(-3)).toBe('this month');
    expect(formatDuration(600)).toBe('50 yrs');
  });

  it('ordinal', () => {
    const cases: [number, string][] = [
      [1, '1st'],
      [2, '2nd'],
      [3, '3rd'],
      [4, '4th'],
      [10, '10th'],
      [11, '11th'],
      [12, '12th'],
      [13, '13th'],
      [21, '21st'],
      [22, '22nd'],
      [23, '23rd'],
      [31, '31st'],
      [101, '101st'],
      [111, '111th'],
      [112, '112th'],
      [113, '113th'],
      [0, '0th'],
    ];
    for (const [n, s] of cases) expect(ordinal(n)).toBe(s);
  });
});
