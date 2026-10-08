import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BudgetProvider } from './state/store';
import { AppErrorBoundary } from './pwa/ErrorBoundary';
import { applyTheme } from './pwa/theme';
import { UpdateBanner } from './pwa/UpdateBanner';
import { requestPersistentStorage, STORAGE_KEY } from './storage/storage';
import type { ThemeSetting } from './types';
import App from './App';
import './styles/tokens.css';
// After the app's own base styles so its iPhone rules (e.g. 16px inputs) win.
import './pwa/base.css';

/**
 * The theme saved in Settings, read straight from storage before the first render, so a forced Dark theme on a
 * light-mode phone never flashes light. Anything unexpected just means "follow the phone".
 */
function savedTheme(): ThemeSetting {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const theme: unknown = raw ? (JSON.parse(raw) as { settings?: { theme?: unknown } })?.settings?.theme : undefined;
    return theme === 'light' || theme === 'dark' ? theme : 'system';
  } catch {
    return 'system';
  }
}
applyTheme(savedTheme());

// Ask the browser to keep this app's data (best effort; never throws).
void requestPersistentStorage();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <BudgetProvider>
        <App />
      </BudgetProvider>
    </AppErrorBoundary>
    {/* Outside the error boundary so a new version can still be applied after a crash. */}
    <UpdateBanner />
  </StrictMode>,
);
