import { useMemo, useState } from 'react';
import { Check, MessageSquareQuote, Send, Sunrise, SlidersHorizontal } from 'lucide-react';

import { useApp } from '@/context/AppContext';
import { weeklyCheckIn } from '@/domain/anthropometry';
import { currentCheckInPeriod } from '@/domain/calendar';
import { deliverableWeeks } from '@/domain/reviews';
import { shortDate, todayISO, weekStart } from '@/lib/dates';
import { Notice, Panel, SectionTitle } from '@/components/ui/primitives';
import { ClientReviews } from './ClientReviews';
import { ReviewHistory } from '@/components/ReviewHistory';
import { PlanChanges } from '@/components/review/PlanChanges';
import { useReviewRows } from '@/components/review/useReviewRows';

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
/**
 * @param onDeliver  Abre el asistente de revisión para entregar la semana en
 *   curso. Lo pasa la ruta, que es quien tiene al asistente como hermano de esta
 *   tarjeta.
 */
export const ClientWeek = ({ client, onDeliver }) => {
  const { anthropometry, checkIns, submitCheckIn } = useApp();
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  const history = useMemo(
    () => anthropometry?.[client?.id]?.history || [],
    [anthropometry, client?.id]
  );

  /*
    Su historial, UNA sola vez para toda la pantalla.

    Hacen falta las dos formas: la lista cruda para saber qué semanas ya entregó
    —`checkIns` del contexto solo guarda la más reciente— y las revisiones
    cerradas, con los cambios de plan de cada una, tanto para la respuesta de
    esta semana como para el panel de las anteriores. Antes esto se pedía dos
    veces: aquí para lo primero, y otra vez dentro de `ReviewHistory`.
  */
  const { rows: revisiones, checkIns: historial, recargar } = useReviewRows(client?.id);

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

  /**
   * Entregar una semana ATRASADA, y solo eso.
   *
   * La del periodo en curso pasa por el asistente (`onDeliver`), donde se
   * confirma el peso y se suben las fotos. Una atrasada no: sus datos están
   * registrados desde entonces y ya no hay nada que rellenar —las fotos de hace
   * tres semanas no se pueden hacer hoy—. Mandarla es exactamente eso, mandar lo
   * que ya hay.
   *
   * Por eso la ventana es siempre de UNA semana natural: las atrasadas se ofrecen
   * sueltas (ver `deliverableWeeks`), nunca como periodo de dos.
   */
  const entregar = async (inicio) => {
    setEnviando(true);
    const res = await submitCheckIn(client.id, {
      weekStart: inicio,
      weight: weeklyCheckIn(history, inicio, { weeks: 1 }).average,
    });
    setEnviando(false);
    setError(res.ok ? '' : res.error);
    /* Al entregar una atrasada hay que releer el historial: si no, el botón de
       esa semana seguiría ahí después de haberla mandado. */
    if (res.ok) recargar();
  };

  if (!client) return null;

  const sinEntregar = !deEstaSemana?.submittedAt && !deEstaSemana?.reviewedAt;

  /* La revisión de esta semana ya cerrada, con lo que le cambió el entrenador.
     Sale del historial y no de `checkIns`, porque el diff necesita también la
     foto del plan de la revisión ANTERIOR. */
  const revisada = revisiones.find((r) => r.id === deEstaSemana?.id) || null;
  const hayCambios = Boolean(revisada && (revisada.changes.length || revisada.structure.length));

  return (
    <div className="stack">
      {/* La lumbre solo mientras la semana está POR entregar: es la única
          decisión de esta pantalla y el uso exacto que los tokens le reservan a
          esa luz. Entregada, la tarjeta vuelve a ser una más — lo que queda es
          leer, no decidir. */}
      <Panel className={`col gap-3${sinEntregar ? ' card-lumbre' : ''}`}>
        <SectionTitle icon={Sunrise}>Tu semana</SectionTitle>

        {error && <Notice tone="error">{error}</Notice>}

        {deEstaSemana?.reviewedAt ? (
          <>
            <p className="t-sm">
              <Check size={14} className="icon-inline" style={{ color: 'var(--positive)' }} />
              Tu entrenador ha revisado tu semana.
            </p>

            {/* LA RESPUESTA. Es lo único de todo esto que el cliente esperaba de
                verdad, así que va en grande y lo primero. */}
            {deEstaSemana.coachNotes && (
              <div className="card-inset col gap-1">
                <span className="t-2xs t-tertiary">
                  <MessageSquareQuote size={11} className="icon-inline" />
                  Lo que te dice
                </span>
                <p className="t-sm pre-wrap">{deEstaSemana.coachNotes}</p>
              </div>
            )}

            {/*
              ══ Y LO QUE TE CAMBIA, aquí y no en otra pantalla ═══════════════

              Al tocarle la dieta o la rutina le salta «tu dieta ha cambiado» en
              su inicio, y eso es todo lo que sabía: un aviso que no dice QUÉ
              obliga a ir a buscarlo, comparar de memoria con lo que había y
              acabar preguntando por WhatsApp. El «280 → 240 g» existía desde la
              migración 0042 pero solo se pintaba en «revisiones anteriores», o
              sea al fondo de la pantalla y una semana tarde.

              Va DEBAJO del texto a propósito: primero se lee por qué —que es lo
              que ha escrito una persona— y después qué, que es la consecuencia.
              Sin respuesta escrita, los cambios se sostienen solos.
            */}
            {hayCambios && (
              <div className="card-inset col gap-2">
                <span className="t-2xs t-tertiary">
                  <SlidersHorizontal size={11} className="icon-inline" />
                  Lo que te cambia esta semana
                </span>
                <PlanChanges changes={revisada.changes} structure={revisada.structure} />
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
            {/*
              ══ Entregar ABRE LA REVISIÓN, ya no manda a ciegas ═══════════════

              Eran dos gestos separados en la misma pantalla: este botón creaba
              el check-in con el promedio de pesajes, y «Entregar mi revisión»
              —debajo, en la otra tarjeta— era el asistente de peso, medidas y
              fotos. Ninguno de los dos nombres decía que el otro existía.

              El resultado: quien hacía el asistente entero creía haber mandado
              su semana y no había mandado nada, y quien pulsaba este botón
              entregaba sin fotos ni medidas. Dos formas de hacer mal la misma
              tarea.

              Ahora hay una: el asistente. Confirma el peso, se mide si su
              entrenador lo pide, sube las fotos, contesta lo que le pregunten, y
              al terminar la semana queda entregada.
            */}
            {/* A tamaño completo: es LA acción de la semana —el gesto que cierra
                el círculo del producto— y estaba en un botón pequeño, con el
                mismo peso que un «Cancelar» cualquiera. */}
            <div className="row gap-3 wrap">
              <button type="button" className="btn btn-primary btn-lg" onClick={onDeliver}>
                <Send size={16} /> Entregar mi semana
              </button>
              <span className="t-xs t-tertiary">
                {resumen.complete
                  ? 'Confirmas el peso, subes las fotos y ya está.'
                  : 'Puedes entregarla igualmente; se verá lo que hayas registrado.'}
              </span>
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
      <ReviewHistory
        client={client}
        audience="client"
        rows={revisiones}
        recargar={recargar}
        excludeId={deEstaSemana?.id}
      />
    </div>
  );
};
