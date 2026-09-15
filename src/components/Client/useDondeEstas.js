import { useMemo } from 'react';

import { useApp } from '@/context/AppContext';
import { weeklyCheckIn } from '@/domain/anthropometry';
import { blockOfWeek, resolvedMicrocycles, weeksOfBlock } from '@/domain/blocks';
import { estadoDeLaEntrega } from '@/domain/calendar';
import { checkinQuestions, clientProtocol, weighInsTarget } from '@/domain/protocol';
import { unitLabel } from '@/domain/training';
import { todayISO } from '@/lib/dates';
import { pasosDeLaEntrega } from './PasosDeLaEntrega';
import { useOculto } from './Oculto';

/**
 * DÓNDE ESTÁS Y CÓMO VA TU SEMANA — la lectura que comparten la portada y el
 * carril del escritorio.
 *
 * ══ Por qué es un gancho ═══════════════════════════════════════════════════
 *
 * Vivía dentro de `ClientStart`. Con el puesto del monitor
 * (`docs/la-sesion-manda.md`) la misma pregunta la hace también el carril
 * lateral —«Hipertrofia II · semana 8 de 12», «2 de 3 pesajes · fotos
 * pendientes»— y el carril está en TODAS las pantallas del portal, no solo en
 * la portada. Dos copias de la cuenta acabarían diciendo «semana 8» en el
 * carril y «semana 9» en la portada el día que una se afinara.
 *
 * Nada de lo de aquí es nuevo: es exactamente lo que `ClientStart` calculaba,
 * movido tal cual.
 */
export const useDondeEstas = () => {
  const { activeClient, workoutData, anthropometry, checkIns, progressPhotos } = useApp();
  const oculto = useOculto();

  const program = workoutData?.[activeClient?.id];
  /* El plan RESUELTO: con el plan en el bloque, los ejercicios del microciclo
     viven en el bloque y sus `days` en crudo pueden estar vacíos. */
  const micros = useMemo(() => (program ? resolvedMicrocycles(program) : []), [program]);
  const historial = useMemo(
    () => anthropometry?.[activeClient?.id]?.history || [],
    [anthropometry, activeClient?.id]
  );

  if (!activeClient) return { program, micros, historial, cliente: null };

  /* Por dónde va, en una línea: «Fuerza II · microciclo 3 de 6». */
  const semanas = micros.map((m) => m.weekNumber).sort((a, b) => a - b);
  const semanaActual = semanas[semanas.length - 1] ?? null;
  const bloque = semanaActual !== null ? blockOfWeek(program, semanaActual) : null;
  const delBloque = bloque ? weeksOfBlock(program, bloque) : [];
  /* La unidad del entreno la dice el DOMINIO: con un ciclo rotativo de nueve
     días «semana» es falso. */
  const unidad = unitLabel(program?.cycleType);
  const cuantos = delBloque.length;
  const vaPor = cuantos > 0 ? delBloque.indexOf(semanaActual) + 1 : 0;
  const porDonde = bloque
    ? [bloque.name, cuantos > 0 ? `${unidad.toLowerCase()} ${vaPor} de ${cuantos}` : null]
        .filter(Boolean)
        .join(' · ')
    : null;

  /* El estado de su revisión: una cuenta del dominio y no cuatro líneas aquí. */
  const entrega = checkIns?.[activeClient.id];
  const protocolo = clientProtocol(activeClient.preferences);
  const { periodo, desde, sinEntregar } = estadoDeLaEntrega({
    preferences: activeClient.preferences,
    startDate: activeClient.startDate,
    entrega,
    today: todayISO(),
  });
  const resumen = weeklyCheckIn(historial, desde, {
    weeks: periodo?.everyWeeks || 1,
    target: weighInsTarget(protocolo),
  });

  /* Los pasos de la entrega, los mismos que enseña «Revisión». */
  const fotosDeLaSemana = new Set(
    (progressPhotos || []).filter((p) => p.clientId === activeClient.id && p.angle).map((p) => p.angle)
  );
  const pasos = pasosDeLaEntrega({
    protocol: protocolo,
    resumen,
    history: historial,
    fotos: fotosDeLaSemana,
    preguntas: checkinQuestions(protocolo),
    sinPeso: oculto.weight,
  });
  const pasosHechos = pasos.filter((p) => p.hecho).length;
  const loQueFalta = pasos.find((p) => !p.hecho);

  return {
    cliente: activeClient,
    program,
    micros,
    historial,
    semanaActual,
    bloque,
    unidad,
    cuantos,
    vaPor,
    porDonde,
    entrega,
    protocolo,
    periodo,
    desde,
    sinEntregar,
    resumen,
    pasos,
    pasosHechos,
    loQueFalta,
  };
};
