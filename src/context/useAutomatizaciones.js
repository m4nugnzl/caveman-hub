import { useCallback, useEffect, useRef, useState } from 'react';

import { supabase } from '@/lib/supabaseClient';
import {
  HORIZONTE,
  claveDeCorrida,
  deProtocolo,
  loQueToca,
  nombreDe,
  sanitizeAutomatizacion,
} from '@/domain/automatizaciones';
import { protocoloDeCliente } from '@/domain/protocolos';
import { coachFormularios } from '@/domain/formularios';
import { filasDeEnvio } from '@/domain/envios';
import { newId } from '@/lib/ids';
import { todayISO } from '@/lib/dates';

/*
  ══ EL MOTOR 1, que es lo único que corre sin servidor ══════════════════════

  Con la convención de `useEnvios.js`: posee su estado, su carga y sus acciones.

  Lo que hace este archivo cabe en una frase: **calcular qué filas tendrían que
  existir ya y escribirlas**. No hay nadie mandando nada a ninguna hora. La fila
  de `client_actions` nace con su `due` y el portal del cliente solo enseña las
  vigentes, así que adelantar la escritura es exactamente lo mismo que
  programarla — con la ventaja de que lo que va a salir se puede VER y CANCELAR
  durante días, que es lo que sustituye al «Review first» de Coachway.

  ══ EL ORDEN DE LAS TRES ESCRITURAS, que no se puede cambiar ════════════════

      1. APUNTAR   la corrida en `automation_runs`  ← aquí está el índice único
      2. HACER     lo que el paso diga (la acción, o la casilla de tu agenda)
      3. REMATAR   el apunte con el id de lo que salió

  Y si el 2 falla, **se borra el apunte**. El orden importa y las dos
  alternativas son peores:

    · Hacer primero y apuntar después deja la puerta abierta al doble disparo
      justo en el hueco entre las dos, que es el fallo que esta tanda existe para
      evitar. Dos pestañas abiertas caben de sobra en ese hueco.
    · Apuntar y no borrar en el fallo deja la corrida dada por hecha sin que
      haya salido nada: un vídeo que nadie recibe y que ya no se volverá a
      intentar. Silencioso, que es lo peor que puede ser.

  Apuntar primero es «pedir vez»: el que pierde la carrera recibe cero filas de
  vuelta —`ON CONFLICT DO NOTHING`— y se retira sin escribir nada.

  Y queda un tercer caso que ninguna de las dos cubre: que el navegador
  desaparezca ENTRE el 1 y el 2 —pestaña cerrada, red caída, portátil dormido—.
  Ahí no hay a quién contestarle, así que `deshacer` no llega a correr y el
  apunte se queda diciendo «ya corrió» sin que haya salido nada. Lo barre
  `limpiarApuntesAMedias` al empezar cada repaso, y es la razón de que un salto
  —que no manda nada— ya no se apunte: si lo hiciera, «sin acción y sin evento»
  dejaría de significar «se quedó a medias».

  ══ Y quién lo llama ════════════════════════════════════════════════════════

  El navegador del entrenador, al arrancar y al guardar una automatización. Es
  una consecuencia honesta del motor 1, no un descuido: si nadie abre la
  aplicación en tres semanas, lo de esas tres semanas se materializa el día que
  la abra —con sus fechas, que siguen siendo las que eran—. El latido de las
  07:00 (`worker.mjs`) ya está desplegado y es la tanda 4; lo que cambia ese día
  es QUIÉN llama a esto, no lo que hace.
*/

/** Tope de corridas que se traen. Ver por qué esto puede ir corto, más abajo. */
const TOPE = 2000;

const PG_RLS = '42501';
const PG_DUPLICADA = '23505';

const explicarError = (error) => {
  if (error?.code === PG_RLS) {
    return 'No se ha podido guardar. Si tu suscripción no está activa, esto queda en solo lectura.';
  }
  return error?.message || 'No se ha podido guardar la automatización.';
};

/** De fila de la base a la forma del dominio, y saneada. */
const deLaBase = (fila) =>
  sanitizeAutomatizacion({
    id: fila.id,
    protocoloId: fila.protocolo_id,
    nombre: fila.nombre,
    disparador: fila.disparador,
    valor: fila.valor,
    activa: fila.activa,
    pasos: fila.pasos,
    orden: fila.orden,
    /* Desde cuándo vale. La pone la base y por eso se lee de vuelta: es lo que
       impide que escribir una regla reparta el pasado. Ver `disparosDe`. */
    creada: fila.created_at,
  });

/** Y de vuelta. `coach_id` lo pone quien escribe, que es el único que lo sabe. */
const aLaBase = (auto) => ({
  id: auto.id,
  protocolo_id: auto.protocoloId,
  nombre: auto.nombre || null,
  disparador: auto.disparador,
  valor: auto.valor,
  activa: auto.activa,
  pasos: auto.pasos,
  orden: auto.orden,
  /* `created_at` NO viaja: lo pone la base con su reloj, que es el único que no
     se puede adelantar desde un portátil. */
});

export const useAutomatizaciones = ({ session, clients, coachPrefs, addClientEvent, onFilaNueva }) => {
  const [automatizaciones, setAutomatizaciones] = useState([]);
  const [corridas, setCorridas] = useState([]);
  const [automatizacionesReady, setReady] = useState(false);

  /* Que no se repase dos veces en el mismo arranque: los efectos de React se
     montan dos veces en desarrollo, y aquí eso serían dos carreras por las
     mismas filas. Las perdería una —el índice único está para eso—, pero son dos
     viajes para nada y ensucian el registro. */
  const repasando = useRef(false);
  const repasado = useRef(false);

  /*
    `addClientEvent` y `onFilaNueva` son las dos cosas que este gancho necesita de
    fuera y no puede hacer solo: escribir en tu agenda (vive en `useCalendar`) y
    avisar de una fila nueva para que la bandeja no espere a la próxima recarga
    (vive en `useEnvios`). Llegan como argumentos, y por eso este gancho se monta
    DESPUÉS de esos dos en el proveedor.
  */

  const cargar = useCallback(async () => {
    const userId = session?.user?.id;
    if (!userId) {
      setAutomatizaciones([]);
      setCorridas([]);
      setReady(false);
      return;
    }

    /*
      Las dos a la vez. Sin la 0116 las tablas no existen y el error se traga:
      la aplicación se comporta como antes de que esto existiera, que es lo que
      hace `useEnvios` con la suya. Un fallo aquí no puede tumbar el arranque.
    */
    const [autos, runs] = await Promise.all([
      supabase.from('coach_automations').select('*').order('orden', { ascending: true }),
      supabase
        .from('automation_runs')
        .select('client_id, automation_id, paso_id, ocurrencia')
        /*
          Las últimas. Cortar por un tope es seguro aquí y en ningún otro sitio
          lo sería: esta lista es una CACHÉ para no pedir lo que ya se sabe
          hecho, no la verdad. Quien impide el doble disparo es el índice único
          de la base, así que una corrida vieja que se quede fuera cuesta un
          viaje de más y no una fila de más.
        */
        .order('ran_at', { ascending: false })
        .limit(TOPE),
    ]);

    setAutomatizaciones(autos.error ? [] : (autos.data || []).map(deLaBase).filter(Boolean));
    setCorridas(runs.error ? [] : runs.data || []);
    setReady(true);
  }, [session]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // ── Escribirlas ──────────────────────────────────────────────────────────

  /**
   * Guardar una: la misma puerta para crearla y para cambiarla.
   *
   * `upsert` y no `insert`/`update` porque el id lo pone el dominio
   * (`buildAutomatizacion`) y no la base: quien llama ya tiene la automatización
   * entera en la mano antes de que exista ninguna fila, y partir esto en dos
   * caminos obligaría a la pantalla a saber cuál de los dos le toca.
   */
  const guardarAutomatizacion = useCallback(
    async (auto) => {
      const userId = session?.user?.id;
      if (!userId) return { ok: false, error: 'No hay sesión activa.' };

      const limpia = sanitizeAutomatizacion(auto);
      if (!limpia) return { ok: false, error: 'Esa automatización no tiene forma.' };

      const { data, error } = await supabase
        .from('coach_automations')
        .upsert({ ...aLaBase(limpia), coach_id: userId })
        .select()
        .single();
      if (error) return { ok: false, error: explicarError(error) };

      const guardada = deLaBase(data);
      setAutomatizaciones((prev) => {
        const otras = prev.filter((a) => a.id !== guardada.id);
        return [...otras, guardada];
      });
      return { ok: true, automatizacion: guardada };
    },
    [session]
  );

  /**
   * Quitarla.
   *
   * Su libro se va con ella (`ON DELETE CASCADE`) y lo ya mandado NO: eso vive
   * en `client_actions` y es de quien lo recibió. Lo que sigue pendiente y
   * todavía no ha salido se cancela desde la cola, de una en una, que es donde
   * se ve a quién le afecta.
   */
  const quitarAutomatizacion = useCallback(async (id) => {
    const { error } = await supabase.from('coach_automations').delete().eq('id', id);
    if (error) return { ok: false, error: explicarError(error) };
    setAutomatizaciones((prev) => prev.filter((a) => a.id !== id));
    setCorridas((prev) => prev.filter((r) => r.automation_id !== id));
    return { ok: true };
  }, []);

  // ── Correrlas ────────────────────────────────────────────────────────────

  /**
   * Escribir UNA corrida, con las tres escrituras en su orden.
   *
   * Devuelve `'hecha'`, `'ya estaba'` o `'falló'`. Los tres son respuestas, no
   * dos respuestas y un error: que otro lo haya hecho es exactamente igual de
   * correcto que haberlo hecho tú.
   */
  const correrUna = useCallback(
    async (
      { automatizacion, paso, ocurrencia, due, clienteId },
      { cliente, coachId, mandarEvento, formularios }
    ) => {
      /*
        ── El salto NO se apunta ────────────────────────────────────────────

        No manda nada: lo único que hace es que la cadena siga, y de eso se
        encarga `loQueToca`, que la camina entera cada vez. Apuntarlo no aportaba
        idempotencia —los pasos de la encadenada llevan su propia clave— y sí
        quitaba la única señal que distingue una corrida INTERRUMPIDA: un apunte
        sin acción y sin evento. Ver `limpiarApuntesAMedias`.
      */
      if (paso.que === 'salta') return 'hecha';

      /* 1. Pedir vez. `ignoreDuplicates` es `ON CONFLICT DO NOTHING`: si ya está
            apuntada, `data` vuelve vacío y aquí se acaba el trabajo. */
      const { data: apuntes, error: errApunte } = await supabase
        .from('automation_runs')
        .upsert(
          {
            client_id: clienteId,
            automation_id: automatizacion.id,
            paso_id: paso.id,
            ocurrencia,
          },
          { onConflict: 'client_id,automation_id,paso_id,ocurrencia', ignoreDuplicates: true }
        )
        .select();

      if (errApunte) {
        /* La carrera perdida también llega por aquí si el servidor decide
           contarla como error en vez de como cero filas. Es «ya estaba», no un
           fallo: reintentarlo no arreglaría nada y avisar sería mentir. */
        return errApunte.code === PG_DUPLICADA ? 'ya estaba' : 'falló';
      }
      const apunte = (apuntes || [])[0];
      if (!apunte) return 'ya estaba';

      /* 2. Hacer lo que el paso diga. */
      const deshacer = async () => {
        await supabase.from('automation_runs').delete().eq('id', apunte.id);
        return 'falló';
      };

      const origen = { tipo: 'auto', id: automatizacion.id, nombre: nombreDe(automatizacion) };

      if (paso.que === 'tarea') {
        const res = await mandarEvento({
          clientId: clienteId,
          date: due,
          kind: 'note',
          title: paso.titulo || nombreDe(automatizacion),
          privada: true,
        });
        if (!res?.ok) return deshacer();
        await supabase
          .from('automation_runs')
          .update({ event_id: res.event?.id || null })
          .eq('id', apunte.id);
        return 'hecha';
      }

      /*
        Y lo demás por la MISMA puerta que «Mandar algo»: `filasDeEnvio` con un
        solo destinatario y el cuándo ya resuelto en su día. No hay una segunda
        forma de escribir una acción — el esquema se congela igual, el recado se
        sanea igual y la entrega sin enlace se rechaza igual.
      */
      /*
        El paso guarda el ID del formulario y no sus preguntas, al revés que la
        fila que sale de él. Es la misma decisión de las dos puntas y las dos
        son correctas: el paso REFERENCIA, para que corregir una pregunta arregle
        lo que aún no ha salido; la fila COPIA, para que corregirla no cambie lo
        que alguien ya tiene a medias. Aquí es donde una cosa se convierte en la
        otra. Un formulario borrado deja el paso sin nada que mandar, y
        `filasDeEnvio` devuelve cero filas: el apunte se deshace y no sale nada.
      */
      const filas = filasDeEnvio({
        tipo: paso.que,
        formulario: paso.que === 'form' ? formularios.find((f) => f.id === paso.formId) || null : null,
        titulo: paso.titulo,
        enlace: paso.enlace,
        nota: paso.nota,
        audiencia: { tipo: 'protocolo', valor: automatizacion.protocoloId },
        cuando: { tipo: 'dia', valor: due },
        clientes: [cliente],
        coachId,
        origen,
      });
      if (filas.length === 0) return deshacer();

      const { data: escritas, error } = await supabase
        .from('client_actions')
        .insert(filas.map(({ coach_id: _c, ...fila }) => fila))
        .select();
      if (error || !escritas?.length) return deshacer();

      /* 3. Rematar: qué salió de este apunte. Es lo que permite cancelar una
            fila y que la corrida siga contando como hecha. */
      await supabase.from('automation_runs').update({ action_id: escritas[0].id }).eq('id', apunte.id);

      return { estado: 'hecha', fila: escritas[0] };
    },
    []
  );

  /**
   * Los apuntes que se quedaron a medias, y por qué hay que barrerlos.
   *
   * ══ El hueco que ni el índice único ni `deshacer` cubren ═════════════════
   *
   * Entre pedir vez y escribir lo que sale hay un instante, y el navegador puede
   * desaparecer justo ahí: se cierra la pestaña, se va la red, el portátil se
   * duerme. `deshacer` solo corre cuando la base CONTESTA que no; si nadie llega
   * a preguntar, el apunte se queda puesto y el vídeo no sale nunca — y como el
   * apunte dice «ya corrió», no se vuelve a intentar jamás.
   *
   * Lo vimos pasar: un cliente con su apunte y sin su acción, porque la pestaña
   * se cerró en mitad del reparto.
   *
   * ══ Cómo se reconoce uno ═════════════════════════════════════════════════
   *
   * Un apunte sin `action_id` y sin `event_id` **no puede ser bueno**: todo lo
   * que se apunta escribe una de las dos cosas. Los saltos, que no escriben
   * ninguna, por eso ya no se apuntan.
   *
   * Y con un minuto de gracia, que es lo que lo hace seguro: sin él, un repaso
   * que arranque mientras otro está a mitad le borraría el apunte por debajo y
   * los dos mandarían lo mismo. La gracia convierte «está en ello» en «se quedó
   * a medias», que son las dos lecturas posibles y hay que poder distinguirlas.
   */
  const limpiarApuntesAMedias = useCallback(async () => {
    const gracia = new Date(Date.now() - 60000).toISOString();
    await supabase
      .from('automation_runs')
      .delete()
      .is('action_id', null)
      .is('event_id', null)
      .lt('ran_at', gracia);
  }, []);

  /**
   * EL REPASO: qué le tendría que haber pasado ya a cada uno de tus clientes.
   *
   * Cliente por cliente y paso por paso, en serie. No es un descuido de
   * rendimiento: cada corrida son hasta tres escrituras encadenadas y lo que se
   * reparte son deberes a personas. Con cincuenta a la vez, un tropiezo de red
   * deja medio reparto hecho y sin forma de saber cuál — y aquí nadie tiene
   * prisa, porque todo lo que se escribe tiene fecha futura.
   *
   * @param manual  `{ automationId }` para lanzar a mano una de disparador
   *   `manual`. Sin él, se repasa lo que corre solo.
   */
  const correrAutomatizaciones = useCallback(
    async ({ manual = null, hoy = todayISO() } = {}) => {
      const coachId = session?.user?.id;
      if (!coachId || automatizaciones.length === 0) return { ok: true, hechas: 0 };

      const formularios = coachFormularios(coachPrefs);

      await limpiarApuntesAMedias();

      const hechas = new Set(
        corridas.map((r) => `${r.client_id}|${claveDeCorrida({
          automationId: r.automation_id,
          pasoId: r.paso_id,
          ocurrencia: r.ocurrencia,
        })}`)
      );

      /* La ocurrencia de un disparo a mano es el id de ESE envío, y se calcula
         una vez para toda la tanda: si se generara por cliente, el mismo empujón
         contaría como uno distinto para cada uno y la cola no sabría juntarlos. */
      const suOcurrencia = manual ? newId('env') : null;

      const nuevas = [];
      let fallos = 0;
      let salidas = 0;

      for (const cliente of clients || []) {
        /*
          RESOLVER ANTES DE COMPARAR, que es el riesgo 3 del doc y aquí ya costó
          una tarde:  devuelve lo que el cliente tenga
          ESCRITO, y casi nadie tiene nada escrito — el que nunca eligió lleva el
          primero, y eso lo contesta . Comparando contra el
          valor crudo, a una cartera entera no le corría nada y sin un solo
          error: el repaso decía que a nadie le tocaba.
        */
        const suyas = deProtocolo(automatizaciones, protocoloDeCliente(coachPrefs, cliente)?.id);
        if (suyas.length === 0) continue;

        const toca = loQueToca({
          automatizaciones: suyas,
          cliente,
          /* Al `Set` global se le quita el cliente delante: `loQueToca` solo
             conoce claves de automatización + paso + ocurrencia, y mezclarlas
             entre personas haría que lo de Marta diera por hecho lo de Luis. */
          hechas: new Set(
            [...hechas]
              .filter((k) => k.startsWith(`${cliente.id}|`))
              .map((k) => k.slice(cliente.id.length + 1))
          ),
          hoy,
          horizonte: HORIZONTE,
          manual: manual ? { ...manual, ocurrencia: suOcurrencia } : null,
        });

        for (const trabajo of toca) {
          const res = await correrUna(trabajo, {
            cliente,
            coachId,
            formularios,
            mandarEvento: addClientEvent,
          });
          const estado = typeof res === 'string' ? res : res.estado;
          if (estado === 'falló') fallos += 1;
          if (estado === 'hecha') {
            salidas += 1;
            nuevas.push({
              client_id: cliente.id,
              automation_id: trabajo.automatizacion.id,
              paso_id: trabajo.paso.id,
              ocurrencia: trabajo.ocurrencia,
            });
            if (res.fila) onFilaNueva?.(res.fila);
          }
        }
      }

      if (nuevas.length > 0) setCorridas((prev) => [...nuevas, ...prev]);
      return { ok: fallos === 0, hechas: salidas, fallos };
    },
    [session, automatizaciones, corridas, clients, coachPrefs, correrUna, limpiarApuntesAMedias, addClientEvent, onFilaNueva]
  );

  /**
   * El repaso del arranque, una sola vez por sesión.
   *
   * Cuando ya hay cartera y automatizaciones cargadas. Antes no: con la lista de
   * clientes a medio llegar, `loQueToca` diría que a nadie le toca nada y el
   * repaso se daría por hecho sin haber mirado.
   */
  const repasar = useCallback(async () => {
    if (repasando.current || repasado.current) return;
    if (!automatizacionesReady || !(clients || []).length) return;
    repasando.current = true;
    try {
      await correrAutomatizaciones();
      repasado.current = true;
    } finally {
      repasando.current = false;
    }
  }, [automatizacionesReady, clients, correrAutomatizaciones]);

  useEffect(() => {
    repasar();
  }, [repasar]);

  /* Si se cierra la sesión, el repaso del siguiente que entre vuelve a tocar. */
  useEffect(() => {
    if (!session?.user?.id) repasado.current = false;
  }, [session]);

  return {
    automatizaciones,
    automatizacionesReady,
    corridas,
    guardarAutomatizacion,
    quitarAutomatizacion,
    correrAutomatizaciones,
    reloadAutomatizaciones: cargar,
  };
};
