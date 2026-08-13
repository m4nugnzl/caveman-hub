/**
 * La lectura de la semana: lo que la analítica debería decir antes de dibujar.
 *
 * ══ El problema que resuelve ═══════════════════════════════════════════════
 *
 * La pantalla de analítica eran diez gráficos correctos, agrupados en tres
 * secciones —nutrición, composición, entrenamiento— que son la forma del MODELO DE
 * DATOS, no la forma de la pregunta.
 *
 * Un entrenador no abre la analítica para ver diez gráficos. La abre con una
 * pregunta —«¿esto está funcionando?»— y con diez gráficos delante tiene que
 * hacer él la síntesis: mirar el peso, acordarse de qué se pretendía, estimar si la
 * bajada es real o es agua, comprobar si el cliente ha registrado algo, mirar si la
 * fuerza sube, y sacar una conclusión. Cada semana. Para cada cliente. Con veinte
 * clientes son doscientas síntesis mentales que la aplicación tiene todos los datos
 * para hacer y no hacía.
 *
 * Este módulo las hace. Devuelve FRASES con gravedad, y los gráficos pasan a ser lo
 * que siempre debieron ser: la prueba de cada frase, para quien quiera comprobarla.
 *
 * ══ Las cuatro preguntas, en este orden ════════════════════════════════════
 *
 *   1. ¿Va hacia donde se pretendía?      → tendencia contra objetivo
 *   2. ¿Es señal o es ruido?              → r² y número de semanas
 *   3. ¿Ha hecho el cliente su parte?     → adherencia (pesajes y series)
 *   4. ¿Progresa la fuerza?               → 1RM estimado
 *
 * El orden importa. La 1 es la pregunta; la 2 dice si la respuesta a la 1 vale
 * algo; la 3 dice si el problema es del plan o de la ejecución —distinción que
 * decide qué se hace después, porque cambiar el plan de alguien que no lo ha
 * seguido es cambiar a ciegas—; y la 4 es lo que evita la conclusión fácil y falsa
 * de «el peso no baja, recorta calorías» cuando la fuerza está subiendo.
 *
 * ══ Nada de esto es un consejo ═════════════════════════════════════════════
 *
 * Las frases describen lo que hay; no dicen qué hacer. «Estancado y la adherencia
 * es del 40 %» es un hecho. «Bájale 200 kcal» sería una prescripción, y eso es el
 * criterio del entrenador con un cliente que conoce y del que sabe cosas que no
 * están en la base de datos. La aplicación pone los hechos en la mesa; la decisión
 * es de quien cobra por tomarla.
 */

import { round } from '@/lib/num';
import { linearTrend, metricPoints, weekAdherence } from './analytics';
import { RATE_VERDICTS, directionById, rateVerdict, targetRateKg } from './goals';
import { effectiveGoal } from './roadmap';
import { exerciseNames, exerciseProgression } from './training';
import { weekEntries } from './anthropometry';

/**
 * Semanas mínimas para hablar de tendencia.
 *
 * Con dos puntos siempre sale una recta perfecta que no significa nada, y con tres
 * el ruido de agua manda sobre la señal. Cuatro es el mínimo con el que la pendiente
 * empieza a decir algo del proceso y no de la última cena.
 */
export const MIN_TREND_WEEKS = 4;

/**
 * Los cuatro grupos de evidencia, que son las cuatro preguntas.
 *
 * ── Por qué esto y no «nutrición / composición / entrenamiento» ─────────────
 * Esos tres eran la forma del MODELO DE DATOS: las tablas que hay en la base de
 * datos. Y llevaban a la pantalla que había —diez gráficos ordenados por de dónde
 * salen los datos, no por para qué se miran—.
 *
 * Cada grupo de aquí responde una pregunta, y cada hallazgo de la lectura apunta
 * al grupo que lo demuestra. Eso convierte la lectura en el ÍNDICE de la página:
 * lees la conclusión, pulsas, y tienes delante exactamente los gráficos que la
 * sostienen. Sin eso, «estancado» y la prueba de que está estancado están en dos
 * sitios que el usuario tiene que relacionar de memoria.
 */
export const EVIDENCE_GROUPS = [
  {
    id: 'direction',
    label: 'Dirección',
    question: '¿Va hacia donde se pretendía?',
  },
  {
    id: 'execution',
    label: 'Ejecución',
    question: '¿Ha hecho el cliente su parte?',
  },
  /*
    La quinta pregunta, y la única que no sale de los números que genera la
    aplicación sino de lo que el cliente CUENTA.

    Va después de «ejecución» a propósito: las dos hablan de él y no del plan, y
    en ese orden se leen juntas. «Ha hecho el 95 % de sus series» y «lleva tres
    semanas con la fatiga en 9» es una conclusión distinta de cada una por
    separado.

    Solo aparece si el protocolo del cliente pregunta algo (ver `domain/protocol.js`):
    un entrenador que no pregunta nada no debería tener una pestaña vacía.
  */
  {
    id: 'feel',
    label: 'Sensaciones',
    question: '¿Cómo lo está llevando?',
  },
  {
    id: 'performance',
    label: 'Rendimiento',
    question: '¿Mejora la fuerza y el volumen?',
  },
  {
    id: 'diet',
    label: 'Dieta',
    question: '¿Qué se le ha puesto de comer?',
  },
];

/** Por debajo de este r² la recta existe pero no explica los datos. */
export const WEAK_FIT = 0.4;

const pct = (a, b) => (b === 0 ? null : round((a / b) * 100));

/**
 * Tendencia del peso en kg por semana, sobre las últimas semanas con dato.
 *
 * ── Por qué esto y no la variación semana contra semana ─────────────────────
 * La pantalla usaba `weekOverWeek`: la diferencia entre las dos últimas semanas con
 * dato. Es el peor estimador posible para el peso corporal, porque el ruido diario
 * de agua y glucógeno es de ±1 kg y con dos puntos el ruido ENTRA ENTERO en el
 * resultado. Una semana con más sal o menos fibra bastaba para que la cifra
 * cambiara de signo, y con ella la conclusión.
 *
 * La regresión sobre varias semanas reparte ese ruido entre todos los puntos, y
 * además devuelve r²: cuánto de lo que se ve explica realmente la recta. Con r²
 * bajo la tendencia no se afirma, se advierte — que es lo honesto y lo que
 * `weekOverWeek` no podía hacer.
 */
export const weightTrend = (series, windowWeeks = 8) => {
  const points = metricPoints(series, 'weight');
  if (points.length < MIN_TREND_WEEKS) {
    return { ok: false, weeks: points.length, needed: MIN_TREND_WEEKS };
  }

  const window = points.slice(-windowWeeks);
  const trend = linearTrend(window);
  if (!trend) return { ok: false, weeks: window.length, needed: MIN_TREND_WEEKS };

  return {
    ok: true,
    weeks: window.length,
    perWeek: trend.perWeek,
    r2: trend.r2,
    from: trend.from,
    to: trend.to,
    weak: trend.r2 < WEAK_FIT,
  };
};

/**
 * Adherencia al registro de peso: cuántos días se ha pesado esta semana.
 *
 * El objetivo por defecto son 3 pesajes, que es el mínimo con el que un promedio
 * semanal filtra algo. Con uno solo, el «promedio» es ese único día y arrastra todo
 * su ruido a la tendencia.
 */
export const weighInAdherence = (history, date, target = 3) => {
  // `weekEntries` ya descarta los registros sin peso.
  const done = weekEntries(history, date).length;
  return { done, target, pct: pct(Math.min(done, target), target) };
};

/**
 * ¿Sube la fuerza? Cuenta en cuántos ejercicios ha mejorado el 1RM estimado.
 *
 * ── Por qué el 1RM estimado y no los kilos ──────────────────────────────────
 * Los kilos solos no comparan nada: 100×3 y 100×10 son el mismo peso y esfuerzos
 * distintos. El 1RM estimado (Epley) mete las repeticiones en la cuenta, así que
 * detecta la mejora aunque el cliente haya cambiado de rango.
 *
 * ── Por qué contar ejercicios y no promediar ────────────────────────────────
 * Promediar los 1RM de sentadilla y curl de bíceps da un número sin significado
 * físico. «Sube en 4 de 6 ejercicios» sí lo tiene, y además dice algo el reparto:
 * subir en todos es progreso general; subir en uno y bajar en cinco es una
 * casualidad en ese uno.
 */
export const strengthTrend = (microcycles, minPoints = 3) => {
  const names = exerciseNames(microcycles);
  let up = 0;
  let down = 0;
  let flat = 0;
  const rising = [];
  const falling = [];

  for (const name of names) {
    const points = exerciseProgression(microcycles, name)
      .map((row) => ({ label: row.label, value: row.e1rm }))
      .filter((p) => p.value !== null && p.value !== undefined);
    if (points.length < minPoints) continue;

    const trend = linearTrend(points);
    if (!trend) continue;

    // Umbral del 0,5 % del 1RM por semana: por debajo de eso es la misma carga con
    // una repetición de diferencia, no una progresión.
    const threshold = Math.max(0.5, Math.abs(trend.from) * 0.005);
    if (trend.perWeek > threshold) {
      up += 1;
      rising.push(name);
    } else if (trend.perWeek < -threshold) {
      down += 1;
      falling.push(name);
    } else {
      flat += 1;
    }
  }

  const tracked = up + down + flat;
  if (tracked === 0) return null;
  return { tracked, up, down, flat, rising, falling };
};

/**
 * La lectura completa: una lista de hallazgos ordenados por gravedad.
 *
 * Cada hallazgo lleva `tone` para que la pantalla no tenga que decidir si algo es
 * grave — esa decisión es de dominio y se prueba sola.
 */
export const weeklyReading = ({
  client,
  series,
  microcycles = [],
  history = [],
  today,
  latestWeek = null,
  phases = [],
}) => {
  const findings = [];
  /*
    El objetivo sale de la FASE que cubre el día leído, y solo si no hay ninguna se
    cae al `preferences.goal` de siempre (ver `domain/roadmap.js`).

    Este cambio de una línea es lo que evita el error más caro de esta pantalla: el
    día que alguien pasa de definición a volumen, medirle contra el objetivo viejo
    convierte «subir de peso, que es lo que toca» en «va en dirección contraria».
    Una alarma falsa en la única pantalla que existe para dar veredictos.

    `phases` por defecto vacío: quien no use el roadmap —y quien llame desde
    `portfolio.js`— obtiene exactamente el comportamiento anterior.
  */
  const goal = effectiveGoal(client, phases, today);
  const trend = weightTrend(series);
  const lastWeight = metricPoints(series, 'weight').slice(-1)[0]?.value ?? null;

  // ── 1. Dirección ─────────────────────────────────────────────────────────
  if (!goal) {
    /*
      El primer hallazgo cuando falta el objetivo no es un dato: es que no se puede
      juzgar nada. Decirlo es más útil que enseñar una tendencia sin referencia, y
      es lo único que desbloquea todo lo demás.
    */
    findings.push({
      id: 'no-goal',
      tone: 'unknown',
      evidence: 'direction',
      title: 'No hay un objetivo declarado',
      detail:
        'Sin saber si se busca bajar, subir o mantener, ninguna cifra de esta pantalla se puede leer como buena o mala. Es lo primero que conviene fijar.',
    });
  } else if (!trend.ok) {
    findings.push({
      id: 'no-trend',
      tone: 'unknown',
      evidence: 'direction',
      title: `Faltan semanas para hablar de tendencia (${trend.weeks} de ${trend.needed})`,
      detail:
        'Con menos de cuatro semanas de pesajes, la variación que se ve es sobre todo agua y glucógeno. La dirección real aparece a partir de la cuarta.',
    });
  } else {
    const verdict = rateVerdict({ goal, actualKg: trend.perWeek, weight: lastWeight });
    const meta = verdict ? RATE_VERDICTS[verdict.state] : null;
    const target = targetRateKg(goal, lastWeight);
    const direction = directionById(goal.direction);

    if (verdict && meta) {
      findings.push({
        id: 'rate',
        tone: meta.tone,
        evidence: 'direction',
        title: `${meta.label}: ${trend.perWeek > 0 ? '+' : ''}${trend.perWeek} kg/semana`,
        detail:
          direction.sign === 0
            ? `El objetivo es mantener el peso, con un margen de ±${verdict.tolerance} kg por semana. Media de las últimas ${trend.weeks} semanas.`
            : `Objetivo: ${target > 0 ? '+' : ''}${target} kg/semana (${goal.ratePct} % del peso corporal). Media de las últimas ${trend.weeks} semanas.`,
      });
    }

    // ── 2. Señal o ruido ──────────────────────────────────────────────────
    if (trend.weak) {
      findings.push({
        id: 'noisy',
        tone: 'unknown',
        evidence: 'direction',
        title: `La tendencia es poco fiable (r² ${trend.r2})`,
        detail:
          'Los pesajes están muy dispersos alrededor de la recta, así que la pendiente puede cambiar bastante con una semana más. Pesarse más días de la semana, siempre en las mismas condiciones, es lo que la estabiliza.',
      });
    }
  }

  // ── 3. ¿Ha hecho su parte? ───────────────────────────────────────────────
  const weighIns = weighInAdherence(history, today);
  if (weighIns.done < weighIns.target) {
    findings.push({
      id: 'weigh-ins',
      evidence: 'execution',
      tone: weighIns.done === 0 ? 'bad' : 'warn',
      title:
        weighIns.done === 0
          ? 'No se ha pesado esta semana'
          : `Solo ${weighIns.done} de ${weighIns.target} pesajes esta semana`,
      detail:
        'El promedio semanal es lo que filtra el ruido diario. Con menos de tres pesajes, ese promedio arrastra la variación de un día concreto a la tendencia.',
    });
  }

  const sets = latestWeek ? weekAdherence(microcycles, latestWeek) : null;
  if (sets && sets.pct < 100) {
    findings.push({
      id: 'sets',
      evidence: 'execution',
      tone: sets.pct < 50 ? 'bad' : 'warn',
      title: `${sets.pct} % de las series registradas (${sets.logged} de ${sets.planned})`,
      detail:
        sets.pct < 50
          ? 'Con la mitad de las series sin registrar no se puede saber si el plan funciona: lo que falla puede ser el plan o puede ser que no se esté haciendo. Conviene resolver esto antes de cambiar nada.'
          : 'Quedan series sin anotar. El volumen y el tonelaje de esta semana salen más bajos de lo que realmente se ha entrenado.',
    });
  } else if (sets && sets.pct === 100) {
    findings.push({
      id: 'sets-ok',
      tone: 'good',
      evidence: 'execution',
      title: 'Todas las series de la última semana están registradas',
      detail: `${sets.logged} de ${sets.planned}. Los números de entrenamiento de esta semana son completos.`,
    });
  }

  // ── 4. Fuerza ────────────────────────────────────────────────────────────
  const strength = strengthTrend(microcycles);
  if (strength) {
    const majority = strength.up > strength.down;
    findings.push({
      id: 'strength',
      evidence: 'performance',
      tone: majority ? 'good' : strength.down > strength.up ? 'warn' : 'unknown',
      title: `La fuerza sube en ${strength.up} de ${strength.tracked} ejercicios`,
      detail: majority
        ? `1RM estimado al alza en ${strength.rising.slice(0, 3).join(', ')}${strength.rising.length > 3 ? '…' : ''}. Con la fuerza subiendo, un peso que no baja no es motivo para recortar calorías.`
        : strength.down > strength.up
          ? `Baja en ${strength.falling.slice(0, 3).join(', ')}${strength.falling.length > 3 ? '…' : ''}. Perder fuerza suele ser la primera señal de que el déficit es demasiado agresivo o de que falta descanso.`
          : 'Ni sube ni baja de forma clara. Se necesitan más semanas registradas para ver la dirección.',
    });
  }

  return findings;
};

/** Orden de gravedad, para poner delante lo que hay que mirar. */
const TONE_RANK = { bad: 0, warn: 1, unknown: 2, good: 3 };

export const sortedReading = (findings) =>
  [...findings].sort((a, b) => TONE_RANK[a.tone] - TONE_RANK[b.tone]);

/**
 * El titular: una sola frase para la cabecera y para la cartera.
 *
 * Es lo que permite que el tablero de clientes diga «en rumbo» o «estancado» sin
 * reimplementar nada, en lugar de enseñar una cifra suelta que cada quien
 * interpreta.
 */
export const readingHeadline = (findings) => {
  const rate = findings.find((f) => f.id === 'rate');
  if (rate) return { text: rate.title, tone: rate.tone };

  const worst = sortedReading(findings)[0];
  return worst ? { text: worst.title, tone: worst.tone } : null;
};
