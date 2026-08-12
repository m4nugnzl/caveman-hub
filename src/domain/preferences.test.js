import { describe, expect, it } from 'vitest';

import { CARDS, cardSpan, layoutCards } from './preferences';

/**
 * `layoutCards` existe para que no queden huecos en la rejilla del panel: una
 * tarjeta de media anchura sin pareja a su derecha deja un agujero visible, y el
 * usuario lo lee como un fallo, no como una decisión suya.
 *
 * La prueba es por FUERZA BRUTA porque el fallo depende de la combinación exacta
 * de tarjetas elegidas y de sus anchos: hay configuraciones que se ven bien por
 * casualidad y otras que no, y probar «un par de casos» no dice nada.
 */

const ids = CARDS.map((c) => c.id);

/** Recorre la fila reconstruyendo la rejilla de 2 columnas y busca huecos. */
const holes = (slots) => {
  let column = 0;
  let found = 0;
  for (const slot of slots) {
    if (slot.span === 'full') {
      // Una tarjeta a todo el ancho que empieza en la segunda columna deja la
      // primera vacía a su izquierda.
      if (column === 1) found += 1;
      column = 0;
    } else {
      column = column === 0 ? 1 : 0;
    }
  }
  // Media tarjeta al final deja la otra mitad de la fila vacía.
  if (column === 1) found += 1;
  return found;
};

describe('layoutCards', () => {
  it('nunca deja huecos, con cualquier selección y cualquier ancho', () => {
    let combinations = 0;
    let worst = null;

    // Todos los subconjuntos de tarjetas × todos los repartos de ancho posibles.
    for (let mask = 0; mask < 2 ** ids.length; mask += 1) {
      const chosen = ids.filter((_, i) => mask & (1 << i));
      if (chosen.length === 0) continue;

      for (let spanMask = 0; spanMask < 2 ** chosen.length; spanMask += 1) {
        const spans = {};
        chosen.forEach((id, i) => {
          spans[id] = spanMask & (1 << i) ? 'full' : 'half';
        });

        const slots = layoutCards({ spans }, chosen);
        combinations += 1;
        if (holes(slots) > 0 && !worst) worst = { chosen, spans, slots };
      }
    }

    expect(worst, worst ? `Hueco con ${JSON.stringify(worst)}` : '').toBeNull();

    /*
      El espacio recorrido es EXHAUSTIVO, y se comprueba que lo sea.
      ----------------------------------------------------------------------
      Cada tarjeta está en uno de tres estados —fuera, media anchura, ancho
      completo— así que el total es 3^n, menos el caso de no elegir ninguna. Si
      alguien añade una tarjeta y este número no cuadra, la prueba avisa de que el
      bucle ha dejado de cubrirlo todo en lugar de seguir pasando con menos casos.
    */
    expect(combinations).toBe(3 ** ids.length - 1);
  });

  it('una tarjeta a media anchura sin pareja pasa a ancho completo', () => {
    const [only] = layoutCards({ spans: {} }, [ids[0]]);
    expect(only.span).toBe('full');
  });

  it('dos a media anchura se quedan como están: forman una fila completa', () => {
    const halves = ids.slice(0, 2);
    const spans = Object.fromEntries(halves.map((id) => [id, 'half']));
    expect(layoutCards({ spans }, halves).map((s) => s.span)).toEqual(['half', 'half']);
  });

  it('las tarjetas fijas conservan su ancho declarado', () => {
    // Hay tarjetas que no tienen sentido a media anchura (una semana completa en
    // una minicaja), y su ancho no es negociable por preferencias.
    for (const card of CARDS.filter((c) => c.fixed)) {
      expect(cardSpan({ spans: { [card.id]: 'half' } }, card.id)).toBe(card.span);
    }
  });
});
