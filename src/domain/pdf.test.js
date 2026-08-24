import { describe, expect, it } from 'vitest';

import { isPdfFile, readPdfText } from './pdf';

/**
 * ══ Qué protege este archivo ═══════════════════════════════════════════════
 *
 * Que un PDF con la tipografía RECORTADA se lea como lo que pone y no como lo
 * que valen sus bytes. Es el único fallo de este módulo que no se ve: los
 * índices de una tipografía recortada producen una cadena de la longitud
 * correcta, con espacios en su sitio y sin un solo carácter raro — y que no dice
 * nada. Una prueba que solo mirara «¿ha salido texto?» la daría por buena.
 *
 * Por eso los ficheros se fabrican aquí: hace falta escribir exactamente el
 * caso —esta tipografía recortada, estas dos páginas con dos recortes distintas
 * bajo el MISMO nombre `/F1`— y en un PDF real eso está enterrado.
 *
 * El precio es el mismo que en `xlsx.test.js`: esto no demuestra que se abra el
 * PDF que manda un entrenador. Eso se comprueba a mano, y para cuando falle
 * está la salida de siempre —abrirlo, copiar y pegar—, que es lo que dice el
 * mensaje de error.
 */

const bytes = (texto) => Uint8Array.from(texto, (c) => c.charCodeAt(0) & 0xff);

const deflar = async (texto) =>
  new Uint8Array(
    await new Response(
      new Blob([bytes(texto)]).stream().pipeThrough(new CompressionStream('deflate'))
    ).arrayBuffer()
  );

/** Un PDF con los objetos que se le den, con sus longitudes bien puestas. */
const pdf = (objetos) => {
  let out = '%PDF-1.4\n';
  objetos.forEach((cuerpo, i) => {
    out += `${i + 1} 0 obj\n${cuerpo}\nendobj\n`;
  });
  out += 'trailer\n<< /Root 1 0 R >>\n%%EOF';
  return bytes(out).buffer;
};

/** Un objeto con flujo, ya con su `/Length`. */
const flujo = (dict, datos) => {
  const texto = typeof datos === 'string' ? datos : String.fromCharCode(...datos);
  return `<< ${dict} /Length ${texto.length} >>\nstream\n${texto}\nendstream`;
};

/* Una tipografía recortada: el índice 1 es la «H», el 2 la «o», … Es lo que hace
   cualquier procesador de textos, y sin `/ToUnicode` esto se leería como
   caracteres de control. */
const CMAP = `/CIDInit /ProcSet findresource begin
12 dict begin
begincmap
1 beginbfchar
<01> <0048>
endbfchar
2 beginbfrange
<02> <04> <006F>
<05> <07> [<0061> <0021> <00E9>]
endbfrange
endcmap
end end`;

describe('readPdfText', () => {
  it('lee un PDF sin comprimir, con una línea por posición de texto', async () => {
    const contenido = `BT /F1 12 Tf 72 700 Td (COMIDA 1) Tj ET
BT /F1 12 Tf 72 680 Td (- 100g Avena) Tj ET`;

    const texto = await readPdfText(
      pdf([
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] >>',
        '<< /Type /Page /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
        flujo('', contenido),
        '<< /Type /Font /Subtype /TrueType /BaseFont /Arial >>',
      ])
    );

    expect(texto.split('\n')).toEqual(['COMIDA 1', '- 100g Avena']);
  });

  it('traduce los índices de una tipografía recortada con su /ToUnicode', async () => {
    /* «\x01\x02\x03\x04» con el mapa de arriba es «Hoop»… no: es H, o, p, q
       corridos. Lo que importa es que NO son esos bytes. */
    const contenido = 'BT /F1 12 Tf 72 700 Td (\x01\x02\x05\x07) Tj ET';

    const texto = await readPdfText(
      pdf([
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] >>',
        '<< /Type /Page /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
        flujo('', contenido),
        '<< /Type /Font /Subtype /TrueType /ToUnicode 6 0 R >>',
        flujo('', CMAP),
      ])
    );

    expect(texto).toBe('Hoaé');
  });

  it('cada página usa SU tipografía aunque las dos se llamen /F1', async () => {
    /* El fallo que esto evita: una tabla común de traducción garabatea la
       negrita —o los títulos— y deja el resto perfecto, que es justo lo que
       nadie mira dos veces. */
    const otraCmap = `begincmap
1 beginbfrange
<01> <04> <004E>
endbfrange
endcmap`;

    const texto = await readPdfText(
      pdf([
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R 7 0 R] >>',
        '<< /Type /Page /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
        flujo('', 'BT /F1 12 Tf (\x01\x02\x05\x07) Tj ET'),
        '<< /Type /Font /ToUnicode 6 0 R >>',
        flujo('', CMAP),
        '<< /Type /Page /Contents 8 0 R /Resources << /Font << /F1 9 0 R >> >> >>',
        flujo('', 'BT /F1 12 Tf (\x01\x02\x03\x04) Tj ET'),
        '<< /Type /Font /ToUnicode 10 0 R >>',
        flujo('', otraCmap),
      ])
    );

    expect(texto).toBe('Hoaé\nNOPQ');
  });

  it('descomprime los flujos, que es como vienen todos', async () => {
    const datos = await deflar('BT /F1 12 Tf 72 700 Td (DESAYUNO) Tj ET');

    const texto = await readPdfText(
      pdf([
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] >>',
        '<< /Type /Page /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
        flujo('/Filter /FlateDecode', datos),
        '<< /Type /Font /BaseFont /Arial >>',
      ])
    );

    expect(texto).toBe('DESAYUNO');
  });

  it('convierte en espacio el hueco de un TJ, que es de donde salen las palabras', async () => {
    /* En un `TJ` los espacios no se escriben: se dejan como un ajuste negativo
       entre dos trozos. Sin esto, «100g Copos de avena» llega pegado y ni el
       nombre del alimento ni los gramos se pueden leer. */
    const contenido = 'BT /F1 12 Tf [(100g) -400 (Copos) -300 (de) -50 (avena)] TJ ET';

    const texto = await readPdfText(
      pdf([
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] >>',
        '<< /Type /Page /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
        flujo('', contenido),
        '<< /Type /Font /BaseFont /Arial >>',
      ])
    );

    expect(texto).toBe('100g Copos deavena');
  });

  it('lee las cadenas en hexadecimal', async () => {
    const texto = await readPdfText(
      pdf([
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] >>',
        '<< /Type /Page /Contents 4 0 R /Resources << >> >>',
        flujo('', 'BT <43454E41> Tj ET'),
      ])
    );

    expect(texto).toBe('CENA');
  });

  /*
    ══ El PDF tal y como lo escribe un procesador de textos ══════════════════

    Y no como sería cómodo. Lo de abajo es la forma EXACTA del PDF de una dieta
    real, y trae las tres trampas juntas:

      · Cada palabra —y en un título, cada letra— va en su propio `BT … ET`.
      · Todas repiten la misma `Tm` y se colocan con un `Td` relativo, así que
        dentro de un párrafo la Y del texto no cambia entre renglones distintos.
      · Cada párrafo va envuelto en su `q … cm … Q`, y es ESA matriz la que dice
        a qué altura del papel cae.

    Leído sin las tres, ese fichero daba 1.405 renglones de una palabra («P»,
    «l», «a», «n»…) o, arreglando solo la primera, un renglón de dos mil
    caracteres con la página entera dentro. Las dos veces sin un solo error: lo
    único que se veía era una dieta con cuatro alimentos llamados
    «kilocalorías», «proteína», «hidratos» y «grasas».
  */
  it('reconstruye los renglones de un PDF de procesador de textos', async () => {
    const parrafo = (cm, renglones) =>
      [
        'q',
        `${cm} cm`,
        ...renglones.flatMap(({ y, trozos }) =>
          trozos.map(
            ({ x, t, tam = 16 }) =>
              `BT /F1 ${tam} Tf 1 0 0 -1 0 0 Tm ${x} ${y} Td (${t}) Tj ET`
          )
        ),
        'Q',
      ].join('\n');

    const contenido = [
      /* El título, letra a letra: no puede salir «P l a n». */
      parrafo('.75 0 0 .75 72 40', [
        { y: -19, trozos: [
          { x: 0, t: 'P', tam: 21 },
          { x: 14, t: 'l', tam: 21 },
          { x: 19, t: 'a', tam: 21 },
          { x: 30, t: 'n', tam: 21 },
        ] },
      ]),
      /* Un párrafo de dos renglones, cada palabra por su cuenta. */
      parrafo('.75 0 0 .75 72 72', [
        { y: -14, trozos: [{ x: 0, t: 'Pequeñas' }, { x: 72, t: ' ' }, { x: 76, t: 'pautas' }] },
        { y: -33, trozos: [{ x: 0, t: 'antes de empezar' }] },
      ]),
      /* Y otro párrafo que, en coordenadas de texto, está a la MISMA altura que
         el primero: solo la matriz de la página los separa. */
      parrafo('.75 0 0 .75 72 200', [{ y: -14, trozos: [{ x: 0, t: '- 100g Avena' }] }]),
    ].join('\n');

    const texto = await readPdfText(
      pdf([
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] >>',
        '<< /Type /Page /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
        flujo('', contenido),
        '<< /Type /Font /BaseFont /Arial >>',
      ])
    );

    expect(texto.split('\n')).toEqual(['Plan', 'Pequeñas pautas', 'antes de empezar', '- 100g Avena']);
  });

  /*
    ══ El PDF moderno: todo dentro de un flujo comprimido ════════════════════

    Desde la versión 1.5, los diccionarios —el catálogo, las páginas, las
    tipografías— pueden ir metidos en un `/ObjStm` en vez de escritos como
    `N 0 obj`. Buscando `obj` por el fichero, uno así parece no tener ni una
    página. En el barrido sobre catorce PDF de generadores distintos, los dos
    únicos que fallaban eran exactamente estos: los produce cualquier LaTeX,
    cualquier Word moderno, Adobe y WeasyPrint.
  */
  it('abre los objetos que van comprimidos dentro de otro', async () => {
    /* Los de dentro se numeran del 10 en adelante para no chocar con los que
       van sueltos, que es como lo hace un fichero de verdad. */
    const dentro = [
      [10, '<< /Type /Catalog /Pages 11 0 R >>'],
      /* Los recursos los declara el PADRE y la página los hereda; y dentro, el
         diccionario de tipografías va por REFERENCIA, no escrito ahí. Las dos
         cosas son legales, las dos aparecen en ficheros reales, y sin resolver
         ninguna la página sale sin tipografía —es decir, sin traducir—. */
      [11, '<< /Type /Pages /Kids [12 0 R] /Count 1 /Resources 3 0 R >>'],
      [12, '<< /Type /Page /Parent 11 0 R /Contents 2 0 R >>'],
    ];

    /* La cabecera de un `/ObjStm` son parejas «número desplazamiento». */
    let cursor = 0;
    const cabecera = dentro
      .map(([numero, cuerpo]) => {
        const par = `${numero} ${cursor}`;
        cursor += cuerpo.length + 1;
        return par;
      })
      .join(' ');
    const cuerpo = `${cabecera}\n${dentro.map(([, c]) => c).join('\n')}`;

    const texto = await readPdfText(
      pdf([
        flujo(
          `/Type /ObjStm /N ${dentro.length} /First ${cabecera.length + 1} /Filter /FlateDecode`,
          await deflar(cuerpo)
        ),
        /* Se escribe «AAA» y la tipografía dice que esos códigos son «CEN»: si
           la cadena de recursos no se resuelve, sale «AAA» y se nota. */
        flujo('', 'BT /F1 12 Tf 72 700 Td (ABC) Tj ET'),
        '<< /Font 4 0 R >>',
        '<< /F1 5 0 R >>',
        '<< /Type /Font /Subtype /TrueType /ToUnicode 6 0 R >>',
        flujo('', 'begincmap\n3 beginbfchar\n<41> <0043>\n<42> <0045>\n<43> <004E>\nendbfchar\nendcmap'),
        '<< /Type /XRef /Root 10 0 R >>',
      ])
    );

    expect(texto).toBe('CEN');
  });

  it('una tipografía simple se lee de byte en byte aunque su mapa venga relleno', async () => {
    /*
      Cuántos bytes hace una letra lo dice la TIPOGRAFÍA, no su tabla: las
      simples usan uno y solo las compuestas (`/Type0`) usan dos. Deduciéndolo
      del mapa, un generador que escriba los códigos rellenos a cuatro cifras
      —`<0043>` para la «C»— hacía que se leyeran de dos en dos: ninguno
      coincide y las páginas salen VACÍAS, que es peor que salir con basura
      porque parece que el PDF no tenía texto.
    */
    const rellena = `begincmap
1 begincodespacerange
<0000> <FFFF>
endcodespacerange
4 beginbfchar
<0043> <0043>
<0045> <0045>
<004E> <004E>
<0041> <0041>
endbfchar
endcmap`;

    const texto = await readPdfText(
      pdf([
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] >>',
        '<< /Type /Page /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
        flujo('', 'BT /F1 12 Tf 72 700 Td (CENA) Tj ET'),
        '<< /Type /Font /Subtype /TrueType /ToUnicode 6 0 R >>',
        flujo('', rellena),
      ])
    );

    expect(texto).toBe('CENA');
  });

  it('dice qué hacer cuando el PDF no trae texto, en vez de devolver basura', async () => {
    await expect(
      readPdfText(
        pdf([
          '<< /Type /Catalog /Pages 2 0 R >>',
          '<< /Type /Pages /Kids [3 0 R] >>',
          '<< /Type /Page /Contents 4 0 R >>',
          flujo('', '0.5 0.5 0.5 rg 10 10 100 100 re f'),
        ])
      )
    ).rejects.toThrow(/escaneado|cópialo/i);
  });

  it('rechaza lo que no es un PDF', async () => {
    await expect(readPdfText(new TextEncoder().encode('hola').buffer)).rejects.toThrow(/no es un PDF/i);
  });
});

describe('isPdfFile', () => {
  it('reconoce la extensión sin distinguir mayúsculas', () => {
    expect(isPdfFile('Plan Roberto.PDF')).toBe(true);
    expect(isPdfFile('plan.xlsx')).toBe(false);
    expect(isPdfFile(null)).toBe(false);
  });
});
