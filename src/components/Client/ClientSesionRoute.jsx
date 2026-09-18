import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Dumbbell } from 'lucide-react';

import { useApp } from '@/context/AppContext';
import { useSesionEnCurso } from '@/context/SesionEnCurso';
import { blockOfWeek, resolvedMicrocycles, structureOfBlock, weekLabel } from '@/domain/blocks';
import {
  activeQuestions,
  asksFeedback,
  clientProtocol,
  isModuleOn,
} from '@/domain/protocol';
import {
  allSessions,
  bestSetsBefore,
  historialDeEjercicio,
  isSetLogged,
  previousSetKey,
  previousSetsBefore,
  sesionAMedias,
  sessionSetCount,
  sessionTonnage,
} from '@/domain/sessions';
import { drillsForDay, restLabel, unitInitial, unitLabel } from '@/domain/training';
import { todayISO, weekdayName } from '@/lib/dates';
import { useMediaQuery } from '@/lib/useMediaQuery';
import { useDaySession } from '@/components/Coach/Workout/useDaySession';
import { EmptyState } from '@/components/ui/primitives';
import { CierreDeLaSesion } from './CierreDeLaSesion';
import { pautaDe, sesionDeHoy } from './hoy';
import { porEjercicio, recordsDeLaSesion } from './sesion';
import { useFichaDe } from './useFichaDe';
import { FichaDelEjercicio } from './movil/FichaDelEjercicio';
import { PantallaSesion as SesionEnMonitor } from './pc/PantallaSesion';
import { PantallaSesion as SesionEnTelefono } from './movil/PantallaSesion';

/**
 * `/mi/rutina/sesion` — LA PANTALLA DE HACER, y su cierre.
 *
 * ══ Por qué es una ruta y no un modo ═══════════════════════════════════════
 *
 * Porque ver y hacer son dos trabajos (corrección del dueño, 14 sep), y siendo
 * ruta se entra desde la portada, desde «Entreno» o desde una sesión a medias
 * sin que ninguno tenga que saber cómo se abre, y el botón de atrás del
 * navegador sale sin cerrar la aplicación.
 *
 * ══ Lo que hace esta pieza: la lectura, una vez ════════════════════════════
 *
 * Las dos pantallas —el modo entreno del teléfono y el puesto del monitor,
 * `docs/la-sesion-manda.md`— reciben las cuentas hechas y no le preguntan nada
 * al dominio. Aquí se decide qué sesión se abre, qué es la vez anterior de cada
 * serie, qué es récord, cuándo empieza un descanso y qué pregunta el cierre.
 *
 * ══ Y qué escribe ══════════════════════════════════════════════════════════
 *
 * Nada nuevo: `logSessionSet` (que crea la sesión con la primera serie),
 * `logExerciseNote`, `updateSessionMeta` para las respuestas y la nota del
 * cierre —la vía del cliente, `log_session_feedback`— y `closeSession`. El
 * rediseño no toca la base.
 */
/** La última sesión con alguna respuesta de las preguntas de su protocolo. */
const ultimaConSensaciones = (micros, preguntas) => {
  const sesiones = allSessions(micros);
  for (let i = sesiones.length - 1; i >= 0; i -= 1) {
    const feedback = sesiones[i].feedback || {};
    if (preguntas.some((q) => String(feedback[q.id] ?? '').trim() !== '')) return sesiones[i];
  }
  return null;
};

export const ClientSesionRoute = () => {
  const {
    activeClient,
    workoutData,
    logSessionSet,
    logExerciseNote,
    updateSessionMeta,
    closeSession,
    saveStatus,
    retrySave,
  } = useApp();
  const navigate = useNavigate();
  const {
    destino,
    tomarDestino,
    marcar,
    cerrar,
    /*
      EL DESCANSO NO ES ESTADO DE ESTA PANTALLA, y por eso se pide al contexto:
      sigue corriendo si se sale a la dieta y se vuelve. Ver `context/SesionEnCurso`.
    */
    descanso,
    empezarDescanso,
    sumarDescanso,
    pararDescanso,
  } = useSesionEnCurso();
  const fichaDe = useFichaDe();
  const enMonitor = useMediaQuery('(min-width: 1024px)');
  const [ficha, setFicha] = useState(null);
  /* ¿Se está mirando el cierre? Llegar a él no cierra nada: ver `CierreDeLaSesion`. */
  const [enCierre, setEnCierre] = useState(false);
  /* A qué sesión se ha entrado. Se fija al llegar y no se recalcula con cada
     tecla: recalcularla dejaría a quien escribe la primera serie del jueves
     saltando al día de hoy a mitad de número. */
  const [donde, setDonde] = useState(null);
  /*
    EN QUÉ EJERCICIO ESTÁS. Estado y no cálculo: derivarlo de «el primero con
    series sin hacer» haría saltar la pantalla al siguiente en el mismo gesto que
    apunta la última serie. Se siembra una vez, abajo; después solo lo mueve
    quien entrena —el carril, el dedo o «Siguiente»—.
  */
  const [activo, setActivo] = useState(null);

  const crudo = workoutData?.[activeClient?.id];
  const program = useMemo(
    () => (crudo ? { ...crudo, microcycles: resolvedMicrocycles(crudo) } : crudo),
    [crudo]
  );
  const micros = useMemo(() => program?.microcycles || [], [program]);
  const hoy = useMemo(() => sesionDeHoy({ client: activeClient, program: crudo }), [activeClient, crudo]);

  /* El destino se toma UNA vez: si se quedara puesto, volver aquí desde
     cualquier sitio reabriría la sesión de la última vez. */
  useEffect(() => {
    if (donde) return;
    if (destino) {
      setDonde(destino);
      tomarDestino();
      return;
    }
    const semanas = micros.map((m) => m.weekNumber).sort((a, b) => a - b);
    const ultima = semanas[semanas.length - 1] ?? null;
    if (hoy && !hoy.descanso && ultima !== null) {
      setDonde({ weekNumber: ultima, dayName: hoy.name });
      return;
    }
    /* Y si hoy no toca, la que dejaste a medias: entrar aquí un día de descanso
       casi siempre es ir a terminarla. Sin ninguna no se inventa una sesión. */
    const media = sesionAMedias(micros);
    if (media) setDonde({ weekNumber: media.weekNumber, dayName: media.dayName });
  }, [donde, destino, tomarDestino, hoy, micros]);

  const micro = micros.find((m) => m.weekNumber === donde?.weekNumber) || null;
  const day = micro?.days?.find((d) => d.dayName === donde?.dayName) || null;
  const daySession = useDaySession(micro, day);
  const antes = useMemo(() => previousSetsBefore(micros, donde?.weekNumber), [micros, donde?.weekNumber]);
  /* El listón de cada ejercicio ANTES de esta semana: contra eso se decide qué
     es récord. Con el de esta misma sesión dentro, nada lo sería nunca. */
  const mejores = useMemo(() => bestSetsBefore(micros, donde?.weekNumber), [micros, donde?.weekNumber]);

  useEffect(() => {
    if (activo !== null || daySession.exercises.length === 0) return;
    const queda = daySession.exercises.findIndex((ex) => (ex.sets || []).some((s) => !isSetLogged(s)));
    setActivo(queda >= 0 ? queda : 0);
  }, [activo, daySession.exercises]);

  const hechas = daySession.session ? sessionSetCount(daySession.session) : 0;
  const series = daySession.exercises.reduce((n, ex) => n + (ex.sets?.length || 0), 0);
  const tramos = daySession.exercises.map((ex) => {
    const total = (ex.sets || []).length;
    const puestas = (ex.sets || []).filter(isSetLogged).length;
    return total > 0 ? puestas / total : 0;
  });

  /*
    La sesión se anuncia al aparato: es lo que retira la barra del pulgar, tiñe
    el cromo del navegador y mantiene la pantalla despierta. `marcar` compara
    antes de escribir, así que este efecto puede correr en cada render.
  */
  const firmaDeTramos = tramos.join(',');
  useEffect(() => {
    if (!daySession.activeId || !donde) return;
    marcar({
      clientId: activeClient?.id,
      weekNumber: donde.weekNumber,
      sessionId: daySession.activeId,
      dayName: donde.dayName,
      hechas,
      series,
      tramos,
    });
    // `tramos` es un array nuevo en cada render; su firma es lo que cambia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daySession.activeId, donde, hechas, series, firmaDeTramos, activeClient?.id, marcar]);

  if (!activeClient) return null;

  if (!day || daySession.exercises.length === 0) {
    return (
      <div className="pc-hoja">
        <EmptyState
          icon={Dumbbell}
          title={day ? 'Esta sesión no tiene ejercicios' : 'Hoy no te toca entreno'}
          message="Abre tu rutina y elige la sesión que quieras hacer."
          action={
            <Link className="btn btn-primary" to="/mi/rutina">
              Ver mi rutina
            </Link>
          }
        />
      </div>
    );
  }

  const protocolo = clientProtocol(activeClient.preferences);
  /*
    ══ EL RIR LO DECIDE EL CONTENIDO, y no solo el interruptor ═══════════════

    Esto era `isModuleOn(protocolo, 'rir')` a secas, y ahí estaba la avería: la
    hoja del entrenador dejó de pedirle permiso al protocolo —«la columna está
    si algo de esta hoja la usa», ver `camposDeLaHoja`—, así que puede abrir la
    columna a mano y pautar el RIR con el módulo apagado. Del otro lado seguía
    el interruptor, de modo que lo pautado no se veía y tampoco había casilla
    para anotarlo: el entrenador escribía contra una pantalla ciega.

    Ahora es la misma regla en los dos sitios. El módulo sigue valiendo para
    quien programa así siempre: deja la casilla puesta aunque esta sesión no
    pida ningún RIR.
  */
  const showRir =
    isModuleOn(protocolo, 'rir') ||
    daySession.exercises.some((ex) =>
      (ex.sets || []).some((s) => String(s?.targetRir ?? '').trim() !== '')
    );

  /*
    Escribir una serie. La PRIMERA de un día crea la sesión y devuelve su id;
    quien escriba dos campos seguidos tiene que pasarle ese id al segundo o
    abrirá dos sesiones.
  */
  const escribir = (exId, setIndex, field, value, sessionId) => {
    const exercise = (day.exercises || []).find((ex) => ex.id === exId);
    if (!exercise) return null;
    const id = logSessionSet(
      activeClient.id,
      donde.weekNumber,
      /* Una sesión heredada no tiene id real: se manda `null` y se crea una. */
      sessionId !== undefined ? sessionId : daySession.session?.isLegacy ? null : daySession.activeId,
      daySession.session?.date || todayISO(),
      day.dayName,
      exercise,
      setIndex,
      field,
      value
    );
    if (id && id !== daySession.activeId) daySession.select(id);
    return id || sessionId || daySession.activeId || null;
  };

  /**
   * EL DESCANSO EMPIEZA AL CERRAR UNA SERIE, y solo si su entrenador lo pautó.
   *
   * Sin `restSeconds` esto llama a `empezarDescanso(0)`, que no hace nada: la
   * regla vive en el contexto y aquí no hay ningún `if`.
   *
   * ── Y al cerrar, no al teclear ────────────────────────────────────────────
   * Hasta esta versión arrancaba cuando las repeticiones pasaban a tener algo.
   * Con el −/+ eso ya no vale: el primer «+» en las reps de una serie vacía la
   * da por hecha, y la cuenta saltaría mientras todavía se está ajustando el
   * número. El gesto que termina una serie ahora existe —«Hecha»— y es el que
   * manda.
   */
  const descansarTras = (exId) => {
    const ex = daySession.exercises.find((e) => e.id === exId);
    empezarDescanso(Number(ex?.restSeconds) || 0);
  };

  /** Lo de la vez anterior en una serie, en una sola escritura de sesión. */
  const ponerLoDeAntes = (exId, setIndex, previo, { conRir }) => {
    const id = escribir(exId, setIndex, 'kg', String(previo.kg ?? ''));
    escribir(exId, setIndex, 'reps', String(previo.reps ?? ''), id);
    if (conRir && String(previo.rir ?? '') !== '') escribir(exId, setIndex, 'rir', String(previo.rir), id);
  };

  /**
   * «HECHA»: cierra una serie.
   *
   * Si ya tiene repeticiones, cerrar es solo la marca —y el descanso—. Si está
   * vacía, se rellena con lo que hay que hacer sin preguntar nada más: la vez
   * anterior en ESA serie, y si no la hay, la pauta cuando la pauta es un número
   * (un «8-10» no se puede escribir en una serie: `log_session_set` lo rechaza).
   * Sin ninguna de las dos no hay qué poner, y la serie no se cierra.
   *
   * @returns {boolean} si ha podido cerrarla.
   */
  const cerrarSerie = (exId, setIndex, { descansar = true } = {}) => {
    const ex = daySession.exercises.find((e) => e.id === exId);
    const set = ex?.sets?.[setIndex];
    if (!ex || !set) return false;

    if (!isSetLogged(set)) {
      const previo = antes.get(previousSetKey(ex.name, setIndex));
      const pautaReps = String(set.targetReps ?? '').trim();
      if (previo && isSetLogged(previo)) {
        ponerLoDeAntes(exId, setIndex, previo, { conRir: showRir });
      } else if (/^\d+$/.test(pautaReps)) {
        const id = Number(set.targetKg) > 0 ? escribir(exId, setIndex, 'kg', String(set.targetKg)) : undefined;
        escribir(exId, setIndex, 'reps', pautaReps, id);
      } else {
        return false;
      }
    }

    if (descansar) descansarTras(exId);
    return true;
  };

  /** «= Igual»: lo de la vez anterior. Termina la serie, así que descansa. */
  const igualQueAntes = (exId, setIndex, previo) => {
    const ex = daySession.exercises.find((e) => e.id === exId);
    const estaba = isSetLogged(ex?.sets?.[setIndex]);
    ponerLoDeAntes(exId, setIndex, previo, { conRir: showRir });
    if (!estaba) descansarTras(exId);
  };

  const terminar = () => {
    if (daySession.activeId) closeSession(activeClient.id, donde.weekNumber, daySession.activeId);
    cerrar();
    navigate('/mi/inicio');
  };

  const salir = () => {
    cerrar();
    navigate('/mi/rutina');
  };

  /* «Terminar» abre el cierre si hay algo que cerrar; sin una sola serie no hay
     sesión que resumir, y es salir. */
  const acabar = () => (hechas > 0 ? setEnCierre(true) : salir());

  /*
    ¿SE PUEDE ANOTAR YA? La nota y las respuestas cuelgan de la sesión, y la
    sesión nace con la primera serie. Una heredada tampoco vale: su id no existe
    en `sessions` y se escribiría en el aire.
  */
  const puedeAnotar = Boolean(daySession.activeId && !daySession.session?.isLegacy);

  const ejercicios = daySession.exercises.map((ex) => {
    /* El objetivo del ejercicio solo si todas sus series piden lo mismo: una
       pirámide 12/10/8 resumida en una cifra mentiría. Entonces lo dice cada
       serie al abrirse. */
    const pedidas = [...new Set((ex.sets || []).map((s) => String(s.targetReps ?? '').trim()).filter(Boolean))];
    return {
      id: ex.id,
      nombre: ex.name,
      musculo: ex.muscle || null,
      objetivo: pedidas.length === 1 ? pedidas[0] : null,
      descanso: restLabel(ex.restSeconds),
      ejercicio: ex,
      /* LA NOTA DE SU ENTRENADOR para este ejercicio («codos pegados»). Se
         perdió al rehacer la sesión: solo la pintaba `HojaDelCliente`, que ya
         no monta nadie. Con el mismo interruptor del protocolo que en su hoja. */
      indicacion: isModuleOn(protocolo, 'coachNote') ? String(ex.coachNote || '').trim() : '',
      nota: String(ex.clientNote || ''),
      onNota: puedeAnotar
        ? (texto) => logExerciseNote(activeClient.id, donde.weekNumber, daySession.activeId, ex.id, texto)
        : null,
      series: (ex.sets || []).map((set, i) => {
        const previo = antes.get(previousSetKey(ex.name, i)) || null;
        return {
          kg: String(set.kg ?? ''),
          reps: String(set.reps ?? ''),
          rir: String(set.rir ?? ''),
          hecha: isSetLogged(set),
          /* Lo que te piden en ESTA serie, y lo que hiciste la vez anterior en
             ella: dos referencias distintas, y ninguna tapa a la otra. */
          pideKg: Number(set.targetKg) > 0 ? String(set.targetKg) : null,
          pideReps: String(set.targetReps ?? '').trim() || null,
          /* El RIR pautado, que antes no salía de aquí. Ver `objetivoDeSerie`. */
          pideRir: String(set.targetRir ?? '').trim() || null,
          antesKg: previo?.kg ? String(previo.kg) : null,
          antesReps: previo?.reps ? String(previo.reps) : null,
          antesRir: previo && String(previo.rir ?? '') !== '' ? String(previo.rir) : null,
          onIgual: previo ? () => igualQueAntes(ex.id, i, previo) : null,
        };
      }),
    };
  });

  /*
    ══ LO QUE SE LEE ANTES DE EMPEZAR: la indicación del día y el calentamiento
    Los dos se perdieron al rehacer la sesión (la hoja vieja, `ClientRoutine`,
    los pintaba encima de los ejercicios) y ninguna pantalla nueva los recogió.
    Vuelven con las mismas reglas que tenían:

      · La indicación vive en el DÍA del plan; la de la sesión es el respaldo
        de la primera versión, cuando se escribía ahí.
      · El calentamiento es el del día si lo tiene propio y si no el de su
        BLOQUE (`structureOfBlock`: el abierto usa el del programa, uno cerrado
        su copia congelada). `[]` en el día es «hoy no se calienta».
      · Cada uno, con su interruptor del protocolo.
  */
  const bloqueDelDia = blockOfWeek(program, donde.weekNumber);
  const preambulo = {
    indicacion: isModuleOn(protocolo, 'coachNote')
      ? String(day.coachNote?.trim() || daySession.session?.coachNote?.trim() || '')
      : '',
    calentamiento: isModuleOn(protocolo, 'warmup')
      ? drillsForDay(bloqueDelDia ? structureOfBlock(program, bloqueDelDia) : program, day).filter((d) =>
          d.name?.trim()
        )
      : [],
  };

  const fecha = daySession.session?.date || todayISO();
  const cabecera = {
    nombre: day.dayName,
    fecha: `${weekdayName(fecha, { conFecha: true }).replace(',', '')} · ${ejercicios.length} ejercicios`,
    rotulo: Number.isFinite(donde.weekNumber) ? `${unitLabel(program?.cycleType)} ${donde.weekNumber}` : null,
    hechas,
    series,
    tonelaje: daySession.session ? sessionTonnage(daySession.session) : 0,
  };

  const estado = saveStatus('workout', activeClient.id);
  const guardado = hechas > 0 || estado.status === 'error' || estado.status === 'pending'
    ? { ...estado, onRetry: () => retrySave('workout', activeClient.id) }
    : null;

  const abrirFicha = (e) => setFicha({ ejercicio: e.ejercicio, nombre: e.nombre });

  /* ── El cierre ─────────────────────────────────────────────────────────── */
  if (enCierre && hechas > 0) {
    const inicio = Date.parse(daySession.session?.startedAt || '');
    const minutos = Number.isFinite(inicio) ? Math.round((Date.now() - inicio) / 60000) : null;
    const preguntas = puedeAnotar && asksFeedback(protocolo) ? activeQuestions(protocolo) : [];
    const cierre = {
      nombre: day.dayName,
      tonelaje: Math.round(cabecera.tonelaje),
      series: hechas,
      /* Más de seis horas no es un entreno largo: es una sesión que se quedó
         abierta. Esa duración no la ha medido nadie, así que no se dice. */
      minutos: minutos !== null && minutos > 0 && minutos <= 360 ? minutos : null,
      records: recordsDeLaSesion(daySession.exercises, mejores),
      ejercicios: porEjercicio(daySession.exercises),
      preguntas,
      respuestas: daySession.session?.feedback || {},
      onRespuesta: (id, valor) =>
        updateSessionMeta(activeClient.id, donde.weekNumber, daySession.activeId, { feedback: { [id]: valor } }),
      nota: daySession.session?.clientNote ?? '',
      onNota:
        puedeAnotar && isModuleOn(protocolo, 'clientNote')
          ? (texto) => updateSessionMeta(activeClient.id, donde.weekNumber, daySession.activeId, { clientNote: texto })
          : null,
      onTerminar: terminar,
      onVolver: () => setEnCierre(false),
    };
    return (
      <div className={enMonitor ? 'pc-hoja pc-hoja-cierre' : 'tel-tramo tel-tramo-cierre'}>
        <CierreDeLaSesion datos={cierre} />
      </div>
    );
  }

  const datos = {
    cabecera,
    preambulo: preambulo.indicacion || preambulo.calentamiento.length > 0 ? preambulo : null,
    ejercicios,
    showRir,
    activo: activo ?? 0,
    onIr: setActivo,
    descanso,
    onSumarDescanso: sumarDescanso,
    onSaltarDescanso: pararDescanso,
    /*
      En el teléfono escribir un campo no termina nada: termina «Hecha». En el
      monitor no hay «Hecha» —la tabla se rellena de corrido, con el tabulador—,
      así que ahí la serie se termina cuando sus repeticiones pasan a tener algo,
      y es entonces cuando empieza el descanso. Corregir una ya apuntada no
      empieza ninguno.
    */
    onCampo: (exId, i, campo, valor) => {
      const ex = daySession.exercises.find((e) => e.id === exId);
      const estaba = isSetLogged(ex?.sets?.[i]);
      escribir(exId, i, campo, valor);
      if (enMonitor && !estaba && campo === 'reps' && isSetLogged({ reps: valor })) descansarTras(exId);
    },
    onCerrarSerie: cerrarSerie,
    onFicha: abrirFicha,
    onSalir: salir,
    onAcabar: acabar,
    guardado,
    /*
      Solo el monitor: lo que leen las dos tarjetas del costado y sus ventanas,
      que son las de la hoja del entrenador (`ComparativaEjercicio`,
      `ComoLoLlevo`). Las sensaciones son las de la última sesión que las
      tiene: las de hoy se contestan al acabar.
    */
    lecturas: {
      microcycles: micros,
      weekNumber: donde.weekNumber,
      etiqueta: (w) => weekLabel(program, w, unitInitial(program?.cycleType)),
      preguntas: activeQuestions(protocolo),
      ultimaConSensaciones: ultimaConSensaciones(micros, activeQuestions(protocolo)),
    },
  };

  return (
    <>
      {enMonitor ? <SesionEnMonitor datos={datos} /> : <SesionEnTelefono datos={datos} />}

      {ficha && (
        <FichaDelEjercicio
          ejercicio={ficha.ejercicio}
          ficha={fichaDe(ficha.nombre)}
          historial={historialDeEjercicio(micros, ficha.nombre)}
          pauta={pautaDe(ficha.ejercicio)?.split(' × ')[1] || null}
          descanso={Number(ficha.ejercicio?.restSeconds) || null}
          onClose={() => setFicha(null)}
        />
      )}
    </>
  );
};

