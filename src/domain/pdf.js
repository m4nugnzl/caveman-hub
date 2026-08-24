/**
 * Sacar el texto de un `.pdf` sin dependencias.
 *
 * ══ Por qué hace falta ═════════════════════════════════════════════════════
 *
 * Porque media profesión no monta la dieta en Excel: la escribe en un documento
 * y la manda en PDF. Ese PDF es exactamente igual de legible que una hoja —tiene
 * sus comidas, sus opciones y sus gramos— y sin esto la única salida es abrirlo,
 * seleccionar todo y pegarlo, que funciona pero hay que saber que funciona.
 *
 * ══ Por qué se puede sin librería ══════════════════════════════════════════
 *
 * Un PDF es un fichero de objetos numerados con flujos comprimidos dentro, y el
 * navegador ya trae `DecompressionStream('deflate')`, que es la compresión que
 * usan todos. Lo demás es leer los operadores de texto. La alternativa era
 * pdf.js: dos megas al paquete —un motor de renderizado entero, con canvas y
 * tipografías— para sacar unas líneas de texto.
 *
 * ══ La trampa, que no es la compresión: las TIPOGRAFÍAS ════════════════════
 *
 * Los bytes de una cadena de un PDF **no son letras**. Son índices dentro de la
 * tipografía incrustada, y cuando esa tipografía viene recortada —solo con los
 * glifos que se usan, que es lo que hace cualquier procesador de textos— el
 * índice 3 es la letra que le tocó ser la tercera. Leerlos como si fueran
 * ASCII devuelve algo que parece texto, tiene la longitud correcta y no dice
 * nada.
 *
 * La traducción está en el `/ToUnicode` de cada tipografía, y por eso esto lo
 * lee. Y por eso lo lee **por página y por tipografía**: dos recortes distintas
 * —la redonda y la negrita— dan al mismo índice letras distintas, así que una
 * tabla común garabatearía justo los títulos.
 *
 * ══ Lo que NO cubre, dicho aquí y no en un error del navegador ═════════════
 *
 *   · Un PDF escaneado. Ahí no hay texto, hay una foto de un texto, y eso solo
 *     lo lee un OCR.
 *   · Ficheros cifrados o con contraseña.
 *   · Flujos comprimidos con LZW o JBIG2 (los de imagen; el texto va en Flate).
 *
 * Cuando no sale nada legible se dice, con la salida a mano: abrirlo, copiar y
 * pegar. Un PDF que se abre y devuelve tres líneas de basura sería peor.
 */

const NO_ES_PDF = 'Ese fichero no es un PDF que se pueda leer.';
const SIN_TEXTO =
  'De este PDF no he podido sacar el texto: puede que esté escaneado o protegido. Ábrelo, selecciona todo, cópialo y pégalo aquí.';

/* ── Bytes y cadenas ─────────────────────────────────────────────────────── */

/**
 * Los bytes, uno a uno, como caracteres.
 *
 * ══ Por qué a mano y no con `TextDecoder` ══════════════════════════════════
 *
 * Porque aquí se lee la ESTRUCTURA del fichero, donde un byte es un byte y hay
 * que poder devolverlo tal cual para descomprimirlo. Con UTF-8 cualquier byte
 * alto se convierte en un carácter de reemplazo; y con `'latin1'` —que parece la
 * respuesta— tampoco, porque en la web `latin1` es un alias de **windows-1252**,
 * que traduce los bytes 0x80–0x9F a caracteres de otro sitio: el 0x9C se
 * convierte en «œ», que ya no cabe en un byte.
 *
 * Y 0x9C es precisamente el segundo byte de la cabecera zlib más común
 * (`78 9C`), así que el fallo no era teórico: se descomprimían mal justo los
 * flujos comprimidos de la forma habitual, que son todos.
 */
const aTexto = (bytes) => {
  let out = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    out += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return out;
};

const aBytes = (texto) => Uint8Array.from(texto, (c) => c.charCodeAt(0) & 0xff);

const inflar = async (bytes, crudo = false) => {
  if (typeof DecompressionStream === 'undefined') throw new Error(SIN_TEXTO);
  const flujo = new Blob([bytes])
    .stream()
    .pipeThrough(new DecompressionStream(crudo ? 'deflate-raw' : 'deflate'));
  return aTexto(new Uint8Array(await new Response(flujo).arrayBuffer()));
};

/* ── Los objetos del fichero ─────────────────────────────────────────────── */

/**
 * Cada objeto numerado, con su diccionario y su flujo si lo tiene.
 *
 * El flujo se delimita por su `/Length` cuando es un número escrito ahí mismo, y
 * buscando `endstream` cuando es una referencia a otro objeto —que es legal y
 * pasa—. Sin esa segunda vía, los ficheros escritos en streaming se leen
 * truncados.
 */
const leerObjetos = (raw) => {
  const objetos = new Map();

  for (const m of raw.matchAll(/(\d+)\s+\d+\s+obj\b/g)) {
    const numero = Number(m[1]);
    const desde = m.index + m[0].length;

    const finObjeto = raw.indexOf('endobj', desde);
    const inicioFlujo = raw.indexOf('stream', desde);
    const tieneFlujo = inicioFlujo >= 0 && (finObjeto < 0 || inicioFlujo < finObjeto);

    if (!tieneFlujo) {
      objetos.set(numero, { dict: raw.slice(desde, finObjeto < 0 ? undefined : finObjeto), datos: null });
      continue;
    }

    const dict = raw.slice(desde, inicioFlujo);
    /* Tras `stream` va un salto de línea obligatorio, que no es del contenido. */
    let datos = inicioFlujo + 'stream'.length;
    if (raw[datos] === '\r') datos += 1;
    if (raw[datos] === '\n') datos += 1;

    const largo = Number(/\/Length\s+(\d+)(?!\s+\d+\s+R)/.exec(dict)?.[1]);
    const fin = Number.isFinite(largo) && largo > 0 ? datos + largo : raw.indexOf('endstream', datos);

    objetos.set(numero, { dict, datos: raw.slice(datos, fin < 0 ? undefined : fin) });
  }

  return objetos;
};

/** El contenido de un flujo, descomprimido si hacía falta. */
const contenidoDe = async (objeto) => {
  if (!objeto?.datos) return '';
  if (!/\/Flate\s*Decode|\/FlateDecode/.test(objeto.dict)) return objeto.datos;

  const bytes = aBytes(objeto.datos);
  try {
    return await inflar(bytes);
  } catch {
    /* Algunos generadores escriben el deflate sin la cabecera zlib. */
    try {
      return await inflar(bytes.subarray(1), true);
    } catch {
      return '';
    }
  }
};

/* ── La traducción de índices a letras ───────────────────────────────────── */

/**
 * Hexadecimal a letras, que son DOS conversiones distintas y confundirlas
 * garabatea el fichero entero.
 *
 * En un `/ToUnicode` el destino es Unicode de dos bytes: `<0048>` es la «H». En
 * un flujo de contenido, en cambio, `<43454E41>` son cuatro BYTES —los índices
 * de la tipografía— y leerlos de dos en dos convertiría «CENA» en dos
 * ideogramas. Aquí se pasan a bytes y es `conFuente` quien decide cuántos hacen
 * una letra, que es lo único que lo sabe.
 */
const deHexUnicode = (hex) =>
  String.fromCharCode(...(hex.match(/.{1,4}/g) || []).map((h) => Number.parseInt(h.padEnd(4, '0'), 16)));

const bytesDeHex = (hex) => {
  const limpio = hex.replace(/[^0-9A-Fa-f]/g, '');
  return String.fromCharCode(
    ...(limpio.match(/.{1,2}/g) || []).map((h) => Number.parseInt(h.padEnd(2, '0'), 16))
  );
};

/**
 * El valor que sigue a una clave de un diccionario: el bloque `<< … >>` entero.
 *
 * Contando los niveles y no con una expresión regular. Un `/Resources << /Font
 * << /F1 5 0 R >> >>` tiene un diccionario dentro de otro, y cualquier
 * expresión que busque el primer `>>` corta por el de dentro: se queda con un
 * `/Font <<` sin cerrar, no encuentra ninguna tipografía y el PDF sale con los
 * índices sin traducir —es decir, ilegible— sin ningún error por el camino.
 */
const bloqueTras = (texto, clave) => {
  const i = texto.indexOf(clave);
  if (i < 0) return null;

  const resto = texto.slice(i + clave.length);
  const abre = /^\s*<</.exec(resto);
  if (!abre) return null;

  let nivel = 0;
  for (let p = abre[0].length - 2; p < resto.length - 1; p += 1) {
    if (resto[p] === '<' && resto[p + 1] === '<') {
      nivel += 1;
      p += 1;
    } else if (resto[p] === '>' && resto[p + 1] === '>') {
      nivel -= 1;
      if (nivel === 0) return resto.slice(abre[0].length, p);
      p += 1;
    }
  }
  return null;
};

/**
 * El `/ToUnicode` de una tipografía, en una tabla.
 *
 * Trae las dos formas que existen y las dos aparecen en el mismo fichero:
 * `bfchar` traduce códigos sueltos y `bfrange` tramos enteros, que es como se
 * escribe el alfabeto de una tipografía recortada.
 */
const leerCMap = (texto, anchoForzado = 0) => {
  const tabla = new Map();
  let anchoCodigo = anchoForzado || 1;

  /* Cuántos bytes hace un código lo dice el propio mapa, y solo puede decirlo
     el lado IZQUIERDO de cada línea: el derecho es Unicode y siempre son cuatro
     cifras. Mezclarlos fue un fallo de verdad —un destino de cuatro cifras
     ponía el ancho a dos— y su efecto es que el texto sale vacío, porque los
     códigos se leen de dos en dos y ninguno existe. */
  const ancho = (codigo) => {
    if (!anchoForzado && codigo.length > 2) anchoCodigo = 2;
  };

  const espacio = /begincodespacerange([\s\S]*?)endcodespacerange/.exec(texto);
  if (espacio) ancho(/<([0-9A-Fa-f]+)>/.exec(espacio[1])?.[1] || '');

  for (const bloque of texto.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const par of bloque[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      ancho(par[1]);
      tabla.set(Number.parseInt(par[1], 16), deHexUnicode(par[2]));
    }
  }

  /*
    Las dos formas de un `bfrange`, leídas en UNA pasada:

      <01> <03> <0041>                    del 1 al 3, empezando en la A
      <01> <03> [<0041> <0042> <0043>]    uno por uno

    En una pasada y no en dos porque, buscándolas por separado, la expresión de
    la primera forma encuentra un «tramo» dentro de la lista de la segunda
    —`<0061> <0021> <00E9>` parece un tramo— y se traga sus destinos como si
    fueran códigos.
  */
  for (const bloque of texto.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    const re = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(?:<([0-9A-Fa-f]+)>|\[([\s\S]*?)\])/g;
    for (const tramo of bloque[1].matchAll(re)) {
      ancho(tramo[1]);
      const desde = Number.parseInt(tramo[1], 16);

      if (tramo[3] !== undefined) {
        const hasta = Number.parseInt(tramo[2], 16);
        const destino = deHexUnicode(tramo[3]);
        const prefijo = destino.slice(0, -1);
        const ultimo = destino.charCodeAt(destino.length - 1);
        for (let c = desde; c <= hasta && c - desde < 1024; c += 1) {
          tabla.set(c, prefijo + String.fromCharCode(ultimo + (c - desde)));
        }
      } else {
        [...tramo[4].matchAll(/<([0-9A-Fa-f]+)>/g)].forEach((h, i) => {
          tabla.set(desde + i, deHexUnicode(h[1]));
        });
      }
    }
  }

  return { tabla, anchoCodigo };
};

/* ── Las cadenas de un flujo de contenido ────────────────────────────────── */

const ESCAPES = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' };

/** Una cadena literal `( … )` de PDF, con sus escapes deshechos. */
const literal = (texto) => {
  let out = '';
  for (let i = 0; i < texto.length; i += 1) {
    const ch = texto[i];
    if (ch !== '\\') {
      out += ch;
      continue;
    }
    const sig = texto[i + 1];
    if (sig === undefined) break;
    if (sig >= '0' && sig <= '7') {
      const oct = /^[0-7]{1,3}/.exec(texto.slice(i + 1))[0];
      out += String.fromCharCode(Number.parseInt(oct, 8));
      i += oct.length;
    } else if (sig === '\n') {
      i += 1; // barra al final de línea: la línea sigue
    } else {
      out += ESCAPES[sig] ?? sig;
      i += 1;
    }
  }
  return out;
};

/** Los bytes de una cadena, traducidos con la tipografía que esté activa. */
const conFuente = (crudo, fuente) => {
  if (!fuente?.tabla?.size) return crudo;

  let out = '';
  const paso = fuente.anchoCodigo;
  for (let i = 0; i < crudo.length; i += paso) {
    const codigo =
      paso === 2 ? (crudo.charCodeAt(i) << 8) | (crudo.charCodeAt(i + 1) || 0) : crudo.charCodeAt(i);
    out += fuente.tabla.get(codigo) ?? (paso === 1 ? crudo[i] : '');
  }
  return out;
};

/* Los operadores que hacen falta para reconstruir renglones, con nombre para
   poder leer el bucle de abajo sin contar paréntesis. */
const OPERADORES = new RegExp(
  [
    String.raw`\/(?<fuente>[^\s/<>[\]()]+)\s+(?<tam>-?[\d.]+)\s+Tf`,
    String.raw`(?<tm>-?[\d.]+(?:\s+-?[\d.]+){5})\s+Tm`,
    String.raw`(?<cm>-?[\d.]+(?:\s+-?[\d.]+){5})\s+cm`,
    String.raw`(?<tx>-?[\d.]+)\s+(?<ty>-?[\d.]+)\s+(?:Td|TD)`,
    String.raw`\[(?<tj>(?:[^[\]\\]|\\.)*)\]\s*TJ`,
    String.raw`\((?<lit>(?:[^()\\]|\\.)*)\)\s*(?<op>Tj|'|")`,
    String.raw`<(?<hex>[0-9A-Fa-f\s]*)>\s*Tj`,
    /* `q` y `Q` son una letra suelta: se exige que vayan solas entre espacios
       para no confundirlas con la `q` de un nombre. */
    String.raw`(?:^|[\s>\]])(?<pila>[qQ])(?=\s|$)`,
    String.raw`(?<solo>T\*|BT|ET)`,
  ].join('|'),
  'g'
);

/**
 * Dos matrices afines, multiplicadas.
 *
 * Un PDF coloca el texto en tres pasos —la posición dentro del bloque, la
 * matriz del texto y la matriz de la PÁGINA (`cm`)— y solo las tres juntas dicen
 * dónde acaba una letra en el papel.
 */
const porMatriz = (m, n) => [
  m[0] * n[0] + m[1] * n[2],
  m[0] * n[1] + m[1] * n[3],
  m[2] * n[0] + m[3] * n[2],
  m[2] * n[1] + m[3] * n[3],
  m[4] * n[0] + m[5] * n[2] + n[4],
  m[4] * n[1] + m[5] * n[3] + n[5],
];

/**
 * El texto de un flujo de contenido, en renglones.
 *
 * ══ De dónde salen los renglones, que en un PDF no existen ════════════════
 *
 * Un PDF no tiene líneas: tiene cadenas colocadas en coordenadas. Así que el
 * renglón hay que deducirlo, y **la única señal que vale es la Y en el PAPEL**
 * —la del texto por la matriz de la página, `cm`—. Con la Y del bloque a secas
 * no vale: un procesador de textos abre un `q … cm … Q` por párrafo y dentro de
 * cada uno vuelve a contar desde arriba, así que el título de la página y un
 * párrafo del final salen a la misma altura y se pegan en un renglón de dos mil
 * caracteres. Pasó, y con este mismo fichero.
 *
 * La primera versión cortaba en cada operador de posición (`Td`, `Tm`, `T*`), y
 * con un PDF de verdad eso es un desastre silencioso: un procesador de textos
 * coloca CADA PALABRA con su propio `Td` para ajustar el espaciado —y en un
 * título, cada letra—. El resultado con el PDF de una dieta real fueron 1.405
 * «renglones» de una palabra cada uno: «P», «l», «a», «n»… Ninguna línea de
 * comida sobrevivía, y las de macros llegaban partidas en cuatro trozos que el
 * lector de dietas leía como cuatro alimentos llamados «kilocalorías»,
 * «proteína», «hidratos» y «grasas».
 *
 * Con la Y, dos trozos a la misma altura son el mismo renglón, se hayan
 * colocado con uno o con quince operadores.
 *
 * ══ Y los espacios ════════════════════════════════════════════════════════
 *
 * Un PDF tampoco tiene espacios cuando cada palabra se coloca por su cuenta: el
 * espacio ES el hueco. Como no se puede medir sin las métricas de la tipografía,
 * se ESTIMA cuánto ha avanzado lo escrito (media eme por letra, que es la media
 * de cualquier tipografía de texto) y, si la siguiente cadena empieza más allá
 * de donde debería, hay un espacio. Es lo mismo que hace un visor al dejarte
 * copiar el texto, y falla en la misma dirección: de más, nunca de menos.
 */
const textoDeFlujo = (flujo, fuentes) => {
  const lineas = [];
  let linea = '';
  let fuente = null;

  /* Dónde está el cursor y de qué tamaño se escribe. `tam` es el de `Tf` por la
     escala de `Tm`: hay generadores que ponen el tamaño en uno y quien lo pone
     en el otro. */
  /* La posición en el espacio del TEXTO, tal cual la escribe el fichero. */
  let x = 0;
  let y = 0;
  /* Y la matriz de la página, con su pila: es lo que convierte esa posición en
     un sitio del papel. */
  let ctm = [1, 0, 0, 1, 0, 0];
  const pila = [];
  /* Dónde debería haber terminado lo último escrito, ya en el papel. La
     diferencia con la posición real de lo siguiente es el hueco: ver `escribir`. */
  let xFin = 0;
  /* La altura a la que va el renglón que se está montando. Se compara contra
     ESTA y no contra la última posición: `BT` pone el cursor a cero —es lo que
     dice la matriz— y comparar con cero cortaría el renglón en cada bloque. */
  let yLinea = 0;
  let tam = 12;
  let escala = 1;
  let empezada = false;

  /* El tamaño de letra como se ve en el papel: el de `Tf`, por la escala de la
     matriz del texto y por la de la página. */
  const alto = () => Math.abs(tam * escala * (ctm[3] || 1)) || 12;

  /** Dónde cae en el papel la posición actual del texto. */
  const enPapel = () => ({
    x: ctm[0] * x + ctm[2] * y + ctm[4],
    y: ctm[1] * x + ctm[3] * y + ctm[5],
  });

  const cerrar = () => {
    if (linea.trim()) lineas.push(linea.replace(/\s+/g, ' ').trim());
    linea = '';
    empezada = false;
  };

  /**
   * Colocar el cursor NO decide nada.
   *
   * Decidía, y era el segundo fallo del mismo sitio: un bloque de texto empieza
   * con `Tm` —que lo pone donde arranca el párrafo— y sigue con un `Td` que baja
   * al renglón. Entre esas dos posiciones no se ha escrito nada, así que ese
   * salto no es un renglón nuevo: es el mismo, colocándose. Se apunta dónde
   * queda el cursor y se decide al ESCRIBIR, que es cuando ya se sabe qué hay.
   */
  const mover = (nuevaX, nuevaY) => {
    x = nuevaX;
    y = nuevaY;
  };

  /**
   * Escribe, y de paso decide si esto era otro renglón o si faltaba un espacio.
   *
   * El hueco se mide contra una ESTIMACIÓN del ancho de lo escrito —media eme
   * larga por letra— y el listón está alto a propósito: en un PDF de procesador
   * de textos cada letra se coloca por su cuenta, así que entre dos letras de la
   * misma palabra ya hay un salto, y con el listón bajo salía «A lim enticio».
   * Los espacios de verdad de estos ficheros vienen escritos como un glifo más.
   */
  const escribir = (texto) => {
    if (!texto) return;
    const donde = enPapel();

    if (empezada && Math.abs(donde.y - yLinea) > alto() * 0.5) cerrar();
    else if (empezada && donde.x - xFin > alto() * 0.6 && !/\s$/.test(linea)) linea += ' ';

    if (!empezada) yLinea = donde.y;
    linea += texto;
    empezada = true;
    xFin = donde.x + texto.length * 0.55 * alto();
  };

  for (const m of flujo.matchAll(OPERADORES)) {
    const g = m.groups;

    if (g.fuente !== undefined) {
      fuente = fuentes.get(g.fuente) || null;
      tam = Number(g.tam) || tam;
    } else if (g.tm !== undefined) {
      const n = g.tm.trim().split(/\s+/).map(Number);
      escala = n[3] || n[0] || 1;
      mover(n[4], n[5]);
    } else if (g.cm !== undefined) {
      ctm = porMatriz(g.cm.trim().split(/\s+/).map(Number), ctm);
    } else if (g.pila !== undefined) {
      if (g.pila === 'q') pila.push(ctm);
      else ctm = pila.pop() || [1, 0, 0, 1, 0, 0];
    } else if (g.tx !== undefined) {
      mover(x + Number(g.tx), y + Number(g.ty));
    } else if (g.tj !== undefined) {
      /* El array de un `TJ`: cadenas y números de ajuste alternados. El ajuste
         va en milésimas de eme y hacia atrás, así que un valor muy negativo es
         el hueco que el generador dejó en vez de escribir un espacio. */
      for (const trozo of g.tj.matchAll(/\(((?:[^()\\]|\\.)*)\)|<([0-9A-Fa-f\s]*)>|(-?[\d.]+)/g)) {
        if (trozo[1] !== undefined) escribir(conFuente(literal(trozo[1]), fuente));
        else if (trozo[2] !== undefined) escribir(conFuente(bytesDeHex(trozo[2]), fuente));
        else if (Number(trozo[3]) < -250 && linea && !/\s$/.test(linea)) linea += ' ';
      }
    } else if (g.lit !== undefined) {
      if (g.op === "'" || g.op === '"') cerrar();
      escribir(conFuente(literal(g.lit), fuente));
    } else if (g.hex !== undefined) {
      escribir(conFuente(bytesDeHex(g.hex), fuente));
    } else if (g.solo === 'T*') {
      cerrar();
    } else if (g.solo === 'BT') {
      /*
        `BT` NO cierra el renglón: abre un bloque de texto y pone la matriz a
        cero, nada más. Cerrando en su `ET` —que era lo que se hacía— un PDF de
        procesador de textos sale palabra por palabra, porque cada una va en su
        propio bloque. Lo que cierra un renglón es la Y, y solo la Y.
      */
      x = 0;
      y = 0;
    }
  }
  cerrar();

  return lineas;
};

/* ── Los objetos que van dentro de otro objeto ───────────────────────────── */

/**
 * Abre los «flujos de objetos» (`/ObjStm`) y suelta lo que llevan dentro.
 *
 * ══ Qué son y por qué no se pueden ignorar ═════════════════════════════════
 *
 * Desde la versión 1.5, un PDF puede meter TODOS sus diccionarios —el catálogo,
 * las páginas, las tipografías— dentro de un único flujo comprimido en vez de
 * escribirlos como `N 0 obj` a la vista. Buscando solo `obj` por el fichero, un
 * PDF así parece no tener ni una página: en la prueba con catorce ficheros de
 * generadores distintos, los dos únicos que fallaban eran exactamente estos, y
 * los produce cualquier LaTeX, cualquier Word moderno y Adobe.
 *
 * El formato es simple: la cabecera del flujo son N parejas «número
 * desplazamiento» y a partir del byte `/First` van los objetos, uno detrás de
 * otro. Dentro nunca hay flujos —no se pueden anidar—, así que son solo
 * diccionarios.
 *
 * Lo que ya estaba suelto NO se pisa: si un objeto aparece de las dos formas es
 * porque el fichero se ha actualizado por incrementos, y la versión de fuera es
 * la nueva.
 */
const expandirFlujosDeObjetos = async (objetos) => {
  for (const [, objeto] of [...objetos]) {
    if (!/\/Type\s*\/ObjStm/.test(objeto.dict)) continue;

    const contenido = await contenidoDe(objeto);
    const cuantos = Number(/\/N\s+(\d+)/.exec(objeto.dict)?.[1]);
    const primero = Number(/\/First\s+(\d+)/.exec(objeto.dict)?.[1]);
    if (!contenido || !cuantos || !Number.isFinite(primero)) continue;

    const cabecera = contenido.slice(0, primero).trim().split(/\s+/).map(Number);

    for (let i = 0; i < cuantos; i += 1) {
      const numero = cabecera[i * 2];
      const desde = cabecera[i * 2 + 1];
      if (!Number.isFinite(numero) || !Number.isFinite(desde) || objetos.has(numero)) continue;

      const hasta = i + 1 < cuantos ? primero + cabecera[(i + 1) * 2 + 1] : contenido.length;
      objetos.set(numero, { dict: contenido.slice(primero + desde, hasta), datos: null });
    }
  }
};

/* ── Qué tipografía usa cada página ──────────────────────────────────────── */

const refDe = (texto) => {
  const m = /^\s*(\d+)\s+\d+\s+R/.exec(String(texto || ''));
  return m ? Number(m[1]) : null;
};

/** Las referencias de un array —`/Kids [3 0 R 7 0 R]`—, en orden. */
const refsTras = (dict, clave) => {
  const i = dict.indexOf(clave);
  if (i < 0) return [];
  const m = /^\s*\[([\s\S]*?)\]/.exec(dict.slice(i + clave.length));
  return m ? [...m[1].matchAll(/(\d+)\s+\d+\s+R/g)].map((r) => Number(r[1])) : [];
};

/**
 * Las páginas, en el orden en el que se leen, con los recursos que heredan.
 *
 * ══ Por qué se recorre el árbol y no se filtran los objetos ════════════════
 *
 * Por dos cosas que se pierden filtrando. La primera es el ORDEN: los objetos
 * de un PDF no están en el orden de las páginas más que por costumbre, y con
 * los flujos de objetos ni eso. La segunda es que **los recursos se heredan**:
 * un fichero puede declarar las tipografías una sola vez, en el nodo padre, y
 * dejar las páginas sin `/Resources`. Filtrando, esas páginas salen sin
 * tipografías y su texto sin traducir — es decir, ilegible.
 *
 * Si el árbol no se puede recorrer —un fichero roto, un catálogo que no
 * resuelve— se cae a lo de antes: todas las páginas que haya, por número.
 */
const paginasDe = (raw, objetos) => {
  const salida = [];

  const raizRef = Number(/\/Root\s+(\d+)\s+\d+\s+R/.exec(raw)?.[1]);
  const catalogo = Number.isFinite(raizRef) ? objetos.get(raizRef)?.dict : null;
  const arbol = catalogo ? refDe(/\/Pages\s*([\s\S]{0,20})/.exec(catalogo)?.[1]) : null;

  const visitar = (numero, heredados, vistos) => {
    if (vistos.has(numero) || vistos.size > 4096) return;
    vistos.add(numero);

    const objeto = objetos.get(numero);
    if (!objeto) return;

    const propios = recursosDe(objeto.dict, objetos) || heredados;

    if (/\/Type\s*\/Pages\b/.test(objeto.dict)) {
      for (const hijo of refsTras(objeto.dict, '/Kids')) visitar(hijo, propios, vistos);
    } else if (/\/Type\s*\/Page\b/.test(objeto.dict)) {
      salida.push({ pagina: objeto, recursos: propios });
    }
  };

  if (arbol !== null) visitar(arbol, '', new Set());
  if (salida.length) return salida;

  return [...objetos.entries()]
    .filter(([, o]) => /\/Type\s*\/Page\b/.test(o.dict))
    .sort((a, b) => a[0] - b[0])
    .map(([, pagina]) => ({ pagina, recursos: recursosDe(pagina.dict, objetos) }));
};

/**
 * El diccionario que hay detrás de una clave, esté escrito dentro o aparte.
 *
 * Las dos formas son igual de legales y conviven en el mismo fichero:
 *
 *     /Resources << /Font << /F1 5 0 R >> >>      ← dentro
 *     /Resources 4 0 R … /Font 41 0 R             ← aparte, por referencia
 *
 * Resolviendo solo la primera, un PDF entero se queda sin tipografías —y por
 * tanto sin texto legible— sin que nada falle: es lo que pasaba con los
 * ficheros de WeasyPrint y de Adobe.
 */
const dictTras = (dict, clave, objetos) => {
  const dentro = bloqueTras(dict, clave);
  if (dentro !== null) return dentro;

  const i = dict.indexOf(clave);
  if (i < 0) return '';

  const ref = refDe(dict.slice(i + clave.length, i + clave.length + 24));
  return ref !== null ? objetos.get(ref)?.dict || '' : '';
};

/** El diccionario de recursos de una página. */
const recursosDe = (dict, objetos) => dictTras(dict, '/Resources', objetos);

/** `/F1 → tabla de la tipografía 5`, para una página. */
const fuentesDe = async (recursos, objetos, cache) => {
  const fuentes = new Map();
  const bloque = dictTras(recursos, '/Font', objetos);
  if (!bloque) return fuentes;

  for (const m of bloque.matchAll(/\/([^\s/]+)\s+(\d+)\s+\d+\s+R/g)) {
    const numero = Number(m[2]);
    if (!cache.has(numero)) {
      const fuente = objetos.get(numero);
      const aUnicode = refDe(/\/ToUnicode\s*([\s\S]{0,20})/.exec(fuente?.dict || '')?.[1]);

      /*
        ══ Cuántos bytes hace una letra lo dice la TIPOGRAFÍA ═════════════════

        Y no su tabla de traducción. Una tipografía simple —Type1, TrueType—
        siempre usa un byte por letra; solo las compuestas (`/Type0`, casi
        siempre con `Identity-H`) usan dos. Deduciéndolo del mapa se acierta
        casi siempre y se falla en un sitio muy concreto: un generador que
        escriba los códigos rellenos a cuatro cifras (`<0049>`) en una
        tipografía de un byte. Ahí se leen los códigos de dos en dos, no
        coincide ninguno, y las páginas salen VACÍAS —no con basura, vacías—.
        Es lo que pasaba con los PDF de Adobe.
      */
      const compuesta = /\/Subtype\s*\/Type0|\/Encoding\s*\/Identity-[HV]/.test(fuente?.dict || '');

      cache.set(
        numero,
        aUnicode === null
          ? null
          : leerCMap(await contenidoDe(objetos.get(aUnicode)), fuente ? (compuesta ? 2 : 1) : 0)
      );
    }
    fuentes.set(m[1], cache.get(numero));
  }

  return fuentes;
};

/* ── La entrada ──────────────────────────────────────────────────────────── */

/**
 * El texto de un PDF, página a página y en el orden en que está escrito.
 *
 * @param {ArrayBuffer} buffer
 * @returns {Promise<string>}
 */
export const readPdfText = async (buffer) => {
  const bytes = new Uint8Array(buffer);
  const raw = aTexto(bytes);
  if (!raw.startsWith('%PDF-') && !raw.slice(0, 1024).includes('%PDF-')) throw new Error(NO_ES_PDF);

  const objetos = leerObjetos(raw);
  if (!objetos.size) throw new Error(NO_ES_PDF);
  /* Y los que van comprimidos dentro de otro, que en un PDF moderno son casi
     todos. Ver `expandirFlujosDeObjetos`. */
  await expandirFlujosDeObjetos(objetos);

  const cacheFuentes = new Map();
  const lineas = [];

  for (const { pagina, recursos } of paginasDe(raw, objetos)) {
    const fuentes = await fuentesDe(recursos, objetos, cacheFuentes);

    /* `/Contents` puede ser una referencia o un array de referencias: un
       procesador de textos parte la página en varios flujos sin avisar. */
    const contenidos = /\/Contents\s*(\[[^\]]*\]|\d+\s+\d+\s+R)/.exec(pagina.dict)?.[1] || '';
    const refs = [...contenidos.matchAll(/(\d+)\s+\d+\s+R/g)].map((m) => Number(m[1]));

    for (const ref of refs) {
      const flujo = await contenidoDe(objetos.get(ref));
      if (flujo) lineas.push(...textoDeFlujo(flujo, fuentes));
    }
  }

  const texto = lineas.join('\n');
  if (!/\p{L}{3}/u.test(texto)) throw new Error(SIN_TEXTO);
  return texto;
};

export const isPdfFile = (fileName) => /\.pdf$/i.test(String(fileName || ''));
