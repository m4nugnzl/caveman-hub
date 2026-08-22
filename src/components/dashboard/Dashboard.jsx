import { useMemo, useState } from 'react';
import {
  Activity,
  Camera,
  Dumbbell,
  Flame,
  MessageSquare,
  Percent,
  Ruler,
  Scale,
  Settings2,
  Target,
} from 'lucide-react';

import { useApp } from '@/context/AppContext';
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
import { fatPercent, reverseChronological, weeklyCheckIn, weeklyRateOfChange } from '@/domain/anthropometry';
import { clientProtocol, isServiceOn, scaleQuestions } from '@/domain/protocol';
import {
  buildFeedbackSeries,
  feedbackAdherence,
  feedbackLabels,
  questionStats,
} from '@/domain/readiness';
import {
  CARDS,
  WIDGETS,
  dashboardPrefs,
  defaultDashboardPrefs,
  isCustomized,
  layoutCards,
  movePref,
  pieceNeeds,
  toggleSpan,
  togglePref,
  widgetById,
} from '@/domain/preferences';
import { metricColor } from '@/domain/metrics';
import { shortDate, todayISO } from '@/lib/dates';
import { fmt } from '@/lib/num';
import { BandChart, BarBandChart, MeterList, Sparkline } from '@/components/ui/charts';
import { Delta, MetricCard, MetricList, StatWidget } from '@/components/ui/metrics';
import { CycleChain } from '@/components/ui/CycleChain';
import { GroupHead, Notice, PageHead, Panel, SaveIndicator } from '@/components/ui/primitives';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { MacroBar } from '@/components/nutrition/macros';
import { RoadmapPanel } from '@/components/roadmap/RoadmapPanel';
import { DashboardEditBar, DashboardTrays, SlotTools, cardMeta } from './DashboardEditor';

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
    updateClientPreferences,
    coachPrefs,
    updateCoachPreferences,
    applyDashboardToAll,
    saveStatus,
    retrySave,
  } = useApp();

  const [editing, setEditing] = useState(false);

  const program = workoutData[activeClient.id];
  const microcycles = useMemo(() => program?.microcycles || [], [program]);
  const anthro = anthropometry[activeClient.id];
  const history = useMemo(() => anthro?.history || [], [anthro]);
  const plan = nutrition[activeClient.id];
  const unit = unitLabel(activeClient.cycleType);
  const isClient = audience === 'client';
  /* Ver el comentario de la cabecera, más abajo. */
  const Cabecera = isClient ? GroupHead : PageHead;
  const confirm = useConfirm();
  const [aviso, setAviso] = useState(null);

  /*
    La ficha del cliente manda; si no dice nada, la plantilla del entrenador
    (migración 0035). El orden importa: un cambio en la plantilla no puede
    deshacer el panel que alguien ajustó a mano para Marta.

    Al cliente no se le aplica plantilla ninguna —la del entrenador es sobre CÓMO
    MIRA ÉL a su cartera, no sobre cómo quiere ver su propio panel quien entrena—.
  */
  const prefs = dashboardPrefs(
    activeClient.preferences,
    isClient ? null : coachPrefs?.dashboard || null
  );
  const savePrefs = (patch) => updateClientPreferences(activeClient.id, 'dashboard', patch);

  /** Convierte el panel de este cliente en el predeterminado para los nuevos. */
  const guardarPlantilla = async () => {
    const res = await updateCoachPreferences('dashboard', prefs);
    setAviso(
      res.ok
        ? { tone: 'success', text: 'Guardado. Tus clientes nuevos empezarán con este resumen.' }
        : { tone: 'error', text: `No se ha podido guardar: ${res.error}` }
    );
  };

  /** Y lo aplica a los que ya existen. Sustituye, así que se pregunta antes. */
  const aplicarATodos = async () => {
    const ok = await confirm({
      title: '¿Aplicar este resumen a todos?',
      message: 'Todos tus clientes activos pasarán a tener exactamente este resumen.',
      detail:
        'SUSTITUYE el de los que hubieras ajustado a mano, uno por uno. Los archivados no se tocan. No se puede deshacer.',
      confirmLabel: 'Aplicar a todos',
      tone: 'danger',
    });
    if (!ok) return;

    const res = await applyDashboardToAll(prefs);
    setAviso(
      res.ok
        ? {
            tone: 'success',
            text: `Aplicado a ${res.count} ${res.count === 1 ? 'cliente' : 'clientes'}.`,
          }
        : { tone: 'error', text: `No se ha podido aplicar: ${res.error}` }
    );
  };
  const prefsSave = saveStatus('preferences', activeClient.id);

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

  const logs = useMemo(() => reverseChronological(history), [history]);
  const lastLog = logs[0];
  const lastFatLog = useMemo(() => logs.find((h) => h.skinFolds), [logs]);
  const lastFat = lastFatLog ? fatPercent(lastFatLog.skinFolds, activeClient.gender) : null;

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
  const metricRows = [
    lastLog && {
      id: 'weight',
      label: 'Peso corporal',
      icon: Scale,
      color: metricColor('weight'),
      value: fmt(lastLog.weight, { decimals: 1, unit: ' kg' }),
      updated: shortDate(lastLog.date),
    },
    lastFat != null && {
      id: 'fat',
      label: '% graso',
      icon: Percent,
      color: metricColor('fat'),
      value: `${lastFat}%`,
      updated: shortDate(lastFatLog.date),
    },
    lastLog?.perimeters?.ombligo != null && {
      id: 'waist',
      label: 'Cintura',
      icon: Ruler,
      color: metricColor('waist'),
      value: `${lastLog.perimeters.ombligo} cm`,
      updated: shortDate(lastLog.date),
    },
    plan?.targetKcals && {
      id: 'kcals',
      label: 'Objetivo calórico',
      icon: Flame,
      color: metricColor('kcals'),
      value: `${plan.targetKcals} kcal`,
      sub:
        macros.total > 0
          ? `P ${macros.pct.protein}% · C ${macros.pct.carbs}% · G ${macros.pct.fats}%`
          : null,
      updated: 'Vigente',
    },
    latestWeek && {
      id: 'tonnage',
      label: 'Tonelaje',
      icon: Dumbbell,
      color: metricColor('tonnage'),
      value: `${tonnagePts[tonnagePts.length - 1]?.value ?? 0} kg`,
      updated: `${unit} ${latestWeek}`,
    },
    adherence && {
      id: 'adherence',
      label: 'Adherencia',
      icon: Target,
      color: metricColor('adherence'),
      value: `${adherence.pct}%`,
      sub: `${adherence.logged} de ${adherence.planned} series`,
      updated: `${unit} ${latestWeek}`,
    },
    {
      id: 'photos',
      label: 'Fotos de progreso',
      icon: Camera,
      value: photos.length,
      updated: photos[0] ? shortDate(photos[0].date) : '—',
    },
  ]
    .filter(Boolean)
    .filter((fila) => piezaVisible(fila.id));

  const visibleWidgets = prefs.widgets.filter((id) => widgetNodes[id] && piezaVisible(id));
  const cardLayout = layoutCards(
    prefs,
    prefs.cards.filter((id) => cardNodes[id] && piezaVisible(id))
  );

  /**
   * Un hueco del panel. Fuera del modo edición no añade nada más que su ancho;
   * dentro, envuelve la pieza con sus controles.
   *
   * Envolver siempre —en lugar de solo al editar— evita que las piezas se
   * remonten al entrar y salir del modo edición, que hacía que los gráficos se
   * volvieran a animar desde cero cada vez.
   */
  const Slot = ({ node, wide, tools }) => (
    <div className={`slot${wide ? ' is-wide' : ''}${editing ? ' is-editing' : ''}`}>
      {editing && tools}
      {node}
    </div>
  );

  return (
    <div className="stack">
      <section className="col gap-3">
        {/*
          Dos cabeceras distintas porque son dos cosas distintas.

          Para el ENTRENADOR esto es la pantalla entera —`/c/:id/resumen`— así que
          le toca la cabecera de pantalla. Y se titula «Progreso», que es como se
          llama la sección en el carril: ponía el NOMBRE del cliente, que ya está
          dos veces encima —en el selector y en la propia URL— y así ninguna de
          sus siete secciones decía en cuál estabas.

          Para el CLIENTE esto es una tanda de bloques dentro de su inicio, que ya
          se titula «Hola, X» (`ClientStart`). Dos cabeceras de pantalla seguidas
          eran, para un lector de pantalla, dos pantallas pegadas.
        */}
        <Cabecera
          title={isClient ? 'Tu resumen' : 'Progreso'}
          sub={
            [activeClient.plan, activeClient.startDate && `desde ${shortDate(activeClient.startDate)}`]
              .filter(Boolean)
              .join(' · ') || 'Sin plan asignado'
          }
          action={
          <div className="row gap-3 wrap">
            {/* Guardar las preferencias puede fallar (falta la función 0008, o RLS
                no lo permite). Sin este indicador el fallo sería invisible: los
                cambios se ven en pantalla porque el estado local ya cambió. */}
            <SaveIndicator
              status={prefsSave.status}
              error={prefsSave.error}
              onRetry={() => retrySave('preferences', activeClient.id)}
            />

            {!editing && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>
                <Settings2 size={14} />
                Personalizar
                {isCustomized(activeClient.preferences) && (
                  <span className="badge badge-info">a medida</span>
                )}
              </button>
            )}
          </div>
          }
        />

        {/* El resultado de las dos acciones de plantilla. Sin esto, «Aplicar a
            todos» no daría ninguna señal de haber hecho nada: los cambios están
            en OTROS clientes, no en el que se está mirando. */}
        {aviso && <Notice tone={aviso.tone}>{aviso.text}</Notice>}

        {/*
          Lo que ha cambiado, lo que le falta, sus revisiones y lo que le dejó su
          entrenador vivían aquí y se han ido a «Hoy», que es su pantalla de
          entrada. Estaban en esta por un motivo malo —era la primera que se
          abría— y convertían el resumen en dos cosas: un panel de cifras y un
          tablón de avisos. Aquí se queda lo que esta pantalla sabe hacer.
        */}

        {editing && (
          <DashboardEditBar
            prefs={prefs}
            audience={audience}
            onApplyPreset={(preset) => savePrefs(preset)}
            onToggleMetricList={() => savePrefs({ showMetricList: !prefs.showMetricList })}
            onReset={() => savePrefs(defaultDashboardPrefs())}
            onDone={() => setEditing(false)}
            onSaveAsDefault={isClient ? null : guardarPlantilla}
            onApplyToAll={isClient ? null : aplicarATodos}
          />
        )}

        {visibleWidgets.length > 0 && (
          <div className="grid-auto">
            {visibleWidgets.map((id, index) => (
              <Slot
                key={id}
                node={widgetNodes[id]}
                tools={
                  <SlotTools
                    label={widgetById(id)?.label || id}
                    index={index}
                    total={visibleWidgets.length}
                    onMove={(dir) => savePrefs({ widgets: movePref(prefs.widgets, id, dir) })}
                    onHide={() => savePrefs({ widgets: togglePref(prefs.widgets, id, WIDGETS) })}
                  />
                }
              />
            ))}
          </div>
        )}
      </section>

      {cardLayout.length > 0 && (
        <section className="grid-slots">
          {cardLayout.map(({ id, span }, index) => {
            const meta = cardMeta(prefs, id);
            return (
              <Slot
                key={id}
                node={cardNodes[id]}
                wide={span === 'full'}
                tools={
                  <SlotTools
                    label={meta.label}
                    index={index}
                    total={cardLayout.length}
                    /* El ancho que se muestra en el control es el ELEGIDO, no el
                       calculado: si una tarjeta está estirada solo porque se ha
                       quedado sin pareja, el botón debe seguir diciendo qué pasa
                       al pulsarlo. */
                    span={meta.span}
                    onMove={(dir) => savePrefs({ cards: movePref(prefs.cards, id, dir) })}
                    onToggleSpan={
                      meta.fixed ? null : () => savePrefs({ spans: toggleSpan(prefs.spans, id) })
                    }
                    onHide={() => savePrefs({ cards: togglePref(prefs.cards, id, CARDS) })}
                  />
                }
              />
            );
          })}
        </section>
      )}

      {editing && (
        <DashboardTrays
          prefs={prefs}
          onAddWidget={(id) => savePrefs({ widgets: togglePref(prefs.widgets, id, WIDGETS) })}
          onAddCard={(id) => savePrefs({ cards: togglePref(prefs.cards, id, CARDS) })}
          visible={piezaVisible}
        />
      )}

      {!editing && visibleWidgets.length === 0 && cardLayout.length === 0 && (
        <Panel className="col gap-2">
          <span className="section-title">Has escondido todo el resumen</span>
          <p className="t-sm t-secondary">Pulsa «Personalizar» para volver a elegir qué quieres ver.</p>
        </Panel>
      )}

      {/*
        El roadmap va aquí, debajo del tablero, y NO como un widget más.

        Es la única cosa fija que se añade al resumen, y la razón es que el tablero
        es configurable: un widget desactivado por defecto no lo activa nadie
        —hay que entrar en «Personalizar», encontrarlo en la bandeja y sacarlo—, y
        uno activado por defecto le ocuparía sitio a todo el mundo, incluidos los
        que no planifican por fases.

        Debajo no le quita el puesto a nada y se encuentra solo. Cuando el cliente
        no tiene fases, es un bloque vacío que explica para qué sirve; en cuanto
        las tiene, es lo que contesta «¿y ahora qué toca?».
      */}
      <RoadmapPanel audience={audience} />

      {/* Lo que le dejó el entrenador —entregables del alta y revisiones— y lo
          que ha cambiado esta semana viven ahora en «Hoy», que es su pantalla de
          entrada. Aquí se queda lo que esta pantalla sabe hacer: sus cifras. */}

      {prefs.showMetricList && (
        <MetricList
          title="Todas las métricas"
          count={metricRows.length}
          rows={metricRows}
          emptyMessage="Aún no hay ninguna métrica registrada."
        />
      )}

      <p className="t-sm t-tertiary">
        {isClient
          ? 'En «Análisis», aquí arriba, tienes la evolución de tus calorías y macros, la progresión de cada ejercicio y tus perímetros.'
          : 'En «Análisis», aquí arriba, está la lectura de la semana, la evolución nutricional, el volumen por músculo y la progresión ejercicio a ejercicio.'}
      </p>

    </div>
  );
};
