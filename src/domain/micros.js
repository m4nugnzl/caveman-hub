/**
 * LO QUE HAY QUE VIGILAR: las cuatro cifras del envase.
 *
 * ══ Por qué esto no es «información nutricional» ═══════════════════════════
 *
 * Una tabla de veintisiete vitaminas es un inventario, que es el error que
 * `/alimentos` ya cometía con cuatro columnas. Lo que se guarda aquí son las
 * cuatro cifras de la **declaración nutricional obligatoria en la UE** —fibra
 * (voluntaria, pero la declara casi todo el mundo), azúcares, saturadas y sal—
 * y el criterio de selección no es «las más importantes» sino tres cosas
 * comprobables:
 *
 *   · **Nada que aprender**: es el vocabulario del supermercado.
 *   · **Verificable**: cada número se contrasta con el producto en la mano.
 *   · **Rellenable a mano**, que es lo decisivo: `foods` —tu biblioteca— no va
 *     a tener siembra nunca, y sus alimentos son justo los de marca, que traen
 *     la etiqueta impresa.
 *
 * Cualquier micronutriente que exija una tabla de composición (hierro, B12,
 * vitamina D) es un proyecto de DATO con una licencia por resolver delante, y
 * no cabe aquí.
 *
 * ══ LA REGLA QUE NO SE NEGOCIA: la cifra viaja con su cobertura ════════════
 *
 * `null` es «no dice» y `0` es «no lleva», y aquí la diferencia muerde de
 * verdad: si 12 de 18 alimentos de un día declaran fibra, el total del día **es
 * un suelo, no un total**. Un suelo presentado como total es peor que no dar
 * cifra, porque parece una medida.
 *
 * Por eso `sumMicros` no devuelve un número: devuelve el número **y de cuántos
 * sale**. Quien lo pinte tiene que decir las dos cosas.
 *
 * ══ Y nunca un objetivo ════════════════════════════════════════════════════
 *
 * Ni CDR, ni porcentaje, ni semáforo. Tres motivos y el tercero zanja: la app
 * no receta; una CDR depende de sexo, edad, embarazo y medicación —datos que la
 * app no tiene o sobre los que no debe razonar—; y una chapa roja en el hierro
 * es un diagnóstico. La app pone la composición al lado de tu intención escrita
 * y la conclusión la sacas tú, que es la gramática de `blocks.js`.
 */

import { toNum } from '@/lib/num';

/**
 * Las cuatro, en el orden del envase.
 *
 * `key` nombra el micro; `field` es cómo se llama por 100 g en un alimento y en
 * una entrada de dieta —el mismo sufijo que `proteinPer100`, para que nadie
 * tenga que recordar dos convenciones—.
 */
export const MICROS = [
  { key: 'fiber', field: 'fiberPer100', label: 'Fibra', unit: 'g' },
  { key: 'sugars', field: 'sugarsPer100', label: 'Azúcares', unit: 'g' },
  { key: 'saturates', field: 'saturatesPer100', label: 'Saturadas', unit: 'g' },
  { key: 'salt', field: 'saltPer100', label: 'Sal', unit: 'g' },
];

const META = Object.fromEntries(MICROS.map((m) => [m.key, m]));

/** Cómo se dice un micro. Para no repetir la etiqueta en cuatro pantallas. */
export const microLabel = (key) => META[key]?.label || key;

/**
 * Lo que declara un alimento de un micro, por 100 g. `null` es «no dice».
 *
 * `toNum` y no `Number`: `numeric` llega de PostgREST como cadena, y `Number('')`
 * vale cero — que es precisamente la confusión que este módulo existe para
 * evitar.
 */
export const microPer100 = (food, key) => {
  const meta = META[key];
  if (!meta) return null;
  return toNum(food?.[meta.field]);
};

/** ¿Declara este alimento algo de este micro? */
export const declares = (food, key) => microPer100(food, key) !== null;

/**
 * Lo que aporta UNA entrada de dieta, según sus gramos. `null` si no declara.
 *
 * La misma cuenta que `foodMacros`, y separada de ella a propósito: los macros
 * siempre valen —cero es cero—, y esto puede no valer nada.
 */
export const foodMicro = (entry, key) => {
  const per100 = microPer100(entry, key);
  if (per100 === null) return null;
  return (per100 * (toNum(entry?.grams) ?? 0)) / 100;
};

/**
 * La suma de un conjunto de alimentos, CON SU COBERTURA.
 *
 * @returns `{ fiber: { value, declared, total }, … }` donde `value` es la suma
 *   de los que declaran, `declared` cuántos son y `total` cuántos hay. Con
 *   `declared === 0` el valor es `null` y no cero: nadie ha dicho nada.
 */
export const sumMicros = (foods = []) => {
  const lista = (foods || []).filter(Boolean);
  const out = {};

  for (const { key } of MICROS) {
    let value = 0;
    let declared = 0;
    for (const food of lista) {
      const aporte = foodMicro(food, key);
      if (aporte === null) continue;
      value += aporte;
      declared += 1;
    }
    out[key] = { value: declared > 0 ? value : null, declared, total: lista.length };
  }

  return out;
};

/**
 * «12 de 18 lo declaran», o `null` cuando lo declaran todos.
 *
 * Con cobertura completa la cifra ES la cifra, y añadir «18 de 18» sería ruido
 * en la única pantalla donde el número por fin no tiene asterisco.
 */
export const coverageSaid = ({ declared = 0, total = 0 } = {}) => {
  if (total === 0 || declared === 0) return null;
  if (declared >= total) return null;
  return `${declared} de ${total} lo declaran`;
};

/**
 * Un micro dicho entero: «22 g de fibra», o «Fibra: no dice».
 *
 * La cobertura NO va aquí dentro: quien lo pinta la enseña aparte —atenuada, en
 * su propia línea— porque es de otro orden. Meterlas en la misma frase acaba en
 * un renglón que nadie lee.
 */
export const microSaid = (key, resumen) => {
  const meta = META[key];
  if (!meta) return '';
  if (!resumen || resumen.value === null) return `${meta.label}: no dice`;
  /* Un decimal por debajo de 10 y entero por encima: la sal se lee «1,2 g» y la
     fibra «22 g». Redondear la sal a cero decimales la convertiría en «1 g»,
     que en un envase es otra cosa. */
  const n = resumen.value;
  const cifra = n < 10 ? Math.round(n * 10) / 10 : Math.round(n);
  return `${String(cifra).replace('.', ',')} ${meta.unit} de ${meta.label.toLowerCase()}`;
};

/**
 * Lo que un alimento declara, listo para CONGELARSE en una entrada de dieta.
 *
 * ══ Por qué se congela, como los macros ════════════════════════════════════
 *
 * Porque una dieta es una FOTO (ver `buildFoodEntry`): la entrada guarda nombre,
 * gramos y los tres macros del momento en que se añadió. Buscar los micros vivos
 * por nombre al pintarlos sería más fresco y rompería el modelo — la mitad de la
 * fila sería de ayer y la otra mitad de hoy.
 *
 * ── Solo las claves que existen ───────────────────────────────────────────
 * Un micro que el alimento no declara **no se escribe**, en vez de escribirse
 * como `null`. Así la ausencia sigue significando «no dice» sin que cada entrada
 * de cada dieta engorde con cuatro nulos, y una dieta montada antes de esto se
 * comporta exactamente igual que una de hoy sin esos datos: no dice.
 */
export const freezeMicros = (food) => {
  const out = {};
  for (const { key, field } of MICROS) {
    const value = microPer100(food, key);
    if (value !== null) out[field] = value;
  }
  return out;
};

/**
 * ¿Vale esta cifra por 100 g? Devuelve el error, o `null` si está bien.
 *
 * La hermana de `macroError` y con el mismo tope por el mismo motivo: **un
 * alimento no puede llevar más de 100 g de nada por cada 100 g**. En blanco vale
 * y significa «no dice», que es lo contrario de lo que significa en `macroError`
 * —allí en blanco es cero— y es la diferencia entera de este módulo.
 */
export const microError = (value) => {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const n = toNum(value);
  if (n === null) return 'Solo números.';
  if (n < 0) return 'No puede ser negativo.';
  if (n > 100) return 'Máximo 100 por 100 g.';
  return null;
};
