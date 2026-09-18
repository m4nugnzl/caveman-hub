import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { PantallaSesion } from './PantallaSesion';
import { CierreDeLaSesion } from '../CierreDeLaSesion';

/**
 * EL MODO ENTRENO Y SU CIERRE, montados.
 *
 * ── Qué atrapa ─────────────────────────────────────────────────────────────
 * Las decisiones de `docs/la-sesion-manda.md` que se pierden sin que falle
 * nada, porque son una propiedad que deja de pasarse o un botón que vuelve a
 * apagarse:
 *
 *   · Un ejercicio a la vez, con el carril nombrándolos todos.
 *   · Una serie hecha es un botón para CORREGIRLA, no una fila muerta.
 *   · El descanso solo existe con pauta — y cuando existe tiene salida.
 *   · El cierre no celebra kilos que no hay.
 *
 * Con `renderToStaticMarkup` y sin DOM, como el resto de las pruebas de
 * componente de la casa: se comprueba qué se pinta con unos datos dados. Lo que
 * un toque desencadena —que «Hecha» abra la siguiente serie— son las cuentas de
 * `sesion.js`, que tienen sus propias pruebas.
 */

const nada = () => {};

const serie = (mas = {}) => ({
  kg: '',
  reps: '',
  rir: '',
  hecha: false,
  pideKg: null,
  pideReps: '8-10',
  antesKg: '80',
  antesReps: '8',
  antesRir: '1',
  onIgual: nada,
  ...mas,
});

const ejercicio = (id, nombre, series, mas = {}) => ({
  id,
  nombre,
  musculo: 'Pecho',
  objetivo: '8-10',
  descanso: null,
  nota: '',
  onNota: null,
  series,
  ...mas,
});

const base = {
  cabecera: { nombre: 'Torso A', hechas: 1, series: 4 },
  ejercicios: [
    ejercicio('e1', 'Press banca', [serie({ kg: '80', reps: '8', hecha: true }), serie()]),
    ejercicio('e2', 'Remo con barra', [serie()]),
    ejercicio('e3', 'Elevaciones laterales', [serie({ kg: '10', reps: '12', hecha: true })]),
  ],
  showRir: false,
  activo: 0,
  onIr: nada,
  descanso: null,
  onSumarDescanso: nada,
  onSaltarDescanso: nada,
  onCampo: nada,
  onCerrarSerie: () => true,
  onFicha: nada,
  onSalir: nada,
  onAcabar: nada,
  guardado: null,
};

const pinta = (mas = {}) => renderToStaticMarkup(<PantallaSesion datos={{ ...base, ...mas }} />);

describe('PantallaSesion — moverse', () => {
  it('pinta un ejercicio a la vez', () => {
    const html = pinta();
    expect(html).toContain('Kilos de la serie 2 de Press banca');
    /* Los demás se nombran en el carril, pero sus campos no están. */
    expect(html).not.toContain('de Remo con barra"');
    expect(html.match(/tel-ses-viva"/g)).toHaveLength(1);
  });

  it('el carril nombra todos, enciende el tuyo y marca los terminados', () => {
    const html = pinta({ activo: 1 });
    expect(html).toContain('Press banca');
    expect(html).toContain('Elevaciones laterales');
    expect(html.match(/aria-current="step"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-current="step"[^>]*>Remo con barra/);
    /* Elevaciones está terminado: lleva su visto en el carril. */
    expect(html).toMatch(/tel-ok"[^>]*><svg[^>]*aria-label="terminado"[^>]*>.*?<\/svg>Elevaciones laterales/);
  });

  it('dice en cuál estás y el pie ofrece el siguiente — y en el último, terminar', () => {
    const primero = pinta({ activo: 0 });
    expect(primero).toContain('1 de 3');
    expect(primero).toContain('Siguiente ›');

    const ultimo = pinta({ activo: 2 });
    expect(ultimo).toContain('3 de 3');
    expect(ultimo).toContain('Terminar ›');
  });

  it('un índice que se sale del array no deja la pantalla en blanco', () => {
    /* Pasa de verdad: su entrenador quita ejercicios con la pantalla abierta. */
    expect(pinta({ activo: 9 })).toContain('3 de 3');
  });
});

describe('PantallaSesion — rellenar y corregir', () => {
  it('la serie viva tiene − y + por campo, lo de la vez anterior y «Registrar serie»', () => {
    const html = pinta();
    expect(html).toContain('aria-label="Bajar Kilos de la serie 2"');
    expect(html).toContain('aria-label="Subir Repeticiones de la serie 2"');
    expect(html).toContain('Última vez: <b>80 kg · 8</b>');
    expect(html).toContain('= Igual');
    expect(html).toContain('>Registrar serie</button>');
  });

  it('una serie hecha es un botón para corregirla, con sus valores dentro', () => {
    const html = pinta();
    expect(html).toContain('aria-label="Corregir la serie 1: 80 kg · 8"');
    expect(html).toContain('>Corregir<');
  });

  it('el RIR solo sale con su módulo', () => {
    expect(pinta()).not.toContain('RIR de la serie');
    const conRir = pinta({ showRir: true });
    expect(conRir).toContain('aria-label="RIR de la serie 2 de Press banca"');
    expect(conRir).toContain('Última vez: <b>80 kg · 8 · RIR 1</b>');
  });

  it('sin vez anterior ni pauta que sea un número, no hay nada que cerrar', () => {
    const html = pinta({
      ejercicios: [
        ejercicio('e1', 'Nuevo', [serie({ antesKg: null, antesReps: null, antesRir: null, pideReps: '8-10', onIgual: null })]),
      ],
      cabecera: { nombre: 'Torso A', hechas: 0, series: 1 },
    });
    expect(html).toMatch(/disabled=""[^>]*>Registrar serie/);
    expect(html).toContain('Es la primera vez que haces esta serie');
  });

  it('con todo el ejercicio hecho, lo siguiente es una puerta con nombre', () => {
    const html = pinta({
      ejercicios: [
        ejercicio('e1', 'Press banca', [serie({ kg: '80', reps: '8', hecha: true })]),
        ejercicio('e2', 'Remo con barra', [serie()]),
      ],
    });
    expect(html).toContain('tel-ses-fin');
    expect(html).toMatch(/Hecho<\/span><span class="tel-ses-fin-n">Remo con barra/);
  });
});

describe('PantallaSesion — el descanso y lo guardado', () => {
  it('sin descanso pautado no hay cuenta atrás: es la decisión del dueño', () => {
    const html = pinta({ descanso: null });
    expect(html).not.toContain('tel-reposo');
    expect(html).not.toContain('role="timer"');
  });

  it('con pauta, toma la pantalla: lo que queda, lo que viene y las tres salidas', () => {
    const html = pinta({ descanso: { restante: 103, total: 120, fin: 1 } });
    expect(html).toContain('role="dialog"');
    expect(html).toContain('1:43');
    expect(html).toContain('Descanso · pautado 2:00');
    expect(html).toContain('Press banca · serie 2');
    expect(html).toContain('+30 s');
    expect(html).toContain('Saltar');
    expect(html).toContain('Volver a la hoja');
  });

  it('el pie dice lo guardado, y sin conexión no es un fallo', () => {
    expect(pinta({ guardado: { status: 'saved' } })).toContain('Guardado ✓');
    expect(pinta({ guardado: { status: 'pending' } })).toContain('Sin conexión · se enviará');
    const error = pinta({ guardado: { status: 'error', onRetry: nada } });
    expect(error).toContain('No se guardó');
    expect(error).toContain('Reintentar');
  });
});

describe('CierreDeLaSesion', () => {
  const cierre = {
    nombre: 'Legs A',
    tonelaje: 4820,
    series: 21,
    minutos: 58,
    records: [{ nombre: 'Prensa', serie: '180 kg · 8', mejora: '+10 kg' }],
    ejercicios: [{ nombre: 'Prensa', series: 4, kg: 2160 }],
    preguntas: [],
    respuestas: {},
    onRespuesta: nada,
    nota: '',
    onNota: null,
    onTerminar: nada,
    onVolver: nada,
  };
  const cierreDe = (mas = {}) => renderToStaticMarkup(<CierreDeLaSesion datos={{ ...cierre, ...mas }} />);

  it('dice lo levantado, los récords y lo hecho ejercicio a ejercicio', () => {
    const html = cierreDe();
    expect(html).toContain('4.820');
    expect(html).toContain('kg levantados');
    expect(html).toContain('21 series · 58 min · 1 récord');
    expect(html).toContain('Prensa · 180 kg · 8');
    expect(html).toContain('+10 kg');
    expect(html).toContain('4 series · 2.160 kg');
  });

  it('sin carga no celebra «0 kg»: la cifra grande son las series', () => {
    const html = cierreDe({ tonelaje: 0, records: [] });
    expect(html).not.toContain('kg levantados');
    expect(html).toMatch(/fin-sesion-cifra">21<small>series/);
  });

  it('el verbo es el de la cabecera, y se puede volver', () => {
    const html = cierreDe();
    expect(html).toContain('Terminar la sesión');
    expect(html).not.toContain('Mandar a tu entrenador');
    expect(html).toContain('Volver a la sesión');
  });

  it('sin preguntas ni módulo de notas, no hay formulario vacío', () => {
    const html = cierreDe();
    expect(html).not.toContain('¿Cómo lo has llevado?');
    expect(html).not.toContain('Tu cuaderno');
  });
});
