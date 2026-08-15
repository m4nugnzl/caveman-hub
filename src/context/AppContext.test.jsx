import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Que el proveedor monta, y que el corte en tres contextos está entero.
 *
 * ══ Por qué esta prueba existe ══════════════════════════════════════════════
 *
 * `AppContext` se partió en tres —sesión, datos y acciones— para que escribir un
 * kilo dejara de repintar la aplicación entera. Es un cambio mecánico sobre
 * ciento cuarenta y nueve claves, y el modo de fallar es callado: una clave que
 * se cae por el camino no rompe el build ni el lint, aparece como `undefined` en
 * la pantalla que la usara.
 *
 * ══ Por qué `renderToString` y no un renderizador de verdad ═════════════════
 *
 * Porque no hacen falta ni jsdom ni una librería de pruebas de componentes —dos
 * dependencias nuevas— para lo que aquí se quiere comprobar: que el árbol de
 * proveedores MONTA, que los cuatro ganchos resuelven y que el reparto de claves
 * está completo. `react-dom` ya está en el proyecto.
 *
 * Tiene además una propiedad útil: en el render de servidor los `useEffect` no
 * corren, así que el proveedor se monta SIN tocar la red. Lo que se prueba es la
 * estructura, que es justo lo que el corte podía haber roto.
 */

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null } })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
    from: vi.fn(),
    rpc: vi.fn(),
    storage: { from: vi.fn() },
  },
}));

const { AppProvider, useActions, useApp, useData, useSession } = await import('./AppContext');

/** Lo que la sonda ve, sacado del render. */
let visto = null;

const Sonda = () => {
  visto = {
    app: useApp(),
    acciones: useActions(),
    sesion: useSession(),
    datos: useData(),
  };
  return null;
};

const montar = () =>
  renderToString(
    <AppProvider>
      <Sonda />
    </AppProvider>
  );

beforeEach(() => {
  visto = null;
});

describe('AppProvider', () => {
  it('monta sin reventar y los cuatro ganchos resuelven', () => {
    expect(() => montar()).not.toThrow();
    expect(visto.app).toBeTruthy();
    expect(visto.acciones).toBeTruthy();
    expect(visto.sesion).toBeTruthy();
    expect(visto.datos).toBeTruthy();
  });

  it('los ganchos fuera del proveedor lo dicen en vez de dar `undefined`', () => {
    const Suelto = () => {
      useActions();
      return null;
    };
    expect(() => renderToString(<Suelto />)).toThrow(/AppProvider/);
  });

  /*
    El reparto tiene que ser una PARTICIÓN: sin solapes y sin pérdidas. Un solape
    significaría que dos contextos declaran la misma clave y gana el último del
    `useApp()`, que es un error que no se ve hasta que los dos valores difieren.
  */
  it('los tres contextos no comparten ninguna clave', () => {
    montar();
    const { sesion, datos, acciones } = visto;
    const solapes = [
      ...Object.keys(sesion).filter((k) => k in datos || k in acciones),
      ...Object.keys(datos).filter((k) => k in acciones),
    ];
    expect(solapes).toEqual([]);
  });

  it('`useApp` sigue devolviendo la suma exacta de los tres', () => {
    montar();
    const { app, sesion, datos, acciones } = visto;
    const suma =
      Object.keys(sesion).length + Object.keys(datos).length + Object.keys(acciones).length;
    expect(Object.keys(app).length).toBe(suma);
    for (const clave of [...Object.keys(sesion), ...Object.keys(datos), ...Object.keys(acciones)]) {
      expect(app).toHaveProperty(clave);
    }
  });

  /*
    El número exacto es a propósito. Si alguien añade una acción y se olvida de
    declararla, esto no salta —y no debería—; pero si alguien MUEVE una clave de
    sitio o la pierde al refactorizar, el recuento cambia y hay que mirarlo.
    Actualizar el número es una línea y obliga a pasar por aquí.
  */
  it('el reparto conserva las 156 claves', () => {
    montar();
    expect(Object.keys(visto.app).length).toBe(156);
  });

  it('toda acción es una función', () => {
    montar();
    const noSonFuncion = Object.entries(visto.acciones)
      .filter(([, v]) => typeof v !== 'function')
      .map(([k]) => k);
    expect(noSonFuncion).toEqual([]);
  });

  /*
    La fachada se congela para que nadie le cuelgue nada en caliente: un
    `actions.loQueSea = …` desde un componente se perdería en el siguiente
    montaje y sería imposible de encontrar.
  */
  it('la fachada de acciones está congelada', () => {
    montar();
    expect(Object.isFrozen(visto.acciones)).toBe(true);
  });

  /*
    `saveStatus` es una función pero NO es una acción: no hace nada, LEE el estado
    de guardado y se llama durante el render. Detrás de la fachada estable, un
    componente no se enteraría de que un guardado ha fallado — que es justo lo que
    la cola de guardado existe para evitar. Tiene que vivir con los datos.
  */
  it('`saveStatus` va con los datos, no con las acciones', () => {
    montar();
    expect(visto.datos).toHaveProperty('saveStatus');
    expect(visto.acciones).not.toHaveProperty('saveStatus');
    expect(visto.datos.saveStatus('workout', 'quien-sea')).toEqual({
      status: 'idle',
      error: null,
    });
  });

  it('arranca cargando y sin sesión', () => {
    montar();
    expect(visto.sesion.loading).toBe(true);
    expect(visto.sesion.session).toBeNull();
  });
});
