import { describe, expect, it } from 'vitest';

import { isWordFile, readDocx } from './docx';
import { parseRoutineGrid } from './routineSheet';
import { zip } from './__fixtures__/zip';

/**
 * ══ Qué protege este archivo ═══════════════════════════════════════════════
 *
 * Que una rutina escrita en una tabla de Word llegue con las columnas donde
 * estaban. Las tres formas que tiene un `.docx` de desplazarlas sin avisar:
 *
 *   · Una celda combinada (`<w:gridSpan w:val="3">`), que es lo normal en la
 *     fila de título. Leída como una sola, todo lo de debajo se corre dos
 *     columnas y las series acaban en la casilla de las repeticiones.
 *   · Un tabulador, que en Word NO es texto dentro de un `<w:t>` sino un
 *     elemento hermano: recogiendo solo los `<w:t>`, «4x8-10» y «RIR2» se pegan.
 *   · Una tabla dentro de otra, que corta a la de fuera por la mitad si el
 *     cierre se busca con una expresión no ávida.
 */

/** Un `.docx` con el cuerpo que se le diga. */
const documento = (cuerpo, { deflate = false, ruta = 'word/document.xml' } = {}) =>
  zip([
    { name: '[Content_Types].xml', content: '<Types/>', deflate },
    { name: ruta, content: `<w:document><w:body>${cuerpo}</w:body></w:document>`, deflate },
  ]);

const p = (texto) => `<w:p><w:r><w:t>${texto}</w:t></w:r></w:p>`;
const tc = (texto, span) =>
  `<w:tc><w:tcPr>${span ? `<w:gridSpan w:val="${span}"/>` : ''}</w:tcPr>${p(texto)}</w:tc>`;
const tr = (celdas) => `<w:tr><w:trPr/>${celdas.join('')}</w:tr>`;
const tbl = (filas) => `<w:tbl><w:tblPr/>${filas.join('')}</w:tbl>`;

/* ══ Pruebas ══════════════════════════════════════════════════════════════ */

describe('readDocx', () => {
  it('cada tabla es una hoja, y el texto de fuera otra, en ese orden', async () => {
    const hojas = await readDocx(
      await documento(
        [
          p('Semana 1 · Roberto'),
          tbl([tr([tc('Ejercicio'), tc('Series')]), tr([tc('Press banca'), tc('4')])]),
          tbl([tr([tc('Ejercicio'), tc('Series')]), tr([tc('Remo'), tc('3')])]),
        ].join('')
      )
    );

    expect(hojas.map((h) => h.name)).toEqual(['Texto del documento', 'Tabla 1', 'Tabla 2']);
    expect(hojas[0].texto).toBe('Semana 1 · Roberto');
    expect(hojas[1].rows).toEqual([
      ['Ejercicio', 'Series'],
      ['Press banca', '4'],
    ]);
    expect(hojas[2].rows[1][0]).toBe('Remo');
  });

  it('sin texto suelto no inventa una hoja vacía', async () => {
    const hojas = await readDocx(await documento(tbl([tr([tc('Sentadilla'), tc('5')])])));
    expect(hojas.map((h) => h.name)).toEqual(['Tabla 1']);
  });

  it('una celda combinada ocupa las columnas que dice', async () => {
    /*
      El fallo silencioso de este formato. La fila de título de una tabla de Word
      casi siempre es UNA celda que abarca toda la anchura; contarla como una
      sola corre la rejilla entera a la izquierda a partir de la segunda fila.
    */
    const hojas = await readDocx(
      await documento(
        tbl([
          tr([tc('DÍA 1 · PUSH', 3)]),
          tr([tc('Ejercicio'), tc('Series'), tc('Reps')]),
          tr([tc('Press banca'), tc('4'), tc('8-10')]),
        ])
      )
    );

    expect(hojas[0].rows[0]).toEqual(['DÍA 1 · PUSH', '', '']);
    expect(hojas[0].rows[2]).toEqual(['Press banca', '4', '8-10']);
  });

  it('las filas se rellenan hasta la más ancha, para que la rejilla sea rectangular', async () => {
    const hojas = await readDocx(
      await documento(tbl([tr([tc('Ejercicio'), tc('Series'), tc('Reps')]), tr([tc('Dominadas')])]))
    );
    expect(hojas[0].rows[1]).toEqual(['Dominadas', '', '']);
  });

  it('el tabulador y el salto de línea son texto, aunque no vayan en un <w:t>', async () => {
    const hojas = await readDocx(
      await documento(
        '<w:p><w:r><w:t>Press banca</w:t><w:tab/><w:t>4x8-10</w:t><w:br/><w:t>RIR2</w:t></w:r></w:p>'
      )
    );
    expect(hojas[0].texto).toBe('Press banca\t4x8-10\nRIR2');
  });

  it('una tabla dentro de una celda no parte a la de fuera', async () => {
    const hojas = await readDocx(
      await documento(
        tbl([
          tr([
            `<w:tc><w:tcPr/>${tbl([tr([tc('interior')])])}</w:tc>`,
            tc('fuera'),
          ]),
          tr([tc('segunda'), tc('fila')]),
        ])
      )
    );

    /* Una sola tabla, con sus dos filas: si el cierre se buscara con una
       expresión no ávida, la de fuera terminaría en el cierre de la interior y
       la segunda fila se perdería. */
    expect(hojas).toHaveLength(1);
    expect(hojas[0].rows).toEqual([
      ['interior', 'fuera'],
      ['segunda', 'fila'],
    ]);
  });

  it('descomprimido o no, da lo mismo', async () => {
    const hojas = await readDocx(await documento(p('Hola'), { deflate: true }));
    expect(hojas[0].texto).toBe('Hola');
  });

  it('escapa las entidades del XML', async () => {
    const hojas = await readDocx(await documento(p('Fuerza &amp; salud &lt;3')));
    expect(hojas[0].texto).toBe('Fuerza & salud <3');
  });

  it('un fichero que no es un .docx lo dice, y dice qué hacer', async () => {
    await expect(readDocx(new Uint8Array([1, 2, 3]).buffer)).rejects.toThrow(/no es un \.docx/);
    await expect(readDocx(await documento(p('x'), { ruta: 'otra/cosa.xml' }))).rejects.toThrow(
      /Ábrelo en Word/
    );
  });

  it('un documento sin texto no se importa en silencio', async () => {
    await expect(readDocx(await documento('<w:p><w:pPr/></w:p>'))).rejects.toThrow(/solo imágenes/);
  });

  it('la tabla que sale la entiende el lector de rutinas', async () => {
    /* La prueba que de verdad importa: no que se lea el XML, sino que lo leído
       sea una rutina. */
    const hojas = await readDocx(
      await documento(
        tbl([
          tr([tc('DÍA 1 · PUSH', 4)]),
          tr([tc('Ejercicio'), tc('Series'), tc('Reps'), tc('RIR')]),
          tr([tc('Press banca'), tc('4'), tc('8-10'), tc('2')]),
          tr([tc('Press militar'), tc('3'), tc('10-12'), tc('2')]),
        ])
      )
    );

    const leido = parseRoutineGrid(hojas[0].rows);
    expect(leido.days).toHaveLength(1);
    expect(leido.days[0].exercises.map((e) => e.name)).toEqual(['Press banca', 'Press militar']);
    expect(leido.days[0].exercises[0]).toMatchObject({ sets: 4 });
  });
});

describe('isWordFile', () => {
  it('el Word de ahora sí, el de antes de 2007 no', () => {
    expect(isWordFile('Plan Ana.docx')).toBe(true);
    expect(isWordFile('PLAN.DOCX')).toBe(true);
    expect(isWordFile('plan.doc')).toBe(false);
    expect(isWordFile('plan.xlsx')).toBe(false);
    expect(isWordFile('')).toBe(false);
  });
});
