import { describe, expect, it } from 'vitest';

import { MUSCLE_GROUPS } from './training';
import {
  OTHER_GROUP,
  UNSORTED,
  byMuscle,
  cleanEquipment,
  equipmentHeadline,
  forMuscle,
  isUnsorted,
  unsortedCount,
} from './equipment';

/**
 * ══ Lo que estas pruebas defienden ══════════════════════════════════════════
 *
 * Que ninguna foto desaparezca. Es un álbum donde el entrenador sube cuarenta
 * imágenes de golpe: una que no se pinta no la echa en falta nadie hasta que
 * programa un ejercicio que ese gimnasio no tiene, y para entonces ya no hay
 * forma de saber que faltaba.
 *
 * Por eso lo desconocido cae en «Otros» en vez de descartarse, y por eso el
 * grupo vacío no se pinta pero el grupo con algo sí, siempre.
 */

const pieza = (extra) => cleanEquipment({ photoPath: 'c/gym/1.webp', ...extra });

describe('cleanEquipment', () => {
  it('sin foto no hay pieza', () => {
    expect(cleanEquipment({ muscleGroup: 'Pecho' })).toBeNull();
    expect(cleanEquipment({})).toBeNull();
  });

  it('respeta un grupo del catálogo', () => {
    expect(pieza({ muscleGroup: 'Dorsal' }).muscleGroup).toBe('Dorsal');
  });

  /* El caso importante: la base admite cualquier texto y el navegador tiene una
     lista cerrada. Lo que no reconozca NO puede evaporarse. */
  it.each([
    ['Espalda', 'un nombre parecido pero que no está'],
    ['', 'vacío'],
    [undefined, 'sin poner'],
    ['   ', 'espacios'],
  ])('«%s» cae en Otros (%s)', (grupo) => {
    const p = pieza({ muscleGroup: grupo });
    expect(p.muscleGroup).toBe(OTHER_GROUP);
    expect(byMuscle([p])).toHaveLength(1);
  });

  it('«Otros» existe de verdad en el catálogo', () => {
    /* Si dejara de existir, todo lo desconocido caería en un grupo que
       `byMuscle` no recorre y las fotos se perderían en silencio. */
    expect(MUSCLE_GROUPS).toContain(OTHER_GROUP);
  });

  it('un nombre en blanco es null y no una cadena vacía', () => {
    expect(pieza({ name: '  ' }).name).toBeNull();
    expect(pieza({ name: 'Prensa 45°' }).name).toBe('Prensa 45°');
  });

  it('la pieza existe aunque su URL todavía no esté firmada', () => {
    expect(pieza({}).url).toBeNull();
    expect(pieza({}).photoPath).toBe('c/gym/1.webp');
  });
});

describe('byMuscle', () => {
  const lista = [
    cleanEquipment({ photoPath: 'a', muscleGroup: 'Bíceps' }),
    cleanEquipment({ photoPath: 'b', muscleGroup: 'Pecho' }),
    cleanEquipment({ photoPath: 'c', muscleGroup: 'Pecho' }),
  ];

  /* El orden del cuerpo, no el de subida: es el mismo con el que se leen el
     volumen semanal y la analítica. */
  it('ordena por el catálogo y no por cuándo se subió', () => {
    expect(byMuscle(lista).map((t) => t.group)).toEqual(['Pecho', 'Bíceps']);
  });

  it('agrupa sin perder ninguna', () => {
    const total = byMuscle(lista).reduce((n, t) => n + t.items.length, 0);
    expect(total).toBe(lista.length);
  });

  it('los grupos vacíos no se pintan', () => {
    /* Son quince y un gimnasio normal llena seis: enseñarlos todos sería una
       pantalla de titulares sin nada debajo. */
    expect(byMuscle(lista)).toHaveLength(2);
  });

  it('aguanta la lista vacía y la basura', () => {
    expect(byMuscle([])).toEqual([]);
    expect(byMuscle(null)).toEqual([]);
    expect(byMuscle([null, undefined])).toEqual([]);
  });
});

describe('forMuscle', () => {
  it('devuelve solo las de ese grupo', () => {
    const lista = [
      cleanEquipment({ photoPath: 'a', muscleGroup: 'Pecho' }),
      cleanEquipment({ photoPath: 'b', muscleGroup: 'Glúteos' }),
    ];
    expect(forMuscle(lista, 'Pecho').map((p) => p.photoPath)).toEqual(['a']);
    expect(forMuscle(lista, 'Gemelo')).toEqual([]);
  });
});

describe('equipmentHeadline', () => {
  const n = (cuantas, grupo) =>
    Array.from({ length: cuantas }, (_, i) =>
      cleanEquipment({ photoPath: `p${grupo}${i}`, muscleGroup: grupo })
    );

  it.each([
    [[], null, 'sin fotos no se dice nada'],
    [n(1, 'Pecho'), '1 foto', 'una sola'],
    [n(3, 'Pecho'), '3 fotos', 'varias del mismo grupo'],
    [[...n(2, 'Pecho'), ...n(1, 'Dorsal')], '3 fotos en 2 grupos', 'repartidas'],
    [n(4, UNSORTED), '4 fotos sin ordenar', 'recién subidas'],
    [[...n(2, 'Pecho'), ...n(1, UNSORTED)], '3 fotos · 1 sin ordenar', 'lo pendiente manda'],
  ])('%#: «%s» (%s)', (lista, esperado) => {
    expect(equipmentHeadline(lista)).toBe(esperado);
  });
});

describe('la bandeja de lo sin clasificar', () => {
  /*
    Subir y clasificar son dos gestos. Quien está en el gimnasio hace cuarenta
    fotos seguidas; decidir de qué músculo es cada máquina mientras las hace
    convierte una tanda de dos minutos en un formulario de veinte.
  */
  it('lo subido sin grupo se queda pendiente, no cae en «Otros»', () => {
    const p = pieza({ muscleGroup: UNSORTED });
    expect(p.muscleGroup).toBe(UNSORTED);
    expect(p.muscleGroup).not.toBe(OTHER_GROUP);
    expect(isUnsorted(p)).toBe(true);
  });

  /* «Otros» es una DECISIÓN —«esta máquina no es de ningún músculo»— y la
     bandeja es una TAREA. Confundirlas haría que ordenar el gimnasio nunca
     pareciera terminado. */
  it('«Otros» no cuenta como pendiente', () => {
    expect(isUnsorted(pieza({ muscleGroup: OTHER_GROUP }))).toBe(false);
    expect(unsortedCount([pieza({ muscleGroup: OTHER_GROUP })])).toBe(0);
  });

  it('la bandeja se pinta la PRIMERA, delante del cuerpo', () => {
    const lista = [
      cleanEquipment({ photoPath: 'a', muscleGroup: 'Pecho' }),
      cleanEquipment({ photoPath: 'b', muscleGroup: UNSORTED }),
    ];
    expect(byMuscle(lista)[0].group).toBe(UNSORTED);
  });

  it('vacía no se pinta, como cualquier otro grupo', () => {
    const lista = [cleanEquipment({ photoPath: 'a', muscleGroup: 'Pecho' })];
    expect(byMuscle(lista).map((t) => t.group)).not.toContain(UNSORTED);
  });

  it('cuenta lo que queda por ordenar', () => {
    const lista = [
      cleanEquipment({ photoPath: 'a', muscleGroup: UNSORTED }),
      cleanEquipment({ photoPath: 'b', muscleGroup: UNSORTED }),
      cleanEquipment({ photoPath: 'c', muscleGroup: 'Pecho' }),
    ];
    expect(unsortedCount(lista)).toBe(2);
    expect(unsortedCount([])).toBe(0);
    expect(unsortedCount(null)).toBe(0);
  });
});
