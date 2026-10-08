/**
 * Stable, case-insensitive name comparison for sorting lists ("rent" next to "Rent").
 * Falls back to a plain code-unit comparison so two names that differ only in case still sort the same way every time.
 */
export function compareText(a: string, b: string): number {
  return a.localeCompare(b, 'en-US', { sensitivity: 'base' }) || (a < b ? -1 : a > b ? 1 : 0);
}
