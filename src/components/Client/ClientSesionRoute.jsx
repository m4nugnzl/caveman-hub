import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Dumbbell } from 'lucide-react';

import { useApp } from '@/context/AppContext';
import { useSesionEnCurso } from '@/context/SesionEnCurso';
import { blockOfWeek, microcicloDeLaSemana, resolvedMicrocycles, structureOfBlock, weekLabel, weeksOfBlock } from '@/domain/blocks';
import { conSeriesSinConfirmar } from '@/domain/seriesSinConfirmar';
import { esDelCliente } from '@/lib/seriesNoGuardadas';
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
  sesionAMedias,
  sessionSetCount,
  sessionTonnage,
  sessionsOf,
  ultimaVezDeEjercicio,
} from '@/domain/sessions';
import { useAjustesDeEjercicio } from '@/context/useAjustesDeEjercicio';
import { drillsForDay, restLabel, unitInitial, unitLabel } from '@/domain/training';
import { shortDate, weekdayName } from '@/lib/dates';
import { useMediaQuery } from '@/lib/useMediaQuery';
import { useDaySession } from '@/components/Coach/Workout/useDaySession';
import { useReviewRows } from '@/components/review/useReviewRows';
import {
  apuntadaDespues,
  diaPorDefecto,
  diasConOtraSesion,
  estadoDeLaSesion,
  limitesDeLaAparicion,
  limitesDeLaSesion,
  porQueNoSeEscribe,
  porQueNoSeMueve,
} from '@/domain/fechaDeLaSesion';
import { EmptyState } from '@/components/ui/primitives';
import { CierreDeLaSesion } from './CierreDeLaSesion';
import { aparicionesDelMicrociclo, pautaDe, sesionDeHoy } from './hoy';
import { porEjercicio, recordsDeLaSesion } from './sesion';
import { useFichaDe } from './useFichaDe';
import { FichaDelEjercicio } from './movil/FichaDelEjercicio';
import { PantallaSesion as SesionEnMonitor } from './pc/PantallaSesion';
import { PantallaSesion as SesionEnTelefono } from './movil/PantallaSesion';
import { RegistroDelEjercicio } from './movil/RegistroDelEjercicio';

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
    cambiarFechaDeSesion,
    isCoach,
    saveStatus,
    retrySave,
    seriesNoGuardadas,
  } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const {
    viva,
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
  /* Sus entregas: la semana que su entrenador ya revisó no deja cambiar el día
     de sus sesiones (`porQueNoSeMueve`, la frontera de las revisiones). */
  const { checkIns: entregas } = useReviewRows(activeClient?.id, { conEnlaces: false });
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
  /*
    EL DÍA DE UNA SESIÓN QUE AÚN NO EXISTE. Hasta el 23 sep la fecha solo se
    podía cambiar con la primera serie ya apuntada; quien pasa del papel lo
    que hizo el martes tiene que poder decirlo ANTES, y la primera serie la
    crea con ese día (`log_session_set` guarda el `p_date` que recibe). Sin
    tocarlo, hoy: quien la rellena el mismo día no elige nada.
  */
  const [diaElegido, setDiaElegido] = useState(null);

  /*
    Con las series que el servidor NO guardó puestas encima: tras recargar solo
    están en el navegador, y la pantalla no puede enseñar la serie vacía como si
    nunca se hubiera hecho. Ver `lib/seriesNoGuardadas`.
  */
  const delServidor = workoutData?.[activeClient?.id];
  const noGuardadasDelCliente = useMemo(
    () => (seriesNoGuardadas || []).filter((e) => activeClient && esDelCliente(e, activeClient.id)),
    [seriesNoGuardadas, activeClient]
  );
  const crudo = useMemo(
    () => conSeriesSinConfirmar(delServidor, noGuardadasDelCliente.map((e) => e.payload)),
    [delServidor, noGuardadasDelCliente]
  );
  const program = useMemo(
    () => (crudo ? { ...crudo, microcycles: resolvedMicrocycles(crudo) } : crudo),
    [crudo]
  );
  const micros = useMemo(() => program?.microcycles || [], [program]);
  const hoy = useMemo(() => sesionDeHoy({ client: activeClient, program: crudo }), [activeClient, crudo]);

  /*
    Las apariciones de un microciclo: una hoja que cae dos veces son dos
    sesiones, y se entra a UNA (ver `aparicionesDelMicrociclo`).
  */
  const aparicionesDe = (weekNumber) =>
    aparicionesDelMicrociclo(
      micros.find((m) => m.weekNumber === weekNumber),
      microcicloDeLaSemana(program, weekNumber, activeClient)
    );

  /* El destino se toma UNA vez: si se quedara puesto, volver aquí desde
     cualquier sitio reabriría la sesión de la última vez. */
  useEffect(() => {
    if (donde) return;
    if (destino) {
      setDonde(destino);
      if (destino.cierre) setEnCierre(true);
      tomarDestino();
      return;
    }
    const semanas = micros.map((m) => m.weekNumber).sort((a, b) => a - b);
    const ultima = semanas[semanas.length - 1] ?? null;
    if (hoy && !hoy.descanso && ultima !== null) {
      /* La de hoy, y si la hoja cae dos veces, la primera aparición que no
         está terminada: es la misma que la caja «Próxima sesión». Antes abría
         la más reciente, y el segundo Push de la semana se escribía encima
         del primero. */
      const suyas = aparicionesDe(ultima).filter((a) => a.dayName === hoy.name);
      const toca = suyas.find((a) => a.series === 0 || a.hechas < a.series) || suyas[suyas.length - 1];
      setDonde(
        toca
          ? { weekNumber: ultima, dayName: hoy.name, vez: toca.vez, sessionId: toca.sessionId }
          : { weekNumber: ultima, dayName: hoy.name }
      );
      return;
    }
    /* Y si hoy no toca, la que dejaste a medias: entrar aquí un día de descanso
       casi siempre es ir a terminarla. Sin ninguna no se inventa una sesión. */
    const media = sesionAMedias(micros);
    if (media) {
      const suya = aparicionesDe(media.weekNumber).find((a) => a.sessionId === media.session.id);
      setDonde({ weekNumber: media.weekNumber, dayName: media.dayName, vez: suya?.vez, sessionId: media.session.id });
    }
    // `aparicionesDe` sale de `micros` y `program`, que ya están aquí.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [donde, destino, tomarDestino, hoy, micros]);

  const micro = micros.find((m) => m.weekNumber === donde?.weekNumber) || null;
  const day = micro?.days?.find((d) => d.dayName === donde?.dayName) || null;
  /* Con aparición, esa sesión o una nueva; sin ella, la más reciente. */
  const daySession = useDaySession(micro, day, donde && 'sessionId' in donde ? donde.sessionId : undefined);
  const aparicion = donde && Number.isFinite(donde.vez)
    ? aparicionesDe(donde.weekNumber).find((a) => a.dayName === donde.dayName && a.vez === donde.vez) || null
    : null;
  /* El registro suelto de un ejercicio: la otra puerta, solo en el teléfono. */
  const suelto = !enMonitor && donde?.ejercicio ? donde.ejercicio : null;

  /*
    SU HOJA CAMBIÓ DE NOMBRE CON LA SESIÓN ABIERTA. `donde` se fija al entrar y
    no se recalcula (ver arriba), así que al volver a pedir el programa —y el
    entrenador había renombrado la hoja— el día dejaba de existir y la pantalla
    decía «Hoy no te toca entreno» a mitad de sesión. La sesión sí sigue: el
    renombrado se la lleva (`renameBlockSessionIn`). Se sigue a la sesión.
  */
  const sesionViva = viva?.sessionId || null;
  useEffect(() => {
    if (!donde || !micro || day || !sesionViva) return;
    const s = sessionsOf(micro).find((x) => x.id === sesionViva);
    if (s && s.dayName !== donde.dayName && (micro.days || []).some((d) => d.dayName === s.dayName)) {
      setDonde({ weekNumber: donde.weekNumber, dayName: s.dayName });
    }
  }, [donde, micro, day, sesionViva]);
  /* Sus ajustes («banco al 3»): de cualquier ejercicio, en cualquier rutina. */
  const { ajustesDe, fijar, editar, quitar } = useAjustesDeEjercicio(activeClient?.id);
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
    /* Pasar series del papel no es estar entrenando: ni pantalla despierta ni
       barra retirada. */
    if (!daySession.activeId || !donde || suelto) return;
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
  }, [daySession.activeId, donde, suelto, hechas, series, firmaDeTramos, activeClient?.id, marcar]);

  if (!activeClient) return null;

  /*
    SU HOJA YA NO ESTÁ. El entrenador la quitó con la sesión abierta: al volver
    a pedir el programa (lo pide el propio rechazo de la serie) el día deja de
    existir. Decía «Hoy no te toca entreno», con lo anotado solo en la franja de
    «no se han guardado». Ahora dice qué ha pasado y cuántas series se quedaron
    fuera; esas ya las apunta el recolocador y le llegan al entrenador.
  */
  if (donde && micro && !day) {
    /* Renombrada, y la sesión la sigue (el efecto de arriba): un instante. */
    const sigue = sessionsOf(micro).find((x) => x.id === sesionViva);
    if (sigue && (micro.days || []).some((d) => d.dayName === sigue.dayName)) return null;
    const fuera = new Set(
      noGuardadasDelCliente
        .map((e) => e.payload)
        .filter((p) => p?.weekNumber === donde.weekNumber && p?.dayName === donde.dayName)
        .map((p) => `${p.exercise?.id}:${p.setIndex}`)
    ).size;
    return (
      <div className="pc-hoja">
        <EmptyState
          icon={Dumbbell}
          title={`«${donde.dayName}» ya no está en tu rutina`}
          message={
            fuera > 0
              ? `Tu entrenador ha cambiado tu rutina mientras entrenabas. ${
                  fuera === 1 ? 'La serie que anotaste no se ha guardado' : `Las ${fuera} series que anotaste no se han guardado`
                }, y tu entrenador lo verá.`
              : 'Tu entrenador ha cambiado tu rutina. Elige otra sesión.'
          }
          action={
            <Link className="btn btn-primary" to="/mi/rutina">
              Ver mi rutina
            </Link>
          }
        />
      </div>
    );
  }

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
    LOS DÍAS QUE PUEDE LLEVAR, los de su microciclo y sin cruzarse con las
    otras apariciones de la misma hoja: el orden por fecha es lo que dice qué
    sesión es de qué aparición.
  */
  const limites = limitesDeLaAparicion(limitesDeLaSesion(micros, donde.weekNumber), aparicion || {});
  const fecha = daySession.session?.date || diaElegido || diaPorDefecto(limites);

  /*
    LA FRONTERA DE LAS REVISIONES, también en las series (23 sep): lo que su
    entrenador ya revisó, o lo que queda fuera de plazo, el cliente lo lee y no
    lo escribe. La base lo repite (0137). El entrenador no tiene frontera.
  */
  const bloqueo = porQueNoSeEscribe({
    fecha,
    esCliente: !isCoach,
    entregas,
    preferences: activeClient.preferences,
    startDate: activeClient.startDate,
  });

  /*
    LA ÚLTIMA VEZ de cada ejercicio: UNA sesión, la más reciente con series
    apuntadas de ese ejercicio antes de esta, en cualquier rutina y microciclo
    (`ultimaVezDeEjercicio`). De ahí salen el bloque «La última vez», los
    números en gris de las casillas y lo que pone «Hecha» en una serie vacía:
    los tres dicen lo mismo. Antes las casillas salían de `previousSetsBefore`,
    que no veía el lunes desde el jueves de la misma semana.
  */
  const ultimas = new Map(
    daySession.exercises.map((ex) => [
      ex.id,
      ultimaVezDeEjercicio(micros, ex.name, { sinSesion: daySession.activeId, antesDe: fecha }),
    ])
  );
  const previoDe = (exId, i) => ultimas.get(exId)?.sets?.[i] || null;

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
      fecha,
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
      const previo = previoDe(exId, setIndex);
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
  /*
    LA NOTA DEL EJERCICIO Y LOS AJUSTES son del cliente (0139): su entrenador,
    entrando con «Ver como», los lee y no los escribe. La nota ya no espera a
    la primera serie: si la sesión no existe, la crea (`logExerciseNote`).
  */
  const esSuyo = !isCoach && !daySession.session?.isLegacy && !bloqueo;
  const anotar = (exId, texto) => {
    const id = logExerciseNote(activeClient.id, donde.weekNumber, daySession.activeId, exId, texto, {
      date: fecha,
      dayName: day.dayName,
    });
    if (id && id !== daySession.activeId) daySession.select(id);
  };

  /* Las series de ESTA sesión que el servidor no guardó, por ejercicio y serie.
     Una sin sesión todavía (era la primera) se reconoce por su día. */
  const noGuardadas = new Set(
    noGuardadasDelCliente
      .map((e) => e.payload)
      .filter((p) =>
        p?.weekNumber === donde.weekNumber &&
        (daySession.activeId ? p.sessionId === daySession.activeId : p.dayName === day.dayName)
      )
      .map((p) => `${p.exercise?.id}:${p.setIndex}`)
  );

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
      /* «3 × 8-10», como en la hoja: el registro suelto lo enseña en su chapa. */
      pauta: pautaDe(ex),
      descanso: restLabel(ex.restSeconds),
      ejercicio: ex,
      /* LA NOTA DE SU ENTRENADOR para este ejercicio («codos pegados»). Se
         perdió al rehacer la sesión: solo la pintaba `HojaDelCliente`, que ya
         no monta nadie. Con el mismo interruptor del protocolo que en su hoja. */
      indicacion: isModuleOn(protocolo, 'coachNote') ? String(ex.coachNote || '').trim() : '',
      nota: String(ex.clientNote || ''),
      /* Su logbook: la última vez que hizo este ejercicio (series y nota) y
         sus ajustes fijos. Ver `ultimaVezDeEjercicio` y `useAjustesDeEjercicio`. */
      ultimaVez: ultimas.get(ex.id) || null,
      onNota: esSuyo ? (texto) => anotar(ex.id, texto) : null,
      ajustes: {
        lista: ajustesDe(ex.name),
        onFijar: !isCoach ? (texto) => fijar(ex.name, texto) : null,
        onEditar: !isCoach ? editar : null,
        onQuitar: !isCoach ? quitar : null,
      },
      series: (ex.sets || []).map((set, i) => {
        const previo = previoDe(ex.id, i);
        return {
          kg: String(set.kg ?? ''),
          reps: String(set.reps ?? ''),
          rir: String(set.rir ?? ''),
          hecha: isSetLogged(set),
          /* El servidor la rechazó: se ve lo anotado, pero no está guardado. */
          noGuardada: noGuardadas.has(`${ex.id}:${i}`),
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

  /*
    ── EL DÍA DE LA SESIÓN SE TOCA (23 sep) ────────────────────────────────
    Si entrenó el martes y lo apuntó el miércoles, la sesión decía miércoles y
    solo su entrenador podía corregirlo. Ahora la fecha de la cabecera abre el
    panel de la sesión, el mismo del entrenador sin sus acciones y con las
    mismas reglas (`domain/fechaDeLaSesion`). Mientras la sesión no existe —ninguna
    serie apuntada— no hay día que mover, y con la semana ya revisada tampoco:
    la fecha se lee y su globo dice por qué.

    Y antes de la primera serie también se elige (23 sep): es el día con el
    que nacerá la sesión. Sin tocarlo, hoy.
  */
  const dia = {
    texto: weekdayName(fecha, { conFecha: true }).replace(',', ''),
    /* En la cabecera del teléfono no caben las cuatro palabras. */
    corto: `${weekdayName(fecha).slice(0, 3)} ${shortDate(fecha)}`,
    fecha,
    limites,
    ocupados: diasConOtraSesion(micros, day.dayName, daySession.activeId),
    estado: daySession.session ? estadoDeLaSesion(daySession.session, series) : null,
    motivo: daySession.session
      ? porQueNoSeMueve({
          session: daySession.session,
          esCliente: !isCoach,
          entregas,
          preferences: activeClient.preferences,
          startDate: activeClient.startDate,
        })
      : null,
    onElegir: daySession.session
      ? (nueva) => cambiarFechaDeSesion(activeClient.id, donde.weekNumber, daySession.activeId, nueva)
      : setDiaElegido,
  };
  const cabecera = {
    nombre: day.dayName,
    dia,
    detalle: `${ejercicios.length} ejercicios`,
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

  /*
    DE VUELTA A LA HOJA, que es de donde se llega al registro suelto y al
    cierre directo. Con historial, atrás: la hoja se queda como estaba. Sin él
    (se recargó la página), a su dirección.
  */
  const volverALaHoja = () => {
    if (location.key !== 'default') {
      navigate(-1);
      return;
    }
    const q = new URLSearchParams({ hoja: day.dayName });
    if (Number.isFinite(donde.vez)) q.set('vez', String(donde.vez));
    navigate(`/mi/rutina?${q}`, { replace: true });
  };

  /* ── El cierre ─────────────────────────────────────────────────────────── */
  if (enCierre && hechas > 0) {
    /* La duración solo si se ha entrenado con la app en la mano: pasada del
       papel, «ahora menos el principio» mide lo que se tardó en copiarla. */
    const inicio = Date.parse(daySession.session?.startedAt || '');
    const medida = Number.isFinite(inicio) && !donde.cierre && !apuntadaDespues(daySession.session);
    const minutos = medida ? Math.round((Date.now() - inicio) / 60000) : null;
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
      /* Llegado desde la hoja, volver es volver a ella, no entrar a entrenar. */
      onVolver: donde.cierre ? volverALaHoja : () => setEnCierre(false),
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
    bloqueo,
    /*
      Solo el monitor: lo que leen las dos tarjetas del costado y sus ventanas,
      que son las de la hoja del entrenador (`ComparativaEjercicio`,
      `ComoLoLlevo`). Las sensaciones son las de la última sesión que las
      tiene: las de hoy se contestan al acabar.
    */
    lecturas: {
      microcycles: micros,
      weekNumber: donde.weekNumber,
      /* Las semanas del bloque de hoy: la progresión se mide dentro del bloque. */
      semanas: bloqueDelDia ? weeksOfBlock(program, bloqueDelDia) : null,
      etiqueta: (w) => weekLabel(program, w, unitInitial(program?.cycleType)),
      preguntas: activeQuestions(protocolo),
      ultimaConSensaciones: ultimaConSensaciones(micros, activeQuestions(protocolo)),
    },
  };

  /*
    ── LA OTRA PUERTA: un ejercicio suelto, con todas sus series a la vez ─────
    Las mismas escrituras y la misma sesión que el modo entreno; sin descanso,
    porque copiar del papel no es terminar una serie. Si el ejercicio ya no
    está en la hoja (su entrenador la cambió), se entra al modo entreno.
  */
  const delRegistro = suelto ? ejercicios.find((e) => e.id === suelto) : null;
  if (delRegistro) {
    return (
      <RegistroDelEjercicio
        datos={{
          cabecera: { nombre: day.dayName, cuando: aparicion?.cuando || null, dia },
          ejercicio: delRegistro,
          showRir,
          onCampo: (exId, i, campo, valor) => escribir(exId, i, campo, valor),
          guardado,
          bloqueo,
          /* Todo se guarda al escribir: «Guardar» vuelve, salvo que el servidor
             haya rechazado algo, que entonces se queda a la vista. */
          onGuardar: () => {
            if (guardado?.status !== 'error') volverALaHoja();
          },
        }}
      />
    );
  }

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

