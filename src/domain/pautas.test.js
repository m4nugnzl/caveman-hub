import { describe, expect, it } from 'vitest';

import {
  aplicarDiferencia,
  cambiosEntre,
  celdasDeGrupo,
  cifra,
  conCampoDelGrupo,
  conOtraSerie,
  conSeriesDelGrupo,
  diferenciaNueva,
  encadenar,
  esquemaEnLinea,
  gruposDeSeries,
  marcasDeGrupos,
  pautaDicha,
  primerosIguales,
} from './pautas';
import {
  applyOverrides,
  blockPlan,
  buildOverride,
  efectoDePauta,
  pautaEditableEn,
  pautaEfectiva,
  pautasDelBloque,
  planOfDay,
  ponerPautaIn,
  proyectarPlanEnDias,
  putOverrideIn,
  renameBlockExerciseIn,
  resolvedMicrocycles,
  restaurarPautaIn,
  sellarPautasIn,
  soloEnIn,
  tienePautaPropia,
  volverAlAnteriorIn,
} from './blocks';
import { mergePlanWithSession } from './sessions';

const serie = (targetReps, targetKg = '', targetRir = '') => ({ kg: '', reps: '', rir: '', targetReps, targetKg, targetRir });
const tres = (reps = '8-10', kg = '', rir = '') => [serie(reps, kg, rir), serie(reps, kg, rir), serie(reps, kg, rir)];
const ej = (id, name, sets) => ({ id, name, muscle: 'Pecho', sets });

/** Un bloque con una hoja y cuatro microciclos (M1…M4), sin nada propio en ninguno. */
const programa = ({ sets = tres(), semanas = 4, sesiones = {} } = {}) => ({
  blocks: [
    {
      id: 'b1',
      name: 'Bloque 1',
      fromWeek: 1,
      toWeek: null,
      sessions: [{ dayName: 'Push', exercises: [ej('a', 'Press banca', sets), ej('b', 'Fondos', [serie('10')])] }],
    },
  ],
  microcycles: Array.from({ length: semanas }, (_, i) => ({
    id: `mc${i + 1}`,
    weekNumber: i + 1,
    days: [{ dayName: 'Push', exercises: [] }],
    sessions: sesiones[i + 1] || [],
  })),
});

const pauta = (p, w, id = 'a') => pautaEfectiva(p, w, 'Push', id);
const rirs = (p, w) => pauta(p, w).map((s) => s.targetRir);
const conRir = (sets, i, v) => sets.map((s, j) => (j === i ? { ...s, targetRir: v } : s));
const hecha = (dayName = 'Push', reps = '8') => ({
  id: `s-${dayName}`,
  date: '2026-09-01',
  dayName,
  entries: [{ exerciseId: 'a', name: 'Press banca', sets: [{ kg: '60', reps, rir: '' }] }],
});

describe('la cadena de la pauta', () => {
  it('una diferencia pone el número de series y luego los campos por índice', () => {
    const sets = tres();
    const out = aplicarDiferencia(sets, { n: 4, series: { 3: { targetRir: '0' } } });
    expect(out).toHaveLength(4);
    /* La serie nueva copia rango, carga y RIR de la última. */
    expect(out[3].targetReps).toBe('8-10');
    expect(out[3].targetRir).toBe('0');
    expect(sets).toHaveLength(3);
  });

  it('un índice que ya no existe se ignora, sin romper nada', () => {
    const out = aplicarDiferencia(tres(), { series: { 7: { targetRir: '0' }, x: { targetRir: '1' } } });
    expect(out).toEqual(tres());
  });

  it('encadena en orden: el último que fija un campo manda', () => {
    const out = encadenar(tres(), [{ series: { 2: { targetRir: '1' } } }, { series: { 2: { targetRir: '0' } } }]);
    expect(out.map((s) => s.targetRir)).toEqual(['', '', '0']);
  });

  it('solo guarda lo tocado que difiere de lo heredado', () => {
    const heredadas = tres('8-10', '70', '2');
    const pedidas = conRir(heredadas, 2, '0');
    expect(diferenciaNueva(null, heredadas, pedidas)).toEqual({ series: { 2: { targetRir: '0' } } });
    /* Volver al valor heredado suelta el campo: vuelve a heredar. */
    expect(diferenciaNueva({ series: { 2: { targetRir: '0' } } }, heredadas, heredadas)).toBeNull();
  });

  it('lo propio que no se toca se queda aunque coincida con lo que llega', () => {
    const heredadas = tres('8-10', '70', '2');
    const vieja = { series: { 0: { targetKg: '80' } } };
    const actuales = aplicarDiferencia(heredadas, vieja);
    const dif = diferenciaNueva(vieja, heredadas, conRir(actuales, 2, '0'));
    expect(dif).toEqual({ series: { 0: { targetKg: '80' }, 2: { targetRir: '0' } } });
  });

  it('encoger limpia lo escrito en las series que se van, y crecer no lo resucita', () => {
    const heredadas = tres();
    const vieja = { series: { 2: { targetRir: '0' } } };
    const dos = diferenciaNueva(vieja, heredadas, heredadas.slice(0, 2));
    expect(dos).toEqual({ n: 2 });
    const cuatro = diferenciaNueva(dos, heredadas, [...heredadas, serie('8-10')]);
    expect(cuatro).toEqual({ n: 4 });
  });
});

describe('la pauta efectiva de cada microciclo', () => {
  it('sin nada propio, todos los microciclos piden la definición y el plan no cambia', () => {
    const p = programa();
    expect(pauta(p, 1)).toEqual(tres());
    expect(pauta(p, 4)).toEqual(tres());
    const hoja = p.blocks[0].sessions[0];
    /* El mismo objeto: un bloque sin pautas se lee exactamente como antes. */
    expect(planOfDay(p, 3, 'Push')).toEqual(applyOverrides(hoja, []));
    expect(resolvedMicrocycles(p)[2].days[0].exercises[0].sets).toBe(hoja.exercises[0].sets);
  });

  it('el RIR de la última serie en M3 llega a M4, no a M1, M2', () => {
    const p = ponerPautaIn(programa(), 3, 'Push', 'a', conRir(tres(), 2, '0'));
    expect(rirs(p, 1)).toEqual(['', '', '']);
    expect(rirs(p, 2)).toEqual(['', '', '']);
    expect(rirs(p, 3)).toEqual(['', '', '0']);
    expect(rirs(p, 4)).toEqual(['', '', '0']);
    /* Guardado como diferencia de M3, campo a campo, con ids estables. */
    expect(pautasDelBloque(p.blocks[0])).toEqual({ a: { mc3: { series: { 2: { targetRir: '0' } } } } });
    expect(tienePautaPropia(p, 3, 'a')).toBe(true);
    expect(tienePautaPropia(p, 4, 'a')).toBe(false);
  });

  it('en el primer microciclo se escribe la definición, no una diferencia', () => {
    const p = ponerPautaIn(programa(), 1, 'Push', 'a', conRir(tres(), 2, '1'));
    expect(p.blocks[0].pautas).toBeUndefined();
    expect(p.blocks[0].sessions[0].exercises[0].sets.map((s) => s.targetRir)).toEqual(['', '', '1']);
    expect(rirs(p, 4)).toEqual(['', '', '1']);
  });

  it('un campo que M4 fija él mismo no lo mueve lo que se cambie antes', () => {
    const conM4 = ponerPautaIn(programa(), 4, 'Push', 'a', conRir(tres(), 2, '2'));
    const antes = conM4;
    const p = ponerPautaIn(conM4, 3, 'Push', 'a', conRir(tres(), 2, '0'));
    expect(rirs(p, 3)).toEqual(['', '', '0']);
    expect(rirs(p, 4)).toEqual(['', '', '2']);
    expect(efectoDePauta(antes, p, 3, 'Push', 'a')).toEqual({ aplicadas: [3], propia: 4 });
  });

  it('dice dónde se aplicó el cambio', () => {
    const antes = programa();
    const p = ponerPautaIn(antes, 3, 'Push', 'a', conRir(tres(), 2, '0'));
    expect(efectoDePauta(antes, p, 3, 'Push', 'a')).toEqual({ aplicadas: [3, 4], propia: null });
  });

  it('«Solo en M3» deja M4 como estaba', () => {
    const antes = programa();
    const p = ponerPautaIn(antes, 3, 'Push', 'a', conRir(tres(), 2, '0'));
    const solo = soloEnIn(p, antes, 3, 'Push', 'a');
    expect(rirs(solo, 3)).toEqual(['', '', '0']);
    expect(rirs(solo, 4)).toEqual(['', '', '']);
    expect(rirs(solo, 2)).toEqual(['', '', '']);
  });

  it('«Deshacer» y «Volver a como estaba» devuelven la herencia', () => {
    const antes = programa();
    const p = ponerPautaIn(antes, 3, 'Push', 'a', conRir(tres(), 2, '0'));
    const deshecho = restaurarPautaIn(p, antes, 3, 'Push', 'a');
    expect(rirs(deshecho, 3)).toEqual(['', '', '']);
    expect(deshecho.blocks[0].pautas).toBeUndefined();

    const vuelto = volverAlAnteriorIn(p, 3, 'a');
    expect(rirs(vuelto, 3)).toEqual(['', '', '']);
    expect(rirs(vuelto, 4)).toEqual(['', '', '']);
    expect(vuelto.blocks[0].pautas).toBeUndefined();
    /* Sin pauta propia no hay nada que soltar. */
    expect(volverAlAnteriorIn(programa(), 3, 'a')).toEqual(programa());
  });

  it('«Deshacer» también devuelve la definición, si el cambio fue en M1', () => {
    const antes = programa();
    const p = ponerPautaIn(antes, 1, 'Push', 'a', conRir(tres(), 0, '3'));
    expect(pauta(restaurarPautaIn(p, antes, 1, 'Push', 'a'), 1)).toEqual(tres());
  });

  it('las series que ya no existen en la definición se ignoran en los microciclos', () => {
    const cuatro = programa({ sets: [...tres(), serie('8-10')] });
    const conM3 = ponerPautaIn(cuatro, 3, 'Push', 'a', conRir(pauta(cuatro, 3), 3, '0'));
    /* La definición baja a tres: lo escrito en la cuarta de M3 no rompe nada. */
    const p = ponerPautaIn(conM3, 1, 'Push', 'a', tres());
    expect(pauta(p, 3)).toHaveLength(3);
    expect(rirs(p, 4)).toEqual(['', '', '']);
  });

  it('añadir una serie en un microciclo copia rango, carga y RIR de la última', () => {
    const base = programa({ sets: tres('6-8', '100', '2') });
    const p = ponerPautaIn(base, 2, 'Push', 'a', [...pauta(base, 2), { ...pauta(base, 2)[2] }]);
    expect(pautasDelBloque(p.blocks[0]).a.mc2).toEqual({ n: 4 });
    expect(pauta(p, 4)[3]).toMatchObject({ targetReps: '6-8', targetKg: '100', targetRir: '2' });
  });

  it('un ejercicio que entra por excepción tiene su propia cadena', () => {
    const o = buildOverride({ dayName: 'Push', fromWeek: 2, toWeek: null, exercise: ej('c', 'Face pull', tres('15')) });
    const p0 = putOverrideIn(programa(), 'b1', o);
    /* M2 es su primera semana: se escribe en la excepción. */
    const p = ponerPautaIn(p0, 2, 'Push', 'c', conRir(tres('15'), 0, '1'));
    expect(pauta(p, 2, 'c')[0].targetRir).toBe('1');
    expect(p.blocks[0].overrides[0].exercise.sets[0].targetRir).toBe('1');
    const p3 = ponerPautaIn(p, 3, 'Push', 'c', conRir(pauta(p, 3, 'c'), 2, '0'));
    expect(pauta(p3, 2, 'c')[2].targetRir).toBe('');
    expect(pauta(p3, 4, 'c')[2].targetRir).toBe('0');
  });

  it('cambiar el ejercicio por otro se lleva su pauta de cada microciclo', () => {
    const p = ponerPautaIn(programa(), 3, 'Push', 'a', conRir(tres(), 2, '0'));
    const r = renameBlockExerciseIn(p, 'b1', 'Push', 'a', 'Press inclinado', { id: 'z' });
    expect(pautasDelBloque(r.blocks[0])).toEqual({ z: { mc3: { series: { 2: { targetRir: '0' } } } } });
    expect(pauta(r, 3, 'a')).toBeNull();
    expect(pauta(r, 4, 'z').map((s) => s.targetRir)).toEqual(['', '', '0']);
  });

  it('el microciclo sin id lo recibe al guardar su pauta', () => {
    const p0 = programa();
    const sinId = { ...p0, microcycles: p0.microcycles.map((m) => (m.weekNumber === 3 ? { ...m, id: undefined } : m)) };
    const p = ponerPautaIn(sinId, 3, 'Push', 'a', conRir(tres(), 2, '0'));
    const id = p.microcycles[2].id;
    expect(id).toBeTruthy();
    expect(pautasDelBloque(p.blocks[0]).a[id]).toBeTruthy();
    expect(rirs(p, 3)).toEqual(['', '', '0']);
  });
});

describe('lo que leen la vista de bloque, la hoja y la app del cliente', () => {
  it('la vista de bloque con un microciclo delante enseña su pauta', () => {
    const p = ponerPautaIn(programa(), 3, 'Push', 'a', [...tres(), serie('8-10')]);
    expect(blockPlan(p, p.blocks[0], { semana: 3 }).sessions[0].exercises[0].series).toBe(4);
    expect(blockPlan(p, p.blocks[0], { semana: 2 }).sessions[0].exercises[0].series).toBe(3);
    expect(blockPlan(p, p.blocks[0]).sessions[0].exercises[0].series).toBe(3);
  });

  it('la hoja y la sesión del cliente leen la pauta de su microciclo, también en `days`', () => {
    const p = proyectarPlanEnDias(ponerPautaIn(programa(), 3, 'Push', 'a', conRir(tres(), 2, '0')));
    expect(planOfDay(p, 3, 'Push').exercises[0].sets[2].targetRir).toBe('0');
    expect(planOfDay(p, 2, 'Push').exercises[0].sets[2].targetRir).toBe('');
    /* Lo que lee `log_session_set` al crear la sesión. */
    expect(p.microcycles[3].days[0].exercises[0].sets[2].targetRir).toBe('0');
    expect(p.microcycles[1].days[0].exercises[0].sets[2].targetRir).toBe('');
  });
});

describe('la foto de la pauta en las sesiones hechas', () => {
  it('sella lo que cambia, venga de donde venga, y deja lo demás', () => {
    const antes = programa({ sesiones: { 2: [hecha()], 3: [{ ...hecha(), id: 's3', entries: [] }] } });
    const despues = ponerPautaIn(antes, 1, 'Push', 'a', conRir(tres(), 2, '0'));
    const sellado = sellarPautasIn(antes, despues);
    /* M2 tenía una sesión hecha y su pauta cambió: guarda la de antes. */
    expect(sellado.microcycles[1].sessions[0].pauta.a.map((s) => s.targetRir)).toEqual(['', '', '']);
    /* La de M3 no tiene nada anotado: no se sella. */
    expect(sellado.microcycles[2].sessions[0].pauta).toBeUndefined();
  });

  it('no sella lo que no cambia, ni vuelve a sellar lo sellado', () => {
    const antes = programa({ sesiones: { 2: [hecha()] } });
    const despues = ponerPautaIn(antes, 3, 'Push', 'a', conRir(tres(), 2, '0'));
    expect(sellarPautasIn(antes, despues)).toBe(despues);

    const una = sellarPautasIn(antes, ponerPautaIn(antes, 2, 'Push', 'a', conRir(tres(), 2, '1')));
    const foto = una.microcycles[1].sessions[0].pauta;
    const otra = sellarPautasIn(una, ponerPautaIn(una, 2, 'Push', 'a', conRir(tres(), 2, '3')));
    expect(otra.microcycles[1].sessions[0].pauta).toBe(foto);
  });

  it('la sesión sellada enseña lo que pedía, no lo que pide ahora', () => {
    const antes = programa({ sesiones: { 2: [hecha()] } });
    const p = sellarPautasIn(antes, ponerPautaIn(antes, 2, 'Push', 'a', conRir(tres(), 2, '0')));
    const vista = mergePlanWithSession(planOfDay(p, 2, 'Push'), p.microcycles[1].sessions[0]);
    expect(vista[0].sets.map((s) => s.targetRir)).toEqual(['', '', '']);
    expect(vista[0].sets[0].reps).toBe('8');
  });
});

describe('quién puede escribir la pauta', () => {
  it('los terminados no; el en curso, solo las hojas sin hacer; los siguientes, sí', () => {
    const p = programa({ sesiones: { 2: [hecha()] } });
    expect(pautaEditableEn(p, 1, 'Push', 2)).toBe(false);
    expect(pautaEditableEn(p, 2, 'Push', 2)).toBe(false);
    expect(pautaEditableEn(p, 3, 'Push', 2)).toBe(true);
    expect(pautaEditableEn(programa(), 2, 'Push', 2)).toBe(true);
    expect(pautaEditableEn(p, 1, 'Push', null)).toBe(true);
  });
});

describe('las líneas de la fila', () => {
  const piramide = [serie('4-6', '140', '1'), serie('8-10', '115', '2'), serie('8-10', '115', '1')];

  it('un grupo son series seguidas con el mismo rango y la misma carga', () => {
    expect(gruposDeSeries(tres('8-10', '100', '2')).map((g) => g.n)).toEqual([3]);
    expect(gruposDeSeries(piramide).map((g) => [g.desde, g.n])).toEqual([
      [0, 1],
      [1, 2],
    ]);
    /* Mismo peso y distinto rango: dos líneas, nunca «8-12». */
    expect(gruposDeSeries([serie('8-10', '100'), serie('10-12', '100')]).map((g) => g.n)).toEqual([1, 1]);
    /* El RIR no parte el grupo. */
    expect(gruposDeSeries(conRir(tres('8-10', '100', '2'), 2, '0')).map((g) => g.n)).toEqual([3]);
    /* Pirámide de tres. */
    const tresGrupos = [serie('10', '100'), serie('8', '110'), serie('6', '120'), serie('6', '120')];
    expect(gruposDeSeries(tresGrupos).map((g) => g.n)).toEqual([1, 1, 2]);
  });

  it('cada celda dice lo suyo: RIR serie a serie, una vez si es el mismo', () => {
    const [primero, segundo] = gruposDeSeries(piramide);
    expect(celdasDeGrupo(primero)).toEqual({ n: 1, reps: '4-6', kg: '140', rir: ['1'] });
    expect(celdasDeGrupo(segundo)).toEqual({ n: 2, reps: '8-10', kg: '115', rir: ['2', '1'] });
    const [iguales] = gruposDeSeries(tres('8-10', '', '1'));
    expect(celdasDeGrupo(iguales)).toEqual({ n: 3, reps: '8-10', kg: '', rir: ['1'] });
  });

  it('la carga, sin unidad, con coma y con el signo del lastre', () => {
    expect(cifra('87.5')).toBe('87,5');
    expect(cifra('+15')).toBe('+15');
    expect(cifra('+7.5')).toBe('+7,5');
    expect(cifra('')).toBe('');
  });

  it('separar la primera la saca a su línea sin escribir nada; juntar solo cuando vuelven a ser iguales', () => {
    const iguales = tres('8-10', '100', '2');
    const separadas = gruposDeSeries(iguales, { separarPrimera: true });
    expect(separadas.map((g) => g.n)).toEqual([1, 2]);
    expect(primerosIguales(separadas)).toBe(true);
    expect(primerosIguales(gruposDeSeries(piramide, { separarPrimera: true }))).toBe(false);
    expect(primerosIguales(gruposDeSeries(iguales))).toBe(false);
  });

  it('bitácora: una línea por grupo, sin comprimir', () => {
    expect(pautaDicha(tres())).toBe('3 × 8-10');
    expect(pautaDicha(piramide)).toBe('1 × 4-6 · 140 · RIR 1 / 2 × 8-10 · 115 · RIR 2 1');
    expect(esquemaEnLinea([serie('6-8'), serie('8-10'), serie('8-12')])).toBe('3 × 6-8 / 8-10 / 8-12');
    expect(esquemaEnLinea([serie('6-8'), serie('6-8'), serie('8-12')])).toBe('2 × 6-8 / 1 × 8-12');
  });
});

describe('escribir una línea', () => {
  const piramide = [serie('4-6', '140', '1'), serie('8-10', '115', '2'), serie('8-10', '115', '1')];
  const grupos = gruposDeSeries(piramide);

  it('el número: subir copia la última de su línea, bajar quita por el final, 0 quita la línea', () => {
    const mas = conSeriesDelGrupo(piramide, grupos, 0, '2');
    expect(mas.map((s) => [s.targetReps, s.targetKg, s.targetRir])).toEqual([
      ['4-6', '140', '1'],
      ['4-6', '140', '1'],
      ['8-10', '115', '2'],
      ['8-10', '115', '1'],
    ]);
    expect(conSeriesDelGrupo(piramide, grupos, 1, '1')).toHaveLength(2);
    expect(conSeriesDelGrupo(piramide, grupos, 0, '0')).toHaveLength(2);
    /* La única línea no se quita, y lo que no es cifra no escribe. */
    expect(conSeriesDelGrupo(tres(), gruposDeSeries(tres()), 0, '0')).toBeNull();
    expect(conSeriesDelGrupo(piramide, grupos, 0, 'x')).toBeNull();
    expect(conSeriesDelGrupo(piramide, grupos, 0, '1')).toBeNull();
    /* El tope: doce en total. */
    expect(conSeriesDelGrupo(piramide, grupos, 0, '40')).toHaveLength(12);
  });

  it('el rango y la carga valen para la línea; si igualan a la vecina, se juntan', () => {
    const rango = conCampoDelGrupo(piramide, grupos, 0, 'targetReps', '8 10');
    expect(rango[0].targetReps).toBe('8-10');
    const carga = conCampoDelGrupo(rango, gruposDeSeries(rango), 0, 'targetKg', '115 kg');
    expect(gruposDeSeries(carga).map((g) => g.n)).toEqual([3]);
    expect(conCampoDelGrupo(piramide, grupos, 0, 'targetReps', '')).toBeNull();
    expect(conCampoDelGrupo(piramide, grupos, 0, 'targetKg', '140')).toBeNull();
    expect(conCampoDelGrupo(piramide, grupos, 0, 'targetKg', '+15')[0].targetKg).toBe('+15');
  });

  it('el RIR: una cifra para toda la línea, varias una por serie, o solo la tocada', () => {
    expect(conCampoDelGrupo(piramide, grupos, 1, 'targetRir', '0').map((s) => s.targetRir)).toEqual(['1', '0', '0']);
    expect(conCampoDelGrupo(piramide, grupos, 1, 'targetRir', '3 2').map((s) => s.targetRir)).toEqual(['1', '3', '2']);
    expect(conCampoDelGrupo(piramide, grupos, 1, 'targetRir', '3·2').map((s) => s.targetRir)).toEqual(['1', '3', '2']);
    expect(conCampoDelGrupo(piramide, grupos, 1, 'targetRir', '0', { serie: 1 }).map((s) => s.targetRir)).toEqual([
      '1',
      '2',
      '0',
    ]);
    expect(conCampoDelGrupo(piramide, grupos, 1, 'targetRir', '–', { serie: 0 })[1].targetRir).toBe('');
  });

  it('añadir serie copia la última', () => {
    expect(conOtraSerie(piramide)[3]).toMatchObject({ targetReps: '8-10', targetKg: '115', targetRir: '1' });
    expect(conOtraSerie(Array.from({ length: 12 }, () => serie('8')))).toBeNull();
  });

  it('en M2 no pisa lo que M3 tiene propio', () => {
    const base = programa({ sets: piramide });
    const conM3 = ponerPautaIn(base, 3, 'Push', 'a', pauta(base, 3).map((s, i) => (i === 0 ? { ...s, targetKg: '145' } : s)));
    const m2 = pauta(conM3, 2);
    const p = ponerPautaIn(conM3, 2, 'Push', 'a', conCampoDelGrupo(m2, gruposDeSeries(m2), 0, 'targetKg', '130'));
    expect(pauta(p, 2)[0].targetKg).toBe('130');
    expect(pauta(p, 3)[0].targetKg).toBe('145');
    expect(pauta(p, 3)[0].targetReps).toBe('4-6');
  });

  it('quitar una línea en M3 deja sin efecto los índices de M4 que ya no existen', () => {
    const base = programa({ sets: piramide });
    const conM4 = ponerPautaIn(base, 4, 'Push', 'a', conRir(pauta(base, 4), 2, '0'));
    const m3 = pauta(conM4, 3);
    const p = ponerPautaIn(conM4, 3, 'Push', 'a', conSeriesDelGrupo(m3, gruposDeSeries(m3), 1, '0'));
    expect(pauta(p, 3)).toHaveLength(1);
    expect(rirs(p, 4)).toEqual(['1']);
  });
});

describe('lo que cambia respecto al anterior', () => {
  it('marca por partes, y nada sin anterior', () => {
    expect(cambiosEntre(null, tres())).toBeNull();
    expect(cambiosEntre(tres(), conRir(tres(), 2, '0'))).toEqual({ n: false, kg: false, reps: false, rir: true });
    /* Una serie más que copia la última cambia el número, no la carga. */
    expect(cambiosEntre(tres('8-10', '70'), [...tres('8-10', '70'), serie('8-10', '70')])).toEqual({
      n: true,
      kg: false,
      reps: false,
      rir: false,
    });
  });

  it('línea a línea y cifra a cifra', () => {
    const antes = [serie('4-6', '140', '1'), serie('8-10', '115', '2'), serie('8-10', '115', '2')];
    const ahora = [serie('4-6', '140', '1'), serie('8-10', '120', '2'), serie('8-10', '120', '1')];
    const grupos = gruposDeSeries(ahora);
    expect(marcasDeGrupos(antes, grupos)).toEqual([
      { n: false, reps: false, kg: false, rir: [false] },
      { n: false, reps: false, kg: true, rir: [false, true] },
    ]);
    expect(marcasDeGrupos(null, grupos)).toEqual([null, null]);
    /* Separar la primera en los dos lados no marca nada. */
    const iguales = tres('8-10', '100', '2');
    expect(marcasDeGrupos(iguales, gruposDeSeries(iguales, { separarPrimera: true }), { separarPrimera: true })).toEqual([
      { n: false, reps: false, kg: false, rir: [false] },
      { n: false, reps: false, kg: false, rir: [false, false] },
    ]);
  });
});
