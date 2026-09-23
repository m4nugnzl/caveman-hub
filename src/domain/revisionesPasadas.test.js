import { describe, expect, it } from 'vitest';

import {
  MARGEN_SEMANAS,
  anadidoDespues,
  estadoDeRevision,
  puedeTocarLaSemana,
  revisionesPasadas,
} from './revisionesPasadas';

/* Miércoles 23 sep 2026. Revisión el domingo (weekday 6), semanal. */
const HOY = '2026-09-23';
const ALTA = '2026-06-01';
const semanal = { checkin: { weekday: 6, everyWeeks: 1 } };
const quincenal = { checkin: { weekday: 6, everyWeeks: 2 } };

const estado = (lunes, entregas = [], preferences = semanal) =>
  estadoDeRevision({ lunes, entregas, preferences, startDate: ALTA, hoy: HOY });

describe('estadoDeRevision', () => {
  it('la de la ventana de gracia es la pendiente del camino normal, no una pasada', () => {
    const e = estado('2026-09-14');
    expect(e.estado).toBe('pendiente');
    expect(e.enCurso).toBe(true);
    expect(e.completable).toBe(false);
  });

  it('una sin entregar dentro del margen se puede completar, y dice hasta cuándo', () => {
    const e = estado('2026-09-07');
    expect(e.estado).toBe('sin entregar');
    expect(e.completable).toBe(true);
    expect(e.motivo).toBeNull();
    /* Sale del margen cuando el lunes de hoy la deja cinco semanas atrás. */
    expect(e.hasta).toBe('2026-10-11');
  });

  it('el margen son cuatro semanas desde la semana en curso', () => {
    expect(MARGEN_SEMANAS).toBe(4);
    expect(estado('2026-08-24').completable).toBe(true);
    const fuera = estado('2026-08-17');
    expect(fuera.completable).toBe(false);
    expect(fuera.motivo).toBe('Fuera de plazo');
  });

  it('revisada, cerrada sin excepciones — también dentro del margen', () => {
    const revisada = estado('2026-09-07', [
      { weekStart: '2026-09-07', submittedAt: '2026-09-13T18:00:00Z', reviewedAt: '2026-09-14T09:00:00Z' },
    ]);
    expect(revisada.estado).toBe('cerrada');
    expect(revisada.editable).toBe(false);
    expect(revisada.motivo).toBe('Revisada por tu entrenador');

    /* Cerrada por su entrenador sin que la entregara: se dice distinto. */
    const cerrada = estado('2026-09-07', [{ weekStart: '2026-09-07', submittedAt: null, reviewedAt: '2026-09-14T09:00:00Z' }]);
    expect(cerrada.motivo).toBe('Cerrada por tu entrenador');
  });

  it('entregada y sin revisar: se puede corregir', () => {
    const e = estado('2026-09-07', [{ weekStart: '2026-09-07', submittedAt: '2026-09-22T10:00:00Z', reviewedAt: null }]);
    expect(e.estado).toBe('entregada');
    expect(e.completable).toBe(true);
  });

  it('la reapertura del entrenador abre una fuera de plazo hasta su fecha', () => {
    const e = estado('2026-08-10', [{ weekStart: '2026-08-10', abiertaHasta: '2026-09-30' }]);
    expect(e.completable).toBe(true);
    expect(e.hasta).toBe('2026-09-30');
    /* Caducada, vuelve a estar fuera de plazo. */
    expect(estado('2026-08-10', [{ weekStart: '2026-08-10', abiertaHasta: '2026-09-20' }]).completable).toBe(false);
  });

  it('el periodo en curso siempre admite pesajes, aunque esté revisado', () => {
    const e = estado('2026-09-21', [{ weekStart: '2026-09-21', submittedAt: '2026-09-21T08:00:00Z', reviewedAt: '2026-09-22T08:00:00Z' }]);
    expect(e.estado).toBe('cerrada');
    expect(e.editable).toBe(true);
    expect(e.completable).toBe(false);
  });

  it('cómo llegó: dos días tarde en la ventana de gracia, o recuperada después', () => {
    const gracia = estado('2026-09-07', [{ weekStart: '2026-09-07', submittedAt: '2026-09-15T10:00:00Z' }]);
    expect(gracia.tarde).toEqual({ tipo: 'gracia', dias: 2, el: '2026-09-15' });

    const recuperada = estado('2026-09-07', [{ weekStart: '2026-09-07', submittedAt: '2026-09-22T10:00:00Z' }]);
    expect(recuperada.tarde).toEqual({ tipo: 'recuperada', dias: 9, el: '2026-09-22' });

    const aTiempo = estado('2026-09-07', [{ weekStart: '2026-09-07', submittedAt: '2026-09-13T20:00:00Z' }]);
    expect(aTiempo.tarde).toBeNull();
  });

  it('quincenal: la segunda semana es del mismo periodo', () => {
    /* Desde el 1 jun, el periodo en curso empieza el 21 sep y el anterior
       (en su ventana de gracia) el 7. El 24 ago es una pasada, y su segunda
       semana —el 31— es la misma revisión. */
    const e = estado('2026-08-31', [], quincenal);
    expect(e.lunes).toBe('2026-08-24');
    expect(e.semanas).toBe(2);
    expect(e.completable).toBe(true);
  });

  it('sin día de revisión no hay revisión', () => {
    expect(estado('2026-09-07', [], {})).toBeNull();
  });
});

describe('revisionesPasadas', () => {
  it('ofrece las del margen aunque no tengan nada, sin la de la ventana de gracia', () => {
    const lista = revisionesPasadas({ entregas: [], preferences: semanal, startDate: ALTA, hoy: HOY });
    expect(lista.map((r) => r.lunes)).toEqual(['2026-09-07', '2026-08-31', '2026-08-24']);
  });

  it('y las más viejas solo si tienen fila', () => {
    const lista = revisionesPasadas({
      entregas: [{ weekStart: '2026-07-06', submittedAt: '2026-07-12T10:00:00Z', reviewedAt: '2026-07-13T10:00:00Z' }],
      preferences: semanal,
      startDate: ALTA,
      hoy: HOY,
    });
    expect(lista.map((r) => r.lunes)).toContain('2026-07-06');
    expect(lista.find((r) => r.lunes === '2026-07-06').motivo).toBe('Revisada por tu entrenador');
  });

  it('no inventa revisiones antes del alta', () => {
    const lista = revisionesPasadas({ entregas: [], preferences: semanal, startDate: '2026-09-07', hoy: HOY });
    expect(lista.map((r) => r.lunes)).toEqual(['2026-09-07']);
  });
});

describe('puedeTocarLaSemana', () => {
  const entregas = [{ weekStart: '2026-09-07', submittedAt: '2026-09-13T18:00:00Z', reviewedAt: '2026-09-14T09:00:00Z' }];
  const puede = (fecha) => puedeTocarLaSemana({ fecha, entregas, preferences: semanal, startDate: ALTA, hoy: HOY });

  it('hoy sí, una revisada no, el futuro no, fuera de plazo no', () => {
    expect(puede(HOY)).toBe(true);
    expect(puede('2026-09-16')).toBe(true);
    expect(puede('2026-09-09')).toBe(false);
    expect(puede('2026-09-25')).toBe(false);
    expect(puede('2026-08-12')).toBe(false);
  });
});

describe('anadidoDespues', () => {
  const revision = estado('2026-09-07', [{ weekStart: '2026-09-07', submittedAt: '2026-09-22T10:00:00Z' }]);
  const semanaDe = (h) => (h.semana ? h.semana : h.date.slice(0, 10) >= '2026-09-07' && h.date < '2026-09-14' ? '2026-09-07' : 'otra');

  it('saca lo apuntado cuando la ventana ya se había cerrado, y lo de después de entregar', () => {
    const lista = anadidoDespues({
      revision,
      finDeVentana: '2026-09-20',
      semanaDe,
      history: [
        { id: 'a', date: '2026-09-08', weight: 70, apuntadoEl: '2026-09-08T07:00:00Z' },
        { id: 'b', date: '2026-09-10', weight: 70.2, apuntadoEl: '2026-09-21T07:00:00Z' },
        { id: 'c', date: '2026-09-11', weight: 70.1, apuntadoEl: '2026-09-22T12:00:00Z' },
        { id: 'd', date: '2026-09-12', weight: 70.3 },
      ],
      fotos: [{ id: 'f1', lunes: '2026-09-07', creadaEl: '2026-09-21T09:00:00Z', angle: 'frontal' }],
    });
    expect(lista.map((x) => [x.id, x.porque])).toEqual([
      ['h-b', 'fuera de plazo'],
      ['f-f1', 'fuera de plazo'],
      ['h-c', 'tras entregar'],
    ]);
  });
});
