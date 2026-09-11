import { useCallback, useEffect, useState } from 'react';

import { supabase } from '@/lib/supabaseClient';
import { filasDeEnvio } from '@/domain/envios';

/*
  ══ Los envíos, en su gancho ═════════════════════════════════════════════════

  Con la convención de `useRoadmap.js`: posee su estado, su carga y sus acciones,
  y recibe del proveedor solo lo que necesita.

  ── Uno solo para los dos lados ────────────────────────────────────────────
  El entrenador ve lo que ha mandado y el cliente lo que le han pedido, y los dos
  leen LA MISMA consulta: `client_actions` sin filtro. Quien filtra es RLS
  (migraciones 0099 y 0105) —el entrenador ve las filas de sus clientes y el
  cliente solo las suyas—, así que un `where` en el navegador sería una segunda
  copia de una regla que ya está en la base y que además se puede saltar. La
  única diferencia entre los dos lados es qué pantalla pinta el resultado.

  ── Por qué se cargan todas y no por cliente ───────────────────────────────
  Porque la pantalla de Protocolos las lee AGRUPADAS por envío: «Hábitos de
  sueño, a 5, 3 contestados» necesita las cinco filas a la vez. Cargarlas por
  cliente obligaría a cinco consultas para pintar una fila de una tabla. Son
  filas diminutas y con tope de destinatarios; cuando una cartera las haga
  pesar, lo que cambia es la consulta, no quien la llama.
*/

/** Tope de filas que se traen. Ver el porqué del orden, más abajo. */
const TOPE = 500;

const PG_RLS = '42501';

const explicarError = (error) => {
  if (error?.code === PG_RLS) {
    return 'No se ha podido guardar. Si tu suscripción no está activa, esto queda en solo lectura.';
  }
  return error?.message || 'No se ha podido completar el envío.';
};

export const useEnvios = ({ session }) => {
  const [envioRows, setEnvioRows] = useState([]);
  /*
    Si ya se han LEÍDO, que no es lo mismo que si están vacías. La pantalla del
    cliente enseña «no te ha pedido nada» y esa frase, dicha antes de tiempo, es
    una mentira que dura un segundo y hace dudar del resto.
  */
  const [enviosReady, setEnviosReady] = useState(false);

  const cargar = useCallback(async () => {
    const userId = session?.user?.id;
    if (!userId) {
      setEnvioRows([]);
      setEnviosReady(false);
      return;
    }

    const { data, error } = await supabase
      .from('client_actions')
      .select('*')
      /* Lo último mandado primero: si alguna vez se corta por el tope, lo que se
         pierde es lo viejo, que es lo que ya nadie mira. */
      .order('sent_at', { ascending: false })
      .limit(TOPE);

    /* Sin la 0099/0105 la tabla no existe: la aplicación se comporta como antes de
       que esto existiera, que es exactamente lo que hace `useCoachPrefs` con su
       columna. Un error aquí no puede tumbar el arranque. */
    setEnvioRows(error ? [] : data || []);
    setEnviosReady(true);
  }, [session]);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      if (cancelado) return;
      await cargar();
    })();
    return () => {
      cancelado = true;
    };
  }, [cargar]);

  /**
   * Mandarle algo a varias personas: un formulario, un documento, un vídeo o
   * algo que te tengan que mandar ellos.
   *
   * ── Una sola puerta para los cuatro ───────────────────────────────────────
   * Antes esto solo sabía mandar formularios y lo demás se escribía en las
   * preferencias de cada cliente, con lo que eso arrastraba: sin fecha, sin
   * estado y declarando excepción de protocolo. Con la 0105 los cuatro caen en
   * la misma tabla, así que aquí solo hay una función y quien llama dice de qué
   * tipo es.
   *
   * ── Una escritura y no N ──────────────────────────────────────────────────
   * Las filas se insertan de una sola vez. Con un `insert` por persona, un fallo
   * a mitad dejaría a cuatro con ello y a uno sin él, y la pantalla diría
   * «mandado a 5». Así o entran todas o no entra ninguna, y lo que se cuenta es
   * lo que hay.
   */
  const mandarAccion = useCallback(
    async ({ tipo = 'form', formulario = null, titulo = '', enlace = '', audiencia, cuando, clientes, nota = '' }) => {
      const filas = filasDeEnvio({
        tipo,
        formulario,
        titulo,
        enlace,
        audiencia,
        cuando,
        clientes,
        nota,
        coachId: session?.user?.id || null,
      });
      if (filas.length === 0) return { ok: false, error: 'No hay a quién mandárselo.' };

      /* `coach_id` no es una columna de la tabla (ver 0099): el permiso sale de
         `client_id`. Se quita antes de escribir para no pedirle a PostgREST una
         columna que no existe. */
      const limpias = filas.map(({ coach_id: _coachId, ...fila }) => fila);

      const { data, error } = await supabase.from('client_actions').insert(limpias).select();
      if (error) return { ok: false, error: explicarError(error) };

      setEnvioRows((prev) => [...(data || []), ...prev]);
      return { ok: true, cuantos: (data || []).length };
    },
    [session]
  );

  /**
   * Dejar de pedir un envío entero.
   *
   * Borra las filas **que nadie ha entregado**: lo contestado no se tira. Quitar
   * de en medio una petición que ya no viene a cuento es una cosa; borrar la
   * respuesta de alguien que se molestó en darla es otra, y esta pantalla no
   * hace la segunda ni por descuido.
   */
  const dejarDePedir = useCallback(async (envioId) => {
    const { error } = await supabase
      .from('client_actions')
      .delete()
      .eq('envio_id', envioId)
      .is('submitted_at', null);
    if (error) return { ok: false, error: explicarError(error) };

    setEnvioRows((prev) => prev.filter((f) => f.envio_id !== envioId || f.submitted_at));
    return { ok: true };
  }, []);

  /** Quitarle a UNA persona lo que se le pidió. Mismo trato: si entregó, no. */
  const quitarPedido = useCallback(async (id) => {
    const { error } = await supabase
      .from('client_actions')
      .delete()
      .eq('id', id)
      .is('submitted_at', null);
    if (error) return { ok: false, error: explicarError(error) };
    setEnvioRows((prev) => prev.filter((f) => f.id !== id || f.submitted_at));
    return { ok: true };
  }, []);

  /**
   * Darla por hecha: lo que contesta el cliente, o lo que marca.
   *
   * Por RPC y no por `update`: la política de escritura de `client_actions` es
   * solo del entrenador a propósito —darle UPDATE al cliente le dejaría cambiar
   * el enunciado de lo que se le preguntó—. `marcar_accion` (0105) comprueba
   * quién llama y solo toca las respuestas y la fecha.
   *
   * Sin respuestas es «ya está»: un vídeo se abre y un encargo se marca. La
   * función deja intactas las que hubiera, así que abrir dos veces algo ya
   * contestado no lo vacía.
   */
  const marcarAccion = useCallback(async (id, answers = null) => {
    const { data, error } = await supabase.rpc('marcar_accion', {
      target: id,
      answers: answers || null,
    });
    if (error) return { ok: false, error: explicarError(error) };

    const cuando = data || new Date().toISOString();
    setEnvioRows((prev) =>
      prev.map((f) =>
        f.id === id
          ? { ...f, answers: answers || f.answers, submitted_at: f.submitted_at || cuando }
          : f
      )
    );
    return { ok: true };
  }, []);

  /**
   * Darlo por LEÍDO: lo que te han contestado y acabas de abrir.
   *
   * ── Por `update` y no por RPC, al revés que marcar ────────────────────────
   * Porque esto lo escribe el entrenador, y la política de escritura de la tabla
   * ya es suya (0099/0105). `marcar_accion` existe porque el CLIENTE no puede
   * escribir aquí; para este lado no hace falta ninguna puerta nueva.
   *
   * ── Y el estado local sale de lo que la base devolvió ─────────────────────
   * Con `.select()`, no de la lista que se mandó. Si RLS no deja tocar alguna
   * fila —un `viewer` del equipo, que lee y no escribe— la consulta no falla:
   * devuelve menos filas. Marcarlas en local igualmente sería enseñar como leído
   * lo que no se ha guardado, y al recargar volvería a salir.
   *
   * `is('seen_at', null)` para no reescribir la fecha cada vez que se abre: la
   * que interesa es la de la PRIMERA lectura.
   */
  const marcarVisto = useCallback(async (ids) => {
    const lista = (Array.isArray(ids) ? ids : [ids]).filter(Boolean);
    if (lista.length === 0) return { ok: true, cuantos: 0 };

    const { data, error } = await supabase
      .from('client_actions')
      .update({ seen_at: new Date().toISOString() })
      .in('id', lista)
      .is('seen_at', null)
      .select();
    if (error) return { ok: false, error: explicarError(error) };

    const vistas = new Map((data || []).map((f) => [f.id, f.seen_at]));
    if (vistas.size > 0) {
      setEnvioRows((prev) =>
        prev.map((f) => (vistas.has(f.id) ? { ...f, seen_at: vistas.get(f.id) } : f))
      );
    }
    return { ok: true, cuantos: vistas.size };
  }, []);

  return {
    /* El setter sale fuera para que la copia local (`lib/instantanea`) pueda
       sembrar la bandeja al arrancar sin red. Sin él, abrir en un sótano daba
       una cartera entera y cero envíos, que es peor que no dar nada: parece que
       nadie te ha contestado. */
    setEnvioRows,
    setEnviosReady,
    envioRows,
    enviosReady,
    reloadEnvios: cargar,
    mandarAccion,
    dejarDePedir,
    quitarPedido,
    marcarAccion,
    marcarVisto,
  };
};
