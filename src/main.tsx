import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BudgetProvider } from './state/store';
import App from './App';
import './styles/tokens.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BudgetProvider>
      <App />
    </BudgetProvider>
  </StrictMode>,
);
