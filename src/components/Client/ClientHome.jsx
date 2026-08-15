import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, MessageSquareQuote, Send, Sunrise } from 'lucide-react';

import { useApp } from '@/context/AppContext';
import { weeklyCheckIn } from '@/domain/anthropometry';
import { currentCheckInPeriod } from '@/domain/calendar';
import { deliverableWeeks } from '@/domain/reviews';
import { shortDate, todayISO, weekStart } from '@/lib/dates';
import { Notice, Panel, SectionTitle } from '@/components/ui/primitives';
import { ClientUpdates } from './ClientUpdates';
import { ClientReviews } from './ClientReviews';
import { IntakeDeliverables } from './IntakeDeliverables';
import { ReviewHistory } from '@/components/ReviewHistory';

/**
 * «Hoy» del cliente: lo que le ha llegado y lo que tiene que hacer.
 *
 * ══ Por qué es su pantalla de entrada y no una más ══════════════════════════
 *
 * Su portal tenía seis secciones que son las tablas de la aplicación —progreso,
 * rutina, dieta, check-ins, fotos, calendario—, y ninguna contestaba la pregunta
 * con la que abre la aplicación: **«¿hay algo para mí y qué me toca?»**. Para
 * saberlo había que entrar en cuatro y comparar de memoria con la semana
 * anterior.
 *
 * ══ El círculo completo, que es lo que faltaba ══════════════════════════════
 *
 * Hasta ahora las piezas estaban y no se tocaban entre sí. Aquí se cierran:
 *
 *   1. Él sube su peso y sus fotos          → «Mis datos»
 *   2. **Entrega la semana**                → aquí abajo. Antes no existía: la
 *      función de la base (0009) no la llamaba nadie, así que el entrenador no
 *      podía saber si estaba esperando respuesta o simplemente no había acabado.
 *   3. El entrenador la mira y contesta     → su pasada semanal
 *   4. **Y él lee la respuesta**            → aquí, no en un WhatsApp enterrado
 *   5. Con la revisión en vídeo si la hubo  → abajo, incrustada
 *
 * ── Lo que sigue sin estar aquí, a propósito ────────────────────────────────
 * La conversación. Avisarle de que le has cambiado algo, preguntarle qué tal la
 * rodilla y mandarle un audio siguen siendo de WhatsApp, donde hay una persona.
 * Esta pantalla solo dice qué ha cambiado, qué falta y qué le has contestado.
 */
export const ClientHome = () => {
  const { activeClient, anthropometry, checkIns, submitCheckIn, loadCheckInHistory } = useApp();
  const [historial, setHistorial] = useState([]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  const history = useMemo(
    () => anthropometry?.[activeClient?.id]?.history || [],
    [anthropometry, activeClient?.id]
  );

  /* Su historial de check-ins, para saber cuáles ya entregó. `checkIns` solo
     guarda el más reciente, que no basta para mirar hacia atrás. */
  const cargarHistorial = useCallback(async () => {
    if (!activeClient?.id) return;
    const res = await loadCheckInHistory(activeClient.id);
    if (res.ok) setHistorial(res.checkIns);
  }, [activeClient?.id, loadCheckInHistory]);

  useEffect(() => {
    cargarHistorial();
  }, [cargarHistorial]);

  const hoy = todayISO();
  const semana = weekStart(hoy);
  const resumen = useMemo(() => weeklyCheckIn(history, hoy), [history, hoy]);

  /*
    El check-in del PERIODO vigente, no el de la semana natural.

    Con cadencia quincenal el periodo empezó hace dos semanas, así que comparar
    contra el lunes de hoy daba por no entregada una semana que sí lo estaba: al
    cliente le volvía a salir el botón de entregar dos días después de haberlo
    hecho, y su respuesta desaparecía de la pantalla.
  */
  const periodo = useMemo(
    () => currentCheckInPeriod(activeClient?.preferences, activeClient?.startDate, hoy),
    [activeClient?.preferences, activeClient?.startDate, hoy]
  );
  const desde = periodo?.start || semana;
  const entrega = checkIns?.[activeClient?.id];
  const deEstaSemana = entrega?.weekStart >= desde ? entrega : null;

  const atrasadas = useMemo(
    () =>
      deliverableWeeks({
        history,
        checkIns: historial,
        currentStart: desde,
        weekStartOf: weekStart,
      }),
    [history, historial, desde]
  );

  const entregar = async (semana = desde) => {
    setEnviando(true);
    const res = await submitCheckIn(activeClient.id, {
      weekStart: semana,
      /*
        El promedio DE ESA SEMANA, no el de esta.

        Se mandaba `resumen.average` siempre, que es el de la semana en curso: al
        entregar una atrasada, su check-in habría llegado con el peso de otra
        semana. Y el promedio y no el último pesaje porque filtra la variación
        diaria de agua, que es la misma razón por la que el formulario lo propone.
      */
      weight: weeklyCheckIn(history, semana).average,
    });
    setEnviando(false);
    setError(res.ok ? '' : res.error);
    /* Al entregar una atrasada hay que releer el historial: si no, el botón de
       esa semana seguiría ahí después de haberla mandado. */
    if (res.ok) cargarHistorial();
  };

  if (!activeClient) return null;

  return (
    <div className="stack">
      <div className="section-head">
        <div>
          <h2>Hoy</h2>
          <p>Lo que ha cambiado, lo que te falta y lo que te ha dicho tu entrenador.</p>
        </div>
      </div>

      {/* Novedades y pendientes. Se pinta solo cuando tiene algo que decir. */}
      <ClientUpdates client={activeClient} />

      {/* ── Tu semana ─────────────────────────────────────────────────────── */}
      <Panel className="col gap-3">
        <SectionTitle icon={Sunrise}>Tu semana</SectionTitle>

        {error && <Notice tone="error">{error}</Notice>}

        {deEstaSemana?.reviewedAt ? (
          <>
            <p className="t-sm">
              <Check size={14} style={{ display: 'inline', verticalAlign: -2, marginRight: 4, color: 'var(--positive)' }} />
              Tu entrenador ha revisado tu semana.
            </p>

            {/*
              LA RESPUESTA. Es la columna `coach_notes`, que existía desde la
              migración 0009 y no se pintaba en ninguna pantalla: se podía
              escribir y no se podía leer. Aquí es donde tenía que estar desde el
              principio — es lo único de todo esto que el cliente esperaba de
              verdad.
            */}
            {deEstaSemana.coachNotes && (
              <div className="card-inset col gap-1">
                <span className="t-2xs t-tertiary">
                  <MessageSquareQuote size={11} style={{ display: 'inline', verticalAlign: -1, marginRight: 4 }} />
                  Lo que te dice
                </span>
                <p className="t-sm" style={{ whiteSpace: 'pre-wrap' }}>
                  {deEstaSemana.coachNotes}
                </p>
              </div>
            )}
          </>
        ) : deEstaSemana?.submittedAt ? (
          <p className="t-sm t-secondary">
            Ya has entregado la semana. Tu entrenador la está mirando; te avisará por aquí.
          </p>
        ) : (
          <>
            <p className="t-sm t-secondary">
              Llevas <strong>{resumen.count}</strong> de {resumen.target} pesajes. Cuando lo tengas
              todo, entrégala para que tu entrenador la revise.
            </p>

            {/*
              Se puede entregar aunque falte algo, a propósito.

              Un botón que se apaga hasta tener los tres pesajes deja fuera la
              semana que se ha ido de viaje —que es justo la que hay que contar—.
              Se avisa de lo que falta y decide él: quien mira al otro lado es una
              persona, no una validación.
            */}
            <div className="row gap-2 wrap">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={enviando}
                onClick={entregar}
              >
                <Send size={14} /> {enviando ? 'Entregando…' : 'Entregar mi semana'}
              </button>
              {!resumen.complete && (
                <span className="t-xs t-tertiary">
                  Puedes entregarla igualmente; se verá lo que hayas registrado.
                </span>
              )}
            </div>
          </>
        )}

        {/*
          ══ Y las semanas que se quedaron sin entregar ═════════════════════════

          Te pesaste el martes, se te pasó darle a entregar y el domingo ya era
          otra semana. Hasta ahora esa semana se perdía: solo se podía entregar la
          actual, así que sus datos quedaban registrados y su entrenador nunca los
          veía como algo que responder.

          Solo aparecen las que TIENEN datos suyos: ofrecer entregar una semana en
          blanco sería ofrecerle mandar un sobre vacío.
        */}
        {atrasadas.length > 0 && (
          <div className="col gap-2">
            <span className="t-2xs t-tertiary">Se te quedaron sin entregar:</span>
            <div className="row gap-2 wrap">
              {atrasadas.map((semana) => (
                <button
                  key={semana}
                  type="button"
                  className="chip chip-dashed"
                  disabled={enviando}
                  onClick={() => entregar(semana)}
                >
                  <Send size={12} /> Semana del {shortDate(semana)}
                </button>
              ))}
            </div>
          </div>
        )}
      </Panel>

      {/* Sus revisiones en vídeo y lo que le dejó preparado al darle de alta. Las
          dos cosas son material del entrenador, y viven donde llegan las cosas. */}
      <ClientReviews client={activeClient} />

      {/* Y lo que le fue diciendo semana a semana, con los cambios que hizo en su
          plan. Es su historia con el entrenador, y hasta ahora no la tenía en
          ninguna parte. */}
      <ReviewHistory client={activeClient} audience="client" excludeId={deEstaSemana?.id} />

      <IntakeDeliverables client={activeClient} />
    </div>
  );
};
