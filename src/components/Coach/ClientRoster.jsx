import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  CreditCard,
  ExternalLink,
  FolderCheck,
  Plus,
  Search,
  UserCheck,
  UserPlus,
} from 'lucide-react';

import { useApp } from '@/context/AppContext';
import { EmptyState, Field, Notice, Panel, SectionTitle, SegmentedControl } from '@/components/ui/primitives';

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

const ClientCard = ({ client, onUpdate }) => (
  <Panel className="col gap-4">
    <div className="row gap-3">
      <img
        src={client.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(client.name)}`}
        alt=""
        width={48}
        height={48}
        style={{ borderRadius: 12, objectFit: 'cover', border: '1px solid var(--accent)', flexShrink: 0 }}
      />
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
    </div>
  );
};
