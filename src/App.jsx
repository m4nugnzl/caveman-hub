import { Navigate, Route, Routes } from 'react-router-dom';

import { useApp } from '@/context/AppContext';
import { Header } from '@/components/Header';
import { Login } from '@/components/Auth/Login';
import { CoachLayout } from '@/components/Coach/CoachLayout';
import { ClientLayout } from '@/components/Client/ClientLayout';
import { ClientPortfolio } from '@/components/Coach/ClientPortfolio';
import { ClientRoster } from '@/components/Coach/ClientRoster';
import { TeamPanel } from '@/components/Coach/TeamPanel';
import { SettingsLayout } from '@/components/Coach/Settings/SettingsLayout';
import { AppearancePanel } from '@/components/Coach/Settings/AppearancePanel';
import { IntegrationsCatalogue } from '@/components/Coach/Settings/IntegrationsCatalogue';
import { WorkoutLogEditor } from '@/components/Coach/Workout/WorkoutLogEditor';
import { NutritionModule } from '@/components/Coach/NutritionModule';
import { AnthropometryModule } from '@/components/Coach/AnthropometryModule';
import { PhotoStudio } from '@/components/Coach/PhotoStudio/PhotoStudio';
import { Dashboard } from '@/components/dashboard/Dashboard';
import { AnalyticsPanel } from '@/components/analytics/AnalyticsPanel';
import { ClientRoutineRoute } from '@/components/Client/ClientRoutineRoute';
import { ClientDietRoute } from '@/components/Client/ClientDietRoute';
import { ClientPhotosRoute } from '@/components/Client/ClientPhotosRoute';
import { ClientCheckInsRoute } from '@/components/Client/ClientCheckInsRoute';
import { CalendarPanel } from '@/components/calendar/CalendarPanel';
import { COACH_HOME, CLIENT_HOME } from '@/routes';
import { ReviewPage } from '@/components/ReviewPage';
import { InvitePage } from '@/components/InvitePage';
import { Notice } from '@/components/ui/primitives';

/**
 * Mapa de rutas.
 *
 * Dos árboles, uno por rol, y cada uno con su layout: la cabecera y las pestañas
 * viven en el layout y solo cambia el contenido, de modo que navegar no vuelve a
 * montar la barra ni pierde el scroll.
 *
 * `view` decide qué árbol se pinta —un entrenador puede previsualizar el portal
 * del cliente— y la ruta decide qué hay dentro. Las secciones salen de
 * `src/routes.jsx`, así que las pestañas y las URLs no pueden divergir.
 */
export default function App() {
  const { session, loading, loadError, view } = useApp();

  /*
    La revisión compartida se ve SIN sesión, y por eso va antes de todo lo demás:
    el cliente la abre desde WhatsApp y puede no tener cuenta. Si fuera detrás del
    `loading` o del `Login`, vería la pantalla de acceso en lugar de su vídeo.
  */
  /*
    ── Las dos rutas que se abren SIN sesión ─────────────────────────────────
    `/r/<token>`         → la revisión que el entrenador comparte por WhatsApp.
    `/invitacion/<token>` → la puerta de entrada del cliente a su portal.

    Las dos van antes del `loading` y del `Login`, y en el caso de la invitación es
    especialmente importante: es la pantalla que CREA la cuenta, así que si
    estuviera detrás del control de sesión no se podría llegar nunca a ella.
  */
  const path = window.location.pathname;
  if (path.startsWith('/r/') || path.startsWith('/invitacion/')) {
    return (
      <Routes>
        <Route path="/r/:token" element={<ReviewPage />} />
        <Route path="/invitacion/:token" element={<InvitePage />} />
      </Routes>
    );
  }

  if (loading) {
    return (
      <div className="row center" style={{ minHeight: '100vh' }}>
        <span className="t-secondary">Cargando…</span>
      </div>
    );
  }

  if (!session) return <Login />;

  const home = view === 'coach' ? COACH_HOME : CLIENT_HOME;

  return (
    <>
      <Header />
      <main>
        {loadError && (
          <div className="layout" style={{ paddingBottom: 0 }}>
            <Notice tone="error">{loadError}</Notice>
          </div>
        )}

        <Routes>
          {view === 'coach' ? (
            <>
              <Route element={<CoachLayout />}>
                <Route path="cartera" element={<ClientPortfolio />} />
                <Route path="clientes" element={<ClientRoster />} />
                {/* Ajustes: lo que se configura una vez y no se toca a diario.
                    Fuera del nivel primario para que ese tenga tres entradas. */}
                <Route path="ajustes" element={<SettingsLayout />}>
                  <Route index element={<Navigate to="apariencia" replace />} />
                  <Route path="apariencia" element={<AppearancePanel />} />
                  <Route path="integraciones" element={<IntegrationsCatalogue />} />
                  <Route path="equipo" element={<TeamPanel />} />
                </Route>

                <Route path="c/:clientId">
                  <Route index element={<Navigate to="resumen" replace />} />
                  <Route path="resumen" element={<Dashboard audience="coach" />} />
                  <Route path="analitica" element={<AnalyticsPanel audience="coach" />} />
                  <Route path="rutina" element={<WorkoutLogEditor />} />
                  <Route path="nutricion" element={<NutritionModule />} />
                  <Route path="fotos" element={<PhotoStudio />} />
                  <Route path="checkins" element={<AnthropometryModule />} />
                  <Route path="calendario" element={<CalendarPanel audience="coach" />} />
                </Route>
              </Route>

              {/* Cualquier otra cosa —incluida una URL de cliente pegada por
                  alguien que ahora está en vista de cliente— cae en su inicio. */}
              <Route path="*" element={<Navigate to={home} replace />} />
            </>
          ) : (
            <>
              <Route path="mi" element={<ClientLayout />}>
                <Route index element={<Navigate to="panel" replace />} />
                <Route path="panel" element={<Dashboard audience="client" />} />
                <Route path="analitica" element={<AnalyticsPanel audience="client" />} />
                <Route path="rutina" element={<ClientRoutineRoute />} />
                <Route path="dieta" element={<ClientDietRoute />} />
                <Route path="fotos" element={<ClientPhotosRoute />} />
                <Route path="checkins" element={<ClientCheckInsRoute />} />
                <Route path="calendario" element={<CalendarPanel audience="client" />} />
              </Route>
              <Route path="*" element={<Navigate to={home} replace />} />
            </>
          )}
        </Routes>
      </main>
    </>
  );
}
