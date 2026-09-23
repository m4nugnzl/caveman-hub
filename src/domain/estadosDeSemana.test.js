import { describe, expect, it } from 'vitest';

import { estadosDeSemana } from './estadosDeSemana';

/*
  Un cliente dado de alta el lunes 3 de agosto, con la entrega el domingo
  (weekday 6). Hoy es el martes 22 de septiembre: la semana del 21 está en
  curso y todavía no le toca. La del 14 venció el domingo, pero la cola ya
  pregunta por el periodo de hoy (`reviewState`): solo es pendiente si la
  entregó y espera respuesta.
*/
const HOY = '2026-09-22';
const LUNES = ['2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28'];
const semanas = LUNES.map((lunes) => ({
  lunes,
  estado: lunes === '2026-09-21' ? 'hoy' : lunes > '2026-09-21' ? 'futura' : 'pasada',
}));
const cliente = (checkin = { weekday: 6, everyWeeks: 1 }, extra = {}) => ({
  clientProfileId: 'perfil',
  startDate: '2026-08-03',
  preferences: { checkin },
  ...extra,
});
const estados = (r) => r.semanas.map((s) => s.revision5);

describe('estadosDeSemana', () => {
  it('reparte los cinco estados: revisada, sin check-in, pendiente, en curso y futura', () => {
    const r = estadosDeSemana({
      semanas,
      entregas: [
        { weekStart: '2026-08-31', submittedAt: 'x', reviewedAt: 'y' },
        { weekStart: '2026-09-14', submittedAt: 'x', reviewedAt: null },
      ],
      client: cliente(),
      hoy: HOY,
    });
    expect(estados(r)).toEqual(['revisada', 'sin', 'pendiente', 'curso', 'futura']);
    expect(r.aRevisar).toBe('2026-09-14');
    expect(r.porLunes.get('2026-09-14').entregada).toBe(true);
  });

  it('el periodo vigente que llegó a su día sin entregar es pendiente («Sin subir»)', () => {
    const r = estadosDeSemana({ semanas, client: cliente({ weekday: 1, everyWeeks: 1 }), hoy: HOY });
    expect(estados(r)).toEqual(['sin', 'sin', 'sin', 'pendiente', 'futura']);
    expect(r.porLunes.get('2026-09-21').entregada).toBe(false);
  });

  it('pendiente es lo que pide la cola: la entrega sin contestar, aunque sea vieja', () => {
    const r = estadosDeSemana({
      semanas,
      entregas: [
        { weekStart: '2026-09-07', submittedAt: 'x', reviewedAt: null },
        { weekStart: '2026-09-14', submittedAt: 'x', reviewedAt: null },
      ],
      client: cliente(),
      hoy: HOY,
    });
    expect(estados(r).slice(0, 3)).toEqual(['sin', 'pendiente', 'pendiente']);
    expect(r.pendientes).toEqual(['2026-09-14', '2026-09-07']);
    expect(r.porLunes.get('2026-09-14').entregada).toBe(true);
  });

  it('cuenta las entregas sin contestar que caen fuera del plan dibujado', () => {
    const r = estadosDeSemana({
      semanas,
      entregas: [{ weekStart: '2026-08-10', submittedAt: 'x', reviewedAt: null }],
      client: cliente({ weekday: 1, everyWeeks: 1 }),
      hoy: HOY,
    });
    expect(r.pendientes).toEqual(['2026-09-21', '2026-08-10']);
  });

  it('sin cuenta o en pausa no hay nada pendiente, igual que en la cola', () => {
    const entregas = [{ weekStart: '2026-09-14', submittedAt: 'x', reviewedAt: null }];
    const sinCuenta = estadosDeSemana({ semanas, entregas, client: cliente(undefined, { clientProfileId: null }), hoy: HOY });
    const enPausa = estadosDeSemana({ semanas, entregas, client: cliente(undefined, { status: 'paused' }), hoy: HOY });
    expect(sinCuenta.pendientes).toEqual([]);
    expect(enPausa.pendientes).toEqual([]);
    expect(sinCuenta.porLunes.get('2026-09-14').revision5).toBe('sin');
  });

  it('sin día de entrega, solo cuenta lo que entregó', () => {
    const r = estadosDeSemana({ semanas, entregas: [], client: cliente(null), hoy: HOY });
    expect(estados(r)).toEqual(['sin', 'sin', 'sin', 'curso', 'futura']);
    expect(r.aRevisar).toBe(null);
  });

  it('una revisión guardada basta para darla por revisada', () => {
    const r = estadosDeSemana({
      semanas,
      revisiones: [{ weekStart: '2026-09-07' }],
      client: cliente(),
      hoy: HOY,
    });
    expect(r.porLunes.get('2026-09-07').revision5).toBe('revisada');
  });

  it('quincenal: las dos semanas de un periodo llevan un solo estado y van pegadas', () => {
    /* Alta el 3 de agosto: periodos del 31 ago, 14 sep y 28 sep. Hoy, en la
       segunda semana del periodo del 14, que venció el domingo 20. */
    const r = estadosDeSemana({
      semanas,
      entregas: [{ weekStart: '2026-08-31', submittedAt: 'x', reviewedAt: 'y' }],
      client: cliente({ weekday: 6, everyWeeks: 2 }),
      hoy: HOY,
    });
    expect(estados(r)).toEqual(['revisada', 'revisada', 'pendiente', 'pendiente', 'futura']);
    const s21 = r.porLunes.get('2026-09-21');
    expect(s21.periodo).toEqual({ inicio: '2026-09-14', semanas: 2, posicion: 1 });
    expect(r.aRevisar).toBe('2026-09-14');
  });

  it('numera las semanas desde el alta', () => {
    const r = estadosDeSemana({ semanas, client: cliente(), hoy: HOY });
    expect(r.porLunes.get('2026-09-14').numero).toBe(7);
  });
});
