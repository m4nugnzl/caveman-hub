/**
 * EL CAJÓN: el material que el entrenador guarda con nombre.
 *
 * ══ Por qué hay un solo módulo y no uno por forma ══════════════════════════
 *
 * Había dos —`pieces.js` para los días y `platos.js` para las raciones— y los
 * dos decían lo mismo con otras palabras: una lista de cosas con `id`, `name`,
 * `savedAt` y algo dentro, un tope, un resumen de una línea y un desempate de
 * nombres. `PlantillasPanel` pagaba esa duplicidad once veces, con un ternario
 * `enDias ? … : …` por cabecera, columna, vacío, resumen y aviso.
 *
 * Con esa forma, añadir los BLOQUES —lo que el dueño pedía y lo único caro que
 * el entrenador no podía guardar— no era añadir un tramo: era un tercer módulo
 * casi idéntico y once ternarios de tres ramas. Ver
 * `docs/replanteamiento-lo-guardado.md`.
 *
 * Aquí hay una sola pieza guardada y una tabla que dice qué cambia de una forma
 * a otra. La cuarta forma que venga es una entrada de `CAJONES`.
 *
 * ══ La forma, y por qué es la del portapapeles ═════════════════════════════
 *
 *     { id, kind, name, savedAt, carga }
 *
 * `kind` es uno de `TIPO` —el vocabulario del portapapeles, no un segundo juego
 * de nombres— y `carga` es EXACTAMENTE lo que viaja en la bandeja, ya limpio.
 * De ahí sale la tesis del replanteamiento: **una plantilla es una pieza del
 * portapapeles con nombre y sin caducidad**, y por eso guardar es quedarse la
 * carga y poner es devolverla a la mano.
 *
 * ── Y por eso el cajón no sabe poner ───────────────────────────────────────
 * No hay aquí ni una función que coloque nada en un cliente. `/plantillas`
 * copia al portapapeles y la mano ya sabe dónde cae cada forma, porque cada
 * pantalla se registra como destino (`lib/portapapeles`, `registrarDestino`).
 * Añadir una forma cuesta tres cosas —cómo se limpia, cómo se resume y qué se
 * ve al abrirla— y ninguna ruta nueva.
 *
 * ══ Las dos leyes que se conservan ═════════════════════════════════════════
 *
 *   · **Ids nuevos al guardar y al poner.** Dos clientes no pueden acabar
 *     compartiendo el id de un ejercicio, o comparten historial. Lo hacen
 *     `cloneExerciseAsTemplate` al entrar y `planDeLaPieza` al salir.
 *   · **Poner despliega, no enlaza.** Editar la plantilla después no toca lo
 *     que ya salió de ella. Es como se comporta el resto del producto.
 *
 * ══ Dónde vive ═════════════════════════════════════════════════════════════
 *
 * En la tabla `coach_templates` del EQUIPO (migración 0112), como las
 * bibliotecas de ejercicios y alimentos desde la 0006, y no en
 * `profiles.preferences`: esa columna se lee entera al arrancar y se reescribe
 * entera en cada guardado de sección, y un bloque realista son 7,6 KB.
 */

import { TIPO } from '@/lib/portapapeles';
import { intentLabel } from './blocks';
import { MAX_PIECES, freeSheetName } from './pieces';
import { MAX_PLATOS, comoMaterial, freePlatoName, platoKcals } from './platos';
import { cloneExerciseAsTemplate } from './training';

/** Veinte programas ya son una biblioteca; cien son un archivo sin dueño. */
export const MAX_BLOQUES = 20;

const cuenta = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

const hojasDe = (carga) => (Array.isArray(carga?.sessions) ? carga.sessions : []);
const ejerciciosDe = (carga) => (Array.isArray(carga?.exercises) ? carga.exercises : []);
const alimentosDe = (carga) => (Array.isArray(carga?.foods) ? carga.foods : []);

/**
 * QUÉ CAMBIA DE UNA FORMA A OTRA. Todo lo demás es común.
 *
 * @property tramo     Cómo se llama su tramo en `/plantillas`, y la cifra que
 *                     lo acompaña sale de contar sus filas.
 * @property columna   La cabecera de la primera columna de la tabla.
 * @property guardado  «Guardada» o «Guardado». El género de la forma se dice
 *                     una vez aquí en vez de en cinco ternarios.
 * @property queEs     Cómo se la nombra al renombrarla: «el nombre de la
 *                     plantilla». Con artículo, que es donde vuelve a salir el
 *                     género.
 * @property pie       Dónde se pone, dicho debajo de la tabla. `/plantillas`
 *                     exhibe y no coloca, así que la pantalla tiene que decir
 *                     adónde ir con lo que se está mirando.
 * @property alaMano   En qué clave de la carga viaja el NOMBRE cuando la
 *                     plantilla vuelve al portapapeles, o `null` si esa forma
 *                     no vuelve. Un bloque se bautiza por `name` y una hoja por
 *                     `dayName` —lo leen `planDeLaPieza` y `pegarHoja`—, y sin
 *                     esa clave lo pegado aterriza llamándose «Hoja».
 * @property tope      Cuántas caben. Distinto por forma porque el peso lo es.
 * @property libre     Cómo se desempata un nombre que ya existe en el cajón.
 * @property limpiar   De la carga del portapapeles a lo que se guarda: fuera
 *                     todo lo registrado y todo lo que era de una persona.
 * @property vale      Si hay algo que guardar. Un bloque sin hojas o un plato
 *                     sin alimentos se rechazan al guardar, no al leer.
 * @property resumen   La línea de «qué lleva», que es también lo que se pulsa
 *                     para abrirlo.
 * @property lineas    Lo que se ve al abrirlo: `{ clave, nombre, detalle }`.
 *                     Los platos no la traen — enseñan sus macros, y eso es una
 *                     tabla propia (`PlatoDentro`).
 * @property vacio     Qué se lee cuando no hay ninguno, y dónde se guarda el
 *                     primero. Un vacío es una invitación, no un aviso.
 * @property alBorrar   Qué pasa con lo que ya está puesto. Siempre nada: poner
 *                     despliega y no enlaza, y hay que decirlo.
 */
export const CAJONES = {
  [TIPO.BLOQUE]: {
    tramo: 'Bloques',
    columna: 'Bloque',
    guardado: 'Guardado',
    queEs: 'el bloque',
    pie: 'Se ponen desde la lista de bloques de cualquier cliente, o desde su «+ bloque».',
    alaMano: 'name',
    tope: MAX_BLOQUES,
    libre: freeSheetName,
    /* Las tres características —a qué juega, cuánto se previó y qué se
       persigue— son lo que hace de esto una ESTRUCTURA y no un montón de hojas
       con nombre. `startBlockWithPlan` las acepta desde siempre y los tres
       caminos por los que un bloque salía de un cliente las tiraban. */
    limpiar: (carga) => ({
      sessions: hojasDe(carga).map((h) => ({
        dayName: h.dayName,
        exercises: (h.exercises || []).map(cloneExerciseAsTemplate),
      })),
      /* Vacío es `null` y no `[]`: al ponerlo, una lista vacía le BORRARÍA el
         calentamiento al destinatario. Guardar el bloque de quien no calienta no
         es una orden de que el otro deje de hacerlo. */
      mobilityDrills: carga?.mobilityDrills?.length ? carga.mobilityDrills : null,
      intent: carga?.intent ?? null,
      plannedWeeks: carga?.plannedWeeks ?? null,
      note: carga?.note ?? null,
    }),
    vale: (carga) => hojasDe(carga).length > 0,
    /* La intención delante del recuento: es lo que distingue dos bloques del
       mismo tamaño cuando el cajón lleva doce. */
    resumen: (carga) =>
      [
        intentLabel(carga?.intent),
        cuenta(hojasDe(carga).length, 'hoja', 'hojas'),
        carga?.plannedWeeks ? cuenta(carga.plannedWeeks, 'semana prevista', 'semanas previstas') : null,
      ]
        .filter(Boolean)
        .join(' · '),
    lineas: (carga) =>
      hojasDe(carga).map((h, i) => ({
        clave: `${h.dayName}-${i}`,
        nombre: h.dayName,
        detalle: cuenta((h.exercises || []).length, 'ejercicio', 'ejercicios'),
      })),
    vacio: {
      titulo: 'Todavía no has guardado ningún bloque',
      mensaje:
        'Cuando un bloque te funcione, guárdalo desde su fila en la lista de bloques: se queda aquí con sus hojas y sus semanas, y lo puedes poner en cualquier cliente.',
    },
    alBorrar:
      'El bloque desaparece de tu cajón. Los clientes que lo tienen puesto no se tocan: su programa es una copia.',
  },

  [TIPO.HOJA]: {
    tramo: 'Días',
    columna: 'Plantilla',
    guardado: 'Guardada',
    queEs: 'la plantilla',
    pie: 'Se ponen desde el cajón del bloque, en cualquier cliente.',
    alaMano: 'dayName',
    tope: MAX_PIECES,
    libre: freeSheetName,
    limpiar: (carga) => ({ exercises: ejerciciosDe(carga).map(cloneExerciseAsTemplate) }),
    vale: (carga) => ejerciciosDe(carga).length > 0,
    resumen: (carga) => {
      const ejercicios = ejerciciosDe(carga);
      const series = ejercicios.reduce((n, ex) => n + (ex.sets || []).length, 0);
      return `${cuenta(ejercicios.length, 'ejercicio', 'ejercicios')} · ${series} series`;
    },
    lineas: (carga) =>
      ejerciciosDe(carga).map((ex, i) => ({
        clave: ex.id || `${ex.name}-${i}`,
        nombre: ex.name,
        detalle: `${(ex.sets || []).length} series`,
      })),
    vacio: {
      titulo: 'Todavía no has guardado ningún día',
      mensaje:
        'Cuando un día te quede como quieres, guárdalo desde el cajón del bloque: se queda aquí con su nombre y lo puedes poner en cualquier cliente.',
    },
    alBorrar: 'La plantilla desaparece de tu cajón. Los clientes que ya la tienen puesta no se tocan.',
  },

  [TIPO.PLATO]: {
    tramo: 'Platos',
    columna: 'Plato',
    guardado: 'Guardado',
    queEs: 'el plato',
    pie: 'Se ponen desde el buscador de una comida, o pegándolos como una alternativa más.',
    /*
      ── Y SÍ VUELVE A LA MANO, DESDE QUE HAY UNA FORMA QUE LO DICE ─────────
      Aquí ponía `null`, y su razón era buena mientras la pieza pequeña de la
      dieta fuera la COMIDA: soltar una ración donde va una comida es pegar
      otra cosa. Lo que faltaba no era el gesto, era el nombre —`TIPO.PLATO`—,
      y con él la mano lleva la ración y el destino sabe que es una ración.

      La clave es `name` y no otra: la carga que sale de aquí y la que sale de
      una alternativa copiada tienen que ser la MISMA, o el plato pegado desde
      la vitrina saldría sin bautizar. Es la avería del `dayName` de la hoja,
      que ya se pagó una vez.
    */
    alaMano: 'name',
    tope: MAX_PLATOS,
    libre: freePlatoName,
    /* Una ración y nada más: los alimentos de UNA alternativa. Aquí había un
       repliegue a `options[0]` para poder guardar la comida entera que se
       llevara en la mano, y era el cajón eligiendo alternativa por su cuenta.
       Con la forma propia, quien elige cuál es quien copia. */
    limpiar: (carga) => ({
      foods: alimentosDe(carga)
        .filter((f) => f && String(f.name || '').trim())
        .map(comoMaterial),
    }),
    vale: (carga) => alimentosDe(carga).length > 0,
    resumen: (carga) =>
      `${cuenta(alimentosDe(carga).length, 'alimento', 'alimentos')} · ${platoKcals({ foods: alimentosDe(carga) })} kcal`,
    /* Sin `lineas`: un plato enseña sus macros, y eso es una tabla y no una
       lista. La pantalla lo resuelve con su propio componente. */
    vacio: {
      titulo: 'Todavía no has guardado ningún plato',
      mensaje:
        'Cuando una comida te quede como quieres, guárdala desde la hoja de la dieta: se queda aquí con su nombre y la puedes poner en cualquier cliente, cuadrada a su objetivo.',
    },
    alBorrar:
      'El plato desaparece de tu vitrina. Las dietas que ya lo llevan no se tocan: sus alimentos están copiados dentro.',
  },
};

/** Las formas que tienen cajón, en el orden en que se enseñan. */
export const FORMAS = [TIPO.BLOQUE, TIPO.HOJA, TIPO.PLATO];

/**
 * ¿Esta forma se puede guardar?
 *
 * Un ejercicio no: ya tiene biblioteca propia y editable, la Librería, y un
 * cajón de ejercicios sería una segunda lista con otra verdad. La dieta entera
 * tampoco: es el plan de una persona, y es la única pieza que sustituye en vez
 * de añadir. Los días de dieta, cuando su forma pare de moverse (0111).
 */
export const tieneCajon = (kind) => Boolean(CAJONES[kind]);

/** Lo guardado de una forma, saneado: con id, nombre y algo dentro. */
export const guardadosDe = (cajon, kind) =>
  (Array.isArray(cajon) ? cajon : []).filter(
    (item) => item && item.id && item.kind === kind && String(item.name || '').trim() && item.carga
  );

/**
 * Lo guardado de una forma, con la forma PLANA de siempre:
 * `{ id, name, savedAt, exercises }` para un día, `{ …, foods }` para un plato.
 *
 * Existe para que las seis pantallas que ya leían `piecesOf` y `platosOf` no
 * tengan que cambiar de vocabulario porque haya cambiado el almacén. Lo que se
 * replantea es dónde vive el cajón y cómo se enseña, no cómo se pone una pieza
 * en un bloque, que funciona.
 */
export const comoLista = (cajon, kind) =>
  guardadosDe(cajon, kind).map(({ id, name, savedAt, carga }) => ({ id, name, savedAt, ...carga }));

/**
 * Una pieza nueva del cajón, ya limpia. El `id` no se pone aquí: lo pone la
 * base al insertar la fila, que es quien no puede repetirlo.
 *
 * @returns La pieza, o `null` si no había nada que guardar.
 */
export const construir = ({ kind, name, carga }) => {
  const cajon = CAJONES[kind];
  if (!cajon || !cajon.vale(carga)) return null;
  return { kind, name: String(name || '').trim(), carga: cajon.limpiar(carga) };
};

/** «4 hojas · 24 ejercicios», para la fila. Vacío si la forma no tiene cajón. */
export const resumenDe = (item) => CAJONES[item?.kind]?.resumen(item?.carga) || '';

/** Lo que se ve al abrir la fila, o `null` si esa forma se enseña de otro modo. */
export const lineasDe = (item) => CAJONES[item?.kind]?.lineas?.(item?.carga) || null;

/**
 * De vuelta a la mano: la pieza del portapapeles que sale de una plantilla.
 *
 * El `origen` dice «tus plantillas» donde iría el cliente, que es la verdad y
 * hace además dos cosas útiles: la bandeja distingue tres pantallas después un
 * «Lower A» guardado de uno que se acaba de copiar de una persona, y «ponerlo
 * en varios» —que deja fuera al cliente de origen (`MandarLaPieza`)— no deja
 * fuera a nadie, porque una plantilla no es de nadie.
 *
 * @returns La pieza, o `null` si esa forma no vuelve a la mano (ver `alaMano`).
 */
export const comoPiezaDelPortapapeles = (item) => {
  const clave = CAJONES[item?.kind]?.alaMano;
  if (!clave) return null;
  return {
    tipo: item.kind,
    titulo: item.name,
    detalle: resumenDe(item),
    origen: { cliente: 'tus plantillas', donde: null },
    /* El nombre entra también en la carga, en la clave que esa forma usa para
       bautizarse: `planDeLaPieza` lee `name` para el bloque que aterriza y
       `pegarHoja` lee `dayName` para la hoja. Sin eso, lo pegado sale llamándose
       «Hoja» y el bloque no se pega. */
    carga: { ...item.carga, [clave]: item.name },
  };
};
