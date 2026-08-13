/**
 * El objetivo declarado del cliente.
 *
 * ══ Por qué esto es lo que le faltaba a la analítica ═══════════════════════
 *
 * La analítica dibujaba diez gráficos correctos y no podía concluir NADA, porque
 * en todo el modelo de datos no había un solo campo que dijese qué se pretende.
 *
 * Sin eso, «peso: −0,4 kg esta semana» es un hecho sin lectura posible. ¿Bien? Si
 * el cliente está definiendo, bien. Si está en superávit buscando masa, es el
 * síntoma de que no está comiendo. Si está manteniendo, es ruido. El mismo número,
 * tres conclusiones opuestas — y la pantalla no tenía forma de elegir una, así que
 * se limitaba a enseñar la línea y dejarle la interpretación al entrenador. Diez
 * veces, una por gráfico.
 *
 * Un objetivo es lo que convierte un dato en un juicio. Con él, «−0,4 kg/semana
 * sobre un objetivo de −0,5» pasa a ser «va en rumbo», y eso ya es una frase.
 *
 * ── Dónde se guarda, y por qué no hace falta migración ──────────────────────
 * En `clients.preferences`, el jsonb abierto que ya se escribe con la función
 * `set_client_preferences` (migración 0008). Encaja por dos motivos: es una
 * decisión del entrenador sobre ese cliente, y la aplicación ya sabe ignorar lo
 * que no conoce y rellenar lo que falta.
 *
 * ── Por qué el ritmo se expresa en % del peso corporal ──────────────────────
 * «0,5 kg por semana» significa cosas muy distintas en alguien de 55 kg y en
 * alguien de 110: para el primero es el 0,9 % semanal —agresivo, con riesgo de
 * perder músculo— y para el segundo el 0,45 %, cómodo. El porcentaje es lo que se
 * puede comparar entre clientes y lo que aguanta que el cliente cambie de peso a
 * lo largo del proceso, que es justo lo que va a pasar.
 *
 * Se guarda el porcentaje y se muestran los kg, que es como piensa el entrenador.
 */

import { round, toNum } from '@/lib/num';

/**
 * Las tres direcciones posibles, con ritmos por defecto que salen de lo que se
 * usa en la práctica:
 *
 *   · Déficit: 0,5–1 % semanal. Más rápido y se empieza a perder músculo.
 *   · Superávit: 0,25 % semanal. El límite de masa que se puede construir por
 *     semana es bajo; ir más rápido es engordar, no crecer.
 *   · Mantenimiento: la banda de ±0,25 % es lo que se puede considerar «estable»,
 *     porque por debajo de eso no se distingue del ruido de agua y glucógeno.
 */
/*
  `color` acompaña a cada dirección por la misma razón que en `EVENT_KINDS`
  (`domain/calendar.js`): el roadmap dibuja una fila por fase y hace falta
  distinguirlas de un vistazo, sin leer. Se eligen tres tonos NEUTROS a propósito
  —nada de verde y rojo—: un volumen no es peor que una definición, y pintarlo
  con el color de una alarma diría lo contrario.
*/
export const GOAL_DIRECTIONS = [
  {
    id: 'cut',
    label: 'Definición',
    short: 'Bajar',
    sign: -1,
    defaultRate: 0.6,
    color: 'var(--data-teal)',
    hint: 'Bajar peso conservando masa muscular',
  },
  {
    id: 'maintain',
    label: 'Mantenimiento',
    short: 'Mantener',
    sign: 0,
    defaultRate: 0,
    color: 'var(--data-slate)',
    hint: 'Peso estable: recomposición, fuerza o descanso de dieta',
  },
  {
    id: 'bulk',
    label: 'Volumen',
    short: 'Subir',
    sign: 1,
    defaultRate: 0.25,
    color: 'var(--data-amber)',
    hint: 'Subir peso despacio para ganar masa sin exceso de grasa',
  },
];

export const directionById = (id) => GOAL_DIRECTIONS.find((d) => d.id === id) || null;

/** Ancho de la banda de «estable», en % semanal. Ver arriba. */
export const NOISE_BAND_PCT = 0.25;

/**
 * El objetivo de un cliente, saneado.
 *
 * Devuelve `null` cuando no hay ninguno declarado, y eso es información: la
 * pantalla debe pedirlo, no inventárselo. Un objetivo por defecto silencioso sería
 * peor que ninguno — juzgaría al cliente contra algo que nadie ha decidido.
 */
export const clientGoal = (client) => {
  const raw = client?.preferences?.goal;
  const direction = directionById(raw?.direction);
  if (!direction) return null;

  const rate = toNum(raw?.ratePct);
  return {
    direction: direction.id,
    // Se acota para que un valor absurdo guardado a mano no llegue a la lectura
    // como si fuera un objetivo legítimo.
    ratePct: direction.sign === 0 ? 0 : Math.min(2, Math.abs(rate ?? direction.defaultRate)),
    note: typeof raw?.note === 'string' ? raw.note : '',
  };
};

/** Objetivo listo para guardar a partir de una dirección elegida. */
export const goalFromDirection = (id) => {
  const direction = directionById(id);
  if (!direction) return null;
  return { direction: direction.id, ratePct: direction.defaultRate, note: '' };
};

/**
 * El objetivo traducido a kg por semana, que es la unidad en la que se piensa.
 *
 * `weight` es el peso actual: sin él no se puede convertir un porcentaje a kilos y
 * se devuelve `null` en vez de un número inventado.
 */
export const targetRateKg = (goal, weight) => {
  const kg = toNum(weight);
  if (!goal || kg === null || kg <= 0) return null;
  const direction = directionById(goal.direction);
  if (!direction || direction.sign === 0) return 0;
  return round(direction.sign * (goal.ratePct / 100) * kg, 2);
};

/**
 * Compara el ritmo REAL con el objetivo y devuelve un veredicto.
 *
 * ── Los tres desenlaces que importan, y por qué se separan ──────────────────
 *   · `on_track`  — va al ritmo pedido, con su margen.
 *   · `slow`      — se mueve en la dirección correcta pero por debajo del ritmo.
 *   · `stalled`   — no se mueve, y debería.
 *   · `reversed`  — se mueve en la dirección CONTRARIA. Es el único que exige
 *                   actuar ya, y por eso no se mezcla con `slow`: perder 0,1 kg
 *                   cuando querías perder 0,6 es lentitud; ganar 0,3 es otra cosa.
 *   · `too_fast`  — va más rápido de lo pedido. Suele sonar bien y no lo es: en
 *                   déficit significa que se está perdiendo músculo, y en superávit
 *                   que se está ganando grasa.
 *
 * El margen es de la mitad del ritmo objetivo, con un mínimo del ancho de ruido:
 * exigir clavar el ritmo exacto convertiría cualquier semana normal en una alarma.
 */
export const rateVerdict = ({ goal, actualKg, weight }) => {
  const target = targetRateKg(goal, weight);
  if (target === null || actualKg === null || actualKg === undefined) return null;

  const kg = toNum(weight) || 0;
  const noiseKg = round((NOISE_BAND_PCT / 100) * kg, 2);
  const direction = directionById(goal.direction);

  // Mantenimiento tiene su propia lectura: no hay ritmo que alcanzar, solo una
  // banda de la que no salirse. Medirlo con «lento» o «rápido» no diría nada.
  if (direction.sign === 0) {
    return {
      state: Math.abs(actualKg) <= noiseKg ? 'on_track' : 'reversed',
      target: 0,
      actual: actualKg,
      tolerance: noiseKg,
    };
  }

  /*
    El margen es relativo AL OBJETIVO, no a la banda de ruido.
    ------------------------------------------------------------------------
    Medirlo contra la banda de ruido daba un resultado absurdo en cuanto el
    objetivo era pequeño: un volumen de 0,25 % semanal sobre 80 kg son 0,2 kg, que
    es exactamente el ancho de esa banda. Resultado: un cliente subiendo
    justo a 0,2 kg por semana —clavando el objetivo— se leía como «estancado».
    Y le pasaba a TODO volumen lento, que es como se hacen bien.

    El error de fondo era comparar una PENDIENTE de ocho semanas con el ruido de
    UNA medición. La pendiente promedia ese ruido; su incertidumbre es mucho menor.
    Lo que dice si la pendiente es de fiar es r², y eso se cuenta aparte.

    Así que el margen es la mitad del ritmo pedido, con un suelo de 0,05 kg para
    que un objetivo minúsculo no deje un margen de cero.
  */
  const signed = actualKg * direction.sign; // positivo = va hacia donde toca
  const wanted = Math.abs(target);
  const tolerance = Math.max(wanted / 2, 0.05);

  let state;
  // Primero lo bueno: si está dentro del margen del objetivo, ya está dicho. Que
  // esta comprobación fuera la última era lo que permitía que otra rama la
  // adelantara.
  if (Math.abs(signed - wanted) <= tolerance) state = 'on_track';
  else if (signed > wanted) state = 'too_fast';
  else if (signed < -tolerance) state = 'reversed';
  // Apenas se mueve EN RELACIÓN a lo que se pedía: un cuarto del ritmo o menos.
  else if (signed <= wanted * 0.25) state = 'stalled';
  else state = 'slow';

  return { state, target, actual: actualKg, tolerance: round(tolerance, 2), noise: noiseKg };
};

/** Cómo se cuenta cada veredicto: texto y gravedad. */
export const RATE_VERDICTS = {
  on_track: { label: 'En rumbo', tone: 'good' },
  slow: { label: 'Por debajo del ritmo', tone: 'warn' },
  stalled: { label: 'Estancado', tone: 'warn' },
  too_fast: { label: 'Demasiado rápido', tone: 'warn' },
  reversed: { label: 'En dirección contraria', tone: 'bad' },
};
