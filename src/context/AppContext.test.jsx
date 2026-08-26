import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
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
  it('el reparto conserva las 194 claves', () => {
    montar();
    // 194 desde el aviso de «ya puedes empezar» en Hoy: `equipmentCounts`, una
    // cifra por cliente. El detalle sigue siendo del cliente abierto; para saber
    // quién ha terminado su alta basta con si tiene fotos o no.
    // Antes 193, desde el salto al portal por una pantalla concreta: `openClientView` y
    // `takeViewTarget`. Cambiar de modo NO navega —lo traduce el comodín de
    // App.jsx— así que el destino se deja dicho y lo lee quien decide de verdad.
    // Antes 191, desde el cuestionario de alta (0080): `saveClientProfile`, el único
    // camino por el que el CLIENTE escribe en su ficha — pasa por una función
    // de la base porque la 0002 le deja `clients` en solo lectura.
    // Antes 190, desde la maquinaria del gimnasio (0079): el estado `equipment` y sus
    // tres acciones. Sin `resolveEquipment`: una máquina no se cura, se quita.
    // Antes 186, desde los condicionantes (0077): el estado `conditions` y sus cuatro
    // acciones —`addCondition`, `updateCondition`, `resolveCondition` y
    // `removeCondition`—. Resolver y borrar son dos y no una a propósito: una
    // lesión curada se conserva con su fecha y solo se borra lo que se apuntó mal.
    // Antes 181, al poner `ensureNutrition` en la fachada: existía en el proveedor y se
    // le pasaba a `useWorkout`, pero nunca se expuso, así que la pantalla de
    // nutrición lo pedía y recibía `undefined`.
    // Antes 180, desde las excepciones del protocolo: `saveClientException`, el guardado
    // por cliente que además deja la marca de «a este no le pongas la plantilla
    // encima». Antes 179, desde las equivalencias de alimentos: `swapFood`, que sustituye un
    // alimento por su equivalente en su sitio, y `setFoodEquivalences`, la
    // excepción por alimento a lo que el módulo del protocolo decide en general.
    // Antes 177, desde «traer un plan de fuera»: `importDiet`, que escribe la
    // dieta entera de una vez, e `importRoutine`, que decide contra qué semana
    // cae una rutina importada desde una pantalla que no está mirando ninguna.
    // Antes 175, desde «pegar una rutina»: `addExercises` e `importDays`, las dos
    // escrituras en bloque que necesita traer una hoja de fuera sin mandar una
    // petición por ejercicio.
    // Antes 173, desde las bifurcaciones del roadmap (0073): `setPhaseFork` y
    // `chooseFork`. Antes 171, desde el calendario suscribible del cliente
    // (0071): `loadCalendarFeed`, `createCalendarFeed` y `revokeCalendarFeed`.
    // Y antes 168, desde `applyProtocolToClient` — «Aplicar a todos» dejó de
    // escribir a ciegas por la cola y pasó a esperar cada respuesta para
    // contarla.
    // Antes 194, desde la carpeta compartida en Drive (0082): seis acciones, y la
    // cuenta se explica sola si se lee quién llama a cada una. Del entrenador son
    // `driveAuthorize` (el viaje a Google), `runDrive` (montar la carpeta y
    // comprobar el permiso) y `setClientFolder` (si el cliente puede subir y qué
    // le pides). Las otras tres —`loadClientFolder`, `driveFiles` y `driveUpload`—
    // las llaman los DOS: el entrenador desde la ficha y el cliente desde su
    // portal, y por eso se autorizan por la carpeta y no por la integración, que
    // él no puede ni ver.
    //
    // Fueron siete un rato: había un `loadClientFolders` en plural para pintar la
    // cartera entera en Ajustes → Integraciones. Esa lista se retiró —gestionar
    // clientes desde Ajustes es el segundo sitio que la ficha existe para evitar—
    // y con ella se fue su consulta.
    //
    // Y 201 desde la salida de emergencia del acceso (0083): `reissueAccess`, que
    // suelta la ficha de la cuenta que la tenía y devuelve un enlace de invitación
    // nuevo. Es una acción y no dos porque el canje ya existía desde la 0015: lo
    // único que faltaba era poder SOLTAR una ficha ya enlazada, que es lo que
    // dejaba a un cliente sin contraseña fuera para siempre.
    expect(Object.keys(visto.app).length).toBe(201);
  });

  /*
    ══ Lo que las pantallas piden TIENE que existir ═══════════════════════════

    Esta prueba nació de un fallo que costó una tarde: la pantalla de nutrición
    pedía `ensureNutrition` —que existe en el proveedor, pero se le pasaba a
    `useWorkout` y nunca se puso en la fachada—, así que llegaba `undefined`.
    Nada falla al arrancar: el desestructurado de una clave que no está no es un
    error en JavaScript. Fallaba al PULSAR, dentro de un `async`, así que el
    error se lo tragaba una promesa sin dueño y lo único que se veía era que la
    dieta importada no se guardaba.

    Ni el linter ni el compilador ven eso, y el recuento de claves tampoco: la
    fachada estaba completa, lo que faltaba era una clave concreta. Así que se
    comprueba lo único que lo habría cazado — que todo lo que alguien pide con
    `useApp()` está de verdad ahí—.
  */
  it('todo lo que alguna pantalla desestructura de `useApp()` existe', () => {
    montar();

    const pedidas = new Map();
    const mirar = (dir) => {
      for (const entrada of readdirSync(dir, { withFileTypes: true })) {
        const ruta = join(dir, entrada.name);
        if (entrada.isDirectory()) {
          mirar(ruta);
          continue;
        }
        if (!/\.jsx?$/.test(entrada.name) || /\.test\./.test(entrada.name)) continue;

        const codigo = readFileSync(ruta, 'utf8');
        /* Sin llaves dentro: así el desestructurado no se puede comer al de
           arriba —`const { open } = useOtraCosa()` seguido de este—. */
        for (const m of codigo.matchAll(/const\s*{([^{}]*)}\s*=\s*useApp\(\)/g)) {
          const nombres = m[1]
            /* Los comentarios de dentro del desestructurado no son claves. */
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/\/\/[^\n]*/g, '')
            .split(',')
            .map((n) => n.split(':')[0].trim())
            .filter(Boolean);
          for (const nombre of nombres) if (!pedidas.has(nombre)) pedidas.set(nombre, ruta);
        }
      }
    };
    mirar(new URL('../', import.meta.url).pathname.replace(/^\/([a-zA-Z]:)/, '$1'));

    const ausentes = [...pedidas]
      .filter(([nombre]) => !(nombre in visto.app))
      .map(([nombre, ruta]) => `${nombre} (${ruta.split(/[\\/]/).slice(-2).join('/')})`);

    expect(pedidas.size).toBeGreaterThan(50);
    expect(ausentes).toEqual([]);
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
