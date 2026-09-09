import { describe, expect, it } from 'vitest';

import {
  CONDICIONABLES,
  MAX_ELEMENTOS,
  MAX_OPCIONES,
  PLANTILLAS,
  anadirElemento,
  aterrizar,
  candidatosDeRegla,
  columnasDe,
  cuentaElementos,
  defaultElemento,
  duplicarElementos,
  editarElemento,
  elementosDePlantilla,
  elementosVisibles,
  esPregunta,
  faltanObligatorias,
  fraseDeRegla,
  moverElemento,
  quitarElemento,
  reglaPorDefecto,
  respuestaLegible,
  resumenElementos,
  sanitizeElemento,
  sanitizeElementos,
  tipoById,
  tocaAntropometria,
  tiposDe,
  visible,
} from './formulario';

const el = (tipo, extra = {}) => ({ ...defaultElemento(tipo), ...extra });

describe('formulario · el catálogo', () => {
  it('cada tipo pertenece a una de las tres familias y trae su destino', () => {
    for (const t of [...tiposDe('pregunta'), ...tiposDe('oficio'), ...tiposDe('estructura')]) {
      expect(['pregunta', 'oficio', 'estructura']).toContain(t.fam);
      expect(t.cae).toBeTruthy();
    }
  });

  it('la estructura no pregunta nada', () => {
    for (const t of tiposDe('estructura')) {
      expect(esPregunta({ tipo: t.id })).toBe(false);
      expect(t.cae).toBe('nada');
    }
  });

  it('lo del oficio no cae en la entrega: cae donde vive ese dato', () => {
    for (const t of tiposDe('oficio')) {
      expect(t.cae).not.toBe('respuesta');
    }
  });

  it('una escala se dibuja: su destino es una serie', () => {
    expect(tipoById('escala').cae).toBe('serie');
  });
});

describe('formulario · el saneado', () => {
  it('descarta lo que no sabe pintar en vez de dejar un hueco', () => {
    expect(sanitizeElemento({ id: 'x', tipo: 'inventado' })).toBeNull();
    expect(sanitizeElemento({ tipo: 'texto' })).toBeNull();
  });

  it('una elección sin opciones no es una elección: se le devuelven las de fábrica', () => {
    const sano = sanitizeElemento({ id: 'a', tipo: 'una', ops: [] });
    expect(sano.ops.length).toBeGreaterThan(0);
  });

  it('acota las opciones y el enunciado', () => {
    const sano = sanitizeElemento({
      id: 'a',
      tipo: 'varias',
      enun: 'x'.repeat(400),
      ops: Array.from({ length: 30 }, (_, i) => `op ${i}`),
    });
    expect(sano.ops).toHaveLength(MAX_OPCIONES);
    expect(sano.enun.length).toBeLessThanOrEqual(140);
  });

  it('la estructura nunca sale obligatoria, aunque venga marcada', () => {
    expect(sanitizeElemento({ id: 'a', tipo: 'apartado', oblig: true }).oblig).toBe(false);
  });

  it('una escala al revés se endereza: el máximo siempre por encima del mínimo', () => {
    const sano = sanitizeElemento({ id: 'a', tipo: 'escala', min: 8, max: 2 });
    expect(sano.max).toBeGreaterThan(sano.min);
  });

  it('quita ids repetidos: dos renglones con el mismo id se pisan la respuesta', () => {
    const uno = el('texto', { id: 'mismo' });
    const dos = el('numero', { id: 'mismo' });
    expect(sanitizeElementos([uno, dos])).toHaveLength(1);
  });

  it('respeta el tope', () => {
    const muchos = Array.from({ length: 40 }, () => el('texto'));
    expect(sanitizeElementos(muchos)).toHaveLength(MAX_ELEMENTOS);
  });
});

describe('formulario · las reglas solo miran hacia atrás', () => {
  it('tira la regla que apunta a un elemento POSTERIOR: sería un ciclo', () => {
    const a = el('sino');
    const b = el('texto');
    b.regla = { de: a.id, op: 'es', valor: 'si' };
    /* Con b delante de a, la regla mira hacia delante y no se puede evaluar. */
    const sano = sanitizeElementos([b, a]);
    expect(sano[0].regla).toBeUndefined();
  });

  it('la conserva cuando el elemento del que depende va antes', () => {
    const a = el('sino');
    const b = el('texto');
    b.regla = { de: a.id, op: 'es', valor: 'si' };
    expect(sanitizeElementos([a, b])[1].regla).toBeTruthy();
  });

  it('tira la regla que apunta a algo que no existe', () => {
    const b = el('texto', { regla: { de: 'fantasma', op: 'es', valor: 'si' } });
    expect(sanitizeElementos([b])[0].regla).toBeUndefined();
  });

  it('solo se puede depender de una respuesta cerrada', () => {
    const abierto = el('parrafo');
    const dependiente = el('texto', { regla: { de: abierto.id, op: 'es', valor: 'x' } });
    expect(sanitizeElementos([abierto, dependiente])[1].regla).toBeUndefined();
    for (const tipo of CONDICIONABLES) expect(tipoById(tipo)).toBeTruthy();
  });

  it('mover un elemento por delante de su dependencia retira la regla', () => {
    const a = el('sino');
    const b = el('texto', {});
    b.regla = { de: a.id, op: 'es', valor: 'si' };
    const lista = sanitizeElementos([a, b]);
    const movida = moverElemento(lista, b.id, 'up');
    expect(movida[0].id).toBe(b.id);
    expect(movida[0].regla).toBeUndefined();
  });

  it('quitar el elemento del que dependen otros se lleva sus reglas', () => {
    const a = el('sino');
    const b = el('texto');
    b.regla = { de: a.id, op: 'es', valor: 'si' };
    const sin = quitarElemento(sanitizeElementos([a, b]), a.id);
    expect(sin).toHaveLength(1);
    expect(sin[0].regla).toBeUndefined();
  });

  it('los candidatos de una regla son los anteriores y cerrados', () => {
    const a = el('sino');
    const b = el('parrafo');
    const c = el('texto');
    const lista = [a, b, c];
    expect(candidatosDeRegla(lista, c.id).map((x) => x.id)).toEqual([a.id]);
    expect(candidatosDeRegla(lista, a.id)).toEqual([]);
  });
});

describe('formulario · obedecer la regla', () => {
  const lesion = el('sino', { enun: '¿Arrastras alguna lesión?' });
  const cual = el('texto', { enun: '¿Cuál, y desde cuándo?', oblig: true });
  cual.regla = { de: lesion.id, op: 'es', valor: 'si' };
  const lista = sanitizeElementos([lesion, cual]);

  it('sin contestar lo de arriba, lo de abajo no se enseña', () => {
    expect(elementosVisibles(lista, {})).toHaveLength(1);
  });

  it('al contestar que sí, aparece', () => {
    expect(elementosVisibles(lista, { [lesion.id]: 'si' })).toHaveLength(2);
  });

  it('al contestar que no, sigue sin aparecer', () => {
    expect(elementosVisibles(lista, { [lesion.id]: 'no' })).toHaveLength(1);
  });

  it('una obligatoria ESCONDIDA no impide entregar', () => {
    /* Exigirla dejaría al cliente atrapado sin ver por qué. */
    expect(faltanObligatorias(lista, { [lesion.id]: 'no' })).toHaveLength(0);
    expect(faltanObligatorias(lista, { [lesion.id]: 'si' })).toHaveLength(1);
  });

  it('las comparaciones de número no se hacen con texto', () => {
    const escala = el('escala', { min: 1, max: 10 });
    const porque = el('parrafo', { regla: { de: escala.id, op: 'menorQue', valor: '5' } });
    const dos = sanitizeElementos([escala, porque]);
    expect(visible(dos[1], { [escala.id]: 3 })).toBe(true);
    expect(visible(dos[1], { [escala.id]: 8 })).toBe(false);
    expect(visible(dos[1], { [escala.id]: 'ocho' })).toBe(false);
  });

  it('la regla se lee como una frase, no como tres desplegables', () => {
    expect(fraseDeRegla(lista[1], lista)).toBe('solo si es Sí en «¿Arrastras alguna lesión?»');
  });

  it('la regla por defecto depende de quién sea el de arriba', () => {
    expect(reglaPorDefecto(el('sino')).valor).toBe('si');
    expect(reglaPorDefecto(el('una', { ops: ['A', 'B'] })).valor).toBe('A');
    expect(reglaPorDefecto(el('escala', { min: 1 })).op).toBe('mayorQue');
  });
});

describe('formulario · operaciones', () => {
  it('añadir respeta el tope y no crece más', () => {
    let lista = [];
    for (let i = 0; i < MAX_ELEMENTOS + 5; i += 1) lista = anadirElemento(lista, 'texto');
    expect(lista).toHaveLength(MAX_ELEMENTOS);
  });

  it('editar mantiene el saneado: no se puede colar una escala imposible', () => {
    const lista = [el('escala')];
    const editada = editarElemento(lista, lista[0].id, { min: 9, max: 1 });
    expect(editada[0].max).toBeGreaterThan(editada[0].min);
  });

  it('mover en el borde no hace nada', () => {
    const lista = [el('texto'), el('numero')];
    expect(moverElemento(lista, lista[0].id, 'up')).toBe(lista);
    expect(moverElemento(lista, lista[1].id, 'down')).toBe(lista);
  });

  it('duplicar da ids nuevos y REAPUNTA las reglas a la copia', () => {
    const a = el('sino');
    const b = el('texto');
    b.regla = { de: a.id, op: 'es', valor: 'si' };
    const copia = duplicarElementos(sanitizeElementos([a, b]));
    expect(copia[0].id).not.toBe(a.id);
    expect(copia[1].regla.de).toBe(copia[0].id);
  });
});

describe('formulario · lectura', () => {
  it('solo cuentan como elementos los que preguntan algo', () => {
    const lista = [el('apartado'), el('texto'), el('nota'), el('peso')];
    expect(cuentaElementos(lista)).toBe(2);
  });

  it('el resumen dice aparte lo del oficio: no es lo mismo que una pregunta', () => {
    expect(resumenElementos([el('texto'), el('perimetros')])).toContain('del oficio');
    expect(resumenElementos([el('texto')])).not.toContain('del oficio');
  });

  it('las columnas de la tabla son las preguntas, en orden', () => {
    const lista = [el('apartado'), el('texto', { enun: 'Horas' }), el('sino', { enun: 'Seguido' })];
    expect(columnasDe(lista).map((c) => c.rot)).toEqual(['Horas', 'Seguido']);
  });

  it('lo que no ha llegado es una raya, no una celda vacía', () => {
    expect(respuestaLegible(el('texto'), '')).toBe('—');
    expect(respuestaLegible(el('sino'), 'si')).toBe('Sí');
    expect(respuestaLegible(el('varias'), ['A', 'B'])).toBe('A, B');
  });
});

describe('formulario · lo del oficio aterriza', () => {
  const peso = el('peso');
  const perim = el('perimetros', { piezas: ['pecho', 'brazoD'] });
  const pliegues = el('pliegues', { piezas: ['tricipital'] });
  const texto = el('texto');
  const lista = [peso, perim, pliegues, texto];

  it('junta peso, perímetros y pliegues en UNA sola medición', () => {
    const salida = aterrizar(
      lista,
      {
        [peso.id]: 82.4,
        [perim.id]: { pecho: 98, brazoD: 38 },
        [pliegues.id]: { tricipital: 11 },
        [texto.id]: 'lo que sea',
      },
      '2026-09-08'
    );
    expect(salida.date).toBe('2026-09-08');
    expect(salida.weight).toBe(82.4);
    expect(salida.perimeters).toEqual({ pecho: 98, brazoD: 38 });
    expect(salida.folds).toEqual({ tricipital: 11 });
  });

  it('las piezas vacías no entran: un cero no es «no medido»', () => {
    const salida = aterrizar(lista, { [perim.id]: { pecho: 98, brazoD: '' } }, '2026-09-08');
    expect(salida.perimeters).toEqual({ pecho: 98 });
  });

  it('sin nada del oficio contestado no escribe nada', () => {
    expect(aterrizar(lista, { [texto.id]: 'solo texto' })).toBeNull();
    expect(aterrizar([texto], { [texto.id]: 'x' })).toBeNull();
  });

  it('sabe decir si un formulario toca la antropometría', () => {
    expect(tocaAntropometria(lista)).toBe(true);
    expect(tocaAntropometria([texto])).toBe(false);
  });
});

describe('formulario · las plantillas', () => {
  it('todas dan elementos válidos y dentro del tope', () => {
    for (const p of PLANTILLAS) {
      const elementos = elementosDePlantilla(p.id);
      expect(elementos.length).toBeLessThanOrEqual(MAX_ELEMENTOS);
      for (const elem of elementos) expect(tipoById(elem.tipo)).toBeTruthy();
    }
  });

  it('«en blanco» es de verdad en blanco', () => {
    expect(elementosDePlantilla('blanco')).toEqual([]);
  });

  it('la de lesiones trae sus reglas puestas y sobreviven al saneado', () => {
    const elementos = elementosDePlantilla('lesiones');
    expect(elementos.filter((e) => e.regla)).toHaveLength(2);
  });

  it('dos copias de la misma plantilla no comparten ids', () => {
    const a = elementosDePlantilla('sueno');
    const b = elementosDePlantilla('sueno');
    expect(a[0].id).not.toBe(b[0].id);
  });
});
