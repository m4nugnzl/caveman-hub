import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { TarjetasDeDia } from './TarjetasDeDia';

/**
 * ══ Qué protege este archivo ═══════════════════════════════════════════════
 *
 * Las tarjetas de día son, desde la tanda de «una sola forma de copiar», el sitio donde cae
 * la comida que se lleva en la mano: el ⇄ «Copiar esta comida a low» que vivía
 * en la fila de cada comida se retiró porque a qué día va es ELEGIR CUÁL, y eso
 * se arrastra (ver la ley del arrastre en `lib/portapapeles`).
 *
 * Lo que se fija aquí es lo que no se ve mirando la pantalla en reposo:
 *
 *   1. **El día abierto NUNCA recibe.** Pegar en el menú que ya se está mirando
 *      es el verbo de la mano, que está a la vista; una zona de soltar que hace
 *      lo mismo que un botón encendido es una oferta de más.
 *   2. **En reposo no se monta ni un manejador.** Sin nada en vuelo, `soltar`
 *      llega `null` y la pieza no pregunta a nadie si acepta: es la ley del
 *      reposo aplicada al arrastre.
 *   3. **El día que va a recibir se enciende**, y se distingue del abierto.
 *
 * Corre en Node y sin jsdom, como el resto de las pruebas de componente de la
 * casa: se comprueba lo que sale MARCADO, que es lo que decide qué manejadores
 * existen y qué ve el entrenador mientras arrastra.
 */

const dias = [
  { id: 'd1', name: 'Alto' },
  { id: 'd2', name: 'Bajo' },
  { id: 'd3', name: 'Descanso' },
];

const pintar = (props) =>
  renderToStaticMarkup(<TarjetasDeDia dias={dias} activo="d1" onDia={() => {}} {...props} />);

/* La firma de `useZonasDeSoltar`: `zona(id, pegar)` devuelve los manejadores.
   Aquí solo interesa a QUIÉN se le pregunta, así que devuelve nada y apunta. */
const espia = () => {
  const pedidas = [];
  return { pedidas, zona: (id) => { pedidas.push(id); return {}; } };
};

describe('las tarjetas de día como sitio donde cae lo que llevas', () => {
  it('en reposo no le ofrece zona a ningún día', () => {
    const { pedidas, zona } = espia();
    const html = pintar({ soltar: null });

    expect(zona).toBeDefined();
    expect(pedidas).toEqual([]);
    expect(html).not.toContain('is-drop-target');
  });

  it('con algo en vuelo, reciben los OTROS días y no el abierto', () => {
    const { pedidas, zona } = espia();
    pintar({ soltar: { sobre: null, zona, pegar: () => {} } });

    /* «Alto» es el abierto: no se le pide zona. */
    expect(pedidas).toEqual(['d2', 'd3']);
  });

  it('el día sobre el que se está soltando se enciende, y sigue distinguiéndose del abierto', () => {
    const { zona } = espia();
    const html = pintar({ soltar: { sobre: 'd2', zona, pegar: () => {} } });

    /* El encendido de recibir y el de «estás aquí» son dos marcas distintas y
       no pueden confundirse: una dice dónde caerá esto y la otra qué se está
       mirando. */
    expect(html).toContain('dieta-dia is-drop-target');
    expect(html).toContain('dieta-dia is-on');
    expect(html).not.toContain('is-on is-drop-target');
  });

  it('lo que se suelta se pega EN EL DÍA de la pestaña, no en el que se mira', () => {
    const pegar = vi.fn();
    /* `zona` real de mentira: guarda el manejador que le pasan para poder
       dispararlo, que es lo que hace el `onDrop` del navegador. */
    const sueltos = {};
    const zona = (id, alSoltar) => {
      sueltos[id] = alSoltar;
      return {};
    };

    pintar({ soltar: { sobre: null, zona, pegar } });

    const pieza = { tipo: 'comida', titulo: 'Comida 1' };
    sueltos.d3(pieza);

    /* El destino va como segundo argumento: sin él, `pegarComida` pegaría en el
       día abierto —que es justo el fallo que este gesto viene a evitar—. */
    expect(pegar).toHaveBeenCalledWith(pieza, 'd3');
  });
});
