import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

import { DondeEstaPuesto } from './DondeEstaPuesto';

/**
 * ══ Qué protege este archivo ═══════════════════════════════════════════════
 *
 * Esta banda es lo primero que dice la ficha de una pieza de la Librería, y lo
 * que la hace valer es que **el vacío también habla**: «todavía no está en
 * ninguna dieta» es el dato que autoriza a podar, y una banda que se escondiera
 * cuando no hay nadie dejaría esa pregunta abierta justo cuando tiene respuesta.
 *
 * Y lo otro que se fija aquí es la distinción de las dos puertas: un cliente
 * está en OTRA pantalla y su cápsula tiene que ser un enlace de verdad; un
 * hermano de esta misma lista NO lo es, porque navegar para quedarse donde
 * estás le miente al botón de atrás. Es fácil de romper unificando las dos «por
 * simplificar», y entonces una de las dos hace lo que no debe.
 */

const pinta = (props) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <DondeEstaPuesto titulo="A quién se lo das" vacio="No está en ninguna dieta." {...props} />
    </MemoryRouter>
  );

describe('DondeEstaPuesto', () => {
  it('sin nadie detrás dice el vacío, que es el dato que autoriza a podar', () => {
    const html = pinta({ gente: [] });
    expect(html).toContain('No está en ninguna dieta.');
    expect(html).toContain('A quién se lo das');
  });

  it('quien lleva a otra pantalla sale como enlace de verdad', () => {
    const html = pinta({ gente: [{ id: 'c1', name: 'Javier', to: '/c/c1/nutricion' }] });
    expect(html).toContain('href="/c/c1/nutricion"');
    expect(html).toContain('Javier');
  });

  it('quien se queda en esta lista NO es un enlace', () => {
    const html = pinta({ gente: [{ id: 'e1', name: 'Jalón al pecho' }] });
    expect(html).not.toContain('href');
    expect(html).toContain('<button');
  });

  /* El resumen: los que no caben se cuentan, no se esconden. Y en texto, no en
     otra cápsula — vestirlos igual que los que sí se pulsan prometería una
     puerta que no existe. */
  it('resume los que no caben y no los disfraza de puerta', () => {
    const gente = ['Javier', 'Marta', 'Ana', 'Luis', 'Sara'].map((name, i) => ({
      id: `c${i}`,
      name,
      to: `/c/c${i}/nutricion`,
    }));
    const html = pinta({ gente });

    expect(html).toContain('Javier');
    expect(html).toContain('Ana');
    expect(html).not.toContain('Luis');
    expect(html).toContain('y 2 más');
    expect(html.match(/<a /g)).toHaveLength(3);
  });
});
