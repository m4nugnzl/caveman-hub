import { useState } from 'react';
import { UserPlus } from 'lucide-react';

import { Field, Notice, Panel, SectionTitle } from '@/components/ui/primitives';

const EMPTY_FORM = { name: '', email: '', phone: '', gender: 'Hombre', plan: '' };

/**
 * El alta de un cliente.
 *
 * Solo el nombre es obligatorio: dar de alta a alguien tiene que costar diez
 * segundos, y el resto se completa después en su ficha. Los cuatro campos que
 * acompañan están porque se saben en ese momento —se acaba de hablar con la
 * persona— y buscarlos luego cuesta más que escribirlos ahora.
 */
export const NewClientForm = ({ onCreate, onCancel }) => {
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
