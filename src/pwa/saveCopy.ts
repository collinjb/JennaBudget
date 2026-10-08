import { localDateStamp, makeBackup, parseBackup, readRawData, shareOrDownloadFile } from '../storage/storage';

export type SaveCopyResult = 'shared' | 'downloaded' | 'cancelled' | 'nothing-saved';

/**
 * Hand the user a copy of their saved data (share sheet or download). If the saved data is readable
 * it's wrapped as a normal backup file, so it can be restored later from Settings. Otherwise the raw
 * text is saved as-is. Call directly from a tap handler.
 */
export async function saveCopyOfData(raw: string | null = readRawData()): Promise<SaveCopyResult> {
  if (raw === null || raw === '') return 'nothing-saved';
  const today = localDateStamp();
  const parsed = parseBackup(raw);
  if (parsed.ok) {
    const { filename, json } = makeBackup(parsed.data, today);
    return shareOrDownloadFile(filename, json, 'Budget backup');
  }
  return shareOrDownloadFile(`budget-unreadable-data-${today}.json`, raw, 'Budget data (unreadable)');
}

/** Short, friendly sentence for the result of saveCopyOfData. */
export function saveCopyMessage(result: SaveCopyResult): string | null {
  switch (result) {
    case 'shared':
      return 'Your copy was saved.';
    case 'downloaded':
      return 'Your copy was downloaded. You can find it in the Files app, in Downloads.';
    case 'nothing-saved':
      return "There's no saved data on this phone yet, so there's nothing to copy.";
    case 'cancelled':
      return null;
  }
}
