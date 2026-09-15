import { describe, expect, it } from 'vitest';

import { TIPO } from '@/lib/portapapeles';

import { dayKcals } from './nutrition';
import {
  areaDe,
  consecuenciaDe,
  loQueLleva,
  pideSitio,
  queLee,
  seReparte,
  sitioDeOrigen,
  sitiosDe,
  sustituye,
} from './reparto';

/* Un programa con su plan ya en el bloque: es lo que hay desde `plan-del-bloque`
   y lo que lee el reparto para saber qué hojas tiene cada uno. */
const programa = (hojas = [{ dayName: 'Lower A', exercises: [] }]) => ({
  microcycles: [{ weekNumber: 1, days: [] }],
  blocks: [{ id: 'b1', name: 'Acumulación', fromWeek: 1, toWeek: null, sessions: hojas }],
});

const sinRutina = { microcycles: [] };

const comida = (nombre, foods = [{ name: 'Avena', grams: 80 }]) => ({
  id: 'm1',
  name: nombre,
  options: [{ foods }],
});

const dieta = (dias) => ({ days: dias });

/*
  UN MENÚ QUE SE PUEDE MEDIR: arroz y aceite con macros de verdad, 357 kcal por
  cada 100 g de arroz. Con 500 g suma unas 1.965 kcal, que es lo que tiene
  pautado quien lo manda — y esa es la condición de toda esta parte: el ajuste
  del reparto mide lo que SUMA el menú, así que un menú de juguete de 320 kcal
  con un objetivo de 2.000 no prueba nada. Ver `aLoPautado`.
*/
const menu = (arroz = 500) => [
  comida('Desayuno', [
    { name: 'Arroz', grams: arroz, proteinPer100: 7, carbsPer100: 80, fatsPer100: 1 },
    { name: 'Aceite', grams: 20, proteinPer100: 0, carbsPer100: 0, fatsPer100: 100 },
  ]),
];

describe('la tabla: qué necesita cada pieza', () => {
  it('las seis piezas se reparten; el plato todavía no', () => {
    for (const tipo of Object.values(TIPO)) {
      if (tipo === TIPO.PLATO) continue;
      expect(seReparte(tipo)).toBe(true);
    }
    expect(seReparte('microciclo')).toBe(false);

    /*
      ── Y EL PLATO NO, QUE ES UN HUECO Y NO UN OLVIDO ────────────────────────
      Las seis que sí se reparten caen en un sitio que se sabe con UNA respuesta
      por persona: el programa, la hoja de un bloque, el día de una dieta. Un
      plato cae DENTRO de una comida, así que «pónselo a los seis» pide dos
      respuestas por destinatario —qué día y qué comida— y eso es un selector
      que `MandarLaPieza` no tiene.

      Mientras no lo tenga, la mano se calla —`seReparte` es lo que enciende
      «Ponerlo en varios…»— en vez de ofrecer un verbo que no sabría a dónde
      llevarlo.
    */
    expect(seReparte(TIPO.PLATO)).toBe(false);
  });

  it('las de entreno leen el programa y las de dieta, la dieta', () => {
    expect(queLee(TIPO.BLOQUE)).toBe('programa');
    expect(queLee(TIPO.EJERCICIO)).toBe('programa');
    expect(queLee(TIPO.COMIDA)).toBe('dieta');
    expect(queLee(TIPO.DIA_DIETA)).toBe('dieta');
  });

  it('cada pieza mira el condicionante de SU área', () => {
    expect(areaDe(TIPO.HOJA)).toBe('training');
    expect(areaDe(TIPO.COMIDA)).toBe('nutrition');
  });

  /*
    La decisión de diseño, en una prueba: solo preguntan dónde caen las que caen
    DENTRO de algo que ya existe. Un bloque abre un bloque y un día de dieta se
    añade: ahí no hay nada que elegir.
  */
  it('solo el ejercicio y la comida piden sitio', () => {
    expect(pideSitio(TIPO.EJERCICIO)).toBe('hoja');
    expect(pideSitio(TIPO.COMIDA)).toBe('dia');
    expect(pideSitio(TIPO.BLOQUE)).toBe(null);
    expect(pideSitio(TIPO.HOJA)).toBe(null);
    expect(pideSitio(TIPO.DIA_DIETA)).toBe(null);
  });

  it('el sitio que se propone es el de origen, y va en `origen`', () => {
    expect(sitioDeOrigen({ origen: { hoja: 'Lower A' } })).toBe('Lower A');
    expect(sitioDeOrigen({ origen: { dia: 'Entreno' } })).toBe('Entreno');
    expect(sitioDeOrigen({ origen: { cliente: 'Marta' } })).toBe(null);
  });

  it('los sitios posibles salen de lo que cada uno tiene', () => {
    expect(sitiosDe(TIPO.EJERCICIO, programa([{ dayName: 'Push' }, { dayName: 'Pull' }]))).toEqual([
      'Push',
      'Pull',
    ]);
    expect(sitiosDe(TIPO.EJERCICIO, sinRutina)).toEqual([]);
    expect(sitiosDe(TIPO.COMIDA, dieta([{ id: 'd1', name: 'Entreno', meals: [] }]))).toEqual(['Entreno']);
  });
});

describe('qué lleva dentro una pieza', () => {
  it('una hoja enseña sus ejercicios con sus series', () => {
    const pieza = {
      tipo: TIPO.HOJA,
      carga: { exercises: [{ name: 'Press', sets: [{}, {}] }, { name: 'Remo', sets: [{}] }] },
    };
    expect(loQueLleva(pieza).lineas).toEqual(['Press · 2 series', 'Remo · 1 serie']);
  });

  it('un ejercicio enseña sus series, y las que no piden nada lo dicen', () => {
    const pieza = {
      tipo: TIPO.EJERCICIO,
      carga: { sets: [{ targetReps: '8', targetRir: '2' }, { targetReps: '' }] },
    };
    expect(loQueLleva(pieza).lineas).toEqual(['8 reps · RIR 2', 'sin objetivo']);
  });

  /* El tope no es porque las demás no importen: es que esto vive en un cajón de
     320 px al pie de la pantalla. Por eso se dice cuántas quedan. */
  it('corta por el tope y cuenta las que quedan', () => {
    const pieza = {
      tipo: TIPO.DIA_DIETA,
      carga: { meals: Array.from({ length: 7 }, (_, i) => comida(`Comida ${i + 1}`)) },
    };
    const { lineas, mas } = loQueLleva(pieza, 5);
    expect(lineas).toHaveLength(5);
    expect(mas).toBe(2);
  });
});

describe('el bloque: el único que sustituye', () => {
  const pieza = {
    tipo: TIPO.BLOQUE,
    titulo: 'Fuerza',
    carga: { name: 'Fuerza', sessions: [{ dayName: 'A', exercises: [] }, { dayName: 'B', exercises: [] }] },
  };

  it('a quien tiene un bloque abierto se lo cierra, y lo dice', () => {
    const { estado, filas, plan } = consecuenciaDe({ pieza, datos: programa() });
    expect(estado).toBe('va');
    expect(filas[0]).toEqual({ texto: 'Fuerza · 2 hojas', marca: 'entra' });
    expect(filas[1].marca).toBe('sale');
    expect(filas[1].texto).toContain('Acumulación');
    expect(plan.que).toBe('bloque');
  });

  it('a quien no tiene rutina no le cierra nada', () => {
    const { filas } = consecuenciaDe({ pieza, datos: sinRutina });
    expect(filas.some((f) => f.marca === 'sale')).toBe(false);
    expect(filas[1].texto).toContain('empieza aquí');
  });

  it('sin leer el plan de esa persona no se opina', () => {
    expect(consecuenciaDe({ pieza, datos: null }).estado).toBe('cargando');
    expect(consecuenciaDe({ pieza, datos: null }).plan).toBe(null);
  });
});

describe('la hoja: entra en el bloque abierto', () => {
  const pieza = {
    tipo: TIPO.HOJA,
    titulo: 'Lower A',
    carga: { dayName: 'Lower A', exercises: [{ name: 'Sentadilla', sets: [{}] }] },
  };

  it('se añade al bloque que tenga abierto', () => {
    const { filas, plan } = consecuenciaDe({ pieza, datos: programa([{ dayName: 'Push' }]) });
    expect(filas[0].texto).toBe('Lower A · 1 ejercicio');
    expect(filas[1].texto).toBe('Se añade a «Acumulación»');
    expect(plan).toMatchObject({ que: 'hoja', bloqueId: 'b1', nombre: 'Lower A' });
  });

  /* El nombre se libera ANTES de enseñarlo: quien ya tiene una «Lower A» lo lee
     en la columna en vez de encontrárselo después. */
  it('el nombre repetido se desempata y se dice', () => {
    const { filas, plan } = consecuenciaDe({ pieza, datos: programa([{ dayName: 'Lower A' }]) });
    expect(plan.nombre).toBe('Lower A 2');
    expect(filas[1].texto).toContain('Ya tiene una hoja «Lower A»');
  });

  it('a quien no tiene rutina se le abre un bloque con ella dentro', () => {
    const { plan, filas } = consecuenciaDe({ pieza, datos: sinRutina });
    expect(plan.que).toBe('hoja-sola');
    expect(plan.plan.sessions).toHaveLength(1);
    expect(filas[1].texto).toContain('se le abre un bloque');
  });
});

describe('el ejercicio: cae dentro de una hoja, y puede no haberla', () => {
  const pieza = {
    tipo: TIPO.EJERCICIO,
    titulo: 'Press',
    origen: { hoja: 'Lower A' },
    carga: { name: 'Press', sets: [{}, {}] },
  };

  it('entra en la hoja que se llama así', () => {
    const datos = programa([{ dayName: 'Lower A', exercises: [] }]);
    const { estado, plan } = consecuenciaDe({ pieza, datos, sitio: 'Lower A' });
    expect(estado).toBe('va');
    expect(plan).toMatchObject({ que: 'ejercicio', hoja: 'Lower A' });
  });

  /* Que a alguien no le entre no es un fallo: es la información por la que se
     abre esta pantalla. */
  it('a quien no tenga esa hoja no se le toca, y se dice cuál falta', () => {
    const { estado, filas, plan } = consecuenciaDe({
      pieza,
      datos: programa([{ dayName: 'Push' }]),
      sitio: 'Lower A',
    });
    expect(estado).toBe('no');
    expect(plan).toBe(null);
    expect(filas[0].texto).toContain('no tiene ninguna hoja «Lower A»');
  });

  it('el nombre de la hoja no distingue mayúsculas ni acentos', () => {
    const datos = programa([{ dayName: 'Día de pierna' }]);
    expect(consecuenciaDe({ pieza, datos, sitio: 'dia de PIERNA' }).estado).toBe('va');
  });

  it('avisa si esa hoja ya lo tiene', () => {
    const datos = programa([{ dayName: 'Lower A', exercises: [{ name: 'press' }] }]);
    const { estado, filas } = consecuenciaDe({ pieza, datos, sitio: 'Lower A' });
    expect(estado).toBe('va');
    expect(filas[1].texto).toContain('entraría otra vez');
  });

  it('sin bloque abierto no hay dónde', () => {
    expect(consecuenciaDe({ pieza, datos: sinRutina, sitio: 'Lower A' }).estado).toBe('no');
  });

  /* Lo copiado por una versión anterior no guardaba de qué hoja salía. Sin
     sitio, lo que falta es la respuesta y no la hoja: decir «no tiene ninguna
     hoja «»» manda a buscar algo que no existe. */
  it('sin sitio dicho, lo que falta es la respuesta', () => {
    const { estado, filas } = consecuenciaDe({ pieza, datos: programa(), sitio: '' });
    expect(estado).toBe('no');
    expect(filas[0].texto).toBe('Falta decir en qué hoja cae');
  });
});

describe('la dieta: añade, y reescala al objetivo de cada uno', () => {
  const unDia = {
    tipo: TIPO.DIA_DIETA,
    titulo: 'Menú de lunes',
    origen: { objetivoKcals: 2000 },
    carga: { meals: menu() },
  };

  it('un día no toca ninguno de los que hay: los suma', () => {
    const datos = dieta([{ id: 'd1', name: 'Uno', targets: { targetKcals: 2000 }, meals: [] }]);
    const { plan, filas } = consecuenciaDe({ pieza: unDia, datos });
    expect(plan.que).toBe('dia');
    expect(filas[1].texto).toContain('Pasa a tener 2 días');
    expect(filas[1].texto).toContain('no se le toca ninguno');
  });

  /* La firma de la pantalla: mandar la misma dieta a ocho no es darles la misma
     dieta. Ver `rescaleMeals`, que mueve la fuente de hidratos. */
  it('el menú entra ajustado al objetivo del destinatario', () => {
    const datos = dieta([{ id: 'd1', name: 'Uno', targets: { targetKcals: 3000 }, meals: [] }]);
    const { plan, filas } = consecuenciaDe({ pieza: unDia, datos });
    expect(filas.at(-1).texto).toBe('Ajustado a sus 3000 kcal');
    expect(plan.meals[0].options[0].foods[0].grams).toBeGreaterThan(500);
  });

  /*
    ══ Y NO HEREDA EL DESCUADRE DEL QUE LA MANDA ═══════════════════════════════
    Escalando por el SALTO entre los dos objetivos, la distancia que el menú de
    origen tuviera con el suyo viajaba intacta: un menú de 2.450 sobre 2.000
    pautados llegaba a alguien de 2.000 sumando otra vez 2.450, y a alguien de
    3.000 sumando 3.675. Apuntando a lo pautado, llega en lo pautado. Es la
    misma ley que `rescaleMeals` aplica en la ventana del objetivo.
  */
  it('no hereda la distancia que el menú tuviera con su propio objetivo', () => {
    /* 636 g de arroz: unas 2.450 kcal con 2.000 pautadas en origen. */
    const sobrado = { ...unDia, carga: { meals: menu(636) } };
    expect(Math.round(dayKcals(sobrado.carga.meals))).toBeGreaterThan(2400);

    const datos = dieta([{ id: 'd1', name: 'Uno', targets: { targetKcals: 2000 }, meals: [] }]);
    const { plan, filas } = consecuenciaDe({ pieza: sobrado, datos });

    expect(filas.at(-1).texto).toBe('Ajustado a sus 2000 kcal');
    /* Dentro del escalón de cocina, que es el error que tiene que quedar. */
    expect(Math.abs(dayKcals(plan.meals) - 2000)).toBeLessThan(80);
  });

  /* Y un menú que ya está en lo suyo no se toca ni se comenta: en reposo no hay
     nada que decir. Ver la ley del reposo. */
  it('un menú que ya cuadra no se mueve y no ocupa fila', () => {
    const datos = dieta([{ id: 'd1', name: 'Uno', targets: { targetKcals: 1965 }, meals: [] }]);
    const { plan, filas } = consecuenciaDe({ pieza: unDia, datos });
    expect(plan.meals[0].options[0].foods[0].grams).toBe(500);
    expect(filas.some((f) => f.texto.includes('kcal'))).toBe(false);
  });

  it('a quien no tiene objetivo le entra tal cual, y se dice', () => {
    const datos = dieta([{ id: 'd1', name: 'Uno', targets: {}, meals: [] }]);
    const { plan, filas } = consecuenciaDe({ pieza: unDia, datos });
    expect(filas.at(-1).texto).toContain('No tiene objetivo puesto');
    expect(plan.meals[0].options[0].foods[0].grams).toBe(500);
  });

  const unaComida = {
    tipo: TIPO.COMIDA,
    titulo: 'Cena',
    origen: { dia: 'Entreno', objetivoKcals: 2000 },
    carga: comida('Cena'),
  };

  /* Con UN solo día no hay a dónde elegir: exigirle que se llame igual que el
     de otra persona sería un peaje por un nombre que nadie ha puesto. */
  it('con un solo día cae ahí, se llame como se llame', () => {
    const datos = dieta([{ id: 'd1', name: 'Dieta única', targets: { targetKcals: 2000 }, meals: [] }]);
    const { estado, plan } = consecuenciaDe({ pieza: unaComida, datos, sitio: 'Entreno' });
    expect(estado).toBe('va');
    expect(plan).toMatchObject({ que: 'comida', dayId: 'd1' });
  });

  it('con varios días, por nombre — y si no está, no se toca', () => {
    const datos = dieta([
      { id: 'd1', name: 'Descanso', targets: { targetKcals: 2000 }, meals: [] },
      { id: 'd2', name: 'Entreno', targets: { targetKcals: 2000 }, meals: [] },
    ]);
    expect(consecuenciaDe({ pieza: unaComida, datos, sitio: 'Entreno' }).plan.dayId).toBe('d2');
    const fuera = consecuenciaDe({ pieza: unaComida, datos, sitio: 'Alto' });
    expect(fuera.estado).toBe('no');
    expect(fuera.filas[0].texto).toContain('No tiene ningún día «Alto»');
  });
});

describe('el veto', () => {
  const pieza = { tipo: TIPO.COMIDA, titulo: 'Cena', origen: { dia: 'Uno' }, carga: comida('Cena') };
  const datos = dieta([{ id: 'd1', name: 'Uno', targets: { targetKcals: 2000 }, meals: [] }]);

  it('separa lo que no se le puede poner de lo que hay que tener en cuenta', () => {
    const { veto, ojo } = consecuenciaDe({
      pieza,
      datos,
      condiciones: [
        { id: 'c1', label: 'Alergia a los frutos secos', area: 'nutrition', severity: 'block' },
        { id: 'c2', label: 'Le sienta mal la lactosa', area: 'nutrition', severity: 'note' },
        { id: 'c3', label: 'Hombro derecho', area: 'training', severity: 'block' },
      ],
    });
    /* El del hombro no sale: no condiciona lo que come. */
    expect(veto).toEqual(['Alergia a los frutos secos']);
    expect(ojo).toEqual(['Le sienta mal la lactosa']);
  });

  it('sin condicionantes leídos no se inventa ninguno', () => {
    const { veto, ojo } = consecuenciaDe({ pieza, datos });
    expect(veto).toEqual([]);
    expect(ojo).toEqual([]);
  });
});

describe('la dieta entera: la única que borra', () => {
  const laDieta = (days, objetivoKcals = 2000) => ({
    tipo: TIPO.DIETA,
    titulo: 'Dieta de Javier',
    origen: { objetivoKcals },
    carga: { days },
  });

  const dias = [
    { name: 'Alto', proporcion: 1, meals: menu() },
    { name: 'Bajo', proporcion: 0.8, meals: [comida('Cena')] },
  ];

  it('está declarada como la que sustituye, y es la única', () => {
    expect(sustituye(TIPO.DIETA)).toBe(true);
    for (const tipo of Object.values(TIPO)) {
      if (tipo !== TIPO.DIETA) expect(sustituye(tipo)).toBe(false);
    }
  });

  /* La mitad que no se puede esconder: qué PIERDE cada uno, con nombres. Sin
     esta fila, «poner la dieta en seis» borra treinta comidas en silencio. */
  it('dice qué pierde, con sus días por nombre', () => {
    const datos = dieta([
      { id: 'd1', name: 'Entreno', targets: { targetKcals: 2000 }, meals: [comida('A'), comida('B')] },
      { id: 'd2', name: 'Descanso', targets: { targetKcals: 1800 }, meals: [comida('C')] },
    ]);
    const { estado, filas, plan } = consecuenciaDe({ pieza: laDieta(dias), datos });
    expect(estado).toBe('va');
    expect(plan.que).toBe('dieta');
    expect(filas[0].texto).toBe('2 días · 2 comidas');
    expect(filas[1].marca).toBe('sale');
    expect(filas[1].texto).toContain('Pierde 2 días y 3 comidas');
    expect(filas[1].texto).toContain('Entreno, Descanso');
  });

  it('a quien no tenía menú no le habla de perder nada', () => {
    const datos = dieta([{ id: 'd1', name: 'Dieta única', targets: { targetKcals: 2000 }, meals: [] }]);
    const { filas } = consecuenciaDe({ pieza: laDieta(dias), datos });
    expect(filas[1].texto).toContain('No tenía menú');
    expect(filas[1].marca).toBeUndefined();
  });

  /* La firma: lo que viaja entre los días es la PROPORCIÓN, no las cifras. Un
     ciclado del 20 % puesto en alguien de 3.000 sigue siendo del 20 %. */
  it('cada día se ajusta a su parte del objetivo del destinatario', () => {
    const datos = dieta([{ id: 'd1', name: 'Uno', targets: { targetKcals: 3000 }, meals: [] }]);
    const { plan } = consecuenciaDe({ pieza: laDieta(dias), datos });
    /* El primero va a sus 3000: el arroz sube. */
    expect(plan.days[0].meals[0].options[0].foods[0].grams).toBeGreaterThan(500);
    expect(Math.abs(dayKcals(plan.days[0].meals) - 3000)).toBeLessThan(100);
    expect(plan.days[1].proporcion).toBe(0.8);
  });

  /*
    LA PROPORCIÓN, MEDIDA: un ciclado del 20 % puesto en alguien de 3.000 tiene
    que seguir siendo del 20 %, y el día bajo tiene que caer en SUS 2.400 — no
    en el 80 % de lo que sumara el menú del que la manda.
  */
  it('el día bajo cae en su parte, no en la del que la manda', () => {
    const ciclado = [
      { name: 'Alto', proporcion: 1, meals: menu() },
      { name: 'Bajo', proporcion: 0.8, meals: menu(400) },
    ];
    const datos = dieta([{ id: 'd1', name: 'Uno', targets: { targetKcals: 3000 }, meals: [] }]);
    const { plan, filas } = consecuenciaDe({ pieza: laDieta(ciclado), datos });

    expect(Math.abs(dayKcals(plan.days[0].meals) - 3000)).toBeLessThan(100);
    expect(Math.abs(dayKcals(plan.days[1].meals) - 2400)).toBeLessThan(100);
    expect(filas.some((f) => f.texto.includes('guardan la proporción'))).toBe(true);
  });

  /*
    ══ Y LA COLUMNA DICE LO QUE DE VERDAD HA PASADO ══════════════════════════
    `rescaleMeals` mueve lo que NO es fuente de proteína, así que hay saltos que
    no puede dar y entonces el menú entra tal cual. La primera versión de esto
    escribía «Reescalada de X a Y» pasara lo que pasara: una columna que miente,
    en la única pantalla del producto que escribe en el plan de ocho personas.
  */
  it('dice «entra tal cual» cuando no se ha podido mover nada', () => {
    /* Sin macros no hay kcal que repartir: no hay nada que reescalar. */
    const sinMacros = [{ name: 'Uno', proporcion: 1, meals: [comida('Cena')] }];
    const datos = dieta([{ id: 'd1', name: 'Uno', targets: { targetKcals: 3000 }, meals: [] }]);
    const { filas } = consecuenciaDe({ pieza: laDieta(sinMacros), datos });
    expect(filas.some((f) => f.texto === 'Nada que mover para llegar a sus 3000 kcal: entra tal cual')).toBe(true);
  });

  it('cuenta los días cuando unos se mueven y otros no', () => {
    const datos = dieta([{ id: 'd1', name: 'Uno', targets: { targetKcals: 3000 }, meals: [] }]);
    const { filas } = consecuenciaDe({ pieza: laDieta(dias), datos });
    /* El primero lleva arroz con macros y se mueve; el segundo, avena sin
       macros, no tiene kcal que repartir. */
    expect(filas.some((f) => f.texto === 'Ajustados 1 de 2 días a sus 3000 kcal; el resto entra tal cual')).toBe(true);
  });

  it('con todos los días movidos lo dice entero', () => {
    const conMacros = [
      { name: 'Alto', proporcion: 1, meals: menu() },
      { name: 'Bajo', proporcion: 0.8, meals: menu(400) },
    ];
    const datos = dieta([{ id: 'd1', name: 'Uno', targets: { targetKcals: 3000 }, meals: [] }]);
    const { filas } = consecuenciaDe({ pieza: laDieta(conMacros), datos });
    expect(filas.some((f) => f.texto.includes('guardan la proporción'))).toBe(true);
  });

  /* Un día vacío no se reescala, y contarlo como fallo sería contar algo que no
     ha pasado: «1 de 2» por un día en blanco es un aviso falso. */
  it('los días sin menú no cuentan para el reparto', () => {
    const conVacio = [
      { name: 'Alto', proporcion: 1, meals: menu() },
      { name: 'Bajo', proporcion: 0.8, meals: [] },
    ];
    const datos = dieta([{ id: 'd1', name: 'Uno', targets: { targetKcals: 3000 }, meals: [] }]);
    const { filas } = consecuenciaDe({ pieza: laDieta(conVacio), datos });
    expect(filas.some((f) => f.texto.includes('guardan la proporción'))).toBe(true);
    expect(filas.some((f) => f.texto.includes('de 2 días'))).toBe(false);
  });

  it('sin objetivo del destinatario entra tal cual, y se dice', () => {
    const datos = dieta([{ id: 'd1', name: 'Uno', targets: {}, meals: [] }]);
    const { plan, filas } = consecuenciaDe({ pieza: laDieta(dias), datos });
    expect(filas.some((f) => f.texto.includes('No tiene objetivo puesto'))).toBe(true);
    expect(plan.days[0].meals[0].options[0].foods[0].grams).toBe(500);
  });

  /*
    ── Y SIN OBJETIVO DE ORIGEN TAMPOCO SE TOCA, que es la única fila donde el
    objetivo del que manda sigue haciendo falta ────────────────────────────────
    El ajuste ya no lo usa para escalar, pero sin él la PROPORCIÓN de cada día
    viene marcada con un 1 y no hay forma de distinguir un plan plano de un
    ciclado. Llevarlos a todos a la misma cifra aplanaría el segundo.
  */
  it('sin objetivo de origen no se toca ningún día, y se dice', () => {
    const datos = dieta([{ id: 'd1', name: 'Uno', targets: { targetKcals: 3000 }, meals: [] }]);
    const { plan, filas } = consecuenciaDe({ pieza: laDieta(dias, 0), datos });
    expect(filas.some((f) => f.texto === 'Sin objetivo de origen: entra sin reescalar')).toBe(true);
    expect(plan.days[0].meals[0].options[0].foods[0].grams).toBe(500);
  });

  /* La única consecuencia que no se ve mirando el menú: `week` apunta a ids de
     días que dejan de existir, así que se vacía. */
  it('avisa a quien pierde el reparto de su ciclo, y solo a ese', () => {
    const conSemana = {
      days: [{ id: 'd1', name: 'Uno', targets: { targetKcals: 2000 }, meals: [] }],
      week: { Lunes: 'd1', Martes: 'd1' },
    };
    const sinSemana = dieta([{ id: 'd1', name: 'Uno', targets: { targetKcals: 2000 }, meals: [] }]);
    const conAviso = consecuenciaDe({ pieza: laDieta(dias), datos: conSemana });
    expect(conAviso.filas.some((f) => f.texto.includes('Pierde el reparto de su ciclo'))).toBe(true);
    const sinAviso = consecuenciaDe({ pieza: laDieta(dias), datos: sinSemana });
    expect(sinAviso.filas.some((f) => f.texto.includes('reparto de su ciclo'))).toBe(false);
  });

  it('lo que es de la persona se queda, y lo dice', () => {
    const datos = dieta([{ id: 'd1', name: 'Uno', targets: { targetKcals: 2000 }, meals: [] }]);
    const { filas } = consecuenciaDe({ pieza: laDieta(dias), datos });
    expect(filas.some((f) => f.texto.includes('sus pautas, sus pasos y su cardio'))).toBe(true);
  });

  it('una dieta sin días no se manda', () => {
    const datos = dieta([{ id: 'd1', name: 'Uno', targets: { targetKcals: 2000 }, meals: [] }]);
    const { estado, filas } = consecuenciaDe({ pieza: laDieta([]), datos });
    expect(estado).toBe('no');
    expect(filas[0].texto).toContain('no tiene ningún día');
  });

  it('lo que lleva dentro se lee por DÍAS, no por comidas', () => {
    const { lineas } = loQueLleva(laDieta(dias));
    expect(lineas).toEqual(['Alto · 1 comida', 'Bajo · 1 comida']);
  });
});
