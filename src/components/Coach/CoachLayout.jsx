import { Fragment, useEffect, useMemo } from 'react';
import { NavLink, Navigate, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Eye, Settings, UserPlus } from 'lucide-react';

import { useActions, useApp } from '@/context/AppContext';
import { feeLabel, paymentState } from '@/domain/billing';
import { buildPortfolio, portfolioInbox } from '@/domain/portfolio';
import { clientProtocol } from '@/domain/protocol';
import { dayMonthMaybeYear } from '@/lib/dates';
import {
  COACH_CLIENT,
  COACH_HOME,
  COACH_PRIMARY,
  SETTINGS_SECTIONS,
  clientPath,
  isSectionActive,
  sameSectionFor,
  sectionsFor,
} from '@/routes';
import { EmptyState } from '@/components/ui/primitives';
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
 * Ahora la barra hace UNA cosa —navegar— y CAMBIA DE PLANO en vez de apilarlos,
 * igual que ya hacía el subnivel del móvil: fuera de un cliente enseña el nivel
 * primario; dentro, el cliente entero con su vuelta a la lista. La cuenta y la
 * búsqueda viven en la barra de herramientas (`.shell-top`), un objeto de
 * cristal a juego con la barra y alineado con el contenido — no una franja de
 * borde a borde—, montando las MISMAS piezas que la cabecera del móvil
 * (`Header.jsx`): el avatar arriba a la derecha en todos los modos, sin saltar
 * de sitio al previsualizar el portal. En móvil y tableta ni barra ni
 * herramientas: navegan la cabecera, la barra del pulgar y el subnivel de
 * siempre. Las DOS geometrías montan aquí, y la hoja de estilos decide cuál se
 * ve.
 *
 * El cliente activo lo manda la URL. El contexto lo sincroniza desde la ruta, no al
 * revés: una sola fuente de verdad, la de arriba.
 */
/**
 * El estado del cobro, en la cabecera de las siete secciones del cliente.
 *
 * ══ Por qué ya no hay un rojo por defecto ═══════════════════════════════════
 *
 * Decía «Pago pendiente» en rojo siempre que `payment_status` no fuera `paid`, y
 * ese campo se pone en pendiente en cuanto empieza un ciclo nuevo. O sea: quien
 * renueva el día 30 llevaba esta chapa en rojo desde el día 1, en las siete
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

  /* Sin fecha la chapa desaparece. Poner «sin fecha de cobro» en la cabecera de
     las siete secciones sería reprocharle al entrenador un campo vacío cada vez
     que abre a un cliente; ese aviso vive en la ficha, que es donde se arregla. */
  if (pago.state === 'no_date' && !tarifa) return null;

  const clase = pago.tone === 'bad' ? 'badge badge-bad' : pago.tone === 'warn' ? 'badge badge-warn' : 'badge';

  return (
    <span className={clase} title={pago.detail}>
      {pago.state === 'no_date' ? tarifa : [pago.label, tarifa].filter(Boolean).join(' · ')}
    </span>
  );
};

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
  } = useApp();
  const { setViewMode } = useActions();
  const { clientId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const hasClients = clients.length > 0;
  const onClient = Boolean(clientId);

  /*
    ── El recuento de la bandeja, en la puerta de «Hoy» ────────────────────────
    La MISMA bandeja que calculan «Hoy» y la cartera (`portfolioInbox`), contada
    aquí para que la barra lo diga desde cualquier pantalla: lo que espera
    respuesta no debería descubrirse solo al pasar por la bandeja. Una tercera
    cuenta propia divergiría; por eso se suman sus filas y no se inventa nada.
  */
  const pendientes = useMemo(() => {
    const rows = buildPortfolio({ clients, training, anthropometry, progressPhotos, checkIns, equipmentCounts });
    return portfolioInbox(rows).tasks.reduce((n, task) => n + task.rows.length, 0);
  }, [clients, training, anthropometry, progressPhotos, checkIns, equipmentCounts]);

  /*
    Qué número acompaña a cada puerta del nivel primario. «Hoy» lleva el trabajo
    que espera —en ámbar, porque es un pendiente, no un dato—; «Clientes», el
    tamaño de la cartera, en voz baja. Sin nada que contar no se pinta un cero:
    un cero permanente es cromo.
  */
  const cuentaDe = {
    '/hoy': pendientes > 0 ? { n: pendientes, warn: true, detalle: 'Esperan respuesta tuya' } : null,
    '/clientes': hasClients ? { n: clients.length, warn: false, detalle: 'Clientes en la cartera' } : null,
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
    ── Las piezas que se ven en las DOS geometrías ─────────────────────────────
    El selector de cliente y sus chapas aparecen en la barra lateral (escritorio)
    y en el subnivel (móvil). Se declaran UNA vez y se rinden en los dos huecos:
    un elemento de React es un descriptor y puede pintarse en dos sitios, así que
    la lista de clientes del selector —con su caso del archivado— no puede
    divergir entre geometrías.
  */
  const selector = onClient && activeClient && (
    <ClientSwitcher
      /*
        La cartera viva, más el cliente abierto si resulta estar archivado. Sin
        ese añadido, entrar por enlace directo a la ficha de alguien archivado
        enseñaría en el selector el nombre de OTRA persona —el primero de la
        lista— mientras debajo se ve la ficha del archivado. Aparecer no le
        desarchiva: sigue fuera de la cartera en cuanto se sale de su ficha.
      */
      clients={
        activeClient && !clients.some((c) => c.id === activeClient.id)
          ? [activeClient, ...clients]
          : clients
      }
      selectedClientId={selectedClientId}
      /* El plan y la antigüedad, en una sola línea de voz baja: los dos datos
         quietos de identidad, juntos y sin chapas. */
      subtitle={[
        activeClient.plan || 'Sin plan',
        activeClient.startDate && `desde ${dayMonthMaybeYear(activeClient.startDate)}`,
      ]
        .filter(Boolean)
        .join(' · ')}
      /* Cambiar de cliente conserva la sección: si estabas en su nutrición,
         pasas a la nutrición del otro. Salvo que al otro no le lleves dieta, y
         entonces se cae a su resumen: mandarle a una sección que no tiene sería
         un salto y un rebote. */
      onSelect={(id) =>
        navigate(
          sameSectionFor(
            location.pathname,
            id,
            clientProtocol(clients.find((c) => c.id === id)?.preferences)
          )
        )
      }
    />
  );

  /* Solo el cobro: es un ESTADO y puede avisar. La fecha de alta es un dato
     quieto y viaja en el subtítulo del selector — como chapa suelta al lado del
     botón del portal componía un cajón de piezas desparejas. */
  const chapas = onClient && activeClient && <ChapaDeCobro client={activeClient} />;

  /*
    La marca de «estás aquí» NO la decide `NavLink` por prefijo de URL. Desde que
    una sección tiene dos niveles —`revision` y `revision/fotos`, `resumen` y
    `analitica`— el prefijo se queda corto y bajar al segundo nivel dejaba la
    navegación entera sin marcar. Los niveles se declaran en `also`, en
    `routes.jsx`. Y solo las secciones que existen para él: a quien no le llevas
    dieta no le sobra media pantalla, es que no la tiene (`sectionsFor`).
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
  const miga = (() => {
    if (location.pathname.startsWith('/ajustes')) {
      const seccion = SETTINGS_SECTIONS.find((s) =>
        location.pathname.startsWith(`/ajustes/${s.path}`)
      );
      return ['Ajustes', seccion?.label].filter(Boolean);
    }
    if (onClient && activeClient) {
      const activa = seccionesDeCliente.find((s) => s.activa)?.seccion;
      return [activeClient.name, activa?.label].filter(Boolean);
    }
    const primaria = COACH_PRIMARY.find((p) => location.pathname.startsWith(p.path));
    return primaria ? [primaria.label] : [];
  })();

  return (
    <div className="shell">
      {/* ══ La barra lateral: solo existe en escritorio (ver EL CHASIS) ═══ */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <Logo subtitle={null} />
        </div>

        {/*
          ── El panel intercambiable ─────────────────────────────────────────
          La barra no apila planos: CAMBIA de plano, como el subnivel del móvil.
          Fuera de un cliente, el nivel primario; dentro, el cliente entero con
          su vuelta a la lista. La `key` fuerza el remontaje para que el cambio
          se anuncie con el fundido corto de `.sidebar-pane`.
        */}
        {onClient && activeClient ? (
          <div className="sidebar-pane" key="cliente">
            <NavLink to="/clientes" className="side-link side-back">
              <ArrowLeft size={15} />
              Clientes
            </NavLink>

            {/*
              ── Nada de filetes ni cajas dentro del cristal ───────────────────
              La barra separa por ESPACIO y agrupación, no por líneas: quién es
              (el selector, con el plan y la antigüedad en su subtítulo), su
              estado si lo hay (la chapa de cobro), las secciones, y al final
              su otra cara. Cada borde de más dentro de un panel de cristal es
              una caja dentro de una caja.
            */}
            {selector}
            {chapas && <div className="sidebar-meta">{chapas}</div>}

            <nav className="sidebar-nav" aria-label={`Secciones de ${activeClient.name}`}>
              {seccionesDeCliente.map(({ seccion, activa }) => {
                const { path, label, icon: Icon } = seccion;
                return (
                  <NavLink
                    key={path}
                    to={clientPath(clientId, path)}
                    className={`side-link${activa ? ' active' : ''}`}
                    aria-current={activa ? 'page' : undefined}
                  >
                    <Icon size={15} />
                    {label}
                  </NavLink>
                );
              })}
            </nav>

            {/*
              Ver el portal de ESTE cliente: la última fila de su plano, en voz
              de puerta. Aquí SOLO se cambia el modo; la ruta la traduce el
              comodín del árbol de destino (`OtherViewFallback`, en `App.jsx`):
              navegar también desde aquí pierde la carrera contra ese comodín,
              porque React Router navega en una transición de prioridad baja y
              el cambio de modo es una actualización normal.
            */}
            <button
              type="button"
              className="side-link side-action"
              onClick={() => setViewMode('client')}
            >
              <Eye size={15} />
              Ver su portal
            </button>
          </div>
        ) : (
          <div className="sidebar-pane" key="primario">
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
          </div>
        )}

        {/*
          ── El pie: ajustes, siempre a la vista ─────────────────────────────
          Un solo enlace, anclado abajo como en cualquier aplicación con barra
          (el engranaje de Slack o de Linear). La navegación INTERNA de ajustes
          sigue siendo de `SettingsLayout`, que ya la resuelve en las dos
          geometrías y lleva el contador de la ayuda; aquí solo está la puerta,
          que metida en el menú de cuenta no la encontraba nadie.
        */}
        <div className="sidebar-foot">
          <NavLink to="/ajustes" className="side-link">
            <Settings size={15} />
            Ajustes
          </NavLink>
        </div>
      </aside>

      <div className="shell-main">
        {/*
          ── La barra de herramientas del escritorio ─────────────────────────
          En el chasis no hay franja de cabecera: sus piezas van en este objeto
          de cristal, a juego con la barra lateral y alineado con la columna de
          contenido. Tres voces, de izquierda a derecha: dónde estás (la miga),
          a dónde vas (la búsqueda) y quién eres (la cuenta). La búsqueda y la
          cuenta son las MISMAS piezas que monta la cabecera del móvil
          (`Header.jsx`): el avatar está siempre arriba a la derecha, en
          cualquier modo y tamaño. La miga es solo del escritorio — en el móvil
          la cabecera lleva la marca y el contexto ya lo da el subnivel.
        */}
        <div className="shell-top">
          <div className="crumb">
            {miga.map((parte, i) => (
              <Fragment key={i}>
                {i > 0 && (
                  <span className="crumb-sep" aria-hidden="true">
                    ›
                  </span>
                )}
                <span className="crumb-part">{parte}</span>
              </Fragment>
            ))}
          </div>
          <Omnibox />
          <HeaderActions />
        </div>

        <div className="layout">
          {/* ── El subnivel del móvil: el mismo contexto, en horizontal ──── */}
          {onClient && activeClient && (
            <div className="subnav">
              <div className="subnav-head">
                <button
                  type="button"
                  className="btn btn-icon"
                  onClick={() => navigate('/clientes')}
                  aria-label="Volver a la lista de clientes"
                  title="Volver a la lista de clientes"
                >
                  <ArrowLeft size={16} />
                </button>

                {selector}

                {/* Las chapas se esconden en el móvil (`.subnav-chapas`): el
                    estado del cobro y la antigüedad viven en la ficha, y aquí
                    costaban una segunda línea de cabecera en las SIETE
                    secciones del cliente. */}
                <div className="row gap-2 wrap subnav-chapas">{chapas}</div>

                {/* La misma puerta al portal que en la barra lateral: solo
                    cambia el modo, la ruta la traduce `OtherViewFallback`.
                    En el móvil queda el ojo solo: el texto es lo que obligaba
                    a la cabecera a partirse en dos líneas. */}
                <button
                  type="button"
                  className="btn btn-sm subnav-view"
                  onClick={() => setViewMode('client')}
                  aria-label="Ver su portal"
                  title="Ver su portal"
                >
                  <Eye size={14} />
                  <span className="subnav-view-label">Ver su portal</span>
                </button>
              </div>

              {/*
                ══ Aquí vivió el carril de chips con las secciones ═══════════════
                Era la única navegación del cliente en el móvil, arriba del todo:
                la zona que el pulgar no alcanza, y otra fila más de chasis antes
                del contenido. Desde que la barra del pulgar cambia de plano al
                entrar en un cliente (ver abajo), esas mismas secciones están
                fijas y visibles donde está el dedo, y el carril sobraba: dos
                navegaciones para lo mismo son una pregunta («¿cuál uso?») que
                nadie tiene por qué contestar.
              */}
            </div>
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
          ══ La barra del pulgar CAMBIA de plano, como la barra lateral ═════════

          Llevaba siempre el primer nivel —Hoy, Clientes— y las secciones del
          cliente iban en un carril de chips arriba, en la zona que el pulgar no
          alcanza. Es decir: la navegación que se usa DECENAS de veces al día
          (moverse por un cliente) estaba en el sitio malo, y la que se usa dos
          veces (volver a Hoy) ocupaba el bueno.

          La barra lateral de escritorio ya había resuelto esto mismo: no apila
          planos, CAMBIA de plano — fuera de un cliente el nivel primario, dentro
          el cliente entero. La barra del pulgar hace ahora exactamente eso. No
          es mezclar niveles: en pantalla nunca hay más de un plano, y la vuelta
          al primario es la flecha de la cabecera, igual que en la barra lateral.

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
                 —barra lateral, portal, pulgar— cuestan más de memorizar que
                 lo que ahorra un toque en «Más». */
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
