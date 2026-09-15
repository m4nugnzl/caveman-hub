import { blockOfWeek, resolvedMicrocycles, structureOfBlock } from '@/domain/blocks';
import { historialDeEjercicio, isSetLogged } from '@/domain/sessions';
import { WEEK_DAYS } from '@/domain/training';
import { buildStrip } from './hojas';

/**
 * QUÉ TE TOCA HOY, en una lectura que sirve para los dos aparatos.
 *
 * ══ Por qué sale del componente ════════════════════════════════════════════
 *
 * Vivía dentro de un `useMemo` de `LoQueTocaHoy`, que es la lista del monitor.
 * Desde que el portal monta piezas distintas en cada aparato (ver
 * `ClientLayout`), la misma pregunta la hacen tres sitios —la lista del monitor,
 * la tarjeta del teléfono y la tesela de «Hoy te toca»— y tres lecturas del
 * mismo hecho acaban diciendo cosas distintas el día que una cambie.
 *
 * ── El entreno no existe para un ciclo rotativo ────────────────────────────
 * Porque «hoy» ahí no significa nada: en un «2 entreno / 1 descanso» el día de
 * la semana no dice qué toca —lo dice por dónde vas—, y `buildStrip` solo marca
 * `isToday` en el reparto semanal. Inventarlo sería anunciar una sesión que a lo
 * mejor no es la que sigue.
 *
 * @returns `{ descanso: true }`, la entrada de la tira de hoy, o `null` si no se
 *   puede saber —sin programa, sin reparto o con ciclo rotativo—.
 */
export const sesionDeHoy = ({ client, program }) => {
  const entries = entradasDeLaSemana({ client, program });
  if (!entries) return null;
  return entries.find((e) => e.isToday) || { descanso: true };
};

/**
 * Las sesiones de la semana en curso, con su día — o `null` si «esta semana» no
 * se puede decir. Es la lectura que comparten `sesionDeHoy` y
 * `tiraDeLaSemana`: las dos tienen que callarse en los mismos casos.
 */
const entradasDeLaSemana = ({ client, program }) => {
  const cycleType = client?.cycleType || 'weekly';
  if (cycleType !== 'weekly') return null;

  const conPlan = program ? { ...program, microcycles: resolvedMicrocycles(program) } : null;
  const micros = conPlan?.microcycles || [];
  /* El microciclo ABIERTO, que es el único donde «hoy» significa algo: en uno de
     hace dos meses, el martes de esta semana no es su martes. */
  const micro = micros[micros.length - 1];
  if (!micro) return null;

  const split = structureOfBlock(conPlan, blockOfWeek(conPlan, micro.weekNumber))?.weeklySplit || {};
  /* Sin reparto por días no se sabe ni qué toca ni que se descansa, así que no
     se dice nada. Es la primera semana de casi todo el mundo, antes de que su
     entrenador asigne los días. */
  if (Object.values(split).every((v) => !String(v ?? '').trim())) return null;

  return buildStrip({
    days: micro.days || [],
    weeklySplit: split,
    cycleType,
    microcycle: micro,
    pattern: client?.cyclePattern,
  }).entries;
};

/**
 * LA TIRA DE LA SEMANA: siete días, y qué es cada uno.
 *
 * Es la fila de la portada del prototipo (`docs/la-sesion-manda.md`, pantalla
 * 1): de un vistazo, qué llevas hecho esta semana y qué te queda, sin entrar en
 * la rutina.
 *
 *   · `hecho` — tiene algo anotado.
 *   · `toca`  — lleva sesión y aún no la has hecho.
 *   · `libre` — no lleva sesión: es un descanso del reparto, no un día perdido.
 *
 * Y `hoy` va aparte, porque hoy puede estar hecho o no.
 *
 * Se calla —`null`— en los mismos casos que `sesionDeHoy`: ciclo rotativo o
 * semana sin reparto. Siete casillas inventadas son peor que ninguna.
 *
 * @returns {null | { dia: string, corto: string, estado: 'hecho'|'toca'|'libre', hoy: boolean }[]}
 */
export const tiraDeLaSemana = ({ client, program, hoy = diaDeHoy() }) => {
  const entries = entradasDeLaSemana({ client, program });
  if (!entries) return null;

  return WEEK_DAYS.map((dia) => {
    const entrada = entries.find((e) => e.key === dia);
    return {
      dia,
      corto: dia.slice(0, 3).toUpperCase(),
      estado: !entrada ? 'libre' : entrada.logged > 0 ? 'hecho' : 'toca',
      hoy: dia === hoy,
    };
  });
};

/** Lunes = 0, igual que `hojas.js`. */
const diaDeHoy = () => WEEK_DAYS[(new Date().getDay() + 6) % 7];

/**
 * TU MARCA EN UN EJERCICIO: la cifra de la última vez.
 *
 * ══ Qué ocupa el sitio de la miniatura ═════════════════════════════════════
 *
 * Esto. Donde Hevy, Strong, Coachway y Efort ponen la foto del ejercicio, el
 * renglón del teléfono lleva lo que TÚ levantaste. La razón está medida en
 * `docs/estudio-la-app-del-cliente.md`: `catalog_exercises` no tiene columna de
 * vídeo, así que de los 246 ejercicios de la demo solo TRES podrían llevar
 * miniatura. Una columna con el 1,2 % cubierto es peor que no tener fotos.
 *
 * ── La serie que representa un día es la MÁS PESADA ────────────────────────
 * No la primera ni la última. Un día de press banca son 82,5×8, 82,5×8 y 75×10
 * al fallo, y la que alguien recuerda como «lo que hice» es la de más peso. A
 * igualdad de peso manda la de más repeticiones. Es el mismo criterio con el que
 * `registroDeEjercicios` ordena el cajón: dos maneras de elegir la serie del día
 * darían dos cifras distintas para el mismo día en dos pantallas seguidas.
 *
 * ── Aquí se devolvía también una línea, y se cayó el 14 sep ───────────────
 * Eran los kilos de las ocho últimas sesiones, para la chispa de 46 px que el
 * renglón del teléfono llevaba al lado de la cifra. El dueño la tumbó al verla
 * montada, y el argumento de fondo es que en 46 px normalizados al propio tramo
 * una subida de 2,5 kg y una de 40 dibujan la misma cuesta. Ver `movil/Piezas`.
 *
 * @param {import('@/types').Microcycle[]} microcycles
 * @param {string} nombre
 * @returns `{ marca: '100 × 8' | null }`
 */
export const marcaDeEjercicio = (microcycles, nombre) => {
  const historial = historialDeEjercicio(microcycles, nombre);
  if (historial.length === 0) return { marca: null };

  const mejorDelDia = (dia) => {
    let mejor = null;
    for (const set of dia.sets || []) {
      const kg = Number(set.kg) || 0;
      const reps = Number(set.reps) || 0;
      if (!mejor || kg > mejor.kg || (kg === mejor.kg && reps > mejor.reps)) mejor = { kg, reps };
    }
    return mejor;
  };

  const dias = historial.map(mejorDelDia).filter(Boolean);
  if (dias.length === 0) return { marca: null };

  const ultima = dias[0];
  return {
    /* Sin kilos es peso corporal: se dice el número de repeticiones y no
       «0 × 11», que se leería como que no levantó nada. */
    marca: ultima.kg > 0 ? `${formatea(ultima.kg)} × ${ultima.reps}` : `${ultima.reps} reps`,
  };
};

/** Sin decimales cuando es entero; con coma cuando no. Los discos son de 2,5. */
const formatea = (n) => (Number.isInteger(n) ? String(n) : String(n).replace('.', ','));

/**
 * Los ejercicios de una sesión, con la marca de cada uno.
 *
 * Los ejercicios y sus series salen del PLAN —es lo que te toca hacer— y lo
 * ANOTADO sale de la sesión, que es otra cosa. Contar `isSetLogged` sobre las
 * series del plan da el número equivocado: la pauta lleva sus repeticiones
 * escritas, así que TODAS las series parecían hechas y la regla de la portada
 * salía llena sin haber entrenado nada.
 *
 * @param entries   Los ejercicios del plan de ese día.
 * @param anotadas  Los `entries` de la sesión ejecutada, si la hay.
 */
export const ejerciciosConMarca = (microcycles, entries, anotadas = []) =>
  (entries || []).map((entry, i) => {
    const series = entry.sets || [];
    const { marca } = marcaDeEjercicio(microcycles, entry.name);
    /* Por nombre y no por id: el de la entrada de la sesión es el del ejercicio
       que había el día que se empezó, y el plan puede haberse reescrito. */
    const suya = (anotadas || []).find((e) => e.name === entry.name);
    return {
      id: `${entry.name}#${i}`,
      nombre: entry.name,
      pauta: pautaDe(entry),
      series: series.length,
      hechas: (suya?.sets || []).filter(isSetLogged).length,
      marca,
      entry,
    };
  });

/** «4 × 6-8»: cuántas series y qué repeticiones te pide. */
export const pautaDe = (entry) => {
  const series = (entry?.sets || []).length;
  const reps = (entry?.sets || [])
    .map((s) => String(s.targetReps ?? s.reps ?? '').trim())
    .find(Boolean);
  if (!series) return null;
  return reps ? `${series} × ${reps}` : `${series} series`;
};
