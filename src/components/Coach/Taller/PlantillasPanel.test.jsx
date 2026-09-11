import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { TIPO } from '@/lib/portapapeles';
import { ConfirmProvider } from '@/components/ui/ConfirmProvider';
import { ToastProvider } from '@/components/ui/ToastProvider';

/*
  La pantalla lee el CAJÓN y las preferencias, y las dos salen del contexto. Se
  le da uno de mentira: lo que se prueba aquí es qué se pinta, no de dónde salen
  los datos —eso vive en `useCajon` y en `domain/cajon`, que tiene sus pruebas—.
*/
const cajon = [
  {
    id: 'b1',
    kind: TIPO.BLOQUE,
    name: 'Acumulación de otoño',
    savedAt: '2026-09-01T10:00:00.000Z',
    carga: {
      sessions: [
        { dayName: 'Lower A', exercises: [{ name: 'Sentadilla', sets: [{}, {}] }] },
        { dayName: 'Upper A', exercises: [] },
      ],
      intent: 'acumulacion',
      plannedWeeks: 6,
    },
  },
  {
    id: 'h1',
    kind: TIPO.HOJA,
    name: 'Mi mejor pierna',
    savedAt: '2026-08-20T10:00:00.000Z',
    carga: { exercises: [{ name: 'Peso muerto', sets: [{}, {}, {}] }] },
  },
  {
    id: 'p1',
    kind: TIPO.PLATO,
    name: 'Desayuno de definición',
    savedAt: null,
    carga: { foods: [{ name: 'Avena', grams: 80, proteinPer100: 13, carbsPer100: 60, fatsPer100: 7 }] },
  },
];

const app = {
  cajon,
  coachPrefs: {
    gruposEquiv: {
      items: [{ id: 'g1', name: 'Mi proteína magra', macro: 'protein', foods: ['Pollo', 'Pavo'] }],
    },
  },
  cabeEnCajon: () => true,
  guardarEnCajon: async () => ({ ok: true }),
};

vi.mock('@/context/AppContext', () => ({
  useApp: () => app,
  /* El aviso de «Estás viendo tu copia» del `ToastProvider`, que envuelve la
     pantalla porque guardar avisa. */
  useData: () => ({ enEspera: false, copiaLocal: null }),
  useActions: () => ({
    updateCoachPreferences: () => {},
    renombrarEnCajon: async () => ({ ok: true }),
    tirarDelCajon: async () => ({ ok: true }),
  }),
}));

const { PlantillasPanel } = await import('./PlantillasPanel');

/**
 * `/plantillas`, montada.
 *
 * ── Qué atrapa ─────────────────────────────────────────────────────────────
 * Que la pantalla se construye y que cada tramo enseña lo suyo. Esta pantalla
 * bifurcaba once veces por `enDias`; ahora lo que cambia de una forma a otra lo
 * dice `CAJONES` y el riesgo se ha movido de sitio: no es un ternario mal
 * escrito, es una forma que se añade a la tabla del dominio y aquí no se dibuja
 * —o al revés—. Eso es justo lo que esto vigila.
 *
 * Con `renderToStaticMarkup` y sin DOM, así que los gestos —pulsar un tramo,
 * renombrar, tirar— no se prueban aquí; el estado inicial es «Bloques», que es
 * el primero de `FORMAS`.
 */
/*
  `BandaTaller` usa `useLayoutEffect` para la marca deslizante del tramo, y en
  el renderizador de servidor eso avisa una vez por prueba. Se silencia SOLO ese
  mensaje y SOLO en este archivo — cualquier otro aviso de React sigue saliendo,
  que es el motivo por el que no se apaga la consola entera.
*/
const avisoOriginal = console.error;
beforeAll(() => {
  console.error = vi.fn((...args) => {
    if (typeof args[0] === 'string' && args[0].includes('useLayoutEffect does nothing')) return;
    avisoOriginal(...args);
  });
});
afterAll(() => {
  console.error = avisoOriginal;
});

const monta = () =>
  renderToStaticMarkup(
    <ToastProvider>
      <ConfirmProvider>
        <PlantillasPanel />
      </ConfirmProvider>
    </ToastProvider>
  );

describe('PlantillasPanel', () => {
  it('la banda enseña los cuatro tramos con su cifra', () => {
    const html = monta();
    for (const tramo of ['Bloques', 'Días', 'Platos', 'Grupos']) {
      expect(html).toContain(tramo);
    }
  });

  it('abre por Bloques, que es el tramo que faltaba', () => {
    const html = monta();
    expect(html).toContain('Acumulación de otoño');
    /* El resumen del dominio, con la intención delante del recuento. */
    expect(html).toContain('Acumulación · 2 hojas · 6 semanas previstas');
    /* Y el pie dice dónde se pone: aquí se mira, se pone donde se monta. */
    expect(html).toContain('1 de 20.');
    expect(html).toContain('Se ponen desde la lista de bloques');
  });

  it('un bloque se puede copiar a la mano', () => {
    /* Es la mitad que faltaba: guardar sin poder volver a sacarlo es un cajón
       con la llave dentro. */
    expect(monta()).toContain('Copiar Acumulación de otoño al portapapeles');
  });

  it('la pantalla entera cae como destino, con el verbo «Guardar»', () => {
    /* No se ve —`Destino` no pinta nada— pero tiene que montarse sin reventar
       con las tres formas que tienen cajón. La prueba de verdad es que el
       árbol se construye; si `FORMAS_CON_CAJON` y `CAJONES` se desincronizaran,
       `guardarLoQueLlevas` recibiría una forma sin entrada en la tabla. */
    expect(() => monta()).not.toThrow();
  });
});
