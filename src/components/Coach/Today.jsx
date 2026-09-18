import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BellRing,
  CalendarClock,
  Check,
  ChevronRight,
  CircleCheck,
  ClipboardList,
  Inbox,
  KeyRound,
  MessageCircle,
  MessageSquare,
  Send,
  TriangleAlert,
  UserCheck,
  Wallet,
} from 'lucide-react';

import { useApp, useSession } from '@/context/AppContext';
import {
  TRAMITES_INICIO,
  buildPortfolio,
  colasDeInicio,
  portfolioInbox,
  previsionEscrita,
} from '@/domain/portfolio';
import { contestadasPorCliente, pendientesPorCliente } from '@/domain/envios';
import { ACTIVITY_KINDS, buildActivity, dayLabel, semanaDeUnVistazo } from '@/domain/today';
import {
  MAX_CHECKIN_DATES,
  MAX_CHECKIN_NOTE,
  WEEKDAYS,
  currentCheckInPeriod,
  kindMeta,
  moveCheckIn,
  weekdayIndex,
} from '@/domain/calendar';
import { answersSummary, clientProtocol } from '@/domain/protocol';
import { clientPath } from '@/routes';
import { addDays, shortDate, todayISO, weekdayName } from '@/lib/dates';
import { Avatar } from '@/components/ui/Avatar';
import { BotonAccion, EmptyState, Notice, useAccionDeBoton } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/ToastProvider';
import { SIN_CAMBIOS, useCloseReview } from '@/components/review/useCloseReview';
import { taskAction } from './TaskInbox';
import { GettingStarted } from './GettingStarted';

/**
 * «Inicio»: qué tengo que hacer hoy.
 *
 * ══ Por qué ya no es un diario ══════════════════════════════════════════════
 *
 * Era un hilo de eventos por día —«Ayer 6 · Martes 2»: pesajes, fotos, entrenos—
 * con una columna al lado que sumaba un «36» mezclando responder check-ins con
 * dar acceso al portal. Contaba lo que HA PASADO, y el entrenador abre la
 * aplicación para saber qué TIENE QUE HACER; ninguna fila llevaba un verbo.
 * Dos entrenadores lo dijeron igual: «mucha información y no sé qué hacer con
 * ella».
 *
 * Ahora la pantalla son CUATRO COLAS, cada una una pregunta que un entrenador
 * se hace de verdad, con un número y un verbo:
 *
 *   Por revisar     ¿a quién le debo respuesta?         → Revisar
 *   Sin programar   ¿a quién le falta rutina?           → Programar
 *   Sin señales     ¿quién ha desaparecido?             → Escribir
 *   Cobros          ¿quién me debe?                     → Cobrar
 *
 * La cola elegida se despliega debajo con sus personas y la acción para
 * vaciarla. Lo que ha pasado no desaparece: baja a una columna de actividad, más
 * pequeña, al lado de la agenda de la semana. Y los TRÁMITES —dar acceso,
 * terminar un alta, recordar un check-in— dejan de sumar en la cifra grande:
 * no son trabajo del oficio, y sumados hacían que el número no dijera nada.
 *
 * Las colas salen de `portfolioInbox` y `reviewQueue`, que ya lo calculaban
 * todo. Esto es pintar de otra forma lo que había, no un motor nuevo.
 *
 * ══ Dibujada en Figma (18 sep 2026, frame 164:1260) ═════════════════════════
 *
 * La gramática de la cartera, Cobros y la Agenda: cajas con canto sobre la
 * hoja hundida. De arriba abajo: el saludo, «Tu semana» en cuatro cifras,
 * «Requiere tu atención» (las colas con gente como avisos que se despliegan,
 * y las vacías en una banda verde), la mesa en dos columnas —la agenda y las
 * revisiones a la izquierda; la previsión y la actividad a la derecha— y los
 * trámites. Lo que el frame pedía y no se copió está escrito en su sitio:
 * las cifras que no existen (`semanaDeUnVistazo`), la hora de la agenda
 * (`agendaFilas`) y los colores por categoría (`OJO`, `Prevision`). Estilos
 * en `styles/inicio.css`.
 */

/** «miércoles, 26 de agosto» → «Miércoles, 26 de agosto»: es el titular. */
const capitalizar = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/* El saludo con tu nombre de pila: la pantalla se abre hablándote a ti, no
   leyendo el calendario. La fecha sigue ahí, en la línea de debajo. */
const saludo = (nombre) => {
  const h = new Date().getHours();
  const franja = h < 6 ? 'Buenas noches' : h < 14 ? 'Buenos días' : h < 21 ? 'Buenas tardes' : 'Buenas noches';
  const limpio = String(nombre || '').trim();
  /*
    Un correo no es un nombre de pila.

    `profiles.full_name` viene relleno con el correo en las cuentas creadas antes
    de que hubiera dónde escribirlo, así que el titular más grande de la
    aplicación decía «Buenos días, m4nugnzl@gmail.com» todas las mañanas. Sin
    nombre de verdad se saluda a secas, que es correcto y no es raro; para
    ponerlo, el menú de cuenta (`AccountMenu`).
  */
  const pila = limpio.includes('@') ? '' : limpio.split(/\s+/)[0];
  return pila ? `${franja}, ${pila}` : franja;
};

const ESTADO_REVISION = {
  ready: { label: 'Te espera', tone: 'badge-warn' },
  missing: { label: 'Sin subir', tone: '' },
};

const recordarCheckIn = (client) => {
  const nombre = (client.name || '').trim().split(/\s+/)[0];
  const texto = `Hola${nombre ? ` ${nombre}` : ''}, te toca el check-in de esta semana: pésate, hazte las fotos y entrégalo desde tu portal cuando puedas.`;
  window.open(
    `https://wa.me/${client.phone.replace(/[^\d]/g, '')}?text=${encodeURIComponent(texto)}`,
    '_blank',
    'noopener,noreferrer'
  );
};

/** De qué va la revisión de alguien, en una línea: sus respuestas, o su lectura. */
const resumenDe = (row) =>
  answersSummary(clientProtocol(row.client.preferences), row.review?.answers) ||
  row.headline?.text ||
  [
    /* La fracción solo si le pides un número de pesajes; si no, el recuento. Un
       «2/3» contra una norma que nadie ha puesto se lee como incumplimiento. */
    row.checkIn.asked
      ? `${row.checkIn.count}/${row.checkIn.target} pesajes`
      : `${row.checkIn.count} ${row.checkIn.count === 1 ? 'pesaje' : 'pesajes'}`,
    row.sinceTraining === null ? 'sin entrenos' : `entrenó hace ${row.sinceTraining} d`,
  ].join(' · ');

/** Una persona de una cola, con lo que hay que hacer con ella. */
const Persona = ({ row, sub, badge, onOpen, children }) => (
  <div className="task-row">
    <button type="button" className="task-hit" onClick={onOpen} aria-label={`Abrir a ${row.client.name}`} />
    <Avatar name={row.client.name} src={row.client.avatar} className="mark" />
    <span className="who">
      <span className="name">
        {row.client.name}
        {badge && <span className={`badge ${badge.tone}`}>{badge.label}</span>}
      </span>
      <span className="sub">{sub}</span>
    </span>
    {children}
  </div>
);

/**
 * APLAZAR DESDE AQUÍ, que es donde ocurre de verdad.
 *
 * ══ Por qué este gesto no vivía donde se hace ══════════════════════════════
 *
 * Mover una revisión ya funcionaba —tocando ese día en el calendario del
 * cliente—, y ése no es el gesto real. El gesto real es: hoy, en la cola de
 * revisiones, Javier te dice que está de viaje. Obligar a abrir su ficha, buscar
 * el calendario y contar hasta el martes es pedirle al entrenador que navegue
 * para arreglar algo que está mirando.
 *
 * Es el MISMO `moveCheckIn` con otro sitio desde donde llamarlo: una fecha movida
 * sustituye a la de su periodo y el periodo siguiente la releva sola. Y el
 * porqué es opcional a propósito —aplazar tiene que costar un gesto— pero se
 * ofrece, porque una fecha movida sin motivo, tres semanas después, es un día
 * raro en el calendario.
 */
const Aplazar = ({ row, onAplazar, onCerrar }) => {
  const periodo = currentCheckInPeriod(row.client.preferences, row.client.startDate);
  /* Mañana, que es lo que se contesta el 90 % de las veces: «déjalo para
     mañana». La fecha de pauta ya pasó — por eso esta persona está en la cola. */
  const [fecha, setFecha] = useState(() => addDays(todayISO(), 1));
  const [motivo, setMotivo] = useState('');

  return (
    <form
      className="col gap-2 task-respuesta"
      onSubmit={(e) => {
        e.preventDefault();
        onAplazar(row.client, fecha, motivo);
      }}
    >
      <div className="row gap-2 wrap">
        <input
          type="date"
          className="input input-sm"
          value={fecha}
          min={todayISO()}
          onChange={(e) => setFecha(e.target.value)}
          aria-label={`Nueva fecha de la revisión de ${row.client.name}`}
        />
        <input
          type="text"
          className="input input-sm"
          style={{ flex: 1, minWidth: '12ch' }}
          maxLength={MAX_CHECKIN_NOTE}
          placeholder="Por qué (opcional)"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          aria-label="Por qué se aplaza"
        />
        <button type="submit" className="btn btn-primary btn-sm" disabled={!fecha}>
          Aplazar
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onCerrar}>
          Cancelar
        </button>
      </div>
      <span className="t-xs t-tertiary">
        {periodo
          ? `Sustituye a la del ${shortDate(periodo.dueOn)}. No es una revisión extra: la siguiente sigue en su sitio.`
          : 'Sin día de pauta no hay periodo al que mover la entrega.'}
      </span>
    </form>
  );
};

const ColaRevisar = ({ lista, onOpen, onCerrar, onAplazar }) => {
  const [escribiendo, setEscribiendo] = useState(null);
  const [aplazando, setAplazando] = useState(null);
  /* Solo hay UNA respuesta abierta a la vez, así que un estado basta para su
     botón de enviar. Ver `BotonAccion`. */
  const envio = useAccionDeBoton();
  const [texto, setTexto] = useState('');

  return (
    <div className="task-rows">
      {lista.map((row) => {
        const id = row.client.id;
        const puedeCerrar = row.review_state === 'ready' && row.review.exact && row.review.id;
        return (
          <Persona
            key={id}
            row={row}
            sub={resumenDe(row)}
            badge={ESTADO_REVISION[row.review_state]}
            onOpen={() => onOpen(id, 'semana')}
          >
            {puedeCerrar && (
              <>
                {/* Cada fila lleva su propio estado dentro del botón, así que
                    ya no hace falta apuntar fuera cuál se está guardando. */}
                <BotonAccion
                  className="btn btn-secondary btn-sm"
                  icon={Check}
                  title="Cierra su semana sin cambios y le llega que está vista"
                  onClick={() => onCerrar(row.review.id, id, SIN_CAMBIOS)}
                >
                  Seguimos igual
                </BotonAccion>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  aria-expanded={escribiendo === id}
                  onClick={() => setEscribiendo(escribiendo === id ? null : id)}
                >
                  <MessageSquare size={13} /> Contestar
                </button>
              </>
            )}
            {row.review_state === 'missing' && row.client.phone && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                title="Abrir WhatsApp con el recordatorio escrito"
                onClick={() => recordarCheckIn(row.client)}
              >
                <MessageCircle size={13} /> Recordar
              </button>
            )}
            {/* Aplazar va PEGADO a recordar porque son las dos respuestas a la
                misma frase —«no lo he subido»—: o se le reclama, o se le mueve
                la fecha. Solo a quien no ha entregado: mover la cita de quien ya
                te espera no significa nada. */}
            {row.review_state === 'missing' && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                aria-expanded={aplazando === id}
                onClick={() => setAplazando(aplazando === id ? null : id)}
              >
                <CalendarClock size={13} /> Aplazar
              </button>
            )}
            <button type="button" className="btn btn-primary btn-sm" onClick={() => onOpen(id, 'semana')}>
              Revisar
            </button>
            {escribiendo === id && (
              <form
                className="col gap-2 task-respuesta"
                onSubmit={(e) => {
                  e.preventDefault();
                  const limpio = texto.trim();
                  if (!limpio) return;
                  envio.lanzar(async () => {
                    const bien = await onCerrar(row.review.id, id, limpio);
                    if (!bien) return false;
                    setTexto('');
                    setEscribiendo(null);
                    return true;
                  });
                }}
              >
                <textarea
                  autoFocus
                  className="textarea"
                  rows={2}
                  value={texto}
                  placeholder="Lo que le dirías de esta semana. Lo lee en su portal."
                  onChange={(e) => setTexto(e.target.value)}
                />
                <div className="row gap-2">
                  <BotonAccion
                    type="submit"
                    className="btn btn-primary btn-sm"
                    estado={envio.estado}
                    disabled={!texto.trim()}
                  >
                    Enviar y cerrar
                  </BotonAccion>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEscribiendo(null)}>
                    Cancelar
                  </button>
                </div>
              </form>
            )}
            {aplazando === id && (
              <Aplazar
                row={row}
                onCerrar={() => setAplazando(null)}
                onAplazar={(client, fecha, motivo) => {
                  if (onAplazar(client, fecha, motivo)) setAplazando(null);
                }}
              />
            )}
          </Persona>
        );
      })}
    </div>
  );
};

const ColaTareas = ({ filas, seccion, onOpen, handlers }) => (
  <div className="task-rows">
    {filas.map(({ row, taskId }) => {
      const accion = taskAction(taskId, row, handlers);
      return (
        <Persona key={row.client.id} row={row} sub={row.why} onOpen={() => onOpen(row.client.id, seccion)}>
          {accion && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={accion.onClick} title={accion.title}>
              <accion.icon size={13} /> {accion.label}
            </button>
          )}
          <ChevronRight size={15} className="chevron" aria-hidden="true" />
        </Persona>
      );
    })}
  </div>
);

/* ── Las piezas del frame ─────────────────────────────────────────────────── */

/* El icono de cada cola en «Requiere tu atención»: dice de qué va la tarjeta
   antes de leerla. `revisar` no está porque no es tarjeta: tiene caja propia. */
const ICONO_COLA = {
  leer: MessageSquare,
  programar: ClipboardList,
  senales: TriangleAlert,
  siguiente: CalendarClock,
  cobrar: Wallet,
};

/*
  ── Ámbar solo para «ojo con esto» ──────────────────────────────────────────
  El frame pinta todas las tarjetas de atención en ámbar. La ley del color no
  lo permite: lo que TE ESPERA —leer, programar, escribir la semana— es una
  invitación y va en la señal (azul). El ámbar se queda para lo que juzga: quien
  ha desaparecido y quien debe dinero.
*/
const OJO = new Set(['senales', 'cobrar']);

/* El icono y el verbo de cada trámite. El verbo es el mismo que lleva el botón
   de cada fila al desplegarla (`taskAction`): una acción conserva su nombre. */
const TRAMITE = {
  access: { icon: KeyRound, verbo: 'Invitar' },
  intake_ready: { icon: UserCheck, verbo: 'Empezar' },
  intake: { icon: UserCheck, verbo: 'Revisar' },
  checkin: { icon: BellRing, verbo: 'Recordar' },
  mandado: { icon: Send, verbo: 'Recordar' },
};

/* Las sesiones y los pesajes llevan su tipo delante («Entreno · Push A»,
   «Pesaje · 81,4 kg»): sin él, «Push A» o «81,4 kg» solos no dicen qué pasó.
   Las fotos y el check-in ya lo dicen en su título. */
const CON_TIPO = new Set(['session', 'weight']);

/** «Vie 19»: el día de un evento de la agenda que no es hoy ni mañana. */
const diaCorto = (date) => `${WEEKDAYS[weekdayIndex(date)] || ''} ${Number(date.slice(8, 10))}`.trim();

/** Una de las cuatro cifras de «Tu semana». */
const Cifra = ({ rotulo, valor, pie, chapa, titulo }) => (
  <div className="ini-cifra">
    <span className="ini-cifra-k">{rotulo}</span>
    <span className="ini-cifra-n">{valor}</span>
    <span className="ini-cifra-pie">{pie}</span>
    {chapa && (
      <span className="ini-chapa" title={titulo}>
        {chapa}
      </span>
    )}
  </div>
);

/** La cabecera de una caja: el nombre, y el dato que la acompaña si lo hay. */
const CabCaja = ({ id, titulo, sub, children }) => (
  <header className="ini-caja-cab">
    <div>
      <h2 id={id}>{titulo}</h2>
      {sub && <p>{sub}</p>}
    </div>
    {children}
  </header>
);

export const Today = () => {
  const {
    clients,
    training,
    anthropometry,
    progressPhotos,
    checkIns,
    equipmentCounts,
    envioRows,
    markClientPaid,
    loadEvents,
    setEventDone,
    updateClientPreferences,
  } = useApp();
  const { profileName } = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  const { close } = useCloseReview();
  const [error, setError] = useState(null);
  const today = todayISO();
  const atencionRef = useRef(null);

  /*
    ── Las colas se quedan AQUÍ, en las dos geometrías ────────────────────────
    El puesto las desplegó un día en la barra lateral —cada persona con su
    porqué— y con una cartera real era una columna de ruido; el dueño lo dijo
    al verla. La barra volvió a su ley (navegar: una lista, un punto en quien
    espera) y esta pantalla conserva el trabajo entero: las colas con sus
    verbos y sus acciones. Cada pieza dice lo suyo una vez.
  */

  const mandadoCounts = useMemo(() => pendientesPorCliente(envioRows, today), [envioRows, today]);
  const contestadoCounts = useMemo(() => contestadasPorCliente(envioRows), [envioRows]);

  const rows = useMemo(
    () => buildPortfolio({ clients, training, anthropometry, progressPhotos, checkIns, equipmentCounts, mandadoCounts, contestadoCounts }, today),
    [clients, training, anthropometry, progressPhotos, checkIns, equipmentCounts, mandadoCounts, contestadoCounts, today]
  );
  const colas = useMemo(() => colasDeInicio(rows, today), [rows, today]);
  /* Lo que viene: a cuánta gente se le acaba lo escrito, semana a semana. Es la
     única pieza de la pantalla que mira hacia delante (ver `previsionEscrita`). */
  const prevision = useMemo(() => previsionEscrita(rows, today), [rows, today]);
  const tramites = useMemo(
    () => portfolioInbox(rows).tasks.filter((t) => TRAMITES_INICIO.includes(t.id)),
    [rows]
  );

  const tieneGente = (c) => c.n > 0 || (c.lista?.length || 0) > 0;
  const revisar = colas.find((c) => c.id === 'revisar');
  const porRevisar = revisar?.lista || [];

  /*
    ── «Por revisar» tiene caja; las demás colas son tarjetas ─────────────────
    Antes las cinco colas eran pestañas y la primera con gente se abría sola
    debajo. El frame separa las dos clases de trabajo: las revisiones —lo que
    llega con fecha, y la cola que más se usa— van en su caja, siempre
    abiertas y con sus gestos (Seguimos igual, Contestar, Aplazar, Recordar);
    el resto son avisos que se despliegan al pulsarlos. Nada se abre solo: un
    aviso que se despliega sin tocarlo empuja la pantalla hacia abajo.
  */
  const atencion = colas.filter((c) => c.id !== 'revisar' && tieneGente(c));
  const [abierta, setAbierta] = useState(null);
  const colaAbierta = atencion.find((c) => c.id === abierta) || null;
  const [tramiteId, setTramiteId] = useState(null);
  const tramiteAbierto = tramites.find((t) => t.id === tramiteId) || null;

  /*
    ── Solo lo vivo es tarjeta ────────────────────────────────────────────────
    Una cola a cero no ocupa tarjeta: se funde en la banda verde («Cobros,
    respuestas y revisiones, al día»). El nombre en positivo viaja con la cola
    (`COLAS_INICIO.alDia`); una cola sin él se cae de la frase, no se cuela.
  */
  const nadaPendiente = !colas.some(tieneGente);
  const alDia = colas.filter((c) => !tieneGente(c) && c.alDia).map((c) => c.alDia);
  const fraseAlDia =
    alDia.length > 1 ? `${alDia.slice(0, -1).join(', ')} y ${alDia[alDia.length - 1]}` : alDia[0] || '';

  /* ── La agenda de la semana y la actividad reciente ────────────────────── */
  const [agendaEvents, setAgendaEvents] = useState([]);
  useEffect(() => {
    let vivo = true;
    loadEvents(null, { from: addDays(today, -14), to: addDays(today, 6) }).then((res) => {
      if (vivo && res.ok) setAgendaEvents(res.events);
    });
    return () => {
      vivo = false;
    };
  }, [loadEvents, today]);

  /*
    ── La agenda es de DÍAS, no de horas ──────────────────────────────────────
    El frame pone una hora a cada cosa («10:00 Revisión semanal»). Los eventos
    no la tienen, y la mayoría no la necesitan: son pesajes, competiciones,
    un viaje. La chapa de la izquierda dice el día —«Hoy», «Mañana», «Vie
    19»— y lo que se pasó sin marcar va primero, con su fecha.

    Las revisiones (`checkin`) siguen fuera: tienen su caja justo debajo, y
    contarlas aquí sería decirlas dos veces.
  */
  const agendaFilas = useMemo(() => {
    const nombres = new Map(clients.map((c) => [c.id, c.name]));
    const utiles = agendaEvents
      .filter((e) => e?.date && e.kind !== 'checkin')
      .map((e) => ({ ...e, clientName: nombres.get(e.clientId) || 'Cliente dado de baja' }))
      .sort((a, b) => a.date.localeCompare(b.date));
    const manana = addDays(today, 1);
    return [
      ...utiles
        .filter((e) => e.date < today && !e.done)
        .map((e) => ({ event: e, dia: shortDate(e.date), pasado: true })),
      ...utiles
        .filter((e) => e.date >= today)
        .map((e) => ({
          event: e,
          dia: e.date === today ? 'Hoy' : e.date === manana ? 'Mañana' : diaCorto(e.date),
          hoy: e.date === today,
        })),
    ];
  }, [agendaEvents, clients, today]);

  /* El hilo de las dos semanas, una vez: alimenta las cifras de «Tu semana» y
     la caja de actividad. Las filas siguen siendo cinco: la columna es lectura,
     y la historia entera vive en la ficha de cada uno. */
  const eventos = useMemo(
    () => buildActivity({ clients, training, anthropometry, progressPhotos, checkIns }, today),
    [clients, training, anthropometry, progressPhotos, checkIns, today]
  );
  const vista = useMemo(() => semanaDeUnVistazo(eventos, rows, today), [eventos, rows, today]);
  const actividad = eventos.slice(0, 5);

  /* ── Acciones ──────────────────────────────────────────────────────────── */
  const open = (clientId, section) => navigate(clientPath(clientId, section));

  const cerrarRevision = async (reviewId, clientId, notas = SIN_CAMBIOS) => {
    const cliente = clients.find((c) => c.id === clientId);
    const res = await close({
      clientId,
      name: cliente?.name || 'el cliente',
      checkInId: reviewId,
      weekStart: checkIns[clientId]?.weekStart,
      notes: notas,
      /* El acuse cuenta la cola vaciarse: los listos menos el que se cierra. */
      restantes: Math.max(0, (revisar?.n || 1) - 1),
    });
    setError(res?.ok === false ? res.error : null);
    /* Se devuelve para que el botón de la cola sepa si confirmar con un tic o
       volver a su sitio callado. Ver `BotonAccion`. */
    return res?.ok !== false;
  };

  /**
   * Aplazar la revisión de alguien sin salir de la cola.
   *
   * La regla —una fecha movida por periodo, y sustituye en vez de añadir— la
   * guarda `moveCheckIn`, no esta pantalla. Aquí solo se escribe lo que devuelve
   * y se dice lo que ha pasado, con su «Deshacer»: mover la cita de otra persona
   * es de las cosas que hay que poder desandar en el sitio.
   */
  const aplazarRevision = (client, fecha, motivo) => {
    const antes = client.preferences?.checkin || {};
    const siguiente = moveCheckIn(client.preferences, client.startDate, fecha, { motivo });
    if (!siguiente) {
      setError(
        `No se puede aplazar la revisión de ${client.name}: hace falta un día de pauta, y solo se guardan ${MAX_CHECKIN_DATES} fechas movidas a la vez.`
      );
      return false;
    }
    setError(null);
    updateClientPreferences(client.id, 'checkin', siguiente);
    toast({
      text: `Revisión de ${client.name} aplazada al ${shortDate(fecha)}.`,
      action: {
        label: 'Deshacer',
        onClick: () =>
          updateClientPreferences(client.id, 'checkin', {
            dates: antes.dates || [],
            notes: antes.notes || {},
          }),
      },
    });
    return true;
  };

  const handlers = {
    paid: (clientId) => {
      const res = markClientPaid(clientId);
      setError(res?.ok === false ? res.error : null);
      if (res?.ok === false) return;
      const nombre = clients.find((c) => c.id === clientId)?.name || 'el cliente';
      toast({
        text: `Cobro de ${nombre} anotado y fecha adelantada.`,
        action: { label: 'Deshacer', onClick: () => res.undo() },
      });
    },
    review: (reviewId, clientId) => cerrarRevision(reviewId, clientId),
    invite: () => navigate('/clientes'),
  };

  const marcarEvento = async (event, done) => {
    setAgendaEvents((prev) => prev.map((e) => (e.id === event.id ? { ...e, done } : e)));
    const res = await setEventDone(event.id, done);
    if (!res.ok) {
      setAgendaEvents((prev) => prev.map((e) => (e.id === event.id ? { ...e, done: !done } : e)));
      setError(res.error);
    }
  };

  /* «Escribir el microciclo» en la previsión abre la cola de al lado de
     arriba y la trae a la vista: es la misma gente que la primera columna. */
  const irASiguiente = atencion.some((c) => c.id === 'siguiente')
    ? () => {
        setAbierta('siguiente');
        atencionRef.current?.scrollIntoView({ block: 'start' });
      }
    : null;

  if (clients.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="Todavía no hay nada que hacer"
        message="En cuanto des de alta a tu primer cliente, aquí verás a quién le debes respuesta, a quién le falta rutina y quién te debe."
      />
    );
  }

  /*
    ── «La semana pasada», a estas alturas ────────────────────────────────────
    Sin color: más entrenos no es mejor ni peor —puede ser una descarga—, así
    que la chapa informa y no juzga (`la app no receta`).
  */
  const diferencia = vista.entrenos - vista.entrenosAntes;
  const chapaEntrenos =
    vista.entrenos === 0 && vista.entrenosAntes === 0
      ? null
      : diferencia === 0
        ? 'Igual que la pasada'
        : `${diferencia > 0 ? '+' : '−'}${Math.abs(diferencia)} vs la pasada`;
  const sinSubir = porRevisar.length - (revisar?.n || 0);
  const gentePrevista = prevision.reduce((n, c) => n + c.n, 0);

  /* La actividad, montada una vez y puesta donde equilibra la mesa: sin
     revisiones la columna izquierda es solo la agenda —a menudo vacía— y al
     lado quedaba un hueco de media pantalla; entonces baja a la izquierda. */
  const cajaActividad = (
    <section className="ini-caja" aria-labelledby="ini-actividad">
      <CabCaja id="ini-actividad" titulo="Actividad" sub="Últimas dos semanas" />
      {actividad.length === 0 ? (
        <div className="vacio-invita">
          <p>Nadie ha registrado nada en dos semanas.</p>
        </div>
      ) : (
        <ul className="ini-filas">
          {actividad.map((event) => {
            const kind = ACTIVITY_KINDS[event.kind];
            return (
              <li key={event.id}>
                <button
                  type="button"
                  className="ini-fila is-boton"
                  title={event.detail || undefined}
                  onClick={() => open(event.clientId, kind.section)}
                >
                  <Avatar name={event.clientName} />
                  <span className="ini-fila-que">
                    <b>{event.clientName}</b>
                    <span>{CON_TIPO.has(event.kind) ? `${kind.label} · ${event.title}` : event.title}</span>
                  </span>
                  <span className="ini-cuando">{dayLabel(event.date, today)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
  const actividadALaIzquierda = porRevisar.length === 0 && gentePrevista > 0;

  return (
    <div className="stack cascada">
      <div className="ini">
        <header className="ini-cab">
          <h1>{saludo(profileName)}</h1>
          <p>{capitalizar(weekdayName(`${today}T00:00:00Z`, { conFecha: true }))}</p>
        </header>
        {error && <Notice tone="error">{error}</Notice>}
        <GettingStarted />

        {/* ── Tu semana: lo que ha pasado, en cuatro cifras ────────────────── */}
        <section className="ini-tramo" aria-labelledby="ini-semana">
          <h2 id="ini-semana" className="ini-rotulo">
            Tu semana
          </h2>
          <div className="ini-cifras">
            <Cifra
              rotulo="Entrenos"
              valor={vista.entrenos}
              pie="registrados esta semana"
              chapa={chapaEntrenos}
              titulo="Contra la semana pasada hasta el mismo día"
            />
            <Cifra
              rotulo="Han entrenado"
              valor={
                <>
                  {vista.entrenaron}
                  <small>/{vista.activos}</small>
                </>
              }
              pie={vista.activos === 1 ? 'cliente activo' : 'clientes activos'}
            />
            <Cifra rotulo="Pesajes" valor={vista.pesajes} pie="esta semana" />
            <Cifra
              rotulo="Te esperan"
              valor={revisar?.n || 0}
              pie={(revisar?.n || 0) === 1 ? 'revisión entregada' : 'revisiones entregadas'}
              chapa={sinSubir > 0 ? `${sinSubir} sin subir` : null}
            />
          </div>
        </section>

        {/* ── Requiere tu atención: las colas con gente ───────────────────── */}
        <section className="ini-tramo" ref={atencionRef} aria-labelledby={atencion.length > 0 ? 'ini-atencion' : undefined}>
          {atencion.length > 0 && (
            <>
              <h2 id="ini-atencion" className="ini-rotulo">
                Requiere tu atención
              </h2>
              <div className="ini-avisos">
                {atencion.map((cola) => {
                  const Icono = ICONO_COLA[cola.id] || TriangleAlert;
                  const on = colaAbierta?.id === cola.id;
                  return (
                    <button
                      key={cola.id}
                      type="button"
                      className={`ini-aviso${OJO.has(cola.id) ? ' is-ojo' : ''}${on ? ' is-on' : ''}`}
                      aria-expanded={on}
                      aria-controls={on ? 'ini-despliegue' : undefined}
                      onClick={() => setAbierta(on ? null : cola.id)}
                    >
                      <span className="ini-aviso-k">
                        <Icono size={15} aria-hidden="true" />
                        {cola.n} {cola.label.toLowerCase()}
                      </span>
                      <span className="ini-aviso-sub">{cola.sub}</span>
                      <span className="ini-enlace">
                        {on ? 'Ocultar' : cola.verbo}
                        {!on && <ArrowRight size={13} aria-hidden="true" />}
                      </span>
                    </button>
                  );
                })}
              </div>
              {colaAbierta && (
                <div id="ini-despliegue" className="ini-caja ini-despliegue">
                  <ColaTareas filas={colaAbierta.filas} seccion={colaAbierta.seccion} onOpen={open} handlers={handlers} />
                </div>
              )}
            </>
          )}
          {(nadaPendiente || fraseAlDia) && (
            <p className="ini-aldia">
              <CircleCheck size={20} aria-hidden="true" />
              {nadaPendiente ? 'Todo al día' : `${capitalizar(fraseAlDia)}, al día`}
            </p>
          )}
        </section>

        <div className="ini-mesa">
          <div className="ini-col">
            <section className="ini-caja" aria-labelledby="ini-agenda">
              <CabCaja id="ini-agenda" titulo="Esta semana" />
              {agendaFilas.length === 0 ? (
                /* Sin caja punteada: el vacío dice lo que hay y ofrece el gesto. */
                <div className="vacio-invita">
                  <p>Nada apuntado hasta el domingo.</p>
                  <button type="button" className="cab-accion is-puerta" onClick={() => navigate('/calendario')}>
                    Apuntar algo
                  </button>
                </div>
              ) : (
                <ul className="ini-filas">
                  {agendaFilas.map(({ event, dia, hoy, pasado }) => (
                    <AgendaFila
                      key={event.id}
                      event={event}
                      dia={dia}
                      hoy={hoy}
                      pasado={pasado}
                      onToggle={() => marcarEvento(event, !event.done)}
                    />
                  ))}
                </ul>
              )}
            </section>

            {porRevisar.length > 0 && (
              <section className="ini-caja" aria-labelledby="ini-revisar">
                {/* La nota de ORDEN es lo único que la caja no dice sola: por
                    qué esta persona va la primera. */}
                <CabCaja id="ini-revisar" titulo="Por revisar" sub="Primero quien lleva más tiempo esperando">
                  <span className="ini-chapa is-senal">{porRevisar.length}</span>
                </CabCaja>
                <ColaRevisar lista={porRevisar} onOpen={open} onCerrar={cerrarRevision} onAplazar={aplazarRevision} />
              </section>
            )}
            {actividadALaIzquierda && cajaActividad}
          </div>

          <div className="ini-col">
            {/*
              ── LO QUE VIENE ───────────────────────────────────────────────────
              La única pieza de la pantalla que mira hacia delante. Solo se pinta
              si hay alguien: cuatro columnas a cero son cromo.
            */}
            {gentePrevista > 0 && (
              <section className="ini-caja" aria-labelledby="ini-prevision">
                <CabCaja id="ini-prevision" titulo="Microciclos por escribir" />
                <Prevision cubos={prevision} onIr={irASiguiente} />
              </section>
            )}

            {!actividadALaIzquierda && cajaActividad}
          </div>
        </div>

        {/*
          ── Trámites ──────────────────────────────────────────────────────────
          Lo administrativo —dar acceso, terminar un alta, recordar un
          check-in—: no suma en las colas porque no es trabajo del oficio. Cada
          uno es una tesela con su cifra y su verbo, y se despliega como los
          avisos.
        */}
        {tramites.length > 0 && (
          <section className="ini-tramo" aria-labelledby="ini-tramites">
            <h2 id="ini-tramites" className="ini-rotulo">
              Trámites
            </h2>
            <div className="ini-tramites">
              {tramites.map((task) => {
                const meta = TRAMITE[task.id] || { icon: Send, verbo: 'Ver' };
                const on = tramiteAbierto?.id === task.id;
                return (
                  <button
                    key={task.id}
                    type="button"
                    className={`ini-tramite${on ? ' is-on' : ''}`}
                    aria-expanded={on}
                    aria-controls={on ? 'ini-tramite-lista' : undefined}
                    onClick={() => setTramiteId(on ? null : task.id)}
                  >
                    <span className="ini-tramite-que">
                      <meta.icon size={20} aria-hidden="true" />
                      {task.label}
                    </span>
                    <span className="ini-tramite-cuantos">
                      {task.rows.length} {task.rows.length === 1 ? 'persona' : 'personas'}
                    </span>
                    <span className="ini-enlace">
                      {on ? 'Ocultar' : meta.verbo}
                      {!on && <ArrowRight size={13} aria-hidden="true" />}
                    </span>
                  </button>
                );
              })}
            </div>
            {tramiteAbierto && (
              <div id="ini-tramite-lista" className="ini-caja ini-despliegue">
                <ColaTareas
                  filas={tramiteAbierto.rows.map((row) => ({ row, taskId: tramiteAbierto.id }))}
                  seccion={tramiteAbierto.seccion}
                  onOpen={open}
                  handlers={handlers}
                />
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
};

/** El tramo de una columna de la previsión: «15–21 sep». */
const tramoCorto = (desde) => {
  const inicio = new Date(`${desde}T00:00:00Z`).getUTCDate();
  return `${inicio}–${shortDate(addDays(desde, 6))}`;
};

/**
 * LA PREVISIÓN: a cuánta gente se le acaba lo escrito, esta semana y las tres
 * siguientes.
 *
 * ══ Qué se copia de Efort, y qué no ════════════════════════════════════════
 *
 * El gesto es suyo y es lo mejor que tienen: cuatro barras que convierten la
 * bandeja en un plan. El dato no puede ser el suyo —cuentan bloques que se
 * acaban y los nuestros son abiertos—, así que aquí cada columna es la semana en
 * la que a alguien se le termina la rutina ESCRITA. Ver `previsionEscrita`.
 *
 * ── Del frame, la forma; no las tintas ─────────────────────────────────────
 * El frame pinta la primera barra de azul y la segunda de ámbar. Van todas en la
 * paleta de datos, como el resto de gráficas: el color de una barra no dice
 * qué semana es más urgente, lo dice su sitio (la primera es hoy).
 *
 * ── Y la escala se dibuja entera ───────────────────────────────────────────
 * La semana sin nadie deja su muesca a ras de suelo: un cero que no ocupa
 * sitio convierte cuatro semanas en tres.
 */
const Prevision = ({ cubos, onIr }) => {
  const tope = Math.max(...cubos.map((c) => c.n), 1);
  const estaSemana = cubos[0]?.n || 0;
  return (
    <div className="ini-prevision">
      <div className="ini-prevision-cols">
        {cubos.map((cubo, i) => (
          <div key={cubo.desde || i} className={`ini-prevision-col${cubo.n === 0 ? ' is-cero' : ''}`}>
            <span className="ini-prevision-n">{cubo.n}</span>
            <span className="ini-prevision-barra" style={{ '--alto': cubo.n / tope }} />
            <span className="ini-prevision-cuando">
              {i === 0 ? 'Esta semana' : cubo.desde ? tramoCorto(cubo.desde) : ''}
            </span>
          </div>
        ))}
      </div>
      {estaSemana > 0 && onIr && (
        <button type="button" className="ini-enlace" onClick={onIr}>
          Escribir el microciclo
          <ArrowRight size={13} aria-hidden="true" />
        </button>
      )}
    </div>
  );
};

/** Una cosa de la agenda: el día en su chapa, qué y de quién, y marcarla. */
const AgendaFila = ({ event, dia, hoy = false, pasado = false, onToggle }) => (
  <li className="ini-fila">
    <span
      className={`ini-dia${hoy ? ' is-hoy' : ''}${pasado ? ' is-pasado' : ''}`}
      title={pasado ? 'Se pasó sin marcar' : undefined}
    >
      {dia}
    </span>
    <span className="ini-fila-que">
      <b className={event.done ? 'is-hecho' : undefined}>{event.title}</b>
      <span>
        {event.clientName} · {kindMeta(event.kind).label}
      </span>
    </span>
    <button type="button" className="chip" aria-pressed={event.done} onClick={onToggle}>
      {event.done ? 'Hecho' : 'Marcar hecho'}
    </button>
  </li>
);
