import { useMemo } from 'react';

import { useApp } from '@/context/AppContext';
import { buildWeeklySeries } from '@/domain/analytics';
import { currentCheckInPeriod } from '@/domain/calendar';
import { groupByWeek } from '@/domain/photos';
import { planSnapshot, reviewableWeeks } from '@/domain/reviews';
import { nutritionTrack, reviewTimeline } from '@/domain/timeline';
import { todayISO } from '@/lib/dates';

/**
 * LA HISTORIA DE UN CLIENTE, SEMANA A SEMANA: su peso y lo que le pusiste.
 *
 * ══ Qué es exactamente ══════════════════════════════════════════════════════
 *
 * Una fila por semana de programa desde su alta, con su peso medio y las
 * calorías que tenía puestas ESA semana. Es lo que dibuja la gráfica de dos
 * bandas: la curva del peso encima y la escalera de las calorías debajo,
 * compartiendo eje.
 *
 * Y esa gráfica es, de todo el producto, lo que mejor contesta la pregunta de un
 * entrenador de culturismo: **¿están funcionando mis ajustes?** Cada peldaño de
 * la escalera es una decisión tuya y lo que hay encima es lo que pasó después.
 * No se planifica por bloques cerrados: se monta una rutina y una dieta y se van
 * ajustando, así que el hilo que une las semanas es la cadena de ajustes.
 *
 * ══ Por qué es un gancho y no cinco `useMemo` en cada pantalla ══════════════
 *
 * Porque componerla son CINCO pasos encadenados —las semanas revisables, la
 * serie de peso, la línea de tiempo, la foto del plan de hoy y el cruce de las
 * dos fuentes de calorías— y cada uno con su regla. Vivían dentro de
 * `Coach/WeekReview.jsx`, que es la única pantalla que los tenía; el día que
 * «Progreso» quiso la misma gráfica, las opciones eran copiarlos o subirlos.
 *
 * Copiarlos es como este proyecto se ha ganado sus duplicaciones: dos cadenas
 * que empiezan iguales y divergen a la tercera corrección, sin que nada avise —
 * ya pasó con `rutasDe`, con la cabecera de bloque y con la voz de las cifras.
 *
 * ══ Lo que NO hace ══════════════════════════════════════════════════════════
 *
 * No elige semana ni guarda nada. Devuelve la historia; quién la señala y para
 * qué es de cada pantalla: la revisión la usa como mando y «Progreso» solo la
 * mira (`soloLectura` en `ReviewChart`).
 *
 * Las revisiones se le pasan de fuera —`rows` de `useReviewRows`— porque son una
 * consulta, y quién y cuándo la lanza es decisión de la pantalla que la monta.
 */
export const useReviewTrack = (revisiones = []) => {
  const { activeClient, workoutData, anthropometry, progressPhotos, checkIns, nutrition } = useApp();

  const clientId = activeClient?.id;
  const startDate = activeClient?.startDate;

  const microcycles = useMemo(
    () => workoutData[clientId]?.microcycles || [],
    [workoutData, clientId]
  );
  const history = useMemo(() => anthropometry[clientId]?.history || [], [anthropometry, clientId]);

  const porSemana = useMemo(
    () => groupByWeek(progressPhotos.filter((p) => p.clientId === clientId), startDate),
    [progressPhotos, clientId, startDate]
  );

  const periodo = useMemo(
    () => currentCheckInPeriod(activeClient?.preferences, startDate, todayISO()),
    [activeClient?.preferences, startDate]
  );

  const semanas = useMemo(
    () =>
      reviewableWeeks({
        programmed: microcycles.map((m) => m.weekNumber),
        startDate,
        submitted: checkIns[clientId],
        period: periodo,
      }),
    [microcycles, startDate, clientId, checkIns, periodo]
  );

  const serie = useMemo(
    () => buildWeeklySeries({ microcycles, history, gender: activeClient?.gender }),
    [microcycles, history, activeClient?.gender]
  );

  const linea = useMemo(
    () =>
      reviewTimeline({
        weeks: semanas,
        startDate,
        series: serie,
        reviews: revisiones,
        photoGroups: porSemana,
      }),
    [semanas, startDate, serie, revisiones, porSemana]
  );

  /* La foto del plan tal y como está AHORA: es lo que rellena las semanas que
     aún no tienen revisión, y la misma que usa la barra de decisión para el
     diff. Dos formas de leer el plan acabarían discrepando. */
  const planDeHoy = useMemo(
    () => planSnapshot({ nutrition: nutrition[clientId], program: workoutData[clientId] }),
    [nutrition, workoutData, clientId]
  );

  const track = useMemo(
    () => nutritionTrack({ rows: linea, reviews: revisiones, plan: planDeHoy }),
    [linea, revisiones, planDeHoy]
  );

  return track;
};
