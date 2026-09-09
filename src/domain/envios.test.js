import { describe, expect, it } from 'vitest';

import {
  AUDIENCIAS,
  MAX_DESTINATARIOS,
  MAX_NOTA,
  TIPOS,
  agrupar,
  audienciaLegible,
  avanceDe,
  contestadasPorCliente,
  destinatarios,
  fechaPara,
  filasDeEnvio,
  hecha,
  notaDe,
  pendientesDe,
  pendientesDeCliente,
  pendientesPorCliente,
  pideEnlace,
  queById,
  sePuedeProgramar,
  sinLeer,
  vigente,
} from './envios';
import { defaultElemento } from './formulario';

const cliente = (id, extra = {}) => ({ id, name: id, status: 'active', tags: [], ...extra });

const CARTERA = [
  cliente('marta', { tags: ['presencial'], preferences: { protocolId: 'proto_general' } }),
  cliente('javi', { tags: ['presencial', 'online'], preferences: { protocolId: 'proto_pl' } }),
  cliente('ana', { tags: [], preferences: { protocolId: 'proto_pl' } }),
  cliente('luis', { status: 'paused', pause_until: '2099-01-01', tags: ['presencial'] }),
  cliente('carmen', { status: 'archived', tags: ['presencial'] }),
];

describe('envios · a quién le toca', () => {
  it('los archivados y los pausados NO entran nunca por audiencia', () => {
    const todos = destinatarios({ tipo: 'todos' }, CARTERA).map((c) => c.id);
    expect(todos).toEqual(['marta', 'javi', 'ana']);

    const conEtiqueta = destinatarios({ tipo: 'etiqueta', valor: 'presencial' }, CARTERA);
    expect(conEtiqueta.map((c) => c.id)).toEqual(['marta', 'javi']);
  });

  it('marcar a mano SÍ los alcanza: ahí la elección es explícita', () => {
    const marcados = destinatarios({ tipo: 'marcados', marcados: ['luis', 'carmen'] }, CARTERA);
    expect(marcados.map((c) => c.id)).toEqual(['luis', 'carmen']);
  });

  it('una etiqueta sin valor no manda a nadie, en vez de mandar a todos', () => {
    expect(destinatarios({ tipo: 'etiqueta', valor: null }, CARTERA)).toEqual([]);
    expect(destinatarios({ tipo: 'protocolo', valor: null }, CARTERA)).toEqual([]);
  });

  it('por protocolo salen los que lo llevan puesto', () => {
    const pl = destinatarios({ tipo: 'protocolo', valor: 'proto_pl' }, CARTERA);
    expect(pl.map((c) => c.id)).toEqual(['javi', 'ana']);
  });

  it('respeta el tope de destinatarios', () => {
    const muchos = Array.from({ length: 200 }, (_, i) => cliente(`c${i}`));
    expect(destinatarios({ tipo: 'todos' }, muchos)).toHaveLength(MAX_DESTINATARIOS);
  });

  it('todas las audiencias tienen etiqueta y las que piden valor lo declaran', () => {
    for (const a of AUDIENCIAS) expect(a.label).toBeTruthy();
    expect(AUDIENCIAS.find((a) => a.id === 'etiqueta').pide).toBe('etiqueta');
  });
});

describe('envios · el cuándo', () => {
  const hoy = new Date('2026-09-08T10:00:00Z');

  it('ahora es hoy', () => {
    expect(fechaPara({ tipo: 'ahora' }, CARTERA[0], hoy)).toBe('2026-09-08');
  });

  it('el día elegido se respeta tal cual', () => {
    expect(fechaPara({ tipo: 'dia', valor: '2026-10-01' }, CARTERA[0], hoy)).toBe('2026-10-01');
  });

  it('a las N semanas cuenta desde el alta de CADA UNO, no desde hoy', () => {
    const conAlta = cliente('x', { start_date: '2026-08-01' });
    expect(fechaPara({ tipo: 'semanas', valor: 6 }, conAlta, hoy)).toBe('2026-09-12');
  });

  it('sin fecha de alta no se inventa una: se queda sin fecha y le toca ya', () => {
    expect(fechaPara({ tipo: 'semanas', valor: 6 }, cliente('x'), hoy)).toBeNull();
  });

  it('lo programado no está vigente hasta su día', () => {
    expect(vigente({ due: '2026-10-01' }, '2026-09-08')).toBe(false);
    expect(vigente({ due: '2026-09-08' }, '2026-09-08')).toBe(true);
    expect(vigente({ due: null }, '2026-09-08')).toBe(true);
  });
});

describe('envios · las filas que se escriben', () => {
  const formulario = {
    id: 'form_sueno',
    name: 'Hábitos de sueño',
    elementos: [defaultElemento('numero'), defaultElemento('sino')],
  };

  it('una fila por persona, todas del mismo envío', () => {
    const filas = filasDeEnvio({
      formulario,
      audiencia: { tipo: 'etiqueta', valor: 'presencial' },
      cuando: { tipo: 'ahora' },
      clientes: destinatarios({ tipo: 'etiqueta', valor: 'presencial' }, CARTERA),
      coachId: 'coach',
    });
    expect(filas).toHaveLength(2);
    expect(new Set(filas.map((f) => f.envio_id)).size).toBe(1);
  });

  it('EL ESQUEMA VIAJA CONGELADO: cambiar el formulario después no toca lo mandado', () => {
    const filas = filasDeEnvio({
      formulario,
      audiencia: { tipo: 'todos', valor: null },
      cuando: { tipo: 'ahora' },
      clientes: [CARTERA[0]],
      coachId: 'coach',
    });
    formulario.elementos.push(defaultElemento('texto'));
    expect(filas[0].schema.elementos).toHaveLength(2);
  });

  /*
    El recado dejó de vivir en `schema.nota` y pasó a ser la columna `body`
    (migración 0105): dentro del esquema estaba porque el esquema era lo único
    que había, y en un vídeo no hay esquema donde meterlo. Estas tres pruebas
    fijaban la invariante vieja y se reescriben, no se borran — lo que se lee
    desde fuera sigue siendo lo mismo, y de eso se encarga `notaDe`.
  */
  it('el mensaje del entrenador viaja en cada fila, saneado', () => {
    const filas = filasDeEnvio({
      formulario,
      audiencia: { tipo: 'todos', valor: null },
      cuando: { tipo: 'ahora' },
      clientes: [CARTERA[0], CARTERA[1]],
      coachId: 'coach',
      nota: '  Contéstalo antes del jueves.  ',
    });
    expect(filas).toHaveLength(2);
    for (const f of filas) expect(f.body).toBe('Contéstalo antes del jueves.');
  });

  it('SIN mensaje se escribe `null`, no una cadena vacía', () => {
    const sinNota = filasDeEnvio({
      formulario,
      audiencia: { tipo: 'todos', valor: null },
      cuando: { tipo: 'ahora' },
      clientes: [CARTERA[0]],
      coachId: 'coach',
    });
    const enBlanco = filasDeEnvio({
      formulario,
      audiencia: { tipo: 'todos', valor: null },
      cuando: { tipo: 'ahora' },
      clientes: [CARTERA[0]],
      coachId: 'coach',
      nota: '   ',
    });
    expect(sinNota[0].body).toBe(null);
    expect(enBlanco[0].body).toBe(null);
    /* Y no queda rastro en el esquema: dos sitios para el mismo dato es
       exactamente lo que la 0105 vino a quitar. */
    expect('nota' in sinNota[0].schema).toBe(false);
  });

  it('el mensaje tiene tope: se copia en cada fila, no es un canal de chat', () => {
    const filas = filasDeEnvio({
      formulario,
      audiencia: { tipo: 'todos', valor: null },
      cuando: { tipo: 'ahora' },
      clientes: [CARTERA[0]],
      coachId: 'coach',
      nota: 'a'.repeat(MAX_NOTA + 50),
    });
    expect(filas[0].body).toHaveLength(MAX_NOTA);
  });

  it('guarda la audiencia con la que se mandó, para poder decirlo meses después', () => {
    const filas = filasDeEnvio({
      formulario,
      audiencia: { tipo: 'etiqueta', valor: 'presencial' },
      cuando: { tipo: 'ahora' },
      clientes: [CARTERA[0]],
      coachId: 'coach',
    });
    expect(filas[0].schema.audiencia).toEqual({ tipo: 'etiqueta', valor: 'presencial' });
  });

  it('sin destinatarios no escribe nada', () => {
    expect(
      filasDeEnvio({
        formulario,
        audiencia: { tipo: 'todos' },
        cuando: { tipo: 'ahora' },
        clientes: [],
        coachId: 'coach',
      })
    ).toEqual([]);
  });
});

describe('envios · leer lo que ha vuelto', () => {
  const elementos = [defaultElemento('numero')];
  const fila = (id, envio, extra = {}) => ({
    id,
    envio_id: envio,
    client_id: id,
    title: 'Hábitos de sueño',
    sent_at: '2026-09-06T10:00:00Z',
    schema: { elementos, audiencia: { tipo: 'etiqueta', valor: 'presencial' } },
    ...extra,
  });

  const filas = [
    fila('marta', 'e1', { submitted_at: '2026-09-06T12:00:00Z', answers: { a: 6.5 } }),
    fila('javi', 'e1', { submitted_at: '2026-09-06T18:00:00Z', answers: { a: 8 } }),
    fila('ana', 'e1'),
    fila('luis', 'e2', { title: 'Marcas', sent_at: '2026-09-07T10:00:00Z' }),
  ];

  it('agrupa por envío y cuenta lo entregado', () => {
    const envios = agrupar(filas);
    expect(envios).toHaveLength(2);
    /* El más reciente arriba: se lee lo último que mandaste. */
    expect(envios[0].id).toBe('e2');
    const sueno = envios.find((e) => e.id === 'e1');
    expect(sueno.mandados).toBe(3);
    expect(sueno.entregados).toBe(2);
  });

  it('el avance se dice con el verbo de su tipo, y se dibuja', () => {
    const sueno = agrupar(filas).find((e) => e.id === 'e1');
    expect(avanceDe(sueno).dice).toBe('2 de 3 contestados');
    expect(avanceDe(sueno).cuenta).toBe('2 de 3');
    expect(avanceDe(sueno).cerrado).toBe(false);
    expect(pendientesDe(sueno).map((f) => f.client_id)).toEqual(['ana']);
  });

  /* Lo mandado antes de la 0105 no trae `tipo`: la columna nació con `form` por
     defecto porque era lo único que cabía. Si esto se leyera como «tipo
     desconocido», la columna «Cómo va» de todo lo viejo cambiaría de idioma. */
  it('una fila sin `tipo` es un formulario', () => {
    const sueno = agrupar(filas).find((e) => e.id === 'e1');
    expect(sueno.tipo).toBe('form');
  });

  it('la audiencia se lee de lo congelado, no se recalcula', () => {
    const sueno = agrupar(filas).find((e) => e.id === 'e1');
    expect(audienciaLegible(sueno.audiencia)).toBe('con la etiqueta presencial');
  });

  it('lo pendiente de un cliente excluye lo entregado Y lo que aún no le toca', () => {
    const suyas = [
      fila('ana', 'e1'),
      fila('ana', 'e3', { due: '2099-01-01' }),
      fila('ana', 'e4', { submitted_at: '2026-09-06T12:00:00Z' }),
    ];
    expect(pendientesDeCliente(suyas, '2026-09-08')).toHaveLength(1);
  });
});

describe('envios · el qué', () => {
  /*
    Esta prueba decía `paso` para el vídeo y la casilla, que era el estado de la
    tanda 1: la tabla ya sabía guardarlos y el disparador todavía escribía pasos
    del alta. Cambiarla es lo que se quería que se notara al mudarlo.
  */
  it('lo suyo va a la tabla de acciones y lo tuyo a tu agenda', () => {
    expect(queById('form').carril).toBe('accion');
    expect(queById('pide').carril).toBe('accion');
    expect(queById('video').carril).toBe('accion');
    expect(queById('documento').carril).toBe('accion');
    expect(queById('tarea').carril).toBe('agenda');
  });

  it('la casilla tuya no es una acción de la tabla: su sitio es tu agenda', () => {
    expect(queById('tarea').tipo).toBe(null);
    expect(TIPOS.some((t) => t.id === 'tarea')).toBe(false);
  });

  /*
    El aviso entra en el mismo diálogo y NO en la misma tabla. Es la distinción
    que sostiene toda la pantalla: un aviso se lee y se descarta, así que
    convertirlo en fila de `client_actions` le habría puesto deberes que no
    existen.
  */
  it('el aviso comparte gesto pero no carril: no es un pendiente', () => {
    expect(queById('aviso').carril).toBe('aviso');
    expect(queById('aviso').tipo).toBe(null);
    expect(TIPOS.some((t) => t.id === 'aviso')).toBe(false);
  });

  it('todo se puede programar menos el aviso, que no tiene dónde guardar la fecha', () => {
    expect(sePuedeProgramar('form')).toBe(true);
    expect(sePuedeProgramar('video')).toBe(true);
    expect(sePuedeProgramar('pide')).toBe(true);
    expect(sePuedeProgramar('tarea')).toBe(true);
    expect(sePuedeProgramar('aviso')).toBe(false);
  });

  it('solo las entregas piden enlace', () => {
    expect(pideEnlace('video')).toBe(true);
    expect(pideEnlace('documento')).toBe(true);
    expect(pideEnlace('form')).toBe(false);
    expect(pideEnlace('pide')).toBe(false);
    expect(pideEnlace('tarea')).toBe(false);
  });
});

describe('envios · las cuatro clases de acción', () => {
  const base = {
    audiencia: { tipo: 'todos', valor: null },
    cuando: { tipo: 'ahora' },
    clientes: [CARTERA[0]],
    coachId: 'coach',
  };

  it('un vídeo se escribe con su enlace y sin esquema de preguntas', () => {
    const [f] = filasDeEnvio({
      ...base,
      tipo: 'video',
      titulo: 'Cómo grabar tus series',
      enlace: '  https://ejemplo.test/serie  ',
    });
    expect(f.tipo).toBe('video');
    expect(f.link).toBe('https://ejemplo.test/serie');
    expect(f.form_id).toBe(null);
    expect('elementos' in f.schema).toBe(false);
    /* La audiencia sí se congela también aquí: «a los 5 con la etiqueta
       presencial» tiene que poder leerse meses después de un vídeo igual que de
       un formulario. */
    expect(f.schema.audiencia).toEqual({ tipo: 'todos', valor: null });
  });

  it('lo que le pides a él no lleva enlace, y lo marca él', () => {
    const [f] = filasDeEnvio({
      ...base,
      tipo: 'pide',
      titulo: 'Mándame el vídeo de tu sentadilla',
      nota: 'De frente y de lado.',
    });
    expect(f.tipo).toBe('pide');
    expect(f.link).toBe(null);
    expect(f.body).toBe('De frente y de lado.');
    expect(f.submitted_at).toBe(undefined);
  });

  /*
    La misma regla que el `CHECK` de la 0105, dicha en el navegador: una fila que
    promete algo que abrir y no trae con qué abrirlo le sale al cliente como un
    renglón sin destino, y no hay forma de saber si es un fallo o un descuido.
  */
  it('una entrega SIN enlace no se escribe', () => {
    expect(filasDeEnvio({ ...base, tipo: 'documento', titulo: 'La guía' })).toEqual([]);
    expect(filasDeEnvio({ ...base, tipo: 'video', titulo: 'El vídeo', enlace: '   ' })).toEqual([]);
  });

  it('sin título no se escribe: nadie sabría qué le han mandado', () => {
    expect(
      filasDeEnvio({ ...base, tipo: 'pide', titulo: '   ', nota: 'algo' })
    ).toEqual([]);
  });

  it('un tipo que la tabla no conoce no se escribe', () => {
    expect(filasDeEnvio({ ...base, tipo: 'tarea', titulo: 'Repasar su vídeo' })).toEqual([]);
  });

  it('el avance habla el idioma de cada tipo', () => {
    const deTipo = (tipo, hechas) =>
      avanceDe({
        tipo,
        mandados: 3,
        entregados: hechas,
        filas: [],
      }).dice;

    expect(deTipo('form', 2)).toBe('2 de 3 contestados');
    expect(deTipo('video', 2)).toBe('2 de 3 lo han abierto');
    expect(deTipo('pide', 1)).toBe('1 de 3 hechos');
  });
});

describe('envios · lo pendiente de cada uno, para la cartera', () => {
  const f = (id, client, extra = {}) => ({
    id,
    client_id: client,
    envio_id: 'e1',
    title: 'Algo',
    ...extra,
  });

  it('cuenta por persona lo que le falta', () => {
    const cuentas = pendientesPorCliente(
      [f('1', 'marta'), f('2', 'marta'), f('3', 'javi')],
      '2026-09-09'
    );
    expect(cuentas).toEqual({ marta: 2, javi: 1 });
  });

  it('no cuenta lo hecho ni lo que todavía no le toca', () => {
    const cuentas = pendientesPorCliente(
      [
        f('1', 'marta', { submitted_at: '2026-09-08T10:00:00Z' }),
        f('2', 'marta', { due: '2099-01-01' }),
        f('3', 'marta'),
      ],
      '2026-09-09'
    );
    /* Uno: lo entregado no se reclama y lo programado no existe todavía para
       nadie. La misma regla que usan su portal y su ficha. */
    expect(cuentas).toEqual({ marta: 1 });
  });

  it('sin nada mandado, ninguna cuenta', () => {
    expect(pendientesPorCliente([], '2026-09-09')).toEqual({});
  });
});

/*
  ══ Lo contestado y sin leer (0108) ═════════════════════════════════════════

  La otra mitad del bucle. Sin la marca de leído, «te han contestado» sería
  cierto para siempre y la cola de la bandeja no se podría vaciar nunca.
*/
describe('envios · lo que te falta por leer', () => {
  const f = (id, client, extra = {}) => ({
    id,
    client_id: client,
    envio_id: 'e1',
    title: 'Algo',
    tipo: 'form',
    ...extra,
  });

  const contestada = { submitted_at: '2026-09-09T10:00:00Z' };

  it('contestada y sin marca: te falta por leerla', () => {
    expect(sinLeer(f('1', 'marta', contestada))).toBe(true);
  });

  it('leída una vez, no vuelve', () => {
    expect(sinLeer(f('1', 'marta', { ...contestada, seen_at: '2026-09-09T11:00:00Z' }))).toBe(false);
  });

  it('lo que no ha contestado no está esperando lectura', () => {
    expect(sinLeer(f('1', 'marta'))).toBe(false);
  });

  /* Un vídeo abierto y un encargo marcado son noticias, pero no devuelven nada
     que abrir: pedir un «visto» sobre ellos sería un clic para quitar de en
     medio una fila sin contenido. */
  it('solo el formulario: lo que se abre y lo que se marca no se leen', () => {
    expect(sinLeer(f('1', 'marta', { ...contestada, tipo: 'video' }))).toBe(false);
    expect(sinLeer(f('2', 'marta', { ...contestada, tipo: 'documento' }))).toBe(false);
    expect(sinLeer(f('3', 'marta', { ...contestada, tipo: 'pide' }))).toBe(false);
  });

  /* Lo mandado antes de la 0105 no trae `tipo` y era siempre un formulario: la
     columna nació con ese valor por defecto. */
  it('lo viejo sin tipo cuenta como formulario', () => {
    expect(sinLeer({ ...f('1', 'marta', contestada), tipo: undefined })).toBe(true);
  });

  it('cuenta por persona, y sin mirar la fecha en la que le tocaba', () => {
    const cuentas = contestadasPorCliente([
      f('1', 'marta', contestada),
      f('2', 'marta', { ...contestada, due: '2099-01-01' }),
      f('3', 'marta', { ...contestada, seen_at: '2026-09-09T11:00:00Z' }),
      f('4', 'javi', contestada),
      f('5', 'javi'),
    ]);
    expect(cuentas).toEqual({ marta: 2, javi: 1 });
  });

  it('sin nada contestado, ninguna cuenta', () => {
    expect(contestadasPorCliente([])).toEqual({});
  });

  /* Y el envío entero dice cuántas de sus respuestas te faltan, que es lo que
     distingue en el Taller «3 contestados» de hoy de los de la semana pasada. */
  it('el envío agrupado sabe cuántas trae sin leer', () => {
    const [envio] = agrupar([
      f('1', 'marta', contestada),
      f('2', 'javi', { ...contestada, seen_at: '2026-09-09T11:00:00Z' }),
      f('3', 'ana'),
    ]);
    expect(envio.entregados).toBe(2);
    expect(envio.nuevas).toBe(1);
  });
});

describe('envios · el recado, viejo y nuevo', () => {
  it('lo nuevo lo lleva en su columna', () => {
    expect(notaDe({ body: 'Antes del jueves.' })).toBe('Antes del jueves.');
  });

  /* EL PUENTE: lo mandado antes de la 0105 lo lleva dentro del esquema
     congelado, y ese esquema no se reescribe porque es la foto de lo que esa
     persona vio. Sin esto, los recados viejos desaparecerían de sus pantallas. */
  it('lo viejo se sigue leyendo del esquema congelado', () => {
    expect(notaDe({ schema: { nota: 'Lo de la analítica.' } })).toBe('Lo de la analítica.');
  });

  it('la columna manda sobre el esquema, y sin ninguna de las dos es cadena vacía', () => {
    expect(notaDe({ body: 'Nuevo', schema: { nota: 'Viejo' } })).toBe('Nuevo');
    expect(notaDe({})).toBe('');
    expect(notaDe(null)).toBe('');
  });
});

describe('envios · hecha', () => {
  /* Un solo concepto y una sola columna para los cuatro tipos: contestar,
     abrir y marcar son el mismo hecho —ya no está pendiente—. */
  it('lo dice la fecha, venga del tipo que venga', () => {
    expect(hecha({ tipo: 'form', submitted_at: '2026-09-06T12:00:00Z' })).toBe(true);
    expect(hecha({ tipo: 'video', submitted_at: '2026-09-06T12:00:00Z' })).toBe(true);
    expect(hecha({ tipo: 'pide' })).toBe(false);
    expect(hecha(null)).toBe(false);
  });
});
