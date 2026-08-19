import { Suspense, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';

import { track } from '@/lib/analytics';

import { useApp } from '@/context/AppContext';
import { lazyRoute } from '@/lib/lazyRoute';
import { Header } from '@/components/Header';
import { PreviewBar } from '@/components/PreviewBar';
import { Login } from '@/components/Auth/Login';
import { PasswordResetPage } from '@/components/Auth/PasswordResetPage';
import { LegalPage } from '@/components/legal/LegalPage';
import { LandingPage } from '@/components/marketing/LandingPage';
import { CoachLayout } from '@/components/Coach/CoachLayout';
import { ClientLayout } from '@/components/Client/ClientLayout';
import { ConsentGate } from '@/components/Client/ConsentGate';
import { Today } from '@/components/Coach/Today';
import { ClientPortfolio } from '@/components/Coach/ClientPortfolio';
import { Dashboard } from '@/components/dashboard/Dashboard';
import { ClientStart } from '@/components/Client/ClientStart';
import { ProgressLayout } from '@/components/analytics/ProgressLayout';
import { ReviewLayout } from '@/components/review/ReviewLayout';

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
const WeekReview = lazyRoute(() => import('@/components/Coach/WeekReview').then((m) => ({ default: m.WeekReview })));
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
import {
  CLIENT_HOME,
  COACH_CLIENT,
  RESET_PATH,
  SETTINGS_SECTIONS,
  clientViewOf,
  coachViewOf,
} from '@/routes';
import { clientProtocol, isServiceOn } from '@/domain/protocol';
import { ReviewPage } from '@/components/ReviewPage';
import { InvitePage } from '@/components/InvitePage';
import { Notice } from '@/components/ui/primitives';
import { AppSkeleton } from '@/components/ui/AppSkeleton';
import { PlanNotice } from '@/components/PlanNotice';
import { CommandPalette, CommandPaletteProvider } from '@/components/ui/CommandPalette';
import { TourProvider, WelcomeTour } from '@/components/WelcomeTour';
import { ReviewBar, ReviewSessionProvider } from '@/components/Coach/ReviewSession';

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
/**
 * Qué pantalla se está mirando, en una palabra segura.
 *
 * ══ Por qué se valida contra la tabla de rutas ══════════════════════════════
 *
 * Porque lo que salga de aquí se guarda (migración 0045) y una ruta lleva
 * dentro el **id de un cliente**: `/c/8f3a…/rutina`. Sacar el tramo a pelo
 * metería ese id en la tabla de uso el día que alguien escriba una URL rara, y
 * entonces la instrumentación pasaría a describir a personas concretas — que es
 * justo lo que la 0045 se compromete a no hacer.
 *
 * Cotejando contra las secciones declaradas, lo único que puede salir es una de
 * las que hay en `routes.jsx`. Lo que no reconozca se cuenta como `otra`: perder
 * una etiqueta es barato, guardar un identificador de una persona no.
 */
/*
  Las secciones y TODOS sus niveles: desde que «Revisión» tiene dos rutas y
  «Progreso» otras dos, quedarse con el primer tramo contaría `revision/fotos`
  como `otra` y se perdería la mitad de la medición.

  El nombre se normaliza con `/` → `_` para que el evento siga siendo un
  identificador corto, que es lo que exige el CHECK de la migración 0045.
*/
const SECCIONES_CLIENTE = new Set(
  COACH_CLIENT.flatMap((s) => [s.path, ...(s.also || [])])
);
const SECCIONES_AJUSTES = new Set(SETTINGS_SECTIONS.map((s) => s.path));
const RAIZ = new Set(['hoy', 'clientes', 'cartera']);

export const pantallaDe = (pathname) => {
  const deCliente = /^\/c\/[^/]+\/(.+?)\/?$/.exec(pathname)?.[1];
  if (deCliente) {
    return SECCIONES_CLIENTE.has(deCliente) ? `cliente_${deCliente.replace(/\//g, '_')}` : 'otra';
  }

  const deAjustes = /^\/ajustes\/([^/]+)/.exec(pathname)?.[1];
  if (deAjustes) return SECCIONES_AJUSTES.has(deAjustes) ? `ajustes_${deAjustes}` : 'otra';

  const raiz = pathname.replace(/^\//, '').split('/')[0];
  return RAIZ.has(raiz) ? raiz : 'otra';
};

/** Apunta la pantalla cada vez que cambia. Solo cuenta desde el panel. */
const usePantallaVista = (pathname, view) => {
  useEffect(() => {
    if (view !== 'coach') return;
    track('pantalla_vista', { pantalla: pantallaDe(pathname) });
  }, [pathname, view]);
};

const OtherViewFallback = ({ view, clientId }) => {
  const { pathname } = useLocation();
  const destino = view === 'coach' ? coachViewOf(pathname, clientId) : clientViewOf(pathname);
  return <Navigate to={destino} replace />;
};

/**
 * Una sección que solo existe si a este cliente le llevas ese servicio.
 *
 * ══ Por qué hace falta además de esconderla del menú ════════════════════════
 *
 * Porque la URL no pasa por el menú. `/mi/dieta` está en marcadores, en la
 * pantalla de inicio del móvil y en los enlaces que se han mandado por WhatsApp;
 * quitarla del carril no la cierra. Y lo que había detrás no es una pantalla
 * vacía inofensiva: es el editor con sus botones de crear, así que se puede
 * empezar a montar una dieta que su portal no va a enseñar nunca.
 *
 * Redirige en lugar de explicar porque no hay nada que decidir: la sección no
 * existe para esta persona, y el sitio honesto es su resumen.
 */
const ConServicio = ({ servicio, to, children }) => {
  const { activeClient } = useApp();
  const protocol = clientProtocol(activeClient?.preferences);
  /* Sin cliente resuelto todavía no se decide nada: expulsar durante la carga es
     el mismo fallo que ya costó una vez en `CoachLayout`. */
  if (!activeClient) return children;
  return isServiceOn(protocol, servicio) ? children : <Navigate to={to} replace />;
};

export default function App() {
  /* `activeClient` solo se usa para volver del portal del cliente: su ruta no
     lleva el id dentro, así que sin él no se puede componer la del entrenador. */
  const { session, loading, loadError, conflict, resolveConflict, view, isCoach, activeClient } = useApp();

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
  /*
    `useLocation` y no `window.location`: leyendo del navegador, este componente
    no se entera de una navegación de cliente —no está suscrito a nada— y la rama
    de abajo se evalúa con la ruta anterior. Hoy no se notaba porque los enlaces a
    los textos legales son `<a href>` con recarga entera, pero el primer
    `<Link to="/privacidad">` que alguien escriba desde dentro caería en el
    comodín en lugar de enseñar la página.
  */
  const { pathname: path } = useLocation();
  const esLegal = path === '/privacidad' || path === '/condiciones';

  /* Antes de cualquier `return`: es un hook y no puede quedar detrás de una
     rama. No apunta nada hasta que `identify` sabe que hay un entrenador, así
     que en las rutas públicas de aquí abajo no llega a hacer nada. */
  usePantallaVista(path, view);

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

  /*
    El arranque enseña el esqueleto, no un «Cargando…» en texto plano: es lo
    primero que ve todo usuario en todas las sesiones, y una línea gris sobre el
    lienzo vacío se siente frágil. El esqueleto pinta la marca real y la promesa
    de la estructura (ver `ui/AppSkeleton`). El respaldo de Suspense de abajo, en
    cambio, SIGUE siendo texto sobrio a propósito: cubre fragmentos que tardan
    ~80 ms, donde cualquier animación llama más que la espera.
  */
  if (loading) {
    return <AppSkeleton />;
  }

  /*
    ══ Sin sesión: la portada en la raíz, el acceso en su ruta ════════════════

    Antes, cualquier ruta sin sesión enseñaba el formulario de acceso — incluida
    la raíz. Para vender esto había que pedirle a alguien que se registrara para
    enterarse de qué era y cuánto costaba.

    Ahora la raíz es la portada pública y el acceso vive en `/entrar`. El resto
    de rutas siguen cayendo en el formulario A PROPÓSITO: quien tiene guardado
    `/mi/rutina` y ha caducado su sesión quiere entrar, no que le vendan la
    aplicación que ya usa. Y al entrar, la ruta que pidió sigue en la barra.
  */
  if (!session) {
    if (path === '/') return <LandingPage />;
    return <Login />;
  }

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
      <ReviewSessionProvider>
      <Header />
      {/* La barra del modo preview cuelga del MODO, no de una pantalla: tiene
          que ofrecer la salida también cuando el portal no puede pintarse
          (coach en preview sin cliente activo). Ver `PreviewBar.jsx`. */}
      {isCoach && view === 'client' && <PreviewBar />}
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
                  {/* Se entra por la SEMANA y ya no por el resumen: es lo que se
                      viene a hacer. El resumen contesta «¿esto funciona?», que es
                      una pregunta de meses; la semana contesta «¿qué le digo?»,
                      que es la de cada lunes. */}
                  <Route index element={<Navigate to="semana" replace />} />
                  <Route path="semana" element={<WeekReview />} />
                  {/* Resumen y análisis son dos profundidades de la misma sección:
                      una sola entrada en el carril, dos rutas debajo para que el
                      enlace directo y el botón atrás sigan funcionando. */}
                  <Route element={<ProgressLayout audience="coach" />}>
                    <Route path="resumen" element={<Dashboard audience="coach" />} />
                    <Route path="analitica" element={<AnalyticsPanel audience="coach" />} />
                  </Route>
                  {/* Las dos secciones que pueden no existir para este cliente.
                      Ver `ConServicio` y `domain/protocol.js`. */}
                  <Route
                    path="rutina"
                    element={
                      <ConServicio servicio="training" to="../resumen">
                        <WorkoutLogEditor />
                      </ConServicio>
                    }
                  />
                  <Route
                    path="nutricion"
                    element={
                      <ConServicio servicio="nutrition" to="../resumen">
                        <NutritionModule />
                      </ConServicio>
                    }
                  />

                  {/* Revisión: el check-in y las fotos son la misma tarea, y
                      estaban en dos secciones porque son dos tablas. Ver
                      `components/review/ReviewLayout.jsx`. */}
                  <Route path="revision" element={<ReviewLayout audience="coach" />}>
                    <Route index element={<AnthropometryModule />} />
                    <Route path="fotos" element={<PhotoStudio />} />
                  </Route>
                  {/* Las dos rutas viejas siguen vivas: están en marcadores y en
                      enlaces compartidos por WhatsApp. */}
                  <Route path="checkins" element={<Navigate to="../revision" replace />} />
                  <Route path="fotos" element={<Navigate to="../revision/fotos" replace />} />

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
                <Route index element={<Navigate to="inicio" replace />} />

                {/* Su inicio ES su progreso: las cifras y los gráficos, con lo
                    que ha cambiado condensado arriba. Ver `ClientStart`. */}
                <Route element={<ProgressLayout audience="client" />}>
                  <Route path="inicio" element={<ClientStart />} />
                  <Route path="analitica" element={<AnalyticsPanel audience="client" />} />
                </Route>
                {/* «Hoy» dejó de ser una sección: lo suyo se repartió entre el
                    inicio y el check-in. La ruta sigue viva por los marcadores. */}
                <Route path="hoy" element={<Navigate to="/mi/inicio" replace />} />
                <Route path="panel" element={<Navigate to="/mi/inicio" replace />} />
                <Route
                  path="rutina"
                  element={
                    <ConServicio servicio="training" to={CLIENT_HOME}>
                      <ClientRoutineRoute />
                    </ConServicio>
                  }
                />
                <Route
                  path="dieta"
                  element={
                    <ConServicio servicio="nutrition" to={CLIENT_HOME}>
                      <ClientDietRoute />
                    </ConServicio>
                  }
                />

                {/* Su check-in y sus fotos: el mismo gesto de la semana, y
                    además la única puerta para subirlas. */}
                <Route path="evolucion" element={<ReviewLayout audience="client" />}>
                  <Route index element={<ClientCheckInsRoute />} />
                  <Route path="fotos" element={<ClientPhotosRoute />} />
                </Route>
                <Route path="checkins" element={<Navigate to="/mi/evolucion" replace />} />
                <Route path="fotos" element={<Navigate to="/mi/evolucion/fotos" replace />} />

                <Route path="calendario" element={<CalendarPanel audience="client" />} />
              </Route>
              <Route path="*" element={<OtherViewFallback view="client" />} />
            </>
          )}
        </Routes>
        </Suspense>
      </main>

      {/* La revisión en curso, por encima de todo: se empieza en la cola de
          «Hoy» y se cierra desde donde estés. */}
      {view === 'coach' && <ReviewBar />}

      <CommandPalette />
      <WelcomeTour />
      </ReviewSessionProvider>
      </TourProvider>
    </CommandPaletteProvider>
  );
}
