import { useMemo } from 'react';

import { useApp } from '@/context/AppContext';
import { weeklyWeightAverages, weightSeries } from '@/domain/anthropometry';
import { blockOfWeek, clientCycleSlots, resolvedMicrocycles, weeksOfBlock } from '@/domain/blocks';
import { directionById, targetRateKg } from '@/domain/goals';
import { cycleAverage, dayKcalTarget, targetsFor } from '@/domain/nutrition';
import { effectiveGoal } from '@/domain/roadmap';
import { allSessions, sessionSetCount, sessionTonnage } from '@/domain/sessions';
import { unitLabel } from '@/domain/training';
import { localeNumber, miles, shortDate, todayISO } from '@/lib/dates';
import { useMediaQuery } from '@/lib/useMediaQuery';
import { Dashboard } from '@/components/dashboard/Dashboard';
import { useOculto } from './Oculto';
import { PantallaProgreso as ProgresoEnTelefono } from './movil/PantallaProgreso';

/**
 * `/mi/progreso` — LO HISTÓRICO, y solo lo histórico.
 *
 * ══ Qué recogió esta pantalla cuando se creó ═══════════════════════════════
 *
 * Las lecturas que estaban dispersas y estorbando donde estaban: «Cómo va tu
 * dieta», que vivía en el costado de `/mi/dieta` y en el teléfono caía debajo de
 * las comidas —*«que la dieta sea solo la dieta»*—, y «Desde que empezaste», que
 * era una de las cinco pilas que hacían del inicio algo engorroso.
 *
 * ══ EL MONITOR VUELVE AL PANEL DEL ENTRENADOR (14 sep 2026, tarde) ═════════
 *
 * Por la mañana esta ruta dejó de montar `Dashboard audience="client"` y lo
 * cambió por cuatro teselas y cuatro cajas propias. El argumento era la avería
 * E-07 —cinco matices de dato en la misma vista— y la cuenta de tarjetas.
 *
 * El dueño lo vio montado y lo tumbó el mismo día: *«progreso es mucho más
 * pobre que lo que existe en entrenador»*, *«mismas gráficas, similar
 * estructura»*. Y midiendo, tiene razón por dos sitios:
 *
 *   · **Lo que se perdió no era decoración.** El panel trae la trayectoria con
 *     su banda, la curva del peso contra la escalera de lo pautado, la fuerza y
 *     el volumen, el subjetivo semana a semana y DOS ventanas «a fondo» con las
 *     tablas enteras. Las cuatro cajas de la mañana contestaban una fracción.
 *   · **Y las gráficas eran otras.** `pc/Piezas` traía `Curva` y `Barras`
 *     hechas a mano, con su propio eje y su propia escala, para dibujar el mismo
 *     peso que el entrenador ve con `BandChart`. Dos dibujos del mismo dato
 *     divergen: el suyo tenía banda de confianza y media móvil, y el del cliente
 *     una polilínea cruda. Podían contar cosas distintas del mismo peso.
 *
 * La avería E-07 no se ignora: se arregla donde estaba, en el panel, y para los
 * dos. `Oculto` sigue mandando —a quien tiene el peso oculto se le retiran las
 * tarjetas del peso enteras, con sus ventanas—, e `isClient` sigue quitando lo
 * que es del entrenador: el hilo, los enlaces para tocar el plan y la escalera
 * de kcal, que él abre en pasos.
 *
 * ── El teléfono NO cambia ─────────────────────────────────────────────────
 * *«Para el móvil la visión no me disgusta»*. El panel es de monitor: son doce
 * piezas en dos columnas. Todo el cálculo de abajo es suyo y solo suyo, y por
 * eso el monitor sale por arriba antes de hacerlo.
 *
 * ── Sigue sin haber ninguna receta ────────────────────────────────────────
 * Ni un ritmo con semáforo, ni un 1RM estimado, ni «te toca subir». Son
 * recuentos y curvas: la aplicación resalta información y el criterio es del
 * entrenador. Ver `la app no receta`.
 */
export const ClientProgresoRoute = () => {
  const { activeClient, anthropometry, nutrition, workoutData, phases, checkIns } = useApp();
  const enMonitor = useMediaQuery('(min-width: 1024px)');
  const oculto = useOculto();

  const guardado = workoutData?.[activeClient?.id];
  /* Los microciclos RESUELTOS: con el plan en el bloque, los `days` en crudo
     pueden estar vacíos y los totales darían cero para todo el que haya
     migrado. Misma resolución que hace la rutina. */
  const micros = useMemo(() => (guardado ? resolvedMicrocycles(guardado) : []), [guardado]);
  const historial = useMemo(
    () => anthropometry?.[activeClient?.id]?.history || [],
    [anthropometry, activeClient?.id]
  );
  const casillas = useMemo(
    () => (activeClient ? clientCycleSlots(activeClient, guardado) : []),
    [activeClient, guardado]
  );

  if (!activeClient) return null;

  /*
    EL MONITOR SALE POR AQUÍ, y a propósito antes de todo el cálculo de abajo.

    El panel se lo calcula todo él a partir del contexto —no recibe ni una
    prop—, así que dejarlo caer al final habría hecho el trabajo del teléfono
    (las medias semanales, el tonelaje por microciclo, el volumen por grupo, las
    filas del plan) para tirarlo a la basura en cada render del monitor.

    `.layout` es el mismo envoltorio con el que el entrenador lo monta en
    `/c/:id/resumen`: el panel es un contenedor de consulta y se coloca solo
    dentro. Ver `Dashboard`.
  */
  if (enMonitor) {
    return (
      <div className="layout">
        <Dashboard audience="client" />
      </div>
    );
  }

  const program = guardado ? { ...guardado, microcycles: micros } : guardado;
  const unidad = unitLabel(program?.cycleType);
  const plan = nutrition?.[activeClient.id];

  /* ── El peso ──────────────────────────────────────────────────────────── */
  const pesajes = weightSeries(historial);
  const semanal = weeklyWeightAverages(historial);
  const objetivo = effectiveGoal(activeClient, phases, todayISO())?.targetWeightKg ?? null;
  const primero = pesajes[0]?.value ?? null;
  const ultimo = pesajes[pesajes.length - 1]?.value ?? null;
  const total = pesajes.length > 1 ? ultimo - primero : null;
  const verPeso = !oculto.weight && pesajes.length > 0;

  /* ── El entreno ───────────────────────────────────────────────────────── */
  const sesiones = allSessions(micros);
  const series = sesiones.reduce((n, s) => n + sessionSetCount(s), 0);
  const semanas = micros.map((m) => m.weekNumber).sort((a, b) => a - b);
  const semanaActual = semanas[semanas.length - 1] ?? null;
  const bloque = semanaActual !== null ? blockOfWeek(program, semanaActual) : null;
  const delBloque = bloque ? weeksOfBlock(program, bloque) : semanas;

  /* Lo que movió en cada microciclo del bloque. Una barra por microciclo y la
     última, la de ahora, en acento. */
  const tonelajes = delBloque.map((w) =>
    sesiones
      .filter((s) => s.weekNumber === w)
      .reduce((n, s) => n + sessionTonnage(s), 0)
  );

  /* El recuento de series por grupo muscular se fue con la pantalla del
     monitor: era la única que lo pintaba, y el panel ya trae su volumen. */

  /* ── El plan, como filas ────────────────────────────────────────────────
     Los macros se guardan como `proteinGrams / carbsGrams / fatsGrams` y las
     kcal pueden ser cero en un plan por macros —la cifra se deduce de ellos—,
     así que la energía la da `dayKcalTarget` y no el campo escrito. Es la misma
     regla que usan la dieta y la portada. */
  const crudo = plan ? targetsFor(plan, null) : null;
  const macros = {
    protein: Number(crudo?.proteinGrams) || 0,
    carbs: Number(crudo?.carbsGrams) || 0,
    fats: Number(crudo?.fatsGrams) || 0,
  };
  const media = cycleAverage(plan, casillas);
  const meta = effectiveGoal(activeClient, phases, todayISO());
  const direccion = meta ? directionById(meta.direction) : null;
  /* El objetivo en kg por semana, que es la unidad en la que se piensa: el
     `ratePct` es un porcentaje del peso y sin el peso no se puede convertir. */
  const ritmoPedido = meta && ultimo ? targetRateKg(meta, ultimo) : null;
  const sinCifras = oculto.nutrition;
  const kcalDelPlan = plan ? dayKcalTarget(plan, null) : 0;
  const filasDelPlan = [
    direccion
      ? {
          rotulo: 'Objetivo',
          frase:
            ritmoPedido !== null && ritmoPedido !== 0
              ? `${localeNumber(ritmoPedido, { maximumFractionDigits: 2 })} kg por semana`
              : null,
          cifra: direccion.label,
        }
      : null,
    !sinCifras && (media > 0 || kcalDelPlan > 0)
      ? {
          rotulo: 'Calorías',
          frase:
            macros.protein + macros.carbs + macros.fats > 0
              ? `P ${Math.round(macros.protein)} · C ${Math.round(macros.carbs)} · G ${Math.round(macros.fats)}`
              : null,
          cifra: miles(Math.round(media > 0 ? media : kcalDelPlan)),
        }
      : null,
    plan?.stepsGoal
      ? { rotulo: 'Pasos', frase: 'al día', cifra: miles(plan.stepsGoal) }
      : null,
    delBloque.length > 0
      ? {
          rotulo: 'Entreno',
          frase: `${(micros.find((m) => m.weekNumber === semanaActual)?.days || []).length} sesiones por ${unidad.toLowerCase()}`,
          cifra: `${series} series`,
        }
      : null,
  ].filter(Boolean);

  const entregadas = Object.values(checkIns || {}).filter(
    (c) => c?.clientId === activeClient.id && (c.submittedAt || c.reviewedAt)
  ).length;

  /* ── Y el teléfono ────────────────────────────────────────────────────── */
  const datosMovil = {
    cabecera: {
      fecha: 'Tu progreso',
      donde: activeClient.startDate ? `desde el ${shortDate(activeClient.startDate)}` : null,
    },
    record:
      sesiones.length > 0
        ? [
            { v: miles(sesiones.length), k: 'sesiones' },
            { v: enMiles(sesiones.reduce((n, s) => n + sessionTonnage(s), 0)), k: 'kg movidos' },
            { v: String(entregadas), k: 'entregas' },
          ]
        : null,
    peso: verPeso
      ? {
          ahora: kg(ultimo),
          delta:
            total !== null
              ? `${total > 0 ? '+' : '−'}${kg(Math.abs(total))} kg`
              : null,
          sube: total !== null && total > 0,
          puntos: semanal.map((p) => p.value),
          desde: pesajes.length > 0 ? shortDate(pesajes[0].date) : '',
          objetivo: objetivo ? kg(objetivo) : null,
        }
      : null,
    tonelaje: tonelajes,
    plan: filasDelPlan,
  };

  return <ProgresoEnTelefono datos={datosMovil} />;
};

/* El peso SIEMPRE con su decimal: la báscula da uno, y quitarlo hace dudar de
   si la cifra está redondeada. */
const kg = (v) => localeNumber(v, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const enMiles = (n) => (n >= 10000 ? `${Math.round(n / 1000)}k` : miles(Math.round(n)));
