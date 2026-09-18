import { useMemo } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';

import { useApp } from '@/context/AppContext';
import { checkinQuestions, clientProtocol, hayRespuesta } from '@/domain/protocol';
import { shortDate } from '@/lib/dates';
import { useMediaQuery } from '@/lib/useMediaQuery';
import { useSemanaDeEntrega } from './useSemanaDeEntrega';
import { PantallaCuestionario } from './movil/PantallaCuestionario';

/**
 * `/mi/evolucion/cuestionario` — EL CUESTIONARIO DE LA SEMANA en el teléfono
 * (frame `128:195`, 18 sep 2026).
 *
 * Era el último paso del asistente, y sus respuestas vivían en memoria hasta
 * entregar: cerrar el asistente a medias las perdía. Ahora tiene su pantalla y
 * cada respuesta se guarda al darla, en la fila de la semana y SIN entregarla
 * (`save_check_in_answers`, migración 0121). La entrega las lleva cuando
 * llegue, porque va contra la misma fila.
 *
 * Las preguntas se pintan con `SessionFeedback`, el mismo componente con el
 * que su entrenador las lee: una pregunta se da y se lee con la misma forma.
 *
 * ── Es del teléfono ───────────────────────────────────────────────────────
 * En el monitor el cuestionario es el último paso del asistente. Y sin
 * preguntas en su protocolo esta pantalla no existe.
 */
export const ClientCuestionarioRoute = () => {
  const { activeClient, saveCheckInAnswers } = useApp();
  const navigate = useNavigate();
  const enMonitor = useMediaQuery('(min-width: 1024px)');
  const { semana, deEste, yaEntregada, cerrada, semanaFoto } = useSemanaDeEntrega();

  const preguntas = useMemo(
    () => (activeClient ? checkinQuestions(clientProtocol(activeClient.preferences)) : []),
    [activeClient]
  );

  if (!activeClient) return null;
  if (enMonitor || preguntas.length === 0) return <Navigate to="/mi/evolucion" replace />;

  const datos = {
    sub: [semanaFoto ? `Semana ${semanaFoto}` : null, `del ${shortDate(semana)}`].filter(Boolean).join(' · '),
    preguntas,
    iniciales: deEste?.answers || {},
    cerrada,
    yaEntregada,
    /* Solo las contestadas, como la entrega: una cadena en blanco guardada y
       una pregunta sin contestar se leerían igual. Ver `ReviewWizard`. */
    onGuardar: (answers) =>
      saveCheckInAnswers(activeClient.id, {
        weekStart: semana,
        answers: Object.fromEntries(Object.entries(answers).filter(([, v]) => hayRespuesta(v))),
      }),
    onVolver: () => (window.history.length > 1 ? navigate(-1) : navigate('/mi/evolucion')),
  };

  /* La `key` vuelve a sembrar las respuestas si cambia la semana que se
     entrega con la pantalla abierta (pasa la medianoche del lunes). */
  return <PantallaCuestionario key={semana} datos={datos} />;
};
