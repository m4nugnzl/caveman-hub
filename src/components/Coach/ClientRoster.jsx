import { useMemo, useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  FolderCheck,
  Plus,
  Search,
  Send,
  UserCheck,
  UserPlus,
} from 'lucide-react';

import { useApp } from '@/context/AppContext';
import { initials } from '@/lib/initials';
import { EmptyState, Field, Notice, Panel, SectionTitle, SegmentedControl } from '@/components/ui/primitives';
import { ClientDataPanel } from './ClientDataPanel';
import { inviteMessage, useInvite } from './useInvite';

const FILTERS = [
  { id: 'all', label: 'Todos' },
  { id: 'pending_onboarding', label: 'Onboarding pendiente' },
  { id: 'due_soon', label: 'Pago próximo' },
];

const EMPTY_FORM = { name: '', email: '', phone: '', gender: 'Hombre', plan: '' };

const NewClientForm = ({ onCreate, onCancel }) => {
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    if (!form.name.trim()) return;

    setBusy(true);
    setError(null);
    const result = await onCreate({ ...form, name: form.name.trim() });
    setBusy(false);

    if (result?.ok) {
      setForm(EMPTY_FORM);
      onCancel();
    } else {
      setError(result?.error || 'No se pudo crear el cliente.');
    }
  };

  return (
    <Panel as="form" className="col gap-4" onSubmit={submit}>
      <SectionTitle icon={UserPlus}>Nuevo cliente</SectionTitle>
      {error && <Notice tone="error">{error}</Notice>}

      <div className="row-end wrap gap-4">
        <Field label="Nombre *" className="grow">
          {(props) => (
            <input {...props} className="input" value={form.name} onChange={set('name')} required autoFocus />
          )}
        </Field>
        <Field label="Email" className="grow">
          {(props) => (
            <input {...props} type="email" className="input" value={form.email} onChange={set('email')} />
          )}
        </Field>
        <Field label="Teléfono / WhatsApp" className="grow">
          {(props) => <input {...props} className="input" value={form.phone} onChange={set('phone')} />}
        </Field>
        <Field label="Sexo" className="shrink-0" hint="Determina la fórmula de % graso">
          {(props) => (
            <select {...props} className="select" value={form.gender} onChange={set('gender')}>
              <option value="Hombre">Hombre</option>
              <option value="Mujer">Mujer</option>
            </select>
          )}
        </Field>
        <Field label="Plan" className="grow">
          {(props) => (
            <input {...props} className="input" value={form.plan} onChange={set('plan')} placeholder="Ej: Online Premium" />
          )}
        </Field>
      </div>

      <div className="row gap-2 wrap">
        <button type="submit" className="btn btn-primary" disabled={busy || !form.name.trim()}>
          {busy ? 'Creando…' : 'Guardar cliente'}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </Panel>
  );
};

/**
 * Acceso del cliente a su portal.
 *
 * ══ Por qué esto tiene que estar AQUÍ ═══════════════════════════════════════
 *
 * Invitar solo existía en la ficha del tablero de la cartera, y solo cuando
 * saltaba la alerta «sin acceso a su portal». O sea: aparecía cuando el sistema
 * decidía avisar, no cuando el entrenador quería invitar.
 *
 * Pero «Clientes» es la pantalla del alta y el onboarding — es donde uno va
 * cuando acaba de crear a alguien y quiere darle acceso. Que la acción no
 * estuviera ahí hacía que la respuesta a «¿cómo invito a un cliente?» fuera
 * «vete a otra pantalla y espera a que salte un aviso».
 *
 * Aquí está siempre, y además dice el estado: si ya tiene cuenta enlazada no hay
 * nada que invitar, y decirlo evita mandar un enlace que va a fallar.
 */
const PortalAccess = ({ client }) => {
  const { result, busy, send } = useInvite();

  if (client.clientProfileId) {
    return (
      <div className="card-inset row between wrap gap-2 t-sm">
        <span className="t-secondary">Acceso al portal</span>
        <span className="badge badge-ok">
          <UserCheck size={11} /> Tiene su cuenta enlazada
        </span>
      </div>
    );
  }

  return (
    <div className="card-inset col gap-2">
      <div className="row between wrap gap-2 t-sm">
        <span className="t-secondary">Acceso al portal</span>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => send(client)} disabled={busy}>
          <Send size={14} /> {busy ? 'Generando…' : 'Invitar'}
        </button>
      </div>

      {result &&
        (result.ok ? (
          <Notice tone={result.copied ? 'success' : 'info'}>{inviteMessage(result)}</Notice>
        ) : (
          <Notice tone="error">{result.error}</Notice>
        ))}

      {!result && (
        <span className="t-xs t-tertiary">
          Genera un enlace de un solo uso que caduca en 14 días. Se copia solo: mándaselo por
          WhatsApp y, al abrirlo, se crea su cuenta y queda enlazada a esta ficha.
        </span>
      )}
    </div>
  );
};

/**
 * Terminar con un cliente sin borrarle.
 *
 * ══ Por qué archivar y no simplemente borrar ════════════════════════════════
 *
 * Porque el plan tiene un tope de clientes y borrar es irreversible: se lleva su
 * año de entrenamientos, sus pesajes y sus fotos. Sin esto, caber en el plan
 * obligaba a destruir el trabajo de alguien que solo había terminado su etapa.
 *
 * Archivar es lo normal al acabar con un cliente. Borrar —que sigue estando, en
 * el bloque de abajo— queda para lo que de verdad lo pide: que la persona ejerza
 * su derecho de supresión.
 *
 * No pregunta «¿seguro?» a propósito: es reversible desde la misma pantalla, y un
 * diálogo de confirmación para algo que se deshace en un clic solo enseña a
 * ignorar los diálogos de confirmación.
 */
const ArchiveRow = ({ client }) => {
  const { setClientArchived } = useApp();
  const [busy, setBusy] = useState(false);

  return (
    <div className="card-inset row between wrap gap-2 t-sm">
      <div className="col gap-1">
        <span className="t-secondary">Terminar con este cliente</span>
        <span className="t-xs t-tertiary">
          Deja de aparecer en la cartera y de contar para tu plan. Todo lo suyo se conserva.
        </span>
      </div>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setClientArchived(client.id, true);
        }}
      >
        <Archive size={14} /> Archivar
      </button>
    </div>
  );
};

/** Los que terminaron. Se recuperan desde aquí y siguen enteros. */
const ArchivedList = () => {
  const { archivedClients, setClientArchived } = useApp();

  if (archivedClients.length === 0) return null;

  return (
    <Panel className="col gap-3">
      <SectionTitle icon={Archive}>Archivados · {archivedClients.length}</SectionTitle>
      <p className="t-sm t-secondary">
        No aparecen en la cartera ni cuentan para tu plan. Su rutina, sus medidas y sus fotos siguen
        guardadas: si vuelven, vuelven con su historial.
      </p>

      <div className="col gap-2">
        {archivedClients.map((client) => (
          <div key={client.id} className="card-inset row between wrap gap-2">
            <div className="col gap-1">
              <strong className="t-sm">{client.name}</strong>
              <span className="t-xs t-tertiary">{client.email || 'Sin email'}</span>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setClientArchived(client.id, false)}
            >
              <ArchiveRestore size={14} /> Recuperar
            </button>
          </div>
        ))}
      </div>
    </Panel>
  );
};

const ClientCard = ({ client, onUpdate }) => (
  <Panel className="col gap-4">
    <div className="row gap-3">
      {/*
        Su foto si la tiene y, si no, sus iniciales dibujadas aquí.

        Antes las iniciales las servía `api.dicebear.com`, con el NOMBRE DEL
        CLIENTE en la URL. Es decir: cada vez que se abría esta pantalla se le
        mandaba a un tercero el nombre de una persona de la que esto guarda su
        peso, sus pliegues y fotos de su cuerpo. Nadie lo había decidido y habría
        que declararlo en la política de privacidad. Dos letras no necesitan salir
        de la pantalla.
      */}
      {client.avatar ? (
        <img src={client.avatar} alt="" width={48} height={48} className="client-avatar" />
      ) : (
        <span className="client-avatar is-initials" aria-hidden="true">
          {initials(client.name)}
        </span>
      )}
      <div className="grow">
        <div style={{ fontWeight: 800 }}>{client.name}</div>
        <div className="t-xs t-secondary">
          {[client.email, client.phone].filter(Boolean).join(' · ') || 'Sin datos de contacto'}
        </div>
      </div>
      <span className={`badge ${client.paymentStatus === 'paid' ? 'badge-ok' : 'badge-bad'}`}>
        <CreditCard size={10} /> {client.paymentStatus === 'paid' ? 'Al día' : 'Pendiente'}
      </span>
    </div>

    <div className="card-inset col gap-2 t-sm">
      <div className="row between gap-2">
        <span className="t-secondary">Onboarding</span>
        {client.onboardingComplete ? (
          <span className="row gap-1" style={{ color: 'var(--accent)', fontWeight: 600 }}>
            <CheckCircle2 size={12} /> Completado
          </span>
        ) : (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => onUpdate({ onboardingComplete: true })}
          >
            Marcar completado
          </button>
        )}
      </div>

      <div className="row between gap-2">
        <span className="t-secondary">Revisión postural inicial</span>
        {client.postureReviewed ? (
          <span style={{ color: 'var(--accent)', fontWeight: 600 }}>Analizada</span>
        ) : (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => onUpdate({ postureReviewed: true })}
          >
            Marcar revisada
          </button>
        )}
      </div>

      {client.gymEquipmentLink && (
        <div className="row between gap-2">
          <span className="t-secondary">Maquinaria del gimnasio</span>
          <a
            href={client.gymEquipmentLink}
            target="_blank"
            rel="noreferrer noopener"
            className="row gap-1"
            style={{ color: 'var(--data-blue)', fontWeight: 600 }}
          >
            <FolderCheck size={12} /> Abrir carpeta <ExternalLink size={10} />
          </a>
        </div>
      )}
    </div>

    <div className="row between wrap gap-2 t-sm">
      <span className="t-secondary">
        Próxima renovación: <strong>{client.nextPaymentDate || 'sin fecha'}</strong>
      </span>
      {client.phone && (
        /*
          Antes esto era un `alert('Enviando recordatorio…')` que no enviaba
          nada. Ahora es un enlace real a WhatsApp con el mensaje preparado; el
          envío automático necesitaría la API de WhatsApp Business, que es una
          fase posterior del roadmap.
        */
        <a
          className="btn btn-secondary btn-sm"
          href={`https://wa.me/${client.phone.replace(/[^\d]/g, '')}?text=${encodeURIComponent(
            `Hola ${client.name}, te recuerdo la renovación de tu plan.`
          )}`}
          target="_blank"
          rel="noreferrer noopener"
        >
          Escribir por WhatsApp
        </a>
      )}
    </div>

    {/* Sin acceso al portal, el cliente no puede registrar nada — así que todo lo
        demás de esta ficha da igual. Por eso va antes que sus datos. */}
    <PortalAccess client={client} />

    {/* Las dos formas de terminar, en orden de gravedad: archivar es reversible
        y va primero; borrar, que no lo es, va debajo. */}
    <ArchiveRow client={client} />

    {/* Exportar y borrar sus datos personales. Va aquí, en la ficha
        administrativa, y no en una sección propia: es lo que se hace cuando un
        cliente entra o SALE, no mientras se trabaja con él. */}
    <ClientDataPanel client={client} />
  </Panel>
);

export const ClientRoster = () => {
  const { clients, updateClient, addClient } = useApp();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return clients.filter((client) => {
      const matches =
        !term ||
        client.name.toLowerCase().includes(term) ||
        (client.email || '').toLowerCase().includes(term);
      if (!matches) return false;
      if (filter === 'pending_onboarding') return !client.onboardingComplete;
      if (filter === 'due_soon') return client.paymentStatus !== 'paid';
      return true;
    });
  }, [clients, search, filter]);

  return (
    <div className="stack">
      <Panel className="row between wrap gap-4">
        <div>
          <h2 className="section-title">
            <UserCheck size={19} color="var(--data-blue)" /> Clientes y onboarding
          </h2>
          <p className="t-sm t-secondary">
            Alta de nuevos atletas, revisión inicial y control de pagos.
          </p>
        </div>

        <div className="row wrap gap-3">
          <div className="searchbox">
            <Search size={15} aria-hidden="true" />
            <input
              type="search"
              className="input"
              placeholder="Buscar por nombre o email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Buscar cliente"
            />
          </div>

          <button type="button" className="btn btn-primary" onClick={() => setShowForm((v) => !v)}>
            <Plus size={15} /> Nuevo cliente
          </button>
        </div>
      </Panel>

      {clients.length > 0 && (
        <SegmentedControl value={filter} onChange={setFilter} options={FILTERS} label="Filtrar clientes" />
      )}

      {showForm && <NewClientForm onCreate={addClient} onCancel={() => setShowForm(false)} />}

      {clients.length === 0 && !showForm && (
        <EmptyState
          icon={UserPlus}
          title="Empieza dando de alta a tu primer cliente"
          message="En cuanto exista un cliente podrás programarle la rutina, su plan nutricional y seguir su evolución con fotos."
          action={
            <button type="button" className="btn btn-primary btn-lg" onClick={() => setShowForm(true)}>
              <Plus size={17} /> Nuevo cliente
            </button>
          }
        />
      )}

      {clients.length > 0 && filtered.length === 0 && (
        <Panel>
          <p className="t-sm t-secondary">Ningún cliente coincide con la búsqueda o el filtro.</p>
        </Panel>
      )}

      {filtered.length > 0 && (
        <div className="grid-2">
          {filtered.map((client) => (
            <ClientCard
              key={client.id}
              client={client}
              onUpdate={(fields) => updateClient(client.id, fields)}
            />
          ))}
        </div>
      )}

      {/* Al final y no arriba: es un archivo, no una bandeja. Se entra a buscar
          algo concreto, no se pasa por aquí todos los días. */}
      <ArchivedList />
    </div>
  );
};
