import { describe, expect, it } from 'vitest';

import {
  activeConditions,
  catalogFor,
  cleanCondition,
  conditionsFor,
  conditionsHeadline,
  resolvedConditions,
} from './conditions';

/**
 * ══ Lo que estas pruebas defienden ══════════════════════════════════════════
 *
 * Un condicionante que no aparece donde tiene que aparecer es peor que no
 * haberlo apuntado: quien lo escribió da por hecho que la aplicación se lo va a
 * recordar, y deja de recordarlo él. Así que lo que hay que blindar no es el
 * formato, es el REPARTO — qué se ve en la rutina, qué en la dieta y qué en las
 * dos.
 */

const c = (extra) => cleanCondition({ label: 'Algo', ...extra });

describe('conditionsFor', () => {
  const lista = [
    c({ label: 'Hernia lumbar', area: 'training' }),
    c({ label: 'Celiaquía', area: 'nutrition' }),
    c({ label: 'Diabetes', area: 'both' }),
  ];

  it('la rutina ve los suyos y los de las dos áreas', () => {
    expect(conditionsFor(lista, 'training').map((x) => x.label)).toEqual(['Diabetes', 'Hernia lumbar']);
  });

  it('la dieta ve los suyos y los de las dos áreas', () => {
    expect(conditionsFor(lista, 'nutrition').map((x) => x.label)).toEqual(['Celiaquía', 'Diabetes']);
  });

  /* El caso que justifica que `both` exista: apuntada UNA vez, sale en las DOS.
     Con dos filas separadas habría que acordarse de resolverlas a la vez. */
  it('lo de «las dos cosas» se apunta una vez y sale dos veces', () => {
    const enLasDos = ['training', 'nutrition'].every((area) =>
      conditionsFor(lista, area).some((x) => x.label === 'Diabetes')
    );
    expect(enLasDos).toBe(true);
  });

  it('lo resuelto deja de avisar', () => {
    const curada = [...lista, c({ label: 'Rotura fibrilar', area: 'training', resolvedAt: '2026-01-10' })];
    expect(conditionsFor(curada, 'training').map((x) => x.label)).not.toContain('Rotura fibrilar');
  });

  /* La lista se corta en la cabecera de la rutina. Si el orden fuera el de
     creación, lo único que NO se puede hacer podría quedar escondido detrás de
     tres cosas que solo hay que tener en cuenta. */
  it('los vetos van delante de los avisos', () => {
    const mezcla = [
      c({ label: 'Aviso', area: 'training', severity: 'note' }),
      c({ label: 'Veto', area: 'training', severity: 'block' }),
    ];
    expect(conditionsFor(mezcla, 'training').map((x) => x.severity)).toEqual(['block', 'note']);
  });

  it('sin condicionantes devuelve una lista vacía, no revienta', () => {
    expect(conditionsFor(null, 'training')).toEqual([]);
    expect(conditionsFor([null, undefined], 'training')).toEqual([]);
  });
});

describe('cleanCondition', () => {
  it('sin etiqueta no hay condicionante', () => {
    expect(cleanCondition({ label: '   ' })).toBeNull();
    expect(cleanCondition({})).toBeNull();
  });

  /* Un área inventada dejaría el condicionante invisible en las DOS secciones:
     ni en rutina ni en dieta, sin error y sin hueco. Es la peor forma de perder
     un dato de salud, así que cae donde al menos se ve. */
  it('un área desconocida cae en entrenamiento, no en la nada', () => {
    const limpio = cleanCondition({ label: 'X', area: 'cosmos' });
    expect(limpio.area).toBe('training');
    expect(conditionsFor([limpio], 'training')).toHaveLength(1);
  });

  it('una gravedad desconocida cae en aviso', () => {
    expect(cleanCondition({ label: 'X', severity: 'catastrófico' }).severity).toBe('note');
  });

  it('recorta la etiqueta al tope de la base de datos', () => {
    expect(cleanCondition({ label: 'a'.repeat(400) }).label).toHaveLength(120);
  });

  it('un detalle en blanco es null y no una cadena vacía', () => {
    expect(cleanCondition({ label: 'X', detail: '   ' }).detail).toBeNull();
  });

  it('las fechas se normalizan a ISO y lo ilegible se descarta', () => {
    expect(cleanCondition({ label: 'X', since: '2026-03-04T10:00:00Z' }).since).toBe('2026-03-04');
    expect(cleanCondition({ label: 'X', since: 'ayer' }).since).toBeNull();
  });
});

describe('catalogFor', () => {
  it('la rutina no sugiere celiaquía', () => {
    expect(catalogFor('training').map((x) => x.label)).not.toContain('Celiaquía');
  });

  it('las dos áreas ven lo que les afecta a las dos', () => {
    for (const area of ['training', 'nutrition']) {
      expect(catalogFor(area).map((x) => x.label)).toContain('Diabetes');
    }
  });

  it('no sugiere lo que ya está apuntado', () => {
    const puestos = [c({ label: 'diabetes  ', area: 'both' })];
    expect(catalogFor('training', puestos).map((x) => x.label)).not.toContain('Diabetes');
  });
});

describe('activeConditions y resolvedConditions', () => {
  const lista = [
    c({ label: 'Vigente', area: 'training' }),
    c({ label: 'Vieja', area: 'training', resolvedAt: '2025-04-01' }),
    c({ label: 'Reciente', area: 'training', resolvedAt: '2026-02-01' }),
  ];

  it('parten la lista en dos sin perder a nadie', () => {
    expect(activeConditions(lista).map((x) => x.label)).toEqual(['Vigente']);
    expect(resolvedConditions(lista).map((x) => x.label)).toEqual(['Reciente', 'Vieja']);
  });
});

describe('conditionsHeadline', () => {
  const nota = (n) => Array.from({ length: n }, () => c({ severity: 'note' }));
  const veto = (n) => Array.from({ length: n }, () => c({ severity: 'block' }));

  it.each([
    [[], null, 'sin nada no se dice nada'],
    [nota(1), '1 cosa a tener en cuenta', 'singular'],
    [nota(3), '3 cosas a tener en cuenta', 'plural'],
    [veto(1), '1 cosa que no puede hacer', 'un veto'],
    [veto(2), '2 cosas que no puede hacer', 'solo vetos'],
    [[...veto(1), ...nota(2)], '1 que no puede hacer y 2 a tener en cuenta', 'mezcla'],
  ])('%#: %s (%s)', (lista, esperado) => {
    expect(conditionsHeadline(lista)).toBe(esperado);
  });
});
