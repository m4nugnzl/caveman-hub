import { useEffect, useMemo, useRef, useState } from 'react';
import { TrendingUp } from 'lucide-react';

import { useApp } from '@/context/AppContext';
import { traeALaVista } from '@/lib/motion';
import {
  MRV_GOALS,
  exerciseNames,
  exerciseProgression,
  muscleColor,
  muscleFrequency,
  muscleVolumeOverTime,
  trainedMuscles,
  unitLabel,
  weekMuscleVolume,
} from '@/domain/training';
import { buildWeeklySeries, lastWeeks, macroShareBands, metricPoints, weekOverWeek } from '@/domain/analytics';
import { metricColor } from '@/domain/metrics';
import { goalFromDirection, targetRateKg } from '@/domain/goals';
import { effectiveGoal } from '@/domain/roadmap';
import { EVIDENCE_GROUPS, weeklyReading, weightTrend } from '@/domain/reading';
import { asksFeedback, clientProtocol } from '@/domain/protocol';
import { FeedbackHistory } from './FeedbackHistory';
import { MACROS } from '@/domain/nutrition';
import { PERIMETER_LABELS, perimeterSeries, seriesDelta } from '@/domain/anthropometry';
import { shortDate, todayISO } from '@/lib/dates';
import { fmt } from '@/lib/num';
import { BandChart, BarBandChart, MeterList, StackedShareChart } from '@/components/ui/charts';
import { RangeChips } from '@/components/ui/ChartCard';
import { Delta, MetricCard } from '@/components/ui/metrics';
import { EmptyState, PageHead, Panel } from '@/components/ui/primitives';
import { AnalyticsReading } from './AnalyticsReading';

/**
 * Métricas de un ejercicio, en el orden en que se consultan: primero el trabajo
 * total, luego cuántas series se hicieron y por último la fuerza estimada.
 *
 * Se ha quitado "mejor serie en kg": sin las repeticiones, los kilos solos no
 * comparan nada — 100×3 y 100×10 salían iguales.
 */
const EXERCISE_METRICS = [
  { value: 'tonnage', label: 'Tonelaje', unit: ' kg', decimals: 0 },
  { value: 'sets', label: 'Volumen (series)', unit: '', decimals: 0 },
  { value: 'e1rm', label: '1RM estimado', unit: ' kg', decimals: 0 },
].map((m) => ({ ...m, color: metricColor(m.value) }));

const VOLUME_SCOPES = [
  { value: 'total', label: 'Todos los músculos' },
  { value: 'muscle', label: 'Un músculo' },
];

// Las bandas usan la tripleta del dominio, no una copia local.

/** Selector compacto que vive dentro de la tarjeta que filtra. */
const Picker = ({ value, onChange, options, label, width = 160 }) => (
  <select
    className="select input-sm"
    style={{ width }}
    value={value}
    onChange={(e) => onChange(e.target.value)}
    aria-label={label}
    title={label}
  >
    {options.map((option) => (
      <option key={option.value ?? option} value={option.value ?? option}>
        {option.label ?? option}
      </option>
    ))}
  </select>
);

/**
 * ══ Analítica ══════════════════════════════════════════════════════════════
 *
 * ── Lo que era ─────────────────────────────────────────────────────────────
 * Diez gráficos correctos apilados en un scroll, agrupados en «nutrición»,
 * «composición» y «entrenamiento». Esos tres nombres son las TABLAS de la base de
 * datos: la página estaba ordenada por de dónde salen los datos, no por para qué
 * se miran. Y no concluía nada, porque en todo el modelo no había un campo que
 * dijera qué se pretende conseguir.
 *
 * ── Lo que es ──────────────────────────────────────────────────────────────
 * Conclusión, y luego la prueba:
 *
 *   1. La LECTURA de la semana: frases con gravedad, calculadas en
 *      `domain/reading.js`. Responde si va hacia donde se pretendía, si eso es
 *      señal o ruido, si el cliente ha hecho su parte y si la fuerza sube.
 *   2. Cada frase es un ENLACE al grupo de gráficos que la demuestra. La lectura
 *      es el índice de la página, no un encabezado más.
 *   3. Los grupos se llaman por la PREGUNTA que responden, y solo se ve uno a la
 *      vez. Diez gráficos a la vez son diez gráficos que nadie mira; cuatro que
 *      responden algo concreto sí se miran.
 *
 * Los gráficos son los mismos de antes salvo dos añadidos: la recta de tendencia
 * y la banda de objetivo sobre el peso —la prueba visual del titular— y la
 * adherencia semanal, que el dominio ya calculaba y nadie mostraba.
 */
export const AnalyticsPanel = ({ audience = 'coach' }) => {
  const { activeClient, workoutData, anthropometry, nutrition, updateClientPreferences, phases } = useApp();

  const program = workoutData[activeClient.id];
  const microcycles = useMemo(() => program?.microcycles || [], [program]);
  const anthro = anthropometry[activeClient.id];
  const history = useMemo(() => anthro?.history || [], [anthro]);
  const plan = nutrition[activeClient.id];
  const unit = unitLabel(activeClient.cycleType);
  const isClient = audience === 'client';
  /* Decide si existe la pestaña «Sensaciones» y qué preguntas se leen en ella. */
  const protocol = useMemo(() => clientProtocol(activeClient.preferences), [activeClient.preferences]);

  const weeks = useMemo(() => microcycles.map((m) => m.weekNumber).sort((a, b) => a - b), [microcycles]);
  const exercises = useMemo(() => exerciseNames(microcycles), [microcycles]);
  const muscles = useMemo(() => trainedMuscles(microcycles), [microcycles]);

  const [openGroup, setOpenGroup] = useState('direction');

  /*
    Al cambiar de grupo, la vista vuelve al principio del contenido. Sin esto,
    cambiar entre dos grupos que empiezan parecido —«Dirección» y «Ejecución»
    abren las dos con una tarjeta de métrica y un gráfico— desde media página
    abajo no se nota, y se lee como que el clic no ha funcionado.

    `firstRender` evita el salto al entrar en la pantalla: ahí no se ha cambiado
    de grupo, se ha llegado.
  */
  const contentRef = useRef(null);
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    traeALaVista(contentRef.current, { block: 'start', behavior: 'smooth' });
  }, [openGroup]);
  const [exercise, setExercise] = useState('');
  const [exerciseMetric, setExerciseMetric] = useState('tonnage');
  const [volumeScope, setVolumeScope] = useState('total');
  const [muscle, setMuscle] = useState('');
  const [volumeWeek, setVolumeWeek] = useState('');
  const [perimeter, setPerimeter] = useState('ombligo');
  /*
    Periodo de los gráficos, en semanas. `null` = todo el histórico, y es el valor
    por defecto a propósito: esto es una herramienta para entrenadores que llevan
    a la misma persona durante años, y lo primero que hay que poder ver es el
    recorrido completo. Acotar es lo excepcional, no lo normal.
  */
  const [range, setRange] = useState(null);

  const lastWeek = weeks[weeks.length - 1];
  const activeExercise = exercises.includes(exercise) ? exercise : exercises[0] || '';
  const activeMuscle = muscles.includes(muscle) ? muscle : muscles[0] || '';
  const activeVolumeWeek = weeks.includes(Number(volumeWeek)) ? Number(volumeWeek) : lastWeek;

  /*
    ══ Dos series, y la diferencia importa ═══════════════════════════════════

    `fullSeries` es el histórico ENTERO, desde el primer pesaje. `series` es lo
    que se dibuja: el periodo elegido.

    La separación no es cosmética. LA LECTURA DE LA SEMANA Y LA TENDENCIA SE
    CALCULAN SIEMPRE SOBRE EL HISTÓRICO COMPLETO, porque son conclusiones sobre
    dónde está el cliente hoy y no deben depender de cuánto haya decidido mirar
    el entrenador. Si el periodo afectara a la lectura, elegir «3 meses» cambiaría
    el veredicto —y un veredicto que se mueve con el zoom no es un veredicto.

    Los gráficos sí lo respetan: son la prueba, y a veces la prueba que interesa
    es un tramo.
  */
  const fullSeries = useMemo(
    () => buildWeeklySeries({ microcycles, history, gender: activeClient.gender }),
    [microcycles, history, activeClient.gender]
  );
  const series = useMemo(() => lastWeeks(fullSeries, range), [fullSeries, range]);
  const labels = series.map((row) => row.label);

  const kcalPts = metricPoints(series, 'kcals');
  const weightPts = metricPoints(series, 'weight');
  const fatPts = metricPoints(series, 'fat');
  const proteinSharePts = metricPoints(series, 'proteinShare');
  // La adherencia se calculaba en `buildWeeklySeries` desde el principio y no se
  // mostraba en ninguna parte: era la respuesta a «¿ha hecho su parte?» tirada.
  const adherencePts = metricPoints(series, 'adherence');

  const kcalWow = weekOverWeek(series, 'kcals');
  const fatWow = weekOverWeek(series, 'fat');

  /*
    El peso se cuenta por TENDENCIA, no por variación semana contra semana.
    ------------------------------------------------------------------------
    `weekOverWeek` resta las dos últimas semanas con dato, y para el peso corporal
    es el peor estimador posible: el ruido diario de agua y glucógeno es de ±1 kg y
    con dos puntos ese ruido entra entero en el resultado. Una semana con más sal
    bastaba para que la cifra cambiara de signo, y con ella la conclusión.

    La regresión sobre las últimas semanas reparte el ruido entre todos los puntos
    y además devuelve r², así que se puede DECIR cuándo la tendencia no es fiable
    en lugar de presentarla con la misma seguridad que una buena.
  */
  const trend = useMemo(() => weightTrend(fullSeries), [fullSeries]);

  /*
    El objetivo contra el que se juzga TODO en esta pantalla sale de la fase que
    cubre hoy, y solo si no hay ninguna se cae al objetivo suelto de la ficha (ver
    `domain/roadmap.js`).

    Sin esto, el día que alguien pasa de definición a volumen esta pantalla sigue
    midiéndole contra lo viejo: subir de peso —que es lo que toca— sale marcado
    como «en dirección contraria», y encima la banda del gráfico de peso se dibuja
    alrededor de la pendiente equivocada.
  */
  const goal = useMemo(() => effectiveGoal(activeClient, phases), [activeClient, phases]);
  const lastWeight = weightPts[weightPts.length - 1]?.value ?? null;

  const findings = useMemo(
    () =>
      weeklyReading({
        client: activeClient,
        // El histórico entero, nunca el periodo elegido: ver arriba.
        series: fullSeries,
        microcycles,
        history,
        today: todayISO(),
        latestWeek: weeks[weeks.length - 1] ?? null,
        phases,
      }),
    [activeClient, fullSeries, microcycles, history, weeks, phases]
  );

  /*
    La banda de objetivo sobre el gráfico de peso.
    ------------------------------------------------------------------------
    Traduce el objetivo a los kilos que debería marcar la báscula al final de la
    ventana de tendencia, y dibuja el margen alrededor. Convierte «¿esto está
    bien?» en algo que se ve: el último punto está dentro de la banda o no.

    Solo se dibuja si hay tendencia; con dos pesajes la banda sugeriría una
    precisión que no existe.
  */
  const goalBand = useMemo(() => {
    const rate = targetRateKg(goal, lastWeight);
    if (rate === null || !trend.ok || weightPts.length < 2) return null;

    const start = weightPts[weightPts.length - trend.weeks]?.value ?? weightPts[0].value;
    const expected = start + rate * (trend.weeks - 1);
    const margin = Math.max(Math.abs(rate) * (trend.weeks - 1) * 0.5, 0.4);
    return { from: expected - margin, to: expected + margin };
  }, [goal, lastWeight, trend, weightPts]);

  const macroRows = useMemo(() => macroShareBands(history), [history]);
  const lastMacros = macroRows[macroRows.length - 1] || null;

  const perimeterPts = useMemo(
    () => perimeterSeries(history, perimeter).map((p) => ({ ...p, label: shortDate(p.date) })),
    [history, perimeter]
  );
  const perimeterDelta = seriesDelta(perimeterPts);

  const progression = useMemo(
    () => (activeExercise ? exerciseProgression(microcycles, activeExercise) : []),
    [microcycles, activeExercise]
  );
  const metricMeta = EXERCISE_METRICS.find((m) => m.value === exerciseMetric) || EXERCISE_METRICS[0];
  const progPoints = progression
    .map((row) => ({ label: row.label, value: row[exerciseMetric] }))
    .filter((p) => p.value !== null);
  const progDelta = seriesDelta(progPoints);

  const weekVolume = useMemo(
    () => (activeVolumeWeek ? weekMuscleVolume(microcycles, activeVolumeWeek) : {}),
    [microcycles, activeVolumeWeek]
  );
  const volumeEntries = Object.entries(weekVolume).sort((a, b) => b[1] - a[1]);
  const maxVolume = Math.max(1, ...volumeEntries.map(([, v]) => v));

  const frequency = useMemo(
    () => (activeVolumeWeek ? muscleFrequency(microcycles, activeVolumeWeek) : {}),
    [microcycles, activeVolumeWeek]
  );
  const frequencyEntries = Object.entries(frequency).sort((a, b) => b[1] - a[1]);

  /** Evolución del volumen: total del programa o de un músculo concreto. */
  const volumeOverTime = useMemo(() => {
    if (volumeScope === 'muscle') {
      return activeMuscle ? muscleVolumeOverTime(microcycles, activeMuscle) : [];
    }
    return [...microcycles]
      .sort((a, b) => a.weekNumber - b.weekNumber)
      .map((m) => ({
        week: m.weekNumber,
        label: `${unit.charAt(0)}${m.weekNumber}`,
        value: Object.values(weekMuscleVolume(microcycles, m.weekNumber)).reduce((a, v) => a + v, 0),
      }));
  }, [volumeScope, activeMuscle, microcycles, unit]);

  const volumeColor =
    volumeScope === 'muscle' ? muscleColor(activeMuscle) : metricColor('tonnage');

  const hasProgram = microcycles.length > 0;
  const hasBody = history.length > 0;

  if (!hasProgram && !hasBody) {
    return (
      <EmptyState
        icon={TrendingUp}
        title="Todavía no hay nada que analizar"
        message={
          isClient
            ? 'Cuando registres pesos y tu entrenador te programe semanas, aquí aparecerá tu progresión.'
            : 'Programa una semana y registra un peso: a partir de ahí esta pestaña se llena sola.'
        }
      />
    );
  }

  /* «Sensaciones» solo existe si el protocolo pregunta algo: una pestaña vacía
     que nunca se llena es peor que no tenerla. */
  const groups = EVIDENCE_GROUPS.filter((g) => g.id !== 'feel' || asksFeedback(protocol));
  const group = groups.find((g) => g.id === openGroup) || groups[0];

  return (
    <div className="stack">
      <PageHead
        title="Análisis"
        sub={
          isClient
            ? 'Tu progreso a fondo: qué se mueve, cuánto y desde cuándo.'
            : `La revisión a fondo de ${activeClient.name}: qué se mueve, cuánto y desde cuándo.`
        }
      />

      {/* La conclusión antes de la prueba. Ver AnalyticsReading. */}
      <AnalyticsReading
        findings={findings}
        goal={goal}
        weight={lastWeight}
        // El objetivo lo fija el entrenador: es una decisión profesional sobre el
        // proceso, no una preferencia del cliente. El cliente lo ve.
        canEditGoal={!isClient}
        onSetGoal={(direction) =>
          updateClientPreferences(
            activeClient.id,
            'goal',
            // Al desmarcar se escribe `direction: null` en vez de borrar la clave:
            // `updateClientPreferences` fusiona por sección y no puede quitar
            // claves, y `clientGoal` ya lee un `direction` inválido como «sin
            // objetivo». Un camino, sin excepciones.
            goalFromDirection(direction) || { direction: null }
          )
        }
        // Pulsar una conclusión abre la prueba. Es lo que hace que la lectura sea
        // el índice de la página en vez de una cabecera decorativa.
        openGroup={openGroup}
        onOpenGroup={setOpenGroup}
      />

      {/*
        Un grupo a la vez.
        ----------------------------------------------------------------------
        Los diez gráficos siguen estando todos; lo que cambia es que ya no compiten.
        Un scroll con diez es un scroll que nadie recorre: se mira el primero y se
        cierra la pestaña. Cuatro pestañas con una pregunta cada una se eligen.
      */}
      {/*
        ── Por qué esta barra lleva teclado y desplaza al contenido ────────────
        Un `role="tablist"` sin flechas es una lista de pestañas que solo se puede
        recorrer con el ratón, y es lo que exige el patrón ARIA.

        Y lo segundo arregla un problema de RETROALIMENTACIÓN que se confunde con
        un fallo: «Dirección» y «Ejecución» abren las dos con una tarjeta de
        métrica y un gráfico de banda, así que con la página desplazada hacia
        abajo cambiar de una a otra apenas se nota — parece que el clic no ha
        hecho nada—. Al cambiar de grupo se lleva la vista al principio del
        contenido, de modo que siempre se ve QUÉ se ha abierto.
      */}
      <div
        className="ev-tabs"
        role="tablist"
        aria-label="Grupos de evidencia"
        onKeyDown={(event) => {
          const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
          if (step === 0) return;
          event.preventDefault();
          const index = groups.findIndex((g) => g.id === group.id);
          const next = groups[(index + step + groups.length) % groups.length];
          setOpenGroup(next.id);
        }}
      >
        {groups.map((g) => {
          // Cuántos hallazgos apuntan aquí, y si alguno es grave. Así se ve qué
          // pestaña merece abrirse antes de abrirla.
          const own = findings.filter((f) => f.evidence === g.id);
          const worst = own.some((f) => f.tone === 'bad')
            ? 'bad'
            : own.some((f) => f.tone === 'warn')
              ? 'warn'
              : null;

          return (
            <button
              key={g.id}
              type="button"
              role="tab"
              className="ev-tab"
              aria-selected={openGroup === g.id}
              /* Solo la pestaña activa es tabulable, que es el patrón ARIA: dentro
                 de la barra se navega con las flechas, no con el tabulador. */
              tabIndex={openGroup === g.id ? 0 : -1}
              onClick={() => setOpenGroup(g.id)}
            >
              <span className="q">{g.question}</span>
              <span className="l">
                {g.label}
                {worst && <span className={`ev-dot is-${worst}`} aria-label="tiene avisos" />}
              </span>
            </button>
          );
        })}
      </div>

      {/*
        ── El periodo, y por qué está aquí y no en cada tarjeta ────────────────
        Este panel llegó a tener una barra global de «periodo / escala /
        tendencias» que se quitó porque no funcionaba: cada gráfico admite
        variaciones distintas —uno se filtra por ejercicio, otro por músculo— y un
        mando único no podía representar eso, así que la mitad de los controles no
        hacía nada en la mitad de los gráficos. Por eso los controles propios de
        cada gráfico viven en su tarjeta.

        El PERIODO es la excepción, y no por comodidad: es lo único que significa
        exactamente lo mismo en todos los gráficos con eje temporal. Repetirlo en
        cinco tarjetas sería pedir cinco veces la misma decisión.

        Se dice en voz alta que la lectura no le hace caso, porque si no la
        pregunta obvia al acotar es «¿y ahora el veredicto es de estos tres meses?».
      */}
      {fullSeries.length > 6 && (
        <div className="row between wrap gap-3">
          <RangeChips
            value={range}
            onChange={setRange}
            label="Periodo de los gráficos"
            options={[
              { id: 12, label: '3 meses' },
              { id: 26, label: '6 meses' },
              { id: 52, label: '1 año' },
              { id: null, label: 'Todo' },
            ]}
          />
          <span className="t-2xs t-tertiary">
            {range
              ? `${series.length} de ${fullSeries.length} semanas. La lectura de arriba sigue mirando el histórico completo.`
              : `${fullSeries.length} semanas de histórico.`}
          </span>
        </div>
      )}

      <section className="col gap-4" aria-live="polite" ref={contentRef}>
        {/* ══ DIRECCIÓN — ¿va hacia donde se pretendía? ══ */}
        {group.id === 'direction' && (
          <>
            <MetricCard
              title="Peso corporal"
              subtitle={`Promedio semanal${goal ? ' · con la banda del objetivo' : ''}`}
              value={fmt(lastWeight, { decimals: 1 })}
              unit="kg"
              // La tendencia, no la última resta. `lowerIsBetter` se quita: si el
              // objetivo es subir, pintar de rojo una subida es decir lo contrario
              // de la verdad, y la lectura de arriba ya juzga el signo con el
              // objetivo delante.
              delta={trend.ok ? <Delta value={trend.perWeek} unit=" kg/sem" decimals={2} /> : null}
              foot={
                trend.ok
                  ? `Pendiente de las últimas ${trend.weeks} semanas${trend.weak ? `, poco fiable (r² ${trend.r2}): los pesajes están muy dispersos, y por eso la recta va discontinua` : ` (r² ${trend.r2})`}.${goalBand ? ' La banda verde es dónde debería estar el peso según el objetivo.' : ''}`
                  : `Se necesitan ${trend.needed} semanas con pesajes para calcular una tendencia; hay ${trend.weeks}.`
              }
            >
              <BandChart
                labels={labels}
                series={[
                  {
                    id: 'weight',
                    label: 'Peso',
                    color: metricColor('weight'),
                    unit: ' kg',
                    decimals: 1,
                    points: weightPts,
                  },
                ]}
                height={148}
                smooth
                // La recta y la banda son la PRUEBA VISUAL del titular. Sin ellas
                // la lectura dice «−0,4 kg/semana» y el gráfico enseña una línea
                // que sube y baja, sin forma de ver de dónde sale la cifra.
                trend={trend.ok ? trend : null}
                band={goalBand}
                emptyMessage="Sin pesajes registrados."
              />
            </MetricCard>

            <div className="grid-2">
              <MetricCard
                title="% graso"
                subtitle="Suma de 6 pliegues"
                value={fatPts.length > 0 ? fmt(fatPts[fatPts.length - 1].value, { decimals: 1 }) : '—'}
                unit="%"
                delta={<Delta value={fatWow?.delta} unit=" pts" lowerIsBetter />}
                // El error de medición de los pliegues es de 1-2 puntos, más que
                // muchas variaciones semanales. Decirlo evita leer como progreso
                // lo que es la mano de quien mide.
                foot="Medido con plicómetro: el error entre dos mediciones es de 1-2 puntos, así que solo son fiables los cambios sostenidos."
              >
                <BandChart
                  labels={labels}
                  series={[
                    {
                      id: 'fat',
                      label: '% graso',
                      color: metricColor('fat'),
                      unit: '%',
                      decimals: 1,
                      points: fatPts,
                    },
                  ]}
                  height={124}
                  emptyMessage="Registra pliegues en «Check-ins» para ver el % graso."
                />
              </MetricCard>

              <MetricCard
                title="Perímetros"
                subtitle={PERIMETER_LABELS[perimeter]}
                value={
                  perimeterPts.length > 0
                    ? fmt(perimeterPts[perimeterPts.length - 1].value, { decimals: 1 })
                    : '—'
                }
                unit="cm"
                delta={
                  <Delta value={perimeterDelta?.delta} unit=" cm" lowerIsBetter={perimeter === 'ombligo'} />
                }
                action={
                  <Picker
                    value={perimeter}
                    onChange={setPerimeter}
                    options={Object.entries(PERIMETER_LABELS).map(([value, label]) => ({ value, label }))}
                    label="Perímetro"
                    width={132}
                  />
                }
              >
                <BandChart
                  labels={perimeterPts.map((p) => p.label)}
                  series={[
                    {
                      id: perimeter,
                      label: PERIMETER_LABELS[perimeter],
                      color: metricColor('waist'),
                      unit: ' cm',
                      decimals: 1,
                      points: perimeterPts,
                    },
                  ]}
                  height={124}
                  emptyMessage="Sin medidas de este perímetro. Se registran en el apartado opcional de «Check-ins»."
                />
              </MetricCard>
            </div>
          </>
        )}

        {/* ══ SENSACIONES — ¿cómo lo está llevando? ══
            Todo lo que el cliente contesta al terminar de entrenar se guardaba
            desde el principio dentro de su sesión, y solo se podía leer abriendo
            el día concreto de la semana concreta: el dato existía y el historial
            no. Aquí está entero. */}
        {group.id === 'feel' && (
          <FeedbackHistory microcycles={microcycles} protocol={protocol} audience={audience} />
        )}

        {/* ══ EJECUCIÓN — ¿ha hecho el cliente su parte? ══ */}
        {group.id === 'execution' && (
          <>
            {/*
              Este grupo es el que decide QUÉ SE HACE después.
              ------------------------------------------------------------------
              Si el peso no se mueve y la adherencia es del 40 %, el problema no es
              el plan: cambiarlo sería cambiar a ciegas. Antes esta información
              existía en el dominio y no se mostraba en ninguna pantalla, así que
              esa distinción había que hacerla de memoria o preguntando.
            */}
            <MetricCard
              title="Adherencia al entrenamiento"
              subtitle="Series registradas sobre las programadas"
              value={
                adherencePts.length > 0 ? fmt(adherencePts[adherencePts.length - 1].value, { decimals: 0 }) : '—'
              }
              unit="%"
              color={metricColor('adherence')}
              foot="Una semana al 60 % no significa que el plan no funcione: significa que no se ha hecho el plan. Es lo primero que conviene resolver antes de cambiar nada."
            >
              <BandChart
                labels={labels}
                series={[
                  {
                    id: 'adherence',
                    label: 'Adherencia',
                    color: metricColor('adherence'),
                    unit: '%',
                    decimals: 0,
                    points: adherencePts,
                  },
                ]}
                height={124}
                fromZero
                emptyMessage="Sin series registradas todavía."
              />
            </MetricCard>

            <MetricCard
              title="Series por grupo muscular"
              subtitle={`${unit} ${activeVolumeWeek ?? ''} · solo series con repeticiones registradas`}
              value={volumeEntries.reduce((acc, [, v]) => acc + v, 0)}
              unit="series"
              color={metricColor('sets')}
              action={
                <Picker
                  value={String(activeVolumeWeek ?? '')}
                  onChange={setVolumeWeek}
                  options={weeks.map((w) => ({ value: String(w), label: `${unit} ${w}` }))}
                  label={unit}
                  width={116}
                />
              }
              foot="La marca roja señala el MRV, el máximo volumen recuperable estimado de cada grupo."
            >
              {volumeEntries.length === 0 ? (
                <p className="t-sm t-secondary">Sin series registradas en esta {unit.toLowerCase()}.</p>
              ) : (
                <MeterList
                  items={volumeEntries.map(([name, count]) => {
                    const goals = MRV_GOALS[name];
                    return {
                      label: name,
                      value: count,
                      pct: (count / maxVolume) * 100,
                      color: muscleColor(name),
                      markerPct: goals ? (goals.mrv / maxVolume) * 100 : null,
                      markerTitle: goals ? `MRV: ${goals.mrv} series` : undefined,
                    };
                  })}
                />
              )}
            </MetricCard>

            {/* Frecuencia como KPIs y no como barras: son enteros de 1 a 3, y una
                barra para representar "2" ocupa mucho y comunica poco. */}
            <section className="col gap-3">
              <span className="section-label">
                Frecuencia semanal · {unit.toLowerCase()} {activeVolumeWeek ?? ''}
              </span>

              {frequencyEntries.length === 0 ? (
                <Panel tight>
                  <p className="t-sm t-secondary">Sin datos en esta {unit.toLowerCase()}.</p>
                </Panel>
              ) : (
                <>
                  <div className="grid-auto">
                    {frequencyEntries.map(([name, days]) => (
                      <div className="stat" key={name}>
                        <span className="stat-label">{name}</span>
                        <span
                          className="stat-value"
                          style={{ color: muscleColor(name) }}
                        >
                          {days}
                          <span className="metric-unit"> {days === 1 ? 'día' : 'días'}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="t-xs t-tertiary">
                    Días distintos en que se entrena cada músculo. Con el mismo volumen total, repartirlo en
                    dos sesiones suele rendir más que concentrarlo en una.
                  </p>
                </>
              )}
            </section>
          </>
        )}

        {/* ══ RENDIMIENTO — ¿mejora? ══ */}
        {group.id === 'performance' &&
          (hasProgram ? (
            <>
              <MetricCard
                title="Progresión por ejercicio"
                subtitle={activeExercise || 'sin ejercicios'}
                value={
                  progPoints.length > 0
                    ? fmt(progPoints[progPoints.length - 1].value, { decimals: metricMeta.decimals })
                    : '—'
                }
                unit={metricMeta.unit.trim()}
                color={metricMeta.color}
                delta={
                  <Delta value={progDelta?.delta} unit={metricMeta.unit} decimals={metricMeta.decimals} />
                }
                action={
                  <div className="row gap-2 wrap">
                    <Picker
                      value={activeExercise}
                      onChange={setExercise}
                      options={exercises}
                      label="Ejercicio"
                      width={182}
                    />
                    <Picker
                      value={exerciseMetric}
                      onChange={setExerciseMetric}
                      options={EXERCISE_METRICS}
                      label="Métrica"
                      width={162}
                    />
                  </div>
                }
                foot={
                  exerciseMetric === 'e1rm'
                    ? '1RM estimado por la fórmula de Epley: compara series de rangos distintos, porque 100 kg × 5 y 85 kg × 10 son esfuerzos parecidos. Si esto sube, un peso que no baja no es motivo para recortar calorías.'
                    : null
                }
              >
                <BandChart
                  labels={progression.map((row) => row.label)}
                  series={[
                    {
                      id: exerciseMetric,
                      label: metricMeta.label,
                      color: metricMeta.color,
                      unit: metricMeta.unit,
                      decimals: metricMeta.decimals,
                      points: progPoints,
                    },
                  ]}
                  height={140}
                  emptyMessage={`Sin series registradas de «${activeExercise}». Los datos aparecen al anotar kilos y repeticiones.`}
                />
              </MetricCard>

              <MetricCard
                title="Evolución del volumen"
                subtitle={
                  volumeScope === 'muscle'
                    ? `${activeMuscle} · series por ${unit.toLowerCase()}`
                    : `Todos los músculos · series por ${unit.toLowerCase()}`
                }
                value={volumeOverTime.length > 0 ? volumeOverTime[volumeOverTime.length - 1].value : '—'}
                unit="series"
                color={volumeColor}
                action={
                  <div className="row gap-2 wrap">
                    <Picker
                      value={volumeScope}
                      onChange={setVolumeScope}
                      options={VOLUME_SCOPES}
                      label="Ámbito"
                      width={168}
                    />
                    {volumeScope === 'muscle' && (
                      <Picker
                        value={activeMuscle}
                        onChange={setMuscle}
                        options={muscles}
                        label="Músculo"
                        width={150}
                      />
                    )}
                  </div>
                }
              >
                <BarBandChart
                  bars={volumeOverTime.map((row) => ({
                    label: row.label,
                    value: row.value,
                    highlight: row.week === lastWeek,
                  }))}
                  color={volumeColor}
                  unit=" series"
                  height={140}
                  emptyMessage="Sin series registradas todavía."
                />
              </MetricCard>
            </>
          ) : (
            <Panel tight>
              <p className="t-sm t-secondary">
                Sin programa asignado no hay rendimiento que medir. Aparecerá al programar la primera{' '}
                {unit.toLowerCase()}.
              </p>
            </Panel>
          ))}

        {/* ══ DIETA — ¿qué se le ha puesto de comer? ══ */}
        {group.id === 'diet' && (
          <>
            {!plan && (
              <Panel tight>
                <p className="t-sm t-secondary">
                  Sin plan nutricional configurado, las calorías y el reparto de macros se quedan vacíos.
                </p>
              </Panel>
            )}

            <div className="grid-2">
              <MetricCard
                title="Calorías objetivo"
                subtitle="Registradas en cada revisión"
                value={fmt(kcalPts[kcalPts.length - 1]?.value ?? plan?.targetKcals)}
                unit="kcal"
                delta={<Delta value={kcalWow?.delta} percent={kcalWow?.pct} />}
                foot="Cada revisión guarda las kcal vigentes, así que el histórico se construye a medida que se registran pesos."
              >
                <BandChart
                  labels={labels}
                  series={[
                    {
                      id: 'kcals',
                      label: 'Kcal',
                      color: metricColor('kcals'),
                      unit: ' kcal',
                      decimals: 0,
                      points: kcalPts,
                    },
                  ]}
                  height={124}
                  emptyMessage="Configura los macros y registra un peso para empezar el histórico."
                />
              </MetricCard>

              <MetricCard
                title="Reparto de macros"
                subtitle="Porcentaje de las kcal"
                value={lastMacros ? `${lastMacros.protein}/${lastMacros.carbs}/${lastMacros.fats}` : '—'}
                unit="P/C/G %"
                delta={
                  proteinSharePts.length > 1 ? (
                    <Delta
                      value={
                        proteinSharePts[proteinSharePts.length - 1].value -
                        proteinSharePts[proteinSharePts.length - 2].value
                      }
                      unit=" pts prot."
                    />
                  ) : null
                }
              >
                <StackedShareChart rows={macroRows} bands={MACROS} height={130} />
              </MetricCard>
            </div>

            {/*
              Kcal y peso como DOS BANDAS APILADAS que comparten el eje de tiempo, no
              como un gráfico de doble eje.
              --------------------------------------------------------------------
              El doble eje distorsionaba: con dos escalas independientes, la distancia
              visual entre las líneas es arbitraria — se puede hacer que parezcan
              pegadas o divergentes solo cambiando los rangos. Apiladas, cada serie
              conserva su escala real y la comparación se hace donde debe: en si los
              cambios coinciden en el tiempo.
            */}
            <MetricCard
              title="Calorías frente a peso"
              subtitle="Mismo eje de tiempo, cada serie con su escala"
              value={fmt(lastWeight, { decimals: 1 })}
              unit="kg"
              foot="Si el peso no se mueve en la dirección buscada, mira si las calorías cambiaron antes: el efecto de un cambio de kcal tarda dos o tres semanas en verse en la báscula."
            >
              <div className="col gap-4">
                <div className="col gap-1">
                  <span className="section-label">Calorías objetivo</span>
                  <BandChart
                    labels={labels}
                    series={[
                      {
                        id: 'kcals-paired',
                        label: 'Kcal',
                        color: metricColor('kcals'),
                        unit: ' kcal',
                        decimals: 0,
                        points: kcalPts,
                      },
                    ]}
                    height={92}
                    emptyMessage="Configura los macros para empezar el histórico."
                  />
                </div>

                <div className="col gap-1">
                  <span className="section-label">Peso corporal</span>
                  <BandChart
                    labels={labels}
                    series={[
                      {
                        id: 'weight-paired',
                        label: 'Peso',
                        color: metricColor('weight'),
                        unit: ' kg',
                        decimals: 1,
                        points: weightPts,
                      },
                    ]}
                    height={92}
                    trend={trend.ok ? trend : null}
                    emptyMessage="Sin pesajes registrados."
                  />
                </div>
              </div>
            </MetricCard>
          </>
        )}
      </section>

      {!hasBody && (
        <Panel tight>
          <p className="t-sm t-secondary">
            {isClient
              ? 'Registra tu peso en «Check-ins» y aquí aparecerán tu evolución, tus perímetros y la comparativa con las calorías.'
              : 'Sin registros de peso todavía: la composición corporal y la nutrición aparecerán cuando el cliente empiece a registrar.'}
          </p>
        </Panel>
      )}
    </div>
  );
};
