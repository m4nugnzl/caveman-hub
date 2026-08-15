/**
 * Qué se usa de verdad.
 *
 * ══ Qué NO es esto ══════════════════════════════════════════════════════════
 *
 * No es seguimiento de personas. No hay identificador de navegador, ni cookie,
 * ni huella, ni nada que sobreviva a cerrar sesión. Lo único que va es el id del
 * entrenador —que ya está en su sesión— y el nombre de lo que ha hecho.
 *
 * Y sobre todo: **no se instrumenta al cliente final**. Quien abre el portal es
 * la persona de la que esta aplicación guarda su peso, sus pliegues y fotos de su
 * cuerpo; medir además su comportamiento sería usar como sujeto de análisis a
 * quien ya es sujeto de los datos. La instrumentación es del producto que se
 * VENDE, y eso es el panel del entrenador. `track` no hace nada desde `/mi/`.
 *
 * ══ Las reglas, que además las impone Postgres ══════════════════════════════
 *
 * La migración 0045 obliga a que el nombre del evento sea un identificador corto
 * en minúsculas y a que las propiedades quepan en 500 bytes. Es un CHECK, no una
 * convención: un nombre, un correo o una medida NO pasan ese patrón, así que no
 * hay forma de colar un dato personal aquí ni queriendo.
 *
 * En `props` van CATEGORÍAS y TRAMOS —`{ seccion: 'rutina' }`,
 * `{ clientes: '10-29' }`—, nunca valores. «Cuántos clientes tiene» en tramos
 * responde a la pregunta de producto igual de bien y no describe a nadie.
 *
 * ══ Por qué no rompe nunca nada ═════════════════════════════════════════════
 *
 * Misma disciplina que `lib/diagnostics.js`: esto es accesorio y la aplicación
 * tiene que funcionar igual sin ello. Los fallos se tragan a propósito —es el
 * único sitio del proyecto donde eso es correcto, y por eso está escrito—; si la
 * migración no está aplicada, si no hay red o si la política rechaza la fila, no
 * se entera nadie y no se reintenta.
 *
 * Nunca se espera a que termine: `track` no devuelve promesa que nadie deba
 * `await`ear. Apuntar que alguien ha abierto una pantalla no puede retrasar que
 * la pantalla se abra.
 */

import { supabase } from './supabaseClient';

/* Deja de intentarlo en cuanto queda claro que no va a poder. Sin esto, una
   instalación sin la 0045 aplicada haría una petición fallida por cada pantalla
   que abriera su usuario durante toda la sesión. */
let apagado = false;

/** Quién y de qué equipo. Lo rellena la aplicación al resolver la sesión. */
let actor = null;
let teamId = null;

/**
 * A quién se le apunta.
 *
 * `rol` decide si se apunta algo en absoluto: solo `coach`. Se pasa entero desde
 * el contexto en vez de deducirlo de la ruta porque un entrenador puede estar
 * PREVISUALIZANDO el portal de su cliente, y eso sigue siendo uso del panel.
 */
export const identify = ({ userId, team, role } = {}) => {
  actor = role === 'coach' && userId ? userId : null;
  teamId = team || null;
};

/** Cierra la sesión de medición. Se llama al salir. */
export const forgetActor = () => {
  actor = null;
  teamId = null;
};

/*
  ══ Se manda en lotes ══════════════════════════════════════════════════════

  Una petición por pantalla abierta serían decenas por sesión para algo que a
  nadie le urge. Se acumulan y se sueltan cada pocos segundos, o de golpe cuando
  la pestaña se esconde —que en móvil es la única señal fiable de que se va—.
*/
const cola = [];
let temporizador = null;
const ESPERA_MS = 5000;
const TOPE = 25;

const enviar = async () => {
  clearTimeout(temporizador);
  temporizador = null;
  if (apagado || cola.length === 0) return;

  const lote = cola.splice(0, cola.length);
  try {
    const { error } = await supabase.from('product_events').insert(lote);
    /*
      Si la tabla no existe, la 0045 no está aplicada: se apaga y no se vuelve a
      intentar en toda la sesión. Cualquier otro fallo —red, política— se ignora
      sin apagar: puede ser pasajero.
    */
    if (error && /does not exist|schema cache/i.test(error.message || '')) apagado = true;
  } catch {
    /* Sin red. No es un problema: esto es accesorio y el lote se pierde a
       propósito. Reintentar mediciones competiría por la red con los guardados,
       que es lo que de verdad importa. */
  }
};

const programar = () => {
  if (cola.length >= TOPE) {
    enviar();
    return;
  }
  if (temporizador) return;
  temporizador = setTimeout(enviar, ESPERA_MS);
};

/**
 * Apunta algo que ha pasado.
 *
 * @param {string} name  identificador corto en minúsculas (ver la 0045).
 * @param {object} [props] categorías y tramos. Nunca valores ni texto libre.
 */
export const track = (name, props = {}) => {
  if (apagado || !actor) return;
  if (!/^[a-z][a-z0-9_]{2,40}$/.test(name)) return;

  cola.push({ actor, team_id: teamId, name, props });
  programar();
};

/** Suelta lo pendiente ya. Se engancha al cierre de la pestaña. */
export const flushEvents = () => {
  if (cola.length > 0) enviar();
};

/**
 * Tramos, para que un recuento no describa a nadie.
 *
 * «Tiene 28 clientes» es un dato que, cruzado con poco más, señala a un
 * entrenador concreto. «Tiene entre 10 y 29» contesta la misma pregunta de
 * producto —¿en qué tamaño de cartera se abandona?— sin señalar a nadie.
 */
export const bucket = (n) => {
  const x = Number(n);
  if (!Number.isFinite(x) || x < 0) return 'desconocido';
  if (x === 0) return '0';
  if (x < 3) return '1-2';
  if (x < 10) return '3-9';
  if (x < 30) return '10-29';
  return '30+';
};

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushEvents();
  });
}
