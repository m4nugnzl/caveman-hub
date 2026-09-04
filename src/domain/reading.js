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

import { localeNumber } from '@/lib/dates';
import { round } from '@/lib/num';
import { linearTrend, metricPoints, weekAdherence } from './analytics';
import { RATE_VERDICTS, directionById, rateVerdict, targetRateKg } from './goals';
import { effectiveGoal } from './roadmap';
import { exerciseNames, exerciseProgression, findMicrocycle } from './training';
import { executedSessions, sessionSetCount } from './sessions';
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
/**
 * LA FUERZA, EJERCICIO A EJERCICIO.
 *
 * ══ Por qué hace falta la lista y no solo el recuento ══════════════════════
 *
 * «La fuerza sube en 4 de 6 ejercicios» contesta si el plan funciona en general,
 * y es lo que necesita la lectura. Lo que necesita un entrenador para DECIDIR es
 * la otra mitad: en cuáles sube y en cuáles no. Un press que se estanca mientras
 * todo lo demás progresa no es un problema del déficit — es ese ejercicio.
 *
 * Esa lista ya se calculaba aquí dentro y se tiraba al salir: el bucle recorría
 * cada ejercicio, sacaba su pendiente y solo se quedaba con el nombre en un
 * montón. Ahora sale entera y `strengthTrend` la resume, que es el orden
 * correcto — el recuento se deduce de la lista, la lista no se deduce del
 * recuento.
 *
 * ── El umbral, y por qué no es cero ─────────────────────────────────────────
 * Medio por ciento del 1RM por semana. Por debajo de eso es la misma carga con
 * una repetición de diferencia, y llamar «progresión» a eso llenaría la lista de
 * flechas verdes que no significan nada.
 *
 * ── En orden alfabético, no por pendiente ───────────────────────────────────
 * Ordenar es de quien pinta: la lectura los cita en el orden en que aparecen y
 * el panel los ordena por lo que sube más. Devolverlos ya ordenados aquí
 * obligaría a las dos a compartir un criterio que no comparten.
 */
export const strengthByExercise = (microcycles, minPoints = 3) =>
  exerciseNames(microcycles)
    .map((name) => {
      const points = exerciseProgression(microcycles, name)
        .map((row) => ({ label: row.label, value: row.e1rm }))
        .filter((p) => p.value !== null && p.value !== undefined);
      if (points.length < minPoints) return null;

      const trend = linearTrend(points);
      if (!trend) return null;

      const threshold = Math.max(0.5, Math.abs(trend.from) * 0.005);
      const first = points[0].value;
      const last = points[points.length - 1].value;

      return {
        name,
        weeks: points.length,
        first,
        e1rm: last,
        delta: round(last - first, 1),
        perWeek: trend.perWeek,
        dir: trend.perWeek > threshold ? 'up' : trend.perWeek < -threshold ? 'down' : 'flat',
      };
    })
    .filter(Boolean);

export const strengthTrend = (microcycles, minPoints = 3) => {
  const filas = strengthByExercise(microcycles, minPoints);
  if (filas.length === 0) return null;

  const rising = filas.filter((f) => f.dir === 'up').map((f) => f.name);
  const falling = filas.filter((f) => f.dir === 'down').map((f) => f.name);

  return {
    tracked: filas.length,
    up: rising.length,
    down: falling.length,
    flat: filas.length - rising.length - falling.length,
    rising,
    falling,
  };
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
      /* ── Una línea, y ya ────────────────────────────────────────────────
         Estos `detail` se escribieron para una lista de hallazgos —«Lectura de
         la semana», que ya no existe— y el único sitio donde se pintan es el
         hero de «Cómo va», en una columna de unos 300 px al lado de la curva.
         Ahí, dos frases son cinco renglones de prosa en la tarjeta que manda.

         Lo que se recorta es siempre lo mismo: el consejo (esta app no receta),
         y lo que el título de al lado ya dice. Queda el POR QUÉ, que es lo único
         que el número no cuenta solo. Regla para los que vengan: una frase, y
         que quepa en dos renglones estrechos. */
      detail: 'Sin dirección declarada, ninguna cifra se lee como buena o mala.',
    });
  } else if (!trend.ok) {
    findings.push({
      id: 'no-trend',
      tone: 'unknown',
      evidence: 'direction',
      /* El título envolvía en dos renglones y el primero de ellos no decía nada
         («Faltan semanas para hablar de…»). El titular es que todavía no hay
         tendencia; el conteo, entre paréntesis, dice cuánto falta. */
      title: `Aún no hay tendencia (${trend.weeks} de ${trend.needed} semanas)`,
      detail: 'Lo que se mueve en menos de cuatro semanas es sobre todo agua.',
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
        title: `${meta.label}: ${trend.perWeek > 0 ? '+' : ''}${localeNumber(trend.perWeek)} kg/semana`,
        detail:
          direction.sign === 0
            ? `Objetivo: mantener, ±${localeNumber(verdict.tolerance)} kg/semana. Media de ${trend.weeks} semanas.`
            : `Objetivo: ${target > 0 ? '+' : ''}${localeNumber(target)} kg/semana (${goal.ratePct} % del peso). Media de ${trend.weeks} semanas.`,
      });
    }

    // ── 2. Señal o ruido ──────────────────────────────────────────────────
    if (trend.weak) {
      findings.push({
        id: 'noisy',
        tone: 'unknown',
        evidence: 'direction',
        title: `La tendencia es poco fiable (r² ${trend.r2})`,
        detail: 'Los pesajes están muy dispersos: con una semana más, la pendiente puede cambiar bastante.',
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

/**
 * SEÑALES DE LA SEMANA: los hechos que cualifican al veredicto, en una tira.
 *
 * ══ Señales, no recetas ═════════════════════════════════════════════════════
 *
 * El veredicto dice «fuera de rumbo» y se queda ahí; los hechos que lo rodean
 * —cuántas semanas lleva así, qué escala se ha disparado, qué parte del plan no
 * está tocando— había que pescarlos por tres bloques. Aquí se juntan los que la
 * aplicación ya sabe, y NINGUNO dice qué hacer con él: la misma doctrina que
 * `weeklyReading` («la decisión es de quien cobra por tomarla»).
 *
 * Tres como mucho, y solo cuando los hay: una tira de señales que siempre está
 * llena deja de ser una tira de señales.
 *
 *   1. LA RACHA — semanas seguidas moviéndose contra el objetivo declarado. Se
 *      juzga (semáforo) porque el objetivo lo puso el entrenador: la señal solo
 *      dice que lleva N semanas pasando.
 *   2. LO QUE NO ENTRENA — una hoja del plan sin ejecutar dos o más semanas.
 *   3. LA ESCALA QUE SALTA — una respuesta que se movió dos o más puntos de
 *      golpe. Sin color: la app no sabe si más hambre es mala noticia o señal
 *      de que el déficit por fin muerde. Lo sabe quien la lee.
 *
 * @param goal        `effectiveGoal(...)` — o null, y la racha calla.
 * @param series      `buildWeeklySeries` — de donde salen los pesos semanales.
 * @param tendencia   `answerTrend(...)` — las escalas con su delta.
 * @param microcycles los microciclos del programa.
 * @param semana      la semana de programa que se está revisando.
 */
export const weekSignals = ({
  goal = null,
  series = [],
  tendencia = [],
  microcycles = [],
  semana = null,
} = {}) => {
  const out = [];

  // ── 1 · La racha contra el rumbo ─────────────────────────────────────────
  const sign = goal ? directionById(goal.direction)?.sign : null;
  if (sign) {
    const pesos = metricPoints(series, 'weight').map((p) => p.value);
    let racha = 0;
    for (let i = pesos.length - 1; i > 0; i -= 1) {
      const delta = pesos[i] - pesos[i - 1];
      /* Contra el objetivo es moverse en el sentido CONTRARIO al declarado; una
         semana plana corta la racha sin abrir otra. */
      if (delta * sign < 0) racha += 1;
      else break;
    }
    if (racha >= 2) {
      out.push({
        id: 'racha',
        tone: racha >= 3 ? 'bad' : 'warn',
        text: `${racha} semanas seguidas ${sign < 0 ? 'subiendo' : 'bajando'} de peso`,
      });
    }
  }

  // ── 2 · La hoja que no entrena ───────────────────────────────────────────
  const micro = Number.isFinite(semana) ? findMicrocycle(microcycles, semana) : null;
  for (const day of micro?.days || []) {
    let sinEntrenar = 0;
    for (let w = semana; w >= 1; w -= 1) {
      const m = findMicrocycle(microcycles, w);
      /* Una semana donde esa hoja no existía no cuenta ni corta: no se le puede
         reprochar no entrenar lo que no estaba en el plan. */
      if (!m || !(m.days || []).some((d) => d.dayName === day.dayName)) continue;
      const hecho = executedSessions(m).some(
        (s) => s.dayName === day.dayName && sessionSetCount(s) > 0
      );
      if (hecho) break;
      sinEntrenar += 1;
    }
    if (sinEntrenar >= 2) {
      out.push({
        id: `sin-entrenar-${day.dayName}`,
        tone: 'warn',
        text: `${sinEntrenar} semanas sin entrenar ${day.dayName}`,
      });
    }
  }

  // ── 3 · La escala que salta ──────────────────────────────────────────────
  for (const fila of tendencia) {
    if (fila.delta !== null && Math.abs(fila.delta) >= 2) {
      out.push({
        id: `escala-${fila.id}`,
        tone: 'unknown',
        text: `${fila.label} ${fila.value}/${fila.max}, ${fila.delta > 0 ? '+' : '−'}${Math.abs(fila.delta)} esta semana`,
      });
    }
  }

  /* Las más graves delante, y nunca más de tres: la cuarta señal ya no señala. */
  return out.sort((a, b) => TONE_RANK[a.tone] - TONE_RANK[b.tone]).slice(0, 3);
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
