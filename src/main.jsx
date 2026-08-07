import React from 'react';
import ReactDOM from 'react-dom/client';

import App from './App.jsx';
import { AppProvider } from './context/AppContext.jsx';
import { ConfirmProvider } from './components/ui/ConfirmProvider.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ConfirmProvider>
        <AppProvider>
          <App />
        </AppProvider>
      </ConfirmProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
