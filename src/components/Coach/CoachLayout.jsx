import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowDownNarrowWide,
  ArrowDownWideNarrow,
  ArrowLeft,
  Cake,
  CalendarCheck,
  PersonStanding,
  Ruler,
  Search,
  UserPlus,
} from 'lucide-react';

import { useApp } from '@/context/AppContext';
import { latestWeight } from '@/domain/anthropometry';
import { feeLabel, paymentState } from '@/domain/billing';
import { identityFacts } from '@/domain/ficha';
import { buildPortfolio, colasDeInicio, portfolioInbox } from '@/domain/portfolio';
import { contestadasPorCliente, pendientesPorCliente } from '@/domain/envios';
import { clientProtocol } from '@/domain/protocol';
import { semanaDeAhora } from '@/domain/week';
import { useAtajoDelAncho, useBarraPlegada } from '@/lib/barraPlegada';
import { dayMonthMaybeYear, todayISO } from '@/lib/dates';
import { norm } from '@/lib/texto';
import {
  COACH_CLIENT,
  COACH_HOME,
  COACH_PRIMARY,
  COACH_TALLER,
  clientPath,
  isSectionActive,
  sameSectionFor,
  sectionsFor,
} from '@/routes';
import { EmptyState, Loading } from '@/components/ui/primitives';
import { Avatar } from '@/components/ui/Avatar';
import { EstadoDeRed, Nube } from '@/components/ui/EstadoDeRed';
import { Pliegue } from '@/components/ui/Pliegue';
import { useMarcaDeslizante } from '@/components/ui/carril';
import { BottomNav } from '@/components/ui/BottomNav';
import { Logo } from '@/components/ui/Logo';
import { Modal } from '@/components/ui/Modal';
import { ordenar, useOrden } from '@/components/ui/tabla';
import { HeaderActions, Omnibox } from '@/components/Header';
import { ClientSwitcher } from './ClientSwitcher';
import { GettingStarted } from './GettingStarted';

/*
  Las dos pantallas que la barra abre como CAPA (tanda 2 del puesto). Perezosas
  como en sus rutas (`App.jsx`): importarlas normal las metería en el chunk
  principal y desharía el troceo que ya tienen.
*/
const IncomePanel = lazy(() =>
  import('@/components/Coach/Income/IncomePanel').then((m) => ({ default: m.IncomePanel }))
);
const CoachCalendar = lazy(() =>
  import('@/components/calendar/CoachCalendar').then((m) => ({ default: m.CoachCalendar }))
);

/*
  ── Agenda y Caja son capas, no destinos (tanda 2) ──────────────────────────
  La regla del puesto: ir a otro sitio se reserva para cambiar de persona; lo
  demás viene a ti. Cobros y Agenda se abren ENCIMA de donde estés, en una
  ventana grande — la misma gramática que las «a fondo» del Resumen — y al
  cerrar sigues exactamente donde estabas, con el hilo intacto.

  Sus rutas NO se tocan: `/ingresos` y `/calendario` siguen respondiendo con la
  pantalla completa — son marcadores, y son el camino del móvil, donde no hay
  barra y la del pulgar navega con `COACH_PRIMARY` entero.
*/
const CAPAS = [
  { id: 'cobros', path: '/ingresos' },
  { id: 'agenda', path: '/calendario' },
];

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

/*
  ══ AQUÍ VIVIÓ EL PULSO ═════════════════════════════════════════════════════
  La cabecera llevó unos días el peso del cliente: los ocho últimos pesajes,
  la cifra de hoy y la variación. Fuera por decisión del dueño. El peso ya
  tiene su sitio —«El cuerpo», con su serie, sus ejes y su escala— y en la
  cinta era una cifra sin contexto compitiendo con la identidad de la persona.

  Con el pulso se va también el filtro que lo sacaba de la anatomía: los cuatro
  hechos de `identityFacts` vuelven completos, el peso incluido.
*/

/**
 * A partir de cuántos clientes la cola lleva filtro.
 *
 * Ocho es lo que cabe en la barra sin rodar en una pantalla normal: hasta ahí
 * la lista se abarca de una mirada y un campo de texto encima es un trámite
 * para hacer lo que hace el ojo. De ahí en adelante hay que desplazarse, y
 * entonces filtrar es lo que separa una cola de un listín.
 */
const UMBRAL_FILTRO = 8;

/** La pestaña desde la que NO se ofrece «Revisar semana»: ya estás en ella. */
const SECCION_SEMANA = COACH_CLIENT.find((s) => s.path === 'semana');
/** El perfil: en escritorio se abre desde el nombre, no desde una pestaña. */
const SECCION_FICHA = COACH_CLIENT.find((s) => s.path === 'ficha');

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
    envioRows,
    workoutData,
  } = useApp();
  const { clientId } = useParams();

  /* Si la barra va recogida a iconos —solo para pintarla así; quien lo manda
     es el botón del ancho, en la esquina de la cinta (`ui/Pliegue`)— y por
     quién has pasado últimamente. Los dos aquí arriba con el resto de ganchos:
     más abajo hay retornos tempranos. */
  const [plegada] = useBarraPlegada();
  /* El atajo del ancho (`Ctrl + \`), montado UNA sola vez y aquí: este es el
     único sitio que pinta la barra lateral. Ver `lib/barraPlegada`. */
  useAtajoDelAncho();
  /* Lo escrito en el filtro de la cola. Es del momento y no del aparato: filtrar
     la lista es un gesto de ahora, y encontrársela filtrada mañana al abrir la
     aplicación sería esconder media cartera sin haberlo pedido. */
  const [filtro, setFiltro] = useState('');
  /*
    ── Y por qué orden se sienta la cola ──────────────────────────────────────
    Sin campo: manda el del dominio, que es la urgencia (`buildPortfolio`). Es el
    MISMO `useOrden` de las tablas del producto (`ui/tabla.jsx`), y no un estado
    propio, porque el mando que lo enseña es el de la cartera: una lista de
    personas se ordena igual esté en una tabla o en la barra.

    Del momento, como el filtro: se elige para contestar una pregunta de ahora
    —«¿a quién no he visto?»— y encontrarse mañana la barra en Z → A sería una
    decisión de anteayer aplicada a ciegas. Aquí arriba con los demás ganchos.
  */
  const orden = useOrden(null);
  const location = useLocation();
  const navigate = useNavigate();
  /* La marca de «estás aquí» del carril del cliente, que viaja entre destinos
     en vez de teletransportarse (`ui/carril.js`). Aquí arriba con los demás
     ganchos: más abajo hay retornos tempranos y quedaría a un lado de un `if`.
     Sin carril montado no hay nada que medir y se retira sola. */
  const carrilDeCliente = useMarcaDeslizante();

  /*
    ══ CUÁNTO OCUPA LA CABECERA DEL CLIENTE, EN UNA VARIABLE ══════════════════

    `.cliente-cab` es `sticky top: 0` en escritorio, así que cualquier otra cosa
    que quiera quedarse pegada DEBAJO —la banda de hojas de Entreno es la
    primera que lo pide— necesita saber su alto. Y no es un número: cambia con
    el ancho de la ventana (la fila de identidad envuelve), con el tema, y con
    si el cliente lleva chapa de cobro o no.

    Así que se mide y se publica en `--cliente-cab-h`, sobre el `<html>` para
    que la vea cualquier hoja de estilo. Un `ResizeObserver` y ya: nadie tiene
    que acordarse de recalcularlo. Sin cabecera montada —la cartera, el taller—
    la variable se retira y quien la use cae a su valor de reserva.

    Aquí arriba con los demás ganchos, y por el mismo motivo que el carril: más
    abajo hay retornos tempranos. Por eso mira el DOM en vez de una `ref`: la
    cabecera se monta condicionalmente 500 líneas más abajo, y con una `ref` la
    primera medida llegaría un render tarde.
  */
  useEffect(() => {
    const raiz = document.documentElement;
    const cab = document.querySelector('.cliente-cab');
    if (!cab) {
      raiz.style.removeProperty('--cliente-cab-h');
      return undefined;
    }
    const medir = () => raiz.style.setProperty('--cliente-cab-h', `${Math.round(cab.offsetHeight)}px`);
    medir();
    const ojo = new ResizeObserver(medir);
    ojo.observe(cab);
    return () => {
      ojo.disconnect();
      raiz.style.removeProperty('--cliente-cab-h');
    };
  }, [location.pathname, loading]);

  /* La capa abierta ('cobros' | 'agenda' | null). Navegar la cierra: cambiar
     de sitio es el único viaje del puesto, y una ventana de otra pantalla
     flotando sobre el destino sería llevarse la mesa a cuestas. */
  const [capa, setCapa] = useState(null);
  useEffect(() => {
    setCapa(null);
  }, [location.pathname]);

  const hoy = todayISO();
  const hasClients = clients.length > 0;
  const onClient = Boolean(clientId);

  /*
    La semana por la que va, y es LA MISMA que dice el resto de la aplicación:
    `semanaDeAhora` (ver `domain/week.js`). Antes esto usaba `latestActiveWeek`,
    que solo mira los microciclos montados, y por eso la cabecera podía decir
    «Semana 10» mientras el contenido de esa misma pantalla decía «Semana 18».
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
    return (
      semanaDeAhora({
        startDate: inicioAbierto,
        today: hoy,
        microcycles: programaAbierto?.microcycles || [],
        history: historiaAbierta || [],
        photos: fotosAbiertas,
      }) ||
      resumenAbierto?.weekNumber ||
      null
    );
  }, [clientId, programaAbierto, historiaAbierta, fotosAbiertas, inicioAbierto, resumenAbierto, hoy]);

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
  const mandadoCounts = useMemo(() => pendientesPorCliente(envioRows), [envioRows]);
  const contestadoCounts = useMemo(() => contestadasPorCliente(envioRows), [envioRows]);

  const bandeja = useMemo(() => {
    const rows = buildPortfolio({ clients, training, anthropometry, progressPhotos, checkIns, equipmentCounts, mandadoCounts, contestadoCounts });
    const { tasks } = portfolioInbox(rows);
    /* Las colas ENTERAS, no solo su suma: desde «El puesto» la barra es el
       inicio y enseña a la gente de cada cola, no una cifra en una puerta. */
    const colas = colasDeInicio(rows);
    return {
      // La MISMA cifra que las cuatro colas de «Inicio»: los trámites no cuentan.
      total: colas.reduce((n, cola) => n + cola.n, 0),
      /* El puesto de cada uno en la fila: `buildPortfolio` ya ordena por
         urgencia, y la cartera de la barra se sienta en ese mismo orden. */
      orden: new Map(rows.map((row, i) => [row.client.id, i])),
      esperando: new Set(
        tasks.filter((task) => task.awaited).flatMap((task) => task.rows.map((row) => row.client.id))
      ),
      /* Por qué microciclo va cada uno, ya dicho: «M18», o «M3 de 4» si le
         pusiste duración prevista. Del mismo `horizonteEscrito` del que salen la
         cola y la previsión de la portada — un solo cálculo, tres sitios. */
      microciclo: new Map(
        rows
          .filter((row) => row.horizonte)
          .map((row) => [
            row.client.id,
            row.horizonte.previstas && row.horizonte.posicion
              ? `M${row.horizonte.posicion} de ${row.horizonte.previstas}`
              : `M${row.horizonte.microcicloEnCurso}`,
          ])
      ),
      /* Los días que lleva cada uno sin entrenar. No se pinta en ninguna fila
         —la barra dice el nombre, el punto y el microciclo, y para comparar
         está `/clientes`—: es lo único que hace falta para poder ORDENAR por
         ello, que es la otra pregunta que se le hace a esta lista. El mismo
         `sinceTraining` con el que ordena su columna en la cartera; contarlo
         aquí por segunda vez sería un segundo «último entreno». */
      sinEntrenar: new Map(rows.map((row) => [row.client.id, row.sinceTraining])),
    };
  }, [clients, training, anthropometry, progressPhotos, checkIns, equipmentCounts, mandadoCounts, contestadoCounts]);

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
    /*
      El tamaño de la cartera vuelve, y vuelve a la PUERTA. Vivía en el rótulo
      de la franja, que además era el enlace escondido a esta misma pantalla:
      dos papeles —nombrar la tanda y llevar a la tabla— en una versalita. La
      cifra va donde está la pregunta que contesta, y el rótulo se queda solo
      nombrando. En voz baja (`warn` no): cuántos llevas es un dato, no trabajo.
    */
    '/clientes': clients.length > 0 ? { n: clients.length, detalle: 'Clientes en tu cartera' } : null,
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

    Un solo hueco desde que la lista salió de la barra: el selector del móvil.
    Se conserva la lista como concepto —y este caso raro con ella— porque el
    día que el archivado se abra por enlace, el selector tiene que enseñar SU
    nombre y no el de la primera persona de la cartera.
  */
  const cartera =
    activeClient && !clients.some((c) => c.id === activeClient.id)
      ? [activeClient, ...clients]
      : clients;

  /*
    ── Las filas de la cola, en el orden del trabajo ──────────────────────────
    `buildPortfolio` ya ordena por urgencia y la barra se sienta en ese mismo
    orden: quien te espera arriba. Alfabético parecía más «lista», pero una lista
    que no ordena por nada es un índice, y para buscar un nombre concreto están
    el filtro y el buscador.

    El filtro compara en minúsculas y sin acentos: quien escribe «alvaro» en la
    barra espera encontrar a Álvaro, y no encontrarlo se lee como que no está.
  */
  const busca = norm(filtro);
  const filas = ordenar(
    cartera
      .filter((c) => !busca || norm(c.name).includes(busca))
      .sort((a, b) => (bandeja.orden.get(a.id) ?? 0) - (bandeja.orden.get(b.id) ?? 0)),
    orden,
    /* Dos preguntas y ninguna más. `ordenar` devuelve la lista tal cual mientras
       no haya campo, así que la urgencia sigue siendo lo que se ve al entrar. */
    {
      nombre: (c) => c.name,
      entreno: (c) => bandeja.sinEntrenar.get(c.id),
    }
  ).map((cliente) => ({
    cliente,
    espera: bandeja.esperando.has(cliente.id),
    microciclo: bandeja.microciclo.get(cliente.id) || null,
  }));

  /*
    ── Lo que la cola puede contestar ─────────────────────────────────────────
    Dos criterios, no los cinco de la cartera: aquí no hay columnas de estado,
    semana ni peso que ordenar, y ofrecer un orden que la fila no explica deja
    una lista barajada sin decir por qué. «Nombre» es el que se echa en falta
    —la barra es donde se busca a alguien que ya se sabe quién es, y la urgencia
    lo mueve de sitio cada mañana— y «Último entreno» es la pregunta que el
    punto no contesta: el punto dice quién te espera, no a quién no has visto.

    Con un solo cliente no hay nada que ordenar, y «Último entreno» solo si
    alguien ha entrenado alguna vez: la regla de los chips a cero.
  */
  const camposDeOrden =
    cartera.length > 1
      ? [
          { id: 'nombre', label: 'Nombre', sentidos: { asc: 'A → Z', desc: 'Z → A' } },
          [...bandeja.sinEntrenar.values()].some((d) => d !== null && d !== undefined) && {
            id: 'entreno',
            label: 'Último entreno',
            num: true,
            sentidos: {
              asc: 'los que acaban de entrenar',
              desc: 'los que más llevan sin entrenar',
            },
          },
        ].filter(Boolean)
      : [];

  /*
    ── El ciclo: urgencia → nombre → último entreno → urgencia ────────────────
    Una pulsación, el siguiente orden. Y el de casa DENTRO del ciclo, no fuera:
    si volver a la urgencia costara un gesto distinto, el orden con el que se
    abre la pantalla —«¿por quién empiezo hoy?»— se perdería en el primer clic.
    Es lo que hace «Restablecer» en el menú de la cartera, dicho como paso.

    NO se ofrecen los dos sentidos de cada campo: serían cinco paradas para tres
    preguntas, y a la cuarta pulsación ya no se sabe dónde estás. Cada orden
    entra por su lado útil (`num` lo decide: de los nombres se quiere la A; de
    los días sin entrenar, el que más lleva). Los dos sentidos siguen en la
    cartera, que tiene cabeceras donde se ve la flecha.
  */
  const cicloDeOrden = [null, ...camposDeOrden.map((c) => c.id)];
  const siguienteOrden =
    cicloDeOrden[(Math.max(0, cicloDeOrden.indexOf(orden.campo)) + 1) % cicloDeOrden.length];
  const nombreDeOrden = (id) =>
    id === null ? 'urgencia' : (camposDeOrden.find((c) => c.id === id)?.label || '').toLowerCase();
  const pasarDeOrden = () => {
    if (siguienteOrden === null) orden.restablecer();
    else orden.cambiar(siguienteOrden, camposDeOrden.find((c) => c.id === siguienteOrden)?.num);
  };
  /*
    ── El icono dice el SENTIDO, no el campo ──────────────────────────────────
    Tres barras y una flecha: las barras son la lista y la flecha, por dónde
    empieza. Es el icono de ordenar de todo el mundo, y se prefiere a la doble
    flecha (`ArrowUpDown`) porque aquélla solo decía «esto se puede ordenar» —un
    rótulo de la función, no del estado—, y el mando ya estaba mudo por fuera.

    Qué campo manda NO se dibuja, y es a propósito: son tres paradas y el icono
    daría para dos. Lo dice la lista, que se reordena debajo del dedo, y el
    globo. Lo que sí cabe sin mentir es hacia dónde corre, que es lo único que
    un icono de ordenar ha significado nunca.

    La urgencia es «desc» aunque `useOrden` la guarde en su sentido de fábrica:
    sin campo no hay sentido que leer, y el orden de casa pone arriba a quien
    más espera — de más a menos, como el resto de las descendentes.
  */
  const IconoDeOrden =
    (orden.campo === null ? 'desc' : orden.sentido) === 'asc'
      ? ArrowDownNarrowWide
      : ArrowDownWideNarrow;

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

  /* Las puertas que sobreviven al puesto, buscadas por ruta y no por índice:
     el orden de `COACH_PRIMARY` es del móvil y puede cambiar sin avisar. */
  const puerta = (path) => COACH_PRIMARY.find((p) => p.path === path);

  /*
    ── El selector, que sigue siendo SOLO del móvil ───────────────────────────
    Vivió en la barra lateral, y allí era la consecuencia de que la cartera no
    cupiera: si la lista no está, hace falta un desplegable que la traiga. Se
    retiró cuando la lista entró.

    Ahora la lista ha vuelto a salir, así que el argumento de entonces pediría
    devolverlo — y NO se hace. En el escritorio la cabecera del cliente ya
    enseña su cara y su nombre, y el botón del selector trae los suyos: serían
    dos identidades en la misma fila. Es exactamente por lo que el móvil
    esconde la puerta del perfil cuando enseña el selector
    (`.cliente-cab-puerta` en `chasis.css`), y allí puede porque no hay barra
    que la sustituya. Aquí sí: «Clientes» está siempre a la vista, y el
    buscador encuentra a cualquiera sin salir de donde estés.

    En el móvil sigue siendo la única forma: allí no hay barra.
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
    ── La anatomía, en la cabecera de las cinco pestañas ──────────────────────
    Los MISMOS cuatro hechos que abren su ficha (`identityFacts`): edad, altura,
    último peso y sexo. Se suben aquí porque son lo que hay que saber de la
    persona antes de decidir nada, en cualquier pestaña — no solo en su perfil.

    Solo los que están puestos: el hueco que invita a completar («+ Altura»)
    es de la ficha, que es donde se arregla. Repetir el reproche en una cabecera
    que se ve todo el rato sería llevarlo puesto.
  */
  const anatomia =
    onClient && activeClient
      ? identityFacts({ client: activeClient, weight: latestWeight(historiaAbierta || []) }).filter(
          /* El PESO no: fuera de la cabecera por decisión del dueño. Su sitio es
             «El cuerpo», con su serie y su escala; aquí era una cifra suelta
             compitiendo con la identidad de la persona. */
          (f) => f.value && f.id !== 'weight'
        )
      : [];
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
    ── El perfil es OTRA página, no una sexta pestaña ─────────────────────────
    Hubo una versión en la que abrir el perfil dejaba el nombre en azul de
    «seleccionado» con las cuatro pestañas encima y una miga debajo: tres capas
    de cromo diciendo dónde estás, y ninguna diciéndolo bien. El dueño lo vio
    con la palabra justa: se quería «un saltar de página», como Coachway.

    Así que dentro del perfil la cabecera SE TRANSFORMA: la flecha de volver
    junto al nombre, las pestañas se retiran (en escritorio; en móvil «Perfil»
    es una pestaña del pulgar y nada de esto aplica) y el nombre habla en tinta
    plena, porque ya no es una puerta — es el título de la página en la que
    estás. La vuelta lleva a la sección desde la que se saltó (`state.desde`);
    entrando por URL directa no hay salto que deshacer y se cae al resumen.
  */
  const enFicha = onClient && isSectionActive(location.pathname, SECCION_FICHA, '/c/[^/]+');

  const seccionAbierta = seccionesDeCliente.find(({ activa }) => activa)?.seccion.path;
  const desde = location.state?.desde;
  const vueltaDelPerfil = clientPath(clientId, desde && desde !== 'ficha' ? desde : 'resumen');

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
      <aside className={`sidebar barra-tinta${plegada ? ' is-plegada' : ''}`}>
        {/*
          ══ LA MARCA, Y NINGÚN MANDO ════════════════════════════════════════
          Aquí estuvo el interruptor del pliegue, y duró una tarde: cromo del
          chasis en la esquina donde el chasis no tiene que explicarse. El
          pliegue no es una preferencia que se vaya a buscar, es la respuesta a
          una pantalla que se queda estrecha, así que el mando se ha ido a esa
          pantalla —«Ampliar», en la cabecera de Entreno— y la barra solo
          obedece. El porqué entero, en `lib/barraPlegada`.
        */}
        <div className="sidebar-brand">
          <Logo subtitle={null} />
        </div>
        {/* Buscar vive en la barra: es a donde se va, no un mueble aparte. */}
        <div className="sidebar-buscar">
          <Omnibox />
        </div>

        {/*
          ══ EL NIVEL PRIMARIO: cuatro puertas y UNA sola voz ═════════════════
          Aquí vivió «Inicio» a solas, y las otras tres estaban repartidas por
          la columna con tres tratamientos distintos:

            · «Clientes» no existía — su puerta era el RÓTULO de la cartera, o
              sea una versalita terciaria que nadie lee como pulsable. Un
              destino del nivel primario escondido dentro de una etiqueta.
            · «Cobros» y «Agenda» hablaban en tinta terciaria pegadas al pie,
              debajo del taller: la tipografía decía que «Alimentos» pesa más
              que cobrar, que es lo contrario de lo que dice el modelo.
            · Y «Inicio» era un enlace suelto, sin rótulo ni grupo.

          Tres gramáticas para un mismo plano en una columna de ocho filas: de
          ahí salía la sensación de barra desperdigada. Efort usa UNA (enlaces
          planos); Coachway usa UNA (rótulo + enlaces, repetido). Nosotros
          usábamos tres para menos destinos que cualquiera de los dos.

          Ahora las cuatro se pintan igual y en el orden de `COACH_PRIMARY`,
          que es además el que ya usa la barra del pulgar en el móvil: un solo
          sitio decide el orden del nivel primario.

          ── Cobros y Agenda siguen siendo CAPAS ────────────────────────────
          Lo que cambia es la VOZ, no el gesto: se siguen abriendo encima de
          donde estés y al cerrar sigues donde estabas (ver `CAPAS` arriba). Por
          eso son `button` y no `NavLink` aunque se vistan igual — de una puerta
          importa dónde te deja, y éstas te dejan donde ya estabas.
        */}
        <nav className="sidebar-nav sidebar-puertas" aria-label="Navegación principal">
          {COACH_PRIMARY.map(({ path, label, icon: Icon }) => {
            const capaId = CAPAS.find((c) => c.path === path)?.id;
            /* Si ya estás EN su ruta (marcador, o el móvil), la fila se marca y
               pulsar no abre nada: una ventana de lo que ya llena la pantalla
               sería un espejo. */
            const enSuRuta = location.pathname === path;
            if (capaId) {
              return (
                <button
                  key={path}
                  type="button"
                  className={`side-link${capa === capaId || enSuRuta ? ' active' : ''}`}
                  /* Plegada, el rótulo es lo único que falta y el título lo
                     devuelve. Desplegada NO se pone: repetir en un globo la
                     palabra que está escrita al lado es ruido. */
                  title={plegada ? label : undefined}
                  aria-haspopup="dialog"
                  aria-expanded={capa === capaId}
                  onClick={() => {
                    if (!enSuRuta) setCapa(capaId);
                  }}
                >
                  <Icon size={15} />
                  {label}
                </button>
              );
            }
            const cuenta = cuentaDe[path];
            return (
              <NavLink key={path} to={path} className="side-link" title={plegada ? label : undefined} end>
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
          ══ TUS CLIENTES: la barra ES LA COLA ═══════════════════════════════

          Aquí vivió la cartera entera, salió el 8 de septiembre por listín, y
          volvió con dos señales que son las que la convierten en otra cosa. El
          diagnóstico de entonces era correcto y sigue siéndolo: **una lista de
          nombres a secas es la cuarta forma de llegar a un cliente y no dice
          nada que el buscador no diga antes**. Lo que cambia no es la lista, es
          lo que lleva cada fila.

          Es lo que más impresiona del panel de Efort y no lleva ni un gráfico:
          bajo la navegación, la lista entera SIEMPRE, con una marca de atendido
          y por qué semana va cada uno. Navegación, cola y horizonte dejan de ser
          tres pantallas y pasan a ser el mismo objeto.

          ── Las DOS señales, y la tercera que se quedó fuera ─────────────────
          · El PUNTO azul: esta persona espera algo tuyo (las tareas `awaited`
            de `domain/portfolio`, las mismas que cuenta la chapa de Inicio).
            Azul porque invita, no porque riña — la ley del color.
          · El MICROCICLO por el que va: «M18». Sin «de cuántos», porque un
            bloque nuestro es abierto; solo si le pusiste duración prevista dice
            «M3 de 4», que entonces no es una deducción sino tu plan, dicho.

          La tercera —el punto tras la cifra para «no hay microciclo escrito
          después»— se probó y se cae aquí a propósito: tres marcas por fila en
          una columna de 240 px es la tabla que hizo envejecer mal la versión
          anterior. Ese aviso tiene su sitio en la portada, que es donde se
          trabaja con él (la cola «Sin semana siguiente» y la previsión).

          ── Y por eso el «S2·S3·S1·S17» de antes no vuelve ──────────────────
          Aquella columna era la semana MONTADA, o sea un hecho sobre tu trabajo
          puesto en la fila de otra persona. Ésta es el microciclo por el que va
          ELLA, que es de lo que habla su fila. Ver `semanaDeAhora`: un solo
          reloj para toda la aplicación.

          Con la barra recogida NO se pinta: 64 px son para el icono de un
          destino, y un nombre sin cara ahí no es nada (ver `lib/barraPlegada`).
        */}
        {cartera.length > 0 && (
          <nav className="sidebar-nav sidebar-cartera" aria-label="Tus clientes">
            <p className="sidebar-group">
              Tus clientes <span className="sidebar-group-n">{cartera.length}</span>
            </p>
            {/*
              El filtro solo cuando la lista deja de abarcarse de una mirada. Con
              seis nombres delante, un campo de texto encima es un trámite para
              hacer lo que hace el ojo; con veinte, es la diferencia entre una
              cola y un listín. No compite con el buscador de arriba: aquél va a
              cualquier sitio de la aplicación, éste solo tacha filas de aquí.
            */}
            {/*
              ══ LA BARRA DE LA COLA: filtrar a la izquierda, ordenar a la derecha
              La misma línea y el mismo reparto que la barra de la cartera —el
              buscador y, al otro extremo, «Por …»—, porque es la misma lista de
              gente en otro mueble. Aprender el gesto en una pantalla y volver a
              buscarlo en la otra es lo que hace que una aplicación parezca dos.

              El mando SÍ está cuando el filtro no: ordenar catorce nombres y
              filtrar catorce nombres no son el mismo problema. Con seis
              clientes el ojo hace de filtro, pero seguir queriendo la lista en
              A → Z es legítimo desde el segundo.
            */}
            {(cartera.length >= UMBRAL_FILTRO || camposDeOrden.length > 0) && (
              <div className="sidebar-barra">
                {cartera.length >= UMBRAL_FILTRO && (
                  <div className="sidebar-filtro">
                    <Search size={15} aria-hidden="true" />
                    <input
                      type="search"
                      value={filtro}
                      onChange={(e) => setFiltro(e.target.value)}
                      placeholder="Filtrar…"
                      aria-label="Filtrar tus clientes"
                    />
                  </div>
                )}
                {camposDeOrden.length > 0 && (
                  /* EL MANDO ES EL GESTO: se pulsa y la lista se reordena. Sin
                     menú. Aquí hubo el `MandoDeOrden` de la cartera —primero
                     con su rótulo («Por último entreno», que en 240 px dejaba
                     el campo de filtrar en 39 px) y luego mudo, con el menú
                     dentro—, y las dos veces el dueño señaló lo mismo: para
                     elegir entre tres cosas, abrir una capa y volver a apuntar
                     es un paso de más. El menú se queda donde se gana el sitio:
                     en la cartera, con seis columnas y dos sentidos cada una.

                     La prueba de que basta una pulsación es que la respuesta
                     está DELANTE: la lista se reordena debajo del dedo. El
                     globo dice en cuál estás y cuál viene. */
                  <button
                    type="button"
                    className="sidebar-orden"
                    onClick={pasarDeOrden}
                    title={`Por ${nombreDeOrden(orden.campo)} · pulsa para ordenar por ${nombreDeOrden(siguienteOrden)}`}
                    aria-label={`Ordenar tus clientes. Ahora, por ${nombreDeOrden(orden.campo)}; al pulsar, por ${nombreDeOrden(siguienteOrden)}`}
                  >
                    <IconoDeOrden size={15} aria-hidden="true" />
                  </button>
                )}
              </div>
            )}
            <div className="sidebar-lista">
              {filas.map(({ cliente, espera, microciclo }) => (
                <NavLink
                  key={cliente.id}
                  to={destinoDe(cliente.id)}
                  /* El marcado NO lo decide `NavLink`: su `isActive` compara con
                     `to`, y `to` conserva la sección en la que estás — así que al
                     cambiar de pestaña dentro de la misma persona el destino deja
                     de coincidir con la URL y la fila se apagaba con esa persona
                     abierta delante. Quién está abierto lo dice la ruta. */
                  className={`side-link side-persona${cliente.id === clientId ? ' active' : ''}`}
                  title={cliente.name}
                >
                  {/* El punto ocupa su hueco esté o no encendido: si apareciera,
                      empujaría el nombre y la lista bailaría al contestar alguien. */}
                  <span
                    className={`side-punto${espera ? ' is-espera' : ''}`}
                    aria-hidden={!espera}
                    title={espera ? 'Te espera' : undefined}
                  />
                  <span className="side-persona-nombre">{cliente.name}</span>
                  {microciclo && <span className="side-ciclo">{microciclo}</span>}
                </NavLink>
              ))}
              {filas.length === 0 && <p className="sidebar-vacio">Nadie con ese nombre</p>}
            </div>
          </nav>
        )}

        {/*
          ══ TU TALLER: la otra mitad de la aplicación ═══════════════════════
          Arriba, con quién trabajas. Aquí, con qué: tu forma de llevar a un
          cliente, lo que le preguntas, tus ejercicios, tus alimentos y tus
          días guardados. Hasta ahora ese material vivía dentro de Ajustes,
          dentro del cajón de un bloque o en ningún sitio, y la aplicación
          parecía más pequeña de lo que es. El porqué largo, en `COACH_TALLER`.

          El rótulo es lo que hace legible que son DOS planos y no nueve
          entradas seguidas: es el mismo recurso que agrupa la barra de
          Coachway, y ahora se usa dos veces —aquí y en la cartera— con la
          misma gramática en las dos.
        */}
        <nav className="sidebar-nav sidebar-taller" aria-label="Tu taller">
          <p className="sidebar-group">Tu taller</p>
          {COACH_TALLER.map(({ path, label, icon: Icon, also = [] }) => (
            <NavLink
              key={path}
              to={path}
              /* La Librería son dos rutas —`/ejercicios` y `/alimentos`— en una
                 sola fila, así que `isActive` de `NavLink` no basta: mira solo
                 su propio `to` y la fila se apagaría en cuanto pasaras al tramo
                 de alimentos. `also` la mantiene encendida en las dos, que es
                 justo lo que el rótulo promete. */
              className={({ isActive }) =>
                `side-link${isActive || also.includes(location.pathname) ? ' active' : ''}`
              }
              title={plegada ? label : undefined}
            >
              <Icon size={15} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/*
          ══ AQUÍ VIVIÓ LA CARTERA, Y SE HA IDO ══════════════════════════════
          La barra llevó la lista de clientes: primero en medio, luego —tras
          reordenarla— la última y entera. Con cartera de verdad seguían siendo
          diecisiete filas en una columna, y el dueño lo dijo mirándola: «un
          poco feo y desorganizado, mucha información».

          El problema no era el orden, era la CANTIDAD. Coachway lleva doce
          entradas y ninguna lista de clientes; Efort lleva seis y sí la lleva.
          Nosotros llevábamos las dos mitades enteras: nueve destinos MÁS la
          gente. Éramos los únicos.

          ── Y era la CUARTA forma de llegar a un cliente ───────────────────
          Ya están «Inicio» (que dice quién te espera y POR QUÉ), la tabla de
          `/clientes` (que dice cuántos y cuánto) y el buscador de aquí arriba.
          La lista de la barra era la única que no daba contexto: un nombre y
          una cifra. Y un nombre suelto solo sirve si ya sabes a quién buscas
          — y si lo sabes, el buscador es más rápido que recorrer catorce.

          Con ella se van sus dos vicios: la columna de semanas alineada a la
          derecha (S2·S3·S1·S17·S5·S5·S5·S5, que se lee como una tabla que
          comparar y no como navegación) y la única franja que crecía sin
          techo — con cuarenta clientes la barra era un listín.

          ── Lo que cuesta, dicho en voz alta ───────────────────────────────
          Saltar de un cliente a otro pasa de un clic a dos (Clientes → su
          fila) o al buscador. Es el precio, y es el que paga Coachway. NO se
          compensa metiendo el `ClientSwitcher` en la cabecera del cliente:
          allí ya están su cara y su nombre, y el selector trae los suyos —dos
          identidades en la misma fila, que es justo por lo que el móvil
          esconde la puerta cuando enseña el selector.

          Lo que queda son once filas que no crecen nunca.
        */}

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
              fila. Solo dos: la campana del cliente y tu cuenta. Lo que se monte
              en `HeaderActions` acaba AQUÍ, así que ahí dentro no cabe nada que
              no sea de esta esquina —la nube y el aviso de lo no guardado se
              fueron por eso—. Ver `Header`. */}
          <HeaderActions variante="fila" />
        </div>
      </aside>

      {/* La capa abierta: la pantalla entera de Cobros o Agenda, encima de
          donde estés. Cerrar (equis, Escape o el fondo) te deja donde estabas. */}
      {capa && (
        <Modal
          size="capa"
          title={puerta(CAPAS.find((c) => c.id === capa).path).label}
          onClose={() => setCapa(null)}
        >
          <Suspense fallback={<Loading />}>
            {capa === 'cobros' ? <IncomePanel enCapa /> : <CoachCalendar enCapa />}
          </Suspense>
        </Modal>
      )}

      <div className="shell-main">
        {/* El estado de la red, cuando tiene algo que decir. Entra en la columna
            de contenido y no encima del chasis: montada en `App` —donde la
            monta el portal— empujaba la barra lateral entera hacia abajo, que
            es justo lo contrario de «que esté en la página». Ver
            `ui/EstadoDeRed`. */}
        <EstadoDeRed />
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
          <header className={`cliente-cab${enFicha ? ' is-perfil' : ''}`}>
            {/* El interior se centra en la MISMA columna que el trabajo de
                debajo (`--max-w-trabajo`, el ancho de las cinco pestañas del
                cliente): la banda cruza la hoja de canto a canto y lo que
                lleva dentro cae a plomo sobre las tarjetas. */}
            <div className="cliente-cab-in">
              {/* La línea de identidad: quién es —con su cara y su anatomía—
                  a la izquierda; su estado y los dos verbos a la derecha. Los
                  destinos ya no cuelgan aquí en medio: tienen su raíl debajo. */}
              <div className="cliente-cab-linea">
              <div className="cliente-cab-quien">
                {/* El ancho, EN CABEZA: la hoja crece hacia la izquierda —el
                    canto derecho no se mueve— así que el mando va del lado que
                    se abre. Ver `ui/Pliegue`. */}
                <Pliegue />
                <button
                  type="button"
                  className="btn btn-icon cliente-cab-volver"
                  onClick={() => navigate('/clientes')}
                  aria-label="Volver a la lista de clientes"
                  title="Volver a la lista de clientes"
                >
                  <ArrowLeft size={15} />
                </button>
                {/* ── La puerta del perfil: la cara, el nombre y la anatomía ──
                    Una sola puerta, no dos. Antes el nombre era un enlace y la
                    línea de datos era OTRO enlace al mismo sitio, veinte
                    píxeles debajo; apilados eso se descubría, pero en una banda
                    de 64 px las dos se ven a la vez y la segunda es un doblete.

                    DENTRO del perfil deja de ser puerta: has saltado a su
                    página, el nombre es el título y delante va la vuelta. Nada
                    de azul de «seleccionado» — no estás en una pestaña, estás
                    en otra hoja (ver `is-perfil`, y `is-quieta` para el color). */}
                {enFicha ? (
                  <div className="cliente-cab-puerta is-quieta">
                    {/* La flecha OCUPA el sitio de la cara — mismo círculo,
                        mismo hueco — para que el nombre no se mueva ni un
                        píxel al entrar. Un titular que baila entre pantallas
                        se lee como un fallo, no como una transformación. */}
                    <button
                      type="button"
                      className="btn btn-icon cliente-cab-atras"
                      onClick={() => navigate(vueltaDelPerfil)}
                      aria-label="Salir de su perfil"
                      title="Salir de su perfil"
                    >
                      <ArrowLeft size={15} />
                    </button>
                    <h1 className="cliente-cab-nombre">{activeClient.name}</h1>
                  </div>
                ) : (
                  <Link
                    className="cliente-cab-puerta"
                    to={clientPath(clientId, 'ficha')}
                    state={{ desde: seccionAbierta }}
                    title="Su perfil: sus datos, sus fechas y su cobro"
                  >
                    <Avatar name={activeClient.name} src={activeClient.avatar} size="md" />
                    <h1 className="cliente-cab-nombre">{activeClient.name}</h1>
                  </Link>
                )}
                <div className="cliente-cab-selector">{selector}</div>
                {/* La nube, pegada al nombre: lo que dice es de qué se fía lo
                    que estás mirando, así que va con lo que estás mirando y no
                    en la esquina de lo que se puede hacer. Detrás del selector
                    y no delante porque en el móvil el que ocupa el hueco del
                    nombre es él —la puerta se retira— y el signo va al final de
                    la línea de identidad en las dos geometrías. Ver
                    `ui/EstadoDeRed`. */}
                <Nube />
                {/* La línea de datos, al lado del nombre y no debajo: quién es
                    y por dónde va. La anatomía va en CHAPAS con su signo (Q-08
                    del plan del acabado): tres medidas seguidas en texto
                    corrido —«31 años · 168 cm · Mujer»— había que leerlas para
                    saber cuál era cuál; el signo las cuenta de un vistazo. El
                    microciclo NO es chapa: es por dónde va, no lo que mide, y
                    queda en texto llano — la diferencia entre dato y estado se
                    ve ahora en el dibujo.

                    «En curso» no es adorno: debajo, la revisión habla del
                    microciclo que YA ha terminado —el 18 cuando aquí pone 19—,
                    y dos números seguidos sin decir de qué son se leen como un
                    fallo. Con esto cada uno dice lo suyo. */}
                <p className="cliente-cab-meta">
                  {!enFicha && anatomia.length > 0 && (
                    <span className="cliente-cab-anatomia">
                      {anatomia.map((f) => {
                        const Signo = { age: Cake, height: Ruler, gender: PersonStanding }[f.id];
                        return (
                          <span key={f.id} className="chapa-hecho" title={f.label}>
                            {Signo && <Signo size={13} aria-hidden="true" />}
                            {f.value}
                          </span>
                        );
                      })}
                    </span>
                  )}
                  {semanaActiva && <span>Microciclo {semanaActiva} · en curso</span>}
                </p>
              </div>

              {/* ── El extremo derecho: el estado, y un verbo SOLO SI TOCA ──
                  Aquí vivieron dos verbos fijos, y ninguno de los dos aguantó
                  la pregunta de para qué estaban siempre:

                  · «VER COMO» se ha ido del expediente. Nació para que el
                    dueño pudiera comprobar el portal, no para el oficio de
                    nadie: un entrenador no entra a la cuenta de su cliente,
                    y una puerta permanente a hacerlo en la cabecera de las
                    cinco pestañas era ofrecerlo como si lo fuera. Sigue
                    existiendo donde vive lo que se usa de tarde en tarde: la
                    paleta (⌘K, «Ver como lo ve mi cliente»), y en el taller,
                    pegado a lo que sí se comprueba —un formulario antes de
                    mandarlo—.

                  · «REVISAR SEMANA» solo se dibuja cuando esa persona TIENE
                    algo esperando. Estaba siempre, y la mayoría de los días no
                    había nada que revisar: un verbo que la mitad de las veces
                    lleva a una pantalla vacía enseña a no pulsarlo, y entonces
                    tampoco se pulsa el día que sí. Cuando aparece, aparece en
                    azul —es la única señal de la banda— y decir que existe ya
                    es la mitad del aviso.

                  Sin verbos, esta esquina se queda con las chapas del cobro,
                  que es estado y no acción. La sección de revisión sigue a un
                  clic en el raíl de abajo, como las otras cuatro. */}
              <div className="cliente-cab-acciones">
                {chapas}
                {bandeja.esperando.has(activeClient.id) &&
                  !isSectionActive(location.pathname, SECCION_SEMANA, '/c/[^/]+') && (
                    <Link className="btn btn-primary btn-sm" to={clientPath(clientId, 'semana')}>
                      <CalendarCheck size={15} aria-hidden="true" />
                      Revisar semana
                    </Link>
                  )}
              </div>
              </div>

              {/* ── El raíl de destinos, posado sobre el filete ────────────
                  Colgados en la línea de identidad, entre el nombre y las
                  acciones, los destinos se leían como una pieza pegada
                  («queda impostado», el dueño, 6 sep). Son la segunda línea
                  de la cabecera: a todo el ancho, a ras del filete —la marca
                  azul muerde el borde— y el primer destino cae a plomo sobre
                  la primera tarjeta.

                  Sin «Perfil»: en escritorio su puerta es el nombre (arriba);
                  el filtro es solo de este carril — la barra del pulgar del
                  móvil recibe la lista entera, porque allí el nombre es el
                  selector de cliente y no puede ser además una puerta.

                  Y sin iconos: cinco palabras cortas que no se parecen entre
                  sí no necesitan desempate. La marca de «estás aquí» es la
                  pieza suelta del final, que viaja entre destinos
                  (`ui/carril.js`). */}
              <nav
                ref={carrilDeCliente}
                className="tabs cliente-cab-tabs"
                aria-label={`Secciones de ${activeClient.name}`}
              >
                {seccionesDeCliente.filter(({ seccion }) => !seccion.oculta).map(({ seccion, activa }) => (
                  <NavLink
                    key={seccion.path}
                    to={clientPath(clientId, seccion.path)}
                    className={`tab${activa ? ' active' : ''}`}
                    aria-current={activa ? 'page' : undefined}
                  >
                    {seccion.label}
                  </NavLink>
                ))}
                <span className="tabs-marca" aria-hidden="true" />
              </nav>
            </div>
          </header>
        )}
        <div className="layout">
          
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
                    <UserPlus size={15} /> Dar de alta un cliente
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
