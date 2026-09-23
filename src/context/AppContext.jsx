import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { supabase } from '@/lib/supabaseClient';
import { escucharConexion, hayRed } from '@/lib/conexion';
import { borrarInstantanea, guardarInstantanea, leerInstantanea } from '@/lib/instantanea';
import { createSaveQueue } from '@/lib/saveQueue';
import { olvidarSesion, recordarSesion, sesionDeRespaldo } from '@/lib/sesionOffline';
import { pendingStore } from '@/lib/pendingSaves';
import { almacenNoGuardadas, contarFallos, crearRecolocador, esDelCliente, esRechazoDelPlan } from '@/lib/seriesNoGuardadas';
import { conSeriesSinConfirmar } from '@/domain/seriesSinConfirmar';
import { BUILD, firmaDeEscritura, hayVersionNueva, vigilarVersion } from '@/lib/version';
import { useMirroredState } from '@/lib/useMirroredState';
import { recordIssue } from '@/lib/diagnostics';
import { flushEvents, forgetActor, identify } from '@/lib/analytics';
import { useConditions } from '@/context/useConditions';
import { useEquipment } from '@/context/useEquipment';
import { useExerciseSheets } from '@/context/useExerciseSheets';
import { useEquivGroups } from '@/context/useEquivGroups';
import { useRoadmap } from '@/context/useRoadmap';
import { useSupport } from '@/context/useSupport';
import { useReviews } from '@/context/useReviews';
import { useCalendar } from '@/context/useCalendar';
import { useCheckIns } from '@/context/useCheckIns';
import { useTeam } from '@/context/useTeam';
import { useIntegrations } from '@/context/useIntegrations';
import { useProgressPhotos } from '@/context/useProgressPhotos';
import { useCoachPrefs } from '@/context/useCoachPrefs';
import { useCajon } from '@/context/useCajon';
import { useAutomatizaciones } from '@/context/useAutomatizaciones';
import { useEnvios } from '@/context/useEnvios';
import { useClients } from '@/context/useClients';
import { useAnthropometry } from '@/context/useAnthropometry';
import { useNutrition } from '@/context/useNutrition';
import { useLibraries } from '@/context/useLibraries';
import { useWorkout } from '@/context/useWorkout';
import { BUCKET, SIGNED_URL_TTL_SECONDS } from '@/context/media';
import {
  mapAnthroFromDb,
  mapAnthroToDb,
  mapCatalogFoodFromDb,
  mapCheckInFromDb,
  mapClientFromDb,
  mapClientToDb,
  mapLibraryExerciseFromDb,
  mapLibraryFoodFromDb,
  mapNutritionFromDb,
  mapNutritionToDb,
  mapPhotoFromDb,
  mapPlanFromDb,
  mapTrainingSummaryFromDb,
  mapWorkoutFromDb,
  mapWorkoutToDb,
} from '@/lib/mappers';
import { adoptMicrocycle, emptyWorkoutData } from '@/domain/training';
import { conRepartoDelAbierto } from '@/domain/blocks';
import { emptyNutrition } from '@/domain/nutrition';
import {
  buildIntakePath,
  validateAttachment,
} from '@/domain/attachments';
import { traduceStorageError } from '@/lib/dbErrors';
import { isArchived } from '@/domain/portfolio';
import { stampUpdate } from '@/domain/updates';
import { trainingSummary } from '@/domain/sessions';

/*
  Los tres contextos. Ver el razonamiento entero donde se construyen sus valores,
  al final de `AppProvider`: se separan por FRECUENCIA DE CAMBIO, que es lo que
  decide a quién arrastra cada cosa cuando se repinta.
*/
const SessionContext = createContext(null);
const DataContext = createContext(null);
const ActionsContext = createContext(null);

/**
 * Qué cola de guardado corresponde a cada tabla de bloque.
 *
 * Fuera del componente: es una constante, y dentro obligaría a memoizarla o a
 * declararla como dependencia de todo lo que la use.
 */
const QUEUE_OF_TABLE = {
  workout_data: 'workout',
  anthropometry: 'anthro',
  nutrition_plans: 'nutrition',
};

/** Destinos válidos de un guardado recuperado. Ver el efecto de recuperación. */
const DOMINIOS = ['workout', 'anthro', 'nutrition', 'client', 'preferences'];

/** Lo que dice un guardado del programa que se para porque hay otra versión. Ver `lib/version`. */
const VERSION_VIEJA =
  'Hay una versión nueva de la aplicación. Tus cambios del programa se guardarán al recargar.';

/**
 * La versión que se da por leída cuando no se sabe sobre cuál se hizo un cambio
 * (una nota de antes de que las notas la llevaran). No coincide con ninguna, así
 * que escribir con ella siempre acaba en el aviso de conflicto: se pregunta en
 * vez de pisar. Ver el reenvío de lo pendiente.
 */
const SIN_BASE = '1970-01-01T00:00:00+00:00';

const EMPTY_SAVE_STATE = { status: 'idle', error: null };

/**
 * Cuánto se espera a que `getSession()` conteste antes de abrir con lo que haya.
 *
 * Dos segundos y medio: una sesión válida se resuelve en milisegundos —sale del
 * almacenamiento del navegador— y solo tarda cuando hay que renovar el testigo
 * contra un servidor que no contesta. Que es justo el caso en el que esperar no
 * sirve de nada. Ver el arranque, más abajo.
 */
const ESPERA_DE_SESION = 2500;

/**
 * Cuánto se espera a que la carga traiga datos antes de abrir con la copia.
 *
 * ══ Por qué hace falta un tope aquí también ═════════════════════════════════
 *
 * Porque `supabase-js` pide el testigo de sesión ANTES de cada consulta, y si el
 * testigo está caducado sale a renovarlo con reintentos de espera creciente. Sin
 * red eso no falla: se queda esperando. Así que la primera consulta de
 * `loadForUser` no vuelve nunca, la promesa de la carga tampoco, y la aplicación
 * se quedaba en la pantalla de la marca indefinidamente — comprobado el
 * 9/09/2026 apagando el servidor.
 *
 * No se puede arreglar «no llamando cuando no hay red», porque en ese momento
 * todavía no se sabe: `navigator.onLine` dice que sí y ninguna petición ha
 * fallado aún. Lo que sí se sabe, pasados unos segundos, es que no ha llegado
 * nada — y si hay copia, eso es suficiente para abrir.
 *
 * La carga NO se cancela: sigue por detrás y, si acaba llegando, reemplaza lo de
 * la copia y apaga el aviso ella sola.
 */
const ESPERA_DE_CARGA = 3500;

/**
 * Cuánto vale el programa del CLIENTE antes de volver a pedirlo al volver a la
 * aplicación. Ver `refrescarPrograma`.
 */
const PROGRAMA_VALE_MS = 5 * 60 * 1000;

/**
 * Las claves de cola que son «la rutina de este cliente» sin ser `workout:<id>`.
 *
 * El cliente no escribe el bloque: escribe una serie (`set:`) o pide la semana
 * siguiente (`continue:`), cada una con su clave para que no se pisen. Las dos
 * cuentan para el indicador de guardado y para el reintento.
 */
const esClaveDeRutina = (key, clientId) =>
  key.startsWith(`set:${clientId}:`) || key.startsWith(`continue:${clientId}:`);

export const AppProvider = ({ children }) => {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  /*
    Escritura rechazada porque alguien tocó los mismos datos en medio. Es un
    estado del que hay que SALIR —recargando o imponiendo tu versión—, no un
    error que se pueda ignorar, y por eso vive aparte de `loadError`.
  */
  const [conflict, setConflict] = useState(null);

  /*
    ══ Las series que el servidor RECHAZÓ, y que no pueden desaparecer ═════════

    La cola borra de su nota lo que el servidor rechaza para siempre —reenviarlo
    en cada arranque no lo haría válido—. Una serie así (su hoja se renombró o se
    quitó con el teléfono abierto desde antes) vivía entonces solo en la memoria
    de la pestaña. Ahora se apunta aparte y se enseña como no guardada. Ver
    `lib/seriesNoGuardadas`.
  */
  const noGuardadasRef = useRef(null);
  const [seriesNoGuardadas, setSeriesNoGuardadas] = useState([]);
  /* Lo que hay que hacer con un rechazo, en un ref: la cola se construye en el
     primer render y lo que necesita (`persistSet`, el programa) viene después. */
  const alRechazarRef = useRef(null);

  /*
    Los programas que se están volviendo a aplicar tras actualizar la aplicación
    (ver el reenvío de lo pendiente). Si chocan con otra escritura, el aviso de
    conflicto lo dice con sus palabras: no es que alguien escriba a la vez, es
    que el cambio es de antes de recargar.
  */
  const reaplicadosRef = useRef(new Set());
  const contarPendientesRef = useRef(null);

  /*
    ══ Se está mirando una COPIA ══════════════════════════════════════════════

    Cuando no hay red, el arranque rehidrata desde la foto local
    (`lib/instantanea`) en vez de dejar la aplicación vacía. Esto guarda de
    CUÁNDO es esa foto, y es `null` siempre que los datos vengan del servidor.

    Existe porque la interfaz tiene que poder decirlo. Enseñar la cartera de ayer
    sin avisar de que es de ayer es exactamente la clase de dato silencioso sobre
    el que alguien programa una semana entera.
  */
  const [copiaLocal, setCopiaLocal] = useState(null);

  /** Rol real, según la tabla `profiles`. La autorización la aplica RLS. */
  const [profileRole, setProfileRole] = useState('coach');
  /* Tu nombre, el de `profiles.full_name`. Se cargaba con el resto del perfil y
     se tiraba: la barra lateral acababa enseñando las iniciales del correo bajo
     el rótulo «mi nombre». Vacío si el perfil no lo tiene, y entonces quien lo
     pinta cae en el correo — inventar un nombre a partir de él sería peor. */
  const [profileName, setProfileName] = useState('');
  /** Vista activa. Un coach puede previsualizar el portal del cliente. */
  const [viewMode, setViewMode] = useState('coach');
  /*
    ══ A dónde ir al entrar en el portal de un cliente ════════════════════════

    Cambiar de modo NO navega: la ruta la traduce el comodín del árbol de destino
    (`OtherViewFallback`, en App.jsx), y navegar por tu cuenta pierde la carrera
    contra él —React Router navega en una transición de prioridad baja y el
    cambio de modo es una actualización normal—. Eso está escrito en `CoachLayout`
    desde hace tiempo y aun así se cayó en ello: «Ver su alta» llevaba al inicio
    del cliente porque la ficha no tiene equivalente en su portal.

    La salida es no competir: se deja dicho a dónde se quería ir y el comodín
    —que es quien decide de verdad— lo lee.

    ── En un ref y no en estado ───────────────────────────────────────────────
    Porque se consume UNA vez y consumirlo no debe repintar nada. Con estado,
    limpiarlo al leerlo provoca un render en el que el destino ya no está, y el
    comodín volvería a calcular el de siempre — la misma carrera por otro lado.
  */
  const viewTargetRef = useRef(null);

  const [selectedClientId, setSelectedClientId] = useState('');
  const [clients, setClients, clientsRef] = useMirroredState([]);
  const [workoutData, setWorkoutData, workoutRef] = useMirroredState({});
  const [anthropometry, setAnthropometry, anthroRef] = useMirroredState({});
  const [nutrition, setNutrition, nutritionRef] = useMirroredState({});

  /*
    El catálogo común (migración 0033): alimentos y ejercicios de referencia que
    ve todo el mundo y que nadie puede escribir desde el navegador.

    Se carga UNA vez por sesión y no por cliente: es el mismo para todos y no
    cambia salvo que se despliegue una migración. Vacío si la 0033 no está
    aplicada, y entonces los buscadores se comportan como siempre.
  */
  const [catalogFoods, setCatalogFoods] = useState([]);
  const [catalogExercises, setCatalogExercises] = useState([]);

  /** Equipo del entrenador y plan contratado, en su gancho (`useTeam.js`).
      `loadForUser` siembra los tres estados con los setters que devuelve. */
  const {
    team,
    setTeam,
    teamMembers,
    setTeamMembers,
    plan,
    setPlan,
    inviteTeamMember,
    updateTeamMemberRole,
    removeTeamMember,
    renameTeam,
    refreshPlan,
  } = useTeam({ clientsRef, setClients });

  /* Las bibliotecas del equipo (ejercicios y alimentos), en su gancho
     (`useLibraries.js`). Va detrás de `useTeam` porque escribe con el equipo
     resuelto; `loadForUser` siembra las dos listas con sus setters. */
  const {
    exerciseLibrary,
    setExerciseLibrary,
    foodLibrary,
    setFoodLibrary,
    upsertLibraryExercise,
    saveExerciseSheet,
    upsertLibraryFood,
    saveFoodSheet,
    editLibraryExercise,
    editLibraryFood,
    deleteLibraryFood,
    deleteLibraryExercise,
  } = useLibraries({ session, team, catalogFoods, catalogExercises });

  /*
    El resumen de entrenamiento que calcula el servidor (migración 0024), por
    cliente. Vacío significa «no hay resumen»: o falta la migración, o algún
    cliente conserva registros del formato antiguo. En los dos casos se ha cargado
    el programa completo y `training` sale de ahí.
  */
  const [serverSummaries, setServerSummaries] = useState({});
  const [legacyPending, setLegacyPending] = useState(false);

  /*
    El plan, accesible desde funciones que no deben depender de él.

    `upsertClientRow` necesita saber si la suscripción está activa para explicar
    un rechazo de escritura, pero meterlo en sus dependencias recrearía media
    cadena de guardado cada vez que se relee el plan. Un espejo en un ref da el
    valor de siempre sin arrastrar a nadie.
  */
  const planRef = useRef(null);
  planRef.current = plan;

  const [saveState, setSaveState] = useState({});

  // ── Cola de guardado ─────────────────────────────────────────────────────

  /*
    ══ Lo pendiente sobrevive a que se cierre la pestaña ══════════════════════

    La cola retenía en MEMORIA lo que no había podido enviar. En un gimnasio con
    mala cobertura eso significa que las series anotadas viven en una pestaña que
    el móvil puede matar en cualquier momento — y ahí no hay reintento posible.

    El almacén se enchufa por referencia y no directamente porque la cola se
    construye en el primer render, cuando todavía no se sabe QUIÉN es el usuario,
    y lo pendiente tiene que quedar separado por persona: dos entrenadores en el
    mismo ordenador no pueden heredar los guardados a medias del otro.
  */
  const storeRef = useRef(null);
  const queueRef = useRef(null);
  if (queueRef.current === null) {
    queueRef.current = createSaveQueue({
      /*
        Sin red la cola ESPERA en vez de intentarlo y fallar. Antes de esto, cada
        pulsación en un sótano salía, se caía y pintaba «No se guardó» en rojo
        sobre algo que estaba a salvo en el navegador — el aviso de pérdida más
        repetido de la aplicación era mentira. Ver `lib/conexion`.
      */
      isOnline: hayRed,
      onRechazo: (key, payload, error) => alRechazarRef.current?.(key, payload, error),
      store: {
        /* El programa lleva al lado la versión del servidor sobre la que se
           hizo: al volver a mandarlo tras recargar es lo que dice si alguien
           ha escrito encima desde entonces. */
        save: (key, payload) =>
          storeRef.current?.save(
            key,
            payload,
            key.startsWith('workout:')
              ? { base: versionsRef.current?.workout_data?.[key.slice('workout:'.length)] ?? null }
              : null
          ),
        clear: (key) => storeRef.current?.clear(key),
      },
      onStatus: (key, next) => {
        /*
          Un guardado que falla se apunta para el diagnóstico (`lib/diagnostics`).

          Es el fallo que más veces está detrás de un ticket y el que peor se
          cuenta: el usuario escribe «no me guarda», y lo que hace falta saber es
          QUÉ no se guardó y con qué error. La clave de cola dice lo primero
          —`workout:<cliente>`— y el mensaje lo segundo.
        */
        if (next.status === 'error') recordIssue('guardado', next.error, { key });
        /* Una serie que estaba entre las no guardadas y por fin ha entrado. Si
           ya se le había contado al entrenador, se le borra la línea: decir «no
           se guardó» de algo guardado es peor que no decir nada. */
        if (next.status === 'saved' && key.startsWith('set:') && noGuardadasRef.current) {
          const estaba = noGuardadasRef.current.list().find((e) => e.key === key);
          if (estaba) {
            setSeriesNoGuardadas(noGuardadasRef.current.quitar(key));
            if (estaba.avisado) {
              Promise.resolve(
                supabase.rpc('report_unsaved_set', { p_client: key.split(':')[1], p_clave: key, p_datos: null })
              ).catch(() => {});
            }
          }
        }

        setSaveState((prev) =>
          prev[key]?.status === next.status && prev[key]?.error === next.error
            ? prev
            : { ...prev, [key]: next }
        );
      },
    });
  }
  const queue = queueRef.current;

  /**
   * Estado de guardado de un dominio.
   *
   * ── Por qué «workout» mira también las claves `set:` ────────────────────────
   * Cuando el cliente registra una serie no se guarda el bloque completo, sino un
   * campo concreto con `log_session_set` (ver 0014), y cada campo tiene su propia
   * clave de cola para que kg, reps y RIR no se pisen. Eso deja al indicador de
   * guardado sin nada que mirar: la clave `workout:<id>` ya no se usa en el portal
   * del cliente, y el indicador diría «guardado» sin que se haya guardado nada.
   *
   * Así que para `workout` se agrega: cualquier campo fallando pone el indicador en
   * error —un fallo silencioso es exactamente lo que la cola existe para evitar—, y
   * cualquiera en vuelo lo pone en «guardando».
   *
   * `continue:` va en el mismo saco por lo mismo: la semana que el cliente añade
   * también la escribe una función de la base, y si no llega, todo lo que anote en
   * ella se va a rechazar. Que eso pase sin que el indicador se entere es el fallo
   * silencioso otra vez.
   */
  const saveStatus = useCallback(
    (domain, clientId) => {
      const own = saveState[`${domain}:${clientId}`];
      if (domain !== 'workout') return own || EMPTY_SAVE_STATE;

      /* Las no guardadas cuentan aunque la cola ya no las tenga —tras recargar,
         por ejemplo—: siguen sin estar en el servidor. */
      const suyas = seriesNoGuardadas.filter((e) => esDelCliente(e, clientId));
      const noGuardadas = suyas.length;
      /* Por qué, si es uno solo y se sabe: lo dice el pie de la sesión. */
      const motivo = noGuardadas > 0 && suyas.every((e) => esRechazoDelPlan(e.error)) ? 'plan' : null;

      const parts = Object.entries(saveState).filter(([key]) => esClaveDeRutina(key, clientId));
      if (parts.length === 0) {
        return noGuardadas > 0 ? { status: 'error', error: null, noGuardadas, motivo } : own || EMPTY_SAVE_STATE;
      }

      const failed = parts.find(([, s]) => s.status === 'error');
      if (failed) return { ...failed[1], noGuardadas, motivo };
      if (noGuardadas > 0) return { status: 'error', error: null, noGuardadas, motivo };
      /*
        'pending' va DELANTE de 'saving' y de 'saved', y esta línea es lo que
        impide que el modo sin conexión reintroduzca el fallo silencioso que toda
        esta cadena existe para evitar: sin ella, un cliente anotando series en un
        sótano —donde ningún campo está «en vuelo» porque no se intenta— caía en
        la última rama y leía «✓ Guardado» con todo por mandar.
      */
      if (parts.some(([, s]) => s.status === 'pending')) return { status: 'pending', error: null };
      if (parts.some(([, s]) => s.status === 'saving')) return { status: 'saving', error: null };
      if (own?.status === 'error' || own?.status === 'saving' || own?.status === 'pending') return own;
      return { status: 'saved', error: null };
    },
    [saveState, seriesNoGuardadas]
  );

  /* Volver a mandar las no guardadas. Un ref por el orden de los ganchos: quien
     sabe mandar una serie (`persistSet`) se define más abajo. */
  const reintentarNoGuardadasRef = useRef(null);

  const retrySave = useCallback(
    (domain, clientId) => {
      queue.retry(`${domain}:${clientId}`);
      // Y los campos sueltos que hayan fallado, que son los que de verdad tiene
      // pendientes el cliente.
      if (domain === 'workout') {
        for (const key of Object.keys(saveState)) {
          if (esClaveDeRutina(key, clientId) && saveState[key]?.status === 'error') queue.retry(key);
        }
        reintentarNoGuardadasRef.current?.(clientId);
      }
    },
    [queue, saveState]
  );

  /**
   * Lo que el servidor ya ha RECHAZADO, para toda la aplicación.
   *
   * `retrySave` pide por dominio y por cliente porque lo llama el indicador de
   * una pantalla, que sabe qué está mirando. Esto es lo contrario: la franja de
   * `ui/EstadoDeRed` sale en cualquier sitio —también en Inicio o en Cobros, donde
   * no hay ningún indicador— y lo que tiene que decir es «algo tuyo no se guardó»
   * sin saber de qué pantalla venía. Así que cuenta claves, no clientes, y su
   * reintento suelta TODAS las que fallaron.
   *
   * Con red y un guardado rechazado la nube del título dice «Conectado. Todo lo
   * tuyo está guardado», que es mentira; esto es lo que la tapa.
   */
  const fallosAlGuardar = useMemo(
    () =>
      contarFallos([
        ...Object.keys(saveState).filter((key) => saveState[key].status === 'error'),
        /* Y las series rechazadas que ya no están en la cola (tras recargar). */
        ...seriesNoGuardadas.map((e) => e.key),
      ]),
    [saveState, seriesNoGuardadas]
  );

  const reintentarLoFallido = useCallback(() => {
    for (const [key, s] of Object.entries(saveState)) {
      if (s.status === 'error') queue.retry(key);
    }
    reintentarNoGuardadasRef.current?.(null);
  }, [queue, saveState]);

  /*
    ══ Y aquí estuvo `hasUnsavedChanges` ══════════════════════════════════════

    «¿Hay algo escrito que todavía no esté confirmado?», que era `saving ||
    error || pending`. Lo pintaba una sola pieza —la chapa «Cambios sin
    confirmar» de `HeaderActions`— y mezclaba tres cosas que no se parecen y que
    hoy las cuenta cada una por su lado: lo que ESPERA a que vuelva la red
    (`enEspera`), lo que el servidor ha RECHAZADO (`fallosAlGuardar`) y lo que
    está en vuelo, que dura un debounce y no es noticia de nadie —empezaba en la
    primera pulsación, así que el aviso se encendía al teclear—.

    Quien necesite saber si queda algo por mandar antes de cerrar la pestaña usa
    `queue.hasUnsaved()`, que mira la cola y no los estados pintados.
  */

  /** Cuántas cosas esperan a que vuelva la red. Lo cuenta la franja de `ui/EstadoDeRed`. */
  const enEspera = useMemo(
    () => Object.values(saveState).filter((s) => s.status === 'pending').length,
    [saveState]
  );

  /* ¿Se ha publicado otra versión? Al volver a la pestaña y cada cuarto de hora.
     Ver `lib/version`. */
  useEffect(() => vigilarVersion(), []);

  // Un cierre de pestaña con debounce pendiente perdía el último cambio.
  useEffect(() => {
    const flush = () => queue.flushAll();
    const onBeforeUnload = (event) => {
      if (!queue.hasUnsaved()) return;
      flush();
      event.preventDefault();
      event.returnValue = '';
    };
    const onHide = () => {
      // En móvil `beforeunload` no siempre dispara; `hidden` sí.
      if (document.visibilityState === 'hidden') flush();
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [queue]);

  // ── Persistencia de los tres bloques JSONB ───────────────────────────────

  /**
   * Guarda un bloque de datos de un cliente (una fila por cliente).
   *
   * ── Por qué no se usa `upsert` ──────────────────────────────────────────────
   * Estas filas se identifican por `client_id`, no por la clave primaria. Un
   * `upsert(..., { onConflict: 'client_id' })` exige que exista una constraint
   * UNIQUE sobre esa columna, y en la base de datos real **no todas la tienen**:
   * el guardado de antropometría fallaba con «there is no unique or exclusion
   * constraint matching the ON CONFLICT specification» (Postgres 42P10). El
   * `schema.sql` del repositorio las declara, pero es una reconstrucción y en
   * las constraints no coincide con la realidad.
   *
   * UPDATE-y-si-no-existe-INSERT no depende de ninguna constraint. `select('id')`
   * en el UPDATE es lo que revela si había fila: PostgREST devuelve las filas
   * afectadas, así que un array vacío significa "no existía". Coste habitual:
   * una sola petición, porque la fila casi siempre existe ya.
   *
   * Sigue mereciendo la pena crear las constraints (migración 0003): sin ellas
   * nada impide dos filas para el mismo cliente, lo que partiría sus datos en
   * dos en silencio.
   */
  /**
   * La versión que tenemos leída de cada bloque: `tabla → cliente → updated_at`.
   *
   * Es un ref y no estado porque nadie lo pinta: solo se compara al escribir, y
   * un cambio aquí no debe provocar un render.
   */
  const versionsRef = useRef({});

  const rememberVersion = useCallback((table, clientId, stamp) => {
    if (!stamp) return;
    if (!versionsRef.current[table]) versionsRef.current[table] = {};
    versionsRef.current[table][clientId] = stamp;
  }, []);

  /**
   * Escribe un bloque de un cliente SOLO si nadie lo ha tocado desde que lo
   * leímos.
   *
   * ══ El problema que cierra ══════════════════════════════════════════════════
   *
   * `updated_at` se escribía en cada guardado y **nadie lo comparaba nunca**. Dos
   * escrituras simultáneas sobre el mismo cliente se pisaban sin dejar rastro:
   * ganaba la última en llegar y la otra desaparecía. No hacía falta un equipo —
   * bastaban dos pestañas abiertas, o una pestaña vieja que despierta y guarda su
   * copia en caché encima de la actual.
   *
   * El caso concreto que ya podía ocurrir: el entrenador reordena los ejercicios
   * del lunes mientras el cliente anota sus kilos. Los dos leyeron el mismo jsonb,
   * los dos lo reescriben entero, y el segundo borra el trabajo del primero.
   *
   * ══ Por qué aquí y no con `save_workout_data` ═══════════════════════════════
   *
   * La migración 0014 dejó escrita esa función, que hace justo esta comprobación.
   * No se usa por una razón concreta: solo escribe `microcycles`, y la fila lleva
   * además el split semanal, el calentamiento y las notas. Enchufarla habría
   * dejado de persistir esas tres columnas.
   *
   * Comparando `updated_at` desde aquí se protege la fila ENTERA y las TRES
   * tablas de bloque —rutina, antropometría y nutrición— sin una migración más.
   * La función sigue en la base de datos y es válida; simplemente cubre menos.
   *
   * ── Cómo se distingue «no existe» de «conflicto» ────────────────────────────
   * Las dos cosas dan cero filas afectadas. Se resuelve con UNA consulta extra
   * que solo ocurre en ese caso —la primera escritura de un cliente, o un
   * conflicto de verdad—, no en cada guardado.
   */
  const upsertClientRow = useCallback(
    async (table, clientId, fila) => {
      const seen = versionsRef.current[table]?.[clientId];
      /* Cada escritura del programa firma con su build y algo que no se repite:
         el trigger de la 0131 rechaza un cambio del plan con la firma de antes,
         que es lo que manda una versión que no conoce la columna. */
      const row = table === 'workout_data' ? { ...fila, escrito_por: firmaDeEscritura() } : fila;

      let query = supabase.from(table).update(row).eq('client_id', clientId);
      if (seen) query = query.eq('updated_at', seen);

      const updated = await query.select('updated_at');
      if (updated.error) return updated;

      if (updated.data && updated.data.length > 0) {
        rememberVersion(table, clientId, updated.data[0].updated_at);
        if (table === 'workout_data') reaplicadosRef.current.delete(clientId);
        return updated;
      }

      const current = await supabase
        .from(table)
        .select('updated_at')
        .eq('client_id', clientId)
        .maybeSingle();

      if (current.error) return current;

      if (current.data) {
        /*
          ── ¿Conflicto, o escritura RECHAZADA? ────────────────────────────────
          Las dos dan cero filas y hasta ahora se trataban igual, así que una
          suscripción caducada —que hace que RLS rechace el UPDATE— se anunciaba
          como «alguien ha cambiado estos datos mientras editabas». Mentira, y de
          las que hacen perder una tarde buscando a ese alguien.

          Se distinguen sin preguntar nada a nadie: si la versión que hay en el
          servidor es EXACTAMENTE la que leímos, nadie ha tocado la fila. El
          UPDATE llevaba esa misma condición, así que habría casado; si no casó,
          fue la política la que lo rechazó, no la versión.

          Sin `seen` es lo mismo: el UPDATE iba sin condición de versión, así que
          cero filas sobre una fila que existe solo puede ser un rechazo.
        */
        const rechazado = !seen || current.data.updated_at === seen;

        if (rechazado) {
          return {
            error: {
              message:
                planRef.current && planRef.current.activo === false
                  ? 'Tu suscripción no está activa, así que no se pueden guardar cambios. Lo que ya tienes sigue visible y puedes descargar tu copia.'
                  : 'No tienes permiso para guardar en esta ficha.',
            },
          };
        }

        /*
          La fila existe y su versión no es la nuestra: alguien ha escrito en
          medio. Se devuelve como error para que la cola lo trate como tal —el
          indicador dirá que no se guardó— y se marca el conflicto para poder
          explicarlo y ofrecer salida. Lo que NO se hace es escribir igualmente:
          eso es exactamente el borrado silencioso que esto viene a impedir.
        */
        setConflict({
          table,
          clientId,
          at: current.data.updated_at,
          /* Un cambio de antes de actualizar la aplicación, no de ahora. */
          motivo: table === 'workout_data' && reaplicadosRef.current.has(clientId) ? 'version' : null,
        });
        return {
          error: {
            message:
              'Alguien ha cambiado estos datos mientras editabas. Tus cambios no se han guardado para no pisar los suyos.',
          },
        };
      }

      const inserted = await supabase.from(table).insert(row).select('updated_at');
      if (!inserted.error && inserted.data?.length > 0) {
        rememberVersion(table, clientId, inserted.data[0].updated_at);
      }
      return inserted;
    },
    [rememberVersion]
  );


  /**
   * Salir de un conflicto. Dos caminos, y ninguno es «reintentar»: reintentar tal
   * cual volvería a chocar contra la misma versión, para siempre.
   *
   *   · `reload`    — recargar la página y quedarse con la versión del servidor.
   *     Es una recarga completa a propósito: media aplicación tiene el bloque en
   *     memoria y volver a pedir solo esa tabla dejaría el resto descuadrado.
   *   · `overwrite` — imponer la versión local. Se olvida la versión leída, con lo
   *     que la siguiente escritura va sin guardia, y se reenvía lo que quedó en la
   *     cola.
   *
   * El segundo PIERDE el trabajo del otro, y por eso la interfaz lo dice con esas
   * palabras en vez de llamarlo «forzar».
   */
  const resolveConflict = useCallback(
    (mode) => {
      if (!conflict) return;
      const { table, clientId } = conflict;
      if (mode === 'reload') {
        /*
          «Quedarme con lo suyo» es tirar lo mío, y lo mío sigue en la nota del
          navegador: sin borrarla, el arranque siguiente lo reenviaba —sin la
          versión leída, o sea sin guardia— y lo escribía ENCIMA de lo que
          acababas de elegir conservar.
        */
        storeRef.current?.clear(`${QUEUE_OF_TABLE[table]}:${clientId}`);
        reaplicadosRef.current.delete(clientId);
        window.location.reload();
        return;
      }
      if (versionsRef.current[table]) delete versionsRef.current[table][clientId];
      setConflict(null);
      queue.retry(`${QUEUE_OF_TABLE[table]}:${clientId}`);
    },
    [conflict, queue]
  );

  /*
    Quién está escribiendo, en una referencia.

    `persist` no puede depender del rol como valor sin volver a crearse cada vez
    que cambia —y con él la mitad de las funciones del contexto—. Una referencia
    da el valor de AHORA sin entrar en las dependencias.
  */
  const isCoachRef = useRef(false);
  isCoachRef.current = profileRole === 'coach';

  /** Cuándo se selló por última vez cada (tipo, cliente). Ver `persist`. */
  const stampedRef = useRef(new Map());

  /**
   * Deja constancia de que el entrenador ha tocado algo, para que al cliente le
   * salga como novedad.
   *
   * Escribe por la función de la base directamente y no por
   * `updateClientPreferences`, que se define mucho más abajo y usa `persist`: el
   * ciclo no compilaría. Y actualiza también el estado local, porque el sello
   * siguiente se calcula sobre lo que hay en memoria — sin eso, sellar la dieta
   * borraría el sello de la rutina.
   */
  const stampNow = useCallback(
    (clientId, kind) => {
      const actual = clientsRef.current.find((c) => c.id === clientId);
      if (!actual) return;

      const prefs = { ...(actual.preferences || {}), updates: stampUpdate(actual.preferences, kind) };
      setClients(clientsRef.current.map((c) => (c.id === clientId ? { ...c, preferences: prefs } : c)));

      /* Su fallo no se propaga: no haber podido dejar el aviso no puede
         estropear el guardado del trabajo, que es lo que importa.

         `Promise.resolve` en medio porque lo que devuelve `rpc()` es un
         thenable SIN `.catch`: llamarlo directo lanzaba un TypeError síncrono
         dentro del guardado — el aviso que no podía estropear nada rompía el
         `submit` entero, y era la causa de que el formulario de ejercicio o
         alimento se quedara con el texto anterior (el reset venía después). */
      Promise.resolve(supabase.rpc('set_client_preferences', { target: clientId, prefs })).catch(
        () => {}
      );
    },
    [clientsRef, setClients]
  );

  /* Los check-ins: estado y acciones en su gancho (`useCheckIns.js`). Va aquí y
     no con los demás dominios extraídos porque `loadForUser`, más abajo, siembra
     su estado con los setters que devuelve. */
  const {
    checkIns,
    setCheckIns,
    checkInsActivos,
    setCheckInsActivos,
    submitCheckIn,
    saveCheckInAnswers,
    loadCheckInHistory,
    deleteCheckIn,
    reviewCheckIn,
    unreviewCheckIn,
    updateCheckInNotes,
    filaDeRevision,
    reabrirRevision,
  } = useCheckIns({ stampNow });

  const persist = useCallback(
    (domain, clientId, payload, { immediate = false } = {}) => {
      const senders = {
        /* Con otra versión publicada, el programa no sale: lo reescribiría
           entero con las reglas de esta. Se mira al ENVIAR y no al encolar,
           para parar también lo que ya esperaba en la cola. Ver `lib/version`. */
        workout: (data) => {
          if (!hayVersionNueva()) return upsertClientRow('workout_data', clientId, mapWorkoutToDb(clientId, data));
          /* No sale, pero NO se pierde: se queda en la nota del navegador con
             la versión leída ahora, y la versión nueva lo vuelve a aplicar al
             arrancar (ver el reenvío de lo pendiente). La nota se reescribe
             aquí porque la de `enqueue` pudo apuntarse con un guardado en vuelo,
             o sea con la versión de antes de ese guardado. */
          storeRef.current?.save(`workout:${clientId}`, data, {
            base: versionsRef.current?.workout_data?.[clientId] ?? null,
          });
          return Promise.resolve({ error: { message: VERSION_VIEJA } });
        },
        anthro: (data) => upsertClientRow('anthropometry', clientId, mapAnthroToDb(clientId, data)),
        nutrition: (data) =>
          upsertClientRow('nutrition_plans', clientId, mapNutritionToDb(clientId, data)),
        client: (data) => supabase.from('clients').update(mapClientToDb(data)).eq('id', clientId),
        /*
          Las preferencias NO van por un UPDATE a `clients`, sino por una función
          de la base de datos.
          ------------------------------------------------------------------
          Porque RLS filtra FILAS, no columnas: permitir que el cliente escriba en
          su propia fila para guardar cómo quiere ver su panel le devuelve también
          el poder de ponerse el pago al día o cambiarse de entrenador. La función
          `set_client_preferences` (migración 0008) escribe exactamente esa columna
          después de comprobar quién llama, así que el permiso concedido es la
          operación y no la fila.

          El entrenador usa el mismo camino: un solo trayecto para los dos, y una
          sola regla que revisar.
        */
        preferences: (data) =>
          supabase.rpc('set_client_preferences', { target: clientId, prefs: data }),
      };

      queue.enqueue(`${domain}:${clientId}`, payload, senders[domain], { immediate });

      /*
        ══ La novedad del cliente sale SOLA de aquí ═══════════════════════════

        Hubo un botón de «avisar del cambio» y sobraba: si le has cambiado la
        rutina, que le aparezca que ha cambiado no es una decisión, es la
        consecuencia. Un botón para eso solo añade una forma de que se te olvide.

        ── Por qué no llena de avisos al cliente ───────────────────────────────
        Porque la novedad es una COMPARACIÓN —«esto se tocó después de la última
        vez que entré»— y no una lista de sucesos. Cuarenta guardados en una tarde
        de programación dejan un solo sello, y por tanto una sola línea en su
        panel. Ver `domain/updates.js`.

        ── Por qué solo cuando escribe el ENTRENADOR ──────────────────────────
        `workout_data` la escriben los dos: tú al programar y él al anotar sus
        series. Un sello puesto por su propio entrenamiento le diría «tu rutina ha
        cambiado» por algo que ha hecho él. Como esto corre en la sesión de quien
        escribe, `isCoachRef` distingue las dos sin preguntarle a la base de datos
        quién tocó la fila.

        Y se limita a uno cada cinco minutos: sin eso, montar un mesociclo serían
        cien llamadas a `set_client_preferences` que acabarían todas en el mismo
        valor.
      */
      if ((domain === 'workout' || domain === 'nutrition') && isCoachRef.current) {
        const kind = domain === 'workout' ? 'routine' : 'diet';
        const clave = `${kind}:${clientId}`;
        const ultimo = stampedRef.current.get(clave) || 0;
        if (Date.now() - ultimo > 5 * 60 * 1000) {
          stampedRef.current.set(clave, Date.now());
          stampNow(clientId, kind);
        }
      }
    },
    [queue, upsertClientRow, isCoachRef, stampedRef, stampNow]
  );

  /**
   * Guarda UN campo de UNA serie, por su propia clave de cola.
   *
   * Es el camino del cliente. Ver `log_session_set` en la migración 0014 y el
   * comentario largo en `logSessionSet`: el cliente no tiene UPDATE sobre
   * `workout_data` porque ese permiso, sobre una fila que contiene el programa
   * completo en un jsonb, le habría permitido reescribirlo entero.
   *
   * La clave incluye el campo para que kg, reps y RIR de la misma serie no se
   * sustituyan entre sí en la cola —que solo retiene el último payload por clave—.
   */
  const persistSet = useCallback(
    (key, clientId, args) => {
      queue.enqueue(
        key,
        args,
        (data) =>
          supabase.rpc('log_session_set', {
            p_client: clientId,
            p_week: data.weekNumber,
            p_session_id: data.sessionId,
            p_date: data.date,
            p_day_name: data.dayName,
            p_exercise_id: data.exercise.id,
            p_set_index: data.setIndex,
            p_field: data.field,
            p_value: String(data.value ?? ''),
            /* La subserie de un remate —la segunda bajada de la última serie—,
               o `null` para la serie misma. Ver la migración 0107. */
            p_sub_index: data.sub ?? null,
          }),
        { immediate: false }
      );
    },
    [queue]
  );

  /**
   * Guarda la nota que el cliente escribe en UN ejercicio de UNA sesión.
   *
   * Vive aquí, al lado de `persistSet`, por el mismo motivo que ella: es de las
   * pocas escrituras que hay que poder REENVIAR al arrancar, y quien reenvía es
   * el efecto de más abajo, que no alcanza a las funciones de `useWorkout`.
   *
   * Y hay que poder reenviarla porque lo que se perdería es texto que alguien
   * escribió —«bajé el peso: el hombro iba justo»— y ninguna pantalla lo vuelve
   * a pedir. La clave es por ejercicio: dos notas de la misma sesión son dos
   * cosas distintas y no pueden sustituirse en la cola.
   */
  const persistExerciseNote = useCallback(
    (key, clientId, args) => {
      queue.enqueue(
        key,
        args,
        (data) =>
          supabase.rpc('log_exercise_note', {
            p_client: clientId,
            p_week: data.weekNumber,
            p_session_id: data.sessionId,
            p_exercise_id: data.exerciseId,
            p_note: String(data.note ?? ''),
          }),
        { immediate: false }
      );
    },
    [queue]
  );

  /**
   * Pide al servidor la semana siguiente, y se queda con LA SUYA.
   *
   * ── Por qué no basta con encolar la llamada ────────────────────────────────
   * El navegador ya ha pintado la semana —tiene que aparecer al instante, y sin
   * conexión— construyéndola con la misma regla que el servidor. Con la misma
   * regla, sí, pero con sus propios identificadores, y el id del ejercicio es lo
   * único que `log_session_set` mira para saber dónde anotar. Así que hasta la
   * 0085 la pantalla enseñaba una semana y la base de datos guardaba otra, y todo
   * lo que se registrara en ella se rechazaba con «el ejercicio no está programado
   * en …» hasta la siguiente recarga completa.
   *
   * Ahora la propuesta de ids viaja en el payload y la respuesta trae el
   * microciclo que el servidor ha escrito de verdad. Si adoptó los ids es el
   * mismo y adoptarlo no cambia nada; si no —la copia de aquí estaba vieja—, se
   * corrige en el sitio sin esperar a ninguna recarga.
   *
   * El payload son los ids y no el número de semana porque es lo que hay que
   * poder reenviar: apuntado en el navegador, sobrevive al cierre de la pestaña y
   * sale con los mismos identificadores que la pantalla lleva enseñando desde
   * ayer. Y como el id del microciclo lo pone quien llama, un reenvío de algo que
   * ya llegó se reconoce y no duplica la semana.
   */
  const persistContinue = useCallback(
    (key, clientId, ids) => {
      queue.enqueue(
        key,
        ids,
        async (data) => {
          const res = await supabase.rpc('continue_program', { p_client: clientId, p_ids: data });

          /*
            Solo si el programa ya está en memoria. Este envío también sale desde
            la recuperación del arranque, en carrera con la carga inicial: escribir
            ahí un bloque con una única semana pisaría el programa entero si la
            respuesta llegara después. Y no hace falta — la carga trae justo lo que
            el servidor acaba de escribir.
          */
          const actual = workoutRef.current[clientId];
          if (!res.error && res.data && actual) {
            setWorkoutData({
              ...workoutRef.current,
              [clientId]: adoptMicrocycle(actual, data?.id ?? null, res.data),
            });
          }
          return res;
        },
        { immediate: true }
      );
    },
    [queue, setWorkoutData, workoutRef]
  );

  /**
   * Reenvía lo que quedó sin confirmar la última vez.
   *
   * ── Por qué se reconstruye el envío y no se guarda ─────────────────────────
   * Lo que se apunta en el navegador es el PAYLOAD, nunca la función que lo
   * manda: una función no se puede serializar, y guardar la petición ya montada
   * la congelaría con la sesión de entonces. Al volver, el payload se vuelve a
   * meter por el mismo camino de siempre, con la sesión de ahora.
   *
   * La clave dice a dónde iba. `domain:clientId` para lo que se guarda entero, y
   * `set:clientId:…` para una serie suelta —el camino del cliente en el gimnasio,
   * que es justo el caso que esto viene a salvar—, y `continue:clientId:…` para la
   * semana que se añadió sin conexión. Una clave que no encaje en ninguno se
   * ignora: reenviar algo a un destino adivinado es peor que perderlo.
   *
   * ── Por qué la semana nueva también tiene que estar aquí ────────────────────
   * Porque si no llega, las series que se anoten en ella se rechazan todas con
   * «no existe la semana N»: es el mismo desencuentro entre lo que enseña la
   * pantalla y lo que hay guardado que arregla la 0085, por el otro extremo.
   */
  const recuperadoRef = useRef(false);
  /** Programas de otra versión que esperan a que su cliente esté cargado. */
  const porReaplicarRef = useRef([]);

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) {
      // Al cerrar sesión se suelta el almacén: lo que escriba el siguiente no
      // puede acabar bajo la clave del anterior.
      storeRef.current = null;
      noGuardadasRef.current = null;
      setSeriesNoGuardadas([]);
      recuperadoRef.current = false;
      return;
    }
    if (recuperadoRef.current) return;

    recuperadoRef.current = true;
    storeRef.current = pendingStore(userId, BUILD);
    /* Las rechazadas NO se reenvían aquí: se rechazarían igual. Se enseñan. */
    noGuardadasRef.current = almacenNoGuardadas(userId);
    setSeriesNoGuardadas(noGuardadasRef.current.list());
    /* Y las que no se le llegaron a contar al entrenador (sin red, o antes de
       la 0132), se le cuentan ahora. */
    contarPendientesRef.current?.();

    for (const { key, payload, build, base } of storeRef.current.list()) {
      const partes = key.split(':');
      /*
        El programa entero solo se reenvía TAL CUAL si lo apuntó esta misma
        versión. Uno de otra —o sin etiqueta, de antes de que la hubiera— está
        montado con las reglas de entonces: mandarlo desde aquí lo escribiría
        encima de lo de ahora con esas reglas.

        Pero tampoco se tira: es lo que el entrenador escribió después del aviso
        de «Hay una versión nueva», o justo antes de recargar. Se aparta y se
        vuelve a aplicar cuando el programa esté cargado (efecto de más abajo,
        tras `ensureProgram`).

        Las series, las notas y la semana nueva sí se reenvían siempre: van campo
        a campo por funciones de la base que validan lo que reciben, y perderlas
        es perder lo que alguien entrenó.
      */
      if (partes[0] === 'workout' && partes[1] && build !== BUILD) {
        porReaplicarRef.current.push({ clientId: partes[1], payload, base: base ?? null });
        continue;
      }
      /* Y el de esta versión sale con guardia: la versión sobre la que se hizo.
         Sin ella, en el arranque todavía no hay ninguna leída y el reenvío
         escribía sin mirar si alguien había escrito encima. */
      if (partes[0] === 'workout' && partes[1] && base && !versionsRef.current.workout_data?.[partes[1]]) {
        rememberVersion('workout_data', partes[1], base);
      }
      if (partes[0] === 'set' && partes[1]) {
        persistSet(key, partes[1], payload);
      } else if (partes[0] === 'notaej' && partes[1]) {
        persistExerciseNote(key, partes[1], payload);
      } else if (partes[0] === 'continue' && partes[1]) {
        persistContinue(key, partes[1], payload);
      } else if (DOMINIOS.includes(partes[0]) && partes[1]) {
        persist(partes[0], partes[1], payload, { immediate: true });
      }
    }
  }, [session, persist, persistSet, persistExerciseNote, persistContinue, rememberVersion]);

  /*
    Un rechazo definitivo de una SERIE se apunta entre las no guardadas y, si lo
    causó un cambio del plan, se recoloca (`crearRecolocador`). Lo demás (una
    nota, la semana nueva) sigue como estaba: su error a la vista y su reintento
    mientras viva la pestaña.

    El recolocador se monta en cada llamada porque el almacén cambia con quien
    entra; las piezas son las de ahora.
  */
  const recolocador = () =>
    noGuardadasRef.current
      ? crearRecolocador({
          almacen: noGuardadasRef.current,
          /* El programa al día. Una ráfaga de series rechazadas lo pide una vez:
             `refrescarPrograma` comparte la petición en vuelo, y lo leído hace
             menos de diez segundos vale. */
          programaAlDia: async (clientId) => {
            const reciente = Date.now() - (leidoEnRef.current.get(clientId) || 0) < 10 * 1000;
            return (reciente ? null : await refrescarPrograma(clientId)) || workoutRef.current[clientId] || null;
          },
          reenviar: persistSet,
          avisar: setSeriesNoGuardadas,
          /* Al entrenador, por la función de la 0132. Sin ella aplicada falla
             y la serie se queda sin `avisado`: se vuelve a intentar al arrancar. */
          contar: (key, datos) =>
            Promise.resolve(
              supabase.rpc('report_unsaved_set', { p_client: key.split(':')[1], p_clave: key, p_datos: datos })
            ),
        })
      : null;

  contarPendientesRef.current = () => recolocador()?.contarPendientes();

  alRechazarRef.current = (key, payload, error) => {
    recolocador()?.alRechazar(key, payload, error);
  };

  /* Reintentar a mano, de un cliente o de todos (`null`). Las que la cola ya
     tiene las reintenta `queue.retry`; esto les busca sitio otra vez. */
  reintentarNoGuardadasRef.current = (clientId) => {
    const r = recolocador();
    for (const e of noGuardadasRef.current?.list() || []) {
      const [, cliente] = e.key.split(':');
      if (clientId && cliente !== clientId) continue;
      r?.reintentar(e.key, e.payload);
    }
  };

  /**
   * Las series de un cliente que su teléfono no pudo guardar y le contó al
   * entrenador (`report_unsaved_set`, 0132). Sin la migración la tabla no existe:
   * eso es «ninguna», no un error que enseñar.
   */
  const leerSeriesNoGuardadas = useCallback(async (clientId) => {
    if (!clientId) return [];
    const { data, error } = await supabase
      .from('series_no_guardadas')
      .select('semana, hoja, ejercicio, serie, campo, valor, fecha, rechazada_en')
      .eq('client_id', clientId)
      .order('rechazada_en', { ascending: false })
      .limit(200);
    return error ? [] : data || [];
  }, []);

  // ── Carga inicial ────────────────────────────────────────────────────────

  /** Descarta respuestas de una carga anterior si el usuario cambia rápido. */
  const loadTokenRef = useRef(0);

  /** Cuándo se leyó del servidor el programa de cada cliente. Ver `refrescarPrograma`. */
  const leidoEnRef = useRef(new Map());

  /*
    ¿La última carga trajo lo esencial? Un ref y no estado porque quien lo
    pregunta es `loadOnce`, justo después de esperar la carga, y el estado
    todavía no se ha repintado ahí. Sirve para dos cosas:

      · decidir si hay que caer a la copia local (`lib/instantanea`);
      · y NO sobrescribir una copia buena con un arranque a medias, que sería la
        peor manera de perder los datos: en silencio y en el sitio que existe
        precisamente para no perderlos.
  */
  const cargaOkRef = useRef(false);
  /*
    Los setters de la bandeja de envíos, alcanzables desde aquí.

    `useEnvios` se monta MÁS ABAJO que la carga —necesita la sesión ya resuelta—
    así que sus setters no existen todavía cuando se escribe esto. El espejo en un
    ref es el recurso que este archivo ya usa para lo mismo (`planRef`, la fachada
    de acciones): se rellena en cada render y se lee dentro de una llamada, que es
    cuando ya está.
  */
  const siembraEnviosRef = useRef(null);
  /** De cuándo son los datos que hay en memoria, según el SERVIDOR. */
  const sincronizadoEnRef = useRef(null);

  /* Las fotos de progreso: estado espejado y acciones en su gancho
     (`useProgressPhotos.js`). `loadForUser` siembra las filas —sin firmar— con
     el setter que devuelve. */
  const {
    progressPhotos,
    setProgressPhotos,
    ensurePhotoUrls,
    uploadProgressPhoto,
    deleteProgressPhoto,
    updateProgressPhoto,
    declararLadoAntiguo,
    refreshPhotoUrls,
  } = useProgressPhotos({ clientsRef, isCoachRef });

  const loadForUser = useCallback(
    async (user) => {
      const token = ++loadTokenRef.current;
      const isStale = () => token !== loadTokenRef.current;

      cargaOkRef.current = false;
      setLoadError(null);

      const { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (isStale()) return;
      if (profileErr) {
        setLoadError('No se pudo cargar tu perfil. Comprueba tu conexión y vuelve a intentarlo.');
        return;
      }

      const role = profile?.role === 'client' ? 'client' : 'coach';
      setProfileRole(role);
      setProfileName(String(profile?.full_name || '').trim());
      setViewMode(role === 'coach' ? 'coach' : 'client');

      /*
        El equipo, si existe.
        --------------------------------------------------------------------
        Mientras la migración 0006 no esté aplicada estas tablas no existen y la
        consulta falla con «Could not find the table». Eso NO es un error para el
        usuario: significa "todavía no hay equipos", y la aplicación sigue
        funcionando como siempre —un entrenador con sus clientes—. Por eso se
        traga el fallo aquí en lugar de propagarlo a `loadError`.
      */
      let team = null;
      let members = [];

      if (role === 'coach') {
        let membership = await supabase.from('team_members').select('team_id, role');

        /*
          Un entrenador que se registró DESPUÉS de la 0006 no tiene equipo: aquella
          migración rellenó los que ya existían y nada crea los nuevos. Daba igual
          mientras el equipo solo servía para repartir clientes; con la suscripción
          colgando de él (0019), quedarse sin equipo es quedarse sin plan.

          `ensure_my_team` es idempotente y devuelve el que haya. Si la 0019 no está
          aplicada, falla y todo sigue como antes.
        */
        if (!isStale() && !membership.error && (membership.data || []).length === 0) {
          const created = await supabase.rpc('ensure_my_team');
          /*
            Si falla, la aplicación sigue —un entrenador sin equipo funciona— pero
            el fallo se APUNTA. Es lo que faltaba cuando `ensure_my_team` chocaba
            consigo misma (arreglado en la 0037): quedarse sin equipo aquí no
            dejaba rastro, y el ticket llegaba con el error del alta, que es dos
            pasos más abajo y no menciona el equipo por ninguna parte.
          */
          if (created.error) recordIssue('equipo', created.error);
          if (!isStale() && !created.error && created.data) {
            membership = await supabase.from('team_members').select('team_id, role');
          }
        }

        if (!isStale() && !membership.error && (membership.data || []).length > 0) {
          const teamId = membership.data[0].team_id;
          const [teamRes, memberRes] = await Promise.all([
            supabase.from('teams').select('*').eq('id', teamId).single(),
            supabase
              .from('team_members')
              .select('profile_id, role, profiles(full_name, email)')
              .eq('team_id', teamId),
          ]);

          if (!teamRes.error) {
            team = {
              id: teamRes.data.id,
              name: teamRes.data.name,
              ownerId: teamRes.data.owner_id,
              myRole: membership.data[0].role,
            };
          }
          members = (memberRes.data || []).map((row) => ({
            profileId: row.profile_id,
            role: row.role,
            name: row.profiles?.full_name || '',
            email: row.profiles?.email || '',
          }));
        }
      }

      if (isStale()) return;
      setTeam(team);
      setTeamMembers(members);

      /*
        El plan. Mismo criterio que el equipo: si la 0019 no está aplicada la
        función no existe, y eso no es un error del usuario sino «todavía no hay
        planes». Queda en `null` y la pantalla de Plan lo dice.
      */
      if (role === 'coach' && team) {
        const planRes = await supabase.rpc('my_team_plan');
        if (!isStale() && !planRes.error) setPlan(mapPlanFromDb(planRes.data?.[0]));
      }

      /*
        Sin `.eq('coach_id', …)`: el filtro lo aplica RLS.
        --------------------------------------------------------------------
        Con equipos, quién ve a quién depende del rol —un entrenador ve solo los
        suyos, el dueño todos—, y reproducir esa regla en JavaScript sería
        duplicar la autorización en el único sitio donde no se puede confiar en
        ella. Sin equipos el resultado es idéntico, porque la política actual ya
        es `coach_id = auth.uid()`.
      */
      const clientsQuery =
        role === 'coach'
          ? supabase.from('clients').select('*').order('created_at')
          : supabase.from('clients').select('*').eq('client_profile_id', user.id);

      const { data: clientRows, error: clientsErr } = await clientsQuery;
      if (isStale()) return;
      if (clientsErr) {
        setLoadError(`No se pudieron cargar los clientes: ${clientsErr.message}`);
        return;
      }

      const mappedClients = (clientRows || []).map(mapClientFromDb);
      setClients(mappedClients);
      setSelectedClientId((prev) =>
        mappedClients.some((c) => c.id === prev) ? prev : mappedClients[0]?.id || ''
      );

      /*
        Las bibliotecas solo las gestiona el coach (autocompletado al programar).

        ── Sin filtro cuando hay equipo ──────────────────────────────────────
        La 0006 pasó `exercises` y `foods` a ser del EQUIPO —su política ya es
        `team_id IN (my_team_ids())`— y dejó la carga filtrando por `coach_id`,
        que era lo que había antes. Con eso, un entrenador contratado no veía ni
        un ejercicio: la biblioteca es del equipo pero él preguntaba por la suya,
        que está vacía. Y desde la 0022 hay una biblioteca de partida que le
        pasaría exactamente lo mismo.

        Con equipo se deja decidir a RLS, igual que con los clientes. Sin equipo
        se sigue filtrando por `coach_id`, porque entonces la columna `team_id` no
        existe y la política antigua es la que manda.
      */
      if (role === 'coach') {
        const library = (table) => {
          const query = supabase.from(table).select('*').order('name');
          return team ? query : query.eq('coach_id', user.id);
        };

        const [exRes, foodRes] = await Promise.all([library('exercises'), library('foods')]);
        if (isStale()) return;
        if (exRes.error) console.error('exercises:', exRes.error.message);
        if (foodRes.error) console.error('foods:', foodRes.error.message);
        setExerciseLibrary((exRes.data || []).map(mapLibraryExerciseFromDb));
        setFoodLibrary((foodRes.data || []).map(mapLibraryFoodFromDb));
      } else {
        setExerciseLibrary([]);
        setFoodLibrary([]);
      }

      const ids = mappedClients.map((c) => c.id);
      if (ids.length === 0) {
        setWorkoutData({});
        setAnthropometry({});
        setNutrition({});
        setProgressPhotos([]);
        setCheckIns({});
        /* Un entrenador recién dado de alta no tiene a nadie, y eso es una carga
           correcta: la copia local debe poder guardarse igual. */
        cargaOkRef.current = true;
        sincronizadoEnRef.current = Date.now();
        setCopiaLocal(null);
        return;
      }

      /*
        ── El resumen, y por qué puede no usarse ─────────────────────────────
        `training_summaries` (migración 0024) devuelve por cliente lo que la
        cartera y «Hoy» necesitan, en kilobytes en vez de megas. Con él, el
        programa completo solo se descarga del cliente que se abre.

        Dos motivos para NO usarlo, y los dos acaban en la carga de siempre:

          · la migración no está aplicada — la función no existe;
          · algún cliente conserva registros del formato antiguo (`has_legacy`).
            Esos kilos viven dentro del plan y el resumen no los ve, así que
            usarlo diría «40 días sin entrenar» de alguien que entrenó ayer.
            Cargar de más es un problema de velocidad; enseñar una alerta falsa
            es un problema de confianza.

        Es un todo o nada por entrenador: media cartera resumida y media completa
        sería la peor versión de las dos.
      */
      let resumenes = null;
      if (role === 'coach') {
        const res = await supabase.rpc('training_summaries');
        if (!isStale() && !res.error && Array.isArray(res.data)) {
          const conHeredados = res.data.some((row) => row.has_legacy);
          if (!conHeredados) resumenes = res.data.map(mapTrainingSummaryFromDb);
          else setLegacyPending(true);
        }
      }

      const [wd, anthro, nutri, photos] = await Promise.all([
        // Con resumen no se piden los programas: es la descarga que sobra.
        resumenes
          ? Promise.resolve({ data: [], error: null })
          : supabase.from('workout_data').select('*').in('client_id', ids),
        supabase.from('anthropometry').select('*').in('client_id', ids),
        supabase.from('nutrition_plans').select('*').in('client_id', ids),
        // `progress_photos` no tiene columna `date`; la fecha es `created_at`.
        supabase
          .from('progress_photos')
          .select('*')
          .in('client_id', ids)
          .order('created_at', { ascending: false }),
      ]);

      if (isStale()) return;

      const failed = [wd, anthro, nutri, photos].filter((r) => r.error);
      if (failed.length > 0) {
        setLoadError(`Algunos datos no se pudieron cargar: ${failed[0].error.message}`);
      }

      /*
        La versión de cada bloque, tal y como la acabamos de leer. Es contra esto
        contra lo que se compara al escribir (ver `upsertClientRow`): sin
        registrarla aquí, la primera escritura de la sesión iría sin guardia y
        volvería a poder pisar el trabajo de otro.
      */
      versionsRef.current = { workout_data: {}, anthropometry: {}, nutrition_plans: {} };
      for (const [table, res] of [
        ['workout_data', wd],
        ['anthropometry', anthro],
        ['nutrition_plans', nutri],
      ]) {
        for (const row of res.data || []) {
          versionsRef.current[table][row.client_id] = row.updated_at;
        }
      }
      for (const row of wd.data || []) leidoEnRef.current.set(row.client_id, Date.now());

      setWorkoutData(
        Object.fromEntries((wd.data || []).map((r) => [r.client_id, mapWorkoutFromDb(r)]))
      );
      setServerSummaries(
        resumenes ? Object.fromEntries(resumenes.map((r) => [r.clientId, r])) : {}
      );
      setAnthropometry(
        Object.fromEntries((anthro.data || []).map((r) => [r.client_id, mapAnthroFromDb(r)]))
      );
      setNutrition(
        Object.fromEntries((nutri.data || []).map((r) => [r.client_id, mapNutritionFromDb(r)]))
      );

      /*
        Check-ins: el ÚLTIMO de cada cliente.
        --------------------------------------------------------------------
        Solo hace falta el más reciente para saber si hay algo por revisar hoy;
        traer el histórico completo de veinte clientes serían cientos de filas que
        nadie mira. Como con los equipos, si la tabla no existe (migración 0009 sin
        aplicar) se ignora el error: significa «todavía no hay check-ins cerrados»
        y el tablero deduce el estado de los datos que ya hay.
      */
      const checkInRes = await supabase
        .from('check_ins')
        .select('*')
        .in('client_id', ids)
        .order('week_start', { ascending: false });

      if (isStale()) return;
      /*
        «No existe la tabla» significa función sin activar; cualquier otro error
        —red, permisos— no autoriza a decir eso: se deja el dato como esté. El
        patrón del texto es el mismo que usa `loadAuditLog` con la 0017.
      */
      if (checkInRes.error) {
        if (/does not exist|schema cache/i.test(checkInRes.error.message)) setCheckInsActivos(false);
      } else {
        setCheckInsActivos(true);
      }
      setCheckIns(
        checkInRes.error
          ? {}
          : Object.fromEntries(
              (checkInRes.data || [])
                .map(mapCheckInFromDb)
                // El primero de cada cliente es el más reciente: el orden ya viene
                // dado, así que la primera entrada gana.
                .reduce((acc, row) => (acc.has(row.clientId) ? acc : acc.set(row.clientId, row)), new Map())
            )
      );

      /*
        ── Las fotos se cargan SIN firmar ────────────────────────────────────
        Antes se firmaba aquí la URL de TODAS las fotos de TODOS los clientes. Con
        veinte clientes y sesenta fotos cada uno son mil doscientos enlaces
        temporales generados en el arranque, de los que se usan los de un cliente
        —si es que se abre alguna foto—. Y caducan a las 8 horas, así que buena
        parte se firmaba para nada.

        La cartera y «Hoy» solo necesitan las FECHAS de las fotos, que vienen en la
        fila. El enlace hace falta cuando se va a mirar una imagen, y entonces lo
        pide la pantalla que la mira (`ensurePhotoUrls`).
      */
      const nameOf = (clientId) => mappedClients.find((c) => c.id === clientId)?.name;
      if (isStale()) return;
      setProgressPhotos((photos.data || []).map((r) => mapPhotoFromDb(r, nameOf(r.client_id))));

      /*
        Llegar hasta aquí es la definición de «carga buena»: perfil, cartera y
        los tres bloques están en memoria. A partir de este punto la copia local
        se puede escribir y lo que se está mirando ya no es una foto.

        Lo de `failed.length > 0` de más arriba NO lo impide: ahí falló alguna de
        las consultas secundarias y el aviso ya está puesto, pero lo esencial
        está; guardar eso es mejor que quedarse con una copia de la semana pasada.
      */
      cargaOkRef.current = true;
      sincronizadoEnRef.current = Date.now();
      setCopiaLocal(null);
    },
    [
      setAnthropometry,
      setCheckIns,
      setCheckInsActivos,
      setClients,
      setCopiaLocal,
      setExerciseLibrary,
      setFoodLibrary,
      setNutrition,
      setPlan,
      setProgressPhotos,
      setTeam,
      setTeamMembers,
      setWorkoutData,
    ]
  );

  const clearAll = useCallback(() => {
    queue.reset();
    setSaveState({});
    setClients([]);
    setExerciseLibrary([]);
    setFoodLibrary([]);
    setWorkoutData({});
    setAnthropometry({});
    setNutrition({});
    setProgressPhotos([]);
    setSelectedClientId('');
    setTeam(null);
    setTeamMembers([]);
    setCheckIns({});
  }, [queue, setAnthropometry, setCheckIns, setClients, setExerciseLibrary, setFoodLibrary, setNutrition, setProgressPhotos, setTeam, setTeamMembers, setWorkoutData]);

  /**
   * Rehidrata la aplicación desde la copia local. Devuelve si había algo.
   *
   * ══ Es el mismo aterrizaje que el del servidor ══════════════════════════════
   *
   * A propósito llama a LOS MISMOS setters que `loadForUser`, con los datos ya
   * mapeados. Nada por debajo distingue de dónde vinieron: no hay una «pantalla
   * offline» ni un camino paralelo que mantener en pie: es la aplicación entera,
   * con datos de hace un rato.
   *
   * ── Las versiones viajan con la foto, y es lo importante ────────────────────
   * `versionsRef` es la guardia de «esto es lo que yo leí» que impide pisar el
   * trabajo de otro (ver `upsertClientRow`). Restaurarla es lo que hace que
   * trabajar sin conexión sea SEGURO: si alguien tocó la misma ficha mientras
   * estabas fuera, al volver la red sale el aviso de conflicto en vez de un
   * borrado silencioso. Sin esto, el modo sin conexión sería una máquina de pisar
   * cambios ajenos.
   */
  const aplicarInstantanea = useCallback(
    (datos) => {
      if (!datos) return false;

      const clientes = datos.clients || [];

      setProfileRole(datos.profileRole === 'client' ? 'client' : 'coach');
      setProfileName(datos.profileName || '');
      setViewMode(datos.profileRole === 'client' ? 'client' : 'coach');
      setTeam(datos.team || null);
      setTeamMembers(datos.teamMembers || []);
      setPlan(datos.plan || null);
      setClients(clientes);
      setSelectedClientId((prev) =>
        clientes.some((c) => c.id === prev) ? prev : clientes[0]?.id || ''
      );
      setExerciseLibrary(datos.exerciseLibrary || []);
      setFoodLibrary(datos.foodLibrary || []);
      setCatalogExercises(datos.catalogExercises || []);
      setCatalogFoods(datos.catalogFoods || []);
      setWorkoutData(datos.workoutData || {});
      setServerSummaries(datos.serverSummaries || {});
      setLegacyPending(Boolean(datos.legacyPending));
      setAnthropometry(datos.anthropometry || {});
      setNutrition(datos.nutrition || {});
      setCheckIns(datos.checkIns || {});
      setCheckInsActivos(datos.checkInsActivos !== false);
      setProgressPhotos(datos.progressPhotos || []);

      versionsRef.current = datos.versions || {
        workout_data: {},
        anthropometry: {},
        nutrition_plans: {},
      };

      /* La bandeja se siembra por el espejo: su gancho vive más abajo. Y se da
         por LISTA, o las pantallas que la esperan se quedarían cargando para
         siempre contra un servidor que no está. */
      siembraEnviosRef.current?.setEnvioRows(datos.envioRows || []);
      siembraEnviosRef.current?.setEnviosReady(true);

      return true;
    },
    [
      setAnthropometry,
      setCheckIns,
      setCheckInsActivos,
      setClients,
      setExerciseLibrary,
      setFoodLibrary,
      setNutrition,
      setPlan,
      setProgressPhotos,
      setTeam,
      setTeamMembers,
      setWorkoutData,
    ]
  );

  /**
   * Quién está cargado ahora mismo. Es la guardia de la recarga completa.
   *
   * ══ Por qué no basta con filtrar por nombre de evento ══════════════════════
   *
   * Aquí había `if (event === 'TOKEN_REFRESHED') return;`, puesto porque recargar
   * en ese evento «pisaba el estado local y el trabajo reciente parecía borrarse
   * solo». El diagnóstico era correcto y la guardia se quedó corta: **`auth-js`
   * emite `SIGNED_IN` cada vez que la pestaña vuelve a estar visible**. Su
   * manejador de `visibilitychange` llama a `_recoverAndRefresh()`, y esa función
   * termina en `_notifyAllSubscribers('SIGNED_IN', session)` siempre que la sesión
   * guardada siga siendo válida. No es una sesión nueva: es la misma, recuperada.
   *
   * Así que salir un momento a otra pestaña y volver disparaba `loadForUser`
   * entero. Y con la carga perezosa (0024) eso **vacía `workoutData`**: la consulta
   * de programas no se hace cuando hay resumen, así que el mapa se reescribe con
   * `{}` y el cliente abierto se queda sin programa en memoria. La pantalla de
   * rutina —que no distingue «no cargado» de «no tiene»— pasaba a decir «este
   * cliente no tiene programa todavía» y a ofrecer «crear el primer microciclo»,
   * que al pulsarlo escribía un programa vacío ENCIMA del bueno. De ahí que el
   * microciclo desapareciera «a pesar de aparecer como guardado» y no volviera ni
   * recargando: para entonces ya no estaba en el servidor.
   *
   * La guardia ahora es por IDENTIDAD y no por evento: se recarga cuando cambia
   * QUIÉN está dentro. Eso cubre `TOKEN_REFRESHED`, `SIGNED_IN` al volver a la
   * pestaña, `USER_UPDATED` y lo que auth-js añada mañana —una lista de nombres de
   * evento vuelve a quedarse corta cada vez que la librería crece—. Y de paso
   * evita la doble carga del arranque, donde `getSession()` e `INITIAL_SESSION`
   * llegaban a la vez.
   *
   * Refrescar datos a propósito sigue teniendo su camino: `refreshClients`.
   */
  const loadedUserRef = useRef(null);
  /* La promesa de la carga en marcha. Existe para que el camino de arranque que
     NO la lanzó pueda esperarla en vez de saltársela (ver `loadOnce`). */
  const cargaEnVueloRef = useRef(null);

  useEffect(() => {
    let active = true;

    /** Carga la cartera entera, y solo si de verdad ha cambiado el usuario. */
    const loadOnce = async (user) => {
      if (!user) {
        loadedUserRef.current = null;
        clearAll();
        return;
      }
      if (loadedUserRef.current === user.id) {
        /*
          La carga de este usuario ya está en marcha por el otro camino de
          arranque (`getSession()` e `INITIAL_SESSION` llegan a la vez). Se
          ESPERA, no se salta: quien llama sostiene `loading`, y soltarlo antes
          de que la cartera llegue expulsaba los enlaces profundos — quien abría
          `/c/<id>/rutina` desde un marcador aterrizaba en «Clientes», porque
          CoachLayout veía `loading` apagado con cero clientes y no puede
          distinguir «no cargó todavía» de «ese cliente no existe».

          El error, si lo hay, ya lo registró y anunció quien lanzó la carga.
        */
        try {
          await cargaEnVueloRef.current;
        } catch {
          /* ya contado por el camino que la lanzó */
        }
        return;
      }
      // Se marca ANTES de esperar: los dos caminos de arranque corren en el mismo
      // hilo y, sin esto, ambos verían el ref vacío y cargarían por duplicado.
      loadedUserRef.current = user.id;

      /**
       * Abrir con la foto local. Ver `lib/instantanea`.
       *
       * Deja la aplicación en el mismo sitio que la dejaría el servidor, marca de
       * cuándo son los datos y da la carga por buena — para que lo que se escriba
       * a partir de ahora entre también en la copia y no se pierda al recargar
       * sin haber recuperado la señal.
       */
      const abrirConLaCopia = async () => {
        const copia = await leerInstantanea(user.id);
        if (!copia || !aplicarInstantanea(copia.datos)) return false;
        cargaOkRef.current = true;
        sincronizadoEnRef.current = copia.at;
        setCopiaLocal({ at: copia.at });
        setLoadError(null);
        return true;
      };

      /*
        ══ Lo que se comparte con el otro camino de arranque es la espera ACOTADA ══

        `cargaEnVueloRef` guarda ESTA promesa —la que ya lleva el reloj dentro— y
        no la de `loadForUser` pelada. La diferencia no es de estilo: los dos
        caminos del arranque (`getSession()` e `INITIAL_SESSION`) llegan a la vez,
        el segundo se encuentra la marca puesta y ESPERA a lo que guarde este ref.
        Guardando ahí la carga cruda, sin red esa espera no terminaba nunca —
        `supabase-js` pide el testigo antes de cada consulta y se queda
        reintentando—, así que quien sostenía `loading` no lo soltaba jamás y la
        aplicación se quedaba para siempre en la pantalla de la marca aunque la
        copia estuviera cargada y lista. Medido el 9/09/2026.
      */
      cargaEnVueloRef.current = (async () => {
        /*
          Si ya se sabe que no hay red, ni se intenta: lanzar la carga solo
          añadiría la espera de un fetch condenado antes de enseñar lo mismo.
        */
        if (!hayRed() && (await abrirConLaCopia())) return;

        const carga = loadForUser(user);

        /* Ver `ESPERA_DE_CARGA`. La carga NO se cancela: sigue viva por detrás y
           se corrige sola si la red aparece. */
        const desenlace = await Promise.race([
          carga.then(
            () => 'llegó',
            (e) => {
              recordIssue('carga', e);
              return { reventó: e };
            }
          ),
          new Promise((suelta) => setTimeout(() => suelta('tarda'), ESPERA_DE_CARGA)),
        ]);

        if (desenlace === 'llegó') {
          /*
            Volvió sin reventar, pero puede no haber traído lo esencial —la red se
            cayó a media descarga—. Solo se cae a la copia SIN red: con red, un
            fallo del servidor es un fallo de verdad (permisos, suscripción, RLS)
            y taparlo con datos de ayer escondería justo lo que hay que arreglar.
          */
          if (!cargaOkRef.current && !hayRed()) await abrirConLaCopia();
          return;
        }

        /* Tarda demasiado, o reventó. En los dos casos la copia es lo mejor que
           hay. */
        if (await abrirConLaCopia()) return;

        if (desenlace === 'tarda') {
          /*
            Sin copia no hay nada que enseñar y la carga sigue esperando a una red
            que quizá no vuelva. Se dice, que es más honesto que la pantalla de la
            marca dando vueltas: la aplicación se pinta con su aviso y, si la red
            aparece, la carga que sigue viva lo apaga sola.
          */
          setLoadError('No se ha podido conectar. Comprueba tu conexión; se reintentará solo.');
          return;
        }

        // Una carga que revienta no puede dejar la marca puesta: sin esto, la
        // aplicación se quedaría vacía hasta cerrar sesión, porque ya nadie
        // volvería a intentarlo.
        loadedUserRef.current = null;
        setLoadError(desenlace.reventó?.message || 'No se han podido cargar tus datos.');
      })();

      await cargaEnVueloRef.current;
    };

    (async () => {
      try {
        /*
          ══ El arranque no se queda esperando a una red que no está ════════════

          `getSession()` no es una lectura local: si el testigo de acceso ha
          caducado —a la hora— sale a renovarlo, y auth-js reintenta esa
          renovación con espera creciente. Sin red eso son decenas de segundos
          durante los cuales `loading` sigue puesto y la aplicación entera es la
          pantalla de la marca. Medido el 9/09/2026 con el servidor apagado: se
          quedaba ahí, sin barra, sin login y sin explicación.

          Con tope, lo normal no cambia —una sesión válida se resuelve en
          milisegundos, sin tocar la red— y lo excepcional deja de bloquear.
        */
        const respuesta = await Promise.race([
          supabase.auth.getSession(),
          new Promise((suelta) => setTimeout(() => suelta({ agotado: true }), ESPERA_DE_SESION)),
        ]);
        if (!active) return;

        const real = respuesta?.data?.session || null;

        /*
          ══ «No hay sesión» no siempre significa que hayas salido ══════════════

          Puede significar «no he podido preguntar»: sin red, la renovación falla
          y `getSession()` devuelve `null` aunque la sesión siga guardada y siga
          siendo válida. Sin esto, abrir el icono en un gimnasio dos horas después
          daba la pantalla de login — con la copia de los datos intacta al lado y
          sin forma de verla.

          El respaldo se usa SOLO cuando no hubo respuesta (se agotó el tope, o no
          hay red). Si el servidor contesta que no hay nadie dentro, se le cree:
          taparlo con el respaldo dejaría dentro a quien acaba de salir.

          Y no autoriza nada: a quien hay que convencer es al servidor, y al
          servidor se va con el testigo de auth-js. Ver `lib/sesionOffline`.
        */
        const sinRespuesta = Boolean(respuesta?.agotado) || !hayRed();
        const sesion = real || (sinRespuesta ? sesionDeRespaldo() : null);

        if (real?.user) recordarSesion(real.user);
        setSession(sesion);
        if (sesion?.user) await loadOnce(sesion.user);
      } catch (e) {
        if (active) setLoadError(e?.message || 'Error al iniciar sesión.');
      } finally {
        if (active) setLoading(false);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, next) => {
      if (!active) return;

      /*
        Sin red, un evento SIN sesión no significa que hayas salido: significa que
        no se ha podido renovar el testigo. `_emitInitialSession` de auth-js emite
        exactamente eso —`INITIAL_SESSION` con `null`— cuando la renovación se cae
        por falta de red, y hacerle caso vaciaba de golpe la sesión de respaldo y
        la cartera entera que se acababa de abrir desde la copia.

        `SIGNED_OUT` NUNCA se ignora: ese sí lo emite auth-js al borrar la sesión
        de verdad, y salir tiene que funcionar aunque no haya cobertura.
      */
      if (!next && !hayRed() && event !== 'SIGNED_OUT') return;

      if (next?.user) recordarSesion(next.user);
      setSession(next);
      await loadOnce(next?.user || null);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadForUser, clearAll, aplicarInstantanea]);

  const signOut = useCallback(async () => {
    queue.flushAll();
    flushEvents();
    forgetActor();
    /*
      La copia local se va con la sesión, y a diferencia de lo pendiente de
      guardar (`lib/pendingSaves`, que SÍ sobrevive) no se pierde nada con ello:
      es una foto que se puede volver a pedir. Lo que sí evita es que la cartera
      entera de un entrenador —nombres, pesos, dietas— siga legible en el
      ordenador compartido después de que haya salido. Y no se le quita nada:
      volver a entrar necesita servidor de todas formas.
    */
    olvidarSesion();
    await borrarInstantanea(session?.user?.id);
    await supabase.auth.signOut();
  }, [queue, session]);

  /**
   * Cómo te llamas.
   *
   * ══ Por qué no había forma de ponerlo ══════════════════════════════════════
   *
   * `profiles.full_name` se LEÍA en cinco sitios —el saludo de la portada, el
   * menú de cuenta, la lista del equipo, el historial de cambios y la
   * radiografía— y no se escribía en ninguno. Quien no lo tuviera relleno de
   * antes veía «Buenos días, m4nugnzl@gmail.com» todas las mañanas sin ninguna
   * manera de arreglarlo desde dentro de la aplicación.
   *
   * El correo como identidad es el respaldo correcto —es lo único que sí
   * tenemos siempre—, pero tiene que poder dejar de serlo.
   *
   * ── Optimista, como el resto ───────────────────────────────────────────────
   * El nombre se ve cambiado al momento y se revierte si la escritura falla: es
   * el mismo trato que reciben las preferencias del entrenador, y aquí importa
   * porque este nombre está en la cabecera de la pantalla que se está mirando.
   */
  const updateProfileName = useCallback(
    async (nombre) => {
      const userId = session?.user?.id;
      if (!userId) return { ok: false, error: 'No hay sesión activa.' };

      const limpio = String(nombre || '').trim().slice(0, 80);
      const previo = profileName;

      setProfileName(limpio);
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: limpio || null })
        .eq('id', userId);

      if (error) {
        setProfileName(previo);
        return { ok: false, error: error.message };
      }
      return { ok: true };
    },
    [session, profileName]
  );

  /*
    A quién se le apunta el uso (migración 0045).

    Va en un efecto y no dentro de `loadForUser` porque depende de tres cosas que
    se resuelven en momentos distintos —la sesión, el rol y el equipo— y aquí se
    reacciona a las tres a la vez sin ensuciar la carga.

    `identify` decide por su cuenta que solo se instrumenta al ENTRENADOR: el
    cliente final es el sujeto de los datos de salud que esto guarda, y no va a
    ser además el sujeto de la medición.
  */
  useEffect(() => {
    identify({ userId: session?.user?.id, team: team?.id, role: profileRole });
  }, [session?.user?.id, team?.id, profileRole]);

  // ── Cliente activo ───────────────────────────────────────────────────────

  /*
    ── Dos listas, y por qué ─────────────────────────────────────────────────
    `clients` es el estado completo y así se queda: todas las mutaciones y el
    espejo (`clientsRef`) trabajan sobre él, y filtrarlo ahí dentro haría que
    actualizar a un archivado lo borrase de la lista.

    Lo que cambia es lo que se EXPONE. Casi todo el producto —la cartera, «Hoy»,
    la paleta, el selector— habla de la cartera viva, así que `clients` sale ya
    filtrado y ninguna de esas pantallas necesita saber que existe el archivo. Lo
    completo se expone aparte, para las tres cosas que sí lo necesitan: la lista
    de clientes, la copia de seguridad y resolver la ficha que pide la URL.
  */
  /**
   * El resumen de entrenamiento de cada cliente, venga de donde venga.
   *
   * ── Por qué el programa cargado MANDA sobre el resumen del servidor ─────────
   * Porque es más reciente. El resumen se calculó al arrancar; el programa que hay
   * en memoria incluye la serie que el entrenador acaba de anotar hace diez
   * segundos. Si el resumen ganara, «Hoy» no enseñaría el entreno que se está
   * registrando en la pestaña de al lado.
   *
   * Y por eso mismo la mezcla es por cliente y no una elección global: del que
   * está abierto se tiene el programa entero, del resto el resumen, y la cartera
   * los trata igual sin saber cuál es cuál.
   */
  const training = useMemo(() => {
    const out = { ...serverSummaries };
    for (const [clientId, program] of Object.entries(workoutData)) {
      out[clientId] = trainingSummary(program);
    }
    return out;
  }, [serverSummaries, workoutData]);

  const visibleClients = useMemo(() => clients.filter((c) => !isArchived(c)), [clients]);
  const archivedClients = useMemo(() => clients.filter(isArchived), [clients]);

  /*
    Se busca en la lista COMPLETA: `/c/<id>/resumen` de alguien archivado tiene que
    seguir abriéndose —para consultar su historial o para recuperarlo—, y si se
    resolviera contra la filtrada, el enlace caería en el primer cliente de la
    lista y estarías mirando la ficha de otra persona sin enterarte.

    El respaldo, en cambio, sale de la viva: al entrar sin haber elegido a nadie,
    lo razonable es el primero de la cartera, no uno que ya terminó.
  */
  const activeClient = useMemo(
    () => clients.find((c) => c.id === selectedClientId) || visibleClients[0] || null,
    [clients, visibleClients, selectedClientId]
  );

  // ── Preferencias del entrenador ──────────────────────────────────────────

  /* En su gancho (`useCoachPrefs.js`). `applyDashboardToAll` no está allí: es
     una escritura masiva de la cartera y vive con `reloadClients`. */
  const { coachPrefs, coachPrefsReady, updateCoachPreferences } = useCoachPrefs({ session });

  /* El cajón: bloques, días y platos guardados con nombre (0112), en su gancho.
     Va detrás de `useCoachPrefs` porque sin la migración aplicada se lee de las
     preferencias, que es lo que hace que no parezca que se ha borrado nada. */
  const {
    cajon,
    hayTabla: hayCajon,
    guardarEnCajon,
    renombrarEnCajon,
    borrarDelCajon,
    cabeEnCajon,
  } = useCajon({ session, team, coachPrefs, isCoach: profileRole === 'coach' });

  /* Lo que se le manda a alguien y lo que vuelve (0099, generalizado en 0105),
     en su gancho. Lo usan los DOS lados: quien filtra es RLS, no la aplicación. */
  const {
    envioRows,
    enviosReady,
    setEnvioRows,
    setEnviosReady,
    reloadEnvios,
    mandarAccion,
    dejarDePedir,
    quitarPedido,
    marcarAccion,
    marcarVisto,
  } = useEnvios({ session });

  /* El espejo que `aplicarInstantanea` usa para sembrar la bandeja: su gancho se
     monta aquí abajo y la carga vive arriba. Ver `siembraEnviosRef`. */
  siembraEnviosRef.current = { setEnvioRows, setEnviosReady };

  // ── La copia local ───────────────────────────────────────────────────────

  /**
   * Guarda la foto de lo que hay en memoria. Ver `lib/instantanea`.
   *
   * ── Por qué se escribe con CADA cambio y no solo al cargar ──────────────────
   * Porque si no, recargar sin conexión devolvería los datos del servidor —los de
   * la última vez que hubo red— y el trabajo hecho offline desaparecería de la
   * pantalla. Seguiría a salvo en la cola (`lib/pendingSaves`) y acabaría
   * llegando, pero durante todo ese rato la aplicación estaría enseñando una
   * versión sin ello: la definición exacta de «esto no me lo ha guardado».
   *
   * Escribiendo también los cambios, la foto es lo que la persona tiene delante.
   *
   * ── Y con retardo ──────────────────────────────────────────────────────────
   * Un segundo y medio, para que escribir un peso no dispare una escritura a
   * disco por pulsación. El caso que importa —cerrar la pestaña, quedarse sin
   * batería— no ocurre a mitad de tecla, y lo pendiente de mandar ya tiene su
   * propia red de seguridad, que sí es inmediata.
   *
   * ── Nunca sobre una carga a medias ─────────────────────────────────────────
   * `cargaOkRef` es la guardia: sin ella, un arranque que falla a mitad
   * sobrescribiría la copia buena con media cartera. Perder los datos en el sitio
   * que existe para no perderlos sería el peor fallo posible de esta pieza.
   */
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId || loading || !cargaOkRef.current) return undefined;

    const temporizador = setTimeout(() => {
      guardarInstantanea(
        userId,
        {
          profileRole,
          profileName,
          team,
          teamMembers,
          plan,
          clients,
          exerciseLibrary,
          foodLibrary,
          catalogExercises,
          catalogFoods,
          workoutData,
          serverSummaries,
          legacyPending,
          anthropometry,
          nutrition,
          checkIns,
          checkInsActivos,
          progressPhotos,
          envioRows,
          /* La guardia de escritura viaja con la foto: es lo que hace que
             trabajar sin red no pise el trabajo de nadie. Ver `aplicarInstantanea`. */
          versions: versionsRef.current,
        },
        /* La fecha es la del último dato del SERVIDOR, no la de esta escritura.
           Si no, editar sin conexión rejuvenecería la copia y «datos de hace dos
           horas» pasaría a leerse «de hace un momento», que es mentira. */
        sincronizadoEnRef.current || Date.now()
      );
    }, 1500);

    return () => clearTimeout(temporizador);
  }, [
    session, loading,
    profileRole, profileName, team, teamMembers, plan, clients,
    exerciseLibrary, foodLibrary, catalogExercises, catalogFoods,
    workoutData, serverSummaries, legacyPending, anthropometry, nutrition,
    checkIns, checkInsActivos, progressPhotos, envioRows,
  ]);

  /**
   * Vuelve la conexión: se manda lo pendiente y, si se estaba mirando una copia,
   * se va a por lo de verdad.
   *
   * ── El agujero que cierra ──────────────────────────────────────────────────
   * Lo pendiente solo se reenviaba en el arranque (ver el efecto de recuperación,
   * más arriba). O sea que quien anotaba tres series en un sótano y volvía a la
   * calle con la pestaña abierta seguía sin haber mandado nada — y no había forma
   * de saberlo ni de provocarlo salvo recargar. Todo el andamiaje de la cola
   * estaba puesto y le faltaba justo el momento para el que se construyó.
   */
  useEffect(() => {
    const user = session?.user;

    return escucharConexion(() => {
      if (!hayRed()) return;

      queue.reenviarTodo();

      /* Con la copia en pantalla, recuperar la señal significa que ya se puede
         preguntar. No se recarga la página: se vuelve a cargar el estado, y las
         pantallas se actualizan solas donde estén. */
      if (user && copiaLocal) {
        loadForUser(user).catch((e) => recordIssue('carga', e));
      }
    });
  }, [queue, session, copiaLocal, loadForUser]);

  // ── Soporte ──────────────────────────────────────────────────────────────

  /* Segundo dominio extraído: estado (`isSupport`), bandeja y acciones de
     tickets viven en su gancho. `uploadIntakeFile` y `signPaths` se quedan
     aquí porque no son de soporte (ver `useSupport.js`). */
  const { isSupport, loadTickets, createTicket, replyTicket, setTicketStatus } = useSupport({
    session,
    team,
  });

  // ── Archivos de los pasos del alta ───────────────────────────────────────
  //
  // Van al MISMO bucket y con el mismo esquema de rutas que las fotos y las
  // revisiones (`<clientId>/…`), así que las políticas de la 0007 ya los cubren:
  // el entrenador dueño sube y lee, el propio cliente lee. Ni una política nueva.
  //
  // La RUTA es lo que se guarda en `preferences.intake.files`, nunca la URL: el
  // bucket es privado y lo que se firma caduca. Guardar una URL firmada sería
  // guardar algo que deja de abrir a las ocho horas.

  const uploadIntakeFile = useCallback(async ({ clientId, stepId, file }) => {
    const invalido = validateAttachment(file);
    if (invalido) return { ok: false, error: invalido };

    const path = buildIntakePath({ clientId, stepId, fileName: file.name });
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type || undefined, upsert: false });

    if (error) {
      // Los archivos del alta cuelgan del cliente, así que la cuota (0067)
      // también los cuenta y también puede cortarlos.
      const capado = traduceStorageError(error, { cliente: !isCoachRef.current });
      return { ok: false, error: capado || `No se pudo subir el archivo: ${error.message}` };
    }
    return { ok: true, path };
  }, []);

  /**
   * Firma una lista de rutas del bucket. Devuelve un `Map` ruta → URL.
   *
   * Existe porque ya son cuatro los sitios que necesitan lo mismo —fotos,
   * revisiones, adjuntos de soporte y ahora los archivos del alta— y cada uno se
   * lo estaba montando con su propia llamada. Lo que no se firma no aparece en el
   * mapa, así que quien llame puede distinguir «no hay archivo» de «hay archivo y
   * no puedo abrirlo», que son dos mensajes distintos para el usuario.
   */
  const signPaths = useCallback(async (paths, ttl = SIGNED_URL_TTL_SECONDS) => {
    const limpias = [...new Set((paths || []).filter(Boolean))];
    if (limpias.length === 0) return new Map();

    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(limpias, ttl);
    if (error) return new Map();

    return new Map((data || []).filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]));
  }, []);

  // ── Catálogo común ───────────────────────────────────────────────────────

  /*
    Una sola carga por sesión, en cuanto hay usuario. No se recarga al cambiar de
    cliente ni al volver a la pestaña: son datos de referencia que solo cambian
    cuando se despliega una migración, y volver a pedirlos sería tráfico por nada.
  */
  const catalogUserId = session?.user?.id || null;

  useEffect(() => {
    if (!catalogUserId) {
      setCatalogFoods([]);
      setCatalogExercises([]);
      return undefined;
    }

    let cancelado = false;

    (async () => {
      const [foods, exercises] = await Promise.all([
        supabase.from('catalog_foods').select('*').order('name'),
        supabase.from('catalog_exercises').select('*').order('name'),
      ]);

      if (cancelado) return;
      // Sin la 0033 las tablas no existen. Se traga: el catálogo es una ayuda,
      // no un requisito, y un `loadError` aquí tumbaría la aplicación entera por
      // una función opcional.
      setCatalogFoods(foods.error ? [] : (foods.data || []).map(mapCatalogFoodFromDb));
      setCatalogExercises(
        exercises.error ? [] : (exercises.data || []).map(mapLibraryExerciseFromDb)
      );
    })();

    return () => {
      cancelado = true;
    };
  }, [catalogUserId]);

  // ── Roadmap ──────────────────────────────────────────────────────────────

  const activeClientId = activeClient?.id || null;

  /* El primer dominio extraído del proveedor: estado, carga y acciones viven
     en su gancho. La convención está escrita en `useRoadmap.js`. */
  const {
    phases,
    anchors,
    hechos,
    dietVersions,
    igualar,
    quitarReplanteo,
    addPhase,
    updatePhase,
    removePhase,
    setPhaseFork,
    chooseFork,
    saveAnchor,
    removeAnchor,
    shiftFuturePhases,
  } = useRoadmap({
    session,
    activeClientId,
  });

  /* Lo que condiciona lo que le puedes poner (migración 0077). Misma convención
     y mismo alcance que el roadmap: los del cliente abierto. */
  const { conditions, conditionsOfMany, addCondition, updateCondition, resolveCondition, removeCondition } =
    useConditions({ activeClientId });

  /* La maquinaria de su gimnasio (migración 0079). Mismo alcance: la del cliente
     abierto, que es de quien se está montando la rutina. */
  const { equipment, equipmentCounts, addEquipment, setEquipmentGroup, removeEquipment } =
    useEquipment({
      activeClientId,
      /* Para el recuento de TODA la cartera, que se pide una vez por sesión y no
         por cliente. Sin usuario no hay nada que contar. */
      userId: session?.user?.id || null,
    /* Solo para redactar el aviso cuando la cuota corta: al entrenador se le dice
       que amplíe su plan y al cliente que avise a su entrenador (ver
       `traduceStorageError`). Es el mismo espejo que usa el guardado. */
      isCoach: isCoachRef.current,
    });

  /* Tu vídeo y tus pautas, como los lee quien entrena (migración 0100). Misma
     convención; el alcance lo decide quién mira: el cliente pide los suyos sin
     decir de quién —los resuelve `auth.uid()`— y el entrenador que está en «Ver
     como» pide los del cliente abierto. */
  const { sheetOf } = useExerciseSheets({
    session,
    clientId: profileRole === 'client' ? null : activeClientId,
  });

  /* Y los grupos de equivalencia de su entrenador (migración 0113), por la
     misma puerta y con el mismo alcance: lo que el cliente ve al preguntar «no
     tengo plátanos, ¿qué pongo?» tiene que ser la lista que le podaron, no la
     que calcula el catálogo. Ver `useEquivGroups`. */
  const { gruposEquiv } = useEquivGroups({
    session,
    clientId: profileRole === 'client' ? null : activeClientId,
  });

  /**
   * VUELVE A PEDIR EL PROGRAMA de un cliente, con lo que aún no ha llegado encima.
   *
   * ══ Por qué ═══════════════════════════════════════════════════════════════
   *
   * El teléfono cargaba el programa una vez y no lo volvía a pedir: ni tiempo
   * real ni recarga al volver a la aplicación. Una PWA abierta desde por la
   * mañana seguía mandando series a hojas que el entrenador había renombrado o
   * quitado a mediodía, y el servidor las rechazaba todas. Es la causa de casi
   * todos los rechazos de `log_session_set`; lo pide el cliente al volver a
   * primer plano (efecto de más abajo) y el recolocador tras un rechazo.
   *
   * ── Lo que no se puede pisar ─────────────────────────────────────────────
   * Las series en la cola se ponen encima (`conSeriesSinConfirmar`): el
   * servidor todavía no las tiene y la persona las acaba de ver escritas. Lo
   * demás que el cliente escribe —una nota, el cierre, la semana nueva— no se
   * sabe poner encima, así que con algo de eso esperando no se pide nada: ya se
   * pedirá la próxima vez.
   *
   * Devuelve el programa nuevo, o `null` si no se pidió o no llegó.
   */
  const refrescosRef = useRef(new Map());

  const refrescarPrograma = useCallback(
    (clientId) => {
      if (!clientId) return Promise.resolve(null);
      const enCurso = refrescosRef.current.get(clientId);
      if (enCurso) return enCurso;

      const esperaAlgoQueNoEsSerie = () =>
        queue
          .pendientes()
          .some((p) => p.key.split(':')[1] === clientId && !p.key.startsWith(`set:${clientId}:`));
      if (esperaAlgoQueNoEsSerie()) return Promise.resolve(null);

      const peticion = (async () => {
        const { data, error } = await supabase
          .from('workout_data')
          .select('*')
          .eq('client_id', clientId)
          .maybeSingle();
        if (error || !data) return null;
        // Mientras llegaba se ha escrito algo que no se sabe poner encima.
        if (esperaAlgoQueNoEsSerie()) return null;

        rememberVersion('workout_data', clientId, data.updated_at);
        leidoEnRef.current.set(clientId, Date.now());
        const nuevo = conSeriesSinConfirmar(
          mapWorkoutFromDb(data),
          queue.pendientes(`set:${clientId}:`).map((p) => p.payload)
        );
        setWorkoutData({ ...workoutRef.current, [clientId]: nuevo });
        return nuevo;
      })()
        .catch(() => null)
        .finally(() => refrescosRef.current.delete(clientId));

      refrescosRef.current.set(clientId, peticion);
      return peticion;
    },
    [queue, rememberVersion, setWorkoutData, workoutRef]
  );

  /*
    Al volver a la aplicación, si hace más de cinco minutos. Solo el CLIENTE: el
    entrenador está editando el programa y lo que llegara pisaría lo que tiene
    delante (sus escrituras ya las protege la versión de `upsertClientRow`).
  */
  useEffect(() => {
    if (profileRole !== 'client') return undefined;
    const alVolver = () => {
      if (document.visibilityState !== 'visible' || !hayRed()) return;
      for (const clientId of Object.keys(workoutRef.current)) {
        if (Date.now() - (leidoEnRef.current.get(clientId) || 0) > PROGRAMA_VALE_MS) {
          refrescarPrograma(clientId);
        }
      }
    };
    document.addEventListener('visibilitychange', alVolver);
    return () => document.removeEventListener('visibilitychange', alVolver);
  }, [profileRole, refrescarPrograma, workoutRef]);

  // ── Mutaciones de rutina ─────────────────────────────────────────────────

  /**
   * Trae el programa completo de un cliente si todavía no está en memoria.
   *
   * ── Por qué hace falta y por qué es delicado ────────────────────────────────
   * Con el resumen (0024), al arrancar no se descarga el programa de nadie. Eso
   * está bien para pintar la cartera y mal para todo lo demás: en cuanto se abre
   * un cliente, o se copia el programa de otro, hacen falta los datos de verdad.
   *
   * Y no es solo que falten: `applyWorkout` cae en `emptyWorkoutData()` cuando no
   * encuentra al cliente, así que escribir sobre alguien sin cargar **sustituiría
   * su programa por uno vacío**. Por eso todo lo que escriba o lea el programa de
   * un cliente que no sea el abierto tiene que pasar por aquí primero.
   *
   * ── «Sin fila» también se recuerda ──────────────────────────────────────────
   * Antes, un cliente sin fila salía de aquí sin dejar entrada en el mapa, y eso
   * hacía que `undefined` significara dos cosas incompatibles: «todavía no lo he
   * pedido» y «lo pedí y no tiene nada». Nadie podía distinguirlas, y de las dos
   * solo una permite escribir sin riesgo.
   *
   * Ahora se guarda un programa vacío, así que la entrada existe siempre que se
   * haya mirado. `undefined` pasa a significar exactamente una cosa —«no
   * cargado»— y es lo que deja al efecto de abajo volver a intentarlo y a la
   * pantalla de rutina saber que aún no puede opinar.
   *
   * Un fallo de red NO se cachea: sin entrada, se reintenta.
   *
   * Devuelve el programa (vacío si ese cliente no tiene fila), o `null` si la
   * consulta falló.
   */
  /** Peticiones de programa en vuelo, por cliente. Ver el comentario de dentro. */
  const programLoadsRef = useRef(new Map());

  const ensureProgram = useCallback(
    async (clientId) => {
      if (!clientId) return null;
      if (workoutRef.current[clientId]) return workoutRef.current[clientId];

      /*
        Una petición por cliente, aunque la pidan dos a la vez.

        La piden dos: el efecto del cliente abierto y la propia pantalla de rutina,
        que ya no se fía de que alguien lo haya hecho por ella. Sin esto serían dos
        consultas idénticas en vuelo por cada apertura de ficha, y la segunda
        llegaría a `setWorkoutData` con lo mismo que la primera.
      */
      const enCurso = programLoadsRef.current.get(clientId);
      if (enCurso) return enCurso;

      const peticion = (async () => {
        const { data, error } = await supabase
          .from('workout_data')
          .select('*')
          .eq('client_id', clientId)
          .maybeSingle();

        // Un fallo NO deja entrada en el mapa: es lo que permite reintentarlo.
        if (error) return null;

        // La versión leída, para que la primera escritura no vaya sin guardia.
        if (data) rememberVersion('workout_data', clientId, data.updated_at);
        leidoEnRef.current.set(clientId, Date.now());

        const mapped = data ? mapWorkoutFromDb(data) : emptyWorkoutData();
        setWorkoutData({ ...workoutRef.current, [clientId]: mapped });
        return mapped;
      })()
        // No puede rechazar: quien espera esto lee `null` como «no se pudo».
        .catch(() => null)
        .finally(() => programLoadsRef.current.delete(clientId));

      programLoadsRef.current.set(clientId, peticion);
      return peticion;
    },
    [rememberVersion, setWorkoutData, workoutRef]
  );

  /*
    ══ LO QUE SE ESCRIBIÓ CON LA VERSIÓN DE ANTES, aplicado con la de ahora ══════

    Llega del reenvío de lo pendiente: un programa que la versión anterior no
    llegó a guardar —el entrenador siguió editando después del aviso de «Hay una
    versión nueva», o recargó con un guardado en camino—. Antes se descartaba al
    arrancar y se perdía.

    Se espera a que la carga termine: aplicarlo antes y que luego llegara el
    programa del servidor lo taparía en pantalla con el de antes del cambio, y
    el siguiente gesto del entrenador se haría sobre ese. Con el programa ya
    cargado:

      · Se pasa por los mapeadores y por `conRepartoDelAbierto`, que son las
        reglas de ESTA versión al leer y al escribir.
      · Se escribe con la guardia de la versión sobre la que se hizo (`base`). Si
        nadie ha escrito desde entonces, entra sin más. Si alguien sí, sale el
        aviso de conflicto de siempre —con su texto para este caso— y se decide
        ahí: quedarse con lo que hay o imponer lo suyo. Sin `base` conocida (una
        nota de antes de que la llevaran) se pregunta siempre (`SIN_BASE`).
  */
  useEffect(() => {
    if (loading || !session?.user?.id || porReaplicarRef.current.length === 0) return;
    const lista = porReaplicarRef.current.splice(0);
    (async () => {
      for (const { clientId, payload, base } of lista) {
        const cargado = await ensureProgram(clientId);
        if (!cargado) {
          // No se pudo leer: la nota sigue ahí y se intenta en el próximo arranque.
          continue;
        }
        reaplicadosRef.current.add(clientId);
        versionsRef.current.workout_data = {
          ...(versionsRef.current.workout_data || {}),
          [clientId]: base || SIN_BASE,
        };
        /* Una nota de una versión que no conocía los borradores (0133) no los
           trae: se quedan los que se acaban de leer, o el programa en memoria
           se quedaría sin ellos y el siguiente borrador pisaría los de la base. */
        const reaplicado = mapWorkoutFromDb(mapWorkoutToDb(clientId, payload));
        const programa = conRepartoDelAbierto(
          'draftBlocks' in reaplicado || !Array.isArray(cargado.draftBlocks)
            ? reaplicado
            : { ...reaplicado, draftBlocks: cargado.draftBlocks }
        );
        setWorkoutData({ ...workoutRef.current, [clientId]: programa });
        persist('workout', clientId, programa, { immediate: true });
      }
    })();
  }, [loading, session, ensureProgram, persist, setWorkoutData, workoutRef]);

  /**
   * Lo mismo para la DIETA: el plan de un cliente, traído si no está en memoria.
   *
   * ══ Por qué existe ══════════════════════════════════════════════════════════
   *
   * A diferencia del programa, la nutrición sí se pide entera en el arranque, así
   * que en la vida normal esto no hace ninguna consulta. Existe por el caso que
   * rompía la copia entre clientes: **el mapa de dietas puede quedarse vacío sin
   * que nada lo diga**. Si la consulta de `nutrition_plans` del arranque falla, se
   * apunta un aviso general y la aplicación sigue con `{}` — y a partir de ahí
   * `nutritionRef.current[quien]` es `undefined` para todo el mundo.
   *
   * Copiar de otro cliente leía ese mapa directamente, así que en esa situación la
   * dieta no se copiaba y no se decía por qué: el entrenamiento sí llegaba —ese
   * camino se relee solo con `ensureProgram`— y la dieta se quedaba en blanco.
   *
   * Devuelve el plan (vacío si ese cliente no tiene fila) o `null` si la consulta
   * falló, que es lo que permite distinguir «no tiene dieta» de «no se pudo leer».
   */
  const nutritionLoadsRef = useRef(new Map());

  const ensureNutrition = useCallback(
    async (clientId) => {
      if (!clientId) return null;
      if (nutritionRef.current[clientId]) return nutritionRef.current[clientId];

      const enCurso = nutritionLoadsRef.current.get(clientId);
      if (enCurso) return enCurso;

      const peticion = (async () => {
        const { data, error } = await supabase
          .from('nutrition_plans')
          .select('*')
          .eq('client_id', clientId)
          .maybeSingle();

        if (error) return null;

        // La versión leída, para que la primera escritura no vaya sin guardia.
        if (data) rememberVersion('nutrition_plans', clientId, data.updated_at);

        const mapped = data ? mapNutritionFromDb(data) : emptyNutrition();
        /*
          Solo se guarda en memoria lo que EXISTE. Cachear un plan vacío haría
          que el cliente pasara a «tiene dieta» para todo lo que pregunta por el
          mapa —empezando por el aviso de «esto sustituye su dieta actual»— sin
          que nadie le haya configurado nada.
        */
        if (data) setNutrition({ ...nutritionRef.current, [clientId]: mapped });
        return mapped;
      })()
        // No puede rechazar: quien espera esto lee `null` como «no se pudo».
        .catch(() => null)
        .finally(() => nutritionLoadsRef.current.delete(clientId));

      nutritionLoadsRef.current.set(clientId, peticion);
      return peticion;
    },
    [nutritionRef, rememberVersion, setNutrition]
  );

  /*
    El programa del cliente que se está mirando.

    Es la otra mitad de la carga perezosa: el arranque trae el resumen de todos y
    esto trae el detalle del que se abre. Con la carga completa no hace nada —ya
    está en memoria—, así que el efecto vale para los dos modos sin condicionales.

    Va aquí, justo detrás de `ensureProgram`, y no arriba con el resto del estado
    derivado: las dependencias de un efecto se evalúan al RENDERIZAR, así que
    nombrar una función declarada más abajo revienta con «Cannot access before
    initialization» antes de que el efecto llegue a ejecutarse nunca.
  */
  /*
    La condición mira el MAPA, no solo el cliente elegido. Con `[selectedClientId]`
    a secas esto corría una vez por cliente y nunca más, así que cualquier cosa que
    dejara el programa fuera de memoria —una recarga completa a mitad de sesión, un
    fallo de red en el primer intento— abría un hueco del que no se salía sin
    cambiar de cliente. Y un hueco aquí no es una pantalla vacía: es la puerta por
    la que se escribe un programa vacío encima del bueno.

    Depender de `workoutData` no lo hace correr en cada tecleo: la guardia lo
    convierte en nada en cuanto la entrada existe.
  */
  useEffect(() => {
    if (selectedClientId && !workoutData[selectedClientId]) ensureProgram(selectedClientId);
  }, [selectedClientId, workoutData, ensureProgram]);

  /* La rutina, sus sesiones y las copias entre clientes: el dominio más
     grande, en su gancho (useWorkout.js). Recibe las puertas del guardado
     (persist, persistSet, queue), los dos loaders y los estados espejados. */
  const {
    deshacerPlan,
    rehacerPlan,
    pasosDelPlan,
    updateExerciseSet,
    updateExerciseTarget,
    startSession,
    logSessionSet,
    updateSession,
    updateSessionMeta,
    closeSession,
    discardSession,
    logExerciseNote,
    updateMobilityDrills,
    removeSession,
    addExercise,

    addExercises,
    removeExercise,
    restoreExercise,
    addExerciseSetSlot,
    removeExerciseSetSlot,
    moveExercise,
    setExerciseSetCount,
    renameDay,
    setDayNote,
    setExerciseNote,
    setDayDrills,
    addDay,

    importDays,
    importRoutine,
    duplicateDay,
    moveDay,
    removeDay,
    restoreDay,
    ponerMicrocicloDelBloque,
    ponerReferenciasDelBloque,
    marcarExcepcionVista,
    cambiarFechaDeSesion,
    anadirBorradorDelBloque,
    cambiarBorradorDelBloque,
    quitarBorradorDelBloque,
    devolverBorradorDelBloque,
    empezarBorradorDelBloque,
    startProgram,
    appendMicrocycle,
    appendMicrocycleWithDays,
    startBlock,
    renameBlock,
    setBlockTraits,
    deleteBlock,
    logBlockChange,
    migratePlanToBlock,
    startBlockWithPlan,
    setBlockPlan,
    addBlockSheet,
    duplicateBlockSheet,
    removeBlockSheet,
    renameBlockSheet,
    renameBlockExercise,
    renamePlanExercise,
    moveBlockSheet,
    addBlockExercise,
    setBlockSheetExercises,
    removeBlockExercise,
    restoreBlockExercise,
    moveBlockExercise,
    setBlockExerciseSets,
    setBlockExerciseTarget,
    setBlockExerciseScheme,
    setBlockExerciseGrammar,
    updatePlanExercise,
    updatePlanExercises,
    removePlanExercise,
    overridePlanExercise,
    removePlanExerciseOnly,
    addPlanExercise,
    addOverride,
    setOverrideSpan,
    dropOverride,
    promoteOverride,
    removeMicrocycle,
    restoreMicrocycle,
    cloneMicrocycle,
    setMicrocycleDate,
    continueProgram,
    copyDayToClient,
    copyMicrocycleToClient,
    copyProgramToClient,
    replicateClient,
  } = useWorkout({
    workoutRef,
    setWorkoutData,
    clientsRef,
    setClients,
    nutritionRef,
    setNutrition,
    persist,
    persistSet,
    persistExerciseNote,
    persistContinue,
    queue,
    ensureProgram,
    ensureNutrition,
    profileRole,
  });

  // ── Nutrición ────────────────────────────────────────────────────────────

  /* En su gancho (useNutrition.js), con la frontera de useClients.js: recibe
     persist y el estado espejado del bloque. patchFood se destructura porque
     editFood —el puente con la biblioteca— lo necesita aquí abajo. */
  const {
    updateNutrition,
    updateNutritionTargets,
    addDietDay,
    addDietDayWithMeals,
    replaceDiet,
    duplicateDietDay,
    renameDietDay,
    moveDietDay,
    removeDietDay,
    setDietCycleSlot,
    repartirPorElEntreno,
    applyRescaledMeals,
    copyVariantMeals,
    copyMealToVariant,
    importDiet,
    addMeal,
    appendMeal,
    removeMeal,
    removeMealsById,
    restoreMeal,
    updateMealName,
    updateMealNote,
    updateMealTarget,
    toggleMealFijo,
    addMealOption,
    setMealOptions,
    renameMealOption,
    removeMealOption,
    moveMeal,
    moveFood,
    duplicateOption,
    duplicateMeal,
    addFoodToOption,
    addFoodsToOption,
    removeFoodFromOption,
    restoreFoodInOption,
    patchFood,
    updateFoodGrams,
    swapFood,
    setFoodEquivalences,
    setFoodDisplay,
    setFoodFixed,
  } = useNutrition({ nutritionRef, setNutrition, persist });

  // ── Antropometría ────────────────────────────────────────────────────────

  /* En su gancho (`useAnthropometry.js`), con la frontera de `useClients.js`:
     recibe `persist` y el estado espejado, que sigue siendo del proveedor. */
  const {
    addAnthropometryLog,
    removeAnthropometryLog,
    updateAnthropometryLog,
    apuntarMedida,
  } = useAnthropometry({
    anthroRef,
    setAnthropometry,
    persist,
  });

  // ── Bibliotecas del coach ────────────────────────────────────────────────
  //
  // Viven en useLibraries.js. Aquí queda solo editFood, el puente que escribe a
  // la vez en la dieta abierta (patchFood) y en la biblioteca.

  /**
   * Corrige un alimento —sus macros por 100 g y su unidad— desde la dieta.
   *
   * ── Escribe en DOS sitios, y es deliberado ──────────────────────────────────
   *   1. **La entrada abierta**, para que el cambio se vea al instante. Y no es
   *      solo por la espera: una entrada de dieta es una FOTO del alimento (ver
   *      `buildFoodEntry`) y NO se recalcula sola cuando cambia la biblioteca,
   *      así que sin esto corregir un macro no movería ni una kcal de la comida
   *      que se está mirando.
   *   2. **La biblioteca**, para que la próxima vez que se añada ese alimento a
   *      cualquier dieta venga ya corregido.
   *
   * Sin (2) habría que repetir la corrección en cada dieta, que es justo el
   * trabajo manual que esto viene a quitar. Sin (1) el entrenador corregiría y
   * no pasaría nada visible, que parece que no ha funcionado.
   *
   * Antes era `defineFoodUnit` y solo sabía de unidades. Los macros no tenían
   * NINGÚN camino de vuelta: se tecleaban una vez, al dar de alta el alimento, y
   * quedaban congelados en la biblioteca del equipo — un «135» donde iban
   * «13,5» multiplicaba por diez las kcal de esa comida para siempre.
   *
   * ── `showAs` solo se toca cuando cambia lo que representa ───────────────────
   * Al DEFINIR una unidad que no había, se pasa a contar en unidades, que es lo
   * que se acaba de pedir; al quitarla, a gramos por narices. Corregir un macro
   * de un alimento que ya tenía unidad no le cambia la lente al entrenador: esa
   * es su elección por alimento y por dieta (ver `setFoodDisplay`).
   *
   * Va DESPUÉS de `upsertLibraryFood` en el archivo a propósito: las dependencias
   * de un `useCallback` se evalúan al renderizar, así que declararlo antes daría
   * «Cannot access before initialization» al montar la aplicación.
   */
  const editFood = useCallback(
    async (clientId, variant, mealIdx, optIdx, food, cambios) => {
      patchFood(clientId, variant, mealIdx, optIdx, food.id, (actual) => ({
        ...cambios,
        showAs: !cambios.unitGrams ? 'grams' : actual.unitGrams ? actual.showAs : 'units',
      }));

      // La biblioteca se actualiza por nombre (`upsertByName`), así que el nombre
      // lo pone la entrada y lo demás son los campos ya corregidos.
      return upsertLibraryFood({ name: food.name, ...cambios });
    },
    [patchFood, upsertLibraryFood]
  );

  // ── Clientes ─────────────────────────────────────────────────────────────

  /* Las acciones de la cartera, en su gancho (useClients.js). El estado
     clients se queda en el proveedor —medio arranque cuelga de él— y el
     gancho recibe las dos puertas de la infraestructura de guardado:
     persist (la cola) y upsertClientRow (escritura directa con control de
     concurrencia). */
  const {
    updateClient,
    markClientPaid,
    normalizeLegacySessions,
    setClientArchived,
    setClientPaused,
    updateClientPreferences,
    saveClientProfile,
    saveClientIdentity,
    saveClientException,
    applyProtocolToClient,
    publishUpdate,
    createInvite,
    revokeInvite,
    reissueAccess,
    loadCalendarFeed,
    createCalendarFeed,
    revokeCalendarFeed,
    addClient,
    exportClientData,
    loadAuditLog,
    exportAllData,
    deleteClientCompletely,
    reloadClients,
    applyDashboardToAll,
  } = useClients({
    session,
    team,
    clientsRef,
    setClients,
    setSelectedClientId,
    workoutRef,
    setWorkoutData,
    setProgressPhotos,
    persist,
    upsertClientRow,
    refreshPlan,
    /* Para sembrar la plantilla del entrenador en el cliente que se acaba de dar
       de alta: sin esto nacía con el protocolo de serie y aparecía como atrasado
       en Ajustes → Protocolo el mismo día que lo creaste. */
    coachPrefs,
  });

  /* Integraciones (Notion, Stripe): sin estado propio, extraídas con la
     convención de useRoadmap.js. */
  const {
    loadIntegration,
    saveIntegration,
    setIntegrationToken,
    runIntegration,
    createClientFromExternal,
    setWebhookSecret,
    runStripe,
    linkExternalName,
    driveAuthorize,
    runDrive,
    loadClientFolder,
    setClientFolder,
    driveFiles,
    driveUpload,
  } = useIntegrations({ session, team, addClient });

  /* Revisiones y calendario: dos dominios sin estado propio, extraídos con la
     convención de `useRoadmap.js`. */
  const {
    uploadReview,
    listReviews,
    createReviewLink,
    createReviewUrl,
    markReviewViewed,
    listReviewLinks,
    revokeReviewLink,
    deleteReview,
  } = useReviews({ isCoachRef });

  const { loadEvents, addClientEvent, setEventDone, removeClientEvent } = useCalendar({
    session,
  });

  /*
    Lo que le pasa a un cliente sin que tú lo mandes (0116), en su gancho.

    Se monta AQUÍ y no arriba con los demás, y el orden no es estético: necesita
    `addClientEvent` —una casilla tuya cae en la agenda— y `setEnvioRows` —lo que
    materializa tiene que aparecer en la bandeja sin recargar—. Los dos viven en
    ganchos que se montan antes, así que éste va detrás.
  */
  const {
    automatizaciones,
    automatizacionesReady,
    corridas,
    guardarAutomatizacion,
    quitarAutomatizacion,
    correrAutomatizaciones,
  } = useAutomatizaciones({
    session,
    clients,
    coachPrefs,
    addClientEvent,
    onFilaNueva: (fila) => setEnvioRows((prev) => [fila, ...prev]),
  });

  // ── Equipo ───────────────────────────────────────────────────────────────
  //
  // Las acciones del equipo viven en su gancho (useTeam.js). Aquí queda solo
  // assignClient, que es un delegado de updateClient — dominio de clientes.

  /** Cambia el entrenador responsable de un cliente. */
  const assignClient = useCallback(
    (clientId, profileId) => updateClient(clientId, { assignedTo: profileId || null }),
    [updateClient]
  );

  // ── Vista activa ─────────────────────────────────────────────────────────

  const isCoach = profileRole === 'coach';
  const effectiveView = isCoach ? viewMode : 'client';

  /** Entrar en el portal de tu cliente por una pantalla concreta. */
  const openClientView = useCallback((path) => {
    viewTargetRef.current = path || null;
    setViewMode('client');
  }, []);

  /** El destino pedido, y se olvida: solo vale para el salto que lo pidió. */
  const takeViewTarget = useCallback(() => {
    const pedido = viewTargetRef.current;
    viewTargetRef.current = null;
    return pedido;
  }, []);

  /* ==========================================================================
     Tres contextos, y no uno
     --------------------------------------------------------------------------
     Todo esto vivía en un solo objeto con ciento cincuenta y cuatro claves, y
     ese objeto se rehacía en cuanto cambiaba cualquiera de sus dependencias:
     `workoutData`, `nutrition`, `clients`, `saveState`… Como los cuarenta y
     cuatro componentes que llaman a `useApp()` leían de ahí, escribir UN CARÁCTER
     en un campo de kilos volvía a pintar la aplicación entera —incluidos el menú
     de cuenta, el panel de integraciones y el de soporte, que no leen ni uno de
     los datos que habían cambiado—.

     No hay ningún `React.memo` en el proyecto que cortara esa propagación, y
     ponerlos habría sido tratar el síntoma: el problema no es que los
     componentes se pinten de más, es que estaban SUSCRITOS a más de lo que
     leen.

     Se parte por FRECUENCIA DE CAMBIO, que es lo que determina a quién arrastra
     cada cosa:

       · SESIÓN   — quién eres y qué puedes. Cambia al entrar y poco más.
       · DATOS    — la cartera y sus bloques. Cambia con cada escritura.
       · ACCIONES — las ciento veinte funciones. NO CAMBIA NUNCA (ver abajo).

     `useApp()` se conserva y sigue devolviendo las tres cosas juntas, así que no
     hay que tocar ni un componente para que esto entre. Lo que se gana está en
     los que se pasen a los ganchos estrechos: un componente que solo llame a
     `useActions()` deja de repintarse cuando alguien teclea un peso.
     ========================================================================== */

  /** Quién eres y qué puedes. */
  const sessionValue = useMemo(
    () => ({
      session,
      loading,
      loadError,
      conflict,
      profileRole,
      profileName,
      isCoach,
      view: effectiveView,
      team,
      teamMembers,
      plan,
      hasTeams: Boolean(team),
      myTeamRole: team?.myRole || null,
      isSupport,
      coachPrefs,
      coachPrefsReady,
    }),
    [
      session, loading, loadError, conflict, profileRole, profileName, isCoach, effectiveView,
      team, teamMembers, plan, isSupport, coachPrefs, coachPrefsReady,
    ]
  );

  /**
   * La cartera y sus bloques.
   *
   * `saveStatus` va aquí y no con las acciones aunque sea una función: no hace
   * nada, LEE `saveState` y se llama durante el render para pintar el indicador.
   * Detrás de la fachada estable de las acciones, un componente no se enteraría
   * de que un guardado ha fallado — que es justo lo que la cola existe para
   * evitar.
   */
  const dataValue = useMemo(
    () => ({
      clients: visibleClients,
      allClients: clients,
      archivedClients,
      activeClient,
      selectedClientId,
      workoutData,
      /* Cuántos pasos tiene la pila de deshacer de cada cliente, `{ atras,
         adelante }`. Es dato y no acción porque la pantalla enseña el mando
         SOLO cuando hay algo que deshacer: detrás de la fachada estable no se
         enteraría de que la pila ha cambiado. Ver `useWorkout`. */
      pasosDelPlan,
      training,
      legacyPending,
      anthropometry,
      nutrition,
      progressPhotos,
      exerciseLibrary,
      foodLibrary,
      /* El cajón: bloques, días y platos guardados con nombre (`domain/cajon`).
         Va aquí y no con la sesión porque cambia con cada guardado, que es lo
         que distingue este contexto del otro. */
      cajon,
      hayCajon,
      /* La ficha por nombre, para quien entrena. No es una lista más: es la
         función que pregunta el renglón del ejercicio para saber si pinta
         marca. Ver `useExerciseSheets`. */
      sheetOf,
      /* Los grupos que le LLEGAN a esta persona, de solo lectura. El entrenador
         montando lee los suyos de `coachPrefs`, que es donde los escribe; esto
         es la otra mitad, la misma que distingue `exerciseLibrary` de
         `sheetOf`. Ver `useEquivGroups`. */
      gruposEquiv,
      catalogFoods,
      catalogExercises,
      checkIns,
      checkInsActivos,
      phases,
      /* Los eventos a los que apunta su plan (0122). Ver `useRoadmap`. */
      anchors,
      /* Los hechos del plan y la pauta fechada (0123, 0124). Ver `useRoadmap`. */
      hechos,
      dietVersions,
      conditions,
      equipment,
      equipmentCounts,
      envioRows,
      enviosReady,
      automatizaciones,
      automatizacionesReady,
      corridas,
      saveStatus,
      /* Cuántos guardados esperan a que vuelva la red, cuántos ha rechazado el
         servidor, y de cuándo son los datos que se están mirando (`null` si
         vienen del servidor). Los tres los pinta `ui/EstadoDeRed`. Ver
         `lib/instantanea`. */
      enEspera,
      fallosAlGuardar,
      /* Las series que el servidor rechazó, con su payload. Ver `lib/seriesNoGuardadas`. */
      seriesNoGuardadas,
      copiaLocal,
    }),
    [
      visibleClients, clients, archivedClients, activeClient, selectedClientId,
      workoutData, pasosDelPlan, training, legacyPending, anthropometry, nutrition, progressPhotos,
      exerciseLibrary, foodLibrary, cajon, hayCajon, sheetOf, gruposEquiv, catalogFoods, catalogExercises, checkIns, checkInsActivos,
      phases, anchors, hechos, dietVersions, conditions, equipment, equipmentCounts, envioRows, enviosReady,
      automatizaciones, automatizacionesReady, corridas,
      saveStatus, enEspera, fallosAlGuardar, copiaLocal, seriesNoGuardadas,
    ]
  );

  /*
    ══ Las acciones, con identidad fija ═══════════════════════════════════════

    El espejo se reescribe en cada render, así que siempre apunta a la versión
    recién creada de cada `useCallback`. Lo que se reparte por el contexto es una
    FACHADA construida una sola vez: cada nombre es una función estable que
    reenvía al espejo.

    Dos consecuencias, las dos buenas:

      · El objeto de acciones nunca cambia de identidad, así que un componente
        que solo consuma acciones no vuelve a pintarse por culpa de un dato.
      · Desaparecen los cierres rancios. Una acción guardada en un `useEffect` al
        montar llamaba a la versión de entonces; ahora siempre entra por el
        espejo y ejecuta la de ahora.

    Y un efecto que conviene entender antes de tocar nada: los `useEffect` que
    llevaban una acción en su lista de dependencias dejan de dispararse cuando
    esa acción se recrea. Es lo correcto —esas recreaciones eran ruido, no una
    señal de que hubiera que volver a pedir nada— pero si algún día un efecto
    depende de eso, el problema es el efecto.
  */
  const actionsRef = useRef(null);
  actionsRef.current = {
    // Sesión
    resolveConflict,
    signOut,
    updateProfileName,
    setViewMode,
    openClientView,
    takeViewTarget,
    setSelectedClientId,

    // Estado de guardado
    retrySave,
    /* El reintento global de la franja, para cuando el fallo no es de la
       pantalla que se está mirando. Ver `fallosAlGuardar`. */
    reintentarLoFallido,
    /* Las series que el teléfono de un cliente no pudo guardar (0132). Las lee
       su Revisión: ver `review/useSeriesNoGuardadas`. */
    leerSeriesNoGuardadas,

    // Rutina
    /* Deshacer y rehacer el PLAN de la rutina. Ver el bloque «DESHACER Y
       REHACER EL PLAN» en `useWorkout`, y la ley en `domain/deshacer`. */
    deshacerPlan,
    rehacerPlan,
    updateExerciseSet,
    updateExerciseTarget,
    addExercise,
    addExercises,
    removeExercise,
    restoreExercise,
    addExerciseSetSlot,
    removeExerciseSetSlot,
    moveExercise,
    setExerciseSetCount,
    setExerciseNote,
    addDay,
    importDays,
    importRoutine,
    renameDay,
    setDayNote,
    setDayDrills,
    duplicateDay,
    moveDay,
    removeDay,
    restoreDay,
    ponerMicrocicloDelBloque,
    ponerReferenciasDelBloque,
    marcarExcepcionVista,
    cambiarFechaDeSesion,
    anadirBorradorDelBloque,
    cambiarBorradorDelBloque,
    quitarBorradorDelBloque,
    devolverBorradorDelBloque,
    empezarBorradorDelBloque,
    startSession,
    logSessionSet,
    updateSession,
    updateSessionMeta,
    closeSession,
    discardSession,
    logExerciseNote,
    updateMobilityDrills,
    removeSession,
    startProgram,
    appendMicrocycle,
    appendMicrocycleWithDays,
    startBlock,
    renameBlock,
    setBlockTraits,
    deleteBlock,
    logBlockChange,
    migratePlanToBlock,
    startBlockWithPlan,
    setBlockPlan,
    addBlockSheet,
    duplicateBlockSheet,
    removeBlockSheet,
    renameBlockSheet,
    renameBlockExercise,
    renamePlanExercise,
    moveBlockSheet,
    addBlockExercise,
    setBlockSheetExercises,
    removeBlockExercise,
    restoreBlockExercise,
    moveBlockExercise,
    setBlockExerciseSets,
    setBlockExerciseTarget,
    setBlockExerciseScheme,
    setBlockExerciseGrammar,
    updatePlanExercise,
    updatePlanExercises,
    removePlanExercise,
    overridePlanExercise,
    removePlanExerciseOnly,
    addPlanExercise,
    addOverride,
    setOverrideSpan,
    dropOverride,
    promoteOverride,
    cloneMicrocycle,
    continueProgram,
    removeMicrocycle,
    restoreMicrocycle,
    setMicrocycleDate,
    copyDayToClient,
    copyMicrocycleToClient,
    copyProgramToClient,
    replicateClient,
    ensureProgram,
    /* Se le pasaba a `useWorkout` y se quedó fuera de aquí, así que la pantalla
       de nutrición lo pedía y recibía `undefined`: al importar una dieta, el
       `await` reventaba dentro de un `async` y no se guardaba nada. */
    ensureNutrition,

    // Nutrición
    updateNutrition,
    updateNutritionTargets,
    addDietDay,
    addDietDayWithMeals,
    replaceDiet,
    duplicateDietDay,
    renameDietDay,
    moveDietDay,
    removeDietDay,
    setDietCycleSlot,
    repartirPorElEntreno,
    addMeal,
    appendMeal,
    removeMeal,
    removeMealsById,
    restoreMeal,
    updateMealName,
    updateMealNote,
    updateMealTarget,
    toggleMealFijo,
    applyRescaledMeals,
    copyVariantMeals,
    copyMealToVariant,
    importDiet,
    moveMeal,
    moveFood,
    duplicateOption,
    duplicateMeal,
    addMealOption,
    setMealOptions,
    renameMealOption,
    removeMealOption,
    addFoodToOption,
    addFoodsToOption,
    removeFoodFromOption,
    restoreFoodInOption,
    updateFoodGrams,
    swapFood,
    setFoodEquivalences,
    setFoodDisplay,
    setFoodFixed,
    editFood,

    // Antropometría
    addAnthropometryLog,
    removeAnthropometryLog,
    updateAnthropometryLog,
    apuntarMedida,

    // Bibliotecas
    upsertLibraryExercise,
    saveExerciseSheet,
    upsertLibraryFood,
    saveFoodSheet,
    editLibraryExercise,
    editLibraryFood,
    deleteLibraryFood,
    deleteLibraryExercise,

    // Fotos
    uploadProgressPhoto,
    deleteProgressPhoto,
    updateProgressPhoto,
    declararLadoAntiguo,
    refreshPhotoUrls,
    ensurePhotoUrls,

    // Clientes
    addClient,
    updateClient,
    markClientPaid,
    setClientArchived,
    setClientPaused,
    updateClientPreferences,

    saveClientProfile,
    saveClientIdentity,
    saveClientException,
    applyProtocolToClient,
    exportClientData,
    exportAllData,
    normalizeLegacySessions,
    loadAuditLog,
    deleteClientCompletely,

    // Preferencias del entrenador
    updateCoachPreferences,
    applyDashboardToAll,

    // El cajón: guardar con nombre, renombrar y tirar (0112, `domain/cajon`)
    guardarEnCajon,
    renombrarEnCajon,
    borrarDelCajon,
    cabeEnCajon,

    // Lo mandado: acciones sueltas sobre personas concretas (0105)
    reloadEnvios,
    mandarAccion,
    dejarDePedir,
    quitarPedido,
    marcarAccion,
    marcarVisto,

    // Y lo que sale solo: las automatizaciones del protocolo (0116)
    guardarAutomatizacion,
    quitarAutomatizacion,
    correrAutomatizaciones,

    // Soporte
    loadTickets,
    createTicket,
    replyTicket,
    setTicketStatus,
    uploadIntakeFile,
    signPaths,

    // Integraciones
    reloadClients,
    createInvite,
    revokeInvite,
    // La salida de emergencia cuando el cliente pierde su cuenta (0083).
    reissueAccess,
    // El calendario suscribible del cliente (0071). Las llama él, no el entrenador.
    loadCalendarFeed,
    createCalendarFeed,
    revokeCalendarFeed,
    loadIntegration,
    saveIntegration,
    setIntegrationToken,
    runIntegration,
    runStripe,
    setWebhookSecret,
    linkExternalName,
    createClientFromExternal,
    /* Drive. `loadClientFolder`, `driveFiles` y `driveUpload` las llama también
       el CLIENTE desde su portal: son las únicas de este bloque que no son del
       entrenador (ver la cabecera de `useIntegrations.js`). */
    driveAuthorize,
    runDrive,
    loadClientFolder,
    setClientFolder,
    driveFiles,
    driveUpload,

    // Revisiones
    uploadReview,
    listReviews,
    deleteReview,
    createReviewLink,
    createReviewUrl,
    markReviewViewed,
    publishUpdate,
    listReviewLinks,
    revokeReviewLink,

    // Check-ins y calendario
    reviewCheckIn,
    unreviewCheckIn,
    updateCheckInNotes,
    filaDeRevision,
    reabrirRevision,
    submitCheckIn,
    saveCheckInAnswers,
    loadCheckInHistory,
    deleteCheckIn,
    loadEvents,
    addClientEvent,
    setEventDone,
    removeClientEvent,

    // Roadmap
    addPhase,
    updatePhase,
    removePhase,
    setPhaseFork,
    chooseFork,
    saveAnchor,
    removeAnchor,
    shiftFuturePhases,
    igualar,
    quitarReplanteo,

    // Condicionantes
    /* La lectura en bloque, para la pantalla que reparte: ver `useConditions`. */
    conditionsOfMany,
    addCondition,
    updateCondition,
    resolveCondition,
    removeCondition,

    // Maquinaria del gimnasio
    addEquipment,
    setEquipmentGroup,
    removeEquipment,

    // Equipo y plan
    refreshPlan,
    inviteTeamMember,
    updateTeamMemberRole,
    removeTeamMember,
    assignClient,
    renameTeam,
  };

  /* La fachada. Lista vacía de dependencias a propósito: es lo que la hace
     estable, y el conjunto de nombres no cambia en tiempo de ejecución. */
  const actionsValue = useMemo(() => {
    const estable = {};
    for (const nombre of Object.keys(actionsRef.current)) {
      estable[nombre] = (...args) => actionsRef.current[nombre](...args);
    }
    return Object.freeze(estable);
  }, []);

  return (
    <SessionContext.Provider value={sessionValue}>
      <ActionsContext.Provider value={actionsValue}>
        <DataContext.Provider value={dataValue}>{children}</DataContext.Provider>
      </ActionsContext.Provider>
    </SessionContext.Provider>
  );
};

/* Los traductores de errores de Postgres viven con sus dominios: el de las
   fases en useRoadmap.js y el del alta en useClients.js. */

/* ==========================================================================
   Los ganchos
   --------------------------------------------------------------------------
   Cuatro, y el orden de esta lista es el de preferencia: cuanto más estrecho es
   lo que se pide, menos veces se repinta quien lo pide.

   `useApp()` sigue existiendo y sigue devolviéndolo todo junto, así que ningún
   componente tuvo que cambiar para que el corte entrara. Pero es el más ancho
   de los cuatro: quien lo usa se suscribe a los tres contextos y se repinta con
   cualquier escritura, aunque solo lea una función. Al tocar un componente,
   merece la pena bajarlo al gancho que de verdad necesita.
   ========================================================================== */

const dentroDelProveedor = (ctx, nombre) => {
  if (!ctx) throw new Error(`${nombre} debe usarse dentro de <AppProvider>.`);
  return ctx;
};

/**
 * Las acciones. **El más barato de los cuatro**: su objeto no cambia nunca, así
 * que un componente que solo llame a esto no se repinta jamás por un dato.
 */
export const useActions = () => dentroDelProveedor(useContext(ActionsContext), 'useActions');

/** Quién eres y qué puedes. Cambia al entrar y poco más. */
export const useSession = () => dentroDelProveedor(useContext(SessionContext), 'useSession');

/** La cartera y sus bloques. Cambia con cada escritura, que es lo que se pinta. */
export const useData = () => dentroDelProveedor(useContext(DataContext), 'useData');

/**
 * Todo junto, como antes.
 *
 * Se conserva para no tener que reescribir cuarenta y cuatro componentes de
 * golpe, y porque hay pantallas —el editor de rutina, la analítica— que de
 * verdad leen de los tres. Para las que no, están los tres de arriba.
 */
export const useApp = () => {
  const session = useSession();
  const data = useData();
  const actions = useActions();
  return useMemo(() => ({ ...session, ...data, ...actions }), [session, data, actions]);
};
