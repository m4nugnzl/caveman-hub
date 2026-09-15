import { describe, expect, it } from 'vitest';

import { CLIENT_SECTIONS, clientHomeFor, clientViewOf, sectionsFor } from '@/routes';

/*
  ══ La puerta del portal tiene que existir SIEMPRE ══════════════════════════

  El inicio del cliente era la constante `/mi/rutina`, y la rutina es una de las
  dos secciones que pueden no estar (`service: 'training'`). A quien solo le
  llevas la dieta, su portal entero se quedaba en la barra de abajo sobre el
  vacío: el guardia de la rutina expulsaba a la rutina, `<Navigate>` a la misma
  ruta no pinta nada, y ahí caía además CUALQUIER URL que el portal no
  reconociera. Medido contra la aplicación con datos: 39 caracteres en toda la
  página.

  Estas pruebas son las que impiden que vuelva. No comprueban una cadena
  concreta —la decisión de qué sección va primera es de producto y puede
  cambiar— sino la propiedad: a donde manda el portal, esa persona puede entrar.
*/

const soloDieta = { services: { training: false } };
const soloEntreno = { services: { nutrition: false } };
const todo = {};

/** ¿Puede esta persona entrar de verdad en la ruta a la que se la manda? */
const existe = (ruta, protocol) => {
  const path = ruta.replace(/^\/mi\//, '');
  const seccion = CLIENT_SECTIONS.find((s) => s.path === path);
  return Boolean(seccion) && sectionsFor([seccion], protocol).length === 1;
};

describe('el inicio del portal', () => {
  it('siempre es una sección que ese cliente tiene', () => {
    for (const protocol of [todo, soloDieta, soloEntreno]) {
      const casa = clientHomeFor(protocol);
      expect(existe(casa, protocol), `${casa} con ${JSON.stringify(protocol)}`).toBe(true);
    }
  });

  /* Desde el 12 de septiembre el inicio es LA PORTADA y va primera: el saludo,
     lo que espera una decisión suya y el progreso debajo. Antes era la rutina,
     que es la decisión que esta prueba fijaba. Ver `CLIENT_SECTIONS`. */
  it('es su portada, la lleves como la lleves', () => {
    for (const protocol of [todo, soloDieta, soloEntreno]) {
      expect(clientHomeFor(protocol)).toBe('/mi/inicio');
    }
  });

  it('sin entreno no manda a la rutina', () => {
    expect(clientHomeFor(soloDieta)).not.toBe('/mi/rutina');
  });

  /* El caso exacto que se rompía: el guardia de una sección no puede tener como
     salida esa misma sección, o la expulsión no lleva a ninguna parte. */
  it('nunca es la sección de la que se sale', () => {
    expect(clientHomeFor(soloDieta)).not.toBe('/mi/rutina');
    expect(clientHomeFor(soloEntreno)).not.toBe('/mi/dieta');
  });
});

describe('saltar al portal desde el panel', () => {
  it('traduce la sección cuando ese cliente la tiene', () => {
    expect(clientViewOf('/c/abc/nutricion', todo)).toBe('/mi/dieta');
    expect(clientViewOf('/c/abc/rutina', todo)).toBe('/mi/rutina');
  });

  /* Un entrenador mirando la rutina de alguien a quien solo le lleva la dieta:
     la traducción literal le mandaría a una sección que para esa persona no
     existe, que es el mismo callejón por otra puerta. */
  it('no traduce a una sección que ese cliente no tiene', () => {
    const destino = clientViewOf('/c/abc/rutina', soloDieta);
    expect(destino).not.toBe('/mi/rutina');
    expect(existe(destino, soloDieta)).toBe(true);
  });

  it('lo que no tiene pareja cae en su inicio, y su inicio existe', () => {
    for (const protocol of [todo, soloDieta]) {
      const destino = clientViewOf('/c/abc/ficha', protocol);
      expect(destino).toBe(clientHomeFor(protocol));
      expect(existe(destino, protocol)).toBe(true);
    }
  });
});
