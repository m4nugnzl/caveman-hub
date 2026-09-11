/**
 * TUS GRUPOS DE EQUIVALENCIA: qué vale por qué, dicho por ti.
 *
 * ══ El problema que resuelve, medido ═══════════════════════════════════════
 *
 * Las equivalencias de «Huevo entero» que calcula `foodEquiv` son CINCO huevos:
 * Huevo L, Huevina, Huevo entero L, Huevos enteros frescos y Tortilla francesa.
 * El cálculo es correcto —todos llevan la misma proteína y unas kcal parecidas—
 * y la lista es inservible: el catálogo tiene casi-duplicados y **nadie puede
 * decirle cuál prefiere**. El entrenador que sabe que a esa persona le vale
 * clara de huevo, yogur griego o atún no tiene dónde escribirlo.
 *
 * Un grupo es exactamente eso escrito: «Mi proteína magra» son estos cinco
 * alimentos y no los treinta que comparten macro.
 *
 * ══ Es criterio guardado con nombre, como un plato ═════════════════════════
 *
 * Y por eso vive donde viven los platos y las piezas
 * (`profiles.preferences.gruposEquiv.items`): es del ENTRENADOR y no de un
 * cliente, `updateCoachPreferences` ya fusiona por secciones sin pisar lo
 * demás, y no cuesta migración. Ver `domain/platos.js`, que explica el precio
 * —una fila de perfil no es sitio para doscientos, de ahí el tope—.
 *
 * ══ Guarda NOMBRES, no números ═════════════════════════════════════════════
 *
 * Aquí está la diferencia con un plato, y es a propósito. Un plato es una
 * RACIÓN —«80 g de avena»— y se congela, porque una dieta es una foto. Un grupo
 * no dice cantidades: dice **qué vale por qué**. Las cantidades las calcula
 * `equivalencesFor` cada vez, contra el objetivo del alimento que tengas
 * delante, así que congelar aquí unos macros sería tener dos versiones de la
 * avena — la de tu biblioteca y la que se copió el día que guardaste el grupo.
 *
 * Consecuencia dicha: si corriges los macros de un alimento en tu biblioteca,
 * los grupos que lo llevan usan los corregidos. Que es lo que se espera de un
 * criterio y no de una copia.
 *
 * ══ El grupo MANDA, y el cálculo sigue siendo el suelo ═════════════════════
 *
 * Un alimento que está en un grupo tuyo ofrece los del grupo y ninguno más
 * —incluidos los que el filtro de cordura por kcal habría descartado: si tú
 * dices que valen, valen—. Un alimento que no está en ninguno se comporta
 * exactamente como hoy. **Quien no guarde ninguno no pierde nada.**
 */

import { newId } from '@/lib/ids';
import { norm } from '@/lib/texto';
import { matchFood } from './foodMatch';

/**
 * Veinte y no cuarenta como los platos: un grupo cubre un macro y una familia
 * («mi proteína magra», «mis hidratos de la cena»), y de eso no hay cuarenta.
 */
export const MAX_GRUPOS = 20;

/** Los tres macros que pueden definir un grupo: los mismos de `SWAP_MACRO`. */
const MACROS_VALIDOS = new Set(['protein', 'carbs', 'fats']);

/** Nombres saneados y sin repetir, conservando el orden en que se marcaron. */
const nombresDe = (foods) => {
  const vistos = new Set();
  const fuera = [];
  for (const f of foods || []) {
    const nombre = String(f || '').trim();
    const clave = norm(nombre);
    if (!nombre || !clave || vistos.has(clave)) continue;
    vistos.add(clave);
    fuera.push(nombre);
  }
  return fuera;
};

/**
 * Los grupos guardados, saneados.
 *
 * **Dos alimentos es el mínimo**: un grupo de uno no ofrece ningún cambio, y
 * enseñarlo sería un alimento con el botón de equivalencias abriendo una lista
 * vacía — que es justo lo que `foodEquiv` evita no pintando el botón.
 */
export const gruposOf = (coachPrefs) =>
  (Array.isArray(coachPrefs?.gruposEquiv?.items) ? coachPrefs.gruposEquiv.items : [])
    .filter(
      (g) =>
        g &&
        g.id &&
        String(g.name || '').trim() &&
        MACROS_VALIDOS.has(g.macro) &&
        Array.isArray(g.foods) &&
        nombresDe(g.foods).length >= 2
    )
    .map((g) => ({ ...g, name: String(g.name).trim(), foods: nombresDe(g.foods) }));

/** Un grupo nuevo. `savedAt` lo pone quien llama, que es quien tiene reloj. */
export const buildGrupo = ({ name, macro, foods = [], savedAt = null }) => ({
  id: newId('grupo'),
  name: String(name || '').trim(),
  macro,
  foods: nombresDe(foods),
  savedAt,
});

/**
 * El grupo al que pertenece un alimento, o `null`.
 *
 * ── Por el nombre, y por el del catálogo si es el mismo alimento ───────────
 * Los miembros se marcan de una lista que salió del catálogo, así que lo normal
 * es que el nombre sea literalmente el mismo. Pero una dieta IMPORTADA dice
 * «Plátano mediano» donde el catálogo dice «Plátano», y ese es el mismo plátano
 * a todos los efectos: la familia que decide su macro ya se resuelve así
 * (`foodCategory` llama a `matchFood`), y que el grupo usara otra regla dejaría
 * al alimento con familia y sin grupo.
 *
 * **Solo cuando el catálogo lo resuelve SIN DUDA** (`sure`). Un «Huevo» que
 * encaja con cinco entradas no entra en el grupo de ninguna: meter en un grupo
 * un alimento que nadie marcó es exactamente lo que el grupo viene a evitar.
 *
 * **Si un alimento cae en dos grupos manda el primero**, y quien guarda se
 * entera al guardarlo (`gruposQueYaLosTienen`). Repartir un alimento entre dos
 * criterios es una pregunta sin respuesta buena; decirlo, sí la tiene.
 */
export const grupoDe = (name, grupos = [], catalog = null) => {
  const clave = norm(String(name || ''));
  if (!clave) return null;

  const suyo = grupos.find((g) => (g.foods || []).some((f) => norm(f) === clave));
  if (suyo || !catalog?.length) return suyo || null;

  const canon = matchFood(name, catalog);
  if (!canon.sure || !canon.food?.name) return null;
  const otra = norm(canon.food.name);
  if (otra === clave) return null;

  return grupos.find((g) => (g.foods || []).some((f) => norm(f) === otra)) || null;
};

/**
 * Los grupos —distintos de `salvo`— que ya se llevan alguno de estos alimentos.
 * Es lo que se le dice a quien está guardando, antes de guardar.
 */
export const gruposQueYaLosTienen = (foods, grupos = [], salvo = null) => {
  const claves = new Set((foods || []).map((f) => norm(String(f || ''))).filter(Boolean));
  return grupos.filter(
    (g) => g.id !== salvo && (g.foods || []).some((f) => claves.has(norm(f)))
  );
};

/** «4 alimentos · proteína», para la fila de la vitrina. */
export const grupoSummary = (grupo, macroLabel) => {
  const n = (grupo?.foods || []).length;
  return `${n} ${n === 1 ? 'alimento' : 'alimentos'}${macroLabel ? ` · ${macroLabel.toLowerCase()}` : ''}`;
};

/** Si ya tienes un grupo llamado así (sin contar el que se está editando). */
export const nombreRepetido = (name, grupos = [], salvo = null) => {
  const clave = norm(String(name || ''));
  return grupos.some((g) => g.id !== salvo && norm(g.name) === clave);
};
