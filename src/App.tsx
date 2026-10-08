import { ConfirmProvider } from './components/ConfirmDialog';
import { ToastProvider } from './components/Toast';
import { RecoveryScreen } from './pwa/RecoveryScreen';
import { useApplyTheme } from './pwa/theme';
import { Onboarding } from './screens/Onboarding';
import { Shell } from './screens/Shell';
import { useBudget } from './state/store';
import './styles/base.css';
import './styles/components.css';
import './styles/screens.css';

/**
 * App root: theme, global providers (toasts, confirm dialogs), and which top-level screen to show:
 * unreadable saved data → recovery screen; first launch → onboarding; otherwise the tabs.
 * (Error boundary, update banner and storage persistence are wired in main.tsx.)
 */
export default function App() {
  const { data, status } = useBudget();
  useApplyTheme(data.settings.theme);

  if (status === 'corrupt') return <RecoveryScreen />;

  return (
    <ToastProvider>
      <ConfirmProvider>
        {data.settings.onboarded ? <Shell /> : <Onboarding />}
      </ConfirmProvider>
    </ToastProvider>
  );
}
