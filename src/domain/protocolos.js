/**
 * LOS PROTOCOLOS DEL ENTRENADOR: sus formas de trabajar, con nombre.
 *
 * ══ Por qué eran uno y ahora son varios ════════════════════════════════════
 *
 * Había UNA plantilla (`profiles.preferences.protocolTemplate`) y una copia
 * aplicada por cliente. Quien lleva pérdida de grasa y powerlifting no podía
 * tener dos formas de trabajar — y ése es justamente el entrenador que ya vive
 * de esto y al que le importa el producto.
 *
 * Es el hueco que el alta ya había resuelto con `intakeForms` y que el protocolo
 * se dejó a medias. Aquí se cierra con el MISMO patrón, que es lo que lo hace
 * barato: sin lista, el protocolo único de hoy **es** la lista.
 *
 * ══ Qué es un protocolo, ahora ═════════════════════════════════════════════
 *
 * Lo de siempre (`defaultProtocol()`) más cuatro cosas:
 *
 *   · `id` y `name` — porque hay varios.
 *   · `intake` — la definición del alta (qué pasos hay, de quién es cada uno).
 *     Vivía suelta en `intakeTemplate`, y estaba suelta por una razón técnica
 *     —`clientProtocol` sanea y descarta lo que no conoce— que aquí deja de
 *     aplicar: este objeto no pasa por ese saneado, lo hace su propio módulo.
 *   · `forms` — los ids de los TRES cuestionarios que usa. Antes las preguntas
 *     vivían dentro; ahora se referencian, que es lo que permite que un mismo
 *     check-in lo compartan dos protocolos y que la pantalla de Formularios
 *     pueda decir de verdad quién usa cada uno.
 *   · `schedule` — el CUÁNDO, que no existía. Ver `defaultSchedule`.
 *
 * ══ Lo que sigue viviendo en el cliente, y no aquí ═════════════════════════
 *
 * `alertDays` y `hidden`: la vara de una persona y qué cifras no le vuelven. Son
 * de ella y no de tu forma de trabajar — el porqué entero está en
 * `NOT_COMPARED_KEYS`. Están en la forma porque `defaultProtocol()` los trae,
 * pero `resolveProtocolo` no los empuja nunca.
 *
 * Y `clients.preferences.protocol` **no se toca**: sigue siendo la copia aplicada
 * y la única verdad de cada cliente. Se puede perder un protocolo; nunca lo que
 * tus clientes tienen puesto.
 */

import {
  DIAS,
  EVERY_MAX,
  REMIND_MAX,
  clientProtocol,
  defaultProtocol,
  defaultSchedule,
  diaDe,
  sanitizeSchedule,
} from './protocol';
import { clientIntake, defaultIntake } from './intake';
import { coachFormularios } from './formularios';
import { newId } from '@/lib/ids';

export const MAX_PROTOCOLOS = 6;
export const MAX_PROTOCOLO_NAME = 60;

/** El id del protocolo de quien nunca ha creado un segundo. Fijo, no generado. */
export const PROTOCOLO_GENERAL = 'proto_general';

// ── El cuándo ──────────────────────────────────────────────────────────────

/**
 * EL SCHEDULE: lo que Coachway junta en «check-in form & schedule» y a nosotros
 * nos faltaba entero.
 *
 * El check-in era semanal **por convención del código**: en `protocol.js` no
 * había ni día, ni frecuencia, ni recordatorio. O sea que la aplicación decidía
 * por el entrenador algo que es suyo, y encima no lo decía en ninguna parte.
 *
 *   · `day` — qué día se le pide (1 lunes … 7 domingo).
 *   · `every` — cada cuántas semanas. `1` es todas.
 *   · `remindAfter` — a los cuántos días se le recuerda si no lo ha entregado.
 *     **`0` es «no se lo recuerdes»**, no «cero días»: la misma gramática que los
 *     pesajes y las varas de aviso. Nace en 0 porque un recordatorio que nadie
 *     ha pedido es la app dándole deberes a alguien en nombre de su entrenador.
 *
 * Los valores por defecto son exactamente lo que la aplicación hacía antes de
 * que esto se pudiera elegir, así que quien no toque nada no puede notarlo.
 */
/*
  El horario vive en `protocol.js` y aquí solo se reexporta.

  No es un capricho de organización: tiene que llegarle AL CLIENTE —el
  recordatorio se calcula en su portal, y el portal solo lee su propia fila—, y
  todo lo que viaja en `preferences.protocol` pasa por `clientProtocol`. Una
  clave que se sanee en otro módulo desaparece en el primer guardado.
*/
export { DIAS, EVERY_MAX, REMIND_MAX, defaultSchedule, sanitizeSchedule, diaDe };

/** Cada cuánto, en una frase. `1` no dice nada: semanal es lo que se espera. */
export const cadaCuanto = (schedule) => {
  const { every } = sanitizeSchedule(schedule);
  return every === 1 ? '' : `cada ${every} semanas`;
};

// ── La forma ───────────────────────────────────────────────────────────────

export const defaultProtocolo = () => ({
  ...defaultProtocol(),
  intake: defaultIntake(),
  forms: { alta: null, sesion: null, semana: null },
  schedule: defaultSchedule(),
});

const idOrNull = (v) => (v ? String(v) : null);

/** Uno guardado, completado y acotado. `null` si ni siquiera trae id. */
export const sanitizeProtocolo = (raw) => {
  if (!raw || typeof raw !== 'object' || !raw.id) return null;
  return {
    id: String(raw.id),
    name: String(raw.name ?? '').trim().slice(0, MAX_PROTOCOLO_NAME) || 'Mi protocolo',
    /* El protocolo de siempre pasa por su saneado de siempre: las reglas de qué
       módulo existe y qué pregunta vale son suyas y no se copian aquí. */
    ...clientProtocol({ protocol: raw }),
    /* Y el alta por el suyo. `clientIntake` descarta lo que no conoce igual que
       `clientProtocol`, así que colgarla de la misma llamada la habría borrado —
       que es exactamente el motivo por el que vivía suelta. */
    intake: clientIntake({ intake: raw.intake }),
    forms: {
      alta: idOrNull(raw.forms?.alta),
      sesion: idOrNull(raw.forms?.sesion),
      semana: idOrNull(raw.forms?.semana),
    },
    schedule: sanitizeSchedule(raw.schedule),
  };
};

// ── La lista ───────────────────────────────────────────────────────────────

/**
 * El protocolo de siempre, leído como lista de uno.
 *
 * Mientras nadie guarde una lista nueva, ESTO es la lista: la plantilla de
 * protocolo y la de alta que el entrenador ya tiene, con los tres cuestionarios
 * heredados apuntados por id. Quien nunca cree un segundo no ve diferencia
 * ninguna, y quien abra la pantalla el primer día se encuentra su forma de
 * trabajar dentro, no un protocolo vacío.
 */
const heredado = (preferences) => {
  const forms = coachFormularios(preferences);
  const alta = forms.find((f) => f.momento === 'alta');
  const sesion = forms.find((f) => f.momento === 'sesion');
  const semana = forms.find((f) => f.momento === 'semana');

  return [
    {
      id: PROTOCOLO_GENERAL,
      name: 'Mi protocolo',
      ...clientProtocol({ protocol: preferences?.protocolTemplate }),
      intake: clientIntake({ intake: preferences?.intakeTemplate }),
      forms: { alta: alta?.id || null, sesion: sesion?.id || null, semana: semana?.id || null },
      schedule: defaultSchedule(),
    },
  ];
};

/** Los protocolos del entrenador, saneados. Siempre hay al menos uno. */
export const coachProtocolos = (preferences) => {
  const items = preferences?.protocolos?.items;
  if (Array.isArray(items)) {
    const sanos = items.map(sanitizeProtocolo).filter(Boolean).slice(0, MAX_PROTOCOLOS);
    if (sanos.length > 0) return sanos;
  }
  return heredado(preferences);
};

/** El elegido, o el primero: nadie se queda sin protocolo por un id roto. */
export const protocoloById = (preferences, id) => {
  const lista = coachProtocolos(preferences);
  return lista.find((p) => p.id === id) || lista[0];
};

export const protocolosToPreferences = (lista) => ({
  items: coachProtocolos({ protocolos: { items: lista } }),
});

/**
 * Uno nuevo, con los cuestionarios que ya existen apuntados.
 *
 * No nace en blanco: un protocolo sin ningún formulario no le pide nada a nadie,
 * y quien crea el segundo casi siempre quiere una variación del primero, no
 * empezar de cero.
 */
export const buildProtocolo = ({ name, desde = null }) => ({
  ...(desde ? { ...desde } : defaultProtocolo()),
  id: newId('proto'),
  name: String(name || '').trim().slice(0, MAX_PROTOCOLO_NAME) || 'Protocolo nuevo',
});

// ── Cuál lleva puesto cada cliente ─────────────────────────────────────────

/**
 * De qué protocolo viene este cliente.
 *
 * Se guarda en `clients.preferences.protocolId` al sembrarlo o al ponerlo al
 * día. Sin marca —todos los clientes anteriores a esto— cuenta como el primero,
 * que es el que hasta hoy era el único que había: nadie se queda huérfano por un
 * valor que nunca escribió.
 */
export const clientProtocoloId = (preferences) => preferences?.protocolId || null;

export const protocoloDeCliente = (coachPrefs, client) => {
  const id = clientProtocoloId(client?.preferences);
  const lista = coachProtocolos(coachPrefs);
  return lista.find((p) => p.id === id) || lista[0];
};

/** Cuántos clientes lleva cada protocolo, para la columna de la lista. */
export const cuentaClientes = (coachPrefs, clients = []) => {
  const lista = coachProtocolos(coachPrefs);
  const primero = lista[0]?.id;
  const cuenta = Object.fromEntries(lista.map((p) => [p.id, 0]));
  for (const c of clients) {
    const id = clientProtocoloId(c.preferences);
    const suyo = cuenta[id] !== undefined ? id : primero;
    if (suyo) cuenta[suyo] += 1;
  }
  return cuenta;
};

// ── La resolución ──────────────────────────────────────────────────────────

/**
 * EL PROTOCOLO RESUELTO: la forma que el cliente ya sabe leer.
 *
 * ══ Por qué hace falta resolver ════════════════════════════════════════════
 *
 * El protocolo del entrenador referencia sus cuestionarios por id, pero el
 * cliente **no puede leer el perfil de su entrenador** (`profiles` solo deja ver
 * la fila propia, 0002). Si su copia guardara ids, su portal no tendría de dónde
 * sacar las preguntas.
 *
 * Así que al escribírselo se resuelve: las preguntas del formulario de sesión
 * caen en `questions`, las del de semana en `checkinQuestions`, y con ellas los
 * bloques y los pesajes. Es exactamente lo que ya se hacía con `intakeForm`, que
 * se copia entero al dar de alta.
 *
 * ── Sin formulario apuntado, lo que el protocolo lleve dentro ──────────────
 * Un id roto —o un protocolo heredado que todavía no apunta a nada— no puede
 * dejar a un cliente sin cuestionario. Se cae en lo que el propio protocolo
 * guarda, que es lo de siempre.
 *
 * ── Las preguntas propias se juntan, y el saneado las acota ────────────────
 * Los dos formularios pueden traer las suyas. Se concatenan y `clientProtocol`
 * hace el resto: quita repetidas y corta en `MAX_CUSTOM`. Si el tope se alcanza,
 * la pregunta que se cae también desaparece de su lista — el saneado solo acepta
 * ids que existan— y eso es preferible a escribirle al cliente una pregunta que
 * nadie sabe pintar.
 */
export const resolveProtocolo = (protocolo, formularios) => {
  const sesion = formularios.find((f) => f.id === protocolo?.forms?.sesion && f.momento === 'sesion');
  const semana = formularios.find((f) => f.id === protocolo?.forms?.semana && f.momento === 'semana');

  const custom = [...(sesion?.custom || []), ...(semana?.custom || [])];

  return clientProtocol({
    protocol: {
      services: protocolo?.services,
      modules: protocolo?.modules,
      questions: sesion ? sesion.questions : protocolo?.questions,
      checkinQuestions: semana ? semana.questions : protocolo?.checkinQuestions,
      custom: custom.length > 0 ? custom : protocolo?.custom,
      checkin: semana ? semana.checkin : protocolo?.checkin,
      weighIns: semana ? semana.weighIns : protocolo?.weighIns,
      /* Las fotos son una pieza del check-in como las medidas: si su formulario
         no las pide, el asistente no enseña su paso. */
      askPhotos: semana ? semana.askPhotos : protocolo?.askPhotos,
      alertDays: protocolo?.alertDays,
      hidden: protocolo?.hidden,
      /* El horario viaja al cliente: el recordatorio se calcula en SU portal, y
         el portal solo lee su propia fila. */
      schedule: protocolo?.schedule,
    },
  });
};

/** El de un entrenador, resuelto con sus propios formularios. */
export const resolveConPrefs = (coachPrefs, protocolo) =>
  resolveProtocolo(protocolo, coachFormularios(coachPrefs));

/**
 * El formulario de alta que le toca a un cliente de este protocolo.
 *
 * Se devuelve el objeto entero porque es lo que se le copia a su ficha: el
 * portal lo lee de ahí y no del perfil del entrenador, por el mismo motivo de
 * siempre.
 */
export const altaDe = (protocolo, formularios) =>
  formularios.find((f) => f.id === protocolo?.forms?.alta && f.momento === 'alta') ||
  formularios.find((f) => f.momento === 'alta') ||
  null;
