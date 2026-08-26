/**
 * La ficha de la persona: quién es, más allá de lo que te paga.
 *
 * ══ Qué problema resuelve ═══════════════════════════════════════════════════
 *
 * La aplicación sabía de un cliente su nombre, su correo, su teléfono, su sexo y
 * su tarifa. Todo lo demás —la edad, la altura, sus lesiones, sus
 * intolerancias— es información con la que se decide un entrenamiento o una
 * dieta, y vivía FUERA: en WhatsApp, en la cabeza del entrenador, o como mucho
 * dentro del PDF que cuelga del paso «Anamnesis» del alta, donde está guardada
 * pero la aplicación no puede leerla.
 *
 * ══ La frontera de esta pantalla, y es la regla que la ordena ═══════════════
 *
 * **La ficha guarda lo CONSTANTE de la persona. Lo que EVOLUCIONA vive en
 * Progreso y en Revisión.**
 *
 * No es una preferencia de diseño: es lo que costó una columna. `current_weight`
 * existió en `clients` y la 0048 tuvo que borrarla porque enseñaba «Peso actual»
 * con el valor congelado del día que alguien dejó de rellenarlo, mientras el
 * histórico de pesajes decía otra cosa a dos pantallas de distancia.
 *
 * Por eso aquí el peso se LEE de su serie y no se guarda, y por eso la edad se
 * DERIVA de la fecha de nacimiento en vez de guardarse: un «34» escrito en la
 * base miente solo al cabo de un año, sin que nadie toque nada.
 */

import { fmt } from '@/lib/num';
import { toISODate, todayISO } from '@/lib/dates';

/**
 * Los años que tiene, o `null` si no se sabe.
 *
 * ── Por qué se compara con cadenas y no con fechas ──────────────────────────
 * Porque `YYYY-MM-DD` es de anchura fija y con ceros delante, así que comparar
 * los textos `MM-DD` ordena igual que comparar los días — y evita de raíz el
 * error clásico de esta función, que es restar milisegundos y equivocarse en un
 * año entero en la franja horaria de al lado.
 *
 * El caso que casi nadie cubre: **que todavía no haya llegado su cumpleaños**.
 * Restar los años a secas le envejece hasta once meses, y en una fórmula de
 * gasto energético eso es un error real, no un detalle.
 *
 * Una fecha en el futuro devuelve `null` y no un número negativo: quien no ha
 * nacido no tiene edad, y un «-3 años» en pantalla es peor que un hueco.
 */
export const age = (birthDate, today = todayISO()) => {
  const nacimiento = toISODate(birthDate);
  const hoy = toISODate(today);
  if (!nacimiento || !hoy || nacimiento > hoy) return null;

  const años = Number(hoy.slice(0, 4)) - Number(nacimiento.slice(0, 4));
  return hoy.slice(5) < nacimiento.slice(5) ? años - 1 : años;
};

/** Los años que se pueden teclear. Fuera de aquí no es una edad, es una errata. */
export const MIN_AGE = 10;
export const MAX_AGE = 110;

/**
 * La fecha de nacimiento que corresponde a una edad tecleada.
 *
 * ══ Por qué se teclea la edad y se guarda la fecha ══════════════════════════
 *
 * Son las dos mitades de la misma decisión, y cada una está en el sitio que le
 * toca:
 *
 *   · **Se GUARDA la fecha** porque un «34» escrito en la base miente solo al
 *     cabo de un año sin que nadie toque nada. Eso ya costó una columna: la 0048
 *     tuvo que borrar `current_weight` por exactamente el mismo motivo.
 *   · **Se TECLEA la edad** porque es lo que un entrenador sabe de su cliente.
 *     Nadie se acuerda del día que nació la persona a la que entrena, y el
 *     selector de fecha del navegador obligaba a recorrer un desplegable de
 *     ochenta años para poner un dato que se dice en dos dígitos.
 *
 * ── El día que sale, y por qué da igual ─────────────────────────────────────
 * Se usa el mes y el día de HOY, así que la edad es exacta ahora mismo y cumple
 * dentro de un año justo. El error medio contra el cumpleaños real es de medio
 * año, y donde esta cifra entra —el gasto energético y las zonas de frecuencia
 * cardíaca— medio año no mueve el resultado. Lo que sí lo movería es la edad
 * congelada, que es lo que esto evita.
 *
 * Y quien SÍ tenga la fecha exacta guardada no la pierde: la pantalla solo
 * reescribe cuando la edad cambia (ver `ClientFile`).
 *
 * ── El 29 de febrero ────────────────────────────────────────────────────────
 * Restarle años a un 29 de febrero da fechas que no existen tres de cada cuatro
 * veces, y `date` de Postgres las rechaza con un error suyo delante de alguien
 * que solo estaba poniendo una edad. Se cae al 28.
 */
export const birthDateForAge = (años, today = todayISO()) => {
  const n = Number(años);
  if (!Number.isFinite(n) || n < MIN_AGE || n > MAX_AGE) return null;

  const hoy = toISODate(today);
  if (!hoy) return null;

  const año = Number(hoy.slice(0, 4)) - Math.floor(n);
  const mesDia = hoy.slice(5) === '02-29' ? '02-28' : hoy.slice(5);
  return `${año}-${mesDia}`;
};

/**
 * Los cuatro hechos de la cabecera de la ficha.
 *
 * ── Por qué son siempre cuatro, huecos incluidos ────────────────────────────
 * Porque no son una lista de campos rellenados: son la ANATOMÍA de una persona,
 * y las cuatro se preguntan siempre. Un hueco aquí informa —«a esta persona no
 * le has tomado la altura»— igual que informa el hueco del gráfico en una
 * métrica sin serie (`docs/producto.md` §5.4).
 *
 * Es lo contrario de lo que hace el resto de la ficha, donde lo que está sin
 * poner no se pinta: veinticinco «sin poner» en gris no informan de nada, solo
 * hacen que la ficha de alguien recién dado de alta parezca rota.
 *
 * ── Y por qué no llevan color ───────────────────────────────────────────────
 * Ninguna de las cuatro es una serie que se siga. La regla del proyecto es
 * explícita: una cifra sin serie va en tinta plena, porque cuando todo tiene
 * color el color deja de avisar (`domain/metrics.js`).
 *
 * @param client  La ficha, tal y como la devuelve `mapClientFromDb`.
 * @param weight  El último pesaje, de `latestWeight(history)`. Se recibe ya
 *   calculado y NO se guarda: la fuente de verdad del peso es su histórico.
 */
export const identityFacts = ({ client, weight }, today = todayISO()) => {
  const años = age(client?.birthDate, today);

  return [
    { id: 'age', label: 'Edad', value: años === null ? null : `${años} ${años === 1 ? 'año' : 'años'}` },
    { id: 'height', label: 'Altura', value: client?.heightCm ? fmt(client.heightCm, { unit: ' cm' }) : null },
    { id: 'weight', label: 'Peso', value: weight ? fmt(weight, { decimals: 1, unit: ' kg' }) : null },
    { id: 'gender', label: 'Sexo', value: client?.gender || null },
  ];
};

/**
 * La línea de voz baja bajo el nombre: qué le vendiste y desde cuándo.
 *
 * Las mismas dos piezas y en el mismo orden que el subtítulo del selector de
 * cliente (`CoachLayout`). Si aquí dijeran otra cosa, la misma persona tendría
 * dos identidades a diez píxeles de distancia.
 */
export const identitySubtitle = (client, desde) =>
  [client?.plan || 'Sin plan', desde && `desde ${desde}`].filter(Boolean).join(' · ');
