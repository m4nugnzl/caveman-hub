import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { elementoDePregunta } from '@/domain/formularios';
import { SESSION_QUESTIONS } from '@/domain/protocol';
import { CampoLibre } from './CampoLibre';

/**
 * EL ELEMENTO SACADO DE LA ESTANTERÍA SIGUE SIENDO SU PREGUNTA.
 *
 * ══ La avería que atrapa ═══════════════════════════════════════════════════
 *
 * Hay DOS modelos de pregunta en esta aplicación —el del protocolo (`questions`
 * + `custom`) y el del formulario libre (`elementos`)— y una estantería que
 * lleva del primero al segundo: coges «Energía» del catálogo y entra en tu
 * formulario como un elemento más.
 *
 * El elemento se trae lo que SE PUEDE retocar: el enunciado, la ayuda, el rango,
 * las opciones. Lo que no se retoca —con qué se contesta, qué significan las
 * puntas, de qué color se pinta su serie— no se copia a propósito, porque
 * copiarlo sería dejar que se editara. Y esa decisión, que es la correcta, tenía
 * un precio que nadie estaba pagando: por el camino del elemento **el
 * instrumento desaparecía**.
 *
 * Lo que se veía: «Energía» y «Sensaciones generales» sacadas a un formulario
 * salían las dos como la misma rampa de cinco discos, en vez de como su depósito
 * y sus caras. O sea el mismo control dos veces, que es exactamente la avería
 * que los instrumentos cerraron en el check-in y en el parte.
 *
 * Se resuelve mirando el catálogo por `origen`, que es lo único que el elemento
 * sí conserva. Estas pruebas son el guardián de ese viaje: si alguien vuelve a
 * pintar la escala del lienzo sin pasar por ahí, se caen.
 */

const nada = () => {};

const del = (id) => elementoDePregunta(SESSION_QUESTIONS.find((q) => q.id === id));

const pinta = (elem) => renderToStaticMarkup(<CampoLibre elem={elem} valor="" onChange={nada} />);

describe('CampoLibre · la escala que viene de la estantería', () => {
  it('«Energía» se contesta con su depósito, no con una rampa de cinco', () => {
    const html = pinta(del('energy'));
    expect(html).toContain('is-deposito');
    /* El depósito no lleva icono dentro de sus tramos: si aparece uno es que se
       ha colado el instrumento de al lado. */
    expect(html).not.toContain('<svg');
  });

  it('«Sensaciones generales» sale con sus cinco caras, y cinco distintas', () => {
    const html = pinta(del('mood'));
    expect(html).toContain('is-caras');
    expect(html.match(/lucide-(angry|frown|meh|smile|laugh)"/g)).toHaveLength(5);
  });

  it('«Cómo dormiste anoche» sale con sus cinco estrellas', () => {
    const html = pinta(del('sleep'));
    expect(html).toContain('is-estrellas');
    expect(html.match(/lucide-star/g)).toHaveLength(5);
  });

  /* Lo que es una CANTIDAD se queda donde estaba: la rampa de discos que crecen,
     que es donde el 0-10 significa algo de verdad. */
  it('el dolor sigue siendo la rampa de once pasos', () => {
    const html = pinta(del('pain'));
    expect(html.match(/rampa-disco/g)).toHaveLength(11);
    expect(html).not.toContain('instrumento');
  });

  /* Y las puntas, que viajaban igual de mal: el elemento no guarda `anclas` y
     sin ir a buscarlas la escala salía muda. */
  it('las puntas de la escala vienen con ella', () => {
    const html = pinta(del('fatigue'));
    expect(html).toContain('rampa-puntas');
    expect(html).toContain('Entero');
    expect(html).toContain('Vacío');
  });

  /*
    EL RANGO LO MANDA EL INSTRUMENTO. Un elemento guardado antes de que estas
    preguntas bajaran a 1-5 sigue diciendo `max: 10`, y sin esto el cliente se
    encontraría diez estrellas en fila —y guardaría un 8 en una serie que ya está
    en escala de cinco—. Es la misma regla que `sanitizeCustom`.
  */
  it('un elemento viejo con `max: 10` no saca diez estrellas', () => {
    const html = pinta({ ...del('sleep'), min: 1, max: 10 });
    expect(html).toContain('is-estrellas');
    expect(html.match(/lucide-star/g)).toHaveLength(5);
  });

  /*
    Y una pregunta que escribió el entrenador NO estrena instrumento: sin
    `origen` no salió de ninguna parte, y darle uno sería decidir por él qué clase
    de cosa está preguntando. Sale en la rampa, con su rango y sin tinta de serie.
  */
  it('una escala escrita por el entrenador se queda en la rampa', () => {
    const html = pinta({
      id: 'e1',
      tipo: 'escala',
      enun: '¿Cuántos días has salido a andar?',
      min: 0,
      max: 10,
      mejorAbajo: false,
    });
    expect(html).not.toContain('instrumento');
    expect(html).not.toContain('rampa-puntas');
    expect(html).not.toContain('--rampa-tinta');
  });
});
