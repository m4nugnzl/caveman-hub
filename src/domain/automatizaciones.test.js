import { describe, expect, it } from 'vitest';

import {
  HORIZONTE,
  MAX_PASOS,
  MAX_SALTOS,
  buildAutomatizacion,
  buildPaso,
  claveDeCorrida,
  cuentaPasos,
  encadenaBien,
  encadenables,
  hiloDice,
  loQueToca,
  nombreDe,
  sanitizeAutomatizacion,
  semanaISO,
} from './automatizaciones';

/**
 * Las pruebas de la tanda 2, y **escritas antes que la pantalla** a propósito.
 *
 * El riesgo entero de las automatizaciones no es que se vean mal: es que alguien
 * reciba el vídeo de bienvenida dos veces, y ése es el único fallo del producto
 * que no se puede corregir después. La pantalla se puede rehacer el martes; un
 * cuestionario mandado dos veces a cuarenta personas, no.
 *
 * Así que lo que se prueba aquí, en este orden: qué vez es (la ocurrencia), qué
 * día cae (el desfase absoluto), qué NO sale (la historia, el pausado, el que no
 * tiene alta) y que una cadena no se muerda la cola.
 */

const cliente = (extra = {}) => ({
  id: 'c1',
  name: 'Marta',
  status: 'active',
  start_date: '2026-09-07', // un lunes
  ...extra,
});

const auto = (extra = {}) => ({
  ...buildAutomatizacion({ protocoloId: 'p1', disparador: 'alta' }),
  ...extra,
});

const paso = (extra = {}) => buildPaso({ que: 'pide', titulo: 'Analítica', ...extra });

describe('la semana ISO, que es media llave de la ocurrencia', () => {
  it('la semana es la de su jueves, no la del día 1 de enero', () => {
    /* El 1 de enero de 2027 es viernes: su semana es la 53 de 2026. Sin esta
       regla, dos lunes seguidos de final de diciembre comparten ocurrencia y el
       check-in de uno de los dos no sale nunca. */
    expect(semanaISO('2027-01-01')).toBe('2026-W53');
    expect(semanaISO('2026-12-28')).toBe('2026-W53');
    expect(semanaISO('2027-01-04')).toBe('2027-W01');
  });

  it('todos los días de una misma semana dicen lo mismo', () => {
    const lunes = semanaISO('2026-09-07');
    expect(semanaISO('2026-09-10')).toBe(lunes);
    expect(semanaISO('2026-09-13')).toBe(lunes);
    expect(semanaISO('2026-09-14')).not.toBe(lunes);
  });
});

describe('la ocurrencia: qué vez es', () => {
  it('lo que pasa al empezar es «once», pase lo que pase', () => {
    const a = auto({ disparador: 'alta', pasos: [paso({ dia: 0 })] });
    const hoy = loQueToca({ automatizaciones: [a], cliente: cliente(), hoy: '2026-09-09' });
    expect(hoy).toHaveLength(1);
    expect(hoy[0].ocurrencia).toBe('once');

    /* Y un mes después sigue siendo la misma vez: si esta clave cambiara con el
       día en que se mira, el alta saldría otra vez cada vez que se abre la
       aplicación. */
    const luego = loQueToca({ automatizaciones: [a], cliente: cliente(), hoy: '2026-10-09' });
    expect(luego.map((x) => x.ocurrencia)).toEqual(['once']);
  });

  it('lo semanal lleva su semana, y cambia con ella', () => {
    const a = auto({ disparador: 'semana', valor: { day: 1, every: 1 }, pasos: [paso({ dia: 0 })] });
    const semana37 = loQueToca({
      automatizaciones: [a],
      cliente: cliente(),
      hoy: '2026-09-09',
      horizonte: 0,
    });
    expect(semana37[0].ocurrencia).toBe('2026-W37');

    const semana38 = loQueToca({
      automatizaciones: [a],
      cliente: cliente(),
      hoy: '2026-09-16',
      horizonte: 0,
    });
    expect(semana38[0].ocurrencia).toBe('2026-W38');
  });

  it('lo ya apuntado no vuelve a salir', () => {
    const p = paso({ dia: 0 });
    const a = auto({ disparador: 'alta', pasos: [p] });
    const hechas = new Set([
      claveDeCorrida({ automationId: a.id, pasoId: p.id, ocurrencia: 'once' }),
    ]);
    expect(loQueToca({ automatizaciones: [a], cliente: cliente(), hechas, hoy: '2026-09-09' })).toEqual(
      []
    );
  });

  it('la clave se dice igual aquí que en el índice único de la base', () => {
    expect(claveDeCorrida({ automationId: 'a', pasoId: 'p', ocurrencia: '2026-W37' })).toBe(
      'a|p|2026-W37'
    );
  });
});

describe('el desfase es absoluto desde el disparador', () => {
  it('cada paso cuenta desde el disparo, no desde el paso anterior', () => {
    const a = auto({
      disparador: 'alta',
      pasos: [paso({ dia: 0 }), paso({ dia: 3 }), paso({ dia: 7 })],
    });
    const toca = loQueToca({ automatizaciones: [a], cliente: cliente(), hoy: '2026-09-07' });
    expect(toca.map((x) => x.due)).toEqual(['2026-09-07', '2026-09-10', '2026-09-14']);
  });

  it('meter un paso en medio no mueve lo que va detrás', () => {
    const a = auto({ disparador: 'alta', pasos: [paso({ dia: 0 }), paso({ dia: 7 })] });
    const antes = loQueToca({ automatizaciones: [a], cliente: cliente(), hoy: '2026-09-07' });

    const conMedio = sanitizeAutomatizacion({ ...a, pasos: [...a.pasos, paso({ dia: 3 })] });
    const despues = loQueToca({
      automatizaciones: [conMedio],
      cliente: cliente(),
      hoy: '2026-09-07',
    });

    /* El del día 7 sigue cayendo el día 7 — y encima con la misma clave, así que
       si ya había corrido no vuelve a salir. */
    expect(despues.map((x) => x.due)).toEqual(['2026-09-07', '2026-09-10', '2026-09-14']);
    expect(antes.at(-1).paso.id).toBe(despues.at(-1).paso.id);
  });

  it('los pasos salen ordenados por día aunque se escriban al revés', () => {
    const a = sanitizeAutomatizacion({
      ...auto(),
      pasos: [paso({ dia: 10 }), paso({ dia: 2 }), paso({ dia: 0 })],
    });
    expect(a.pasos.map((p) => p.dia)).toEqual([0, 2, 10]);
  });
});

describe('lo que NO sale, que es la mitad del trabajo', () => {
  it('no se reparte la historia: el que lleva seis semanas no recibe seis altas', () => {
    const a = auto({ disparador: 'semana', valor: { day: 1, every: 1 }, pasos: [paso({ dia: 0 })] });
    const toca = loQueToca({
      automatizaciones: [a],
      cliente: cliente({ start_date: '2026-07-06' }),
      hoy: '2026-09-09',
      horizonte: 0,
    });
    expect(toca).toHaveLength(1);
    expect(toca[0].due).toBe('2026-09-07');
  });

  it('escribir una regla NO reparte el pasado', () => {
    /*
      El fallo que se vio con la aplicación delante: teclear «cuando alguien
      empiece conmigo, mándale el vídeo del día 3» le mandó ese vídeo, en el
      acto, a los seis clientes que ya llevaban meses — fechado en marzo, porque
      su alta fue en marzo. Escribir una regla no es ejecutarla hacia atrás.
    */
    const a = auto({ disparador: 'alta', creada: '2026-09-01', pasos: [paso({ dia: 0 })] });
    const viejo = cliente({ start_date: '2026-03-26' });
    expect(loQueToca({ automatizaciones: [a], cliente: viejo, hoy: '2026-09-09' })).toEqual([]);

    /* Y a quien empieza después de escribirla, sí. */
    const nuevo = cliente({ id: 'c2', start_date: '2026-09-07' });
    expect(loQueToca({ automatizaciones: [a], cliente: nuevo, hoy: '2026-09-09' })).toHaveLength(1);
  });

  it('el pausado y el archivado no entran, nunca', () => {
    const a = auto({ pasos: [paso({ dia: 0 })] });
    for (const status of ['paused', 'archived']) {
      expect(loQueToca({ automatizaciones: [a], cliente: cliente({ status }), hoy: '2026-09-09' })).toEqual(
        []
      );
    }
  });

  it('sin fecha de alta no hay desde dónde contar', () => {
    const a = auto({ disparador: 'alta', pasos: [paso({ dia: 0 })] });
    expect(
      loQueToca({ automatizaciones: [a], cliente: cliente({ start_date: null }), hoy: '2026-09-09' })
    ).toEqual([]);
  });

  it('el alta se lee en las DOS formas de un cliente', () => {
    /*
      La fila de la base dice `start_date` y el objeto que reparte el contexto
      dice `startDate` (pasa por `mappers.js`). Leer solo una no da error: da un
      «no tiene alta» que no es verdad, y entonces a la cartera entera no le
      corre nada y nadie se entera. Se cazó con la aplicación delante.
    */
    const a = auto({ disparador: 'alta', pasos: [paso({ dia: 0 })] });
    const delContexto = { id: 'c1', status: 'active', startDate: '2026-09-07' };
    const toca = loQueToca({ automatizaciones: [a], cliente: delContexto, hoy: '2026-09-09' });
    expect(toca).toHaveLength(1);
    expect(toca[0].due).toBe('2026-09-07');
  });

  /*
    Los dos que se cazaron con la aplicación delante, el 11 de septiembre, y que
    ninguna prueba de antes veía.
  */
  it('un paso a medio escribir no se intenta', () => {
    /*
      `filasDeEnvio` rechaza en silencio lo incompleto, así que sin este filtro
      el repaso apuntaba la corrida, no sacaba nada y borraba el apunte — un ir y
      venir a la base en CADA repaso, para siempre, por un paso que alguien dejó
      a medias.
    */
    const sinFormulario = auto({ pasos: [buildPaso({ que: 'form', dia: 0 })] });
    expect(loQueToca({ automatizaciones: [sinFormulario], cliente: cliente(), hoy: '2026-09-09' })).toEqual([]);

    const videoSinEnlace = auto({ pasos: [buildPaso({ que: 'video', dia: 0, titulo: 'Guía' })] });
    expect(loQueToca({ automatizaciones: [videoSinEnlace], cliente: cliente(), hoy: '2026-09-09' })).toEqual([]);

    const saltoSinDestino = auto({ pasos: [buildPaso({ que: 'salta', dia: 0 })] });
    expect(loQueToca({ automatizaciones: [saltoSinDestino], cliente: cliente(), hoy: '2026-09-09' })).toEqual([]);

    const entero = auto({
      pasos: [buildPaso({ que: 'video', dia: 0, titulo: 'Guía', enlace: 'https://x.invalid' })],
    });
    expect(loQueToca({ automatizaciones: [entero], cliente: cliente(), hoy: '2026-09-09' })).toHaveLength(1);
  });

  it('y tampoco cuenta como «una cosa que le pasa sola»', () => {
    const aMedias = auto({ pasos: [buildPaso({ que: 'form', dia: 0 })] });
    expect(cuentaPasos([aMedias])).toBe(0);
  });

  it('la apagada no corre', () => {
    const a = auto({ activa: false, pasos: [paso({ dia: 0 })] });
    expect(loQueToca({ automatizaciones: [a], cliente: cliente(), hoy: '2026-09-09' })).toEqual([]);
  });

  it('no se adelanta más allá del horizonte', () => {
    const a = auto({
      disparador: 'alta',
      pasos: [paso({ dia: 0 }), paso({ dia: HORIZONTE + 1 })],
    });
    const toca = loQueToca({ automatizaciones: [a], cliente: cliente(), hoy: '2026-09-07' });
    /* El desfase largo sí se materializa —el disparo cae dentro del horizonte y
       lo que se escribe es una fila con su fecha—, pero un disparo SEMANAL de
       dentro de dos meses no. */
    expect(toca).toHaveLength(2);

    const semanal = auto({
      disparador: 'semana',
      valor: { day: 1, every: 1 },
      pasos: [paso({ dia: 0 })],
    });
    const semanas = loQueToca({
      automatizaciones: [semanal],
      cliente: cliente(),
      hoy: '2026-09-07',
      horizonte: 14,
    });
    expect(semanas.map((x) => x.due)).toEqual(['2026-09-07', '2026-09-14', '2026-09-21']);
  });

  it('«cada 2 semanas» le toca en su semana y no en la de todos', () => {
    const a = auto({ disparador: 'semana', valor: { day: 1, every: 2 }, pasos: [paso({ dia: 0 })] });
    /* Marta empieza el 7; la suya es la del 7, la del 21, la del 5… */
    const suyas = loQueToca({
      automatizaciones: [a],
      cliente: cliente({ start_date: '2026-09-07' }),
      hoy: '2026-09-07',
      horizonte: 21,
    });
    expect(suyas.map((x) => x.due)).toEqual(['2026-09-07', '2026-09-21']);

    /* Luis empieza una semana después: las suyas son las otras. */
    const otras = loQueToca({
      automatizaciones: [a],
      cliente: cliente({ id: 'c2', start_date: '2026-09-14' }),
      hoy: '2026-09-07',
      horizonte: 21,
    });
    expect(otras.map((x) => x.due)).toEqual(['2026-09-14', '2026-09-28']);
  });

  it('la manual no se dispara sola, y con el dedo solo se dispara ella', () => {
    const manualita = auto({ disparador: 'manual', pasos: [paso({ dia: 0 })] });
    const deAlta = auto({ disparador: 'alta', pasos: [paso({ dia: 0 })] });

    expect(
      loQueToca({ automatizaciones: [manualita], cliente: cliente(), hoy: '2026-09-09' })
    ).toEqual([]);

    const aDedo = loQueToca({
      automatizaciones: [manualita, deAlta],
      cliente: cliente(),
      hoy: '2026-09-09',
      manual: { automationId: manualita.id, ocurrencia: 'env_1' },
    });
    expect(aDedo).toHaveLength(1);
    expect(aDedo[0].ocurrencia).toBe('env_1');
    expect(aDedo[0].due).toBe('2026-09-09');
  });
});

describe('encadenar, sin morderse la cola', () => {
  const conCadena = () => {
    const b = { ...auto({ disparador: 'cadena' }), id: 'auto_b', pasos: [paso({ dia: 2 })] };
    const a = {
      ...auto({ disparador: 'semana' }),
      id: 'auto_a',
      valor: { day: 1, every: 1 },
      pasos: [paso({ dia: 0 }), buildPaso({ que: 'salta', dia: 1, saltaA: 'auto_b' })],
    };
    return { a, b };
  };

  it('la encadenada hereda la ocurrencia de quien la llama', () => {
    const { a, b } = conCadena();
    const toca = loQueToca({
      automatizaciones: [a, b],
      cliente: cliente(),
      hoy: '2026-09-07',
      horizonte: 0,
    });
    /* Los tres —el paso de A, el salto y el paso de B— con la MISMA ocurrencia.
       Con `'once'` en la encadenada, «cada lunes → empieza X» dispararía X una
       sola vez en la vida. */
    expect(toca.map((x) => x.ocurrencia)).toEqual(['2026-W37', '2026-W37', '2026-W37']);
    /* Y el día de B cuenta desde el salto, no desde el disparo de A. */
    expect(toca.at(-1).due).toBe('2026-09-10');
  });

  it('la semana siguiente vuelve a encadenar, con la suya', () => {
    const { a, b } = conCadena();
    const toca = loQueToca({
      automatizaciones: [a, b],
      cliente: cliente(),
      hoy: '2026-09-07',
      horizonte: 7,
    });
    expect([...new Set(toca.map((x) => x.ocurrencia))]).toEqual(['2026-W37', '2026-W38']);
  });

  it('un paso añadido a la encadenada sale aunque el salto ya corriera', () => {
    const { a, b } = conCadena();
    const salto = a.pasos[1];
    const hechas = new Set([
      claveDeCorrida({ automationId: a.id, pasoId: a.pasos[0].id, ocurrencia: '2026-W37' }),
      claveDeCorrida({ automationId: a.id, pasoId: salto.id, ocurrencia: '2026-W37' }),
    ]);
    const toca = loQueToca({
      automatizaciones: [a, b],
      cliente: cliente(),
      hechas,
      hoy: '2026-09-07',
      horizonte: 0,
    });
    /* Lo que ya corrió no se toca; lo que no ha corrido, corre. El salto está
       apuntado y aun así la cadena se camina. */
    expect(toca).toHaveLength(1);
    expect(toca[0].automatizacion.id).toBe('auto_b');
  });

  it('no se puede encadenar a sí misma ni cerrar un círculo', () => {
    const b = { ...auto({ disparador: 'cadena' }), id: 'auto_b', pasos: [] };
    const c = {
      ...auto({ disparador: 'cadena' }),
      id: 'auto_c',
      pasos: [buildPaso({ que: 'salta', saltaA: 'auto_b' })],
    };
    expect(encadenaBien('auto_b', 'auto_b', [b])).toBe(false);
    /* B → C cerraría el círculo, porque C ya vuelve a B. */
    expect(encadenaBien('auto_b', 'auto_c', [b, c])).toBe(false);
    expect(encadenables({ id: 'auto_b' }, [b, c]).map((x) => x.id)).toEqual([]);
  });

  it('y si un ciclo ya está guardado, el tope de saltos lo corta al correr', () => {
    /* Escrito a mano saltándose `encadenaBien`, que es exactamente lo que puede
       haber en la base de antes de que la comprobación existiera. */
    const a = {
      ...auto({ disparador: 'alta' }),
      id: 'auto_a',
      pasos: [buildPaso({ que: 'salta', dia: 1, saltaA: 'auto_b' })],
    };
    const b = {
      ...auto({ disparador: 'cadena' }),
      id: 'auto_b',
      pasos: [buildPaso({ que: 'salta', dia: 1, saltaA: 'auto_a' })],
    };
    const toca = loQueToca({ automatizaciones: [a, b], cliente: cliente(), hoy: '2026-09-07' });
    expect(toca.length).toBeLessThanOrEqual(MAX_SALTOS + 1);
  });
});

describe('el hilo habla el idioma de su disparador', () => {
  const alta = auto({ disparador: 'alta' });
  const lunes = auto({ disparador: 'semana', valor: { day: 1, every: 1 } });

  it('desde el alta se cuenta en días y en semanas', () => {
    expect(hiloDice(alta, 0)).toBe('ese mismo día');
    expect(hiloDice(alta, 1)).toBe('al día siguiente');
    expect(hiloDice(alta, 2)).toBe('el día 3');
    expect(hiloDice(alta, 7)).toBe('a la semana');
    expect(hiloDice(alta, 14)).toBe('a las 2 semanas');
  });

  it('desde un lunes se cuenta en días de la semana', () => {
    expect(hiloDice(lunes, 0)).toBe('ese lunes');
    expect(hiloDice(lunes, 3)).toBe('el jueves');
    expect(hiloDice(lunes, 7)).toBe('el lunes siguiente');
    expect(hiloDice(lunes, 10)).toBe('el jueves siguiente');
  });
});

describe('la forma', () => {
  it('sin nombre, se llama como su disparador', () => {
    expect(nombreDe(auto({ disparador: 'alta' }))).toBe('Cuando empieza contigo');
    expect(nombreDe(auto({ disparador: 'semana', valor: { day: 4, every: 1 } }))).toBe('Cada jueves');
    expect(nombreDe(auto({ disparador: 'semana', valor: { day: 1, every: 3 } }))).toBe(
      'Cada 3 semanas, lunes'
    );
    expect(nombreDe(auto({ nombre: 'Bienvenida' }))).toBe('Bienvenida');
  });

  it('el saneado descarta lo que no conoce', () => {
    const sucia = sanitizeAutomatizacion({
      id: 'a1',
      disparador: 'cuando_le_apetezca',
      pasos: [paso({ dia: 3 }), { id: 'x', que: 'teletransportar' }, null],
      loQueVenga: 'esto no se guarda',
    });
    expect(sucia.disparador).toBe('alta');
    expect(sucia.pasos).toHaveLength(1);
    expect(sucia).not.toHaveProperty('loQueVenga');
  });

  it('sin id no hay automatización', () => {
    expect(sanitizeAutomatizacion({ disparador: 'alta' })).toBeNull();
    expect(sanitizeAutomatizacion(null)).toBeNull();
  });

  it('no caben más pasos de los que se leen', () => {
    const muchos = Array.from({ length: MAX_PASOS + 5 }, (_, i) => paso({ dia: i }));
    expect(sanitizeAutomatizacion({ id: 'a1', disparador: 'alta', pasos: muchos }).pasos).toHaveLength(
      MAX_PASOS
    );
  });

  it('una nueva nace vacía; una copiada trae los pasos con ids nuevos', () => {
    expect(buildAutomatizacion({ protocoloId: 'p1' }).pasos).toEqual([]);
    const origen = auto({ pasos: [paso({ dia: 1 })] });
    const copia = buildAutomatizacion({ protocoloId: 'p1', desde: origen });
    expect(copia.pasos).toHaveLength(1);
    expect(copia.pasos[0].id).not.toBe(origen.pasos[0].id);
  });

  it('«4 cosas le pasan solas» no cuenta los saltos ni las apagadas', () => {
    const a = auto({ pasos: [paso({ dia: 0 }), buildPaso({ que: 'salta', saltaA: 'x' })] });
    const off = auto({ activa: false, pasos: [paso({ dia: 0 })] });
    expect(cuentaPasos([a, off])).toBe(1);
  });
});

/**
 * LA FRONTERA ENTRE LOS DOS MOTORES, que es lo que la tanda 3 añade aquí.
 *
 * De este lado solo queda el vocabulario: los disparadores que provoca el
 * cliente —«cuando te conteste», «cuando se pese»— los reparte la base
 * (migración 0117), y lo único que este módulo tiene que hacer con ellos es **no
 * tocarlos**. Si `loQueToca` los devolviera, el navegador escribiría lo mismo
 * que ya escribió el disparador de tabla: el doble disparo por la puerta de
 * atrás, y encima una vez por cada arranque de la aplicación.
 */
describe('los disparadores del cliente: el navegador no los reparte', () => {
  const suyos = (disparador, extra = {}) =>
    loQueToca({
      automatizaciones: [auto({ disparador, pasos: [paso({ dia: 0 })], ...extra })],
      cliente: cliente(),
      hoy: '2026-09-14',
    });

  it('«cuando te conteste» no saca ni una fila desde aquí', () => {
    expect(suyos('contesta')).toEqual([]);
    expect(suyos('contesta', { valor: { formId: 'f1' } })).toEqual([]);
  });

  it('«cuando se pese» tampoco', () => {
    expect(suyos('pesaje')).toEqual([]);
  });

  it('y los del motor 1 siguen saliendo, que es la otra mitad de la frontera', () => {
    expect(suyos('alta')).toHaveLength(1);
  });

  it('el formulario apuntado se guarda, y cambiar de disparador lo suelta', () => {
    const acotada = sanitizeAutomatizacion({
      id: 'a1',
      disparador: 'contesta',
      valor: { formId: 'form_alta' },
      pasos: [paso({ dia: 0 })],
    });
    expect(acotada.valor).toEqual({ formId: 'form_alta' });

    /* Sin acotar es un valor CON significado —«cualquier cosa que le pidas»— y
       no un hueco sin rellenar: por eso es `null` dentro del objeto y no el
       objeto entero ausente. */
    expect(sanitizeAutomatizacion({ id: 'a1', disparador: 'contesta' }).valor).toEqual({
      formId: null,
    });

    /*
      Y el horario del semanal no se arrastra a un «cuando se pese», ni al revés.
      Lo que guardó el disparador anterior no puede quedarse debajo esperando a
      que alguien vuelva a cambiarlo: ahí es donde aparecen las reglas que hacen
      algo que nadie escribió.
    */
    const pesaje = sanitizeAutomatizacion({
      id: 'a1',
      disparador: 'pesaje',
      valor: { day: 4, every: 2, formId: 'f1' },
    });
    expect(pesaje.valor).toBeNull();
  });

  it('el hilo les habla en el idioma del hecho, no en el del calendario', () => {
    /* «el día 4» y no «el jueves»: lo que dispara es que se pesó, y eso no cae
       en un día de la semana conocido. */
    expect(hiloDice(auto({ disparador: 'pesaje' }), 0)).toBe('ese mismo día');
    expect(hiloDice(auto({ disparador: 'contesta' }), 3)).toBe('el día 4');
    expect(hiloDice(auto({ disparador: 'contesta' }), 14)).toBe('a las 2 semanas');
  });
});

describe('el silencio: lo que dispara una ausencia', () => {
  it('el navegador no lo reparte: lo mira el latido, una vez al día', () => {
    /*
      Es la misma frontera que la del motor 2 y con un motivo propio: el disparo
      del silencio depende de QUÉ DÍA SE MIRE. Si además lo repartiera el
      navegador, quien abriera la aplicación por la noche adelantaría el aviso
      medio día. Un reloj.
    */
    const salido = loQueToca({
      automatizaciones: [
        auto({ disparador: 'silencio', valor: { que: 'entrenar', dias: 10 }, pasos: [paso({ dia: 0 })] }),
      ],
      cliente: cliente(),
      hoy: '2026-09-14',
    });
    expect(salido).toEqual([]);
  });

  it('el valor se sanea con su suelo y su techo', () => {
    const corta = sanitizeAutomatizacion({
      id: 'a1',
      disparador: 'silencio',
      valor: { que: 'entrenar', dias: 1 },
    });
    /* Con un día, «sin entrenar» saltaría el martes de cualquiera que entrene
       lunes y miércoles. */
    expect(corta.valor).toEqual({ que: 'entrenar', dias: 3 });

    const larga = sanitizeAutomatizacion({
      id: 'a1',
      disparador: 'silencio',
      valor: { que: 'pesarse', dias: 999 },
    });
    expect(larga.valor).toEqual({ que: 'pesarse', dias: 90 });

    /* Un «sin qué» que no está en el catálogo cae en el primero, no se guarda a
       medias: la base solo sabe leer los tres. */
    const rara = sanitizeAutomatizacion({
      id: 'a1',
      disparador: 'silencio',
      valor: { que: 'bailar', dias: 14 },
    });
    expect(rara.valor).toEqual({ que: 'entrenar', dias: 14 });
  });

  it('y cambiar de disparador suelta lo que guardó el silencio', () => {
    const despues = sanitizeAutomatizacion({
      id: 'a1',
      disparador: 'alta',
      valor: { que: 'entrenar', dias: 14 },
    });
    expect(despues.valor).toBeNull();
  });

  it('se llama como se lee: «10 días sin entrenar»', () => {
    expect(nombreDe(auto({ disparador: 'silencio', valor: { que: 'entrenar', dias: 10 } }))).toBe(
      '10 días sin entrenar'
    );
    expect(nombreDe(auto({ disparador: 'silencio', valor: { que: 'contestar', dias: 21 } }))).toBe(
      '21 días sin contestarte'
    );
  });

  it('el hilo no promete un día que no existe', () => {
    /* El disparo es la mañana en que el latido lo nota, así que «ese mismo día»
       no tendría a qué referirse. Lo de después sí se cuenta en días. */
    expect(hiloDice(auto({ disparador: 'silencio' }), 0)).toBe('en cuanto se note');
    expect(hiloDice(auto({ disparador: 'silencio' }), 7)).toBe('a la semana');
  });
});
