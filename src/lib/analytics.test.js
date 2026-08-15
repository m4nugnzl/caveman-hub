import { describe, expect, it, vi } from 'vitest';

vi.mock('./supabaseClient', () => ({ supabase: { from: () => ({ insert: async () => ({}) }) } }));

const { bucket, identify, track } = await import('./analytics');
const { pantallaDe } = await import('../App.jsx');
const { COACH_CLIENT } = await import('../routes.jsx');

/**
 * Que la instrumentación no pueda describir a nadie.
 *
 * ══ Por qué esto merece pruebas ═════════════════════════════════════════════
 *
 * La migración 0045 se compromete por escrito a que la tabla de uso no contenga
 * datos personales, y apoya ese compromiso en un CHECK de Postgres. Pero el CHECK
 * solo protege del nombre del evento: lo que viaja en `props` y en la etiqueta de
 * pantalla lo decide este lado.
 *
 * Y el riesgo es concreto, no teórico: **una ruta lleva dentro el id de un
 * cliente** (`/c/8f3a…/rutina`). Sacar el tramo a pelo metería ese id en la tabla
 * el día que alguien abriera una URL rara, y la instrumentación pasaría a señalar
 * a personas de las que esta aplicación guarda fotos de su cuerpo.
 *
 * Esta aplicación ya tuvo una fuga así sin decidirla —el avatar que se le pedía a
 * un tercero con el nombre de la persona en la URL, `auditoria.md` §3.5—. La
 * diferencia entre aquello y esto es que aquí hay una prueba.
 */
describe('pantallaDe', () => {
  it('nunca deja pasar lo que identifica al cliente, sea lo que sea', () => {
    /*
      La salida se construye SOLO con la sección, que sale de una lista blanca.
      El tramo del medio —el id, y en una URL escrita a mano cualquier cosa— se
      descarta siempre, no se copia ni se sanea.
    */
    const identificadores = ['8f3a1c22-0000-4444-8888-abcdefabcdef', 'ana@correo.com', 'Ana%20Perez'];

    /*
      Las secciones salen de la tabla de rutas, no de una lista escrita a mano.
      La lista a mano ya se quedó atrás una vez: al fundir «Fotos» y «Check-ins»
      en «Revisión», seguía comprobando `fotos` —que ya solo redirige— y dejó de
      comprobar las dos rutas nuevas. Una prueba de privacidad que se queda vieja
      en silencio es peor que no tenerla.
    */
    const secciones = COACH_CLIENT.flatMap((s) => [s.path, ...(s.also || [])]);
    expect(secciones.length).toBeGreaterThan(4);

    for (const quien of identificadores) {
      for (const seccion of secciones) {
        const salida = pantallaDe(`/c/${quien}/${seccion}`);
        expect(salida).not.toContain(quien);
        /* Los niveles llevan barra en la ruta (`revision/fotos`) y guion bajo en
           la etiqueta: el nombre del evento tiene que ser un identificador
           corto, que es lo que impone el CHECK de la 0045. */
        expect(salida).toBe(`cliente_${seccion.replace(/\//g, '_')}`);
      }
    }
  });

  it('lo que no reconoce se cuenta como «otra», no se copia', () => {
    /* Perder una etiqueta es barato; guardar el identificador de una persona no.
       Ante la duda, esto tiene que quedarse callado. */
    const raras = [
      '/c/8f3a1c22-0000-4444-8888-abcdefabcdef/inventada',
      '/ajustes/inventada',
      '/loquesea',
      '/',
    ];
    for (const ruta of raras) expect(pantallaDe(ruta)).toBe('otra');
  });

  it('las secciones declaradas sí salen con su nombre', () => {
    expect(pantallaDe('/hoy')).toBe('hoy');
    expect(pantallaDe('/clientes')).toBe('clientes');
    expect(pantallaDe('/ajustes/protocolo')).toBe('ajustes_protocolo');
    expect(pantallaDe('/ajustes/plan')).toBe('ajustes_plan');
  });

  it('la salida siempre pasa el CHECK de la 0045', () => {
    /* El nombre del evento y la etiqueta se guardan juntos; si la etiqueta no
       fuera un identificador corto, la fila se rechazaría en el servidor y esto
       dejaría de medir en silencio. */
    const rutas = ['/hoy', '/c/abc-def/rutina', '/ajustes/equipo', '/basura/rara', '/'];
    for (const ruta of rutas) expect(pantallaDe(ruta)).toMatch(/^[a-z][a-z0-9_]{2,40}$/);
  });
});

describe('bucket', () => {
  it('convierte un recuento en un tramo, nunca en la cifra', () => {
    expect(bucket(0)).toBe('0');
    expect(bucket(1)).toBe('1-2');
    expect(bucket(5)).toBe('3-9');
    expect(bucket(28)).toBe('10-29');
    expect(bucket(400)).toBe('30+');
  });

  it('«28 clientes» señala a alguien; «10-29» no', () => {
    /* La razón de existir de la función: dos carteras distintas del mismo tamaño
       aproximado tienen que ser indistinguibles en la tabla. */
    expect(bucket(11)).toBe(bucket(29));
    expect(bucket(0)).not.toBe(bucket(1));
  });

  it('lo que no es un número no se inventa', () => {
    expect(bucket(undefined)).toBe('desconocido');
    expect(bucket('muchos')).toBe('desconocido');
    expect(bucket(-3)).toBe('desconocido');
  });
});

describe('track', () => {
  it('no apunta nada mientras no haya un entrenador identificado', () => {
    /* El portal del cliente no se instrumenta: quien es el sujeto de los datos
       de salud no va a ser además el sujeto de la medición. */
    identify({ userId: 'u1', team: 't1', role: 'client' });
    expect(() => track('pantalla_vista')).not.toThrow();

    identify({});
    expect(() => track('pantalla_vista')).not.toThrow();
  });

  it('descarta cualquier nombre que no sea un identificador corto', () => {
    identify({ userId: 'u1', team: 't1', role: 'coach' });
    /* La misma regla que el CHECK del servidor, aplicada antes de salir: un
       nombre propio o un correo usados como evento se tiran aquí. */
    for (const malo of ['Ana Pérez', 'ana@correo.com', 'AB', '', 'con espacios', 'Mayúsculas']) {
      expect(() => track(malo)).not.toThrow();
    }
  });
});
