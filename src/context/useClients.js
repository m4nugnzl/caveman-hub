import { useCallback, useRef } from 'react';

import { supabase } from '@/lib/supabaseClient';
import { mapClientFromDb, mapClientToDb, mapWorkoutToDb } from '@/lib/mappers';
import { today } from '@/domain/training';
import { normalizeMicrocycles } from '@/domain/sessions';
import { nextPaymentAfter } from '@/domain/billing';
import { stampUpdate } from '@/domain/updates';
import { bucket, track } from '@/lib/analytics';
import { recordIssue } from '@/lib/diagnostics';
import { newClientPreferences } from '@/lib/protocolTemplate';
import { BUCKET } from '@/context/media';

/*
  ══ La cartera de clientes, fuera de AppContext ══════════════════════════════

  Con la convención de `useRoadmap.js`, y con la frontera que define a este
  dominio: NO posee la infraestructura de guardado — recibe sus dos puertas,
  `persist` (la cola, para escrituras que se repiten) y `upsertClientRow` (la
  escritura directa con control de concurrencia, para la migración de datos) —
  ni el estado `clients`, que es del proveedor porque medio arranque y media
  aplicación cuelgan de él. Este gancho es las ACCIONES de la cartera; el
  estado sigue donde estaba.
*/

/** Códigos de Postgres que aparecen al escribir una ficha. */
const PG = {
  RLS: '42501', // insufficient_privilege — una política ha rechazado la fila
};

/**
 * Por qué ha fallado un alta de cliente.
 *
 * El caso de RLS aquí tiene una causa concreta y una sola: la política
 * `clients_team_insert` (0006) exige que quien inserta sea `owner`, `admin` o
 * `trainer` DE SU EQUIPO. Si el rechazo llega es que el equipo no está resuelto
 * o el rol es `viewer` — el `team_id` en blanco no puede ser, porque el trigger
 * de la 0019 lo rellena antes de que la política mire la fila.
 *
 * Decirlo así convierte un callejón sin salida en algo que se puede comprobar.
 *
 * Todo lo demás llega ya escrito para leerse: los `RAISE EXCEPTION` de
 * `create_client` (0032) nombran el rol y el equipo, y los del trigger del plan
 * (0019) dan el número de clientes y el nombre del plan. Reescribirlos aquí
 * sería perder justamente lo que los hace útiles.
 */
const explicarErrorDeAlta = (error) => {
  if (error?.code === PG.RLS) {
    return 'Tu cuenta no tiene permiso para dar de alta clientes en este equipo. Aplica la migración 0032 para que el error diga exactamente cuál es tu rol.';
  }
  return error?.message || 'No se ha podido dar de alta al cliente.';
};

export const useClients = ({
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
  coachPrefs,
}) => {
  /*
    Las plantillas del entrenador, en una referencia.

    Solo las usa el alta, y como VALOR entrarían en las dependencias de
    `addClient` —y con él las de `createClientFromExternal`, que lo recibe—, así
    que guardar una pregunta del check-in recrearía media cadena de acciones. Es
    el mismo recurso que `isCoachRef` en el proveedor: el valor de AHORA sin
    entrar en las dependencias.
  */
  const coachPrefsRef = useRef(coachPrefs);
  coachPrefsRef.current = coachPrefs;
  /**
   * Parches de cliente pendientes de enviar, acumulados por cliente.
   *
   * La cola de guardado retiene SOLO el último payload por clave (que es
   * justamente lo que evita que una respuesta antigua pise una nueva). Con
   * bloques completos —rutina, nutrición— eso es correcto, porque cada payload
   * es el estado entero. Pero `updateClient` envía un PARCHE de campos: si el
   * coach cambia el tipo de ciclo y acto seguido el número de días, el segundo
   * parche sustituye al primero dentro de la ventana de debounce y el cambio de
   * tipo de ciclo nunca llega a la base de datos (se ve en pantalla hasta que
   * recargas).
   *
   * Acumular los parches lo resuelve: siempre se envía la unión de todos los
   * campos tocados, cada uno con su valor más reciente.
   */
  const clientPatchRef = useRef({});

  const updateClient = useCallback(
    (clientId, fields, { immediate = true } = {}) => {
      setClients(clientsRef.current.map((c) => (c.id === clientId ? { ...c, ...fields } : c)));

      const merged = { ...(clientPatchRef.current[clientId] || {}), ...fields };
      clientPatchRef.current[clientId] = merged;
      persist('client', clientId, merged, { immediate });
    },
    [clientsRef, persist, setClients]
  );

  /**
   * Apunta el cobro en el libro (`client_payments`, migración 0072).
   *
   * ══ Por qué la ficha no basta ═══════════════════════════════════════════════
   *
   * Porque `payment_status` y `next_payment_date` describen el cobro QUE VIENE, y
   * marcar uno los sobrescribe. Al mes siguiente no queda ni rastro de que en
   * marzo entraron 1.240 €: la ficha sabe el estado de hoy y nada más. Un libro
   * de cobros que solo tiene la última página no es un libro.
   *
   * La tabla existía desde la 0010 pero solo la escribían Notion y Stripe, así
   * que el histórico se estaba generando únicamente para quien tuviera una
   * integración puesta — que no es el caso normal. La 0072 abre la puerta a este
   * apunte y `source: 'manual'` deja dicho de dónde salió, que es lo que permite
   * a la pantalla de Ingresos distinguir contabilidad de memoria.
   *
   * ── Por qué no tumba el gesto si falla ──────────────────────────────────────
   * Porque las dos escrituras no son igual de graves. La de la ficha es lo que el
   * entrenador acaba de decidir y lo que la cartera necesita para dejar de
   * reclamar; el apunte es el registro. Revertir la primera porque falló el
   * segundo dejaría a la cartera pidiendo un cobro que ya entró, que es el
   * problema peor.
   *
   * Y no se pierde en silencio: toda respuesta de error de Supabase pasa por el
   * interceptor de `lib/supabaseClient.js`, que la registra con su código de
   * Postgres. Aquí solo se devuelve el resultado para que el «Deshacer» sepa si
   * hay fila que borrar.
   */
  const apuntarCobro = useCallback(async (client) => {
    const { data, error } = await supabase
      .from('client_payments')
      .insert({
        client_id: client.id,
        source: 'manual',
        /*
          `paid_on` es HOY y no la fecha de vencimiento: lo que se sabe es cuándo
          lo ha dado por cobrado el entrenador. Usar la de vencimiento colocaría
          en julio un cobro que entró en agosto para que las cuentas «cuadraran»,
          y eso es maquillar el histórico.

          `period_end` sí es la de vencimiento: es el ciclo que este cobro cierra.
        */
        paid_on: today(),
        period_end: client.nextPaymentDate ?? null,
        /* La tarifa anotada, tal cual. Si no la hay, la fila se guarda sin
           importe: consta que cobró, y cuánto no se sabe. Poner un cero diría que
           cobró cero. */
        amount: client.feeAmount ?? null,
        is_paid: true,
        status: 'paid',
      })
      .select('id')
      .single();

    return error ? { ok: false, error } : { ok: true, id: data.id };
  }, []);

  /**
   * Marca un cobro como hecho, adelanta el ciclo y lo apunta en el libro.
   *
   * ══ Por qué es una acción y no tres escrituras sueltas ══════════════════════
   *
   * Marcar «pagado» sin mover la fecha deja la ficha mintiendo al día siguiente:
   * el cobro consta cobrado y la fecha sigue siendo la del que ya entró, así que
   * la cartera vuelve a reclamarlo. Son escrituras que solo tienen sentido
   * juntas, y estaban repartidas entre la bandeja de «Hoy» y la ficha — dos
   * sitios donde acordarse de las demás.
   *
   * Sin periodicidad anotada solo cambia el estado, que es lo único que se puede
   * saber: adivinar un mes por defecto pondría una fecha inventada en la ficha de
   * alguien que cobra por trimestres.
   *
   * ── Por qué devuelve `undo` y ya no `prev` a secas ──────────────────────────
   * Porque volver atrás dejó de ser un `updateClient` con dos campos: hay que
   * deshacer también el apunte, o el histórico acumula cobros que el entrenador
   * acaba de decir que no habían pasado. Devolver los campos y confiar en que
   * cada pantalla se acuerde del resto es exactamente el reparto que esta acción
   * vino a eliminar. `prev` sigue ahí porque describe el estado anterior y hay
   * quien lo lee, pero el inverso completo es `undo`.
   */
  const markClientPaid = useCallback(
    (clientId) => {
      const client = clientsRef.current.find((c) => c.id === clientId);
      if (!client) return { ok: false, error: 'Ese cliente ya no está en la cartera.' };

      const siguiente = nextPaymentAfter(client.nextPaymentDate, client.billingPeriod);

      /* Lo que había ANTES: marcar cobrado es un toque sin confirmación, y su
         pareja honesta es poder volver atrás. */
      const prev = {
        paymentStatus: client.paymentStatus ?? 'pending',
        ...(siguiente ? { nextPaymentDate: client.nextPaymentDate ?? null } : {}),
      };

      updateClient(clientId, {
        paymentStatus: 'paid',
        ...(siguiente ? { nextPaymentDate: siguiente } : {}),
      });

      /*
        El apunte NO se espera. La pantalla ya ha cambiado —la ficha es local y
        optimista— y bloquear el aviso de «Cobrado» sobre una ida y vuelta al
        servidor convertiría un toque en una espera. La promesa se guarda para
        que `undo` sepa qué fila borrar cuando llegue.
      */
      const apunte = apuntarCobro(client);

      return {
        ok: true,
        prev,
        apunte,
        undo: async () => {
          updateClient(clientId, prev);
          const res = await apunte;
          if (res.ok) await supabase.from('client_payments').delete().eq('id', res.id);
        },
      };
    },
    [apuntarCobro, clientsRef, updateClient]
  );

  /**
   * Convierte los registros heredados de TODA la cartera en sesiones con fecha.
   *
   * ── Por qué es una operación aparte y no algo que pase solo ─────────────────
   * Porque reescribe el programa completo de cada cliente. Es la única escritura
   * de la aplicación que toca a todos a la vez, así que se pide a mano, se puede
   * ensayar sin escribir (`apply: false`) y avisa de que antes hay que bajarse una
   * copia. La regla la aplica `normalizeMicrocycles`, que está probada aparte —lo
   * que se comprueba ahí es que el tonelaje es idéntico antes y después—.
   *
   * ── Por qué escribe una por una y esperando ─────────────────────────────────
   * La cola de guardado está pensada para tecleo: agrupa, rebota y no dice cuándo
   * terminó. Aquí hace falta lo contrario —saber de cada cliente si se guardó— y
   * `upsertClientRow` además comprueba que nadie haya escrito en medio, que en una
   * migración de datos es justo lo que no se puede pasar por alto.
   */
  const normalizeLegacySessions = useCallback(
    async ({ apply = false } = {}) => {
      const report = { clients: 0, converted: 0, skipped: 0, failed: [] };

      for (const client of clientsRef.current) {
        const current = workoutRef.current[client.id];
        if (!current) continue;

        const { microcycles, converted, skipped } = normalizeMicrocycles(current.microcycles || []);
        report.skipped += skipped;
        if (converted === 0) continue;

        report.clients += 1;
        report.converted += converted;
        if (!apply) continue;

        const next = { ...current, microcycles };
        const result = await upsertClientRow('workout_data', client.id, mapWorkoutToDb(client.id, next));

        if (result.error) {
          report.failed.push(`${client.name}: ${result.error.message}`);
          continue;
        }
        setWorkoutData({ ...workoutRef.current, [client.id]: next });
      }

      return report;
    },
    [clientsRef, setWorkoutData, upsertClientRow, workoutRef]
  );

  /**
   * Archiva o recupera un cliente.
   *
   * ── Por qué existe, habiendo borrar ─────────────────────────────────────────
   * Porque el plan tiene un tope de clientes y borrar es irreversible: sin esto,
   * caber en el plan obligaba a destruir el año de entrenamientos, los pesajes y
   * las fotos de alguien que simplemente terminó su etapa.
   *
   * Archivar es la operación normal al terminar con un cliente. Borrar queda para
   * lo que de verdad lo pide: que la persona ejerza su derecho de supresión.
   *
   * No se guarda con debounce (`immediate`) porque es una decisión, no una
   * escritura continua: quien lo pulsa espera ver el efecto y probablemente
   * cierre la pantalla a continuación.
   */
  const setClientArchived = useCallback(
    async (clientId, archived) => {
      updateClient(clientId, { status: archived ? 'archived' : 'active' });

      /* El recuento del plan lo lleva la base de datos, así que después de
         archivar hay que volver a preguntárselo: es justo la cifra que cambia. */
      await refreshPlan();

      /*
        La señal de abandono que no se puede sacar de ninguna otra parte.

        Una cuenta que deja de entrar puede estar de vacaciones. Una cuenta que
        archiva clientes uno detrás de otro está cerrando, y eso se ve semanas
        antes de que deje de pagar. Va en tramos —`bucket`— porque el número
        exacto de clientes de alguien señala a ese alguien.
      */
      track('cliente_archivado', {
        archivado: archived ? 'si' : 'no',
        cartera: bucket(clientsRef.current.filter((c) => c.status !== 'archived').length),
      });
      return { ok: true };
    },
    [clientsRef, refreshPlan, updateClient]
  );

  /**
   * Preferencias del panel (ver domain/preferences.js).
   *
   * Se fusiona por SECCIÓN, no se reemplaza el objeto entero: así una preferencia
   * futura que viva en `preferences.otraCosa` no desaparece cada vez que se toca
   * un KPI del panel.
   *
   * Va por la cola de guardado con su propia clave, de modo que un fallo —la
   * columna o la función que faltan— se ve en pantalla como «No se guardó» con su
   * botón de reintentar, en lugar de perderse en silencio. Y por tener clave
   * propia, un guardado de preferencias no se mezcla con los campos de la ficha
   * que el entrenador pueda estar editando a la vez.
   */
  const updateClientSections = useCallback(
    (clientId, sections) => {
      const current = clientsRef.current.find((c) => c.id === clientId)?.preferences || {};
      const next = { ...current };
      for (const [section, patch] of Object.entries(sections)) {
        next[section] = { ...(next[section] || {}), ...patch };
      }

      setClients(
        clientsRef.current.map((c) => (c.id === clientId ? { ...c, preferences: next } : c))
      );
      persist('preferences', clientId, next, { immediate: true });
    },
    [clientsRef, persist, setClients]
  );

  const updateClientPreferences = useCallback(
    (clientId, section, patch) => updateClientSections(clientId, { [section]: patch }),
    [updateClientSections]
  );

  /**
   * Guardar algo del protocolo PARA UN CLIENTE CONCRETO.
   *
   * ══ Por qué esto no es `updateClientPreferences` con otro nombre ════════════
   *
   * Deja además la marca de excepción, y esa marca es la que hace que «poner al
   * día» no arrase con el trabajo hecho a mano. Hasta ahora un cliente distinto
   * era distinto y punto: la pantalla no podía saber si lo era porque el
   * entrenador le montó algo aposta o porque la plantilla cambió después de
   * habérsela aplicado. Se trataban igual, así que encender las equivalencias
   * para uno solo duraba hasta el siguiente «Aplicar a todos».
   *
   * La excepción se declara HACIÉNDOLA, no marcando una casilla: si has abierto
   * a esta persona y le has cambiado algo, ya has dicho todo lo que había que
   * decir. Por eso vive aquí y no en cada pantalla — son cuatro sitios los que
   * escriben protocolo de un cliente (Ajustes → Protocolo, el alta de su ficha,
   * el interruptor de la dieta y el del programa) y el que se olvidara de poner
   * la marca dejaría un agujero imposible de ver hasta que algo se borrara.
   *
   * Se suelta desde `applyProtocolToClient`, que es el camino contrario.
   */
  const saveClientException = useCallback(
    (clientId, sections) =>
      updateClientSections(clientId, { ...sections, protocolException: { on: true } }),
    [updateClientSections]
  );

  /**
   * Escribe varias secciones de preferencias de golpe y ESPERA la respuesta.
   *
   * Existe para «Aplicar a todos» en Ajustes → Protocolo. La cola de guardado
   * (`updateClientPreferences`) es la herramienta correcta para la edición en
   * pantalla, pero no devuelve nada: empujar la plantilla a toda la cartera con
   * ella significaba dos escrituras por cliente disparadas a ciegas y un «hecho»
   * pintado antes de saber si era verdad. Aquí las secciones van en UN solo RPC
   * por cliente y el resultado se puede contar.
   *
   * Fusiona por sección, igual que `updateClientPreferences`: lo que no se toca
   * no desaparece.
   *
   * ── Y suelta la marca de excepción ──────────────────────────────────────────
   * Es el camino contrario a `saveClientException`: este cliente pasa a tener lo
   * que dice la plantilla, así que ya no hay nada que proteger. La quita la
   * función y no quien llama porque los dos sitios que la usan —«poner al día» e
   * «igualar a mi plantilla»— significan exactamente eso, y uno de los dos se
   * habría olvidado.
   */
  const applyProtocolToClient = useCallback(
    async (clientId, sections) => {
      const current = clientsRef.current.find((c) => c.id === clientId)?.preferences || {};
      const next = { ...current, protocolException: { on: false } };
      for (const [section, patch] of Object.entries(sections)) {
        next[section] = { ...(next[section] || {}), ...patch };
      }

      setClients(
        clientsRef.current.map((c) => (c.id === clientId ? { ...c, preferences: next } : c))
      );
      const { error } = await supabase.rpc('set_client_preferences', {
        target: clientId,
        prefs: next,
      });
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    },
    [clientsRef, setClients]
  );

  /**
   * Sella un cambio para que al cliente le salga como novedad.
   *
   * ── Por qué lo dice un botón y no el guardado ───────────────────────────────
   * La rutina se guarda cada vez que se mueve una serie. Si esto se disparara con
   * cada escritura, el cliente vería «tu rutina ha cambiado» cuarenta veces en una
   * tarde de programación y a la tercera dejaría de mirarlo. Cuándo está terminado
   * lo sabe el entrenador; la aplicación no puede adivinarlo.
   *
   * La excepción es la revisión, que sí es un acto único —crear el enlace— y por
   * eso se sella sola.
   */
  const publishUpdate = useCallback(
    (clientId, kind) => {
      const prefs = clientsRef.current.find((c) => c.id === clientId)?.preferences;
      updateClientPreferences(clientId, 'updates', stampUpdate(prefs, kind));
    },
    [clientsRef, updateClientPreferences]
  );

  /**
   * Enlace de invitación de un cliente (migración 0015).
   *
   * Es lo que hace que el portal del cliente sea alcanzable: `client_profile_id`
   * existía desde el principio y no había ninguna pantalla que lo rellenara, así que
   * la única forma de que un cliente entrara era escribir su uuid a mano en la base
   * de datos.
   *
   * Devuelve la URL completa y no solo el token: lo que el entrenador va a hacer es
   * pegarla en un WhatsApp.
   */
  const createInvite = useCallback(async (clientId) => {
    const { data, error } = await supabase.rpc('create_client_invite', { target: clientId });
    if (error) return { ok: false, error: error.message };
    /*
      El hito que de verdad importa del arranque.

      Dar de alta a alguien es rellenar un formulario; INVITARLE es el momento en
      que el producto empieza a existir para su cliente, y es donde
      `monetizacion.md` §4.1 supone que está el abandono. Suponerlo es justo lo
      que esto viene a dejar de hacer.
    */
    track('invitacion_creada');
    return { ok: true, token: data, url: `${window.location.origin}/invitacion/${data}` };
  }, []);

  const revokeInvite = useCallback(async (clientId) => {
    const { error } = await supabase.rpc('revoke_client_invite', { target: clientId });
    return error ? { ok: false, error: error.message } : { ok: true };
  }, []);

  /*
    ══ El calendario del cliente (migración 0071) ═════════════════════════════

    Las tres las llama EL CLIENTE desde su portal, no el entrenador. Están aquí
    por vecindad —son las mismas tres operaciones que la invitación, sobre un
    token con la misma forma— y no porque las use la misma persona.

    La URL se compone aquí y no en la pantalla: apunta a la función de borde y no
    a la aplicación, así que no sale de `window.location.origin` como la de la
    invitación. Sale de la misma variable con la que se configura el cliente de
    Supabase, para que no haya un segundo sitio donde apuntar al proyecto.
  */
  const calendarFeedUrl = (token) =>
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/client-calendar?t=${token}`;

  const loadCalendarFeed = useCallback(async (clientId) => {
    const { data, error } = await supabase
      .from('client_calendar_feeds')
      .select('token, revoked_at, last_fetched_at, fetch_count')
      .eq('client_id', clientId)
      .maybeSingle();

    if (error) return { ok: false, error: error.message };
    /* Sin fila o revocado son lo mismo para la pantalla: no hay calendario.
       Distinguirlos solo serviría para enseñar un enlace que no funciona. */
    if (!data || data.revoked_at) return { ok: true, feed: null };

    return {
      ok: true,
      feed: {
        url: calendarFeedUrl(data.token),
        lastFetchedAt: data.last_fetched_at,
        fetchCount: data.fetch_count,
      },
    };
  }, []);

  /** Crea el enlace, o lo cambia por uno nuevo si ya existía. */
  const createCalendarFeed = useCallback(async (clientId) => {
    const { data, error } = await supabase.rpc('create_client_calendar_feed', { target: clientId });
    if (error) return { ok: false, error: error.message };
    return { ok: true, url: calendarFeedUrl(data) };
  }, []);

  const revokeCalendarFeed = useCallback(async (clientId) => {
    const { error } = await supabase.rpc('revoke_client_calendar_feed', { target: clientId });
    return error ? { ok: false, error: error.message } : { ok: true };
  }, []);

  const addClient = useCallback(
    async (clientData) => {
      const userId = session?.user?.id;
      if (!userId) return { ok: false, error: 'No hay sesión activa.' };

      const { name, ...resto } = clientData || {};

      /*
        El alta va por `create_client` (migración 0032) y no por un INSERT.

        El motivo no es de estilo. Con el INSERT, el `team_id` lo elegía el
        navegador y el permiso lo juzgaba RLS, que rechaza en silencio: el usuario
        veía «new row violates row-level security policy» y no había forma de
        saber por qué desde fuera de la base de datos. La función resuelve el
        equipo ella misma y, cuando el permiso falta, DICE cuál es tu rol.

        Mismo permiso, misma comprobación del plan (el trigger corre igual). Lo
        único que cambia es que ahora el fallo se puede leer.
      */
      const viaRpc = await supabase.rpc('create_client', {
        p_name: String(name || '').trim(),
        p_fields: mapClientToDb(resto),
      });

      let { data, error } = viaRpc;

      /*
        Respaldo para bases sin la 0032 aplicada: se intenta el camino de siempre.
        `PGRST202` es «no existe esa función» — cualquier otro error es del alta y
        hay que enseñarlo, no reintentar por otra puerta.
      */
      if (error?.code === 'PGRST202') {
        const teamFields = team
          ? { team_id: team.id, assigned_to: clientData.assignedTo || userId }
          : {};
        ({ data, error } = await supabase
          .from('clients')
          .insert({
            coach_id: userId,
            start_date: today(),
            ...teamFields,
            ...mapClientToDb(clientData),
          })
          .select()
          .single());
      }

      if (error) return { ok: false, error: explicarErrorDeAlta(error) };

      const creado = mapClientFromDb(data);

      /*
        La plantilla, en una segunda escritura. No puede ir en el alta porque
        `create_client` no acepta `preferences` (ver `newClientPreferences`).

        Su fallo NO tumba el alta: el cliente ya existe y con la columna vacía
        tiene el protocolo de serie, que es lo que ha tenido siempre cualquier
        cliente nuevo. Lo único que pasa es que aparece como atrasado en Ajustes →
        Protocolo y «Poner al día» lo arregla — un estado visible y con su mando
        delante, no un error tragado. Queda además en el diagnóstico, porque si
        esto falla de forma sistemática el síntoma que se reporta sería «mi
        plantilla no llega a los clientes nuevos» y hay que poder verlo.
      */
      const semilla = newClientPreferences(coachPrefsRef.current);
      let created = creado;
      if (semilla) {
        const { error: errSemilla } = await supabase.rpc('set_client_preferences', {
          target: creado.id,
          prefs: semilla,
        });
        if (errSemilla) recordIssue('alta:plantilla', errSemilla, { client: creado.id });
        else created = { ...creado, preferences: semilla };
      }

      setClients([...clientsRef.current, created]);
      setSelectedClientId(created.id);
      /* El primer paso del embudo. En TRAMOS: «tiene 28 clientes» señala a un
         entrenador concreto y «tiene entre 10 y 29» contesta igual de bien a la
         única pregunta que se le va a hacer —en qué tamaño de cartera se
         abandona—. */
      track('cliente_creado', { cartera: bucket(clientsRef.current.length) });
      return { ok: true, client: created };
    },
    [clientsRef, coachPrefsRef, session, setClients, setSelectedClientId, team]
  );

  /*
    ══ Protección de datos ═══════════════════════════════════════════════════

    Esto guarda fotos corporales, peso, pliegues y perímetros: categoría especial
    del RGPD. Con clientes reales en la UE, poder EXPORTAR y poder BORRAR no son
    funciones de producto, son obligaciones — y hasta ahora no existía ninguna de
    las dos: borrar la fila de un cliente ni siquiera era posible (sus bloques
    tienen clave foránea sin cascada) y sus fotos se quedaban en el bucket para
    siempre.
  */

  /** Todo lo que la aplicación guarda de un cliente, en un objeto. */
  const exportClientData = useCallback(
    async (clientId) => {
      const client = clientsRef.current.find((c) => c.id === clientId);
      if (!client) return { ok: false, error: 'Ese cliente ya no existe.' };

      const table = (name) => supabase.from(name).select('*').eq('client_id', clientId);

      const [wd, anthro, nutri, photos, checkins, events] = await Promise.all([
        table('workout_data'),
        table('anthropometry'),
        table('nutrition_plans'),
        table('progress_photos'),
        table('check_ins'),
        table('client_events'),
      ]);

      const failed = [wd, anthro, nutri, photos].find((r) => r.error);
      if (failed) return { ok: false, error: `No se pudo exportar: ${failed.error.message}` };

      /*
        Las fotos van como ENLACES FIRMADOS de larga duración, no como binarios.
        Meter los archivos dentro exigiría una librería de ZIP —una dependencia
        nueva para una función que se usa dos veces al año— y un JSON con las
        imágenes en base64 sería un archivo de cientos de megas que ningún editor
        abre. Los enlaces caducan a los 7 días: es lo que hay que decirle a quien
        recibe la exportación, y por eso va escrito dentro del propio archivo.
      */
      /* `photo_url` guarda una RUTA del bucket, no una URL (la columna se llama
         mal desde el primer esquema). Las filas antiguas sí pueden tener una URL
         completa, y esas no hay que firmarlas. */
      const paths = (photos.data || [])
        .map((p) => p.photo_url)
        .filter((p) => p && !/^https?:\/\//i.test(p));
      let signed = [];
      if (paths.length > 0) {
        const res = await supabase.storage.from(BUCKET).createSignedUrls(paths, 7 * 24 * 3600);
        signed = res.data || [];
      }

      /*
        Exportar los datos de UN cliente es casi siempre atender una petición del
        RGPD, y eso hay que poder cuantificarlo: si esto se dispara, la pantalla
        que lo hace deja de ser una casilla de cumplimiento y pasa a ser una
        función que merece cuidado. También aparece —y esto es lo importante—
        cuando alguien se está llevando su cartera antes de irse.
      */
      track('datos_exportados', { alcance: 'cliente' });

      return {
        ok: true,
        data: {
          _aviso:
            'Exportación de datos personales. Los enlaces de las fotos caducan a los 7 días desde la fecha de generación.',
          _generado: new Date().toISOString(),
          cliente: client,
          rutina: wd.data || [],
          antropometria: anthro.data || [],
          nutricion: nutri.data || [],
          fotos: (photos.data || []).map((p, i) => ({ ...p, enlace: signed[i]?.signedUrl || null })),
          // Las dos últimas dependen de la migración 0009: si no está, se
          // exporta lo que hay en vez de fallar entero.
          checkIns: checkins.error ? [] : checkins.data,
          calendario: events.error ? [] : events.data,
        },
      };
    },
    [clientsRef]
  );

  /**
   * La traza de cambios de un cliente: quién tocó qué y cuándo.
   *
   * Bajo demanda y no en la carga inicial: es un dato de consulta puntual —se
   * mira cuando hay una duda— y traerlo para los veinte clientes al arrancar sería
   * exactamente el problema que este proyecto ya tiene con el resto.
   *
   * Si la tabla no existe (migración 0017 sin aplicar) devuelve una lista vacía y
   * lo dice, en vez de fallar: es el mismo trato que se le da a la 0009.
   */
  const loadAuditLog = useCallback(async (clientId, limit = 20) => {
    const res = await supabase
      .from('audit_log')
      .select('id, table_name, action, at, actor, profiles(full_name, email)')
      .eq('client_id', clientId)
      .order('at', { ascending: false })
      .limit(limit);

    if (res.error) {
      const missing = /does not exist|schema cache/i.test(res.error.message);
      return { ok: false, missing, error: res.error.message, rows: [] };
    }

    return {
      ok: true,
      missing: false,
      rows: (res.data || []).map((row) => ({
        id: row.id,
        table: row.table_name,
        action: row.action,
        at: row.at,
        who: row.profiles?.full_name || row.profiles?.email || null,
      })),
    };
  }, []);

  /**
   * Copia de seguridad de TODA la cartera.
   *
   * ── Por qué existe estando Supabase detrás ──────────────────────────────────
   * Porque las copias de Supabase son de la base entera y dependen del plan: no
   * sirven para «devuélveme el programa de Marta como estaba el martes». Y el
   * modelo concentra el trabajo de un año de cada cliente en unas pocas filas
   * jsonb, así que un UPDATE mal hecho —o un borrado por error— se lleva doce
   * meses sin dejar rastro.
   *
   * Esto no es un sistema de copias: es un volcado que el entrenador puede
   * guardar donde quiera y con el que se puede reconstruir a mano. Es poco, y es
   * infinitamente más que nada.
   *
   * Una consulta por tabla con `in(...)`, no una por cliente: con cuarenta
   * clientes eso serían doscientas peticiones.
   */
  const exportAllData = useCallback(async () => {
    const all = clientsRef.current;
    if (all.length === 0) return { ok: false, error: 'No hay clientes que copiar.' };

    const ids = all.map((c) => c.id);
    const table = (name) => supabase.from(name).select('*').in('client_id', ids);

    const [wd, anthro, nutri, photos, checkins, events] = await Promise.all([
      table('workout_data'),
      table('anthropometry'),
      table('nutrition_plans'),
      table('progress_photos'),
      table('check_ins'),
      table('client_events'),
    ]);

    const failed = [wd, anthro, nutri, photos].find((r) => r.error);
    if (failed) return { ok: false, error: `No se pudo copiar: ${failed.error.message}` };

    /* La cartera entera. Es la misma señal que la de un cliente suelto pero mucho
       más fuerte: quien se descarga todo o está siendo prudente o se está yendo,
       y las dos cosas merecen una conversación. */
    track('datos_exportados', { alcance: 'todo', cartera: bucket(all.length) });

    return {
      ok: true,
      data: {
        _aviso:
          'Copia de seguridad de Caveman Hub. Contiene datos de salud: guárdala cifrada y no la compartas. NO incluye los archivos de fotos, solo sus rutas en el almacenamiento.',
        _generado: new Date().toISOString(),
        _clientes: all.length,
        clientes: all,
        rutina: wd.data || [],
        antropometria: anthro.data || [],
        nutricion: nutri.data || [],
        fotos: photos.data || [],
        checkIns: checkins.error ? [] : checkins.data,
        calendario: events.error ? [] : events.data,
      },
    };
  }, [clientsRef]);

  /**
   * Borra un cliente y TODO lo suyo, incluidas sus fotos del almacenamiento.
   *
   * ── Por qué es un procedimiento y no un `delete()` ──────────────────────────
   * Las tablas de bloque referencian `clients` SIN cascada, así que borrar la
   * ficha a secas falla por clave foránea. Y aunque no fallara, los archivos del
   * bucket no los borra nadie: hoy quedarían las fotos corporales de una persona
   * que pidió que la borraras.
   *
   * El orden importa: primero los archivos, después las filas hijas y al final la
   * ficha. Si algo falla se sigue con el resto y se devuelve la lista de lo que
   * quedó, porque un borrado a medias hay que poder terminarlo a mano — y para
   * eso hay que saber qué falta.
   */
  const deleteClientCompletely = useCallback(
    async (clientId) => {
      const problems = [];

      /* Los archivos. Se listan del bucket en vez de fiarse de las filas: una
         subida que falló a mitad puede haber dejado el archivo sin su fila. */
      try {
        const root = `${clientId}/photos`;
        const folders = await supabase.storage.from(BUCKET).list(root, { limit: 1000 });
        const files = [];
        for (const entry of folders.data || []) {
          if (entry.id) {
            files.push(`${root}/${entry.name}`);
            continue;
          }
          const inner = await supabase.storage.from(BUCKET).list(`${root}/${entry.name}`, { limit: 1000 });
          for (const file of inner.data || []) files.push(`${root}/${entry.name}/${file.name}`);
        }
        if (files.length > 0) {
          const removed = await supabase.storage.from(BUCKET).remove(files);
          if (removed.error) problems.push(`archivos: ${removed.error.message}`);
        }
      } catch (e) {
        problems.push(`archivos: ${e?.message || 'error al listar el almacenamiento'}`);
      }

      for (const table of [
        'progress_photos',
        'workout_data',
        'anthropometry',
        'nutrition_plans',
        'check_ins',
        'client_events',
        'client_invites',
      ]) {
        const res = await supabase.from(table).delete().eq('client_id', clientId);
        /* Una tabla que no existe (migración sin aplicar) no es un problema: es
           que ahí no hay nada de este cliente. */
        if (res.error && !/does not exist|schema cache/i.test(res.error.message)) {
          problems.push(`${table}: ${res.error.message}`);
        }
      }

      const gone = await supabase.from('clients').delete().eq('id', clientId);
      if (gone.error) {
        return {
          ok: false,
          error: `No se pudo borrar la ficha: ${gone.error.message}`,
          problems,
        };
      }

      setClients((prev) => prev.filter((c) => c.id !== clientId));
      setProgressPhotos((prev) => prev.filter((p) => p.clientId !== clientId));

      return { ok: true, problems };
    },
    [setClients, setProgressPhotos]
  );

  /**
   * Vuelve a leer las fichas de los clientes.
   *
   * ── Por qué hace falta ──────────────────────────────────────────────────────
   * Las integraciones escriben `payment_status` y `next_payment_date` desde el
   * SERVIDOR, con `service_role`, porque el estado lo decide la función después de
   * conciliar. La aplicación no se enteraba: su lista de clientes era la de la carga
   * inicial, así que después de sincronizar Notion se veía al cliente recién creado
   * sin pago —«no les coge el pago»— cuando en la base de datos ya lo tenía.
   *
   * Es el mismo problema que tendría cualquier escritura hecha por fuera de la
   * aplicación, y la solución es la misma: releer cuando se sabe que algo ha
   * cambiado ahí fuera.
   */
  const reloadClients = useCallback(async () => {
    const { data, error } = await supabase.from('clients').select('*').order('created_at');
    if (error) return { ok: false, error: error.message };
    setClients((data || []).map(mapClientFromDb));
    return { ok: true };
  }, [setClients]);

  /**
   * Aplica un panel a toda la cartera de una vez (migración 0035).
   *
   * ── Por qué una función de base de datos y no un bucle ──────────────────────
   * Veinte llamadas son veinte transacciones: si la novena falla, quedan ocho
   * clientes con el panel nuevo y doce con el viejo, y no hay forma de saber
   * cuáles sin abrirlos uno a uno. Así, o entran todos o no entra ninguno.
   */
  const applyDashboardToAll = useCallback(
    async (dashboard) => {
      const { data, error } = await supabase.rpc('apply_dashboard_to_my_clients', {
        p_dashboard: dashboard,
      });

      if (error) return { ok: false, error: error.message };

      // Las fichas cambiaron en el servidor. Sin releer, el panel abierto
      // seguiría enseñando lo de antes hasta recargar la página entera.
      await reloadClients();
      return { ok: true, count: data ?? 0 };
    },
    [reloadClients]
  );

  return {
    updateClient,
    markClientPaid,
    normalizeLegacySessions,
    setClientArchived,
    updateClientPreferences,
    saveClientException,
    applyProtocolToClient,
    publishUpdate,
    createInvite,
    revokeInvite,
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
  };
};
