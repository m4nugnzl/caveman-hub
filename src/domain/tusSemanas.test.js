import { describe, expect, it } from 'vitest';

import { semanasDelRastro } from './tusSemanas';

const HOY = '2026-09-19'; // sábado; su lunes es el 14

describe('semanasDelRastro', () => {
  it('agrupa los pesajes por semana natural, con su media y la de la semana anterior', () => {
    const semanas = semanasDelRastro({
      hoy: HOY,
      history: [
        { id: 'a', date: '2026-09-08', weight: 61.2 },
        { id: 'b', date: '2026-09-10', weight: 61 },
        { id: 'c', date: '2026-09-15', weight: 60.8 },
        { id: 'd', date: '2026-09-17', weight: 61 },
      ],
    });
    expect(semanas.map((s) => s.semana)).toEqual(['2026-09-14', '2026-09-07']);
    expect(semanas[0]).toMatchObject({ esta: true, media: 60.9, mediaAnterior: 61.1 });
    expect(semanas[0].pesajes.map((p) => p.id)).toEqual(['c', 'd']);
    expect(semanas[1]).toMatchObject({ esta: false, media: 61.1, mediaAnterior: null });
    expect(semanas[0].pesajes[0].conMedidas).toBe(false);
  });

  it('las medidas son las del último registro de la semana que las trae, con su nombre', () => {
    const [s] = semanasDelRastro({
      hoy: HOY,
      catalogo: [{ id: 'cintura', label: 'Cintura', unit: 'cm' }],
      history: [
        { id: 'a', date: '2026-09-15', perimeters: { ombligo: 80 } },
        { id: 'b', date: '2026-09-17', perimeters: { ombligo: 79.5 }, skinFolds: { abdominal: 12 }, medidas: { cintura: 72, rara: 3 } },
      ],
    });
    expect(s.medidas.fecha).toBe('2026-09-17');
    expect(s.medidas.lista.map((m) => `${m.etiqueta} ${m.valor} ${m.unidad}`)).toEqual([
      'Ombligo 79.5 cm',
      'Abdominal 12 mm',
      'Cintura 72 cm',
    ]);
    // Sin peso esa semana no hay media, y no se inventa.
    expect(s.media).toBeNull();
  });

  it('una entrega dice si está revisada, entregada o sin entregar, y trae la respuesta', () => {
    const semanas = semanasDelRastro({
      hoy: HOY,
      history: [
        { id: 'a', date: '2026-09-01', weight: 62 },
        { id: 'b', date: '2026-09-15', weight: 61 },
      ],
      checkIns: [
        { weekStart: '2026-09-07', submittedAt: '2026-09-13', reviewedAt: '2026-09-14', coachNotes: 'Seguimos' },
        { weekStart: '2026-09-14', submittedAt: null, reviewedAt: null },
      ],
      revisiones: [{ weekStart: '2026-09-07', coachNotes: 'Seguimos', reviewedAt: '2026-09-14', video: { url: '/r/x' } }],
    });
    const por = Object.fromEntries(semanas.map((s) => [s.semana, s]));
    expect(por['2026-09-14'].estado).toBeNull(); // la de ahora todavía no se debe
    expect(por['2026-09-07']).toMatchObject({
      estado: 'revisada',
      respuesta: { texto: 'Seguimos', cuando: '2026-09-14', video: '/r/x' },
    });
    expect(por['2026-08-31'].estado).toBe('sin entregar');
  });

  it('las fotos van a la semana de programa que llevan, anclada al lunes del alta', () => {
    const [s] = semanasDelRastro({
      hoy: HOY,
      startDate: '2026-08-26', // miércoles: su semana 1 empieza el lunes 24
      fotos: [{ id: 'f', week: 4, angle: 'frontal', date: '2026-09-20' }],
    });
    expect(s.semana).toBe('2026-09-14');
    expect(s.fotos).toHaveLength(1);
  });

  it('sin nada, no hay semanas', () => {
    expect(semanasDelRastro({ hoy: HOY })).toEqual([]);
  });
});
