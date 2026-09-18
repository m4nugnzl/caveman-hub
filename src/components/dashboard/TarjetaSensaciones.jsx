import { useMemo } from 'react';
import { Link } from 'react-router-dom';

import { activeQuestions, checkinQuestions } from '@/domain/protocol';
import { feedbackAdherence, lastFeedback } from '@/domain/readiness';
import { answerTrend } from '@/domain/reviews';
import { shortDate } from '@/lib/dates';
import { PROTOCOL_HOME } from '@/routes';
import { Subjetivo } from '@/components/ui/Subjetivo';
import { Tarjeta, TarjetaVacia } from './Tarjeta';

/**
 * CÓMO LO LLEVA — lo que él cuenta, en dos momentos.
 *
 * Al cerrar la semana (el check-in) y al acabar de entrenar (la sesión). Son la
 * misma clase de dato —una escala con su color— desde dos sitios, y van en una
 * tarjeta separados por un filete, no en dos: «ha hecho el 95 % de sus series»
 * y «lleva tres semanas con la fatiga en 9» es una conclusión distinta de cada
 * una por separado.
 *
 * Las barras son `ui/Subjetivo`, las mismas del panel de la semana y de la hoja
 * de Entreno: lo subjetivo se dibuja igual en todo el producto.
 *
 * ── Y cada fila es una PUERTA a su tendencia (tanda 2, 6 sep) ───────────────
 * «¿El sueño lleva tres semanas cayendo?» no se contesta con el último valor.
 * Las curvas YA existen —las del check-in en el «a fondo» del cuerpo («Lo que
 * cuenta cada semana») y las de sesión en el del entreno—, así que la fila no
 * estrena ventana: lleva a la que hay. Una tendencia por pregunta en ventana
 * propia sería duplicar lo que esas dos ya dibujan.
 */
export const TarjetaSensaciones = ({
  checkIns,
  microcycles,
  protocol,
  span = 4,
  isClient = false,
  onAbrirCuerpo = null,
  onAbrirEntreno = null,
}) => {
  const preguntasSemana = useMemo(() => checkinQuestions(protocol), [protocol]);
  const escalas = useMemo(
    () => answerTrend({ checkIns, questions: preguntasSemana, weeks: 52 }),
    [checkIns, preguntasSemana]
  );
  const ultimas = useMemo(
    () => Object.fromEntries(escalas.map((r) => [r.id, r.points[r.points.length - 1]?.value])),
    [escalas]
  );
  const cuando = escalas[0]?.points.at(-1)?.label ?? null;

  const preguntasSesion = useMemo(() => activeQuestions(protocol), [protocol]);
  const ultima = useMemo(() => lastFeedback(microcycles, preguntasSesion), [microcycles, preguntasSesion]);
  const contestado = useMemo(
    () => Object.fromEntries((ultima?.values || []).map((v) => [v.question.id, v.value])),
    [ultima]
  );
  const respuestas = useMemo(() => feedbackAdherence(microcycles), [microcycles]);

  const sinNada = escalas.length === 0 && (!ultima || ultima.values.length === 0);
  const noPregunta = preguntasSemana.length === 0 && preguntasSesion.length === 0;

  return (
    /* El frame la titula «Adherencia & Sensaciones». Se queda con su nombre de
       casa: la ley de la voz dice que las cosas se llaman por lo que la persona
       reconoce, no por el término técnico, y «adherencia» es jerga de la
       profesión puesta encima de siete palabras que son sueño, hambre y ganas.
       Lo que sí se copia del frame es la FORMA de la fila: el nombre suelto a la
       izquierda y la barra con su cifra alineadas a la derecha. */
    <Tarjeta rotulo={isClient ? 'Cómo lo llevas' : 'Cómo lo lleva'} span={span} className="lo-lleva" vacia={sinNada}>
      {sinNada ? (
        <TarjetaVacia
          /* El vacío con su verbo (Q-05): si no se le pregunta nada, el sitio
             donde se arregla está a un clic, no en una frase. El otro vacío
             —preguntas puestas y nadie contestando— no tiene verbo del coach:
             contestar es del cliente. */
          accion={
            noPregunta && !isClient ? (
              <Link className="cab-accion is-puerta" to={PROTOCOL_HOME}>
                Elegir sus preguntas
              </Link>
            ) : null
          }
        >
          {noPregunta
            ? isClient
              ? 'Tu entrenador todavía no te pregunta nada al cerrar la semana.'
              : 'No se le pregunta nada al cerrar la semana ni al entrenar.'
            : isClient
              ? 'Lo que contestes al cerrar la semana y al acabar de entrenar, aquí.'
              : 'Todavía no ha contestado ningún check-in ni ninguna sesión.'}
        </TarjetaVacia>
      ) : (
        <>
          {/* El CUÁNDO sale del troquel y se dice en caja normal: en una columna
              de 300 px, «AL ACABAR DE ENTRENAR · 25 AGO · PULL A» troquelado
              entero parte en dos líneas y deja huérfana la última palabra. El
              rótulo dice de qué es la escala; la fecha solo la sitúa. */}
          {escalas.length > 0 && (
            <section className="sensaciones-tramo">
              <h3 className="bloque-titulo">
                Al cerrar la semana{cuando && <span className="cuando">{shortDate(cuando)}</span>}
              </h3>
              <Subjetivo preguntas={preguntasSemana} answers={ultimas} onFila={onAbrirCuerpo} />
            </section>
          )}
          {ultima && ultima.values.length > 0 && (
            <section className="sensaciones-tramo">
              <h3 className="bloque-titulo">
                Al acabar de entrenar
                {(ultima.date || ultima.dayName) && (
                  <span className="cuando">
                    {[ultima.date && shortDate(ultima.date), ultima.dayName].filter(Boolean).join(' · ')}
                  </span>
                )}
              </h3>
              <Subjetivo preguntas={preguntasSesion} answers={contestado} onFila={onAbrirEntreno} />
              {respuestas && (
                <p className="tarjeta-pie">
                  Contesta el {respuestas.pct} % de sus sesiones ({respuestas.answered} de {respuestas.sessions}).
                </p>
              )}
            </section>
          )}
        </>
      )}
    </Tarjeta>
  );
};
