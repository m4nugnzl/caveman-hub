import { useCallback, useEffect, useMemo, useState } from 'react';

import { supabase } from '@/lib/supabaseClient';
import { claveDeEjercicio } from '@/domain/sessions';

/*
  ══ Los ajustes del cliente (0139), en su gancho ════════════════════════════

  «Banco al 3», «multipower»: lo que vale para un ejercicio siempre, en
  cualquier microciclo y rutina. Viven en `exercise_settings`, por cliente y
  por la clave del ejercicio (`claveDeEjercicio`: su nombre normalizado).

  Con la convención de `usePlanDeSesiones`: posee su estado, su carga y sus
  acciones. Quien filtra lo que ve cada uno es RLS; quien decide lo que puede
  hacer, también: el cliente fija, edita y quita; su entrenador lee y quita.
  La pantalla solo ofrece lo que la base va a aceptar.

  ── Solo con conexión ─────────────────────────────────────────────────────
  No entra en la cola de guardado sin conexión: fijar sin red dice que no se
  ha guardado y la etiqueta no aparece. Una etiqueta que se ve y luego
  desaparece al recargar sería peor que un aviso.
*/

const SIN_RED = 'Sin conexión: no se ha guardado. Inténtalo cuando tengas red.';

const explicar = (error) => {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return SIN_RED;
  return error?.message || 'No se ha podido guardar. Inténtalo otra vez.';
};

const sinRed = () => typeof navigator !== 'undefined' && navigator.onLine === false;

export const TOPE_AJUSTE = 80;

/* Dos ajustes iguales en el mismo ejercicio no dicen nada nuevo: se comparan
   sin mayúsculas ni espacios de más. */
const igual = (a, b) =>
  String(a || '').trim().replace(/s+/g, ' ').toLowerCase() === String(b || '').trim().replace(/s+/g, ' ').toLowerCase();
const REPETIDO = 'Ya tienes ese ajuste en este ejercicio.';

export const useAjustesDeEjercicio = (clientId) => {
  const [filas, setFilas] = useState([]);

  const cargar = useCallback(async () => {
    if (!clientId) {
      setFilas([]);
      return;
    }
    const { data, error } = await supabase
      .from('exercise_settings')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: true })
      .limit(1000);
    /* Sin la 0139 la tabla no existe: no hay etiquetas y nada más se rompe. */
    setFilas(error ? [] : data || []);
  }, [clientId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  /* Por clave, para que cada ejercicio pregunte sin recorrer todas. */
  const porClave = useMemo(() => {
    const mapa = new Map();
    for (const f of filas) {
      const lista = mapa.get(f.exercise_key) || [];
      lista.push(f);
      mapa.set(f.exercise_key, lista);
    }
    return mapa;
  }, [filas]);

  const ajustesDe = useCallback((nombre) => porClave.get(claveDeEjercicio(nombre)) || [], [porClave]);

  /** Fija un ajuste nuevo. `{ ok }` o `{ ok:false, error }`. */
  const fijar = useCallback(
    async (nombre, texto) => {
      const limpio = String(texto || '').trim();
      const clave = claveDeEjercicio(nombre);
      if (!clientId || !clave || !limpio) return { ok: false, error: 'Escribe el ajuste antes de fijarlo.' };
      if (limpio.length > TOPE_AJUSTE) return { ok: false, error: `Un ajuste cabe en ${TOPE_AJUSTE} caracteres.` };
      if ((porClave.get(clave) || []).some((f) => igual(f.text, limpio))) return { ok: false, error: REPETIDO };
      if (sinRed()) return { ok: false, error: SIN_RED };
      const { data, error } = await supabase
        .from('exercise_settings')
        .insert({ client_id: clientId, exercise_key: clave, text: limpio })
        .select()
        .single();
      if (error) return { ok: false, error: explicar(error) };
      setFilas((antes) => [...antes, data]);
      return { ok: true };
    },
    [clientId, porClave]
  );

  /** Cambia el texto de un ajuste. */
  const editar = useCallback(async (id, texto) => {
    const limpio = String(texto || '').trim();
    if (!limpio) return { ok: false, error: 'Un ajuste no puede quedarse vacío.' };
    const fila = filas.find((f) => f.id === id);
    if (fila && filas.some((f) => f.id !== id && f.exercise_key === fila.exercise_key && igual(f.text, limpio))) {
      return { ok: false, error: REPETIDO };
    }
    if (limpio.length > TOPE_AJUSTE) return { ok: false, error: `Un ajuste cabe en ${TOPE_AJUSTE} caracteres.` };
    if (sinRed()) return { ok: false, error: SIN_RED };
    const { data, error } = await supabase
      .from('exercise_settings')
      .update({ text: limpio })
      .eq('id', id)
      .select()
      .single();
    if (error) return { ok: false, error: explicar(error) };
    setFilas((antes) => antes.map((f) => (f.id === id ? data : f)));
    return { ok: true };
  }, [filas]);

  /** Quita un ajuste. Lo puede hacer el cliente y su entrenador. */
  const quitar = useCallback(async (id) => {
    if (sinRed()) return { ok: false, error: SIN_RED };
    const { data, error } = await supabase.from('exercise_settings').delete().eq('id', id).select('id');
    if (error) return { ok: false, error: explicar(error) };
    /* RLS no da error si no deja borrar: simplemente no borra nada. */
    if (!data || data.length === 0) return { ok: false, error: 'No se ha podido quitar este ajuste.' };
    setFilas((antes) => antes.filter((f) => f.id !== id));
    return { ok: true };
  }, []);

  return { ajustesDe, fijar, editar, quitar, recargarAjustes: cargar };
};
