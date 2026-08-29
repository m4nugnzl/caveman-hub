import { useEffect, useMemo } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, UserPlus } from 'lucide-react';

import { useActions, useApp } from '@/context/AppContext';
import { feeLabel, paymentState } from '@/domain/billing';
import { buildPortfolio, colasDeInicio, portfolioInbox } from '@/domain/portfolio';
import { clientProtocol } from '@/domain/protocol';
import { latestActiveWeek } from '@/domain/week';
import { dayMonthMaybeYear } from '@/lib/dates';
import {
  COACH_CLIENT,
  COACH_HOME,
  COACH_PRIMARY,
  clientPath,
  isSectionActive,
  sameSectionFor,
  sectionsFor,
} from '@/routes';
import { EmptyState } from '@/components/ui/primitives';
import { Avatar } from '@/components/ui/Avatar';
import { BottomNav } from '@/components/ui/BottomNav';
import { Logo } from '@/components/ui/Logo';
import { HeaderActions, Omnibox } from '@/components/Header';
import { ClientSwitcher } from './ClientSwitcher';
import { GettingStarted } from './GettingStarted';

/**
 * Marco del panel del entrenador: el chasis con barra lateral.
 *
 * ── De dónde viene la estructura ────────────────────────────────────────────
 * Primero fueron once pestañas en una fila, mezclando planos: «Cartera» habla de
 * todos los clientes, «Rutina» de uno, e «Integraciones» de ninguno. Se ordenó
 * en dos niveles horizontales, luego en una barra lateral que APILABA los dos
 * planos —Hoy/Clientes arriba y, debajo, el cliente abierto con sus secciones,
 * con la cuenta y la búsqueda también dentro—. Ese apilamiento era el problema:
 * tres asuntos distintos (quién soy, a dónde voy, en quién estoy) compartiendo
 * columna.
 *
 * Ahora la barra hace UNA cosa —navegar— y NO SE MUEVE: las cuatro puertas
 * arriba, la cartera entera debajo y tú al pie, estés donde estés. Las
 * secciones del cliente abierto —con su cobro y su portal— son una fila de
 * pestañas en el área de trabajo (`.client-head`), no un plano de la barra.
 *
 * Hubo una versión intermedia en la que la barra CAMBIABA de plano: fuera de un
 * cliente el nivel primario, dentro el cliente entero. Servía para que en
 * pantalla nunca hubiera más de diez opciones, y el precio fue que entrar en
 * alguien borraba el resto de la aplicación. Ver el comentario largo de la
 * barra, más abajo.
 *
 * La búsqueda y la cuenta viven DENTRO de la barra —arriba y al pie—, montando
 * las mismas piezas que la cabecera del móvil (`Header.jsx` exporta `Omnibox` y
 * `HeaderActions` para que no puedan divergir). Hubo una barra de herramientas
 * aparte (`.shell-top`) con esas dos piezas y una miga; se retiró porque
 * repetía la cabecera y le quitaba a la barra dos cosas que son suyas. En móvil
 * y tableta no hay barra: navegan la cabecera, la barra del pulgar y el
 * subnivel de siempre. Las DOS geometrías montan aquí, y la hoja de estilos
 * decide cuál se ve.
 *
 * El cliente activo lo manda la URL. El contexto lo sincroniza desde la ruta, no al
 * revés: una sola fuente de verdad, la de arriba.
 */
/**
 * El estado del cobro, en la cabecera del cliente.
 *
 * ══ Por qué ya no hay un rojo por defecto ═══════════════════════════════════
 *
 * Decía «Pago pendiente» en rojo siempre que `payment_status` no fuera `paid`, y
 * ese campo se pone en pendiente en cuanto empieza un ciclo nuevo. O sea: quien
 * renueva el día 30 llevaba esta chapa en rojo desde el día 1, en todas sus
 * pantallas, veintinueve días seguidos.
 *
 * Un aviso que sale casi siempre no avisa de nada: se aprende a ignorarlo, y el
 * día que de verdad vence no se distingue de las cuatro semanas anteriores.
 *
 * Ahora el criterio es el de `domain/billing.js`, el mismo que usan la cartera y
 * la bandeja de «Hoy». Solo lo vencido va en rojo; una renovación futura es una
 * chapa neutra que dice CUÁNDO, que es lo que se quería saber al mirar ahí; y sin
 * fecha no se dice nada, porque no hay nada que decir.
 */
const ChapaDeCobro = ({ client }) => {
  const pago = paymentState(client);
  const tarifa = feeLabel(client);

  /* Sin fecha la chapa desaparece. Poner «sin fecha de cobro» en la cabecera
     sería reprocharle al entrenador un campo vacío cada vez que abre a un
     cliente; ese aviso vive en la ficha, que es donde se arregla. */
  if (pago.state === 'no_date' && !tarifa) return null;

  const clase = pago.tone === 'bad' ? 'badge badge-bad' : pago.tone === 'warn' ? 'badge badge-warn' : 'badge';

  return (
    <span className={clase} title={pago.detail}>
      {pago.state === 'no_date' ? tarifa : [pago.label, tarifa].filter(Boolean).join(' · ')}
    </span>
  );
};

/** La pestaña desde la que NO se ofrece «Revisar semana»: ya estás en ella. */
const SECCION_SEMANA = COACH_CLIENT.find((s) => s.path === 'semana');

export const CoachLayout = () => {
  const {
    clients,
    loading,
    selectedClientId,
    setSelectedClientId,
    activeClient,
    training,
    anthropometry,
    progressPhotos,
    checkIns,
    equipmentCounts,
    workoutData,
  } = useApp();
  const { setViewMode } = useActions();
  const { clientId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const hasClients = clients.length > 0;
  const onClient = Boolean(clientId);

  /*
    La semana por la que va: la última en la que hay algo registrado, que es la
    misma por la que entra la revisión (`latestActiveWeek`). Del cliente abierto
    se tiene el programa entero; si aún no ha llegado, la más alta del resumen.
  */
  const programaAbierto = clientId ? workoutData[clientId] : null;
  const historiaAbierta = clientId ? anthropometry[clientId]?.history : null;
  const fotosAbiertas = useMemo(
    () => (clientId ? progressPhotos.filter((p) => p.clientId === clientId) : []),
    [progressPhotos, clientId]
  );
  const inicioAbierto = clientId ? clients.find((c) => c.id === clientId)?.startDate || null : null;
  const resumenAbierto = clientId ? training[clientId] : null;
  /* Depende de lo de ESE cliente, no de la cartera entera: una serie anotada en
     otro cliente o una foto subida por ahí no tienen por qué recalcular esto. */
  const semanaActiva = useMemo(() => {
    if (!clientId) return null;
    if (programaAbierto?.microcycles?.length) {
      return latestActiveWeek({
        microcycles: programaAbierto.microcycles,
        history: historiaAbierta || [],
        photos: fotosAbiertas,
        startDate: inicioAbierto,
      });
    }
    return resumenAbierto?.weekNumber || null;
  }, [clientId, programaAbierto, historiaAbierta, fotosAbiertas, inicioAbierto, resumenAbierto]);

  /*
    ── El recuento de la bandeja, en la puerta de «Hoy» ────────────────────────
    La MISMA bandeja que calculan «Hoy» y la cartera (`portfolioInbox`), contada
    aquí para que la barra lo diga desde cualquier pantalla: lo que espera
    respuesta no debería descubrirse solo al pasar por la bandeja. Una tercera
    cuenta propia divergiría; por eso se suman sus filas y no se inventa nada.

    Y de las MISMAS filas sale el punto de cada persona de la cartera, que es lo
    que convierte la lista de la barra en un panel de control en vez de un
    índice: quién te espera se ve sin entrar en nadie.

    ── Pero el punto NO marca lo mismo que cuenta la chapa ─────────────────────
    La chapa de «Hoy» cuenta la bandeja entera —programar, cobrar, recordar—
    porque eso es lo que hay en la bandeja. El punto marca solo las tareas
    `awaited` de `domain/portfolio.js`: gente que ha entregado algo y está
    esperando a que contestes.

    Marcaba las once, y con catorce clientes eso eran diez puntos de catorce: un
    aviso que llevan casi todos deja de ser un aviso. No es que las dos cifras
    diverjan por descuido — es que contestan preguntas distintas, y cada una lo
    dice en su etiqueta.
  */
  const bandeja = useMemo(() => {
    const rows = buildPortfolio({ clients, training, anthropometry, progressPhotos, checkIns, equipmentCounts });
    const { tasks } = portfolioInbox(rows);
    return {
      // La MISMA cifra que las cuatro colas de «Inicio»: los trámites no cuentan.
      total: colasDeInicio(rows).reduce((n, cola) => n + cola.n, 0),
      esperando: new Set(
        tasks.filter((task) => task.awaited).flatMap((task) => task.rows.map((row) => row.client.id))
      ),
    };
  }, [clients, training, anthropometry, progressPhotos, checkIns, equipmentCounts]);

  /*
    Qué número acompaña a cada puerta del nivel primario. Solo «Hoy», y en ámbar
    porque es un pendiente y no un dato. Sin nada que contar no se pinta un cero:
    un cero permanente es cromo.

    «Clientes» llevaba el tamaño de la cartera y lo ha soltado: la cartera está
    ahora dos filas más abajo, con los nombres a la vista y su rótulo
    contándolos. Repetir el número a dos centímetros es decirlo dos veces.
  */
  const cuentaDe = {
    '/hoy': bandeja.total > 0 ? { n: bandeja.total, warn: true, detalle: 'Esperan respuesta tuya' } : null,
  };

  /*
    La ruta manda sobre el contexto. `clientId` puede venir de una URL pegada, de un
    marcador o del botón atrás, y en los tres casos el resto de la aplicación tiene
    que estar mirando a ese cliente.
  */
  useEffect(() => {
    if (clientId && clientId !== selectedClientId) setSelectedClientId(clientId);
  }, [clientId, selectedClientId, setSelectedClientId]);

  /*
    ══ Un id que no existe no puede tumbar la pantalla ════════════════════════

    Cliente borrado, enlace viejo, URL mal copiada: leer `activeClient.id` sobre
    undefined tumbaba la aplicación entera. De ahí esta guarda.

    ── Pero NO se decide mientras se está cargando ─────────────────────────────
    Había un segundo caso —`if (onClient && !hasClients)`— que disparaba también
    cuando la cartera simplemente no había llegado todavía. Y esa es la situación
    normal de una carga limpia: quien abre `/c/<id>/rutina` desde un marcador, o
    desde el enlace que le pasaron por WhatsApp, entra con `clients` vacío
    durante unas décimas y **acababa expulsado a la lista**.

    Es justo lo que las rutas de verdad vinieron a permitir —compartir y guardar
    la pantalla concreta de un cliente— roto por la guarda que protegía otra
    cosa. Mientras `loading`, no se decide nada: se pinta el marco y se espera.
  */
  if (loading) return null;
  if (onClient && !clients.some((c) => c.id === clientId)) {
    return <Navigate to="/clientes" replace />;
  }

  /*
    ── La cartera que se pinta, con su caso raro ───────────────────────────────
    La cartera viva, más el cliente abierto si resulta estar archivado. Sin ese
    añadido, entrar por enlace directo a la ficha de alguien archivado dejaría la
    barra entera sin ninguna fila marcada mientras debajo se ve su ficha — y en
    el selector del móvil enseñaría el nombre de OTRA persona, la primera de la
    lista. Aparecer no le desarchiva: sigue fuera de la cartera en cuanto se sale
    de su ficha.

    Una lista, dos huecos: la barra del escritorio y el selector del móvil. Son
    la misma cartera y no pueden divergir entre geometrías.
  */
  const cartera =
    activeClient && !clients.some((c) => c.id === activeClient.id)
      ? [activeClient, ...clients]
      : clients;

  /*
    A dónde lleva pulsar a alguien. Cambiar de cliente CONSERVA la sección: si
    estabas en su nutrición, pasas a la nutrición del otro. Salvo que al otro no
    le lleves dieta, y entonces se cae a su semana — mandarle a una sección que
    no tiene sería un salto y un rebote.

    Desde fuera de un cliente no hay sección que conservar y `sameSectionFor` cae
    en la misma entrada por defecto que el índice de la ruta: su semana, que es a
    lo que se viene.
  */
  const destinoDe = (id) =>
    sameSectionFor(
      location.pathname,
      id,
      clientProtocol(clients.find((c) => c.id === id)?.preferences)
    );

  /*
    ── El selector, que ahora es SOLO del móvil ────────────────────────────────
    Vivía también en la barra lateral, y allí era la consecuencia de que la
    cartera no cupiera: si la lista de clientes no está, hace falta un
    desplegable que la traiga. Con la lista puesta, el desplegable al lado sería
    dos formas de hacer lo mismo a un palmo.

    En el móvil sigue siendo la única forma: allí no hay barra donde poner
    quince nombres.
  */
  const selector = onClient && activeClient && (
    <ClientSwitcher
      clients={cartera}
      selectedClientId={selectedClientId}
      /* El plan y la antigüedad, en una sola línea de voz baja: los dos datos
         quietos de identidad, juntos y sin chapas. */
      subtitle={[
        activeClient.plan || 'Sin plan',
        activeClient.startDate && `desde ${dayMonthMaybeYear(activeClient.startDate)}`,
      ]
        .filter(Boolean)
        .join(' · ')}
      onSelect={(id) => navigate(destinoDe(id))}
    />
  );

  /* Solo el cobro: es un ESTADO y puede avisar. La fecha de alta es un dato
     quieto y viaja en el subtítulo del selector — como chapa suelta al lado del
     botón del portal componía un cajón de piezas desparejas. */
  const chapas = onClient && activeClient && <ChapaDeCobro client={activeClient} />;
  /*
    La marca de «estás aquí» NO la decide `NavLink` por prefijo de URL. Desde que
    una sección tiene dos niveles —`revision` y `revision/fotos`, `resumen` y
    `analitica`, el calendario dentro de «Ficha»— el prefijo se queda corto y bajar al
    segundo nivel dejaba la navegación entera sin marcar. Los niveles se declaran
    en `also`, en `routes.jsx`. Y solo las secciones que existen para él: a quien
    no le llevas dieta no le sobra media pantalla, es que no la tiene
    (`sectionsFor`).

  */
  const seccionesDeCliente =
    onClient && activeClient
      ? sectionsFor(COACH_CLIENT, clientProtocol(activeClient.preferences)).map((seccion) => ({
          seccion,
          activa: isSectionActive(location.pathname, seccion, '/c/[^/]+'),
        }))
      : [];

  /*
    ── La miga: dónde estás, dicho por la barra de herramientas ───────────────
    La barra de herramientas es pegajosa y la cabecera de la pantalla no: en
    cuanto se baja, el nombre de lo que se está mirando desaparecía con ella.
    La miga lo retiene —«Marta García › Nutrición», «Ajustes › Equipo»— y le da
    a la barra su gramática completa: dónde estoy (esto), a dónde voy (la
    búsqueda), quién soy (la cuenta). No son enlaces: para moverse ya están la
    barra lateral y la paleta; esto solo nombra la hoja abierta.
  */

  return (
    <div className="shell">
      {/* ══ La barra lateral: solo existe en escritorio (ver EL CHASIS) ═══ */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <Logo subtitle={null} />
        </div>
        {/* Buscar vive en la barra: es a donde se va, no un mueble aparte. */}
        <div className="sidebar-buscar">
          <Omnibox />
        </div>

        {/*
          ── El nivel primario, que ya no se va a ninguna parte ───────────────
          Aquí vivió un PANEL INTERCAMBIABLE: fuera de un cliente el nivel
          primario, dentro el cliente entero con sus siete secciones. La barra
          no apilaba planos, los CAMBIABA — y el argumento era bueno: así en
          pantalla nunca había más de diez opciones.

          Lo que no se vio es lo que costaba. Bajar de diez escondiendo el resto
          significa que entrar en un cliente no es entrar en una habitación:
          es cambiar de edificio. Hoy, Ingresos, el calendario y las otras
          catorce personas dejaban de existir, y volver a cualquiera de ellas
          era un viaje de vuelta. Dos entrenadores lo dijeron con las mismas
          palabras sin haber hablado entre ellos: «zonas que se interconectan y
          marean», «ventanas inconexas».

          Ahora el marco no cambia nunca. Las cuatro puertas se quedan, la
          cartera entera vive debajo de ellas —que es lo que convierte la barra
          en el sitio donde estás en vez de en un menú— y las secciones del
          cliente bajan al área de trabajo, pegadas a su nombre
          (`.client-head`). En pantalla siguen sin verse más de diez opciones a
          la vez, porque las del cliente ya no están aquí.

          El móvil no cambia: allí la barra del pulgar SÍ cambia de plano, y
          allí es lo correcto — no hay sitio para las dos cosas y el gesto de
          volver es el dedo.
        */}
        <nav className="sidebar-nav" aria-label="Secciones principales">
          {COACH_PRIMARY.map(({ path, label, icon: Icon }) => {
            const cuenta = cuentaDe[path];
            return (
              <NavLink
                key={path}
                to={path}
                className="side-link"
                /* «Clientes» no debe marcarse por estar dentro de un cliente. */
                end
              >
                <Icon size={15} />
                {label}
                {cuenta && (
                  <span
                    className={`side-count${cuenta.warn ? ' is-warn' : ''}`}
                    title={cuenta.detalle}
                  >
                    {cuenta.n}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/*
          ── La cartera, siempre a la vista ──────────────────────────────────
          La lista de clientes deja de ser una pantalla a la que se va y pasa a
          ser parte del marco, como en cualquier herramienta donde el trabajo es
          sobre personas. Cambiar de cliente es un clic desde donde estés, sin
          salir ni volver, y quién te espera se ve sin entrar en nadie.

          Es la ÚNICA franja que desplaza: las cuatro puertas de arriba y los
          ajustes de abajo se quedan quietos por muchos clientes que haya.

          Hablan en voz más baja que las puertas —peso de texto normal, tinta
          secundaria— a propósito: son quince y ellas cuatro, y sin esa
          diferencia la barra se lee como una lista de diecinueve cosas.
        */}
        {cartera.length > 0 ? (
          <div className="sidebar-cartera">
            <p className="sidebar-group">
              Cartera
              <span className="sidebar-group-n">{clients.length}</span>
            </p>

            <nav className="sidebar-nav" aria-label="Tus clientes">
              {cartera.map((cliente) => {
                const abierto = cliente.id === clientId;
                return (
                  <NavLink
                    key={cliente.id}
                    to={destinoDe(cliente.id)}
                    className={`side-link side-client${abierto ? ' active' : ''}`}
                    aria-current={abierto ? 'page' : undefined}
                  >
                    <span className="side-client-name">{cliente.name}</span>
                    {/* La semana por la que va, como en cualquier lista de atletas seria:
                        el estado de cada persona se ve sin entrar. */}
                    {(training[cliente.id]?.weekNumber || training[cliente.id]?.microcycleCount) > 0 && !bandeja.esperando.has(cliente.id) && (
                      <span className="side-client-week">S{training[cliente.id].weekNumber || training[cliente.id].microcycleCount}</span>
                    )}
                    {/* Sin número: aquí la pregunta es a quién, no a cuántos, y
                        catorce cifras seguidas son una tabla. */}
                    {bandeja.esperando.has(cliente.id) && (
                      <span
                        className="side-dot"
                        role="img"
                        title="Ha entregado algo y espera tu respuesta"
                        aria-label="Ha entregado algo y espera tu respuesta"
                      />
                    )}
                  </NavLink>
                );
              })}
            </nav>
          </div>
        ) : null}

        {/*
          ── El pie: QUIÉN ERES, y dentro lo tuyo ────────────────────────────
          Aquí había dos filas para una sola idea: «Ajustes» con su engranaje y,
          debajo, un círculo con tus iniciales. El círculo no llevaba a ninguna
          parte —su menú se abría hacia abajo, ya fuera de la ventana, y encima
          la barra lo recortaba con su `overflow`—, así que la mitad del pie era
          un adorno que al pulsarlo no hacía nada.

          Ahora es UNA fila del ancho de la barra: tu nombre, tu rol y el
          gancho de que se abre. Dentro está lo tuyo —ajustes, el tema, el
          tutorial, cerrar sesión—, que es donde se busca la configuración de
          uno en cualquier aplicación con barra. La navegación INTERNA de
          ajustes sigue siendo de `SettingsLayout`.
        */}
        <div className="sidebar-foot">
          {/* Las mismas piezas que monta la cabecera del móvil, en su versión de
              fila: la campana del cliente y el aviso de cambios sin confirmar
              viajan con ellas. */}
          <HeaderActions variante="fila" />
        </div>
      </aside>

      <div className="shell-main">
        <div className="layout">
          {/* ── El subnivel del móvil: el mismo contexto, en horizontal ──── */}
          {/*
            ══ La cabecera del cliente: fija, igual en las cinco pestañas ═════
            Quién es, en qué semana va, si te espera y qué paga: eso no cambia
            al cambiar de pestaña, así que tampoco se mueve. Debajo, las cinco
            pestañas planas — y NUNCA un segundo carril bajo ellas: lo que
            cuelga de una sección se abre desde su contenido y vuelve con una
            miga (`ui/Migas`). Es la respuesta directa a «zonas que se
            interconectan y marean»: dentro de una persona hay un solo plano.

            En el móvil el nombre es el selector de cliente (no hay barra donde
            listar quince nombres) y las pestañas las lleva la barra del pulgar.
          */}
          {onClient && activeClient && (
            <header className="cliente-cab">
              <div className="cliente-cab-fila">
                <div className="cliente-cab-quien">
                  <button
                    type="button"
                    className="btn btn-icon cliente-cab-volver"
                    onClick={() => navigate('/clientes')}
                    aria-label="Volver a la lista de clientes"
                    title="Volver a la lista de clientes"
                  >
                    <ArrowLeft size={16} />
                  </button>
                  <h1 className="cliente-cab-nombre">
                    <Avatar name={activeClient.name} src={activeClient.avatar} size="md" />
                    {activeClient.name}
                  </h1>
                  <div className="cliente-cab-selector">{selector}</div>
                  <p className="cliente-cab-meta">
                    {semanaActiva && <span>Semana {semanaActiva}</span>}
                    {bandeja.esperando.has(activeClient.id) && (
                      <span className="cliente-cab-espera">Te espera</span>
                    )}
                    {chapas}
                  </p>
                </div>
                <div className="cliente-cab-acciones">
                  <button
                    type="button"
                    className="btn btn-quiet btn-sm"
                    onClick={() => setViewMode('client')}
                    title="Ver la aplicación como la ve esta persona"
                  >
                    Ver como {activeClient.name.split(/\s+/)[0]}
                  </button>
                  {!isSectionActive(location.pathname, SECCION_SEMANA, '/c/[^/]+') && (
                    <Link className="btn btn-primary btn-sm" to={clientPath(clientId, 'semana')}>
                      Revisar semana
                    </Link>
                  )}
                </div>
              </div>
              <nav className="tabs cliente-cab-tabs" aria-label={`Secciones de ${activeClient.name}`}>
                {seccionesDeCliente.map(({ seccion, activa }) => {
                  const { path, label, icon: Icon } = seccion;
                  return (
                    <NavLink
                      key={path}
                      to={clientPath(clientId, path)}
                      className={`tab${activa ? ' active' : ''}`}
                      aria-current={activa ? 'page' : undefined}
                    >
                      <Icon size={15} /> {label}
                    </NavLink>
                  );
                })}
              </nav>
            </header>
          )}
          
{/* «Hoy» es la pantalla de entrada, así que es la primera que ve un
              entrenador recién registrado y no puede limitarse a estar vacía.
              «Clientes» ya trae su propio vacío —con el formulario de alta
              dentro—, por eso aquí solo se cubre la de inicio.

              La guía va delante del vacío y no dentro: sin clientes explica por
              dónde se empieza, y con clientes sigue contestando la pregunta que
              la trajo —dónde se hace la rutina— hasta que se cierra. */}
          {!hasClients && location.pathname === COACH_HOME ? (
            <div className="stack">
              <GettingStarted />
              <EmptyState
                icon={UserPlus}
                title="Todavía no tienes clientes"
                message="Da de alta a tu primer atleta en «Clientes» y aquí aparecerá lo que le falta por hacer cada semana."
                action={
                  <button type="button" className="btn btn-primary btn-lg" onClick={() => navigate('/clientes')}>
                    <UserPlus size={17} /> Dar de alta un cliente
                  </button>
                }
              />
            </div>
          ) : (
            <Outlet />
          )}
        </div>

        {/*
          ══ La barra del pulgar CAMBIA de plano, y aquí sí es lo correcto ══════

          Llevaba siempre el primer nivel —Hoy, Clientes— y las secciones del
          cliente iban en un carril de chips arriba, en la zona que el pulgar no
          alcanza. Es decir: la navegación que se usa DECENAS de veces al día
          (moverse por un cliente) estaba en el sitio malo, y la que se usa dos
          veces (volver a Hoy) ocupaba el bueno. Así que cambia de plano: fuera
          de un cliente el nivel primario, dentro el cliente entero, y la vuelta
          al primario es la flecha de la cabecera.

          ── Y por qué el escritorio ha dejado de hacerlo ─────────────────────
          Porque allí sobra sitio y aquí no. La barra lateral cambiaba de plano
          por el mismo argumento y acabó borrando la aplicación entera cada vez
          que se entraba en alguien; una columna de 264 px y 900 de alto tiene
          espacio para las cuatro puertas Y la cartera, así que ya no cambia.
          Una tira de 56 px al alcance del pulgar no lo tiene, y esconder aquí
          la navegación detrás de un botón sería peor que cambiar de plano.

          No es que las dos geometrías divergan por descuido: es que la
          restricción es distinta y la respuesta también.

          Con más de cinco secciones, BottomNav enseña cuatro y guarda el resto
          en su hoja de «Más» — la misma mecánica que el portal del cliente.
        */}
        <BottomNav
          key={onClient && activeClient ? 'cliente' : 'primario'}
          label={onClient && activeClient ? `Secciones de ${activeClient.name}` : 'Secciones principales'}
          items={
            onClient && activeClient
              /* En el MISMO orden que el carril de escritorio y que el portal
                 del cliente. Hubo una versión que reordenaba el cuarteto por
                 frecuencia de uso (revisión delante de nutrición) y se
                 deshizo: tres órdenes distintos para las mismas secciones
                 —la cabecera del cliente, el portal y el pulgar— cuestan más
                 de memorizar que lo que ahorra un toque en «Más». */
              ? seccionesDeCliente.map(({ seccion }) => ({
                  to: clientPath(clientId, seccion.path),
                  label: seccion.short || seccion.label,
                  icon: seccion.icon,
                  /* Sus niveles cuentan como la misma sección: en las fotos de
                     la revisión, «Revisión» tiene que seguir encendida. */
                  isActive: (ruta) => isSectionActive(ruta, seccion, '/c/[^/]+'),
                }))
              : COACH_PRIMARY.map(({ path, label, icon }) => ({ to: path, label, icon }))
          }
        />
      </div>
    </div>
  );
};
