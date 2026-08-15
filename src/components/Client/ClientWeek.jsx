import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, MessageSquareQuote, Send, Sunrise } from 'lucide-react';

import { useApp } from '@/context/AppContext';
import { weeklyCheckIn } from '@/domain/anthropometry';
import { currentCheckInPeriod } from '@/domain/calendar';
import { deliverableWeeks } from '@/domain/reviews';
import { shortDate, todayISO, weekStart } from '@/lib/dates';
import { Notice, Panel, SectionTitle } from '@/components/ui/primitives';
import { ClientReviews } from './ClientReviews';
import { ReviewHistory } from '@/components/ReviewHistory';

/**
 * Tu semana: entregarla, y leer lo que te ha contestado tu entrenador.
 *
 * ══ Por qué esto vive con el check-in y ya no en una pantalla propia ════════
 *
 * Estaba en «Hoy», una sección para él solo. Y «Hoy» tenía un problema de fondo:
 * **la mayoría de los días no tenía nada que decir**. Una pantalla que casi
 * siempre está vacía es una pantalla que se deja de abrir, y cuando por fin tiene
 * algo —la respuesta de su entrenador, que es el momento que cierra el círculo
 * entero del producto— ya nadie entra a mirarla.
 *
 * Entregar la semana es el mismo gesto que pesarse y hacerse las fotos: se hace
 * el mismo día, de una sentada. Así que vive donde se hace, al final de su
 * check-in, y lo que su entrenador conteste aparece aquí mismo la próxima vez.
 *
 * Lo urgente no se pierde por el camino: los avisos siguen saliendo en su inicio
 * y en la campana de la cabecera, que es donde se miran en un móvil.
 */
export const ClientWeek = ({ client }) => {
  const { anthropometry, checkIns, submitCheckIn, loadCheckInHistory } = useApp();
  const [historial, setHistorial] = useState([]);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  const history = useMemo(
    () => anthropometry?.[client?.id]?.history || [],
    [anthropometry, client?.id]
  );

  /* Su historial de check-ins, para saber cuáles ya entregó. `checkIns` solo
     guarda el más reciente, que no basta para mirar hacia atrás. */
  const cargarHistorial = useCallback(async () => {
    if (!client?.id) return;
    const res = await loadCheckInHistory(client.id);
    if (res.ok) setHistorial(res.checkIns);
  }, [client?.id, loadCheckInHistory]);

  useEffect(() => {
    cargarHistorial();
  }, [cargarHistorial]);

  const hoy = todayISO();
  const semana = weekStart(hoy);

  /*
    El check-in del PERIODO vigente, no el de la semana natural.

    Con cadencia quincenal el periodo empezó hace dos semanas, así que comparar
    contra el lunes de hoy daba por no entregada una semana que sí lo estaba: al
    cliente le volvía a salir el botón de entregar dos días después de haberlo
    hecho, y su respuesta desaparecía de la pantalla.
  */
  const periodo = useMemo(
    () => currentCheckInPeriod(client?.preferences, client?.startDate, hoy),
    [client?.preferences, client?.startDate, hoy]
  );
  const desde = periodo?.start || semana;
  const cadaSemanas = periodo?.everyWeeks || 1;

  /*
    El resumen se mide sobre EL PERIODO, no sobre la semana natural de hoy.

    Con cadencia quincenal eran dos ventanas distintas: el contador decía «3 de 3
    pesajes» mirando esta semana, y el peso que se guardaba al entregar salía de
    la PRIMERA semana del periodo. Si el cliente se había pesado solo en la
    segunda, entregaba con el contador lleno y el check-in se guardaba sin peso.
  */
  const resumen = useMemo(
    () => weeklyCheckIn(history, desde, { weeks: cadaSemanas }),
    [history, desde, cadaSemanas]
  );

  const entrega = checkIns?.[client?.id];
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

  const entregar = async (inicio = desde) => {
    setEnviando(true);
    /*
      El promedio DE ESE PERIODO, no el de este.

      Al entregar una atrasada, el peso tiene que ser el de aquella semana. Y una
      atrasada siempre es una semana natural suelta, mientras que la del periodo
      vigente puede abarcar varias — de ahí que la ventana solo sea la del periodo
      cuando se entrega el periodo en curso.
    */
    const ventana = inicio === desde ? cadaSemanas : 1;
    const res = await submitCheckIn(client.id, {
      weekStart: inicio,
      weight: weeklyCheckIn(history, inicio, { weeks: ventana }).average,
    });
    setEnviando(false);
    setError(res.ok ? '' : res.error);
    /* Al entregar una atrasada hay que releer el historial: si no, el botón de
       esa semana seguiría ahí después de haberla mandado. */
    if (res.ok) cargarHistorial();
  };

  if (!client) return null;

  return (
    <div className="stack">
      <Panel className="col gap-3">
        <SectionTitle icon={Sunrise}>Tu semana</SectionTitle>

        {error && <Notice tone="error">{error}</Notice>}

        {deEstaSemana?.reviewedAt ? (
          <>
            <p className="t-sm">
              <Check
                size={14}
                style={{ display: 'inline', verticalAlign: -2, marginRight: 4, color: 'var(--positive)' }}
              />
              Tu entrenador ha revisado tu semana.
            </p>

            {/* LA RESPUESTA. Es lo único de todo esto que el cliente esperaba de
                verdad, así que va en grande y lo primero. */}
            {deEstaSemana.coachNotes && (
              <div className="card-inset col gap-1">
                <span className="t-2xs t-tertiary">
                  <MessageSquareQuote
                    size={11}
                    style={{ display: 'inline', verticalAlign: -1, marginRight: 4 }}
                  />
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
                onClick={() => entregar()}
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
              {atrasadas.map((inicio) => (
                <button
                  key={inicio}
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={enviando}
                  onClick={() => entregar(inicio)}
                >
                  <Send size={12} /> Semana del {shortDate(inicio)}
                </button>
              ))}
            </div>
          </div>
        )}
      </Panel>

      {/* Sus revisiones en vídeo. Son la otra forma de la misma respuesta. */}
      <ClientReviews client={client} />

      {/* Y lo que le fue diciendo semana a semana, con los cambios que hizo en su
          plan. Es su historia con el entrenador. */}
      <ReviewHistory client={client} audience="client" excludeId={deEstaSemana?.id} />
    </div>
  );
};
