/**
 * LAS AUTOMATIZACIONES: lo que le pasa a un cliente sin que tú lo mandes.
 *
 * ══ La frase ═══════════════════════════════════════════════════════════════
 *
 * **Una automatización es una cosa que le pasa sola: un disparador y unos pasos
 * con su desfase.** Vive DENTRO de un protocolo y no lleva audiencia propia: a
 * quién le pasa lo contesta el protocolo puesto. Meterle audiencia sería el
 * tercer sitio donde decir a quién, y lo transversal —«esto, a estos cinco,
 * hoy»— ya tiene su herramienta y se llama «Mandar algo».
 *
 * ══ Los dos motores, y qué parte de ellos vive aquí ════════════════════════
 *
 * **Motor 1.** No hay servidor mandando nada. Lo que hay es que la fila se
 * escribe CON SU FECHA y el portal del cliente solo enseña las vigentes
 * (`vigente`, en `envios.js`). Así que «automatizar» aquí es **materializar por
 * adelantado**: calcular qué filas tendrían que existir ya, y escribirlas.
 *
 * Este archivo hace ese cálculo y no toca la red. Quien escribe es
 * `context/useAutomatizaciones`, y lo hace en el orden que dice el §6.2 del doc:
 * primero se apunta la corrida —que es la que lleva el índice único—, después se
 * escribe lo que sale, y si eso falla se borra el apunte para que se reintente.
 *
 * **Motor 2.** Lo provoca el cliente —contesta, se pesa— y el cliente no puede
 * escribir en `client_actions`, así que corre EN LA BASE (migración 0117). De
 * ese motor este archivo guarda **el vocabulario y nada más**: qué disparadores
 * hay, qué forma tiene su `valor`, cómo se llaman. El reparto no pasa por aquí,
 * y `CORREN_SOLAS` es lo que impide que lo intente.
 *
 * ══ La llave de la ocurrencia, que es el riesgo entero ═════════════════════
 *
 * Sin estado de ejecución, alguien recibe el vídeo de bienvenida dos veces, y es
 * el fallo que no se puede corregir después. La respuesta es una sola columna:
 * `ocurrencia` dice QUÉ VEZ ES —`'once'` para lo que pasa una vez, `'2026-W37'`
 * para lo que se repite, el id del hecho para lo que provoca el cliente—, y el
 * índice único de `automation_runs` lo hace cierto en el único sitio donde puede
 * serlo, que es la base.
 *
 * Aquí solo se calcula la clave. Que no se repita no lo decide JavaScript.
 *
 * ══ El desfase es ABSOLUTO desde el disparador ═════════════════════════════
 *
 * `paso.dia` no cuenta desde el paso anterior: cuenta desde el disparo. Es la
 * diferencia entre poder meter un paso en medio sin que se mueva nada de lo que
 * va detrás, y tener que recolocarlo todo a mano.
 *
 * ══ Días, nunca horas ══════════════════════════════════════════════════════
 *
 * `due` es una fecha (`client_actions.due` es `date`). Un «a las 10:00» sería un
 * adorno que miente: no hay nadie mandando nada a las diez. El día que exista el
 * motor 3, se replantea.
 */

import { addDays, toISODate, todayISO, weekStart } from '@/lib/dates';
import { clampInt } from '@/lib/num';
import { newId, newUuid } from '@/lib/ids';
import { DIAS, sanitizeSchedule } from './protocol';
import { altaDe, pideEnlace, queById } from './envios';

/**
 * Tope de automatizaciones por protocolo.
 *
 * No es una regla de producto: es que cada una multiplica por sus pasos y por su
 * gente, y quien las cuenta es el navegador. Con seis protocolos y ocho
 * automatizaciones cada uno ya hay cuarenta y ocho hilos que repasar en cada
 * arranque, que es donde esto empieza a notarse.
 */
export const MAX_AUTOMATIZACIONES = 8;

/** Tope de pasos por automatización. Una lista más larga no se lee: se rebusca. */
export const MAX_PASOS = 12;

/**
 * Cuántos saltos se permiten en una cadena.
 *
 * A llama a B y B llama a A es un bucle que escribe filas hasta que alguien lo
 * vea. Se corta de dos maneras y las dos hacen falta: al ESCRIBIR, porque una
 * automatización no puede encadenar a ninguna que ya esté en su cadena
 * (`encadenaBien`), y al CORRER, con este tope — porque una cadena guardada
 * antes de que existiera la comprobación sigue estando en la base.
 */
export const MAX_SALTOS = 5;

/**
 * Cuántos días por delante se materializa.
 *
 * Ni cero ni infinito, y las dos puntas tienen su daño. Corto de más, lo que
 * sale la semana que viene no se puede ver ni cancelar hasta que ya es tarde —y
 * la cola visible es justo lo que sustituye al «Review first» de Coachway—.
 * Largo de más, la cola se llena de filas que aún pueden cambiar: un paso que se
 * corrige hoy ya no toca lo que se materializó el mes pasado (§6.3), así que
 * adelantar de más es congelar borradores.
 *
 * Treinta y cinco días son cinco semanas: la del check-in que viene y cuatro más
 * de margen para quien abre la aplicación una vez al mes.
 */
export const HORIZONTE = 35;

/** El desfase máximo de un paso, en días. Medio año da para cualquier fase. */
export const MAX_DIA = 180;

// ── El disparador ──────────────────────────────────────────────────────────

/**
 * El catálogo, con los dos motores dentro.
 *
 * **Motor 1** —`alta`, `semana`, `manual`, `cadena`— se puede fechar por
 * adelantado: la fila se escribe con su `due` y el portal la enseña el día que
 * toca. Lo calcula `loQueToca` y lo escribe el navegador del entrenador.
 *
 * **Motor 2** —`contesta`, `pesaje`— lo provoca el cliente, y el cliente no
 * puede escribir en `client_actions` (RLS de la 0105). Así que corre EN LA BASE:
 * un disparador de tabla llama a `correr_automatizaciones_del_cliente`
 * (migración 0117) al terminar el hecho. **No es una preferencia, lo decide la
 * seguridad.**
 *
 * **Motor 3** —`silencio`— no lo provoca nadie, y ésa es toda su dificultad: lo
 * que dispara es una AUSENCIA, y una ausencia no escribe ninguna fila que pueda
 * colgar un disparador. Hace falta que alguien mire, y mirar todos los días es
 * el latido de las 07:00 (`wrangler.jsonc` → `worker.mjs` → la función `latido`
 * → `correr_el_latido()`, migración 0118).
 *
 * Que estén en la misma lista es lo correcto: quien monta el protocolo elige un
 * disparador, no un motor. Pero el navegador tiene que saber distinguirlos —ver
 * `CORREN_SOLAS`—, porque intentar correr uno del motor 2 o del 3 desde aquí
 * sería repartir dos veces lo mismo.
 */
export const DISPARADORES = [
  {
    id: 'alta',
    label: 'Cuando empieza contigo',
    dice: 'A cada uno le cuenta desde su alta.',
    /* Su fecha sale de `clients.start_date`. Sin alta no hay desde dónde contar,
       y esa persona se queda fuera hasta que la tenga: ver `disparosDe`. */
    pide: null,
    motor: 1,
  },
  {
    id: 'semana',
    label: 'Cada semana',
    dice: 'Se repite mientras lo lleve puesto.',
    pide: 'schedule',
    motor: 1,
  },
  {
    id: 'contesta',
    label: 'Cuando te conteste',
    dice: 'Lo que le pides y él entrega, desde su portal.',
    /* CUÁL. Sin formulario apuntado vale cualquiera de lo que le pidas; con uno,
       solo ése. Se compara contra `client_actions.form_id`, que es una columna
       de texto: la base no necesita saber qué es un formulario para acertar. */
    pide: 'formulario',
    motor: 2,
  },
  {
    id: 'pesaje',
    label: 'Cuando se pese',
    dice: 'Cada peso nuevo que entra en su evolución.',
    pide: null,
    motor: 2,
  },
  {
    id: 'silencio',
    label: 'Cuando lleve tiempo sin…',
    dice: 'Si deja de entrenar, de pesarse o de contestarte.',
    /* CUÁNTO y SIN QUÉ: `{ que, dias }`. Ver `SILENCIOS`. */
    pide: 'silencio',
    motor: 3,
  },
  {
    id: 'manual',
    label: 'Cuando se la mandes tú',
    dice: 'No pasa sola: la lanzas desde aquí cuando quieras.',
    pide: null,
    motor: 1,
  },
  {
    id: 'cadena',
    label: 'Cuando termine otra',
    dice: 'La empieza un paso de otra automatización.',
    pide: null,
    motor: 1,
  },
];

export const disparadorById = (id) => DISPARADORES.find((d) => d.id === id) || DISPARADORES[0];

// ── El silencio: sin qué, y cuánto ─────────────────────────────────────────

/**
 * De qué tres cosas se puede echar en falta a alguien.
 *
 * Los tres salen de un hecho que la base ya guarda y que ya tiene un sitio donde
 * se lee: entrenar es la sesión anotada en su microciclo (lo mismo que
 * `trainingSummary.lastTraining` y que `training_summaries()`), pesarse es una
 * entrada de su evolución, y contestarte es lo que ENTREGA —un formulario
 * contestado o un «pídele» marcado—.
 *
 * **`contestar` mide exactamente lo mismo que dispara «Cuando te conteste»**, y
 * eso no es casualidad: son las dos caras del mismo hecho, y si midieran cosas
 * distintas habría dos definiciones de «contestar» en la misma pantalla. Abrir
 * un vídeo no cuenta —eso lo mandas tú—, igual que en el motor 2.
 *
 * Las fotos no entran, aunque `THRESHOLDS.noPhotos` exista: la cartera avisa a
 * los 45 días porque es un dato del entrenador, y aquí lo que se decide es
 * mandarle algo a una persona. El día que alguien lo pida, es una línea.
 */
export const SILENCIOS = [
  { id: 'entrenar', label: 'entrenar', dice: 'Sin una sesión anotada.' },
  { id: 'pesarse', label: 'pesarse', dice: 'Sin un peso nuevo en su evolución.' },
  { id: 'contestar', label: 'contestarte', dice: 'Sin entregar nada de lo que le pides.' },
];

export const silencioById = (id) => SILENCIOS.find((s) => s.id === id) || SILENCIOS[0];

/**
 * Cuánto silencio hace falta.
 *
 * El suelo son tres días y no uno: con uno, «sin entrenar» saltaría el martes de
 * cualquiera que entrene lunes y miércoles. El techo son noventa porque más
 * arriba ya no es una ausencia que se atienda, es alguien que se fue.
 */
export const MIN_SILENCIO = 3;
export const MAX_SILENCIO = 90;

/** Lo que ofrece el mando. Días sueltos hasta la quincena, luego de semana en semana. */
export const DIAS_SILENCIO = [3, 5, 7, 10, 14, 21, 30, 45, 60, 90];

/**
 * Las que corren solas al repasar, **en este navegador**.
 *
 * `manual` no, porque la dispara el dedo. `cadena` tampoco, y no por lo mismo:
 * corre siempre, pero desde dentro de quien la llama y con SU ocurrencia. Una
 * encadenada que se disparase además por su cuenta le llegaría a todo el mundo.
 *
 * Y las del motor 2 tampoco, por el motivo más importante de los tres: **ya las
 * está repartiendo la base**. Su disparo es un hecho del cliente con su fecha y
 * su id; desde aquí no hay forma de saber cuáles han pasado sin volver a leer
 * todo lo que ha entregado cada uno, y el que lo intentara acabaría mandando
 * dos veces lo mismo —o, peor, calculando mal la ocurrencia y mandándolo cada
 * vez que alguien abre la aplicación—.
 *
 * El `silencio` tampoco, y por una razón suya: **su disparo depende de qué día
 * se mire**. Lo reparte el latido una vez al día, a la misma hora para todos; si
 * además lo repartiera el navegador, quien abriera la aplicación por la noche
 * adelantaría el aviso de media jornada y quien no la abriera en toda la semana
 * lo recibiría igual —o sea, el mismo hecho con dos relojes—. Un reloj.
 */
const CORREN_SOLAS = ['alta', 'semana'];

// ── Los pasos ──────────────────────────────────────────────────────────────

/**
 * Lo que puede hacer un paso: **los verbos de la casa**, no los de Coachway.
 *
 * Ellos ofrecen tipos de contenido —chat · documento · vídeo · audio— porque su
 * destino es un chat. Aquí no hay chat: el trato va por WhatsApp y el destino es
 * su lista de pendientes. Así que el «⊕» abre EL MISMO selector que «Mandar
 * algo» (`QUE_MANDAR`, en `envios.js`) y los ids son los mismos: lo que escribe
 * un paso es exactamente lo que escribe un envío.
 *
 * Dos ausencias y una añadida, las tres a propósito:
 *
 *   · **El aviso NO entra.** Cae en `updates.note` del cliente, que es un tablón
 *     con sitio para una nota y sin ninguna columna donde guardar un cuándo
 *     (`sePuedeProgramar` ya lo dice). Un aviso con desfase sería la única cosa
 *     de este carril cuyo día es mentira.
 *   · **`salta` sí**, y no es un verbo: es el cuarto tipo de paso que abrió el
 *     dueño el 10 de septiembre. No le pasa nada a nadie —empieza otra
 *     automatización— y por eso se dibuja distinto y no lleva disco de familia.
 *   · **La casilla tuya sí** (`tarea`): tiene fecha y cae en `client_events`
 *     marcada como privada (0106). Es «avísame», el tercer verbo del catálogo.
 */
export const VERBOS = [
  { id: 'form', rot: 'Pídele', que: 'form' },
  { id: 'pide', rot: 'Pídele', que: 'pide' },
  { id: 'documento', rot: 'Mándale', que: 'documento' },
  { id: 'video', rot: 'Mándale', que: 'video' },
  { id: 'tarea', rot: 'Avísame', que: 'tarea' },
  { id: 'salta', rot: 'Empieza', que: null },
];

export const verboById = (id) => VERBOS.find((v) => v.id === id) || VERBOS[0];

/** Lo que ofrece el «⊕»: los cinco verbos. El salto se añade con su propio gesto. */
export const QUE_PASOS = VERBOS.filter((v) => v.id !== 'salta').map((v) => queById(v.que));

/** ¿Cae en la tabla de lo mandado, o es trabajo tuyo, o ninguna de las dos? */
export const carrilDePaso = (paso) => {
  if (paso?.que === 'salta') return 'salto';
  return queById(paso?.que).carril;
};

/**
 * ¿Este paso se puede mandar ya?
 *
 * Un paso nace vacío —se añade con el «⊕» y se rellena— así que entre el clic y
 * la última tecla hay un rato en el que dice «Sin formulario». En ese rato **no
 * se intenta**, y no por elegancia: `filasDeEnvio` rechaza en silencio lo que no
 * está completo, así que el repaso apuntaría la corrida, no sacaría nada, y
 * borraría el apunte — un ir y venir a la base en cada repaso, para siempre, por
 * un paso que alguien dejó a medias.
 *
 * Y hacia fuera dice algo mejor: un paso a medio escribir no cuenta como «una
 * cosa que le pasa sola», porque no le pasa a nadie.
 */
export const pasoListo = (paso) => {
  if (!paso) return false;
  if (paso.que === 'salta') return Boolean(paso.saltaA);
  if (paso.que === 'form') return Boolean(paso.formId);
  if (!paso.titulo) return false;
  return !pideEnlace(paso.que) || Boolean(paso.enlace);
};

// ── La forma ───────────────────────────────────────────────────────────────

const texto = (raw, tope) => String(raw ?? '').trim().slice(0, tope);

/**
 * Lo que su disparador necesita saber, y solo eso.
 *
 * Una sola puerta para los dos que piden algo, porque son la misma clase de
 * dato con dos formas: el horario del semanal y el formulario del «cuando te
 * conteste». Lo demás se guarda a `null` — no a `{}`—, que es lo que deja que
 * cambiar de disparador no arrastre la configuración del anterior.
 */
const sanitizeValor = (disparador, raw) => {
  if (disparador === 'semana') return sanitizeSchedule(raw);
  /* `null` es «cualquier cosa que le pidas», y es un valor con significado: no
     es que falte, es que no se ha acotado. */
  if (disparador === 'contesta') return { formId: raw?.formId ? String(raw.formId) : null };
  if (disparador === 'silencio') {
    return {
      que: silencioById(raw?.que).id,
      /* Diez días es el hueco por defecto: el mismo `THRESHOLDS.noWeight` con el
         que la cartera lleva avisando desde siempre. Nace en un valor que ya
         está discutido, no en un número redondo. */
      dias: clampInt(raw?.dias, MIN_SILENCIO, MAX_SILENCIO, 10),
    };
  }
  return null;
};

export const buildPaso = ({ que = 'form', dia = 0, ...resto } = {}) => ({
  id: resto.id || newId('paso'),
  que,
  dia: clampInt(dia, 0, MAX_DIA, 0),
  formId: resto.formId || null,
  titulo: texto(resto.titulo, 80),
  enlace: texto(resto.enlace, 500),
  nota: texto(resto.nota, 280),
  /* Solo para `salta`: a quién llama. */
  saltaA: resto.saltaA || null,
});

const sanitizePaso = (raw) => {
  if (!raw || typeof raw !== 'object' || !raw.id) return null;
  if (!VERBOS.some((v) => v.id === raw.que)) return null;
  return buildPaso({ ...raw, id: String(raw.id) });
};

export const buildAutomatizacion = ({ protocoloId, disparador = 'alta', nombre = '', desde = null } = {}) => ({
  id: newUuid(),
  protocoloId: protocoloId || null,
  nombre: texto(nombre, 60),
  disparador,
  valor: sanitizeValor(disparador, desde?.valor),
  activa: true,
  /*
    CUÁNDO SE ESCRIBIÓ, que es desde cuándo vale (ver `disparosDe`).

    Nace vacía y la rellena la base con su `created_at` al guardar: es la única
    de las dos puntas que no puede mentir. Puesta aquí con la hora del portátil,
    un reloj adelantado bastaría para que una regla valiera desde ayer.
  */
  creada: null,
  /* Una nueva nace VACÍA y no con un paso de ejemplo. Un paso que nadie ha
     escrito y que ya está encendido es la clase de cosa que sale por ahí sin
     que nadie lo haya decidido. */
  pasos: desde ? (desde.pasos || []).map((p) => buildPaso({ ...p, id: null })) : [],
  orden: 0,
});

/**
 * Una guardada, completada y acotada.
 *
 * Descarta lo que no conoce, como `clientProtocol` y `clientIntake`: una clave
 * de una versión futura que sobreviviera al saneado se guardaría entera en el
 * siguiente `update` y acabaría corriendo sin que nadie la haya leído.
 */
export const sanitizeAutomatizacion = (raw) => {
  if (!raw || typeof raw !== 'object' || !raw.id) return null;
  const disparador = DISPARADORES.some((d) => d.id === raw.disparador) ? raw.disparador : 'alta';
  return {
    id: String(raw.id),
    protocoloId: raw.protocoloId ? String(raw.protocoloId) : null,
    nombre: texto(raw.nombre, 60),
    disparador,
    valor: sanitizeValor(disparador, raw.valor),
    activa: raw.activa !== false,
    creada: raw.creada || null,
    pasos: (Array.isArray(raw.pasos) ? raw.pasos : [])
      .map(sanitizePaso)
      .filter(Boolean)
      /* Por desfase y no por el orden en que se escribieron: el carril se lee de
         arriba abajo como una línea de tiempo, y un paso metido en medio tiene
         que caer en medio. En empate, el que ya estaba. */
      .sort((a, b) => a.dia - b.dia)
      .slice(0, MAX_PASOS),
    orden: clampInt(raw.orden, 0, 999, 0),
  };
};

/** Cómo se llama, si no le han puesto nombre: la frase de su disparador. */
export const nombreDe = (auto) => {
  if (auto?.nombre) return auto.nombre;
  if (auto?.disparador === 'silencio') {
    const { que, dias } = sanitizeValor('silencio', auto.valor);
    return `${dias} días sin ${silencioById(que).label}`;
  }
  if (auto?.disparador === 'semana') {
    const { weekday, everyWeeks } = sanitizeSchedule(auto.valor);
    const dia = DIAS.find((x) => x.id === weekday)?.plural || 'lunes';
    return everyWeeks === 1 ? `Cada ${dia}` : `Cada ${everyWeeks} semanas, ${dia}`;
  }
  return disparadorById(auto?.disparador).label;
};

// ── El hilo: cómo se lee un desfase ────────────────────────────────────────

/**
 * **El hilo habla el idioma de su disparador**, y no es un adorno: es lo que lo
 * hace legible sin traducir.
 *
 *     Cuando empieza contigo  →  ese mismo día · el día 3 · a las 2 semanas
 *     Cada lunes              →  ese lunes · el jueves · el lunes siguiente
 *
 * Un «+3d» obliga a hacer la cuenta en la cabeza cada vez, y quien la haga mal
 * le manda el check-in a alguien un domingo.
 */
export const hiloDice = (auto, dia) => {
  const n = clampInt(dia, 0, MAX_DIA, 0);

  if (auto?.disparador === 'semana') {
    const { weekday } = sanitizeSchedule(auto.valor);
    const nombre = (d) => DIAS.find((x) => x.id === d)?.corto || 'lunes';
    if (n === 0) return `ese ${nombre(weekday)}`;
    if (n === 7) return `el ${nombre(weekday)} siguiente`;
    const cae = (weekday + n) % 7;
    return n < 7 ? `el ${nombre(cae)}` : `el ${nombre(cae)} siguiente`;
  }

  /* El silencio no tiene día propio: su disparo es la mañana en que el latido lo
     nota. «Ese mismo día» no tendría a qué referirse. */
  if (auto?.disparador === 'silencio' && n === 0) return 'en cuanto se note';

  if (n === 0) return 'ese mismo día';
  if (n === 1) return 'al día siguiente';
  if (n % 7 === 0) return n === 7 ? 'a la semana' : `a las ${n / 7} semanas`;
  return `el día ${n + 1}`;
};

// ── La ocurrencia ──────────────────────────────────────────────────────────

/**
 * La semana ISO de una fecha: `'2026-W37'`.
 *
 * ISO y no «la semana N del año» a ojo, porque la semana de una fecha es la de
 * SU JUEVES: el 1 de enero puede ser de la semana 52 del año anterior, y sin esa
 * regla dos lunes seguidos de finales de diciembre comparten ocurrencia — o sea,
 * un check-in que no sale.
 */
export const semanaISO = (fecha) => {
  const iso = toISODate(fecha);
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  /* Al jueves de su semana: ahí es donde se decide de qué año ISO es. */
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + 3);
  const anio = d.getUTCFullYear();
  const jueves1 = new Date(Date.UTC(anio, 0, 4));
  jueves1.setUTCDate(jueves1.getUTCDate() - ((jueves1.getUTCDay() + 6) % 7) + 3);
  const semana = 1 + Math.round((d.getTime() - jueves1.getTime()) / (7 * 86400000));
  return `${anio}-W${String(semana).padStart(2, '0')}`;
};

/**
 * La clave con la que se pregunta «¿esto ya corrió?».
 *
 * Es la misma que el índice único de `automation_runs`, escrita aquí una sola
 * vez. Que las dos formas de decirlo —la de la base y la del navegador— salgan
 * del mismo sitio es lo que evita que una corrida se dé por hecha en local y se
 * vuelva a escribir en la base, o al revés.
 */
export const claveDeCorrida = ({ automationId, pasoId, ocurrencia }) =>
  `${automationId}|${pasoId}|${ocurrencia}`;

// ── Qué toca ───────────────────────────────────────────────────────────────

const activo = (cliente) => {
  const estado = cliente?.status || null;
  return estado !== 'paused' && estado !== 'archived';
};

/**
 * Los disparos de una automatización para una persona, dentro del horizonte.
 *
 * Devuelve `{ desde, ocurrencia }`: desde qué día cuentan los desfases y qué vez
 * es. Lo que no devuelve nunca es historia: un protocolo que se pone hoy no
 * reparte los check-ins de las seis semanas que el cliente lleva contigo.
 */
const disparosDe = (auto, { cliente, hoy, horizonte }) => {
  /* Por `altaDe`, que acepta las dos formas de un cliente. Ver su porqué: leer
     solo una no da un error, da un «no tiene alta» que no es verdad. */
  const alta = toISODate(altaDe(cliente));
  const tope = addDays(hoy, horizonte);

  /*
    ══ NADA DE ANTES DE QUE LA REGLA EXISTIERA ═══════════════════════════════

    La escribes hoy; empieza a valer hoy. Sin esto, teclear «cuando alguien
    empiece conmigo, mándale el vídeo del día 3» le manda ese vídeo, en el mismo
    instante, a los cuarenta clientes que ya tienes —y fechado en marzo, porque
    su alta fue en marzo—. Se vio pasar con seis: escribir una regla se convirtió
    en repartir seis meses de historia de golpe.

    Escribir una regla no es ejecutarla hacia atrás. Un disparo anterior a la
    automatización no tiene a quién avisar: ya pasó.
  */
  const nacio = toISODate(auto.creada);

  if (auto.disparador === 'alta') {
    /* Sin fecha de alta no hay desde dónde contar, y ponerle «hoy» sería
       inventarle un comienzo: se queda fuera hasta que la tenga. */
    if (!alta || alta > tope) return [];
    if (nacio && alta < nacio) return [];
    return [{ desde: alta, ocurrencia: 'once' }];
  }

  if (auto.disparador === 'semana') {
    const { weekday, everyWeeks } = sanitizeSchedule(auto.valor);
    const desdeSemana = alta ? weekStart(alta) : null;
    const out = [];
    /*
      Se empieza por el lunes de ESTA semana y no por el del alta: el disparo de
      una semana pasada ya no tiene a quién avisar. El de esta semana sí entra
      aunque su día ya haya pasado —el check-in del lunes se materializa el
      miércoles, con su fecha del lunes—, porque lo que faltaba era la fila, no
      el recordatorio.
    */
    let lunes = weekStart(hoy);
    while (lunes && addDays(lunes, weekday) <= tope) {
      const disparo = addDays(lunes, weekday);
      const semanasDesdeElAlta = desdeSemana
        ? Math.round((Date.parse(lunes) - Date.parse(desdeSemana)) / (7 * 86400000))
        : null;
      /*
        «Cada N semanas» se cuenta DESDE SU ALTA, que es lo que hace que a cada
        uno le toque en su semana y no a todos a la vez. Sin alta no hay desde
        dónde contar la cadencia, así que con `every > 1` esa persona se queda
        fuera — igual que en el disparador de alta, y por el mismo motivo.
      */
      const leToca =
        (!alta || disparo >= alta) &&
        (everyWeeks === 1 || (semanasDesdeElAlta !== null && semanasDesdeElAlta % everyWeeks === 0));
      if (leToca) out.push({ desde: disparo, ocurrencia: semanaISO(disparo) });
      lunes = addDays(lunes, 7);
    }
    return out;
  }

  return [];
};

/**
 * **Qué filas tendrían que existir ya y no existen.**
 *
 * La función entera de este módulo. Recibe lo que hay —las automatizaciones del
 * protocolo de esa persona y las corridas ya apuntadas— y devuelve la lista de
 * lo que hay que escribir, cada una con su `due` y su `ocurrencia`.
 *
 * ── La cadena se camina siempre, aunque el salto ya se apuntara ────────────
 * Una corrida ya hecha se salta, pero la cadena se sigue caminando: si mañana
 * añades un paso a una automatización que alguien ya empezó, ese paso tiene que
 * salir. Es el §6.3 del doc —lo que ya corrió no se toca; lo que no ha corrido,
 * corre con la última versión— y se cumple aquí, no en la pantalla.
 *
 * @param automatizaciones  Las del protocolo que lleva puesto.
 * @param cliente           A quién. Pausados y archivados no entran, nunca.
 * @param hechas            `Set` de `claveDeCorrida`. Es una CACHÉ, no la
 *   verdad: quien impide de verdad el doble disparo es el índice único. Por eso
 *   puede venir incompleta —se cargan las últimas N— sin que eso rompa nada.
 * @param manual            `{ automationId, ocurrencia }` cuando el disparo lo
 *   da el dedo. Solo entonces corre una de disparador `manual`, y solo ésa.
 */
export const loQueToca = ({
  automatizaciones = [],
  cliente,
  hechas = new Set(),
  hoy = todayISO(),
  horizonte = HORIZONTE,
  manual = null,
} = {}) => {
  const out = [];
  if (!cliente?.id || !activo(cliente)) return out;

  const todas = automatizaciones.map(sanitizeAutomatizacion).filter(Boolean);
  const porId = new Map(todas.map((a) => [a.id, a]));

  const caminar = (auto, { desde, ocurrencia, cadena }) => {
    if (!auto || !auto.activa) return;
    if (cadena.length > MAX_SALTOS) return;

    for (const paso of auto.pasos) {
      const due = addDays(desde, paso.dia);
      if (!due) continue;

      const clave = claveDeCorrida({ automationId: auto.id, pasoId: paso.id, ocurrencia });
      if (!hechas.has(clave) && pasoListo(paso)) {
        out.push({
          automatizacion: auto,
          paso,
          ocurrencia,
          due,
          clienteId: cliente.id,
          clave,
        });
      }

      /*
        Y el salto se camina esté apuntado o no. Apuntarlo sirve para saber que
        pasó; lo que decide si los pasos de la llamada salen es la corrida DE
        ESOS pasos, cada uno con su propia clave.
      */
      if (paso.que === 'salta' && paso.saltaA && !cadena.includes(paso.saltaA)) {
        caminar(porId.get(paso.saltaA), {
          desde: due,
          /* La ocurrencia de la encadenada es la de QUIEN LA LLAMA. Con `'once'`,
             «cada lunes → empieza X» dispararía X una sola vez en la vida. */
          ocurrencia,
          cadena: [...cadena, paso.saltaA],
        });
      }
    }
  };

  if (manual?.automationId) {
    const auto = porId.get(manual.automationId);
    if (auto?.disparador === 'manual') {
      caminar(auto, { desde: hoy, ocurrencia: manual.ocurrencia, cadena: [auto.id] });
    }
    return out;
  }

  for (const auto of todas) {
    if (!CORREN_SOLAS.includes(auto.disparador)) continue;
    for (const disparo of disparosDe(auto, { cliente, hoy, horizonte })) {
      caminar(auto, { ...disparo, cadena: [auto.id] });
    }
  }

  return out;
};

// ── Encadenar sin morderse la cola ─────────────────────────────────────────

/**
 * ¿Puede `origen` saltar a `destino`?
 *
 * No, si desde `destino` se vuelve a `origen` por cualquier camino. Es la mitad
 * del corte del ciclo que se hace AL ESCRIBIR, y es la que de verdad lo evita:
 * el tope de saltos de `loQueToca` es el cinturón, no el tirante.
 */
export const encadenaBien = (origenId, destinoId, automatizaciones = []) => {
  if (!origenId || !destinoId) return false;
  if (origenId === destinoId) return false;

  const porId = new Map(automatizaciones.map((a) => [a.id, a]));
  const vistas = new Set();
  const pila = [destinoId];

  while (pila.length > 0) {
    const id = pila.pop();
    if (id === origenId) return false;
    if (vistas.has(id)) continue;
    vistas.add(id);
    for (const paso of porId.get(id)?.pasos || []) {
      if (paso.que === 'salta' && paso.saltaA) pila.push(paso.saltaA);
    }
  }
  return true;
};

/** Las que se pueden encadenar desde una: las de disparador `cadena`, sin ciclo. */
export const encadenables = (origen, automatizaciones = []) =>
  automatizaciones.filter(
    (a) => a.disparador === 'cadena' && encadenaBien(origen?.id, a.id, automatizaciones)
  );

// ── Leerlas ────────────────────────────────────────────────────────────────

export const deProtocolo = (automatizaciones = [], protocoloId) =>
  automatizaciones
    .filter((a) => a.protocoloId === protocoloId)
    .sort((a, b) => a.orden - b.orden || a.id.localeCompare(b.id));

/** «4 cosas le pasan solas». Los saltos no cuentan: no le pasan a nadie. */
export const cuentaPasos = (automatizaciones = []) =>
  automatizaciones
    .filter((a) => a.activa)
    .reduce((n, a) => n + (a.pasos || []).filter((p) => p.que !== 'salta' && pasoListo(p)).length, 0);
