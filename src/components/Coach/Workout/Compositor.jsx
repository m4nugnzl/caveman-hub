import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronRight,
  ClipboardPaste,
  Copy,
  FilePlus2,
  FileUp,
  FolderOpen,
  Layers,
  Library,
  Plus,
  Redo2,
  Undo2,
} from 'lucide-react';

import { useApp } from '@/context/AppContext';
import {
  BLOCK_INTENTS,
  MAX_BLOCK_NOTE,
  blocksOf,
  inheritedSessions,
  intentLabel,
  lastWeekNumber,
  pautaHeredada,
  planExerciseView,
  planSessionView,
  sessionDiff,
  structureOfBlock,
  volumeByGroup,
} from '@/domain/blocks';
import { mergeCatalog } from '@/domain/catalog';
import { comoLista } from '@/domain/cajon';
import { clientProtocol, isModuleOn } from '@/domain/protocol';
import {
  buildExercise,
  cloneExerciseAsTemplate,
  dayHasOwnDrills,
  drillsForDay,
  tecnicaOf,
  unitLabel,
} from '@/domain/training';
import { guardarBorrador, leerBorrador, olvidarBorrador } from '@/lib/borradorDelBloque';
import { clampInt } from '@/lib/num';
import { useAtajoDeDeshacer } from '@/lib/useAtajoDeDeshacer';
import { usePilaDeCambios } from '@/lib/usePilaDeCambios';
import { TIPO, copiar as copiarAlPortapapeles, piezaDeHoja, usePortapapeles } from '@/lib/portapapeles';
import { clientPath } from '@/routes';
import { EmptyState, RenombrarEnSitio } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/ToastProvider';
import { Modal } from '@/components/ui/Modal';
import { Destino } from '@/components/ui/Portapapeles';
import { BotonMas } from '@/components/ui/BotonMas';
import { useGuardarEnPlantillas } from '@/components/Coach/guardarEnPlantillas';
import { ConditionsNote } from '@/components/conditions/ConditionsNote';
import { BibliotecaDelCliente } from './BibliotecaDelCliente';
import { ConjuntoDelBloque } from './ConjuntoDelBloque';
import { EscribirHoja } from './EscribirHoja';
import { TarjetaVolumen } from './LecturasDelBloque';
import { VolumenDeLaHoja } from './VolumenDeLaHoja';
import { VolumenPopup } from './VolumenPopup';
import { WarmupEditor } from './WarmupBlock';

/**
 * EL COMPOSITOR: componer es un sitio, no un momento.
 *
 * ══ El diagnóstico ═════════════════════════════════════════════════════════
 * Entreno hacía TRES trabajos en una superficie —componer, consultar y leer— y
 * el mobiliario de componer estaba puesto encima de los otros dos. El material
 * —su maquinaria, sus condicionantes, su historial, tus piezas— sirve para
 * ACORDARSE MIENTRAS DECIDES; después de decidido, estorba. Así que se muda
 * entero aquí, y aquí es el único sitio donde aparece.
 *
 * ══ EL REPLANTEAMIENTO DEL 11 DE SEPTIEMBRE ════════════════════════════════
 *
 * «El "a qué juega" no me gusta nada, y tampoco la interfaz. Las hojas se ven
 * feas y encima de arriba a abajo. Tampoco me gusta la flecha esa. Tampoco se
 * pueden renombrar hojas desde esa página. Tampoco se puede copiar de una
 * hoja. Está fatal planteada. Y además perdemos la capacidad de ver el bloque
 * entero para plantear bien la rutina.»
 *
 * Seis quejas y UNA avería: esta pantalla se había inventado una gramática
 * paralela para algo que la casa ya tenía resuelto. Un carril de pastillas y
 * `EscribirHoja` —una hoja cada vez— eran un SEGUNDO editor de bloque, peor
 * que el primero: sin renombrar, sin copiar, sin arrastrar, sin volumen por
 * hoja y sin la vista del conjunto, que es justo lo que se necesita para
 * plantear. Y la cabecera llevaba dos chapas y una flecha de volver que el
 * dueño ya había tumbado en Entreno («la flecha hacia atrás no me gusta, me
 * gusta más estilo deslizar»).
 *
 * Así que no se pule: se tira lo paralelo y se usa lo que hay.
 *
 *   ┌ paso 1 ─ QUÉ BLOQUE ES ────────────────────────────────────────────┐
 *   │ el nombre, a qué juega, cuánto dura y qué se persigue — y la puerta │
 *   │ de la que parte, que es además el gesto que avanza                  │
 *   └─────────────────────────────────────────────────────────────────────┘
 *   ┌ paso 2 ─ SUS HOJAS ────────────────────────────────────────────────┐
 *   │ Bloques › Bloque 2                          [Cancelar] [Abrirlo]    │
 *   │ Adaptación · 4 microciclos · «…»  Cambiar   Nace de «Bloque 1»      │
 *   │ la REJILLA del bloque (`ConjuntoDelBloque`), entera y editable       │
 *   └─────────────────────────────────────────────────────────────────────┘
 *
 * · La cabecera es el CAMINO, con la gramática de `TiraDelPrograma`:
 *   `Bloques › Bloque 2 › Legs`. Se vuelve pulsando la miga, no una flecha.
 * · Las características viven en el paso 1 y se leen —no se editan— en una
 *   línea callada bajo el camino, que es la caja que se enciende para volver
 *   a ese paso. Ni chapas ni menús en la cabecera.
 * · La rejilla es la MISMA pieza que `?v=bloque`, con el plan inyectado (ver
 *   la costura del compositor en `ConjuntoDelBloque`). Renombrar, copiar,
 *   guardar como pieza, arrastrar, el volumen por hoja y «+ ejercicio» en su
 *   columna no se escriben aquí: ya estaban escritos allí.
 *
 * ══ La anatomía, aprendida de Coachway ═════════════════════════════════════
 * Su creador de programas es lo mejor que tienen, y su forma es la correcta:
 * la biblioteca fija a la izquierda —de ahí salen los ejercicios— y el trabajo
 * ocupando la pantalla. Lo que NO se le copia: su biblioteca es un almacén de
 * 1.772 ejercicios de nadie, la nuestra es ESTE cliente con lo que ha
 * levantado en cada fila; y su bloque nace siempre vacío, el nuestro sabe
 * heredar el anterior y decir qué le has cambiado.
 *
 * Y una precisión que costó una vuelta: la biblioteca es del PASO 2. En el 1
 * se pintaba igual, con sus tres pestañas y los manejadores a `null` — 264 px
 * de almacén que no se podía usar al lado de una decisión que no va de
 * ejercicios. Ahí el paso 1 se queda con la hoja entera, contenida a 920 px y
 * centrada, que es lo que es: una pantalla de decidir, no un banco de trabajo.
 */

/** Las hojas, tal y como las lee la hoja de escribir. */
const comoVista = (hoja) => ({
  dayName: hoja.dayName,
  exercises: (hoja.exercises || []).map(planExerciseView),
});

export const Compositor = () => {
  const {
    activeClient,
    workoutData,
    exerciseLibrary,
    catalogExercises,
    cajon,
    startBlockWithPlan,
    upsertLibraryExercise,
  } = useApp();
  const navigate = useNavigate();
  const guardarEnPlantillas = useGuardarEnPlantillas();
  const toast = useToast();
  /*
    ── LO QUE HUBIERA A MEDIAS ───────────────────────────────────────────────
    Se lee UNA vez, al montar, y de ahí arrancan los estados de abajo. No es un
    efecto que restaure después: con un efecto la pantalla se pintaría primero
    en blanco y el bloque aparecería de golpe, que es exactamente el parpadeo
    que hace dudar de si se ha perdido algo. Ver `lib/borradorDelBloque`.
  */
  const [borrador] = useState(() => leerBorrador(activeClient?.id));
  /* Lo que se lleva en la mano, para poder ponerlo encima de una columna. */
  const hojasCopiadas = usePortapapeles(TIPO.HOJA);

  /* De dónde nace el bloque: `null` mientras se está en el paso 1. */
  const [origen, setOrigen] = useState(borrador?.origen ?? null);
  const [eligiendoPieza, setEligiendoPieza] = useState(false);

  /* Las características, y el plan que se está montando. Todo local hasta que
     se cierra el bloque anterior y se abre este: hasta entonces no hay nada
     escrito en ninguna parte — salvo la copia de seguridad del navegador, que
     es solo una red y no una segunda verdad (`lib/borradorDelBloque`). */
  /* `null` mientras nadie lo ha tocado: el nombre de por defecto sale de
     cuántos bloques hay, y eso no se sabe hasta tener el programa delante. */
  const [nombreEscrito, setNombreEscrito] = useState(borrador?.nombreEscrito ?? null);
  const [intencion, setIntencion] = useState(borrador?.intencion ?? null);
  const [previstos, setPrevistos] = useState(borrador?.previstos ?? null);
  const [nota, setNota] = useState(borrador?.nota ?? '');
  const [sesiones, setSesiones] = useState(borrador?.sesiones ?? []);
  /* Dónde cae cada hoja. Es local por la misma razón que las hojas: el reparto
     del bloque abierto vive en `program.weeklySplit` y este bloque todavía no
     está abierto. Viaja entero en `startBlockWithPlan`. */
  const [split, setSplit] = useState(borrador?.split ?? {});
  const [abierta, setAbierta] = useState(borrador?.abierta ?? null);
  const [renombrando, setRenombrando] = useState(false);
  /* El alta de hoja desde el camino: `null` cerrada, cadena mientras se escribe
     el nombre. La misma pareja «+ hoja» / formulario en línea que Entreno. */
  const [nuevaHoja, setNuevaHoja] = useState(null);

  /* Qué hay en la mesa: el bloque entero o una de sus hojas. Los mismos dos
     nombres que Entreno, para que el camino se lea igual en las dos. */
  const [vista, setVista] = useState(borrador?.vista === 'hoja' ? 'hoja' : 'bloque');

  /*
    ── LO QUE SE ESCRIBE ANTES DE LA PRIMERA SERIE ───────────────────────────
    El calentamiento de la hoja se edita en una capa (es una lista con vídeos y
    no cabe en un renglón) y la indicación se escribe en la propia banda. Las
    dos son del PLAN —viven en la hoja del bloque, `mobilityDrills` y
    `coachNote`— y por eso se pueden escribir aquí, antes de que el bloque
    exista: viajan dentro de `sessions` en `startBlockWithPlan`.
  */
  const [calentando, setCalentando] = useState(null);
  /* Guarda la HOJA, no un sí/no: con un booleano, abrir la indicación en «Push»
     y pasar a «Pull» con la flecha dejaba allí un campo vacío abierto que nadie
     había pedido. */
  const [indicacionAbierta, setIndicacionAbierta] = useState(null);
  /* La tabla entera del volumen —grupo a grupo, hoja a hoja—, desde el costado. */
  const [volumenAbierto, setVolumenAbierto] = useState(false);

  /*
    ══ ⌘Z MIENTRAS SE COMPONE ════════════════════════════════════════════════

    «El deshacer en la creación de bloque no lo veo.» Y no estaba: el ⌘Z de
    Entreno guarda fotos del programa GUARDADO cada vez que algo pasa por
    `applyWorkout`, y aquí no pasa nada por ahí —el bloque entero vive en estos
    `useState` hasta que se abre—. Así que el compositor tiene su propia pila,
    del tamaño de su estado: `lib/usePilaDeCambios`.

    ── Qué entra en la foto, y qué no ────────────────────────────────────────
    LAS HOJAS Y SU REPARTO, que es el plan. Fuera se quedan a propósito las
    cuatro características del paso 1 —el nombre, a qué juega, cuánto dura y
    qué se persigue—: dos son campos de texto, y dentro de un campo el ⌘Z es
    del navegador (deshace lo que estabas tecleando, que es lo que uno espera).
    Robárselo para retirar un ejercicio de hace un minuto sería cambiarle a
    alguien una función que ya funciona por otra que no pidió.

    `abierta` tampoco: es dónde tenías el ratón, no el bloque. Pero al volver
    hay que comprobar que la hoja abierta siga existiendo —deshacer un «+ hoja»
    la borra— o la mesa se queda mirando a una hoja que ya no está.
  */
  const foto = useMemo(() => ({ sesiones, split }), [sesiones, split]);
  /* Se desmonta en sus cuatro piezas y no se usa como objeto: `pasos` cambia
     con cada gesto, y un `pila` entero en las dependencias de `empezarDeCero`
     recrearía el aviso de «seguimos donde lo dejaste» en cada render. */
  const { pasos: pasosDelBloque, deshacer, rehacer, olvidar: olvidarLaPila } = usePilaDeCambios({
    foto,
    restaurar: ({ sesiones: ss, split: sp }) => {
      setSesiones(ss);
      setSplit(sp);
      setAbierta((n) => (ss.some((s) => s.dayName === n) ? n : (ss[0]?.dayName ?? null)));
      if (ss.length === 0) setVista('bloque');
    },
  });
  const atajosDeshacer = useAtajoDeDeshacer();

  const program = workoutData[activeClient?.id];
  const bloques = blocksOf(program);
  const anterior = bloques[bloques.length - 1];
  const nombre = nombreEscrito ?? `Bloque ${bloques.length + 1}`;
  /* Tus días guardados. Desde la 0112 salen del CAJÓN —la tabla del equipo— y
     no de `preferences`, con la misma forma plana de siempre. Ver
     `domain/cajon` y `docs/replanteamiento-lo-guardado.md`. */
  const piezas = comoLista(cajon, TIPO.HOJA);

  const library = useMemo(
    () => mergeCatalog(exerciseLibrary, catalogExercises),
    [exerciseLibrary, catalogExercises]
  );
  const heredadas = useMemo(() => inheritedSessions(program, anterior), [program, anterior]);

  /*
    ── LA RED: SE GUARDA SOLO, EN CADA CAMBIO ────────────────────────────────
    Nada de «guardar borrador» a mano: lo que se teclea queda. Solo a partir del
    paso 2, que es cuando hay algo montado — en el paso 1 no hay bloque todavía,
    y guardar una pantalla en blanco solo serviría para resucitarla.

    Se escribe el estado entero salvo lo que es de ESTA sesión delante de la
    pantalla (qué capa está abierta, qué nombre se está renombrando): eso no es
    el bloque, es dónde tenías el ratón.
  */
  const clienteId = activeClient?.id ?? null;

  /** El bloque tal y como está ahora mismo, listo para dejarlo escrito. */
  const borradorDeAhora = useCallback(
    () => ({
      /* Solo el tipo de puerta: si nació de una pieza, sus ejercicios ya están
         copiados dentro de `sesiones` y guardarlos otra vez sería la misma
         lista dos veces. */
      origen: origen ? { tipo: origen.tipo } : null,
      nombreEscrito,
      intencion,
      previstos,
      nota,
      sesiones,
      split,
      abierta,
      vista,
    }),
    [origen, nombreEscrito, intencion, previstos, nota, sesiones, split, abierta, vista]
  );

  useEffect(() => {
    if (!clienteId || origen === null) return;
    guardarBorrador(clienteId, borradorDeAhora());
  }, [clienteId, origen, borradorDeAhora]);

  /** Tirarlo todo y volver al paso 1, en blanco. */
  const empezarDeCero = useCallback(() => {
    olvidarBorrador(clienteId);
    /* Y la pila también: lo de antes era de otro bloque, y un ⌘Z que resucita
       las hojas de un bloque que se acaba de tirar no deshace nada, revuelve. */
    olvidarLaPila();
    setOrigen(null);
    setNombreEscrito(null);
    setIntencion(null);
    setPrevistos(null);
    setNota('');
    setSesiones([]);
    setSplit({});
    setAbierta(null);
    setVista('bloque');
  }, [clienteId, olvidarLaPila]);

  /*
    Y se DICE que se ha recuperado. Un bloque que aparece solo, con hojas que
    uno no acaba de escribir, es peor que no recuperar nada: no se sabe si es lo
    tuyo o lo de otro día. Se cuenta una vez, con la salida al lado.
  */
  useEffect(() => {
    if (!borrador) return;
    const cuantas = borrador.sesiones.length;
    toast({
      text: `Seguimos donde lo dejaste: «${borrador.nombreEscrito || 'el bloque'}», ${cuantas} ${cuantas === 1 ? 'hoja' : 'hojas'} sin abrir todavía.`,
      action: { label: 'Empezar de cero', onClick: empezarDeCero },
    });
  }, [borrador, toast, empezarDeCero]);

  /*
    ── ESC CIERRA LA HOJA, Y LAS FLECHAS PASAN DE HOJA ───────────────────────
    Es exactamente lo que hace Entreno, y aquí faltaba: abrir una hoja es
    asomarse dentro del bloque, no mudarse, y de lo que se asoma uno se sale
    con Esc. Sin esto, el único camino de vuelta a la rejilla era la miga —
    tinta terciaria, cuerpo pequeño y sin caja— y el dueño, con la pantalla
    delante: «si le das clic a una hoja luego no puedes volver atrás a la
    vista general». La miga estaba; nadie la veía.

    Las mismas dos guardas que allí, y las dos hacen falta: si hay una capa
    abierta el Esc es SUYO, y si se está escribiendo en un campo, también.
    Con el bloque delante no hace nada: es la casa, y de la casa no se sale.
  */
  useEffect(() => {
    if (vista !== 'hoja') return undefined;
    const alPulsar = (e) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (!['Escape', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      if (document.querySelector('[role="dialog"], [role="menu"]')) return;
      const foco = document.activeElement;
      if (foco && (foco.tagName === 'INPUT' || foco.tagName === 'TEXTAREA' || foco.isContentEditable)) return;
      if (e.key === 'Escape') {
        setVista('bloque');
        return;
      }
      const cuantas = sesiones.length;
      if (cuantas < 2) return;
      e.preventDefault();
      const desde = Math.max(0, sesiones.findIndex((s) => s.dayName === abierta));
      const paso = e.key === 'ArrowLeft' ? -1 : 1;
      /* Da la vuelta, como en Entreno: seguir a la derecha desde la última es
         volver a la primera, no chocarse con un tope. */
      setAbierta(sesiones[(desde + paso + cuantas) % cuantas].dayName);
    };
    document.addEventListener('keydown', alPulsar);
    return () => document.removeEventListener('keydown', alPulsar);
  }, [vista, sesiones, abierta]);

  const aLaRutina = (busca = '') => navigate(`${clientPath(activeClient.id, 'rutina')}${busca}`);

  /*
    Sin programa no hay bloque siguiente que componer: `startBlockWithPlan`
    cierra el abierto y abre otro, y no hay ninguno que cerrar. El alta de la
    rutina vive en la propia rutina, con sus dos salidas —escribirla o traer el
    fichero—, así que aquí se dice y se devuelve allí.
  */
  if (!activeClient || !program || (program.microcycles || []).length === 0) {
    return (
      <div className="compositor-pagina">
        <EmptyState
          icon={Layers}
          title="Todavía no hay rutina que continuar"
          message="Un bloque nuevo se abre detrás del anterior. Empieza la rutina desde la pantalla de Entreno —escribiéndola o trayendo el fichero— y vuelve aquí para el siguiente."
          action={
            <button type="button" className="btn btn-primary btn-sm" onClick={() => aLaRutina()}>
              Ir a la rutina
            </button>
          }
        />
      </div>
    );
  }

  const ultima = lastWeekNumber(program.microcycles);
  const estructuraAnterior = structureOfBlock(program, anterior);
  const drills = estructuraAnterior.mobilityDrills || [];
  const hereda = origen?.tipo === 'herencia';
  const cambios = hereda ? sessionDiff(heredadas, sesiones) : [];

  /*
    ── EL PLAN, CON LA FORMA QUE LEE LA REJILLA ──────────────────────────────
    La traducción la hace el dominio (`planSessionView`), que es la misma que
    usan las dos ramas de `blockPlan`: aquí no se escribe una segunda. Sin
    `weeks` ni `reference` porque este bloque no tiene ninguna semana montada
    todavía — y la rejilla, con el plan inyectado, no las pide.
  */
  const plan = { reference: null, weeks: [], sessions: sesiones.map((hoja) => planSessionView(hoja)) };

  /* ── Empezar por una puerta ───────────────────────────────────────────── */

  const empezar = (nuevo) => {
    const arranque = nuevo.sesiones || heredadas;
    /* Elegir puerta no es un gesto que se deshaga: es de dónde parte el bloque.
       La pila empieza aquí, con lo que la puerta haya puesto encima de la mesa. */
    olvidarLaPila();
    setOrigen(nuevo);
    setSesiones(arranque);
    setAbierta(arranque[0]?.dayName ?? null);
    setVista('bloque');
    /*
      Heredar un bloque es heredar TAMBIÉN dónde caen sus hojas: los nombres
      son los mismos, así que el reparto sigue valiendo y volver a repartirlo a
      mano sería trabajo que ya estaba hecho. El bloque en blanco y el que nace
      de una pieza empiezan sin reparto: sus hojas no existían.
    */
    setSplit(nuevo.tipo === 'herencia' ? { ...(estructuraAnterior.weeklySplit || {}) } : {});
  };

  /* ── Escribir sobre las hojas de aquí, que aún no están guardadas ─────── */

  const conHoja = (dayName, fn) => setSesiones((ss) => ss.map((s) => (s.dayName === dayName ? fn(s) : s)));
  const conEjercicios = (dayName, fn) => conHoja(dayName, (s) => ({ ...s, exercises: fn(s.exercises || []) }));
  const porNombre = (name) => (ex) => String(ex.name).trim().toLowerCase() === String(name).trim().toLowerCase();

  const anadirEjercicio = (dayName, exercise) =>
    conEjercicios(dayName, (lista) => [...lista, cloneExerciseAsTemplate(exercise)]);

  /* Y entra con la pauta del ANTERIOR de esa hoja, que es la misma regla que el
     alta del banco. Aquí había un `3 × 8-10` clavado: el mismo gesto daba un
     resultado distinto según entraras por la biblioteca o por el alta, y el de
     la biblioteca no miraba nada. Ver `pautaHeredada`. */
  const anadirDeLaBiblioteca = (item) => {
    if (!abierta) return;
    const hojaAbierta = sesiones.find((s) => s.dayName === abierta);
    anadirEjercicio(
      abierta,
      buildExercise({
        name: item.name,
        muscle: item.muscle || 'Pecho',
        ...pautaHeredada(comoVista(hojaAbierta || { exercises: [] }).exercises),
      })
    );
  };

  const quitarEjercicio = (dayName, name) =>
    conEjercicios(dayName, (lista) => lista.filter((ex) => !porNombre(name)(ex)));

  /* `delta` y no destino: es lo que manda la rejilla al soltar, y lo que manda
     Alt + ↑/↓. Mover fuera de la lista no hace nada. */
  const moverEjercicio = (dayName, name, delta) =>
    conEjercicios(dayName, (lista) => {
      const desde = lista.findIndex(porNombre(name));
      const hasta = desde + delta;
      if (desde < 0 || hasta < 0 || hasta >= lista.length) return lista;
      const copia = [...lista];
      const [pieza] = copia.splice(desde, 1);
      copia.splice(hasta, 0, pieza);
      return copia;
    });

  /*
    La serie que sigue a estas: la pauta de repeticiones y el RIR de la última,
    y nada más. Ni el peso ni el remate se heredan —pautar «bajada ×3» en la
    cuarta y subir a cinco series no es pedir dos bajadas—: los números los pone
    quien ELIGE, nunca la aplicación. Es la misma regla que `normalizaTecnica` y
    la misma serie que añade la hoja con el bloque ya abierto.
  */
  const serieSiguiente = (sets) => {
    const ultima = sets[sets.length - 1];
    return {
      kg: '',
      reps: '',
      rir: '',
      targetKg: '',
      targetReps: ultima?.targetReps || '',
      targetRir: ultima?.targetRir || '',
    };
  };

  const series = (dayName, name, n) =>
    conEjercicios(dayName, (lista) =>
      lista.map((ex) => {
        if (!porNombre(name)(ex)) return ex;
        const objetivo = clampInt(n, 1, 12, (ex.sets || []).length);
        const sets = [...(ex.sets || [])];
        while (sets.length < objetivo) sets.push(serieSiguiente(sets));
        while (sets.length > objetivo && sets.length > 1) sets.pop();
        return { ...ex, sets };
      })
    );

  /*
    ── UN OBJETIVO, EN TODAS LAS SERIES ──────────────────────────────────────
    Es el verbo de la FILA del ejercicio: «súbelo todo a 100», «todas a 8-10».
    Lo tenían solo las repeticiones —`reps`, que es este mismo escrito para un
    campo— y por eso los kilos y el RIR solo se podían pautar serie a serie,
    aunque el 90 % de las veces valgan lo mismo para las cuatro.
  */
  const todas = (dayName, name, campo, valor) =>
    conEjercicios(dayName, (lista) =>
      lista.map((ex) =>
        !porNombre(name)(ex) ? ex : { ...ex, sets: (ex.sets || []).map((s) => ({ ...s, [campo]: valor })) }
      )
    );

  /* La rejilla del bloque escribe las repeticiones sin saber de objetivos: para
     ella sigue siendo un verbo suyo, y aquí es un caso del de arriba. */
  const reps = (dayName, name, valor) => todas(dayName, name, 'targetReps', valor);

  /* La gramática de serie —enlazar, remate, descanso— es plan, y aquí el plan
     es este estado. `undefined` borra la clave, como en el dominio. */
  const gramatica = (dayName, name, campos) =>
    conEjercicios(dayName, (lista) =>
      lista.map((ex) => {
        if (!porNombre(name)(ex)) return ex;
        const salida = { ...ex, ...campos };
        Object.keys(campos).forEach((k) => {
          if (campos[k] === undefined || campos[k] === null) delete salida[k];
        });
        return salida;
      })
    );

  /*
    ══ LO QUE SE PAUTA SERIE A SERIE ═════════════════════════════════════════
    Los kilos y el RIR cuelgan de cada serie, así que no había forma de
    escribirlos aquí: el banco enseñaba «3 × 8-10» y las series no existían en
    pantalla hasta abrir el bloque. Son cuatro verbos —escribir un objetivo,
    añadir, quitar y rematar— y todos escriben en el mismo sitio que el resto de
    este editor: el estado local, que es donde vive el bloque hasta que se abre.
  */
  const conSets = (dayName, name, fn) =>
    conEjercicios(dayName, (lista) =>
      lista.map((ex) => (porNombre(name)(ex) ? { ...ex, sets: fn(ex.sets || []) } : ex))
    );

  /** Un objetivo —`targetKg`, `targetReps`, `targetRir`— de UNA serie. */
  const serie = (dayName, name, indice, campo, valor) =>
    conSets(dayName, name, (sets) => sets.map((s, i) => (i === indice ? { ...s, [campo]: valor } : s)));

  const anadirSerie = (dayName, name) => conSets(dayName, name, (sets) => [...sets, serieSiguiente(sets)]);

  /* Nunca la última que queda: un ejercicio sin series no es un ejercicio, es
     un nombre. Para eso está quitar el ejercicio. */
  const quitarSerie = (dayName, name, indice) =>
    conSets(dayName, name, (sets) => (sets.length <= 1 ? sets : sets.filter((_, i) => i !== indice)));

  /*
    El remate de UNA serie, con sus números. Y al escribirlo se JUBILA el del
    ejercicio entero —`tecnica`/`bajada`, de cuando el remate era siempre de la
    última—: no se tira, baja a la última serie, que es donde `tecnicaDeLaSerie`
    lo estaba leyendo. Sin eso, pautar una bajada en la segunda borraría en
    silencio el rest-pause que la hoja venía enseñando en la cuarta. Es
    literalmente lo que hace la hoja con el bloque abierto.
  */
  const rematarSerie = (dayName, name, indice, tecnica) =>
    conEjercicios(dayName, (lista) =>
      lista.map((ex) => {
        if (!porNombre(name)(ex)) return ex;
        const sets = ex.sets || [];
        const legado = tecnicaOf(ex);
        const ultima = sets.length - 1;
        return {
          ...ex,
          tecnica: undefined,
          bajada: undefined,
          sets: sets.map((s, i) => {
            if (i === indice) return { ...s, tecnica: tecnica || undefined };
            if (legado && i === ultima && !s.tecnica) return { ...s, tecnica: { id: legado } };
            return s;
          }),
        };
      })
    );

  /*
    ── EL CALENTAMIENTO Y LA INDICACIÓN DE UNA HOJA ──────────────────────────
    Mismas reglas que con el bloque abierto (`setDayDrills` y `setDayNote`):
    `null` devuelve la hoja al calentamiento del programa —«no he decidido
    nada»— y `[]` dice «esta hoja no se calienta», que es una decisión. La
    lectura la contesta el dominio (`drillsForDay`), aquí no se repite.
  */
  const ponerCalentamiento = (dayName, drills) =>
    conHoja(dayName, (s) => ({ ...s, mobilityDrills: drills }));

  const indicacionDeLaHoja = (dayName, texto) =>
    conHoja(dayName, (s) => ({ ...s, coachNote: texto }));

  /* ── Las hojas ────────────────────────────────────────────────────────── */

  /** Un nombre que no choque con ninguna de las que ya hay. */
  const nombreLibre = (base, usados) => {
    let n = base;
    let i = 2;
    while (usados.has(n)) n = `${base} ${i++}`;
    return n;
  };

  const anadirHoja = (base) => {
    const n = nombreLibre(String(base).trim(), new Set(sesiones.map((s) => s.dayName)));
    if (!n) return;
    setSesiones((ss) => [...ss, { dayName: n, exercises: [] }]);
    setAbierta(n);
  };

  const renombrarHoja = (de, a) => {
    const limpio = String(a).trim();
    if (!limpio || limpio === de || sesiones.some((s) => s.dayName === limpio)) return;
    setSesiones((ss) => ss.map((s) => (s.dayName === de ? { ...s, dayName: limpio } : s)));
    /* El reparto apunta a las hojas POR NOMBRE: sin esto, renombrar «Push A»
       dejaría el lunes apuntando a una hoja que ya no existe y el día se
       quedaría en blanco sin que nadie lo hubiera soltado. */
    setSplit((s) => Object.fromEntries(Object.entries(s).map(([d, v]) => [d, v === de ? limpio : v])));
    setAbierta((n) => (n === de ? limpio : n));
  };

  const quitarHoja = (dayName) => {
    setSesiones((ss) => {
      const restantes = ss.filter((s) => s.dayName !== dayName);
      if (dayName === abierta) setAbierta(restantes[0]?.dayName ?? null);
      if (restantes.length === 0) setVista('bloque');
      return restantes;
    });
    /* Y su día se queda libre, no apuntando a un fantasma. */
    setSplit((s) => Object.fromEntries(Object.entries(s).filter(([, v]) => v !== dayName)));
  };

  const moverHoja = (desde, hasta) =>
    setSesiones((ss) => {
      if (desde === hasta || hasta < 0 || hasta >= ss.length) return ss;
      const copia = [...ss];
      const [pieza] = copia.splice(desde, 1);
      copia.splice(hasta, 0, pieza);
      return copia;
    });

  /** «Copia de "Empuje"»: media semana se escribe así. */
  const duplicarHoja = (dayName) => {
    const hoja = sesiones.find((s) => s.dayName === dayName);
    if (!hoja) return;
    const n = nombreLibre(dayName, new Set(sesiones.map((s) => s.dayName)));
    setSesiones((ss) => [...ss, { dayName: n, exercises: (hoja.exercises || []).map(cloneExerciseAsTemplate) }]);
    setAbierta(n);
  };

  const ponerPieza = (pieza) => {
    const n = nombreLibre(pieza.name, new Set(sesiones.map((s) => s.dayName)));
    setSesiones((ss) => [
      ...ss,
      { dayName: n, exercises: (pieza.exercises || []).map(cloneExerciseAsTemplate) },
    ]);
    setAbierta(n);
  };

  /*
    ── COPIAR, GUARDAR Y PEGAR: los mismos verbos que en Entreno ─────────────
    Y la misma forma de pieza (`piezaDeHoja`), que es lo que permite copiar una
    hoja aquí y pegarla allí, o al revés. Sin aviso al copiar: lo dice la mano
    (ley II del portapapeles).
  */
  const deQuien = activeClient?.name || null;

  const copiarHoja = (dayName) => {
    const hoja = sesiones.find((s) => s.dayName === dayName);
    if (!hoja) return;
    copiarAlPortapapeles(
      piezaDeHoja({
        dayName,
        exercises: (hoja.exercises || []).map(cloneExerciseAsTemplate),
        cliente: deQuien,
        donde: nombre || 'el bloque nuevo',
      })
    );
  };

  const guardarPieza = (dayName) => {
    const hoja = sesiones.find((s) => s.dayName === dayName);
    if (!hoja) return;
    guardarEnPlantillas({
      tipo: TIPO.HOJA,
      titulo: dayName,
      carga: { dayName, exercises: (hoja.exercises || []).map(cloneExerciseAsTemplate) },
    });
  };

  /** Una hoja de la mano entra como hoja NUEVA del bloque. */
  const pegarHoja = (pieza) => {
    const carga = pieza?.carga;
    if (!carga) return;
    ponerPieza({ name: carga.dayName || pieza.titulo, exercises: carga.exercises || [] });
  };

  /** Y encima de una columna: conserva su nombre y cambia lo que lleva dentro.
      Aquí no pregunta por tramos —no hay microciclos todavía, así que las tres
      respuestas harían lo mismo—. */
  const sustituirHoja = (dayName, pieza) => {
    const cual = pieza || hojasCopiadas[0];
    if (!cual?.carga) return;
    conHoja(dayName, (s) => ({
      ...s,
      exercises: (cual.carga.exercises || []).map(cloneExerciseAsTemplate),
    }));
  };

  const guardar = () => {
    const semana = startBlockWithPlan(activeClient.id, {
      name: nombre.trim() || null,
      sessions: sesiones,
      mobilityDrills: drills,
      plannedWeeks: previstos,
      intent: intencion,
      note: nota,
      /* Solo si se ha repartido algo: `null` deja el reparto que hubiera. */
      weeklySplit: Object.keys(split).length > 0 ? split : null,
    });
    /* Ya está escrito donde tiene que estar: la red sobra y dejarla
       resucitaría el bloque la próxima vez que se entre a componer. */
    olvidarBorrador(clienteId);
    aLaRutina(semana ? `?s=${semana}` : '');
  };

  /*
    ── CANCELAR, CON VUELTA ATRÁS ────────────────────────────────────────────
    Cancelar es la otra forma de terminar, así que también tira la red. Pero es
    un botón que está a dos centímetros de «Cerrar el bloque y abrir este», y lo
    que se pierde con él es media hora de trabajo: se dice lo que ha pasado y se
    deja deshacerlo, que es la ley de esta casa para todo lo que borra.
  */
  const cancelar = () => {
    const habia = sesiones.length;
    const guardado = borradorDeAhora();
    olvidarBorrador(clienteId);
    aLaRutina();
    if (habia > 0) {
      toast({
        text: `«${nombre}» se queda sin abrir. Sus ${habia} ${habia === 1 ? 'hoja' : 'hojas'} no se han guardado en ninguna parte.`,
        action: {
          label: 'Deshacer',
          onClick: () => {
            guardarBorrador(clienteId, guardado);
            navigate(`${clientPath(activeClient.id, 'rutina')}/componer`);
          },
        },
      });
    }
  };

  /* ── DESHACER, CON SU AVISO Y SU ATAJO ───────────────────────────────────
     El mismo trato que en Entreno: el aviso dice qué ha pasado y lleva su
     «Rehacer» dentro. Sin etiqueta por gesto —«deshecho: quitar Press banca»—
     porque el resultado se ve en la mesa en el mismo instante, que es mejor
     señal que una frase, y etiquetarlo obligaría a nombrar los veinte sitios
     que escriben en estas hojas. */
  const deshacerElBloque = () => {
    if (!deshacer()) return;
    toast({
      text: 'Deshecho el último cambio del bloque.',
      action: { label: 'Rehacer', onClick: () => rehacer() },
    });
  };

  const rehacerElBloque = () => {
    if (rehacer()) toast({ text: 'Rehecho.' });
  };

  atajosDeshacer.current = {
    deshacer: pasosDelBloque.atras > 0 ? deshacerElBloque : null,
    rehacer: pasosDelBloque.adelante > 0 ? rehacerElBloque : null,
  };

  /* Y los dos mandos a la vista, que es la mitad que faltaba: un atajo que no
     se anuncia no existe para quien no lo conoce. Salen solo cuando hay algo
     que deshacer o que rehacer (la ley del reposo), y son botones y no un menú
     por la misma razón que los de la hoja. */
  const mandosDeDeshacer = (pasosDelBloque.atras > 0 || pasosDelBloque.adelante > 0) && (
    <span className="compositor-mandos">
      {pasosDelBloque.atras > 0 && (
        <button
          type="button"
          className="btn btn-icon btn-icon-compact"
          title="Deshacer el último cambio del bloque (⌘Z)"
          aria-label="Deshacer el último cambio del bloque"
          onClick={deshacerElBloque}
        >
          <Undo2 size={15} />
        </button>
      )}
      {pasosDelBloque.adelante > 0 && (
        <button
          type="button"
          className="btn btn-icon btn-icon-compact"
          title="Rehacer (⌘⇧Z)"
          aria-label="Rehacer el cambio deshecho"
          onClick={rehacerElBloque}
        >
          <Redo2 size={15} />
        </button>
      )}
    </span>
  );

  /* ── EL CAMINO ────────────────────────────────────────────────────────────
     La gramática de `TiraDelPrograma`, que es la que el dueño quiere en las
     dos pantallas: el titular es el último eslabón, lo que queda a su
     izquierda son migas y se vuelve pulsándolas. Sin flecha.

     Lo que se repite de allí es el VOCABULARIO —las clases `.tira-*`—, no la
     pieza: `TiraDelPrograma` habla de un programa guardado (sus bloques, sus
     microciclos, sus sesiones) y aquí no hay ninguno. Si algún día las dos
     necesitan lo mismo, lo que se extrae es el camino; hoy serían dos
     abstracciones para un solo caso. */
  const camino = (
    <nav className="tira compositor-tira" aria-label="Dónde estás">
      <div className="tira-fila">
        <div className="tira-camino">
          <button
            type="button"
            className="tira-miga"
            onClick={() => aLaRutina('?v=lista')}
            title="Todos los bloques de esta persona"
          >
            <FolderOpen size={13} aria-hidden="true" />
            Bloques
          </button>
          <ChevronRight size={13} className="tira-paso" aria-hidden="true" />

          {origen === null ? (
            <span className="tira-eslabon is-on">Un bloque nuevo</span>
          ) : vista === 'hoja' ? (
            <>
              {/* Con su icono, por lo mismo que «Bloques» lleva la carpeta: es
                  lo que la hace reconocible como PUERTA y no como rótulo. Sin
                  él era el nombre del bloque en tinta terciaria, o sea un
                  título apagado, y el camino de vuelta no se encontraba. */}
              <button
                type="button"
                className="tira-miga"
                onClick={() => setVista('bloque')}
                title={`Ver «${nombre}» entero: todas sus hojas · Esc`}
              >
                <Layers size={13} aria-hidden="true" />
                {nombre}
              </button>
              <ChevronRight size={13} className="tira-paso" aria-hidden="true" />
              <div className="tira-lista" key="hojas" data-sentido="baja">
                <div className="tira-tabs" role="tablist" aria-label={`Hojas de ${nombre}`}>
                  {sesiones.map((s) => (
                    <button
                      key={s.dayName}
                      type="button"
                      role="tab"
                      aria-selected={s.dayName === abierta}
                      className={`tira-eslabon${s.dayName === abierta ? ' is-on' : ''}`}
                      onClick={() => setAbierta(s.dayName)}
                    >
                      {s.dayName}
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            /* El nombre se toca pulsándolo, como en la tira: sin lápiz, porque
               el titular ES el gesto. */
            <div className="tira-lista" key="bloque" data-sentido="sube">
              {renombrando ? (
                <RenombrarEnSitio
                  value={nombre}
                  label="Nombre del bloque"
                  onRename={setNombreEscrito}
                  onDone={() => setRenombrando(false)}
                />
              ) : (
                <button
                  type="button"
                  className="tira-eslabon is-on"
                  title="Cambiar el nombre del bloque"
                  onClick={() => setRenombrando(true)}
                >
                  {nombre}
                </button>
              )}

              {/*
                «+ hoja» va aquí por la misma ley que en Entreno: cada «+» toca
                a lo que añade, y las hojas son del bloque, que es el titular
                que tiene al lado. El menú dice de qué parte cada opción —lo
                que llevas en la mano primero, que es la ley del reposo— en vez
                de crear una hoja en blanco sin preguntar.
              */}
              {nuevaHoja === null ? (
                <BotonMas
                  palabra="hoja"
                  ariaLabel={`Añadir una hoja a «${nombre}»`}
                  items={[
                    ...hojasCopiadas.map((pieza) => ({
                      icon: ClipboardPaste,
                      label: `Pegar «${pieza.titulo}»`,
                      sub: [pieza.detalle, pieza.origen?.cliente || pieza.origen?.donde]
                        .filter(Boolean)
                        .join(' · '),
                      run: () => pegarHoja(pieza),
                    })),
                    hojasCopiadas.length > 0 ? null : undefined,
                    {
                      icon: Plus,
                      label: 'En blanco',
                      sub: 'Le pones el nombre y sus ejercicios',
                      run: () => setNuevaHoja(''),
                    },
                    sesiones.length > 0 ? null : undefined,
                    ...sesiones.map((s) => ({
                      icon: Copy,
                      label: `Copia de «${s.dayName}»`,
                      sub: `${(s.exercises || []).length} ejercicios`,
                      run: () => duplicarHoja(s.dayName),
                    })),
                  ]}
                />
              ) : (
                <form
                  className="plan-hoja-alta"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const n = nuevaHoja.trim();
                    if (!n) return;
                    anadirHoja(n);
                    setNuevaHoja(null);
                  }}
                >
                  <input
                    autoFocus
                    className="input input-sm"
                    value={nuevaHoja}
                    placeholder="Empuje, Pierna…"
                    aria-label="Nombre de la hoja nueva"
                    onChange={(e) => setNuevaHoja(e.target.value)}
                    onKeyDown={(e) => e.key === 'Escape' && setNuevaHoja(null)}
                  />
                  <button type="submit" className="btn btn-primary btn-sm" disabled={!nuevaHoja.trim()}>
                    Añadir
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setNuevaHoja(null)}>
                    Cancelar
                  </button>
                </form>
              )}
            </div>
          )}
        </div>

        <span className="tira-hueco" />

        <div className="compositor-acciones">
          {mandosDeDeshacer}
          <button type="button" className="btn btn-secondary btn-sm" onClick={cancelar}>
            Cancelar
          </button>
          {/* En el paso 1 no está: un bloque sin una sola hoja no se puede
              abrir, y una oferta que no se puede aceptar es mobiliario (la ley
              del reposo). Aparece en cuanto hay algo que abrir. */}
          {origen !== null && sesiones.length > 0 && (
            <button type="button" className="btn btn-primary btn-sm" onClick={guardar}>
              Cerrar «{anterior.name}» y abrir este
            </button>
          )}
        </div>
      </div>
    </nav>
  );

  /* ── PASO 1 · QUÉ BLOQUE ES ───────────────────────────────────────────────
     Las características vuelven a ser un formulario, y esta vez está bien:
     tienen su propio paso. Lo que no puede volver a pasar —y es de lo que
     venimos— es que ocupen el primer tercio de la pantalla ENCIMA del plan.

     Ninguna es obligatoria: un bloque puede no jugar a nada y durar lo que
     dure. Por eso no hay un «Continuar» al final — el gesto que avanza es
     elegir de dónde parte, que es la única decisión que el bloque sí necesita. */
  const ficha = (
    <section className="compositor-paso" aria-label="Qué bloque vas a componer">
      {/* El titular dice QUÉ va a pasar, no cómo se llama la pantalla: es lo
          único que hay que entender antes de tocar nada. El «paso 1 de 2» va
          encima y en voz baja, que es un rótulo de sitio, no la frase. */}
      <header className="compositor-paso-say">
        <span className="section-label">Paso 1 de 2</span>
        <h2 className="compositor-paso-t">Un bloque nuevo detrás de «{anterior.name}»</h2>
        <p className="compositor-paso-d">
          «{anterior.name}» se cierra en el microciclo {ultima}. Nada de esto es obligatorio: lo
          puedes dejar como está y cambiarlo luego.
        </p>
      </header>

      {/*
        ── CUATRO FILAS, NO CUATRO CAMPOS APILADOS ───────────────────────────
        Eran cuatro `.field` a lo ancho de la mesa: dos cajas de texto de 760 px
        para un nombre de dos palabras, y las pastillas flotando debajo de su
        rótulo. Ancho regalado y ninguna alineación, que es exactamente lo que
        se lee como «escaso».

        Ahora es la ficha que ya usa la casa: rótulo a la izquierda, lo que se
        decide a la derecha, un filete entre filas. Las cuatro decisiones se
        recorren en vertical por una sola línea de lectura y el campo mide lo
        que mide lo que se escribe en él.
      */}
      <div className="compositor-campos">
        <div className="compositor-dato">
          <label className="compositor-dato-k" htmlFor="compositor-nombre">
            Cómo se llama
          </label>
          <div className="compositor-dato-v">
            <input
              id="compositor-nombre"
              className="input"
              value={nombre}
              onChange={(e) => setNombreEscrito(e.target.value)}
            />
          </div>
        </div>

        <div className="compositor-dato">
          <span className="compositor-dato-k" id="compositor-juega">
            A qué juega
          </span>
          <div className="compositor-dato-v">
            <div className="opciones-libres" role="group" aria-labelledby="compositor-juega">
              <button
                type="button"
                className="chip-op"
                aria-pressed={!intencion}
                onClick={() => setIntencion(null)}
              >
                Sin decidir
              </button>
              {BLOCK_INTENTS.map((i) => (
                <button
                  key={i.id}
                  type="button"
                  className="chip-op"
                  aria-pressed={intencion === i.id}
                  onClick={() => setIntencion(i.id)}
                >
                  {i.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="compositor-dato">
          <span className="compositor-dato-k" id="compositor-dura">
            Cuánto se prevé que dure
          </span>
          <div className="compositor-dato-v">
            <div className="opciones-libres" role="group" aria-labelledby="compositor-dura">
              <button
                type="button"
                className="chip-op"
                aria-pressed={!previstos}
                title="Dura hasta que lo cambies"
                onClick={() => setPrevistos(null)}
              >
                Abierto
              </button>
              {[3, 4, 5, 6, 8, 12].map((n) => (
                <button
                  key={n}
                  type="button"
                  className="chip-op tnum"
                  aria-pressed={previstos === n}
                  onClick={() => setPrevistos(n)}
                >
                  {n}
                </button>
              ))}
              <span className="compositor-opciones-cola">microciclos</span>
            </div>
          </div>
        </div>

        <div className="compositor-dato">
          <label className="compositor-dato-k" htmlFor="compositor-nota">
            Qué se persigue
          </label>
          <div className="compositor-dato-v">
            <input
              id="compositor-nota"
              className="input"
              value={nota}
              maxLength={MAX_BLOCK_NOTE}
              placeholder="Subir intensidad en los básicos y recortar accesorios"
              onChange={(e) => setNota(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Y aquí se acaba el paso: no hay «Continuar» porque elegir la puerta ES
          continuar. La frase lo dice una vez, para que las tres tarjetas no se
          lean como tres cosas más que rellenar. */}
      <div className="compositor-puertas">
        <div className="compositor-puertas-say">
          <span className="section-label">Y de qué parte</span>
          <p className="compositor-paso-d">Al elegir una, se abre el paso 2 con las hojas dentro.</p>
        </div>

        {/*
          Las tres tarjetas arrancan igual —una fila de icono, el nombre, la
          frase—, así que los tres nombres caen a la misma altura. El «LO NORMAL»
          se sienta en la fila del icono y no encima del nombre: puesto ahí
          empujaba a la recomendada un renglón hacia abajo y las tres se leían
          descuadradas, que era la mitad del desorden de esta pantalla.
        */}
        <div className="compositor-puertas-rejilla">
          <button type="button" className="compositor-puerta is-recomendada" onClick={() => empezar({ tipo: 'herencia' })}>
            <span className="compositor-puerta-cab">
              <Layers size={20} aria-hidden="true" />
              <span className="compositor-puerta-recom">Lo normal</span>
            </span>
            <span className="compositor-puerta-t">Heredar «{anterior.name}»</span>
            <span className="compositor-puerta-d">
              Nace siendo el anterior con todo lo suyo dentro —hojas, ejercicios y días—, y te va
              diciendo qué has cambiado.
            </span>
          </button>

          <button type="button" className="compositor-puerta" onClick={() => empezar({ tipo: 'blanco', sesiones: [] })}>
            <span className="compositor-puerta-cab">
              <FilePlus2 size={20} aria-hidden="true" />
            </span>
            <span className="compositor-puerta-t">En blanco</span>
            <span className="compositor-puerta-d">
              Un bloque vacío: creas la primera hoja, le pones nombre y le metes sus ejercicios.
            </span>
          </button>

          <button
            type="button"
            className="compositor-puerta"
            disabled={piezas.length === 0}
            onClick={() => setEligiendoPieza(true)}
          >
            <span className="compositor-puerta-cab">
              <Library size={20} aria-hidden="true" />
            </span>
            <span className="compositor-puerta-t">Desde una pieza tuya</span>
            <span className="compositor-puerta-d">
              {piezas.length === 0
                ? 'Todavía no has guardado ninguna. Se guardan desde la hoja, en la biblioteca.'
                : `Tus días guardados: ${piezas.length === 1 ? '1 pieza' : `${piezas.length} piezas`}.`}
            </span>
          </button>
        </div>

        {eligiendoPieza && piezas.length > 0 && (
          <div className="compositor-piezas">
            <span className="section-label">Cuál</span>
            <ul className="compositor-piezas-lista">
              {piezas.map((pieza) => (
                <li key={pieza.id}>
                  <button
                    type="button"
                    className="compositor-pieza"
                    onClick={() => {
                      setEligiendoPieza(false);
                      empezar({
                        tipo: 'pieza',
                        sesiones: [
                          { dayName: pieza.name, exercises: (pieza.exercises || []).map(cloneExerciseAsTemplate) },
                        ],
                      });
                    }}
                  >
                    <span className="compositor-pieza-n">{pieza.name}</span>
                    <span className="compositor-pieza-d">{(pieza.exercises || []).length} ejercicios</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );

  /* ── La ficha, leída: una línea callada y la puerta de vuelta al paso 1 ──
     No son chapas ni un menú: es la CAJA QUE SE ENCIENDE, con el verbo en
     acento, que es la ley de los gestos de la casa. Un solo destino —el paso
     donde eso se decide— en vez de un desplegable por característica. */
  /*
    ── SE DICE LO QUE ESTÁ DECIDIDO, Y NADA MÁS ──────────────────────────────
    Esta línea imprimía los huecos: «sin decidir a qué juega · abierto», dos
    negaciones seguidas en el renglón más alto de la pantalla, para decir que un
    bloque recién empezado todavía no es nada. Y «abierto» además era el valor
    por defecto: se leía como una decisión sin serlo.

    Lo que queda es lo que sí se ha decidido. Cuando no hay nada, la caja no
    dice un hueco: ofrece el trabajo —«Ponerle características»—, que es la ley
    de los gestos y lo que de verdad hace pulsarla.
  */
  const decidido = [
    intentLabel(intencion),
    previstos ? `${previstos} microciclos` : null,
    nota.trim() ? `«${nota.trim()}»` : null,
  ].filter(Boolean);
  const dicho = decidido.join(' · ');

  const fichaLeida = (
    <div className="compositor-ficha">
      <button
        type="button"
        className="compositor-ficha-caja"
        onClick={() => setOrigen(null)}
        title="Volver al paso 1: el nombre, a qué juega, cuánto dura y qué se persigue"
      >
        {decidido.length > 0 && <span className="compositor-ficha-dicho">{dicho}</span>}
        <span className="compositor-ficha-verbo">
          {decidido.length > 0 ? 'Cambiar' : 'Ponerle características'}
        </span>
      </button>

      <span className="compositor-ficha-nace">
        {hereda ? (
          <>
            Nace de <b>«{anterior.name}»</b>
            {cambios.length === 0 ? ' · de momento, igual que él' : ` · ${cambios.length} ${cambios.length === 1 ? 'cambio' : 'cambios'}`}
          </>
        ) : (
          <>Nace {origen?.tipo === 'pieza' ? 'de una pieza tuya' : 'en blanco'}</>
        )}
      </span>
    </div>
  );

  /* ── PASO 2 · LAS HOJAS ──────────────────────────────────────────────────
     La mesa: el bloque entero, o una hoja abierta con su gramática de serie. */

  const hoja = sesiones.find((s) => s.dayName === abierta) || null;
  const protocol = clientProtocol(activeClient.preferences);
  const unidad = unitLabel(activeClient.cycleType);

  /*
    ══ ANTES DE LA PRIMERA SERIE ══════════════════════════════════════════════
    La misma banda que la hoja de Entreno —`.hoja-preambulo`, con su columna de
    rótulos y el verbo al canto— y por la misma razón: el calentamiento y la
    indicación son lo que hay que leer antes de empezar, así que se leen ANTES
    de la lista, no dentro de ella.

    Faltaba entera: aquí se monta el bloque y las dos cosas se decidían después,
    con el bloque ya abierto, una hoja cada vez. «No puedo añadir notas [...] ni
    calentamiento.» Son plan, y el plan se escribe aquí.

    Lo que no se trae de allí es «traer el de la S3»: no hay microciclos todavía
    de los que traerlo.
  */
  const calentamientoDeLaHoja = hoja ? drillsForDay(program, hoja) : [];
  const calentamientoHeredado = Boolean(hoja) && !dayHasOwnDrills(hoja) && calentamientoDeLaHoja.length > 0;

  const preambulo = hoja && (isModuleOn(protocol, 'warmup') || isModuleOn(protocol, 'coachNote')) && (
    <div className="hoja-preambulo compositor-preambulo">
      {isModuleOn(protocol, 'warmup') && (
        <div className="hoja-calentamiento">
          <span className="hoja-calentamiento-k">Calentamiento</span>
          {calentamientoDeLaHoja.length > 0 ? (
            <span className="hoja-calentamiento-lista">
              {calentamientoDeLaHoja.map((d) => (
                <span key={d.id || d.name} className="hoja-calentamiento-item">
                  {d.name}
                  {d.prescription && <small> {d.prescription}</small>}
                </span>
              ))}
            </span>
          ) : (
            <span className="hoja-calentamiento-vacio">sin calentamiento</span>
          )}
          <span className="hoja-calentamiento-acciones">
            <button
              type="button"
              className="hoja-calentamiento-editar"
              onClick={() => setCalentando(hoja.dayName)}
            >
              {calentamientoHeredado
                ? 'del programa · hacerlo de esta hoja'
                : calentamientoDeLaHoja.length > 0
                  ? 'editar'
                  : 'añadir'}
            </button>
          </span>
        </div>
      )}
      {isModuleOn(protocol, 'coachNote') &&
        (indicacionAbierta === hoja.dayName || hoja.coachNote?.trim() ? (
          <label className="hoja-indicacion">
            <span className="hoja-calentamiento-k">Tu indicación</span>
            <textarea
              className="hoja-indicacion-texto"
              rows={1}
              autoFocus={indicacionAbierta === hoja.dayName && !hoja.coachNote?.trim()}
              placeholder="La verá tu cliente al abrir el día, antes de empezar."
              value={hoja.coachNote ?? ''}
              onChange={(e) => indicacionDeLaHoja(hoja.dayName, e.target.value)}
              onBlur={() => !hoja.coachNote?.trim() && setIndicacionAbierta(null)}
            />
          </label>
        ) : (
          <div className="hoja-indicacion">
            <span className="hoja-calentamiento-k">Tu indicación</span>
            <span className="hoja-calentamiento-vacio">sin indicación</span>
            <span className="hoja-calentamiento-acciones">
              <button
                type="button"
                className="hoja-calentamiento-editar"
                onClick={() => setIndicacionAbierta(hoja.dayName)}
              >
                añadir
              </button>
            </span>
          </div>
        ))}
    </div>
  );

  /*
    ══ EL COSTADO: LAS SERIES POR GRUPO, MIENTRAS SE MONTAN ═══════════════════
    «No veo información sencilla de volumen total como se ve en el bloque
    cuando estoy editando.» No se veía porque no estaba: el compositor tenía la
    biblioteca y la mesa, y de cuánto llevaba montado solo decía una suma al pie
    («90 series por microciclo»), que no dice de QUÉ.

    Es el mismo costado de Entreno y con su misma ley —dice de lo que trata la
    mesa, y nada más—:

      con el bloque delante   las series por grupo del bloque entero
      con una hoja abierta    las de esa hoja, sobre lo que el grupo lleva

    Y son las MISMAS piezas que allí (`TarjetaVolumen`, `VolumenDeLaHoja`,
    `VolumenPopup`): lo único que cambia es de dónde salen las hojas, que aquí
    están en la mano y no en un bloque guardado. Señala y calla: no dice que
    quites series de pecho, dice cuántas hay y dónde está el tramo útil.
  */
  const costado = (
    <aside className="compositor-costado" aria-label={`Volumen de «${nombre}»`}>
      {vista === 'hoja' && hoja ? (
        <VolumenDeLaHoja
          bloque={{ name: nombre }}
          hoja={hoja}
          hojas={plan.sessions}
          cycleType={activeClient.cycleType}
        />
      ) : (
        <TarjetaVolumen
          grupos={volumeByGroup(plan.sessions)}
          unidad={unidad}
          onAmpliar={() => setVolumenAbierto(true)}
        />
      )}
    </aside>
  );

  const mesa = (
    <>
      {fichaLeida}

      {vista === 'hoja' && hoja ? (
        <>
        {preambulo}
        <EscribirHoja
          key={hoja.dayName}
          dayName={hoja.dayName}
          exercises={comoVista(hoja).exercises}
          library={library}
          conCabecera={false}
          conNotas={isModuleOn(protocol, 'coachNote')}
          onAdd={(exercise) => anadirEjercicio(hoja.dayName, exercise)}
          onQuitar={quitarEjercicio}
          /* El mismo `delta` que la rejilla: reordenar dentro de la hoja abierta
             es el mismo movimiento que arrastrar en la columna del bloque. */
          onMover={moverEjercicio}
          onSeries={series}
          /* Lo que se escribe en la fila del ejercicio vale para todas sus
             series; lo que cambia en una, se escribe en la suya (`onSerie`). */
          onTodas={todas}
          onGramatica={gramatica}
          /* Y lo que va por serie: el peso, el RIR y el remate de cada una.
             Con el mismo interruptor de RIR que la hoja de Entreno —el
             protocolo lo deja puesto, nunca lo impide—. */
          onSerie={serie}
          onAnadirSerie={anadirSerie}
          onQuitarSerie={quitarSerie}
          onTecnica={rematarSerie}
          showRir={isModuleOn(protocol, 'rir')}
          onRecordar={upsertLibraryExercise}
        />
        </>
      ) : (
        <ConjuntoDelBloque
          cliente={activeClient}
          library={library}
          /* La costura: el plan va inyectado y no hay bloque del que leerlo. */
          plan={plan}
          nombre={nombre}
          split={split}
          hojaEnMano={hojasCopiadas[0] || null}
          onAbrirHoja={(dayName) => {
            setAbierta(dayName);
            setVista('hoja');
          }}
          onAnadirEjercicio={anadirEjercicio}
          onQuitarEjercicio={quitarEjercicio}
          onMoverEjercicio={moverEjercicio}
          onSeries={series}
          onReps={reps}
          onAnadirHoja={anadirHoja}
          onRenombrarHoja={renombrarHoja}
          onCopiarHoja={copiarHoja}
          onGuardarPieza={guardarPieza}
          onSustituirHoja={sustituirHoja}
          onQuitarHoja={quitarHoja}
          onMoverHoja={moverHoja}
          onRecordarEjercicio={upsertLibraryExercise}
          onSplit={(dia, valor) =>
            setSplit((s) => {
              /* «Descanso» es soltar el día, no ocuparlo con una hoja que no
                 existe: se borra la clave en vez de guardar la palabra. */
              if (valor === 'Descanso') {
                const { [dia]: _fuera, ...resto } = s;
                return resto;
              }
              return { ...s, [dia]: valor };
            })
          }
          /* Aquí no hay semanas a las que ir: sin `difieren`, el verbo que la
             usaría no llega a pintarse. */
          onIrSemana={() => {}}
          onTraerFichero={() => aLaRutina('?traer=1')}
        />
      )}

      <div className="compositor-pie">
        <span className="t-xs t-tertiary tnum">
          {sesiones.length} {sesiones.length === 1 ? 'hoja' : 'hojas'} ·{' '}
          {plan.sessions.reduce((n, s) => n + s.series, 0)} series por microciclo
        </span>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => aLaRutina('?traer=1')}>
          <FileUp size={15} /> Traer de un fichero
        </button>
      </div>
    </>
  );

  /*
    ══ UNA SOLA MESA, CON EL CAMINO DE CABECERA ═══════════════════════════════
    El mismo mueble que Entreno —`.entreno-hoja.mesa-panel` con la tira dentro
    y `.mesa-cuerpo` debajo— y no una versión propia. Es lo que hace que la
    rejilla se vea aquí exactamente igual que en `?v=bloque`: las filas parejas,
    la bandeja hundida y el sangrado de las columnas cuelgan todos de esas dos
    clases, así que copiar la rejilla sin copiar su mesa era traérsela a medias.
  */
  return (
    <div className={`compositor-pagina${origen === null ? ' es-paso1' : ''}`}>
      {/* Lo que condiciona lo que se decide: aquí es donde importa. */}
      <ConditionsNote area="training" />
      {/* Una hoja de la mano se pega como hoja nueva del bloque. Solo mientras
          se compone: antes de elegir puerta no hay bloque donde ponerla. */}
      {origen !== null && (
        <Destino tipos={[TIPO.HOJA]} donde={nombre} prioridad={0} pegar={pegarHoja} />
      )}
      {/* `.compositor-banco` y no `.compositor`: ese nombre ya es de la caja de
          mensaje de Revisión, y esta rejilla heredaba su canto, su fondo y su
          resplandor al enfocar. Ver la nota en `piezas.css`. */}
      {/*
        ── LA BIBLIOTECA NO ESTÁ EN EL PASO 1 ────────────────────────────────
        Estaba, y apagada: se pintaban las tres pestañas —ejercicios, piezas,
        gimnasio— con sus manejadores a `null`, o sea 264 px de almacén que no
        se podía usar al lado de una decisión que no es de ejercicios. El
        dueño: «no tiene mucho sentido que al darle a crear, que aún estás
        decidiendo cosas, salgan las piezas, ejercicios y maquinaria ya».

        Es la ley del reposo: una oferta que no se puede aceptar es mobiliario.
        La biblioteca aparece cuando aparece aquello de lo que es —las hojas—,
        y el paso 1 se queda con la pantalla entera, como la hoja de decisión
        que es (`.es-paso1`).
      */}
      <div className={`compositor-banco${origen === null ? ' es-paso1' : ''}`}>
        {origen !== null && (
          <BibliotecaDelCliente
            library={library}
            microcycles={program.microcycles || []}
            piezas={piezas}
            hojaAbierta={abierta}
            onAnadirEjercicio={anadirDeLaBiblioteca}
            onPonerPieza={ponerPieza}
          />
        )}
        <section
          className="entreno-hoja mesa-panel compositor-mesa"
          aria-label={origen === null ? 'Qué bloque vas a componer' : `«${nombre}», componiéndose`}
        >
          {camino}
          <div className="mesa-cuerpo">{origen === null ? ficha : mesa}</div>
        </section>
        {/* El costado, solo con hojas delante: con el bloque sin elegir puerta
            no hay volumen del que hablar, y una tarjeta que dice «sin ejercicios
            todavía» al lado de una decisión que no va de ejercicios es
            mobiliario (la ley del reposo, la misma que dejó fuera la
            biblioteca en el paso 1). */}
        {origen !== null && sesiones.length > 0 && costado}
      </div>

      {/*
        El calentamiento de la hoja se ESCRIBE —es una lista con sus vídeos y
        sus indicaciones—, así que va en una capa y no en la banda. Misma pieza
        que con el bloque abierto (`WarmupEditor`), montada solo abierta.
      */}
      {calentando && (
        <Modal open size="lg" title={`Calentamiento de ${calentando}`} onClose={() => setCalentando(null)}>
          <div className="col gap-4">
            <p className="t-sm t-secondary">
              {dayHasOwnDrills(sesiones.find((s) => s.dayName === calentando))
                ? 'Es el calentamiento de esta hoja. Lo verá tu cliente arriba del día, antes de la primera serie.'
                : 'Esta hoja usa el calentamiento general. Lo que escribas aquí pasa a ser el suyo.'}
            </p>
            <WarmupEditor
              drills={drillsForDay(program, sesiones.find((s) => s.dayName === calentando))}
              onChange={(drills) => ponerCalentamiento(calentando, drills)}
            />
            {dayHasOwnDrills(sesiones.find((s) => s.dayName === calentando)) && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => ponerCalentamiento(calentando, null)}
              >
                Volver al calentamiento general
              </button>
            )}
          </div>
        </Modal>
      )}

      {/* La tabla entera: grupo a grupo y hoja a hoja, con los totales contra
          el tramo útil. La misma que se abre desde el bloque en Entreno. */}
      {volumenAbierto && (
        <VolumenPopup
          open
          onClose={() => setVolumenAbierto(false)}
          bloque={{ name: nombre }}
          hojas={plan.sessions}
          unidad={unidad}
        />
      )}
    </div>
  );
};
