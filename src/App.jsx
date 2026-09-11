import { Suspense, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';

import { track } from '@/lib/analytics';

import { useActions, useApp } from '@/context/AppContext';
import { lazyRoute } from '@/lib/lazyRoute';
import { Header } from '@/components/Header';
import { PreviewBar } from '@/components/PreviewBar';
import { Login } from '@/components/Auth/Login';
import { PasswordResetPage } from '@/components/Auth/PasswordResetPage';
import { LegalPage } from '@/components/legal/LegalPage';
import { LandingPage } from '@/components/marketing/LandingPage';
import { CoachLayout } from '@/components/Coach/CoachLayout';
import { IntencionDePlan } from '@/components/Coach/IntencionDePlan';
import { ClientLayout } from '@/components/Client/ClientLayout';
import { ConsentGate } from '@/components/Client/ConsentGate';
import { Today } from '@/components/Coach/Today';
import { ClientPortfolio } from '@/components/Coach/ClientPortfolio';
import { Dashboard } from '@/components/dashboard/Dashboard';
import { ClientStart } from '@/components/Client/ClientStart';
/* Perezosa: es la pantalla que un cliente abre la primera semana y no vuelve a
   abrir. Cargarla con el portal sería pagar su peso en cada arranque. */
const ClientOnboarding = lazyRoute(() => import('@/components/Client/ClientOnboarding').then((m) => ({ default: m.ClientOnboarding })));
const FormulariosDelCliente = lazyRoute(() => import('@/components/Client/FormulariosDelCliente').then((m) => ({ default: m.FormulariosDelCliente })));
import { FichaLayout } from '@/components/Coach/FichaLayout';
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
const TeamPanel = lazyRoute(() => import('@/components/Coach/Settings/TeamPanel').then((m) => ({ default: m.TeamPanel })));
const SettingsLayout = lazyRoute(() => import('@/components/Coach/Settings/SettingsLayout').then((m) => ({ default: m.SettingsLayout })));
/*
  ── El Taller: el material del entrenador (ver `COACH_TALLER` en routes) ────
  Las cuatro en diferido, y por el mismo motivo que las de Ajustes: son
  pantallas de material —se abren cuando se va a preparar algo—, no las de
  entrada. La Librería se lleva además las dos fichas, con su vídeo y sus
  etiquetas, que no tiene por qué descargar quien entra a mirar «Hoy».

  `/ejercicios` y `/alimentos` montan la MISMA pantalla: la puerta es una y el
  tramo es la ruta (ver `LibreriaPanel`). Por eso hay un solo `lazyRoute` para
  las dos — y por eso las dos mitades caen en el mismo trozo, que es lo correcto:
  cambiar de tramo no debería costar una descarga.
*/
const ProtocolosPanel = lazyRoute(() => import('@/components/Coach/Taller/ProtocolosPanel').then((m) => ({ default: m.ProtocolosPanel })));
const FormulariosPanel = lazyRoute(() => import('@/components/Coach/Taller/FormulariosPanel').then((m) => ({ default: m.FormulariosPanel })));
const LibreriaPanel = lazyRoute(() => import('@/components/Coach/Taller/LibreriaPanel').then((m) => ({ default: m.LibreriaPanel })));
const PlantillasPanel = lazyRoute(() => import('@/components/Coach/Taller/PlantillasPanel').then((m) => ({ default: m.PlantillasPanel })));
const IntegrationsCatalogue = lazyRoute(() => import('@/components/Coach/Settings/IntegrationsCatalogue').then((m) => ({ default: m.IntegrationsCatalogue })));
const BackupPanel = lazyRoute(() => import('@/components/Coach/Settings/BackupPanel').then((m) => ({ default: m.BackupPanel })));
const PlanPanel = lazyRoute(() => import('@/components/Coach/Settings/PlanPanel').then((m) => ({ default: m.PlanPanel })));
const ProfilePanel = lazyRoute(() => import('@/components/Coach/Settings/ProfilePanel').then((m) => ({ default: m.ProfilePanel })));
const SupportPanel = lazyRoute(() => import('@/components/Coach/Settings/SupportPanel').then((m) => ({ default: m.SupportPanel })));
const WorkoutLogEditor = lazyRoute(() => import('@/components/Coach/Workout/WorkoutLogEditor').then((m) => ({ default: m.WorkoutLogEditor })));
const Compositor = lazyRoute(() => import('@/components/Coach/Workout/Compositor').then((m) => ({ default: m.Compositor })));
const NutritionModule = lazyRoute(() => import('@/components/Coach/NutritionModule').then((m) => ({ default: m.NutritionModule })));
const AnthropometryModule = lazyRoute(() => import('@/components/Coach/AnthropometryModule').then((m) => ({ default: m.AnthropometryModule })));
/* El archivo de fotos va en diferido igual que el estudio: no es pantalla de
   entrada, y su diálogo de subida por lotes se lleva doce kilobytes que no tiene
   por qué descargar quien entra a mirar «Hoy». */
const PhotoArchive = lazyRoute(() => import('@/components/photos/PhotoArchive').then((m) => ({ default: m.PhotoArchive })));
const PhotoStudio = lazyRoute(() => import('@/components/Coach/PhotoStudio/PhotoStudio').then((m) => ({ default: m.PhotoStudio })));
const ClientRoutineRoute = lazyRoute(() => import('@/components/Client/ClientRoutineRoute').then((m) => ({ default: m.ClientRoutineRoute })));
const ClientDietRoute = lazyRoute(() => import('@/components/Client/ClientDietRoute').then((m) => ({ default: m.ClientDietRoute })));
const ClientPhotosRoute = lazyRoute(() => import('@/components/Client/ClientPhotosRoute').then((m) => ({ default: m.ClientPhotosRoute })));
const ClientCheckInsRoute = lazyRoute(() => import('@/components/Client/ClientCheckInsRoute').then((m) => ({ default: m.ClientCheckInsRoute })));
const CalendarPanel = lazyRoute(() => import('@/components/calendar/CalendarPanel').then((m) => ({ default: m.CalendarPanel })));
const CoachCalendar = lazyRoute(() => import('@/components/calendar/CoachCalendar').then((m) => ({ default: m.CoachCalendar })));
const IncomePanel = lazyRoute(() => import('@/components/Coach/Income/IncomePanel').then((m) => ({ default: m.IncomePanel })));
/* La radiografía va en su propio trozo y no en el del panel: son ~30 KB que
   solo abre una persona, y meterlos en el arranque se los descargaría todo el
   mundo en cada visita. */
const PlatformPanel = lazyRoute(() => import('@/components/Platform/PlatformPanel').then((m) => ({ default: m.PlatformPanel })));
import {
  COACH_CLIENT,
  COACH_TALLER,
  RESET_PATH,
  SETTINGS_SECTIONS,
  clientHomeFor,
  clientViewOf,
  coachViewOf,
} from '@/routes';
import { clientProtocol, isServiceOn } from '@/domain/protocol';
import { ReviewPage } from '@/components/ReviewPage';
import { InvitePage } from '@/components/InvitePage';
import { Notice } from '@/components/ui/primitives';
import { AppSkeleton, PageSkeleton } from '@/components/ui/AppSkeleton';
import { PlanNotice } from '@/components/PlanNotice';
import { EstadoDeRed } from '@/components/ui/EstadoDeRed';
import { ManoDelPortapapeles } from '@/components/Coach/ManoDelPortapapeles';
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
/*
  Las puertas de nivel primario, y desde el Taller también las suyas: son cinco
  pantallas nuevas que se abren a diario y sin declararlas aquí se contarían
  todas como `otra` — que es exactamente perder la medición de lo que se acaba
  de construir. Se sacan de `COACH_TALLER` y no a mano por la misma razón que
  las de ajustes: una lista y no dos.
*/
const RAIZ = new Set([
  'hoy',
  'clientes',
  'cartera',
  'ingresos',
  /* Con `also`: la Librería es UNA fila de la barra y DOS rutas, y medir solo la
     de la fila contaría `/alimentos` como «otra» — que es perder la mitad de la
     pantalla que se acaba de unificar. Se sigue midiendo por ruta, que es lo que
     dice en cuál de los dos tramos se trabaja. */
  ...COACH_TALLER.flatMap((s) => [s.path, ...(s.also || [])]).map((p) => p.replace(/^\//, '')),
]);

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
  const { takeViewTarget } = useActions();
  /* Qué le llevas: decide cuál es su inicio, porque una de sus secciones puede
     no existir. Ver `clientHomeFor`. */
  const { activeClient } = useApp();
  const protocol = clientProtocol(activeClient?.preferences);

  /*
    ── El destino pedido manda sobre la traducción ────────────────────────────
    Quien salta al portal desde un sitio SIN equivalente —la ficha, los ajustes—
    puede decir a dónde quiere ir. Sin esto, «Ver su alta» acababa en el inicio
    del cliente, porque la ficha no tiene pareja en su portal y la traducción
    cae en la portada.

    Se calcula UNA vez, al montar: el destino se consume y desaparece, así que un
    segundo render lo perdería y volvería a la portada.
  */
  const [destino] = useState(() => {
    const pedido = view === 'client' ? takeViewTarget() : null;
    return (
      pedido || (view === 'coach' ? coachViewOf(pathname, clientId) : clientViewOf(pathname, protocol))
    );
  });

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
/*
  ── Sin `to`, la salida la elige el protocolo ───────────────────────────────
  El panel del entrenador dice a dónde sale porque su destino es fijo: `resumen`
  no depende de ningún servicio y siempre está. El portal del cliente no puede
  nombrar el suyo, porque su inicio ES una de las secciones que pueden faltar.

  Decirlo con una constante —`to` fijo a `/mi/rutina`— hacía que
  el guardia de la rutina expulsara a la rutina: a quien solo le llevas la dieta,
  su portal entero se quedaba en la barra de abajo sobre el vacío. Ver
  `clientHomeFor` en `routes.jsx`.
*/
/**
 * `/mi` a secas: la puerta del portal.
 *
 * Existía como `<Navigate to="inicio">` escrito a mano, y por tanto el portal
 * tenía DOS inicios que no se sabían el uno del otro: por aquí se entraba en «Mi
 * progreso» y todo lo demás —el comodín de las URLs que no existen, la salida de
 * los guardias— caía en `/mi/rutina`, que es «Mi rutina». Dos puertas para la
 * misma casa, y la constante decía una cosa y el árbol de rutas otra.
 *
 * Ahora las dos salen de `clientHomeFor`: la primera sección que esta persona
 * tiene de verdad. Con entreno es su rutina —que es la decisión escrita en
 * `CLIENT_SECTIONS`: se abre en el gimnasio para apuntar lo que acaba de
 * levantar— y sin él, lo siguiente que sí exista.
 */
const InicioDelCliente = () => {
  const { activeClient } = useApp();
  return <Navigate to={clientHomeFor(clientProtocol(activeClient?.preferences))} replace />;
};

const ConServicio = ({ servicio, to = null, children }) => {
  const { activeClient } = useApp();
  const protocol = clientProtocol(activeClient?.preferences);
  /* Sin cliente resuelto todavía no se decide nada: expulsar durante la carga es
     el mismo fallo que ya costó una vez en `CoachLayout`. */
  if (!activeClient) return children;
  if (isServiceOn(protocol, servicio)) return children;
  return <Navigate to={to || clientHomeFor(protocol)} replace />;
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

        {/* El estado de la red, cuando tiene algo que decir: sin conexión, con
            cola por mandar o mirando la copia local. Aquí lo montan el PORTAL y
            el modo preview, donde la página empieza justo debajo de la cabecera
            y esta es su primera línea.

            El escritorio del entrenador lo monta por su cuenta, dentro de
            `.shell-main` (ver `CoachLayout`): ahí el chasis es una columna a la
            izquierda, y una franja puesta aquí empujaría la barra entera hacia
            abajo en vez de entrar en la página. Ver `ui/EstadoDeRed`. */}
        {view !== 'coach' && <EstadoDeRed />}

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
              <PageSkeleton />
            </div>
          }
        >
        {/* Repone la ruta de quien venía a contratar un plan desde la portada y
            la perdió por el camino. ENVUELVE al árbol —no va a su lado— para
            poder tapar la pantalla por defecto durante el instante que tarda en
            redirigir: si no, se ve la cartera vacía de alguien que acaba de
            registrarse antes de saltar al pago. */}
        <IntencionDePlan>
        <Routes>
          {view === 'coach' ? (
            <>
              <Route element={<CoachLayout />}>
                <Route path="hoy" element={<Today />} />
                <Route path="clientes" element={<ClientPortfolio />} />
                {/* La agenda: la cartera entera en un calendario. El de UN
                    cliente sigue en su carril (`/c/:id/calendario`), que es
                    donde se le pone su pauta y se le mueve una fecha. */}
                <Route path="calendario" element={<CoachCalendar />} />
                {/* Los ingresos de su cartera: el recurrente, lo que falta por
                    cobrar, lo que va a entrar y el histórico. No es su plan de
                    Caveman Hub —eso es `ajustes/plan`— y las dos cifras no se
                    suman nunca. */}
                <Route path="ingresos" element={<IncomePanel />} />
                {/* «Cartera» y «Clientes» eran dos pantallas que listaban a las
                    mismas personas. Se fusionaron en «Clientes»; la ruta vieja
                    sigue viva porque está en marcadores y en enlaces
                    compartidos. */}
                <Route path="cartera" element={<Navigate to="/clientes" replace />} />
                {/* La radiografía de la plataforma: qué se usa, qué se rompe,
                    quién paga y por dónde se podría entrar. NO está en ningún
                    carril de navegación —solo en el menú de cuenta y solo si
                    eres admin— porque no es trabajo de un entrenador.

                    Que la ruta exista para todo el mundo no expone nada: la
                    pantalla no trae datos dentro, los pide a una función edge
                    que comprueba `platform_admins` en el servidor. Quien entre
                    aquí sin serlo ve un «esto no es para tu cuenta». */}
                <Route path="plataforma" element={<PlatformPanel />} />

                {/* ══ EL TALLER: el material del entrenador ═══════════════════
                    Cinco pantallas de nivel primario para lo que antes vivía
                    dentro de Ajustes, dentro del cajón de un bloque o en ningún
                    sitio. Ver el porqué largo en `COACH_TALLER` (routes.jsx).

                    «Protocolos» son ahora VARIOS con nombre, y cada uno se lee y
                    se edita como una lista de acciones con su premisa
                    (`ProtocolosPanel` + `domain/acciones.js`). El selector de
                    destino murió: lo de un cliente concreto vive en su diálogo
                    de la cartera. Su ruta vieja redirige aquí: seis pantallas la
                    enlazaban y puede estar en marcadores. */}
                <Route path="protocolos" element={<ProtocolosPanel />} />
                <Route path="formularios" element={<FormulariosPanel />} />
                <Route path="ejercicios" element={<LibreriaPanel />} />
                <Route path="alimentos" element={<LibreriaPanel />} />
                <Route path="plantillas" element={<PlantillasPanel />} />

                {/* Ajustes: lo que se configura una vez y no se toca a diario.
                    Fuera del nivel primario para que ese tenga tres entradas. */}
                <Route path="ajustes" element={<SettingsLayout />}>
                  <Route index element={<Navigate to="perfil" replace />} />
                  <Route path="protocolo" element={<Navigate to="/protocolos" replace />} />
                  {/* «Apariencia» era una de las siete secciones de Ajustes —con su
                      entrada, su pantalla y su vista previa de los dos temas— para UN
                      ajuste: claro u oscuro. Y ese mismo ajuste ya estaba, con el
                      mismo efecto, en el menú de la cuenta, que es donde lo pone
                      cualquier aplicación y donde se busca.

                      Dos sitios para lo mismo no es generosidad: es una pregunta más
                      («¿cuál de los dos uso?») y una sección de siete que no dice
                      nada nuevo. Se queda el que está donde se mira, y su ruta
                      redirige — puede estar en un marcador. */}
                  <Route path="apariencia" element={<Navigate to="/ajustes" replace />} />
                  <Route path="integraciones" element={<IntegrationsCatalogue />} />
                  <Route path="copia" element={<BackupPanel />} />
                  <Route path="equipo" element={<TeamPanel />} />
                  {/* Tu nombre y con qué correo entras. Se lee en cinco sitios
                      —el saludo, el pie de la barra, el equipo, el historial y
                      la radiografía— y hasta ahora no se escribía en ninguno. */}
                  <Route path="perfil" element={<ProfilePanel />} />
                  <Route path="plan" element={<PlanPanel />} />
                  <Route path="ayuda" element={<SupportPanel />} />
                </Route>

                <Route path="c/:clientId">
                  {/* Se entra por la SEMANA y ya no por el resumen: es lo que se
                      viene a hacer. El resumen contesta «¿esto funciona?», que es
                      una pregunta de meses; la semana contesta «¿qué le digo?»,
                      que es la de cada lunes. */}
                  <Route index element={<Navigate to="resumen" replace />} />
                  <Route path="semana" element={<WeekReview />} />
                  {/* El resumen ES el análisis: una sola pantalla, y lo que
                      antes era la segunda —los diez gráficos con su barra de
                      cuatro pestañas— se abre ahora en ventanas desde el título
                      de cada pieza. Ver `dashboard/Dashboard.jsx`.

                      `/analitica` sigue viva porque está en marcadores y en
                      enlaces viejos: rebota al resumen, que es donde está todo
                      lo que prometía. */}
                  <Route path="resumen" element={<Dashboard audience="coach" />} />
                  <Route path="analitica" element={<Navigate to="../resumen" replace />} />
                  {/* Las dos que un entrenador AJUSTA, y las dos que pueden no
                      existir para este cliente: a quien solo le llevas el
                      entrenamiento no le sobra media pantalla, es que no la
                      tiene. Ver `ConServicio` y `domain/protocol.js`.

                      Sin ninguno de los dos servicios, la salida es su semana y
                      no la otra sección — con `to` cruzado, una URL vieja
                      rebotaba entre las dos para siempre. */}
                  <Route
                    path="rutina"
                    element={
                      <ConServicio servicio="training" to="../resumen">
                        <WorkoutLogEditor />
                      </ConServicio>
                    }
                  />
                  {/* Componer tiene ruta propia porque es un TRABAJO con
                      principio y final, no una pestaña en la que se vive: se
                      entra desde la rutina y se vuelve a ella. Es además el
                      único sitio con el material del cliente al lado. Ver
                      `Compositor.jsx`. */}
                  <Route
                    path="rutina/componer"
                    element={
                      <ConServicio servicio="training" to="../resumen">
                        <Compositor />
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
                      `components/review/ReviewLayout.jsx`.

                      ── `fotos` es el ARCHIVO y `estudio` la herramienta ──────
                      `fotos` fue el estudio de montaje, y por tanto la única
                      forma de ver una foto era abrir el comparador: se
                      descargaba el lienzo, la caché de imágenes y el grabador de
                      pantalla para mirar el check-in inicial de alguien, y el
                      panel de carpetas que hay dentro no abre fotos —asigna
                      huecos del collage—.

                      Son dos cosas: el archivo (ver lo que ha subido, en
                      carpetas por semana) y el estudio (poner cuatro al lado y
                      grabarse explicándolas). El archivo se lleva la URL que ya
                      está en los marcadores porque es lo que el nombre promete,
                      y el estudio —que sigue en carga diferida— se abre desde
                      él. Ver `photos/PhotoArchive.jsx`. */}
                  <Route path="revision" element={<ReviewLayout audience="coach" />}>
                    <Route index element={<AnthropometryModule />} />
                    <Route path="fotos" element={<PhotoArchive />} />
                    <Route path="estudio" element={<PhotoStudio />} />
                  </Route>
                  {/* Las dos rutas viejas siguen vivas: están en marcadores y en
                      enlaces compartidos por WhatsApp. */}
                  <Route path="checkins" element={<Navigate to="../revision" replace />} />
                  <Route path="fotos" element={<Navigate to="../revision/fotos" replace />} />

                  {/* «Ficha»: quién es y cuándo. El calendario de una persona
                      —su pauta de entregas, sus fechas— es de la misma
                      naturaleza que su tarifa y su antigüedad, y era la sección
                      con menos uso de las seis. Ver `Coach/FichaLayout`. */}
                  <Route element={<FichaLayout />}>
                    <Route path="ficha" element={<ClientFile />} />
                    <Route path="calendario" element={<CalendarPanel audience="coach" />} />
                  </Route>
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
                <Route index element={<InicioDelCliente />} />

                {/* Su inicio ES su progreso: las cifras y los gráficos, con lo
                    que ha cambiado condensado arriba. Ver `ClientStart`. */}
                <Route path="inicio" element={<ClientStart />} />
                {/* Su análisis se abre en ventanas desde su propio panel, igual
                    que el del entrenador. La ruta rebota: estaba en su carril. */}
                <Route path="analitica" element={<Navigate to="/mi/inicio" replace />} />
                {/* «Hoy» dejó de ser una sección: lo suyo se repartió entre el
                    inicio y el check-in. La ruta sigue viva por los marcadores. */}
                {/* Su alta: lo que entrega al empezar. Fuera del carril de
                    secciones porque se hace una vez — ver `ClientOnboarding`. */}
                <Route path="alta" element={<ClientOnboarding />} />
                {/* Lo que su entrenador le ha pedido a mano (0099). Fuera del
                    carril de secciones por lo mismo que el alta: no es una
                    sección de su plan, es un encargo que va y viene. */}
                <Route path="formularios" element={<FormulariosDelCliente />} />
                <Route path="hoy" element={<Navigate to="/mi/inicio" replace />} />
                <Route path="panel" element={<Navigate to="/mi/inicio" replace />} />
                <Route
                  path="rutina"
                  element={
                    <ConServicio servicio="training">
                      <ClientRoutineRoute />
                    </ConServicio>
                  }
                />
                <Route
                  path="dieta"
                  element={
                    <ConServicio servicio="nutrition">
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
        </IntencionDePlan>
        </Suspense>
      </main>

      {/*
        ── Aquí vivía la barra de la revisión en curso ───────────────────────
        Un MODO que te seguía por la aplicación con tres botones y ningún dato:
        te ofrecía tres formas de terminar algo que no podías ver, porque lo
        que hacía falta para decidir estaba en otra pantalla. Existía para pegar
        dos pantallas que no se hablaban, y desde que la revisión entera cabe en
        «Su semana» —con la comparativa, el ajuste de la dieta y la respuesta—
        no queda nada que pegar. Ver `review/ReviewDecision.jsx` y
        `docs/producto.md` §4.1.
      */}

      <CommandPalette />
      {/* La bandeja de lo copiado. Se monta aquí —fuera de `main` y fuera de
          cualquier pantalla— porque el portapapeles sirve precisamente para
          cruzar pantallas y clientes: copias una hoja en Entreno de Marta y la
          pegas en el bloque de Luis, con la cartera en medio. Montada dentro de
          una pantalla desaparecería justo en ese trayecto, que es su motivo de
          existir. Solo se pinta con algo dentro. Ver `ui/Portapapeles`. */}
      {isCoach && <ManoDelPortapapeles />}
      <WelcomeTour />
      </TourProvider>
    </CommandPaletteProvider>
  );
}
