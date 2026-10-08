import { useEffect, useState } from 'react';
import { todayISO } from '../lib/dates';
import type { ISODate } from '../types';

/**
 * Today's local date. Re-checks when the app comes back to the foreground and once a minute,
 * so "paid this month" checkboxes reset and paydays roll forward without a reload.
 */
export function useToday(): ISODate {
  const [today, setToday] = useState(() => todayISO());
  useEffect(() => {
    const check = () => setToday((prev) => {
      const now = todayISO();
      return now === prev ? prev : now;
    });
    const timer = window.setInterval(check, 60_000);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
    };
  }, []);
  return today;
}
