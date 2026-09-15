import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { SesionEnCurso } from './SesionEnCurso';

/**
 * EL MODO ENTRENO, en lo que promete.
 *
 * Se prueba con `renderToStaticMarkup` —el único renderizador que hay en la
 * casa— así que lo que se puede mirar es lo que SALE: qué ejercicio se pinta,
 * cómo queda cada serie y si el botón que cierra está disponible. Las tres
 * cosas son reglas, no maquetación:
 *
 *   · Se abre donde iba, no por el principio.
 *   · Una serie hecha es un BOTÓN —se vuelve a abrir— y no una fila muerta.
 *   · No se cierra una serie sin repeticiones: unos kilos que nadie ha
 *     levantado y unos reales tienen que distinguirse en la analítica.
 */
const serie = (valores = {}) => ({ kg: '', reps: '', rir: '', targetReps: '8-10', ...valores });

const EJERCICIOS = [
  {
    id: 'e1',
    name: 'Abs Colgado',
    muscle: 'Abdominales',
    sets: [serie({ kg: '40', reps: '8', rir: '1' }), serie({ kg: '35', reps: '9', rir: '0' })],
  },
  {
    id: 'e2',
    name: 'Aductor',
    muscle: 'Aductor',
    sets: [serie({ kg: '55', reps: '6', rir: '0' }), serie(), serie()],
  },
  { id: 'e3', name: 'Prensa', muscle: 'Cuádriceps', sets: [serie(), serie()] },
];

const pinta = (props = {}) =>
  renderToStaticMarkup(
    <SesionEnCurso exercises={EJERCICIOS} onSetChange={() => {}} showRir {...props} />
  );

describe('SesionEnCurso', () => {
  it('sin ejercicios dice por qué, y no pinta el carril', () => {
    const html = pinta({ exercises: [] });
    expect(html).toContain('Tu entrenador no ha programado ejercicios');
    expect(html).not.toContain('sesion-carril');
  });

  it('abre por el primer ejercicio que tiene series sin registrar', () => {
    const html = pinta();
    /* El primero está entero, así que aterriza en el segundo: donde iba. */
    expect(html).toContain('>Aductor</h4>');
    expect(html).not.toContain('>Abs Colgado</h4>');
    expect(html).toContain('2 de 3');
  });

  it('el carril lleva los ejercicios enteros marcados, y el vivo señalado', () => {
    const html = pinta();
    const carril = html.slice(html.indexOf('sesion-carril'), html.indexOf('sesion-ejercicio'));
    /* Los tres están en el carril aunque solo se pinte uno debajo. */
    expect(carril).toContain('Abs Colgado');
    expect(carril).toContain('Aductor');
    expect(carril).toContain('Prensa');
    expect(carril).toContain('is-entero');
    expect(carril).toContain('aria-pressed="true"');
  });

  it('una serie hecha es un botón que se vuelve a abrir, con sus valores dentro', () => {
    const html = pinta();
    expect(html).toContain('Serie 1, hecha. Tocar para corregir');
    expect(html).toContain('55 kg · 6 reps · RIR 0');
  });

  it('la serie abierta es la primera que falta, y su campo empieza vacío', () => {
    const html = pinta();
    /* La 2 del Aductor: abierta, con el rótulo de la serie y el objetivo. */
    expect(html).toContain('Serie 2</span>');
    expect(html).toContain('objetivo 8-10');
    expect(html).toContain('Serie 2: kilos');
  });

  it('no deja cerrar una serie sin repeticiones', () => {
    expect(pinta()).toContain('disabled=""');
  });

  it('deja cerrar en cuanto hay repeticiones', () => {
    const conReps = [{ ...EJERCICIOS[1], sets: [serie({ kg: '45', reps: '8' })] }];
    const html = pinta({ exercises: conReps });
    /* Aquí la única serie ya está registrada, así que no hay ninguna abierta
       ni botón que deshabilitar: el ejercicio está entero. */
    expect(html).not.toContain('disabled=""');
    expect(html).toContain('Tocar para corregir');
  });

  it('la vez anterior se ofrece como referencia y como atajo', () => {
    const previousSets = new Map([['Aductor#1', { kg: '50', reps: '8', rir: '1' }]]);
    const html = pinta({ previousSets, onConfirmSet: () => {} });
    expect(html).toContain('La vez anterior: 50 kg · 8');
    expect(html).toContain('Repetir');
  });

  it('sin referencia lo dice, y no ofrece repetir nada', () => {
    const html = pinta({ onConfirmSet: () => {} });
    expect(html).toContain('Es la primera vez que haces esta serie');
    expect(html).not.toContain('>Repetir<');
  });

  it('nunca aterriza en un ejercicio entero habiendo uno a medias', () => {
    const html = pinta({
      exercises: [
        { ...EJERCICIOS[0] },
        { id: 'e3', name: 'Prensa', muscle: 'Cuádriceps', sets: [serie()] },
      ],
    });
    expect(html).toContain('>Prensa</h4>');
    /* Y por tanto no hay puerta al siguiente: la hay al TERMINAR uno estando
       en él, que es un estado al que solo se llega tocando (ver `tocar`), y
       este renderizador no toca nada. */
    expect(html).not.toContain('sesion-siguiente');
  });

  it('con todo hecho se queda en el último y no manda a ninguna parte', () => {
    const html = pinta({
      exercises: [{ ...EJERCICIOS[0] }, { ...EJERCICIOS[1], sets: [serie({ kg: '55', reps: '6' })] }],
    });
    expect(html).toContain('>Aductor</h4>');
    expect(html).not.toContain('sesion-siguiente');
  });

  it('el RIR se calla cuando su módulo está apagado', () => {
    const html = pinta({ showRir: false });
    expect(html).not.toContain('RIR');
  });
});
