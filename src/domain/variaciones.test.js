import { describe, expect, it } from 'vitest';

import { menu } from './menu';
import { pautaDeLosDias, pautaEspecialDelDia } from './pautaDelDia';
import {
  cambioDeLaBase,
  choqueDeVariacion,
  conFechas,
  conMenuCambiado,
  conMenuDeLaBase,
  conMismoMenu,
  escalera,
  escalonar,
  filaDelFormulario,
  formularioDe,
  formularioNuevo,
  partiendoDe,
  problemaDelFormulario,
  variacionDeManana,
  variacionesDelCliente,
} from './variaciones';

const comida = (name, gramos = 100) => ({
  id: `m-${name}`,
  name,
  options: [{ id: `o-${name}`, foods: [{ id: `f-${name}`, name: 'Arroz', grams: gramos, proteinPer100: 7, carbsPer100: 78, fatsPer100: 1 }] }],
});

const plan = {
  days: [
    { id: 'alta', name: 'Alta', targets: { targetKcals: 3000, proteinGrams: 180, carbsGrams: 400, fatsGrams: 75 }, meals: [comida('Desayuno'), comida('Cena')] },
    { id: 'baja', name: 'Baja', targets: { targetKcals: 2600, proteinGrams: 180, carbsGrams: 300, fatsGrams: 70 }, meals: [] },
  ],
};

const refeed = { id: 'r1', kind: 'refeed', date: '2026-10-10', hasta: '2026-10-12', kcal: 3400 };
const vacaciones = { id: 'v1', kind: 'rest', date: '2026-10-11', hasta: '2026-10-20' };

describe('los solapes', () => {
  it('dice con qué variación choca un tramo', () => {
    expect(choqueDeVariacion([refeed], { desde: '2026-10-12', hasta: '2026-10-14' })).toBe(refeed);
    expect(choqueDeVariacion([refeed], { desde: '2026-10-13', hasta: '2026-10-14' })).toBeNull();
  });
  it('no choca consigo misma al editarla', () => {
    expect(choqueDeVariacion([refeed], { desde: '2026-10-10', hasta: '2026-10-12', id: 'r1' })).toBeNull();
  });
  it('unas vacaciones pueden coincidir con una variación', () => {
    expect(choqueDeVariacion([vacaciones], { desde: '2026-10-12', hasta: '2026-10-13' })).toBeNull();
  });
});

describe('la escalera', () => {
  it('reparte en línea recta, redondeado, y respeta los extremos', () => {
    expect(escalera(3000, 3600, 4, 10)).toEqual([3000, 3200, 3400, 3600]);
    expect(escalera(300, 413, 3, 5)).toEqual([300, 355, 413]);
    expect(escalera(3000, 3600, 1)).toEqual([3000]);
  });
  it('en el formulario, cada macro por su lado', () => {
    let f = formularioNuevo({ plan, desde: '2026-10-10', hasta: '2026-10-12', diaId: 'alta' });
    f = { ...f, modo: 'dias', dias: f.dias.map((d, i) => (i === 2 ? { ...d, carbohidratos: '600' } : d)) };
    expect(escalonar(f).dias.map((d) => d.carbohidratos)).toEqual(['400', '500', '600']);
    expect(escalonar(f).dias.map((d) => d.proteina)).toEqual(['180', '180', '180']);
  });
});

describe('«Parte de»', () => {
  it('copia las cifras del tipo de día y las congela', () => {
    const f = formularioNuevo({ plan, desde: '2026-10-10', diaId: 'baja' });
    expect(f.igual).toMatchObject({ proteina: '180', carbohidratos: '300', grasa: '70' });
    expect(f.parteDe).toMatchObject({ diaId: 'baja', kcal: 2600 });
    expect(partiendoDe(f, plan, 'alta').igual.carbohidratos).toBe('400');
  });
  it('avisa del primer día en que la dieta base cambió ese tipo de día', () => {
    const e = { parteDe: { diaId: 'alta', kcal: 3000, proteina: 180, carbohidratos: 400, grasa: 75 }, createdAt: '2026-09-26T10:00:00Z' };
    const igual = { dia: '2026-09-28', nutrition: plan };
    const otro = { dia: '2026-10-02', nutrition: { days: [{ ...plan.days[0], targets: { ...plan.days[0].targets, carbsGrams: 350, targetKcals: 2800 } }] } };
    const antes = { dia: '2026-09-01', nutrition: { days: [] } };
    expect(cambioDeLaBase(e, [antes, igual])).toBeNull();
    expect(cambioDeLaBase(e, [antes, igual, otro])).toEqual({ fecha: '2026-10-02', sinElDia: false });
    expect(cambioDeLaBase(e, [{ dia: '2026-10-05', nutrition: { days: [plan.days[1]] } }])).toEqual({ fecha: '2026-10-05', sinElDia: true });
  });
});

describe('guardar el formulario', () => {
  it('igual cada día: cifras en sus columnas, sin pauta por día', () => {
    const fila = filaDelFormulario(formularioNuevo({ plan, desde: '2026-10-10', hasta: '2026-10-11', diaId: 'alta' }));
    expect(fila).toMatchObject({ kind: 'refeed', date: '2026-10-10', hasta: '2026-10-11', proteina: 180, carbohidratos: 400, grasa: 75, pautaDias: null, menus: null });
  });
  it('por día: la pauta de cada día y nada en las columnas', () => {
    const f = { ...formularioNuevo({ plan, desde: '2026-10-10', hasta: '2026-10-11', diaId: 'alta' }), modo: 'dias' };
    const fila = filaDelFormulario(f);
    expect(fila.kcal).toBeNull();
    expect(fila.pautaDias).toHaveLength(2);
  });
  it('en kcal, un día con sus macros intactas las conserva', () => {
    const e = {
      id: 'r3',
      kind: 'refeed',
      date: '2026-10-10',
      hasta: '2026-10-11',
      pautaDias: [{ kcal: 2600 }, { kcal: 2660, proteina: 150, carbohidratos: 380, grasa: 60 }],
    };
    const f = formularioDe(e);
    expect(f.unidad).toBe('kcal');
    expect(filaDelFormulario(f).pautaDias[1]).toMatchObject({ proteina: 150, carbohidratos: 380, grasa: 60 });
    const tocado = { ...f, dias: f.dias.map((d, i) => (i === 1 ? { ...d, kcal: '2800' } : d)) };
    expect(filaDelFormulario(tocado).pautaDias[1]).toMatchObject({ proteina: null, kcal: 2800 });
  });
  it('dice lo que falta', () => {
    const f = formularioNuevo({ plan, desde: '2026-10-10', diaId: 'alta' });
    expect(problemaDelFormulario({ ...f, igual: { ...f.igual, grasa: '' } })).toMatch(/las tres o ninguna/);
    expect(problemaDelFormulario({ ...f, modo: 'dias' })).toMatch(/dos días/);
    expect(problemaDelFormulario(f)).toBeNull();
  });
  it('vuelve a abrir una variación escalonada tal como se guardó', () => {
    const e = {
      id: 'r2',
      kind: 'refeed',
      date: '2026-10-10',
      hasta: '2026-10-11',
      pautaDias: [
        { kcal: 3000, proteina: 180, carbohidratos: 400, grasa: 75 },
        { kcal: 3400, proteina: 180, carbohidratos: 500, grasa: 75 },
      ],
      menus: [[comida('A')], [comida('B')]],
    };
    const f = formularioDe(e, 'Semana dura');
    expect(f).toMatchObject({ modo: 'dias', unidad: 'macros', conMenu: true, mismoMenu: false, motivo: 'Semana dura' });
    expect(f.dias[1].carbohidratos).toBe('500');
  });
});

describe('el menú de la variación', () => {
  const base = formularioNuevo({ plan, desde: '2026-10-10', hasta: '2026-10-12', diaId: 'alta' });

  it('«Añadir menú» copia el del día base a todos los días, con ids nuevos', () => {
    const f = conMenuDeLaBase(base, plan);
    expect(f.menus).toHaveLength(3);
    expect(f.menus[0].map((m) => m.name)).toEqual(['Desayuno', 'Cena']);
    expect(f.menus[0][0].id).not.toBe('m-Desayuno');
  });
  it('con «el mismo menú», un cambio va a todos; sin él, solo a su día', () => {
    const f = conMenuDeLaBase(base, plan);
    const todos = conMenuCambiado(f, 1, (m) => menu.quitarComida(m, 0));
    expect(todos.menus.map((m) => m.length)).toEqual([1, 1, 1]);
    const suelto = conMenuCambiado(conMismoMenu(f, false), 1, (m) => menu.quitarComida(m, 0));
    expect(suelto.menus.map((m) => m.length)).toEqual([2, 1, 2]);
  });
  it('al guardar, un menú por día; un día vacío es un día sin menú', () => {
    const f = conMenuCambiado(conMismoMenu(conMenuDeLaBase(base, plan), false), 2, () => []);
    const fila = filaDelFormulario(f);
    expect(fila.menus).toHaveLength(3);
    expect(fila.menus[2]).toBeNull();
  });
  it('un menú sin alimentos no se guarda: ese día va sin menú', () => {
    const vacio = formularioNuevo({ plan, desde: '2026-10-10', diaId: 'baja' });
    expect(conMenuDeLaBase(vacio, plan).menus[0][0].name).toBe('Comida 1');
    expect(filaDelFormulario(conMenuDeLaBase(vacio, plan)).menus).toBeNull();
  });
  it('al cambiar las fechas, los menús siguen a los días', () => {
    const f = conFechas(conMenuDeLaBase(base, plan), { hasta: '2026-10-13' });
    expect(f.menus).toHaveLength(4);
    expect(f.dias).toHaveLength(4);
  });
});

describe('lo que ve el cliente', () => {
  const conMenu = { ...refeed, menus: [[comida('A')], null, [comida('C')]] };
  it('el día de una variación con menú, el suyo; sin menú ese día, ninguno', () => {
    expect(pautaEspecialDelDia([conMenu], '2026-10-10').menu[0].name).toBe('A');
    expect(pautaEspecialDelDia([conMenu], '2026-10-11').menu).toBeNull();
  });
  it('la víspera: «Mañana: refeed · día 1 de 3»', () => {
    expect(variacionDeManana([refeed], '2026-10-09')).toMatchObject({ nombre: 'Refeed', dias: 3, kcals: 3400 });
    expect(variacionDeManana([refeed], '2026-10-10')).toBeNull();
  });
  it('la variación manda sobre la dieta de esos días', () => {
    const semana = { lunes: '2026-10-05', pauta: { kcals: 2600, tipos: [{ n: 'Baja', kcals: 2600 }] } };
    const dias = pautaDeLosDias({ semana, hechos: [refeed] });
    expect(dias.find((d) => d.fecha === '2026-10-10').kcals).toBe(3400);
    expect(dias.find((d) => d.fecha === '2026-10-09').kcals).toBe(2600);
  });
});

describe('en la dieta del entrenador', () => {
  it('reparte en curso, previstas y pasadas', () => {
    const pasada = { id: 'p', kind: 'diet_break', date: '2026-08-01', hasta: '2026-08-07' };
    const r = variacionesDelCliente([refeed, pasada, vacaciones], '2026-10-11');
    expect(r.enCurso).toEqual([refeed]);
    expect(r.previstas).toEqual([]);
    expect(r.pasadas).toEqual([pasada]);
  });
});
