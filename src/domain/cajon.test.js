import { describe, expect, it } from 'vitest';

import { TIPO } from '@/lib/portapapeles';
import {
  CAJONES,
  FORMAS,
  comoLista,
  comoPiezaDelPortapapeles,
  construir,
  guardadosDe,
  lineasDe,
  resumenDe,
  tieneCajon,
} from './cajon';

/* Un ejercicio tal y como sale de una hoja de verdad: con su plan Y con lo
   registrado encima, que es justo lo que no puede entrar en el cajón. */
const ejercicio = (name = 'Sentadilla') => ({
  id: 'ex-de-marta',
  name,
  muscle: 'Cuádriceps',
  restSeconds: 120,
  sets: [
    { targetReps: '8', targetRir: '2', targetKg: '100', kg: 102, reps: 8, done: true },
    { targetReps: '8', targetRir: '2', targetKg: '100', kg: 100, reps: 7, done: true },
  ],
});

const alimento = (name = 'Avena') => ({
  name,
  grams: 80,
  proteinPer100: 13,
  carbsPer100: 60,
  fatsPer100: 7,
});

const guardado = (kind, carga, extra = {}) => ({
  id: `t-${kind}`,
  kind,
  name: 'Lo mío',
  savedAt: '2026-09-10T10:00:00.000Z',
  carga,
  ...extra,
});

describe('qué formas tienen cajón', () => {
  it('bloque, hoja y plato sí; ejercicio, comida y dieta no', () => {
    expect(FORMAS).toEqual([TIPO.BLOQUE, TIPO.HOJA, TIPO.PLATO]);
    for (const kind of FORMAS) expect(tieneCajon(kind)).toBe(true);

    /* Un ejercicio ya tiene biblioteca propia y editable —la Librería—, y un
       cajón de ejercicios sería una segunda lista con otra verdad. La dieta
       entera es el plan de una persona. El día de dieta, cuando su forma pare
       de moverse (0111).

       Y la COMIDA tampoco, desde que el plato es una forma: lo que se guarda
       con nombre es la RACIÓN, y elegir cuál de las alternativas de una comida
       lo hace quien copia, no el cajón por su cuenta (0114). */
    expect(tieneCajon(TIPO.EJERCICIO)).toBe(false);
    expect(tieneCajon(TIPO.COMIDA)).toBe(false);
    expect(tieneCajon(TIPO.DIETA)).toBe(false);
    expect(tieneCajon(TIPO.DIA_DIETA)).toBe(false);
    expect(tieneCajon(undefined)).toBe(false);
  });

  it('las tres saben decir su tramo, su tope y cómo desempatan un nombre', () => {
    for (const kind of FORMAS) {
      const forma = CAJONES[kind];
      expect(forma.tramo).toBeTruthy();
      expect(forma.tope).toBeGreaterThan(0);
      expect(typeof forma.libre).toBe('function');
      expect(forma.vacio.titulo).toBeTruthy();
      expect(forma.alBorrar).toBeTruthy();
      /* El pie dice dónde se pone lo que se está mirando: `/plantillas` exhibe
         y no coloca, así que sin esa frase la pantalla es un callejón. */
      expect(forma.pie).toBeTruthy();
    }
  });
});

describe('guardar: lo que entra es el criterio, no el caso', () => {
  it('una hoja entra sin nada de lo levantado y con ids nuevos', () => {
    const pieza = construir({
      kind: TIPO.HOJA,
      name: '  Lower A  ',
      carga: { dayName: 'Lower A', exercises: [ejercicio()] },
    });

    expect(pieza.kind).toBe(TIPO.HOJA);
    expect(pieza.name).toBe('Lower A');

    const [ex] = pieza.carga.exercises;
    /* Id nuevo: dos clientes no pueden acabar compartiendo el id de un
       ejercicio, o comparten historial. */
    expect(ex.id).not.toBe('ex-de-marta');
    expect(ex.name).toBe('Sentadilla');
    expect(ex.restSeconds).toBe(120);
    /* El plan viaja entero y el registro no viaja nada. */
    expect(ex.sets.map((s) => s.targetKg)).toEqual(['100', '100']);
    expect(ex.sets.every((s) => !s.done && s.kg === '')).toBe(true);
  });

  it('un bloque conserva sus tres características, que son lo que lo hace estructura', () => {
    const pieza = construir({
      kind: TIPO.BLOQUE,
      name: 'Acumulación',
      carga: {
        sessions: [{ dayName: 'Lower A', exercises: [ejercicio()] }],
        mobilityDrills: [{ name: 'Cadera' }],
        intent: 'acumulacion',
        plannedWeeks: 6,
        note: 'Subir volumen de pierna',
        /* Nada de esto puede llegar al cajón: es de una persona. */
        id: 'b1',
        log: [{ que: 'algo' }],
        fromWeek: 3,
      },
    });

    expect(pieza.carga.intent).toBe('acumulacion');
    expect(pieza.carga.plannedWeeks).toBe(6);
    expect(pieza.carga.note).toBe('Subir volumen de pierna');
    expect(pieza.carga.mobilityDrills).toEqual([{ name: 'Cadera' }]);
    expect(pieza.carga.sessions[0].dayName).toBe('Lower A');
    expect(pieza.carga.id).toBeUndefined();
    expect(pieza.carga.log).toBeUndefined();
    expect(pieza.carga.fromWeek).toBeUndefined();
  });

  it('un bloque sin calentamiento guarda `null` y no una lista vacía', () => {
    /* Un `[]` le BORRARÍA el calentamiento al destinatario: guardar el bloque
       de quien no calienta no es una orden de que el otro deje de hacerlo. */
    const pieza = construir({
      kind: TIPO.BLOQUE,
      name: 'Sin calentar',
      carga: { sessions: [{ dayName: 'A', exercises: [] }], mobilityDrills: [] },
    });
    expect(pieza.carga.mobilityDrills).toBe(null);
  });

  it('un plato guarda su ración, y una comida entera no se guarda', () => {
    const pieza = construir({
      kind: TIPO.PLATO,
      name: 'Desayuno',
      carga: { foods: [alimento(), alimento('Clara')] },
    });
    expect(pieza.carga.foods.map((f) => f.name)).toEqual(['Avena', 'Clara']);

    /* Aquí había un repliegue a `options[0]` para poder guardar la comida que
       se llevara en la mano, y era el cajón eligiendo alternativa por su
       cuenta. Las alternativas de una comida son otras tantas raciones
       distintas: cuál se guarda lo dice quien copia (`copiarPlato`). */
    expect(
      construir({
        kind: TIPO.PLATO,
        name: 'Desayuno',
        carga: { options: [{ foods: [alimento()] }] },
      })
    ).toBe(null);
    expect(construir({ kind: TIPO.COMIDA, name: 'Desayuno', carga: { foods: [alimento()] } })).toBe(
      null
    );
  });

  it('un plato vuelve a la mano con su nombre dentro de la carga', () => {
    /* La avería del `dayName` de la hoja, con otra forma: `pegarPlato` bautiza
       lo que entra con `carga.name`, así que un plato de la vitrina y uno
       recién copiado tienen que traer esa clave los dos. Ver `alaMano`. */
    const pieza = comoPiezaDelPortapapeles(
      guardado(TIPO.PLATO, { foods: [alimento()] }, { name: 'Mi desayuno' })
    );
    expect(pieza.tipo).toBe(TIPO.PLATO);
    expect(pieza.carga.name).toBe('Mi desayuno');
    expect(pieza.carga.foods.map((f) => f.name)).toEqual(['Avena']);
  });

  it('lo que no lleva nada dentro no se guarda', () => {
    expect(construir({ kind: TIPO.HOJA, name: 'Vacía', carga: { exercises: [] } })).toBe(null);
    expect(construir({ kind: TIPO.BLOQUE, name: 'Vacío', carga: { sessions: [] } })).toBe(null);
    expect(construir({ kind: TIPO.COMIDA, name: 'Vacía', carga: { options: [] } })).toBe(null);
    /* Y una forma sin cajón tampoco, aunque traiga carga. */
    expect(construir({ kind: TIPO.EJERCICIO, name: 'Press', carga: { sets: [] } })).toBe(null);
  });
});

describe('leer: lo saneado y lo que se ve', () => {
  it('se descartan las filas sin id, sin nombre o sin carga', () => {
    const cajon = [
      guardado(TIPO.HOJA, { exercises: [] }),
      { ...guardado(TIPO.HOJA, { exercises: [] }), id: null },
      { ...guardado(TIPO.HOJA, { exercises: [] }), name: '   ' },
      { ...guardado(TIPO.HOJA, { exercises: [] }), carga: null },
      guardado(TIPO.COMIDA, { foods: [] }),
    ];
    expect(guardadosDe(cajon, TIPO.HOJA)).toHaveLength(1);
    expect(guardadosDe(cajon, TIPO.COMIDA)).toHaveLength(1);
    expect(guardadosDe(null, TIPO.HOJA)).toEqual([]);
  });

  it('`comoLista` devuelve la forma plana de siempre', () => {
    /* Existe para que las pantallas que ya leían `piecesOf` y `platosOf` no
       cambien de vocabulario porque haya cambiado el almacén. */
    const cajon = [guardado(TIPO.HOJA, { exercises: [ejercicio()] })];
    const [pieza] = comoLista(cajon, TIPO.HOJA);
    expect(pieza.name).toBe('Lo mío');
    expect(pieza.exercises).toHaveLength(1);
    expect(pieza.carga).toBeUndefined();
  });

  it('el resumen del bloque pone la intención delante del recuento', () => {
    const item = guardado(TIPO.BLOQUE, {
      sessions: [{ dayName: 'A', exercises: [] }, { dayName: 'B', exercises: [] }],
      intent: 'acumulacion',
      plannedWeeks: 6,
    });
    /* Es lo que distingue dos bloques del mismo tamaño cuando el cajón lleva
       doce. */
    expect(resumenDe(item)).toBe('Acumulación · 2 hojas · 6 semanas previstas');
  });

  it('sin intención ni semanas, el resumen del bloque es solo el recuento', () => {
    const item = guardado(TIPO.BLOQUE, { sessions: [{ dayName: 'A', exercises: [] }] });
    expect(resumenDe(item)).toBe('1 hoja');
  });

  it('un plato no tiene líneas: enseña sus macros, y eso es una tabla', () => {
    expect(lineasDe(guardado(TIPO.COMIDA, { foods: [alimento()] }))).toBe(null);
    expect(lineasDe(guardado(TIPO.HOJA, { exercises: [ejercicio()] }))).toHaveLength(1);
    expect(lineasDe(guardado(TIPO.BLOQUE, { sessions: [{ dayName: 'A', exercises: [] }] }))[0]).toMatchObject(
      { nombre: 'A', detalle: '0 ejercicios' }
    );
  });

  it('resumenDe de una forma sin cajón no revienta: devuelve vacío', () => {
    expect(resumenDe({ kind: TIPO.EJERCICIO, carga: {} })).toBe('');
    expect(resumenDe(null)).toBe('');
  });
});

describe('volver a la mano', () => {
  it('la hoja se bautiza por `dayName` y el bloque por `name`', () => {
    /* Ésta es la clave de la que depende que lo pegado no aterrice llamándose
       «Hoja»: `pegarHoja` lee `carga.dayName` y `planDeLaPieza` lee
       `carga.name`. Sin esto, guardar y volver a poner perdía el nombre. */
    const hoja = comoPiezaDelPortapapeles(
      guardado(TIPO.HOJA, { exercises: [ejercicio()] }, { name: 'Mi mejor pierna' })
    );
    expect(hoja.tipo).toBe(TIPO.HOJA);
    expect(hoja.titulo).toBe('Mi mejor pierna');
    expect(hoja.carga.dayName).toBe('Mi mejor pierna');

    const bloque = comoPiezaDelPortapapeles(
      guardado(TIPO.BLOQUE, { sessions: [{ dayName: 'A', exercises: [] }] }, { name: 'Acumulación' })
    );
    expect(bloque.carga.name).toBe('Acumulación');
  });

  it('el origen dice «tus plantillas» donde iría el cliente', () => {
    /* Y por eso «ponerlo en varios» —que deja fuera al cliente de origen— no
       deja fuera a nadie: una plantilla no es de nadie. */
    const pieza = comoPiezaDelPortapapeles(guardado(TIPO.HOJA, { exercises: [ejercicio()] }));
    expect(pieza.origen).toEqual({ cliente: 'tus plantillas', donde: null });
  });

  it('un plato NO vuelve a la mano', () => {
    /* Es una ración, no una comida: soltarlo donde va una comida sería pegar
       otra cosa. Se coloca desde el buscador de la comida, que sabe contra qué
       objetivo cuadrarlo. */
    expect(comoPiezaDelPortapapeles(guardado(TIPO.COMIDA, { foods: [alimento()] }))).toBe(null);
    expect(comoPiezaDelPortapapeles(null)).toBe(null);
  });
});
