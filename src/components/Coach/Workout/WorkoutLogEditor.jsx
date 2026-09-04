import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

/* Al hacer propio el calentamiento de un día se parte de una COPIA del programa,
   no de cero: lo normal es querer lo mismo con un ejercicio cambiado. Con ids
   nuevos, para que editarlo aquí no toque el del programa. */
import {
  ArrowLeft,
  ChevronDown,
  CalendarDays,
  Copy,
  FileUp,
  Layers,
  Plus,
  Trash2,
  Users,
} from 'lucide-react';

import { useApp } from '@/context/AppContext';
import { useArrastreOrden } from '@/lib/useArrastreOrden';
import { useClickOutside } from '@/lib/useClickOutside';
import { useDismissable } from '@/lib/useDismissable';
import { localeNumber, shortDate } from '@/lib/dates';
import { useEsTelefono } from '@/lib/useMediaQuery';
import { Modal } from '@/components/ui/Modal';
import {
  cloneExerciseAsTemplate,
  dayMuscleVolume,
  dayPlannedVolume,
  drillsForDay,
  dayHasOwnDrills,
  indexAfterMove,
  unitInitial,
  unitIsFeminine,
  unitLabel,
  unitLabelPlural,
  weekTonnage,
  weekdayForDay,
} from '@/domain/training';
import { sessionCompletion, sessionMuscleVolume, sessionTonnage } from '@/domain/sessions';
import { isEmptyDiet } from '@/domain/nutrition';
import { mergeCatalog } from '@/domain/catalog';
import { activeQuestions, clientProtocol, isModuleOn, isServiceOn } from '@/domain/protocol';
import { EmptyState, RenombrarEnSitio, SaveIndicator } from '@/components/ui/primitives';
import { ConditionsNote } from '@/components/conditions/ConditionsNote';
import { EquipmentNote } from '@/components/equipment/EquipmentNote';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { useToast } from '@/components/ui/ToastProvider';
import { deepClone } from '@/lib/ids';
import { WarmupEditor } from './WarmupBlock';
import { useProgramNavigation } from './useProgramNavigation';
import { useDaySession } from './useDaySession';
import { CycleSettings } from './CycleSettings';
import { CopyToClientPanel } from './CopyToClientPanel';
import { PastePlanDialog } from '../Import/PastePlanDialog';
import { ImportDayDialog } from './ImportDayDialog';
import { ExerciseList } from './ExerciseList';
import { AddExerciseForm } from './AddExerciseForm';
import { ComparativaEjercicio } from './ComparativaEjercicio';
import { MenuAcciones } from '@/components/ui/MenuAcciones';
import { Subjetivo } from '@/components/ui/Subjetivo';
import { VistaBloque } from './VistaBloque';
import { ComoLoLlevo } from './ComoLoLlevo';
import { ProgresionPopup } from './ProgresionPopup';
import { SensacionesPopup } from './SensacionesPopup';
import { DefinirBloque } from './DefinirBloque';
import {
  BLOCK_CHANGE,
  blockOfWeek,
  blocksOf,
  overridesAt,
  overrideSpan,
  isCurrentBlock,
  lastWeekNumber,
  resolvedMicrocycles,
  weekInBlock,
  weekLabel,
  weeksOfBlock,
} from '@/domain/blocks';
import { executedSessions } from '@/domain/sessions';
import { latestActiveWeek } from '@/domain/week';

/** Sin `?s=`, la última semana montada. */
const semanaPorDefecto = (microcycles) => (microcycles.length ? lastWeekNumber(microcycles) : null);
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
    deleteBlock,
    logBlockChange,
    addBlockSheet,
    removeBlockSheet,
    renameBlockSheet,
    moveBlockSheet,
    addBlockExercise,
    removeBlockExercise,
    restoreBlockExercise,
    moveBlockExercise,
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
    addDay,
    importDays,
    renameDay,
    duplicateDay,
    moveDay,
    removeDay,
    restoreDay,
    addExercises,
    updateExerciseSet,
    updateExerciseTarget,
    upsertLibraryExercise,
    nutrition,
    replicateClient,
    ensureProgram,
    ensureNutrition,
    coachPrefs,
    updateCoachPreferences,
    /* La otra mitad de lo que puede traer un Excel. Ver `dialogoDePegado`. */
    foodLibrary,
    catalogFoods,
    importDiet,
    upsertLibraryFood,
  } = useApp();

  const [copyOpen, setCopyOpen] = useState(false);
  const [newDayName, setNewDayName] = useState('');
  const [addingDay, setAddingDay] = useState(false);

  /* El alta de ejercicio del teléfono: la abre el botón flotante como hoja. */
  const esTelefono = useEsTelefono();
  const [altaAbierta, setAltaAbierta] = useState(false);
  /* «Copiar un día de otro cliente»: la hoja se abre desde el menú del día. */
  const [importAbierto, setImportAbierto] = useState(false);
  /* «Traer de un fichero»: la rutina que el cliente trae de fuera. */
  const [pegarAbierto, setPegarAbierto] = useState(false);
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
  const [renombrando, setRenombrando] = useState(null);
  const [indicacionAbierta, setIndicacionAbierta] = useState(false);
  const [progresionAbierta, setProgresionAbierta] = useState(false);
  const [sensacionesAbiertas, setSensacionesAbiertas] = useState(false);
  const [semanasAbiertas, setSemanasAbiertas] = useState(false);
  const semanasRef = useRef(null);
  useClickOutside(semanasRef, () => setSemanasAbiertas(false), semanasAbiertas);
  const semanasMenu = useDismissable(semanasAbiertas);
  /* La ventana de abrir un bloque nuevo. El SELECTOR de bloques se retiró: se
     cambia de bloque pulsándolos en el historial del costado, que además dice
     cuál fue cuál. */
  const [nuevoBloque, setNuevoBloque] = useState(false);

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
  const { weeks: semanasMontadas, week: semanaNav, selectWeek, days: diasNav, dayIndex: diaNav, selectDay } = nav;
  useEffect(() => {
    const semana = sParam && semanasMontadas.includes(sParam) ? sParam : semanaPorDefecto(microcycles);
    if (semana !== null && semana !== semanaNav) selectWeek(semana);
  }, [sParam, semanasMontadas, semanaNav, selectWeek, microcycles]);
  useEffect(() => {
    if (diasNav.length > 0 && dParam !== diaNav && dParam < diasNav.length) selectDay(dParam);
  }, [dParam, diasNav, diaNav, selectDay]);
  /*
    ══ DOS NIVELES, NO DOS MODOS ═════════════════════════════════════════════

    No es un interruptor entre dos vistas de lo mismo: es una jerarquía, y se
    navega como tal.

        Bloque 2 ▾                 ← el plan: sus hojas y sus ejercicios
           └ Push A · S4           ← la hoja: las series de esa semana

    Se ENTRA pulsando una hoja y se VUELVE por la miga. Un `SegmentedControl`
    decía que las dos eran hermanas y que había que elegir una; y además metía
    un control más en una barra que ya iba llena.

    ── Y se sale al bloque, no a la hoja ───────────────────────────────────
    Porque el bloque es lo que orienta: al abrir a alguien la pregunta es «qué
    le estoy dando», y desde ahí la hoja de hoy está a un clic informado —se ve
    lo que lleva dentro antes de entrar—. Al revés, la hoja no dice nada del
    bloque en el que vive.

    Va en la URL y no en un `useState` porque es dónde estás, no una
    preferencia: se comparte, se recarga y se vuelve con el botón de atrás.
  */
  const vista = params.get('v') === 'hoja' ? 'hoja' : 'bloque';
  /* `v` solo se escribe para bajar a la hoja: el bloque es el nivel de salida
     y no necesita marca en la URL. */
  const irA = (w, i = 0, v = vista) => {
    const next = { s: String(w), d: String(i) };
    setParams(v === 'hoja' ? { ...next, v } : next);
  };
  const verVista = (v) => irA(nav.week, Math.max(0, nav.dayIndex), v);
  /* Antes de cualquier `return` temprano: son hooks. */
  const semanaEnCurso = useMemo(
    () => latestActiveWeek({ microcycles, startDate: activeClient.startDate }),
    [microcycles, activeClient.startDate]
  );
  const sesionesDeLaSemana = useMemo(() => executedSessions(nav.microcycle || {}), [nav.microcycle]);
  const toast = useToast();
  const confirm = useConfirm();

  /**
   * Cambia un día de sitio y deja abierto EL MISMO que estabas editando.
   *
   * Las dos entradas —arrastrar un chip y Alt + ←/→ sobre él— pasan por aquí,
   * porque el cuidado es el mismo y el error también: `selectDay` guarda un
   * ÍNDICE, así que mover cualquier día corre el del que tienes abierto. Ver
   * `indexAfterMove`.
   */
  const moverDia = (from, to) => {
    const nombre = nav.days[from]?.dayName;
    if (!nombre) return;
    const destino = moveDay(activeClient.id, nav.week, nombre, to);
    if (destino < 0) return;
    irA(nav.week, indexAfterMove(nav.dayIndex, from, destino));
  };
  const ordenDias = useArrastreOrden({ onMove: moverDia });

  /* Las dos entradas al mismo sitio: el arrastre del carril y Alt + ←/→ pasan
     por `moverDia`. El hook se llama aquí arriba, antes de los retornos
     tempranos de «cargando» y «sin programa» — un hook no puede quedar detrás
     de un `return`. */
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
  const planned = useMemo(() => dayPlannedVolume(nav.day), [nav.day]);
  const doneSets = useMemo(
    () =>
      daySession.session
        ? Object.values(sessionMuscleVolume(daySession.session)).reduce((a, b) => a + b, 0)
        : Object.values(dayMuscleVolume(nav.day)).reduce((a, b) => a + b, 0),
    [daySession.session, nav.day]
  );

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
      dietaConVariantes={Boolean(nutrition[activeClient.id]?.hasDayVariants)}
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
      }}
    />
  );

  /*
    ══ El vacío ofrece las DOS rutas ══════════════════════════════════════════

    Enseñaba un solo botón, «Crear primer microciclo», y ese es justo el momento
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
          title="Este cliente no tiene programa todavía"
          message={
            hayDeQuienTraer
              ? 'Empieza de cero, trae el fichero donde ya tengas su rutina —un Excel, un Word o un PDF—, o trae el programa de alguien a quien ya se lo tengas montado.'
              : 'Empieza de cero, o trae el fichero donde ya tengas escrita su rutina: un Excel, un Word o un PDF.'
          }
          action={
            <div className="row wrap gap-2">
              <button
                type="button"
                className="btn btn-primary btn-lg"
                onClick={() => irA(startProgram(activeClient.id))}
              >
                <Plus size={17} /> Crear primer microciclo
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
                <FileUp size={17} /> Traer de un fichero
              </button>
              {hayDeQuienTraer && (
                <button
                  type="button"
                  className="btn btn-secondary btn-lg"
                  onClick={() => setCopyOpen(true)}
                  aria-expanded={copyOpen}
                >
                  <Users size={17} /> Traer de otro cliente
                </button>
              )}
            </div>
          }
        />

        {panelDeCopia}
        {dialogoDePegado}
      </div>
    );
  }

  const handleAddDay = (event) => {
    event.preventDefault();
    const name = newDayName.trim();
    if (!name) return;
    addDay(activeClient.id, nav.week, name);
    setNewDayName('');
    setAddingDay(false);
  };
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

  /* A la vista: la abierta y sus vecinas. */
  const VENTANA_SEMANAS = 5;
  const semanasVisibles = (() => {
    if (semanasDelBloque.length <= VENTANA_SEMANAS) return semanasDelBloque;
    const i = Math.max(0, semanasDelBloque.indexOf(nav.week));
    const desde = Math.min(Math.max(0, i - 2), semanasDelBloque.length - VENTANA_SEMANAS);
    return semanasDelBloque.slice(desde, desde + VENTANA_SEMANAS);
  })();
  const diaDeLaSemana =
    cycleType === 'weekly' && nav.day ? weekdayForDay(program.weeklySplit, nav.day.dayName) : null;

  const eliminarSemana = () => {
    const cycle = nav.microcycle;
    /* Si era la única del bloque abierto, con ella se va el bloque: se guarda lo
       que hace falta para que «Deshacer» lo devuelva entero. */
    const estructura = { blocks: program.blocks || [], weeklySplit: program.weeklySplit, mobilityDrills: program.mobilityDrills };
    irA(removeMicrocycle(activeClient.id, nav.week) || 1);
    if (!cycle) return;
    toast({
      text: `${unidad} ${enBloque(cycle.weekNumber)} ${fem ? 'eliminada' : 'eliminado'}.`,
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

  const eliminarDia = () => {
    const day = nav.day;
    const index = nav.dayIndex;
    const { week } = nav;
    if (nav.days.length === 1) {
      const cycle = nav.microcycle;
      const destino = removeMicrocycle(activeClient.id, week);
      if (destino) irA(destino);
      if (!cycle) return;
      toast({
        text: `«${day.dayName}» era el único día, así que se ha eliminado ${unidad.toLowerCase()} ${cycle.weekNumber}.`,
        duration: 10000,
        action: {
          label: 'Deshacer',
          onClick: () => {
            restoreMicrocycle(activeClient.id, cycle);
            irA(cycle.weekNumber);
          },
        },
      });
      return;
    }
    removeDay(activeClient.id, week, day.dayName);
    toast({
      text: `«${day.dayName}» eliminado.`,
      action: { label: 'Deshacer', onClick: () => restoreDay(activeClient.id, week, day, index) },
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

  const anadirEjercicioAlBloque = (dayName, exercise) => {
    addBlockExercise(activeClient.id, bloque.id, dayName, cloneExerciseAsTemplate(exercise));
    apuntarEnBloque(dayName, { kind: BLOCK_CHANGE.EJERCICIO_MAS, que: exercise.name });
    toast({ text: `«${exercise.name}» añadido a ${dayName}.` });
  };

  const quitarEjercicioDelBloque = (dayName, name) => {
    const quitado = removeBlockExercise(activeClient.id, bloque.id, dayName, name);
    if (!quitado) return;
    apuntarEnBloque(dayName, { kind: BLOCK_CHANGE.EJERCICIO_MENOS, que: name });
    toast({
      text: `«${name}» quitado de ${dayName}.`,
      action: {
        label: 'Deshacer',
        onClick: () => restoreBlockExercise(activeClient.id, bloque.id, dayName, quitado.exercise, quitado.index),
      },
    });
  };

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

  return (
    <div className="entreno-pagina">
      <VueltaALaRevision />
      <ConditionsNote area="training" />
      <EquipmentNote />
      {panelDeCopia}
      {dialogoDePegado}

      {/*
        ── LA MIGA: solo cuando hay algo encima ──────────────────────────────

        En la HOJA dice de qué bloque cuelga y devuelve a él. En el bloque no
        se pinta: es el nivel de salida, no hay a dónde subir, y el nombre ya
        lo dice su propia cabecera —tenerlo en los dos sitios era decir «Bloque
        1» dos veces en dos renglones seguidos—.

        Y ya no lleva selector de bloques: se cambia pulsándolos en el
        historial del costado, que además dice cuál fue cuál.
      */}
      {vista === 'hoja' && (
        <nav className="entreno-miga" aria-label="Dónde estás">
          <button
            type="button"
            className="entreno-miga-boton is-volver"
            onClick={() => verVista('bloque')}
            title={`Volver a ${bloque.name}`}
          >
            <ArrowLeft size={14} aria-hidden="true" />
            {bloque.name}
          </button>
          <span className="migas-sep" aria-hidden="true" />
          <span className="entreno-miga-aqui">
            {nav.day ? nav.day.dayName : 'Sin hojas'} · {unidad.toLowerCase()} {enBloque(nav.week)}
          </span>
        </nav>
      )}

      {vista === 'bloque' ? (
        <VistaBloque
          program={program}
          cliente={activeClient}
          bloque={bloque}
          semanaEnCurso={semanaEnCurso}
          library={ejerciciosDisponibles}
          onAbrirHoja={(dayName) => irA(nav.week, Math.max(0, nav.days.findIndex((d) => d.dayName === dayName)), 'hoja')}
          onIrSemana={(w) => irA(w, 0, 'hoja')}
          onRenombrarBloque={(id, nombre) => renameBlock(activeClient.id, id, nombre)}
          onQuitarBloque={quitarBloque}
          onNuevaSemana={() => irA(appendMicrocycle(activeClient.id), 0, 'bloque')}
          onNuevoBloque={() => setNuevoBloque(true)}
          onAnadirEjercicio={anadirEjercicioAlBloque}
          onQuitarEjercicio={quitarEjercicioDelBloque}
          onMoverEjercicio={moverEjercicioDelBloque}
          onSeries={seriesDelBloque}
          onReps={repsDelBloque}
          onAnadirHoja={anadirHojaAlBloque}
          onRenombrarHoja={renombrarHojaDelBloque}
          onQuitarHoja={quitarHojaDelBloque}
          onMoverHoja={moverHojaDelBloque}
          onTraerFichero={() => setPegarAbierto(true)}
          onRecordarEjercicio={upsertLibraryExercise}
          onSplit={(dia, valor) => updateWeeklySplit(activeClient.id, dia, valor)}
          onAjustes={() => setPanel('programa')}
          onFechaSemana={(w, fecha) => setMicrocycleDate(activeClient.id, w, fecha)}
          onIrBloque={(b) => {
            const suyas = weeksOfBlock(program, b);
            if (suyas.length > 0) irA(suyas[suyas.length - 1], 0, 'bloque');
          }}
        />
      ) : (
      <div className="entreno">
        <section className="entreno-hoja" aria-label={nav.day ? `Series de ${nav.day.dayName}` : 'Sin días'}>
          {/*
            La barra: qué día es, de qué semana, cómo va, y las dos puertas —los
            detalles y el menú—. Una línea. El indicador de guardado va aquí
            porque es lo único que hay que ver mientras se escribe.
          */}
          {/*
            La barra: los DÍAS como pestañas —cambiar de entrenamiento es un
            clic, aquí, no en la barra lateral— y a la derecha «Detalles» y el
            menú. Debajo, en voz baja, de qué semana y sesión se habla.
          */}
          {/*
            ══ Las dos filas de mando ══════════════════════════════════════
            Misma gramática en las dos: a la IZQUIERDA dónde estás (la semana,
            el día), a la DERECHA qué puedes hacer con ello. Un solo tipo de
            botón (silencioso) y un «···» por fila para lo que se hace poco.

              Fila 1 · la semana:  S1 · S2 · + sesión      Traer ▾ · Estructura · ···
              Fila 2 · el día:     Legs A · Push A · + Día  contexto · Detalles · ···

            Pulsar la semana que ya está abierta abre su panel (fecha,
            estructura, calentamiento): «en curso» no es un adorno, es una
            puerta.
          */}
          <header className="hoja-barra">
            <div className="hoja-semanas" ref={semanasRef}>
              {semanasDelBloque.length > VENTANA_SEMANAS && (
                <button
                  type="button"
                  className="hoja-semana is-todas"
                  aria-haspopup="menu"
                  aria-expanded={semanasAbiertas}
                  onClick={() => setSemanasAbiertas((v) => !v)}
                  title="Todas las semanas"
                >
                  {semanasDelBloque.length} {unidades} <ChevronDown size={13} aria-hidden="true" />
                </button>
              )}
              {semanasMenu.mounted && (
                <div ref={semanasMenu.ref} className="popover hoja-semanas-todas" data-state={semanasMenu.closing ? 'closing' : 'open'} role="menu">
                  {semanasDelBloque.map((w) => {
                    const micro = microcycles.find((m) => m.weekNumber === w) || {};
                    const hecha = executedSessions(micro).length > 0;
                    return (
                      <button
                        key={w}
                        type="button"
                        role="menuitemradio"
                        aria-checked={w === nav.week}
                        className={`hoja-semana${w === nav.week ? ' is-on' : ''}${w === semanaEnCurso ? ' is-curso' : hecha ? ' is-hecha' : ''}`}
                        onClick={() => {
                          setSemanasAbiertas(false);
                          irA(w);
                        }}
                      >
                        <span className="hoja-semana-n">{unitInitial(cycleType)}{enBloque(w)}</span>
                        {w === semanaEnCurso ? <span className="hoja-semana-estado">en curso</span> : hecha ? <span className="hoja-semana-estado">hecha</span> : null}
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="hoja-semanas-tira" role="tablist" aria-label={unidades}>
                {semanasVisibles.map((w) => {
                  const micro = microcycles.find((m) => m.weekNumber === w) || {};
                  const hecha = executedSessions(micro).length > 0;
                  const estado = w === semanaEnCurso ? 'is-curso' : hecha ? 'is-hecha' : '';
                  const abierta = w === nav.week;
                  return (
                    <button
                      key={w}
                      type="button"
                      role="tab"
                      aria-selected={abierta}
                      className={`hoja-semana${abierta ? ' is-on' : ''}${estado ? ` ${estado}` : ''}`}
                      onClick={() => (abierta ? setPanel('semana') : irA(w))}
                      title={abierta ? `Qué hizo en ${unidad.toLowerCase()} ${enBloque(w)}` : `${unidad} ${enBloque(w)}${micro.date ? ` · empieza el ${shortDate(micro.date)}` : ''}`}
                    >
                      <span className="hoja-semana-n">{unitInitial(cycleType)}{enBloque(w)}</span>
                      {w === semanaEnCurso ? <span className="hoja-semana-estado">en curso</span> : hecha ? <span className="hoja-semana-estado">hecha</span> : null}
                    </button>
                  );
                })}
                {/* Copiar y traer viven donde se usan: al añadir. Solo en el bloque abierto:
                    a uno cerrado no se le suman semanas, se abre otro. */}
                {esBloqueActual && (
                <MenuAcciones
                  label={`+ ${unidad.toLowerCase()}`}
                  clase="hoja-semana is-nueva"
                  sinFlecha
                  alineado="izquierda"
                  ariaLabel={`Añadir ${unidad.toLowerCase()}`}
                  items={[
                    { icon: Plus, label: `Nueva, con la misma estructura`, run: () => irA(appendMicrocycle(activeClient.id)) },
                    { icon: Copy, label: `Duplicar ${unidad.toLowerCase()} ${nav.week}, con sus series`, run: () => {
                      const created = cloneMicrocycle(activeClient.id, nav.week);
                      if (created) irA(created);
                    } },
                    null,
                    hayDeQuienTraer && { icon: Users, label: 'Traer el programa de otro cliente', run: () => setCopyOpen(true) },
                    { icon: FileUp, label: 'Traer de un fichero', run: () => setPegarAbierto(true) },
                  ].filter(Boolean)}
                />
                )}
              </div>
            </div>
            <div className="hoja-barra-acciones">
              {indicator}
              {/* Subir al bloque es cosa de la miga, arriba: dos puertas al
                  mismo sitio es una de más. */}
              {esBloqueActual && (
                <button type="button" className="btn btn-icon btn-icon-compact hoja-nuevo-bloque" onClick={() => setNuevoBloque(true)} aria-label="Nuevo bloque" title="Nuevo bloque: cierra este y abre el siguiente">
                  <Plus size={15} />
                </button>
              )}
              <button type="button" className="btn btn-icon btn-icon-compact btn-icon-danger hoja-papelera" onClick={eliminarSemana} aria-label={`Eliminar ${unidad.toLowerCase()} ${enBloque(nav.week)}`} title={`Eliminar ${unidad.toLowerCase()} ${enBloque(nav.week)}`}>
                <Trash2 size={15} />
              </button>
            </div>
          </header>

          <div className="hoja-barra is-dias">
            <div className="hoja-dias" role="tablist" aria-label="Días" ref={ordenDias.carrilRef}>
              {nav.days.map((day, index) =>
                renombrando === index ? (
                  <RenombrarEnSitio
                    key={day.dayName}
                    variante="is-dia"
                    value={day.dayName}
                    label="Nuevo nombre del día"
                    onRename={(nombre) => renameDay(activeClient.id, nav.week, day.dayName, nombre)}
                    onDone={() => setRenombrando(null)}
                  />
                ) : (
                  <button
                    key={day.dayName}
                    type="button"
                    role="tab"
                    aria-selected={index === nav.dayIndex}
                    className={`hoja-dia${index === nav.dayIndex ? ' is-on' : ''}${ordenDias.destino === index && ordenDias.arrastrando !== index ? ' is-drop-target' : ''}${ordenDias.arrastrando === index ? ' is-dragging' : ''}`}
                    {...ordenDias.props(index)}
                    onClick={() => irA(nav.week, index)}
                    onDoubleClick={() => setRenombrando(index)}
                    onKeyDown={(e) => {
                      if (e.key === 'F2') {
                        e.preventDefault();
                        setRenombrando(index);
                      } else if (e.altKey && e.key === 'ArrowLeft' && index > 0) {
                        e.preventDefault();
                        moverDia(index, index - 1);
                      } else if (e.altKey && e.key === 'ArrowRight' && index < nav.days.length - 1) {
                        e.preventDefault();
                        moverDia(index, index + 1);
                      }
                    }}
                    aria-keyshortcuts="F2 Alt+ArrowLeft Alt+ArrowRight"
                    title="Arrastra para cambiarlo de sitio (o Alt + ←/→) · doble clic o F2 para renombrarlo"
                  >
                    {day.dayName}
                  </button>
                )
              )}
              {addingDay ? (
                <form className="hoja-dia-alta" onSubmit={handleAddDay}>
                  <input
                    autoFocus
                    className="input input-sm"
                    value={newDayName}
                    onChange={(e) => setNewDayName(e.target.value)}
                    placeholder="Nombre del día"
                    aria-label="Nombre del nuevo día"
                    onKeyDown={(e) => e.key === 'Escape' && setAddingDay(false)}
                  />
                  <button type="submit" className="btn btn-primary btn-sm" disabled={!newDayName.trim()}>
                    Añadir
                  </button>
                </form>
              ) : (
                <MenuAcciones
                  label="+ Día"
                  clase="hoja-dia is-nuevo"
                  sinFlecha
                  alineado="izquierda"
                  ariaLabel="Añadir día"
                  items={[
                    { icon: Plus, label: 'Nuevo día', run: () => setAddingDay(true) },
                    nav.day && { icon: Copy, label: `Duplicar «${nav.day.dayName}»`, run: () => duplicateDay(activeClient.id, nav.week, nav.day.dayName) },
                    null,
                    { icon: Users, label: 'Traer un día de otro cliente', run: () => setImportAbierto(true) },
                  ].filter(Boolean)}
                />
              )}
            </div>
            {nav.day && (
              <div className="hoja-barra-acciones">
                <span className="hoja-contexto">
                  {[diaDeLaSemana && diaDeLaSemana.toLowerCase(), planned > 0 && `${doneSets}/${planned} series`]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
                {/*
                  Las sesiones del día, en un menú junto a la fecha: cuál se mira,
                  abrir otra, quitar la abierta. La fecha se cambia en el panel de
                  la semana, que es donde se ven todas juntas.
                */}
                <MenuAcciones
                  label={daySession.session?.date ? `sesión del ${shortDate(daySession.session.date)}` : 'sin sesión'}
                  items={[
                    ...daySession.sessions.map((ss) => ({
                      icon: CalendarDays,
                      label: `${ss.date ? shortDate(ss.date) : 'sin fecha'}${ss.id === daySession.activeId ? ' · abierta' : ''}`,
                      run: () => daySession.select(ss.id),
                    })),
                    daySession.sessions.length > 0 ? null : undefined,
                    { icon: Plus, label: 'Otra sesión de este día', run: () => {
                      const id = startSession(activeClient.id, nav.week, nav.day.dayName);
                      if (id) daySession.select(id);
                    } },
                    daySession.activeId && !daySession.session?.isLegacy
                      ? { icon: Trash2, label: 'Quitar esta sesión', danger: true, run: () => removeSession(activeClient.id, nav.week, daySession.activeId) }
                      : undefined,
                  ]}
                />
                <button type="button" className="btn btn-icon btn-icon-compact btn-icon-danger hoja-papelera" onClick={eliminarDia} aria-label={`Eliminar «${nav.day.dayName}»`} title={`Eliminar «${nav.day.dayName}»`}>
                  <Trash2 size={15} />
                </button>
              </div>
            )}
          </div>

          {nav.day ? (
            <>
              {/*
                ── El calentamiento, a la vista ──────────────────────────────
                Una línea encima de la hoja: qué se hace antes de empezar. Es
                del bloque (o propio del día, si el día tiene el suyo) y se edita
                donde vive: en su panel. Ni escondido ni ocupando media pantalla.
              */}
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
                Tu indicación para el día, debajo del calentamiento y en la misma
                voz: una línea si la hay, un «+ indicación» si no. Se edita ahí
                mismo. El cliente la ve al abrir el día.
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
                  <button type="button" className="hoja-indicacion-mas" onClick={() => setIndicacionAbierta(true)}>
                    + indicación para el cliente
                  </button>
                ))}
              <Lista
                exercises={daySession.exercises}
                focusedId={ejercicioEnFoco?.id || null}
                onFocusExercise={setFocoEjercicio}
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
                onMove={(from, to) => {
                  const nombre = nav.day.exercises[from]?.name;
                  if (nombre) moveBlockExercise(activeClient.id, bloque.id, nav.day.dayName, nombre, to - from);
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
                onSetChange={(exId, setIdx, field, value) => {
                  if (field === 'targetReps' || field === 'targetRir') {
                    updateExerciseSet(activeClient.id, nav.week, nav.day.dayName, exId, setIdx, field, value);
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
                    value
                  );
                  if (id && id !== daySession.activeId) daySession.select(id);
                }}
                onTargetChange={(exId, value) => updateExerciseTarget(activeClient.id, nav.week, nav.day.dayName, exId, value)}
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
                </div>
              )}
            </>
          ) : (
            <EmptyState
              icon={Layers}
              title={`${unidad} ${enBloque(nav.week)} sin días`}
              message="Añade un día en la columna de la izquierda para empezar a programar."
            />
          )}
        </section>

        <div className="entreno-lado-derecho">
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
        </div>
      {/* Las ventanas se montan solo abiertas: cerradas no calculan nada. */}
      {progresionAbierta && (
        <ProgresionPopup etiqueta={etiqueta} open onClose={() => setProgresionAbierta(false)} microcycles={microcycles} name={ejercicioEnFoco?.name || null} weekNumber={nav.week} />
      )}
      {sensacionesAbiertas && (
        <SensacionesPopup etiqueta={etiqueta} open onClose={() => setSensacionesAbiertas(false)} microcycles={microcycles} preguntas={activeQuestions(protocol)} />
      )}
      </div>
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

      {nuevoBloque && (
        <DefinirBloque
          open
          onClose={() => setNuevoBloque(false)}
          program={program}
          library={ejerciciosDisponibles}
          onTraerFichero={() => {
            setNuevoBloque(false);
            setImportarLimpio(true);
            setPegarAbierto(true);
          }}
          onAbrir={(bloqueNuevo) => irA(startBlockWithPlan(activeClient.id, bloqueNuevo))}
        />
      )}

      {/*
        Los ajustes del programa: lo que se decide una vez por cliente. Fuera de
        la pantalla del bloque, donde estuvieron estorbando al final, plegados y
        por tanto invisibles — pero en un DIÁLOGO y no por el canto derecho: el
        panel lateral va del alto de la ventana y esto ocupa un tercio, así que
        dejaba dos tercios de columna vacía; y `side` está para mirar un detalle
        sin soltar el trabajo, no para decidir. Aquí se decide.
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
