import { describe, expect, it } from 'vitest';

import { isWorkbookFile, readWorkbook } from './xlsx';
import { parseRoutineGrid } from './routineSheet';

/**
 * ══ Qué protege este archivo ═══════════════════════════════════════════════
 *
 * Las dos formas que tiene un `.xlsx` de mentir sin que se note:
 *
 *   · Una celda que enseña «8-10» y contiene `46244`, porque Excel la convirtió
 *     en el 8 de octubre. Un objetivo de repeticiones convertido en un número de
 *     cinco cifras es creíble para cualquiera que no sepa qué está mirando.
 *   · Una celda vacía autocerrada (`<c r="A1"/>`) que, leída sin cuidado, se
 *     lleva el contenido de la siguiente y desplaza media hoja.
 *
 * ══ Por qué los ficheros se fabrican aquí y no se guardan ══════════════════
 *
 * Un libro de entrenamiento real pesa cinco megas y no cabe en un repositorio a
 * cambio de nada: lo que hay que probar son casos concretos —esta fecha, esta
 * celda vacía, esta hoja oculta— y en un fichero real están enterrados entre
 * quince hojas. Fabricarlos deja escribir exactamente el caso, incluido el que
 * un Excel normal no produciría nunca.
 *
 * El precio es que estas pruebas no demuestran que se abra un fichero de Excel
 * de verdad. Eso se comprobó a mano contra un libro real de 5,2 MB y 15 hojas
 * —se lee entero en ~250 ms y da exactamente lo mismo que su exportación a
 * TSV—, y es la clase de comprobación que se repite cuando aparece un fichero
 * que falle, no en cada `npm test`.
 */

/* ══ Un ZIP mínimo, para fabricar libros ═══════════════════════════════════ */

const bytes = (s) => new TextEncoder().encode(s);

const deflar = async (datos) =>
  new Uint8Array(
    await new Response(
      new Blob([datos]).stream().pipeThrough(new CompressionStream('deflate-raw'))
    ).arrayBuffer()
  );

/**
 * Escribe un ZIP con las entradas dadas.
 *
 * Sin CRC —va a cero— porque el lector no lo comprueba: un ZIP con CRC malo lo
 * rechazaría Excel, pero aquí lo que se prueba es la lectura, y calcularlo
 * costaría una tabla de 256 entradas que no protege de nada.
 */
const zip = async (ficheros) => {
  const partes = [];
  const central = [];
  let offset = 0;

  for (const f of ficheros) {
    const crudo = bytes(f.content);
    const datos = f.deflate ? await deflar(crudo) : crudo;
    const metodo = f.deflate ? 8 : 0;
    const nombre = bytes(f.name);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(8, metodo, true);
    local.setUint32(18, datos.length, true);
    local.setUint32(22, crudo.length, true);
    local.setUint16(26, nombre.length, true);
    partes.push(new Uint8Array(local.buffer), nombre, datos);

    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true);
    cen.setUint16(10, metodo, true);
    cen.setUint32(20, datos.length, true);
    cen.setUint32(24, crudo.length, true);
    cen.setUint16(28, nombre.length, true);
    cen.setUint32(42, offset, true);
    central.push(new Uint8Array(cen.buffer), nombre);

    offset += 30 + nombre.length + datos.length;
  }

  const tamCentral = central.reduce((n, p) => n + p.length, 0);
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true);
  fin.setUint16(8, ficheros.length, true);
  fin.setUint16(10, ficheros.length, true);
  fin.setUint32(12, tamCentral, true);
  fin.setUint32(16, offset, true);

  const todo = [...partes, ...central, new Uint8Array(fin.buffer)];
  const salida = new Uint8Array(todo.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of todo) {
    salida.set(p, i);
    i += p.length;
  }
  return salida.buffer;
};

/** Un libro con las hojas que se le digan. `hojas: [{ name, xml, oculta }]` */
const libro = ({ hojas, cadenas = [], styles = null, deflate = false, relsAlReves = false, sinFicheros = [] }) => {
  const ficheros = [
    {
      name: 'xl/workbook.xml',
      content: `<workbook><sheets>${hojas
        .map(
          (h, i) =>
            `<sheet name="${h.name}" sheetId="${i + 1}"${h.oculta ? ' state="hidden"' : ''} r:id="rId${i + 1}"/>`
        )
        .join('')}</sheets></workbook>`,
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      content: `<Relationships>${hojas
        .map((h, i) => {
          const target = h.target ?? `worksheets/sheet${i + 1}.xml`;
          const id = `rId${i + 1}`;
          /* Los escritores de OOXML no se ponen de acuerdo en el orden de los
             atributos, y el orden no significa nada. */
          return relsAlReves
            ? `<Relationship Type="http://x/worksheet" Target="${target}" Id="${id}"/>`
            : `<Relationship Id="${id}" Type="http://x/worksheet" Target="${target}"/>`;
        })
        .join('')}</Relationships>`,
    },
    ...hojas
      .map((h, i) => ({
        name: `xl/${h.target ?? `worksheets/sheet${i + 1}.xml`}`,
        content: `<worksheet><sheetData>${h.xml}</sheetData></worksheet>`,
      }))
      /* Para poder fabricar un libro al que le falta el fichero de una hoja. */
      .filter((_, i) => !sinFicheros.includes(i)),
  ];

  if (cadenas.length) {
    ficheros.push({
      name: 'xl/sharedStrings.xml',
      content: `<sst>${cadenas.map((c) => `<si><t>${c}</t></si>`).join('')}</sst>`,
    });
  }
  if (styles) ficheros.push({ name: 'xl/styles.xml', content: styles });

  return zip(ficheros.map((f) => ({ ...f, deflate })));
};

/* Un `styles.xml` con tres estilos: general, «m-d» (el que convierte 46244 en
   «8-10») y «dd/mm/yyyy». */
const STYLES = `<styleSheet>
  <numFmts><numFmt numFmtId="171" formatCode="m-d"/></numFmts>
  <cellXfs count="3">
    <xf numFmtId="0"/>
    <xf numFmtId="171"/>
    <xf numFmtId="14"/>
  </cellXfs>
</styleSheet>`;

const fila = (n, celdas) => `<row r="${n}">${celdas}</row>`;
const texto = (ref, i) => `<c r="${ref}" t="s"><v>${i}</v></c>`;
const numero = (ref, v, s) => `<c r="${ref}"${s == null ? '' : ` s="${s}"`}><v>${v}</v></c>`;
const vacia = (ref, s = 1) => `<c r="${ref}" s="${s}"/>`;

/* ══ Pruebas ══════════════════════════════════════════════════════════════ */

describe('readWorkbook', () => {
  it('devuelve las hojas con su nombre y en el orden de las pestañas', async () => {
    const hojas = await readWorkbook(
      await libro({
        hojas: [
          { name: 'Día 1', xml: fila(1, texto('A1', 0)) },
          { name: 'Día 2', xml: fila(1, texto('A1', 1)) },
          { name: 'Biblioteca', xml: fila(1, texto('A1', 0)) },
        ],
        cadenas: ['Press banca', 'Sentadilla'],
      })
    );
    expect(hojas.map((h) => h.name)).toEqual(['Día 1', 'Día 2', 'Biblioteca']);
    expect(hojas[1].rows[0][0]).toBe('Sentadilla');
  });

  it('el orden de los atributos de una relación no significa nada', async () => {
    /*
      Este es el fallo que se llevaba las hojas por delante sin decir nada: la
      relación se leía con un solo patrón que exigía `Id` ANTES de `Target`, y
      quien escriba el fichero al revés —cualquier generador que no sea Excel—
      dejaba la hoja sin ruta. Sin ruta, la hoja desaparecía de la lista, así que
      de cuatro pestañas «Día 1..4» aparecía solo la primera.
    */
    const hojas = await readWorkbook(
      await libro({
        hojas: [
          { name: 'Día 1', xml: fila(1, texto('A1', 0)) },
          { name: 'Día 2', xml: fila(1, texto('A1', 1)) },
          { name: 'Día 3', xml: fila(1, texto('A1', 2)) },
          { name: 'Día 4', xml: fila(1, texto('A1', 3)) },
        ],
        cadenas: ['uno', 'dos', 'tres', 'cuatro'],
        relsAlReves: true,
      })
    );
    expect(hojas.map((h) => h.name)).toEqual(['Día 1', 'Día 2', 'Día 3', 'Día 4']);
    expect(hojas.map((h) => h.rows[0][0])).toEqual(['uno', 'dos', 'tres', 'cuatro']);
  });

  it('una hoja que no se puede leer sale igual, vacía, en vez de esfumarse', async () => {
    /* Callarse una pestaña es lo peor que puede hacer esto: quien no la ve no
       sabe que le falta, y da por importado un plan al que le faltan días. */
    const hojas = await readWorkbook(
      await libro({
        hojas: [
          { name: 'Día 1', xml: fila(1, texto('A1', 0)) },
          { name: 'Día 2', xml: fila(1, texto('A1', 1)) },
        ],
        cadenas: ['uno', 'dos'],
        sinFicheros: [1],
      })
    );
    expect(hojas.map((h) => h.name)).toEqual(['Día 1', 'Día 2']);
    expect(hojas[1].rows).toEqual([]);
  });

  it('sigue las relaciones y no el número del fichero', async () => {
    /* `sheet1.xml` no tiene por qué ser la primera pestaña, y en un libro al que
       le han borrado hojas casi nunca lo es. */
    const hojas = await readWorkbook(
      await libro({
        hojas: [
          { name: 'Primera', target: 'worksheets/sheet7.xml', xml: fila(1, texto('A1', 0)) },
          { name: 'Segunda', target: 'worksheets/sheet3.xml', xml: fila(1, texto('A1', 1)) },
        ],
        cadenas: ['soy la siete', 'soy la tres'],
      })
    );
    expect(hojas[0].rows[0][0]).toBe('soy la siete');
    expect(hojas[1].rows[0][0]).toBe('soy la tres');
  });

  it('entrega las hojas ocultas, marcadas, en vez de tirarlas', async () => {
    /* Un libro de plantilla esconde de todo, y en uno real son nueve de quince
       —una de ellas llamada «Plan de Entrenamiento»—. Descartarlas dejaría sin
       forma de llegar a una rutina que esté ahí, y sin forma de saber por qué. */
    const hojas = await readWorkbook(
      await libro({
        hojas: [
          { name: 'Visible', xml: fila(1, texto('A1', 0)) },
          { name: 'Plan viejo', oculta: true, xml: fila(1, texto('A1', 0)) },
        ],
        cadenas: ['x'],
      })
    );
    expect(hojas.map((h) => h.name)).toEqual(['Visible', 'Plan viejo']);
    expect(hojas.map((h) => h.hidden)).toEqual([false, true]);
  });

  it('una celda vacía autocerrada NO se lleva el contenido de la siguiente', async () => {
    /* El fallo silencioso: con un regex de pareja, `<c r="B1" s="1"/>` salta
       hasta el `</c>` de C1 y «Press banca» acaba en la columna B. */
    const hojas = await readWorkbook(
      await libro({
        hojas: [{ name: 'H', xml: fila(1, `${vacia('A1')}${vacia('B1')}${texto('C1', 0)}${vacia('D1')}${texto('E1', 1)}`) }],
        cadenas: ['Press banca', 'Pecho'],
      })
    );
    expect(hojas[0].rows[0]).toEqual(['', '', 'Press banca', '', 'Pecho']);
  });

  it('devuelve «8-10» donde Excel guardó el 8 de octubre', async () => {
    /* 46244 con formato `m-d`. Es literalmente el caso de la hoja real: el
       entrenador escribió un rango y Excel lo convirtió en fecha. */
    const hojas = await readWorkbook(
      await libro({
        hojas: [{ name: 'H', xml: fila(1, `${numero('A1', 46244, 1)}${numero('B1', 46307, 1)}`) }],
        styles: STYLES,
      })
    );
    expect(hojas[0].rows[0]).toEqual(['8-10', '10-12']);
  });

  it('una fecha de verdad se lee como fecha', async () => {
    /* 45992 es el 1 de diciembre de 2025, y 46244 —el de la prueba de arriba—
       es el 10 de agosto de 2026: con formato `m-d` sale «8-10», que es lo que
       el entrenador escribió antes de que Excel se lo convirtiera. */
    const hojas = await readWorkbook(
      await libro({ hojas: [{ name: 'H', xml: fila(1, numero('A1', 45992, 2)) }], styles: STYLES })
    );
    expect(hojas[0].rows[0][0]).toBe('01/12/2025');
  });

  it('los números siguen siendo números, y sin la basura del coma flotante', async () => {
    const hojas = await readWorkbook(
      await libro({
        hojas: [{ name: 'H', xml: fila(1, `${numero('A1', 3)}${numero('B1', '3.0000000001')}${numero('C1', '80.5')}`) }],
        styles: STYLES,
      })
    );
    expect(hojas[0].rows[0]).toEqual(['3', '3', '80.5']);
  });

  it('lee cadenas en línea y resultados de fórmula', async () => {
    const hojas = await readWorkbook(
      await libro({
        hojas: [
          {
            name: 'H',
            xml: fila(1, '<c r="A1" t="inlineStr"><is><t>Curl &amp; martillo</t></is></c><c r="B1" t="str"><v>TIRÓN</v></c>'),
          },
        ],
      })
    );
    expect(hojas[0].rows[0]).toEqual(['Curl & martillo', 'TIRÓN']);
  });

  it('rellena los huecos: la rejilla sale rectangular', async () => {
    const hojas = await readWorkbook(
      await libro({
        hojas: [{ name: 'H', xml: `${fila(1, texto('A1', 0))}${fila(4, texto('D4', 1))}` }],
        cadenas: ['arriba', 'abajo'],
      })
    );
    expect(hojas[0].rows).toHaveLength(4);
    expect(hojas[0].rows.every((f) => f.length === 4)).toBe(true);
    expect(hojas[0].rows[3][3]).toBe('abajo');
  });

  it('lee entradas comprimidas, que es como vienen de verdad', async () => {
    const hojas = await readWorkbook(
      await libro({
        hojas: [{ name: 'Comprimida', xml: fila(1, texto('A1', 0)) }],
        cadenas: ['Press banca'],
        deflate: true,
      })
    );
    expect(hojas[0].rows[0][0]).toBe('Press banca');
  });

  it('dice en castellano que un fichero no es un .xlsx', async () => {
    await expect(readWorkbook(new TextEncoder().encode('no soy un zip').buffer)).rejects.toThrow(/no es un \.xlsx/i);
    await expect(readWorkbook(new ArrayBuffer(0))).rejects.toThrow(/no es un \.xlsx/i);
  });
});

describe('del libro a la rutina, sin pasar por texto', () => {
  it('una hoja por día se lee entera', async () => {
    /* El caso que pidió el usuario: un libro donde cada pestaña es un día. */
    const cabecera = fila(1, `${texto('A1', 0)}${texto('B1', 1)}${texto('C1', 2)}`);
    const hoja = (ejercicio, series) =>
      cabecera + fila(2, `${texto('A2', ejercicio)}${numero('B2', series)}${numero('C2', 46244, 1)}`);

    const hojas = await readWorkbook(
      await libro({
        hojas: [
          { name: 'Día 1 · Push', xml: hoja(3, 4) },
          { name: 'Día 2 · Pull', xml: hoja(4, 3) },
        ],
        cadenas: ['Ejercicio', 'Series', 'Rango de reps', 'Press banca', 'Remo'],
        styles: STYLES,
      })
    );

    const push = parseRoutineGrid(hojas[0].rows);
    expect(push.days[0].exercises[0]).toMatchObject({ name: 'Press banca', sets: 4 });
    expect(push.days[0].exercises[0].targetOptions[0]).toEqual(['8-10', '8-10', '8-10', '8-10']);

    const pull = parseRoutineGrid(hojas[1].rows);
    expect(pull.days[0].exercises[0]).toMatchObject({ name: 'Remo', sets: 3 });
  });
});

describe('isWorkbookFile', () => {
  it('distingue el libro del texto plano', () => {
    expect(isWorkbookFile('rutina.xlsx')).toBe(true);
    expect(isWorkbookFile('RUTINA.XLSX')).toBe(true);
    expect(isWorkbookFile('rutina.csv')).toBe(false);
    expect(isWorkbookFile('rutina.xls')).toBe(false);
    expect(isWorkbookFile('')).toBe(false);
  });
});
