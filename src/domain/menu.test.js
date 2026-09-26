import { describe, expect, it } from 'vitest';

import { menu, parcheDeAlimento } from './menu';

const comida = (id, foods = []) => ({ id, name: id, note: '', target: null, options: [{ id: `${id}-o`, foods }] });
const arroz = { id: 'f1', name: 'Arroz', grams: 100, showAs: 'grams' };
const huevo = { id: 'f2', name: 'Huevo', grams: 120, unitGrams: 60, showAs: 'units' };

describe('menu: los verbos del menú de un día', () => {
  it('quitar y restaurar una comida la devuelve a su sitio', () => {
    const ms = [comida('a'), comida('b'), comida('c')];
    const sin = menu.quitarComida(ms, 1);
    expect(sin.map((m) => m.id)).toEqual(['a', 'c']);
    expect(menu.restaurarComida(sin, 1, ms[1])).toEqual(ms);
  });

  it('una comida nunca se queda sin alternativas; una lista vacía no se escribe', () => {
    const ms = [comida('a')];
    expect(menu.quitarOpcion(ms, 0, 0)).toEqual(ms);
    expect(menu.ponerOpciones(ms, 0, [])).toEqual(ms);
  });

  it('un objetivo que se queda a cero es «sin objetivo»', () => {
    const con = menu.objetivoDeComida([comida('a')], 0, 'kcal', '600');
    expect(con[0].target).toEqual({ kcal: '600' });
    expect(menu.objetivoDeComida(con, 0, 'kcal', '0')[0].target).toBeNull();
  });

  it('duplicar una alternativa la pone detrás, con ids nuevos', () => {
    const ms = [comida('a', [arroz])];
    const [m] = menu.duplicarOpcion(ms, 0, 0);
    expect(m.options).toHaveLength(2);
    expect(m.options[1].foods[0].name).toBe('Arroz');
    expect(m.options[1].id).not.toBe(m.options[0].id);
  });

  it('quitar y restaurar un alimento lo devuelve a su sitio', () => {
    const ms = [comida('a', [arroz, huevo])];
    const sin = menu.quitarAlimento(ms, 0, 0, 'f1');
    expect(menu.restaurarAlimento(sin, 0, 0, arroz, 0)).toEqual(ms);
  });

  it('los parches: gramos con coma, lente, y la ficha respeta cómo se veía', () => {
    const ms = [comida('a', [arroz, huevo])];
    const cambia = (id, parche) => menu.cambiarAlimento(ms, 0, 0, id, parche)[0].options[0].foods;
    expect(cambia('f1', parcheDeAlimento.gramos('75,5'))[0].grams).toBe(75.5);
    expect(cambia('f2', parcheDeAlimento.mostrarComo('grams'))[1].showAs).toBe('grams');
    expect(cambia('f1', parcheDeAlimento.ficha({ unitGrams: 30 }))[0].showAs).toBe('units');
    expect(cambia('f2', parcheDeAlimento.ficha({ unitGrams: 50 }))[1].showAs).toBe('units');
    expect(cambia('f2', parcheDeAlimento.ficha({ unitGrams: null }))[1].showAs).toBe('grams');
  });

  it('el sustituto no arrastra claves de otro dominio', () => {
    const [f] = menu.cambiarAlimento([comida('a', [arroz])], 0, 0, 'f1', parcheDeAlimento.sustituto({ ...huevo, category: 'x' }))[0]
      .options[0].foods;
    expect(f).not.toHaveProperty('category');
    expect(f.id).toBe('f1');
    expect(f.name).toBe('Huevo');
  });
});
