import { describe, expect, it } from 'vitest';

import {
  kcalSteps,
  lastKcalChange,
  latestWeight,
  tieneMedidas,
  ultimaMedidaDe,
  weeklyCheckIn,
} from './anthropometry';

/**
 * El último peso, que antes era una columna que nadie actualizaba.
 *
 * ══ Qué se está fijando aquí ════════════════════════════════════════════════
 *
 * `clients.current_weight` se pintaba en el portal del cliente bajo la etiqueta
 * «Peso actual» y en el roadmap, y **no la escribía nadie**: ni la aplicación ni
 * ninguna migración. Enseñaba el valor que tuviera el día que se dejó de
 * rellenar, presentado como el de hoy.
 *
 * Un dato viejo con etiqueta de actual es peor que un hueco: el hueco se
 * pregunta, la cifra se cree. Y la cree quien está ajustando su dieta con ella.
 *
 * Ahora sale del histórico de pesajes. Lo que se prueba es lo que hace falta para
 * poder fiarse: que coge el ÚLTIMO por fecha y no el último de la lista, que
 * ignora los registros sin peso, y que sin datos dice que no hay —en vez de
 * inventarse un cero, que en una báscula significa algo muy distinto—.
 */
describe('latestWeight', () => {
  it('coge el más reciente por FECHA, no el último del array', () => {
    /* El histórico llega sin ordenar de la base de datos, y ordenar por posición
       daría el peso de hace tres semanas en cuanto alguien rellene un hueco. */
    const history = [
      { date: '2026-08-01', weight: 80 },
      { date: '2026-08-15', weight: 78 },
      { date: '2026-08-08', weight: 79 },
    ];
    expect(latestWeight(history)).toBe(78);
  });

  it('ignora los registros que no traen peso', () => {
    /* Un pesaje puede registrar solo pliegues o solo perímetros. Contarlo como
       peso daría `null` como cifra actual teniendo una buena dos días antes. */
    const history = [
      { date: '2026-08-01', weight: 80 },
      { date: '2026-08-15', weight: '' },
      { date: '2026-08-20', folds: { abdomen: 12 } },
    ];
    expect(latestWeight(history)).toBe(80);
  });

  it('entiende la coma decimal', () => {
    /* El teclado numérico de Android en configuración española produce coma, y
       el peso se guarda como texto tal cual se teclea (`lib/num.js`). */
    expect(latestWeight([{ date: '2026-08-15', weight: '77,4' }])).toBe(77.4);
  });

  it('sin datos dice que no hay, no cero', () => {
    /* Cero kilos no es «no lo sé»: en una báscula es una lectura, y la pantalla
       lo pintaría como tal. */
    expect(latestWeight([])).toBeNull();
    expect(latestWeight(null)).toBeNull();
    expect(latestWeight(undefined)).toBeNull();
    expect(latestWeight([{ date: '2026-08-01' }])).toBeNull();
  });

  it('aguanta registros rotos sin reventar', () => {
    /* El histórico es un jsonb y ha pasado por varias formas. Una fila sin fecha
       no puede tumbar la pantalla de inicio del cliente. */
    expect(latestWeight([null, { weight: 70 }, { date: '2026-08-01', weight: 75 }])).toBe(75);
  });
});

describe('weeklyCheckIn con cadencia de varias semanas', () => {
  /*
    El fallo que esto evita, y que era de datos y no de pantalla: con cadencia
    quincenal la ventana seguía siendo de UNA semana natural —la primera del
    periodo—. Un cliente que se pesaba solo en la segunda entregaba su check-in
    con `weight_kg` a null mientras la pantalla le decía que llevaba sus pesajes.
  */
  const historial = [
    { id: '1', date: '2026-08-04', weight: 80 }, // semana 1 del periodo
    { id: '2', date: '2026-08-12', weight: 79 }, // semana 2
    { id: '3', date: '2026-08-14', weight: 79.4 }, // semana 2
  ];

  it('sin cadencia, solo cuenta la semana natural', () => {
    const r = weeklyCheckIn(historial, '2026-08-03');
    expect(r.count).toBe(1);
    expect(r.average).toBe(80);
  });

  it('con cadencia quincenal, cuenta las dos semanas del periodo', () => {
    const r = weeklyCheckIn(historial, '2026-08-03', { weeks: 2 });
    expect(r.count).toBe(3);
    expect(r.average).toBe(79.47);
  });

  it('el peso NO se pierde cuando solo se pesó en la segunda semana', () => {
    const soloSegunda = [{ id: '2', date: '2026-08-12', weight: 79 }];
    expect(weeklyCheckIn(soloSegunda, '2026-08-03').average).toBeNull();
    expect(weeklyCheckIn(soloSegunda, '2026-08-03', { weeks: 2 }).average).toBe(79);
  });

  it('el objetivo escala con el periodo', () => {
    /* Pedir tres pesajes en dos semanas sería pedir la mitad de los que hacen
       falta para que la media signifique algo. */
    expect(weeklyCheckIn(historial, '2026-08-03', { target: 3 }).target).toBe(3);
    expect(weeklyCheckIn(historial, '2026-08-03', { target: 3, weeks: 2 }).target).toBe(6);
    expect(weeklyCheckIn(historial, '2026-08-03', { target: 3, weeks: 2 }).complete).toBe(false);
  });

  /*
    El objetivo lo pone el ENTRENADOR en su protocolo, y sin él no hay nada que
    cumplir. Era un 3 escrito en esta función, y de ese 3 colgaban ocho pantallas
    reclamando pesajes que nadie había pedido — desde «te faltan 2 pesajes» en el
    portal del cliente hasta «check-in a medias» en la cartera.
  */
  it('sin objetivo pedido no se juzga la semana', () => {
    const r = weeklyCheckIn(historial, '2026-08-03');
    expect(r.asked).toBe(false);
    expect(r.target).toBe(0);
    /* Cuenta lo que hay: el recuento es un hecho, la falta es un juicio. */
    expect(r.count).toBe(1);
    expect(r.complete).toBe(true);
  });

  it('con objetivo pedido, se juzga contra ese número', () => {
    const r = weeklyCheckIn(historial, '2026-08-03', { target: 2 });
    expect(r.asked).toBe(true);
    expect(r.target).toBe(2);
    expect(r.complete).toBe(false);
  });

  it('no se cuela nada del periodo siguiente', () => {
    const conPosterior = [...historial, { id: '4', date: '2026-08-18', weight: 70 }];
    const r = weeklyCheckIn(conPosterior, '2026-08-03', { weeks: 2 });
    expect(r.count).toBe(3);
    expect(r.average).toBe(79.47);
  });
});

/**
 * ══ LA EVOLUCIÓN DE LA DIETA, LEÍDA DE LOS PESAJES ═════════════════════════
 *
 * Cada pesaje guarda una foto de los macros del día desde hace meses
 * (`log.nutrition`) y no la leía nadie: `kcalSeries` tenía pruebas y cero
 * llamadas. Esto es lo que la convierte en la lectura que se pedía —«le bajaste
 * 250 kcal el 6 de julio; desde entonces, −2,4 kg»— sin declarar ningún tramo a
 * mano ni añadir una columna al esquema.
 *
 * Lo que hay que proteger: que un cambio es un CAMBIO (dos pesajes con la misma
 * cifra no lo son), y que el «desde entonces» no se inventa cuando todavía no
 * hay ningún pesaje posterior — ahí la diferencia es cero por definición y
 * pintarla como resultado sería mentir sobre lo que aún no ha pasado.
 */
describe('los cambios de kcal salen de la foto de cada pesaje', () => {
  const log = (date, weight, kcals) => ({
    id: date,
    date,
    weight,
    ...(kcals ? { nutrition: { kcals } } : {}),
  });

  it('un escalón es un cambio de cifra, no un pesaje más', () => {
    const history = [
      log('2026-06-01', 80, 2500),
      log('2026-06-08', 79.4, 2500),
      log('2026-06-15', 79.1, 2250),
      log('2026-06-22', 78.2, 2250),
    ];
    expect(kcalSteps(history)).toEqual([{ date: '2026-06-15', from: 2500, to: 2250, delta: -250 }]);
  });

  it('el último cambio trae lo que ha hecho el peso desde entonces', () => {
    const history = [
      log('2026-06-01', 80, 2500),
      log('2026-06-15', 79.1, 2250),
      log('2026-06-29', 76.7, 2250),
    ];
    expect(lastKcalChange(history)).toMatchObject({
      date: '2026-06-15',
      delta: -250,
      weightFrom: 79.1,
      weightTo: 76.7,
      weightDelta: -2.4,
    });
  });

  /* El día que se toca el objetivo, el «desde entonces» todavía no existe. */
  it('sin pesaje posterior al cambio no hay diferencia que contar', () => {
    const history = [log('2026-06-01', 80, 2500), log('2026-06-15', 79.1, 2250)];
    expect(lastKcalChange(history).weightDelta).toBeNull();
  });

  /* Con una sola cifra pautada no hay «desde entonces»: decirlo igualmente
     sería inventarse un hito que no ha ocurrido. */
  it('sin ningún cambio no hay hito', () => {
    expect(lastKcalChange([log('2026-06-01', 80, 2500), log('2026-06-08', 79, 2500)])).toBeNull();
    expect(lastKcalChange([])).toBeNull();
  });

  /* Los pesajes anteriores a que la dieta guardara su foto no cuentan como un
     cambio: no dicen «cero kcal», dicen que no se sabe. */
  it('los pesajes sin foto de la dieta no son un escalón', () => {
    const history = [log('2026-05-01', 82, null), log('2026-06-01', 80, 2500), log('2026-06-08', 79, 2500)];
    expect(kcalSteps(history)).toEqual([]);
  });
});

/**
 * LA VENTANA DE LAS MEDIDAS — el aviso de Manuel Viñuales (20 sep 2026).
 *
 * ══ Qué se está fijando aquí ═══════════════════════════════════════════════
 *
 * Un cliente abrió su revisión de la semana y se encontró «3 de 4 completadas»
 * sin haber tocado nada: el renglón de las medidas iba en verde, fechado en una
 * toma de dos semanas antes. La cuenta miraba el historial ENTERO, así que una
 * vez medido el paso ya no se apagaba nunca.
 *
 * Es el fallo más caro de todos los de su clase, porque no se ve: el cliente
 * cree que ya lo ha entregado, el entrenador recibe una semana sin medidas y
 * nadie reclama nada.
 */
describe('ultimaMedidaDe', () => {
  const medida = (date, extra) => ({ id: date, date, weight: 80, ...extra });
  const conPerimetros = (date) => medida(date, { perimeters: { chest: 102, waist: 79 } });

  it('no da por hecha la toma de una semana anterior', () => {
    const history = [conPerimetros('2026-09-01'), medida('2026-09-16')];
    expect(ultimaMedidaDe(history, { desde: '2026-09-14' })).toBeNull();
  });

  it('encuentra la del periodo abierto', () => {
    const history = [conPerimetros('2026-09-01'), conPerimetros('2026-09-16')];
    expect(ultimaMedidaDe(history, { desde: '2026-09-14' })).toMatchObject({ date: '2026-09-16' });
  });

  /* La misma ventana que los pesajes: con cadencia quincenal el periodo mide
     catorce días, y medirse la primera de las dos semanas cuenta. */
  it('con cadencia quincenal abarca las dos semanas', () => {
    const history = [conPerimetros('2026-09-15')];
    expect(ultimaMedidaDe(history, { desde: '2026-09-07', semanas: 2 })).toMatchObject({
      date: '2026-09-15',
    });
    /* Y con cadencia semanal esa misma toma cae fuera: es de la semana de al lado. */
    expect(ultimaMedidaDe(history, { desde: '2026-09-07' })).toBeNull();
  });

  /* Lo de después del periodo tampoco: la toma de la semana que viene no
     entrega la de ahora. */
  it('deja fuera lo posterior al periodo', () => {
    expect(ultimaMedidaDe([conPerimetros('2026-09-22')], { desde: '2026-09-14' })).toBeNull();
  });

  /* Un pesaje no es una medida. Era lo que separaba esta cuenta de la del
     guardián que deja entregar, y por eso decían cosas distintas. */
  it('un registro con solo peso no cuenta como medida', () => {
    expect(ultimaMedidaDe([medida('2026-09-16')], { desde: '2026-09-14' })).toBeNull();
  });

  /* Las medidas propias del protocolo cuentan igual que los perímetros: el
     guardián ya las contaba y el renglón no, que es de donde salía el
     desacuerdo entre la lista y el botón. */
  it('las medidas propias del protocolo también son medidas', () => {
    const history = [medida('2026-09-16', { medidas: { brazo_iso: 36.5 } })];
    expect(ultimaMedidaDe(history, { desde: '2026-09-14' })).toMatchObject({ date: '2026-09-16' });
    expect(tieneMedidas({ medidas: { brazo_iso: '' } })).toBe(false);
  });

  it('sin ventana devuelve la última de todas', () => {
    const history = [conPerimetros('2026-09-01'), conPerimetros('2026-09-16')];
    expect(ultimaMedidaDe(history)).toMatchObject({ date: '2026-09-16' });
  });
});
