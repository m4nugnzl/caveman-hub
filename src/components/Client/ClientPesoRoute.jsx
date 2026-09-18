import { useMemo } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';

import { useApp } from '@/context/AppContext';
import { buildWeightLog, weightSeries } from '@/domain/anthropometry';
import { clientCycleSlots } from '@/domain/blocks';
import { cycleFoto } from '@/domain/nutrition';
import { effectiveGoal } from '@/domain/roadmap';
import { localeNumber, todayISO } from '@/lib/dates';
import { useMediaQuery } from '@/lib/useMediaQuery';
import { useOculto } from './Oculto';
import { PantallaPeso } from './movil/PantallaPeso';

/**
 * `/mi/evolucion/peso` — EL REGISTRO DE PESO (frame `328:206`, 18 sep 2026).
 *
 * Hasta aquí el peso se apuntaba en la báscula de la revisión, que era una
 * casilla dentro de otra pantalla. El dibujo le da la suya: la cifra en grande,
 * la línea de las dos últimas semanas con sus medias, el mando para apuntar el
 * de hoy y los últimos pesajes con lo que cambió cada uno.
 *
 * ── Es del teléfono ───────────────────────────────────────────────────────
 * En el monitor el peso se apunta en la caja de su revisión, que tiene el
 * ancho para hacerlo al lado de lo demás. Quien llega aquí con una pantalla
 * ancha va a su revisión.
 *
 * ── Apuntar no pisa el día ────────────────────────────────────────────────
 * Si hoy ya hay un registro —el peso de esta mañana, o las medidas— se
 * CORRIGE su peso y nada más. `addAnthropometryLog` sustituye el registro de
 * la fecha entero, y usarlo aquí se llevaría las medidas que apuntaste antes.
 */
export const ClientPesoRoute = () => {
  const {
    activeClient,
    anthropometry,
    nutrition,
    workoutData,
    phases,
    addAnthropometryLog,
    updateAnthropometryLog,
  } = useApp();
  const navigate = useNavigate();
  const oculto = useOculto();
  const enMonitor = useMediaQuery('(min-width: 1024px)');

  const history = useMemo(
    () => anthropometry?.[activeClient?.id]?.history || [],
    [anthropometry, activeClient?.id]
  );

  const foto = useMemo(
    () =>
      activeClient
        ? cycleFoto(nutrition[activeClient.id], clientCycleSlots(activeClient, workoutData?.[activeClient.id]))
        : null,
    [nutrition, workoutData, activeClient]
  );

  if (!activeClient) return null;
  if (enMonitor || oculto.weight) return <Navigate to="/mi/evolucion" replace />;

  const hoy = todayISO();
  const pesajes = weightSeries(history);
  const ultimo = pesajes[pesajes.length - 1] || null;
  const previo = pesajes.length > 1 ? pesajes[pesajes.length - 2] : null;
  const deHoy = history.find((h) => h.date === hoy) || null;
  const objetivo = effectiveGoal(activeClient, phases, hoy)?.targetWeightKg ?? null;

  const apuntar = (peso) => {
    if (deHoy?.id) updateAnthropometryLog(activeClient.id, deHoy.id, { weight: peso });
    else addAnthropometryLog(activeClient.id, buildWeightLog({ date: hoy, weight: peso, nutritionFoto: foto }));
  };

  const datos = {
    ahora: ultimo ? kg(ultimo.value) : null,
    delta: ultimo && previo ? `${conSigno(ultimo.value - previo.value)} kg desde el anterior` : null,
    /* Las dos últimas semanas, y no los cuarenta pesajes: es lo que cabe
       leerse de un vistazo antes de subirse a la báscula. */
    tendencia: pesajes.filter((p) => p.date >= haceDias(hoy, 13)),
    medias: [
      { k: 'Media 7 días', v: media(pesajes, haceDias(hoy, 6)) },
      { k: 'Media 30 días', v: media(pesajes, haceDias(hoy, 29)) },
      { k: 'Objetivo', v: objetivo ? kg(objetivo) : null },
    ].filter((m) => m.v !== null),
    propuesta: deHoy && deHoy.weight !== null && deHoy.weight !== '' ? Number(deHoy.weight) : ultimo?.value ?? null,
    yaHoy: deHoy && deHoy.weight !== null && deHoy.weight !== '' ? Number(deHoy.weight) : null,
    onApuntar: apuntar,
    ultimos: [...pesajes]
      .reverse()
      .slice(0, 6)
      .map((p, i, lista) => ({
        date: p.date,
        valor: kg(p.value),
        cambio: lista[i + 1] ? conSigno(p.value - lista[i + 1].value) : null,
      }))
      .slice(0, 5),
    onVolver: () => (window.history.length > 1 ? navigate(-1) : navigate('/mi/evolucion')),
  };

  return <PantallaPeso datos={datos} />;
};

const kg = (v) => localeNumber(v, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** «+0,1», «−0,3», «0,0»: el cambio con su signo y en tinta, sin juzgarlo. */
const conSigno = (d) => {
  const r = Math.round(d * 10) / 10;
  if (r === 0) return '0,0';
  return `${r > 0 ? '+' : '−'}${kg(Math.abs(r))}`;
};

const haceDias = (hoy, n) => {
  const d = new Date(`${hoy}T12:00:00`);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

/** La media de los pesajes desde una fecha, o `null` si no hay ninguno. */
const media = (pesajes, desde) => {
  const suyos = pesajes.filter((p) => p.date >= desde);
  if (suyos.length === 0) return null;
  return kg(suyos.reduce((a, p) => a + p.value, 0) / suyos.length);
};
