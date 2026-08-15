import { useState } from 'react';
import { Check, ChevronDown, ChevronRight, ClipboardCheck, Images, MessageSquare } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { currentCheckInPeriod } from '@/domain/calendar';
import { reviewQueue } from '@/domain/portfolio';
import { clientPath } from '@/routes';
import { Panel, SectionTitle } from '@/components/ui/primitives';
import { useReviewSession } from './ReviewSession';

/**
 * Las revisiones que tienes pendientes. Solo esas.
 *
 * ══ Lo que cambió respecto de la primera versión ════════════════════════════
 *
 * Listaba a los veinte clientes cada semana. Una lista que sale entera siempre no
 * es una lista de pendientes: es la cartera con otro título, y se deja de mirar
 * en dos semanas.
 *
 * Ahora manda **la cadencia de cada uno** (`domain/calendar.js`): quien revisa
 * cada dos semanas no aparece la semana que no le toca, y quien no tiene día
 * fijado no aparece nunca — no se puede llegar tarde a una cita que nadie ha
 * puesto. Si no hay nada pendiente, este panel no existe.
 *
 * ══ Dos cosas distintas, y no se mezclan ═══════════════════════════════════
 *
 *   · **Te espera** — subió su peso y sus fotos. Eso es trabajo tuyo.
 *   · **Sin subir** — le tocaba y no lo ha hecho. Eso es un recordatorio, y no
 *     se atiende igual: no hay nada que mirar todavía.
 *
 * ══ Y qué se hace con cada uno ═════════════════════════════════════════════
 *
 *   · «Revisar» abre lo que ha subido —sus fotos contra las de la vez anterior,
 *     con el peso al lado—, que es lo único que hace falta para decidir.
 *   · «Seguimos igual» cierra sin cambios, en un toque. Es la mayoría de las
 *     veces, y durante meses.
 *   · «Contestar» escribe la respuesta, que él lee en su «Hoy».
 *   · «Ajustar» abre su plan cuando sí hay que tocar algo.
 *
 * ── Por qué el «seguimos igual» deja rastro ─────────────────────────────────
 * Porque es información: dentro de tres meses permite contestar «llevas nueve
 * semanas sin tocarle nada», que hoy no tiene respuesta. Se guarda en la nota del
 * check-in —la columna de la 0009 que no usaba nadie—.
 */

const ESTADOS = {
  ready: { label: 'Te espera', tone: 'badge-warn' },
  missing: { label: 'Sin subir', tone: '' },
};

/** Lo que se guarda al cerrar sin cambios. Es texto y no un booleano porque va a
    la misma nota que escribirías tú, y así el histórico se lee de corrido. */
const SIN_CAMBIOS = 'Sin cambios: seguimos igual.';

export const ReviewQueue = ({ rows, onReview }) => {
  const navigate = useNavigate();
  const { start } = useReviewSession();
  const [abierto, setAbierto] = useState(true);
  const [enCurso, setEnCurso] = useState(null);
  const [escribiendo, setEscribiendo] = useState(null);
  const [texto, setTexto] = useState('');

  /*
    Lo que necesita la barra para poder cerrar la revisión: a quién, qué fila hay
    que marcar y —si no hay ninguna porque el cliente no llegó a entregar— en qué
    semana crearla.
  */
  const abrir = (row) => ({
    clientId: row.client.id,
    name: row.client.name,
    checkInId: row.review.id || null,
    weekStart:
      currentCheckInPeriod(row.client.preferences, row.client.startDate)?.start ||
      row.checkIn.weekStart,
  });

  const lista = reviewQueue(rows);
  if (lista.length === 0) return null;

  const pendientes = lista.filter((r) => r.review_state === 'ready').length;

  return (
    <Panel className="col gap-3">
      <div className="row between wrap gap-2">
        <SectionTitle icon={ClipboardCheck}>Revisiones</SectionTitle>

        {/*
          El contador cuenta lo que hay que HACER, no las filas: los «sin subir»
          están en la lista para que puedas reclamarlos, pero no son trabajo tuyo
          y sumarlos al número haría parecer que tienes ocho revisiones cuando
          tienes tres.
        */}
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          aria-expanded={abierto}
          onClick={() => setAbierto((v) => !v)}
        >
          {abierto ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          {pendientes === 0
            ? `${lista.length} sin subir`
            : `${pendientes} por revisar`}
        </button>
      </div>

      {abierto && (
        <div className="list">
          {lista.map((row) => {
            const estado = ESTADOS[row.review_state];
            const id = row.client.id;
            /* Solo se puede cerrar la semana de quien tiene una fila de check-in
               de verdad (migración 0009). Sin ella no hay nada que marcar, y
               ofrecer el botón sería prometer algo que va a fallar. */
            const puedeCerrar = row.review_state === 'ready' && row.review.exact && row.review.id;

            return (
              <div className="list-row" key={id}>
                <span className="list-row-label" style={{ minWidth: 0 }}>
                  <span className="title row gap-2 wrap">
                    {row.client.name}
                    <span className={`badge ${estado.tone}`}>{estado.label}</span>
                  </span>
                  <span className="sub">
                    {/* El titular ya calculado; si no hay, las dos cifras que
                        siempre existen. Nunca las dos cosas: la fila tiene que
                        leerse de un vistazo. */}
                    {row.headline
                      ? row.headline
                      : [
                          `${row.checkIn.count}/${row.checkIn.target} pesajes`,
                          row.sinceTraining === null
                            ? 'sin entrenos'
                            : `entrenó hace ${row.sinceTraining} d`,
                        ].join(' · ')}
                  </span>
                </span>

                {puedeCerrar && (
                  <>
                    <button
                      type="button"
                      className="chip"
                      disabled={enCurso === id}
                      title="Cierra su semana y le llega que está vista"
                      onClick={async () => {
                        setEnCurso(id);
                        await onReview(row.review.id, SIN_CAMBIOS, id);
                        setEnCurso(null);
                      }}
                    >
                      <Check size={12} /> {enCurso === id ? 'Guardando…' : 'Seguimos igual'}
                    </button>

                    {/* Y decirle algo, que es la otra mitad de las semanas. Se
                        despliega en su fila en vez de abrir otra pantalla: dos
                        frases no merecen perder el sitio de la pasada. */}
                    <button
                      type="button"
                      className="chip"
                      aria-expanded={escribiendo === id}
                      onClick={() => setEscribiendo(escribiendo === id ? null : id)}
                    >
                      <MessageSquare size={12} /> Contestar
                    </button>
                  </>
                )}

                {/*
                  «Revisar» ABRE LA REVISIÓN, no solo navega.

                  Antes llevaba a las fotos y ahí se acababa: una vez dentro no
                  había forma de cerrarla ni de contestar, así que era lo mismo
                  que entrar al cliente por el carril de siempre. Ahora arranca el
                  modo (`ReviewSession`) y la barra de abajo te acompaña por donde
                  vayas —fotos, dieta, rutina— hasta que la cierras con el visto o
                  contestando.

                  Y aterriza en las fotos porque es lo primero que se mira: las
                  suyas contra las de la vez anterior, con el peso al lado.
                */}
                {row.review_state === 'ready' && (
                  <button
                    type="button"
                    className="chip"
                    onClick={() => {
                      start(abrir(row));
                      navigate(clientPath(id, 'fotos'));
                    }}
                  >
                    <Images size={12} /> Revisar
                  </button>
                )}

                {/* Ajustar entra por el plan, pero también dentro de la revisión:
                    lo que toques ahí le llegará como cambio, y al terminar puedes
                    cerrarla sin volver aquí. */}
                <button
                  type="button"
                  className="chip"
                  onClick={() => {
                    start(abrir(row));
                    navigate(clientPath(id, 'rutina'));
                  }}
                >
                  Ajustar
                </button>

                {escribiendo === id && (
                  <form
                    className="col gap-2"
                    style={{ flexBasis: '100%' }}
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const limpio = texto.trim();
                      if (!limpio) return;
                      setEnCurso(id);
                      await onReview(row.review.id, limpio, id);
                      setEnCurso(null);
                      setTexto('');
                      setEscribiendo(null);
                    }}
                  >
                    <textarea
                      autoFocus
                      className="textarea"
                      rows={2}
                      value={texto}
                      placeholder="Lo que le dirías de esta semana. Lo lee en su «Hoy»."
                      onChange={(e) => setTexto(e.target.value)}
                    />
                    <div className="row gap-2">
                      <button
                        type="submit"
                        className="btn btn-primary btn-sm"
                        disabled={!texto.trim() || enCurso === id}
                      >
                        Enviar y cerrar
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setEscribiendo(null)}
                      >
                        Cancelar
                      </button>
                    </div>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="t-xs t-tertiary">
        Solo sale quien tiene revisión pendiente según su cadencia, que se elige en su calendario.
        «Seguimos igual» la cierra sin cambios y queda anotado.
      </p>
    </Panel>
  );
};
