import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, FileText, LifeBuoy, Paperclip, Plus, Send, X } from 'lucide-react';

import { useActions, useSession } from '@/context/AppContext';
import { dayMonthMaybeYear } from '@/lib/dates';
import {
  ATTACHMENT_ACCEPT,
  attachmentName,
  isImagePath,
  validateAttachment,
} from '@/domain/attachments';
import { recentIssues } from '@/lib/diagnostics';
import { EmptyState, Field, Notice, PageHead } from '@/components/ui/primitives';

/**
 * Ayuda: escribir a soporte y seguir el hilo.
 *
 * ══ Una sola pantalla para los dos lados ═══════════════════════════════════
 *
 * El entrenador ve sus hilos y quien atiende la plataforma los ve todos. No son
 * dos pantallas porque no son dos cosas: es la misma lista de conversaciones, y
 * lo único que cambia es cuántas devuelve la consulta.
 *
 * Y eso lo decide RLS (migración 0034), no este componente. `isSupport` aquí solo
 * elige palabras y ordena la lista; si alguien lo forzara a `true` desde la
 * consola vería una bandeja vacía, porque la base no le devuelve nada más.
 */
export const SupportPanel = () => {
  const { isSupport, session, plan } = useSession();
  const { loadTickets, createTicket, replyTicket, setTicketStatus } = useActions();

  const [tickets, setTickets] = useState([]);
  const [estado, setEstado] = useState('cargando'); // cargando | listo | error
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [abierto, setAbierto] = useState(null); // id del hilo desplegado
  const [redactando, setRedactando] = useState(false);

  const recargar = useCallback(async () => {
    const res = await loadTickets();
    if (!res.ok) {
      setError(res.error);
      setEstado('error');
      return;
    }
    setTickets(res.tickets);
    setEstado('listo');
  }, [loadTickets]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  /*
    Para quien atiende, lo pendiente primero: es una bandeja de trabajo y lo que
    lleva más tiempo esperando es lo que hay que mirar. Para quien pregunta, el
    orden de actividad —lo último que se movió— que ya trae la consulta.
  */
  const lista = useMemo(() => {
    if (!isSupport) return tickets;
    const peso = { open: 0, answered: 1, closed: 2 };
    return [...tickets].sort((a, b) => (peso[a.status] ?? 3) - (peso[b.status] ?? 3));
  }, [tickets, isSupport]);

  const pendientes = tickets.filter((t) => t.status === 'open').length;

  /*
    ¿Está pintándose el hueco vacío? Es lo único que decide si el botón de la
    cabecera sobra, porque ese hueco ya ofrece la misma acción.

    Se calcula aquí y no se repite la condición en dos sitios: la primera versión
    las escribió por separado —`lista.length > 0` arriba y `estado === 'listo' &&
    lista.length === 0` abajo— y dejó un caso sin cubrir: **con la lista vacía y
    un error de carga no salía el botón por ningún lado**, así que no había forma
    de escribir a soporte justo cuando algo estaba fallando. Que es exactamente
    cuando hace falta.
  */
  const huecoVacio = estado === 'listo' && lista.length === 0 && !redactando;

  return (
    <div className="stack">
      <PageHead
        title={isSupport ? `Soporte${pendientes ? ` · ${pendientes} sin contestar` : ''}` : 'Ayuda'}
        sub={
          isSupport
            ? 'Lo que ha escrito la gente que usa esto.'
            : 'Escríbenos y sigue tus conversaciones.'
        }
        action={
          /*
            El botón sale SIEMPRE para quien pueda escribir —también para quien
            atiende la plataforma: atenderla no deja de convertirte en entrenador
            con tu propia cuenta—, pero NO cuando la lista está vacía.

            Con la lista vacía el hueco central ya ofrece la misma acción, y
            enseñar los dos deja dos botones idénticos en la misma pantalla
            peleando por el mismo clic. La llamada a la acción es del hueco
            vacío; la de la cabecera es para cuando ya hay algo debajo.
          */
          !redactando && !huecoVacio ? (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => setRedactando(true)}
            >
              <Plus size={14} /> Escribir a soporte
            </button>
          ) : null
        }
      />

      {estado === 'error' && (
        <Notice tone="error">
          No se ha podido cargar. {error}
          {' '}
          <button type="button" className="btn btn-sm" onClick={recargar}>
            Reintentar
          </button>
        </Notice>
      )}

      {aviso && <Notice tone="warn">{aviso}</Notice>}

      {redactando && (
        <NuevoTicket
          plan={plan}
          onCancel={() => setRedactando(false)}
          onSend={async (campos) => {
            const res = await createTicket(campos);
            if (!res.ok) return res.error;
            setRedactando(false);
            /* El ticket salió pero el archivo no. No es un error del envío —el
               mensaje está y se puede contestar—, así que se cuenta arriba en vez
               de dejar el formulario abierto con una alarma. */
            setAviso(res.aviso || '');
            await recargar();
            setAbierto(res.ticketId);
            return null;
          }}
        />
      )}

      {/* `SaveIndicator` diría «Guardando…», que aquí es mentira: se está
          leyendo, no escribiendo. */}
      {estado === 'cargando' && (
        <p className="t-sm t-tertiary" role="status">
          Cargando tus conversaciones…
        </p>
      )}

      {huecoVacio && (
        <EmptyState
          icon={LifeBuoy}
          title={isSupport ? 'No hay tickets' : '¿Te has atascado con algo?'}
          message={
            isSupport
              ? 'Cuando alguien escriba, su hilo aparecerá aquí. También puedes abrir uno tú para anotar algo o para comprobar que los avisos llegan.'
              : 'Escríbenos y te contestamos por aquí mismo. Cuéntanos qué intentabas hacer y qué pasó en su lugar: con eso solemos resolverlo a la primera.'
          }
          action={
            <button type="button" className="btn btn-primary" onClick={() => setRedactando(true)}>
              <Plus size={16} /> Escribir a soporte
            </button>
          }
        />
      )}

      {lista.length > 0 && (
        <div className="list">
          {lista.map((ticket) => (
            <TicketRow
              key={ticket.id}
              ticket={ticket}
              isSupport={isSupport}
              myId={session?.user?.id}
              open={abierto === ticket.id}
              onToggle={() => setAbierto(abierto === ticket.id ? null : ticket.id)}
              onReply={async (body, adjunto) => {
                /*
                  Se habla como soporte solo en los hilos AJENOS.

                  En el tuyo propio eres el que pregunta, aunque además atiendas
                  la plataforma: marcarlo como respuesta de soporte pondría el
                  ticket en «contestado» por escribirte a ti mismo, y lo sacaría
                  de tu propia bandeja de pendientes.
                */
                const esMio = ticket.profileId === session?.user?.id;
                const res = await replyTicket(ticket.id, body, isSupport && !esMio, adjunto);
                if (!res.ok) return res.error;
                await recargar();
                return null;
              }}
              onClose={async () => {
                await setTicketStatus(ticket.id, 'closed');
                await recargar();
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const ESTADOS = {
  open: { label: 'Sin contestar', tone: 'badge-warn' },
  answered: { label: 'Contestado', tone: 'badge-ok' },
  closed: { label: 'Cerrado', tone: 'badge-info' },
};

/**
 * Elegir un archivo para mandarlo con el mensaje.
 *
 * ══ Por qué esto vale la pena ══════════════════════════════════════════════
 *
 * El formulario ya recoge la ruta, el navegador y los últimos fallos de verdad, y
 * aun así la primera respuesta de casi cualquier soporte es «¿me mandas una
 * captura?». Un día de ida y vuelta por algo que quien escribe tenía delante
 * mientras lo contaba.
 *
 * ── Se valida ANTES de mandar nada ──────────────────────────────────────────
 * El tamaño y el tipo se comprueban al elegir el archivo, no al enviar. Enterarse
 * de que la imagen pesa de más después de haber escrito el mensaje —y con el
 * mensaje ya subiendo— es el momento exacto en el que la gente abandona.
 *
 * El `input` de verdad va escondido y se dispara desde el botón: el control nativo
 * no se puede vestir y con el texto «Sin archivos seleccionados» al lado nunca
 * queda como parte del formulario.
 */
const Adjunto = ({ file, onChange, disabled }) => {
  const input = useRef(null);
  const [error, setError] = useState('');

  const elegir = (elegido) => {
    if (!elegido) return;
    const invalido = validateAttachment(elegido);
    if (invalido) {
      setError(invalido);
      onChange(null);
      return;
    }
    setError('');
    onChange(elegido);
  };

  return (
    <div className="col gap-1">
      <input
        ref={input}
        type="file"
        accept={ATTACHMENT_ACCEPT}
        style={{ display: 'none' }}
        onChange={(e) => {
          elegir(e.target.files?.[0] || null);
          /* Se limpia para que elegir DOS VECES el mismo archivo vuelva a
             disparar el evento: sin esto, quitarlo y volver a ponerlo no hace
             nada y parece que el botón está roto. */
          e.target.value = '';
        }}
      />

      {file ? (
        <span className="row gap-2 wrap t-xs">
          <Paperclip size={13} />
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {file.name}
          </span>
          <button
            type="button"
            className="btn btn-icon btn-icon-danger"
            style={{ width: 22, height: 22 }}
            onClick={() => onChange(null)}
            aria-label="Quitar el archivo"
          >
            <X size={12} />
          </button>
        </span>
      ) : (
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={disabled}
          onClick={() => input.current?.click()}
        >
          <Paperclip size={13} /> Adjuntar captura
        </button>
      )}

      {error && <span className="t-xs" style={{ color: 'var(--negative)' }}>{error}</span>}
    </div>
  );
};

/**
 * El archivo que acompaña a un mensaje, ya firmado.
 *
 * Las imágenes se ven, el resto se abre. Una captura es lo que más se manda y es
 * también lo que hay que mirar para entender el ticket: obligar a abrir otra
 * pestaña para ver una imagen de 200 KB convierte el adjunto en algo que no se
 * mira, y entonces daba igual haberlo pedido.
 *
 * Sin URL firmada el archivo ya no está —lo borró alguien, o la ruta es de otro
 * hilo—. Se dice, en vez de dejar un enlace que lleva a un error.
 */
const AdjuntoMensaje = ({ path, url }) => {
  if (!path) return null;

  if (!url) {
    return <span className="t-2xs t-tertiary">Adjunto no disponible.</span>;
  }

  if (isImagePath(path)) {
    return (
      <a href={url} target="_blank" rel="noreferrer noopener" title={attachmentName(path)}>
        <img
          src={url}
          alt={`Adjunto: ${attachmentName(path)}`}
          loading="lazy"
          style={{
            maxWidth: 'min(100%, 320px)',
            borderRadius: 'var(--r-md)',
            border: '1px solid var(--edge)',
            display: 'block',
          }}
        />
      </a>
    );
  }

  return (
    <a
      className="row gap-1 t-xs link"
      href={url}
      target="_blank"
      rel="noreferrer noopener"
    >
      <FileText size={13} /> {attachmentName(path)} <ExternalLink size={11} />
    </a>
  );
};

/** Un hilo: cabecera siempre, conversación al desplegarlo. */
const TicketRow = ({ ticket, isSupport, myId, open, onToggle, onReply, onClose }) => {
  const [body, setBody] = useState('');
  const [adjunto, setAdjunto] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  const estado = ESTADOS[ticket.status] || ESTADOS.open;
  const ultimo = ticket.messages[ticket.messages.length - 1];

  const enviar = async (event) => {
    event.preventDefault();
    const limpio = body.trim();
    if (!limpio) return;

    setEnviando(true);
    const fallo = await onReply(limpio, adjunto);
    setEnviando(false);

    if (fallo) {
      setError(fallo);
      return;
    }
    setBody('');
    setAdjunto(null);
    setError('');
  };

  return (
    <div className="col gap-2">
      <button type="button" className="list-row" onClick={onToggle} aria-expanded={open}>
        <span className="grow col gap-1" style={{ textAlign: 'left', minWidth: 0 }}>
          <span className="row gap-2 wrap">
            <strong>{ticket.subject}</strong>
            <span className={`badge ${estado.tone}`}>{estado.label}</span>
          </span>
          <span className="t-xs t-tertiary">
            {/* Para soporte, de quién es. Para el dueño sobra: ya lo sabe. */}
            {isSupport && ticket.authorEmail ? `${ticket.authorEmail} · ` : ''}
            {ticket.messages.length}{' '}
            {ticket.messages.length === 1 ? 'mensaje' : 'mensajes'}
            {ultimo ? ` · último ${fecha(ultimo.createdAt)}` : ''}
          </span>
        </span>
      </button>

      {open && (
        <div className="card-inset col gap-3">
          {/* Contexto técnico, solo para quien atiende: al que escribe no le dice
              nada y le ocuparía la pantalla. */}
          {isSupport && <Contexto context={ticket.context} />}

          <div className="col gap-3">
            {ticket.messages.map((msg) => (
              <div key={msg.id} className="col gap-1">
                <span className="t-2xs t-tertiary">
                  {msg.fromSupport ? 'Soporte' : msg.authorId === myId ? 'Tú' : 'Entrenador'} ·{' '}
                  {fecha(msg.createdAt)}
                </span>
                {/* `white-space: pre-wrap` conserva los saltos de línea: la gente
                    escribe listas y pasos numerados, y sin esto llegan en un
                    párrafo corrido que no se entiende. */}
                <p className="t-sm pre-wrap">
                  {msg.body}
                </p>
                <AdjuntoMensaje path={msg.attachmentPath} url={msg.attachmentUrl} />
              </div>
            ))}
          </div>

          {error && <Notice tone="error">{error}</Notice>}

          {ticket.status !== 'closed' ? (
            <form className="col gap-2" onSubmit={enviar}>
              <textarea
                className="textarea"
                rows={3}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={isSupport ? 'Responder…' : 'Añadir algo más…'}
              />
              <div className="row gap-2 wrap">
                <button
                  type="submit"
                  className="btn btn-primary btn-sm"
                  disabled={enviando || !body.trim()}
                >
                  <Send size={14} /> {enviando ? 'Enviando…' : 'Enviar'}
                </button>
                <Adjunto file={adjunto} onChange={setAdjunto} disabled={enviando} />
                <button type="button" className="btn btn-sm" onClick={onClose}>
                  Cerrar hilo
                </button>
              </div>
            </form>
          ) : (
            <p className="t-xs t-tertiary">
              Hilo cerrado. Si vuelve a pasarte, escribe uno nuevo contando qué ha cambiado.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * El contexto técnico del ticket, para quien lo atiende.
 *
 * Los fallos van aparte y en monoespaciada porque son lo único que se lee
 * carácter a carácter: un nombre de tabla o un código de error se compara, no se
 * ojea. El resto —ruta, plan, navegador— es una línea de referencia.
 */
const Contexto = ({ context }) => {
  const { fallos = [], ...resto } = context || {};
  const entradas = Object.entries(resto).filter(([, v]) => v !== null && v !== '');

  if (entradas.length === 0 && fallos.length === 0) return null;

  return (
    <div className="col gap-2">
      {entradas.length > 0 && (
        <p className="t-2xs t-tertiary">
          {entradas.map(([k, v]) => `${k}: ${v}`).join(' · ')}
        </p>
      )}

      {fallos.length > 0 && (
        <div className="col gap-1">
          <span className="t-2xs t-tertiary">
            Últimos fallos en su sesión, del más reciente al más antiguo:
          </span>
          {fallos.map((f, i) => (
            <code key={i} className="t-2xs" style={{ wordBreak: 'break-word' }}>
              [{f.source}] {f.message}
              {f.count > 1 ? ` (×${f.count})` : ''}
              {f.path ? ` — ${f.path}` : ''}
            </code>
          ))}
        </div>
      )}
    </div>
  );
};

/** Abrir un ticket. Dos campos, y el contexto se recoge solo. */
const NuevoTicket = ({ onCancel, onSend, plan }) => {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [adjunto, setAdjunto] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  /*
    Qué falta para poder enviar, DICHO.

    Antes era un booleano suelto que dejaba el botón gris sin explicar nada: si
    escribías «no va» en la descripción, «Enviar» no se podía pulsar y la
    pantalla no daba ninguna pista. Un botón deshabilitado sin motivo visible es
    un callejón sin salida — y con un formulario de dos campos, encima parece que
    la aplicación está rota.

    Los mínimos son bajos a propósito: no están para exigir un informe, sino para
    evitar el ticket con asunto «a» y cuerpo vacío, que no se puede contestar.
  */
  const falta = !subject.trim()
    ? 'Ponle un asunto.'
    : subject.trim().length <= 2
      ? 'El asunto es demasiado corto.'
      : body.trim().length <= 9
        ? 'Cuenta un poco más en «Qué pasa»: con una o dos frases basta.'
        : null;

  const valido = falta === null;

  const enviar = async (event) => {
    event.preventDefault();
    if (!valido) return;

    setEnviando(true);
    /*
      El contexto lo recoge la aplicación, no se le pregunta al usuario.

      ── Lo que cambia respecto a un formulario normal ──────────────────────
      Un ticket que solo lleva lo que la persona sabe contar dice «no me guarda
      la dieta», y eso no se puede diagnosticar. Aquí van además:

        · Dónde estaba y con qué navegador — ahorra el primer intercambio entero.
        · Su plan y cuántos clientes tiene — la mitad de los fallos de escritura
          son el límite del plan o la suscripción caducada, y saberlo de entrada
          evita ir a mirarlo cliente por cliente.
        · **Los últimos fallos reales** (`lib/diagnostics`), que es la diferencia
          entre «no me guarda» y «violates row-level security policy for table
          workout_data, tres veces, en /c/abc/rutina».

      Nada de esto sale de un formulario ni identifica a nadie más que a quien ya
      firma el ticket.
    */
    const fallo = await onSend({
      subject: subject.trim(),
      body: body.trim(),
      attachment: adjunto,
      context: {
        ruta: window.location.pathname,
        pantalla: `${window.screen?.width || '?'}×${window.screen?.height || '?'}`,
        navegador: navigator.userAgent.slice(0, 180),
        plan: plan ? `${plan.plan} · ${plan.status}${plan.activo ? '' : ' · INACTIVO'}` : 'sin plan',
        clientes: plan?.clients ?? null,
        // Los seis últimos: más no caben en un vistazo y los viejos rara vez
        // explican lo que acaba de pasar.
        fallos: recentIssues().slice(0, 6),
      },
    });
    setEnviando(false);

    if (fallo) setError(fallo);
  };

  return (
    <form className="card-inset col gap-3" onSubmit={enviar}>
      <span className="section-label">Escribir a soporte</span>

      <Field label="Asunto">
        {(props) => (
          <input
            {...props}
            autoFocus
            className="input"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="No puedo dar de alta a un cliente"
          />
        )}
      </Field>

      <Field
        label="Qué pasa"
        hint="Qué intentabas hacer, qué esperabas y qué pasó en su lugar. Si salió un mensaje de error, pégalo tal cual."
      >
        {(props) => (
          <textarea
            {...props}
            className="textarea"
            rows={5}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        )}
      </Field>

      {error && <Notice tone="error">{error}</Notice>}

      {/* Debajo de «Qué pasa» y no al final del formulario: es parte de contar lo
          que pasa, no un trámite posterior al envío. */}
      <Adjunto file={adjunto} onChange={setAdjunto} disabled={enviando} />

      <div className="row gap-2 wrap">
        <button type="submit" className="btn btn-primary btn-sm" disabled={!valido || enviando}>
          {enviando ? 'Enviando…' : 'Enviar'}
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel}>
          Cancelar
        </button>
        {/* Al lado del botón que no se puede pulsar, que es donde se mira al no
            entender por qué no pasa nada. */}
        {falta && <span className="t-xs t-tertiary">{falta}</span>}
      </div>
    </form>
  );
};

/* «12 mar, 18:04». Dos mensajes del mismo día son lo normal en un hilo, así que
   aquí la hora sí hace falta para ordenarlos. */
const fecha = (iso) => dayMonthMaybeYear(iso, { conHora: true });
