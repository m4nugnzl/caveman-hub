import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Send } from 'lucide-react';

import { BotonAccion } from './primitives';

/**
 * EL BOTÓN QUE TARDA, en sus tres estados.
 *
 * ══ Por qué esto se prueba ══════════════════════════════════════════════════
 *
 * Porque lo que este botón promete es una cosa muy concreta y muy fácil de
 * romper sin enterarse: **que la caja no se mueva**. El rótulo se queda donde
 * está, el hueco del glifo mide siempre lo mismo, y lo único que cambia es qué
 * hay dentro de ese hueco. Un cambio inocente en el JSX —envolver el rótulo,
 * quitar el `span` del glifo, sacar el icono fuera— devuelve la aplicación al
 * comportamiento de antes: el botón encogiéndose al pulsarlo.
 *
 * Se prueba con el estado GOBERNADO DESDE FUERA (`estado`), que es el que usan
 * los formularios, y de paso es la única forma de mirar los tres sin un
 * renderizador con efectos: aquí solo hay `renderToStaticMarkup`.
 *
 * Lo que NO cubre esto —que el trabajo se lance una vez, que un fallo no
 * celebre, que el tic dure 900 ms— vive en `useAccionDeBoton` y se comprobó
 * contra la aplicación real; ver el comentario del cerrojo, que es donde
 * `StrictMode` rompió dos versiones seguidas.
 */
const pinta = (props) => renderToStaticMarkup(<BotonAccion {...props}>Invitar</BotonAccion>);

describe('BotonAccion', () => {
  it('en reposo enseña su icono y se puede pulsar', () => {
    const html = pinta({ icon: Send, estado: 'reposo' });
    expect(html).toContain('data-estado="reposo"');
    expect(html).toContain('btn-glifo');
    expect(html).not.toContain('disabled');
    expect(html).toContain('Invitar');
  });

  it('ocupado avisa a los lectores de pantalla y no se deja pulsar dos veces', () => {
    const html = pinta({ icon: Send, estado: 'ocupado' });
    expect(html).toContain('data-estado="ocupado"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('disabled');
    /* La clase del giro es la que ya usaba el resto del producto. */
    expect(html).toContain('spin');
  });

  it('el rótulo NO cambia entre estados: es la promesa entera', () => {
    for (const estado of ['reposo', 'ocupado', 'hecho']) {
      expect(pinta({ icon: Send, estado })).toContain('Invitar');
    }
  });

  it('el hueco del glifo existe siempre, que es lo que fija el ancho', () => {
    for (const estado of ['reposo', 'ocupado', 'hecho']) {
      expect(pinta({ icon: Send, estado })).toContain('btn-glifo');
    }
  });

  /*
    Sin icono no hay hueco que ocupar, así que abrirlo haría crecer el botón. La
    marca `is-sin-icono` es lo que activa la otra vía —el glifo por encima y el
    rótulo apagado—, y sin ella el botón vuelve a dar el salto de tamaño.
  */
  it('sin icono se marca para que el glifo vaya encima y no ensanche', () => {
    /* En reposo el hueco está cerrado (`is-hueco`), así que el botón mide lo que
       mediría sin nada delante; al trabajar se abre… pero por encima, no
       empujando, que es lo que dice `is-sin-icono`. */
    expect(pinta({ estado: 'reposo' })).toContain('is-hueco');
    const trabajando = pinta({ estado: 'ocupado' });
    expect(trabajando).toContain('is-sin-icono');
    expect(trabajando).not.toContain('is-hueco');
  });

  it('con icono NO se marca: ahí el glifo vive en su hueco', () => {
    expect(pinta({ icon: Send, estado: 'ocupado' })).not.toContain('is-sin-icono');
  });

  /* El botón de una revisión lleva la flecha DETRÁS del rótulo: dice a dónde
     lleva pulsar, y delante diría otra cosa. */
  it('con `alFinal` el glifo va después del rótulo', () => {
    const html = pinta({ icon: Send, estado: 'reposo', alFinal: true });
    expect(html.indexOf('Invitar')).toBeLessThan(html.lastIndexOf('btn-glifo'));
  });

  it('sin `alFinal` el glifo va antes', () => {
    const html = pinta({ icon: Send, estado: 'reposo' });
    expect(html.indexOf('btn-glifo')).toBeLessThan(html.indexOf('Invitar'));
  });

  /* Un formulario lo necesita como `submit`, o el Enter deja de enviar. */
  it('acepta ser el submit de un formulario', () => {
    expect(pinta({ estado: 'reposo', type: 'submit' })).toContain('type="submit"');
  });

  it('deshabilitado por quien lo usa sigue deshabilitado en reposo', () => {
    expect(pinta({ estado: 'reposo', disabled: true })).toContain('disabled');
  });
});
