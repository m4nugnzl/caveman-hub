import { useMemo } from 'react';
import {
  Activity,
  Camera,
  Dumbbell,
  Flame,
  MessageSquare,
  Scale,
  Target,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import { useApp } from '@/context/AppContext';
import { blockChanges } from '@/domain/blocks';
import { buildWeeklySeries, metricPoints, weekAdherence, weekOverWeek } from '@/domain/analytics';
import {
  MRV_GOALS,
  WEEK_DAYS,
  findMicrocycle,
  isRestDay,
  muscleColor,
  rotatingSlots,
  tonnageByWeek,
  trainingDayCount,
  unitLabel,
  weekMuscleVolume,
} from '@/domain/training';
import { MACROS, macroSplit } from '@/domain/nutrition';
import { weeklyCheckIn, weeklyRateOfChange } from '@/domain/anthropometry';
import { clientProtocol, isServiceOn, scaleQuestions } from '@/domain/protocol';
import {
  buildFeedbackSeries,
  feedbackAdherence,
  feedbackLabels,
  questionStats,
} from '@/domain/readiness';
import { pieceNeeds } from '@/domain/preferences';
import { metricColor } from '@/domain/metrics';
import { shortDate, todayISO } from '@/lib/dates';
import { clientPath } from '@/routes';
import { fmt } from '@/lib/num';
import { BandChart, BarBandChart, MeterList, Sparkline } from '@/components/ui/charts';
import { Delta, MetricCard, StatWidget } from '@/components/ui/metrics';
import { CycleChain } from '@/components/ui/CycleChain';
import { GroupHead, PageHead, Panel } from '@/components/ui/primitives';
import { Mando } from '@/components/ui/Mando';
import { MacroBar } from '@/components/nutrition/macros';
import { RoadmapPanel } from '@/components/roadmap/RoadmapPanel';
import { useReviewRows } from '@/components/review/useReviewRows';
import { useReviewTrack } from '@/components/review/useReviewTrack';
import { ReviewChart } from '@/components/review/ReviewChart';
import { useElementWidth } from '@/lib/useElementWidth';

// La tripleta de colores viene del dominio: cuatro copias del mismo dato divergen.

/**
 * Resumen.
 *
 * Responde a una sola pregunta: **¿esto va bien?** Cifras condensadas arriba,
 * gráficos con su banda debajo, y una lista agrupada con todo lo demás —que es
 * donde caben las métricas que no merecen un gráfico propio.
 *
 * ── Qué se ve lo decide el cliente ──────────────────────────────────────────
 * Ni las cifras ni los gráficos están fijados aquí: se construyen todos y se
 * renderizan los que estén en `preferences.dashboard`, EN SU ORDEN (ver
 * `domain/preferences.js`). Un cliente que no ha tocado nada ve un panel
 * completo y sensato; uno que compite puede dejar arriba el tonelaje y las
 * series y quitarse las calorías de la vista.
 *
 * Construir todas las piezas y elegir después —en lugar de montar cada una
 * dentro de un condicional— es lo que hace que añadir una pieza nueva sea
 * añadir una entrada al catálogo y otra a este mapa, sin tocar el layout.
 */
export const Dashboard = ({ audience = 'coach' }) => {
  const {
    activeClient,
    workoutData,
    anthropometry,
    nutrition,
    progressPhotos,
  } = useApp();

  /*
    ══ LO QUE LE HAS IDO CAMBIANDO ════════════════════════════════════════════

    Esta pantalla existe para contestar «¿esto está funcionando?», y hasta ahora
    enseñaba tonelaje, series efectivas, adherencia y macros: el EFECTO, sin la
    causa. De todo lo que hace un entrenador, aquí no salía ni una sola de sus
    decisiones.

    En culturismo eso es justo la mitad que falta. No se planifica por bloques
    cerrados: se monta una rutina, se cuadra una dieta y se van AJUSTANDO —bajar
    doscientas calorías, cambiar un ejercicio, subir una serie— semana a semana.
    La pregunta profesional no es «¿cuánto ha bajado?» sino «¿están funcionando
    mis ajustes?», y para contestarla hay que ver los ajustes al lado de la curva.

    El producto ya lo tenía todo registrado y en un solo sitio: `ReviewHistory`
    junta lo que él entregó, lo que tú contestaste y —comparando la foto del plan
    con la de la revisión anterior— **lo que cambiaste**, con las cifras de antes
    y de después. Su propia cabecera dice qué contesta: «¿qué le cambié en
    agosto?».

    Estaba en tres sitios —el portal del cliente, el archivo del check-in y el
    pie de la revisión— y no estaba en el único que promete contestar si aquello
    sirvió de algo. Aquí no se añade nada nuevo: se pone donde hacía falta.

    ── Solo para el entrenador ────────────────────────────────────────────────
    El cliente ya tiene esta misma historia en su semana (`Client/ClientWeek`),
    que es donde lee la respuesta de su entrenador. Repetirla en su progreso
    sería contarle dos veces lo mismo en dos pestañas.
  */
  const { rows: revisiones } = useReviewRows(
    audience === 'coach' ? activeClient?.id : null
  );

  /*
    ══ LA HISTORIA DE SUS AJUSTES, Y SI FUNCIONARON ═══════════════════════════

    Esta pantalla existe para contestar «¿esto está funcionando?» y enseñaba
    tonelaje, adherencia y macros: métricas sueltas, sin una sola decisión tuya.

    Aquí está la que la contesta de verdad: su peso arriba y, debajo y con el
    mismo eje, la escalera de las calorías que le fuiste poniendo. Cada peldaño
    es un ajuste y lo que hay encima es lo que pasó después — que es exactamente
    la pregunta de un entrenador de culturismo, donde no se planifica por bloques
    sino que se ajusta sobre la marcha.

    ── Es la MISMA gráfica de la revisión, no otra ────────────────────────────
    Allí es el mando: se pulsa una semana y el tablero de abajo habla de ella.
    Aquí no hay tablero que mandar, así que va en `soloLectura` y su eje son
    rótulos en vez de botones — un control que no lleva a ninguna parte promete
    algo que no cumple. La cadena que la alimenta también es una sola:
    `useReviewTrack`, que se subió de `WeekReview` para no copiarla.

    Y va sobre la historia ENTERA, sin ventana: en la revisión se mira un tramo
    de cerca y aquí se viene a ver la forma de todo.
  */
  const track = useReviewTrack(revisiones);
  /* Devuelve [ref, ancho]. Se leía como objeto y el ancho llegaba undefined: la
     gráfica del peso se pintaba vacía. El medidor va FUERA del panel condicional,
     porque el observador se engancha al montar y el panel llega después. */
  const [refAncho, ancho] = useElementWidth();


  const program = workoutData[activeClient.id];
  const microcycles = useMemo(() => program?.microcycles || [], [program]);
  const anthro = anthropometry[activeClient.id];
  const history = useMemo(() => anthro?.history || [], [anthro]);
  const plan = nutrition[activeClient.id];
  const unit = unitLabel(activeClient.cycleType);
  const isClient = audience === 'client';
  /* Ver el comentario de la cabecera, más abajo. */
  const Cabecera = isClient ? GroupHead : PageHead;

  const series = useMemo(
    () => buildWeeklySeries({ microcycles, history, gender: activeClient.gender }),
    [microcycles, history, activeClient.gender]
  );
  const labels = series.map((row) => row.label);

  const weightPts = metricPoints(series, 'weight');
  const tonnagePts = metricPoints(series, 'tonnage');
  const setsPts = metricPoints(series, 'sets');

  const weightWow = weekOverWeek(series, 'weight');
  const tonnageWow = weekOverWeek(series, 'tonnage');
  const setsWow = weekOverWeek(series, 'sets');
  const rate = weeklyRateOfChange(history);
  const checkIn = useMemo(() => weeklyCheckIn(history, todayISO()), [history]);

  const latestWeek = useMemo(() => {
    const weeks = microcycles.map((m) => m.weekNumber);
    return weeks.length > 0 ? Math.max(...weeks) : null;
  }, [microcycles]);

  const adherence = latestWeek ? weekAdherence(microcycles, latestWeek) : null;
  const tonnage = useMemo(() => tonnageByWeek(microcycles), [microcycles]);
  const macros = macroSplit(plan);
  const photos = progressPhotos.filter((p) => p.clientId === activeClient.id);

  const volume = useMemo(
    () => (latestWeek ? Object.entries(weekMuscleVolume(microcycles, latestWeek)) : []),
    [microcycles, latestWeek]
  );
  const maxVolume = Math.max(1, ...volume.map(([, count]) => count), ...volume.map(([name]) => MRV_GOALS[name]?.mrv || 0));

  /*
    El protocolo decide si estas dos piezas existen siquiera. Se calculan siempre
    —construir todos los nodos y elegir después es lo que hace que añadir una
    pieza no toque el layout— pero valen `null` cuando no hay nada que enseñar, y
    el panel filtra los nulos.
  */
  const protocol = useMemo(() => clientProtocol(activeClient.preferences), [activeClient.preferences]);

  /*
    ── Las piezas que hablan de lo que NO le llevas ───────────────────────────

    A quien solo le llevas el entrenamiento no le sobra el «Kcal objetivo» del
    resumen: es que no tiene nutrición. Sin este filtro, quitarle la sección le
    dejaría igualmente la cifra en el panel —vacía, con «sin plan» debajo—, en la
    lista de métricas del final y en la bandeja de «añadir», que es prometer una
    pantalla que ya no existe.

    La correspondencia pieza → servicio vive en `domain/preferences.js`, al lado
    de los catálogos, porque la usan las tres listas y la bandeja.
  */
  const piezaVisible = (id) => {
    const necesita = pieceNeeds(id);
    return !necesita || isServiceOn(protocol, necesita);
  };
  const feedbackSeries = useMemo(
    () => buildFeedbackSeries(microcycles, scaleQuestions(protocol)),
    [microcycles, protocol]
  );
  const headline = useMemo(() => {
    const first = scaleQuestions(protocol)[0];
    return first ? questionStats(microcycles, first) : null;
  }, [microcycles, protocol]);
  const adherenceToFeedback = useMemo(() => feedbackAdherence(microcycles), [microcycles]);


  /**
   * Las cifras de arriba, por identificador.
   *
   * Todas se construyen aunque no haya dato: si el cliente ha pedido ver su
   * adherencia, un hueco con «—» le dice que aún no hay series registradas, y eso
   * es más predecible que un widget que aparece y desaparece según el día.
   */
  const widgetNodes = {
    weight: (
      <StatWidget
        title="Peso"
        icon={Scale}
        timeframe={labels.length > 0 ? `${labels.length} semanas` : 'sin registros'}
        value={fmt(weightPts[weightPts.length - 1]?.value, { decimals: 1 })}
        unit="kg"
        color={metricColor('weight')}
        delta={<Delta value={weightWow?.delta} unit=" kg" lowerIsBetter />}
      >
        <Sparkline points={weightPts.slice(-10)} color={metricColor('weight')} />
      </StatWidget>
    ),

    rate: (
      <StatWidget
        title="Ritmo del peso"
        icon={Scale}
        timeframe="promedio semanal"
        value={rate === null ? '—' : `${rate > 0 ? '+' : ''}${rate}`}
        unit="kg"
        color={metricColor('rate')}
      />
    ),

    tonnage: (
      <StatWidget
        title="Tonelaje"
        icon={Dumbbell}
        timeframe={latestWeek ? `${unit} ${latestWeek}` : 'sin programa'}
        value={fmt(tonnagePts[tonnagePts.length - 1]?.value)}
        unit="kg"
        color={metricColor('tonnage')}
        delta={<Delta value={tonnageWow?.delta} percent={tonnageWow?.pct} />}
      >
        <Sparkline points={tonnagePts.slice(-10)} color={metricColor('tonnage')} bars />
      </StatWidget>
    ),

    sets: (
      <StatWidget
        title="Series efectivas"
        icon={Activity}
        timeframe={latestWeek ? `${unit} ${latestWeek}` : 'sin programa'}
        value={fmt(setsPts[setsPts.length - 1]?.value)}
        color={metricColor('sets')}
        delta={<Delta value={setsWow?.delta} />}
      >
        <Sparkline points={setsPts.slice(-10)} color={metricColor('sets')} bars />
      </StatWidget>
    ),

    kcals: (
      <StatWidget
        title="Kcal objetivo"
        icon={Flame}
        timeframe={
          macros.total > 0
            ? `P ${macros.pct.protein}% · C ${macros.pct.carbs}% · G ${macros.pct.fats}%`
            : 'sin plan'
        }
        value={fmt(plan?.targetKcals)}
        unit="kcal"
        color={metricColor('kcals')}
      >
        {macros.total > 0 && (
          <div className="macro-bar">
            {MACROS.map(({ key, color }) => (
              <div key={key} style={{ width: `${macros.pct[key]}%`, background: color }} />
            ))}
          </div>
        )}
      </StatWidget>
    ),

    adherence: (
      <StatWidget
        title="Adherencia"
        icon={Target}
        timeframe={adherence ? `${adherence.logged} de ${adherence.planned} series` : 'sin programa'}
        value={adherence ? adherence.pct : '—'}
        unit={adherence ? '%' : ''}
        /*
          Su color, no un semáforo. Aquí era verde por encima del 85 % y naranja
          por debajo, mientras la MISMA métrica salía en lima en la analítica: dos
          colores para una cosa, que es justo lo que la regla viene a cerrar.

          No se pierde nada al quitarlo: el umbral no era el dato, el dato es
          «12 de 20 series», y eso lo sigue diciendo la línea de debajo — con los
          dos números en vez de con un color que hay que traducir.
        */
        color={metricColor('adherence')}
      />
    ),

    // El check-in es lo único del panel sobre lo que hay que ACTUAR esta semana,
    // así que su cifra son los pesajes hechos y su meta, no el promedio.
    checkin: (
      <StatWidget
        title="Check-in de esta semana"
        icon={Scale}
        timeframe={
          checkIn.average !== null
            ? `promedio ${checkIn.average} kg`
            : 'sin pesajes esta semana'
        }
        value={`${checkIn.count}/${checkIn.target}`}
        /* Sin color: «4 de 3 pesajes» no es una serie de la que distinguirse, es
           un recuento. Iba en verde al completarse y en azul si no, o sea usando
           la tinta del peso para hablar de otra cosa. La píldora ya dice cómo va. */
        delta={<Delta value={checkIn.delta} unit=" kg" lowerIsBetter />}
      />
    ),

    photos: (
      <StatWidget
        title="Fotos de progreso"
        icon={Camera}
        timeframe={photos[0] ? `última el ${shortDate(photos[0].date)}` : 'ninguna todavía'}
        value={photos.length}
      />
    ),

    /*
      Sensaciones: la PRIMERA pregunta medible del protocolo, no un promedio de
      todas. Mezclar un RPE de 8 con un dolor de 1 en una sola cifra da un número
      que no significa nada — son escalas con direcciones opuestas—. La primera es
      la que el entrenador ha puesto arriba del todo, o sea la que le importa.

      `null` cuando no hay protocolo que pregunte o todavía no hay respuestas: el
      panel filtra los nodos nulos, así que el widget desaparece del catálogo en
      lugar de enseñar un hueco.
    */
    readiness: headline && (
      <StatWidget
        title={headline.short}
        icon={MessageSquare}
        timeframe={`${headline.count} ${headline.count === 1 ? 'sesión' : 'sesiones'} · sobre ${headline.max}`}
        value={headline.value}
        color={headline.color}
        delta={
          headline.neutral ? null : (
            <Delta value={headline.delta} lowerIsBetter={headline.lowerIsBetter} />
          )
        }
      >
        <Sparkline points={headline.points.slice(-10)} color={headline.color} />
      </StatWidget>
    ),
  };

  /*
    ══ La estructura, también para quien no entrena por semanas ═══════════════

    Esta tarjeta se escondía en cuanto el ciclo era rotativo —`cycleType !==
    'rotating'`—, y no había ninguna otra que la sustituyera: un cliente de «2
    entreno / 1 descanso» no podía ver su estructura en NINGUNA pantalla. Ni
    aquí, ni en su rutina, donde salen las sesiones en fila pero los descansos
    no aparecen por ningún lado. Su ciclo vivía solo en la cabeza del entrenador.

    Son dos formas porque son dos cosas distintas —siete casillas fijas contra
    un orden que se repite, ver `ui/CycleChain`—, pero es una sola tarjeta: para
    quien la mira es la misma pregunta, «¿qué toca y cuándo descanso?».
  */
  const rotativo = activeClient.cycleType === 'rotating';
  /* Las sesiones del ciclo EN CURSO, que es el que se está entrenando. Sin
     ellas la tarjeta no se pinta: `rotatingSlots` sabe caer a casillas
     genéricas para el entrenador que está montando el programa, pero al cliente
     no se le enseña un «Entreno → Entreno» sin nombres como si fuera lo suyo. */
  const diasDelCiclo = rotativo ? findMicrocycle(microcycles, latestWeek)?.days || [] : [];
  const cicloSlots = rotativo ? rotatingSlots(activeClient.cyclePattern, diasDelCiclo) : [];
  const hasSplit = Boolean(program && (rotativo ? diasDelCiclo.length > 0 : program.weeklySplit));

  /** Los gráficos, por identificador. `null` = no aplica a este cliente. */
  const cardNodes = {
    weightTrend: (
      <MetricCard
        title="Peso corporal"
        subtitle="Promedio de cada semana"
        value={fmt(weightPts[weightPts.length - 1]?.value, { decimals: 1 })}
        unit="kg"
        delta={<Delta value={weightWow?.delta} unit=" kg" lowerIsBetter />}
        foot={
          rate !== null
            ? `Tendencia de ${rate > 0 ? '+' : ''}${rate} kg por semana.`
            : 'Con dos o tres pesajes más se podrá leer la tendencia.'
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
          height={110}
          emptyMessage="Registra tu peso en «Peso y medidas» para ver la evolución."
        />
      </MetricCard>
    ),

    tonnageTrend: (
      <MetricCard
        title={`Tonelaje por ${unit.toLowerCase()}`}
        subtitle="Kilos totales levantados"
        value={fmt(tonnagePts[tonnagePts.length - 1]?.value)}
        unit="kg"
        delta={<Delta value={tonnageWow?.delta} percent={tonnageWow?.pct} />}
      >
        <BarBandChart
          bars={tonnage.map((t) => ({
            label: `${unit.charAt(0)}${t.week}`,
            value: t.tonnage,
            highlight: t.week === latestWeek,
          }))}
          color={metricColor('tonnage')}
          unit=" kg"
          height={128}
          emptyMessage="Sin series registradas todavía."
        />
      </MetricCard>
    ),

    // La misma franja que en la hoja de nutrición, para no tener dos lenguajes
    // distintos para el mismo dato.
    macros: (
      <MetricCard
        title="Reparto de macros"
        subtitle="Objetivo diario"
        value={fmt(plan?.targetKcals)}
        unit="kcal"
        foot={
          plan?.hasDayVariants
            ? 'Objetivo de los días de entreno. El de descanso está en «Nutrición».'
            : undefined
        }
      >
        {macros.total > 0 ? (
          <MacroBar
            protein={plan?.proteinGrams}
            carbs={plan?.carbsGrams}
            fats={plan?.fatsGrams}
            kcals={plan?.targetKcals ?? Math.round(macros.total)}
            size="sm"
            showTotal={false}
          />
        ) : (
          <p className="t-sm t-secondary">
            {isClient
              ? 'Tu entrenador todavía no ha definido tus macros.'
              : 'Sin macros definidos en la hoja de nutrición.'}
          </p>
        )}
      </MetricCard>
    ),

    split: !hasSplit ? null : rotativo ? (
      <MetricCard
        title={isClient ? 'Tu ciclo' : 'Estructura del ciclo'}
        subtitle="El orden que se repite"
        value={cicloSlots.filter((slot) => !slot.rest).length}
        unit="días de entreno"
        foot={
          isClient
            ? 'Tu programa no va por semanas: al terminar el ciclo, vuelve a empezar por el día 1.'
            : 'No va por semanas: al terminar el ciclo vuelve a empezar por el día 1.'
        }
      >
        <CycleChain slots={cicloSlots} />
      </MetricCard>
    ) : (
      <MetricCard
        title={isClient ? 'Tu estructura semanal' : 'Estructura semanal'}
        subtitle="Qué toca cada día"
        value={trainingDayCount(program.weeklySplit)}
        unit="días"
      >
        <div className="split-grid">
          {WEEK_DAYS.map((day) => {
            const value = program.weeklySplit[day] ?? 'Descanso';
            return (
              <div className="split-day" key={day}>
                <span className="name">{day.slice(0, 3)}</span>
                <span className={`value${isRestDay(value) ? '' : ' is-training'}`}>{value}</span>
              </div>
            );
          })}
        </div>
      </MetricCard>
    ),

    /*
      Una línea por pregunta de escala, semana a semana. Es la pieza que convierte
      «que el cliente cuente cómo va» en algo que se puede leer junto al resto: la
      fatiga y el tonelaje en el mismo panel y con el mismo eje.

      El eje sale de las propias respuestas (`feedbackLabels`) y no del panel: hay
      semanas en las que el cliente contesta y no se pesa, y con las etiquetas del
      panel esas respuestas se caerían del gráfico sin dejar rastro.
    */
    feedbackTrend:
      feedbackSeries.length > 0 ? (
        <MetricCard
          title="Cómo le ha ido"
          subtitle="Promedio de cada semana"
          value={feedbackSeries.length}
          unit={feedbackSeries.length === 1 ? 'pregunta' : 'preguntas'}
          foot={
            adherenceToFeedback
              ? `Contesta en ${adherenceToFeedback.pct} % de sus sesiones (${adherenceToFeedback.answered} de ${adherenceToFeedback.sessions}).`
              : undefined
          }
        >
          <BandChart
            labels={feedbackLabels(feedbackSeries)}
            series={feedbackSeries}
            height={132}
            showArea={false}
            emptyMessage="Todavía no ha contestado ninguna sesión."
          />
        </MetricCard>
      ) : null,

    volume: (
      <MetricCard
        title="Volumen por músculo"
        subtitle={latestWeek ? `${unit} ${latestWeek}` : 'sin programa'}
        value={volume.reduce((acc, [, count]) => acc + count, 0)}
        unit="series"
        foot={volume.length > 0 ? 'La marca roja señala el MRV estimado de cada grupo.' : undefined}
      >
        {volume.length === 0 ? (
          <p className="t-sm t-secondary">Sin series registradas en esta {unit.toLowerCase()}.</p>
        ) : (
          <MeterList
            items={volume.map(([name, count]) => ({
              label: name,
              value: count,
              pct: (count / maxVolume) * 100,
              color: muscleColor(name),
              markerPct: MRV_GOALS[name] ? (MRV_GOALS[name].mrv / maxVolume) * 100 : null,
              markerTitle: MRV_GOALS[name] ? `MRV: ${MRV_GOALS[name].mrv} series` : undefined,
            }))}
          />
        )}
      </MetricCard>
    ),
  };

  /** Filas de la lista agrupada. Solo entran las que tienen dato. */
  /*
    ══ La composición es fija, y es ésta ═════════════════════════════════════

    Hubo un «Personalizar»: cada entrenador recolocaba las piezas, y por tanto
    no existía UNA pantalla que pulir — la de cada uno era una que nadie había
    diseñado. Ahora la decidimos aquí, para todos, con una regla que ordena
    qué va arriba y qué va abajo: **una cifra se dice una vez, y grande solo si
    es el contenido**.

      · Arriba, cuatro cifras que NO tienen gráfica debajo: el check-in de la
        semana, la adherencia, las kcal objetivo (con su reparto) y, si el
        protocolo pregunta, cómo se ha sentido.
      · Debajo, las gráficas. El peso se pinta UNA vez: para el entrenador, la
        curva con los peldaños de lo que le fue poniendo (`ReviewChart`), que
        es la lectura completa; para el cliente, la curva sola. El tonelaje, la
        estructura, el volumen y cómo le ha ido, cada uno en la suya.
      · Después, sus fases (`RoadmapPanel`): su historia.

    Lo que se ha ido, y a dónde: las revisiones anteriores viven en la pestaña
    «Revisiones»; el archivo de fotos y las medidas, en el análisis y en el
    check-in; «Todas las métricas» repetía en lista lo que ya estaba en cifra.
    La preferencia guardada (`preferences.dashboard`) se conserva en la base de
    datos y no se lee: si algún día vuelve a hacer falta, no hay que migrar nada.
  */
  const cifras = ['checkin', 'adherence', 'kcals', 'readiness'].filter(
    (id) => widgetNodes[id] && piezaVisible(id)
  );
  const pesoEnTrack = audience === 'coach' && track.length > 1;
  const graficas = [
    !pesoEnTrack && 'weightTrend',
    'tonnageTrend',
    'split',
    'feedbackTrend',
    'volume',
  ].filter((id) => id && cardNodes[id] && piezaVisible(id));

  return (
    <div className="stack">
      <section className="col gap-3">
        {/*
          Para el entrenador, sin titular: la pestaña ya dice «Resumen» y la
          cabecera ya dice quién. Queda una línea de contexto y la puerta al
          análisis. El cliente conserva su «Tu resumen», que es su portada.
        */}
        {isClient ? (
          <Cabecera
            title="Tu resumen"
            sub={
              [activeClient.plan, activeClient.startDate && `desde ${shortDate(activeClient.startDate)}`]
                .filter(Boolean)
                .join(' · ') || 'Sin plan asignado'
            }
          />
        ) : (
          <Mando
            contexto={
              [activeClient.plan, activeClient.startDate && `desde ${shortDate(activeClient.startDate)}`]
                .filter(Boolean)
                .join(' · ') || 'Sin plan asignado'
            }
            acciones={
              <Link className="cab-accion is-principal" to={clientPath(activeClient.id, 'analitica')}>
                Análisis →
              </Link>
            }
          />
        )}

        {cifras.length > 0 && (
          <div className="grid-auto">
            {cifras.map((id) => (
              <div className="slot" key={id}>
                {widgetNodes[id]}
              </div>
            ))}
          </div>
        )}
      </section>

      <div ref={refAncho} style={{ minWidth: 0 }}>
        {pesoEnTrack && (
          <Panel
            title="Su peso y lo que le fuiste poniendo"
            sub="Cada peldaño de abajo es un ajuste tuyo. Lo de arriba es lo que pasó después."
            className="col gap-3"
          >
            {/* El medidor mide la columna; la tarjeta le quita su relleno a cada lado. */}
            <ReviewChart weeks={track} ancho={ancho - 44} soloLectura cambios={blockChanges(program)} />
          </Panel>
        )}
      </div>

      {graficas.length > 0 && (
        <section className="grid-slots">
          {graficas.map((id) => (
            <div className={`slot${id === 'feedbackTrend' ? ' is-wide' : ''}`} key={id}>
              {cardNodes[id]}
            </div>
          ))}
        </section>
      )}

      <RoadmapPanel audience={audience} />
    </div>
  );
};
