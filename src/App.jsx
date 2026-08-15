import { Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';

import { useApp } from '@/context/AppContext';
import { lazyRoute } from '@/lib/lazyRoute';
import { Header } from '@/components/Header';
import { Login } from '@/components/Auth/Login';
import { PasswordResetPage } from '@/components/Auth/PasswordResetPage';
import { LegalPage } from '@/components/legal/LegalPage';
import { CoachLayout } from '@/components/Coach/CoachLayout';
import { ClientLayout } from '@/components/Client/ClientLayout';
import { ConsentGate } from '@/components/Client/ConsentGate';
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
const ClientFile = lazyRoute(() => import('@/components/Coach/ClientFile').then((m) => ({ default: m.ClientFile })));
const TeamPanel = lazyRoute(() => import('@/components/Coach/TeamPanel').then((m) => ({ default: m.TeamPanel })));
const SettingsLayout = lazyRoute(() => import('@/components/Coach/Settings/SettingsLayout').then((m) => ({ default: m.SettingsLayout })));
const AppearancePanel = lazyRoute(() => import('@/components/Coach/Settings/AppearancePanel').then((m) => ({ default: m.AppearancePanel })));
const ProtocolPanel = lazyRoute(() => import('@/components/Coach/Settings/ProtocolPanel').then((m) => ({ default: m.ProtocolPanel })));
const IntegrationsCatalogue = lazyRoute(() => import('@/components/Coach/Settings/IntegrationsCatalogue').then((m) => ({ default: m.IntegrationsCatalogue })));
const BackupPanel = lazyRoute(() => import('@/components/Coach/Settings/BackupPanel').then((m) => ({ default: m.BackupPanel })));
const PlanPanel = lazyRoute(() => import('@/components/Coach/Settings/PlanPanel').then((m) => ({ default: m.PlanPanel })));
const SupportPanel = lazyRoute(() => import('@/components/Coach/Settings/SupportPanel').then((m) => ({ default: m.SupportPanel })));
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
import { RESET_PATH, clientViewOf, coachViewOf } from '@/routes';
import { ReviewPage } from '@/components/ReviewPage';
import { InvitePage } from '@/components/InvitePage';
import { Notice } from '@/components/ui/primitives';
import { PlanNotice } from '@/components/PlanNotice';
import { CommandPalette, CommandPaletteProvider } from '@/components/ui/CommandPalette';
import { TourProvider, WelcomeTour } from '@/components/WelcomeTour';

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
/**
 * Dónde cae lo que este árbol de rutas no reconoce.
 *
 * ══ Por qué no es un `<Navigate to={home}>` ════════════════════════════════
 *
 * Porque el caso que más se da NO es una URL equivocada: es **la misma pantalla
 * vista desde el otro lado**. Un entrenador que mira la dieta de Marta y pulsa
 * «ver como lo ve mi cliente» deja la ruta en `/c/<id>/nutricion`, que en el
 * árbol del cliente no existe. Mandarlo al inicio le hace volver a buscar lo que
 * estaba mirando, y otra vez al volver.
 *
 * Aquí se traduce: `/c/<id>/nutricion` ⇄ `/mi/dieta`, con la tabla de
 * equivalencias de `routes.jsx`. Lo que no tenga pareja —la ficha, los ajustes,
 * una URL de verdad equivocada— sigue cayendo en el inicio, como antes.
 *
 * ── Y por qué AQUÍ y no al pulsar el botón ─────────────────────────────────
 * Ese fue el primer intento: cambiar de vista y navegar en el mismo manejador.
 * No funcionaba, y el motivo es que las dos cosas no se pintan a la vez. React
 * Router navega dentro de una transición —prioridad baja— mientras que el cambio
 * de vista es una actualización normal: se pinta ANTES, con la ruta todavía
 * vieja, y para cuando llegaba la navegación buena este comodín ya había
 * redirigido al inicio.
 *
 * Puesto en el comodín, no depende de qué se pinte primero: cuando el árbol nuevo
 * ve una ruta del otro, la traduce. Y de paso arregla el enlace pegado y el botón
 * atrás, que tenían el mismo problema y ningún botón que arreglarlos.
 */
const OtherViewFallback = ({ view, clientId }) => {
  const { pathname } = useLocation();
  const destino = view === 'coach' ? coachViewOf(pathname, clientId) : clientViewOf(pathname);
  return <Navigate to={destino} replace />;
};

export default function App() {
  /* `activeClient` solo se usa para volver del portal del cliente: su ruta no
     lleva el id dentro, así que sin él no se puede componer la del entrenador. */
  const { session, loading, loadError, conflict, resolveConflict, view, activeClient } = useApp();

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
  const esLegal = path === '/privacidad' || path === '/condiciones';

  if (path.startsWith('/r/') || path.startsWith('/invitacion/') || path === RESET_PATH || esLegal) {
    return (
      <Routes>
        <Route path="/r/:token" element={<ReviewPage />} />
        <Route path="/invitacion/:token" element={<InvitePage />} />

        {/* Privacidad y condiciones se leen ANTES de tener cuenta —el cliente que
            va a aceptar, el entrenador que se registra— y Stripe pide las dos
            como direcciones públicas para activar el cobro. */}
        <Route path="/:documento" element={<LegalPage />} />
        {/*
          Elegir contraseña nueva va aquí por un motivo distinto al de las otras
          dos: el enlace del correo INICIA SESIÓN al abrirse, así que si dependiera
          del control de sesión de abajo, quien viene a cambiar su contraseña
          entraría directo al panel sin llegar nunca al formulario.
        */}
        <Route path={RESET_PATH} element={<PasswordResetPage />} />
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

  return (
    /*
      La paleta de comandos envuelve a la aplicación entera porque la abren dos
      cosas: el atajo `⌘K` (que escucha en `window`) y el botón de la cabecera. El
      proveedor comparte ese único booleano entre las dos.
    */
    <CommandPaletteProvider>
      {/*
        La bienvenida envuelve a la aplicación por el mismo motivo que la paleta:
        la abren dos sitios que no se conocen entre sí —la primera visita y el menú
        de cuenta—, así que el booleano tiene que estar por encima de los dos.
      */}
      <TourProvider>
      <Header />
      <main>
        {loadError && (
          <div className="layout" style={{ paddingBottom: 0 }}>
            <Notice tone="error">{loadError}</Notice>
          </div>
        )}

        {/* El estado del plan, cuando tiene algo que decir. Va aquí y no en la
            pantalla de Ajustes porque nadie entra en Ajustes: la prueba se
            acababa sin que el entrenador hubiera visto un solo aviso. */}
        <PlanNotice />

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
                <Route path="clientes" element={<ClientPortfolio />} />
                {/* «Cartera» y «Clientes» eran dos pantallas que listaban a las
                    mismas personas. Se fusionaron en «Clientes»; la ruta vieja
                    sigue viva porque está en marcadores y en enlaces
                    compartidos. */}
                <Route path="cartera" element={<Navigate to="/clientes" replace />} />
                {/* Ajustes: lo que se configura una vez y no se toca a diario.
                    Fuera del nivel primario para que ese tenga tres entradas. */}
                <Route path="ajustes" element={<SettingsLayout />}>
                  <Route index element={<Navigate to="protocolo" replace />} />
                  <Route path="protocolo" element={<ProtocolPanel />} />
                  <Route path="apariencia" element={<AppearancePanel />} />
                  <Route path="integraciones" element={<IntegrationsCatalogue />} />
                  <Route path="copia" element={<BackupPanel />} />
                  <Route path="equipo" element={<TeamPanel />} />
                  <Route path="plan" element={<PlanPanel />} />
                  <Route path="ayuda" element={<SupportPanel />} />
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
                  <Route path="ficha" element={<ClientFile />} />
                </Route>
              </Route>

              {/* Una ruta del portal del cliente se traduce a su equivalente de
                  aquí; lo que no tenga pareja cae en «Hoy». */}
              <Route
                path="*"
                element={<OtherViewFallback view="coach" clientId={activeClient?.id} />}
              />
            </>
          ) : (
            <>
              {/* El consentimiento va por delante del portal entero, no de una
                  pantalla: en cuanto entra puede subir una foto de su cuerpo. */}
              <Route
                path="mi"
                element={
                  <ConsentGate>
                    <ClientLayout />
                  </ConsentGate>
                }
              >
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
              <Route path="*" element={<OtherViewFallback view="client" />} />
            </>
          )}
        </Routes>
        </Suspense>
      </main>

      <CommandPalette />
      <WelcomeTour />
      </TourProvider>
    </CommandPaletteProvider>
  );
}
