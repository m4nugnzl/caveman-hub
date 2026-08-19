import { useEffect, useMemo, useState } from 'react';

/* Al hacer propio el calentamiento de un día se parte de una COPIA del programa,
   no de cero: lo normal es querer lo mismo con un ejercicio cambiado. Con ids
   nuevos, para que editarlo aquí no toque el del programa. */
const deepCopyDrills = (drills) =>
  (drills || []).map((d) => ({ ...d, id: `${d.id}-dia-${Math.random().toString(36).slice(2, 8)}` }));
import { ChevronDown, ChevronRight, Dumbbell, NotebookPen, Plus, Quote, Waves } from 'lucide-react';

import { useApp } from '@/context/AppContext';
import {
  dayHasOwnDrills,
  dayMuscleVolume,
  dayPlannedVolume,
  indexAfterMove,
  unitLabel,
} from '@/domain/training';
import { sessionMuscleVolume } from '@/domain/sessions';
import { isEmptyDiet } from '@/domain/nutrition';
import { mergeCatalog } from '@/domain/catalog';
import { activeQuestions, clientProtocol, isModuleOn, isServiceOn } from '@/domain/protocol';
import { EmptyState, PageHead, Panel, SaveIndicator } from '@/components/ui/primitives';
import { SessionFeedback } from './SessionFeedback';
import { WarmupEditor } from './WarmupBlock';
import { useProgramNavigation } from './useProgramNavigation';
import { useDaySession } from './useDaySession';
import { SessionBar } from './SessionBar';
import { CycleSettings } from './CycleSettings';
import { WeeklySplitEditor } from './WeeklySplitEditor';
import { MicrocycleBar } from './MicrocycleBar';
import { CopyToClientPanel } from './CopyToClientPanel';
import { DayHeader } from './DayHeader';
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
    updateClientPreferences,
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
    addDay,
    renameDay,
    duplicateDay,
    moveDay,
    removeDay,
    addExercise,
    removeExercise,
    moveExercise,
    updateExerciseSet,
    updateExerciseTarget,
    addExerciseSetSlot,
    removeExerciseSetSlot,
    upsertLibraryExercise,
    nutrition,
    replicateClient,
    ensureProgram,
  } = useApp();

  const [cycleOpen, setCycleOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [newDayName, setNewDayName] = useState('');
  const [addingDay, setAddingDay] = useState(false);
  /* Quién se arrastra y sobre quién se está soltando, para poder pintar los dos
     de forma distinta. Mismo par de estados que en `ExerciseList`. */
  const [dragDay, setDragDay] = useState(null);
  const [overDay, setOverDay] = useState(null);

  const [warmupOpen, setWarmupOpen] = useState(false);

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
  const cycleType = activeClient.cycleType || 'weekly';
  /* Qué módulos existen para este cliente. Se configura en Ajustes → Protocolo y
     decide qué piezas de esta pantalla se pintan siquiera. */
  const protocol = clientProtocol(activeClient.preferences);

  const nav = useProgramNavigation(activeClient.id, microcycles);

  /**
   * Cambia un día de sitio y deja abierto EL MISMO que estabas editando.
   *
   * Las dos entradas —arrastrar un chip y las flechas de la cabecera— pasan por
   * aquí, porque el cuidado es el mismo y el error también: `selectDay` guarda un
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
  const save = saveStatus('workout', activeClient.id);

  const daySession = useDaySession(nav.microcycle, nav.day);

  // Ver `domain/catalog.js`: lo tuyo gana cuando el nombre se repite.
  const ejerciciosDisponibles = useMemo(
    () => mergeCatalog(exerciseLibrary, catalogExercises),
    [exerciseLibrary, catalogExercises]
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

  if (microcycles.length === 0) {
    return (
      <EmptyState
        icon={Dumbbell}
        title="Este cliente no tiene programa todavía"
        message="Crea el primer microciclo para empezar a programar días y ejercicios."
        action={
          <button
            type="button"
            className="btn btn-primary btn-lg"
            onClick={() => nav.selectWeek(startProgram(activeClient.id))}
          >
            <Plus size={17} /> Crear primer microciclo
          </button>
        }
      />
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

  return (
    <div className="stack">
      <PageHead
        title="Rutina"
        sub={`Los microciclos de ${activeClient.name}: qué días entrena, qué ejercicios y cuántas series.`}
      />

      <CycleSettings
        client={activeClient}
        open={cycleOpen}
        onToggle={() => setCycleOpen((v) => !v)}
        onChange={(fields) => updateClient(activeClient.id, fields, { immediate: false })}
        saveIndicator={indicator}
        protocol={protocol}
        onProtocolChange={(next) => updateClientPreferences(activeClient.id, 'protocol', next)}
      />

      {cycleType === 'weekly' && (
        <WeeklySplitEditor
          split={program.weeklySplit}
          onChange={(day, value) => updateWeeklySplit(activeClient.id, day, value)}
        />
      )}

      <MicrocycleBar
        cycleType={cycleType}
        weeks={nav.weeks}
        activeWeek={nav.week}
        microcycleDate={nav.microcycle?.date}
        canGoPrev={nav.canGoPrev}
        canGoNext={nav.canGoNext}
        onPrev={nav.goPrevWeek}
        onNext={nav.goNextWeek}
        onSelect={nav.selectWeek}
        copyOpen={copyOpen}
        onToggleCopy={() => setCopyOpen((v) => !v)}
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
        onRemove={() => nav.selectWeek(removeMicrocycle(activeClient.id, nav.week))}
        exerciseCount={(nav.microcycle?.days || []).reduce(
          (acc, d) => acc + (d.exercises?.length || 0),
          0
        )}
      />

      {copyOpen && (
        <CopyToClientPanel
          clients={clients}
          activeClient={activeClient}
          cycleType={cycleType}
          weekCount={microcycles.length}
          hasProgram={microcycles.length > 0}
          hasDiet={
            /* Tener fila en `nutrition_plans` no es tener dieta: la fila nace al
               tocar cualquier cosa. Avisar de que «esto SUSTITUYE su dieta
               actual» por un plan en blanco es asustar por nada. */
            !isEmptyDiet(nutrition[activeClient.id])
          }
          conNutricion={isServiceOn(protocol, 'nutrition')}
          hasWarmup={(program?.mobilityDrills || []).length > 0}
          onReplicate={(sourceId, what) => replicateClient(sourceId, activeClient.id, what)}
          onClose={() => setCopyOpen(false)}
        />
      )}

      {/*
        El calentamiento es del PROGRAMA, no del día: es la rutina de movilidad de
        este cliente y se repite. Por eso vive aquí arriba y no dentro de cada día
        —que obligaría a mantener cinco copias— y por eso va plegado: se monta una
        vez y después se consulta poco.
      */}
      {isModuleOn(protocol, 'warmup') && (
        <Panel tight className="col gap-3">
          <button
            type="button"
            className="proto-toggle"
            aria-expanded={warmupOpen}
            onClick={() => setWarmupOpen((v) => !v)}
          >
            {warmupOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            <Waves size={15} />
            <span className="grow">Calentamiento y movilidad</span>
            <span className="badge">{(program?.mobilityDrills || []).length}</span>
          </button>

          {warmupOpen && (
            <WarmupEditor
              drills={program?.mobilityDrills || []}
              onChange={(drills) => updateMobilityDrills(activeClient.id, drills)}
            />
          )}
        </Panel>
      )}

      {/*
        ══ El carril de días se arrastra ══════════════════════════════════════

        El orden de estos chips ES el orden de la semana, así que cambiarlo aquí
        —donde se ve— es más directo que cualquier control en otro sitio.

        ── Por qué el chip entero y no un asa ──────────────────────────────────
        En la lista de ejercicios se arrastra solo desde el asa, porque la fila
        lleva casillas dentro y el gesto competía con escribir. Un chip no tiene
        nada dentro con lo que competir: arrastrar exige movimiento y el clic
        sigue seleccionando el día como siempre. Y un asa dentro de una pastilla
        de 5 px de alto sería más difícil de acertar que la pastilla entera.

        ── Y por qué siguen estando las flechas de la cabecera ─────────────────
        Porque esto es `draggable` de HTML5 y en una pantalla táctil no existe.
        Sin ellas, reordenar la semana desde el móvil sería imposible. Es el mismo
        reparto que en los ejercicios: arrastre para quien pueda, teclado (Alt y
        flechas, aquí mismo) y botones para todos los demás.
      */}
      <div className="row wrap gap-2" role="tablist" aria-label="Días del microciclo">
        {nav.days.map((day, index) => (
          <button
            key={day.dayName}
            type="button"
            role="tab"
            className={[
              'chip',
              overDay === index && dragDay !== index ? 'is-drop-target' : '',
              dragDay === index ? 'is-dragging' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            draggable
            onDragStart={(e) => {
              setDragDay(index);
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDragEnd={() => {
              setDragDay(null);
              setOverDay(null);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setOverDay(index);
            }}
            onDragLeave={() => setOverDay((i) => (i === index ? null : i))}
            onDrop={(e) => {
              e.preventDefault();
              if (dragDay !== null && dragDay !== index) moverDia(dragDay, index);
              setDragDay(null);
              setOverDay(null);
            }}
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
            aria-selected={index === nav.dayIndex}
            onClick={() => nav.selectDay(index)}
            title="Arrástralo para cambiarlo de sitio (o Alt + ←/→)"
          >
            {day.dayName}
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
            canRemove={nav.days.length > 1}
            onRename={(name) => renameDay(activeClient.id, nav.week, nav.day.dayName, name)}
            onDuplicate={() => duplicateDay(activeClient.id, nav.week, nav.day.dayName)}
            onRemove={() => removeDay(activeClient.id, nav.week, nav.day.dayName)}
            firstDay={nav.dayIndex === 0}
            lastDay={nav.dayIndex === nav.days.length - 1}
            /* La otra puerta a lo mismo: el carril de arriba se arrastra, y estas
               dos flechas son lo que queda cuando no hay ratón. Ver `moverDia`. */
            onMove={(delta) => moverDia(nav.dayIndex, nav.dayIndex + delta)}
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
          {isModuleOn(protocol, 'coachNote') && (
            <label className="feedback-q">
              <span className="k">
                <Quote size={12} /> Tu indicación para este día
              </span>
              <textarea
                className="textarea"
                rows={2}
                placeholder="La verá tu cliente al abrir el día, antes de empezar."
                value={nav.day.coachNote ?? ''}
                onChange={(e) => setDayNote(activeClient.id, nav.week, nav.day.dayName, e.target.value)}
              />
            </label>
          )}

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
                      dayHasOwnDrills(nav.day) ? null : deepCopyDrills(program?.mobilityDrills)
                    )
                  }
                >
                  {dayHasOwnDrills(nav.day) ? 'Usar el del programa' : 'Hacerlo propio de este día'}
                </button>
              </div>

              {dayHasOwnDrills(nav.day) ? (
                <WarmupEditor
                  drills={nav.day.mobilityDrills}
                  onChange={(drills) =>
                    setDayDrills(activeClient.id, nav.week, nav.day.dayName, drills)
                  }
                />
              ) : (
                <p className="t-xs t-tertiary">
                  Usa el del programa
                  {(program?.mobilityDrills || []).length > 0
                    ? ` (${program.mobilityDrills.length} ${
                        program.mobilityDrills.length === 1 ? 'ejercicio' : 'ejercicios'
                      }).`
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
            onMove={(from, to) => moveExercise(activeClient.id, nav.week, nav.day.dayName, from, to)}
            onRemove={(exId) => removeExercise(activeClient.id, nav.week, nav.day.dayName, exId)}
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
          <AddExerciseForm
            library={ejerciciosDisponibles}
            onAdd={(exercise) => addExercise(activeClient.id, nav.week, nav.day.dayName, exercise)}
            onRememberExercise={upsertLibraryExercise}
          />
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
