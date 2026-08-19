import { useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Images,
  MessageCircle,
  MessageSquare,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { currentCheckInPeriod } from '@/domain/calendar';
import { reviewQueue } from '@/domain/portfolio';
import { answersSummary, clientProtocol } from '@/domain/protocol';
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
 *     con el peso al lado—, que es lo único que hace falta para decidir. Es el
 *     ÚNICO botón primario de la fila: el gesto del lunes es entrar a mirar, y
 *     desde dentro se llega también al plan si hay que tocarlo.
 *   · «Seguimos igual» cierra sin cambios, en un toque. Es la mayoría de las
 *     veces, y durante meses.
 *   · «Contestar» escribe la respuesta, que él lee en su «Hoy».
 *   · En los «Sin subir», «Recordar» abre WhatsApp con el mensaje puesto —lo
 *     único que se puede hacer con quien no ha subido nada es recordárselo— y
 *     «Ajustar» entra a su plan a media espera. «Ajustar» ya no sale en los que
 *     SÍ han subido: cuatro botones idénticos por fila obligaban a leerlos todos
 *     antes de pulsar, y ese camino ya lo cubre la propia revisión.
 *
 * ── Por qué el «seguimos igual» deja rastro ─────────────────────────────────
 * Porque es información: dentro de tres meses permite contestar «llevas nueve
 * semanas sin tocarle nada», que hoy no tiene respuesta. Se guarda en la nota del
 * check-in —la columna de la 0009 que no usaba nadie—.
 */

/*
  ══ Por qué estos controles ya no son «chips» ═══════════════════════════════

  Lo eran los cuatro: «Seguimos igual», «Contestar», «Revisar» y «Ajustar». Y en
  el resto del producto un chip significa otra cosa —la semana seleccionada, el
  filtro activo, la sección en la que estás—: es la forma de ESTAR en un sitio,
  no la de hacer algo.

  Aquí, con esa misma forma, dos de los cuatro navegan y los otros dos escriben
  en la base de datos: «Seguimos igual» cierra la semana de una persona. Cuatro
  controles idénticos en una fila donde la mitad son irreversibles obliga a
  leerlos todos antes de pulsar.

  Ahora son botones, que es lo que ya significan en las otras sesenta pantallas.
*/
const ESTADOS = {
  ready: { label: 'Te espera', tone: 'badge-warn' },
  missing: { label: 'Sin subir', tone: '' },
};

/** Lo que se guarda al cerrar sin cambios. Es texto y no un booleano porque va a
    la misma nota que escribirías tú, y así el histórico se lee de corrido. */
const SIN_CAMBIOS = 'Sin cambios: seguimos igual.';

/**
 * Recordarle el check-in a quien no lo ha subido, por WhatsApp y con el mensaje
 * puesto. El mismo camino que ya usa la bandeja con los inactivos: no se guarda
 * nada aquí — el recordatorio ES el mensaje, y se manda desde su conversación de
 * siempre, no desde un sistema de avisos que el cliente no mira.
 */
const recordarCheckIn = (client) => {
  const nombre = (client.name || '').trim().split(/\s+/)[0];
  const texto = `Hola${nombre ? ` ${nombre}` : ''}, te toca el check-in de esta semana: pésate, hazte las fotos y entrégalo desde tu portal cuando puedas.`;
  window.open(
    `https://wa.me/${client.phone.replace(/[^\d]/g, '')}?text=${encodeURIComponent(texto)}`,
    '_blank',
    'noopener,noreferrer'
  );
};

/**
 * Un vistazo a lo que ha contestado esta semana.
 *
 * Cadena vacía si no contestó nada o si su entrenador no le pregunta: entonces la
 * fila enseña lo de siempre. El criterio de qué cabe en la línea vive en
 * `domain/protocol.js`, con las preguntas.
 */
const resumen = (row) =>
  answersSummary(clientProtocol(row.client.preferences), row.review?.answers);

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
    /* La lumbre: la única tarjeta encendida de la pantalla, porque es la única
       que contiene una decisión de hoy. Ver `.card-lumbre` en `index.css`. */
    <Panel className="col gap-3 card-lumbre">
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
                    {/*
                      Lo que ha CONTESTADO manda sobre todo lo demás.

                      El titular («En rumbo: −0,4 kg/sem») y las cifras de
                      pesajes salen de datos que ya estaban aquí y que se pueden
                      mirar en cualquier momento. Sus respuestas son lo único de
                      esta fila que ha llegado esta semana y que no está en
                      ninguna otra pantalla, así que es lo que hace que valga la
                      pena leerla.

                      Nunca las tres cosas a la vez: la fila se lee de un vistazo
                      o no se lee.

                      ── `.text`, y no el titular entero ──────────────────────
                      `readingHeadline` devuelve `{ text, tone }`, no una cadena:
                      el tono es para pintar el veredicto donde haya sitio, y
                      aquí no lo hay —el color de la fila ya lo lleva la chapa
                      del estado—. Puesto tal cual, React se encontraba un objeto
                      donde espera un hijo y tiraba la pantalla entera al entrar
                      al tablero.
                    */}
                    {resumen(row) ||
                      row.headline?.text ||
                      [
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
                      className="btn btn-secondary btn-sm"
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
                      className="btn btn-secondary btn-sm"
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

                  Es EL botón primario de la fila —el único—: mirar lo que ha
                  subido es el trabajo; cerrar y contestar son sus remates.
                */}
                {row.review_state === 'ready' && (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      start(abrir(row));
                      navigate(clientPath(id, 'revision/fotos'));
                    }}
                  >
                    <Images size={12} /> Revisar
                  </button>
                )}

                {/* Con quien no ha subido nada solo caben dos gestos: recordárselo
                    —si hay teléfono— y tocarle el plan a media espera. «Ajustar»
                    ya no sale en las filas que SÍ han subido: ese camino lo cubre
                    la propia revisión, y el cuarto botón idéntico era ruido. */}
                {row.review_state === 'missing' && (
                  <>
                    {row.client.phone && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        title="Abrir WhatsApp con el recordatorio escrito"
                        onClick={() => recordarCheckIn(row.client)}
                      >
                        <MessageCircle size={12} /> Recordar
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        start(abrir(row));
                        navigate(clientPath(id, 'rutina'));
                      }}
                    >
                      Ajustar
                    </button>
                  </>
                )}

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
