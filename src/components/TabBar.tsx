import type { ComponentType } from 'react';
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

/** Bottom tab bar: 5 big targets, icon + label, padded for the home indicator. */
export function TabBar({ active, onSelect }: TabBarProps) {
  return (
    <nav className="tabbar" aria-label="Main">
      <ul className="tabbar__list">
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
