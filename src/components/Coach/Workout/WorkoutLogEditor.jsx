import { useEffect, useMemo, useState } from 'react';

/* Al hacer propio el calentamiento de un día se parte de una COPIA del programa,
   no de cero: lo normal es querer lo mismo con un ejercicio cambiado. Con ids
   nuevos, para que editarlo aquí no toque el del programa. */
const deepCopyDrills = (drills) =>
  (drills || []).map((d) => ({ ...d, id: `${d.id}-dia-${Math.random().toString(36).slice(2, 8)}` }));
import { Dumbbell, FileSpreadsheet, GripVertical, NotebookPen, Plus, Quote, Users, Waves } from 'lucide-react';

import { useApp } from '@/context/AppContext';
import { useArrastreOrden } from '@/lib/useArrastreOrden';
import { useEsTelefono } from '@/lib/useMediaQuery';
import { Modal } from '@/components/ui/Modal';
import {
  dayHasOwnDrills,
  dayMuscleVolume,
  dayPlannedVolume,
  indexAfterMove,
  rotatingSlots,
  trainingDayCount,
  unitLabel,
} from '@/domain/training';
import { sessionMuscleVolume } from '@/domain/sessions';
import { isEmptyDiet } from '@/domain/nutrition';
import { mergeCatalog } from '@/domain/catalog';
import { activeQuestions, clientProtocol, isModuleOn, isServiceOn } from '@/domain/protocol';
import { EmptyState, Fold, PageHead, Panel, SaveIndicator } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/ToastProvider';
import { SessionFeedback } from './SessionFeedback';
import { WarmupEditor } from './WarmupBlock';
import { useProgramNavigation } from './useProgramNavigation';
import { useDaySession } from './useDaySession';
import { SessionBar } from './SessionBar';
import { CycleSettings } from './CycleSettings';
import { WeeklySplitEditor } from './WeeklySplitEditor';
import { MicrocycleBar } from './MicrocycleBar';
import { CopyToClientPanel } from './CopyToClientPanel';
import { PastePlanDialog } from '../Import/PastePlanDialog';
import { DayHeader } from './DayHeader';
import { ImportDayDialog } from './ImportDayDialog';
import { ExerciseList } from './ExerciseList';
import { AddExerciseForm } from './AddExerciseForm';

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
    updateMobilityDrills,
    setDayNote,
    setDayDrills,
    removeSession,
    startProgram,
    appendMicrocycle,
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
  const [notaDiaAbierta, setNotaDiaAbierta] = useState(null);

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
  const microcycles = program?.microcycles || [];
  /* El calentamiento del PROGRAMA. Se lee en tres sitios —su pliegue, el aviso
     de lo que se copia y el día que hereda—, así que se nombra una vez. */
  const drills = program?.mobilityDrills || [];
  const cycleType = activeClient.cycleType || 'weekly';
  /* Qué módulos existen para este cliente. Se configura en Ajustes → Protocolo y
     decide qué piezas de esta pantalla se pintan siquiera. */
  const protocol = clientProtocol(activeClient.preferences);

  const nav = useProgramNavigation(activeClient.id, microcycles);
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
    nav.selectDay(indexAfterMove(nav.dayIndex, from, destino));
  };

  /* Las dos entradas al mismo sitio: el arrastre del carril y Alt + ←/→ pasan
     por `moverDia`. El hook se llama aquí arriba, antes de los retornos
     tempranos de «cargando» y «sin programa» — un hook no puede quedar detrás
     de un `return`. */
  const ordenDias = useArrastreOrden({ onMove: moverDia });
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
        if (desdeCero) nav.selectWeek(semana);
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
        */
        await ensureNutrition(activeClient.id);
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
                onClick={() => nav.selectWeek(startProgram(activeClient.id))}
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
    ══ El bloque del programa: dos filas que se abren EN SU SITIO ═════════════

    Cómo está montado el programa y cómo se calienta se deciden una vez por
    cliente, pero son el contexto de todo lo que hay debajo: por eso abren la
    pantalla, y por eso lo hacen en voz baja. Cerradas dicen lo que hay —«Semana
    natural · empieza el 12 sept · 4 días de entreno»—, así que plegarlas no es
    esconderlas.

    Antes eran dos cosas distintas pegadas: una línea sin superficie que abría
    una VENTANA modal y, justo debajo, un panel con otro chevron que se abría en
    su sitio. Mismo gesto, dos formas y dos comportamientos. Ahora son dos
    pliegues (`Fold`) del mismo bloque; una ventana es para lo que viene de
    fuera —traer de otro cliente—, no para lo que ya estás mirando.
  */
  /* Solo la semana natural tiene «días de entreno» que contar: en el ciclo
     rotativo el reparto lo dice el patrón, que ya está en el resumen. */
  const diasDeEntreno = cycleType === 'weekly' ? trainingDayCount(program.weeklySplit) : null;
  /* Las casillas del ciclo rotativo, con los días de ESTE microciclo puestos.
     Es la misma cadena que el cliente ve en su progreso. */
  const cicloSlots =
    cycleType === 'rotating' ? rotatingSlots(activeClient.cyclePattern, nav.days) : [];

  const bloqueDelPrograma = (
    <Panel tight className="col">
      <CycleSettings
        client={activeClient}
        onChange={(fields) => updateClient(activeClient.id, fields, { immediate: false })}
        protocol={protocol}
        /* Igual que el interruptor de la dieta: cambiar el protocolo desde aquí
           es hacerlo para ESTE cliente, así que queda marcado como excepción y
           «poner al día» deja de pasarle por encima. */
        onProtocolChange={(next) => saveClientException(activeClient.id, { protocol: next })}
        cicloSlots={cicloSlots}
        resumenExtra={
          diasDeEntreno === null
            ? null
            : `${diasDeEntreno} ${diasDeEntreno === 1 ? 'día' : 'días'} de entreno`
        }
      >
        {cycleType === 'weekly' && (
          <WeeklySplitEditor
            split={program.weeklySplit}
            onChange={(day, value) => updateWeeklySplit(activeClient.id, day, value)}
          />
        )}
      </CycleSettings>

      {/*
        El calentamiento es del PROGRAMA, no del día: es la rutina de movilidad
        de este cliente y se repite. Por eso vive aquí y no dentro de cada día
        —que obligaría a mantener cinco copias— y por eso va PLEGADO: se monta
        una vez y después se consulta poco. El del DÍA, cuando lo tiene, sigue
        en el día.
      */}
      {isModuleOn(protocol, 'warmup') && (
        <Fold
          icon={Waves}
          title="Calentamiento y movilidad"
          summary={
            drills.length === 0
              ? 'todavía sin ejercicios'
              : `${drills.length} ${drills.length === 1 ? 'ejercicio' : 'ejercicios'}`
          }
        >
          <WarmupEditor
            drills={drills}
            onChange={(nuevos) => updateMobilityDrills(activeClient.id, nuevos)}
          />
        </Fold>
      )}
    </Panel>
  );

  return (
    <div className="stack">
      {/* El estado de guardado es de la PANTALLA, no de la estructura: vivía
          dentro de la línea de configuración, que ahora se pliega — y un aviso
          de «no se guardó» no puede quedarse doblado dentro de nada. */}
      <PageHead
        title="Rutina"
        sub={`Los microciclos de ${activeClient.name}: qué días entrena, qué ejercicios y cuántas series.`}
        action={indicator}
      />

      {bloqueDelPrograma}

      <MicrocycleBar
        cycleType={cycleType}
        weeks={nav.weeks}
        activeWeek={nav.week}
        microcycleDate={nav.microcycle?.date}
        onChangeDate={(date) => setMicrocycleDate(activeClient.id, nav.week, date)}
        canGoPrev={nav.canGoPrev}
        canGoNext={nav.canGoNext}
        onPrev={nav.goPrevWeek}
        onNext={nav.goNextWeek}
        onSelect={nav.selectWeek}
        copyOpen={copyOpen}
        onToggleCopy={hayDeQuienTraer ? () => setCopyOpen((v) => !v) : null}
        onPasteRoutine={() => setPegarAbierto(true)}
        /*
         * Estas dos acciones devuelven el número de la semana creada, así que la
         * navegación es inmediata. Antes se usaba `setTimeout(..., 50)` para
         * "esperar" a que React actualizase el estado, y encima el botón
         * "Nueva" llamaba a la función que BORRABA el programa entero.
         */
        onAppend={() => nav.selectWeek(appendMicrocycle(activeClient.id))}
        onClone={() => {
          const created = cloneMicrocycle(activeClient.id, nav.week);
          if (created) nav.selectWeek(created);
        }}
        onRemove={() => {
          /* El aviso con su «Deshacer»: la semana entera —días, ejercicios y
             sesiones registradas— se captura antes de borrar, y el inverso la
             devuelve a su posición renumerando como estaba. Más tiempo en
             pantalla que el aviso normal: es la pérdida más grande que se puede
             deshacer. */
          const cycle = nav.microcycle;
          nav.selectWeek(removeMicrocycle(activeClient.id, nav.week));
          if (!cycle) return;
          toast({
            text: `${unitLabel(cycleType)} ${cycle.weekNumber} eliminada.`,
            duration: 10000,
            action: {
              label: 'Deshacer',
              onClick: () => {
                restoreMicrocycle(activeClient.id, cycle);
                nav.selectWeek(cycle.weekNumber);
              },
            },
          });
        }}
      />

      {panelDeCopia}
      {dialogoDePegado}

      {/*
        ══ El carril de días se arrastra ══════════════════════════════════════

        El orden de estos chips ES el orden de la semana, así que cambiarlo aquí
        —donde se ve— es más directo que cualquier control en otro sitio.

        ── Por qué el chip entero y no un asa ──────────────────────────────────
        En la lista de ejercicios se arrastra solo desde el asa, porque la fila
        lleva casillas dentro y el gesto competía con escribir. Un chip no tiene
        nada dentro con lo que competir: arrastrar exige movimiento (o mantener
        pulsado, en táctil) y el clic sigue seleccionando el día como siempre. El
        asa que lleva dentro NO es la zona de agarre, es el cartel que dice que
        esto se coge: en una pastilla de 28 px, un asa que hubiera que acertar
        sería más difícil de dar que la pastilla entera.

        ── Y por qué ya no están las flechas de la cabecera ────────────────────
        Porque el gesto ya funciona con el dedo (ver `useArrastreOrden`). Eran la
        única forma de reordenar sin ratón, no una comodidad, y cuando dejaron de
        serlo se convirtieron en dos botones que hacían lo que ya hace el sitio
        donde se ve el orden. Para teclado siguen Alt + ←/→, aquí mismo.
      */}
      {/* `day-rail` no es decorativa: de ella cuelgan el asa, el día levantado,
          el canto del destino y el hueco que se abre al pasar por encima. */}
      <div
        className="row wrap gap-2 day-rail"
        role="group"
        aria-label="Días del microciclo"
        ref={ordenDias.carrilRef}
      >
        {nav.days.map((day, index) => (
          <button
            key={day.dayName}
            type="button"
            className={[
              'chip',
              ordenDias.destino === index && ordenDias.arrastrando !== index ? 'is-drop-target' : '',
              ordenDias.arrastrando === index ? 'is-dragging' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            {...ordenDias.props(index)}
            /* Alt + flechas, como en la lista de ejercicios. El foco se queda en
               el día movido —React reordena el nodo, no lo vuelve a crear, porque
               la `key` es su nombre— así que se puede repetir para llevarlo varios
               puestos sin volver a buscarlo. */
            onKeyDown={(e) => {
              if (!e.altKey) return;
              if (e.key === 'ArrowLeft' && index > 0) {
                e.preventDefault();
                moverDia(index, index - 1);
              } else if (e.key === 'ArrowRight' && index < nav.days.length - 1) {
                e.preventDefault();
                moverDia(index, index + 1);
              }
            }}
            aria-pressed={index === nav.dayIndex}
            aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight"
            onClick={() => nav.selectDay(index)}
            title="Arrástralo para cambiarlo de sitio (o Alt + ←/→)"
          >
            <GripVertical size={12} className="chip-grip" aria-hidden="true" />
            {day.dayName}
            {/* Cuántos ejercicios lleva puestos: elegir entre «Empuje / Tirón /
                Pierna» no debería obligar a abrirlos uno a uno para ver cuál
                está a medias. Subordinado al nombre, como el contador de la
                cartera. */}
            {(day.exercises?.length || 0) > 0 && (
              <span className="chip-count">{day.exercises.length}</span>
            )}
          </button>
        ))}
        <button type="button" className="chip chip-dashed" onClick={() => setAddingDay((v) => !v)}>
          <Plus size={14} /> Día
        </button>
      </div>

      {addingDay && (
        <Panel tight as="form" className="row wrap gap-3" onSubmit={handleAddDay}>
          <input
            autoFocus
            className="input grow"
            value={newDayName}
            onChange={(e) => setNewDayName(e.target.value)}
            placeholder="Ej: Día 3 (Pierna)"
            aria-label="Nombre del nuevo día"
          />
          <button type="submit" className="btn btn-primary" disabled={!newDayName.trim()}>
            Añadir día
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setAddingDay(false)}>
            Cancelar
          </button>
        </Panel>
      )}

      {nav.day ? (
        <Panel className="col gap-5">
          <DayHeader
            day={nav.day}
            weeklySplit={cycleType === 'weekly' ? program.weeklySplit : null}
            volume={planned}
            doneSets={doneSets}
            canRemove
            onRename={(name) => renameDay(activeClient.id, nav.week, nav.day.dayName, name)}
            onDuplicate={() => duplicateDay(activeClient.id, nav.week, nav.day.dayName)}
            onImportDay={() => setImportAbierto(true)}
            onRemove={() => {
              const day = nav.day;
              const index = nav.dayIndex;
              const { week } = nav;

              /*
                ══ El último día se lleva su semana ═════════════════════════════

                Borrar el único día estaba prohibido —«un microciclo debe tener al
                menos un día»— y con eso no había forma de deshacer una rutina
                recién traída: la salida real era eliminar la SEMANA, que vive en
                el menú ⋯ y por tanto no la encuentra nadie. Quien acababa de
                importar mal se quedaba con un programa que no quería y sin manera
                de volver al punto de partida.

                Así que el último día no se bloquea: se borra, y con él la semana
                que se queda sin nada dentro. Si era la única, el cliente vuelve a
                no tener programa, que es exactamente lo que se pedía. El
                «Deshacer» devuelve la semana entera, con sus sesiones.
              */
              if (nav.days.length === 1) {
                const cycle = nav.microcycle;
                const destino = removeMicrocycle(activeClient.id, week);
                if (destino) nav.selectWeek(destino);
                if (!cycle) return;
                toast({
                  text: `«${day.dayName}» era el único día, así que se ha eliminado ${unitLabel(cycleType).toLowerCase()} ${cycle.weekNumber}.`,
                  duration: 10000,
                  action: {
                    label: 'Deshacer',
                    onClick: () => {
                      restoreMicrocycle(activeClient.id, cycle);
                      nav.selectWeek(cycle.weekNumber);
                    },
                  },
                });
                return;
              }

              /* El aviso con su «Deshacer»: el día entero, en su posición. Las
                 sesiones registradas viven en el microciclo, no en el día, así
                 que borrar y deshacer no las toca. */
              removeDay(activeClient.id, week, day.dayName);
              toast({
                text: `«${day.dayName}» eliminado.`,
                action: {
                  label: 'Deshacer',
                  onClick: () => restoreDay(activeClient.id, week, day, index),
                },
              });
            }}
          />

          <SessionBar
            sessions={daySession.sessions}
            activeId={daySession.activeId}
            day={nav.day}
            onSelect={daySession.select}
            onCreate={(date) => {
              const id = startSession(activeClient.id, nav.week, nav.day.dayName, date);
              if (id) daySession.select(id);
            }}
            onChangeDate={(id, date) => updateSession(activeClient.id, nav.week, id, { date })}
            onRemove={(id) => removeSession(activeClient.id, nav.week, id)}
          />

          {/*
            ── Lo que el protocolo enciende, en el orden en que ocurre ────────
            Primero lo que el entrenador DICE (su nota), luego lo que el cliente
            hace, y al final lo que el cliente CUENTA. Las tres piezas aparecen
            solo si el módulo correspondiente está encendido en Ajustes →
            Protocolo: un entrenador que no quiera nada de esto no ve un solo
            control de más.
          */}
          {/*
            ── Sin condición de sesión, y ese era el fallo ─────────────────────
            Esto estaba colgado de la SESIÓN y sujeto a `daySession.activeId`,
            que es null hasta que alguien anota la primera serie. Consecuencia: la
            indicación solo se podía escribir DESPUÉS de que el cliente entrenara
            — justo al revés de para lo que sirve.

            Vive en el día del plan, así que se escribe al programar la semana,
            que es cuando el entrenador la está pensando.
          */}
          {/* En el teléfono, un campo vacío no gasta cuatro líneas: se pide,
              como la nota de un ejercicio. Con texto se enseña siempre —no se
              esconde lo que ya has dicho— y en escritorio no cambia nada. */}
          {isModuleOn(protocol, 'coachNote') &&
            (!esTelefono || nav.day.coachNote?.trim() || notaDiaAbierta === nav.day.dayName ? (
              <label className="feedback-q">
                <span className="k">
                  <Quote size={12} /> Tu indicación para este día
                </span>
                <textarea
                  className="textarea"
                  rows={2}
                  autoFocus={notaDiaAbierta === nav.day.dayName && !nav.day.coachNote?.trim()}
                  placeholder="La verá tu cliente al abrir el día, antes de empezar."
                  value={nav.day.coachNote ?? ''}
                  onChange={(e) => setDayNote(activeClient.id, nav.week, nav.day.dayName, e.target.value)}
                />
              </label>
            ) : (
              <button
                type="button"
                className="note-add self-start"
                onClick={() => setNotaDiaAbierta(nav.day.dayName)}
              >
                + tu indicación para este día
              </button>
            ))}

          {/*
            ══ El calentamiento de ESTE día ═══════════════════════════════════

            Por defecto hereda el del programa, que es lo que se monta una vez y
            vale para todos los días. Pero el día de pierna no se calienta como
            el de empuje, así que se le puede dar el suyo — y entonces manda.

            «No se calienta» también es una decisión: una lista vacía se respeta
            en lugar de caer al del programa (`domain/training.js`).
          */}
          {isModuleOn(protocol, 'warmup') && (
            <div className="col gap-2">
              <div className="row between wrap gap-2">
                <span className="section-label">
                  <Waves size={12} /> Calentamiento de {nav.day.dayName}
                </span>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() =>
                    setDayDrills(
                      activeClient.id,
                      nav.week,
                      nav.day.dayName,
                      dayHasOwnDrills(nav.day) ? null : deepCopyDrills(drills)
                    )
                  }
                >
                  {dayHasOwnDrills(nav.day) ? 'Usar el del programa' : 'Hacerlo propio de este día'}
                </button>
              </div>

              {dayHasOwnDrills(nav.day) ? (
                <WarmupEditor
                  drills={nav.day.mobilityDrills}
                  onChange={(nuevos) =>
                    setDayDrills(activeClient.id, nav.week, nav.day.dayName, nuevos)
                  }
                />
              ) : (
                <p className="t-xs t-tertiary">
                  Usa el del programa
                  {drills.length > 0
                    ? ` (${drills.length} ${drills.length === 1 ? 'ejercicio' : 'ejercicios'}).`
                    : ', que todavía está vacío.'}{' '}
                  Hazlo propio si este día necesita otra cosa.
                </p>
              )}
            </div>
          )}

          {/*
            El objetivo de repeticiones va al PLAN; los kg, reps y RIR a la
            SESIÓN con su fecha. Antes todo se escribía en el plan, así que no
            quedaba constancia de cuándo se entrenó y cambiar el plan borraba el
            registro.
          */}
          <ExerciseList
            exercises={daySession.exercises}
            showRir={isModuleOn(protocol, 'rir')}
            /* El mismo interruptor que la indicación del día, arriba: son la
               misma cosa a distinta altura. */
            showNotes={isModuleOn(protocol, 'coachNote')}
            onNoteChange={(exId, note) =>
              setExerciseNote(activeClient.id, nav.week, nav.day.dayName, exId, note)
            }
            onMove={(from, to) => moveExercise(activeClient.id, nav.week, nav.day.dayName, from, to)}
            onRemove={(exId) => {
              /* El aviso con su «Deshacer»: se captura el ejercicio y su sitio
                 ANTES de borrarlo, y el inverso lo devuelve tal cual — con el
                 mismo id, así que sus series registradas vuelven a casar. */
              const index = nav.day.exercises.findIndex((ex) => ex.id === exId);
              const exercise = nav.day.exercises[index];
              removeExercise(activeClient.id, nav.week, nav.day.dayName, exId);
              if (!exercise) return;
              const { week } = nav;
              const { dayName } = nav.day;
              toast({
                text: `«${exercise.name}» eliminado.`,
                action: {
                  label: 'Deshacer',
                  onClick: () => restoreExercise(activeClient.id, week, dayName, exercise, index),
                },
              });
            }}
            onSetChange={(exId, setIdx, field, value) => {
              /* Los dos objetivos son PLAN y van a `updateExerciseSet`; los kg,
                 reps y RIR reales son EJECUCIÓN y van a la sesión. Mandar el
                 RIR objetivo por el camino de la ejecución lo guardaría como
                 algo que la persona hizo, y se borraría al vaciar la semana. */
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
            onTargetChange={(exId, value) =>
              updateExerciseTarget(activeClient.id, nav.week, nav.day.dayName, exId, value)
            }
            onAddSet={(exId) => addExerciseSetSlot(activeClient.id, nav.week, nav.day.dayName, exId)}
            onRemoveSet={(exId, setIdx) =>
              removeExerciseSetSlot(activeClient.id, nav.week, nav.day.dayName, exId, setIdx)
            }
          />

          {/*
            Lo que ha contestado el cliente, en modo lectura y con el mismo
            componente con el que lo contestó: si la respuesta se leyera con otra
            forma, las dos versiones acabarían divergiendo.
          */}
          <SessionFeedback
            readOnly
            title="Lo que te ha contado"
            questions={activeQuestions(protocol)}
            answers={daySession.session?.feedback}
          />

          {isModuleOn(protocol, 'clientNote') && daySession.session?.clientNote?.trim() && (
            <div className="coach-note is-client">
              <span className="section-label">
                <NotebookPen size={12} /> Su cuaderno
              </span>
              <p>{daySession.session.clientNote}</p>
            </div>
          )}

          <hr className="divider" />

          {/*
            Tu biblioteca primero y el catálogo común detrás, sin repetidos. Al
            elegir uno del catálogo, `onRememberExercise` lo copia a la tuya —el
            mismo camino que ya seguía un ejercicio escrito a mano—.
          */}
          {/*
            La otra puerta al copiar, VISIBLE cuando más falta hace: un día
            recién creado y vacío es exactamente el momento de «tráeme el Legs
            de Marta como base». Con ejercicios ya puestos, la puerta vive solo
            en el menú del día — aquí sería ruido.
          */}
          {(nav.day.exercises || []).length === 0 && (
            <button
              type="button"
              className="btn btn-secondary self-start"
              onClick={() => setImportAbierto(true)}
            >
              <Users size={15} /> Traer un día de otro cliente
            </button>
          )}

          {importAbierto && (
            <ImportDayDialog
              clients={clients}
              activeClient={activeClient}
              targetDayName={nav.day.dayName}
              onImport={(exercises) =>
                exercises.forEach((exercise) =>
                  addExercise(activeClient.id, nav.week, nav.day.dayName, exercise)
                )
              }
              onClose={() => setImportAbierto(false)}
            />
          )}

          {esTelefono ? (
            <>
              {/*
                «+ ejercicio» vivía aquí, al FINAL de un día de varias
                pantallas. En el teléfono es el botón flotante sobre la barra
                del pulgar, y el alta se rellena en una hoja — con el
                formulario abierto de entrada, que a eso se vino.
              */}
              <button
                type="button"
                className="fab"
                onClick={() => setAltaAbierta(true)}
                aria-label={`Añadir un ejercicio a ${nav.day.dayName}`}
                title="Añadir ejercicio"
              >
                <Plus size={22} />
              </button>

              <Modal
                open={altaAbierta}
                title={`Ejercicio para ${nav.day.dayName}`}
                onClose={() => setAltaAbierta(false)}
              >
                <AddExerciseForm
                  enHoja
                  library={ejerciciosDisponibles}
                  onAdd={(exercise) => addExercise(activeClient.id, nav.week, nav.day.dayName, exercise)}
                  onRememberExercise={upsertLibraryExercise}
                  onClose={() => setAltaAbierta(false)}
                />
              </Modal>
            </>
          ) : (
            <AddExerciseForm
              library={ejerciciosDisponibles}
              onAdd={(exercise) => addExercise(activeClient.id, nav.week, nav.day.dayName, exercise)}
              onRememberExercise={upsertLibraryExercise}
            />
          )}
        </Panel>
      ) : (
        <EmptyState
          icon={Dumbbell}
          title={`${unitLabel(cycleType)} ${nav.week} sin días`}
          message="Añade un día con el botón «+ Día» para empezar a programar ejercicios."
        />
      )}

    </div>
  );
};
