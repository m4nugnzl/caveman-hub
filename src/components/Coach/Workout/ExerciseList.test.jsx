import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { ExerciseList } from './ExerciseList';

/**
 * ══ Qué protege este archivo ═══════════════════════════════════════════════
 *
 * La lista REGISTRANDO, que es la pantalla donde el cliente pasa su hora de
 * gimnasio. Tres cosas que no se ven en ningún tipo ni en ningún linter y que
 * se rompen con un `null` mal puesto:
 *
 *   1. Que una serie hecha se pueda DESHACER. El ✓ que repite la vez anterior
 *      se pulsa sin querer —se rellena de pie y con una mano— y la marca de la
 *      serie hecha es el camino de vuelta. Si ese botón vuelve a ser un rótulo,
 *      corregir una equivocación es volver a borrar tres casillas a mano con el
 *      teclado tapando la fila, y nada avisa de que ha pasado.
 *   2. Que el recorrido de los campos sea la SESIÓN (`set-flow`) y que cada
 *      ficha tenga su ancla (`ej-…`): son las dos piezas de las que cuelgan el
 *      Enter encadenado y el índice de ejercicios. Las dos son cadenas de texto
 *      —clase y `id`— así que un renombrado las deja sin efecto en silencio.
 *   3. Que el DESCANSO solo se diga si lo pauta el entrenador. Es la regla
 *      entera de esa pieza: quien no pauta descansos no tiene que ver ninguno,
 *      ni escrito en la hoja ni contando hacia atrás.
 *
 * Con `renderToStaticMarkup` y sin jsdom, como el resto de las pruebas de vista
 * de la casa: aquí no hace falta pulsar nada, solo comprobar qué sale pintado.
 */

const ejercicio = (extra = {}) => ({
  id: 'ex1',
  name: 'Press banca',
  muscle: 'pecho',
  sets: [
    { kg: '100', reps: '8', rir: '2', targetReps: '6-8' },
    { kg: '', reps: '', rir: '', targetReps: '6-8' },
  ],
  ...extra,
});

const registrando = (props = {}) =>
  renderToStaticMarkup(
    <ExerciseList
      exercises={[ejercicio()]}
      canEditStructure={false}
      onSetChange={() => {}}
      {...props}
    />
  );

describe('ExerciseList — el cliente registrando', () => {
  it('la serie hecha se puede borrar para corregirla', () => {
    const html = registrando({ onClearSet: () => {} });
    expect(html).toContain('Press banca, serie 1: borrar lo apuntado y corregirlo');
  });

  it('sin el gesto de borrar, la marca es un rótulo y no promete nada', () => {
    const html = registrando();
    expect(html).not.toContain('borrar lo apuntado');
    /* La serie vacía tampoco: sin vez anterior no hay nada que repetir. */
    expect(html).not.toContain('apuntar lo mismo que la vez anterior');
  });

  it('la serie vacía ofrece repetir la vez anterior, la hecha no', () => {
    const html = registrando({
      onConfirmSet: () => {},
      onClearSet: () => {},
      previousSets: new Map([['Press banca#1', { kg: '95', reps: '8', weekNumber: 3 }]]),
    });
    expect(html).toContain('Press banca, serie 2: apuntar lo mismo que la vez anterior, 95 kg por 8');
    expect(html).toContain('Press banca, serie 1: borrar lo apuntado y corregirlo');
  });

  it('el recorrido de los campos es la sesión, y cada ficha lleva su ancla', () => {
    const html = registrando();
    expect(html).toContain('set-flow');
    expect(html).toContain('id="ej-ex1"');
  });

  it('programando no hay ni recorrido ni anclas: son de quien registra', () => {
    const html = renderToStaticMarkup(
      <ExerciseList
        exercises={[ejercicio()]}
        onSetChange={() => {}}
        onAddSet={() => {}}
        onRemoveSet={() => {}}
        onMove={() => {}}
        onRemove={() => {}}
      />
    );
    expect(html).not.toContain('set-flow');
    expect(html).not.toContain('id="ej-ex1"');
  });

  it('el descanso se dice solo si lo ha pautado el entrenador', () => {
    expect(registrando({ exercises: [ejercicio({ restSeconds: 90 })] })).toContain('descanso 90 s');
    expect(registrando()).not.toContain('descanso');
  });
});
