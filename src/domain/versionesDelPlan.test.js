import { describe, expect, it } from 'vitest';

import { cambiosDeLaVersion, notaDeRestaurar, quienDeLaVersion, versionDeFila, versionesALaVista } from './versionesDelPlan';

const fila = {
  id: 'v1',
  created_at: '2026-09-12T08:00:00Z',
  tocada_en: '2026-09-12T08:10:00Z',
  created_by: 'ana',
  nota: 'Plan de partida',
  fases: [
    { id: 'f1', title: 'Definición', direction: 'cut', ratePct: '0.5', startsOn: '2026-09-01', endsOn: '2026-11-01' },
    { id: 'f2', title: '', direction: 'maintain', ratePct: 0, startsOn: '2026-11-02', endsOn: '2026-11-29' },
  ],
  destino: { fecha: '2026-12-05', titulo: 'Campeonato', kind: 'race', pesoObjetivoKg: 72 },
};

describe('versionDeFila', () => {
  it('lee la foto con las fases en la forma de la app', () => {
    const v = versionDeFila(fila);
    expect(v.tocada).toBe('2026-09-12T08:10:00Z');
    expect(v.fases[0]).toMatchObject({ id: 'f1', ratePct: 0.5, startsOn: '2026-09-01', endsOn: '2026-11-01' });
    expect(v.destino).toEqual({ date: '2026-12-05', title: 'Campeonato', kind: 'race', pesoObjetivoKg: 72 });
    expect(versionDeFila({ ...fila, destino: null }).destino).toBeNull();
  });
});

describe('quienDeLaVersion', () => {
  it('tú, alguien del equipo, u otra persona; sin autor si la sembró la base', () => {
    const v = versionDeFila(fila);
    expect(quienDeLaVersion(v, { yo: 'ana' })).toBe('Tú');
    expect(quienDeLaVersion(v, { yo: 'beto', miembros: [{ profileId: 'ana', name: 'Ana Gil' }] })).toBe('Ana Gil');
    expect(quienDeLaVersion(v, { yo: 'beto' })).toBe('Otra persona del equipo');
    expect(quienDeLaVersion({ ...v, quien: null })).toBe('Sin autor');
  });
});

describe('notaDeRestaurar', () => {
  it('dice de qué día y hora era: el mismo día puede haber varias', () => {
    expect(notaDeRestaurar(versionDeFila(fila))).toMatch(/^Restaurada la del 12 sept?\.?, \d{2}:10$/);
  });
});

describe('cambiosDeLaVersion', () => {
  const v = versionDeFila(fila);
  const igual = { fases: v.fases, destino: v.destino, objetivoKg: 72 };

  it('el mismo plan no tiene cambios', () => {
    expect(cambiosDeLaVersion(v, igual)).toEqual([]);
  });

  it('dice lo de entonces y, entre paréntesis, lo de ahora', () => {
    const ahora = {
      fases: [
        { ...v.fases[0], endsOn: '2026-11-15', ratePct: 0.75 },
        { id: 'f3', title: 'Volumen', direction: 'bulk', ratePct: 0.25, startsOn: '2026-11-16', endsOn: null },
      ],
      destino: { date: '2026-12-19', title: 'Nacional' },
      objetivoKg: 70,
    };
    const t = cambiosDeLaVersion(v, ahora).map((l) => l.texto);
    expect(t[0]).toMatch(/^Definición: acababa el 1 nov\.? \(ahora el 15 nov\.?\); −0,5 %\/sem \(ahora −0,75 %\/sem\)$/);
    expect(t[1]).toMatch(/^Mantenimiento, del 2 nov\.? al 29 nov\.? \(ahora no está\)$/);
    expect(t[2]).toMatch(/^Volumen: no estaba \(ahora del 16 nov\.? en adelante\)$/);
    expect(t[3]).toMatch(/^Destino: Campeonato el 5 dic\.? \(ahora Nacional el 19 dic\.?\)$/);
    expect(t[4]).toBe('Peso objetivo: 72 kg (ahora 70 kg)');
  });

  it('lo que no son fechas ni ritmo también se dice', () => {
    const ahora = { ...igual, fases: [{ ...v.fases[0], replanteos: [{ semana: '2026-10-05', ratePct: 0.25 }], note: 'x' }, v.fases[1]] };
    expect(cambiosDeLaVersion(v, ahora).map((l) => l.texto)).toEqual(['Definición: otros replanteos; otra nota']);
  });

  it('sin destino entonces y con destino ahora, se dice', () => {
    const sin = { ...v, destino: null };
    expect(cambiosDeLaVersion(sin, igual).map((l) => l.texto)).toEqual([expect.stringMatching(/^Sin destino \(ahora Campeonato el 5 dic\.?\)$/)]);
  });
});

describe('versionesALaVista', () => {
  const base = versionDeFila({ ...fila, nota: '' });
  const v = (id, cambios = {}) => ({ ...base, id, ...cambios });
  const otroFinal = { fases: [{ ...base.fases[0], endsOn: '2026-11-08' }, base.fases[1]] };

  it('esconde las que no cambian nada visible respecto a la anterior y no tienen nota', () => {
    /* De la más nueva a la más antigua. */
    const lista = [
      v('ahora', otroFinal),
      v('igual-que-ahora', otroFinal),
      v('con-nota', { ...otroFinal, nota: 'Por el viaje' }),
      v('cambia', otroFinal),
      v('solo-el-tipo', { destino: { ...base.destino, kind: 'photo' } }),
      v('original'),
    ];
    const { visibles, ocultas } = versionesALaVista(lista);
    expect(visibles.map((x) => x.id)).toEqual(['ahora', 'con-nota', 'cambia', 'original']);
    expect(ocultas).toBe(2);
  });

  it('la de ahora y la original, siempre, aunque sean iguales', () => {
    const { visibles, ocultas } = versionesALaVista([v('ahora'), v('en-medio'), v('original')]);
    expect(visibles.map((x) => x.id)).toEqual(['ahora', 'original']);
    expect(ocultas).toBe(1);
    expect(versionesALaVista([v('sola')]).visibles).toHaveLength(1);
    expect(versionesALaVista([])).toEqual({ visibles: [], ocultas: 0 });
  });

  it('el peso objetivo cuenta', () => {
    const lista = [v('ahora'), v('peso', { destino: { ...base.destino, pesoObjetivoKg: 70 } }), v('original')];
    expect(versionesALaVista(lista).ocultas).toBe(0);
  });
});
