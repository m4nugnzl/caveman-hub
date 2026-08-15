import { useMemo, useState } from 'react';
import { MessageSquare, NotebookPen, Quote } from 'lucide-react';

import { activeQuestions, asksFeedback, scaleQuestions } from '@/domain/protocol';
import {
  buildFeedbackSeries,
  feedbackAdherence,
  feedbackLabels,
  feedbackLog,
  questionStats,
} from '@/domain/readiness';
import { localeNumber, shortDate } from '@/lib/dates';
import { BandChart } from '@/components/ui/charts';
import { ChartCard } from '@/components/ui/ChartCard';
import { Delta } from '@/components/ui/metrics';
import { Notice, Panel, SectionTitle } from '@/components/ui/primitives';

/**
 * El histórico de sensaciones.
 *
 * ══ Por qué esto vive en Analítica y no solo en el resumen ══════════════════
 *
 * El resumen tiene una cifra y una línea: contesta «¿cómo va?». Esto contesta
 * «¿qué ha pasado?», que es otra pregunta y necesita otra forma.
 *
 * Un gráfico de promedios semanales es lo correcto para leer la tendencia y
 * borra justo lo que hace falta cuando ves un pico: qué día fue y qué escribió
 * ese día. Por eso aquí hay las DOS cosas —la serie y el registro— y no una
 * versión más grande del gráfico del panel.
 *
 * ── El registro es la parte que faltaba ─────────────────────────────────────
 * Todo lo que el cliente contesta se estaba guardando desde el principio dentro
 * de su sesión, pero solo se podía leer abriendo el día concreto de la semana
 * concreta. Es decir: el dato existía y el historial no. Aquí está entero, de lo
 * más reciente a lo más antiguo, con las notas de los dos lados.
 */

const AnswerPill = ({ row }) => {
  const { question, value } = row;

  if (question.kind === 'text') {
    return (
      <span className="log-answer is-text" title={question.label}>
        {value}
      </span>
    );
  }

  return (
    <span className="log-answer" title={`${question.label}: ${value} sobre ${question.max ?? 10}`}>
      <span className="k">{question.short || question.label}</span>
      <span className="v" style={{ color: question.color }}>
        {value}
      </span>
    </span>
  );
};

export const FeedbackHistory = ({ microcycles, protocol, audience = 'coach' }) => {
  const [expanded, setExpanded] = useState(false);
  const isClient = audience === 'client';

  const questions = useMemo(() => activeQuestions(protocol), [protocol]);
  const scales = useMemo(() => scaleQuestions(protocol), [protocol]);

  const series = useMemo(() => buildFeedbackSeries(microcycles, scales), [microcycles, scales]);
  const stats = useMemo(
    () => scales.map((q) => questionStats(microcycles, q)).filter(Boolean),
    [microcycles, scales]
  );
  const log = useMemo(() => feedbackLog(microcycles, questions), [microcycles, questions]);
  const adherence = useMemo(() => feedbackAdherence(microcycles), [microcycles]);

  /* El protocolo apagado no es un estado vacío: es que esto no existe para este
     cliente. Enseñar «sin datos» invitaría a buscar dónde se rellenan. */
  if (!asksFeedback(protocol)) return null;

  const visible = expanded ? log : log.slice(0, 8);

  return (
    <section className="stack-sm">
      <SectionTitle icon={MessageSquare}>
        {isClient ? 'Cómo te has sentido' : 'Cómo se ha sentido'}
      </SectionTitle>

      {log.length === 0 ? (
        <Panel>
          <p className="t-sm t-secondary">
            {isClient
              ? 'Todavía no has contestado ninguna sesión. Al terminar de entrenar aparecen las preguntas debajo de tus ejercicios.'
              : 'Todavía no ha contestado ninguna sesión. Las preguntas le aparecen al terminar de entrenar, debajo de sus ejercicios.'}
          </p>
        </Panel>
      ) : (
        <>
          {/*
            La adherencia AL FORMULARIO, arriba del todo y como aviso cuando es
            baja. Es la cifra que dice si estas series se pueden creer: un 20 % de
            respuesta no es un cliente estable, es un formulario abandonado, y sin
            este número los huecos del gráfico parecen datos.
          */}
          {adherence && adherence.pct < 60 && (
            <Notice tone="warn">
              {isClient
                ? `Has contestado ${adherence.answered} de tus ${adherence.sessions} sesiones (${adherence.pct} %). Cuantas más contestes, mejor se lee tu evolución.`
                : `Solo contesta ${adherence.pct} % de sus sesiones (${adherence.answered} de ${adherence.sessions}). Con tan pocas respuestas, estas líneas dicen poco: o le sobran preguntas, o hay que recordárselo.`}
            </Notice>
          )}

          {stats.length > 0 && (
            <div className="grid-auto">
              {stats.map((stat) => (
                <article className="widget" key={stat.id}>
                  <header className="widget-head">
                    <span className="widget-title">{stat.short}</span>
                  </header>
                  <span className="widget-sub">
                    última semana · {stat.count} {stat.count === 1 ? 'sesión' : 'sesiones'}
                  </span>
                  <div className="row gap-2 wrap" style={{ alignItems: 'baseline' }}>
                    <span className="widget-value" style={{ color: stat.color }}>
                      {stat.value}
                      <span className="metric-unit"> / {stat.max}</span>
                    </span>
                    {/* El RPE no tiene dirección buena ni mala —un 9 puede ser lo
                        previsto—, así que no lleva píldora de variación: pintarla
                        de rojo o verde afirmaría un juicio que nadie ha hecho. */}
                    {!stat.neutral && (
                      <Delta value={stat.delta} lowerIsBetter={stat.lowerIsBetter} />
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}

          {series.length > 0 && (
            <ChartCard
              title="Semana a semana"
              subtitle="Promedio de las sesiones de cada semana"
            >
              <BandChart
                labels={feedbackLabels(series)}
                series={series}
                height={190}
                showArea={false}
                emptyMessage="Sin respuestas suficientes todavía."
              />
            </ChartCard>
          )}

          {/* ── El registro ───────────────────────────────────────────────── */}
          <Panel className="col gap-3">
            <div className="row between wrap gap-2">
              <span className="section-title">Sesión a sesión</span>
              <span className="t-xs t-tertiary">
                {log.length} {log.length === 1 ? 'sesión contestada' : 'sesiones contestadas'}
              </span>
            </div>

            <ul className="log-list">
              {visible.map((entry) => (
                <li className="log-entry" key={entry.id}>
                  <div className="log-when">
                    <span className="d">{shortDate(entry.date)}</span>
                    <span className="s">{entry.dayName}</span>
                  </div>

                  <div className="log-body">
                    {entry.values.length > 0 && (
                      <div className="log-answers">
                        {entry.values.map((row) => (
                          <AnswerPill key={row.question.id} row={row} />
                        ))}
                      </div>
                    )}

                    {entry.coachNote && (
                      <p className="log-note">
                        <Quote size={11} /> {entry.coachNote}
                      </p>
                    )}
                    {entry.clientNote && (
                      <p className="log-note is-client">
                        <NotebookPen size={11} /> {entry.clientNote}
                      </p>
                    )}
                  </div>

                  {entry.tonnage > 0 && (
                    <span className="log-tonnage">{localeNumber(entry.tonnage)} kg</span>
                  )}
                </li>
              ))}
            </ul>

            {log.length > visible.length && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setExpanded(true)}>
                Ver las {log.length - visible.length} anteriores
              </button>
            )}
          </Panel>
        </>
      )}
    </section>
  );
};
