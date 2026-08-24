/**
 * Una rutina escrita fuera de aquí, leída.
 *
 * ══ La tesis: el formato varía entre entrenadores, no dentro de uno ═════════
 *
 * No hay dos hojas de rutina iguales, y escribir un lector que entienda «todos
 * los formatos» no termina nunca. Pero al mirar hojas reales aparece algo que sí
 * se puede aprovechar: por debajo de la maquetación —que es donde está toda la
 * variedad— solo hay **dos maneras de decir cuántas series lleva un ejercicio**.
 *
 *   FAMILIA «series»   Una columna que se llama SERIES con un número dentro.
 *                      El registro de cada semana va a la DERECHA del plan.
 *
 *                        GRUPO MUSCULAR │ EJERCICIO │ SERIES │ RANGO │ RIR │ …
 *                        BÍCEPS         │ Curl      │   3    │  8-10 │  0  │ …
 *
 *   FAMILIA «bloques»  No hay columna de series: hay un bloque de columnas por
 *                      serie, repetido, y las series son cuántos bloques traen
 *                      objetivo. Aquí plan y registro van ENTRELAZADOS.
 *
 *                        Nº │ Ejercicio │ Músculo │ KGs REPS RIR Rango │ KGs REPS RIR Rango │ …
 *                         1 │ Curl      │ Bíceps  │  20   8   0   6-8  │  18   9   0  8-10  │ …
 *
 * Distinguirlas es una línea: si existe una columna llamada SERIES, gana esa.
 * Un recuento explícito vale más que cualquier deducción — y esa regla salió de
 * equivocarse: una hoja con veinte semanas de registro repite las cabeceras
 * `PESO / SERIE 1..4` tantas veces que parece de la familia «bloques», y se leía
 * con una serie por ejercicio en vez de tres.
 *
 * Hay una tercera entrada, «texto», para lo que no es una tabla: la rutina
 * pegada de un Word o escrita a mano, `Press banca 4x8-10 RIR2`.
 *
 * ══ Qué se trae y qué no ═══════════════════════════════════════════════════
 *
 * Se trae el PLAN: nombre, músculo, cuántas series, el objetivo de repeticiones
 * de cada una, el RIR objetivo y la indicación del entrenador. **No se traen los
 * kilos ni las repeticiones registradas**, aunque estén ahí y aunque sean la
 * mitad del fichero. Es la misma regla que `cloneExerciseAsTemplate`: importar
 * un registro con fecha fabricaría entrenamientos que en esta aplicación no
 * ocurrieron, y la progresión de fuerza —que es lo que mira el entrenador—
 * quedaría contando sesiones que no existen.
 *
 * ══ Por qué esto nunca decide del todo ═════════════════════════════════════
 *
 * Cada cosa que se deduce viene marcada: el músculo que no se supo traducir, el
 * día que no se supo nombrar, y las DOS columnas de objetivo cuando la hoja trae
 * dos (pasa: «8-10» para las primeras semanas y «10-12» para las últimas, bajo
 * una cabecera combinada). Nada de eso se resuelve aquí a la brava, porque quien
 * está importando lo sabe y esto no. Se propone, se enseña y se deja corregir.
 */

import { newId } from '@/lib/ids';
import {
  bestColumn,
  columnValues,
  hasWords,
  headerIndex,
  headerIndexes,
  headerPeriod,
  toGrid,
  trimGrid,
} from './sheet';
import { emptySet, normalizeMuscle } from './training';

/* ══ El vocabulario de las cabeceras ═══════════════════════════════════════
   En castellano y en inglés, porque media profesión usa plantillas traducidas a
   medias. Se comparan contra la celda ENTERA y no como subcadena: «Nº SERIES»
   es la columna de series, pero «SERIES TOTALES» —el resumen de arriba de la
   hoja— no lo es, y por subcadena serían la misma. */
const RE_NOMBRE = /^(ejercicios?|ejerc\.?|ej\.?|movimientos?|exercises?)$/i;
const RE_SERIES = /^(n[.ºo°]?\s*)?(series?|sets?)$/i;
const RE_RANGO = /^(rango\s*(de\s*)?(reps?|repeticiones)?|objetivo|rep\s*range|target)$/i;
const RE_REPS = /^(reps?|repeticiones)$/i;
const RE_RIR = /^(rir|rpe)(\s*objetivo)?$/i;
const RE_MUSCULO = /^(grupo\s*muscular|m[uú]sculo|grupo|muscle(\s*group)?)$/i;
const RE_NOTA = /^(especificaciones|notas?|observaciones|comentarios?|t[eé]cnica|indicaciones?|notes?)$/i;
const RE_DIA_COLUMNA = /^(d[ií]a|sesi[oó]n|day|jornada)$/i;

/**
 * Las filas de recuento que una hoja deja al final de la tabla.
 *
 * «TOTAL SERIES │ 7» tiene nombre y tiene un número donde van las series, así
 * que por forma es indistinguible de un ejercicio y entra como uno llamado
 * «TOTAL SERIES». Una de las dos plantillas reales se libraba por casualidad
 * —su celda de nombre trae un `0` y no una palabra—, que es justo la clase de
 * suerte con la que no se puede contar.
 *
 * Es una lista corta y a propósito: no pretende reconocer todos los resúmenes
 * del mundo, solo los que se llaman como se llaman siempre. Lo que se escape se
 * ve en la previsualización y se quita antes de crear nada.
 */
const RE_RESUMEN = /^(totales?|total\s|suma|sumatorio|resumen|tonelaje|volumen\s+total|totals?|sum)\b/i;

/* La etiqueta que precede al nombre de un día dentro de la hoja. Sin dos puntos
   obligatorios: unos escriben «ENFOQUE:» y otros «ENTRENAMIENTO». */
const RE_ETIQUETA_DIA = /^(enfoque|d[ií]a|sesi[oó]n|entrenamiento|rutina|split|bloque)\s*:?\s*$/i;

/* Nombres de día que se reconocen solos, sin etiqueta delante. */
const RE_DIA_SUELTO =
  /^(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|push|pull|piernas?|pierna\s*[ab]|torso|empuje|tir[oó]n|full\s*body|upper|lower|d[ií]a\s*\d+|sesi[oó]n\s*\d+)\b/i;

/* ══ Formas de valor ═══════════════════════════════════════════════════════ */

/** «8-10», «8/10/12», «12», «AMRAP». Lo que un entrenador escribe como objetivo. */
const esRango = (v) =>
  /^\d{1,3}\s*(?:[-–/a]\s*\d{1,3}\s*)+$/i.test(v) ||
  /^(amrap|fallo|al\s*fallo|m[aá]x(imo)?)$/i.test(v);

/** Igual, pero admitiendo un número suelto: solo vale donde la cabecera ya dijo que es un rango. */
const esRangoODigito = (v) => esRango(v) || /^\d{1,3}$/.test(v);

/** Un recuento de series creíble. Doce es mucho; más de doce es otra cosa mal leída. */
const esNumeroDeSeries = (v) => {
  const n = Number.parseInt(String(v).trim(), 10);
  return Number.isInteger(n) && n >= 1 && n <= 12;
};

/** ¿Esta celda es un grupo muscular reconocible? Para localizar su columna sin cabecera. */
const esMusculo = (v) => Boolean(normalizeMuscle(v)?.sure);

/** «4x8», «4 x 8-10»: series y objetivo en una sola celda. */
const RE_NXM = /(\d{1,2})\s*[x×]\s*(\d{1,3}(?:\s*[-–/]\s*\d{1,3})?)/i;

/* ══ Celdas combinadas ═════════════════════════════════════════════════════ */

/**
 * Hasta dónde llega una cabecera.
 *
 * Excel exporta una celda combinada como el valor en la primera columna y vacío
 * en las demás. Así que «RANGO DE REPETICIONES» ocupando dos columnas llega como
 * un rótulo y una columna anónima a su derecha — y esa columna anónima tiene
 * datos. Sin esto, la mitad de las hojas pierden su segunda columna de objetivo
 * sin que nada lo diga.
 *
 * El tramo de una cabecera va desde ella hasta la siguiente cabecera con texto.
 */
const tramoDeCabecera = (cabecera, index) => {
  let fin = index + 1;
  while (fin < cabecera.length && (cabecera[fin] || '') === '') fin += 1;
  return [index, fin];
};

/** El primer valor con contenido dentro del tramo de una cabecera. */
const valorEnTramo = (fila, cabecera, index) => {
  if (index < 0) return '';
  const [desde, hasta] = tramoDeCabecera(cabecera, index);
  for (let c = desde; c < hasta; c += 1) if ((fila[c] || '') !== '') return fila[c];
  return '';
};

/* ══ El nombre del día ═════════════════════════════════════════════════════ */

/**
 * Cómo se llama el bloque que empieza en esta fila, buscando hacia arriba.
 *
 * Seis filas de margen y no más: por encima de eso lo que hay es la cabecera de
 * la hoja —el nombre del mesociclo, el gráfico de volumen— y cogerla de ahí
 * llamaría «PLAN DE ENTRENAMIENTO» a los cinco días.
 */
const nombreDelDiaArriba = (grid, filaCabecera) => {
  for (let r = filaCabecera - 1; r >= Math.max(0, filaCabecera - 6); r -= 1) {
    const fila = grid[r];

    const etiqueta = headerIndex(fila, RE_ETIQUETA_DIA);
    if (etiqueta >= 0) {
      const valor = fila.slice(etiqueta + 1).find((c) => c !== '');
      if (valor) return valor;
    }

    /* Una fila con una sola celda que ya suena a día: «TORSO», «Pierna A». */
    const conTexto = fila.filter((c) => c !== '');
    if (conTexto.length === 1 && RE_DIA_SUELTO.test(conTexto[0])) return conTexto[0];
  }
  return null;
};

/** El nombre de día que hay en una línea suelta de texto, o `null`. */
const nombreDelDiaEnLinea = (linea) => {
  const limpia = String(linea).replace(/^[\s\-–•*·]+/, '').replace(/[:.\s]+$/, '').trim();
  if (!limpia || !hasWords(limpia)) return null;
  if (limpia.length > 48) return null;

  /* Los separadores se comen enteros: «Día 1 · Push», «Día 2 - Pull» y
     «Sesión 3: Pierna» son la misma frase con distinta puntuación. */
  const conEtiqueta = /^(?:d[ií]a|sesi[oó]n|day)\s*(\d+)?\s*[:.\-–—·|]*\s*(.*)$/i.exec(limpia);
  if (conEtiqueta) {
    const resto = (conEtiqueta[2] || '').trim();
    return resto || limpia;
  }
  return RE_DIA_SUELTO.test(limpia) ? limpia : null;
};

/* ══ Modo texto: una rutina escrita, no tabulada ═══════════════════════════ */

/**
 * Una línea de rutina, en trozos.
 *
 * Se extraen los TOKENS en cualquier orden y lo que sobra es el nombre. Es lo
 * contrario de reconocer la línea entera con una expresión por formato: de esas
 * hacen falta infinitas, porque cada uno pone el RIR delante, detrás o entre
 * paréntesis. De tokens hay media docena y son independientes.
 */
const parsearLineaDeTexto = (linea) => {
  let resto = ` ${linea} `;
  let series = null;
  let objetivo = '';
  let rir = '';

  const comer = (re, alEncontrar) => {
    const m = re.exec(resto);
    if (!m) return;
    alEncontrar(m);
    resto = resto.replace(m[0], ' ');
  };

  /* El RIR primero: «@2» y «RIR 2» llevan números que los demás tokens
     confundirían con series o repeticiones. */
  comer(/\b(?:rir|rpe)\s*[:=]?\s*(\d{1,2})\b/i, (m) => { rir = m[1]; });
  comer(/@\s*(\d{1,2})\b/, (m) => { if (!rir) rir = m[1]; });

  comer(RE_NXM, (m) => { series = Number.parseInt(m[1], 10); objetivo = m[2].replace(/\s+/g, ''); });
  comer(/\b(\d{1,2})\s*(?:series?|sets?)\b/i, (m) => { series = series ?? Number.parseInt(m[1], 10); });
  comer(/\b(\d{1,3}(?:\s*[-–/]\s*\d{1,3})?)\s*(?:reps?|repeticiones)\b/i, (m) => {
    if (!objetivo) objetivo = m[1].replace(/\s+/g, '');
  });
  /* Los kilos se reconocen para QUITARLOS del nombre, no para guardarlos. */
  comer(/\b\d+(?:[.,]\d+)?\s*(?:kgs?|lbs?)\b/i, () => {});
  comer(/\b(?:de|x)?\s*(\d{1,3}\s*[-–/]\s*\d{1,3})\s*$/i, (m) => {
    if (!objetivo) objetivo = m[1].replace(/\s+/g, '');
  });

  const nombre = resto
    .replace(/^[\s\-–•*·\d.)]+/, '')
    .replace(/[\s:,.\-–]+$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (!hasWords(nombre) || series === null) return null;
  return { nombre, series, objetivo, rir };
};

const parsearTexto = (lineas) => {
  const dias = [];
  let actual = null;

  for (const linea of lineas) {
    if (!linea.trim()) continue;

    const ejercicio = parsearLineaDeTexto(linea);
    if (ejercicio) {
      if (!actual) {
        actual = { name: null, exercises: [] };
        dias.push(actual);
      }
      actual.exercises.push({
        name: ejercicio.nombre,
        muscle: 'Otros',
        muscleRaw: '',
        muscleSure: false,
        sets: ejercicio.series,
        targetOptions: [Array.from({ length: ejercicio.series }, () => ejercicio.objetivo)],
        rir: ejercicio.rir,
        note: '',
      });
      continue;
    }

    /* No es un ejercicio. Si suena a día, abre uno; si no, se ignora —son los
       títulos, las notas sueltas y las líneas de adorno. */
    const nombre = nombreDelDiaEnLinea(linea);
    if (nombre) {
      actual = { name: nombre, exercises: [] };
      dias.push(actual);
    }
  }

  return dias.filter((d) => d.exercises.length > 0);
};

/* ══ Modo tabla ════════════════════════════════════════════════════════════ */

/** Las filas de cabecera de la hoja: cada una abre un bloque. */
const filasDeCabecera = (grid) =>
  grid.map((f, i) => (headerIndex(f, RE_NOMBRE) >= 0 ? i : -1)).filter((i) => i >= 0);

/**
 * Dónde empieza el registro semanal, para no leerlo como si fuera plan.
 *
 * En la familia «series» el plan está a la IZQUIERDA y las semanas registradas
 * se van añadiendo a la derecha, que es como crece una hoja. Sin este corte, el
 * RIR objetivo de una hoja de veinte semanas se lee del primer bloque de
 * registro en lugar de la columna del plan.
 *
 * ══ Qué se corrigió aquí, y por qué importa ════════════════════════════════
 *
 * La primera versión buscaba la palabra «PESO» y cortaba en su primera
 * aparición si salía más de una vez. Funcionaba con la hoja que teníamos
 * delante y no garantizaba nada más: bastaba una hoja en inglés, o una que
 * llamara a esa columna «Carga usada», para que el corte no ocurriera.
 *
 * Ahora el corte lo decide `headerPeriod`, que busca **dónde la fila empieza a
 * repetirse**. Es la misma idea dicha sin vocabulario: un registro semanal es
 * un bloque de columnas repetido, se llame como se llame y esté en el idioma
 * que esté. La palabra «PESO» ya no aparece en esta decisión.
 *
 * ══ Dónde NO se puede usar, y por qué ══════════════════════════════════════
 *
 * El principio de un tramo repetido es ambiguo por construcción. Si el plan
 * termina en `RIR` y cada semana registrada empieza por `Peso … RIR`, la fila
 * dice `RIR Peso S1 S2 S3 RIR Peso S1 S2 S3 …`: se repite igual empezando por el
 * `RIR` del plan que por el primer `Peso`, y no hay forma de saber cuál de los
 * dos es el borde de verdad. Cortar por el primero se lleva el RIR objetivo.
 *
 * Por eso este corte NO decide dónde está cada columna del plan. Para eso vale
 * algo más simple y que no puede equivocarse: **la primera aparición de cada
 * rótulo**, que es la del plan porque el registro se añade a la derecha. El
 * corte queda solo para lo que de verdad lo necesita — el respaldo que busca
 * columnas de repeticiones sin que ningún rótulo diga «rango», que sin él
 * recoge las veinte semanas de registro.
 */
const limiteDelPlan = (cabecera) => headerPeriod(cabecera)?.start ?? Number.POSITIVE_INFINITY;

/** Las columnas de objetivo de repeticiones, con las que trae una cabecera combinada. */
const columnasDeObjetivo = (grid, filaCabecera, cuerpo, familia) => {
  const cabecera = grid[filaCabecera];

  /* La palabra «rango» es la señal más fiable de que una columna es OBJETIVO y
     no registro, así que se busca primero — y también en las filas de encima,
     porque en la familia «bloques» el rótulo vive en la fila de «Serie 1». */
  let raices = headerIndexes(cabecera, RE_RANGO);
  if (!raices.length && familia === 'bloques') {
    for (let r = filaCabecera - 1; r >= Math.max(0, filaCabecera - 3); r -= 1) {
      const arriba = headerIndexes(grid[r], RE_RANGO);
      if (arriba.length) {
        raices = arriba;
        break;
      }
    }
  }
  /* El respaldo: ninguna columna dice «rango», así que valen las que dicen
     «reps». Es el único sitio donde hace falta el corte del registro: `REPS` se
     repite una vez por semana, y sin él entrarían las veinte. */
  if (!raices.length) {
    const limite = limiteDelPlan(cabecera);
    raices = headerIndexes(cabecera, RE_REPS).filter((i) => i < limite);
  }
  if (!raices.length) return [];

  /* De cada rótulo salen todas las columnas de su tramo que de verdad traen
     rangos: así se recupera la segunda columna de una cabecera combinada. */
  const columnas = [];
  for (const raiz of raices) {
    const [desde, hasta] = tramoDeCabecera(cabecera, raiz);
    for (let c = desde; c < hasta; c += 1) {
      const valores = columnValues(cuerpo, c);
      if (valores.length && valores.some(esRangoODigito)) columnas.push(c);
    }
  }
  return columnas;
};

/** Un bloque de tabla —una cabecera y sus filas— convertido en días. */
const parsearBloque = (grid, filaCabecera, filaFin, nombreHeredado = null) => {
  const cabecera = grid[filaCabecera];
  const colNombre = headerIndex(cabecera, RE_NOMBRE);
  const colSeries = headerIndex(cabecera, RE_SERIES);

  /* Un ejercicio tiene nombre, y un nombre tiene letras. Con eso se caen solas
     las filas de resumen que la propia hoja deja debajo de la tabla
     («SERIES │ 0 │ 0 │ 5 │ …»), sin tener que reconocerlas una a una. */
  const cuerpo = grid.slice(filaCabecera + 1, filaFin).filter((f) => {
    const nombre = valorEnTramo(f, cabecera, colNombre);
    return hasWords(nombre) && !RE_RESUMEN.test(nombre);
  });
  if (!cuerpo.length) return [];

  const familia = colSeries >= 0 ? 'series' : 'bloques';
  /*
    La primera aparición de un rótulo es la del PLAN, porque el registro se
    añade a la derecha. No hace falta saber dónde acaba el plan para eso, y
    saberlo mal —el borde de un tramo repetido es ambiguo, ver `limiteDelPlan`—
    costaba el RIR objetivo en las hojas cuyo plan termina justo en `RIR`.
  */
  const existe = (i) => i >= 0;

  const colsObjetivo = columnasDeObjetivo(grid, filaCabecera, cuerpo, familia);
  const colNota = headerIndex(cabecera, RE_NOTA);
  const colDia = headerIndex(cabecera, RE_DIA_COLUMNA);

  /*
    El RIR del plan, y solo el del plan. En la familia «bloques» el RIR vive
    DENTRO de cada bloque de serie junto a los kilos: ahí es lo que el cliente
    anotó, no lo que se le pidió, así que no se trae.
  */
  const colRir = familia === 'series' ? headerIndex(cabecera, RE_RIR) : -1;

  /* La columna del músculo suele no tener rótulo —va pegada al nombre— así que
     cuando la cabecera no la nombra se busca por contenido. */
  const colMusculoRotulada = headerIndex(cabecera, RE_MUSCULO);
  const colMusculo =
    colMusculoRotulada >= 0
      ? colMusculoRotulada
      : bestColumn(cuerpo, esMusculo, { exclude: [colNombre, colSeries, ...colsObjetivo] });

  /*
    ══ El nombre se dice una vez y vale para lo que viene debajo ═════════════

    Una hoja de seguimiento escribe «ENTRENAMIENTO … Torso» arriba del todo y
    repite la tabla veinticinco veces, una por fecha, sin volver a nombrarla.
    Solo el primer bloque encuentra nombre, y sin heredarlo los otros
    veinticuatro serían días distintos «sin nombre» que ya no se pueden juntar
    con el primero.

    El riesgo asumido es el contrario —cinco días distintos de los que solo el
    primero está rotulado acabarían llamándose los cinco igual—, y se asume
    porque es raro (quien tiene cinco días los nombra) y porque se ve: el nombre
    de cada día sale escrito y editable en la previsualización antes de crear
    nada.
  */
  const porDia = new Map();
  const nombreBase = nombreDelDiaArriba(grid, filaCabecera) ?? nombreHeredado;

  for (const fila of cuerpo) {
    const name = valorEnTramo(fila, cabecera, colNombre).trim();

    /* Cuántas series y con qué objetivo, según la familia. */
    let sets = 0;
    let objetivosPorColumna = [];

    if (familia === 'series') {
      const celda = valorEnTramo(fila, cabecera, colSeries);
      const nxm = RE_NXM.exec(celda);
      sets = nxm ? Number.parseInt(nxm[1], 10) : Number.parseInt(celda, 10);
      if (!esNumeroDeSeries(sets)) continue;

      const candidatos = colsObjetivo
        .map((c) => fila[c] || '')
        .filter((v) => esRangoODigito(v));
      if (nxm) candidatos.unshift(nxm[2].replace(/\s+/g, ''));

      objetivosPorColumna = (candidatos.length ? candidatos : ['']).map((v) =>
        Array.from({ length: sets }, () => v)
      );
    } else {
      const porSerie = colsObjetivo.map((c) => fila[c] || '');
      const conValor = porSerie.filter((v) => esRangoODigito(v));
      sets = conValor.length;
      if (!sets) continue;
      objetivosPorColumna = [conValor];
    }

    const crudo = colMusculo >= 0 ? (fila[colMusculo] || '').trim() : '';
    const musculo = normalizeMuscle(crudo);

    const clave = colDia >= 0 ? valorEnTramo(fila, cabecera, colDia).trim() || nombreBase : nombreBase;
    if (!porDia.has(clave)) porDia.set(clave, { name: clave || null, exercises: [] });

    porDia.get(clave).exercises.push({
      name,
      muscle: musculo?.muscle ?? 'Otros',
      muscleRaw: crudo,
      muscleSure: Boolean(musculo?.sure),
      sets,
      targetOptions: objetivosPorColumna,
      rir: existe(colRir) ? (fila[colRir] || '').trim() : '',
      note: existe(colNota) ? valorEnTramo(fila, cabecera, colNota).trim() : '',
    });
  }

  return [...porDia.values()].filter((d) => d.exercises.length > 0);
};

/**
 * Una tabla sin ninguna cabecera reconocible: se clasifica por contenido.
 *
 * Es la red de seguridad para la hoja que no hemos visto. Con que se acierte la
 * columna del nombre y una de las dos que dicen cuántas series hay, ya se puede
 * proponer algo — y lo que salga mal se corrige en la previsualización, que para
 * eso está.
 */
const parsearSinCabecera = (grid) => {
  const colMusculo = bestColumn(grid, esMusculo);
  const colSeries = bestColumn(grid, esNumeroDeSeries, { min: 0.7, exclude: [colMusculo] });
  const colObjetivo = bestColumn(grid, esRango, { min: 0.5, exclude: [colMusculo, colSeries] });
  const colNombre = bestColumn(
    grid,
    (v) => hasWords(v) && v.length >= 4 && !esMusculo(v) && !esRango(v),
    { min: 0.6, exclude: [colMusculo, colSeries, colObjetivo] }
  );

  if (colNombre < 0 || (colSeries < 0 && colObjetivo < 0)) return [];

  const dias = [];
  let actual = null;

  for (const fila of grid) {
    const name = (fila[colNombre] || '').trim();
    const sets = Number.parseInt(fila[colSeries] || '', 10);

    if (!hasWords(name) || RE_RESUMEN.test(name) || !esNumeroDeSeries(sets)) {
      /* Una fila con una sola celda entre ejercicios es la cabecera de un día. */
      const conTexto = fila.filter((c) => c !== '');
      const nombreDia = conTexto.length === 1 ? nombreDelDiaEnLinea(conTexto[0]) : null;
      if (nombreDia) {
        actual = { name: nombreDia, exercises: [] };
        dias.push(actual);
      }
      continue;
    }

    if (!actual) {
      actual = { name: null, exercises: [] };
      dias.push(actual);
    }

    const crudo = colMusculo >= 0 ? (fila[colMusculo] || '').trim() : '';
    const musculo = normalizeMuscle(crudo);
    const objetivo = colObjetivo >= 0 ? (fila[colObjetivo] || '').trim() : '';

    actual.exercises.push({
      name,
      muscle: musculo?.muscle ?? 'Otros',
      muscleRaw: crudo,
      muscleSure: Boolean(musculo?.sure),
      sets,
      targetOptions: [Array.from({ length: sets }, () => objetivo)],
      rir: '',
      note: '',
    });
  }

  return dias.filter((d) => d.exercises.length > 0);
};

/* ══ Repetidos ═════════════════════════════════════════════════════════════ */

/**
 * Quita los bloques que son el mismo día otra vez.
 *
 * Una hoja de seguimiento repite la MISMA sesión una vez por fecha —veinticinco
 * bloques idénticos, uno por semana— porque cada uno guarda lo que se levantó
 * ese día. Como los kilos no se traen, los veinticinco son el mismo plan, y
 * meterlos todos crearía veinticinco días iguales.
 *
 * La firma es el plan, no el nombre: dos días llamados «Torso» con ejercicios
 * distintos son dos días de verdad y los dos entran.
 */
const quitarRepetidos = (dias) => {
  const vistos = new Map();
  for (const dia of dias) {
    const firma = `${dia.name || ''}¬${dia.exercises.map((e) => `${e.name}|${e.sets}`).join('¬')}`;
    if (!vistos.has(firma)) vistos.set(firma, dia);
  }
  return [...vistos.values()];
};

/* ══ La entrada ════════════════════════════════════════════════════════════ */

/**
 * Lee una rutina pegada y devuelve los días que ha entendido.
 *
 * `format` dice por qué camino ha salido, que es lo que hay que enseñar cuando
 * el resultado no convence: saber que se ha leído como texto y no como tabla
 * explica de golpe por qué faltan los músculos.
 *
 * `targetChoices` es cuántas columnas de objetivo distintas se han encontrado.
 * Más de una significa que la hoja ofrece dos y hay que preguntar cuál vale.
 */
export const parseRoutineGrid = (rejilla) => {
  const grid = trimGrid(rejilla || []);
  if (!grid.length) return { format: null, days: [], targetChoices: 0 };

  let format = null;
  let days = [];

  const cabeceras = filasDeCabecera(grid);
  if (cabeceras.length) {
    let heredado = null;
    for (let i = 0; i < cabeceras.length; i += 1) {
      const bloque = parsearBloque(grid, cabeceras[i], cabeceras[i + 1] ?? grid.length, heredado);
      const conNombre = bloque.findLast((d) => d.name);
      if (conNombre) heredado = conNombre.name;
      days.push(...bloque);
    }
    format = 'tabla';
  }

  if (!days.length && grid.some((f) => f.length > 1)) {
    days = parsearSinCabecera(grid);
    if (days.length) format = 'tabla-sin-cabecera';
  }

  if (!days.length) {
    days = parsearTexto(grid.map((f) => f.filter(Boolean).join(' ')));
    if (days.length) format = 'texto';
  }

  days = quitarRepetidos(days);

  return {
    format,
    days,
    targetChoices: Math.max(0, ...days.flatMap((d) => d.exercises.map((e) => e.targetOptions.length))),
  };
};

/**
 * Lo mismo, desde texto pegado.
 *
 * Una hoja de un `.xlsx` llega ya troceada y no pasa por aquí: convertirla a TSV
 * para volver a partirla obligaría a escapar los tabuladores que puede haber
 * dentro de una nota, y ese escape mal hecho parte una fila en dos columnas de
 * más y descoloca todas las de su derecha.
 */
export const parseRoutineSheet = (text) => parseRoutineGrid(toGrid(text));

/**
 * Varias hojas de un mismo libro, unidas en una sola lectura.
 *
 * ══ Por qué una hoja puede ser un día ══════════════════════════════════════
 *
 * Hay quien reparte la rutina en pestañas: «Día 1», «Día 2», «Día 3», «Día 4».
 * Dentro de cada una no hay ninguna fila que diga cómo se llama el día —no hace
 * falta, lo dice la pestaña—, así que leída por su cuenta sale un día sin
 * nombre.
 *
 * Por eso, cuando una hoja trae **exactamente un día y sin nombre**, se llama
 * como la pestaña. Con más de uno no se hace: ahí la hoja es un plan completo
 * («Plan de entrenamiento de 5 días») y ponerle su nombre a los cinco los
 * dejaría a todos llamados igual.
 *
 * @param entradas `[{ name, reading }]`, en el orden en que se quieren pegar.
 */
export const mergeSheetReadings = (entradas = []) => {
  const days = [];
  let targetChoices = 0;

  for (const { name, reading } of entradas) {
    if (!reading?.days?.length) continue;
    targetChoices = Math.max(targetChoices, reading.targetChoices || 0);

    const unaHojaUnDia = reading.days.length === 1 && !reading.days[0].name;
    days.push(...(unaHojaUnDia ? [{ ...reading.days[0], name }] : reading.days));
  }

  return { format: days.length ? 'libro' : null, days, targetChoices };
};

/**
 * Un ejercicio leído, convertido en el que guarda la aplicación.
 *
 * `targetIndex` elige entre las columnas de objetivo que traía la hoja. Las
 * series nacen vacías de kilos y repeticiones a propósito: lo que se importa es
 * el plan, y el registro lo escribe quien entrene.
 */
export const toExerciseDraft = (exercise, { targetIndex = 0 } = {}) => {
  const objetivos =
    exercise.targetOptions?.[targetIndex] || exercise.targetOptions?.[0] || [];
  const rir = String(exercise.rir ?? '').trim();

  return {
    id: newId('ex'),
    name: exercise.name.trim(),
    muscle: exercise.muscle || 'Otros',
    sets: Array.from({ length: exercise.sets }, (_, i) => ({
      ...emptySet(objetivos[i] ?? objetivos[objetivos.length - 1] ?? ''),
      targetRir: rir,
    })),
    /* Sin nota no hay campo: `Exercise.coachNote` es opcional de verdad, y una
       cadena vacía pintaría un hueco en la ficha del cliente. */
    ...(exercise.note ? { coachNote: exercise.note } : {}),
  };
};

/** Los días leídos, listos para insertar. */
export const toDayDrafts = (days, options) =>
  days.map((day, i) => ({
    dayName: (day.name || `Día ${i + 1}`).trim(),
    exercises: day.exercises.map((e) => toExerciseDraft(e, options)),
  }));

/** Cuántos ejercicios se han quedado sin músculo seguro: lo que hay que revisar. */
export const pendingMuscles = (days) =>
  days.flatMap((d) => d.exercises).filter((e) => !e.muscleSure).length;
