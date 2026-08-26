import { describe, expect, it } from 'vitest';

import { esRechazoDefinitivo, traduceDbError, traduceStorageError } from './dbErrors';

/**
 * ══ Qué protege este archivo ═══════════════════════════════════════════════
 *
 * Que un error del servidor no llegue nunca a la pantalla en crudo. El caso real
 * fue un cliente intentando anotar sus kilos en el gimnasio y viendo esto:
 *
 *   public.log_session_set(p_client, p_date, p_day_name, …)
 *
 * que no dice qué ha pasado, ni de quién es la culpa, ni que reintentarlo no va
 * a servir de nada.
 */
describe('traduceDbError', () => {
  const noEncontrada = (fn) => ({
    code: 'PGRST202',
    message: `Could not find the function public.${fn}(p_client, p_date) in the schema cache`,
  });

  it('una función que falta se traduce a la migración que hay que aplicar', () => {
    const texto = traduceDbError(noEncontrada('log_session_set'));
    expect(texto).toContain('0014');
    expect(texto).not.toContain('p_client');
  });

  it('cada función conocida nombra SU migración', () => {
    expect(traduceDbError(noEncontrada('log_session_feedback'))).toContain('0016');
    expect(traduceDbError(noEncontrada('set_client_preferences'))).toContain('0008');
    expect(traduceDbError(noEncontrada('review_check_in'))).toContain('0042');
  });

  /* Una función que no esté en la tabla sigue dando el diagnóstico bueno —falta
     una migración— aunque no pueda decir cuál. Es lo único que hace falta para
     saber que no es un problema del usuario. */
  it('una función desconocida no se queda sin explicación', () => {
    const texto = traduceDbError(noEncontrada('funcion_del_futuro'));
    expect(texto).toContain('migración');
    expect(texto).not.toContain('funcion_del_futuro');
  });

  it('reconoce el fallo aunque no venga el código', () => {
    expect(
      traduceDbError({ message: 'Could not find the function public.save_workout_data(x)' })
    ).toContain('0014');
  });

  it('permisos y RLS se dicen sin jerga', () => {
    expect(traduceDbError({ code: '42501', message: 'permission denied for table clients' })).toMatch(
      /permiso/i
    );
    expect(
      traduceDbError({ message: 'new row violates row-level security policy for table "workout_data"' })
    ).toMatch(/permiso/i);
  });

  it('la falta de red dice que no se pierde nada', () => {
    expect(traduceDbError(new TypeError('Failed to fetch'))).toMatch(/sin conexión/i);
  });

  it('una entrega repetida no parece un fallo del programa', () => {
    expect(traduceDbError({ code: '23505', message: 'duplicate key value' })).toMatch(/ya estaba/i);
  });

  /* Lo que no se reconoce se enseña tal cual: un mensaje en inglés es peor que
     uno en castellano y mucho mejor que «se ha producido un error», porque al
     menos se puede buscar y va entero al ticket de soporte. */
  it('lo desconocido pasa sin tocar', () => {
    expect(traduceDbError({ code: '22003', message: 'numeric field overflow' })).toBe(
      'numeric field overflow'
    );
    expect(traduceDbError(null)).toBe('No se pudo guardar');
  });
});

/**
 * La cuota de almacenamiento (0067) llega desde la API de Storage como
 * «database error, code: 23514»: el texto del disparador se pierde por el
 * camino, así que la frase vive aquí — y habla distinto a cada lado del
 * archivo, a propósito (`monetizacion.md` §7.4).
 */
describe('traduceStorageError', () => {
  const cuotaLlena = { message: 'database error, code: 23514' };

  it('al entrenador le dice qué pasa y qué hacer', () => {
    const texto = traduceStorageError(cuotaLlena);
    expect(texto).toMatch(/espacio de fotos y vídeo/i);
    expect(texto).toMatch(/cambia de plan/i);
  });

  /* El cliente no ha contratado nada: ni plan ni tarifa en su mensaje. */
  it('al cliente no le nombra el plan', () => {
    const texto = traduceStorageError(cuotaLlena, { cliente: true });
    expect(texto).toMatch(/díselo a tu entrenador/i);
    expect(texto).not.toMatch(/plan/i);
  });

  /* Cualquier otro fallo de Storage no es suyo: devuelve `null` y quien llama
     enseña el mensaje original, que al menos se puede buscar. */
  it('lo que no es la cuota se queda como estaba', () => {
    expect(traduceStorageError({ message: 'mime type video/webm is not supported' })).toBeNull();
    expect(traduceStorageError(null)).toBeNull();
  });
});

/**
 * ══ Qué se puede tirar y qué no ════════════════════════════════════════════
 *
 * La nota del navegador cubre el hueco entre «no hay red» y «vuelve a haberla».
 * La línea que separa un caso del otro la traza esto, y equivocarse hacia un lado
 * pierde datos y hacia el otro deja a alguien con «No se guardó · Reintentar»
 * encendido para siempre. Le pasó a un cliente durante semanas.
 */
describe('esRechazoDefinitivo', () => {
  it('lo que una guarda del servidor ha rechazado no mejora esperando', () => {
    expect(
      esRechazoDefinitivo({ code: 'P0001', message: 'El ejercicio ex_1 no está programado en EMPUJES' })
    ).toBe(true);
    expect(esRechazoDefinitivo({ code: '42501', message: 'row-level security' })).toBe(true);
    expect(esRechazoDefinitivo({ code: '23505' })).toBe(true);
  });

  /* El caso para el que se inventó la nota: el gimnasio sin cobertura. */
  it('un fallo de red se conserva', () => {
    expect(esRechazoDefinitivo({ message: 'Failed to fetch' })).toBe(false);
    expect(esRechazoDefinitivo(new Error('offline'))).toBe(false);
    expect(esRechazoDefinitivo(null)).toBe(false);
  });

  /* Se parece a un rechazo definitivo y no lo es: se arregla desde el otro lado,
     y a menudo en minutos. Lo que hay que hacer es esperar, no tirarlo. */
  it('faltar una migración se conserva', () => {
    expect(esRechazoDefinitivo({ code: 'PGRST202', message: 'Could not find the function' })).toBe(false);
  });
});
