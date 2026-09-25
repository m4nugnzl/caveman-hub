import { useCallback, useEffect, useRef, useState } from 'react';

import { supabase } from '@/lib/supabaseClient';
import { planesConMovidas } from '@/domain/planDeSesiones';

/*
  ══ El plan de las sesiones y sus atrasos (0138), en su gancho ══════════════

  Con la convención de `useEnvios`: posee su estado, su carga y sus acciones, y
  los dos lados leen LA MISMA consulta sin filtro. Quien filtra es RLS: el
  entrenador ve las filas de sus clientes y el cliente las suyas.

  ── Lo que escribe cada uno ────────────────────────────────────────────────
  El cliente atrasa y deshace; el entrenador da por visto. Las tres cosas van
  por funciones de la base, que son las que comprueban las reglas.

  ── Deshacer espera al atraso ──────────────────────────────────────────────
  «Deshacer» puede pulsarse con el atraso todavía en camino. Si la orden de
  deshacer llegara antes, no encontraría nada que deshacer y el atraso se
  guardaría después: el entrenador recibiría un aviso de algo deshecho. Por eso
  cada atraso guarda su promesa y deshacer la espera.
*/

const TOPE = 500;

const explicar = (error) => error?.message || 'No se ha podido guardar. Inténtalo otra vez.';

const nuevoId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });

export const usePlanDeSesiones = ({ session }) => {
  const [sessionPlans, setSessionPlans] = useState([]);
  const [sessionDelays, setSessionDelays] = useState([]);
  /* id del atraso → { promesa, antes }: lo que deshacer necesita. */
  const enCamino = useRef(new Map());
  /* Lo último pintado, para leerlo fuera de un `set`: sus funciones corren
     cuando React quiere, no cuando se llaman. */
  const planesRef = useRef(sessionPlans);
  planesRef.current = sessionPlans;
  const atrasosRef = useRef(sessionDelays);
  atrasosRef.current = sessionDelays;

  const cargar = useCallback(async () => {
    if (!session?.user?.id) {
      setSessionPlans([]);
      setSessionDelays([]);
      return;
    }
    const [planes, atrasos] = await Promise.all([
      supabase.from('session_plans').select('*').limit(2000),
      supabase.from('session_delays').select('*').order('created_at', { ascending: false }).limit(TOPE),
    ]);
    /* Sin la 0138 las tablas no existen: el calendario enseña el plan por
       defecto y nada más se rompe. Un error aquí no puede tumbar el arranque. */
    setSessionPlans(planes.error ? [] : planes.data || []);
    setSessionDelays(atrasos.error ? [] : atrasos.data || []);
  }, [session]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  /**
   * Atrasa: se ve al momento y se manda. Devuelve `{ ok, id }` o `{ ok:false, error }`.
   */
  const atrasarSesiones = useCallback(async (clientId, { desde, dias, movidas }) => {
    const id = nuevoId();
    const antes = planesRef.current;
    setSessionPlans(planesConMovidas(antes, clientId, movidas));
    const fila = { id, client_id: clientId, desde, dias, movidas, created_at: new Date().toISOString(), seen_at: null };
    setSessionDelays((filas) => [fila, ...filas]);

    const promesa = supabase.rpc('atrasar_sesiones', {
      p_id: id,
      p_client: clientId,
      p_desde: desde,
      p_dias: dias,
      p_movidas: movidas,
    });
    enCamino.current.set(id, { promesa, antes });

    const { error } = await promesa;
    if (error) {
      enCamino.current.delete(id);
      setSessionPlans(antes);
      setSessionDelays((filas) => filas.filter((f) => f.id !== id));
      return { ok: false, error: explicar(error) };
    }
    return { ok: true, id };
  }, []);

  /** El «Deshacer» del aviso. */
  const deshacerAtraso = useCallback(async (id) => {
    const suyo = enCamino.current.get(id);
    if (suyo?.antes) setSessionPlans(suyo.antes);
    setSessionDelays((filas) => filas.filter((f) => f.id !== id));
    if (suyo) await suyo.promesa;
    enCamino.current.delete(id);

    const { error } = await supabase.rpc('deshacer_atraso', { p_id: id });
    if (error) {
      await cargar();
      return { ok: false, error: explicar(error) };
    }
    return { ok: true };
  }, [cargar]);

  /** El entrenador lo da por visto: al abrir su Entreno o al descartarlo. */
  const verAtrasos = useCallback(async (clientId) => {
    if (!atrasosRef.current.some((f) => f.client_id === clientId && !f.seen_at)) return { ok: true };
    const ahora = new Date().toISOString();
    setSessionDelays((filas) =>
      filas.map((f) => (f.client_id !== clientId || f.seen_at ? f : { ...f, seen_at: ahora }))
    );
    const { error } = await supabase.rpc('ver_atrasos', { p_client: clientId });
    if (error) {
      await cargar();
      return { ok: false, error: explicar(error) };
    }
    return { ok: true };
  }, [cargar]);

  return { sessionPlans, sessionDelays, reloadPlanDeSesiones: cargar, atrasarSesiones, deshacerAtraso, verAtrasos };
};
