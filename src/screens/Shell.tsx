import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { IconWarning } from '../components/Icons';
import { historyState } from '../components/history';
import { currentOpener, isModalOpen, prefersReducedMotion } from '../components/modal';
import { TabBar } from '../components/TabBar';
import { useBudget } from '../state/store';
import { BillsScreen } from './BillsScreen';
import { DebtScreen } from './DebtScreen';
import { HomeScreen } from './HomeScreen';
import { MoneyInScreen } from './MoneyInScreen';
import { NavContext, type Intent, type Nav, type PageKey, type TabKey } from './nav';
import { PaycheckPlanPage } from './PaycheckPlanPage';
import { SavingsScreen } from './SavingsScreen';
import { SettingsPage } from './SettingsPage';
import { SmartPlanPage } from './SmartPlanPage';

const PAGE_STATE_KEY = 'budgetPage';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea, [tabindex="0"]';

/** What had focus when a page was opened, so Back can return there even though the tab re-renders. */
interface Opener {
  tab: TabKey;
  label: string;
  index: number;
}

function labelOf(el: Element): string {
  return (el.getAttribute('aria-label') ?? el.textContent ?? '').trim();
}

function rememberOpener(main: HTMLElement | null, tab: TabKey): Opener | null {
  const active = currentOpener();
  if (!main || !active || !main.contains(active)) return null;
  const list = Array.from(main.querySelectorAll(FOCUSABLE));
  return { tab, label: labelOf(active), index: list.indexOf(active) };
}

function findOpener(main: HTMLElement, o: Opener): HTMLElement | null {
  const list = Array.from(main.querySelectorAll<HTMLElement>(FOCUSABLE));
  const same = list[o.index];
  if (same && labelOf(same) === o.label) return same;
  return list.find((el) => labelOf(el) === o.label) ?? null;
}

function pageFromState(state: unknown): PageKey | null {
  if (state && typeof state === 'object' && PAGE_STATE_KEY in state) {
    const p = (state as Record<string, unknown>)[PAGE_STATE_KEY];
    if (p === 'settings' || p === 'paycheck' || p === 'smartplan') return p;
  }
  return null;
}

/**
 * The main app: 5 tabs + full-screen pages (Settings, Paycheck Plan, Smart Plan) pushed on top.
 * Pages use history.pushState so iOS swipe-back / Android back close them; the in-app Back button
 * always works too. Each tab remembers its scroll position.
 */
export function Shell() {
  const { saveError } = useBudget();
  const [tab, setTab] = useState<TabKey>('home');
  const [page, setPage] = useState<PageKey | null>(null);
  const [intent, setIntent] = useState<Intent | null>(null);
  const mainRef = useRef<HTMLElement>(null);
  const scrollPos = useRef<Partial<Record<TabKey, number>>>({});
  const opener = useRef<Opener | null>(null);
  /** Back should put focus on the screen title instead of the opener (e.g. after "Use this plan" changed it). */
  const focusTitleOnBack = useRef(false);
  const prevPage = useRef<PageKey | null>(null);

  useEffect(() => {
    // A reload while a page or sheet was open: start clean on the tabs.
    const st = historyState();
    if (pageFromState(st) || 'budgetSheet' in st) window.history.replaceState(null, '');
    const onPop = (e: PopStateEvent) => setPage(pageFromState(e.state));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const rememberScroll = useCallback(() => {
    if (!page && mainRef.current) scrollPos.current[tab] = mainRef.current.scrollTop;
  }, [page, tab]);

  const back = useCallback((opts?: { focusTitle?: boolean }) => {
    focusTitleOnBack.current = !!opts?.focusTitle;
    if (pageFromState(window.history.state)) window.history.back();
    else setPage(null);
  }, []);

  const openPage = useCallback(
    (p: PageKey) => {
      rememberScroll();
      opener.current = rememberOpener(mainRef.current, tab);
      focusTitleOnBack.current = false;
      window.history.pushState({ [PAGE_STATE_KEY]: p }, '');
      setPage(p);
    },
    [rememberScroll, tab],
  );

  const goTab = useCallback(
    (t: TabKey, why?: Intent) => {
      if (page) back();
      else rememberScroll();
      if (t === tab && !page && !why) {
        // Tapping the current tab again scrolls back to the top (like iOS).
        mainRef.current?.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
      }
      setTab(t);
      setIntent(why ?? null);
    },
    [page, tab, back, rememberScroll],
  );

  // Restore each tab's scroll position; pages always open at the top.
  useLayoutEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    el.scrollTop = page ? 0 : (scrollPos.current[tab] ?? 0);
  }, [tab, page]);

  // Focus follows the screen: a page that opens gets its title focused; closing it returns focus to whatever opened
  // it (or the screen's title when that's gone). A sheet or dialog that opened in the meantime keeps its focus.
  useEffect(() => {
    const before = prevPage.current;
    prevPage.current = page;
    if (before === page || isModalOpen()) return;
    const main = mainRef.current;
    if (!main) return;
    const title = main.querySelector<HTMLElement>('h1[tabindex]');
    if (page) {
      title?.focus({ preventScroll: true });
      return;
    }
    const o = opener.current;
    opener.current = null;
    const target = o && o.tab === tab && !focusTitleOnBack.current ? findOpener(main, o) : null;
    focusTitleOnBack.current = false;
    (target ?? title)?.focus({ preventScroll: true });
  }, [page, tab]);

  const nav = useMemo<Nav>(() => ({ tab, page, intent, goTab, openPage, back }), [tab, page, intent, goTab, openPage, back]);

  let view;
  if (page === 'settings') view = <SettingsPage />;
  else if (page === 'paycheck') view = <PaycheckPlanPage />;
  else if (page === 'smartplan') view = <SmartPlanPage />;
  else if (tab === 'income') view = <MoneyInScreen />;
  else if (tab === 'bills') view = <BillsScreen />;
  else if (tab === 'savings') view = <SavingsScreen />;
  else if (tab === 'debt') view = <DebtScreen />;
  else view = <HomeScreen />;

  return (
    <NavContext.Provider value={nav}>
      <div className="app">
        {saveError && (
          <p className="notice notice--over save-error" role="alert">
            <IconWarning size={18} />
            <span>
              <strong>Your last change couldn't be saved on this phone.</strong> {saveError}
            </span>
          </p>
        )}
        <main ref={mainRef} className={`app-main${page ? ' app-main--page' : ''}`}>
          <div key={page ?? tab} className={page ? 'page-enter' : 'view-enter'}>
            {view}
          </div>
        </main>
        {!page && <TabBar active={tab} onSelect={(t) => goTab(t)} />}
      </div>
    </NavContext.Provider>
  );
}
