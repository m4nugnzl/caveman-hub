import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

/* Al hacer propio el calentamiento de un día se parte de una COPIA del programa,
   no de cero: lo normal es querer lo mismo con un ejercicio cambiado. Con ids
   nuevos, para que editarlo aquí no toque el del programa. */
import {
  Bookmark,
  CalendarDays,
  ClipboardPaste,
  Copy,
  Download,
  FileUp,
  Layers,
  Plus,
  Redo2,
  Settings2,
  Trash2,
  Undo2,
  Users,
} from 'lucide-react';

import { useApp } from '@/context/AppContext';
import { localeNumber, shortDate } from '@/lib/dates';
import { useEsTelefono } from '@/lib/useMediaQuery';
import { useAtajosDeCopia } from '@/lib/useAtajosDeCopia';
import { useAtajoDeDeshacer } from '@/lib/useAtajoDeDeshacer';
import { Modal } from '@/components/ui/Modal';
import {
  cloneExerciseAsTemplate,
  conLaPauta,
  drillsForDay,
  dayHasOwnDrills,
  tecnicaOf,
  unitInitial,
  unitIsFeminine,
  unitLabel,
  unitLabelPlural,
  weekTonnage,
  weekdayForDay,
} from '@/domain/training';
import { sessionCompletion, sessionTonnage } from '@/domain/sessions';
import { hasSeveralDays, isEmptyDiet } from '@/domain/nutrition';
import { mergeCatalog } from '@/domain/catalog';
import { activeQuestions, clientProtocol, isModuleOn, isServiceOn } from '@/domain/protocol';
import { EmptyState, SaveIndicator } from '@/components/ui/primitives';
import { ConditionsNote } from '@/components/conditions/ConditionsNote';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { useToast } from '@/components/ui/ToastProvider';
import { deepClone } from '@/lib/ids';
import { WarmupEditor } from './WarmupBlock';
import { useProgramNavigation } from './useProgramNavigation';
import { useDaySession } from './useDaySession';
import { CycleSettings } from './CycleSettings';
import { CopyToClientPanel } from './CopyToClientPanel';
import { PieDeProtocolo } from '../ClientSettings';
import { PastePlanDialog } from '../Import/PastePlanDialog';
import { ImportDayDialog } from './ImportDayDialog';
import { ExerciseList } from './ExerciseList';
import { AddExerciseForm } from './AddExerciseForm';
import { ComparativaEjercicio } from './ComparativaEjercicio';
import { TramoDelPegado } from './TramoDelPegado';
import { MenuAcciones } from '@/components/ui/MenuAcciones';
import { Subjetivo } from '@/components/ui/Subjetivo';
import { Destino } from '@/components/ui/Portapapeles';
import { TIPO, copiar as copiarAlPortapapeles, piezaDeHoja, usePortapapeles } from '@/lib/portapapeles';

import { TiraDelPrograma } from './TiraDelPrograma';
import { BotonMas } from '@/components/ui/BotonMas';
import { ConjuntoDelBloque } from './ConjuntoDelBloque';
import { LecturasDelBloque } from './LecturasDelBloque';
import { ListaDeBloques } from './ListaDeBloques';
import { MandarLaPieza } from '@/components/Coach/MandarLaPieza';
import { useGuardarEnPlantillas } from '@/components/Coach/guardarEnPlantillas';
import { ComoLoLlevo } from './ComoLoLlevo';
import { VolumenDeLaHoja } from './VolumenDeLaHoja';
import { ProgresionPopup } from './ProgresionPopup';
import { SensacionesPopup } from './SensacionesPopup';
import {
  BLOCK_CHANGE,
  blockOfWeek,
  blockSessionOf,
  blockSessionsOf,
  buildOverride,
  blockTraits,
  blocksOf,
  currentBlock,
  describeOverride,
  intentLabel,
  overridesAt,
  overrideSpan,
  isCurrentBlock,
  lastWeekNumber,
  planOfDay,
  resolvedMicrocycles,
  structureOfBlock,
  weekInBlock,
  weekLabel,
  weeksOfBlock,
} from '@/domain/blocks';
import { migrateBlockPlans } from '@/domain/blocksMigration';
import { freeSheetName } from '@/domain/pieces';
import { clientPath } from '@/routes';
import { executedSessions, sessionSetCount } from '@/domain/sessions';
import { latestActiveWeek } from '@/domain/week';

/** Sin `?s=`, la última semana montada. */
const semanaPorDefecto = (microcycles) => (microcycles.length ? lastWeekNumber(microcycles) : null);

/**
 * Un bloque copiado, listo para `startBlockWithPlan`.
 *
 * ══ Por qué es una función y no dos copias ═════════════════════════════════
 * Un bloque se pega en dos sitios que no se parecen —encima del que ya hay, y
 * en alguien que todavía no tiene programa— y los dos tienen que producir
 * EXACTAMENTE el mismo bloque. Escrito dos veces, lo que pasó de hecho es que
 * las dos se quedaron a medias de la misma manera.
 *
 * ── Y las tres características viajan ──────────────────────────────────────
 * `intent`, `plannedWeeks` y `note` son lo que `domain/blocks` llama «las
 * características del bloque»: a qué juega, cuánto se previó y qué se persigue.
 * Sin ellas lo que se copia no es una estructura, es un montón de hojas con
 * nombre — y era lo que pasaba en los tres caminos por los que un bloque sale
 * de un cliente, aunque `startBlockWithPlan` las aceptara desde el principio.
 *
 * Los ejercicios se vuelven a clonar aquí y no en quien copia: la misma pieza
 * se puede pegar cinco veces, y sin ids nuevos las cinco copias compartirían
 * los del original — y con ellos el historial de quien lo escribió.
 */
const planDeLaPieza = (pieza) => ({
  name: pieza.carga?.name || pieza.titulo,
  sessions: (pieza.carga?.sessions || []).map((h) => ({
    dayName: h.dayName,
    exercises: (h.exercises || []).map(cloneExerciseAsTemplate),
  })),
  mobilityDrills: pieza.carga?.mobilityDrills || null,
  intent: pieza.carga?.intent ?? null,
  plannedWeeks: pieza.carga?.plannedWeeks ?? null,
  note: pieza.carga?.note ?? null,
});
import { HojaDeSeries } from './HojaDeSeries';
import { VueltaALaRevision } from '@/components/review/VueltaALaRevision';

/**
 * Editor de rutina. Antes eran 866 líneas y 14 `useState` en un solo
 * componente: selector de ciclo, split semanal, navegador de semanas, panel de
 * copia, pestañas de día, edición del nombre, menú de acciones, drag & drop,
 * lista de ejercicios, celdas de series y formulario de alta.
 *
 * Aquí queda solo la orquestación; cada pieza vive en su propio archivo.
 */
export const WorkoutLogEditor = () => {
  const {
    activeClient,
    clients,
    workoutData,
    exerciseLibrary,
    catalogExercises,
    saveStatus,
    retrySave,
    updateClient,
    saveClientException,
    updateWeeklySplit,
    startSession,
    logSessionSet,
    updateSession,
    setDayNote,
    setDayDrills,
    removeSession,
    startProgram,
    appendMicrocycle,
    startBlockWithPlan,
    renameBlock,
    setBlockTraits,
    deleteBlock,
    logBlockChange,
    addBlockSheet,
    removeBlockSheet,
    renameBlockSheet,
    moveBlockSheet,
    addBlockExercise,
    setBlockSheetExercises,
    removeBlockExercise,
    restoreBlockExercise,
    moveBlockExercise,
    /* Mover dentro de la SEMANA. Es el respaldo de la hoja cuando el ejercicio no
       está en el plan del bloque — ver el `onMove` de la hoja. */
    moveExercise,
    setBlockExerciseSets,
    setBlockExerciseTarget,
    updatePlanExercise,
    removePlanExercise,
    addPlanExercise,
    overridePlanExercise,
    removePlanExerciseOnly,
    dropOverride,
    promoteOverride,
    addOverride,
    setOverrideSpan,
    cloneMicrocycle,
    removeMicrocycle,
    restoreMicrocycle,
    setMicrocycleDate,
    importDays,
    addExercises,
    upsertLibraryExercise,
    nutrition,
    replicateClient,
    /* ⌘Z sobre el plan del bloque. Ver el bloque de comentario de más abajo. */
    deshacerPlan,
    rehacerPlan,
    pasosDelPlan,
    ensureProgram,
    ensureNutrition,
    coachPrefs,
    updateCoachPreferences,
    /* La otra mitad de lo que puede traer un Excel. Ver `dialogoDePegado`. */
    foodLibrary,
    catalogFoods,
    importDiet,
    upsertLibraryFood,
    /* La ficha del ejercicio —tu vídeo y tu pauta—, para que la hoja marque
       cuáles tienen algo que ver. Ver `videoDe` en `HojaDeSeries`. */
    sheetOf,
  } = useApp();

  const [copyOpen, setCopyOpen] = useState(false);

  /* El alta de ejercicio del teléfono: la abre el botón flotante como hoja. */
  const esTelefono = useEsTelefono();
  const [altaAbierta, setAltaAbierta] = useState(false);
  /* «Copiar un día de otro cliente»: la hoja se abre desde el menú del día. */
  const [importAbierto, setImportAbierto] = useState(false);
  /* «Traer de un fichero»: la rutina que el cliente trae de fuera. */
  const [pegarAbierto, setPegarAbierto] = useState(false);
  /* Y el fichero que ya viene en la mano: el que se soltó sobre la hoja en
     blanco del bloque. La ventana lo abre leído. */
  const [ficherosTraidos, setFicherosTraidos] = useState(null);
  /* El ejercicio copiado que está esperando a que se diga hasta cuándo vale.
     Se guarda la PIEZA y no un booleano: la ventana nombra lo que se pega, y
     al pegado desde la mano no le llega por ningún otro sitio. */
  const [pegadoConTramo, setPegadoConTramo] = useState(null);
  /* Y la hoja copiada que se va a poner ENCIMA de una que ya existe, esperando
     la misma pregunta: `{ pieza, dayName }`. El nombre del día va dentro porque
     esto se pide desde dos sitios —la hoja abierta y la columna del conjunto— y
     en el segundo el día no es el que está delante. */
  const [sustitucion, setSustitucion] = useState(null);
  /* La importación que viene de abrir un bloque nuevo: retira el día en blanco
     con el que nace, como se hace al montar el programa desde cero. */
  const [importarLimpio, setImportarLimpio] = useState(false);
  /* Qué día tiene abierto el campo de indicación SIN texto todavía (teléfono).
     Se guarda el nombre del día, no un booleano: al cambiar de día, el campo
     vacío de aquel no debe aparecer abierto en este. Mismo patrón que la nota
     de un ejercicio en ExerciseList. */
  /* El ejercicio cuyo histórico se enseña al lado: el pulsado o, si no, el primero del día. */
  const [focoEjercicio, setFocoEjercicio] = useState(null);
  /* El panel lateral abierto: el de la semana, el del día, o ninguno. */
  const [panel, setPanel] = useState(null);
  /* El bloque que se está mandando a otros clientes, o `null`. Se guarda el
     bloque y no un booleano porque se manda el de una fila concreta de la
     lista, que no tiene por qué ser el abierto. */
  const [mandandoBloque, setMandandoBloque] = useState(null);
  /* El nombre de la hoja que se está añadiendo desde la tira, o `null` si no
     hay ninguna a medias. Vive aquí y no en `ConjuntoDelBloque` porque el
     mando salió de la rejilla y subió al renglón del microciclo. */
  const [nuevaHojaEnTira, setNuevaHojaEnTira] = useState(null);
  /* Renombrar la hoja ya no tiene estado aquí: el titular de la pantalla es su
     nombre y se renombra pulsándolo, dentro de `CabeceraDelBloque`. */
  /*
    ── Las dos puertas del plan que no caben en la mesa ─────────────────────
    La mesa es la tabla de series: número, objetivo y lo que hizo. Lo que NO
    es una serie —el descanso entre ellas, la técnica de la última, las
    alternativas si no hay máquina— vivía en la vista de Conjunto, que ya no
    existe, y lo mismo el reparto de la semana. No se pierden: son AJUSTES de
    la hoja y del microciclo, y se abren desde donde se elige cada uno.
  */
  const [indicacionAbierta, setIndicacionAbierta] = useState(false);
  const [progresionAbierta, setProgresionAbierta] = useState(false);
  const [sensacionesAbiertas, setSensacionesAbiertas] = useState(false);

  const program = workoutData[activeClient.id];

  /*
    ══ Esta pantalla pide SU programa ════════════════════════════════════════

    Lo pedía un efecto del contexto, y con eso «a veces entras y dice que no hay
    rutina, recargas y aparece». Dos motivos, y los dos se arreglan aquí:

      · Aquel efecto se dispara con `selectedClientId`, y esta pantalla pinta
        `activeClient`, que NO siempre es el mismo: mientras la ruta no ha
        terminado de sincronizar la selección, `activeClient` cae en el primero
        de la cartera. Se pedía el programa de uno y se pintaba el de otro.
      · Y solo se disparaba al CAMBIAR de cliente. Si la petición fallaba —un
        corte de red, un túnel— no había segundo intento, y la ficha se quedaba
        diciendo que no hay rutina hasta recargar la página.

    Pedirlo desde donde se usa quita las dos: no hay dos ids que puedan
    discrepar, y un fallo se ve y se reintenta sin recargar nada. `ensureProgram`
    no repite consulta si ya está en memoria o si ya hay una en vuelo.
  */
  const [intento, setIntento] = useState(0);
  const [fallo, setFallo] = useState(false);

  useEffect(() => {
    if (program !== undefined) return undefined;

    let vivo = true;
    setFallo(false);
    ensureProgram(activeClient.id).then((cargado) => {
      // El id en las dependencias: una respuesta del cliente anterior no puede
      // pintar un error sobre la ficha que estás mirando ahora.
      if (vivo && cargado === null) setFallo(true);
    });
    return () => {
      vivo = false;
    };
  }, [program, activeClient.id, ensureProgram, intento]);
  /*
    Los microciclos CON SU PLAN PUESTO: el plan es del bloque y cada semana
    lleva encima sus excepciones (`domain/blocks`). Mientras un bloque no tenga
    su plan dentro esto devuelve los mismos objetos, así que la pantalla se
    comporta exactamente igual hasta que se migre.

    Las ESCRITURAS no pasan por aquí: van al contexto, que trabaja sobre el
    programa guardado. Esto es lo que se lee.
  */
  const microcycles = useMemo(() => resolvedMicrocycles(program), [program]);
  /* El calentamiento del PROGRAMA. Se lee en tres sitios —su pliegue, el aviso
     de lo que se copia y el día que hereda—, así que se nombra una vez. */
  const drills = program?.mobilityDrills || [];
  const cycleType = activeClient.cycleType || 'weekly';
  /* Qué módulos existen para este cliente. Se configura en Ajustes → Protocolo y
     decide qué piezas de esta pantalla se pintan siquiera. */
  const protocol = clientProtocol(activeClient.preferences);

  const nav = useProgramNavigation(activeClient.id, microcycles);
  /*
    La semana, el día y el nivel los manda la URL (`?s=3&d=0&v=hoja`). Aquí solo
    se obedece: sin parámetros, la última semana montada, su primer día y el
    bloque, que es el nivel de salida.

    (El comentario decía que la URL la pintaba un árbol de la barra lateral,
    `ArbolEntreno`. Ese componente ya no existe; quien escribe estos parámetros
    es esta misma pantalla.)
  */
  const [params, setParams] = useSearchParams();
  const sParam = Number(params.get('s')) || null;
  const dParam = Number(params.get('d')) || 0;

  const navigate = useNavigate();
  /* Componer tiene su sitio, y no es esta pantalla. Ver `Compositor.jsx`. */
  const aComponer = () => navigate(`${clientPath(activeClient.id, 'rutina')}/componer`);

  /*
    ── «Traer de un fichero», desde el compositor ────────────────────────────
    El importador vive aquí porque trae la rutina Y la dieta del mismo libro y
    necesita el microciclo contra el que importar. El compositor no lo duplica:
    devuelve a esta pantalla con `?traer=1`, y esto lo abre y borra la marca —
    si se quedara puesta, recargar o volver atrás lo abriría otra vez.
  */
  useEffect(() => {
    if (params.get('traer') !== '1') return;
    setImportarLimpio(true);
    setPegarAbierto(true);
    const limpio = new URLSearchParams(params);
    limpio.delete('traer');
    setParams(limpio, { replace: true });
  }, [params, setParams]);
  const { weeks: semanasMontadas, week: semanaNav, selectWeek, days: diasNav, dayIndex: diaNav, selectDay } = nav;
  useEffect(() => {
    const semana = sParam && semanasMontadas.includes(sParam) ? sParam : semanaPorDefecto(microcycles);
    if (semana !== null && semana !== semanaNav) selectWeek(semana);
  }, [sParam, semanasMontadas, semanaNav, selectWeek, microcycles]);
  useEffect(() => {
    if (diasNav.length > 0 && dParam !== diaNav && dParam < diasNav.length) selectDay(dParam);
  }, [dParam, diasNav, diaNav, selectDay]);
  /*
    ══ UNA SOLA PANTALLA: EL BLOQUE, Y UNA HOJA ABIERTA DENTRO ════════════════

    Aquí hubo un conmutador «Conjunto | Hojas», después una pestaña
    «Plan | Análisis», después los LOMOS, después un paginador «‹ 1/4 ›»,
    después un carril. Cinco mecanismos en un mes, y los cinco fallaban por lo
    mismo: eran un mando AL LADO de lo que cambiaba, y además obligaban a
    decidir en qué pantalla estabas antes de poder mirar nada.

    Ahora no hay dos pantallas. La pantalla es EL BLOQUE —siempre— y abrir una
    hoja es un estado suyo: la banda de días manda, y lo que cuelga de ella es
    la rejilla entera o la hoja abierta.

        (sin parámetro)   el bloque: sus hojas, su estructura, su información
        ?v=hoja&d=N       esa hoja abierta, en el mismo panel y bajo la banda
        ?v=lista          todos los bloques, para comparar

    Eso arregla de paso la jerarquía, que era la queja: la cabecera es siempre
    la del bloque, así que el contenedor no puede volver a quedar dibujado por
    debajo de lo que contiene —que es lo que pasaba con el carril—.

    Va en la URL y no en un `useState` porque es dónde estás, no una
    preferencia: se comparte, se recarga y se vuelve con el botón de atrás.
  */
  const vista = ['lista', 'hoja'].includes(params.get('v')) ? params.get('v') : 'bloque';
  /*
    ── El andamio de las dos armaduras se ha ido ────────────────────────────
    Aquí vivió un `?arm=carril` que dejaba convivir la banda de pestañas y el
    carril de Efort para poder clicarlas las dos. El dueño ya dio veredicto —«lo
    que está ahora de entreno está mucho mejor», hablando de producción— y las
    dos perdieron: manda la tira del programa, que es la cabecera que Entreno
    tenía en producción. Ver `TiraDelPrograma`.
  */
  const irA = (w, i = 0, v = vista) => {
    const next = { s: String(w), d: String(i) };
    setParams(v === 'bloque' ? next : { ...next, v });
  };
  const verVista = (v) => irA(nav.week, Math.max(0, nav.dayIndex), v);

  /*
    ── Esc cierra la hoja ────────────────────────────────────────────────────
    Abrir una hoja es asomarse dentro del bloque, no mudarse, y de lo que se
    asoma uno se sale con Esc. Con el bloque delante el Esc no hace nada: es la
    casa, y de la casa no se sale.

    Dos guardas, y las dos hacen falta: si hay una capa abierta el Esc es SUYO
    —cerrar la ventana y cerrar la hoja de un tecleo serían dos cosas por un
    gesto—, y si se está escribiendo en un campo, también, que ahí Esc descarta
    lo tecleado.
  */
  /*
    ── Y las flechas pasan de hoja ───────────────────────────────────────────
    «Cambiar de hoja es incómodo.» Además de dejar el mando siempre a la vista
    —la banda pegada arriba, o el carril—, el paso a la de al lado es ← y →,
    que es el gesto de quien ya sabe dónde está. Con las mismas guardas que el
    Esc: si hay una capa abierta o se está escribiendo, las flechas son suyas.
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
        verVista('bloque');
        return;
      }
      const cuantas = nav.days.length;
      if (cuantas < 2) return;
      const paso = e.key === 'ArrowLeft' ? -1 : 1;
      /* Da la vuelta: en un microciclo de cuatro, seguir a la derecha desde la
         última es volver a la primera, no chocarse con un tope. */
      e.preventDefault();
      irA(nav.week, (nav.dayIndex + paso + cuantas) % cuantas, 'hoja');
    };
    document.addEventListener('keydown', alPulsar);
    return () => document.removeEventListener('keydown', alPulsar);
  });
  /* Antes de cualquier `return` temprano: son hooks. */
  const semanaEnCurso = useMemo(
    () => latestActiveWeek({ microcycles, startDate: activeClient.startDate }),
    [microcycles, activeClient.startDate]
  );
  const sesionesDeLaSemana = useMemo(() => executedSessions(nav.microcycle || {}), [nav.microcycle]);
  const toast = useToast();
  const confirm = useConfirm();
  /* El gesto de guardar en el cajón, para «Guardarlo en tus plantillas» de la
     fila de la lista de bloques. Arriba con el resto de los ganchos, por lo
     mismo que los del portapapeles: debajo hay retornos tempranos. */
  const guardarEnPlantillas = useGuardarEnPlantillas();

  /* Lo que hay copiado y esta pantalla sabe pegar. Aquí arriba con el resto de
     los ganchos —y no junto a los verbos que lo usan, trescientas líneas más
     abajo— porque debajo hay retornos tempranos y un gancho no puede quedar
     detrás de uno. Ver el bloque «EL PORTAPAPELES DE ENTRENO». */
  const ejerciciosCopiados = usePortapapeles(TIPO.EJERCICIO);
  const hojasCopiadas = usePortapapeles(TIPO.HOJA);
  const bloquesCopiados = usePortapapeles(TIPO.BLOQUE);

  /*
    ══ ⌘C Y ⌘V SOBRE EL EJERCICIO SEÑALADO ═══════════════════════════════════

    El gesto que ya tiene en los dedos todo el mundo, y sobre la pieza que la
    hoja ya sabe cuál es: el ejercicio en foco, el mismo que enciende su
    histórico al lado. Sin inventar una selección nueva.

    ── Las tres guardas, y por qué ninguna sobra ─────────────────────────────
    1. DENTRO DE UN CAMPO, MANDA EL NAVEGADOR. Media pantalla son casillas de
       kilos y repeticiones: robarle el ⌘C a quien está copiando un número
       sería cambiar una función que funciona por otra que no pidió.
    2. CON TEXTO SELECCIONADO, TAMBIÉN. Seleccionar el nombre de un ejercicio
       para pegarlo en WhatsApp es un gesto real, y `getSelection` es lo único
       que distingue «copia esto» de «copia el ejercicio».
    3. Y NO SE TOCA EL PORTAPAPELES DEL SISTEMA. Lo que se copia aquí son
       objetos con sus series, no texto; escribirlos además en el del sistema
       le borraría a alguien lo que llevara en la mano.

    ── Y el oyente vive en `lib/useAtajosDeCopia` ────────────────────────────
    Las tres guardas y el ref con los dos verbos son los mismos en la hoja y en
    la dieta —dos pantallas donde se copia una pieza y se pega otra—, así que
    están escritos una vez. Lo único de aquí es CUÁL es la pieza: el ejercicio
    en foco. Debajo de esta línea hay retornos tempranos, por eso el gancho está
    arriba y no al lado de los verbos que lo llenan.
  */
  const atajos = useAtajosDeCopia();

  /*
    ══ ⌘Z SOBRE EL PLAN ══════════════════════════════════════════════════════

    Montar un bloque es probar: subes una serie, cambias un ejercicio, pegas
    una hoja encima de otra. Casi todos esos gestos van sin preguntar —que es
    lo correcto, un diálogo delante del gesto que se repite treinta veces sería
    fricción pura— y hasta ahora solo uno de ellos, quitar un ejercicio, tenía
    vuelta atrás. La pareja honesta de «sin confirmación» es «con deshacer», y
    aquí lo es para el plan entero.

    El motor está en `useWorkout` y su ley en `domain/deshacer`, que es una
    frase: DEVUELVE EL PLAN Y NUNCA TOCA LO REGISTRADO. Lo que alguien haya
    anotado mientras tanto se queda donde está.

    Y no hay etiqueta —«deshacer: quitar Press banca»— a propósito: el
    resultado se ve en la mesa en el mismo instante, que es una señal mejor que
    una frase, y mantener el nombre de cada gesto obligaría a etiquetar los
    cuarenta sitios que escriben en el plan.
  */
  const atajosDeshacer = useAtajoDeDeshacer();
  const pasos = pasosDelPlan[activeClient.id] || { atras: 0, adelante: 0 };

  const save = saveStatus('workout', activeClient.id);

  const daySession = useDaySession(nav.microcycle, nav.day);

  // Ver `domain/catalog.js`: lo tuyo gana cuando el nombre se repite.
  const ejerciciosDisponibles = useMemo(
    () => mergeCatalog(exerciseLibrary, catalogExercises),
    [exerciseLibrary, catalogExercises]
  );

  /* Los alimentos, para cuando el Excel que se sube trae además la dieta. */
  const alimentosDisponibles = useMemo(
    () => mergeCatalog(foodLibrary, catalogFoods),
    [foodLibrary, catalogFoods]
  );

  /*
    ══ Dos volúmenes, y son dos preguntas distintas ═══════════════════════════

    Antes esto enseñaba UNO solo: lo registrado si había sesión y, si no, el
    plan. El resultado era que el reparto que estabas montando desaparecía en
    cuanto el cliente anotaba su primera serie, sustituido por lo que llevaba
    hecho — justo cuando programar la semana siguiente exige verlo.

    Ahora el PLANIFICADO manda, porque esta es la hoja de programar y la
    pregunta de esta pantalla es «¿cuánto le he puesto?». Lo ejecutado se añade
    al lado cuando existe, como referencia y sin quitarle el sitio.
  */
  /* ── Y AQUÍ SE CONTABAN LAS SERIES ESCRITAS ──────────────────────────────
     `planned` y `doneSets` alimentaban «20 de 20 series escritas» en la
     cabecera de la hoja. La frase se ha ido —no cabía en el renglón y ya la
     dicen el disco de la pestaña y la propia tabla—, así que las dos cuentas
     se van con ella en vez de quedarse calculándose para nadie. */

  const indicator = (
    <SaveIndicator
      status={save.status}
      error={save.error}
      onRetry={() => retrySave('workout', activeClient.id)}
    />
  );

  /*
    Mientras el programa no está en memoria, esta pantalla NO puede decir que no
    hay programa.

    `workoutData[id]` es `undefined` hasta que `ensureProgram` contesta, y con eso
    los microciclos salían a cero: la pantalla enseñaba «este cliente no tiene
    programa todavía» y su botón, que reemplaza el programa por uno de una semana.
    Pulsarlo durante ese instante borraba el trabajo de verdad —y el instante no
    era teórico: cada vez que el mapa se vaciaba, esta era la pantalla que se veía—.

    Vacío y no cargado se cuentan distinto porque llevan a decisiones distintas.
  */
  if (program === undefined) {
    return fallo ? (
      <EmptyState
        icon={Layers}
        title="No se ha podido cargar el programa"
        message="Parece un problema de conexión. No se ha perdido nada: vuelve a intentarlo."
        action={
          <button type="button" className="btn btn-primary" onClick={() => setIntento((n) => n + 1)}>
            Reintentar
          </button>
        }
      />
    ) : (
      <EmptyState
        icon={Layers}
        title="Cargando el programa…"
        message="Un momento: estamos trayendo los microciclos de este cliente."
      />
    );
  }

  /*
    ══ Traer de otro cliente, en un sitio y no en tres ════════════════════════

    El panel se pinta igual en el vacío que con programa, así que se monta una
    vez: lo abren el botón de la barra de microciclos y el del estado vacío.

    Y solo existe si hay de quién traer. Ofrecer «traer de otro cliente» al que
    solo tiene uno lleva a un aviso que dice que hacen falta dos: una puerta que
    solo sirve para decirte que no puedes pasar.
  */
  const hayDeQuienTraer = clients.length > 1;
  const panelDeCopia = copyOpen && (
    <CopyToClientPanel
      clients={clients}
      activeClient={activeClient}
      cycleType={cycleType}
      weekCount={microcycles.length}
      hasProgram={microcycles.length > 0}
      hasDiet={
        /* Tener fila en `nutrition_plans` no es tener dieta: la fila nace al
           tocar cualquier cosa. Avisar de que «esto SUSTITUYE su dieta actual»
           por un plan en blanco es asustar por nada. */
        !isEmptyDiet(nutrition[activeClient.id])
      }
      conNutricion={isServiceOn(protocol, 'nutrition')}
      hasWarmup={drills.length > 0}
      onReplicate={(sourceId, what) => replicateClient(sourceId, activeClient.id, what)}
      onClose={() => setCopyOpen(false)}
    />
  );

  /*
    ══ Y traer de FUERA, con el mismo criterio ═══════════════════════════════

    Se monta una vez y lo abren los dos botones: el de la barra de microciclos
    —quien ya tiene programa y quiere añadir un día más— y el del estado vacío,
    que es el que de verdad importa: alguien que acaba de dar de alta a un
    cliente, con su rutina abierta en la otra pestaña.

    En el vacío no hay microciclo, así que se crea al confirmar; y el «Día 1» en
    blanco que monta `startProgram` se retira, porque es andamio del montaje y
    no un día suyo.

    ── Por qué desde aquí también entra la dieta ───────────────────────────────
    Porque es el MISMO fichero. El libro que trae quien se muda lleva la rutina
    en unas pestañas y la dieta en otras, y obligar a subirlo dos veces —una
    aquí y otra en nutrición— es hacer dos veces el trabajo que esto viene a
    quitar. Solo aparece si la hoja trae algo de dieta, así que quien venga a lo
    suyo no ve nada nuevo.
  */
  const dialogoDePegado = pegarAbierto && (
    <PastePlanDialog
      foco="rutina"
      ficheros={ficherosTraidos}
      targetDayName={nav.day?.dayName || null}
      unidad={unitLabel(cycleType).toLowerCase()}
      targetPreference={coachPrefs?.importador?.objetivo ?? 0}
      onRememberTarget={(index) => updateCoachPreferences('importador', { objetivo: index })}
      onImportIntoDay={(exercises) =>
        addExercises(activeClient.id, nav.week, nav.day.dayName, exercises)
      }
      onImportDays={(days) => {
        /* Sin microciclos, `nav.week` ya vale 1 aunque no exista ninguno, así
           que la pregunta es por el PROGRAMA y no por la semana: importar
           contra una semana que no está creada no falla, no hace nada. */
        const desdeCero = microcycles.length === 0;
        const semana = desdeCero ? startProgram(activeClient.id) : nav.week;
        importDays(activeClient.id, semana, days, { dropEmptyDays: desdeCero || importarLimpio });
        setImportarLimpio(false);
        if (desdeCero) irA(semana);
      }}
      foods={alimentosDisponibles}
      dietaExistente={!isEmptyDiet(nutrition[activeClient.id])}
      dietaConVariantes={hasSeveralDays(nutrition[activeClient.id])}
      onImportDiet={async (plan, nuevos) => {
        /*
          La dieta se relee ANTES de escribir. Desde la pantalla de la rutina
          puede no estar cargada todavía —se lee por cliente y bajo demanda— y
          escribir encima de un mapa vacío no sería importar: sería reemplazar el
          plan entero por lo que traiga la hoja, perdiendo lo que no venga en
          ella. Es la misma guardia que se puso al copiar de otro cliente.

          Si la lectura falla no se importa y se dice: un `await` a secas dejaba
          el fallo dentro de una promesa sin dueño, y desde fuera solo se veía
          que la dieta no se guardaba.
        */
        if (!(await ensureNutrition(activeClient.id).catch(() => null))) {
          toast({
            text: 'No he podido leer la dieta que tiene ahora, así que no he importado nada. Inténtalo otra vez.',
          });
          return;
        }
        /* Los alimentos que el entrenador ha escrito a mano se quedan en su
           biblioteca: la dieta guarda una foto de sus macros y funcionaría sin
           esto, pero la próxima que importe volvería a preguntarlos. */
        nuevos.forEach((food) => upsertLibraryFood(food));
        importDiet(activeClient.id, plan);
      }}
      onClose={() => {
        setPegarAbierto(false);
        setImportarLimpio(false);
        setFicherosTraidos(null);
      }}
    />
  );

  /*
    ══ PEGAR UN BLOQUE, ALLÍ DONDE EL BLOQUE ES EL SUJETO ═════════════════════

    Dos pantallas: la lista de bloques de esta persona y el vacío de quien
    todavía no tiene programa. En la hoja y en el conjunto no, y no es un olvido
    —lo que cae ahí es una hoja o un ejercicio, y el destino vigente es uno solo
    (ver `registrarDestino`)—: con el bloque delante, el bloque copiado sigue
    ofreciéndose desde su «+», que es donde vivía.

    ── Con uno es un botón; con varios, una pregunta ─────────────────────────
    Es la ley VI de la mano: elegir por el entrenador cuál de los tres bloques
    que lleva es el que quería no es un atajo, es equivocarse por él. Con uno
    solo no hay nada que preguntar y un menú de un ítem no es un menú.
  */
  const nombreCorto = activeClient?.name?.split(' ')[0] || 'este cliente';

  const verboPegarBloque = (clase, alPegar) => {
    if (bloquesCopiados.length === 0) return null;
    if (bloquesCopiados.length === 1) {
      const pieza = bloquesCopiados[0];
      return (
        <button type="button" className={clase} onClick={() => alPegar(pieza)}>
          <ClipboardPaste size={13} aria-hidden="true" /> Pegar «{pieza.titulo}»
        </button>
      );
    }
    return (
      <MenuAcciones
        clase={clase}
        label="Pegar un bloque"
        ariaLabel="Pegar uno de los bloques copiados"
        items={bloquesCopiados.map((pieza) => ({
          icon: ClipboardPaste,
          label: `«${pieza.titulo}»`,
          sub: [pieza.detalle, pieza.origen?.cliente].filter(Boolean).join(' · '),
          run: () => alPegar(pieza),
        }))}
      />
    );
  };

  /*
    Y en el vacío se pega SIN PREGUNTAR, a diferencia de `pegarBloque`: aquí no
    hay bloque abierto que cerrar ni nada entrenado que quede detrás, así que la
    pregunta no protegería de nada. `startBlockWithPlan` tiene su rama para esto
    (ver `useWorkout`): abre el programa con el plan ya puesto.
  */
  const pegarPrimerBloque = (pieza) => {
    const semana = startBlockWithPlan(activeClient.id, planDeLaPieza(pieza));
    if (semana) irA(semana, 0, 'bloque');
    const hojas = pieza.carga?.sessions || [];
    toast({
      text: `«${pieza.carga?.name || pieza.titulo}» empezado con sus ${hojas.length} ${
        hojas.length === 1 ? 'hoja' : 'hojas'
      }.`,
    });
  };

  /*
    ══ El vacío ofrece las DOS rutas ══════════════════════════════════════════

    Enseñaba un solo botón, «Nuevo microciclo», y ese es justo el momento
    en el que copiar vale más que en ningún otro: das de alta a alguien y lo
    normal es montarlo como a otro que ya funciona. La otra ruta existía —dentro
    del menú ⋯ de una barra de microciclos que aquí ni siquiera se pinta—, así
    que en la práctica no existía. Quien no la conocía, montaba doce semanas a
    mano.
  */
  if (microcycles.length === 0) {
    return (
      <div className="stack">
        <EmptyState
          icon={Layers}
          title="Móntale su primer microciclo"
          message={
            bloquesCopiados.length > 0
              ? 'Pega el bloque que llevas copiado, empieza de cero o trae el fichero donde ya tengas su rutina: un Excel, un Word o un PDF.'
              : hayDeQuienTraer
                ? 'Empieza de cero, trae el fichero donde ya tengas su rutina —un Excel, un Word o un PDF—, o trae el programa de alguien a quien ya se lo tengas montado.'
                : 'Escríbela aquí o trae la que ya tienes en un Excel, un Word o un PDF. Si en el mismo fichero va su dieta, se trae también.'
          }
          action={
            <div className="row wrap gap-2">
              {/*
                ── Y AQUÍ ES DONDE MÁS VALE UN BLOQUE COPIADO ─────────────────
                Dar de alta a alguien y montarle lo mismo que a otro que ya
                funciona es el caso de uso entero del portapapeles, y era el
                único sitio donde no existía: sin programa no hay «+ bloque» que
                abrir, así que la mano se quedaba en gris y el bloque en ella.
                Va DELANTE del alta en blanco, porque quien lleva algo copiado
                ha venido a pegarlo.
              */}
              {verboPegarBloque('btn btn-primary btn-lg', pegarPrimerBloque)}
              <button
                type="button"
                className={`btn btn-lg ${bloquesCopiados.length > 0 ? 'btn-secondary' : 'btn-primary'}`}
                onClick={() => irA(startProgram(activeClient.id))}
              >
                <Plus size={15} /> Nuevo microciclo
              </button>
              {/*
                El momento exacto de la mudanza: alguien que acaba de dar de alta
                a un cliente y tiene su rutina abierta en la otra pestaña. Aquí
                es donde más vale, así que aquí sale, y no dentro de un menú.
              */}
              <button
                type="button"
                className="btn btn-secondary btn-lg"
                onClick={() => setPegarAbierto(true)}
              >
                <FileUp size={15} /> Traer de un fichero
              </button>
              {hayDeQuienTraer && (
                <button
                  type="button"
                  className="btn btn-secondary btn-lg"
                  onClick={() => setCopyOpen(true)}
                  aria-expanded={copyOpen}
                >
                  <Users size={15} /> Traer de otro cliente
                </button>
              )}
            </div>
          }
        />

        {/* Y la mano lo dice también: «Pegar «Acumulación» en Marta». Aquí no
            hay bloque abierto, así que el sitio es la PERSONA. */}
        <Destino
          tipos={[TIPO.BLOQUE]}
          donde={nombreCorto}
          prioridad={0}
          pegar={pegarPrimerBloque}
        />

        {panelDeCopia}
        {dialogoDePegado}
      </div>
    );
  }

  /*
    ══ Los AJUSTES del programa, fuera del plan ══════════════════════════════

    Cuándo empieza, si la estructura es semanal o rotativa, el patrón del ciclo
    y qué módulos se usan con este cliente. Son decisiones de una vez, y
    estaban al final de la pantalla del bloque dentro de un pliegue cerrado
    —debajo de todo lo que ellas mismas ordenan, y por tanto invisibles—.

    Ahora el reparto de la semana, que es lo único de ahí que se toca al
    plantear, ABRE el plan del bloque; y esto se abre en un diálogo desde el
    engranaje de la línea de bloques, que es donde se busca lo que se
    configura una vez.
  */
  const ajustesDelPrograma = (
    <CycleSettings
      client={activeClient}
      onChange={(fields) => updateClient(activeClient.id, fields, { immediate: false })}
      protocol={protocol}
      /* Igual que el interruptor de la dieta: cambiar el protocolo desde aquí
         es hacerlo para ESTE cliente, así que queda marcado como excepción y
         «poner al día» deja de pasarle por encima. */
      onProtocolChange={(next) => saveClientException(activeClient.id, { protocol: next })}
      /* Y de dónde salen esos interruptores, con la puerta a su protocolo
         entero, que es su pestaña «Protocolo». */
      pie={<PieDeProtocolo client={activeClient} />}
    />
  );

  const Lista = esTelefono ? ExerciseList : HojaDeSeries;
  const ejerciciosDelDia = nav.day?.exercises || [];
  const ejercicioEnFoco =
    ejerciciosDelDia.find((ex) => ex.id === focoEjercicio) || ejerciciosDelDia[0] || null;

  /*
    ══ La pantalla ES la hoja ═══════════════════════════════════════════════════

    Lo que se ve al entrar: la columna de semanas y días, la hoja de series del
    día y el histórico del ejercicio en foco. Nada más. Todo lo que rodeaba a la
    hoja —la fecha del microciclo, las sesiones, la indicación, el
    calentamiento, lo que contó al terminar, la estructura del programa— se
    toca una vez por día o por semana, y vive en el panel de «Detalles», que se
    abre por el canto derecho y se cierra donde estabas. Las acciones sobre la
    semana y el día (duplicar, traer, eliminar) están en el menú de la barra.

    Hubo una versión que dejaba todo eso en la página, plegado o no, y el dueño
    lo describió con razón como «saturado, en un espacio diminuto y con cosas
    que sobran». La regla que quedó: en la pestaña de programar, cada píxel
    que no es una serie estorba.
  */
  const unidad = unitLabel(cycleType);
  const unidades = unitLabelPlural(cycleType);
  /* La unidad cambia de género —la semana, el microciclo— y estas frases la
     llevan dentro: «ninguna semana montada» / «ningún microciclo montado». */
  const fem = unitIsFeminine(cycleType);
  const ningun = fem ? 'ninguna' : 'ningún';
  const montada = fem ? 'montada' : 'montado';
  /*
    ── El bloque ──────────────────────────────────────────────────────────────
    La tira enseña las semanas DEL BLOQUE de la semana abierta, no todas: un
    bloque es una estructura, y sus semanas son sus repeticiones. Los otros
    bloques se alcanzan desde el selector de la izquierda. Ver `domain/blocks`.
  */
  const bloque = blockOfWeek(program, nav.week);
  const esBloqueActual = isCurrentBlock(program, bloque);
  const semanasDelBloque = weeksOfBlock(program, bloque);
  /* Las semanas se cuentan dentro del bloque: el bloque 2 empieza por la S1. */
  const enBloque = (w) => weekInBlock(program, w).n;
  const etiqueta = (w) => weekLabel(program, w, unitInitial(cycleType));

  /*
    ── Quitar un bloque ───────────────────────────────────────────────────────
    Abrirlos se podía; deshacerlo, no: un «+ bloque» de más se quedaba para
    siempre en la cinta. Se pregunta antes y se dice A DÓNDE van sus semanas,
    porque lo que se quita es la SEPARACIÓN y no el entrenamiento (ver
    `deleteBlockFrom`). Después no hay nada que navegar: las semanas no cambian
    de número, así que la abierta sigue abierta —ahora dentro del bloque que la
    ha recogido—.
  */
  const quitarBloque = async (b) => {
    const lista = blocksOf(program);
    const i = lista.findIndex((x) => x.id === b.id);
    if (lista.length < 2 || i === -1) return;
    const destino = i > 0 ? lista[i - 1] : lista[1];
    const suyas = weeksOfBlock(program, b).length;
    const cuantas = suyas === 1 ? `su ${unidad.toLowerCase()}` : `sus ${suyas} ${unidades.toLowerCase()}`;
    const ok = await confirm({
      title: `¿Quitar «${b.name}»?`,
      message:
        suyas > 0
          ? `${cuantas.charAt(0).toUpperCase()}${cuantas.slice(1)} ${suyas === 1 ? 'pasa' : 'pasan'} a «${destino.name}» con todo lo registrado dentro: no se borra ningún entrenamiento. Lo que se deshace es la separación entre los dos bloques.`
          : `No tiene ${ningun} ${unidad.toLowerCase()} ${montada}: no se pierde nada.`,
      confirmLabel: 'Quitar el bloque',
      tone: 'danger',
    });
    if (!ok) return;
    deleteBlock(activeClient.id, b.id);
    toast({ text: suyas > 0 ? `«${b.name}» quitado: ${cuantas} ${suyas === 1 ? 'está' : 'están'} en «${destino.name}».` : `«${b.name}» quitado.` });
  };
  /* El calentamiento es de cada día: lo que se hace antes de ESE entreno. */
  /* El mismo resolutor que usa el portal del cliente: lo propio del día y, si no lo
     tiene, lo del programa (heredado de antes de que el calentamiento fuera por día). */
  const calentamientoDelDia = nav.day ? drillsForDay(program, nav.day) : [];
  const calentamientoHeredado = Boolean(nav.day) && !dayHasOwnDrills(nav.day) && calentamientoDelDia.length > 0;
  /*
    ── El calentamiento que se quedó atrás ──────────────────────────────────
    Dentro de un bloque cada semana nace con el calentamiento de sus días. Las
    semanas creadas antes de que fuera así (o por un servidor sin la migración
    0087) tienen los días sin él aunque la anterior sí lo tenga. Se busca la
    semana más cercana del bloque que aporte calentamiento a alguno de los días
    que aquí no lo tienen, y se ofrece traerlo de un golpe para toda la semana.
  */
  const calentamientoDeAntes = (() => {
    if (!nav.microcycle) return null;
    /* Sin calentamiento de verdad: ni propio ni del programa. Un `[]` cuenta como
       faltante: es lo que dejó la copia rota, no una decisión de «este día no». */
    const faltan = nav.days.filter((d) => drillsForDay(program, d).length === 0);
    if (faltan.length === 0) return null;
    const anteriores = semanasDelBloque.filter((w) => w < nav.week).sort((a, b) => b - a);
    for (const w of anteriores) {
      const m = microcycles.find((x) => x.weekNumber === w);
      const dias = faltan
        .map((d) => ({ dayName: d.dayName, drills: m?.days.find((o) => o.dayName === d.dayName)?.mobilityDrills || [] }))
        .filter((d) => d.drills.length > 0);
      if (dias.length > 0) return { week: w, dias };
    }
    return null;
  })();
  const traerCalentamiento = () => {
    if (!calentamientoDeAntes) return;
    calentamientoDeAntes.dias.forEach(({ dayName, drills }) => setDayDrills(activeClient.id, nav.week, dayName, deepClone(drills)));
    toast({
      text: `Calentamiento de ${unidad.toLowerCase()} ${calentamientoDeAntes.week} traído a ${calentamientoDeAntes.dias.length === 1 ? 'este día' : `${calentamientoDeAntes.dias.length} días`}.`,
    });
  };

  const eliminarSemana = () => {
    const cycle = nav.microcycle;
    /* Si era la única del bloque abierto, con ella se va el bloque: se guarda lo
       que hace falta para que «Deshacer» lo devuelva entero. */
    const estructura = { blocks: program.blocks || [], weeklySplit: program.weeklySplit, mobilityDrills: program.mobilityDrills };
    irA(removeMicrocycle(activeClient.id, nav.week) || 1);
    if (!cycle) return;
    toast({
      /* «Quitado» y no «eliminado»: el aviso que lo dice lleva «Deshacer» al
         lado, y ése es exactamente el criterio (producto.md §5.7). */
      text: `${unidad} ${enBloque(cycle.weekNumber)} ${fem ? 'quitada' : 'quitado'}.`,
      duration: 10000,
      action: {
        label: 'Deshacer',
        onClick: () => {
          restoreMicrocycle(activeClient.id, cycle, estructura);
          irA(cycle.weekNumber);
        },
      },
    });
  };


  /*
    ══════════════════════════════════════════════════════════════════════════
    ESCRIBIR EN EL BLOQUE
    ══════════════════════════════════════════════════════════════════════════

    El plan es del bloque, así que cada gesto de esta vista es UNA escritura.

    ── Lo que había, y por qué se ha ido ─────────────────────────────────────
    Antes el plan vivía copiado en cada microciclo, así que un cambio había que
    REPARTIRLO a los que quedaban por entrenar, con una copia del ejercicio por
    microciclo y su propio identificador. De ahí salían tres cosas que ya no
    existen: el reparto, el aviso de «no queda dónde escribir» —cuando todos los
    microciclos del bloque estaban entrenados, el cambio no cabía en ninguno— y
    el rellenado con la plantilla, porque ya no hay huecos que rellenar: un
    microciclo nuevo nace con el plan del bloque puesto.

    ── Lo entrenado no corre peligro ─────────────────────────────────────────
    Vive en las sesiones registradas, que esto no toca. Cambiar el plan no
    reescribe lo que alguien ya levantó; solo cambia lo que le toca hacer.

    ── La migración va sola ──────────────────────────────────────────────────
    Estas funciones escriben a través de `applyPlan`, que sube el plan al bloque
    antes de tocarlo si todavía no estaba (`domain/blocksMigration`). Es
    idempotente: la primera vez migra, las demás no hacen nada.
  */

  /*
    ── La bitácora ───────────────────────────────────────────────────────────
    Lo que se escribe aquí es del PLAN, así que su alcance es siempre el bloque
    entero. El alcance «semana» queda para la excepción, que se hace desde la
    hoja. Ver `logBlockChange` en `domain/blocks`.
  */
  const apuntar = (entry) => logBlockChange(activeClient.id, bloque.id, entry);
  const apuntarEnBloque = (hoja, entry) => apuntar({ alcance: 'bloque', semanas: [], hoja, ...entry });

  /*
    ── Guardar el día como pieza tuya ────────────────────────────────────────
    Lee el plan efectivo de la hoja —venga del bloque o del microciclo de
    referencia— y lo deja en el CAJÓN, que desde la 0112 es la tabla
    `coach_templates` del equipo y no `profiles.preferences`.

    El gesto es el de las tres puertas (`useGuardarEnPlantillas`): ésta, la
    ficha de la mano y `/plantillas` al llegar con algo copiado. Lo que antes
    estaba escrito aquí —el tope, el desempate del nombre, el aviso de que la
    hoja está en blanco— es lo mismo que estaba escrito en las otras dos con
    otras palabras. Lo único que sabe esta pantalla es CUÁL es el día.

    Ponerlo se hace desde el Compositor, que es quien lee el cajón (`comoLista`
    en `domain/cajon`) y donde se monta el bloque.
  */
  const guardarPieza = (dayName) => {
    const semanas = weeksOfBlock(program, bloque);
    const dia = semanas.length > 0 ? planOfDay(program, semanas[semanas.length - 1], dayName) : null;
    guardarEnPlantillas({
      tipo: TIPO.HOJA,
      titulo: dayName,
      carga: { dayName, exercises: dia?.exercises || [] },
    });
  };

  const anadirEjercicioAlBloque = (dayName, exercise) => {
    addBlockExercise(activeClient.id, bloque.id, dayName, cloneExerciseAsTemplate(exercise));
    apuntarEnBloque(dayName, { kind: BLOCK_CHANGE.EJERCICIO_MAS, que: exercise.name });
    toast({ text: `«${exercise.name}» añadido a ${dayName}.` });
  };

  const quitarEjercicioDelBloque = (dayName, name) => {
    const quitado = removeBlockExercise(activeClient.id, bloque.id, dayName, name);
    /* Que no estuviera es un fallo de verdad —la fila se está viendo—, y salir
       en silencio dejaba la pantalla igual sin decir por qué: el gesto parecía
       no haber funcionado. Se dice. */
    if (!quitado) {
      toast({ text: `«${name}» ya no estaba en ${dayName}. Recarga la ficha si sigue en pantalla.` });
      return;
    }
    apuntarEnBloque(dayName, { kind: BLOCK_CHANGE.EJERCICIO_MENOS, que: name });
    toast({
      text: `«${name}» quitado de ${dayName}.`,
      action: {
        label: 'Deshacer',
        onClick: () => restoreBlockExercise(activeClient.id, bloque.id, dayName, quitado.exercise, quitado.index),
      },
    });
  };

  /* Arrastrar un ejercicio dentro de su hoja, en el conjunto. Es el mismo
     gesto —y la misma escritura— que arrastrarlo en la tabla de la hoja. */
  const moverEjercicioDelBloque = (dayName, name, delta) =>
    moveBlockExercise(activeClient.id, bloque.id, dayName, name, delta);

  const seriesDelBloque = (dayName, name, n, antes) => {
    setBlockExerciseSets(activeClient.id, bloque.id, dayName, name, n);
    apuntarEnBloque(dayName, { kind: BLOCK_CHANGE.SERIES, que: name, de: antes, a: n });
  };

  const repsDelBloque = (dayName, name, reps) =>
    setBlockExerciseTarget(activeClient.id, bloque.id, dayName, name, reps);

  const anadirHojaAlBloque = (nombre) => {
    addBlockSheet(activeClient.id, bloque.id, nombre);
    apuntarEnBloque(nombre, { kind: BLOCK_CHANGE.HOJA_MAS, que: nombre });
    toast({ text: `«${nombre}» añadida al bloque.` });
  };

  const renombrarHojaDelBloque = (de, a) => renameBlockSheet(activeClient.id, bloque.id, de, a);
  const moverHojaDelBloque = (from, to) => moveBlockSheet(activeClient.id, bloque.id, from, to);

  /*
    Quitar una hoja del bloque quita el PLAN, no lo entrenado: las sesiones que
    se hicieran de ella siguen en sus microciclos y se siguen leyendo. Antes
    había que ir microciclo a microciclo saltándose los que tuvieran sesión
    anotada, y avisar de en cuántos se quedaba; ahora el plan y el registro
    están separados de verdad y no hay nada que esquivar.
  */
  const quitarHojaDelBloque = (nombre) => {
    removeBlockSheet(activeClient.id, bloque.id, nombre);
    apuntarEnBloque(nombre, { kind: BLOCK_CHANGE.HOJA_MENOS, que: nombre });
    toast({ text: `«${nombre}» quitada del bloque. Lo que se entrenó de ella se conserva.` });
  };

  /*
    ── LOS NOMBRES QUE YA ESTÁN COGIDOS ──────────────────────────────────────
    Y no `blockSessionsOf(bloque)` a pelo, que es la misma trampa que documenta
    `piezaDeBloque` unas líneas más abajo: la migración del plan es PEREZOSA
    —corre la primera vez que se toca el plan, ver `applyPlan`—, así que en un
    bloque que todavía lo tiene repartido por sus microciclos esa lectura
    devuelve CERO nombres.

    Y con cero nombres el daño no es cosmético. `freeSheetName` no ve el choque
    y devuelve «Empuje»; `addBlockSessionIn` no crea nada, porque una hoja con
    ese nombre YA existe tras migrar y devuelve el bloque tal cual; y los
    ejercicios de la pieza caen DENTRO de la hoja del cliente, que pasa de seis
    a doce. El «Deshacer» del aviso remata: quita «Empuje» por su nombre y se
    lleva la hoja entera —la suya de siempre incluida—. Medido con la
    aplicación delante el 10 sep 2026.
  */
  const nombresDeHojaDelBloque = () => {
    const migrado = migrateBlockPlans(program).program;
    const suyo = blocksOf(migrado).find((b) => b.id === bloque?.id) || bloque;
    return blockSessionsOf(suyo).map((hoja) => hoja.dayName);
  };

  /*
    ── Duplicar una hoja ─────────────────────────────────────────────────────
    «Otro día igual que el lunes pero cambiando dos cosas» es cómo se monta la
    mitad de las rutinas. Estaba como `duplicateDay`, que copiaba el día dentro
    del microciclo: desde que el plan vive en el bloque, eso lo pisaba la
    proyección y el gesto no hacía nada. Copia al PLAN, con ids nuevos —los
    mismos cuidados que poner una pieza— para no cruzar registros.
  */
  const duplicarHojaDelBloque = (dayName) => {
    const origen = planOfDay(program, nav.week, dayName);
    if (!origen) return;
    const nombre = freeSheetName(dayName, nombresDeHojaDelBloque());
    addBlockSheet(activeClient.id, bloque.id, nombre);
    (origen.exercises || []).forEach((ex) =>
      addBlockExercise(activeClient.id, bloque.id, nombre, cloneExerciseAsTemplate(ex))
    );
    apuntarEnBloque(nombre, { kind: BLOCK_CHANGE.HOJA_MAS, que: nombre });
    toast({ text: `«${nombre}» añadida al bloque con los ${(origen.exercises || []).length} ejercicios de «${dayName}».` });
  };

  /*
    ══ COPIAR Y PEGAR, CON EL PORTAPAPELES EN MEDIO ═══════════════════════════

    «El copiar quizás sería mejor plantearlo como lo hace Efort: tener un
    portapapeles útil como herramienta para andar copiando y pegando cosas.»

    Lo que cambia no es cuántos verbos hay, sino que ahora hay un PASO
    INTERMEDIO. Antes, ⧉ significaba «duplica esto aquí mismo»: origen y destino
    se decidían en el mismo clic, así que copiar la hoja de Marta al bloque de
    Luis no era una operación lenta — era una operación que no existía. Con la
    bandeja en medio (`lib/portapapeles`), ⧉ significa «esto queda copiado» y el
    destino se elige después, en el «+» del sitio donde caiga, que puede ser otra
    pantalla y otro cliente.

    ── Y duplicar en el sitio no se pierde ───────────────────────────────────
    Sigue estando, donde tiene sentido preguntarlo: dentro del «+ hoja», como
    «Copia de «Lower A»». Un portapapeles que obliga a dos gestos para el caso
    fácil —«otro día igual que el lunes»— sería peor herramienta que la que
    sustituye, y ese caso es la mitad de las rutinas que se montan.

    ── Lo que NO viaja: el microciclo ────────────────────────────────────────
    Está explicado en `TIPO` (`lib/portapapeles`): desde que el plan vive en el
    bloque, un microciclo guarda fechas, excepciones y lo REGISTRADO esa semana.
    Copiar eso a otro cliente es copiarle el historial. Lo que la gente quiere
    decir con «copia esta semana» son sus HOJAS, y las hojas sí viajan.
  */
  const deQuien = activeClient?.name || null;

  const copiarHoja = (dayName) => {
    const origen = planOfDay(program, nav.week, dayName);
    if (!origen) return;
    /* Se guarda ya como PLANTILLA —sin ids de registro y sin lo levantado—: lo
       que se copia de una hoja es lo que hay que hacer, no lo que hizo esta
       persona. Es el mismo saneo que al poner una pieza. */
    const ejercicios = (origen.exercises || []).map(cloneExerciseAsTemplate);
    /* La forma de una hoja copiada la pone `piezaDeHoja`, y no está aquí a mano
       porque hay tres puertas que la producen —ésta, traer un día de otro
       cliente y traer un fichero— y una sola que la lee. */
    copiarAlPortapapeles(
      piezaDeHoja({ dayName, exercises: ejercicios, cliente: deQuien, donde: bloque.name })
    );
    /*
      ── SIN AVISO, A PROPÓSITO ────────────────────────────────────────────────
      Es la ley II de la mano (ver `ui/Portapapeles`): el aviso es de lo que
      CAMBIA y la mano es de lo que LLEVAS. Copiar no le cambia nada a nadie, y
      aquí salían los dos a la vez diciendo lo mismo —dos voces para un gesto—.
      Ahora lo nombra la mano dos segundos y se queda ahí, que además contesta
      lo que el aviso tenía que explicar con una frase: dónde ha ido a parar.
    */
  };

  /*
    ══ Y PEGAR SE DESHACE ═════════════════════════════════════════════════════

    La otra mitad de la ley de la casa —lo que escribe en el programa de alguien
    se ve antes y se deshace después— la tenía el aviso desde siempre
    (`ToastProvider` acepta su «Deshacer») y no la usaba ninguno de los pegados.
    Y pegar es justo donde hace falta: un menú son seis comidas al final de la
    lista y una hoja son diez ejercicios, así que enmendar un pegado equivocado
    costaba tantos clics como piezas tuviera.

    Lo que hace cada «Deshacer» es la escritura INVERSA, y nada más: no retira lo
    apuntado en la bitácora, igual que no lo retira el de quitar un ejercicio.
    La bitácora cuenta lo que se hizo, y pegar y arrepentirse es algo que pasó.
  */
  const pegarHoja = (pieza) => {
    const ejercicios = pieza.carga?.exercises || [];
    const nombre = freeSheetName(pieza.carga?.dayName || 'Hoja', nombresDeHojaDelBloque());
    addBlockSheet(activeClient.id, bloque.id, nombre);
    /* Se vuelve a clonar al pegar aunque la carga ya venga limpia: la misma
       pieza se puede pegar cinco veces, y sin ids nuevos las cinco copias
       compartirían los del ejercicio original. */
    ejercicios.forEach((ex) => addBlockExercise(activeClient.id, bloque.id, nombre, cloneExerciseAsTemplate(ex)));
    apuntarEnBloque(nombre, { kind: BLOCK_CHANGE.HOJA_MAS, que: nombre });
    toast({
      text: `«${nombre}» pegada en «${bloque.name}» con sus ${ejercicios.length} ${
        ejercicios.length === 1 ? 'ejercicio' : 'ejercicios'
      }.`,
      /* Por el NOMBRE y no por un índice: `freeSheetName` acaba de garantizar
         que no hay otra hoja que se llame así, y el nombre sobrevive a que se
         añada o se mueva cualquier otra mientras el aviso está en pantalla. */
      action: { label: 'Deshacer', onClick: () => removeBlockSheet(activeClient.id, bloque.id, nombre) },
    });
  };

  /*
    ══ Y UNA HOJA CAE TAMBIÉN ENCIMA DE OTRA ══════════════════════════════════

    Pegar una hoja abría una hoja NUEVA, y ese es el gesto de montar el bloque.
    El otro —«el lunes de esta persona pasa a ser este otro entrenamiento»— no
    se podía: había que pegar la hoja al lado, mover los ejercicios y borrar la
    vieja, y por el camino se perdía el nombre, que es lo único que el cliente
    reconoce («Lower A» sigue siendo su Lower A aunque dentro cambie entero).

    Por eso esto conserva el NOMBRE de la hoja que recibe y cambia lo que lleva
    dentro. Es la misma ley que la pauta de un ejercicio (`pegarPauta`): lo que
    viaja es el contenido; la identidad es del que está en su sitio.

    ── Y hace la pregunta del tramo, como todo lo que escribe en el plan ──────
    «Solo este microciclo» aquí es la semana de descarga —el mismo lunes, con
    otra cosa dentro, y a la siguiente vuelve el de siempre—, que es justo lo que
    un modelo de semanas duplicadas no puede ofrecer. Sin tramo se cambia la
    línea base del bloque; con tramo se anota como excepción y el bloque no se
    toca. Ver `TramoDelPegado`, que es la misma ventana del pegado de ejercicio.
  */
  const sustituirHoja = (pieza, dayName) => {
    /* Sin pieza no hay nada que poner: la mano puede haberse vaciado en otra
       pestaña entre pintar el verbo y pulsarlo. Es la misma clase de fallo que
       PP-00 —el pegado que reventaba por un argumento que no venía—. */
    if (!pieza || !blockSessionOf(bloque, dayName)) return;
    /* Con un solo microciclo las tres respuestas hacen lo mismo, así que no se
       pregunta: es el mismo peaje que evita `pegarEjercicio`. */
    if (semanasDelBloque.length > 1) {
      setSustitucion({ pieza, dayName });
      return;
    }
    sustituirHojaAhora(pieza, dayName);
  };

  const sustituirHojaAhora = (pieza, dayName, alcance) => {
    const hoja = blockSessionOf(bloque, dayName);
    if (!hoja) return;
    setSustitucion(null);
    const antes = hoja.exercises || [];
    /* Se clona al pegar: la misma pieza puede caer en cinco hojas y sin ids
       nuevos las cinco compartirían los del original. */
    const nuevos = (pieza.carga?.exercises || []).map(cloneExerciseAsTemplate);
    const que = pieza.carga?.dayName || pieza.titulo;
    const cuantos = `${nuevos.length} ${nuevos.length === 1 ? 'ejercicio' : 'ejercicios'}`;
    const semanas = alcance?.semanas;

    if (semanas === undefined) {
      setBlockSheetExercises(activeClient.id, bloque.id, dayName, nuevos);
      apuntarEnBloque(dayName, { kind: BLOCK_CHANGE.PLANTILLA, que });
      toast({
        text: `«${dayName}» pasa a ser «${que}», con sus ${cuantos}.`,
        /* El inverso es la lista de antes, entera y de una vez: por eso existe
           `setBlockSheetExercises` y no se hace con N bajas y M altas. */
        action: {
          label: 'Deshacer',
          onClick: () => setBlockSheetExercises(activeClient.id, bloque.id, dayName, antes),
        },
      });
      return;
    }

    /*
      ── El tramo: la hoja de estas semanas, sin tocar el bloque ──────────────
      Una baja por cada ejercicio de la línea base y un alta por cada uno de los
      que entran, todas con el mismo tramo. Los `buildOverride` se hacen AQUÍ
      —la función es del dominio y devuelve el cambio con su id puesto— para
      poder deshacerlos por id: `addPlanExercise` y `removePlanExerciseOnly`
      harían lo mismo pero sin decir qué han escrito.

      Lo que esta semana solo existe como excepción (un alta puntual de otro
      día) se queda: es un cambio que alguien hizo a propósito para ella, y
      pisarlo sin decirlo sería borrar trabajo por el camino.
    */
    const hasta = nav.week + Math.max(0, semanas - 1);
    const at = new Date().toISOString();
    const cambios = [
      ...antes.map((ex) =>
        buildOverride({
          dayName,
          targetId: ex.id,
          exercise: null,
          sobre: ex.name,
          fromWeek: nav.week,
          toWeek: hasta,
          at,
        })
      ),
      ...nuevos.map((ex) =>
        buildOverride({ dayName, exercise: ex, fromWeek: nav.week, toWeek: hasta, at })
      ),
    ];
    cambios.forEach((cambio) => addOverride(activeClient.id, bloque.id, cambio));
    const cubiertas = [];
    for (let w = nav.week; w <= hasta; w += 1) cubiertas.push(w);
    apuntar({ alcance: 'semana', semanas: cubiertas, hoja: dayName, kind: BLOCK_CHANGE.PLANTILLA, que });
    toast({
      text: `«${dayName}» es «${que}» ${
        cubiertas.length === 1 ? `solo en ${etiqueta(nav.week)}` : `de ${etiqueta(nav.week)} a ${etiqueta(hasta)}`
      }. El bloque no se toca.`,
      action: {
        label: 'Deshacer',
        onClick: () => cambios.forEach((cambio) => dropOverride(activeClient.id, bloque.id, cambio.id)),
      },
    });
  };

  /*
    El ejercicio es la pieza pequeña, y la que más se mueve: «este press con
    estas cinco series, igual en el día B». Se copia con sus series y sus
    objetivos —que es lo que Efort vende como «copy sets between exercises»— y
    se pega en la hoja que sea, de quien sea.
  */
  const copiarEjercicio = (ex) => {
    const plantilla = cloneExerciseAsTemplate(ex);
    const series = (plantilla.sets || []).length;
    copiarAlPortapapeles({
      tipo: TIPO.EJERCICIO,
      titulo: ex.name,
      detalle: `${series} ${series === 1 ? 'serie' : 'series'}`,
      origen: {
        cliente: deQuien,
        donde: [bloque.name, nav.day?.dayName].filter(Boolean).join(' · '),
        /* La hoja, aparte y con su nombre: es lo que propone el destino cuando
           este ejercicio se pone en varios clientes, y ahí hace falta el nombre
           solo, no la frase de dónde salió. Va en `origen` y no en la carga
           porque la carga ES el ejercicio, y colgarle ahí el nombre de su hoja
           metería un campo ajeno en algo que se clona y se escribe. Ver
           `domain/reparto`. */
        hoja: nav.day?.dayName || null,
      },
      carga: plantilla,
    });
    /* Sin aviso: lo dice la mano. Ver `copiarHoja`. */
  };

  /*
    ── PEGAR HACE LA MISMA PREGUNTA QUE EL ALTA ──────────────────────────────
    Añadir un ejercicio a mano dice hasta cuándo vale (el «Hasta cuándo» de
    `AddExerciseForm`) y pegarlo es el otro camino al mismo sitio: los dos
    terminan en `addPlanExercise`. Hasta ahora el pegado no preguntaba —pasaba
    el tramo vacío—, así que la respuesta «solo este microciclo» existía en el
    producto por un camino y no por el otro.

    La pregunta se hace en una ventana (`TramoDelPegado`) y NO en el menú de
    pegar, porque los tres tramos por cada pieza copiada son treinta y seis
    entradas con doce en la mano; y no se hace nunca cuando el bloque tiene un
    solo microciclo, porque ahí las tres respuestas hacen lo mismo. Ver la
    cabecera de `TramoDelPegado`.
  */
  const pegarEjercicio = (pieza) => {
    if (!nav.day) return;
    if (semanasDelBloque.length > 1) {
      setPegadoConTramo(pieza);
      return;
    }
    pegarEjercicioAhora(pieza);
  };

  const pegarEjercicioAhora = (pieza, alcance) => {
    if (!nav.day) return;
    /* `tramoDeAlta()` sin argumento, y no `tramoDeAlta(null)`: el valor por
       defecto de esa función solo cubre `undefined`, así que desestructurar
       `null` reventaba el pegado —y con él, ⌘V—. Sin argumento el ejercicio
       entra en el plan del bloque, que es lo que hace el alta cuando no se
       elige tramo. */
    /* El clon se hace ANTES y se guarda: su id es lo que le da al «Deshacer»
       algo que quitar —el mismo, esté en el plan del bloque o en la excepción
       que crea el tramo, que es lo que `removePlanExercise` resuelve—. */
    const nuevo = cloneExerciseAsTemplate(pieza.carga);
    const semana = nav.week;
    const hoja = nav.day.dayName;
    addPlanExercise(activeClient.id, semana, hoja, nuevo, tramoDeAlta(alcance));
    apuntarEnLaHoja({ kind: BLOCK_CHANGE.EJERCICIO_MAS, que: pieza.carga?.name || pieza.titulo });
    setPegadoConTramo(null);
    toast({
      text: `«${pieza.carga?.name || pieza.titulo}» pegado en «${hoja}».`,
      action: { label: 'Deshacer', onClick: () => removePlanExercise(activeClient.id, semana, hoja, nuevo.id) },
    });
  };

  /*
    ══ LA PAUTA: ESTA FILA, CON LAS SERIES DE AQUELLA ═════════════════════════

    «Dale a este remo las cinco series del press» es el gesto más repetido de
    programar y costaba tres: pegar el press, renombrarlo y borrar el remo.

    ── Por qué no es una pieza más del portapapeles ──────────────────────────
    Porque sería decidir al COPIAR algo que solo se sabe al pegar: cuando se
    pulsa ⧉ sobre el press todavía no está decidido si eso acabará siendo otra
    fila o la pauta de una que ya existe. Así que lo que se lleva en la mano es
    siempre el ejercicio, y esto es otra manera de soltarlo. Es el mismo
    razonamiento que el del tramo, que tampoco es un tipo.

    ── Y por qué aquí no se pregunta el tramo ────────────────────────────────
    Porque esto no da de alta nada: cambia una fila que ya está, así que va donde
    esa fila vive —el plan o su excepción, lo resuelve `updatePlanExercise`—,
    igual que cambiarle una serie a mano. Quien quiera que el cambio dure solo
    unas semanas lo dice antes, con «Cambiarlo solo este microciclo» de la propia
    fila, y a partir de ahí esto cae ya en la excepción.
  */
  const pegarPauta = (pieza, ex) => {
    if (!nav.day || !ex) return;
    const antes = ex.sets || [];
    const descanso = ex.restSeconds;
    const semana = nav.week;
    const hoja = nav.day.dayName;
    updatePlanExercise(activeClient.id, semana, hoja, ex.id, (suyo) => conLaPauta(suyo, pieza.carga));
    apuntarEnLaHoja({
      kind: BLOCK_CHANGE.SERIES,
      que: ex.name,
      de: antes.length,
      a: (pieza.carga?.sets || []).length,
    });
    toast({
      text: `«${ex.name}» con la pauta de «${pieza.carga?.name || pieza.titulo}».`,
      action: {
        label: 'Deshacer',
        onClick: () =>
          updatePlanExercise(activeClient.id, semana, hoja, ex.id, (suyo) => ({
            ...suyo,
            restSeconds: descanso,
            sets: antes,
          })),
      },
    });
  };

  /* Lo que leen `⌘C` y `⌘V`. Se asigna en el RENDER y no en un efecto porque
     arriba hay dos retornos tempranos: un efecto tendría que vivir por encima de
     ellos, y ahí todavía no existen ni el ejercicio en foco ni los verbos. Aquí
     abajo el ref solo se rellena si la pantalla ha llegado a pintarse entera, y
     el render que se va por un retorno temprano lo deja en blanco (se pone a
     `null` arriba, con el resto de los ganchos). Nadie lo lee mientras se pinta:
     solo el oyente de teclado, que corre después. */
  atajos.current = {
    copiar: vista === 'hoja' && ejercicioEnFoco ? () => copiarEjercicio(ejercicioEnFoco) : null,
    pegar: vista === 'hoja' && nav.day && ejerciciosCopiados[0] ? () => pegarEjercicio(ejerciciosCopiados[0]) : null,
  };

  /* El aviso confirma lo que acaba de pasar y ofrece el camino de vuelta, que
     es el trato de siempre en esta app: deshacer lleva su «Rehacer» dentro.
     No nombra el bloque porque lo deshecho puede ser de otro —quitar un
     bloque entero, por ejemplo— y el aviso no puede prometer más de lo que
     sabe. Qué ha vuelto se ve en la mesa, en el mismo instante. */
  const deshacerElPlan = () => {
    if (!deshacerPlan(activeClient.id)) return;
    toast({
      text: 'Deshecho el último cambio del plan.',
      action: { label: 'Rehacer', onClick: () => rehacerPlan(activeClient.id) },
    });
  };

  const rehacerElPlan = () => {
    if (!rehacerPlan(activeClient.id)) return;
    toast({ text: 'Rehecho.' });
  };

  atajosDeshacer.current = {
    deshacer: pasos.atras > 0 ? deshacerElPlan : null,
    rehacer: pasos.adelante > 0 ? rehacerElPlan : null,
  };

  /* ── Y el mismo par, a la vista ──────────────────────────────────────────
     Un atajo que no se anuncia no existe para quien no lo conoce. Los dos
     mandos salen SOLO cuando hay algo que deshacer o que rehacer: es la ley
     del reposo —una oferta que no se puede aceptar es mobiliario— y además es
     la única señal de que la pila está ahí. */
  const mandosDeDeshacer =
    pasos.atras > 0 || pasos.adelante > 0 ? (
      <>
        {pasos.atras > 0 && (
          <button
            type="button"
            className="btn btn-icon btn-icon-compact"
            title="Deshacer el último cambio del plan (⌘Z)"
            aria-label="Deshacer el último cambio del plan"
            onClick={deshacerElPlan}
          >
            <Undo2 size={15} />
          </button>
        )}
        {pasos.adelante > 0 && (
          <button
            type="button"
            className="btn btn-icon btn-icon-compact"
            title="Rehacer (⌘⇧Z)"
            aria-label="Rehacer el cambio deshecho"
            onClick={rehacerElPlan}
          >
            <Redo2 size={15} />
          </button>
        )}
      </>
    ) : null;

  /*
    ── UN BLOQUE, HECHO PIEZA ────────────────────────────────────────────────
    Lo usan los dos caminos por los que un bloque sale de esta ficha: copiarlo a
    la mano y ponerlo en varios clientes. Estaba escrito dos veces —el panel
    tenía su propia lectura— y las dos lecturas no coincidían: aquí se leían las
    hojas de `blockSessionsOf` a pelo, que en un programa que todavía tiene el
    plan repartido por sus microciclos devuelve CERO. La migración es perezosa
    (corre la primera vez que se toca el plan, ver `applyPlan`), así que hay que
    hacer aquí lo mismo que ella o copiar un bloque sin migrar daba un bloque
    vacío.
  */
  const piezaDeBloque = (elBloque) => {
    const migrado = migrateBlockPlans(program).program;
    const suyo = blocksOf(migrado).find((b) => b.id === elBloque.id) || elBloque;
    const hojas = blockSessionsOf(suyo).map((hoja) => ({
      dayName: hoja.dayName,
      exercises: (hoja.exercises || []).map(cloneExerciseAsTemplate),
    }));
    if (hojas.length === 0) return null;
    /* Lo que hace de un bloque una ESTRUCTURA y no un montón de hojas: a qué
       juega, cuánto se previó que durase y qué se persigue. Iban fuera de la
       carga, así que copiar «Acumulación · 6 semanas · subir el empuje» daba
       «Acumulación» con cuatro hojas. Ver `planDeLaPieza`. */
    const caracteristicas = blockTraits(suyo);
    /* Vacío es `null` y no `[]`: `startBlockWithPlan` escribe el calentamiento
       cuando le llega una lista, así que un `[]` le BORRARÍA al destinatario el
       suyo. Copiar el bloque de quien no calienta no es una orden de que el otro
       deje de hacerlo. */
    const calentamiento = structureOfBlock(migrado, suyo).mobilityDrills;
    return {
      tipo: TIPO.BLOQUE,
      titulo: elBloque.name,
      /* La intención delante del recuento: es lo que distingue dos bloques del
         mismo tamaño cuando la bandeja lleva tres. */
      detalle: [
        intentLabel(caracteristicas.intent),
        `${hojas.length} ${hojas.length === 1 ? 'hoja' : 'hojas'}`,
      ]
        .filter(Boolean)
        .join(' · '),
      origen: { cliente: deQuien, donde: null },
      carga: {
        name: elBloque.name,
        sessions: hojas,
        /* Por `structureOfBlock` y no por `suyo.mobilityDrills`: un bloque
           CERRADO lleva su calentamiento congelado dentro, pero el abierto no
           —el suyo es el del programa, vivo—, así que leerlo del bloque a secas
           copiaba el bloque en curso sin calentamiento. Las dos lecturas que se
           acaban de fundir tenían cada una la mitad de esto. */
        mobilityDrills: calentamiento?.length ? calentamiento : null,
        ...caracteristicas,
      },
    };
  };

  const copiarBloque = () => {
    const pieza = piezaDeBloque(bloque);
    if (!pieza) {
      toast({ text: `«${bloque.name}» no tiene ninguna hoja todavía: no hay nada que copiar.` });
      return;
    }
    copiarAlPortapapeles(pieza);
    /* Sin aviso: lo dice la mano. Ver `copiarHoja`. El de arriba se queda —«no
       hay nada que copiar» es de algo que NO ha pasado, y eso sí hay que
       decirlo—. */
  };

  /* «Mandarlo a otros clientes…», desde la fila de la lista de bloques. Es el
     mismo panel que abre la mano del portapapeles, con la misma pieza: repartir
     no depende de haber copiado antes, pero es exactamente la misma operación. */
  const mandarBloque = (elBloque) => {
    const pieza = piezaDeBloque(elBloque);
    if (!pieza) {
      toast({ text: `«${elBloque.name}» no tiene ninguna hoja todavía: no hay nada que mandar.` });
      return;
    }
    setMandandoBloque(pieza);
  };

  /*
    «Guardarlo en tus plantillas», desde la misma fila y con la MISMA pieza.

    Las tres cosas que se pueden hacer con un bloque que ya existe —copiarlo,
    mandarlo a varios y guardarlo— salen todas de `piezaDeBloque`, que es la
    única lectura de «qué es este bloque cuando sale de aquí». Antes había dos
    lecturas del mismo bloque que no coincidían y una de ellas copiaba cero
    hojas de un programa sin migrar.

    El gesto no vive aquí sino en `useGuardarEnPlantillas`: guardar tiene tres
    puertas —esta fila, la ficha de la mano y `/plantillas` al llegar con algo
    copiado— y las tres tienen que desempatar el nombre igual, respetar el mismo
    tope y decirlo con la misma frase.
  */
  const guardarBloque = (elBloque) => {
    const pieza = piezaDeBloque(elBloque);
    if (!pieza) {
      toast({ text: `«${elBloque.name}» no tiene ninguna hoja todavía: no hay nada que guardar.` });
      return;
    }
    guardarEnPlantillas(pieza);
  };

  /*
    Pegar un bloque CIERRA el abierto y abre el siguiente, que es lo que hace
    empezar un bloque en este producto (`startBlockWithPlan`). No es un efecto
    secundario que convenga esconder, así que se pregunta: es la misma
    conversación que «+ bloque», solo que con el plan ya puesto.
  */
  const pegarBloque = async (pieza) => {
    const hojas = pieza.carga?.sessions || [];
    /* El que se cierra es el ABIERTO, no el que se está mirando: desde la lista
       de bloques se puede pegar teniendo delante uno de hace tres meses, y la
       pregunta tiene que nombrar el que de verdad se va a cerrar. */
    const seCierra = currentBlock(program);
    const ok = await confirm({
      title: `¿Empezar «${pieza.titulo}» aquí?`,
      message: `Se cierra «${seCierra?.name || bloque.name}» y se abre un bloque nuevo con las ${hojas.length} hojas copiadas${
        pieza.origen?.cliente ? ` de ${pieza.origen.cliente}` : ''
      }. Lo entrenado hasta hoy se queda donde está.`,
      confirmLabel: 'Empezar el bloque',
    });
    if (!ok) return;
    const semana = startBlockWithPlan(activeClient.id, planDeLaPieza(pieza));
    if (semana) irA(semana, 0, 'bloque');
    toast({ text: `«${pieza.carga?.name || pieza.titulo}» empezado con sus ${hojas.length} hojas.` });
  };

  /*
    Quitar la hoja abierta: si era la última que quedaba, el bloque se quedaría
    sin plan, y eso no es lo que se está pidiendo —se dice y no se hace—. Si la
    quitada estaba al final, la selección se corre a la anterior para no quedar
    apuntando a un índice que ya no existe.
  */
  /*
    ── Y AHORA SÍ PREGUNTA ───────────────────────────────────────────────────
    Quitar una hoja vivía dentro de un «···» de un solo ítem, y ese gesto de más
    hacía de confirmación. El dueño lo ha tumbado —«solo está la opción de
    eliminar, para eso pon directamente el botón de papelera y ya»— y tiene
    razón: un menú de un ítem no es un menú. Pero un clic que se lleva una hoja
    con sus ejercicios y no se puede deshacer sí necesita una pregunta, así que
    la confirmación deja de ser un accidente de la maquetación y pasa a ser lo
    que ya usa el resto de la casa (`useConfirm`), como en `quitarBloque`.
  */
  const eliminarHoja = async (dayName) => {
    if (nav.days.length <= 1) {
      toast({ text: `«${dayName}» es la única hoja de «${bloque.name}»: añade otra antes de quitarla.` });
      return;
    }
    const cuantos = (nav.days.find((d) => d.dayName === dayName)?.exercises || []).length;
    const ok = await confirm({
      title: `¿Quitar «${dayName}»?`,
      message:
        cuantos > 0
          ? `Sale de «${bloque.name}» con sus ${cuantos} ${cuantos === 1 ? 'ejercicio' : 'ejercicios'}, en todos sus ${unidades.toLowerCase()}. Lo ya entrenado se queda en el historial.`
          : `Está en blanco: no se pierde nada.`,
      confirmLabel: 'Quitar la hoja',
      tone: 'danger',
    });
    if (!ok) return;
    quitarHojaDelBloque(dayName);
    if (nav.dayIndex >= nav.days.length - 1) irA(nav.week, Math.max(0, nav.days.length - 2));
  };

  /*
    ══ EL SEMÁFORO DE LA HOJA ════════════════════════════════════════════════
    Lo único que valía la pena de la rejilla del Conjunto, ahora en el carril
    donde se elige la hoja: si en el microciclo EN CURSO está hecha, a medias o
    pendiente, y cuál es la primera que queda por hacer.

    No es una receta ni una previsión: es el orden del plan —ya escrito— leído
    contra lo que hay registrado. Solo en el microciclo en curso: en uno pasado
    la hoja es archivo y el semáforo mentiría.
  */
  const enCursoAqui = Number.isFinite(semanaEnCurso) && nav.week === semanaEnCurso;
  const seriesDelPlanDe = (day) => (day.exercises || []).reduce((n, ex) => n + (ex.sets || []).length, 0);
  const seriesHechasDe = (dayName) =>
    sesionesDeLaSemana.filter((s) => s.dayName === dayName).reduce((n, s) => n + sessionSetCount(s), 0);
  const siguienteHoja = enCursoAqui
    ? nav.days.find((d) => seriesHechasDe(d.dayName) < seriesDelPlanDe(d))?.dayName || null
    : null;
  const estadoDeHoja = (day) => {
    if (!enCursoAqui) return null;
    const planeadas = seriesDelPlanDe(day);
    const hechas = seriesHechasDe(day.dayName);
    const cuando = `${fem ? 'esta' : 'este'} ${unidad.toLowerCase()}`;
    if (hechas === 0) {
      /* «la siguiente» y no «aún no»: en una lista sin cajas es lo único que
         dice por dónde va el microciclo sin leerse los cuatro semáforos. */
      return day.dayName === siguienteHoja
        ? { tono: 'aun', texto: 'la siguiente', title: `Aún no ${cuando} · es la primera que queda por hacer` }
        : { tono: 'aun', texto: 'aún no', title: `Aún no ${cuando}` };
    }
    if (planeadas > 0 && hechas >= planeadas) return { tono: 'ok', texto: 'hecha', title: `Hecha ${cuando}` };
    /* «7/18» y no «7 de 18 series»: la columna es estrecha y el title lo dice. */
    return { tono: 'warn', texto: `${hechas}/${planeadas}`, title: `${hechas} de ${planeadas} series ${cuando}` };
  };
  /*
    ── Y lo que se toca desde la HOJA ────────────────────────────────────────
    Aquí el alcance es siempre una semana: es el gesto de «a éste, esta semana,
    una serie más». No parte el bloque —sigue siendo el mismo— pero queda
    apuntado, que es justo lo que faltaba para poder mirar una semana rara tres
    meses después y saber si fue una decisión.
  */
  const apuntarEnLaHoja = (entry) =>
    nav.day && apuntar({ alcance: 'semana', semanas: [nav.week], hoja: nav.day.dayName, ...entry });

  /* La excepción de este microciclo sobre un ejercicio, si la hay. Se busca
     por el id del ejercicio que se está viendo, que es el de la excepción
     cuando la hay y el del bloque cuando no.

     Se pregunta al BLOQUE y no al microciclo: las excepciones viven en
     `block.overrides` con su tramo puesto, y `overridesAt` es quien sabe
     cuáles de ellas están vigentes esta semana (ver `domain/blocks`). */
  /* El alta dice cuántos microciclos dura; aquí se traduce a hasta cuál. Sin
     número, entra en el plan del bloque y no lleva tramo. */
  const tramoDeAlta = ({ semanas } = {}) =>
    semanas === undefined ? {} : { hasta: semanas === null ? null : nav.week + Math.max(0, semanas - 1) };

  const laExcepcionDe = (exId) =>
    overridesAt(bloque, nav.week, nav.day?.dayName).find((o) => o.exercise?.id === exId) || null;

  /**
   * Una serie más o una menos desde la hoja abierta.
   *
   * Va al PLAN —al bloque, o a la excepción de esta semana si el ejercicio solo
   * existía ahí—, que es donde vive lo que se está viendo. Antes escribía en el
   * día del microciclo, que era la copia del plan de esa semana; con el plan en
   * el bloque, escribir ahí sería escribir donde ya nadie lee.
   */
  const seriesDeLaHoja = (exId, delta, setIdx) => {
    const ex = (nav.day?.exercises || []).find((e) => e.id === exId);
    if (!ex) return;
    const antes = (ex.sets || []).length;
    if (delta < 0 && antes <= 1) return;

    updatePlanExercise(
      activeClient.id,
      nav.week,
      nav.day.dayName,
      exId,
      (suyo) => {
        const sets = [...(suyo.sets || [])];
        if (delta > 0) {
          const ultima = sets[sets.length - 1];
          sets.push({ kg: '', reps: '', rir: '', targetReps: ultima?.targetReps || '', targetRir: ultima?.targetRir || '' });
        } else {
          sets.splice(Number.isInteger(setIdx) ? setIdx : sets.length - 1, 1);
        }
        return { ...suyo, sets };
      },
      { immediate: false }
    );
    apuntarEnLaHoja({ kind: BLOCK_CHANGE.SERIES, que: ex.name, de: antes, a: antes + delta });
  };

  /*
    ══ LOS MANDOS DEL MICROCICLO ═════════════════════════════════════════════

    El microciclo se elige en la TIRA —la pastilla `M2 · en curso`, la misma
    que en la hoja de series—, así que aquí solo se arman los verbos que la
    tira no puede saber: qué se añade, qué va antes del «···» y qué se suma
    dentro de él. Ver `TiraDelPrograma`.
  */
  /*
    ══ «+ MICROCICLO» PREGUNTA DE QUÉ PARTE ══════════════════════════════════

    «Cuando le das a + microciclo se añade por defecto vacío; lo suyo sería que
    te pregunte o algo. Has de darle a copiar para que lo añada copiado.»

    Y tenía razón por partida doble. El botón añadía SIEMPRE en blanco, así que
    la mitad de las veces el gesto siguiente era deshacerlo; y la otra manera
    —«duplicar», el ⧉ de dos dedos a la derecha— no se leía como «el microciclo
    siguiente», se leía como una acción sobre el que ya había. Dos caminos al
    mismo sitio y ninguno lo decía.

    Ahora es una sola puerta con las dos salidas escritas en cristiano, y con la
    diferencia dicha donde importa: lo que separa a las dos opciones no es «en
    blanco» frente a «copia», es SI VIENEN LOS KILOS. Eso es lo que hay que
    saber antes de pulsar, porque arrastrar los pesos de la semana anterior a la
    siguiente da por entrenado lo que nadie ha levantado (ver `blankDays` en
    `domain/training`).

    Aquí no hay «pegar»: un microciclo no va al portapapeles. Lo explica `TIPO`
    en `lib/portapapeles`.
  */
  const masMicrociclo = esBloqueActual ? (
    <BotonMas
      palabra={unidad.toLowerCase()}
      ariaLabel={`Añadir ${unidad.toLowerCase()} ${enBloque(nav.week) + 1}`}
      items={[
        {
          icon: Plus,
          label: 'En blanco',
          sub: 'Las mismas hojas, sin nada escrito',
          run: () => irA(appendMicrocycle(activeClient.id), 0, 'bloque'),
        },
        {
          icon: Copy,
          label: `Copia de ${etiqueta(nav.week).toLowerCase()}`,
          sub: 'Con los kilos y las reps ya puestos',
          run: () => {
            const created = cloneMicrocycle(activeClient.id, nav.week);
            if (created) irA(created, 0, 'bloque');
          },
        },
      ]}
    />
  ) : null;

  /*
    ── Y «+ BLOQUE», QUE ES EL TERCERO ───────────────────────────────────────
    Su salida normal es componerlo, que es un trabajo con principio y final y
    tiene pantalla propia (`Compositor.jsx`). La segunda solo existe con un
    bloque copiado, y es la que convierte «traer el programa de otro cliente»
    —hoy un panel entero escondido en un menú— en el mismo gesto que todo lo
    demás: se copia allí, se pega aquí.
  */
  const masBloque = esBloqueActual ? (
    <BotonMas
      palabra="bloque"
      ariaLabel="Empezar el bloque siguiente"
      items={[
        { icon: Plus, label: 'Componerlo', sub: 'Eliges sus hojas y su duración', run: aComponer },
        bloquesCopiados.length > 0 ? null : undefined,
        ...bloquesCopiados.map((pieza) => ({
          icon: ClipboardPaste,
          label: `Pegar «${pieza.titulo}»`,
          sub: [pieza.detalle, pieza.origen?.cliente].filter(Boolean).join(' · '),
          run: () => pegarBloque(pieza),
        })),
      ]}
    />
  ) : null;

  /*
    ── Lo que va antes del «···» en la cabecera del BLOQUE ───────────────────
    Aquí hubo un verbo «El bloque» que llevaba de la hoja al conjunto y de
    vuelta. Se ha ido: ahora la flecha de volver sube UN escalón —de la hoja al
    bloque, del bloque a la lista— y con eso no hace falta ningún mando más.
  */
  const accionesDeLaCabecera = indicator;

  /*
    ══ LOS DOS MANDOS DE LA HOJA, PEGADOS A SU NOMBRE ════════════════════════

    Vivían en una TERCERA barra debajo de la tira: «18 de 18 series escritas»
    a la izquierda y, al otro extremo del renglón, el selector de sesión y un
    «···». El dueño: «cambiar de sesión no debería estar tan a la derecha, tanta
    información atora un poco en las cabeceras».

    La barra se ha ido y queda UN mando: qué sesión se mira, que es la primera
    decisión porque cambia todos los números de la tabla. Va en el renglón del
    microciclo, que es de quien es una sesión.

    ── Y «20 de 20 series escritas» tampoco está ────────────────────────────
    Estuvo al lado, y medido a 1680 con diez microciclos NO cabía: partía el
    renglón y devolvía a la cabecera la tercera altura que esta vuelta vino a
    quitarle. Y no se pierde nada, porque lo dice dos veces más y mejor: la
    pestaña de la hoja lleva su disco —verde hecha, ámbar a medias, hueco aún
    no— con la cuenta exacta en su título, y debajo está la tabla, donde se ve
    casilla por casilla lo que falta. Una cabecera no cuenta lo que ya se ve.
  */
  const mandosDeLaHoja = nav.day ? (
    <>
      <MenuAcciones
        clase="tira-sesion"
        sinFlecha={false}
        ariaLabel={`Sesión de ${nav.day.dayName} que se está mirando`}
        label={daySession.session?.date ? `sesión del ${shortDate(daySession.session.date)}` : 'sin sesión'}
        items={[
          ...daySession.sessions.map((ss) => ({
            icon: CalendarDays,
            label: `${ss.date ? shortDate(ss.date) : 'sin fecha'}${ss.id === daySession.activeId ? ' · abierta' : ''}`,
            run: () => daySession.select(ss.id),
          })),
          daySession.sessions.length > 0 ? null : undefined,
          {
            icon: Plus,
            label: 'Otra sesión de este día',
            run: () => {
              const id = startSession(activeClient.id, nav.week, nav.day.dayName);
              if (id) daySession.select(id);
            },
          },
          daySession.activeId && !daySession.session?.isLegacy
            ? {
                icon: Trash2,
                label: 'Quitar esta sesión',
                danger: true,
                run: () => removeSession(activeClient.id, nav.week, daySession.activeId),
              }
            : undefined,
        ]}
      />
    </>
  ) : null;

  /*
    ══ LOS DOS VERBOS DE DIARIO SALEN DEL «···» ══════════════════════════════
    «Sigo viendo mucha información en la cabecera y no muestras los iconos de
    opciones, muestras los ···.» Las dos mitades de la frase se arreglan con el
    mismo movimiento: la cabecera pierde sus frases de lectura —se han ido a su
    tarjeta— y gana los dos verbos que se usan a diario, como iconos.

    Cuáles son no es una opinión: duplicar la hoja es el gesto con el que se
    monta la semana siguiente, y las alternativas se abren cada vez que alguien
    no tiene una máquina. Los otros tres —guardarla como pieza, traer un día de
    otro cliente y quitarla— se tocan una vez al mes o borran, y ahí un menú es
    lo correcto: cuestan un gesto de más a propósito.
  */
  const iconosDeLaHoja = nav.day ? (
    <>
      {/* ── ⧉ ES COPIAR, NO DUPLICAR ─────────────────────────────────────
          Hacía las dos cosas a la vez —copiaba y pegaba al lado— y por eso no
          servía para llevarse la hoja a ninguna parte. Ahora copia, y dónde cae
          se decide después, en el «+ hoja» del bloque al que vaya (que puede
          ser el de otra persona). Duplicar en el sitio sigue estando ahí
          mismo, como «Copia de «Push A»». */}
      <button
        type="button"
        className="btn btn-icon btn-icon-compact"
        title={`Copiar «${nav.day.dayName}» al portapapeles`}
        aria-label={`Copiar «${nav.day.dayName}» al portapapeles`}
        onClick={() => copiarHoja(nav.day.dayName)}
      >
        <Copy size={15} />
      </button>
      <button
        type="button"
        className="btn btn-icon btn-icon-compact"
        title="Guardarla como pieza tuya"
        aria-label="Guardarla como pieza tuya"
        onClick={() => guardarPieza(nav.day.dayName)}
      >
        <Bookmark size={15} />
      </button>
      {/* ── Y PONERLE ENCIMA LA HOJA QUE SE LLEVA ────────────────────────
          Solo con una hoja en la mano, y solo si esta hoja es del plan del
          bloque: es la ley del reposo —una oferta que no se puede aceptar es
          mobiliario— y la misma regla que la pauta de un ejercicio, que sale
          en la fila encendida cuando hay algo que ponerle. La pieza es la
          última copiada, igual que ⌘V. Ver `sustituirHoja`. */}
      {hojasCopiadas[0] && blockSessionOf(bloque, nav.day.dayName) && (
        <button
          type="button"
          className="btn btn-icon btn-icon-compact"
          title={`Poner «${hojasCopiadas[0].titulo}» en «${nav.day.dayName}»: conserva el nombre y cambia sus ejercicios`}
          aria-label={`Poner ${hojasCopiadas[0].titulo} en ${nav.day.dayName}`}
          onClick={() => sustituirHoja(hojasCopiadas[0], nav.day.dayName)}
        >
          <ClipboardPaste size={15} />
        </button>
      )}
      {/*
        ── TRAER: un botón, dos sitios de donde ────────────────────────────
        «No pasa nada porque unas se metan dentro de otras, pero deberían salir
        como botones.» Traer de otro cliente y traer de un fichero son el MISMO
        verbo con dos orígenes, así que salen como un botón y la elección del
        origen es lo que cuelga de él. Un icono por origen serían dos iconos
        para una sola decisión.

        Y «de un fichero» sube aquí porque en la hoja no había forma de
        llegar: vivía en el «···» del microciclo, que solo se pinta con el
        bloque delante.
      */}
      <MenuAcciones
        clase="btn btn-icon btn-icon-compact"
        ariaLabel={`Traer ejercicios a «${nav.day.dayName}»`}
        label={<Download size={15} />}
        sinFlecha
        items={[
          { icon: Users, label: 'Traer un día de otro cliente', run: () => setImportAbierto(true) },
          { icon: FileUp, label: 'Traer de un fichero', run: () => setPegarAbierto(true) },
        ]}
      />
    </>
  ) : null;

  /*
    ── LA PAPELERA, Y NO UN «···» DE UN ÍTEM ─────────────────────────────────
    «Solo está la opción de eliminar, para eso pon directamente el botón de
    papelera y ya.» Un menú con un solo ítem cobra dos gestos por uno y encima
    esconde el único que tiene. Lo que hacía falta para poder sacarlo —una
    pregunta antes de borrar— lo pone ahora `eliminarHoja` con `useConfirm`, que
    es lo que ya hace el bloque.
  */
  const menuDeLaHoja = nav.day ? (
    <button
      type="button"
      className="btn btn-icon btn-icon-compact btn-icon-danger tira-menu"
      title={`Quitar «${nav.day.dayName}»`}
      aria-label={`Quitar «${nav.day.dayName}»`}
      onClick={() => eliminarHoja(nav.day.dayName)}
    >
      <Trash2 size={15} />
    </button>
  ) : null;

  /*
    ── Y el del BLOQUE, que es uno solo ──────────────────────────────────────
    Con el bloque entero delante, el verbo que se repite es duplicar el
    microciclo abierto: es con lo que se monta el siguiente. Sale del «···» por
    la misma razón que los dos de la hoja. Los otros cinco —traer de otro
    cliente, traer de un fichero, los ajustes del programa y los dos que
    borran— se quedan dentro, que es donde se busca lo que no se usa a diario.
  */
  const iconosDelBloque = (
    <>
      {/* Copiar el bloque entero, que es la unidad con la que se arranca a
          alguien parecido: sus hojas con sus ejercicios, sin fechas y sin nada
          registrado. Va aquí, en la fila del bloque, por la misma ley que pone
          el ⧉ de la hoja en la fila de la hoja: sobre qué actúa un botón se sabe
          por dónde está, no por lo que diga su rótulo. */}
      <button
        type="button"
        className="btn btn-icon btn-icon-compact"
        title={`Copiar «${bloque.name}» al portapapeles`}
        aria-label={`Copiar «${bloque.name}» al portapapeles`}
        onClick={copiarBloque}
      >
        <Copy size={15} />
      </button>
      {/* ── TRAER: el mismo botón que en la hoja ────────────────────────────
          Traer el programa de otro cliente y traer de un fichero eran dos
          ítems perdidos en un menú de siete, y en la vista de hoja son —desde
          hace dos vueltas— un botón con sus dos orígenes colgando. Que la
          misma pregunta tenga dos dibujos según la vista es la avería que esta
          cabecera lleva persiguiendo desde el principio: aquí es el MISMO
          botón. */}
      <MenuAcciones
        clase="btn btn-icon btn-icon-compact"
        ariaLabel={`Traer ejercicios a «${bloque.name}»`}
        label={<Download size={15} />}
        sinFlecha
        items={[
          hayDeQuienTraer && { icon: Users, label: 'Traer el programa de otro cliente', run: () => setCopyOpen(true) },
          { icon: FileUp, label: 'Traer de un fichero', run: () => setPegarAbierto(true) },
        ]}
      />
      {/* Tipo de ciclo, patrón, fecha de inicio y protocolo: no son del bloque
          ni del microciclo, son del PROGRAMA, o sea del nivel más alto que esta
          cabecera dibuja. Por eso sale a la vista en esta fila y no cuelga de
          ningún menú: no tiene otra puerta en toda la pantalla. */}
      <button
        type="button"
        className="btn btn-icon btn-icon-compact"
        title="Ajustes del programa: tipo de ciclo, patrón y fecha de inicio"
        aria-label="Ajustes del programa"
        onClick={() => setPanel('programa')}
      >
        <Settings2 size={15} />
      </button>
    </>
  );

  /*
    ── LOS TRES VERBOS DEL MICROCICLO, LOS TRES A LA VISTA ───────────────────
    «Deberías quitar los ··· y meter los botones.»

    Aquí quedaba el último menú de la cabecera, y tenía dos ítems: las fechas y
    la papelera. Un «···» de dos cobra un gesto por cada uno y encima los
    esconde detrás de un dibujo que no dice cuáles son — con el agravante de que
    uno de los dos ya se podía pulsar en la pantalla (la pastilla encendida abre
    ese mismo panel), así que la mitad del menú era un duplicado escondido.

    Salen los tres como iconos, en el orden de la casa: lo que construye
    primero —duplicar, que es con lo que se monta el siguiente—, lo que ajusta
    después, y lo que borra al final y en rojo. Es la misma cuenta que ya
    hicieron la hoja abierta y el bloque, que también acabaron sin menú.

    La papelera puede estar a la vista porque `eliminarSemana` no pierde nada:
    avisa con «Deshacer» durante diez segundos y devuelve hasta el bloque entero
    si era su último microciclo.
  */
  /* ── AQUÍ ESTUVO EL ⧉ DE DUPLICAR EL MICROCICLO ─────────────────────────
     Se ha ido dentro del «+ microciclo», que está a dos dedos y ahora pregunta
     de qué parte. Era la mitad escondida de una decisión que el botón de al
     lado tomaba a ciegas: «+» añadía siempre en blanco y este añadía siempre
     copiado, sin que ninguno de los dos dijera que existía el otro. Una
     decisión con dos salidas es un menú, no dos botones.

     ── Y AQUÍ ESTUVO EL ⚙ DE LAS FECHAS DEL MICROCICLO (séptima vuelta) ────
     «Has de eliminar el ajustes de microciclo: solo ajustes de bloque.»

     Era la segunda puerta al mismo panel —la primera es pulsar la pastilla
     ENCENDIDA, que sigue estando— y se dibujaba igual que el ⚙ del programa,
     que está a cuatro píxeles. Dos ruedas dentadas idénticas en el mismo
     renglón, una del microciclo y otra del programa: el único modo de saber
     cuál era cuál era pasar el ratón y leer. La que se queda es la del nivel
     que NO tiene otra puerta. */
  /* Sin `btn-icon-danger`, y es del frame: en la barra del bloque el rojo es
     de UNA papelera, la que se lleva el bloque entero. Esta se lleva un
     microciclo —una semana de una estructura que sigue ahí— y va detrás de su
     propio filete, que es lo que la separa de su vecina (ver el cierre de la
     fila en `TiraDelPrograma`). Con las dos en rojo, el rojo dejaba de decir
     cuál de las dos no tiene vuelta atrás — y aquí sí la tiene: `eliminarSemana`
     quita y ofrece «Deshacer» diez segundos (producto.md §5.7), mientras que
     quitar el bloque pregunta antes con `useConfirm`. El rojo se queda en la
     que pregunta. */
  const menuDelMicrociclo = (
    <button
      type="button"
      className="btn btn-icon btn-icon-compact tira-menu"
      title={`Quitar ${unidad.toLowerCase()} ${enBloque(nav.week)}`}
      aria-label={`Quitar ${unidad.toLowerCase()} ${enBloque(nav.week)}`}
      onClick={eliminarSemana}
    >
      <Trash2 size={15} />
    </button>
  );

  /* Dónde cae cada hoja de la semana. Lo dice la columna de esa hoja en la
     rejilla, y solo ahí: cuando además lo decía una tira encima, «LUN» salía
     cuatro veces en la misma pantalla. */
  const repartoDelBloque = structureOfBlock(program, bloque).weeklySplit || {};

  /*
    ══ LA TIRA DEL PROGRAMA, Y SE ACABÓ LA CUENTA ════════════════════════════

    Aquí vivieron, uno detrás de otro, un conmutador, unos lomos verticales, un
    paginador, una tira de días, un carril de Efort y una banda de pestañas.
    Seis maneras de elegir hoja en nueve vueltas, y cada una murió por lo
    mismo: dibujaba el microciclo por segunda vez al lado del primero.

    Manda la cabecera que Entreno tenía EN PRODUCCIÓN —los bloques como
    carpetas y, debajo, los microciclos del abierto—, que es la que el dueño
    pidió recuperar. Ver `TiraDelPrograma`.
  */
  /*
    ══ «+ HOJA» SUBE A LA TIRA ═══════════════════════════════════════════════
    Estuvo debajo de la rejilla, y con las columnas estiradas hasta el bajo de
    la ventana eso lo dejaba a novecientos píxeles del titular: «el botón hojas
    está demasiado abajo». Estuvo también dentro de la retícula, como el hueco
    de la hoja siguiente, y ahí la traiciona `auto-fit`: cuando el ancho no da
    para una pista más, la columna del hueco BAJA a la fila de abajo y el botón
    vuelve al sitio del que se le quería sacar —medido a 1600, con la mesa en
    932 px—.

    Así que va donde no depende de cuánto quepa: al final del renglón del
    microciclo, que es de quien son las hojas. No es el mismo verbo dos veces
    —abajo ya no queda ninguno— y queda al lado de «+ microciclo», que es el
    otro «uno más» de esta pantalla: los dos juntos, cada uno con su palabra.
  */
  /*
    ── «+ HOJA» TAMBIÉN CON UNA HOJA ABIERTA ──────────────────────────────────
    Estaba acotado a la vista de conjunto, y ahí no había ley detrás: era que
    en la hoja este verbo no tenía renglón propio donde sentarse. Ahora lo
    tiene —el frame `46:114` lo dibuja al final de la tira de hojas (`48:753`),
    que es justo lo que añade— y con las hojas convertidas en pastillas se lee
    como una más de la fila, que es lo que es: el sitio que todavía no existe.
  */
  const altaDeHojaEnLaTira =
    esBloqueActual && nav.days ? (
      nuevaHojaEnTira === null ? (
        /* La misma pieza que «+ bloque» y «+ microciclo»: los tres son el
           mismo verbo y se ven a la vez. Ver `.tira-mas`. */
        /*
          ── Y ESTE «+» TAMBIÉN PREGUNTA ─────────────────────────────────────
          Tres salidas, en el orden en que se usan: empezar de cero, repetir una
          de las que ya hay —«otro día igual que el lunes» es cómo se monta la
          mitad de las rutinas— y soltar lo que se traiga copiado, que puede
          venir de otro cliente.

          Las hojas propias van con su nombre y no detrás de un «Copia de…»
          genérico: son cuatro o cinco, se leen de una mirada, y así el menú dice
          de qué parte cada opción sin abrir nada más.
        */
        <BotonMas
          palabra="hoja"
          destacado
          ariaLabel={`Añadir una hoja a «${bloque.name}»`}
          /*
            ── EL ORDEN LO MANDA LO QUE LLEVAS ─────────────────────────────
            Con la mano vacía, primero lo que se usa más: empezar de cero y
            repetir una de las que ya hay. Pero con algo copiado, abrir este
            menú es casi siempre haber venido a soltarlo —se copia y se navega
            hasta aquí, que son tres gestos seguidos—, así que lo pegado sube
            arriba. Es la misma ley del reposo: la oferta manda mientras dura.
          */
          items={[
            ...hojasCopiadas.map((pieza) => ({
              icon: ClipboardPaste,
              label: `Pegar «${pieza.titulo}»`,
              sub: [pieza.detalle, pieza.origen?.cliente || pieza.origen?.donde].filter(Boolean).join(' · '),
              run: () => pegarHoja(pieza),
            })),
            hojasCopiadas.length > 0 ? null : undefined,
            { icon: Plus, label: 'En blanco', sub: 'Le pones el nombre y sus ejercicios', run: () => setNuevaHojaEnTira('') },
            nav.days.length > 0 ? null : undefined,
            ...nav.days.map((hoja) => ({
              icon: Copy,
              label: `Copia de «${hoja.dayName}»`,
              sub: `${(hoja.exercises || []).length} ejercicios`,
              run: () => duplicarHojaDelBloque(hoja.dayName),
            })),
          ]}
        />
      ) : (
        <form
          className="plan-hoja-alta"
          onSubmit={(e) => {
            e.preventDefault();
            const nombre = (nuevaHojaEnTira || '').trim();
            if (!nombre) return;
            anadirHojaAlBloque(nombre);
            setNuevaHojaEnTira(null);
          }}
        >
          <input
            autoFocus
            className="input input-sm"
            value={nuevaHojaEnTira}
            placeholder="Ej: Pierna B"
            aria-label="Nombre de la hoja nueva"
            onChange={(e) => setNuevaHojaEnTira(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setNuevaHojaEnTira(null)}
          />
          <button type="submit" className="btn btn-primary btn-sm" disabled={!nuevaHojaEnTira.trim()}>
            Añadir
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setNuevaHojaEnTira(null)}>
            Cancelar
          </button>
        </form>
      )
    ) : null;

  const tiraDelPrograma = (
    <TiraDelPrograma
      derecha={altaDeHojaEnLaTira}
      program={program}
      bloque={bloque}
      semanaEnCurso={semanaEnCurso}
      semana={nav.week}
      unidad={unidad}
      unidades={unidades}
      esActual={esBloqueActual}
      vista={vista}
      hojas={nav.days}
      hojaAbierta={vista === "hoja" ? nav.dayIndex : null}
      estadoDeHoja={estadoDeHoja}
      diaDe={
        cycleType === "weekly"
          ? (hoja) => weekdayForDay(repartoDelBloque, hoja.dayName)
          : null
      }
      acciones={accionesDeLaCabecera}
      mandosDeLaHoja={mandosDeLaHoja}
      /* ── LA PAPELERA DEL MICROCICLO, TAMBIÉN CON LA HOJA ABIERTA ─────────
         Estuvo solo con el bloque delante, y el motivo era la fila ÚNICA: allí
         las dos papeleras —la del microciclo y la de la hoja— caían seguidas,
         dos cuadraditos iguales entre los que uno borra una semana y el otro
         un día, sin nada que lo dijera.

         Con la hoja abierta la barra tiene dos renglones y ese choque no
         existe: la de la hoja va en el renglón de las hojas y esta en el de
         los microciclos, así que cada una está en la fila de aquello que se
         lleva. Es lo que dibuja el frame (`227:5`) y lo que pidió el dueño:
         «añadir un botón papelera en la segunda línea para los microciclos». */
      menuDelMicrociclo={menuDelMicrociclo}
      /* Deshacer va PRIMERO y en las dos vistas: el plan se toca en la hoja y
         en el conjunto, y lo que se deshace es el mismo plan. Detrás, los
         verbos de la vista que esté delante. */
      iconos={
        <>
          {mandosDeDeshacer}
          {vista === 'hoja' ? iconosDeLaHoja : iconosDelBloque}
        </>
      }
      menuDeLaHoja={menuDeLaHoja}
      onIrBloque={(b) => {
        const suyas = weeksOfBlock(program, b);
        if (suyas.length > 0) irA(suyas[suyas.length - 1], 0, "bloque");
      }}
      onVerLista={() => verVista("lista")}
      onVerConjunto={() => verVista("bloque")}
      masBloque={masBloque}
      masMicrociclo={masMicrociclo}
      onRenombrarBloque={(id, nombre) => renameBlock(activeClient.id, id, nombre)}
      onQuitarBloque={quitarBloque}
      onIrSemana={(w) => irA(w, 0, vista === "hoja" ? "hoja" : "bloque")}
      onAjustesDelMicrociclo={() => setPanel("semana")}
      onAbrirHoja={(i) => irA(nav.week, i, "hoja")}
    />
  );

  return (
    <div className="entreno-pagina">
      <VueltaALaRevision />
      <ConditionsNote area="training" />
      {panelDeCopia}
      {dialogoDePegado}

      {/*
        ══ DÓNDE CAE LO QUE LLEVAS ════════════════════════════════════════════

        Esta pantalla es tres destinos y nunca dos a la vez: con la lista
        delante cae un BLOQUE en la persona, con el bloque delante cae una HOJA
        en él, y con una hoja abierta cae un EJERCICIO en ella. Registrarlo es
        lo que deja que la mano del portapapeles encienda el verbo con el nombre
        del sitio —«Pegar «Sentadilla» en Lower A»— en vez de obligar a abrir el
        «+» de cada sitio a ver si dentro está lo copiado. Los verbos son los
        mismos que ya usa ese «+»: aquí no se implementa nada nuevo, se PRESENTA
        lo que ya había.

        El bloque va a prioridad 0 y la hoja a 1 porque la especificidad se dice
        y no se deduce del orden de montaje (ver `registrarDestino`).

        ── Por qué el BLOQUE cae en la lista y no aquí ────────────────────────
        Estuvo sin registrar del todo, con este argumento: pegarlo cierra el que
        está abierto y abre otro, y eso es una conversación. El argumento no se
        sostiene —`pegarBloque` YA lanza su pregunta, la lance quien la lance—,
        pero el sitio sí importa: el destino vigente es UNO, así que un bloque
        registrado aquí le quitaría la mano a la hoja, que es lo que de verdad
        cae con el bloque delante. Así que el bloque cae donde el bloque es el
        sujeto —la lista, y el vacío de quien no tiene programa—, y con el
        bloque delante se sigue pegando desde su «+», que es donde vivía.
      */}
      {vista === 'lista' && (
        <Destino tipos={[TIPO.BLOQUE]} donde={nombreCorto} prioridad={0} pegar={pegarBloque} />
      )}
      {vista === 'bloque' && esBloqueActual && nav.days && (
        <Destino tipos={[TIPO.HOJA]} donde={bloque.name} prioridad={0} pegar={pegarHoja} />
      )}
      {vista === 'hoja' && nav.day && (
        <Destino tipos={[TIPO.EJERCICIO]} donde={nav.day.dayName} prioridad={1} pegar={pegarEjercicio} />
      )}

      {/*
        ══ DEFINIR SE FUE A SU SITIO ══════════════════════════════════════════
        Abrir un bloque nuevo fue una ventana, y después un momento de esta
        misma superficie —el banco, con la definición en la mesa y el material
        en el cajón—. Las dos veces estaba montado encima de la pantalla en la
        que solo se viene a mirar qué entrena esta persona.

        Componer es un TRABAJO con principio y final, así que ahora tiene su
        sitio: `/c/:id/rutina/componer` (ver `Compositor.jsx`), que es además el
        único lugar donde aparece el material —su gimnasio, sus condicionantes,
        tu historial y tus piezas—, porque es donde sirve: para acordarse
        mientras se decide.
      */}
      {vista === 'lista' ? (
        <ListaDeBloques
          program={program}
          cliente={activeClient}
          bloque={bloque}
          unidad={unidad}
          unidades={unidades}
          /* Dónde estás, para la barra de microciclos de su fila: el microciclo
             EN CURSO —el último con actividad—, no el que estés hojeando. La
             lista es la historia del entrenamiento y ahí «aquí» es por dónde va
             la persona, igual que en la cabecera del bloque. */
          semanaEnCurso={semanaEnCurso}
          onMandarBloque={mandarBloque}
          onGuardarBloque={guardarBloque}
          onIrBloque={(b) => {
            const suyas = weeksOfBlock(program, b);
            if (suyas.length > 0) irA(suyas[suyas.length - 1], 0, 'bloque');
          }}
          onVolver={() => verVista('bloque')}
          onNuevoBloque={aComponer}
          /* El verbo llega montado y no como manejador: con un bloque copiado
             es un botón y con varios una pregunta, y esa decisión es de aquí
             —de lo que hay en la mano—, no de la lista, que solo tiene que
             hacerle sitio al lado del «+ bloque». */
          accionPegar={verboPegarBloque('cab-accion is-puerta', pegarBloque)}
          onRenombrarBloque={(id, nombre) => renameBlock(activeClient.id, id, nombre)}
          onQuitarBloque={quitarBloque}
          /* A qué juega el bloque. Es un rótulo del entrenador, no una receta:
             no cambia el plan ni propone nada, ordena la lectura del conjunto. */
          onIntent={(b, intent) => setBlockTraits(activeClient.id, b.id, { intent })}
        />
      ) : (
      <>
      {/*
        ══ AQUÍ ESTUVO «SU MAQUINARIA» ════════════════════════════════════════
        Un pliegue con las fotos de su gimnasio, encima de la barra del bloque y
        en las dos vistas de Entreno. El dueño lo retira con el rediseño de
        Figma —«elimina su maquinaria»—, y el frame `32:100` no lo dibuja: la
        pantalla abre con la cabecera del cliente y, debajo, la barra del
        bloque.

        No se pierde nada, y por eso se puede quitar de aquí: las fotos siguen
        en los dos sitios donde se CONSULTAN de verdad —la ficha del cliente
        (`EquipmentPanel`, que es además donde se suben y se ordenan) y el
        compositor (`CajonDeMaterial`), que es donde se elige el ejercicio
        mirando lo que la persona tiene delante—. Lo que se va es la tercera
        copia: la que estaba plegada sobre una pantalla en la que solo se mira
        qué entrena.
      */}
      {/*
        ══ LA CABECERA ES LA TIRA DEL PROGRAMA ════════════════════════════════
        Dónde estás —qué bloque y qué microciclo— y cómo va, en dos renglones
        llenos. Aquí hubo una cabecera de dos pisos con el titular en grande y
        una barra de microciclo aparte; eran tres alturas para un solo objeto.
        Ver `TiraDelPrograma`.
      */}
      {/*
        ══ MESA · COSTADO ═════════════════════════════════════════════════════
        Dos columnas y ya. Aquí hubo una tercera —un carril de hojas y, antes,
        los LOMOS— y las dos veces era un segundo dibujo del microciclo al lado
        del primero.

          mesa      la tira, y debajo la rejilla del bloque o la tabla de series
          costado   lo que juzga lo que hay en la mesa

        ── LA MESA VUELVE A SER UNA CAJA, Y LA TIRA VIVE DENTRO ─────────────
        Estuvo a ras del papel —«la mesa ES el papel»— y el dueño, con las dos
        pantallas delante: «me parece una hoja fea, el contenido de bloques,
        microciclos y eso es vacío; debería tener un mejor acabado, quizás
        metiendo todo el contenido grande en una caja».

        La razón se ve en la captura, y es una asimetría: el costado SÍ llevaba
        sus tres tarjetas con canto y sombra, y la mesa —que es lo importante—
        no llevaba nada. La pantalla se leía como tres objetos acabados a la
        derecha y un contenido suelto a la izquierda.

        Así que la caja vuelve, y con ella entra la TIRA: los bloques y los
        microciclos son la cabecera de la MESA, no de la página. Flotando fuera
        se estiraban por encima del costado —dos renglones de mando gobernando
        unas tarjetas que no gobiernan— y dejaban el hueco del que venía la
        sensación de vacío. Es además lo que hacía producción, que es lo que el
        dueño echa de menos. Ver `TiraDelPrograma` y `.entreno-hoja`.
      */}
      <div className={`entreno${vista === "bloque" ? " is-conjunto" : " is-hoja"}`}>
        {/*
          ══ CON EL BLOQUE DELANTE, LA TIRA GOBIERNA LAS DOS COLUMNAS ═════════
          Vivía dentro de la mesa, y la nota de al lado lo defendía así: fuera
          «se estiraba por encima del costado —DOS RENGLONES de mando
          gobernando unas tarjetas que no gobiernan—».

          Las dos mitades del argumento se han caído. Los dos renglones son uno
          desde el frame 32:100, así que ya no hay una cabecera de dos pisos
          flotando sobre unas tarjetas. Y lo de que no las gobierna era falso de
          entrada: «Este bloque», «Volumen por microciclo» y «Progresión» son
          lecturas DEL BLOQUE Y DEL MICROCICLO que esta barra elige — pulsar M9
          las cambia las tres. El mando estaba dentro de una de las dos cosas
          que manda.

          Y además no cabía: medido a 1600 px, la fila única necesita 1076 px y
          dentro de la mesa tenía 814.

          ══ Y CON LA HOJA ABIERTA, TAMBIÉN ══════════════════════════════════
          Aquí se decía «con una hoja abierta se queda donde estaba, porque
          allí sí es la cabecera de la mesa». El frame `46:114` la dibuja
          igual que la del bloque: `block-toolbar` es una CAJA hermana de
          `workspace-main`, encima de las dos columnas, y debajo de ella el
          calentamiento en otra caja. Ya no hay una mesa de la que ser
          cabecera — con la hoja abierta la columna izquierda es una pila de
          tarjetas, una por ejercicio, y no un panel.

          Y el argumento de la vuelta anterior vale igual aquí: esta barra
          elige el MICROCICLO, y el microciclo es lo que cambia las cifras de
          la hoja y de la progresión del costado a la vez.
        */}
        {tiraDelPrograma}
        {/*
          ══ EL PREÁMBULO ES UNA CAJA, Y ABARCA LAS DOS COLUMNAS ══════════
          Era una banda del panel de la mesa, con su filete y su columna de
          rótulos. El frame `46:114` lo saca: `calentamiento-row` es una
          TARJETA hermana de la barra y de `workspace-main` —canto, radio 12,
          relleno 16— con sus dos renglones separados por un filete que llega
          de canto a canto.

          Y va fuera de la mesa por lo mismo que la barra: con la hoja
          abierta ya no hay panel del que ser banda. Lo que hay es una pila
          de tarjetas, y esta es la primera —lo que se lee antes de la
          primera serie—, a la misma calle que todo lo demás.
        */}
        {vista !== 'bloque' && nav.day && (
          <>
        {/*
          ══ ANTES DE EMPEZAR: UNA BANDA, NO DOS TIRAS ══════════════════
          El calentamiento y la indicación son lo mismo —lo que hay que
          leer antes de la primera serie— y estaban sueltos: una pastilla
          hundida y, cuatro píxeles más abajo, un enlace pelado sin rótulo
          que no se alineaba con nada. Encima flotaban DENTRO del cuerpo,
          así que el ojo los leía como los dos primeros elementos de la
          tabla en vez de como su antesala.

          Ahora son una banda del panel, con su filete y su columna de
          rótulos: «Calentamiento» y «Tu indicación» caen en la misma
          vertical, y las dos filas se leen igual —rótulo, lo que hay, y
          el verbo al canto derecho—. Es lo que ya hacía la de arriba;
          ahora lo hacen las dos.
        */}
        {(isModuleOn(protocol, 'warmup') || isModuleOn(protocol, 'coachNote')) && (
        <div className="hoja-preambulo">
        {isModuleOn(protocol, 'warmup') && (
          <div className="hoja-calentamiento">
            <span className="hoja-calentamiento-k">Calentamiento</span>
            {calentamientoDelDia.length > 0 ? (
              <span className="hoja-calentamiento-lista">
                {calentamientoDelDia.map((d) => (
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
              {calentamientoDelDia.length === 0 && calentamientoDeAntes && (
                <button type="button" className="hoja-calentamiento-editar" onClick={traerCalentamiento} title={`Copia el calentamiento de ${unidad.toLowerCase()} ${calentamientoDeAntes.week} a los días de esta que no tienen`}>
                  traer el de la S{calentamientoDeAntes.week}
                </button>
              )}
              <button
                type="button"
                className="hoja-calentamiento-editar"
                onClick={() => setPanel('calentamiento')}
              >
                {calentamientoHeredado ? 'del programa · hacerlo de este día' : calentamientoDelDia.length > 0 ? 'editar' : 'añadir'}
              </button>
            </span>
          </div>
        )}
        {/*
          Tu indicación para el día, en la misma voz y con la misma forma
          que el calentamiento de encima: rótulo · lo que hay · el verbo
          al canto. Vacía dice «sin indicación», igual que aquella dice
          «sin calentamiento» — y no un enlace suelto con otra forma. El
          cliente la ve al abrir el día.
        */}
        {isModuleOn(protocol, 'coachNote') &&
          (indicacionAbierta || nav.day.coachNote?.trim() ? (
            <label className="hoja-indicacion">
              <span className="hoja-calentamiento-k">Tu indicación</span>
              <textarea
                className="hoja-indicacion-texto"
                rows={1}
                autoFocus={indicacionAbierta && !nav.day.coachNote?.trim()}
                placeholder="La verá tu cliente al abrir el día, antes de empezar."
                value={nav.day.coachNote ?? ''}
                onChange={(e) => setDayNote(activeClient.id, nav.week, nav.day.dayName, e.target.value)}
                onBlur={() => !nav.day.coachNote?.trim() && setIndicacionAbierta(false)}
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
                  onClick={() => setIndicacionAbierta(true)}
                >
                  añadir
                </button>
              </span>
            </div>
          ))}
        </div>
        )}
          </>
        )}
        <section
          className="entreno-hoja mesa-panel"
          aria-label={
            vista === "bloque"
              ? `«${bloque.name}» en conjunto`
              : nav.day
                ? `Series de ${nav.day.dayName}`
                : "Sin hojas"
          }
        >
          {vista === 'bloque' ? (
            <div className="mesa-cuerpo">
            <ConjuntoDelBloque
              program={program}
              cliente={activeClient}
              bloque={bloque}
              semanaEnCurso={semanaEnCurso}
              library={ejerciciosDisponibles}
              onAbrirHoja={(dayName) =>
                irA(nav.week, Math.max(0, nav.days.findIndex((d) => d.dayName === dayName)), 'hoja')
              }
              onIrSemana={(w) => irA(w, 0, 'bloque')}
              onAnadirEjercicio={anadirEjercicioAlBloque}
              onQuitarEjercicio={quitarEjercicioDelBloque}
              onMoverEjercicio={moverEjercicioDelBloque}
              onSeries={seriesDelBloque}
              onReps={repsDelBloque}
              onAnadirHoja={anadirHojaAlBloque}
              onRenombrarHoja={renombrarHojaDelBloque}
              /* El mismo verbo que la hoja abierta, en la rejilla donde se
                 decide que hace falta otra hoja. */
              onCopiarHoja={copiarHoja}
              /* Y la hoja que se lleva, para poder ponerla ENCIMA de una de
                 estas: aquí, con las seis columnas delante, es donde se ve cuál
                 va a cambiar. La pieza es la última copiada, como ⌘V. */
              hojaEnMano={hojasCopiadas[0] || null}
              onSustituirHoja={(dayName, pieza) => sustituirHoja(pieza || hojasCopiadas[0], dayName)}
              onQuitarHoja={eliminarHoja}
              onMoverHoja={moverHojaDelBloque}
              onRecordarEjercicio={upsertLibraryExercise}
              onGuardarPieza={guardarPieza}
              onSplit={(dia, valor) => updateWeeklySplit(activeClient.id, dia, valor)}
              onTraerFichero={(ficheros) => {
                /* Solo se ofrece con el bloque en blanco: lo que se traiga
                   sustituye a la hoja vacía con la que nace, como al montar el
                   programa desde cero. */
                setImportarLimpio(true);
                setFicherosTraidos(ficheros?.length ? [...ficheros] : null);
                setPegarAbierto(true);
              }}
            />
            </div>
          ) : nav.day ? (
            <>
              <div className="mesa-cuerpo">
              <Lista
                exercises={daySession.exercises}
                focusedId={ejercicioEnFoco?.id || null}
                onFocusExercise={setFocoEjercicio}
                /* Solo en la hoja de escritorio: `ExerciseList` es la del
                   teléfono y allí no se programa, se registra. Ver
                   `movil-ejecuta-pc-planifica`. */
                onCopiar={esTelefono ? null : copiarEjercicio}
                /* El eslabón de cadena del nombre. Solo en la hoja de
                   escritorio: en el teléfono el entrenador no programa, y la
                   lista del cliente tiene su propia marca. */
                videoDe={esTelefono ? null : (ex) => sheetOf?.(ex.name)?.videoUrl || null}
                /* La pauta de lo último copiado, en la fila encendida. Es la
                   última y no una lista: la misma regla que ⌘V, que también pega
                   la de arriba de la mano. */
                pautaEnMano={esTelefono ? null : ejerciciosCopiados[0] || null}
                onPegarPauta={esTelefono ? null : (ex) => pegarPauta(ejerciciosCopiados[0], ex)}
                showRir={isModuleOn(protocol, 'rir')}
                showNotes={isModuleOn(protocol, 'coachNote')}
                /*
                  ── La excepción de este microciclo ──────────────────────
                  Un ejercicio que no es el del bloque sino el de esta semana.
                  La hoja lo marca y ofrece las dos salidas: volver al plan, o
                  ascenderlo y que pase a ser el plan de todos.
                */
                excepcionDe={(ex) => laExcepcionDe(ex.id)}
                /* «solo M3», «M2–M4», «desde M3»: el tramo con la numeración
                   del bloque, que es la que se lee en toda la pantalla. */
                tramoDe={(o) => overrideSpan(o, bloque, etiqueta)}
                onAlargar={(exId) => {
                  const o = laExcepcionDe(exId);
                  if (!o) return;
                  /* Dos microciclos más, o sin fin si ya llegaba al último. */
                  const fin = o.toWeek === null || o.toWeek === undefined ? null : o.toWeek + 2;
                  setOverrideSpan(activeClient.id, bloque.id, o.id, { toWeek: fin });
                  toast({
                    text: fin === null ? 'Sin fin: se queda hasta que lo cambies.' : `Ahora dura hasta ${etiqueta(fin)}.`,
                    action: { label: 'Deshacer', onClick: () => setOverrideSpan(activeClient.id, bloque.id, o.id, { toWeek: o.toWeek }) },
                  });
                }}
                /* Crear la excepción sin cambiar nada: copia el ejercicio a este
                   microciclo tal y como está, y a partir de ahí lo que se toque
                   en esa fila se queda aquí. */
                onSacarDeLaPlantilla={(exId, { semanas } = {}) => {
                  /* `semanas` es cuántos microciclos dura el cambio: 1 el
                     puntual, varios la prueba, `null` sin fin —«de aquí en
                     adelante»—. Empieza siempre en el que estás, así que lo ya
                     entrenado no se toca. */
                  const hasta = semanas === null ? null : nav.week + Math.max(0, (semanas || 1) - 1);
                  overridePlanExercise(activeClient.id, nav.week, nav.day.dayName, exId, (suyo) => suyo, { hasta });
                  const cuanto =
                    hasta === null
                      ? 'de aquí en adelante'
                      : hasta === nav.week
                        ? `solo en este ${unidad.toLowerCase()}`
                        : `hasta ${etiqueta(hasta)}`;
                  toast({ text: `Lo que le cambies a partir de ahora vale ${cuanto}.` });
                }}
                onRemoveOnly={(exId) => {
                  removePlanExerciseOnly(activeClient.id, nav.week, nav.day.dayName, exId);
                  toast({ text: `Quitado solo en este ${unidad.toLowerCase()}. El bloque no se ha tocado.` });
                }}
                onVolverAlBloque={(exId) => {
                  const o = laExcepcionDe(exId);
                  if (o) dropOverride(activeClient.id, bloque.id, o.id);
                }}
                onAplicarAlBloque={(exId) => {
                  const o = laExcepcionDe(exId);
                  if (!o) return;
                  promoteOverride(activeClient.id, bloque.id, o.id);
                  toast({ text: `Aplicado al bloque: ahora es el plan de todos sus ${unidades}.` });
                }}
                onNoteChange={(exId, note) =>
                  updatePlanExercise(
                    activeClient.id,
                    nav.week,
                    nav.day.dayName,
                    exId,
                    (suyo) => ({ ...suyo, coachNote: note }),
                    { immediate: false }
                  )
                }
                /*
                  El descanso y el remate, desde la propia hoja. Van por el
                  mismo camino que la nota del entrenador —`updatePlanExercise`,
                  que es el que sabe si esto toca el plan del bloque o crea la
                  excepción de este microciclo—, así que la regla de alcance no
                  se aprende dos veces. Se apunta en el historial como el resto
                  de lo que se cambia en una hoja.
                */
                onGramatica={(exId, patch) =>
                  updatePlanExercise(
                    activeClient.id,
                    nav.week,
                    nav.day.dayName,
                    exId,
                    (suyo) => ({ ...suyo, ...patch }),
                    { immediate: false }
                  )
                }
                /*
                  ══ Reordenar mueve el PLAN, y si no puede, la semana ═══════

                  El orden es del bloque, así que arrastrar aquí lo cambia en
                  todas sus semanas: es lo mismo que hacer el gesto en la vista
                  de bloque, y dos sitios no pueden decidir cosas distintas.

                  Pero el ejercicio puede no estar en la hoja del bloque —una
                  excepción de este microciclo, o un programa de antes de que el
                  plan subiera al bloque—, y entonces esto no encontraba nada
                  que mover: se arrastraba la fila, se soltaba, y no pasaba
                  NADA ni se decía por qué. Un entrenador lo reportó tal cual:
                  «no me deja mover los ejercicios».

                  Lo que se ve arrastrar se mueve. Si el plan no lo tiene, se
                  mueve en la semana que se está mirando, que es donde ese
                  ejercicio existe de verdad.
                */
                onMove={(from, to) => {
                  const nombre = nav.day.exercises[from]?.name;
                  if (!nombre) return;
                  const enElPlan = moveBlockExercise(
                    activeClient.id,
                    bloque.id,
                    nav.day.dayName,
                    nombre,
                    to - from
                  );
                  if (!enElPlan) moveExercise(activeClient.id, nav.week, nav.day.dayName, from, to);
                }}
                onRemove={(exId) => {
                  const { week } = nav;
                  const { dayName } = nav.day;
                  const quitado = removePlanExercise(activeClient.id, week, dayName, exId);
                  if (!quitado) return;
                  apuntarEnLaHoja({ kind: BLOCK_CHANGE.EJERCICIO_MENOS, que: quitado.exercise.name });
                  toast({
                    text:
                      quitado.donde === 'excepcion'
                        ? `«${quitado.exercise.name}» ya no es una excepción de este microciclo.`
                        : `«${quitado.exercise.name}» quitado del bloque.`,
                    action: {
                      label: 'Deshacer',
                      onClick: () =>
                        quitado.donde === 'excepcion'
                          ? addOverride(activeClient.id, quitado.blockId, quitado.override)
                          : restoreBlockExercise(activeClient.id, quitado.blockId, dayName, quitado.exercise, quitado.index),
                    },
                  });
                }}
                /*
                  ══ LO PEDIDO Y LO HECHO SE ESCRIBEN EN SITIOS DISTINTOS ═════
                  Y hasta hoy la mitad de arriba se escribía en el sitio
                  EQUIVOCADO. Los objetivos por serie iban a `updateExerciseSet`,
                  que escribe en `microcycles[].days` — y desde que el plan vive
                  en el bloque, `days` es una PROYECCIÓN suya que `applyPlan`
                  vuelve a escribir entera en el gesto siguiente. O sea: se
                  cambiaba el objetivo de una serie, se veía en pantalla, y al
                  añadir un ejercicio a la hoja volvía el valor viejo. Sin error
                  ni aviso, que es como se pierden los datos de verdad.

                  Va por `updatePlanExercise`, que escribe donde ese ejercicio
                  VIVE: el bloque, o la excepción de este microciclo si solo
                  existe ahí. Es el mismo camino que ya usaban el descanso y la
                  indicación. Ver `plan-del-bloque`.
                */
                onSetChange={(exId, setIdx, field, value, sub = null) => {
                  if (field === 'targetReps' || field === 'targetRir' || field === 'targetKg') {
                    updatePlanExercise(
                      activeClient.id,
                      nav.week,
                      nav.day.dayName,
                      exId,
                      (ex) => ({
                        ...ex,
                        sets: (ex.sets || []).map((s, i) => (i === setIdx ? { ...s, [field]: value } : s)),
                      }),
                      { immediate: false }
                    );
                    return;
                  }
                  const exercise = (nav.day.exercises || []).find((ex) => ex.id === exId);
                  if (!exercise) return;
                  const id = logSessionSet(
                    activeClient.id,
                    nav.week,
                    daySession.session?.isLegacy ? null : daySession.activeId,
                    daySession.session?.date || undefined,
                    nav.day.dayName,
                    exercise,
                    setIdx,
                    field,
                    value,
                    sub
                  );
                  if (id && id !== daySession.activeId) daySession.select(id);
                }}
                /*
                  El remate de UNA serie: es plan, y con sus números.

                  Y al escribirlo se JUBILA el del ejercicio entero, que es como
                  se decía esto antes. No se tira: baja a la última serie, que es
                  donde `tecnicaDeLaSerie` lo estaba leyendo. Sin eso, poner una
                  bajada en la segunda serie borraría en silencio el rest-pause
                  que la hoja llevaba enseñando en la cuarta.
                */
                onTecnica={(exId, setIdx, tecnica) =>
                  updatePlanExercise(activeClient.id, nav.week, nav.day.dayName, exId, (ex) => {
                    const sets = ex.sets || [];
                    const legado = tecnicaOf(ex);
                    const ultima = sets.length - 1;
                    return {
                      ...ex,
                      tecnica: undefined,
                      bajada: undefined,
                      sets: sets.map((s, i) => {
                        if (i === setIdx) return { ...s, tecnica: tecnica || undefined };
                        if (legado && i === ultima && !s.tecnica) return { ...s, tecnica: { id: legado } };
                        return s;
                      }),
                    };
                  })
                }
                /* El objetivo de TODAS sus series de una vez (es como se escribe
                   desde el teléfono). Mismo destino que el de una sola: donde el
                   ejercicio vive. Ver el comentario de `onSetChange`. */
                onTargetChange={(exId, value) =>
                  updatePlanExercise(
                    activeClient.id,
                    nav.week,
                    nav.day.dayName,
                    exId,
                    (ex) => ({ ...ex, sets: (ex.sets || []).map((s) => ({ ...s, targetReps: value })) }),
                    { immediate: false }
                  )
                }
                onAddSet={(exId) => seriesDeLaHoja(exId, +1)}
                onRemoveSet={(exId, setIdx) => seriesDeLaHoja(exId, -1, setIdx)}
              />

              {esTelefono ? (
                <>
                  <button type="button" className="fab" onClick={() => setAltaAbierta(true)} aria-label={`Añadir un ejercicio a ${nav.day.dayName}`} title="Añadir ejercicio">
                    <Plus size={22} />
                  </button>
                  <Modal open={altaAbierta} title={`Ejercicio para ${nav.day.dayName}`} onClose={() => setAltaAbierta(false)}>
                    <AddExerciseForm
                      enHoja
                      library={ejerciciosDisponibles}
                      onAlcance
                      onAdd={(exercise, alcance) => {
                        addPlanExercise(activeClient.id, nav.week, nav.day.dayName, exercise, tramoDeAlta(alcance));
                        apuntarEnLaHoja({ kind: BLOCK_CHANGE.EJERCICIO_MAS, que: exercise.name });
                      }}
                      onRememberExercise={upsertLibraryExercise}
                      onClose={() => setAltaAbierta(false)}
                    />
                  </Modal>
                </>
              ) : (
                <div className="hoja-alta">
                  <AddExerciseForm
                    library={ejerciciosDisponibles}
                    onAlcance
                    onAdd={(exercise, alcance) => {
                        addPlanExercise(activeClient.id, nav.week, nav.day.dayName, exercise, tramoDeAlta(alcance));
                        apuntarEnLaHoja({ kind: BLOCK_CHANGE.EJERCICIO_MAS, que: exercise.name });
                      }}
                    onRememberExercise={upsertLibraryExercise}
                  />
                  {/* Y pegar, pegado al alta: es la misma pregunta —«qué
                      ejercicio va aquí»— resuelta por el otro camino. Solo
                      existe con algo copiado, que es la regla de todo el
                      portapapeles: un «Pegar» permanente y gris la mitad del
                      año enseña una puerta que casi nunca se puede abrir. */}
                  {ejerciciosCopiados.length > 0 && (
                    <MenuAcciones
                      clase="btn btn-secondary btn-sm"
                      ariaLabel="Pegar un ejercicio del portapapeles"
                      label={
                        <>
                          <ClipboardPaste size={13} aria-hidden="true" /> Pegar
                        </>
                      }
                      items={ejerciciosCopiados.map((pieza) => ({
                        icon: ClipboardPaste,
                        label: pieza.titulo,
                        sub: [pieza.detalle, pieza.origen?.cliente].filter(Boolean).join(' · '),
                        run: () => pegarEjercicio(pieza),
                      }))}
                    />
                  )}
                </div>
              )}
              </div>
            </>
          ) : (
            <EmptyState
              icon={Layers}
              title={`«${bloque.name}» todavía no tiene hojas`}
              message="Una hoja es un día de entreno del bloque —Push, Pull, Pierna—. Añádela con «+ hoja», aquí arriba, y ponle dentro sus ejercicios."
            />
          )}
        </section>

        {/*
          ══ EL COSTADO: CON QUÉ SE JUZGA LO QUE HAY EN LA MESA ══════════════

          Las lecturas del bloque —sus cifras, el volumen por grupo y la
          progresión de sus ejercicios— desaparecían en cuanto se abría una
          hoja: la columna se vaciaba y se llenaba con la progresión del
          ejercicio en foco. El dueño: «se pierden las gráficas de bloque, que
          estaban genial».

          Y se apilaron las dos cosas: el ejercicio en foco arriba y las
          lecturas del bloque debajo, con una hoja abierta.

          ══ Y VUELVEN A SEPARARSE, PORQUE CADA VISTA HABLA DE UNA COSA ══════
          El dueño, el 9 sep, sobre la hoja: «metes en la hoja gráficos o
          información del bloque, no me gusta eso; debería ser información
          relativa a la hoja solo».

          Es lo contrario de lo que pidió el 8 —«se pierden las gráficas de
          bloque, que estaban genial»— y las dos veces tiene el mismo motivo
          detrás: con la hoja abierta, la columna medía casi mil cuatrocientos
          píxeles y había que bajar por «Este bloque» y «Volumen por
          microciclo» para llegar a lo del ejercicio que se está escribiendo.
          No se perdían las lecturas: sobraban DONDE estaban.

          Así que el costado dice de lo que trata la mesa, y nada más:

            con una hoja abierta   el ejercicio en foco y cómo llevó la sesión
            con el conjunto        las lecturas del bloque

          Las lecturas no se pierden: están en la vista del bloque, a un clic
          —«← Bloque 2», en la tira de arriba— que es de donde se viene.
        */}
        <div className="entreno-lado-derecho">
        {vista !== 'bloque' && (
          <>
        <ComparativaEjercicio
          etiqueta={etiqueta}
          microcycles={microcycles}
          ejercicios={ejerciciosDelDia}
          name={ejercicioEnFoco?.name || null}
          weekNumber={nav.week}
          onElegir={(nombre) => setFocoEjercicio(ejerciciosDelDia.find((ex) => ex.name === nombre)?.id || null)}
          onAmpliar={() => setProgresionAbierta(true)}
        />
        <ComoLoLlevo
          sesion={daySession.session}
          preguntas={activeQuestions(protocol)}
          fecha={daySession.session?.date ? shortDate(daySession.session.date) : null}
          onAmpliar={() => setSensacionesAbiertas(true)}
        />
        {/*
          ══ Y EL VOLUMEN, que es de la hoja aunque cite al bloque ═══════════
          El sujeto son los grupos de ESTA hoja y sus series; la cifra del
          bloque entra detrás solo como el fondo contra el que «6» significa
          algo. Ver la cabecera de `VolumenDeLaHoja`.

          Va la ÚLTIMA de las tres a propósito. Lo que se quitó del costado el
          9 de septiembre no fue la lectura: fue tener que bajar por ella para
          llegar a lo del ejercicio que se está escribiendo. Así que la
          progresión del ejercicio en foco sigue siendo lo primero, y esto se
          lee cuando se levanta la vista de la fila.
        */}
        {nav.day && <VolumenDeLaHoja program={program} bloque={bloque} hoja={nav.day} cycleType={activeClient.cycleType} />}
          </>
        )}
        {vista === 'bloque' && (
          <LecturasDelBloque
            program={program}
            cliente={activeClient}
            bloque={bloque}
            semanaEnCurso={semanaEnCurso}
            onIrBloque={(b) => {
              const suyas = weeksOfBlock(program, b);
              if (suyas.length > 0) irA(suyas[suyas.length - 1], 0, 'bloque');
            }}
            onIrSemana={(w) => irA(w, 0, 'bloque')}
            onFechaSemana={(w, fecha) => setMicrocycleDate(activeClient.id, w, fecha)}
            /* Los tres gestos del registro: abrir la hoja donde el cambio
               empieza, deshacerlo (con vuelta atrás), o ascenderlo al plan. */
            onIrCambio={(o) => {
              const suyas = weeksOfBlock(program, bloque);
              if (suyas.length === 0) return;
              const w = suyas.find((x) => x >= o.fromWeek) ?? suyas[suyas.length - 1];
              const dia = Math.max(0, blockSessionsOf(bloque).findIndex((h) => h.dayName === o.dayName));
              irA(w, dia, 'hoja');
            }}
            onQuitarCambio={(o) => {
              dropOverride(activeClient.id, bloque.id, o.id);
              toast({
                text: `«${describeOverride(o)}» deshecho: ${o.dayName} vuelve al plan del bloque en ese tramo.`,
                action: { label: 'Deshacer', onClick: () => addOverride(activeClient.id, bloque.id, o) },
              });
            }}
            onAscenderCambio={(o) => {
              promoteOverride(activeClient.id, bloque.id, o.id);
              toast({ text: `Aplicado al bloque: ahora es el plan de todos sus ${unidades}.` });
            }}
          />
        )}
        </div>
      {/* Las ventanas se montan solo abiertas: cerradas no calculan nada. */}
      {progresionAbierta && (
        <ProgresionPopup etiqueta={etiqueta} open onClose={() => setProgresionAbierta(false)} microcycles={microcycles} name={ejercicioEnFoco?.name || null} weekNumber={nav.week} />
      )}
      {sensacionesAbiertas && (
        <SensacionesPopup etiqueta={etiqueta} open onClose={() => setSensacionesAbiertas(false)} microcycles={microcycles} preguntas={activeQuestions(protocol)} />
      )}
      {/* Hasta cuándo vale lo que se está pegando. Solo cuando la respuesta
          puede ser distinta; ver `pegarEjercicio`. */}
      {pegadoConTramo && nav.day && (
        <TramoDelPegado
          pieza={pegadoConTramo}
          donde={`«${nav.day.dayName}»`}
          onPegar={(alcance) => pegarEjercicioAhora(pegadoConTramo, alcance)}
          onClose={() => setPegadoConTramo(null)}
        />
      )}
      {/* Y la misma pregunta cuando lo que cae es una hoja entera encima de
          otra. Lo que cambia es el título: aquí no se añade nada, se sustituye
          lo que la hoja lleva dentro. */}
      {sustitucion && (
        <TramoDelPegado
          pieza={sustitucion.pieza}
          donde={`«${sustitucion.dayName}»`}
          titulo={`Poner «${sustitucion.pieza.carga?.dayName || sustitucion.pieza.titulo}» en «${sustitucion.dayName}»`}
          intro={`«${sustitucion.dayName}» conserva su nombre y cambia lo que lleva dentro. Hasta cuándo:`}
          verbo="Sustituir"
          onPegar={(alcance) => sustituirHojaAhora(sustitucion.pieza, sustitucion.dayName, alcance)}
          onClose={() => setSustitucion(null)}
        />
      )}
      </div>
      </>
      )}

      {mandandoBloque && (
        <MandarLaPieza pieza={mandandoBloque} onClose={() => setMandandoBloque(null)} />
      )}

      {importAbierto && nav.day && (
        <ImportDayDialog
          clients={clients}
          activeClient={activeClient}
          targetDayName={nav.day.dayName}
          onImport={(exercises) => exercises.forEach((exercise) => addPlanExercise(activeClient.id, nav.week, nav.day.dayName, exercise))}
          onClose={() => setImportAbierto(false)}
        />
      )}

      {/*
        ── Los detalles, por el canto derecho ────────────────────────────────
        Todo lo que se toca una vez por día o por semana, junto y fuera de la
        hoja: la fecha, las sesiones, el nombre del día, tu indicación, el
        calentamiento, lo que contó, y la estructura del programa.
      */}
      {/*
        ── Dos paneles por el canto derecho ─────────────────────────────────
        El de la SEMANA: cuándo empieza, la estructura del programa y el
        calentamiento general. El del DÍA: su nombre, sus sesiones, tu
        indicación y su calentamiento propio. Se abre el que toca y se cierra
        donde estabas.
      */}
      {/*
        ── El panel de la semana: qué hizo ──────────────────────────────────
        Pulsar la semana abierta no enseña su configuración: enseña lo que
        pasó en ella. Por día, cada sesión registrada con su fecha, lo que
        completó, su tonelaje y lo que contó al acabar (fatiga, dolor…), con
        su nota. Arriba, la semana entera en dos cifras.
      */}
      <Modal open={panel === 'semana'} size="side" title={`${unidad} ${enBloque(nav.week)}`} onClose={() => setPanel(null)}>
        <div className="panel-secciones">
          <section className="panel-seccion semana-cifras">
            <div className="semana-cifra">
              <span className="v">{localeNumber(weekTonnage(microcycles, nav.week))}</span>
              <span className="k">kg levantados</span>
            </div>
            <div className="semana-cifra">
              <span className="v">{sesionesDeLaSemana.length}<small>/{nav.days.length}</small></span>
              <span className="k">sesiones hechas</span>
            </div>
          </section>
          {nav.days.map((day) => {
            const sesiones = sesionesDeLaSemana.filter((ss) => ss.dayName === day.dayName);
            return (
              <section key={day.dayName} className="panel-seccion">
                <div className="row between wrap gap-2">
                  <h3 className="panel-seccion-titulo">{day.dayName}</h3>
                  {sesiones.length === 0 && <span className="t-sm t-tertiary">sin entrenar</span>}
                </div>
                {sesiones.map((ss) => {
                  const hecho = sessionCompletion(ss, day);
                  const preguntas = activeQuestions(protocol).filter((q) => String(ss.feedback?.[q.id] ?? '').trim() !== '');
                  return (
                    <div key={ss.id || ss.date} className="semana-sesion">
                      <div className="semana-sesion-fila">
                        <input
                          type="date"
                          className="semana-sesion-fecha"
                          value={ss.date || ''}
                          aria-label={`Fecha de la sesión de ${day.dayName}`}
                          onChange={(e) => updateSession(activeClient.id, nav.week, ss.id, { date: e.target.value })}
                        />
                        {hecho && (
                          <span className={`semana-sesion-dato${hecho.pct >= 100 ? ' is-ok' : hecho.pct < 70 ? ' is-corto' : ''}`}>
                            {hecho.logged}/{hecho.planned} series
                          </span>
                        )}
                        <span className="semana-sesion-dato">{localeNumber(sessionTonnage(ss))} kg</span>
                      </div>
                      <Subjetivo preguntas={preguntas} answers={ss.feedback} />
                      {ss.clientNote?.trim() && <p className="semana-sesion-nota">«{ss.clientNote.trim()}»</p>}
                    </div>
                  );
                })}
              </section>
            );
          })}
        </div>
      </Modal>

      {/*
        Los ajustes del programa: lo que se decide una vez por cliente. Fuera de
        la pantalla del bloque, donde estuvieron estorbando al final, plegados y
        por tanto invisibles — pero en un DIÁLOGO y no por el canto derecho: el
        panel lateral va del alto de la ventana y esto ocupa un tercio, así que
        dejaba dos tercios de columna vacía; y `side` está para mirar un detalle
        sin soltar el trabajo, no para decidir. Aquí se decide.
      */}
      {/*
        ══ AQUÍ VIVÍA «ALTERNATIVAS DE «X»» ═══════════════════════════════════

        Una ventana con `EscribirHoja` sobre el plan del bloque —los ejercicios
        de la hoja, sus series, sus repeticiones y sus alternativas—, abierta
        desde la cabecera de la hoja. Se retira: «las alternativas no me gusta
        que existan», y el resto de lo que hacía se hace en el bloque, que es de
        quien es ese plan («+ ejercicio» de cada columna).

        Lo que NO se ha retirado todavía es el DATO: `exercise.alternatives`
        sigue guardándose, sigue llegando al portal del cliente («si está
        ocupada: X / Y») y sigue editándose en la Librería. Eso es producto y no
        maquetación, así que se decide aparte.
      */}
      <Modal open={panel === 'programa'} title="Ajustes del programa" onClose={() => setPanel(null)}>
        {ajustesDelPrograma}
      </Modal>

      {/*
        El calentamiento del día se ESCRIBE, así que va centrado y no por el
        canto derecho: la misma regla que los ajustes del programa de aquí
        arriba —«`side` está para mirar un detalle sin soltar el trabajo, no para
        decidir»— y que las hojas de la ficha del cliente. Detrás no hay nada con
        lo que comparar mientras se teclea: el calentamiento no sale en la hoja.

        `lg` porque es una lista de ejercicios con su vídeo, y en 440 px cada
        fila se parte en tres.
      */}
      <Modal open={panel === 'calentamiento' && Boolean(nav.day)} size="lg" title={nav.day ? `Calentamiento de ${nav.day.dayName}` : ''} onClose={() => setPanel(null)}>
        {nav.day && (
          <div className="panel-secciones">
            <section className="panel-seccion">
              <p className="t-sm t-secondary">Lo que hace antes de este entreno. Aparece arriba de la sesión en su portal, con el vídeo si lo pones.</p>
              <WarmupEditor
                drills={calentamientoDelDia}
                onChange={(nuevos) => setDayDrills(activeClient.id, nav.week, nav.day.dayName, nuevos)}
              />
            </section>
          </div>
        )}
      </Modal>
    </div>
  );
};
