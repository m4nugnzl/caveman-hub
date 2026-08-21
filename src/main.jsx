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

/*
  El service worker que hace que la app SIEMPRE abra. Lo genera el build con la
  lista de archivos de esta versión (ver `scripts/sw.mjs`); en desarrollo no
  existe y el registro falla en silencio, que es lo correcto.

  Solo en producción: en desarrollo cachearía las respuestas del dev server y
  Vite y la caché se pelearían por quién sirve el módulo recién editado. Y sin
  bloquear nada: si el registro falla (navegador raro, permisos), la app
  funciona exactamente igual que antes de existir esto.
*/
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* Sin red o sin soporte: la app sigue; el worker se registrará otro día. */
    });
  });
}

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
