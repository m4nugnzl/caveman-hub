/**
 * La poda de equivalencias, pasada por el catálogo entero.
 *
 * ══ Por qué esta prueba y no más casos en `foodEquiv.test.js` ══════════════
 *
 * Porque lo que hay que vigilar aquí no es lo que la lista enseña sino **lo
 * que NO enseña**, y eso no se ve. Un caso inventado prueba que la regla hace
 * lo que quien la escribió pensaba; lo que se escapa es el alimento que entra
 * en el catálogo dentro de seis meses y cae del lado malo de la regla sin que
 * nadie abra esa pantalla.
 *
 * Así que la lista de lo que se tapa está ESCRITA, y sale de leer las
 * migraciones que llenan `catalog_foods`. Si mañana entra un alimento y la
 * regla se lo come, esta prueba lo canta con nombre y apellidos. Es la misma
 * disciplina de `catalogo.test.js`: un dato generado que nadie se acuerda de
 * mirar se compara con el de verdad y se rompe si no coinciden.
 *
 * ══ Qué hace cada línea de la lista ════════════════════════════════════════
 *
 * `A ✂ B` se lee «abriendo las equivalencias de A, B no sale». Están las dos
 * direcciones a propósito: la regla tiene que medir igual a la fuente y al
 * candidato, y si una de las dos faltara sería que no.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { candidatosDeGrupo, comoFila, laMismaFila } from './foodEquiv';
import { foodMacros } from './nutrition';

/* ── El catálogo, tal como queda tras las migraciones ────────────────────── */

const MIGRACIONES = [
  'supabase/migrations/0033_catalog.sql',
  'supabase/migrations/0096_la_despensa_espanola.sql',
];

/* ('Nombre', 'Familia', proteína, hidratos, grasas, unidad, gramos[, tags]) */
const FILA =
  /^\s*\('((?:[^']|'')+)',\s*'([^']+)',\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*(NULL|'[^']*'),\s*(NULL|\d+)/;

const insertados = () => {
  const filas = [];
  for (const archivo of MIGRACIONES) {
    let dentro = false;
    for (const linea of readFileSync(archivo, 'utf8').split('\n')) {
      if (/INSERT INTO public\.catalog_foods/.test(linea)) dentro = true;
      else if (dentro && /^(ON CONFLICT|;|COMMIT)/.test(linea.trim())) dentro = false;
      else if (dentro) {
        const m = FILA.exec(linea);
        if (m) {
          filas.push({
            name: m[1].replace(/''/g, "'"),
            category: m[2],
            proteinPer100: Number(m[3]),
            carbsPer100: Number(m[4]),
            fatsPer100: Number(m[5]),
            unitLabel: m[6] === 'NULL' ? null : m[6].slice(1, -1),
            unitGrams: m[7] === 'NULL' ? null : Number(m[7]),
          });
        }
      }
    }
  }
  return filas;
};

/* Los que la 0115 borra, leídos de su propia lista de pares para que no haya
   dos versiones de la misma verdad. */
const borrados = () => {
  const sql = readFileSync('supabase/migrations/0115_el_catalogo_sin_duplicados.sql', 'utf8');
  const pares = /INSERT INTO duplicados[\s\S]*?;/.exec(sql)?.[0] ?? '';
  return new Set([...pares.matchAll(/,\s*'([^']+)'\)/g)].map((m) => m[1]));
};

const elCatalogo = () => {
  const fuera = borrados();
  const vistos = new Set();
  const filas = [];
  for (const food of insertados()) {
    // `ON CONFLICT (name) DO NOTHING`: la primera que entra es la que manda.
    if (vistos.has(food.name) || fuera.has(food.name)) continue;
    vistos.add(food.name);
    filas.push(food);
  }
  return filas;
};

/** Todo lo que la regla tapa, en ración de 100 g para que no dependa de nada. */
const loQueSeTapa = (catalogo) => {
  const tapados = [];
  for (const food of catalogo) {
    const entry = { ...food, grams: 100 };
    const todos = candidatosDeGrupo(entry, catalogo, []);
    if (!todos) continue;
    const fuente = comoFila(entry, todos.macro, foodMacros(entry).kcal);
    for (const item of todos.items) {
      if (laMismaFila(comoFila(item.food, todos.macro, item.kcal), fuente)) {
        tapados.push(`${food.name} ✂ ${item.food.name}`);
      }
    }
  }
  return tapados.sort();
};

/* ── Lo que se tapa, revisado a mano una por una ─────────────────────────── */

const TAPADOS = [
  // El mismo alimento en el otro estado: es la conversión de peso al cocerlo,
  // no una alternativa que nadie pueda cocinar.
  'Arroz blanco (cocido) ✂ Arroz blanco (crudo)',
  'Arroz blanco (crudo) ✂ Arroz blanco (cocido)',
  'Garbanzos (cocidos) ✂ Garbanzos (crudos)',
  'Garbanzos (crudos) ✂ Garbanzos (cocidos)',
  'Lentejas (cocidas) ✂ Lentejas (crudas)',
  'Lentejas (crudas) ✂ Lentejas (cocidas)',
  'Pasta (cocida) ✂ Pasta (cruda)',
  'Pasta (cruda) ✂ Pasta (cocida)',
  'Pulpo ✂ Pulpo cocido',
  'Pulpo cocido ✂ Pulpo',
  'Quinoa (cocida) ✂ Quinoa (cruda)',
  'Quinoa (cruda) ✂ Quinoa (cocida)',
  // La legumbre de bote es la misma legumbre cocida, con la misma ración.
  'Lentejas (cocidas) ✂ Lentejas cocidas (bote)',
  'Lentejas cocidas (bote) ✂ Lentejas (cocidas)',
  // El tamaño del huevo: dos filas para pesar lo mismo.
  'Huevo entero ✂ Huevo entero L',
  'Huevo entero L ✂ Huevo entero',
  // La clara fresca y la del brik proponen la misma ración.
  'Clara de huevo ✂ Clara de huevo pasteurizada',
  'Clara de huevo pasteurizada ✂ Clara de huevo',
  // La marca, cuando sus números son los del genérico: la fila de marca no
  // añade una decisión, y si tú tienes la tuya en tu biblioteca manda la tuya.
  'Crema de cacahuete ✂ Crema de cacahuete Hacendado',
  'Crema de cacahuete Hacendado ✂ Crema de cacahuete',
  'Pan blanco ✂ Pan de molde blanco Bimbo',
  'Pan de molde blanco Bimbo ✂ Pan blanco',
  'Pan de molde integral ✂ Pan de molde integral Bimbo',
  'Pan de molde integral ✂ Pan integral',
  'Pan de molde integral Bimbo ✂ Pan de molde integral',
  'Pan de molde integral Bimbo ✂ Pan integral',
  'Pan integral ✂ Pan de molde integral',
  'Pan integral ✂ Pan de molde integral Bimbo',
];

describe('la poda de equivalencias sobre el catálogo de verdad', () => {
  const catalogo = elCatalogo();

  it('el catálogo se lee entero: si no, lo de abajo no probaría nada', () => {
    /* Una lista vacía por un parser roto daría todas las demás por buenas, que
       es la manera silenciosa de mentir. */
    expect(catalogo.length).toBe(248);
    expect(catalogo.map((f) => f.name)).toContain('Pechuga de pollo');
    expect(catalogo.map((f) => f.name)).not.toContain('Uvas');
  });

  it('tapa exactamente lo que está escrito, ni un alimento más', () => {
    expect(loQueSeTapa(catalogo)).toEqual([...TAPADOS].sort());
  });

  it('lo que se tapa se tapa en las dos direcciones', () => {
    /* Si «A ✂ B» está y «B ✂ A» no, la lista cambiaría según de dónde se abra
       — y entonces la regla no estaría midiendo con la misma vara. */
    const sueltos = TAPADOS.filter((linea) => {
      const [a, b] = linea.split(' ✂ ');
      return !TAPADOS.includes(`${b} ✂ ${a}`);
    });
    expect(sueltos).toEqual([]);
  });

  it('los alimentos que se parecen pero no son el mismo SÍ se ofrecen', () => {
    /* El otro lado, y el que no se ve mirando la pantalla: estos pares llevan
       el mismo sustantivo y una palabra de más, así que la regla del nombre a
       solas se los comía. */
    const tapados = new Set(loQueSeTapa(catalogo));
    for (const par of [
      ['Mayonesa', 'Mayonesa light'], //            la mitad de grasa
      ['Mayonesa', 'Mayonesa ligera'],
      ['Pasta (cruda)', 'Pasta integral (cruda)'], //  otro cereal
      ['Pechuga de pavo', 'Pechuga de pavo en lonchas'], // fresco y fiambre
      ['Salmón', 'Salmón ahumado'],
      ['Mejillones', 'Mejillones al natural (lata)'],
      ['Tofu', 'Tofu firme'],
      ['Yogur natural', 'Yogur griego natural'],
      ['Espárragos', 'Espárragos verdes'],
      ['Sardinas en lata', 'Sardinas en aceite (lata, escurridas)'],
    ]) {
      expect(tapados.has(`${par[0]} ✂ ${par[1]}`), `${par[0]} tapaba ${par[1]}`).toBe(false);
      expect(tapados.has(`${par[1]} ✂ ${par[0]}`), `${par[1]} tapaba ${par[0]}`).toBe(false);
    }
  });
});
