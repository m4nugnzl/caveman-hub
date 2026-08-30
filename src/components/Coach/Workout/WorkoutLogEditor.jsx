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
  Dumbbell,
  FileSpreadsheet,
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
  findMicrocycle,
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
import { NuevoBloqueDialog } from './NuevoBloqueDialog';
import {
  BLOCK_CHANGE,
  blockOfWeek,
  blockPlan,
  isCurrentBlock,
  lastWeekNumber,
  untrainedWeeksOfDay,
  weekInBlock,
  weekLabel,
  weeksAheadOfBlock,
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
    startBlock,
    renameBlock,
    logBlockChange,
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
    addExercise,
    addExercises,
    removeExercise,
    restoreExercise,
    moveExercise,
    setExerciseNote,
    updateExerciseSet,
    updateExerciseTarget,
    setExerciseSetCount,
    addExerciseSetSlot,
    removeExerciseSetSlot,
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
  /* «Traer de un Excel»: la rutina que el cliente trae de fuera, pegada o subida. */
  const [pegarAbierto, setPegarAbierto] = useState(false);
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
  const microcycles = useMemo(() => program?.microcycles || [], [program]);
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
        icon={Dumbbell}
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
        icon={Dumbbell}
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
        importDays(activeClient.id, semana, days, { dropEmptyDays: desdeCero });
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
      onClose={() => setPegarAbierto(false)}
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
          icon={Dumbbell}
          title="Este cliente no tiene programa todavía"
          message={
            hayDeQuienTraer
              ? 'Empieza de cero, sube el Excel en el que ya tengas su rutina, o trae el programa de alguien a quien ya se lo tengas montado.'
              : 'Empieza de cero, o sube el Excel en el que ya tengas escrita su rutina.'
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
                <FileSpreadsheet size={17} /> Traer de un Excel
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
    plantear, ABRE el plan del bloque; y esto se abre por el canto derecho
    desde «ajustes», que es donde se busca lo que se configura una vez.
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
  const etiqueta = (w) => weekLabel(program, w, unidad.charAt(0));
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
      text: `${unidad} ${enBloque(cycle.weekNumber)} eliminada.`,
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
    ESCRIBIR EN EL BLOQUE, NO EN LA CELDA
    ══════════════════════════════════════════════════════════════════════════

    Lo que se pauta desde la vista «Bloque» no es de una semana: es del bloque,
    que es lo que un bloque significa (`domain/blocks`). Así que cada gesto de
    ahí se reparte a sus semanas, con dos cuidados:

      · Nunca a una sesión YA ENTRENADA (`untrainedWeeksOfDay`). Añadirle un
        ejercicio a alguien que ya cerró esa semana no es programar: es
        cambiarle el pasado, y encima lo deja contado como que se saltó una
        serie que nunca tuvo delante.
      · Cada semana lleva SU copia del ejercicio, con su propio id
        (`cloneExerciseAsTemplate`). El id es lo único que mira
        `log_session_set` para saber dónde anotar, así que repetirlo entre
        semanas cruzaría los registros. Es la misma razón por la que
        `cloneDays` reidentifica.

    Y por eso los ejercicios se localizan por NOMBRE y no por id: «Press banca»
    de la semana 3 y el de la 4 son el mismo ejercicio del plan y dos objetos
    distintos.
  */
  const diaDe = (w, dayName) => (findMicrocycle(microcycles, w)?.days || []).find((d) => d.dayName === dayName) || null;
  const escribiblesDe = (dayName) => untrainedWeeksOfDay(program, bloque, dayName);
  const cuantasUnidades = (n) => `${n} ${n === 1 ? unidad.toLowerCase() : unidades}`;

  /** El aviso de que no queda dónde escribir: se dice, no se traga. */
  const sinSitio = (dayName) => {
    toast({
      text: `«${dayName}» ya está entrenado en todas las ${unidades} de este bloque, así que no he cambiado nada. Añade una ${unidad.toLowerCase()} más o abre un bloque nuevo.`,
      duration: 8000,
    });
  };

  /*
    ── La bitácora ───────────────────────────────────────────────────────────
    Todo cambio que mueve el VOLUMEN del plan se apunta en su bloque: qué, en
    qué hoja, cuándo y —lo que más importa— con qué alcance. `bloque` es lo
    escrito desde el plan, que va a todas sus semanas por entrenar y lo deja
    uniforme; `semana` es lo tocado en una hoja concreta, que la saca de la
    plantilla a propósito. Ni uno ni otro parten el bloque: eso se decide a
    mano. Ver `logBlockChange` en `domain/blocks`.
  */
  const apuntar = (entry) => logBlockChange(activeClient.id, bloque.id, entry);
  const apuntarEnBloque = (hoja, semanas, entry) =>
    apuntar({ alcance: semanas.length === semanasDelBloque.length ? 'bloque' : 'semana', semanas, hoja, ...entry });

  const anadirEjercicioAlBloque = (dayName, exercise) => {
    const ws = escribiblesDe(dayName);
    if (ws.length === 0) return sinSitio(dayName);
    ws.forEach((w) => addExercise(activeClient.id, w, dayName, cloneExerciseAsTemplate(exercise)));
    apuntarEnBloque(dayName, ws, { kind: BLOCK_CHANGE.EJERCICIO_MAS, que: exercise.name });
    toast({ text: `«${exercise.name}» añadido a ${dayName} en ${cuantasUnidades(ws.length)}.` });
  };

  const quitarEjercicioDelBloque = (dayName, name) => {
    const donde = escribiblesDe(dayName)
      .map((w) => {
        const lista = diaDe(w, dayName)?.exercises || [];
        const index = lista.findIndex((ex) => ex.name === name);
        return index < 0 ? null : { w, index, exercise: lista[index] };
      })
      .filter(Boolean);
    if (donde.length === 0) return sinSitio(dayName);

    donde.forEach(({ w, exercise }) => removeExercise(activeClient.id, w, dayName, exercise.id));
    apuntarEnBloque(dayName, donde.map((d) => d.w), { kind: BLOCK_CHANGE.EJERCICIO_MENOS, que: name });
    toast({
      text: `«${name}» quitado de ${dayName} en ${cuantasUnidades(donde.length)}.`,
      action: {
        label: 'Deshacer',
        onClick: () => donde.forEach(({ w, exercise, index }) => restoreExercise(activeClient.id, w, dayName, exercise, index)),
      },
    });
  };

  const moverEjercicioDelBloque = (dayName, name, delta) => {
    escribiblesDe(dayName).forEach((w) => {
      const lista = diaDe(w, dayName)?.exercises || [];
      const from = lista.findIndex((ex) => ex.name === name);
      const to = from + delta;
      if (from < 0 || to < 0 || to >= lista.length) return;
      moveExercise(activeClient.id, w, dayName, from, to);
    });
  };

  const seriesDelBloque = (dayName, name, n, antes) => {
    const ws = escribiblesDe(dayName);
    if (ws.length === 0) return sinSitio(dayName);
    ws.forEach((w) => {
      const ex = (diaDe(w, dayName)?.exercises || []).find((e) => e.name === name);
      if (ex) setExerciseSetCount(activeClient.id, w, dayName, ex.id, n);
    });
    apuntarEnBloque(dayName, ws, { kind: BLOCK_CHANGE.SERIES, que: name, de: antes, a: n });
  };

  const repsDelBloque = (dayName, name, reps) => {
    const ws = escribiblesDe(dayName);
    if (ws.length === 0) return sinSitio(dayName);
    ws.forEach((w) => {
      const ex = (diaDe(w, dayName)?.exercises || []).find((e) => e.name === name);
      if (ex) updateExerciseTarget(activeClient.id, w, dayName, ex.id, reps);
    });
  };

  const anadirHojaAlBloque = (nombre) => {
    const ws = weeksAheadOfBlock(program, bloque, semanaEnCurso);
    /* Un bloque sin ninguna montada no tiene dónde poner la sesión: primero la
       semana. No debería llegar aquí —la pantalla vacía va antes—, pero un
       aviso vale más que un alta que no hace nada. */
    if (ws.length === 0) {
      toast({ text: `Este bloque todavía no tiene ninguna ${unidad.toLowerCase()}. Añade una y vuelve a intentarlo.` });
      return;
    }
    ws.forEach((w) => addDay(activeClient.id, w, nombre));
    apuntarEnBloque(nombre, ws, { kind: BLOCK_CHANGE.HOJA_MAS, que: nombre });
    toast({ text: `«${nombre}» añadida en ${cuantasUnidades(ws.length)}.` });
  };

  /* Renombrar y reordenar valen para TODAS sus semanas, entrenadas incluidas:
     no cambian lo que se hizo, solo cómo se llama y en qué orden se lee. */
  const renombrarHojaDelBloque = (de, a) => semanasDelBloque.forEach((w) => renameDay(activeClient.id, w, de, a));
  const moverHojaDelBloque = (from, to) =>
    semanasDelBloque.forEach((w) => {
      const nombre = findMicrocycle(microcycles, w)?.days?.[from]?.dayName;
      if (nombre) moveDay(activeClient.id, w, nombre, to);
    });

  /* Quitar un día del bloque respeta lo entrenado: donde hay sesión anotada se
     queda, y se dice en cuántas. Lo usan la vista y la ventana del bloque. */
  const quitarHojaDelBloque = (nombre) => {
    let saltadas = 0;
    const quitadas = [];
    semanasDelBloque.forEach((w) => {
      const micro = findMicrocycle(microcycles, w);
      if (executedSessions(micro || {}).some((ss) => ss.dayName === nombre)) saltadas += 1;
      else {
        removeDay(activeClient.id, w, nombre);
        quitadas.push(w);
      }
    });
    if (quitadas.length > 0) apuntarEnBloque(nombre, quitadas, { kind: BLOCK_CHANGE.HOJA_MENOS, que: nombre });
    if (saltadas > 0) {
      toast({
        text: `«${nombre}» se ha quitado de las ${unidades} sin entrenar; se conserva en ${saltadas} con sesión anotada.`,
        duration: 8000,
      });
    }
  };

  /*
    ── El hueco que deja «+ semana» ──────────────────────────────────────────
    Continuar el programa crea la semana siguiente con los días VACÍOS
    (`appendMicrocycle`), así que dentro de un bloque vivo siempre hay sesiones
    por rellenar. Esto las rellena con la plantilla: solo las que están en
    blanco —nunca pisa nada escrito— y con una copia propia por semana.
  */
  const rellenarConLaPlantilla = (dayName, semanas) => {
    const origen = diaDe(blockPlan(program, bloque).reference, dayName);
    const plantilla = origen?.exercises || [];
    if (plantilla.length === 0) return;
    semanas.forEach((w) => {
      if (!diaDe(w, dayName)) addDay(activeClient.id, w, dayName);
      if ((diaDe(w, dayName)?.exercises || []).length > 0) return;
      addExercises(activeClient.id, w, dayName, plantilla.map(cloneExerciseAsTemplate));
    });
    apuntarEnBloque(dayName, semanas, {
      kind: BLOCK_CHANGE.PLANTILLA,
      que: semanas.map((w) => `${unidad.charAt(0)}${enBloque(w)}`).join(', '),
    });
    toast({ text: `${dayName}: plantilla puesta en ${cuantasUnidades(semanas.length)}.` });
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

  /** Una serie más o una menos en la hoja abierta, contada en la bitácora. */
  const seriesDeLaHoja = (exId, delta, setIdx) => {
    const ex = (nav.day?.exercises || []).find((e) => e.id === exId);
    if (!ex) return;
    const antes = (ex.sets || []).length;
    if (delta > 0) addExerciseSetSlot(activeClient.id, nav.week, nav.day.dayName, exId);
    else removeExerciseSetSlot(activeClient.id, nav.week, nav.day.dayName, exId, setIdx);
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
          onRellenar={rellenarConLaPlantilla}
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
                        <span className="hoja-semana-n">{unidad.charAt(0)}{enBloque(w)}</span>
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
                      <span className="hoja-semana-n">{unidad.charAt(0)}{enBloque(w)}</span>
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
                    { icon: FileSpreadsheet, label: 'Traer de un Excel', run: () => setPegarAbierto(true) },
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
                onNoteChange={(exId, note) => setExerciseNote(activeClient.id, nav.week, nav.day.dayName, exId, note)}
                onMove={(from, to) => moveExercise(activeClient.id, nav.week, nav.day.dayName, from, to)}
                onRemove={(exId) => {
                  const index = nav.day.exercises.findIndex((ex) => ex.id === exId);
                  const exercise = nav.day.exercises[index];
                  removeExercise(activeClient.id, nav.week, nav.day.dayName, exId);
                  if (!exercise) return;
                  apuntarEnLaHoja({ kind: BLOCK_CHANGE.EJERCICIO_MENOS, que: exercise.name });
                  const { week } = nav;
                  const { dayName } = nav.day;
                  toast({
                    text: `«${exercise.name}» eliminado.`,
                    action: { label: 'Deshacer', onClick: () => restoreExercise(activeClient.id, week, dayName, exercise, index) },
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
                      onAdd={(exercise) => {
                        addExercise(activeClient.id, nav.week, nav.day.dayName, exercise);
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
                    onAdd={(exercise) => {
                        addExercise(activeClient.id, nav.week, nav.day.dayName, exercise);
                        apuntarEnLaHoja({ kind: BLOCK_CHANGE.EJERCICIO_MAS, que: exercise.name });
                      }}
                    onRememberExercise={upsertLibraryExercise}
                  />
                </div>
              )}
            </>
          ) : (
            <EmptyState
              icon={Dumbbell}
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
          onImport={(exercises) => exercises.forEach((exercise) => addExercise(activeClient.id, nav.week, nav.day.dayName, exercise))}
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
        <NuevoBloqueDialog
          open
          onClose={() => setNuevoBloque(false)}
          program={program}
          cliente={activeClient}
          onAbrir={({ name, keepStructure }) => irA(startBlock(activeClient.id, { name, keepStructure }))}
        />
      )}

      {/*
        Los ajustes del programa: lo que se decide una vez por cliente. Por el
        canto derecho y no en la pantalla del bloque, donde estuvieron
        estorbando al final, plegados y por tanto invisibles.
      */}
      <Modal open={panel === 'programa'} size="side" title="Ajustes del programa" onClose={() => setPanel(null)}>
        <div className="panel-secciones">
          <section className="panel-seccion">{ajustesDelPrograma}</section>
        </div>
      </Modal>

      <Modal open={panel === 'calentamiento' && Boolean(nav.day)} size="side" title={nav.day ? `Calentamiento de ${nav.day.dayName}` : ''} onClose={() => setPanel(null)}>
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
