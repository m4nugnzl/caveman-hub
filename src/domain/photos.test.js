import { describe, expect, it } from 'vitest';

import {
  ANGLE_IDS,
  CELDAS_DE_LA_REJILLA,
  celdaDeLaFoto,
  etiquetaDeLaFoto,
  inicialDeLaFoto,
  ladoDeLaFoto,
  lateralesAntiguas,
  mediaDeLaSemana,
  rejillaDeFotos,
  semanasParaComparar,
  angleLabel,
  angulosDelPeriodo,
  angulosParaFiltrar,
  availableAngles,
  photoCoverage,
  photoFileName,
  sortPhotos,
  suggestPair,
  thumbnailUrl,
  weekAngleMatrix,
  weekComparison,
  weekFromStart,
  weekStartOfProgramWeek,
} from './photos';
import { weekStart } from '@/lib/dates';
import { mapPhotoFromDb, mapPhotoToDb } from '@/lib/mappers';

/**
 * Los dos ejes de semana, que hasta ahora no encajaban.
 *
 * Las fotos van por semana de programa y los check-ins por semana natural.
 * `auditoria.md` §1.2 los llamaba dos calendarios incompatibles, y lo eran
 * porque `weekFromStart` contaba desde la fecha cruda de alta: quien empezaba en
 * miércoles tenía semanas de miércoles a martes.
 *
 * Lo que se fija aquí es la propiedad que lo arregla: **la semana de programa es
 * una semana natural**, así que las dos son la misma partición del tiempo con
 * distinta etiqueta y la conversión es exacta en los dos sentidos.
 */
describe('los dos ejes de semana', () => {
  /* El caso que no encajaba. Miércoles 7 de enero de 2026; su lunes es el 5. */
  const MIERCOLES = '2026-01-07';

  it('la semana 1 de quien empieza en miércoles es su semana natural entera', () => {
    // Del lunes anterior al domingo siguiente, todo es semana 1.
    for (const dia of ['2026-01-05', '2026-01-07', '2026-01-11']) {
      expect(weekFromStart(MIERCOLES, dia)).toBe(1);
    }
    // Y el lunes siguiente ya es la 2, no el miércoles siguiente.
    expect(weekFromStart(MIERCOLES, '2026-01-12')).toBe(2);
    expect(weekFromStart(MIERCOLES, '2026-01-14')).toBe(2);
  });

  it('una semana de programa nunca se parte entre dos semanas naturales', () => {
    /*
      La propiedad que hace conmensurables los dos ejes: todos los días con el
      mismo número de semana de programa comparten el mismo lunes. Antes esto era
      falso para cualquier alta que no cayera en lunes.
    */
    const dias = [];
    for (let i = 0; i < 42; i += 1) {
      dias.push(new Date(Date.parse('2026-01-05T00:00:00Z') + i * 86400000).toISOString().slice(0, 10));
    }

    const lunesPorSemana = new Map();
    for (const dia of dias) {
      const semana = weekFromStart(MIERCOLES, dia);
      const lunes = weekStart(dia);
      if (!lunesPorSemana.has(semana)) lunesPorSemana.set(semana, new Set());
      lunesPorSemana.get(semana).add(lunes);
    }

    for (const [, lunes] of lunesPorSemana) expect(lunes.size).toBe(1);
  });

  it('la conversión es exacta en los dos sentidos', () => {
    for (const alta of [MIERCOLES, '2026-01-05', '2026-03-29']) {
      for (const semana of [1, 2, 7, 30]) {
        const lunes = weekStartOfProgramWeek(alta, semana);
        expect(weekFromStart(alta, lunes)).toBe(semana);
      }
    }
  });

  it('un check-in cae siempre en la semana de programa de su lunes', () => {
    /* Es la pregunta que no se podía contestar: dado el `weekStart` de un
       check-in, ¿de qué semana son sus fotos? */
    const checkIn = '2026-02-16'; // un lunes
    const semana = weekFromStart(MIERCOLES, checkIn);
    expect(weekStartOfProgramWeek(MIERCOLES, semana)).toBe(checkIn);
  });

  it('sin fecha no se inventa una semana', () => {
    expect(weekFromStart(null, '2026-01-07')).toBeNull();
    expect(weekFromStart(MIERCOLES, 'no es una fecha')).toBeNull();
    expect(weekStartOfProgramWeek(null, 3)).toBeNull();
  });

  it('nunca hay semana cero ni negativa', () => {
    // Una foto anterior al alta —pasa al mover la fecha de inicio hacia delante—.
    expect(weekFromStart(MIERCOLES, '2025-11-03')).toBe(1);
  });
});

describe('thumbnailUrl', () => {
  it('cambia la ruta del objeto por la de transformación y añade el ancho', () => {
    const signed = 'https://x.supabase.co/storage/v1/object/sign/client-media/c1/photos/week-3/a.jpg?token=abc';
    const thumb = thumbnailUrl(signed, 180);

    expect(thumb).toContain('/render/image/sign/');
    expect(thumb).not.toContain('/object/sign/');
    expect(thumb).toContain('token=abc');
    expect(thumb).toContain('width=180');
  });

  it('devuelve la original si la URL no tiene la forma esperada', () => {
    /*
      La optimización tiene que fallar hacia el lado bueno: si la URL no es una
      firmada de Supabase —una externa antigua, o un formato que cambie— se
      devuelve tal cual. El peor caso es descargar el original, nunca una foto
      rota.
    */
    expect(thumbnailUrl('https://ejemplo.com/foto.jpg')).toBe('https://ejemplo.com/foto.jpg');
    expect(thumbnailUrl(null)).toBe(null);
    expect(thumbnailUrl(undefined)).toBe(undefined);
  });
});

const START = '2026-01-05'; // un lunes

/** Una foto de la semana `week` con el ángulo indicado. */
const photo = (week, angle) => ({
  angle,
  // `photoWeek` cae en la semana del programa a partir de la fecha.
  date: new Date(Date.parse(`${START}T00:00:00Z`) + (week - 1) * 7 * 86400000)
    .toISOString()
    .slice(0, 10),
});

describe('photoCoverage', () => {
  it('devuelve TODAS las semanas del rango, también las que no tienen fotos', () => {
    /*
      Es la razón de existir de la pieza. Una semana sin fotos no aparecía en
      ninguna parte —la biblioteca agrupa lo que hay— así que el hueco solo se
      descubría al ir a comparar y no encontrar con qué.
    */
    const coverage = photoCoverage({
      photos: [photo(1, 'front'), photo(4, 'front')],
      startDate: START,
      angles: ['front'],
    });

    expect(coverage.map((w) => w.week)).toEqual([1, 2, 3, 4]);
    expect(coverage.filter((w) => w.empty).map((w) => w.week)).toEqual([2, 3]);
  });

  it('marca a medias la semana a la que le falta un ángulo que el cliente sí usa', () => {
    const coverage = photoCoverage({
      photos: [photo(1, 'front'), photo(1, 'back'), photo(2, 'front')],
      startDate: START,
      angles: ['front', 'back'],
    });

    expect(coverage[0].complete).toBe(true);
    expect(coverage[1].complete).toBe(false);
    expect(coverage[1].empty).toBe(false);
  });

  it('no marca como incompleta una semana por un ángulo que ese cliente no se hace', () => {
    /*
      Comprobar siempre los tres ángulos del catálogo llenaría la pantalla de
      avisos para quien solo se fotografía de frente, y un aviso que siempre está
      encendido deja de mirarse.
    */
    const coverage = photoCoverage({
      photos: [photo(1, 'front'), photo(2, 'front')],
      startDate: START,
      angles: ['front'],
    });

    expect(coverage.every((w) => w.complete)).toBe(true);
  });

  it('sin fotos no hay historial que enseñar', () => {
    expect(photoCoverage({ photos: [], startDate: START })).toEqual([]);
  });
});

/**
 * La comparativa de un check-in.
 *
 * Lo que se fija aquí es que el «después» NO se elige —es la entrega que se está
 * revisando— y que el «antes» solo puede caer en una semana que tenga ESE mismo
 * ángulo. Ofrecer una semana sin la foto del ángulo elegido es ofrecer un hueco.
 */
describe('weekComparison', () => {
  const foto = (week, angle, date) => ({ id: `${week}-${angle}`, week, angle, date });

  const fotos = [
    foto(1, 'frontal', '2026-01-05'),
    foto(1, 'lateral', '2026-01-05'),
    foto(2, 'frontal', '2026-01-12'),
    foto(4, 'frontal', '2026-01-26'),
    foto(4, 'espalda', '2026-01-26'),
  ];

  it('compara contra la semana anterior más cercana con ese ángulo', () => {
    const c = weekComparison({ photos: fotos, weekNumber: 4 });
    expect(c.angle).toBe('frontal');
    expect(c.after.id).toBe('4-frontal');
    expect(c.before.id).toBe('2-frontal');
    expect(c.against).toBe(2);
    expect(c.span).toBe(2);
    // Las dos anteriores con frontal, de la más reciente a la más antigua.
    expect(c.options).toEqual([2, 1]);
  });

  it('deja elegir contra cuál, y solo entre las que existen', () => {
    expect(weekComparison({ photos: fotos, weekNumber: 4, againstWeek: 1 }).before.id).toBe(
      '1-frontal'
    );
    // La 3 no existe: se cae a la anterior más cercana en vez de quedarse sin par.
    expect(weekComparison({ photos: fotos, weekNumber: 4, againstWeek: 3 }).against).toBe(2);
  });

  it('un ángulo sin par anterior no ofrece ninguna semana, no ofrece una vacía', () => {
    const c = weekComparison({ photos: fotos, weekNumber: 4, angle: 'espalda' });
    expect(c.angle).toBe('espalda');
    expect(c.before).toBe(null);
    expect(c.options).toEqual([]);
  });

  it('el ángulo pedido cae al disponible en vez de vaciar la comparativa', () => {
    // Esa semana no tiene lateral: se enseña el frontal, que sí está.
    expect(weekComparison({ photos: fotos, weekNumber: 4, angle: 'lateral' }).angle).toBe('frontal');
  });

  it('sin fotos esa semana no hay comparativa que enseñar', () => {
    expect(weekComparison({ photos: fotos, weekNumber: 3 })).toBe(null);
    expect(weekComparison({ photos: [], weekNumber: 1 })).toBe(null);
    expect(weekComparison({ photos: fotos, weekNumber: null })).toBe(null);
  });
});

/**
 * LOS ÁNGULOS DEL PERIODO — el otro lado del aviso del 20 de septiembre.
 *
 * La portada contaba las fotos del cliente SIN semana —todas, desde su alta—,
 * así que el renglón salía hecho desde la primera y no se apagaba nunca. La
 * revisión sí filtraba, pero contra la semana de HOY en vez de la del periodo:
 * son la misma casi siempre, y no lo son justo cuando importa.
 */
describe('angulosDelPeriodo', () => {
  const foto = (week, angle) => ({ week, angle, date: '2026-01-01' });
  const ALTA = '2026-01-05'; // lunes

  it('deja fuera las de semanas anteriores', () => {
    const fotos = [foto(1, 'frontal'), foto(1, 'lateral'), foto(1, 'espalda')];
    const set = angulosDelPeriodo(fotos, { startDate: ALTA, desde: weekStartOfProgramWeek(ALTA, 4) });
    expect(set.size).toBe(0);
  });

  it('cuenta las del periodo que se entrega', () => {
    const fotos = [foto(3, 'frontal'), foto(4, 'frontal'), foto(4, 'lateral')];
    const set = angulosDelPeriodo(fotos, { startDate: ALTA, desde: weekStartOfProgramWeek(ALTA, 4) });
    expect([...set].sort()).toEqual(['frontal', 'lateral']);
  });

  /* Con cadencia quincenal el periodo abarca dos semanas de programa, y solo se
     miraba una: la foto de la primera no contaba para su propia entrega. */
  it('con cadencia quincenal abarca las dos semanas', () => {
    const fotos = [foto(3, 'frontal'), foto(4, 'lateral')];
    const set = angulosDelPeriodo(fotos, {
      startDate: ALTA,
      desde: weekStartOfProgramWeek(ALTA, 3),
      semanas: 2,
    });
    expect([...set].sort()).toEqual(['frontal', 'lateral']);
  });

  /* Las de MÁS ADELANTE tampoco: entregar tarde la semana pasada no se completa
     con las fotos de ésta. */
  it('deja fuera las de semanas posteriores', () => {
    const set = angulosDelPeriodo([foto(5, 'frontal')], {
      startDate: ALTA,
      desde: weekStartOfProgramWeek(ALTA, 4),
    });
    expect(set.size).toBe(0);
  });

  /* Sin alta no hay ordinal que contar, y antes los dos lados salían `null` y
     `null === null` daba por buena cualquier foto. Se cae a las fechas. */
  it('sin fecha de alta compara por fecha y no da por buenas todas', () => {
    const fotos = [
      { week: null, angle: 'frontal', date: '2026-09-16' },
      { week: null, angle: 'lateral', date: '2026-08-01' },
    ];
    const set = angulosDelPeriodo(fotos, { startDate: null, desde: '2026-09-14' });
    expect([...set]).toEqual(['frontal']);
  });

  it('sin periodo no acota nada', () => {
    expect(angulosDelPeriodo([foto(1, 'frontal')], { startDate: ALTA }).size).toBe(1);
  });
});

/**
 * LOS DOS PERFILES, Y LO QUE PASA CON LAS LATERALES DE ANTES.
 *
 * El 20 de septiembre de 2026 la «Lateral · mismo lado siempre» se partió en
 * izquierdo y derecho: una lateral izquierda contra una derecha no compara
 * nada, y la instrucción de acordarse del lado no la cumple nadie tres semanas
 * seguidas. Lo que no se puede es tirar lo ya subido, porque no hay forma de
 * saber de qué lado era cada foto.
 *
 * Estas pruebas fijan las dos mitades de esa decisión: lo retirado no se pide,
 * y sigue teniendo nombre, orden y sitio.
 */
describe('los ángulos retirados', () => {
  const foto = (angle, date) => ({ angle, date, week: 1 });

  it('la lateral antigua no se pide', () => {
    expect(ANGLE_IDS).not.toContain('lateral');
    expect(ANGLE_IDS).toEqual(['frontal', 'izquierdo', 'derecho', 'espalda']);
  });

  /* Sin esto una foto de hace un mes saldría rotulada «lateral» en minúscula en
     el archivo, la descarga y el montaje: el `|| id` del final de `angleLabel`
     es un último recurso, no un sitio donde se quede nada. */
  it('pero sigue teniendo nombre', () => {
    expect(angleLabel('lateral')).toBe('Lateral (antiguo)');
  });

  /* Entre los dos perfiles nuevos: una carpeta con las dos generaciones
     mezcladas se lee igual, de frente hacia la espalda. */
  it('y su sitio en el orden', () => {
    const revueltas = [
      foto('espalda', '2026-01-01'),
      foto('derecho', '2026-01-01'),
      foto('lateral', '2026-01-01'),
      foto('frontal', '2026-01-01'),
    ];
    expect(sortPhotos(revueltas).map((f) => f.angle)).toEqual([
      'frontal',
      'lateral',
      'derecho',
      'espalda',
    ]);
    expect(availableAngles(revueltas)).toEqual(['frontal', 'lateral', 'derecho', 'espalda']);
  });

  /* El filtro solo la ofrece a quien tiene alguna: una pestaña de un ángulo que
     ya no se pide, delante de quien empezó la semana pasada, no lleva a ningún
     sitio. */
  it('el filtro la ofrece solo a quien la tiene', () => {
    expect(angulosParaFiltrar([foto('frontal', '2026-01-01')]).map((a) => a.id)).toEqual(ANGLE_IDS);
    expect(angulosParaFiltrar([foto('lateral', '2026-01-01')]).map((a) => a.id)).toEqual([
      ...ANGLE_IDS,
      'lateral',
    ]);
  });

  /* Y no tapa a ninguno de los dos perfiles cuando se cuenta lo que falta de
     esta semana: no se sabe de qué lado era. */
  it('no cuenta como ninguno de los dos perfiles', () => {
    const set = angulosDelPeriodo([{ week: 1, angle: 'lateral', date: '2026-01-05' }], {
      startDate: '2026-01-05',
      desde: '2026-01-05',
    });
    expect(set.has('izquierdo')).toBe(false);
    expect(set.has('derecho')).toBe(false);
  });
});

/*
  ══ «Cómo se ve»: la rejilla de dos semanas (22 sep 2026) ══════════════════
  Los cuatro ángulos a la vez, un hueco honesto donde falta uno, y la lateral
  antigua solo en su celda cuando alguien ha dicho de qué lado es.
*/
describe('la rejilla de dos semanas', () => {
  const f = (angle, extra = {}) => ({ id: `${angle}-${extra.date || 'x'}`, angle, date: '2026-09-01', ...extra });

  it('siempre las cuatro celdas, con un hueco donde una semana no tiene ese ángulo', () => {
    const celdas = rejillaDeFotos({
      antes: [f('frontal'), f('izquierdo'), f('derecho'), f('espalda')],
      ahora: [f('frontal'), f('izquierdo'), f('espalda')],
    });
    expect(celdas.map((c) => c.id)).toEqual(CELDAS_DE_LA_REJILLA);
    const derecho = celdas.find((c) => c.id === 'derecho');
    expect(derecho.antes).not.toBeNull();
    expect(derecho.ahora).toBeNull();
    expect(derecho.ahoraSinLado).toBe(false);
  });

  it('dos semanas de la lateral única se comparan entre ellas, en tres celdas', () => {
    const celdas = rejillaDeFotos({
      antes: [f('frontal'), f('lateral'), f('espalda')],
      ahora: [f('frontal'), f('lateral'), f('espalda')],
    });
    expect(celdas.map((c) => c.id)).toEqual(['frontal', 'lateral', 'espalda']);
  });

  it('la lateral antigua sin lado no se empareja con un lado: lo dice en las dos celdas de perfil', () => {
    const celdas = rejillaDeFotos({
      antes: [f('frontal'), f('lateral'), f('espalda')],
      ahora: [f('frontal'), f('izquierdo'), f('derecho'), f('espalda')],
    });
    const izq = celdas.find((c) => c.id === 'izquierdo');
    const der = celdas.find((c) => c.id === 'derecho');
    expect(izq.antes).toBeNull();
    expect(izq.antesSinLado).toBe(true);
    expect(der.antesSinLado).toBe(true);
  });

  it('declarado el lado, la lateral antigua va a su celda y se empareja', () => {
    const vieja = f('lateral', { lado: 'izquierdo' });
    const celdas = rejillaDeFotos({ antes: [vieja], ahora: [f('izquierdo'), f('derecho')] });
    const izq = celdas.find((c) => c.id === 'izquierdo');
    expect(izq.antes).toBe(vieja);
    expect(celdas.find((c) => c.id === 'derecho').antesSinLado).toBe(false);
  });
});

describe('el lado de las laterales antiguas', () => {
  it('se sabe cuántas faltan y de qué lado son las que lo tienen', () => {
    const r = lateralesAntiguas([
      { angle: 'lateral', origen: 'lateral' },
      { angle: 'lateral', origen: 'lateral', lado: 'derecho' },
      { angle: 'frontal', origen: 'frontal' },
    ]);
    expect(r).toMatchObject({ total: 2, sinLado: 1, lado: 'derecho', mezcladas: false });
    expect(ladoDeLaFoto({ angle: 'lateral', lado: 'derecho' })).toBe('derecho');
    expect(ladoDeLaFoto({ angle: 'lateral' })).toBeNull();
    expect(celdaDeLaFoto({ angle: 'lateral' })).toBe('lateral');
  });

  /* Si una se marcó a mano del otro lado, la declaración por cliente no se
     aplica a ciegas: `mezcladas` lo dice, y esa foto no entra en la cuenta. */
  it('detecta laterales antiguas de los dos lados', () => {
    const r = lateralesAntiguas([
      { angle: 'lateral', origen: 'lateral', lado: 'izquierdo' },
      { angle: 'derecho', origen: 'lateral' },
    ]);
    expect(r.mezcladas).toBe(true);
    expect(r.lado).toBeNull();
    expect(r.fotos).toHaveLength(1);
  });

  it('el lado viaja en el tag, sin tocar el ángulo ni la ruta', () => {
    const fila = {
      id: 'p1',
      client_id: 'c1',
      photo_url: 'c1/photos/week-3/1700000000-lateral.jpg',
      tag: JSON.stringify({ angle: 'lateral', lado: 'derecho' }),
      created_at: '2026-08-01T10:00:00Z',
    };
    const foto = mapPhotoFromDb(fila);
    expect(foto).toMatchObject({ angle: 'lateral', origen: 'lateral', lado: 'derecho', week: 3 });
    expect(JSON.parse(mapPhotoToDb({ ...foto, lado: null }).tag)).toEqual({ angle: 'lateral' });
  });
});

/* Declarado el lado, la lateral antigua deja de ser «Lateral (antiguo)» en todas
   partes: el archivo, el estudio y la descarga leen la misma celda que la
   rejilla de la revisión. */
describe('la lateral declarada, fuera de la rejilla', () => {
  const foto = (week, angle, extra = {}) => ({
    id: `${week}-${angle}-${extra.lado ?? ''}`,
    week,
    angle,
    date: `2026-01-${String(week).padStart(2, '0')}`,
    ...extra,
  });
  const vieja = foto(1, 'lateral', { lado: 'izquierdo', origen: 'lateral' });
  const sinLado = foto(2, 'lateral', { origen: 'lateral' });

  it('se nombra con su lado; la que no lo tiene sigue siendo la antigua', () => {
    expect(etiquetaDeLaFoto(vieja)).toBe('Lateral izquierdo');
    expect(inicialDeLaFoto(vieja)).toBe('I');
    expect(etiquetaDeLaFoto(sinLado)).toBe('Lateral (antiguo)');
    expect(etiquetaDeLaFoto(foto(1, 'frontal'))).toBe('Frontal');
  });

  it('el filtro solo ofrece «Lateral (antiguo)» si queda alguna sin declarar', () => {
    expect(angulosParaFiltrar([vieja]).map((a) => a.id)).not.toContain('lateral');
    expect(angulosParaFiltrar([vieja, sinLado]).map((a) => a.id)).toContain('lateral');
  });

  it('el estudio la cuenta y la coloca con las izquierdas', () => {
    const fotos = [vieja, foto(5, 'izquierdo'), foto(5, 'frontal')];
    expect(availableAngles(fotos)).toEqual(['frontal', 'izquierdo']);
    const { cells } = weekAngleMatrix({ photos: fotos, weeks: [1, 5], angles: ['izquierdo'] });
    expect(cells.map((c) => c.photoId)).toEqual([vieja.id, '5-izquierdo-']);
    expect(suggestPair(fotos.filter((p) => p !== fotos[2]))).toEqual({ before: vieja, after: fotos[1] });
  });

  it('la comparativa de la semana la empareja con la izquierda de ahora', () => {
    const r = weekComparison({ photos: [vieja, foto(5, 'izquierdo')], weekNumber: 5, angle: 'izquierdo' });
    expect(r.before).toBe(vieja);
    expect(r.angles).toEqual(['izquierdo']);
  });

  it('y se descarga con su lado en el nombre', () => {
    expect(photoFileName({ ...vieja, path: 'c/photos/week-1/1-lateral.jpg' }, { clientName: 'Ana' })).toBe(
      'ana-s01-izquierdo-2026-01-01.jpg'
    );
  });
});

describe('qué dos semanas se comparan', () => {
  it('por defecto, el inicio de la fase contra la semana que se revisa', () => {
    expect(semanasParaComparar({ semanas: [1, 5, 9, 10, 12], semana: 12, inicioFase: 9 })).toEqual({
      ahora: 12,
      antes: 9,
      inicioDeFase: 9,
      inicio: 1,
    });
  });

  it('sin fases, el inicio; y si la fase empieza ahora, la última anterior', () => {
    expect(semanasParaComparar({ semanas: [1, 5, 6], semana: 6 }).antes).toBe(1);
    expect(semanasParaComparar({ semanas: [1, 5, 6], semana: 6, inicioFase: 6 }).antes).toBe(5);
  });

  it('una semana sin fotos compara la última que sí tiene', () => {
    expect(semanasParaComparar({ semanas: [1, 5], semana: 7 }).ahora).toBe(5);
    expect(semanasParaComparar({ semanas: [5], semana: 5 }).antes).toBeNull();
  });
});

describe('la media de la semana', () => {
  it('es la media de los pesajes de esa semana de programa', () => {
    const history = [
      { date: '2026-08-24', weight: 73 },
      { date: '2026-08-27', weight: 72 },
      { date: '2026-08-31', weight: 71 },
    ];
    /* Alta el lunes 17 de agosto: la semana 2 empieza el 24. */
    expect(mediaDeLaSemana(history, '2026-08-17', 2)).toBe(72.5);
    expect(mediaDeLaSemana(history, '2026-08-17', 5)).toBeNull();
  });
});
