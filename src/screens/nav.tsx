import { createContext, useContext } from 'react';
import type { TabKey } from '../components/TabBar';

export type { TabKey };
/** Full-screen pages pushed over the tabs. */
export type PageKey = 'settings' | 'paycheck' | 'smartplan';
/** Something a screen should do right away when opened (e.g. open its "add" sheet). */
export type Intent = 'add' | 'add-goal' | 'add-spending';

export interface Nav {
  tab: TabKey;
  page: PageKey | null;
  intent: Intent | null;
  goTab: (tab: TabKey, intent?: Intent) => void;
  openPage: (page: PageKey) => void;
  /** Close the current page (uses browser history when the page was pushed, so iOS swipe-back works too). */
  back: () => void;
}

export const NavContext = createContext<Nav | null>(null);

export function useNav(): Nav {
  const nav = useContext(NavContext);
  if (!nav) throw new Error('useNav must be used inside the app shell');
  return nav;
}
