import { useMemo, useState } from 'react';
import { Check, MessageSquare } from 'lucide-react';

import { useApp } from '@/context/AppContext';
import { metricColor } from '@/domain/metrics';
import { planSnapshot } from '@/domain/reviews';
import { clientWeek, latestActiveWeek, weightMove } from '@/domain/week';
import { shortDate } from '@/lib/dates';
import { fmt } from '@/lib/num';
import { Delta, MetricCard, MetricRow } from '@/components/ui/metrics';
import { EmptyState, Notice, PageHead, Panel, WeekPicker } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/ToastProvider';
import { Thumb } from '@/components/photos/Thumb';
import { ReviewHistory } from '@/components/ReviewHistory';

/**
 * LA SEMANA DE UN CLIENTE: lo que le pusiste, lo que hizo, lo que entregó y tu
 * respuesta. En una pantalla.
 *
 * ══ Por qué esta pantalla es el producto ════════════════════════════════════
 *
 * Porque es lo que la portada vende —«la semana se cierra: marcas el objetivo,
 * mides lo que sale y decides la semana siguiente»— y era lo único que la
 * aplicación no tenía. Estaba repartido en cuatro secciones: la rutina, la
 * revisión, la nutrición y el progreso, cada una con su propio selector de semana
 * y ninguna sabiendo en qué semana estaba la de al lado.
 *
 * La prueba de que el corte anterior estaba mal es la que el propio README usa
 * para justificar haber fusionado «Fotos» y «Check-ins» un piso más abajo: hizo
 * falta inventar un MODO —`ReviewSession`, con barra flotante— para terminar la
 * tarea cruzando de una sección a otra. Un modo que existe para pegar dos
 * pantallas es la señal de que faltaba una.
 *
 * ══ Las tres cosas, en el orden de la conversación ══════════════════════════
 *
 *   1. **Lo que hizo** — sus cifras y sus días, contra lo que le pusiste.
 *   2. **Lo que entregó** — su peso, sus fotos y lo que escribió.
 *   3. **Tu respuesta** — que es lo último que ocurre, y por eso va abajo.
 *
 * ── Un solo carril de semanas, y manda sobre los tres ───────────────────────
 * Es la diferencia entera con lo de antes. Hay cinco selectores de semana
 * distintos en el producto —`WeekPicker`, `MicrocycleBar`, `WeekAnglePicker`, el
 * del check-in y el de la analítica— y ninguno habla con los demás: se puede
 * estar mirando la semana 4 de su rutina y la 6 de sus fotos sin que nada lo
 * diga.
 *
 * ── Y no pide ni una consulta más ───────────────────────────────────────────
 * Todo sale de `domain/week.js`, que reúne lo que ya calculaban `training.js`,
 * `analytics.js` y `anthropometry.js` sobre datos que ya están cargados. Es a
 * propósito: si esta pantalla necesitara un dato nuevo, no sería una vista de la
 * semana, sería otra cosa disfrazada de ella.
 */

/** Una fila del carril de días: lo programado y lo ejecutado, en una línea. */
const DiaFila = ({ dia }) => (
  <div className={`week-day${dia.done ? '' : ' is-missing'}`}>
    <span className="week-day-name">{dia.dayName}</span>

    {dia.done ? (
      <span className="week-day-facts">
        {dia.exercises} ej · {dia.loggedSets} de {dia.plannedSets} series ·{' '}
        <span className="tnum">{fmt(dia.tonnage)}</span> kg
      </span>
    ) : (
      /* «No entrenado» y no un hueco vacío: la ausencia es el dato más
         importante de la semana y tiene que decirse con palabras. */
      <span className="week-day-facts">no entrenado</span>
    )}

    {dia.date && <span className="week-day-when">{shortDate(dia.date)}</span>}

    {dia.note && <p className="week-day-note">«{dia.note}»</p>}
  </div>
);

export const WeekReview = () => {
  const {
    activeClient,
    workoutData,
    anthropometry,
    progressPhotos,
    checkIns,
    nutrition,
    reviewCheckIn,
    unreviewCheckIn,
  } = useApp();
  const toast = useToast();

  /* Los `|| []` van dentro de un `useMemo`: un literal nuevo en cada render
     invalidaría todas las memorias de abajo y esta pantalla recalcularía la
     semana entera al escribir cada letra de la respuesta. */
  const microcycles = useMemo(
    () => workoutData[activeClient?.id]?.microcycles || [],
    [workoutData, activeClient?.id]
  );
  const history = useMemo(
    () => anthropometry[activeClient?.id]?.history || [],
    [anthropometry, activeClient?.id]
  );

  const photos = useMemo(
    () => progressPhotos.filter((p) => p.clientId === activeClient?.id),
    [progressPhotos, activeClient?.id]
  );

  /*
    La semana elegida es estado LOCAL y arranca en la última con actividad. No
    viaja en la URL a propósito: es un sitio donde se está MIRANDO, no un sitio
    donde se está. Lo que se comparte de alguien es su ficha, no el instante
    concreto de su historial en el que estaba otra persona.

    ── Y guarda de QUIÉN es esa semana ──────────────────────────────────────
    Cambiar de cliente desde el selector no desmonta esta pantalla: React Router
    solo cambia un parámetro de la ruta, así que un `useState` a secas se
    quedaría pegado y al pasar de alguien con ocho semanas a alguien con dos se
    vería «Semana 6» de una persona que no la tiene. Guardando el cliente al lado
    del número, la elección caduca sola al cambiar de persona —sin ningún efecto
    que la limpie, que es de donde salen las selecciones rancias—.
  */
  const [elegida, setElegida] = useState(null);
  const setSemanaElegida = (week) => setElegida({ clientId: activeClient?.id, week });

  const semanas = useMemo(
    () => microcycles.map((m) => m.weekNumber).sort((a, b) => a - b),
    [microcycles]
  );

  const suya = elegida?.clientId === activeClient?.id && semanas.includes(elegida.week);
  const semana = suya
    ? elegida.week
    : latestActiveWeek({ microcycles, history, startDate: activeClient?.startDate });

  const datos = useMemo(
    () =>
      clientWeek({
        microcycles,
        history,
        photos,
        startDate: activeClient?.startDate,
        weekNumber: semana,
      }),
    [microcycles, history, photos, activeClient?.startDate, semana]
  );

  const movimiento = useMemo(
    () => weightMove({ history, startDate: activeClient?.startDate, weekNumber: semana }),
    [history, activeClient?.startDate, semana]
  );

  /*
    La entrega que espera respuesta, si la hay. `checkIns` guarda solo la última
    de cada cliente (ver `AppContext`), así que contestar desde aquí vale para la
    semana que está esperando —que es por lo que se abre esta pantalla— y no para
    reabrir una de hace dos meses. Para eso está el histórico del final.
  */
  const entrega = checkIns[activeClient?.id] || null;
  const pendiente = entrega && !entrega.reviewedAt ? entrega : null;

  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);

  if (!activeClient) return null;

  if (semanas.length === 0) {
    return (
      <div className="stack">
        <PageHead
          title="Su semana"
          sub={`Todavía no le has montado ningún microciclo a ${activeClient.name}.`}
        />
        <EmptyState
          icon={Check}
          title="Aún no hay ninguna semana que cerrar"
          message="Móntale su primera semana en «Rutina» y aquí aparecerá lo que hace con ella, lo que entrega y el sitio para contestarle."
        />
      </div>
    );
  }

  const contestar = async (e) => {
    e.preventDefault();
    const limpio = texto.trim();
    if (!limpio || !pendiente) return;

    setEnviando(true);
    setError(null);

    /* La MISMA llamada que la cola de «Hoy», con su foto del plan: cerrar desde
       aquí o desde allí tiene que dejar el mismo rastro, o el histórico saldría
       con huecos según por dónde se cerrara. */
    const res = await reviewCheckIn(
      pendiente.id,
      limpio,
      planSnapshot({ nutrition: nutrition[activeClient.id], program: workoutData[activeClient.id] })
    );

    setEnviando(false);
    if (res?.ok === false) {
      setError(res.error);
      return;
    }
    setTexto('');

    /* La confirmación con su vuelta atrás, como en la cola de «Hoy»: deshacer
       quita el sello y la nota (0063) y la entrega vuelve a quedar pendiente. */
    const reviewId = pendiente.id;
    toast({
      text: `Respuesta enviada a ${activeClient.name}.`,
      action: {
        label: 'Deshacer',
        onClick: async () => {
          const undo = await unreviewCheckIn(reviewId);
          if (undo?.ok === false) setError(undo.error);
        },
      },
    });
  };

  return (
    <div className="stack">
      <PageHead
        title={`Semana ${semana}`}
        sub={[
          datos.weekStart ? `Del ${shortDate(datos.weekStart)}` : null,
          pendiente ? 'entregó y espera respuesta' : 'sin nada pendiente por tu parte',
        ]
          .filter(Boolean)
          .join(' · ')}
      />

      {/* EL carril. Uno solo, y manda sobre los tres bloques de abajo. */}
      <WeekPicker weeks={semanas} value={semana} onChange={setSemanaElegida} />

      <Panel title="Lo que hizo" className="col gap-4">
        <MetricRow>
          <MetricCard
            title="Sesiones"
            subtitle={`de ${datos.sessions.planned} programadas`}
            value={datos.sessions.done}
          />
          <MetricCard
            title="Tonelaje"
            subtitle="kilos levantados"
            value={fmt(datos.tonnage)}
            unit="kg"
            color={metricColor('tonnage')}
          />
          <MetricCard
            title="Series"
            subtitle={`de ${datos.sets.planned} programadas`}
            value={datos.sets.logged}
            color={metricColor('sets')}
          />
          <MetricCard
            title="Adherencia"
            subtitle={datos.adherence ? 'series con repeticiones' : 'sin programa'}
            value={datos.adherence ? datos.adherence.pct : '—'}
            unit={datos.adherence ? '%' : ''}
            color={metricColor('adherence')}
          />
        </MetricRow>

        <div className="week-days">
          {datos.days.length === 0 ? (
            <p className="t-sm t-tertiary">Esta semana no tiene días montados.</p>
          ) : (
            datos.days.map((dia) => <DiaFila key={dia.dayName} dia={dia} />)
          )}
        </div>
      </Panel>

      <Panel title="Lo que entregó" className="col gap-4">
        <MetricRow>
          <MetricCard
            title="Peso"
            subtitle={
              datos.checkIn?.count
                ? `${datos.checkIn.count} ${datos.checkIn.count === 1 ? 'pesaje' : 'pesajes'} · promedio`
                : 'sin pesajes esta semana'
            }
            value={datos.checkIn?.average ?? '—'}
            unit={datos.checkIn?.average ? 'kg' : ''}
            color={metricColor('weight')}
            delta={movimiento ? <Delta value={movimiento.delta} unit=" kg" lowerIsBetter /> : null}
            foot={
              movimiento
                ? `De ${movimiento.from} kg la semana pasada a ${movimiento.to} kg esta.`
                : undefined
            }
          />
          <MetricCard
            title="Fotos"
            subtitle={datos.photos.length > 0 ? 'de esta semana' : 'ninguna esta semana'}
            value={datos.photos.length}
          >
            {datos.photos.length > 0 && (
              <div className="week-photos">
                {datos.photos.slice(0, 4).map((foto) => (
                  <Thumb
                    key={foto.id}
                    url={foto.url}
                    width={180}
                    alt={`Foto del ${foto.date}`}
                  />
                ))}
              </div>
            )}
          </MetricCard>
        </MetricRow>

        {datos.notes.length > 0 ? (
          <div className="col gap-2">
            <span className="section-label">Lo que escribió al entrenar</span>
            {datos.notes.map(({ dayName, note }) => (
              <p className="week-quote" key={dayName}>
                <strong>{dayName}</strong> «{note}»
              </p>
            ))}
          </div>
        ) : (
          <p className="t-sm t-tertiary">No escribió nada al terminar sus sesiones esta semana.</p>
        )}

        {datos.photos.length === 0 && !datos.checkIn?.count && (
          <Notice tone="info">
            Esta semana no ha entregado nada. Si es la semana en curso es lo normal; si ya pasó,
            lo más probable es que todavía no tenga acceso a su portal — se le da desde su ficha.
          </Notice>
        )}
      </Panel>

      {/*
        ══ Tu respuesta, y por qué va la última ═══════════════════════════════
        Porque es lo último que ocurre. Todo lo que hace falta para escribirla
        está encima, así que al llegar aquí no hay que ir a buscar nada: ése es
        el punto entero de la pantalla.
      */}
      <Panel
        title="Tu respuesta"
        sub={
          pendiente
            ? 'La lee en su inicio, en cuanto la escribas.'
            : 'No hay ninguna entrega esperando respuesta.'
        }
        className="col gap-3"
      >
        {pendiente ? (
          <form className="col gap-2" onSubmit={contestar}>
            <textarea
              className="textarea"
              rows={3}
              value={texto}
              placeholder="Lo que le dirías de esta semana."
              onChange={(e) => setTexto(e.target.value)}
            />

            {error && <Notice tone="error">{error}</Notice>}

            <div className="row gap-2 wrap">
              <button type="submit" className="btn btn-primary" disabled={enviando || !texto.trim()}>
                <MessageSquare size={15} />
                {enviando ? 'Enviando…' : 'Contestar y cerrar la semana'}
              </button>
            </div>
          </form>
        ) : (
          <p className="t-sm t-secondary">
            Cuando {activeClient.name} entregue su check-in, aparecerá aquí para que le contestes sin
            salir de esta pantalla.
          </p>
        )}
      </Panel>

      {/* Lo que se decidió las semanas anteriores. Va al final porque es
          contexto: se consulta al dudar, no se lee cada vez. */}
      <ReviewHistory client={activeClient} audience="coach" />
    </div>
  );
};
