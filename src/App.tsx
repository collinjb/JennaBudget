import { useState } from 'react';
import { ConfirmProvider } from './components/ConfirmDialog';
import { ToastProvider } from './components/Toast';
import { isDeviceUnlocked } from './lib/access';
import { RecoveryScreen } from './pwa/RecoveryScreen';
import { useApplyTheme } from './pwa/theme';
import { LockScreen } from './screens/LockScreen';
import { Shell } from './screens/Shell';
import { useBudget } from './state/store';
import './styles/base.css';
import './styles/components.css';
import './styles/screens.css';

/**
 * App root: theme, global providers (toasts, confirm dialogs), and which top-level screen to show:
 * a new device that hasn't entered the access code → lock screen; unreadable saved data → recovery screen;
 * otherwise straight to the budget (Home tab). (Error boundary, update banner and storage persistence are wired in
 * main.tsx.)
 */
export default function App() {
  const { data, status } = useBudget();
  const [unlocked, setUnlocked] = useState(isDeviceUnlocked);
  useApplyTheme(data.settings.theme);

  if (!unlocked) return <LockScreen onUnlock={() => setUnlocked(true)} />;
  if (status === 'corrupt') return <RecoveryScreen />;

  return (
    <ToastProvider>
      <ConfirmProvider>
        <Shell />
      </ConfirmProvider>
    </ToastProvider>
  );
}
