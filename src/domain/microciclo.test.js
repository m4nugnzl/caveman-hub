import { describe, expect, it } from 'vitest';

import { addDays } from '@/lib/dates';
import {
  blockOfWeek,
  blockPlan,
  blocksOf,
  clientCycleSlots,
  currentBlock,
  fechaDelCicloSiguiente,
  materializarMicrociclos,
  microcicloDelBloque,
  semanaDelCliente,
  structureOfBlock,
} from './blocks';
import {
  cadenaDe,
  casillasDe,
  cycleSlots,
  cycleSpanDays,
  duracionDe,
  entrenosDe,
  generarSecuencia,
  leerCadena,
  nextCycleDate,
  normalizaMicrociclo,
  rotatingSlots,
} from './training';

/* ══════════════════════════════════════════════════════════════════════════
   F1 DEL MICROCICLO COMO SECUENCIA: nada visible puede cambiar.

   Cada caso compara TRES lecturas: la de antes (las funciones de siempre con el
   tipo y el patrón del cliente, escritas aquí tal como las componía el código
   viejo), la derivada (`microcicloDelBloque` sin nada guardado) y la
   materializada (`materializarMicrociclos`). Ver
   `docs/estudio-microciclo-secuencia.md`.
   ══════════════════════════════════════════════════════════════════════════ */

const hoja = (dayName) => ({ dayName, exercises: [] });

const micro = (weekNumber, date, nombres) => ({
  weekNumber,
  date,
  days: nombres.map(hoja),
});

/** Micros fechados uno detrás de otro, como los monta `nextCycleDate`. */
const microsSeguidos = (desde, span, semanas, nombres) =>
  Array.from({ length: semanas }, (_, i) => micro(i + 1, addDays(desde, i * span), nombres));

/* ── Los tres casos ─────────────────────────────────────────────────────── */

const SPLIT_1 = { Lunes: 'Push', Martes: 'Descanso', Miércoles: 'Pull', Jueves: 'Descanso', Viernes: 'Pierna', Sábado: 'Descanso', Domingo: 'Descanso' };
const SPLIT_2 = { Lunes: 'Push A', Martes: 'Pull A', Miércoles: 'Descanso', Jueves: 'Pierna A', Viernes: 'Push B', Sábado: 'Descanso', Domingo: '' };

/** Semanal, con la forma de `sembrar-cliente`: un bloque cerrado y otro abierto, plan en los microciclos. */
const SEMANAL = {
  nombre: 'semanal (reparto de sembrar-cliente)',
  cliente: { cycleType: 'weekly', cyclePattern: { train: 2, rest: 1 } },
  programa: {
    weeklySplit: SPLIT_2,
    mobilityDrills: [],
    microcycles: [
      micro(1, '2026-08-31', ['Push', 'Pull', 'Pierna']),
      micro(2, '2026-09-07', ['Push', 'Pull', 'Pierna']),
      micro(3, '2026-09-14', ['Push A', 'Pull A', 'Pierna A', 'Push B']),
      micro(4, '2026-09-21', ['Push A', 'Pull A', 'Pierna A', 'Push B']),
    ],
    blocks: [
      { id: 'b_1', name: 'Bloque 1', fromWeek: 1, toWeek: 2, weeklySplit: SPLIT_1, mobilityDrills: [] },
      { id: 'b_2', name: 'Bloque 2', fromWeek: 3, toWeek: null },
    ],
  },
};

const SEIS = ['Legs A', 'Push A', 'Pull A', 'Legs B', 'Push B', 'Pull B'];

/** Rotativo 2-1 con seis hojas: nueve días. Plan dentro del bloque. */
const DOS_UNO = {
  nombre: 'rotativo 2-1 con 6 hojas',
  cliente: { cycleType: 'rotating', cyclePattern: { train: 2, rest: 1 } },
  programa: {
    weeklySplit: {},
    mobilityDrills: [],
    microcycles: microsSeguidos('2026-08-01', 9, 4, SEIS),
    blocks: [{ id: 'b_1', name: 'Bloque 1', fromWeek: 1, toWeek: null, sessions: SEIS.map(hoja) }],
  },
};

const CUATRO = ['A', 'B', 'C', 'D'];

/** Rotativo 3-1 con cuatro hojas: A B C · D · = seis días. Plan en los microciclos, con un bloque cerrado. */
const TRES_UNO = {
  nombre: 'rotativo 3-1 con 4 hojas',
  cliente: { cycleType: 'rotating', cyclePattern: { train: 3, rest: 1 } },
  programa: {
    weeklySplit: {},
    mobilityDrills: [],
    microcycles: microsSeguidos('2026-08-01', 6, 4, CUATRO),
    blocks: [
      { id: 'b_1', name: 'Bloque 1', fromWeek: 1, toWeek: 2, weeklySplit: {}, mobilityDrills: [] },
      { id: 'b_2', name: 'Bloque 2', fromWeek: 3, toWeek: null },
    ],
  },
};

const CASOS = [SEMANAL, DOS_UNO, TRES_UNO];

/* ── Lo de antes, compuesto como lo componía el código viejo ─────────────── */

const casillasDeAntes = (client, program) => {
  const bloque = currentBlock(program);
  const rotativo = client.cycleType === 'rotating';
  return cycleSlots({
    cycleType: client.cycleType,
    pattern: client.cyclePattern,
    sessions: rotativo ? blockPlan(program, bloque).sessions : [],
    weeklySplit: structureOfBlock(program, bloque).weeklySplit || {},
  });
};


/* ══ Equivalencia ══════════════════════════════════════════════════════════ */

describe.each(CASOS)('$nombre: nada visible cambia', ({ cliente, programa }) => {
  const materializado = materializarMicrociclos(programa, cliente);
  const lecturas = [
    ['derivado', programa],
    ['materializado', materializado],
  ];

  it.each(lecturas)('casillas del ciclo (%s): mismas claves, sesiones y descansos', (_, p) => {
    expect(clientCycleSlots(cliente, p)).toEqual(casillasDeAntes(cliente, programa));
  });

  it.each(lecturas)('duración de cada microciclo (%s)', (_, p) => {
    for (const m of programa.microcycles) {
      const bloque = blockOfWeek(p, m.weekNumber);
      expect(duracionDe(microcicloDelBloque(p, bloque, cliente))).toBe(
        cycleSpanDays(cliente.cycleType, cliente.cyclePattern, m.days)
      );
    }
  });

  it.each(lecturas)('la fecha del siguiente, a lo largo de cuatro microciclos (%s)', (_, p) => {
    let previo = programa.microcycles[0];
    for (let k = 0; k < 4; k += 1) {
      const nueva = fechaDelCicloSiguiente(p, previo, cliente);
      expect(nueva).toBe(nextCycleDate(previo, cliente.cycleType, cliente.cyclePattern));
      const siguiente = programa.microcycles[k + 1];
      if (siguiente) expect(nueva).toBe(siguiente.date);
      previo = siguiente || { ...previo, weekNumber: previo.weekNumber + 1, date: nueva };
    }
  });


  it('materializar no toca los microciclos: ni fechas ni analítica pueden moverse', () => {
    expect(materializado.microcycles).toBe(programa.microcycles);
    expect(materializado.microcycles).toEqual(structuredClone(programa.microcycles));
  });

  it('materializar es idempotente', () => {
    expect(materializarMicrociclos(materializado, cliente)).toBe(materializado);
  });

  it('materializar solo añade `microciclo` a cada bloque', () => {
    const antes = blocksOf(programa);
    materializado.blocks.forEach((b, i) => {
      const { microciclo, ...resto } = b;
      expect(resto).toEqual(antes[i]);
      expect(normalizaMicrociclo(microciclo)).toEqual(microciclo);
    });
  });
});

describe('semanaDelCliente: la casilla de cada día cruzando el ancla', () => {
  /* Ancla el miércoles 23: el lunes y el martes caen ANTES, con cuenta negativa. */
  const cliente = DOS_UNO.cliente;
  const programa = {
    ...DOS_UNO.programa,
    microcycles: [micro(1, '2026-09-14', SEIS), micro(2, '2026-09-23', SEIS)],
  };
  const esperado = ['8', '9', '1', '2', '3', '4', '5'];

  it.each([
    ['derivado', programa],
    ['materializado', materializarMicrociclos(programa, cliente)],
  ])('rotativo 2-1 con 6 hojas (%s)', (_, p) => {
    const casillas = clientCycleSlots(cliente, p);
    const semana = semanaDelCliente(cliente, p, casillas, '2026-09-22');
    expect(semana.map((d) => d.key)).toEqual(esperado);
    expect(semana[1].titulo).toBe('Martes · D9');
  });

  it('semanal: la casilla es el día de la semana, derivado o guardado', () => {
    const { cliente: c, programa: p } = SEMANAL;
    const derivada = semanaDelCliente(c, p, clientCycleSlots(c, p), '2026-09-22');
    const guardada = semanaDelCliente(c, materializarMicrociclos(p, c), [], '2026-09-22');
    expect(derivada.map((d) => d.key)).toEqual(['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']);
    expect(guardada).toEqual(derivada);
  });
});

/* ══ Lo guardado manda ════════════════════════════════════════════════════ */

describe('un bloque con su secuencia guardada', () => {
  it('no cambia si luego se cambia el patrón del cliente', () => {
    const { cliente, programa } = TRES_UNO;
    const materializado = materializarMicrociclos(programa, cliente);
    const otro = { ...cliente, cyclePattern: { train: 2, rest: 2 } };

    for (const b of materializado.blocks) {
      expect(microcicloDelBloque(materializado, b, otro)).toEqual(microcicloDelBloque(materializado, b, cliente));
    }
    expect(clientCycleSlots(otro, materializado)).toEqual(clientCycleSlots(cliente, materializado));
    /* Sin guardar, en cambio, la derivación sigue a la ficha: por eso se materializa. */
    expect(clientCycleSlots(otro, programa)).not.toEqual(clientCycleSlots(cliente, programa));
  });

  it('un bloque cerrado conserva su reparto aunque el abierto cambie', () => {
    const { cliente, programa } = SEMANAL;
    const materializado = materializarMicrociclos(programa, cliente);
    const cerrado = materializado.blocks[0];
    const cambiado = { ...materializado, weeklySplit: { Lunes: 'Full body' } };
    expect(microcicloDelBloque(cambiado, cerrado, cliente).dias.map((d) => d.hoja || null)).toEqual([
      'Push', null, 'Pull', null, 'Pierna', null, null,
    ]);
  });

  it('un bloque puede ser asimétrico: 2-1 2-1 3-1', () => {
    const hojas = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
    const programa = {
      ...DOS_UNO.programa,
      blocks: [
        {
          id: 'b_1',
          name: 'Bloque 1',
          fromWeek: 1,
          toWeek: null,
          sessions: hojas.map(hoja),
          microciclo: { tipo: 'rotativo', dias: generarSecuencia('2-1 2-1 3-1', hojas) },
        },
      ],
    };
    const casillas = clientCycleSlots(DOS_UNO.cliente, programa);
    expect(casillas).toHaveLength(10);
    expect(casillas.filter((c) => c.rest).map((c) => c.key)).toEqual(['3', '6', '10']);
    expect(fechaDelCicloSiguiente(programa, programa.microcycles[0], DOS_UNO.cliente)).toBe('2026-08-11');
  });
});

/* ══ Riesgo aceptado (duda 6) ══════════════════════════════════════════════ */

describe('duración con hojas retiradas en los days del microciclo', () => {
  /*
   * `proyectarPlanEnDias` deja en los `days` las hojas que el plan ya no tiene
   * si guardan kilos antiguos. Antes, `cycleSpanDays` las contaba; ahora manda
   * el plan del bloque. En ese caso raro el microciclo SIGUIENTE nace antes:
   * 2-1 con 6 hojas son 9 días, y con la retirada colada eran 11. Lo pasado —la
   * fecha guardada de cada microciclo— no se mueve.
   */
  it('el siguiente nace a los 9 días, no a los 11; lo guardado no cambia', () => {
    const { cliente, programa } = DOS_UNO;
    const conRetirada = {
      ...programa,
      microcycles: [{ ...programa.microcycles[0], days: [...SEIS, 'Brazos (retirada)'].map(hoja) }],
    };
    const previo = conRetirada.microcycles[0];

    expect(nextCycleDate(previo, cliente.cycleType, cliente.cyclePattern)).toBe(addDays(previo.date, 11));
    expect(fechaDelCicloSiguiente(conRetirada, previo, cliente)).toBe(addDays(previo.date, 9));
    expect(materializarMicrociclos(conRetirada, cliente).microcycles).toBe(conRetirada.microcycles);
  });
});

/* ══ El generador ═════════════════════════════════════════════════════════ */

describe('generarSecuencia', () => {
  const comoSlots = (dias) => dias.map((d) => (d.descanso ? 'Descanso' : d.hoja ?? 'Entreno'));

  it('una tanda «a-b» da exactamente lo de `rotatingSlots`, de 0 a 12 hojas', () => {
    for (let train = 1; train <= 4; train += 1) {
      for (let rest = 0; rest <= 3; rest += 1) {
        for (let n = 0; n <= 12; n += 1) {
          const hojas = Array.from({ length: n }, (_, i) => `H${i + 1}`);
          const esperado = rotatingSlots({ train, rest }, hojas.map(hoja)).map((s) => s.name);
          expect(comoSlots(generarSecuencia(`${train}-${rest}`, hojas))).toEqual(esperado);
        }
      }
    }
  });

  it('2-1 con 6 hojas: nueve días, y su cadena se relee como tres tandas', () => {
    const dias = generarSecuencia('2-1', SEIS);
    expect(dias).toHaveLength(9);
    expect(cadenaDe(dias)).toBe('2-1 2-1 2-1');
    expect(entrenosDe({ tipo: 'rotativo', dias })).toBe(6);
  });

  it('3-1 con 4 hojas: A B C · D ·', () => {
    const dias = generarSecuencia('3-1', CUATRO);
    expect(comoSlots(dias)).toEqual(['A', 'B', 'C', 'Descanso', 'D', 'Descanso']);
    expect(cadenaDe(dias)).toBe('3-1 1-1');
  });

  describe('varias tandas: literal, fija la longitud', () => {
    const hojas = (n) => Array.from({ length: n }, (_, i) => String.fromCharCode(65 + i));

    it('con tantas hojas como entrenos, lo escrito', () => {
      const dias = generarSecuencia('2-1 2-1 3-1', hojas(7));
      expect(comoSlots(dias)).toEqual(['A', 'B', 'Descanso', 'C', 'D', 'Descanso', 'E', 'F', 'G', 'Descanso']);
      expect(cadenaDe(dias)).toBe('2-1 2-1 3-1');
    });

    it('si sobran casillas, las hojas vuelven a empezar en orden', () => {
      const dias = generarSecuencia('2-1 2-1 3-1', hojas(5));
      expect(comoSlots(dias)).toEqual(['A', 'B', 'Descanso', 'C', 'D', 'Descanso', 'E', 'A', 'B', 'Descanso']);
    });

    it('si sobran hojas, se quedan sin día y no se añade ninguna tanda', () => {
      const dias = generarSecuencia('2-1 2-1 3-1', hojas(9));
      expect(dias).toHaveLength(10);
      expect(dias.filter((d) => !d.descanso).map((d) => d.hoja)).toEqual(hojas(7));
      expect(cadenaDe(dias)).toBe('2-1 2-1 3-1');
    });

    it('sin hojas, días de entreno sin hoja', () => {
      expect(generarSecuencia('1-1 2-0', [])).toEqual([{ hoja: null }, { descanso: true }, { hoja: null }, { hoja: null }]);
    });
  });

  it('una cadena ilegible no genera nada', () => {
    expect(generarSecuencia('', SEIS)).toBeNull();
    expect(generarSecuencia('dos y uno', SEIS)).toBeNull();
  });
});

describe('leerCadena, cadenaDe y normalizaMicrociclo', () => {
  it('lee guion o barra, con cualquier separador, y descarta «0-0»', () => {
    expect(leerCadena('2-1, 2/1  3 - 1 0-0')).toEqual([
      { entreno: 2, descanso: 1 },
      { entreno: 2, descanso: 1 },
      { entreno: 3, descanso: 1 },
    ]);
    expect(leerCadena('0-0')).toBeNull();
  });

  it('una secuencia que empieza descansando se relee con una tanda «0-n»', () => {
    const dias = [{ descanso: true }, { hoja: 'A' }, { hoja: 'B' }, { descanso: true }];
    expect(cadenaDe(dias)).toBe('0-1 2-1');
    expect(generarSecuencia(cadenaDe(dias), ['A', 'B'])).toEqual(dias);
  });

  it('el semanal siempre tiene siete días', () => {
    expect(normalizaMicrociclo({ tipo: 'semanal', dias: [{ hoja: ' Push ' }] }).dias).toEqual([
      { hoja: 'Push' },
      ...Array.from({ length: 6 }, () => ({ descanso: true })),
    ]);
    expect(duracionDe(normalizaMicrociclo({ tipo: 'semanal', dias: new Array(14).fill({ hoja: 'A' }) }))).toBe(7);
  });

  it('lo que no se puede leer como microciclo es null, y entonces se deriva', () => {
    expect(normalizaMicrociclo(null)).toBeNull();
    expect(normalizaMicrociclo({ tipo: 'quincenal', dias: [{ hoja: 'A' }] })).toBeNull();
    expect(normalizaMicrociclo({ tipo: 'rotativo', dias: [] })).toBeNull();
  });

  it('las casillas del rotativo son posiciones, las del semanal días', () => {
    const rot = casillasDe({ tipo: 'rotativo', dias: [{ hoja: 'A' }, { descanso: true }, { hoja: null }] });
    expect(rot).toEqual([
      { key: '1', corto: 'D1', sesion: 'A', rest: false },
      { key: '2', corto: 'D2', sesion: null, rest: true },
      { key: '3', corto: 'D3', sesion: 'Entreno', rest: false },
    ]);
    expect(casillasDe({ tipo: 'semanal', dias: [{ hoja: 'A' }] })[0]).toEqual({
      key: 'Lunes',
      corto: 'Lun',
      sesion: 'A',
      rest: false,
    });
  });
});
