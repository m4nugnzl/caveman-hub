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
