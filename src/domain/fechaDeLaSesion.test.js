import { describe, expect, it } from 'vitest';
import {
  apuntadaDespues,
  conFechaDeSesion,
  diaPorDefecto,
  diaElegible,
  diasConOtraSesion,
  estadoDeLaSesion,
  limitesDeLaAparicion,
  limitesDeLaSesion,
  mesDe,
  porQueNoSeEscribe,
  porQueNoSeMueve,
  semanasDelMes,
} from './fechaDeLaSesion';

const micros = [
  { weekNumber: 1, date: '2026-08-31', sessions: [{ id: 'a', dayName: 'Pierna', date: '2026-09-02' }, { id: 'b', dayName: 'Torso', date: '2026-09-09' }] },
  { weekNumber: 2, date: '2026-09-07', sessions: [{ id: 'c', dayName: 'Pierna', date: '2026-09-12' }] },
  { weekNumber: 3, date: '2026-09-14', sessions: [{ id: 'd', dayName: 'Pierna', date: '2026-09-20' }, { id: 'e', dayName: 'Torso', date: '2026-09-18' }] },
  { weekNumber: 4, date: '2026-09-21', sessions: [] },
];

describe('entre qué días cae una sesión', () => {
  it('hacia atrás, ni antes de su microciclo ni antes de lo último del anterior', () => {
    // M2 empieza el 7, pero M1 tiene una sesión el 9.
    expect(limitesDeLaSesion(micros, 2, '2026-09-23').desde).toBe('2026-09-09');
    // M3 empieza el 14 y M2 acabó el 12: manda su inicio.
    expect(limitesDeLaSesion(micros, 3, '2026-09-23').desde).toBe('2026-09-14');
  });

  it('hacia delante pasa del final del microciclo: las vacaciones', () => {
    // M3 acaba el 20, pero M4 no tiene nada registrado: hasta hoy.
    const l = limitesDeLaSesion(micros, 3, '2026-10-05');
    expect(l.hasta).toBe('2026-10-05');
    expect(diaElegible('2026-10-02', l)).toBe(true);
  });

  it('el tope es la primera sesión del siguiente, y hoy', () => {
    // M2 no pasa del 18, que es lo primero de M3.
    expect(limitesDeLaSesion(micros, 2, '2026-09-23').hasta).toBe('2026-09-18');
    expect(limitesDeLaSesion(micros, 4, '2026-09-23').hasta).toBe('2026-09-23');
    expect(diaElegible('2026-09-24', limitesDeLaSesion(micros, 4, '2026-09-23'))).toBe(false);
  });

  it('sin fecha guardada solo manda hoy', () => {
    const l = limitesDeLaSesion([{ weekNumber: 1 }], 1, '2026-09-23');
    expect(l.desde).toBeNull();
    expect(diaElegible('2026-01-01', l)).toBe(true);
  });

  it('el mes se pinta en semanas enteras, de lunes a domingo', () => {
    const semanas = semanasDelMes(mesDe('2026-09-22'));
    expect(semanas[0][0]).toBe('2026-08-31');
    expect(semanas.at(-1)[6]).toBe('2026-10-04');
    expect(semanas).toHaveLength(5);
  });
});

describe('quién cambia el día', () => {
  const session = { id: 's1', date: '2026-09-15' };

  it('el entrenador siempre, y el cliente mientras la semana no esté revisada', () => {
    expect(porQueNoSeMueve({ session, hoy: '2026-09-23' })).toBeNull();
    expect(porQueNoSeMueve({ session, esCliente: true, entregas: [], preferences: {}, hoy: '2026-09-23' })).toBeNull();
  });

  it('revisada, el cliente no', () => {
    const entregas = [{ weekStart: '2026-09-14', reviewedAt: '2026-09-21T10:00:00Z', submittedAt: '2026-09-20T10:00:00Z' }];
    const preferences = { checkin: { weekday: 0, everyWeeks: 1 } };
    expect(
      porQueNoSeMueve({ session, esCliente: true, entregas, preferences, startDate: '2026-08-03', hoy: '2026-09-23' })
    ).toMatch(/revisado/);
  });

  it('muy atrás, tampoco: fuera de plazo', () => {
    const vieja = { id: 's0', date: '2026-07-01' };
    expect(porQueNoSeMueve({ session: vieja, esCliente: true, preferences: {}, hoy: '2026-09-23' })).toMatch(/fuera de plazo/);
  });

  it('una sesión sin guardar no se mueve', () => {
    expect(porQueNoSeMueve({ session: { isLegacy: true, date: '2026-09-15' } })).not.toBeNull();
  });
});

describe('cómo va la sesión', () => {
  const con = (n) => ({ id: 's', entries: [{ sets: Array.from({ length: 6 }, (_, i) => ({ reps: i < n ? '8' : '' })) }] });
  it('abierta, a medias o hecha, con las palabras de las tarjetas', () => {
    expect(estadoDeLaSesion(con(0), 6)).toEqual({ tono: 'aun', texto: 'abierta' });
    expect(estadoDeLaSesion(con(2), 6)).toEqual({ tono: 'warn', texto: 'abierta · 2/6' });
    expect(estadoDeLaSesion(con(6), 6)).toEqual({ tono: 'ok', texto: 'hecha' });
    expect(estadoDeLaSesion({ ...con(3), endedAt: '2026-09-22T10:00:00Z' }, 6).texto).toBe('hecha');
  });
});

describe('la escritura', () => {
  const micro = { sessions: [{ id: 's1', date: '2026-09-22' }, { id: 's2', date: '2026-09-21' }] };

  it('marca que la movió el cliente, y el entrenador la limpia', () => {
    const delCliente = conFechaDeSesion(micro, 's1', '2026-09-21', { porCliente: true });
    expect(delCliente.sessions[0]).toEqual({ id: 's1', date: '2026-09-21', fechaPor: 'cliente' });
    const delEntrenador = conFechaDeSesion(delCliente, 's1', '2026-09-22');
    expect(delEntrenador.sessions[0]).toEqual({ id: 's1', date: '2026-09-22' });
  });

  it('cambiar el día no toca nada más', () => {
    const movida = conFechaDeSesion(micro, 's1', '2026-10-02');
    expect(movida.sessions[1]).toBe(micro.sessions[1]);
  });

  it('los días con otra sesión de la hoja, en todo el programa', () => {
    const ocupados = diasConOtraSesion(micros, 'Pierna', 'c');
    expect([...ocupados].sort()).toEqual(['2026-09-02', '2026-09-20']);
  });
});

describe('las apariciones de una hoja no se cruzan', () => {
  const base = { desde: '2026-09-14', hasta: '2026-09-23' };

  it('entre la última de antes y la primera de después', () => {
    expect(limitesDeLaAparicion(base, { anteriores: ['2026-09-15'], siguientes: ['2026-09-19'] })).toEqual({
      desde: '2026-09-15',
      hasta: '2026-09-19',
    });
  });

  it('sin hermanas, los del microciclo', () => {
    expect(limitesDeLaAparicion(base, {})).toEqual(base);
  });

  it('nunca amplía los del microciclo', () => {
    expect(limitesDeLaAparicion(base, { anteriores: ['2026-09-10'], siguientes: ['2026-09-30'] })).toEqual(base);
  });

  it('por defecto, hoy; y si hoy no cabe, el borde más cercano', () => {
    expect(diaPorDefecto(base, '2026-09-20')).toBe('2026-09-20');
    expect(diaPorDefecto({ desde: '2026-09-14', hasta: '2026-09-17' }, '2026-09-20')).toBe('2026-09-17');
    expect(diaPorDefecto({ desde: '2026-09-22', hasta: '2026-09-23' }, '2026-09-20')).toBe('2026-09-22');
  });
});

describe('quién escribe las series', () => {
  const entregas = [{ weekStart: '2026-09-14', reviewedAt: '2026-09-21T10:00:00Z', submittedAt: '2026-09-20T10:00:00Z' }];
  const preferences = { checkin: { weekday: 0, everyWeeks: 1 } };

  it('el entrenador siempre', () => {
    expect(porQueNoSeEscribe({ fecha: '2026-09-15', entregas, preferences, hoy: '2026-09-23' })).toBeNull();
  });

  it('el cliente, no en una semana revisada ni fuera de plazo', () => {
    const cliente = { esCliente: true, entregas, preferences, startDate: '2026-08-03', hoy: '2026-09-23' };
    expect(porQueNoSeEscribe({ ...cliente, fecha: '2026-09-15' })).toMatch(/revisado/);
    expect(porQueNoSeEscribe({ ...cliente, fecha: '2026-07-01' })).toMatch(/fuera de plazo/);
    expect(porQueNoSeEscribe({ ...cliente, fecha: '2026-09-22' })).toBeNull();
  });
});

describe('lo apuntado días después', () => {
  it('marca el día en que se empezó a apuntar, si es posterior', () => {
    expect(apuntadaDespues({ date: '2026-09-22', startedAt: '2026-09-25T18:00:00Z' })).toBe('2026-09-25');
  });

  it('el mismo día no marca nada, ni sin sello', () => {
    expect(apuntadaDespues({ date: '2026-09-22', startedAt: '2026-09-22T23:30:00Z' })).toBeNull();
    expect(apuntadaDespues({ date: '2026-09-22' })).toBeNull();
  });
});
