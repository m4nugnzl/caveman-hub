import { Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { useApp } from '@/context/AppContext';
import { lazyRoute } from '@/lib/lazyRoute';
import { Header } from '@/components/Header';
import { Login } from '@/components/Auth/Login';
import { CoachLayout } from '@/components/Coach/CoachLayout';
import { ClientLayout } from '@/components/Client/ClientLayout';
import { Today } from '@/components/Coach/Today';
import { ClientPortfolio } from '@/components/Coach/ClientPortfolio';
import { Dashboard } from '@/components/dashboard/Dashboard';
import { ProgressLayout } from '@/components/analytics/ProgressLayout';

/*
  ══ Todo lo demás se carga cuando se abre ══════════════════════════════════

  Antes se importaba la aplicación entera en el arranque: 409 KB de código más
  218 KB del cliente de Supabase, aunque quien entrara fuera un cliente que usa
  tres pantallas desde el móvil con datos. El editor de rutina, el estudio de
  fotos —con su lienzo, su caché de imágenes y su grabador de vídeo— y los diez
  gráficos de la analítica se descargaban siempre, los mirara alguien o no.

  Se quedan en el arranque solo las tres pantallas de ENTRADA —«Hoy», la cartera
  y el resumen—, que son las que se ven antes de decidir nada. Cargar esas en
  diferido solo añadiría un parpadeo a lo primero que ve el usuario.
*/
const ClientRoster = lazyRoute(() => import('@/components/Coach/ClientRoster').then((m) => ({ default: m.ClientRoster })));
const TeamPanel = lazyRoute(() => import('@/components/Coach/TeamPanel').then((m) => ({ default: m.TeamPanel })));
const SettingsLayout = lazyRoute(() => import('@/components/Coach/Settings/SettingsLayout').then((m) => ({ default: m.SettingsLayout })));
const AppearancePanel = lazyRoute(() => import('@/components/Coach/Settings/AppearancePanel').then((m) => ({ default: m.AppearancePanel })));
const ProtocolPanel = lazyRoute(() => import('@/components/Coach/Settings/ProtocolPanel').then((m) => ({ default: m.ProtocolPanel })));
const IntegrationsCatalogue = lazyRoute(() => import('@/components/Coach/Settings/IntegrationsCatalogue').then((m) => ({ default: m.IntegrationsCatalogue })));
const BackupPanel = lazyRoute(() => import('@/components/Coach/Settings/BackupPanel').then((m) => ({ default: m.BackupPanel })));
const WorkoutLogEditor = lazyRoute(() => import('@/components/Coach/Workout/WorkoutLogEditor').then((m) => ({ default: m.WorkoutLogEditor })));
const NutritionModule = lazyRoute(() => import('@/components/Coach/NutritionModule').then((m) => ({ default: m.NutritionModule })));
const AnthropometryModule = lazyRoute(() => import('@/components/Coach/AnthropometryModule').then((m) => ({ default: m.AnthropometryModule })));
const PhotoStudio = lazyRoute(() => import('@/components/Coach/PhotoStudio/PhotoStudio').then((m) => ({ default: m.PhotoStudio })));
const AnalyticsPanel = lazyRoute(() => import('@/components/analytics/AnalyticsPanel').then((m) => ({ default: m.AnalyticsPanel })));
const ClientRoutineRoute = lazyRoute(() => import('@/components/Client/ClientRoutineRoute').then((m) => ({ default: m.ClientRoutineRoute })));
const ClientDietRoute = lazyRoute(() => import('@/components/Client/ClientDietRoute').then((m) => ({ default: m.ClientDietRoute })));
const ClientPhotosRoute = lazyRoute(() => import('@/components/Client/ClientPhotosRoute').then((m) => ({ default: m.ClientPhotosRoute })));
const ClientCheckInsRoute = lazyRoute(() => import('@/components/Client/ClientCheckInsRoute').then((m) => ({ default: m.ClientCheckInsRoute })));
const CalendarPanel = lazyRoute(() => import('@/components/calendar/CalendarPanel').then((m) => ({ default: m.CalendarPanel })));
import { COACH_HOME, CLIENT_HOME } from '@/routes';
import { ReviewPage } from '@/components/ReviewPage';
import { InvitePage } from '@/components/InvitePage';
import { Notice } from '@/components/ui/primitives';
import { CommandPalette, CommandPaletteProvider } from '@/components/ui/CommandPalette';

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
  const { session, loading, loadError, conflict, resolveConflict, view } = useApp();

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
    /*
      La paleta de comandos envuelve a la aplicación entera porque la abren dos
      cosas: el atajo `⌘K` (que escucha en `window`) y el botón de la cabecera. El
      proveedor comparte ese único booleano entre las dos.
    */
    <CommandPaletteProvider>
      <Header />
      <main>
        {loadError && (
          <div className="layout" style={{ paddingBottom: 0 }}>
            <Notice tone="error">{loadError}</Notice>
          </div>
        )}

        {/*
          Conflicto de escritura: alguien ha tocado los mismos datos mientras
          editabas. Va aquí arriba y no dentro de una pantalla porque es un estado
          del que hay que SALIR, y porque puede saltar en cualquiera de las tres
          secciones que escriben bloques.

          Las dos salidas se nombran por lo que HACEN, no por lo que son: «quedarme
          con lo suyo» y «imponer lo mío», en vez de «recargar» y «forzar».
        */}
        {conflict && (
          <div className="layout" style={{ paddingBottom: 0 }}>
            <Notice
              tone="warn"
              action={
                <span className="row gap-2 shrink-0">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => resolveConflict('reload')}
                  >
                    Quedarme con lo suyo
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={() => resolveConflict('overwrite')}
                  >
                    Imponer lo mío
                  </button>
                </span>
              }
            >
              Otra persona —u otra pestaña tuya— ha cambiado estos datos mientras editabas. Tus
              cambios <strong>no se han guardado</strong>, para no borrar los suyos. Recarga para ver
              su versión, o impón la tuya sabiendo que se pierde la de ellos.
            </Notice>
          </div>
        )}

        {/*
          El respaldo de Suspense es deliberadamente sobrio: un texto y nada más.
          Una pantalla de carga con animación para un fragmento que tarda 80 ms en
          red local llama más la atención que la propia espera.
        */}
        <Suspense
          fallback={
            <div className="layout">
              <p className="t-sm t-tertiary">Cargando…</p>
            </div>
          }
        >
        <Routes>
          {view === 'coach' ? (
            <>
              <Route element={<CoachLayout />}>
                <Route path="hoy" element={<Today />} />
                <Route path="cartera" element={<ClientPortfolio />} />
                <Route path="clientes" element={<ClientRoster />} />
                {/* Ajustes: lo que se configura una vez y no se toca a diario.
                    Fuera del nivel primario para que ese tenga tres entradas. */}
                <Route path="ajustes" element={<SettingsLayout />}>
                  <Route index element={<Navigate to="protocolo" replace />} />
                  <Route path="protocolo" element={<ProtocolPanel />} />
                  <Route path="apariencia" element={<AppearancePanel />} />
                  <Route path="integraciones" element={<IntegrationsCatalogue />} />
                  <Route path="copia" element={<BackupPanel />} />
                  <Route path="equipo" element={<TeamPanel />} />
                </Route>

                <Route path="c/:clientId">
                  <Route index element={<Navigate to="resumen" replace />} />
                  {/* Resumen y análisis son dos profundidades de la misma sección:
                      una sola entrada en el carril, dos rutas debajo para que el
                      enlace directo y el botón atrás sigan funcionando. */}
                  <Route element={<ProgressLayout audience="coach" />}>
                    <Route path="resumen" element={<Dashboard audience="coach" />} />
                    <Route path="analitica" element={<AnalyticsPanel audience="coach" />} />
                  </Route>
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
                <Route element={<ProgressLayout audience="client" />}>
                  <Route path="panel" element={<Dashboard audience="client" />} />
                  <Route path="analitica" element={<AnalyticsPanel audience="client" />} />
                </Route>
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
        </Suspense>
      </main>

      <CommandPalette />
    </CommandPaletteProvider>
  );
}
