import { describe, expect, it } from 'vitest';

import { clientUpdates, pendingTasks, stampUpdate, unseenUpdates, dismissUpdate } from './updates';
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
    const tareas = pendingTasks({ history: [log('2026-08-13')], today: hoy });
    expect(tareas.map((t) => t.id)).toEqual(['weights']);
    expect(tareas[0].label).toContain('2 pesajes');
  });

  it('con la semana hecha no se pide nada', () => {
    const history = ['2026-08-11', '2026-08-13', '2026-08-15'].map((d) => log(d));
    expect(pendingTasks({ history, today: hoy })).toEqual([]);
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
