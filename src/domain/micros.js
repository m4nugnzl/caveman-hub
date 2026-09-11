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
 * ══ Nunca un objetivo QUE PONGA LA APP ═════════════════════════════════════
 *
 * Ni CDR, ni porcentaje, ni semáforo automático. Tres motivos y el tercero
 * zanja: la app no receta; una CDR depende de sexo, edad, embarazo y medicación
 * —datos que la app no tiene o sobre los que no debe razonar—; y una chapa roja
 * en el hierro es un diagnóstico.
 *
 * ── Lo que sí puede escribir el ENTRENADOR (10 sep 2026) ──────────────────
 * Eso deja fuera a la aplicación, no a quien la usa. Un mínimo de fibra o un
 * techo de sal escritos por el entrenador son exactamente lo mismo que las
 * 3.100 kcal de la casilla de al lado: su criterio, en su casilla, contra el
 * que se lee el menú. Así que los cuatro tienen `target` —el campo del objetivo
 * del día— y `sentido`, que es lo que evita el error de leerlos como macros:
 *
 *   · `min` (fibra) — pasarse está bien; quedarse corto es lo que se señala.
 *   · `max` (azúcares, saturadas, sal) — al revés.
 *
 * Un macro se juzga con `cuadra` en las dos direcciones porque un objetivo de
 * proteína es una cifra a la que llegar y de la que no pasarse. Estos no.
 *
 * Y siguen siendo OPCIONALES y opcionales de dos maneras: el objetivo puede no
 * estar puesto —entonces el micro se lee y no se juzga— y las cuatro cifras
 * enteras viven detrás del interruptor de opciones avanzadas del entrenador.
 * Apagado, esta pantalla no las nombra.
 */

import { toNum } from '@/lib/num';

/**
 * Las cuatro, en el orden del envase.
 *
 * `key` nombra el micro; `field` es cómo se llama por 100 g en un alimento y en
 * una entrada de dieta —el mismo sufijo que `proteinPer100`, para que nadie
 * tenga que recordar dos convenciones—; `target`, cómo se llama el objetivo del
 * día si el entrenador lo escribe (el mismo sufijo que `proteinGrams`), y
 * `sentido` dice si ese objetivo es un suelo o un techo. Ver la cabecera.
 */
export const MICROS = [
  { key: 'fiber', field: 'fiberPer100', target: 'fiberGrams', sentido: 'min', label: 'Fibra', unit: 'g' },
  { key: 'sugars', field: 'sugarsPer100', target: 'sugarsGrams', sentido: 'max', label: 'Azúcares', unit: 'g' },
  { key: 'saturates', field: 'saturatesPer100', target: 'saturatesGrams', sentido: 'max', label: 'Saturadas', unit: 'g' },
  { key: 'salt', field: 'saltPer100', target: 'saltGrams', sentido: 'max', label: 'Sal', unit: 'g' },
];

/** Los cuatro campos del objetivo, para quien guarda o limpia el día entero. */
export const MICRO_TARGET_FIELDS = MICROS.map((m) => m.target);

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
 * Lo que declara este alimento y, si él no dice nada, lo que sepa su ficha de
 * referencia —tu biblioteca o el catálogo—.
 *
 * ══ Por qué hace falta, y por qué NO rompe lo de congelar ══════════════════
 *
 * Una entrada de dieta es una foto: guarda los macros del día en que se añadió
 * (`freezeMicros`). Y las cuatro del envase llegaron DESPUÉS —migración 0102, y
 * las cifras del catálogo en la 0104—, así que todo lo que se pautó antes
 * congeló cuatro ausencias. Resultado: dietas montadas con avena, arroz y
 * lentejas diciendo «Fibra: no dice», que es lo que el dueño vio y no supo
 * explicarse. No es que no lo sepa la aplicación; es que esa copia es vieja.
 *
 * Aquí no se refresca ningún macro: los gramos y las kcal de la fila siguen
 * siendo los del día que se pautó, que es lo que hace que una dieta no se mueva
 * sola. Lo que se rellena es un HUECO, y solo cuando la copia no dice nada. Es
 * la misma regla que ya seguía la ficha del alimento (`EtiquetaNutricional`):
 * el dato de referencia vive una vez.
 *
 * @param general La fila de referencia de ese alimento, o `null`.
 */
export const declaredMicro = (food, general, key) => {
  const suyo = microPer100(food, key);
  return suyo === null ? microPer100(general, key) : suyo;
};

/**
 * La suma de un conjunto de alimentos, CON SU COBERTURA.
 *
 * @param general Opcional: `(alimento) => fila de referencia | null`, para
 *   rellenar lo que la copia congelada no diga. Ver `declaredMicro`.
 * @returns `{ fiber: { value, declared, total }, … }` donde `value` es la suma
 *   de los que declaran, `declared` cuántos son y `total` cuántos hay. Con
 *   `declared === 0` el valor es `null` y no cero: nadie ha dicho nada.
 */
export const sumMicros = (foods = [], general = null) => {
  const lista = (foods || []).filter(Boolean);
  const out = {};

  for (const { key } of MICROS) {
    let value = 0;
    let declared = 0;
    for (const food of lista) {
      const per100 = general ? declaredMicro(food, general(food), key) : microPer100(food, key);
      if (per100 === null) continue;
      value += (per100 * (toNum(food?.grams) ?? 0)) / 100;
      declared += 1;
    }
    out[key] = { value: declared > 0 ? value : null, declared, total: lista.length };
  }

  return out;
};

/**
 * ¿Cumple lo que le pediste? `null` cuando no hay objetivo o no hay cifra: sin
 * las dos no hay nada que decir, y decirlo igualmente sería inventar.
 *
 * El margen es del 10 % del propio objetivo y nunca menos de 1 g: estas cifras
 * salen de sumar etiquetas redondeadas a un decimal, así que un suelo exacto
 * pintaría en rojo un menú que se queda a medio gramo. Y se juzga por su
 * `sentido`: pasarse de fibra no es un fallo, pasarse de sal sí.
 *
 * @returns `'ok'` | `'corto'` | `'pasa'`
 */
export const microVerdict = (key, valor, objetivo) => {
  const meta = META[key];
  const pedido = toNum(objetivo);
  if (!meta || pedido === null || pedido <= 0 || valor === null || valor === undefined) return null;

  const margen = Math.max(1, pedido * 0.1);
  if (meta.sentido === 'min') return valor >= pedido - margen ? 'ok' : 'corto';
  return valor <= pedido + margen ? 'ok' : 'pasa';
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
