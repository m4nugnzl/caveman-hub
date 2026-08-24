import { readFileSync } from 'node:fs';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { parseRoutineSheet } from '@/domain/routineSheet';
import { RoutinePreview, SheetPicker, toEditableDays } from './PasteRoutineDialog';

/**
 * ══ Qué protege este archivo ═══════════════════════════════════════════════
 *
 * Que lo que se enseña antes de importar sea lo que se va a importar, y que se
 * pueda corregir. El parser tiene sus pruebas y son buenas; lo que ninguna de
 * ellas ve es la tabla, que es donde una errata no la detecta ni el linter ni el
 * compilador: una columna cambiada de sitio o un objetivo que se pinta siempre
 * el de la primera serie pasan `npm run check` sin despeinarse y convierten la
 * previsualización en un adorno que miente.
 *
 * Con `renderToString` y sin jsdom, igual que `AppContext.test.jsx`: aquí no
 * hace falta pulsar nada, solo comprobar qué sale pintado.
 */

const hoja = (nombre) =>
  readFileSync(new URL(`../../../domain/__fixtures__/${nombre}`, import.meta.url), 'utf8');

/*
  React intercala `<!-- -->` entre trozos de texto para poder reconstruirlos al
  hidratar. Es ruido del renderizador, no del componente, y buscar frases con él
  dentro haría que estas pruebas fallaran por dónde parte React una cadena.
*/
const pintar = (dias) =>
  renderToString(
    <RoutinePreview
      days={dias}
      onRenameDay={() => {}}
      onRemoveDay={() => {}}
      onChangeExercise={() => {}}
      onRemoveExercise={() => {}}
    />
  ).replaceAll('<!-- -->', '');

const leer = (nombre, targetIndex = 0) =>
  toEditableDays(parseRoutineSheet(hoja(nombre)).days, targetIndex);

describe('RoutinePreview', () => {
  const dias = leer('rutina-mesociclo-5-dias.tsv');

  it('pinta los cinco días con su nombre editable', () => {
    const html = pintar(dias);
    for (const nombre of ['TIRÓN', 'EMPUJE', 'PIERNA A', 'TORSO', 'PIERNA B']) {
      expect(html).toContain(`value="${nombre}"`);
    }
    expect(html).toContain('Día 1 de 5');
    expect(html).toContain('Día 5 de 5');
  });

  it('cada día dice cuánto trae, que es lo que hace legible el botón de crear', () => {
    /* Sin esto, un botón que dice «Crear 5 días» después de elegir cuatro hojas
       parece un error; con el recuento por día se ve que una hoja traía dos. */
    const html = pintar(dias);
    expect(html).toContain('6 ejercicios · 14 series');
    expect(html).toContain('7 ejercicios · 16 series');
  });

  it('pinta cada ejercicio con sus series, su objetivo y su RIR, y todo editable', () => {
    const html = pintar(dias);
    expect(html).toContain('CURL DE BÍCEPS EN POLEA CON BARRA');
    expect(html).toContain('value="8-10"');
    expect(html).toContain('value="3"');
    /* La indicación del entrenador viaja hasta la tabla. */
    expect(html).toContain('Rir 1 primera serie');
  });

  it('la columna de objetivo obedece a la que se haya elegido', () => {
    expect(pintar(leer('rutina-mesociclo-5-dias.tsv', 0))).toContain('value="8-10"');
    expect(pintar(leer('rutina-mesociclo-5-dias.tsv', 1))).toContain('value="10-12"');
  });

  it('el músculo sale seleccionado', () => {
    const html = pintar(dias);
    /* React marca la opción elegida de un `select` controlado en el servidor. */
    expect(html).toContain('value="Bíceps" selected=""');
    expect(html).toContain('value="Dorsal" selected=""');
  });

  it('un objetivo distinto por serie se dice entero y sin repetirse', () => {
    const html = pintar(leer('rutina-sesiones-apiladas.tsv'));
    expect(html).toContain('value="6-8 · 8-10"');
    expect(html).toContain('Deltoides Posterior Polea');
  });

  it('todo lo que se puede quitar tiene su botón', () => {
    const html = pintar(dias);
    expect(html.match(/Quitar día/g)).toHaveLength(5);
    expect(html).toContain('aria-label="Quitar CURL DE BÍCEPS EN POLEA CON BARRA"');
  });

  it('avisa de lo que la hoja decía cuando el músculo no se ha podido traducir', () => {
    const dudosos = toEditableDays(
      parseRoutineSheet('Grupo muscular\tEjercicio\tSeries\tReps\nHombros\tPress militar\t4\t8-10').days
    );
    expect(pintar(dudosos)).toContain('tu hoja decía «Hombros»');
  });

  it('sin días no pinta nada, y no revienta', () => {
    expect(pintar([])).toBe('');
  });
});

describe('toEditableDays', () => {
  it('le pone nombre al día que no lo traía', () => {
    const dias = toEditableDays(parseRoutineSheet('Ejercicio\tSeries\nPress banca\t4').days);
    expect(dias[0].name).toBe('Día 1');
  });

  it('da identidad propia a cada día y a cada ejercicio', () => {
    /*
      Es lo que hace que quitar el segundo día no corra las correcciones del
      tercero: sin identidad, las ediciones se guardaban por posición y al borrar
      algo pasaban a aplicarse a quien ocupara ese sitio.
    */
    const dias = leer('rutina-mesociclo-5-dias.tsv');
    const ids = [...dias.map((d) => d.id), ...dias.flatMap((d) => d.exercises.map((e) => e.id))];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('conserva el objetivo por serie en vez de aplanarlo', () => {
    const dias = leer('rutina-sesiones-apiladas.tsv');
    expect(dias[0].exercises[0].targets).toEqual(['6-8', '8-10']);
  });
});

describe('SheetPicker', () => {
  /*
    Un libro de entrenamiento real trae quince pestañas y solo una o cuatro son
    la rutina. Si la lista no dice qué hay dentro de cada una, hay que abrirlas
    de una en una para averiguarlo — que es exactamente el trabajo que esto
    viene a quitar.
  */
  const hojas = [
    { name: 'Panel de Control', lectura: parseRoutineSheet('') },
    { name: 'Día 1', lectura: parseRoutineSheet('Ejercicio\tSeries\tReps\nPress banca\t4\t8-10') },
    {
      name: 'Plan de 5 días',
      lectura: parseRoutineSheet(hoja('rutina-mesociclo-5-dias.tsv')),
    },
    {
      name: 'Plan viejo',
      hidden: true,
      lectura: parseRoutineSheet('Ejercicio\tSeries\tReps\nSentadilla\t5\t5'),
    },
  ];

  const html = renderToString(
    <SheetPicker hojas={hojas} elegidas={[1, 2]} onToggle={() => {}} />
  ).replaceAll('<!-- -->', '');

  it('dice de cada pestaña qué trae dentro', () => {
    expect(html).toContain('Panel de Control');
    expect(html).toContain('nada que se parezca a una rutina');
    expect(html).toContain('1 día · 1 ejercicios');
    expect(html).toContain('5 días · 33 ejercicios');
  });

  it('una hoja oculta se ofrece igual, diciendo que lo está', () => {
    /* En un libro real nueve de quince están ocultas, y una se llama «Plan de
       Entrenamiento». Esconderlas aquí también dejaría sin forma de traerla. */
    expect(html).toContain('Plan viejo');
    expect(html).toContain('oculta en Excel');
  });

  it('deja marcar varias, y no deja marcar las que no traen rutina', () => {
    /* Dos marcadas y la vacía deshabilitada: dos `checked` y un `disabled`. */
    expect(html.match(/checked=""/g)).toHaveLength(2);
    expect(html.match(/disabled=""/g)).toHaveLength(1);
  });
});
