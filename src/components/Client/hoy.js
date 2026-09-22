import { blockOfWeek, resolvedMicrocycles, structureOfBlock } from '@/domain/blocks';
import { scaleQuestions } from '@/domain/protocol';
import { allSessions, allSessionsOfDay, historialDeEjercicio, isSetLogged, sessionSetCount } from '@/domain/sessions';
import { WEEK_DAYS } from '@/domain/training';
import { toNum } from '@/lib/num';
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
      corto: inicial(dia),
      estado: !entrada ? 'libre' : entrada.logged > 0 ? 'hecho' : 'toca',
      hoy: dia === hoy,
    };
  });
};

/**
 * LA TIRA SIN REPARTO: la semana del calendario y los días que entrenaste.
 *
 * Cuando `tiraDeLaSemana` se calla —ciclo rotativo o semana sin días
 * asignados— la portada del teléfono (frame `327:8`) seguía sin su fila de
 * siete discos, y es la primera cosa del dibujo. Lo que sí se sabe sin reparto
 * es lo que ya pasó: qué días de esta semana tienen una sesión apuntada. Eso se
 * dice; lo que TOCA no, porque no hay de dónde sacarlo. Por eso aquí no hay
 * `toca`: un día sin sesión es `libre`, sea pasado o futuro.
 *
 * @returns `[{ dia, corto, estado: 'hecho'|'libre', hoy }]`, siempre siete.
 */
export const tiraPorFechas = ({ micros = [], ahora = new Date() }) => {
  const lunes = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() - ((ahora.getDay() + 6) % 7));
  const entrenados = new Set(
    allSessions(micros)
      .filter((s) => sessionSetCount(s) > 0)
      .map((s) => String(s.date || s.endedAt || s.startedAt || '').slice(0, 10))
  );
  const hoyISO = isoLocal(ahora);
  return WEEK_DAYS.map((dia, i) => {
    const fecha = isoLocal(new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() + i));
    return { dia, corto: inicial(dia), estado: entrenados.has(fecha) ? 'hecho' : 'libre', hoy: fecha === hoyISO };
  });
};

/** La inicial del día como se escribe en España: el miércoles es la X. */
const inicial = (dia) => (dia === 'Miércoles' ? 'X' : dia.charAt(0));

/**
 * LA PRÓXIMA SESIÓN DEL MICROCICLO ABIERTO: la primera que tiene series
 * pautadas y no está terminada. Es la regla de la caja «Próxima sesión» de
 * Entreno; la portada la usa cuando no hay una sesión de HOY que ofrecer
 * (sin reparto por días o con ciclo rotativo), para que el bloque «Tu entreno»
 * no desaparezca.
 *
 * ── En el orden de la secuencia, y cada aparición ──────────────────────────
 * Con `microciclo` (la secuencia del bloque, ver `microcicloDeLaSemana`) se
 * recorre día a día: una hoja que cae el lunes y el jueves son dos sesiones, y
 * la segunda toca aunque la primera esté hecha. La i-ésima sesión de la hoja,
 * por fecha, cubre su i-ésima aparición; la última aparición se queda con la
 * mejor de las que sobran, que es lo que se hacía con una sola. Las hojas que
 * no caen en ningún día van detrás, una vez cada una. Sin `microciclo`, el
 * orden de las hojas.
 *
 * @returns `{ dayName, day, hechas, series, weekNumber }` o `null` si todo está hecho.
 */
export const proximaDelMicrociclo = (micros = [], microciclo = null) => {
  const micro = micros[micros.length - 1];
  if (!micro) return null;
  const dias = micro.days || [];

  const enLaSecuencia = (microciclo?.dias || [])
    .filter((d) => !d.descanso && d.hoja && dias.some((day) => day.dayName === d.hoja))
    .map((d) => d.hoja);
  const orden = [...enLaSecuencia, ...dias.map((d) => d.dayName).filter((n) => !enLaSecuencia.includes(n))];
  const veces = (dayName) => Math.max(1, enLaSecuencia.filter((n) => n === dayName).length);
  const vistas = new Map();

  for (const dayName of orden) {
    const i = vistas.get(dayName) || 0;
    vistas.set(dayName, i + 1);

    const day = dias.find((d) => d.dayName === dayName);
    const series = (day.exercises || []).reduce((n, ex) => n + (ex.sets?.length || 0), 0);
    if (series === 0) continue;

    const sesiones = porFecha(allSessionsOfDay(micro, dayName));
    const suyas = i < veces(dayName) - 1 ? sesiones.slice(i, i + 1) : sesiones.slice(i);
    const hechas = suyas.length > 0 ? Math.max(...suyas.map(sessionSetCount)) : 0;
    if (hechas < series) return { dayName, day, hechas, series, weekNumber: micro.weekNumber };
  }
  return null;
};

/** Las sesiones de más antigua a más nueva. */
const porFecha = (sesiones) =>
  [...sesiones].sort((a, b) =>
    String(a.date || a.startedAt || '').localeCompare(String(b.date || b.startedAt || ''))
  );

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

/**
 * CÓMO LO LLEVAS: las respuestas de escala de la última sesión que las tenga.
 *
 * Solo preguntas de escala —una barra no puede dibujar un sí/no ni una zona del
 * cuerpo— y solo las que ESTE protocolo pregunta. Sin respuestas no hay bloque:
 * una barra vacía diría «0».
 *
 * Vivía dentro de `ClientSesionRoute` para el costado del monitor; desde el 18
 * sep la lee también la portada del teléfono («Sensaciones»), y dos copias del
 * mismo recorrido acaban contando cosas distintas.
 *
 * @returns `[{ id, rotulo, corto, valor, max, tono, cuando }]`, como mucho cuatro.
 *   `cuando` es la fecha de esa sesión: la portada no puede llamar «de hoy» a
 *   lo que se contestó el martes.
 */
export const sensacionesRecientes = (micros, protocolo) => {
  const escalas = scaleQuestions(protocolo);
  if (escalas.length === 0) return [];
  const sesiones = allSessions(micros);
  for (let i = sesiones.length - 1; i >= 0; i -= 1) {
    const feedback = sesiones[i].feedback || {};
    const filas = escalas
      .map((q) => {
        const valor = toNum(feedback[q.id]);
        if (valor === null) return null;
        const max = q.max ?? 10;
        return {
          id: q.id,
          rotulo: q.label,
          corto: q.short || q.label,
          valor,
          max,
          tono: tonoDeEscala(valor, max, q),
          cuando: sesiones[i].date || null,
        };
      })
      .filter(Boolean);
    if (filas.length > 0) return filas.slice(0, 4);
  }
  return [];
};

/**
 * EL JUICIO DE UNA RESPUESTA DE ESCALA, para el color de su barrita: es el
 * semáforo de la casa («el semáforo juzga»), y aquí sí hay de qué juzgar porque
 * la pregunta dice hacia dónde es mejor (`lowerIsBetter`). La fatiga y el dolor
 * no lo llevan escrito en los protocolos viejos y se leen como en
 * `PanelEntreno`: menos es mejor.
 *
 * @returns {'bien'|'medio'|'mal'}
 */
const tonoDeEscala = (valor, max, q) => {
  const menosEsMejor = q.lowerIsBetter ?? (q.id === 'fatigue' || q.id === 'pain');
  const parte = max > 0 ? Math.min(1, Math.max(0, valor / max)) : 0;
  const bueno = menosEsMejor ? 1 - parte : parte;
  return bueno >= 0.7 ? 'bien' : bueno > 0.4 ? 'medio' : 'mal';
};

/**
 * LO ÚLTIMO QUE HAS HECHO: tus entrenos, tus pesajes, tus fotos y tus entregas,
 * del más reciente al más antiguo.
 *
 * Es el «Lo último» de la portada del teléfono (frame `327:8`). Del lado del
 * entrenador existe el mismo hilo para toda la cartera (`domain/today`); aquí
 * es uno solo y en segunda persona, y cada cosa dice cuándo con la precisión
 * que de verdad tiene: la sesión guarda la hora (`endedAt`), el pesaje y la
 * foto solo el día. Un «hace 5 h» sobre un pesaje sería inventado.
 *
 * @returns `[{ id, texto, cuando, hoy }]`, como mucho `cuantos`.
 */
export const loUltimo = ({
  micros = [],
  historial = [],
  fotos = [],
  entrega = null,
  sinPeso = false,
  ahora = new Date(),
  cuantos = 3,
}) => {
  const out = [];

  for (const s of allSessions(micros)) {
    if (sessionSetCount(s) === 0) continue;
    const momento = s.endedAt || s.startedAt || null;
    out.push({
      id: `sesion:${s.id || s.date}:${s.dayName}`,
      texto: `Entrenamiento ${s.dayName || ''} registrado`.replace(/\s+/g, ' '),
      fecha: momento ? momento.slice(0, 10) : s.date,
      momento,
    });
  }

  if (!sinPeso) {
    for (const log of historial) {
      if (log.weight === null || log.weight === undefined || log.weight === '') continue;
      out.push({ id: `peso:${log.date}`, texto: 'Peso corporal actualizado', fecha: log.date, momento: null });
    }
  }

  const fotosPorDia = new Map();
  for (const f of fotos) {
    const dia = String(f.date || '').slice(0, 10);
    if (dia) fotosPorDia.set(dia, (fotosPorDia.get(dia) || 0) + 1);
  }
  for (const [dia, n] of fotosPorDia) {
    out.push({
      id: `fotos:${dia}`,
      texto: `${n} ${n === 1 ? 'foto de progreso añadida' : 'fotos de progreso añadidas'}`,
      fecha: dia,
      momento: null,
    });
  }

  if (entrega?.reviewedAt) {
    out.push({
      id: `revisada:${entrega.id}`,
      texto: 'Tu entrenador revisó tu semana',
      fecha: entrega.reviewedAt.slice(0, 10),
      momento: entrega.reviewedAt,
    });
  }
  if (entrega?.submittedAt) {
    out.push({
      id: `entregada:${entrega.id}`,
      texto: 'Semana entregada',
      fecha: entrega.submittedAt.slice(0, 10),
      momento: entrega.submittedAt,
    });
  }

  const hoyISO = isoLocal(ahora);
  return out
    .filter((e) => e.fecha)
    .sort((a, b) => {
      const fa = a.momento || `${a.fecha}T00:00:00`;
      const fb = b.momento || `${b.fecha}T00:00:00`;
      return fb.localeCompare(fa);
    })
    .slice(0, cuantos)
    .map((e) => ({
      id: e.id,
      texto: e.texto,
      cuando: haceCuanto(e, ahora),
      hoy: e.fecha === hoyISO,
    }));
};

const isoLocal = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** «Hace 2 h», «Hoy», «Ayer», «Hace 3 días» o la fecha: la precisión que hay. */
const haceCuanto = ({ fecha, momento }, ahora) => {
  if (momento) {
    const min = Math.round((ahora - new Date(momento)) / 60000);
    if (min >= 0 && min < 60) return min <= 1 ? 'Ahora' : `Hace ${min} min`;
    if (min >= 60 && min < 12 * 60) return `Hace ${Math.round(min / 60)} h`;
  }
  const dias = Math.round(
    (new Date(`${isoLocal(ahora)}T12:00:00`) - new Date(`${fecha}T12:00:00`)) / 86400000
  );
  if (dias <= 0) return 'Hoy';
  if (dias === 1) return 'Ayer';
  if (dias < 7) return `Hace ${dias} días`;
  return new Date(`${fecha}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
};
