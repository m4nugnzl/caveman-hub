import { describe, expect, it } from 'vitest';

import {
  GUIAS,
  GUIA_BIENVENIDA_CLIENTE,
  GUIA_DEL_PASO,
  alternativas,
  dondeDelPaso,
  guiaDeLaPantalla,
  guiaPorId,
  guiasDe,
  pantallasEncendidas,
  pasosDe,
  rutaDe,
} from './tutoriales';
import { onboardingSteps } from './onboarding';

describe('el catálogo de guías', () => {
  it('no repite ningún identificador', () => {
    const ids = GUIAS.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('cada guía tiene título, resumen, dónde empieza y al menos un paso', () => {
    for (const g of GUIAS) {
      expect(g.titulo, g.id).toBeTruthy();
      expect(g.resumen, g.id).toBeTruthy();
      expect(g.empieza.startsWith('/'), g.id).toBe(true);
      expect(g.pasos.length, g.id).toBeGreaterThan(0);
    }
  });

  /* Pasado de siete, la gente abandona el recorrido: si una tarea no cabe,
     son dos guías. */
  it('ninguna guía pasa de siete pasos', () => {
    for (const g of GUIAS) expect(g.pasos.length, g.id).toBeLessThanOrEqual(7);
  });

  it('cada paso tiene título y texto, y su señal dice qué buscar', () => {
    for (const g of GUIAS) {
      for (const p of g.pasos) {
        expect(p.titulo, g.id).toBeTruthy();
        expect(p.texto, g.id).toBeTruthy();
        const listo = p.listo ? alternativas(p.listo.relleno) : [];
        for (const s of [...alternativas(p.senal), ...alternativas(p.hecho), ...listo]) {
          expect(Boolean(s.css || s.campo), `${g.id} · ${p.titulo}`).toBe(true);
        }
      }
    }
  });

  /* Un `listo` que no dice qué mirar dejaría el paso cerrado para siempre. */
  it('cada «listo» dice qué casilla tiene que tener algo escrito', () => {
    for (const g of GUIAS) {
      for (const p of g.pasos.filter((x) => x.listo)) {
        expect(Object.keys(p.listo), `${g.id} · ${p.titulo}`).toEqual(['relleno']);
      }
    }
  });

  it('`nuevo` solo tiene sentido con `hecho`', () => {
    for (const g of GUIAS) {
      for (const p of g.pasos.filter((x) => x.nuevo)) expect(p.hecho, `${g.id} · ${p.titulo}`).toBeTruthy();
    }
  });

  /* El portal del cliente es otro diseño en cada aparato: una guía que en uno
     de los dos se quedara sin pasos no se podría hacer ahí. */
  it('cada guía tiene pasos en el teléfono y en el monitor, y el aparato es uno de los dos', () => {
    for (const g of GUIAS) {
      for (const p of g.pasos) {
        if (p.aparato) expect(['telefono', 'monitor'], `${g.id} · ${p.titulo}`).toContain(p.aparato);
      }
      expect(pasosDe(g, 'telefono').length, g.id).toBeGreaterThan(0);
      expect(pasosDe(g, 'monitor').length, g.id).toBeGreaterThan(0);
    }
  });

  it('en cada aparato, los pasos comunes y los suyos, en su orden', () => {
    const entreno = guiaPorId('entreno');
    const tel = pasosDe(entreno, 'telefono').map((p) => p.titulo);
    const pc = pasosDe(entreno, 'monitor').map((p) => p.titulo);
    expect(tel).toContain('Registra la serie');
    expect(pc).not.toContain('Registra la serie');
    expect(pc).toContain('Apunta una serie');
    expect(tel[0]).toBe(pc[0]);
    expect(tel.at(-1)).toBe(pc.at(-1));
  });

  /* Mientras falta, la tarjeta dice qué falta. En los de pulsar lo dice el
     anillo; en los demás hace falta la frase. */
  it('los pasos que esperan algo que no es un clic dicen qué esperan', () => {
    for (const g of GUIAS) {
      for (const p of g.pasos) {
        const espera = p.listo || (p.hecho && p.avanza !== 'clic');
        if (espera) expect(p.pista, `${g.id} · ${p.titulo}`).toBeTruthy();
      }
    }
  });

  /* Las guías que existen para ENSEÑAR A HACER algo tienen que comprobarlo:
     que se pueda llegar al final solo con «Siguiente» es justo el fallo. */
  it('las guías de una tarea tienen pasos que comprueban que se hizo', () => {
    const deTarea = ['alta', 'protocolo', 'fases', 'bloque', 'hoja', 'revision', 'entreno', 'entrega'];
    for (const id of deTarea) {
      const pasos = guiaPorId(id).pasos;
      const comprueban = pasos.filter((p) => p.avanza === 'clic' || p.hecho || p.listo);
      expect(comprueban.length, id).toBeGreaterThanOrEqual(2);
    }
  });

  /* Una guía que empieza en la ficha de un cliente tiene que decirlo, para que
     el índice pueda avisar cuando todavía no hay ninguno. */
  it('las que empiezan en un cliente lo declaran', () => {
    for (const g of GUIAS) expect(Boolean(g.conCliente), g.id).toBe(g.empieza.includes(':cliente'));
  });

  it('el entrenador y el cliente no se mezclan', () => {
    expect(guiasDe('entrenador').every((g) => !g.empieza.startsWith('/mi'))).toBe(true);
    expect(guiasDe('cliente').every((g) => g.empieza.startsWith('/mi'))).toBe(true);
    expect(guiaPorId(GUIA_BIENVENIDA_CLIENTE)?.serie).toBe('cliente');
  });

  it('cada paso de «Por dónde empezar» tiene su guía', () => {
    for (const paso of onboardingSteps({})) {
      expect(guiaPorId(GUIA_DEL_PASO[paso.id]), paso.id).not.toBeNull();
    }
  });
});

describe('rutaDe y dondeDelPaso', () => {
  it('pone el cliente en la ruta', () => {
    expect(rutaDe('/c/:cliente/rutina', 'abc')).toBe('/c/abc/rutina');
    expect(rutaDe('/clientes', 'abc')).toBe('/clientes');
  });

  it('sin cliente, una ruta que lo necesita no tiene destino', () => {
    expect(rutaDe('/c/:cliente/rutina', null)).toBeNull();
    expect(rutaDe('/hoy', null)).toBe('/hoy');
  });

  it('el paso usa su propia pantalla si la tiene, y si no la de su guía', () => {
    const revision = guiaPorId('revision');
    expect(dondeDelPaso(revision, revision.pasos[0], 'x')).toBe('/hoy');
    expect(dondeDelPaso(revision, revision.pasos[3], 'x')).toBe('/c/x/semana');
  });
});

describe('la guía de cada pantalla', () => {
  it('cada pantalla del entrenador tiene la suya', () => {
    const casos = {
      '/hoy': 'pantalla-inicio',
      '/clientes': 'pantalla-clientes',
      '/ingresos': 'pantalla-cobros',
      '/calendario': 'pantalla-agenda',
      '/protocolos': 'pantalla-protocolos',
      '/ejercicios': 'pantalla-libreria',
      '/alimentos': 'pantalla-libreria',
      '/plantillas': 'pantalla-plantillas',
      '/c/abc/resumen': 'pantalla-ficha',
      '/c/abc/rutina': 'pantalla-entreno',
      '/c/abc/nutricion': 'pantalla-dieta',
      '/c/abc/semana': 'pantalla-revisiones',
      '/c/abc/protocolo': 'pantalla-protocolo',
    };
    for (const [ruta, id] of Object.entries(casos)) expect(guiaDeLaPantalla(ruta)?.id, ruta).toBe(id);
  });

  it('las que no son una pantalla con guía no tienen ninguna', () => {
    for (const ruta of ['/c/abc/rutina/componer', '/ajustes/perfil', '/mi/inicio', '/', undefined]) {
      expect(guiaDeLaPantalla(ruta), String(ruta)).toBeNull();
    }
  });

  it('no salen en el índice: son de su sitio, no una tarea', () => {
    expect(guiasDe('entrenador').some((g) => g.pantalla)).toBe(false);
  });
});

describe('las guías de cada pantalla, a quién se abren solas', () => {
  const nuevo = [{ id: 'a', name: 'Marta', clientProfileId: null }];
  const conRodaje = [...nuevo, { id: 'b', name: 'Luis', clientProfileId: 'p1' }];

  it('a quien empieza, sí: sin clientes o sin ninguno que haya entrado', () => {
    expect(pantallasEncendidas(undefined, [])).toBe(true);
    expect(pantallasEncendidas({}, nuevo)).toBe(true);
  });

  it('a quien ya tiene clientes dentro con su enlace, no', () => {
    expect(pantallasEncendidas(undefined, conRodaje)).toBe(false);
    expect(pantallasEncendidas({ vistas: ['pantalla-inicio'] }, conRodaje)).toBe(false);
  });

  it('lo que él haya dicho manda sobre lo que se deduce', () => {
    expect(pantallasEncendidas({ sinPantallas: false }, conRodaje)).toBe(true);
    expect(pantallasEncendidas({ sinPantallas: true }, [])).toBe(false);
  });
});
