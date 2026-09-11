import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

/**
 * EL PORTAPAPELES DEL PRODUCTO: lo copiado, hasta que se pegue.
 *
 * ══ Por qué existe ══════════════════════════════════════════════════════════
 *
 * «El copiar quizás sería mejor plantearlo como lo hace Efort: tener un
 * portapapeles o algo así útil como herramienta para poder andar copiando y
 * pegando cosas, que sea algo versátil realmente.»
 *
 * Lo que había eran CUATRO verbos que hacían copiar-y-pegar-en-el-sitio sin que
 * nunca hubiera nada copiado:
 *
 *   · «Duplicar hoja»              — copia una hoja al lado de sí misma.
 *   · «Duplicar microciclo»        — copia un microciclo al final del bloque.
 *   · «Traer de otro cliente»      — un panel que copia un programa entero.
 *   · «Traer de un fichero»        — un diálogo que pega texto pegado a mano.
 *
 * Cuatro dibujos, cuatro sitios y una limitación común: el origen y el destino
 * tenían que decidirse en el MISMO gesto. Copiar el jueves de Marta al martes
 * de Luis no se podía hacer, no porque faltara código, sino porque no existía
 * el paso intermedio —«esto está copiado»— donde cabe cambiar de cliente, de
 * bloque o de pantalla antes de soltarlo.
 *
 * Este módulo es ese paso intermedio, y nada más: guarda piezas con su etiqueta
 * y su carga. QUÉ significa pegar una pieza es de cada pantalla, porque pegar
 * una hoja en un bloque y pegar una comida en un día son dos operaciones de
 * dominio distintas que no tienen por qué conocerse entre sí.
 *
 * ══ Por qué es un almacén y no un contexto ══════════════════════════════════
 *
 * Porque copiar y pegar ocurren en ramas del árbol que no se conocen: se copia
 * una hoja en Entreno de Marta y se pega en Entreno de Luis, dos montajes
 * distintos con el cliente activo cambiado en medio. Un proveedor tendría que
 * envolver por encima de la navegación entera para que el valor sobreviviera, y
 * aun así se perdería al recargar. Fuera de React —una sola verdad en
 * `localStorage`, leída con `useSyncExternalStore`— sobrevive a las dos cosas y
 * lo pide quien lo necesite, esté donde esté. Es el patrón de
 * `lib/barraPlegada`.
 *
 * ══ Qué NO es ══════════════════════════════════════════════════════════════
 *
 * · NO es el portapapeles del sistema. No toca `navigator.clipboard`: lo que se
 *   copia aquí son objetos del dominio con sus ids, no texto. Copiar una hoja
 *   no debe pisarle a nadie lo que tuviera copiado en el sistema operativo.
 * · NO viaja al servidor. Es del APARATO, como el pliegue de la barra y el
 *   tema: lo que estás copiando ahora mismo no es un dato de la cuenta, y
 *   sincronizarlo entre el portátil y el despacho sería ruido, no ayuda.
 * · NO guarda referencias. La carga es una COPIA ya normalizada —sin ids de
 *   registro, sin sesiones, sin fechas—, así que pegarla no puede cruzar el
 *   historial de dos personas ni romperse porque el original se haya borrado.
 *   Quien copia es el responsable de mandar la carga limpia; ver
 *   `cloneExerciseAsTemplate` en `domain/training`, que es el que sabe hacerlo
 *   para un ejercicio.
 */

const CLAVE = 'caveman-portapapeles';

/* Cuántas piezas se recuerdan. Doce y no tres porque el uso real es «copio los
   cuatro días de la semana y los voy pegando», y no cabe pedirle a nadie que
   vuelva a por cada uno. Y doce y no cien porque una bandeja que no se abarca
   de una mirada deja de ser un portapapeles y pasa a ser un archivo, que ya
   existe y se llama plantillas. */
const TOPE = 12;

/* El techo de lo que se guarda, en caracteres del JSON. `localStorage` da unos
   5 MB por dominio y este no es el único que los usa: la plantilla de alta, los
   clientes recientes y las preferencias del aparato viven al lado. Un bloque de
   ocho hojas ronda los 40 KB, así que 1 MB da para la bandeja llena con mucho
   margen; pasado el tope se sueltan las piezas más viejas antes de guardar, que
   es exactamente lo que hace un portapapeles con historial. */
const TOPE_BYTES = 1_000_000;

/**
 * Las formas que se saben copiar. La pantalla que pega decide cuáles acepta.
 *
 * ── POR QUÉ NO HAY «MICROCICLO» ────────────────────────────────────────────
 * Lo pedía la lista original y no cabe en el modelo: desde que el plan vive en
 * el BLOQUE (ver `plan-del-bloque` y `planOfDay` en `domain/blocks`), un
 * microciclo ya no guarda qué se entrena —eso lo guardan las hojas del bloque—,
 * sino cuándo empieza esa semana, qué excepciones tiene y qué se registró en
 * ella. Copiarlo a otro cliente sería copiar el calendario y el historial de una
 * persona a otra, que no es lo que nadie quiere decir con «copia esta semana».
 *
 * Lo que sí se quiere decir tiene dos nombres y los dos existen: «otra semana
 * igual de este bloque» es el «+ microciclo», y «este entrenamiento en otro
 * sitio» es la HOJA, que es la que lleva el plan y la que sí viaja.
 */
export const TIPO = {
  EJERCICIO: 'ejercicio',
  HOJA: 'hoja',
  BLOQUE: 'bloque',
  COMIDA: 'comida',
  /*
    ── UNA RACIÓN, QUE ES LA PIEZA PEQUEÑA DE LA DIETA ──────────────────────
    Los alimentos de UNA alternativa de comida: lo que esta casa llama un PLATO
    desde que se pueden guardar con nombre (`domain/platos`).

    No es la comida y por eso es otra forma: una comida son varias raciones
    —sus alternativas—, con un nombre y un sitio en el día; un plato es una
    sola y no tiene sitio hasta que cae en una comida.

    Su falta se pagaba con un verbo aparte —«copiar la alternativa a otro
    día»—, que era lo único de la dieta que la mano no sabía hacer y que por
    eso solo llegaba a los días de ESTA persona. Ver `pegarPlato` en
    `NutritionModule`.
  */
  PLATO: 'plato',
  DIA_DIETA: 'dia-dieta',
  /* La dieta ENTERA, con todos sus días. Es la única pieza de nutrición que
     sustituye en vez de añadir, y por eso se pide y se avisa aparte. */
  DIETA: 'dieta',
};

/**
 * La forma de una HOJA copiada, en un solo sitio.
 *
 * ── Por qué existe ─────────────────────────────────────────────────────────
 * Porque hay TRES puertas que producen una hoja copiada —el ⧉ de la hoja y el
 * de su columna, traer un día de otro cliente y traer un fichero— y una sola
 * que la lee (`pegarHoja` en Entreno, que busca `carga.dayName`). Escrita tres
 * veces, basta que una se olvide de esa clave para que lo pegado salga
 * llamándose «Hoja», que es exactamente lo que ya pasó una vez con el cajón.
 *
 * No clona: quien copia es el responsable de mandar la carga limpia (ver la
 * cabecera de este archivo y `cloneExerciseAsTemplate`).
 *
 * @param cliente De quién es la hoja, o `null` si viene de fuera.
 * @param donde   Dónde estaba: el bloque, el fichero, la semana de aquel.
 */
export const piezaDeHoja = ({ dayName, exercises = [], cliente = null, donde = null }) => ({
  tipo: TIPO.HOJA,
  titulo: dayName,
  detalle: `${exercises.length} ${exercises.length === 1 ? 'ejercicio' : 'ejercicios'}`,
  origen: { cliente, donde },
  carga: { dayName, exercises },
});

/** Cómo se llama cada forma cuando hay que decirlo en una frase. */
export const NOMBRE_DE_TIPO = {
  [TIPO.EJERCICIO]: 'ejercicio',
  [TIPO.HOJA]: 'hoja',
  [TIPO.BLOQUE]: 'bloque',
  [TIPO.COMIDA]: 'comida',
  [TIPO.PLATO]: 'plato',
  [TIPO.DIA_DIETA]: 'día de dieta',
  [TIPO.DIETA]: 'dieta',
};

const leerGuardado = () => {
  try {
    const crudo = JSON.parse(localStorage.getItem(CLAVE) || '[]');
    if (!Array.isArray(crudo)) return [];
    /* Se filtra al leer y no solo al escribir: lo que hay guardado puede venir
       de una versión anterior del formato, y una pieza a medias reventaría la
       bandeja de todas las pantallas a la vez. */
    return crudo.filter((p) => p && typeof p.id === 'string' && typeof p.tipo === 'string' && p.carga !== undefined);
  } catch {
    /* Almacenamiento bloqueado (modo privado) o JSON corrupto. El portapapeles
       arranca vacío, que es su estado normal: no hay nada que avisar porque no
       se ha perdido nada que el usuario creyera guardado. */
    return [];
  }
};

/* El valor vivo, fuera del árbol: quien copia y quien pega no son parientes. */
let piezas = leerGuardado();
const oyentes = new Set();

const avisar = () => oyentes.forEach((f) => f());

const guardar = () => {
  try {
    let porGuardar = piezas;
    /* Las más nuevas primero, así que lo que se suelta al no caber son las de
       la cola, que son las viejas. */
    while (porGuardar.length > 0 && JSON.stringify(porGuardar).length > TOPE_BYTES) {
      porGuardar = porGuardar.slice(0, -1);
    }
    if (porGuardar.length !== piezas.length) piezas = porGuardar;
    localStorage.setItem(CLAVE, JSON.stringify(piezas));
  } catch {
    /* Sin almacenamiento el portapapeles sigue funcionando en esta pestaña y en
       esta sesión: solo se pierde al recargar. No es motivo para no dejar
       copiar, que es lo que se estaba haciendo. */
  }
};

const suscribir = (f) => {
  oyentes.add(f);
  return () => oyentes.delete(f);
};

const leer = () => piezas;

/* En servidor no hay portapapeles, y `useSyncExternalStore` exige una respuesta
   para el primer render. La misma referencia siempre: devolver `[]` nuevo cada
   vez es un bucle infinito de renders. */
const VACIO = [];
const leerEnServidor = () => VACIO;

/*
  ── OTRA PESTAÑA TAMBIÉN COPIA ─────────────────────────────────────────────
  Dos clientes abiertos en dos pestañas es el gesto normal de quien va a copiar
  algo de uno a otro. Sin esto, copiar en la pestaña A y pegar en la B obliga a
  recargar la B, que es justo el momento en que se abandona la herramienta.

  `storage` solo se dispara en las OTRAS pestañas, nunca en la que escribe, así
  que no hay eco ni bucle.
*/
/**
 * Vuelve a leer del almacén y avisa a quien mire.
 *
 * Está aparte del oyente —y exportada— porque es el ÚNICO camino por el que
 * entra en la bandeja algo que no ha escrito esta pestaña, y por tanto el único
 * que tiene que aguantar lo que haya guardado ahí: piezas de un formato
 * anterior, JSON a medias, o el almacén bloqueado. Metida dentro del
 * `addEventListener` no se podía probar en ninguna parte, porque en las pruebas
 * no hay `window` que dispare el evento.
 */
export const releer = () => {
  piezas = leerGuardado();
  avisar();
  return piezas;
};

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (evento) => {
    if (evento.key !== CLAVE) return;
    releer();
  });
}

const nuevoId = () => `pp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Guarda una pieza. La más reciente va siempre la primera.
 *
 * @param tipo    Una de `TIPO`.
 * @param titulo  Cómo se llama la cosa: «Lower A», «Press banca», «M4».
 * @param detalle Una línea de qué lleva dentro: «6 ejercicios», «4 series».
 * @param origen  `{ cliente, donde }` — de quién y de dónde salió. Es lo que
 *                hace útil la bandeja tres pantallas después: «Lower A» a secas
 *                no dice nada cuando hay dos.
 * @param carga   La copia ya limpia. Ver el comentario de cabecera.
 * @returns       La pieza guardada.
 */
export const copiar = ({ tipo, titulo, detalle = null, origen = null, carga }) => {
  const pieza = { id: nuevoId(), tipo, titulo, detalle, origen, carga, fecha: Date.now() };
  piezas = [pieza, ...piezas].slice(0, TOPE);
  guardar();
  avisar();
  return pieza;
};

/** Saca una pieza de la bandeja. Sin preguntar: no borra nada del programa. */
export const quitar = (id) => {
  piezas = piezas.filter((p) => p.id !== id);
  guardar();
  avisar();
};

/** Vacía la bandeja entera. */
export const vaciar = () => {
  piezas = [];
  guardar();
  avisar();
};

/**
 * Lo que hay copiado, lo más nuevo primero.
 *
 * @param tipos Si llega, solo las piezas de esos tipos — que es lo que pide
 *              cada sitio donde se pega: un bloque acepta hojas y microciclos,
 *              no comidas.
 */
export const usePortapapeles = (tipos = null) => {
  const todas = useSyncExternalStore(suscribir, leer, leerEnServidor);
  /* Sin `useMemo` a propósito: filtrar doce elementos no es un coste, y un memo
     con un array literal por dependencia se recalcula igual en cada render —solo
     que además engaña a quien lo lee. */
  if (!tipos) return todas;
  const lista = Array.isArray(tipos) ? tipos : [tipos];
  return todas.filter((p) => lista.includes(p.tipo));
};

/** Los verbos, estables entre renders para poder pasarlos como `onClick`. */
export const useVerbosDelPortapapeles = () => ({
  copiar: useCallback((pieza) => copiar(pieza), []),
  quitar: useCallback((id) => quitar(id), []),
  vaciar: useCallback(() => vaciar(), []),
});

/*
  ══ LOS DESTINOS: dónde cae lo que llevas ═══════════════════════════════════

  La bandeja no sabía pegar y estaba bien que no lo supiera: pegar una hoja en
  un bloque y pegar una comida en un día son dos operaciones de dominio que no
  tienen por qué conocerse. Pero de ahí se seguía que el portapapeles no
  ofreciera NUNCA un verbo, y eso es otra cosa: había siete sitios donde se
  puede pegar, repartidos por cinco pantallas, y para encontrarlos había que
  abrir el «+» de cada uno a ver si dentro estaba lo copiado.

  La salida no es que la bandeja adivine el destino: es que la PANTALLA lo
  presente. Cada sitio donde cae algo se registra aquí —qué acepta, cómo se
  llama y qué hacer con la pieza— y la mano enciende el verbo con su nombre:
  «Pegar «Sentadilla» en Lower A». Sin nadie registrado, la mano se calla, que
  es la mitad del trabajo.

  ── Por qué una PILA y por qué con prioridad ────────────────────────────────
  Porque dos sitios pueden estar montados a la vez y manda el más pequeño: con
  una hoja abierta dentro de un bloque, lo que cae es un ejercicio en la hoja,
  no otra hoja en el bloque. El orden de montaje no sirve para decidirlo —los
  efectos de un hijo corren ANTES que los del padre, así que el contenedor se
  registraría el último y ganaría—, de modo que la especificidad se dice y no
  se deduce: gana la `prioridad` más alta y, a igualdad, el último en llegar.
*/

const destinos = [];

/* El vigente se calcula al cambiar la pila y se guarda: `useSyncExternalStore`
   llama a su lectura en cada render y devolver un objeto nuevo cada vez es un
   bucle infinito. */
let vigente = null;
const ojos = new Set();

const recalcularDestino = () => {
  let mejor = null;
  destinos.forEach((d) => {
    if (!mejor || d.prioridad >= mejor.prioridad) mejor = d;
  });
  vigente = mejor;
  ojos.forEach((f) => f());
};

/**
 * Declara que aquí cae algo. Devuelve cómo dejar de ofrecerlo.
 *
 * @param tipos     Qué formas acepta este sitio (de `TIPO`).
 * @param donde     Cómo se llama, para poder decirlo: «Lower A», «Acumulación».
 * @param verbo     «Pegar» por defecto. Los cajones dicen «Guardar»: escribir en
 *                  el trabajo de alguien y guardar en tu biblioteca no son la
 *                  misma acción y no pueden llamarse igual.
 * @param prioridad Cuánto de específico es. La hoja abierta gana al bloque.
 * @param pegar     Qué hacer con la pieza. Es del dominio de la pantalla.
 */
export const registrarDestino = ({ tipos, donde, verbo = 'Pegar', prioridad = 0, pegar }) => {
  const entrada = { tipos, donde, verbo, prioridad, pegar };
  destinos.push(entrada);
  recalcularDestino();
  return () => {
    const i = destinos.indexOf(entrada);
    if (i >= 0) destinos.splice(i, 1);
    recalcularDestino();
  };
};

/*
  ══ ARRASTRAR LO QUE LLEVAS ═════════════════════════════════════════════════

  El verbo de la mano pega de un clic, y eso basta cuando el sitio es UNO: con
  el bloque delante, una hoja copiada solo puede caer en ese bloque. Pero hay
  dos sitios donde el sitio no es uno y hay que elegir cuál —la columna de la
  rejilla del bloque y la comida de la dieta—, y ahí un clic no puede decirlo:
  la pantalla tiene seis columnas y la mano no sabe a cuál apuntas.

  La ley que sale de eso, y es la que decide dónde hay zona de soltar y dónde
  no: **se arrastra cuando hay que elegir cuál; se pulsa cuando el sitio es
  uno.** Arrastrar no es una segunda manera de hacer lo mismo —eso sería un
  gesto de más—, es la manera de decir dónde.

  ── Por qué la pieza viaja por aquí y no en el `dataTransfer` ───────────────
  Porque durante el `dragover` el navegador NO deja leer lo que se lleva —solo
  los tipos MIME—, así que una zona no podría saber si acepta esto sin soltarlo
  primero, que es justo lo que hay que contestar antes. El almacén sabe qué
  viaja desde el primer píxel.

  Y en táctil no existe `draggable` (ver `useArrastreOrden`): allí no se ofrece
  el gesto, y todo lo que se puede hacer se sigue haciendo con el verbo.
*/
let enVuelo = null;
const vuelos = new Set();

const avisarVuelo = () => vuelos.forEach((f) => f());

/** Empieza a arrastrar una pieza desde la mano. */
export const arrastrarPieza = (pieza) => {
  enVuelo = pieza;
  avisarVuelo();
};

/** Y se acabó el arrastre, se haya soltado en algún sitio o no. */
export const soltarPieza = () => {
  if (!enVuelo) return;
  enVuelo = null;
  avisarVuelo();
};

/* Exportada por lo mismo que `suscribirDestino`: es la otra mitad del contrato
   —quien mira se entera de que algo viaja— y la única puerta por la que se
   puede comprobar fuera de React. */
export const suscribirVuelo = (f) => {
  vuelos.add(f);
  return () => vuelos.delete(f);
};
const leerVuelo = () => enVuelo;
/** Lo que viaja ahora mismo, fuera de React. Como `destinoVigente`. */
export const piezaEnVuelo = () => enVuelo;
const sinVuelo = () => null;

/** La pieza que se está arrastrando ahora mismo, o `null`. */
export const usePiezaEnVuelo = () => useSyncExternalStore(suscribirVuelo, leerVuelo, sinVuelo);

/**
 * Las zonas donde puede caer lo que se arrastra, dentro de una pantalla.
 *
 * Se llama UNA vez por pantalla y `zona(id, pegar)` se pide por elemento: los
 * manejadores solo existen mientras viaja algo que ese sitio acepta, así que en
 * reposo no hay ni un oyente de más — es la ley del reposo aplicada al arrastre.
 *
 *   const soltar = useZonasDeSoltar(TIPO.HOJA);
 *   <section className={soltar.sobre === hoja ? 'is-drop-target' : ''}
 *            {...soltar.zona(hoja, (pieza) => sustituir(pieza, hoja))} />
 *
 * @param tipos Qué formas acepta esta pantalla al soltarlas.
 */
export const useZonasDeSoltar = (tipos) => {
  const pieza = usePiezaEnVuelo();
  const [sobre, setSobre] = useState(null);
  const lista = Array.isArray(tipos) ? tipos : [tipos];
  const cabe = Boolean(pieza && lista.includes(pieza.tipo));

  const zona = (id, pegar) => {
    if (!cabe) return {};
    return {
      onDragOver: (evento) => {
        /* Sin esto el navegador no deja soltar: `preventDefault` en dragover ES
           el «aquí sí». */
        evento.preventDefault();
        evento.dataTransfer.dropEffect = 'copy';
        setSobre((s) => (s === id ? s : id));
      },
      onDragLeave: (evento) => {
        /* `dragleave` sube desde los hijos, así que cruzar por dentro de la
           columna —del nombre a la tabla— lo dispara sin haberse ido a ningún
           sitio: sin esta guarda la marca parpadea mientras se busca dónde
           soltar, que es justo cuando hay que verla quieta. */
        if (evento.currentTarget?.contains?.(evento.relatedTarget)) return;
        setSobre((s) => (s === id ? null : s));
      },
      onDrop: (evento) => {
        evento.preventDefault();
        setSobre(null);
        soltarPieza();
        pegar(pieza);
      },
    };
  };

  return { pieza: cabe ? pieza : null, sobre: cabe ? sobre : null, zona };
};

/* Exportada porque es la otra mitad del contrato de la mano: sin este aviso, el
   verbo no se enciende al llegar a la pantalla donde cabe lo que llevas. */
export const suscribirDestino = (f) => {
  ojos.add(f);
  return () => ojos.delete(f);
};
/** Dónde cae ahora mismo lo copiado, o `null`. Fuera de React. */
export const destinoVigente = () => vigente;
/* En servidor no hay pantallas montadas: no hay dónde pegar. */
const sinDestino = () => null;

/** Dónde cae ahora mismo lo copiado, o `null`. Lo mira la mano. */
export const useDestinoVigente = () => useSyncExternalStore(suscribirDestino, destinoVigente, sinDestino);

/**
 * Lo que monta la PANTALLA: «aquí cae esto». Pásale `null` cuando no.
 *
 * ── Por qué la firma y no el objeto ─────────────────────────────────────────
 * El destino se rehace en cada render —lleva dentro una función que cierra
 * sobre el estado de ahora—, así que como dependencia de efecto haría un
 * registro y una baja por pulsación de tecla. Lo que de verdad cambia es lo que
 * se puede DECIR de él (qué acepta, cómo se llama, cuánto manda), y eso se
 * compara por valor; el `pegar` se lee de un ref y por tanto es siempre el del
 * último render, sin necesidad de volver a registrarse.
 */
export const useDestino = (destino) => {
  const vivo = useRef(destino);
  vivo.current = destino;
  const firma = destino
    ? JSON.stringify([destino.tipos, destino.donde, destino.verbo || 'Pegar', destino.prioridad || 0])
    : null;
  useEffect(() => {
    if (!firma) return undefined;
    const [tipos, donde, verbo, prioridad] = JSON.parse(firma);
    return registrarDestino({
      tipos,
      donde,
      verbo,
      prioridad,
      pegar: (pieza) => vivo.current?.pegar?.(pieza),
    });
  }, [firma]);
};
