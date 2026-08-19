import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import App from './App.jsx';
import { AppProvider } from './context/AppContext.jsx';
import { ConfirmProvider } from './components/ui/ConfirmProvider.jsx';
import { ToastProvider } from './components/ui/ToastProvider.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';
import { ThemeProvider } from './lib/useTheme.jsx';
import { installGlobalHandlers } from './lib/diagnostics';
import './index.css';

/*
  Se engancha antes de montar React, no dentro de un componente.

  Un error que revienta durante el primer render —el peor de todos, el de la
  pantalla en blanco— ocurre ANTES de que ningún `useEffect` llegue a correr. Si
  el enganche viviera en un componente, ese fallo sería justo el único que no se
  apuntaría, y es el que más falta hace tener en un ticket.
*/
installGlobalHandlers();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {/* El tema va por encima de todo: la pantalla de login se pinta antes que
        la cabecera y también tiene que salir en el tema elegido. */}
    <BrowserRouter>
      <ThemeProvider>
      <ErrorBoundary>
        <ConfirmProvider>
          {/* Al lado del de confirmación porque son las dos caras de lo mismo:
              confirmar lo destructivo sin inverso, deshacer lo frecuente con
              inverso. Ver `ui/ToastProvider`. */}
          <ToastProvider>
            <AppProvider>
              <App />
            </AppProvider>
          </ToastProvider>
        </ConfirmProvider>
      </ErrorBoundary>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
);
