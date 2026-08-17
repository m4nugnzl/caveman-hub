import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { catalogoDe, clavesDeObjeto, seccionesDe } from './catalogo.mjs';

const RAIZ = fileURLToPath(new URL('../../', import.meta.url));
const lee = (ruta) => readFile(new URL(ruta, `file://${RAIZ}`), 'utf8');

/**
 * ══ Qué protege este archivo ═══════════════════════════════════════════════
 *
 * Que el informe no se quede mudo sin decirlo.
 *
 * `catalogo.mjs` lee el código con expresiones regulares para saber qué
 * pantallas y qué campos OFRECE la aplicación. Si alguien reescribe
 * `src/routes.jsx` con otra forma, las expresiones dejan de encontrar nada y el
 * informe empieza a decir «ninguna pantalla sin uso» — que se lee como una buena
 * noticia y es lo contrario: es que ha dejado de mirar.
 *
 * Por eso las pruebas de abajo corren contra los archivos DE VERDAD y no contra
 * fragmentos inventados. Una prueba con su propio texto de ejemplo comprobaría
 * que la expresión funciona sobre lo que la prueba escribió, que es justo lo que
 * no hace falta saber.
 */
describe('catálogo, contra el código real del proyecto', () => {
  it('encuentra las secciones del cliente y las de ajustes', async () => {
    const rutas = await lee('src/routes.jsx');

    const deCliente = seccionesDe(rutas, 'COACH_CLIENT');
    const deAjustes = seccionesDe(rutas, 'SETTINGS_SECTIONS');

    /* Fijadas por nombre: quitar una obliga a borrar una línea de aquí, que es
       la ocasión de preguntarse si el informe sigue midiendo lo que decía. */
    expect(deCliente).toEqual(expect.arrayContaining(['rutina', 'nutricion', 'revision', 'ficha']));
    expect(deAjustes).toEqual(expect.arrayContaining(['equipo', 'plan', 'integraciones']));
  });

  it('incluye los segundos niveles, que también son pantallas que se abren', async () => {
    /* `revision/fotos` es una pantalla de verdad. Dejarla fuera la contaría como
       «no la usa nadie» para siempre. */
    const rutas = await lee('src/routes.jsx');
    expect(seccionesDe(rutas, 'COACH_CLIENT')).toContain('revision/fotos');
  });

  it('encuentra los seis pliegues y los nueve perímetros', async () => {
    const antropometria = await lee('src/domain/anthropometry.js');

    expect(clavesDeObjeto(antropometria, 'FOLDS_LABELS')).toEqual([
      'tricipital',
      'subescapular',
      'abdominal',
      'suprailiaco',
      'muslo',
      'pantorrilla',
    ]);
    expect(clavesDeObjeto(antropometria, 'PERIMETER_LABELS')).toHaveLength(9);
  });

  it('compone las etiquetas igual que pantallaDe, o no comparan con nada', async () => {
    /*
      La etiqueta que se guarda en `product_events` la construye `pantallaDe` en
      `src/App.jsx` como `cliente_<sección con / → _>`. Si aquí se compusiera de
      otra forma, NINGUNA pantalla casaría y todas saldrían como no usadas.
    */
    const cat = catalogoDe({
      rutas: await lee('src/routes.jsx'),
      antropometria: await lee('src/domain/anthropometry.js'),
    });

    expect(cat.pantallas).toContain('cliente_rutina');
    expect(cat.pantallas).toContain('cliente_revision_fotos');
    expect(cat.pantallas).toContain('ajustes_plan');
    expect(cat.pantallas).toContain('hoy');

    /* Y todas tienen que pasar el CHECK de la 0045, porque es la forma que
       tienen los valores con los que se van a comparar. */
    for (const p of cat.pantallas) expect(p).toMatch(/^[a-z][a-z0-9_]{2,40}$/);
  });

  it('con el código real no tiene nada que avisar', async () => {
    const cat = catalogoDe({
      rutas: await lee('src/routes.jsx'),
      antropometria: await lee('src/domain/anthropometry.js'),
    });
    expect(cat.avisos).toEqual([]);
  });
});

describe('cuando el código cambia de forma', () => {
  it('no devuelve listas vacías en silencio: avisa', async () => {
    /*
      El fallo que de verdad importa. Una lista vacía haría que el informe
      dijera «ninguna pantalla sin uso» y «ningún campo sin medir», que suenan a
      que todo va bien y significan que no se ha mirado nada.
    */
    const cat = catalogoDe({ rutas: 'esto ya no se parece a routes.jsx', antropometria: '' });

    expect(cat.pantallas).toHaveLength(3); // solo las tres de raíz, escritas aquí
    expect(cat.pliegues).toEqual([]);
    expect(cat.avisos).toHaveLength(2);
    expect(cat.avisos[0]).toMatch(/incompleta/);
  });

  it('sin argumentos tampoco revienta', () => {
    expect(catalogoDe().avisos).toHaveLength(2);
  });
});
