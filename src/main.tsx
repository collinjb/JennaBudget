import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BudgetProvider } from './state/store';
import { AppErrorBoundary } from './pwa/ErrorBoundary';
import { UpdateBanner } from './pwa/UpdateBanner';
import { requestPersistentStorage } from './storage/storage';
import App from './App';
import './styles/tokens.css';
// After the app's own base styles so its iPhone rules (e.g. 16px inputs) win.
import './pwa/base.css';

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
