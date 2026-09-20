import { useMemo } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';

import { useApp } from '@/context/AppContext';
import { buildWeightLog, weekDates, weightSeries } from '@/domain/anthropometry';
import { clientCycleSlots, inicialDelDia } from '@/domain/blocks';
import { cycleFoto } from '@/domain/nutrition';
import { effectiveGoal } from '@/domain/roadmap';
import { localeNumber, todayISO, weekStart } from '@/lib/dates';
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
 * Si ese día ya hay un registro —el peso de esa mañana, o las medidas— se
 * CORRIGE su peso y nada más. `addAnthropometryLog` sustituye el registro de
 * la fecha entero, y usarlo aquí se llevaría las medidas que apuntaste antes.
 *
 * ══ Y SE PUEDE APUNTAR CUALQUIER DÍA DE LA SEMANA ══════════════════════════
 *
 * Esto escribía contra `todayISO()` y solo contra él: el rótulo decía «peso de
 * hoy» y no había forma de poner el de ayer. Lo reportó un cliente que se pesa
 * a diario y transcribe la semana entera el domingo, porque los pesajes se le
 * quedan guardados en la aplicación de su báscula — que es el caso normal de
 * quien tiene una báscula que hace de báscula.
 *
 * El precio de no poder era grande y silencioso: la media del periodo, que es
 * la cifra con la que su entrenador decide el ajuste, salía de UN pesaje en vez
 * de siete. Y el renglón de la entrega le decía «te pide 3 pesajes y llevas 1».
 *
 * Así que la tira de los siete días deja de ser un indicador y pasa a ser el
 * mando: se toca un día y se apunta el suyo. Sin pantalla nueva y sin selector
 * de fecha aparte — el sitio donde se mira qué días faltan es el sitio donde se
 * rellenan.
 *
 * ── Hacia atrás, no hacia delante ─────────────────────────────────────────
 * Los días que aún no han llegado no se ofrecen. Un peso con fecha futura no es
 * un dato que nadie tenga: es un número inventado entrando en la media.
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
  const objetivo = effectiveGoal(activeClient, phases, hoy)?.targetWeightKg ?? null;

  /*
    Se apunta contra LA FECHA QUE SE ELIGE, y el registro de ese día manda: si ya
    existe —porque se pesó y luego se midió, o al revés— se corrige su peso y se
    deja lo demás en pie. `addAnthropometryLog` sustituye el día entero, que es
    lo correcto para una revisión y se llevaría por delante unas medidas aquí.
  */
  const apuntar = (peso, fecha = hoy) => {
    if (fecha > hoy) return;
    const delDia = history.find((h) => h.date === fecha) || null;
    if (delDia?.id) updateAnthropometryLog(activeClient.id, delDia.id, { weight: peso });
    else addAnthropometryLog(activeClient.id, buildWeightLog({ date: fecha, weight: peso, nutritionFoto: foto }));
  };

  /*
    LOS SIETE DÍAS DE SU SEMANA, cada uno con lo que tenga apuntado. Es la tira
    que ya estaba —los días con pesaje en tinta— convertida en mando: se elige
    uno y se escribe el suyo.

    La semana es la NATURAL de hoy y no la del periodo que se entrega: ésta es
    la pantalla de pesarse, que es diario, y la casilla de hoy tiene que estar
    siempre dentro. Los días que no han llegado se pintan pero no se pueden
    tocar (ver la cabecera).
  */
  const lunes = weekStart(hoy);
  const dias = weekDates(lunes).map((fecha) => {
    const log = history.find((h) => h.date === fecha);
    const valor = log && log.weight !== null && log.weight !== '' ? Number(log.weight) : null;
    return {
      date: fecha,
      inicial: inicialDelDia(fecha),
      peso: Number.isFinite(valor) ? valor : null,
      esHoy: fecha === hoy,
      futuro: fecha > hoy,
    };
  });

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
    dias,
    hoy,
    /* Con el día vacío, la cifra viene puesta con el último pesaje: es lo que
       hace que apuntar sean dos gestos y no cinco. */
    ultimo: ultimo?.value ?? null,
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
