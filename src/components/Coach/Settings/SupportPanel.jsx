import { useCallback, useEffect, useMemo, useState } from 'react';
import { LifeBuoy, Plus, Send } from 'lucide-react';

import { useApp } from '@/context/AppContext';
import { recentIssues } from '@/lib/diagnostics';
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
  const { loadTickets, createTicket, replyTicket, setTicketStatus, isSupport, session, plan } =
    useApp();

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
    /*
      `col gap-4`, no `Panel` a secas.

      `Panel` pinta una tarjeta con relleno pero NO es contenedor flexible ni
      tiene separación propia: sus hijos se apilan pegados unos a otros. Por eso
      el botón de la cabecera quedaba tocando el primer ticket. La convención del
      proyecto es pasarle la separación —así lo hacen los paneles del resumen— y
      en los dos paneles nuevos se me olvidó.
    */
    <Panel className="col gap-4">
      <SectionTitle
        icon={LifeBuoy}
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
          plan={plan}
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
              onReply={async (body) => {
                /*
                  Se habla como soporte solo en los hilos AJENOS.

                  En el tuyo propio eres el que pregunta, aunque además atiendas
                  la plataforma: marcarlo como respuesta de soporte pondría el
                  ticket en «contestado» por escribirte a ti mismo, y lo sacaría
                  de tu propia bandeja de pendientes.
                */
                const esMio = ticket.profileId === session?.user?.id;
                const res = await replyTicket(ticket.id, body, isSupport && !esMio);
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
