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
