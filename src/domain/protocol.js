/**
 * El protocolo: qué le pide este entrenador a sus clientes.
 *
 * ══ Por qué esto es UNA cosa y no cinco ═════════════════════════════════════
 *
 * Sobre la mesa había cinco peticiones que parecían funciones separadas: notas
 * del entrenador para el cliente, un logbook propio del cliente, un bloque de
 * calentamiento con vídeos, feedback de la sesión (fatiga, dolor, sensaciones) y
 * preguntas en el check-in. Construidas por separado serían cinco interruptores,
 * cinco formatos de dato y cinco sitios donde mirar.
 *
 * Son dos.
 *
 *   · PREGUNTAS CON RESPUESTA. El feedback de una sesión y el cuestionario del
 *     check-in son exactamente lo mismo con distinta frecuencia: una escala del
 *     1 al 10 contestada al acabar de entrenar y otra contestada el domingo. Si
 *     se modelan igual, «medirlo y trackearlo» deja de ser trabajo extra: toda
 *     respuesta numérica ES una serie temporal, y entra en la analítica por el
 *     mismo sitio que el peso o el tonelaje.
 *
 *   · CONTENIDO QUE BAJA DEL ENTRENADOR. El calentamiento con sus vídeos y la
 *     nota de una sesión son material que el entrenador adjunta y el cliente lee.
 *
 * Y encima de las dos, el marco: **el entrenador decide qué existe en su app**.
 * Uno que lleva atletas de fuerza querrá RPE y dolor articular; otro que lleva
 * recomposición corporal querrá hambre y adherencia; otro no querrá preguntar
 * nada. Ninguno de los tres debería ver los módulos de los otros dos.
 *
 * ── Dónde vive ──────────────────────────────────────────────────────────────
 * En `clients.preferences.protocol`, que ya tiene su función de guardado
 * (`set_client_preferences`, migración 0008) y por tanto NO necesita migración.
 * Esa columna tiene un tope de 8 KB; un protocolo completo con cuatro preguntas
 * propias ocupa unos 400 bytes, así que hay sitio de sobra — pero por eso las
 * preguntas propias están acotadas (ver `MAX_CUSTOM`).
 *
 * Las mismas reglas de formato que el resto de preferencias: lo que no está
 * configurado usa el valor por defecto, y **las claves desconocidas se ignoran**,
 * de modo que se pueden añadir módulos nuevos sin migrar nada.
 */

import { clampInt } from '@/lib/num';
/* El saneado de una medida vive en su módulo, y aquí solo se usa: dos reglas
   sobre qué es una medida válida acabarían discrepando, y la que se creería
   sería la del protocolo —que es la que llega al cliente—. */
import { sanitizeMedida } from './medidas';
import { newId } from '@/lib/ids';

// ── Los módulos ────────────────────────────────────────────────────────────

/**
 * Cada módulo es una PARTE DEL PRODUCTO que el entrenador enciende o apaga.
 *
 * Todos van apagados salvo los que trae el perfil por defecto: una aplicación
 * que llega con todo encendido obliga a apagar, y apagar cosas que no entiendes
 * da más miedo que encender las que quieres.
 */
export const MODULES = [
  {
    id: 'warmup',
    area: 'training',
    label: 'Calentamiento y movilidad',
    hint: 'Con vídeo, antes de cada sesión.',
  },
  {
    id: 'coachNote',
    area: 'training',
    label: 'Tu nota en cada sesión',
    hint: 'Una indicación tuya en el día que quieras.',
  },
  {
    id: 'clientNote',
    area: 'training',
    label: 'Logbook del cliente',
    hint: 'Sus apuntes de cada sesión.',
  },
  {
    id: 'sessionFeedback',
    area: 'training',
    label: 'Feedback de la sesión',
    hint: 'Tus preguntas al terminar de entrenar.',
  },
  {
    /*
      Programar por RIR es una forma de entrenar, no la forma. Quien prescribe
      por porcentajes o por sensaciones no quiere una casilla más por serie —y
      antes la tenía igualmente, porque el RIR que anota el cliente existía desde
      el principio sin nada con que compararlo.

      Encendido, cada serie lleva su RIR objetivo y al cliente se le enseña
      cuánto se le pidió junto a lo que anotó.
    */
    id: 'rir',
    area: 'training',
    label: 'RIR objetivo por serie',
    hint: 'Lo que le pides, junto a lo que anota.',
  },
  {
    /*
      Como el RIR: una forma de pautar, no la forma. Hay quien quiere que su
      cliente cambie el plátano por fresas sin preguntar, y quien prescribe
      cerrado y no ofrece margen. Encendido, cada alimento del menú lleva su
      lista de intercambios («150 g de plátano ≈ 250 g de manzana») calculada
      sobre el macro de su grupo — y el entrenador puede quitársela a alimentos
      concretos desde la propia dieta.
    */
    id: 'dietSwaps',
    area: 'nutrition',
    label: 'Equivalencias en la dieta',
    hint: 'Cambia alimentos sin descuadrar los macros.',
  },
];

export const moduleById = (id) => MODULES.find((m) => m.id === id) || null;

/**
 * Los módulos de UNA parte del producto. Es lo que usan los interruptores «a
 * mano» —los de la pantalla donde el módulo se echa en falta—: la rutina ofrece
 * los de entrenamiento y la dieta los de nutrición, mientras que Ajustes →
 * Protocolo sigue enseñando la lista entera.
 */
export const modulesFor = (area) => MODULES.filter((m) => m.area === area);

// ── Qué le llevas a esta persona ───────────────────────────────────────────

/**
 * Entrenamiento, nutrición, o las dos cosas.
 *
 * ══ Por qué NO son dos módulos más de la lista de arriba ════════════════════
 *
 * Sería lo cómodo y rompería a todo el mundo. `clientProtocol` SANEA los módulos
 * guardados contra el catálogo, así que un cliente configurado hoy tiene
 * `modules: ['coachNote','clientNote','sessionFeedback']` y nada más. Añadir
 * `training` y `nutrition` al catálogo haría que ese cliente —y todos los demás—
 * apareciera de golpe sin las dos secciones principales de la aplicación.
 *
 * Y además no son la misma clase de cosa. Un módulo es una PIEZA dentro de una
 * sección (el calentamiento, la nota del día); esto es si la sección existe. La
 * diferencia se nota en el valor por defecto: los módulos nacen apagados —una
 * aplicación que llega con todo encendido obliga a apagar— y esto nace
 * ENCENDIDO, porque quitarle a alguien la mitad del producto no puede ser lo que
 * pasa cuando nadie ha dicho nada.
 *
 * ── La regla de siempre ─────────────────────────────────────────────────────
 * Lo que no está configurado son las dos. Es lo que hacía la aplicación antes de
 * que esto se pudiera elegir, así que quien no toque nada no puede notar el
 * cambio — ni él ni sus clientes.
 */
export const SERVICES = [
  {
    id: 'training',
    label: 'Entrenamiento',
    /* El nombre de pila del servicio: el que se dice al RESUMIR lo que alguien
       lleva puesto, donde «Entrenamiento y Nutrición» gasta una línea entera en
       decir dos cosas. Ver `queLeLlevas`. */
    corto: 'Entreno',
    hint: 'Su programa y sus sesiones.',
  },
  {
    id: 'nutrition',
    label: 'Nutrición',
    corto: 'Dieta',
    hint: 'Kcal, macros y menú.',
  },
];

const SERVICE_IDS = SERVICES.map((s) => s.id);

export const defaultServices = () => ({ training: true, nutrition: true });

/**
 * Lo guardado, completado y acotado.
 *
 * Los dos apagados vuelven a los dos encendidos: es un estado que la pantalla no
 * deja producir, y un cliente sin entrenamiento y sin nutrición no tiene
 * aplicación —solo le quedarían pantallas que hablan de un trabajo que no
 * existe—. Si llega desde una columna jsonb escrita a mano, se corrige aquí
 * antes de que nadie se quede mirando un portal vacío.
 */
const sanitizeServices = (raw) => {
  const out = {};
  for (const id of SERVICE_IDS) out[id] = raw?.[id] === undefined ? true : Boolean(raw[id]);
  return SERVICE_IDS.some((id) => out[id]) ? out : defaultServices();
};

// ── Lo que se mide en el check-in ──────────────────────────────────────────

/**
 * Pliegues y perímetros: **tres estados, no un interruptor**.
 *
 * ══ Por qué tres y no dos ═══════════════════════════════════════════════════
 *
 * Estaban clavados como «opcional» para todo el mundo: plegados detrás de un
 * botón que dice «(opcional)». Eso deja fuera a los dos extremos, que son
 * justamente las dos formas de trabajar de verdad:
 *
 *   · Quien mide de verdad —el que hace antropometría cada cuatro semanas— no
 *     tiene forma de PEDIRLO. Su cliente cierra el check-in con el peso y se le
 *     olvidan los pliegues, y el entrenador se entera al ir a mirarlos.
 *   · Quien no mide nunca —la mayoría del entrenamiento online— tiene a su
 *     cliente mirando un botón de seis pliegues cutáneos que no va a usar jamás,
 *     con el plicómetro que no tiene.
 *
 * Un interruptor de dos posiciones solo resuelve al segundo. El tercer estado es
 * el que convierte esto en una decisión del entrenador en lugar de una opinión de
 * la aplicación.
 *
 * ── Y por qué por BLOQUE y no uno para los dos ──────────────────────────────
 * Porque no cuestan lo mismo. Un perímetro se mide con una cinta de tres euros y
 * lo puede tomar cualquiera en su casa; un pliegue necesita plicómetro, práctica
 * y que lo tome siempre la misma mano. Pedir perímetros cada semana y pliegues
 * nunca es una configuración normal — y con un solo interruptor era imposible.
 */
export const CHECKIN_BLOCKS = [
  {
    id: 'perimeters',
    label: 'Perímetros corporales',
    hint: 'Cintura, cadera, brazo… Se miden con una cinta métrica.',
  },
  {
    id: 'folds',
    label: 'Pliegues cutáneos',
    hint: 'Los seis pliegues del % graso. Hace falta plicómetro y buena mano.',
  },
];

/**
 * Los tres estados.
 *
 * `required` no es «recordárselo»: es que el check-in **no se cierra** sin ese
 * bloque relleno. Un obligatorio que se puede saltar es un opcional con más
 * texto.
 */
export const CHECKIN_MODES = [
  { id: 'required', label: 'Obligatorio', hint: 'No podrá cerrar el check-in sin rellenarlo.' },
  { id: 'optional', label: 'Opcional', hint: 'Lo tiene a mano, plegado, y lo rellena si quiere.' },
  { id: 'off', label: 'Apagado', hint: 'No le aparece. Ni a ti al revisar su check-in.' },
];

const CHECKIN_MODE_IDS = CHECKIN_MODES.map((m) => m.id);

/**
 * Lo de siempre: los dos a mano y ninguno obligatorio.
 *
 * Es exactamente lo que hacía la aplicación antes de que esto se pudiera
 * configurar, y por eso es el valor por defecto: quien no toque nada no puede
 * notar el cambio.
 */
export const defaultCheckin = () => ({ perimeters: 'optional', folds: 'optional' });

/**
 * Tope de bloques con estado guardado.
 *
 * Los dos de siempre más las medidas del entrenador (`MAX_MEDIDAS` = 12) más las
 * de fábrica. No es una limitación de producto: es la columna de 8 KB, y un
 * estado por bloque son unos treinta bytes.
 */
export const MAX_CHECKIN_BLOCKS = 24;

/**
 * Las definiciones de medida que viajan DENTRO del protocolo de un cliente.
 *
 * Son las de su catálogo que él tiene encendidas, copiadas, por lo mismo que se
 * copian las preguntas propias: el portal solo lee su propia fila. El saneado es
 * el del catálogo, así que no hay dos reglas sobre qué es una medida válida.
 */
const sanitizeMedidasDelProtocolo = (raw) => {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const item of raw) {
    if (out.length >= MAX_CHECKIN_BLOCKS) break;
    const sana = sanitizeMedida(item, out.length);
    if (!sana || out.some((m) => m.id === sana.id)) continue;
    out.push(sana);
  }
  return out;
};

// ── Cuántas veces se pesa ──────────────────────────────────────────────────

/**
 * Los pesajes que el entrenador le pide a la semana.
 *
 * ══ Por qué esto es una decisión suya y ya no del código ════════════════════
 *
 * Eran tres, escritos a mano en `weeklyCheckIn` y en `weighInAdherence`, y desde
 * ahí salían en ocho pantallas: la tarea «te faltan 2 pesajes» del cliente, su
 * «llevas 2 de 3», su tarjeta de cuerpo, la cola de Hoy, la revisión de la
 * semana y las alertas de la cartera.
 *
 * O sea que la aplicación reclamaba el incumplimiento de una norma que **nadie
 * había puesto**. El entrenador que pide un pesaje semanal veía a toda su
 * cartera a medias; el que los pide a diario, a todo el mundo cumpliendo con
 * tres. Y el cliente recibía deberes que su entrenador no le había mandado.
 *
 * Ahora el número lo pone quien lleva al cliente. Y `0` no es «cero pesajes»:
 * es **no lo pido**, y entonces nadie —ni el cliente ni el entrenador— ve una
 * sola frase sobre pesajes que falten. Es la misma regla que ya sostiene el
 * cuestionario de la semana: lo que no está configurado no existe.
 *
 * ── Por qué el valor de serie es «no lo pido» ───────────────────────────────
 * Porque el aviso lo dispara la norma, no al revés. Un producto que reclama por
 * defecto obliga a apagar algo que nunca pediste; uno que calla por defecto solo
 * habla cuando alguien ha decidido que hay algo que decir.
 */
export const WEIGH_INS_MAX = 7;

export const defaultWeighIns = () => 0;

// ── Cuándo se avisa de ESTA persona ────────────────────────────────────────

/**
 * Los umbrales de alerta, por cliente.
 *
 * ══ Por qué la vara deja de ser una para todos ══════════════════════════════
 *
 * Los umbrales de la cartera («7 días sin entrenar», «10 sin pesarse») estaban
 * escritos una vez en `domain/portfolio.js` para toda la cartera. Con el
 * cliente de dos sesiones semanales, la de siete días salta en cada semana
 * normal; con el de lunes-a-sábado, siete días de silencio ya son muchos. Una
 * lista que avisa siempre del mismo no avisa: enseña a ignorar el aviso.
 *
 * `0` no es «avisar a los cero días»: es **la vara general** — los umbrales de
 * serie de `THRESHOLDS`, que siguen siendo el comportamiento de siempre. Es la
 * misma gramática que `weighIns`: lo no configurado no cambia nada.
 *
 * Vive en el protocolo porque ES la misma decisión que el resto de él —qué le
 * pides y cuándo te importa— y en la plantilla NO se compara ni se aplica
 * (`NOT_COMPARED_KEYS` en `lib/protocolTemplate.js`): la vara es de la persona,
 * no de tu forma de trabajar en general.
 */
// ── Cuándo se le pide el check-in ──────────────────────────────────────────

/**
 * EL HORARIO DE LA SEMANA: lo que Coachway junta en «check-in form & schedule»
 * y aquí no existía en absoluto.
 *
 * ══ Por qué esto tenía que estar en el protocolo ═══════════════════════════
 *
 * El check-in era semanal **por convención del código**: no había ni día, ni
 * frecuencia, ni recordatorio en ninguna parte. O sea que la aplicación decidía
 * por el entrenador algo que es suyo, y encima no lo decía.
 *
 *   · `weekday` — qué día se le pide (0 lunes … 6 domingo).
 *   · `everyWeeks` — cada cuántas semanas. `1` es todas.
 *   · `remindAfter` — a los cuántos días se le recuerda si no lo ha entregado.
 *     **`0` es «no se lo recuerdes»**, no «cero días»: la misma gramática que
 *     los pesajes y las varas de aviso.
 *
 * ══ Y desde «Una sola cita», este horario NO decide la revisión ════════════
 *
 * Había dos verdades sobre la misma pregunta —«¿cuándo le toca?»— guardadas en
 * dos claves con dos formas y dos numeraciones del día de la semana:
 *
 *   · `preferences.checkin` (0–6, `everyWeeks`), que la lee `domain/calendar.js`
 *     y de la que cuelgan la cola de revisiones, el calendario y `reviewState`.
 *     **Es la verdad del producto.**
 *   · `preferences.protocol.schedule` (1–7, `every`), que se editaba en Taller →
 *     Protocolos —o sea, en la pantalla donde el entrenador la busca— y no la
 *     leía el motor de la revisión: decidía `remindAfter` y nada más.
 *
 * El entrenador leía ahí «le pides el check-in los jueves, cada 2 semanas», lo
 * cambiaba, y la aplicación seguía reclamando el lunes. La pantalla que más se
 * parecía a la decisión era la única que no la tomaba.
 *
 * Ahora el horario es **el valor por defecto**: al aplicar un protocolo a un
 * cliente que todavía no tiene día se le siembra el suyo (ver
 * `checkinDesdeHorario`), y nunca pisa un día ya elegido en silencio. La cita
 * vigente de cada persona vive en un solo sitio, `preferences.checkin`.
 *
 * ── Y la numeración es UNA ─────────────────────────────────────────────────
 * `weekday` de 0 a 6 empezando en lunes, que es el orden de `WEEKDAYS` en
 * `domain/calendar.js` y el que ya tenían guardado los clientes. Lo escrito con
 * la forma vieja (`day` de 1 a 7, `every`) se traduce al leerlo, así que no hay
 * migración: el primer guardado lo deja en la forma nueva.
 *
 * ── Y vive AQUÍ, dentro del protocolo, a propósito ─────────────────────────
 * Porque tiene que llegarle al cliente: el recordatorio se calcula en su portal
 * y el portal solo lee su propia fila. Cualquier clave que no pase por
 * `clientProtocol` desaparece en el primer guardado, así que el saneado entra en
 * el mismo sitio que el valor por defecto.
 */
/* `plural` va escrito y no calculado: en español los cinco primeros son
   invariables («los lunes») y los dos del fin de semana no («los sábados»).
   Una regla de sufijo acertaría cinco de siete, que es peor que una lista.

   Los ids son los de `WEEKDAYS` (`domain/calendar.js`): lunes es 0. Una prueba
   vigila que las dos listas no se separen — cruzarlas con un desfase de uno es
   exactamente la avería que esta unificación vino a cerrar. */
export const DIAS = [
  { id: 0, label: 'Lunes', corto: 'lunes', plural: 'lunes' },
  { id: 1, label: 'Martes', corto: 'martes', plural: 'martes' },
  { id: 2, label: 'Miércoles', corto: 'miércoles', plural: 'miércoles' },
  { id: 3, label: 'Jueves', corto: 'jueves', plural: 'jueves' },
  { id: 4, label: 'Viernes', corto: 'viernes', plural: 'viernes' },
  { id: 5, label: 'Sábado', corto: 'sábado', plural: 'sábados' },
  { id: 6, label: 'Domingo', corto: 'domingo', plural: 'domingos' },
];

export const EVERY_MAX = 8;
export const REMIND_MAX = 6;

export const defaultSchedule = () => ({ weekday: 0, everyWeeks: 1, remindAfter: 0 });

/**
 * El horario, completado y acotado — y traduciendo la forma vieja.
 *
 * `day` (1–7) y `every` solo se miran cuando no está la clave nueva: así un
 * protocolo guardado antes de la unificación sigue diciendo lo mismo, y uno que
 * ya se haya guardado después no puede volver atrás por una clave residual.
 */
export const sanitizeSchedule = (raw) => {
  const viejoDia = Number.isFinite(Number(raw?.day)) ? clampInt(raw.day, 1, 7, 1) - 1 : null;
  const weekday = raw?.weekday === undefined || raw?.weekday === null ? viejoDia : clampInt(raw.weekday, 0, 6, 0);

  const viejoCada = raw?.every === undefined ? null : clampInt(raw.every, 1, EVERY_MAX, 1);
  const cada = raw?.everyWeeks === undefined || raw?.everyWeeks === null ? viejoCada : clampInt(raw.everyWeeks, 1, EVERY_MAX, 1);

  return {
    weekday: weekday === null ? 0 : weekday,
    everyWeeks: cada === null ? 1 : cada,
    remindAfter: clampInt(raw?.remindAfter, 0, REMIND_MAX, 0),
  };
};

/**
 * LA CITA QUE SIEMBRA ESTE HORARIO, o `null` si esa persona ya tiene la suya.
 *
 * ══ El protocolo propone, la ficha decide ══════════════════════════════════
 *
 * Un cliente nace con `weekday: null` —sin revisión— y sin día no se le reclama
 * nada ni aparece en ninguna cola: el bucle del producto estaba apagado por
 * defecto para todo el mundo hasta que alguien, normalmente el propio cliente,
 * elegía un día. Aplicarle un protocolo con horario lo enciende.
 *
 * Y no pisa lo elegido: quien ya tiene día se lo queda. Cambiárselo a todos es
 * una operación con nombre y con consecuencias a la vista —«8 de tus 14 clientes
 * tienen otro día»—, no un efecto colateral de guardar el protocolo.
 */
export const checkinDesdeHorario = (schedule, preferences) => {
  const suyo = preferences?.checkin;
  if (Number.isInteger(suyo?.weekday) && suyo.weekday >= 0 && suyo.weekday <= 6) return null;

  const { weekday, everyWeeks } = sanitizeSchedule(schedule);
  return { weekday, everyWeeks };
};

/** El día en que se pide, dicho como se lee. */
export const diaDe = (schedule) =>
  DIAS.find((d) => d.id === sanitizeSchedule(schedule).weekday)?.corto || 'lunes';

/** Y en plural, para «se lo entregas los martes». */
export const diasDe = (schedule) =>
  DIAS.find((d) => d.id === sanitizeSchedule(schedule).weekday)?.plural || 'lunes';

/** ¿Se le recuerda si no lo entrega? `0` es «no lo recuerdes». */
export const recuerdaA = (protocol) => sanitizeSchedule(protocol?.schedule).remindAfter;

// ── De dónde salen las calorías al ajustar ─────────────────────────────────

/**
 * DE DÓNDE SALIERON LAS CALORÍAS LA ÚLTIMA VEZ QUE AJUSTASTE SU DIETA.
 *
 * ══ Por qué esto NO tiene pantalla de configuración ════════════════════════
 *
 * La aplicación DEDUCÍA de qué campo habías tecleado qué querías hacer: si
 * cambiaban los hidratos mandaba hidratos, si no mandaba kcal. Con lo cual tocar
 * los dos campos en el mismo guardado aplicaba el de hidratos en silencio, y el
 * de kcal que acababas de escribir no hacía nada.
 *
 * La heurística se sustituye por una pregunta hecha donde se ejecuta —«¿de dónde
 * salen las 200 kcal?», arriba de la ventana del reajuste—. Y esto es **la
 * respuesta que diste la última vez con esta persona**, no un ajuste que se
 * configura en ninguna parte.
 *
 * Tuvo su bloque en el protocolo durante unas horas y no se sostenía: la ventana
 * ya ofrece las mismas tres opciones en el momento en que importa, así que era
 * una pantalla para algo que está a un clic de donde se decide. Nadie iría a
 * cambiarlo ahí. La prueba de si una preferencia merece pantalla es justo esa.
 *
 * ── Por eso lo escribe la ventana ──────────────────────────────────────────
 * `EditarObjetivo` lo guarda al aplicar, y solo cuando has elegido algo distinto
 * de lo que traías puesto: quien siempre baja hidratos nunca escribe nada, y
 * quien con Marta recorta de los dos lo dice una vez y no vuelve a decirlo.
 *
 * «A mano» no se recuerda — son unos gramos concretos para un ajuste concreto, y
 * repetirlos tres semanas después sería inventarse una decisión que nadie tomó.
 *
 * ── Y es de la PERSONA, así que no se compara ──────────────────────────────
 * Va en `NOT_COMPARED_KEYS` (`lib/protocolTemplate.js`) con los servicios y la
 * vara de las alertas: «poner al día» no puede resetear a la general algo que se
 * afinó con alguien concreto, y sobre todo no puede marcarle como excepción a la
 * plantilla por haber contestado una pregunta dentro de una ventana.
 *
 * Las dos primeras son las dos que la aplicación ya sabía hacer, dichas por su
 * nombre en vez de adivinadas. La tercera —mantener el reparto— es la que hacía
 * falta escribir a mano tres veces: bajar los tres a la vez para que los
 * porcentajes no se muevan.
 *
 * Cada una es un ancla de `cuadrarMacros`: dice quién absorbe el cambio y de ahí
 * salen los gramos. Lo que no está aquí es «a mano», que no es una respuesta
 * repetible sino unos gramos concretos, y por eso no se guarda.
 */
export const AJUSTES = [
  {
    id: 'carbs',
    label: 'Hidratos',
    hint: 'Lo normal en una bajada: la proteína y las grasas se quedan como están.',
  },
  {
    id: 'kcals',
    label: 'Hidratos y grasas',
    hint: 'Se recorta de los dos en la misma proporción. La proteína no se toca.',
  },
  {
    id: 'reparto',
    label: 'Los tres',
    hint: 'Los tres bajan a la vez: el porcentaje de cada macro no cambia.',
  },
];

const AJUSTE_IDS = AJUSTES.map((a) => a.id);

/** Hidratos, que es lo que hace un entrenador nueve de cada diez veces. */
export const defaultAjuste = () => 'carbs';

const sanitizeAjuste = (raw) => (AJUSTE_IDS.includes(raw) ? raw : defaultAjuste());

/** De dónde salen las calorías al ajustar, según este protocolo. */
export const ajusteDe = (protocol) => sanitizeAjuste(protocol?.ajuste);

export const ALERT_DAYS = [
  { id: 'training', label: 'Sin entrenar', hint: 'Días sin registrar un entreno antes de avisarte.' },
  { id: 'weight', label: 'Sin pesarse', hint: 'Días sin un pesaje antes de avisarte.' },
];

export const ALERT_DAYS_MAX = 60;

export const defaultAlertDays = () => ({ training: 0, weight: 0 });

/** Enteros de 0 a 60; cualquier otra cosa —o nada— es «la vara general». */
const sanitizeAlertDays = (raw) => {
  const out = {};
  for (const { id } of ALERT_DAYS) {
    const n = Number(raw?.[id]);
    out[id] = Number.isFinite(n) && n > 0 ? Math.min(ALERT_DAYS_MAX, Math.round(n)) : 0;
  }
  return out;
};


// ── Qué NO ve en su app ────────────────────────────────────────────────────

/**
 * Las cifras que se le pueden ocultar A ESTA PERSONA en su portal.
 *
 * ══ Por qué un producto de medir tiene que saber callarse ═══════════════════
 *
 * Hay clientes a los que la báscula les hace daño. No es un caso raro ni
 * delicado de nombrar: quien viene de años de dietas, quien está saliendo de un
 * trastorno de la conducta alimentaria, o simplemente quien se pesa cuatro veces
 * al día y decide cómo va a estar el resto de la jornada según lo que ponga. Con
 * esas personas se trabaja igual —se pesan, se les cuenta la comida, se ajusta—
 * pero **el número no vuelve a ellas**: lo lee el entrenador y le cuenta lo que
 * hay que contar.
 *
 * Hasta ahora la aplicación no podía hacer eso. El peso y las kcal salían en su
 * portada, en su check-in, en sus fotos y en su dieta, así que el entrenador que
 * lleva a esa persona tenía dos salidas: sacarla de la aplicación o pedirle que
 * no mire. Las dos son peores que un interruptor.
 *
 * ── Es de la PERSONA, no de tu forma de trabajar ────────────────────────────
 * Como los servicios y como la vara de las alertas: se decide por cliente y
 * «poner al día» no lo toca (`NOT_COMPARED_KEYS` en `lib/protocolTemplate.js`).
 * Empujar esto desde una plantilla sería devolverle las cifras a quien se las
 * acabas de quitar, y esa es la peor consecuencia que puede tener un botón.
 *
 * ── Lo que NO hace ──────────────────────────────────────────────────────────
 * Ocultar no es dejar de medir. El cliente sigue anotando sus pesajes si su
 * entrenador se los pide —el gesto es suyo y la báscula es suya—, sus registros
 * siguen entrando en el historial, y la revisión de la semana sigue cerrándose
 * con el promedio: lo que desaparece es **lo que la aplicación le devuelve**.
 * Tampoco es un candado: quien tiene su peso en el móvil lo sabe. Es dejar de
 * ponérselo delante veinte veces al día, que es de lo que se trata.
 */
export const HIDDEN_INFO = [
  {
    id: 'weight',
    area: 'body',
    label: 'Ocultarle el peso',
    hint: 'Sigue anotando sus pesajes si se los pides, pero su app no le devuelve ninguna cifra: ni la curva, ni el promedio, ni la variación.',
  },
  {
    id: 'nutrition',
    area: 'nutrition',
    label: 'Ocultarle las calorías y los macros',
    hint: 'Ve su menú entero —qué come y cuánto— sin una sola cifra de kcal ni de macros.',
  },
];

const HIDDEN_IDS = HIDDEN_INFO.map((h) => h.id);

/** Nada oculto. Lo de siempre: quien no toque esto no puede notar el cambio. */
export const defaultHidden = () => ({ weight: false, nutrition: false });

/* Solo el `true` literal oculta. Una clave a medio escribir —o traída de una
   versión futura— no puede dejar a un cliente sin sus cifras por accidente: el
   silencio se elige, no se hereda de un valor raro.

   ══ Y una MEDIDA puede entrar aquí el primer día ══════════════════════════
   No hace falta que esté en `HIDDEN_INFO`: cualquier id con un `true` se
   conserva. Es lo que permite ocultarle una glucosa a alguien sin esperar a una
   versión — hay gente a la que un número de glucosa en su portal le hace el
   mismo daño que la báscula, y la lista fija habría hecho falta tocarla a mano
   para cada medida nueva. Ver `domain/medidas.js`. */
const sanitizeHidden = (raw) => {
  const out = {};
  for (const id of HIDDEN_IDS) out[id] = raw?.[id] === true;
  for (const [id, valor] of Object.entries(raw || {})) {
    if (out[id] === undefined && valor === true) out[id] = true;
  }
  return out;
};

/** Un entero de 0 a 7. Cualquier otra cosa —o nada— es «no lo pido». */
const sanitizeWeighIns = (raw) => {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(WEIGH_INS_MAX, Math.round(n));
};

// ── El catálogo de preguntas ───────────────────────────────────────────────

/**
 * Tipos de pregunta.
 *
 * La división que de verdad manda no es cuántos hay, sino cuál se puede MEDIR:
 * una escala se promedia, se compara entre semanas y se dibuja —es la que da
 * valor a todo esto—, y el resto se lee. Eso lo declara `esSerie` y lo pregunta
 * todo el que dibuja.
 *
 * ══ Eran DOS, y eso era el techo del cuestionario ══════════════════════════
 *
 * «Una escala o un texto», y ya. Mientras tanto, el constructor de formularios
 * libres ofrecía sí/no, elegir una, elegir varias, un número y una fecha con sus
 * controles escritos (`Client/CampoLibre`). O sea que el mismo cliente contestaba
 * dos formularios de la misma aplicación con dos vocabularios de control
 * distintos, y el que se quedaba corto era el que se contesta todas las semanas.
 *
 * El argumento que sostenía el techo está escrito arriba y era sobre el «sí/no»:
 * «una respuesta binaria es una escala de dos valores, y desdoblarla obligaría a
 * que cada gráfico supiera tratarla». La primera mitad es falsa —«¿has podido
 * entrenar los días que tocaban?» no es una cantidad, y pintarla como una rampa
 * de dos escalones dice que sí— y la segunda se arregla de una vez: lo que un
 * gráfico sabe leer es lo que `esSerie` declara, y todo lo demás se lee como
 * respuesta. Ni un consumidor pregunta ya «¿no es texto?» para dar por hecho que
 * es una cifra.
 *
 *   · `scale`  — una cantidad de `min` a `max`. Es lo que se dibuja como serie.
 *   · `text`   — palabras.
 *   · `bool`   — sí o no.
 *   · `choice` — una de varias (`ops`).
 *   · `multi`  — varias de varias (`ops`).
 *   · `number` — una cifra suelta.
 *   · `zone`   — dónde le duele: un cuerpo y sus zonas (`ZONAS`).
 *
 * ══ Y TRES COSAS QUE NO SON UN TIPO, PERO HACEN QUE NO SE PAREZCAN ════════
 *
 * Con siete tipos y nueve escalas seguidas, el cuestionario de la semana se veía
 * como lo que era: nueve rampas idénticas de diez barras, una debajo de otra,
 * distinguidas solo por el enunciado. El tipo no es lo único que tiene que
 * cambiar de una pregunta a otra.
 *
 *   · `instrumento` — CON QUÉ SE CONTESTA. No un icono distinto en el mismo
 *     control, sino un control distinto. Ver más abajo.
 *   · `anclas` — qué significan las dos puntas de la escala, dicho debajo de
 *     ellas: «Nada» / «Clavada» en la adherencia, «Por los suelos» / «A tope»
 *     en la energía. Cada escala pasa a tener su vocabulario, y de paso se
 *     retiran las ayudas que decían «de 1 (nada) a 10 (clavada)» — eso ya lo
 *     dice el dibujo.
 *   · `depende` — que esta pregunta solo se hace si otra trajo respuesta: la
 *     zona del dolor no existe la semana que no ha dolido nada. Ver `seVe`.
 *
 * ══ EL INSTRUMENTO, y por qué murió el `glifo` ═════════════════════════════
 *
 * Antes de esto cada escala traía un ICONO (`glifo`) y los once pasos de la
 * rampa se dibujaban con él: cubiertos la adherencia, un cerebro el estrés, una
 * hoja las digestiones. La intención era que nueve preguntas seguidas no fueran
 * el mismo control nueve veces; el resultado fue que eran el mismo control nueve
 * veces con un dibujo encima, y varios de esos dibujos no significaban nada
 * —unos cubiertos no son la adherencia, son la comida; un cerebro no es el
 * estrés—. Un icono repetido once veces en fila tampoco es un icono: es textura.
 *
 * Lo que cambia de verdad una pregunta no es su dibujo, es CÓMO SE CONTESTA:
 *
 *   · `estrellas` — lo que se VALORA, de 1 a 5. Adherencia, sueño, digestiones.
 *     Cinco estrellas que se llenan: la calificación de toda la vida, que
 *     cualquiera sabe usar sin que se lo expliquen.
 *   · `caras` — lo que se SIENTE, de 1 a 5. Sensaciones, ganas de seguir. Cinco
 *     caras, de torcida a contenta; se elige la que se parece a cómo fue la
 *     semana y no hay número que pensar.
 *   · `deposito` — lo que se GASTA, de 1 a 5. La energía, en tramos de batería.
 *   · sin instrumento — la RAMPA de discos que crecen, de 0 a 10. Es para las
 *     cantidades, que es donde el 0-10 significa algo de verdad: el RPE (que es
 *     una escala del oficio y no se toca), el dolor, el hambre, las agujetas, el
 *     estrés, la fatiga, los entrenos completados.
 *
 * EL INSTRUMENTO MANDA SOBRE EL RANGO. Cinco estrellas son cinco, no diez
 * medias estrellas, así que una pregunta con instrumento trae su `min` y su
 * `max` y ni el constructor ni un protocolo guardado los mueven (ver
 * `sanitizeCustom`). Por eso las ocho que cambiaron de instrumento bajaron de
 * 1-10 a 1-5, y por eso lo ya contestado se convirtió en la migración 0120: una
 * serie que cambia de regla a mitad de camino miente.
 *
 * El instrumento NO se retoca desde el constructor, igual que la condición: es
 * del catálogo. Una pregunta inventada por el entrenador no lleva ninguno y sale
 * en la rampa — darle un instrumento sería decidir por él qué clase de cosa está
 * preguntando.
 *
 * `number` NO es «una medida». Una medida (`domain/medidas.js`) es un número con
 * unidad, decimales y rango de cordura tomado con un aparato, aterriza en la
 * antropometría y dibuja su serie; esto es una cifra que alguien cuenta —días,
 * horas, veces— y se queda en la respuesta. Ofrecer aquí algo con unidad sería
 * la segunda puerta a lo que ya existe.
 */
export const QUESTION_KINDS = ['scale', 'text', 'bool', 'choice', 'multi', 'number', 'zone'];

/** Tope de opciones de una pregunta de elegir. El mismo que el formulario libre. */
export const MAX_OPS = 8;

/**
 * LAS ZONAS DEL CUERPO, para «¿dónde te ha molestado?».
 *
 * ══ Por qué un cuerpo y no un campo de texto ═══════════════════════════════
 *
 * `painZone` llevaba desde el principio siendo texto libre, y el texto libre de
 * una zona no se puede leer dos veces: «hombro», «hombro dcho», «el deltoides»,
 * «el mismo de siempre». Son cuatro respuestas a la misma pregunta y ninguna se
 * puede contar, ni filtrar, ni poner al lado de la anterior para ver si aquello
 * se ha movido. Una molestia que vuelve tres semanas seguidas es de las pocas
 * cosas que esta aplicación tiene que ver sola, y no podía.
 *
 * Con zonas cerradas sí: la respuesta es una lista de ids y la misma lista de
 * hace un mes es comparable. Y se señalan sobre la figura del oficio —la misma
 * silueta de la guía de medición—, que es como se señala dónde duele.
 *
 * ── El reparto ────────────────────────────────────────────────────────────
 * Catorce zonas, izquierda y derecha donde el lado importa (el hombro, el codo,
 * la cadera, la rodilla, el tobillo) y una sola donde no (la espalda, el cuello).
 * No es una lámina de anatomía: quien contesta es el cliente, no un
 * fisioterapeuta, y «lumbares» es lo que él sabe decir.
 *
 * `vista` reparte las zonas entre las dos figuras, igual que los pliegues.
 */
export const ZONAS = [
  { id: 'cuello', label: 'Cuello', vista: 'frente', x: 65, y: 44 },
  { id: 'hombroD', label: 'Hombro dcho.', vista: 'frente', x: 41, y: 60 },
  { id: 'hombroI', label: 'Hombro izq.', vista: 'frente', x: 89, y: 60 },
  { id: 'codoD', label: 'Codo dcho.', vista: 'frente', x: 30, y: 118 },
  { id: 'codoI', label: 'Codo izq.', vista: 'frente', x: 100, y: 118 },
  { id: 'muneca', label: 'Muñecas', vista: 'frente', x: 30, y: 136 },
  { id: 'pecho', label: 'Pecho', vista: 'frente', x: 65, y: 74 },
  { id: 'abdomen', label: 'Abdomen', vista: 'frente', x: 65, y: 116 },
  { id: 'caderaD', label: 'Cadera dcha.', vista: 'frente', x: 47, y: 146 },
  { id: 'caderaI', label: 'Cadera izq.', vista: 'frente', x: 83, y: 146 },
  { id: 'rodillaD', label: 'Rodilla dcha.', vista: 'frente', x: 48, y: 200 },
  { id: 'rodillaI', label: 'Rodilla izq.', vista: 'frente', x: 82, y: 200 },
  { id: 'tobilloD', label: 'Tobillo dcho.', vista: 'frente', x: 48, y: 246 },
  { id: 'tobilloI', label: 'Tobillo izq.', vista: 'frente', x: 82, y: 246 },
  { id: 'cervicales', label: 'Cervicales', vista: 'espalda', x: 65, y: 46 },
  { id: 'dorsales', label: 'Dorsales', vista: 'espalda', x: 65, y: 84 },
  { id: 'lumbares', label: 'Lumbares', vista: 'espalda', x: 65, y: 126 },
  { id: 'gluteos', label: 'Glúteos', vista: 'espalda', x: 65, y: 152 },
  { id: 'isquios', label: 'Isquios', vista: 'espalda', x: 50, y: 180 },
  { id: 'gemelos', label: 'Gemelos', vista: 'espalda', x: 50, y: 222 },
];

/** Una zona por su id, para poder escribir lo contestado con sus palabras. */
export const zonaById = (id) => ZONAS.find((z) => z.id === id) || null;

/**
 * Lo contestado a una pregunta de zonas, como lista de ids limpia.
 *
 * Tolera una CADENA, y eso no es defensa por si acaso: `painZone` era texto
 * libre y lleva meses guardando frases. Lo que se escribió entonces no se puede
 * convertir en zonas —«el mismo de siempre» no es un id— pero sí se puede seguir
 * leyendo, así que se devuelve aparte en vez de tirarse. Ver `ZonaDelCuerpo`.
 */
export const zonasDe = (valor) => {
  if (Array.isArray(valor)) return valor.filter((id) => zonaById(id));
  return [];
};

/** Y lo que quedó escrito a mano, si esta respuesta es de las viejas. */
export const zonaEscrita = (valor) =>
  typeof valor === 'string' && valor.trim() !== '' ? valor.trim() : '';

/**
 * CÓMO SE LLAMA cada instrumento cuando hay que nombrarlo por escrito.
 *
 * El control se explica solo —cinco estrellas son cinco— pero las pantallas del
 * entrenador sí tienen que decirlo con palabras: el renglón que resume una
 * pregunta y la nota que explica por qué su escala no se puede tocar. Escrito
 * una vez, porque la vez que estuvo escrito dos, una decía «depósito» y la otra
 * «batería».
 *
 * `dice` abre frase (el renglón del resumen); `frase` va dentro de una.
 */
export const INSTRUMENTOS = {
  estrellas: { dice: 'Estrellas', frase: 'estrellas' },
  caras: { dice: 'Caras', frase: 'caras' },
  deposito: { dice: 'Depósito', frase: 'un depósito' },
};

/**
 * CÓMO SE CONTESTA esta pregunta, dicho en un renglón.
 *
 * Lo escribían dos pantallas a mano y las dos con el mismo `if` de dos ramas:
 * «Escala 1–10» o «Texto libre · no se puede medir». Con siete tipos eso pasa de
 * ser un atajo a ser mentira — una de elegir con tres opciones se anunciaba como
 * texto libre en la pantalla donde el entrenador decide si la usa.
 *
 * Dice además cuál ENTRA EN UNA SERIE, que es la mitad de lo que se viene a
 * saber aquí: todo lo demás se lee, no se dibuja.
 */
export const dicePregunta = (q) => {
  switch (q?.kind) {
    /* Con instrumento se nombra el instrumento, no «Escala»: es lo que hace el
       renglón verdad. «Escala 1–5» en «Energía» describe el rango de algo que
       el cliente ve como un depósito, y el entrenador que lee esa línea está
       decidiendo justo si esa pregunta se parece a las de al lado. */
    case 'scale':
      return `${INSTRUMENTOS[q.instrumento]?.dice || 'Escala'} ${q.min ?? 1}–${q.max ?? 10}${
        q.lowerIsBetter ? ' · menos es mejor' : ''
      }`;
    case 'bool':
      return 'Sí o no · no se dibuja';
    case 'choice':
    case 'multi': {
      const n = (q.ops || []).length;
      const verbo = q.kind === 'choice' ? 'Elegir una' : 'Elegir varias';
      return `${verbo} de ${n} · no se dibuja`;
    }
    case 'number':
      return 'Un número suelto · no se dibuja';
    case 'zone':
      return 'Zonas del cuerpo · no se dibuja';
    default:
      return 'Texto libre · no se puede medir';
  }
};

/**
 * Lo contestado, EN PALABRAS, para donde no cabe el control.
 *
 * El registro de sensaciones es una línea por sesión con sus respuestas en
 * píldoras: ahí no entra ni una rampa ni un cuerpo entero, y hasta ahora todo lo
 * que no era texto se imprimía tal cual —que con una lista de zonas produce
 * «hombroD,lumbares», o sea el id de la base de datos delante del cliente—.
 *
 * Devuelve `''` cuando no hay nada contestado: quien lo llama no tiene que
 * volver a comprobarlo.
 */
export const diceRespuesta = (question, valor) => {
  if (!hayRespuesta(valor)) return '';
  if (question?.kind === 'zone') {
    const dichas = zonasDe(valor).map((id) => zonaById(id).label);
    return dichas.length > 0 ? dichas.join(', ') : zonaEscrita(valor);
  }
  /* El sí/no se guarda como `si`/`no` —es lo que compara una regla— y se lee
     como «Sí» y «No», que es lo que contestó. */
  if (question?.kind === 'bool') return valor === 'si' ? 'Sí' : 'No';
  if (Array.isArray(valor)) return valor.join(', ');
  return String(valor).trim();
};

/**
 * Preguntas de serie. Salen de lo que se pregunta de verdad en una revisión, no
 * de una lista bonita:
 *
 *   · El RPE de sesión es el estándar del oficio y no tiene dirección buena o
 *     mala —un 9 puede ser lo previsto—, por eso `neutral`.
 *   · La fatiga, el dolor, las agujetas y el estrés van al revés que el resto:
 *     cuanto más bajo, mejor. `lowerIsBetter` es lo que hace que una subida se
 *     pinte como un problema y no como un logro.
 *   · El dolor y las agujetas empiezan en CERO, porque «no me duele nada» es una
 *     respuesta real y frecuente; forzar un mínimo de 1 la haría imposible de
 *     dar y ensuciaría todas las series con un uno que significa cero.
 */
export const SESSION_QUESTIONS = [
  {
    id: 'rpe',
    label: 'Esfuerzo de la sesión',
    short: 'RPE',
    kind: 'scale',
    min: 1,
    max: 10,
    anclas: ['Muy suave', 'No podía más'],
    neutral: true,
    color: 'var(--data-violet)',
  },
  {
    id: 'fatigue',
    label: 'Fatiga al acabar',
    short: 'Fatiga',
    kind: 'scale',
    min: 1,
    max: 10,
    anclas: ['Entero', 'Vacío'],
    lowerIsBetter: true,
    /* ── Violeta, con el esfuerzo (20 sep) ─────────────────────────────────
       Era `--data-orange`, tinta retirada por confundirse con el naranja del
       aviso. De las ocho preguntas medibles de la sesión y las seis tintas
       categóricas, dos parejas tienen que compartir; ésta es la más obvia: el
       esfuerzo y la fatiga son LA MISMA sesión medida dos veces —lo que costó
       y cómo acabaste—, igual que el peso y su ritmo en `metrics.js`. */
    color: 'var(--data-violet)',
  },
  {
    id: 'pain',
    label: 'Dolor o molestias',
    short: 'Dolor',
    kind: 'scale',
    min: 0,
    max: 10,
    anclas: ['Nada', 'Mucho'],
    lowerIsBetter: true,
    color: 'var(--data-rose)',
  },
  {
    /*
      ── De texto libre a ZONAS, el 14 de septiembre ────────────────────────
      Era `kind: 'text'`, y el texto libre de una zona no se puede leer dos
      veces: «hombro», «hombro dcho», «el deltoides» y «el mismo de siempre» son
      cuatro respuestas a la misma pregunta y ninguna se puede contar ni poner al
      lado de la de la semana pasada. Lo ya guardado se sigue leyendo tal cual
      (ver `zonaEscrita`): cambia el control, no lo que había escrito.
    */
    id: 'painZone',
    label: '¿Dónde te ha molestado?',
    short: 'Zona',
    hint: 'Marca en el dibujo dónde',
    kind: 'zone',
    /* Sin dolor no hay sitio que señalar. Ver `depende`. */
    depende: { de: 'pain', desde: 1 },
  },
  {
    id: 'sleep',
    label: 'Cómo dormiste anoche',
    short: 'Sueño',
    kind: 'scale',
    instrumento: 'estrellas',
    min: 1,
    max: 5,
    anclas: ['Fatal', 'De un tirón'],
    color: 'var(--data-blue)',
  },
  {
    id: 'energy',
    label: 'Energía',
    short: 'Energía',
    kind: 'scale',
    instrumento: 'deposito',
    min: 1,
    max: 5,
    anclas: ['Por los suelos', 'A tope'],
    /* Teal, con las sensaciones generales: la segunda pareja de la sesión (ver
       «Fatiga»). Energía y ánimo son el mismo eje —cómo estás— y de hecho se
       preguntan seguidas. Era `--data-lime`, que se retira. */
    color: 'var(--data-teal)',
  },
  {
    id: 'soreness',
    label: 'Agujetas antes de empezar',
    short: 'Agujetas',
    kind: 'scale',
    min: 0,
    max: 10,
    anclas: ['Ninguna', 'Muchas'],
    lowerIsBetter: true,
    color: 'var(--data-amber)',
  },
  {
    id: 'stress',
    label: 'Estrés del día',
    short: 'Estrés',
    kind: 'scale',
    min: 1,
    max: 10,
    anclas: ['Ninguno', 'Muchísimo'],
    lowerIsBetter: true,
    color: 'var(--data-pink)',
  },
  {
    id: 'mood',
    label: 'Sensaciones generales',
    short: 'Ánimo',
    kind: 'scale',
    instrumento: 'caras',
    min: 1,
    max: 5,
    anclas: ['Mal', 'Muy bien'],
    color: 'var(--data-teal)',
  },
  {
    id: 'note',
    label: 'Algo que quieras contarme',
    short: 'Nota',
    kind: 'text',
  },
];

/**
 * EL JUICIO DE UNA RESPUESTA DE ESCALA, para el color de su barrita: es el
 * semáforo de la casa («el semáforo juzga»), y aquí sí hay de qué juzgar porque
 * la pregunta dice hacia dónde es mejor (`lowerIsBetter`). La fatiga y el dolor
 * no lo llevan escrito en los protocolos viejos y se leen como en
 * `PanelEntreno`: menos es mejor.
 *
 * Vive aquí y no en el portal desde que la usan dos pantallas: las barritas de
 * «Hoy» del cliente y las de «Cómo lo lleva» del resumen (19 sep). Un solo
 * juicio, o el mismo hambre sale verde en una y naranja en la otra.
 *
 * @returns {'bien'|'medio'|'mal'}
 */
export const tonoDeEscala = (valor, max, q) => {
  const menosEsMejor = q.lowerIsBetter ?? (q.id === 'fatigue' || q.id === 'pain');
  const parte = max > 0 ? Math.min(1, Math.max(0, valor / max)) : 0;
  const bueno = menosEsMejor ? 1 - parte : parte;
  return bueno >= 0.7 ? 'bien' : bueno > 0.4 ? 'medio' : 'mal';
};

/* ==========================================================================
   El cuestionario del check-in
   --------------------------------------------------------------------------
   ══ Por qué un catálogo aparte y no las mismas preguntas ════════════════════

   Las de arriba se contestan **al terminar de entrenar**, de pie en el gimnasio
   y con el móvil en la mano: hablan de UNA sesión. «¿Cómo de duro ha sido?»,
   «¿te ha dolido algo?». Son preguntas de dos segundos sobre lo que acaba de
   pasar.

   Las de aquí se contestan **el domingo**, sentado, cerrando la semana. Hablan de
   siete días: si ha podido seguir la dieta, si ha pasado hambre, si ha dormido,
   si le sigue apeteciendo. Nada de eso tiene sentido preguntarlo al bajar de la
   prensa, y el RPE de una sesión concreta no significa nada como resumen de la
   semana.

   Mezclarlas en una lista obligaría a que cada pregunta llevara una marca de
   dónde se hace, y a que el entrenador la leyera en cada una para no poner
   «¿dónde te ha molestado?» en el check-in. Dos catálogos y dos listas: cada
   pantalla ofrece lo que se contesta en ella.

   ── Lo que sí se comparte ───────────────────────────────────────────────────
   La FORMA (`kind`, `min`, `max`, `lowerIsBetter`, `color`), que es lo que hace
   que `SessionFeedback` las pinte sin tocar una línea, y las preguntas PROPIAS
   del entrenador: las suyas valen para las dos listas, porque las escribió él
   sabiendo para qué.
   ========================================================================== */

/**
 * Lo que se pregunta al cerrar una semana.
 *
 * Salen de lo que de verdad decide un ajuste en una revisión. La adherencia va
 * primera porque es la que explica casi todos los resultados: un plan que no se
 * ha seguido no es un plan que no funciona, y sin preguntarlo las dos cosas se
 * parecen mucho desde fuera.
 *
 * `lowerIsBetter` en hambre y estrés: cuanto más bajo, mejor. Es lo que hace que
 * una subida se pinte como un problema y no como un logro.
 *
 * El hambre empieza en CERO como el dolor de las sesiones: «no he pasado nada»
 * es una respuesta real y frecuente, y forzar un mínimo de 1 ensuciaría la serie
 * con un uno que significa cero.
 */
export const CHECKIN_QUESTIONS = [
  {
    id: 'adherence',
    label: 'Adherencia a la dieta',
    short: 'Dieta',
    kind: 'scale',
    instrumento: 'estrellas',
    min: 1,
    max: 5,
    anclas: ['Nada', 'Clavada'],
    /* ── El ámbar de la comida (20 sep) ────────────────────────────────────
       Era `--data-lime`, tinta retirada. Va con las digestiones, que es su
       consecuencia: cumplir la dieta y cómo te sienta son la misma pregunta
       en dos momentos.

       Ojo: ésta es la adherencia a la DIETA. La del entrenamiento vive en
       `metrics.js` y va en teal con las series efectivas. Dos preguntas
       distintas con el mismo nombre y, por eso mismo, con tinta distinta. */
    color: 'var(--data-amber)',
  },
  {
    id: 'hunger',
    label: 'Hambre',
    short: 'Hambre',
    kind: 'scale',
    min: 0,
    max: 10,
    anclas: ['Nada', 'Muchísima'],
    lowerIsBetter: true,
    /* Rojo, con el dolor de la semana: era `--data-orange`, tinta retirada.
       La semana tiene NUEVE preguntas medibles y la paleta seis tintas, así
       que tres parejas comparten; ésta es la tercera. Hambre y dolor van
       juntas porque las dos son lo mismo para quien lee la semana: avisos del
       cuerpo, y las dos se leen para decidir si el plan aguanta otra semana. */
    color: 'var(--data-rose)',
  },
  {
    id: 'training_done',
    label: 'Entrenamientos que has completado',
    short: 'Entrenos',
    hint: 'Cuántos de los que tocaban',
    kind: 'scale',
    min: 0,
    max: 10,
    anclas: ['Ninguno', 'Todos'],
    color: 'var(--data-violet)',
  },
  {
    id: 'week_sleep',
    label: 'Cómo has dormido esta semana',
    short: 'Sueño',
    kind: 'scale',
    instrumento: 'estrellas',
    min: 1,
    max: 5,
    anclas: ['Fatal', 'De un tirón'],
    color: 'var(--data-blue)',
  },
  {
    id: 'week_energy',
    label: 'Energía durante el día',
    short: 'Energía',
    kind: 'scale',
    instrumento: 'deposito',
    min: 1,
    max: 5,
    anclas: ['Por los suelos', 'A tope'],
    color: 'var(--data-teal)',
  },
  {
    id: 'week_stress',
    label: 'Estrés de la semana',
    short: 'Estrés',
    hint: 'Trabajo, familia, lo que sea',
    kind: 'scale',
    min: 1,
    max: 10,
    anclas: ['Ninguno', 'Muchísimo'],
    lowerIsBetter: true,
    color: 'var(--data-pink)',
  },
  {
    id: 'digestion',
    label: 'Digestiones',
    short: 'Digestión',
    kind: 'scale',
    instrumento: 'estrellas',
    min: 1,
    max: 5,
    anclas: ['Fatal', 'Perfectas'],
    color: 'var(--data-amber)',
  },
  {
    id: 'motivation',
    label: 'Ganas de seguir',
    short: 'Ganas',
    kind: 'scale',
    instrumento: 'caras',
    min: 1,
    max: 5,
    anclas: ['Ninguna', 'Muchas'],
    /* ── Y el gris deja de ser una categoría (20 sep) ──────────────────────
       Era `--data-slate`, y ése es justo el que no puede usarse aquí: el gris
       es LA REFERENCIA —lo comparado, el fantasma, lo que no lleva color— y es
       lo que contesta `readiness.js` cuando una pregunta no dice tinta. Si una
       de las nueve se lo queda, deja de significar «esto no tiene color».

       Violeta, con los entrenos completados: la segunda pareja de la semana.
       Las ganas de seguir y lo que de verdad has entrenado son la misma cosa
       mirada desde dentro y desde fuera. */
    color: 'var(--data-violet)',
  },
  /*
    ── El dolor, que no estaba ───────────────────────────────────────────────
    La sesión lo pregunta desde el principio (`pain`, `painZone`) y la semana no
    lo preguntaba de ninguna manera: un entrenador que quisiera saber si a
    alguien le sigue molestando el hombro al cerrar la semana tenía que
    inventarse la pregunta a mano. Y es de lo poco que puede cambiar un plan
    entero.

    Van en pareja y en este orden, como en la sesión: la cantidad primero y el
    sitio después, porque sin dolor no hay sitio que señalar. Con `week_` delante
    porque son las gemelas semanales de las de sesión —la misma convención que
    `week_sleep`, `week_stress` y `week_energy`— y con ids propios porque son
    series distintas: el dolor de UNA sesión y el de SIETE DÍAS no se promedian
    juntos.
  */
  {
    id: 'week_pain',
    label: 'Dolor o molestias esta semana',
    short: 'Dolor',
    kind: 'scale',
    min: 0,
    max: 10,
    anclas: ['Nada', 'Mucho'],
    lowerIsBetter: true,
    color: 'var(--data-rose)',
  },
  {
    id: 'week_pain_zone',
    label: '¿Dónde te ha molestado?',
    short: 'Zona',
    hint: 'Marca en el dibujo dónde',
    /* Igual que en la sesión: el cuerpo entero solo sale si ha habido dolor.
       Ver `depende`. */
    depende: { de: 'week_pain', desde: 1 },
    kind: 'zone',
  },
  {
    id: 'obstacles',
    label: '¿Qué se te ha hecho más cuesta arriba?',
    short: 'Obstáculos',
    kind: 'text',
  },
  {
    id: 'week_note',
    label: 'Algo que quieras contarme de esta semana',
    short: 'Nota',
    kind: 'text',
  },
];

/** Todas las preguntas de catálogo, de los dos sitios. Para el saneado. */
const CATALOGO = [...SESSION_QUESTIONS, ...CHECKIN_QUESTIONS];

/**
 * Una pregunta del catálogo por su id, sin protocolo delante.
 *
 * ══ Para qué hace falta, si ya está `questionById` ═════════════════════════
 *
 * `questionById(protocol, id)` resuelve lo PROPIO primero y necesita un
 * protocolo. Esto contesta otra pregunta: «¿de qué pregunta de serie salió
 * esto?». Y quien la hace es el modelo de ELEMENTOS —el formulario libre y la
 * estantería—, que no guarda un protocolo sino un `origen`.
 *
 * Un elemento sacado de la estantería copia el enunciado, el rango y las
 * opciones de su pregunta, pero NO lo que no se puede retocar: con qué se
 * contesta (`instrumento`), qué significan las puntas (`anclas`) y de qué color
 * se pinta su serie (`color`). Eso no se copia a propósito —copiarlo sería
 * dejar que se editara— y por eso hay que ir a buscarlo aquí cada vez que se
 * pinta. Ver `Client/CampoLibre`.
 */
export const catalogQuestionById = (id) => (id ? CATALOGO.find((q) => q.id === id) || null : null);

/**
 * Tope de preguntas propias.
 *
 * No es una limitación de producto, es la columna: `preferences` está capada a
 * 8 KB por la migración 0008 y ese tope protege la fila del cliente de que
 * cualquiera con la anon key la engorde. Seis preguntas propias con su etiqueta
 * son unos 500 bytes; el resto del margen es para las preferencias del panel,
 * que comparten la misma columna.
 */
export const MAX_CUSTOM = 6;

/**
 * Color de las preguntas propias: rotan por la paleta de datos.
 *
 * Desde el 20 sep son las SEIS tintas categóricas de la casa y nada más, en el
 * mismo orden que la rueda de las medidas propias (`domain/medidas.js`) — para
 * que la tercera pregunta inventada y la tercera medida inventada no salgan de
 * dos colores según qué pantalla las pinte.
 *
 * Se van el gris y el lima. El gris porque es la referencia y tiene que sobrar
 * (ver «Ganas de seguir» más arriba); el lima porque la paleta se cerró en seis
 * (ver `docs/lenguaje-visual.md` §7.3). Que sean seis y `MAX_CUSTOM` también
 * es lo que garantiza que dos preguntas propias nunca compartan tinta.
 */
const CUSTOM_COLORS = [
  'var(--data-rose)',
  'var(--data-blue)',
  'var(--data-pink)',
  'var(--data-amber)',
  'var(--data-violet)',
  'var(--data-teal)',
];

// ── Perfiles ───────────────────────────────────────────────────────────────

/**
 * Como los perfiles del panel: elegir de una lista es trabajo y casi nadie lo
 * hace. Cada uno responde a una forma real de llevar clientes.
 */
export const PROTOCOL_PRESETS = [
  {
    id: 'off',
    label: 'Nada',
    hint: 'Solo la rutina y los kilos. Sin notas ni preguntas.',
    protocol: { modules: [], questions: [], checkinQuestions: [] },
  },
  {
    id: 'basic',
    label: 'Lo básico',
    hint: 'Tus notas, el logbook del cliente, cómo fue la sesión y cómo fue la semana',
    protocol: {
      modules: ['coachNote', 'clientNote', 'sessionFeedback'],
      questions: ['rpe', 'note'],
      /* Dos preguntas y ninguna más. La adherencia explica casi todos los
         resultados, y la nota abierta recoge lo que no cabe en una escala. Con
         seis, la entrega semanal se abandona a la tercera. */
      checkinQuestions: ['adherence', 'week_note'],
    },
  },
  {
    id: 'performance',
    label: 'Rendimiento',
    hint: 'Para atletas: carga, fatiga acumulada y descanso',
    protocol: {
      modules: ['warmup', 'coachNote', 'clientNote', 'sessionFeedback'],
      questions: ['rpe', 'fatigue', 'soreness', 'sleep', 'note'],
      checkinQuestions: ['training_done', 'week_sleep', 'week_stress', 'motivation', 'week_note'],
    },
  },
  {
    id: 'clinical',
    label: 'Con seguimiento del dolor',
    hint: 'Para readaptación o clientes con molestias: dolor, zona y sensaciones',
    protocol: {
      modules: ['warmup', 'coachNote', 'clientNote', 'sessionFeedback'],
      questions: ['pain', 'painZone', 'rpe', 'mood', 'note'],
      /* El dolor también al cerrar la semana: es el preajuste de readaptación y
         hasta que `week_pain` existió no había forma de preguntarlo ahí. Un
         preajuste que se llama «Con seguimiento del dolor» y solo lo sigue
         sesión a sesión deja fuera justo la lectura que decide el plan. */
      checkinQuestions: ['week_pain', 'week_pain_zone', 'week_sleep', 'week_energy', 'obstacles', 'week_note'],
    },
  },
];

/**
 * Lo que ve un cliente cuyo entrenador no ha tocado nada.
 *
 * Deliberadamente corto. El valor por defecto de un producto configurable es la
 * opinión que da cuando nadie opina, y aquí la opinión es: pregunta poco y
 * pregunta lo que se usa. Tres campos al acabar de entrenar se rellenan; nueve
 * se abandonan a la tercera sesión, y una serie con huecos no se puede leer.
 */
export const defaultProtocol = () => ({
  /* Las dos cosas, que es lo que hacía la aplicación cuando esto no se podía
     elegir. Ver `SERVICES`. */
  services: defaultServices(),
  modules: ['coachNote', 'clientNote', 'sessionFeedback'],
  questions: ['rpe', 'note'],
  /*
    ── Y el cuestionario de la semana, por defecto vacío ─────────────────────
    Sin interruptor propio: **la lista vacía ES el apagado**. Es la misma regla
    que sostiene el resto del producto —lo que no está configurado no existe— y
    ahorra un módulo más que encender antes de poder elegir preguntas.

    Vacío y no con dos preguntas de cortesía porque este paso alarga la entrega
    del cliente, que es el gesto que más cuesta que se haga cada semana. Lo
    añade quien lo quiere.
  */
  checkinQuestions: [],
  custom: [],
  checkin: defaultCheckin(),
  /* Ninguna medida encendida más allá de los dos bloques de siempre: lo que no
     está configurado no existe. Ver `domain/medidas.js`. */
  medidas: [],
  /* Nadie los pide hasta que alguien los pida. Ver `WEIGH_INS_MAX`. */
  weighIns: defaultWeighIns(),
  /*
    Las fotos de progreso, ENCENDIDAS. Es la excepción que ya tienen los
    servicios y por el mismo motivo: es lo que la aplicación hacía antes de que
    esto se pudiera elegir —el asistente de la revisión siempre enseñaba su paso
    de fotos—, y apagárselas a todo el mundo no puede ser lo que pasa cuando
    nadie ha dicho nada. Por eso se apaga solo con un `false` explícito.
  */
  askPhotos: true,
  /* La vara general, hasta que se afine. Ver `ALERT_DAYS`. */
  alertDays: defaultAlertDays(),
  /* Todo a la vista, que es lo que hacía la aplicación antes de que esto se
     pudiera elegir. Ver `HIDDEN_INFO`. */
  hidden: defaultHidden(),
  /* El lunes, todas las semanas y sin recordatorio: la convención de siempre.
     Ver `defaultSchedule`. */
  schedule: defaultSchedule(),
  /* De dónde salen las calorías cuando ajustas una dieta. Ver `AJUSTES`. */
  ajuste: defaultAjuste(),
});

// ── Saneado ────────────────────────────────────────────────────────────────

const isScale = (q) => q?.kind === 'scale';

/**
 * ¿Esta pregunta se puede DIBUJAR?
 *
 * La pregunta que tiene que hacerse todo el que promedia, compara o pinta una
 * línea. Mientras solo hubo escalas y textos, media aplicación preguntaba
 * `kind !== 'text'` y daba por hecho que lo demás era una cifra; con sí/no y
 * elegir una eso empezaría a meter la palabra «Sí» en una serie.
 *
 * Una sola función, y todos los gráficos detrás de ella: el día que entre otro
 * tipo medible se enciende aquí y se enciende en todos los sitios a la vez.
 */
export const esSerie = (q) => isScale(q);

/** ¿Esta pregunta se contesta con palabras? */
export const esTexto = (q) => q?.kind === 'text';

/**
 * ¿Y esta se LEE, pero no con palabras propias del cliente?
 *
 * Sí/no, elegir una, elegir varias, una cifra suelta y las zonas. Ni entran en un
 * gráfico ni se citan como una frase suya: se enseñan como lo que son, la opción
 * que marcó. Existe para que ningún consumidor tenga que enumerar tipos.
 */
export const esRespuesta = (q) => Boolean(q) && !esSerie(q) && !esTexto(q);

/**
 * Lo contestado a una pregunta, ¿está dado?
 *
 * `String(v).trim() !== ''` estaba escrito a mano en nueve sitios y con sí/no y
 * elegir varias deja de valer: una lista vacía se convierte en `''` y una con
 * dos zonas en «hombroD,lumbares», que pasa el filtro por casualidad.
 */
export const hayRespuesta = (valor) => {
  if (valor === null || valor === undefined) return false;
  if (Array.isArray(valor)) return valor.length > 0;
  return String(valor).trim() !== '';
};

/**
 * LO QUE SOLO SE PREGUNTA SI ANTES PASÓ ALGO.
 *
 * «¿Dónde te ha molestado?» con un cuerpo entero de dos figuras y veinte zonas
 * estaba SIEMPRE en la hoja, y la semana en la que no te ha dolido nada —que es
 * la mayoría de las semanas— eso es media pantalla que hay que leer para
 * concluir que no va contigo. Su propia ayuda lo confesaba: «si no te ha
 * molestado nada, déjalo en blanco».
 *
 * Una pregunta que se contesta dejándola en blanco no es una pregunta: es una
 * consecuencia de la anterior. Ahora lo declara la pregunta (`depende`) y el
 * cuerpo aparece al marcar dolor, en el mismo sitio y sin cambiar de pantalla.
 *
 * ── Y si la de la que depende no está, se pregunta ────────────────────────
 * El entrenador puede quitar «Dolor» y dejar la zona. Entonces no hay condición
 * que cumplir y la zona se pregunta siempre: una pregunta que no se puede
 * contestar nunca sería peor que una de más.
 *
 * @param lista Las preguntas de ESTE formulario, para saber si la de la que
 *   depende está puesta. Sin ella se da por presente.
 */
export const seVe = (q, respuestas = {}, lista = null) => {
  const dep = q?.depende;
  if (!dep) return true;
  if (lista && !lista.some((otra) => otra.id === dep.de)) return true;
  const valor = Number(respuestas?.[dep.de]);
  return Number.isFinite(valor) && valor >= (dep.desde ?? 1);
};

/**
 * Las preguntas propias del entrenador, saneadas.
 *
 * ══ UNA PROPIA PUEDE PISAR A UNA DEL CATÁLOGO, Y ESO ES LO QUE HACE ════════
 * ══ QUE EL CATÁLOGO SEA UNA ESTANTERÍA Y NO UNA LISTA DE INTERRUPTORES ═════
 *
 * Hasta aquí, un id que chocara con el catálogo se caía: `questionById`
 * resolvía primero el catálogo, así que la propia quedaba inalcanzable y el
 * entrenador veía la de serie en su sitio sin entender por qué. La salida era
 * tirarla.
 *
 * Pero eso es justo lo que convertía al catálogo en un cajón cerrado: podías
 * ENCENDER «Adherencia a la dieta» y no podías tocarla —ni el enunciado, ni el
 * rango, ni si menos es mejor—. El dueño lo dijo con sus palabras: «son opciones
 * semifijas, no puedes hacer tú una».
 *
 * Ahora una entrada de `custom` con un id del catálogo no es un choque: es EL
 * MISMO objeto, retocado por su entrenador. `questionById` la resuelve antes que
 * al catálogo (ver más abajo, que es la otra mitad del cambio) y la de serie
 * queda de respaldo para quien no la haya tocado.
 *
 * ── Y por qué conserva el id ──────────────────────────────────────────────
 * Porque el id ES la serie. Las respuestas guardadas están indexadas por él, y
 * `color` sale del catálogo para que la línea de la analítica siga siendo la
 * misma línea. Renombrar «Adherencia a la dieta» a «Cómo has comido» no puede
 * partir en dos la gráfica de nadie.
 *
 * ── El tope solo cuenta las de verdad propias ─────────────────────────────
 * `MAX_CUSTOM` acota lo que el entrenador INVENTA, que es lo que puede crecer
 * sin fin. Los retoques del catálogo están acotados por el catálogo mismo, así
 * que gastar el cupo con ellos dejaría sin poder crear nada a quien solo haya
 * ajustado los rangos de las que ya venían.
 */
const sanitizeCustom = (raw) => {
  if (!Array.isArray(raw)) return [];
  const out = [];
  let propias = 0;

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const id = String(item.id || '');
    const label = String(item.label || '').trim().slice(0, 60);
    if (!id || !label) continue;
    if (out.some((q) => q.id === id)) continue;

    /* La del catálogo que ésta retoca, si retoca alguna. Se miran LOS DOS
       catálogos —sesión y check-in—: con uno solo, un retoque de `hunger` en el
       check-in se trataría como una pregunta inventada y perdería su color. */
    const base = CATALOGO.find((q) => q.id === id) || null;
    if (!base) {
      if (propias >= MAX_CUSTOM) continue;
    }

    const kind = QUESTION_KINDS.includes(item.kind) ? item.kind : base?.kind || 'scale';
    const max = Number(item.max);
    const hint = String(item.hint ?? base?.hint ?? '').trim().slice(0, 140);

    /*
      Las opciones de una pregunta de elegir, y solo de ésas.

      Sin opciones no hay pregunta: un «elegir una» con la lista vacía le sale al
      cliente como un renglón con su enunciado y nada debajo, y contestarlo es
      imposible. Cae a texto, que es lo más parecido a lo que quería preguntar y
      lo único que se puede contestar.

      Repetidas fuera —dos botones iguales no son dos respuestas— y ocho como
      mucho, el mismo tope que el formulario libre: lo que no cabe en ocho no es
      una lista de opciones, es una pregunta abierta.
    */
    const ops =
      kind === 'choice' || kind === 'multi'
        ? [...new Set((Array.isArray(item.ops) ? item.ops : []).map((o) => String(o).trim()).filter(Boolean))].slice(
            0,
            MAX_OPS
          )
        : null;
    const tipo = ops && ops.length === 0 ? 'text' : kind;

    /*
      LOS EXTREMOS DE LA ESCALA, que son lo que la hace SUYA.

      Sin esto, nueve preguntas seguidas son nueve rampas idénticas de diez
      barras y lo único que las distingue es el enunciado de arriba. Con ellas,
      cada una dice en sus dos puntas qué significa contestar poco y qué
      significa contestar mucho — y el cliente deja de tener que deducirlo.

      Dos textos, los dos con algo escrito: media pareja es peor que ninguna
      —un extremo rotulado y el otro en blanco se lee como un fallo—. Cortos
      porque van debajo de la primera y de la última barra, no en una línea de
      ayuda. Y si el entrenador no escribe los suyos manda el del catálogo,
      igual que el color.
    */
    const escritas = Array.isArray(item.anclas)
      ? item.anclas.slice(0, 2).map((a) => String(a ?? '').trim().slice(0, 16))
      : null;
    const anclas =
      escritas && escritas.length === 2 && escritas.every(Boolean)
        ? escritas
        : base?.anclas || null;

    out.push({
      id,
      label,
      /* El rótulo corto del catálogo se conserva: es el que cabe en el eje de un
         gráfico, y un recorte a doce caracteres del enunciado nuevo suele salir
         peor que el que ya estaba pensado. */
      short: base?.short || label.slice(0, 12),
      kind: tipo,
      ...(hint ? { hint } : {}),
      ...(ops && ops.length > 0 ? { ops } : {}),
      /* La condición NO se retoca: es del catálogo y describe una relación
         entre dos preguntas suyas. Lo que hace falta es no perderla al
         reescribir el enunciado de la zona — sin esto, cambiarle una palabra
         dejaba el cuerpo entero otra vez en pantalla todas las semanas. */
      ...(base?.depende ? { depende: base.depende } : {}),
      ...(tipo === 'scale'
        ? {
            /* Con qué se contesta, como la condición: es del catálogo y no se
               retoca. Sin heredarlo aquí, cambiarle una palabra al enunciado de
               «Adherencia» le devolvía al cliente una rampa de diez pasos en
               medio de un cuestionario de estrellas y caras. */
            ...(base?.instrumento ? { instrumento: base.instrumento } : {}),
            ...(anclas ? { anclas } : {}),
            /* EL RANGO LO MANDA EL INSTRUMENTO cuando lo hay. Cinco estrellas
               son cinco: un protocolo guardado antes de que la adherencia
               bajara a 1-5 sigue diciendo `max: 10`, y sin esto el cliente se
               encontraría diez estrellas en fila —y guardaría un 8 en una serie
               que ya está en escala de 5—. Lo que el entrenador elige en «Hasta
               dónde llega» es de sus propias preguntas, que no traen ninguno. */
            ...(base?.instrumento
              ? { min: base.min ?? 1, max: base.max ?? 5 }
              : {
                  min: item.min === 0 ? 0 : 1,
                  max: Number.isFinite(max) && max >= 2 && max <= 10 ? Math.round(max) : 10,
                }),
            lowerIsBetter: Boolean(item.lowerIsBetter),
            /* El color de un retoque es EL DEL CATÁLOGO: la serie tiene que
               seguir dibujándose del mismo color que la semana pasada. El de una
               inventada se reparte por orden de aparición entre las propias, sin
               contar los retoques — si no, retocar una movería el color de todas
               las demás. */
            color: base?.color || CUSTOM_COLORS[propias % CUSTOM_COLORS.length],
          }
        : {}),
    });

    if (!base) propias += 1;
  }
  return out;
};

/**
 * El protocolo efectivo de un cliente: lo configurado, completado con los
 * valores por defecto y limpio de lo que la aplicación no conoce.
 *
 * Que un id desconocido se caiga en silencio es lo que permite quitar una
 * pregunta del catálogo en una versión futura sin dejar clientes rotos.
 */
export const clientProtocol = (preferences) => {
  const raw = preferences?.protocol;
  if (!raw || typeof raw !== 'object') return defaultProtocol();

  const custom = sanitizeCustom(raw.custom);
  const customIds = custom.map((q) => q.id);
  /* Cada lista solo acepta ids de SU catálogo, más los propios del entrenador.
     Sin esto, `rpe` colado en el cuestionario del check-in pediría el esfuerzo
     de «la sesión» el domingo, cuando no hay ninguna sesión de la que hablar. */
  const deSesion = new Set([...SESSION_QUESTIONS.map((q) => q.id), ...customIds]);
  const deCheckin = new Set([...CHECKIN_QUESTIONS.map((q) => q.id), ...customIds]);
  const moduleIds = new Set(MODULES.map((m) => m.id));

  const dedupe = (list, valid, fallback) => {
    if (!Array.isArray(list)) return fallback;
    const out = [];
    for (const id of list) {
      if (valid.has(id) && !out.includes(id)) out.push(id);
    }
    return out;
  };

  /* Bloque a bloque y con el de siempre como respaldo: así un estado escrito a
     mano que no exista —o una clave que se retire en el futuro— vuelve a
     «opcional», que es lo que la aplicación hacía antes de poder configurarlo, en
     vez de apagarle a alguien un bloque sin haberlo pedido. */
  const porDefecto = defaultCheckin();
  const checkin = {};
  for (const { id } of CHECKIN_BLOCKS) {
    const modo = raw.checkin?.[id];
    checkin[id] = CHECKIN_MODE_IDS.includes(modo) ? modo : porDefecto[id];
  }
  /*
    ══ Y LA LISTA DEJA DE SER FIJA ═══════════════════════════════════════════

    Los pliegues y los perímetros eran los dos únicos bloques que existían, y un
    estado guardado para cualquier otro id se caía aquí en silencio. Desde que el
    entrenador tiene un vocabulario de medidas propio (`domain/medidas.js`), un
    id que este módulo no conoce no es un error: es una glucosa.

    Se conserva cualquier id con un modo válido, con un tope. La lista de qué
    medidas existen vive en el catálogo del entrenador y no aquí: este módulo
    sanea la FORMA —tres estados y nada más—, no el vocabulario.
  */
  for (const [id, modo] of Object.entries(raw.checkin || {})) {
    if (checkin[id] !== undefined) continue;
    if (Object.keys(checkin).length >= MAX_CHECKIN_BLOCKS) break;
    if (CHECKIN_MODE_IDS.includes(modo)) checkin[id] = modo;
  }

  /*
    Las DEFINICIONES de las medidas encendidas viajan con el protocolo, como las
    preguntas propias y por el mismo motivo: el cliente no puede leer el perfil
    de su entrenador (`profiles` solo deja ver la fila propia, 0002), así que su
    portal no tendría de dónde sacar la unidad ni los decimales. Las pone
    `resolveProtocolo`; aquí solo se acotan.
  */
  const medidas = sanitizeMedidasDelProtocolo(raw.medidas);

  return {
    services: sanitizeServices(raw.services),
    modules: dedupe(raw.modules, moduleIds, defaultProtocol().modules),
    questions: dedupe(raw.questions, deSesion, defaultProtocol().questions),
    /* Respaldo a lista VACÍA y no a la de por defecto —que también lo es—: aquí
       «no configurado» y «configurado sin ninguna» significan lo mismo, que es
       que no hay cuestionario. */
    checkinQuestions: dedupe(raw.checkinQuestions, deCheckin, []),
    custom,
    checkin,
    medidas,
    /* Como el cuestionario: «no configurado» y «configurado a cero» significan lo
       mismo —no lo pido—, así que los dos caen en el mismo sitio. */
    weighIns: sanitizeWeighIns(raw.weighIns),
    askPhotos: raw.askPhotos !== false,
    alertDays: sanitizeAlertDays(raw.alertDays),
    hidden: sanitizeHidden(raw.hidden),
    schedule: sanitizeSchedule(raw.schedule),
    ajuste: sanitizeAjuste(raw.ajuste),
  };
};

// ── Lectura ────────────────────────────────────────────────────────────────

export const isModuleOn = (protocol, id) => Boolean(protocol?.modules?.includes(id));

/**
 * ¿Le llevas esto a esta persona?
 *
 * Ausente cuenta como SÍ. Quien pregunte por un protocolo a medio sanear —o por
 * uno guardado antes de que esto existiera— tiene que recibir el comportamiento
 * de siempre, no una sección que desaparece por un valor que nadie escribió.
 */
export const isServiceOn = (protocol, id) => protocol?.services?.[id] !== false;

/** Los servicios activos, para contarlos o nombrarlos. */
export const activeServices = (protocol) => SERVICES.filter((s) => isServiceOn(protocol, s.id));

/**
 * QUÉ LE LLEVAS, en dos palabras: «Entreno y dieta».
 *
 * Es la primera línea de todo sitio que resuma el protocolo de alguien sin
 * abrirlo —la celda de su ficha, el pie de un interruptor a mano— y por eso usa
 * el nombre corto: ahí no cabe «Entrenamiento y Nutrición», y lo que se pregunta
 * al mirar es qué le llevas, no cómo se llama la sección.
 *
 * Sin ninguno no puede pasar —`toggleService` no deja apagar el último— pero se
 * contempla igual: un valor escrito a mano en la base no puede dejar a medias
 * una cabecera.
 */
export const queLeLlevas = (protocol) => {
  const cortos = activeServices(protocol).map((s, i) => (i === 0 ? s.corto : s.corto.toLowerCase()));
  if (cortos.length === 0) return '';
  return cortos.length === 1 ? cortos[0] : `${cortos.slice(0, -1).join(', ')} y ${cortos.at(-1)}`;
};

/**
 * Enciende o apaga uno. **El último no se puede apagar**: sin ninguno de los dos
 * no queda aplicación que enseñar, así que el gesto no hace nada y la pantalla lo
 * dice desactivando el control (ver `ProtocolPanel`). Devolver el mismo objeto
 * —y no uno nuevo igual— es lo que deja a quien llama saber que no ha cambiado
 * nada, como en `toggleQuestion`.
 */
export const toggleService = (protocol, id) => {
  if (!SERVICE_IDS.includes(id)) return protocol;

  const services = {
    ...defaultServices(),
    ...protocol.services,
    [id]: !isServiceOn(protocol, id),
  };
  if (!SERVICE_IDS.some((k) => services[k])) return protocol;

  return { ...protocol, services };
};

/**
 * Una pregunta por su id, sea de cualquiera de los dos catálogos o propia.
 *
 * LO PROPIO MANDA. Es la otra mitad del cambio de `sanitizeCustom`: si el
 * entrenador ha retocado «Adherencia a la dieta», lo que se le enseña al cliente
 * es SU versión, no la de serie. El catálogo queda de respaldo para todo lo que
 * nadie ha tocado, que es la mayoría.
 */
export const questionById = (protocol, id) =>
  (protocol?.custom || []).find((q) => q.id === id) ||
  CATALOGO.find((q) => q.id === id) ||
  null;

/**
 * Las preguntas activas, resueltas y EN EL ORDEN ELEGIDO.
 *
 * El orden importa más de lo que parece: es el orden en que se contestan de pie
 * en el gimnasio, y una pregunta de texto en medio de tres escalas corta el
 * ritmo. Por eso se conserva el del array y no se reordena por catálogo.
 */
export const activeQuestions = (protocol) =>
  (protocol?.questions || []).map((id) => questionById(protocol, id)).filter(Boolean);

/** Solo las medibles. Es lo que la analítica puede convertir en serie. */
export const scaleQuestions = (protocol) => activeQuestions(protocol).filter(isScale);

/** ¿Hay algo que preguntar de verdad al acabar de entrenar? */
export const asksFeedback = (protocol) =>
  isModuleOn(protocol, 'sessionFeedback') && activeQuestions(protocol).length > 0;

/**
 * Las preguntas del check-in, resueltas y en su orden.
 *
 * Sin módulo que las gobierne: la lista vacía ya significa que no hay
 * cuestionario, y entonces el paso del asistente no existe —igual que no existe
 * el de medidas cuando el entrenador apagó pliegues y perímetros—.
 */
export const checkinQuestions = (protocol) =>
  (protocol?.checkinQuestions || []).map((id) => questionById(protocol, id)).filter(Boolean);

/** ¿Se le pregunta algo al cerrar la semana? */
export const asksCheckinQuestions = (protocol) => checkinQuestions(protocol).length > 0;

/**
 * Un resumen corto de lo contestado, para la cola de revisiones.
 *
 * ── Por qué solo las escalas y solo tres ────────────────────────────────────
 * Porque es una sub-línea de una fila de lista, no un informe: lo que tiene que
 * hacer es que la cola diga algo NUEVO antes de entrar. Tres cifras se leen de
 * un vistazo; las diez se leen igual de mal que no ponerlas.
 *
 * Las de texto se cuentan pero no se citan: una respuesta de cuatro líneas
 * cortada a treinta caracteres no informa, engaña sobre lo que pone.
 *
 * ── Y lo contestado a una de elegir, igual ────────────────────────────────
 * Se cuenta con las notas y no se cita. «Dieta 4 · Sueño 7 · Sí» no dice nada
 * —¿sí a qué?—, y meter el enunciado entero para que se entienda convierte la
 * sub-línea de una fila de lista en un párrafo.
 */
export const answersSummary = (protocol, answers) => {
  if (!answers || typeof answers !== 'object') return '';

  const dadas = checkinQuestions(protocol).filter((q) => hayRespuesta(answers[q.id]));
  if (dadas.length === 0) return '';

  const escalas = dadas.filter(esSerie);
  const otras = dadas.length - escalas.length;

  const partes = escalas.slice(0, 3).map((q) => `${q.short || q.label} ${answers[q.id]}`);
  if (escalas.length > 3) partes.push(`+${escalas.length - 3}`);
  if (otras > 0) partes.push(otras === 1 ? '1 respuesta más' : `${otras} respuestas más`);

  return partes.join(' · ');
};

/**
 * En qué estado está un bloque del check-in. Siempre uno de los tres, nunca
 * `undefined`: quien pregunta se ahorra el respaldo, que es donde se coló el
 * fallo la última vez que un valor por defecto vivía en cada consumidor.
 */
/**
 * En qué estado está un bloque del check-in.
 *
 * ── Y por qué el respaldo cambia según el bloque ───────────────────────────
 * Los dos de siempre —pliegues y perímetros— respaldan a «opcional», que es lo
 * que la aplicación hacía antes de que esto se pudiera configurar: quien no
 * toque nada no puede notar el cambio.
 *
 * Cualquier otra medida respalda a **apagada**. Es la misma regla vista desde el
 * otro lado: una glucosa que apareciera encendida en el check-in de todo el
 * mundo el día que se publica esto sería la aplicación pidiéndole a la gente
 * algo que su entrenador no le ha pedido.
 */
export const checkinMode = (protocol, block) =>
  protocol?.checkin?.[block] || defaultCheckin()[block] || 'off';

/** Si el bloque se le enseña al cliente. */
export const asksBlock = (protocol, block) => checkinMode(protocol, block) !== 'off';

/** Si además no puede cerrar el check-in sin él. */
export const requiresBlock = (protocol, block) => checkinMode(protocol, block) === 'required';

/** Los bloques que se piden, en el orden en el que se enseñan. */
export const checkinBlocks = (protocol) =>
  CHECKIN_BLOCKS.filter((b) => asksBlock(protocol, b.id));

/** Y los que no se pueden dejar en blanco. */
export const requiredBlocks = (protocol) =>
  CHECKIN_BLOCKS.filter((b) => requiresBlock(protocol, b.id));

/**
 * Cuántos pesajes a la semana pide este protocolo. `0` es «no lo pido».
 *
 * Pasa por el saneado y no lee la clave a pelo para que valga igual con un
 * protocolo ya sanado y con uno recién sacado de la columna.
 */
export const weighInsTarget = (protocol) => sanitizeWeighIns(protocol?.weighIns);

/**
 * ¿Se cuentan los pesajes de este cliente?
 *
 * Es la pregunta que tienen que hacerse TODAS las pantallas antes de decir que
 * faltan pesajes, de pintar un «2 de 3» o de llamar fiable a una media. Sin
 * número pedido no hay nada que reclamar: no es que el cliente vaya a cero, es
 * que no se juzga.
 */
export const asksWeighIns = (protocol) => weighInsTarget(protocol) > 0;

// ── Escritura ──────────────────────────────────────────────────────────────

/** Cambia el estado de un bloque del check-in. Un estado que no existe no hace nada. */
export const setCheckinMode = (protocol, block, mode) => {
  if (!block) return protocol;
  if (!CHECKIN_MODE_IDS.includes(mode)) return protocol;
  /* La lista de qué bloques existen ya no se comprueba aquí: vive en el catálogo
     de medidas del entrenador y este módulo no lo conoce. Lo que sí se sigue
     comprobando es la FORMA —tres estados y no otra cosa—, que es lo que este
     archivo sabe de verdad. */
  return {
    ...protocol,
    checkin: { ...defaultCheckin(), ...protocol.checkin, [block]: mode },
  };
};

/**
 * LAS MEDIDAS QUE ESTE PROTOCOLO PIDE, con su definición entera.
 *
 * `asksBlock` contesta por id y no sirve para pintar un formulario: hace falta
 * la unidad, los decimales y el rango. El protocolo de un cliente las lleva
 * copiadas (`medidas`) porque su portal no puede leer el catálogo de su
 * entrenador; con el catálogo delante —la pantalla del entrenador— manda el
 * catálogo, que es donde se acaban de editar.
 *
 * @param catalogo Las del entrenador (`coachMedidas`). Sin él, las copiadas.
 */
export const medidasDelProtocolo = (protocol, catalogo = null) => {
  const lista = catalogo && catalogo.length > 0 ? catalogo : protocol?.medidas || [];
  return lista.filter((m) => asksBlock(protocol, m.id));
};

/** Y las que se piden EN CADA REVISIÓN, que son un paso del asistente. */
export const medidasDeRevision = (protocol, catalogo = null) =>
  medidasDelProtocolo(protocol, catalogo).filter((m) => m.cuando !== 'diaria' && !m.campos);

/** Las de A DIARIO, que son una fila más de la rejilla de la semana. */
export const medidasDiarias = (protocol, catalogo = null) =>
  medidasDelProtocolo(protocol, catalogo).filter((m) => m.cuando === 'diaria' && !m.campos);

/** Cuántos pesajes se le piden a la semana. Fuera de 0–7, no hace nada. */
export const setWeighIns = (protocol, n) => ({ ...protocol, weighIns: sanitizeWeighIns(n) });

/** La vara de una alerta. `0` vuelve a la general. */
export const setAlertDays = (protocol, id, n) => ({
  ...protocol,
  alertDays: sanitizeAlertDays({ ...protocol?.alertDays, [id]: n }),
});

/**
 * Los días que tienen que pasar antes de avisar de esta persona: los suyos si
 * los tiene afinados, y si no los generales que le pase quien pregunta.
 */
export const alertDaysFor = (protocol, defaults = {}) => ({
  training: protocol?.alertDays?.training || defaults.training || 0,
  weight: protocol?.alertDays?.weight || defaults.weight || 0,
});

/**
 * ¿Se le oculta esta cifra a ESTA persona en su portal?
 *
 * Ausente cuenta como NO, como todo lo que no está configurado: un protocolo a
 * medio sanear —o guardado antes de que esto existiera— tiene que enseñar lo de
 * siempre. La pregunta se hace SOLO en el portal; la respuesta nunca llega a la
 * pantalla del entrenador, que es quien necesita ver las cifras para decidir.
 */
export const hidesFromClient = (protocol, id) => protocol?.hidden?.[id] === true;

/** Las dos respuestas de golpe, que es como las lee el portal. */
export const hiddenFor = (protocol) => ({
  weight: hidesFromClient(protocol, 'weight'),
  nutrition: hidesFromClient(protocol, 'nutrition'),
  /* Y las medidas ocultas, por su id. El contexto del portal pregunta
     `oculto.medidas[id]` allí donde pinta una: la misma puerta que ya usan el
     peso y las kcal, sin una lista que haya que ampliar por cada medida nueva. */
  medidas: Object.fromEntries(
    Object.entries(protocol?.hidden || {})
      .filter(([id, v]) => v === true && !HIDDEN_IDS.includes(id))
      .map(([id]) => [id, true])
  ),
});

export const toggleHidden = (protocol, id) => ({
  ...protocol,
  hidden: sanitizeHidden({ ...protocol?.hidden, [id]: !hidesFromClient(protocol, id) }),
});

export const toggleModule = (protocol, id) => {
  const on = isModuleOn(protocol, id);
  const order = MODULES.map((m) => m.id);
  const modules = on
    ? protocol.modules.filter((m) => m !== id)
    : [...protocol.modules, id].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return { ...protocol, modules };
};

/*
  ── Las dos listas se manipulan con las mismas funciones ────────────────────
  `list` dice sobre cuál se opera: `questions` (al terminar de entrenar) o
  `checkinQuestions` (al cerrar la semana). Duplicar las cuatro funciones para la
  lista nueva habría sido copiar cuarenta líneas para cambiar un nombre de clave,
  y garantizar que dentro de tres meses una de las dos copias tenga un arreglo
  que la otra no.

  Por defecto `questions`, así que todo lo que ya llamaba a estas funciones sigue
  llamándolas igual.
*/
const LISTS = ['questions', 'checkinQuestions'];
const listOf = (protocol, list) => (LISTS.includes(list) ? protocol[list] || [] : protocol.questions || []);

/**
 * Añade o quita una pregunta. Al añadir se pone AL FINAL, no en el orden del
 * catálogo: el entrenador la acaba de elegir y espera verla donde ha pulsado, y
 * además el orden de las preguntas es suyo (ver `activeQuestions`).
 */
export const toggleQuestion = (protocol, id, list = 'questions') => {
  const actual = listOf(protocol, list);
  const has = actual.includes(id);
  return {
    ...protocol,
    [list]: has ? actual.filter((q) => q !== id) : [...actual, id],
  };
};

export const moveQuestion = (protocol, id, direction, list = 'questions') => {
  const actual = listOf(protocol, list);
  const index = actual.indexOf(id);
  const target = direction === 'up' ? index - 1 : index + 1;
  if (index === -1 || target < 0 || target >= actual.length) return protocol;
  const next = [...actual];
  [next[index], next[target]] = [next[target], next[index]];
  return { ...protocol, [list]: next };
};

/**
 * Una pregunta propia del entrenador. Nace activa EN LA LISTA DESDE LA QUE SE
 * escribió: se acaba de teclear en un sitio concreto y ahí es donde se espera
 * verla. Sigue estando disponible para la otra, que es de lo que sirve que las
 * propias se compartan.
 */
export const addCustomQuestion = (
  protocol,
  { label, kind = 'scale', max = 10, lowerIsBetter = false },
  list = 'questions'
) => {
  const clean = String(label || '').trim();
  /* El tope cuenta las INVENTADAS, no los retoques del catálogo: quien haya
     ajustado el rango de tres preguntas de serie no puede quedarse sin poder
     escribir ninguna suya. Misma cuenta que hace `sanitizeCustom`. */
  const inventadas = (protocol.custom || []).filter(
    (q) => !CATALOGO.some((c) => c.id === q.id)
  ).length;
  if (!clean || inventadas >= MAX_CUSTOM) return protocol;

  const question = { id: newId('q'), label: clean, kind, max, lowerIsBetter };
  const custom = sanitizeCustom([...(protocol.custom || []), question]);
  const added = custom[custom.length - 1];
  if (!added) return { ...protocol, custom };

  return { ...protocol, custom, [list]: [...listOf(protocol, list), added.id] };
};

/* Borrarla la quita de LAS DOS listas. Si solo saliera de una, la pregunta
   seguiría haciéndose en la otra sin existir en ningún catálogo, y
   `activeQuestions` la descartaría en silencio: un hueco que nadie sabría
   explicar. */
export const removeCustomQuestion = (protocol, id) => ({
  ...protocol,
  custom: (protocol.custom || []).filter((q) => q.id !== id),
  questions: (protocol.questions || []).filter((q) => q !== id),
  checkinQuestions: (protocol.checkinQuestions || []).filter((q) => q !== id),
});

/**
 * El perfil que coincide exactamente con lo que hay puesto, si hay alguno.
 *
 * Compara también el cuestionario del check-in: sin eso, quitar las preguntas de
 * la semana dejaba el perfil marcado como si nada hubiera cambiado, y volver a
 * pulsarlo —creyendo que no hacía nada— las devolvía todas.
 */
export const matchingPreset = (protocol) =>
  PROTOCOL_PRESETS.find(
    (preset) =>
      preset.protocol.modules.join() === protocol.modules.join() &&
      preset.protocol.questions.join() === protocol.questions.join() &&
      (preset.protocol.checkinQuestions || []).join() === (protocol.checkinQuestions || []).join()
  ) || null;
