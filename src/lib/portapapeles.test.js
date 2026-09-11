import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  TIPO,
  arrastrarPieza,
  copiar,
  destinoVigente,
  piezaDeHoja,
  piezaEnVuelo,
  quitar,
  registrarDestino,
  releer,
  soltarPieza,
  suscribirDestino,
  suscribirVuelo,
  vaciar,
} from './portapapeles';

/*
  El almacén del portapapeles: lo que se guarda, cuánto aguanta y qué pasa
  cuando el navegador no deja guardar.

  ── Por qué se prueba a través de `localStorage` ────────────────────────────
  Porque lo que tiene que ser cierto no es que un array interno tenga doce
  elementos: es que lo copiado SOBREVIVE al cambio de pantalla y a la recarga,
  que es la mitad de por qué esto no es un `useState`. Comprobarlo en el sitio
  donde de verdad se guarda es lo único que prueba eso.

  Las pruebas corren en Node, donde no hay `localStorage`, así que se pone uno
  de mentira en memoria. No es un apaño para la prueba: es exactamente lo que el
  navegador ofrece, y montarlo aquí deja además provocar el fallo de escritura
  —modo privado, cuota llena—, que en un navegador de verdad no se puede forzar.
*/

const CLAVE = 'caveman-portapapeles';

const almacenDeMentira = () => {
  const datos = new Map();
  return {
    getItem: (k) => (datos.has(k) ? datos.get(k) : null),
    setItem: (k, v) => datos.set(k, String(v)),
    removeItem: (k) => datos.delete(k),
    clear: () => datos.clear(),
  };
};

const guardado = () => JSON.parse(globalThis.localStorage.getItem(CLAVE) || '[]');

const unaHoja = (titulo, ejercicios = 1) => ({
  tipo: TIPO.HOJA,
  titulo,
  detalle: `${ejercicios} ejercicios`,
  origen: { cliente: 'Marta', donde: 'Bloque 1' },
  carga: {
    dayName: titulo,
    exercises: Array.from({ length: ejercicios }, (_, i) => ({ name: `Ejercicio ${i}` })),
  },
});

describe('el portapapeles', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', almacenDeMentira());
    vaciar();
  });

  it('guarda lo copiado y sobrevive en el almacén del navegador', () => {
    copiar(unaHoja('Lower A'));

    expect(guardado()).toHaveLength(1);
    expect(guardado()[0].titulo).toBe('Lower A');
    expect(guardado()[0].origen.cliente).toBe('Marta');
    expect(guardado()[0].carga.exercises).toHaveLength(1);
  });

  it('pone lo más reciente primero, que es lo que se pega', () => {
    copiar(unaHoja('Lower A'));
    copiar(unaHoja('Upper A'));

    expect(guardado().map((p) => p.titulo)).toEqual(['Upper A', 'Lower A']);
  });

  it('da un identificador distinto a cada pieza, aunque se copie lo mismo dos veces', () => {
    // Copiar la misma hoja dos veces es normal —se pega en dos clientes— y las
    // dos filas de la bandeja tienen que poder quitarse por separado.
    const a = copiar(unaHoja('Lower A'));
    const b = copiar(unaHoja('Lower A'));

    expect(a.id).not.toBe(b.id);
    quitar(a.id);
    expect(guardado().map((p) => p.id)).toEqual([b.id]);
  });

  it('recuerda doce piezas y suelta las viejas', () => {
    // El tope existe para que la bandeja se abarque de una mirada. Lo que se
    // suelta es lo más antiguo, nunca lo que se acaba de copiar.
    for (let i = 1; i <= 14; i += 1) copiar(unaHoja(`Hoja ${i}`));

    const piezas = guardado();
    expect(piezas).toHaveLength(12);
    expect(piezas[0].titulo).toBe('Hoja 14');
    expect(piezas.map((p) => p.titulo)).not.toContain('Hoja 1');
  });

  it('suelta piezas antes que pasarse del hueco del navegador', () => {
    // Doce bloques grandes copiados sí pueden pasarse del millón de caracteres,
    // y `localStorage` es de toda la aplicación: la plantilla de alta, los
    // clientes recientes y las preferencias viven al lado. Lo que NO puede pasar
    // es que la copia recién hecha sea la que se pierda.
    for (let i = 1; i <= 4; i += 1) copiar(unaHoja(`Gorda ${i}`, 4000));

    const piezas = guardado();
    expect(piezas.length).toBeGreaterThan(0);
    expect(piezas[0].titulo).toBe('Gorda 4');
    expect(JSON.stringify(piezas).length).toBeLessThanOrEqual(1_000_000);
  });

  it('sigue copiando aunque el navegador no deje guardar', () => {
    // Modo privado, cuota llena o almacenamiento bloqueado: se pierde al
    // recargar, pero copiar y pegar en esta sesión tiene que seguir yendo. Era
    // eso o no dejar copiar, que es peor.
    vi.stubGlobal('localStorage', {
      ...almacenDeMentira(),
      setItem: () => {
        throw new Error('almacenamiento bloqueado');
      },
    });

    expect(() => copiar(unaHoja('Lower A'))).not.toThrow();
  });

  /*
    `releer` es el camino por el que entra en la bandeja algo que NO ha escrito
    esta pestaña: el arranque y el aviso de otra pestaña. Es el único que se
    encuentra lo que haya guardado ahí —un formato viejo, una escritura a
    medias— y por eso es el único que tiene que aguantarlo.
  */
  it('descarta al leer las piezas con las que no se podría hacer nada', () => {
    // Una pieza sin `carga` no se puede pegar, y una sin `id` no se puede
    // quitar de la bandeja. Mejor una bandeja con una menos que una bandeja que
    // no se pinta en ninguna pantalla.
    copiar(unaHoja('Lower A'));
    const buena = guardado()[0];
    globalThis.localStorage.setItem(
      CLAVE,
      JSON.stringify([{ id: 'sin-carga', tipo: 'hoja' }, { tipo: 'hoja', carga: {} }, buena])
    );

    expect(releer().map((p) => p.titulo)).toEqual(['Lower A']);
  });

  it('aguanta un almacén con basura dentro', () => {
    globalThis.localStorage.setItem(CLAVE, 'esto no es JSON');

    expect(() => releer()).not.toThrow();
    expect(releer()).toEqual([]);
  });
});

/*
  ══ LOS DESTINOS ═══════════════════════════════════════════════════════════

  Lo que hace que la mano pueda encender un verbo con el nombre del sitio en vez
  de callarse siempre. Se prueba fuera de React —`registrarDestino` es la puerta
  de abajo, y `useDestino` solo la llama desde un efecto— porque lo que tiene que
  ser cierto es de la PILA: quién manda cuando hay dos montados y que al
  desmontarse una pantalla deje de ofrecer lo que ya no puede hacer.
*/
describe('los destinos del portapapeles', () => {
  it('sin nadie registrado, no hay dónde pegar', () => {
    expect(destinoVigente()).toBeNull();
  });

  it('presenta lo que la pantalla montada acepta', () => {
    const baja = registrarDestino({ tipos: [TIPO.EJERCICIO], donde: 'Lower A', pegar: () => {} });

    expect(destinoVigente().donde).toBe('Lower A');
    // «Pegar» por defecto: los cajones son los que tienen que decir otra cosa.
    expect(destinoVigente().verbo).toBe('Pegar');

    baja();
    expect(destinoVigente()).toBeNull();
  });

  it('manda el más específico, y no el último en montarse', () => {
    /*
      Con una hoja abierta dentro de un bloque, lo que cae es un ejercicio en la
      hoja. Y no se puede deducir del orden: los efectos de un hijo corren ANTES
      que los del padre, así que el contenedor se registraría el último y ganaría
      justo al revés de lo que hace falta.
    */
    const bajaHoja = registrarDestino({ tipos: [TIPO.EJERCICIO], donde: 'Lower A', prioridad: 1, pegar: () => {} });
    const bajaBloque = registrarDestino({ tipos: [TIPO.HOJA], donde: 'Acumulación', prioridad: 0, pegar: () => {} });

    expect(destinoVigente().donde).toBe('Lower A');

    // Y al cerrar la hoja, el bloque vuelve a ser el destino.
    bajaHoja();
    expect(destinoVigente().donde).toBe('Acumulación');
    bajaBloque();
  });

  it('a igual especificidad, manda el último montado', () => {
    // Navegar de un cliente a otro sin desmontar la pantalla: el destino tiene
    // que ser el de delante, no el de donde se venía.
    const bajaA = registrarDestino({ tipos: [TIPO.HOJA], donde: 'Marta', pegar: () => {} });
    const bajaB = registrarDestino({ tipos: [TIPO.HOJA], donde: 'Luis', pegar: () => {} });

    expect(destinoVigente().donde).toBe('Luis');
    bajaB();
    bajaA();
  });

  it('avisa a quien mire cada vez que cambia dónde se pega', () => {
    // Es lo que tiene que remontar la mano: llegar a una pantalla que acepta lo
    // que llevas y que el verbo se encienda sin tocar nada.
    const mirando = vi.fn();
    const dejar = suscribirDestino(mirando);

    const baja = registrarDestino({ tipos: [TIPO.HOJA], donde: 'Acumulación', pegar: () => {} });
    expect(mirando).toHaveBeenCalledTimes(1);
    baja();
    expect(mirando).toHaveBeenCalledTimes(2);

    dejar();
  });

  it('deja el mismo objeto mientras no cambie nada', () => {
    // `useSyncExternalStore` llama a la lectura en cada render: devolver un
    // objeto nuevo cada vez es un bucle infinito de renders, no un detalle.
    const baja = registrarDestino({ tipos: [TIPO.HOJA], donde: 'Acumulación', pegar: () => {} });

    expect(destinoVigente()).toBe(destinoVigente());
    baja();
  });

  it('el verbo de pegar es el de la pantalla, y le llega la pieza', () => {
    const puesto = [];
    const baja = registrarDestino({
      tipos: [TIPO.COMIDA],
      donde: 'el menú de entreno',
      pegar: (pieza) => puesto.push(pieza.titulo),
    });

    destinoVigente().pegar({ titulo: 'Desayuno' });
    expect(puesto).toEqual(['Desayuno']);
    baja();
  });
});

/*
  La forma de una hoja copiada. Se prueba porque hay TRES puertas que la
  producen —el ⧉ de Entreno, traer un día de otro cliente y traer un fichero— y
  una sola que la lee: `pegarHoja` busca `carga.dayName`, y una puerta que se
  olvide de esa clave bautiza «Hoja» lo que pegue. Ya pasó una vez con el cajón.
*/
describe('una hoja hecha pieza', () => {
  it('lleva el nombre donde lo busca quien pega, y dice de dónde salió', () => {
    const pieza = piezaDeHoja({
      dayName: 'Lower A',
      exercises: [{ name: 'Sentadilla' }, { name: 'Peso muerto' }],
      cliente: 'Marta',
      donde: 'Acumulación',
    });

    expect(pieza.tipo).toBe(TIPO.HOJA);
    expect(pieza.titulo).toBe('Lower A');
    expect(pieza.carga.dayName).toBe('Lower A');
    expect(pieza.detalle).toBe('2 ejercicios');
    expect(pieza.origen).toEqual({ cliente: 'Marta', donde: 'Acumulación' });
  });

  it('sin cliente —viene de un fichero— y con un solo ejercicio, en singular', () => {
    const pieza = piezaDeHoja({ dayName: 'Día 1', exercises: [{ name: 'Remo' }], donde: 'de un fichero' });
    expect(pieza.detalle).toBe('1 ejercicio');
    expect(pieza.origen).toEqual({ cliente: null, donde: 'de un fichero' });
  });
});

/*
  Y lo que viaja mientras se arrastra. Vive en el módulo y no en el
  `dataTransfer` porque durante el `dragover` el navegador no deja leer lo que
  se lleva —solo los tipos MIME—, así que una zona no podría contestar si acepta
  esto sin soltarlo primero. Ver `useZonasDeSoltar`.
*/
describe('la pieza en vuelo', () => {
  it('se coge y se suelta, y en reposo no hay ninguna', () => {
    expect(piezaEnVuelo()).toBe(null);

    const pieza = copiar(unaHoja('Push A'));
    arrastrarPieza(pieza);
    expect(piezaEnVuelo()?.titulo).toBe('Push A');

    soltarPieza();
    expect(piezaEnVuelo()).toBe(null);
  });

  it('avisa a quien mira, y soltar dos veces no vuelve a avisar', () => {
    const mirando = vi.fn();
    const dejar = suscribirVuelo(mirando);

    arrastrarPieza(copiar(unaHoja('Pull A')));
    expect(mirando).toHaveBeenCalledTimes(1);
    soltarPieza();
    expect(mirando).toHaveBeenCalledTimes(2);
    /* Sin nada en vuelo, soltar no es un cambio: un render de más por cada
       `dragend` que llega después del `drop` sí lo sería. */
    soltarPieza();
    expect(mirando).toHaveBeenCalledTimes(2);

    dejar();
  });
});
