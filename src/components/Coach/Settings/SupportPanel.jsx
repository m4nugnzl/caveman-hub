import { useCallback, useEffect, useMemo, useState } from 'react';
import { LifeBuoy, Plus, Send } from 'lucide-react';

import { useApp } from '@/context/AppContext';
import { EmptyState, Field, Notice, Panel, SectionTitle } from '@/components/ui/primitives';

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
  const { loadTickets, createTicket, replyTicket, setTicketStatus, isSupport, session } = useApp();

  const [tickets, setTickets] = useState([]);
  const [estado, setEstado] = useState('cargando'); // cargando | listo | error
  const [error, setError] = useState('');
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

  return (
    <Panel>
      <SectionTitle
        icon={LifeBuoy}
        action={
          !redactando && !isSupport ? (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => setRedactando(true)}
            >
              <Plus size={14} /> Escribir a soporte
            </button>
          ) : null
        }
      >
        {isSupport ? `Soporte${pendientes ? ` · ${pendientes} sin contestar` : ''}` : 'Ayuda'}
      </SectionTitle>

      {estado === 'error' && (
        <Notice tone="error">
          No se ha podido cargar. {error}
          {' '}
          <button type="button" className="btn btn-sm" onClick={recargar}>
            Reintentar
          </button>
        </Notice>
      )}

      {redactando && (
        <NuevoTicket
          onCancel={() => setRedactando(false)}
          onSend={async (campos) => {
            const res = await createTicket(campos);
            if (!res.ok) return res.error;
            setRedactando(false);
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

      {estado === 'listo' && lista.length === 0 && !redactando && (
        <EmptyState
          icon={LifeBuoy}
          title={isSupport ? 'No hay tickets' : '¿Te has atascado con algo?'}
          message={
            isSupport
              ? 'Cuando alguien escriba, su hilo aparecerá aquí.'
              : 'Escríbenos y te contestamos por aquí mismo. Cuéntanos qué intentabas hacer y qué pasó en su lugar: con eso solemos resolverlo a la primera.'
          }
          action={
            !isSupport ? (
              <button type="button" className="btn btn-primary" onClick={() => setRedactando(true)}>
                <Plus size={16} /> Escribir a soporte
              </button>
            ) : null
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
              onReply={async (body) => {
                const res = await replyTicket(ticket.id, body, isSupport);
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
    </Panel>
  );
};

const ESTADOS = {
  open: { label: 'Sin contestar', tone: 'badge-warn' },
  answered: { label: 'Contestado', tone: 'badge-ok' },
  closed: { label: 'Cerrado', tone: 'badge-info' },
};

/** Un hilo: cabecera siempre, conversación al desplegarlo. */
const TicketRow = ({ ticket, isSupport, myId, open, onToggle, onReply, onClose }) => {
  const [body, setBody] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  const estado = ESTADOS[ticket.status] || ESTADOS.open;
  const ultimo = ticket.messages[ticket.messages.length - 1];

  const enviar = async (event) => {
    event.preventDefault();
    const limpio = body.trim();
    if (!limpio) return;

    setEnviando(true);
    const fallo = await onReply(limpio);
    setEnviando(false);

    if (fallo) {
      setError(fallo);
      return;
    }
    setBody('');
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
          {isSupport && Object.keys(ticket.context || {}).length > 0 && (
            <p className="t-2xs t-tertiary">
              {Object.entries(ticket.context)
                .map(([k, v]) => `${k}: ${v}`)
                .join(' · ')}
            </p>
          )}

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
                <p className="t-sm" style={{ whiteSpace: 'pre-wrap' }}>
                  {msg.body}
                </p>
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
              <div className="row gap-2">
                <button
                  type="submit"
                  className="btn btn-primary btn-sm"
                  disabled={enviando || !body.trim()}
                >
                  <Send size={14} /> {enviando ? 'Enviando…' : 'Enviar'}
                </button>
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

/** Abrir un ticket. Dos campos, y el contexto se recoge solo. */
const NuevoTicket = ({ onCancel, onSend }) => {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  const valido = subject.trim().length > 2 && body.trim().length > 9;

  const enviar = async (event) => {
    event.preventDefault();
    if (!valido) return;

    setEnviando(true);
    /*
      El contexto lo recoge la aplicación, no se le pregunta al usuario. Ahorra el
      primer intercambio entero —«¿en qué pantalla?», «¿en el móvil?»—, que
      siempre es el mismo y cuesta un día de ida y vuelta.

      Es información del navegador, no del usuario: nada de aquí identifica a
      nadie más de lo que ya identifica su propio ticket.
    */
    const fallo = await onSend({
      subject: subject.trim(),
      body: body.trim(),
      context: {
        ruta: window.location.pathname,
        pantalla: `${window.screen?.width || '?'}×${window.screen?.height || '?'}`,
        navegador: navigator.userAgent.slice(0, 180),
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

      <div className="row gap-2">
        <button type="submit" className="btn btn-primary btn-sm" disabled={!valido || enviando}>
          {enviando ? 'Enviando…' : 'Enviar'}
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
};

/** «12 mar, 18:04». Con el año solo si no es el actual, que es cuando importa. */
const fecha = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const mismoAno = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: mismoAno ? undefined : 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};
