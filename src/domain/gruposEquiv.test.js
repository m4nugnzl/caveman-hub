import { describe, expect, it } from 'vitest';

import {
  buildGrupo,
  grupoDe,
  grupoSummary,
  gruposOf,
  gruposQueYaLosTienen,
  nombreRepetido,
} from './gruposEquiv';

/**
 * ══ Qué protege este archivo ═══════════════════════════════════════════════
 *
 * Que un grupo sea criterio y no una copia:
 *
 *   1. Guarda NOMBRES, no cantidades ni macros. Lo que se congela es de un
 *      plato; un grupo dice qué vale por qué y las raciones se calculan.
 *   2. Un grupo de uno no es un grupo, y por eso no se enseña.
 *   3. El alimento entra en su grupo por el nombre, y por el del catálogo
 *      cuando el catálogo lo resuelve SIN DUDA — «Plátano mediano» es el
 *      plátano; un «Huevo» que encaja con cinco entradas no es ninguno.
 */

const catalogo = [
  { id: 'c1', name: 'Plátano', category: 'Fruta', carbsPer100: 20 },
  { id: 'c2', name: 'Manzana', category: 'Fruta', carbsPer100: 12 },
  { id: 'c3', name: 'Huevo entero', category: 'Huevos', proteinPer100: 12.5 },
  { id: 'c4', name: 'Huevo entero L', category: 'Huevos', proteinPer100: 12.5 },
];

const magra = {
  id: 'g1',
  name: 'Mi proteína magra',
  macro: 'protein',
  foods: ['Pechuga de pollo', 'Merluza', 'Clara de huevo'],
};

describe('gruposOf', () => {
  it('deja fuera lo que no es un grupo: sin nombre, sin macro o de un solo alimento', () => {
    const prefs = {
      gruposEquiv: {
        items: [
          magra,
          { id: 'g2', name: '', macro: 'carbs', foods: ['Arroz', 'Pasta'] },
          { id: 'g3', name: 'Sin macro', foods: ['Arroz', 'Pasta'] },
          { id: 'g4', name: 'Vitaminas', macro: 'micros', foods: ['Arroz', 'Pasta'] },
          /* Un grupo de uno no ofrece ningún cambio: el alimento abriría una
             lista vacía, que es justo lo que `foodEquiv` evita no pintando el
             botón. */
          { id: 'g5', name: 'Solo yo', macro: 'carbs', foods: ['Arroz'] },
          { id: 'g6', name: 'Repetidos', macro: 'carbs', foods: ['Arroz', 'arroz  '] },
        ],
      },
    };

    expect(gruposOf(prefs).map((g) => g.id)).toEqual(['g1']);
  });

  it('sin preferencias, ninguno — y quien no guarde ninguno no pierde nada', () => {
    expect(gruposOf({})).toEqual([]);
    expect(gruposOf(null)).toEqual([]);
  });

  it('sanea los nombres al leerlos, sin repetir y en el orden en que se marcaron', () => {
    const prefs = {
      gruposEquiv: {
        items: [{ ...magra, foods: ['  Merluza ', 'Pechuga de pollo', 'MERLUZA', ''] }],
      },
    };
    expect(gruposOf(prefs)[0].foods).toEqual(['Merluza', 'Pechuga de pollo']);
  });
});

describe('buildGrupo', () => {
  it('guarda nombres y nada más: ni gramos ni macros por 100', () => {
    const g = buildGrupo({
      name: '  Mi proteína magra ',
      macro: 'protein',
      foods: ['Pechuga de pollo', 'Merluza'],
      savedAt: '2026-09-10T00:00:00.000Z',
    });

    expect(g.name).toBe('Mi proteína magra');
    expect(g.macro).toBe('protein');
    expect(g.foods).toEqual(['Pechuga de pollo', 'Merluza']);
    expect(g.id).toMatch(/^grupo_/);
    /* La prueba de que es criterio y no copia: nada de lo que describe una
       ración concreta viaja dentro. */
    expect(Object.keys(g).sort()).toEqual(['foods', 'id', 'macro', 'name', 'savedAt']);
  });
});

describe('grupoDe', () => {
  const grupos = [magra, { id: 'g9', name: 'Mis frutas', macro: 'carbs', foods: ['Plátano', 'Manzana'] }];

  it('encuentra el grupo por el nombre, sin tildes ni mayúsculas', () => {
    expect(grupoDe('Merluza', grupos)?.id).toBe('g1');
    expect(grupoDe('platano', grupos)?.id).toBe('g9');
  });

  it('lo que no está en ninguno no tiene grupo', () => {
    expect(grupoDe('Aguacate', grupos)).toBeNull();
    expect(grupoDe('', grupos)).toBeNull();
  });

  it('un nombre a medias entra si el catálogo lo resuelve sin duda', () => {
    const conMerluza = [{ id: 'g7', name: 'Mis pescados', macro: 'protein', foods: ['Merluza congelada', 'Atún'] }];
    const catMerluza = [{ id: 'm1', name: 'Merluza congelada', category: 'Pescado', proteinPer100: 17 }];
    expect(grupoDe('Merluza', conMerluza, catMerluza)?.id).toBe('g7');
    /* Sin catálogo no hay a qué resolverlo, y adivinar es peor que no atarlo. */
    expect(grupoDe('Merluza', conMerluza)).toBeNull();
  });

  it('un nombre que el catálogo no resuelve sin duda no entra en ningún grupo', () => {
    const conHuevo = [{ id: 'g8', name: 'Mis huevos', macro: 'protein', foods: ['Huevo entero', 'Clara de huevo'] }];
    // «Huevo» encaja con dos entradas del catálogo: no es ninguna de las dos.
    expect(grupoDe('Huevo', conHuevo, catalogo)).toBeNull();
  });

  /*
    Y el caso que decide la regla, que es el que NO entra.

    «Plátano mediano» es el plátano; «Tomate frito» no es el tomate —lleva
    aceite y azúcar— y por forma son la misma cosa: el nombre del catálogo con
    una palabra de más. `matchFood` no da por bueno ninguno de los dos y los
    propone para que alguien mire (ver «Lo de aquí abajo se PROPONE»).

    Para la FAMILIA basta con proponer: equivocarse solo cambia qué macro se
    conserva, y la alternativa es no ofrecer ninguna equivalencia. Para un grupo
    tuyo, no: meter «Tomate frito» en «Mis verduras» es aplicar tu criterio a un
    alimento que nunca marcaste, y esa lista la lee tu cliente.
  */
  it('el nombre con una palabra de más se queda fuera aunque tenga familia', () => {
    expect(grupoDe('Plátano mediano', grupos, catalogo)).toBeNull();
  });

  it('en dos grupos manda el primero', () => {
    const dos = [
      { id: 'a', name: 'Uno', macro: 'protein', foods: ['Merluza', 'Atún'] },
      { id: 'b', name: 'Otro', macro: 'protein', foods: ['Merluza', 'Pavo'] },
    ];
    expect(grupoDe('Merluza', dos)?.id).toBe('a');
  });
});

describe('lo que se le dice a quien guarda', () => {
  it('qué grupos ya se llevan alguno de estos alimentos, sin contar el que se edita', () => {
    const grupos = [magra, { id: 'g9', name: 'Mis frutas', macro: 'carbs', foods: ['Plátano', 'Manzana'] }];

    expect(gruposQueYaLosTienen(['Merluza', 'Pavo'], grupos).map((g) => g.id)).toEqual(['g1']);
    expect(gruposQueYaLosTienen(['Merluza'], grupos, 'g1')).toEqual([]);
    expect(gruposQueYaLosTienen(['Pavo'], grupos)).toEqual([]);
  });

  it('el nombre repetido se detecta sin tildes, y no cuenta el que se edita', () => {
    const grupos = [magra];
    expect(nombreRepetido('mi proteina magra', grupos)).toBe(true);
    expect(nombreRepetido('Mi proteína magra', grupos, 'g1')).toBe(false);
    expect(nombreRepetido('Mis grasas', grupos)).toBe(false);
  });
});

describe('grupoSummary', () => {
  it('dice cuántos y de qué macro', () => {
    expect(grupoSummary(magra, 'Proteína')).toBe('3 alimentos · proteína');
    expect(grupoSummary({ foods: ['Uno'] })).toBe('1 alimento');
  });
});
