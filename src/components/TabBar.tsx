import { useLayoutEffect, useRef, type ComponentType } from 'react';
import { IconBills, IconDebt, IconHome, IconMoneyIn, IconSavings } from './Icons';

export type TabKey = 'home' | 'income' | 'bills' | 'savings' | 'debt';

export const TABS: { key: TabKey; label: string; Icon: ComponentType<{ size?: number; filled?: boolean }> }[] = [
  { key: 'home', label: 'Home', Icon: IconHome },
  { key: 'income', label: 'Money In', Icon: IconMoneyIn },
  { key: 'bills', label: 'Bills', Icon: IconBills },
  { key: 'savings', label: 'Savings & Fun', Icon: IconSavings },
  { key: 'debt', label: 'Debt', Icon: IconDebt },
];

interface TabBarProps {
  active: TabKey;
  onSelect: (tab: TabKey) => void;
}

/**
 * Bottom tab bar: 5 big targets, icon + label, padded for the home indicator.
 * With larger text the labels wrap and the bar grows; its real height is published as --tabbar-space so the content,
 * scroll padding and toasts always clear it.
 */
export function TabBar({ active, onSelect }: TabBarProps) {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const nav = ref.current;
    if (!nav) return;
    const root = document.documentElement;
    const measure = () => {
      const padBottom = parseFloat(getComputedStyle(nav).paddingBottom) || 0;
      const h = Math.ceil(nav.getBoundingClientRect().height - padBottom);
      if (h > 0) root.style.setProperty('--tabbar-space', `${h}px`);
    };
    measure();
    if (typeof ResizeObserver !== 'function') return;
    const ro = new ResizeObserver(measure);
    ro.observe(nav);
    return () => ro.disconnect();
  }, []);

  return (
    <nav ref={ref} className="tabbar" aria-label="Main">
      <ul className="tabbar__list" role="list">
        {TABS.map(({ key, label, Icon }) => {
          const on = key === active;
          return (
            <li key={key} className="tabbar__item">
              <button
                type="button"
                className={`tabbar__btn${on ? ' is-active' : ''}`}
                aria-current={on ? 'page' : undefined}
                onClick={() => onSelect(key)}
              >
                <Icon size={26} filled={on} />
                <span className="tabbar__label">{label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
