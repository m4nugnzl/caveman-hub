import React from 'react';
import ReactDOM from 'react-dom/client';

import App from './App.jsx';
import { AppProvider } from './context/AppContext.jsx';
import { ConfirmProvider } from './components/ui/ConfirmProvider.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';
import { ThemeProvider } from './lib/useTheme.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {/* El tema va por encima de todo: la pantalla de login se pinta antes que
        la cabecera y también tiene que salir en el tema elegido. */}
    <ThemeProvider>
      <ErrorBoundary>
        <ConfirmProvider>
          <AppProvider>
            <App />
          </AppProvider>
        </ConfirmProvider>
      </ErrorBoundary>
    </ThemeProvider>
  </React.StrictMode>
);
