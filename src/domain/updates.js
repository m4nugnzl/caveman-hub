/**
 * Novedades y pendientes: lo que el cliente ve al entrar.
 *
 * ══ Qué es esto, y sobre todo qué NO es ═════════════════════════════════════
 *
 * No es una bandeja de mensajes. La conversación con el cliente es de WhatsApp —
 * ahí hay una persona, y ahí se avisa de las cosas—. Lo que la aplicación puede
 * hacer, y no hacía, es contestar dos preguntas de ESTADO sin que nadie escriba
 * nada:
 *
 *   1. ¿Qué ha cambiado desde la última vez que entré?
 *   2. ¿Qué falta de mi parte?
 *
 * Por eso aquí no hay ni un campo de texto. Ninguna entrada la redacta una
 * persona: la primera pregunta la contestan tres sellos de tiempo y la segunda un
 * cálculo que ya existía para la cartera del entrenador.
 *
 * ══ Por qué no hace falta ninguna tabla ════════════════════════════════════
 *
 * Una novedad es una comparación —«esto pasó después de la última vez que
 * miré»—, y eso son dos fechas, no una lista de mensajes guardados.
 *
 *   clients.preferences.updates = { routine, diet, review }   ← lo sella el entrenador
 *   clients.preferences.feed    = { seen }                    ← lo marca el cliente
 *
 * Las dos viven en `clients.preferences`, cuya función de guardado
 * (`set_client_preferences`, migración 0008) admite al entrenador **y al propio
 * cliente**. Así que esto funciona con lo que ya está desplegado: sin migración,
 * sin políticas nuevas y sin una tabla que crezca sin fin.
 *
 * ── El compromiso, dicho en voz alta ────────────────────────────────────────
 * Los dos escriben en la misma columna, así que dos escrituras a la vez pueden
 * pisarse y perder un sello. Lo peor que pasa es que una novedad no se enseñe: no
 * se corrompe nada y el contenido sigue estando en su sección. Para un indicador
 * es un precio razonable a cambio de no crear una tabla.
 *
 * ══ Por qué un sello explícito y no `updated_at` ═══════════════════════════
 *
 * La tabla de la rutina se guarda cada vez que se mueve una serie. Si la novedad
 * saliera de su `updated_at`, el cliente vería «rutina actualizada» cuarenta veces
 * en una tarde de programación, y a la tercera dejaría de mirar el aviso. Cuándo
 * está terminado lo sabe el entrenador, y por eso lo dice un botón.
 */

import { weeklyCheckIn } from './anthropometry';
import { requiredBlocks } from './protocol';
import { weekStart } from '@/lib/dates';

/** Las tres cosas de las que se avisa, en el orden en que se enseñan. */
export const UPDATE_KINDS = [
  {
    /*
      La respuesta a su check-in. Va la primera porque es la única que ha PEDIDO
      él: entregó su semana y estaba esperando. Las otras tres son cosas que le
      llegan sin haberlas pedido.
    */
    id: 'checkin',
    label: 'Tu entrenador ha revisado tu semana',
    hint: 'Mira lo que te dice.',
    href: '/mi/hoy',
  },
  {
    id: 'review',
    label: 'Tienes una revisión nueva',
    hint: 'Tu entrenador ha grabado su repaso.',
    href: '/mi/hoy',
  },
  {
    id: 'routine',
    label: 'Tu rutina ha cambiado',
    hint: 'Hay entrenamiento nuevo preparado.',
    href: '/mi/rutina',
  },
  {
    id: 'diet',
    label: 'Tu dieta ha cambiado',
    hint: 'Se han ajustado tus objetivos o tu menú.',
    href: '/mi/dieta',
  },
];

const KIND_IDS = UPDATE_KINDS.map((k) => k.id);

const isoOrNull = (value) => {
  const texto = String(value || '');
  return Number.isFinite(Date.parse(texto)) ? texto : null;
};

/** Los sellos guardados, limpios de lo que la aplicación no conoce. */
export const clientUpdates = (preferences) => {
  const raw = preferences?.updates;
  const out = {};
  if (raw && typeof raw === 'object') {
    for (const id of KIND_IDS) {
      const at = isoOrNull(raw[id]);
      if (at) out[id] = at;
    }
  }
  return out;
};

/** Cuándo miró por última vez. `null` si no ha mirado nunca. */
export const lastSeen = (preferences) => isoOrNull(preferences?.feed?.seen);

/**
 * Lo que ha cambiado desde entonces, lo más reciente primero.
 *
 * ── Quien entra por primera vez no ve tres avisos ───────────────────────────
 * Sin `seen` guardado se toma como visto todo lo anterior a este momento: un
 * cliente que estrena el portal no tiene «novedades» de cosas que llevan ahí
 * desde marzo. La novedad es lo que cambia MIENTRAS lo usas.
 */
export const unseenUpdates = (preferences, now = new Date().toISOString()) => {
  const sellos = clientUpdates(preferences);
  const desde = lastSeen(preferences);
  if (!desde) return [];

  return UPDATE_KINDS.filter((kind) => {
    const at = sellos[kind.id];
    if (!at || at <= desde) return false;
    /* Y que no se haya quitado a mano. Se compara contra el sello, no contra
       «está descartada»: si el entrenador vuelve a tocarlo, el sello nuevo es
       posterior al descarte y la novedad vuelve, que es lo correcto. */
    const quitada = dismissedAt(preferences, kind.id);
    return !quitada || at > quitada;
  })
    .map((kind) => ({ ...kind, at: sellos[kind.id] }))
    .filter((u) => u.at <= now)
    .sort((a, b) => b.at.localeCompare(a.at));
};

/** El objeto que se guarda al sellar un cambio. Conserva los otros dos sellos. */
/**
 * Dar por vista UNA novedad, sin dar por vistas las demás.
 *
 * ══ Por qué hacía falta ════════════════════════════════════════════════════
 *
 * El único «visto» que existía era el sello global: al entrar, dos segundos
 * después, TODAS las novedades pasaban a vistas de golpe. Así que la lista era
 * de solo lectura —aparecía sola y desaparecía sola— y no había forma de decir
 * «ésta ya la he leído, quítamela» dejando la otra.
 *
 * Un aviso que no se puede quitar deja de ser un aviso en cuanto hay dos.
 *
 * ── Cómo se guarda ──────────────────────────────────────────────────────────
 * Con la MISMA marca de tiempo del sello de esa novedad. No hace falta una
 * estructura nueva: si `feed.dismissed.routine` es igual o posterior al sello
 * `updates.routine`, esa novedad está leída; y si el entrenador vuelve a tocar
 * la rutina, el sello nuevo es posterior y la novedad reaparece — que es
 * exactamente lo que tiene que pasar.
 */
export const dismissUpdate = (preferences, kind, at) => {
  const previo = preferences?.feed?.dismissed || {};
  if (!KIND_IDS.includes(kind)) return previo;
  return { ...previo, [kind]: isoOrNull(at) || new Date().toISOString() };
};

/** Lo que se ha dado por leído, una a una. */
const dismissedAt = (preferences, kind) => isoOrNull(preferences?.feed?.dismissed?.[kind]);

export const stampUpdate = (preferences, kind, now = new Date().toISOString()) => {
  if (!KIND_IDS.includes(kind)) return clientUpdates(preferences);
  return { ...clientUpdates(preferences), [kind]: now };
};

/**
 * Lo que falta de su parte esta semana.
 *
 * ══ El mismo cálculo que ve el entrenador ══════════════════════════════════
 *
 * Sale de `weeklyCheckIn` y de los bloques obligatorios del protocolo, que son
 * exactamente las dos cosas con las que se construyen las alertas de la cartera.
 * Es deliberado: si el cliente viera un criterio propio, podría creerse al día
 * mientras al entrenador le sale en rojo — y esa contradicción es peor que no
 * decirle nada.
 *
 * ── Solo se pide lo que el entrenador ha configurado ────────────────────────
 * Los pesajes salen del objetivo semanal y las medidas de lo que él haya marcado
 * como obligatorio. No se inventa ninguna obligación: si no ha pedido pliegues,
 * aquí no aparecen. Las fotos tampoco, porque hoy no hay ningún sitio donde se
 * declaren obligatorias.
 */
export const pendingTasks = ({ history = [], protocol = null, today }) => {
  const semana = weeklyCheckIn(history, today);
  const out = [];

  if (semana.count < semana.target) {
    const faltan = semana.target - semana.count;
    out.push({
      id: 'weights',
      label: faltan === 1 ? 'Te falta 1 pesaje esta semana' : `Te faltan ${faltan} pesajes esta semana`,
      hint: `Llevas ${semana.count} de ${semana.target}.`,
      href: '/mi/evolucion',
    });
  }

  /* Un bloque obligatorio cuenta como hecho si CUALQUIER registro de la semana lo
     trae: se mide una vez, no en cada pesaje. */
  const deLaSemana = history.filter((h) => h.date && weekStart(h.date) === semana.weekStart);
  for (const bloque of requiredBlocks(protocol)) {
    const medido = deLaSemana.some((log) => {
      const datos = bloque.id === 'folds' ? log?.skinFolds : log?.perimeters;
      return Boolean(datos) && Object.keys(datos).length > 0;
    });
    if (!medido) {
      out.push({
        id: `block-${bloque.id}`,
        label: `Te faltan tus ${bloque.label.toLowerCase()}`,
        hint: 'Tu entrenador los pide en cada check-in.',
        href: '/mi/evolucion',
      });
    }
  }

  return out;
};
