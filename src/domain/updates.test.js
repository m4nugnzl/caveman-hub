import { describe, expect, it } from 'vitest';

import {
  NOTE_MAX,
  clientUpdates,
  dismissUpdate,
  noteStamp,
  pendingTasks,
  recordatorioDeSemana,
  stampUpdate,
  unseenUpdates,
} from './updates';
import { parseVideoUrl } from './video';

/**
 * ══ Qué protege este archivo ═══════════════════════════════════════════════
 *
 * Dos reglas de las que depende que esto no moleste:
 *
 *   1. **Quien entra por primera vez no tiene novedades.** Sin `seen` guardado,
 *      un cliente que estrena el portal vería como «nuevo» todo lo que su
 *      entrenador dejó puesto en marzo.
 *   2. **Solo se pide lo que el entrenador ha configurado.** Un pendiente
 *      inventado —«sube tus pliegues» a quien no se los piden— es peor que no
 *      tener pendientes.
 */

const prefs = (updates, seen) => ({
  updates,
  ...(seen ? { feed: { seen } } : {}),
});

describe('novedades', () => {
  const ayer = '2026-08-14T10:00:00.000Z';
  const hoy = '2026-08-15T10:00:00.000Z';
  const ahora = '2026-08-15T23:00:00.000Z';

  it('sin haber mirado nunca, no hay novedades', () => {
    expect(unseenUpdates(prefs({ diet: hoy }), ahora)).toEqual([]);
  });

  it('solo lo sellado DESPUÉS de la última visita', () => {
    const lista = unseenUpdates(prefs({ diet: hoy, routine: ayer }, ayer), ahora);
    expect(lista.map((n) => n.id)).toEqual(['diet']);
  });

  it('lo más reciente primero', () => {
    const lista = unseenUpdates(
      prefs({ diet: hoy, routine: '2026-08-15T20:00:00.000Z' }, ayer),
      ahora
    );
    expect(lista.map((n) => n.id)).toEqual(['routine', 'diet']);
  });

  /* Una clave que no existe, o una fecha que no es una fecha, no puede colarse
     hasta la pantalla: `preferences` es una columna abierta que el propio cliente
     puede escribir con la API. */
  it('lo que no se reconoce se descarta', () => {
    expect(clientUpdates({ updates: { diet: 'ayer por la tarde', otra: hoy } })).toEqual({});
    expect(clientUpdates(undefined)).toEqual({});
  });

  it('sellar conserva los otros sellos', () => {
    const antes = prefs({ diet: ayer });
    expect(stampUpdate(antes, 'routine', hoy)).toEqual({ diet: ayer, routine: hoy });
  });

  it('sellar algo que no existe no cambia nada', () => {
    expect(stampUpdate(prefs({ diet: ayer }), 'fotos', hoy)).toEqual({ diet: ayer });
  });
});

describe('pendientes', () => {
  const hoy = '2026-08-15';
  const log = (date, extra = {}) => ({ id: date, date, weight: 80, ...extra });

  it('los pesajes que faltan para el objetivo de la semana', () => {
    const protocol = { weighIns: 3 };
    const tareas = pendingTasks({ history: [log('2026-08-13')], protocol, today: hoy });
    expect(tareas.map((t) => t.id)).toEqual(['weights']);
    expect(tareas[0].label).toContain('2 pesajes');
  });

  /*
    ══ Y si su entrenador no le pide pesajes, no se le reclama ninguno ════════

    El objetivo eran tres escritos en `weeklyCheckIn`, así que esta tarea le
    salía a TODO cliente cuyo entrenador no hubiera pedido nada: deberes que no
    manda nadie, en la pantalla que abre cada día. La norma la pone el protocolo.
  */
  it('sin pesajes pedidos en el protocolo no se reclama ninguno', () => {
    expect(pendingTasks({ history: [log('2026-08-13')], today: hoy })).toEqual([]);
    expect(pendingTasks({ history: [], protocol: { weighIns: 0 }, today: hoy })).toEqual([]);
  });

  it('con la semana hecha no se pide nada', () => {
    const history = ['2026-08-11', '2026-08-13', '2026-08-15'].map((d) => log(d));
    expect(pendingTasks({ history, protocol: { weighIns: 3 }, today: hoy })).toEqual([]);
  });

  /* Lo que el entrenador NO ha marcado como obligatorio no aparece: el protocolo
     por defecto deja los dos bloques en «opcional». */
  it('sin bloques obligatorios no se piden medidas', () => {
    const history = ['2026-08-11', '2026-08-13', '2026-08-15'].map((d) => log(d));
    const protocol = { checkin: { perimeters: 'optional', folds: 'off' } };
    expect(pendingTasks({ history, protocol, today: hoy })).toEqual([]);
  });

  it('un bloque obligatorio sin medir esta semana sí', () => {
    const history = ['2026-08-11', '2026-08-13', '2026-08-15'].map((d) => log(d));
    const protocol = { checkin: { perimeters: 'required', folds: 'off' } };
    const tareas = pendingTasks({ history, protocol, today: hoy });
    expect(tareas.map((t) => t.id)).toEqual(['block-perimeters']);
  });

  /* Se mide una vez, no en cada pesaje: basta con que CUALQUIER registro de la
     semana lo traiga. */
  it('medido en uno de los pesajes de la semana cuenta como hecho', () => {
    const history = [
      log('2026-08-11'),
      log('2026-08-13', { perimeters: { cintura: 80 } }),
      log('2026-08-15'),
    ];
    const protocol = { checkin: { perimeters: 'required', folds: 'off' } };
    expect(pendingTasks({ history, protocol, today: hoy })).toEqual([]);
  });

  /* Lo de la semana pasada no cuenta para esta: es lo que hace que el pendiente
     vuelva a aparecer cada lunes, que es de lo que se trata. */
  it('lo medido la semana pasada no vale para esta', () => {
    const history = [
      log('2026-08-04', { perimeters: { cintura: 80 } }),
      log('2026-08-11'),
      log('2026-08-13'),
      log('2026-08-15'),
    ];
    const protocol = { checkin: { perimeters: 'required', folds: 'off' } };
    expect(pendingTasks({ history, protocol, today: hoy }).map((t) => t.id)).toEqual([
      'block-perimeters',
    ]);
  });
});

/*
  ══ Los enlaces de vídeo ════════════════════════════════════════════════════

  Esto acaba en el `src` de un `<iframe>` dentro del portal del cliente, así que
  lo que protegen estas pruebas no es una comodidad: es que no entre una
  dirección de un sitio que no sea YouTube o Loom.
*/
describe('enlaces de vídeo', () => {
  it('reconoce las formas de YouTube', () => {
    const esperado = 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&modestbranding=1';
    for (const url of [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtu.be/dQw4w9WgXcQ',
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
      'https://youtube.com/shorts/dQw4w9WgXcQ',
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLx&t=42',
    ]) {
      expect(parseVideoUrl(url)?.embedUrl).toBe(esperado);
    }
  });

  it('reconoce Loom', () => {
    const video = parseVideoUrl('https://www.loom.com/share/0123456789abcdef0123456789abcdef');
    expect(video?.provider).toBe('loom');
    expect(video?.embedUrl).toContain('/embed/');
  });

  /* El caso que importa: un dominio que solo CONTIENE el nombre. Una comprobación
     con «incluye youtube.com» dejaría pasar el primero de estos. */
  it('no cuela nada que no sea de los dos sitios', () => {
    for (const url of [
      'https://malo.com/?x=youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtube.com.malo.net/watch?v=dQw4w9WgXcQ',
      'http://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'javascript:alert(1)',
      'https://vimeo.com/12345',
      '',
      null,
    ]) {
      expect(parseVideoUrl(url)).toBeNull();
    }
  });

  /* Dos formas de escribir el mismo vídeo tienen que dar la misma dirección
     canónica: es lo que evita que la misma revisión entre dos veces. */
  it('normaliza a una sola dirección', () => {
    const a = parseVideoUrl('https://youtu.be/dQw4w9WgXcQ');
    const b = parseVideoUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90');
    expect(a.watchUrl).toBe(b.watchUrl);
  });
});

/*
  ══ El aviso del entrenador ══════════════════════════════════════════════════

  La única novedad con texto libre: una frase a varios clientes desde la
  cartera. Lo que protegen estas pruebas: que viaja y se descarta como las
  demás, que sellar otra cosa no lo borra del tablón, y que el texto llega
  acotado — `preferences` es una columna que también escribe el cliente.
*/
describe('el aviso del entrenador', () => {
  const ayer = '2026-08-14T10:00:00.000Z';
  const hoy = '2026-08-15T10:00:00.000Z';
  const ahora = '2026-08-15T23:00:00.000Z';

  it('el saneado: sin nada que decir no hay aviso, y el texto llega acotado', () => {
    expect(noteStamp('   ', hoy)).toBeNull();
    expect(noteStamp(null, hoy)).toBeNull();
    expect(noteStamp('  Esta semana no paso consulta.  ', hoy)).toEqual({
      at: hoy,
      text: 'Esta semana no paso consulta.',
    });
    expect(noteStamp('x'.repeat(500), hoy).text).toHaveLength(NOTE_MAX);
  });

  it('llega como novedad, con su texto de frase secundaria', () => {
    const p = prefs({ note: { at: hoy, text: 'Mandad las fotos el viernes.' } }, ayer);
    const lista = unseenUpdates(p, ahora);
    expect(lista.map((n) => n.id)).toEqual(['note']);
    expect(lista[0].hint).toBe('Mandad las fotos el viernes.');
  });

  it('se descarta como las demás, y un aviso posterior VUELVE', () => {
    const base = { note: { at: hoy, text: 'Hola' } };
    const leido = { updates: base, feed: { seen: ayer, dismissed: { note: hoy } } };
    expect(unseenUpdates(leido, ahora)).toEqual([]);

    const nuevo = {
      updates: { note: { at: '2026-08-15T20:00:00.000Z', text: 'Otra cosa' } },
      feed: { seen: ayer, dismissed: { note: hoy } },
    };
    expect(unseenUpdates(nuevo, ahora).map((n) => n.id)).toEqual(['note']);
  });

  it('sellar la rutina no borra el aviso del tablón', () => {
    const p = prefs({ note: { at: ayer, text: 'Hola' } });
    expect(stampUpdate(p, 'routine', hoy)).toEqual({
      routine: hoy,
      note: { at: ayer, text: 'Hola' },
    });
  });

  it('un aviso malformado no se cuela hasta la pantalla', () => {
    expect(clientUpdates({ updates: { note: { at: 'ayer', text: 'Hola' } } })).toEqual({});
    expect(clientUpdates({ updates: { note: { at: hoy, text: '   ' } } })).toEqual({});
    expect(clientUpdates({ updates: { note: 'Hola' } })).toEqual({});
  });
});

describe('dismissUpdate — quitar una novedad sin quitar las demás', () => {
  const ayer = '2026-08-14T10:00:00Z';
  const hoy = '2026-08-15T10:00:00Z';

  const prefs = (updates, dismissed, seen = '2026-08-01T00:00:00Z') => ({
    updates,
    feed: { seen, ...(dismissed ? { dismissed } : {}) },
  });

  it('la quitada desaparece y la otra se queda', () => {
    const p = prefs({ routine: ayer, diet: ayer }, { routine: ayer });
    const ids = unseenUpdates(p, hoy).map((u) => u.id);
    expect(ids).not.toContain('routine');
    expect(ids).toContain('diet');
  });

  it('si el entrenador vuelve a tocarlo, la novedad VUELVE', () => {
    /*
      Es la razón de comparar contra el sello y no guardar un booleano: haberla
      leído en agosto no puede tapar un cambio de septiembre.
    */
    const p = prefs({ routine: hoy }, { routine: ayer });
    expect(unseenUpdates(p, hoy).map((u) => u.id)).toContain('routine');
  });

  it('descartar no toca a las demás claves', () => {
    const previo = { routine: ayer };
    expect(dismissUpdate({ feed: { dismissed: previo } }, 'diet', hoy)).toEqual({
      routine: ayer,
      diet: hoy,
    });
  });

  it('una clave que no existe no ensucia nada', () => {
    const previo = { routine: ayer };
    expect(dismissUpdate({ feed: { dismissed: previo } }, 'inventada', hoy)).toEqual(previo);
  });
});

/*
  ══ EL RECORDATORIO DEL CHECK-IN ═══════════════════════════════════════════

  La única cosa del producto que le habla al cliente sin que su entrenador pulse
  nada ese día. Por eso las pruebas empiezan por las tres formas de que NO
  aparezca: apagado, sin nada pendiente, y antes de tiempo.
*/
describe('recordatorioDeSemana', () => {
  /* `de` lo pone siempre `pendingTasks`, y aquí va escrito porque el filtro
     cuenta lo que ES de la semana: una tarea sin procedencia no la reclama el
     recordatorio del check-in, que es el lado seguro. */
  const tarea = { id: 'weights', de: 'semana', label: 'Te falta 1 pesaje esta semana' };
  /* 2026-09-07 es lunes. */
  const lunes = '2026-09-07';

  it('apagado de fábrica: sin `remindAfter` no se le recuerda nada', () => {
    expect(
      recordatorioDeSemana({ protocol: {}, tasks: [tarea], today: '2026-09-11' })
    ).toBeNull();
  });

  it('sin nada pendiente no hay nada que recordar', () => {
    const protocol = { schedule: { day: 1, every: 1, remindAfter: 1 } };
    expect(recordatorioDeSemana({ protocol, tasks: [], today: '2026-09-11' })).toBeNull();
  });

  it('lo MANDADO a mano no dispara el recordatorio del check-in', () => {
    /*
      Desde que `pendingTasks` devuelve también lo que se le ha mandado a mano,
      `tasks.length` dejó de significar «le falta el check-in». Sin filtrar por
      `de`, a alguien con su semana entregada y un cuestionario de hábitos sin
      contestar le habría llegado «tu entrenador espera tu check-in».

      El filtro es por lo que SÍ es de la semana y no por lo que no lo es: con
      cuatro clases de cosa mandada, una lista negra habría que ampliarla cada
      vez que aparezca una quinta, y el día que a alguien se le olvide el aviso
      falso vuelve.
    */
    const protocol = { schedule: { day: 1, every: 1, remindAfter: 1 } };
    const suelto = { id: 'form-1', de: 'mandado', label: 'Tu entrenador te pide: Sueño' };
    expect(recordatorioDeSemana({ protocol, tasks: [suelto], today: '2026-09-11' })).toBeNull();
  });

  it('no llega antes de tiempo', () => {
    const protocol = { schedule: { day: 1, every: 1, remindAfter: 2 } };
    /* Se le pide el lunes y se recuerda a los dos días: el martes todavía no. */
    expect(recordatorioDeSemana({ protocol, tasks: [tarea], today: '2026-09-08' })).toBeNull();
  });

  it('llega el día que toca, y sigue mientras falte', () => {
    const protocol = { schedule: { day: 1, every: 1, remindAfter: 2 } };
    expect(recordatorioDeSemana({ protocol, tasks: [tarea], today: '2026-09-09' })).toBeTruthy();
    expect(recordatorioDeSemana({ protocol, tasks: [tarea], today: '2026-09-11' })).toBeTruthy();
  });

  it('cuenta desde el día que se le pide, no desde el lunes', () => {
    /* Se le pide el viernes (día 5) y se recuerda al día siguiente. */
    const protocol = { schedule: { day: 5, every: 1, remindAfter: 1 } };
    expect(recordatorioDeSemana({ protocol, tasks: [tarea], today: '2026-09-11' })).toBeNull();
    expect(recordatorioDeSemana({ protocol, tasks: [tarea], today: '2026-09-12' })).toBeTruthy();
  });

  it('no reprocha: dice qué falta y a dónde ir', () => {
    const protocol = { schedule: { day: 1, every: 1, remindAfter: 1 } };
    const r = recordatorioDeSemana({ protocol, tasks: [tarea], today: '2026-09-09' });
    expect(r.label).toBe('Tu entrenador espera tu check-in');
    /* Lo que dice es CUÁNDO se espera, que es lo que el cliente no sabe. No
       repite la tarea que ya está debajo. */
    expect(r.hint).toBe('Se lo entregas los lunes.');
    /* A «Tu revisión», que es donde está el verbo de entregar. Fue «Tú» durante
       las horas en las que la revisión no tuvo destino propio; con `D-10` lo
       tiene otra vez. Las TAREAS de debajo —«te falta 1 pesaje»— siguen yendo a
       la báscula (`/mi/evolucion/medidas`), que es donde se anota: son dos
       destinos porque son dos cosas distintas. */
    expect(r.href).toBe('/mi/evolucion');
    /* Ni «llevas», ni «te has retrasado», ni cuántos días. */
    expect(r.label + r.hint).not.toMatch(/retras|tarde|deber/i);
  });

  it('dice el día que su entrenador puso, no el lunes por defecto', () => {
    const protocol = { schedule: { day: 6, every: 1, remindAfter: 1 } };
    const r = recordatorioDeSemana({ protocol, tasks: [tarea], today: '2026-09-13' });
    expect(r.hint).toBe('Se lo entregas los sábados.');
  });

  it('el lunes de la semana sale del día de hoy, no de una constante', () => {
    const protocol = { schedule: { day: 1, every: 1, remindAfter: 1 } };
    /* Domingo 13: pertenece a la semana que empezó el lunes 7. */
    expect(recordatorioDeSemana({ protocol, tasks: [tarea], today: '2026-09-13' })).toBeTruthy();
    /* Y el lunes siguiente empieza semana: todavía no toca. */
    expect(recordatorioDeSemana({ protocol, tasks: [tarea], today: '2026-09-14' })).toBeNull();
    expect(lunes).toBe('2026-09-07');
  });
});
