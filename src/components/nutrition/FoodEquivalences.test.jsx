import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { FoodEquivalences } from './FoodEquivalences';

/**
 * ══ Qué protege este archivo ═══════════════════════════════════════════════
 *
 * Esta ventana la leen dos personas distintas con la misma lista delante, y lo
 * que las separa es un verbo. Lo que se fija aquí:
 *
 *   1. **De dónde sale la lista, dicho.** Con un grupo tuyo la lista es corta
 *      porque tú la podaste, y una lista corta sin explicación se lee como una
 *      lista incompleta.
 *   2. **El cliente no monta grupos.** Sin `onSaveGrupo` no hay verbo de
 *      guardar, igual que sin `onSwap` no hay «Usar».
 *   3. **El interruptor de «tu cliente ve esta lista» sigue siendo del
 *      entrenador**, y nunca aparece en el portal.
 */

const huevo = { id: 'f1', name: 'Huevo entero', grams: 150, proteinPer100: 12.5 };

const equivalencias = ({ grupo = null } = {}) => ({
  macro: 'protein',
  category: grupo ? null : 'Huevos',
  grupo,
  macroGrams: 19,
  items: [
    {
      food: { id: 'c1', name: 'Clara de huevo' },
      grams: 175,
      kcal: 78,
      kcalDiff: -2,
      macroGrams: 19,
      macroDiff: 0,
      gramsKcal: null,
    },
  ],
});

const pinta = (props) =>
  renderToStaticMarkup(<FoodEquivalences food={huevo} onClose={() => {}} {...props} />);

describe('FoodEquivalences', () => {
  it('sin grupo dice la cuenta: de dónde salen los gramos', () => {
    const html = pinta({ equivalences: equivalencias() });
    expect(html).toContain('19 g de proteína');
    expect(html).toContain('Clara de huevo');
  });

  it('con un grupo tuyo lo dice, que es lo que explica que la lista sea corta', () => {
    const html = pinta({
      equivalences: equivalencias({ grupo: { id: 'g1', name: 'Mi proteína magra' } }),
      onSwap: () => {},
      onSaveGrupo: () => {},
    });

    expect(html).toContain('Mi proteína magra');
    // Y el verbo del pie deja de ofrecer guardar: ya está guardado.
    expect(html).toContain('Editar tu grupo');
    expect(html).not.toContain('Guardar estos como grupo');
  });

  it('montando el entrenador ofrece guardar; el cliente no ve el verbo', () => {
    const conVerbo = pinta({ equivalences: equivalencias(), onSwap: () => {}, onSaveGrupo: () => {} });
    expect(conVerbo).toContain('Guardar estos como grupo');
    expect(conVerbo).toContain('Usar');

    /* La vista del cliente: la misma lista, sin un solo botón que cambie nada
       —su plan es lo estipulado— y sin los mandos que son del entrenador. */
    const delCliente = pinta({ equivalences: equivalencias() });
    expect(delCliente).not.toContain('Guardar estos como grupo');
    expect(delCliente).not.toContain('Tu cliente ve esta lista');
  });

  /* Meter una equivalencia a mano es montar un grupo, así que sigue la misma regla:
     solo quien puede guardarlo, y solo si hay de dónde buscar. */
  it('«+ equivalencia» es del entrenador y necesita la biblioteca', () => {
    const atun = { id: 'l1', name: 'Atún al natural', proteinPer100: 24 };

    const conBiblioteca = pinta({
      equivalences: equivalencias(),
      onSaveGrupo: () => {},
      libraryFoods: [atun],
    });
    expect(conBiblioteca).toContain('equiv-alta');

    expect(pinta({ equivalences: equivalencias(), onSaveGrupo: () => {} })).not.toContain('equiv-alta');
    expect(pinta({ equivalences: equivalencias(), libraryFoods: [atun] })).not.toContain('equiv-alta');
  });

  it('el alimento de partida encabeza la ventana con su cuenta', () => {
    const html = pinta({ equivalences: equivalencias() });
    expect(html).toContain('equiv-fuente');
    expect(html).toContain('150 g');
    expect(html).toContain('Aportan los mismos 19 g de proteína');
  });
});
