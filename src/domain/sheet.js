/**
 * Lo que llega pegado desde una hoja de cálculo, convertido en rejilla.
 *
 * ══ Por qué el portapapeles y no el fichero ════════════════════════════════
 *
 * Copiar en Excel y pegar aquí entrega **TSV** —una fila por línea, un tabulador
 * por celda— sin pedir permiso ni pasar por disco. Lo mismo hacen Google Sheets,
 * Numbers, LibreOffice y una tabla de Word. Leer un `.xlsx` de verdad es
 * descomprimir un zip con XML dentro: una dependencia de cientos de kilobytes
 * para obtener exactamente lo que el portapapeles ya da.
 *
 * Así que esto no es un lector de Excel: es un lector de lo que sale de Excel,
 * que es lo que hace falta y no ata el proyecto a ningún formato de nadie.
 *
 * ══ Por qué nada de aquí sabe qué es una rutina ════════════════════════════
 *
 * Una hoja de rutina y una lista de clientes son el mismo problema hasta el
 * último paso: trocear, quitar lo que sobra y averiguar qué hay en cada columna.
 * Lo que cambia es únicamente qué se busca. Este archivo hace las tres primeras
 * cosas y no conoce ni ejercicios ni series; `routineSheet.js` pone el
 * vocabulario encima.
 */

/**
 * Trocea una línea respetando las comillas.
 *
 * El TSV del portapapeles casi nunca las lleva —el tabulador no aparece dentro
 * de una celda—, pero un CSV guardado a disco sí: una nota como
 * `"Rir 1, primera serie"` partida por la coma convierte una fila en dos
 * columnas de más y descoloca TODAS las de su derecha. Con una hoja de sesenta
 * columnas eso no se ve: se ve mucho después, en un dato que no cuadra.
 */
const splitLine = (line, sep) => {
  if (sep === '\t') return line.split('\t');

  const cells = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      // `""` dentro de un campo entrecomillado es una comilla literal.
      if (quoted && line[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (ch === sep && !quoted) {
      cells.push(cell);
      cell = '';
    } else {
      cell += ch;
    }
  }
  cells.push(cell);
  return cells;
};

/**
 * Qué separa las celdas.
 *
 * El tabulador gana en cuanto aparece una sola vez, y no por mayoría: es lo que
 * pone el portapapeles, y un texto pegado de Excel que además contenga comas
 * dentro de una nota seguiría siendo TSV. Solo cuando no hay ni un tabulador en
 * todo el texto tiene sentido preguntarse si es punto y coma o coma —el eterno
 * CSV español frente al inglés—, y ahí sí decide quién sale más veces.
 */
export const detectSeparator = (text) => {
  if (text.includes('\t')) return '\t';
  const puntoYComa = (text.match(/;/g) || []).length;
  const comas = (text.match(/,/g) || []).length;
  if (puntoYComa === 0 && comas === 0) return '\t';
  return puntoYComa >= comas ? ';' : ',';
};

/**
 * Quita las filas y columnas que están vacías **del todo**.
 *
 * No es limpieza cosmética, es lo que hace viable todo lo demás. Una hoja real
 * de mesociclo ocupa mil columnas de las que ciento setenta tienen algo: las
 * demás son márgenes, celdas combinadas y huecos entre bloques. Sin recortar,
 * cualquier búsqueda por posición —«el músculo está dos columnas a la izquierda
 * del nombre»— depende de cuántos huecos dejó quien maquetó la hoja, que es
 * justo lo que no se puede saber.
 *
 * Recortadas, dos hojas maquetadas de forma distinta se parecen mucho más.
 */
export const trimGrid = (rows) => {
  if (!rows.length) return [];
  const ancho = Math.max(...rows.map((r) => r.length));

  const conContenido = [];
  for (let c = 0; c < ancho; c += 1) {
    if (rows.some((r) => (r[c] || '') !== '')) conContenido.push(c);
  }

  return rows
    .map((r) => conContenido.map((c) => r[c] || ''))
    .filter((r) => r.some((c) => c !== ''));
};

/** El texto pegado, ya en rejilla y sin lo que sobra. */
export const toGrid = (text) => {
  const limpio = String(text || '').replace(/\r\n?/g, '\n');
  if (!limpio.trim()) return [];
  const sep = detectSeparator(limpio);
  return trimGrid(limpio.split('\n').map((line) => splitLine(line, sep).map((c) => c.trim())));
};

/** Sin tildes y en minúsculas: como se comparan de verdad dos palabras escritas por personas distintas. */
export const key = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase();

/** ¿Esto es un nombre y no un número, un guion o una celda de relleno? */
export const hasWords = (value) => /\p{L}{2}/u.test(String(value || ''));

/** La primera columna cuya cabecera encaja, o −1. */
export const headerIndex = (row, re) => (row || []).findIndex((c) => re.test(c));

/** Todas las columnas cuya cabecera encaja. Sirve para detectar bloques repetidos. */
export const headerIndexes = (row, re) =>
  (row || []).map((c, i) => (re.test(c) ? i : -1)).filter((i) => i >= 0);

/** Los valores no vacíos de una columna. */
export const columnValues = (rows, index) =>
  index < 0 ? [] : rows.map((r) => r[index] || '').filter((v) => v !== '');

/**
 * La columna que mejor encaja con lo que se busca, mirando su CONTENIDO.
 *
 * Es la red de seguridad para cuando la cabecera no ayuda: porque no la hay,
 * porque está abreviada («Ej.», «S», «R») o porque la celda está combinada y el
 * rótulo cayó tres columnas más allá. Una columna donde ocho de cada diez celdas
 * son «Pecho», «Dorsal» o «Tríceps» es la columna del músculo, se llame como se
 * llame y aunque no se llame de ninguna manera.
 *
 * `min` alto a propósito: con el listón bajo, cualquier columna dispersa acaba
 * pareciéndose a lo que se busca, y una columna elegida por error es peor que no
 * encontrar ninguna — lo segundo se ve y se corrige, lo primero se cree.
 */
/**
 * Dónde una fila de cabecera empieza a repetirse, y cada cuánto.
 *
 * ══ Qué problema resuelve, y por qué es estructural ════════════════════════
 *
 * Una hoja de seguimiento crece hacia la DERECHA: a la izquierda está lo que se
 * planifica una vez, y a partir de cierta columna empieza un bloque —peso,
 * repeticiones, esfuerzo— que se repite una vez por semana o por serie, veinte
 * veces. Saber dónde empieza esa repetición es lo que separa el plan del
 * registro, y sin ese corte los rótulos del primer bloque de registro se
 * confunden con los del plan (un `RIR` de la semana 1 leído como el RIR objetivo).
 *
 * La primera versión de esto buscaba la palabra «PESO», que es exactamente el
 * error que hay que evitar: funcionaba con la hoja que teníamos delante y con
 * ninguna garantía más. La repetición, en cambio, **no depende del idioma ni del
 * vocabulario**: es una propiedad de la forma de la fila.
 *
 * Se exige que el bloque se repita **tres veces o más**. Con dos, dos ejercicios
 * puestos uno al lado del otro —una maquetación legítima— se leerían como
 * registro y se perdería la mitad de la tabla.
 *
 * @returns `{ start, period }` o `null` si la fila no se repite.
 */
export const headerPeriod = (row, { minRepeats = 3 } = {}) => {
  const celdas = row || [];
  const n = celdas.length;

  for (let start = 0; start < n; start += 1) {
    const restantes = n - start;
    for (let period = 2; period <= Math.floor(restantes / minRepeats); period += 1) {
      const bloque = celdas.slice(start, start + period);
      /* Un bloque de celdas vacías se «repite» siempre y no significa nada. */
      if (!bloque.some((c) => c !== '')) continue;

      let repeticiones = 0;
      for (let i = start; i + period <= n; i += period) {
        if (celdas.slice(i, i + period).every((c, j) => c === bloque[j])) repeticiones += 1;
        else break;
      }
      if (repeticiones >= minRepeats) return { start, period };
    }
  }
  return null;
};

export const bestColumn = (rows, predicate, { min = 0.6, exclude = [] } = {}) => {
  const ancho = Math.max(0, ...rows.map((r) => r.length));
  let mejor = { index: -1, score: 0 };

  for (let c = 0; c < ancho; c += 1) {
    if (exclude.includes(c)) continue;
    const valores = columnValues(rows, c);
    if (valores.length < 2) continue;

    const score = valores.filter((v) => predicate(v)).length / valores.length;
    if (score >= min && score > mejor.score) mejor = { index: c, score };
  }

  return mejor.index;
};
