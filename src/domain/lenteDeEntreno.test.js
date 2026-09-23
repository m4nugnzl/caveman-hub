import { describe, expect, it } from 'vitest';

import {
  bandasDeFase,
  casillaDelDia,
  entrenoDeLasSemanas,
  gruposPorBloque,
  lineaDeLaReferencia,
  nombresDeLaReferencia,
  pedidosDeLaSemana,
  ponerReferencias,
  proponerReferencias,
  referenciasAEnsenar,
} from './lenteDeEntreno';

/*
  Lo que protegen estas pruebas: que la lente cuente los entrenos de una semana
  con la MISMA regla que reparte la dieta del cliente, que en un rotativo unas
  semanas pidan cinco y otras cuatro —que es el hecho que hace falta enseñar— y
  que las sesiones caigan en la semana de su fecha y no en la de su microciclo.
*/

const SEMANAL = {
  tipo: 'semanal',
  dias: [
    { hoja: 'Push' },   // Lunes
    { hoja: 'Pull' },   // Martes
    { descanso: true }, // Miércoles
    { hoja: 'Pierna' }, // Jueves
    { hoja: 'Full' },   // Viernes
    { descanso: true }, // Sábado
    { descanso: true }, // Domingo
  ],
};

/* Un 2-1 con cuatro hojas: D1 D2 descanso D3 D4 descanso = seis días, cuatro
   de entreno. Sobre siete días naturales eso NO cae siempre igual. */
const ROTATIVO = {
  tipo: 'rotativo',
  dias: [{ hoja: 'A' }, { hoja: 'B' }, { descanso: true }, { hoja: 'C' }, { hoja: 'D' }, { descanso: true }],
};

describe('la casilla de un día', () => {
  it('en semanal es el día de la semana, y no necesita ancla', () => {
    expect(casillaDelDia(SEMANAL, null, '2026-09-07').sesion).toBe('Push');
    expect(casillaDelDia(SEMANAL, null, '2026-09-09').rest).toBe(true);
    expect(casillaDelDia(SEMANAL, null, '2026-09-13').rest).toBe(true);
  });

  it('en rotativo cuenta los días desde el ancla, módulo N', () => {
    const X = (d) => casillaDelDia(ROTATIVO, '2026-09-07', d);
    expect(X('2026-09-07').sesion).toBe('A');
    expect(X('2026-09-09').rest).toBe(true);
    /* El séptimo día vuelve a empezar la vuelta: seis días, no siete. */
    expect(X('2026-09-13').sesion).toBe('A');
  });

  it('una fecha anterior al ancla también cae en su casilla', () => {
    expect(casillaDelDia(ROTATIVO, '2026-09-07', '2026-09-06').rest).toBe(true);
    /* Seis días antes del ancla es una vuelta entera antes: la misma casilla. */
    expect(casillaDelDia(ROTATIVO, '2026-09-07', '2026-09-01').sesion).toBe('A');
  });

  it('sin ancla, un rotativo no se puede colocar en el calendario', () => {
    expect(casillaDelDia(ROTATIVO, null, '2026-09-07')).toBeNull();
  });
});

describe('cuántos entrenos pide una semana', () => {
  it('en semanal, siempre los mismos: la semana ES el microciclo', () => {
    expect(pedidosDeLaSemana(SEMANAL, null, '2026-09-07')).toBe(4);
    expect(pedidosDeLaSemana(SEMANAL, null, '2026-09-14')).toBe(4);
  });

  it('en rotativo, unas piden cinco y otras cuatro', () => {
    const pide = (l) => pedidosDeLaSemana(ROTATIVO, '2026-09-07', l);
    /* L M X J V S D → A B · C D · A = cinco. */
    expect(pide('2026-09-07')).toBe(5);
    expect(pide('2026-09-14')).toBe(5);
    /* A la tercera la vuelta ya ha corrido lo bastante, y esa pide cuatro. */
    expect(pide('2026-09-21')).toBe(4);
    /* La cuenta no inventa nada: seis semanas son 42 días, o sea siete vueltas
       enteras del ciclo, o sea 7 × 4 entrenos. */
    const seis = ['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12'];
    expect(seis.reduce((n, l) => n + pide(l), 0)).toBe(28);
  });

  it('sin secuencia no hay hilera que dibujar', () => {
    expect(pedidosDeLaSemana(null, '2026-09-07', '2026-09-07')).toBeNull();
    expect(pedidosDeLaSemana({ tipo: 'rotativo', dias: [] }, '2026-09-07', '2026-09-07')).toBeNull();
  });
});

describe('lo que lleva cada semana', () => {
  const program = {
    blocks: [{ id: 'b1', name: 'Volumen', fromWeek: 1, toWeek: null, microciclo: SEMANAL }],
    microcycles: [
      {
        id: 'm1',
        weekNumber: 1,
        date: '2026-09-07',
        days: [],
        sessions: [
          {
            id: 's1',
            date: '2026-09-07',
            dayName: 'Push',
            entries: [{ name: 'Press banca', sets: [{ kg: 100, reps: 5 }, { kg: 100, reps: 5 }] }],
          },
          /* Anotada el DOMINGO: es de esta semana natural aunque su microciclo
             siguiera corriendo. */
          {
            id: 's2',
            date: '2026-09-13',
            dayName: 'Pull',
            entries: [{ name: 'Remo', sets: [{ kg: 80, reps: 10 }] }],
          },
        ],
      },
    ],
  };

  const semanas = [
    { lunes: '2026-09-07', domingo: '2026-09-13', bloque: { id: 'b1' }, fase: { id: 'f1' } },
    { lunes: '2026-09-14', domingo: '2026-09-20', bloque: { id: 'b1' }, fase: { id: 'f1' } },
  ];

  const mapa = entrenoDeLasSemanas({ program, semanas });

  it('suma el tonelaje de las sesiones de esa semana, por su fecha', () => {
    expect(mapa.get('2026-09-07').tonelaje).toBe(100 * 5 + 100 * 5 + 80 * 10);
    expect(mapa.get('2026-09-07').hechas).toBe(2);
  });

  it('dice cuántas pedía, para que la hilera pueda ser ●●○○', () => {
    expect(mapa.get('2026-09-07').pedidos).toBe(4);
  });

  it('una semana sin ninguna sesión sigue teniendo su cuenta', () => {
    expect(mapa.get('2026-09-14')).toEqual(
      expect.objectContaining({ tonelaje: 0, hechas: 0, pedidos: 4, extra: 0 })
    );
  });

  it('entrenar de más no se pierde: se cuenta aparte', () => {
    const muchas = entrenoDeLasSemanas({
      program: {
        ...program,
        blocks: [{ id: 'b1', name: 'Volumen', fromWeek: 1, toWeek: null, microciclo: { tipo: 'semanal', dias: [{ hoja: 'Push' }] } }],
      },
      semanas: [semanas[0]],
    });
    expect(muchas.get('2026-09-07').extra).toBe(1);
  });
});

describe('los grupos y las bandas', () => {
  const semanas = [
    { lunes: 'a', domingo: 'a7', bloque: { id: 'b1' }, fase: { id: 'f1' } },
    { lunes: 'b', domingo: 'b7', bloque: { id: 'b1' }, fase: { id: 'f2' } },
    { lunes: 'c', domingo: 'c7', bloque: { id: 'b2' }, fase: { id: 'f2' } },
    { lunes: 'd', domingo: 'd7', bloque: null, fase: { id: 'f2' } },
  ];

  it('agrupa por bloque, no por fase: aquí la unidad es el bloque', () => {
    const g = gruposPorBloque(semanas);
    expect(g.map((x) => x.semanas.length)).toEqual([2, 1, 1]);
    expect(g[0].bloqueId).toBe('b1');
    expect(g[2].bloqueId).toBeNull();
  });

  it('la fase queda de fondo, en tramos de columnas', () => {
    const b = bandasDeFase(semanas);
    expect(b).toEqual([
      expect.objectContaining({ id: 'f1', desde: 0, hasta: 0 }),
      expect.objectContaining({ id: 'f2', desde: 1, hasta: 3 }),
    ]);
  });
});

describe('los ejercicios de referencia', () => {
  const program = {
    blocks: [
      {
        id: 'b1',
        name: 'Fuerza',
        fromWeek: 1,
        toWeek: null,
        microciclo: { tipo: 'semanal', dias: [{ hoja: 'A' }, { descanso: true }, { hoja: 'B' }, { descanso: true }, { descanso: true }, { descanso: true }, { descanso: true }] },
        sessions: [
          {
            dayName: 'A',
            exercises: [
              { id: 'x1', name: 'Press banca', sets: [{}, {}, {}, {}] },
              { id: 'x2', name: 'Fondos', sets: [{}, {}] },
            ],
          },
          { dayName: 'B', exercises: [{ id: 'x3', name: 'Sentadilla', sets: [{}, {}, {}] }] },
        ],
      },
    ],
    microcycles: [
      {
        id: 'm1',
        weekNumber: 1,
        date: '2026-09-07',
        days: [],
        sessions: [
          {
            id: 's1',
            date: '2026-09-07',
            dayName: 'A',
            /* El mismo id con el nombre VIEJO: así se anotó entonces. */
            entries: [{ exerciseId: 'x1', name: 'Press de banca', sets: [{ kg: 100, reps: 5 }] }],
          },
        ],
      },
      {
        id: 'm2',
        weekNumber: 2,
        date: '2026-09-14',
        days: [],
        sessions: [
          {
            id: 's2',
            date: '2026-09-14',
            dayName: 'A',
            entries: [{ exerciseId: 'x1', name: 'Press banca', sets: [{ kg: 105, reps: 5 }] }],
          },
        ],
      },
    ],
  };
  const block = program.blocks[0];

  it('propone los tres con más series del plan del bloque', () => {
    expect(proponerReferencias(program, block).map((r) => r.nombre)).toEqual([
      'Press banca',
      'Sentadilla',
      'Fondos',
    ]);
  });

  it('las suyas mandan sobre la propuesta', () => {
    const conSuyas = { ...program, blocks: [{ ...block, referencias: [{ nombre: 'Fondos' }] }] };
    const { referencias, propuestas } = referenciasAEnsenar(conSuyas, conSuyas.blocks[0]);
    expect(referencias.map((r) => r.nombre)).toEqual(['Fondos']);
    expect(propuestas).toBe(false);
    expect(referenciasAEnsenar(program, block).propuestas).toBe(true);
  });

  it('junta el nombre guardado y el que ese id lleva en las sesiones', () => {
    expect(nombresDeLaReferencia(program, { ejercicioId: 'x1', nombre: 'Press banca' }).sort()).toEqual([
      'Press banca',
      'Press de banca',
    ]);
    /* Sin id, solo su nombre: no se puede saber que el otro es el mismo. */
    expect(nombresDeLaReferencia(program, { nombre: 'Press banca' })).toEqual(['Press banca']);
  });

  it('la línea no pierde lo anotado con el nombre viejo', () => {
    const puntos = lineaDeLaReferencia({
      program,
      referencia: { ejercicioId: 'x1', nombre: 'Press banca' },
      lunes: ['2026-09-07', '2026-09-14', '2026-09-21'],
    });
    expect(puntos.map((p) => p.kg)).toEqual([100, 105, null]);
  });

  it('guardar las mismas no cambia el programa, y vaciarlas quita la clave', () => {
    const con = ponerReferencias(program, 'b1', [{ nombre: 'Fondos' }]);
    expect(con.blocks[0].referencias).toEqual([{ nombre: 'Fondos' }]);
    expect(ponerReferencias(con, 'b1', [{ nombre: 'Fondos' }])).toBe(con);
    expect(ponerReferencias(con, 'b1', []).blocks[0]).not.toHaveProperty('referencias');
    /* Un bloque que no existe no se inventa. */
    expect(ponerReferencias(program, 'nope', [{ nombre: 'X' }])).toBe(program);
  });
});
