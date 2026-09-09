import { useState } from 'react';
import { UserPlus } from 'lucide-react';

import { useApp } from '@/context/AppContext';
import { formulariosDe } from '@/domain/formularios';
import { coachProtocolos } from '@/domain/protocolos';
import { BotonAccion, Field, Notice, Panel, SectionTitle, useAccionDeBoton } from '@/components/ui/primitives';

const EMPTY_FORM = { name: '', email: '', phone: '', gender: 'Hombre', plan: '', intakeFormId: '', protocoloId: '' };

/**
 * El alta de un cliente.
 *
 * Solo el nombre es obligatorio: dar de alta a alguien tiene que costar diez
 * segundos, y el resto se completa después en su ficha. Los cuatro campos que
 * acompañan están porque se saben en ese momento —se acaba de hablar con la
 * persona— y buscarlos luego cuesta más que escribirlos ahora.
 */
/**
 * @param plain  Dentro de la hoja de la cartera el alta es una banda MÁS de esa
 *   hoja, no una tarjeta encima: con su propio fondo y su propia sombra se veía
 *   como un papel suelto puesto sobre la lista. Fuera de ella —la cartera vacía,
 *   donde no hay hoja todavía— sigue siendo una tarjeta.
 */
export const NewClientForm = ({ onCreate, onCancel, plain = false }) => {
  const [form, setForm] = useState(EMPTY_FORM);

  /*
    ══ Con qué alta empieza (D14) ═════════════════════════════════════════════

    El entrenador puede tener varias —«Pérdida de grasa» no pregunta lo mismo
    que «Fuerza»— y la elegida se le copia a este cliente al crearlo
    (`addClient({ intakeFormId })`). Con una sola no hay nada que elegir y el
    campo no se pinta: quien no haya creado la segunda no puede notar que esto
    existe. Ver `coachIntakeForms` en `domain/intakeForm.js`.
  */
  const { coachPrefs } = useApp();
  const formularios = formulariosDe(coachPrefs, 'alta');
  const varias = formularios.length > 1;
  /* Y con qué PROTOCOLO empieza: desde que son varios con nombre, es la
     decisión que de verdad manda — el protocolo dice qué alta se le pide, y la
     de arriba solo la afina. Con uno solo no hay nada que elegir. */
  const protocolos = coachProtocolos(coachPrefs);
  const variosProtocolos = protocolos.length > 1;
  /* El giro y el tic del botón de guardar; ver `BotonAccion`. */
  const alta = useAccionDeBoton();
  const [error, setError] = useState(null);

  const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }));

  const submit = (event) => {
    event.preventDefault();
    if (!form.name.trim()) return;

    /* Lo lanza el `onSubmit` y no el clic: a un formulario se le da a Enter. */
    return alta.lanzar(async () => {
      setError(null);
      const result = await onCreate({
        ...form,
        name: form.name.trim(),
        /* Sin elegir, la primera: es lo que hacía el alta cuando el formulario
           era uno solo, y `intakeFormById` ya cae ahí con un id vacío. */
        intakeFormId: form.intakeFormId || null,
        protocoloId: form.protocoloId || null,
      });

      if (result?.ok) {
        setForm(EMPTY_FORM);
        onCancel();
        return true;
      }
      setError(result?.error || 'No se pudo crear el cliente.');
      return false;
    });
  };

  return (
    <Panel as="form" plain={plain} className="col gap-4" onSubmit={submit}>
      <SectionTitle icon={UserPlus}>Nuevo cliente</SectionTitle>
      {error && <Notice tone="error">{error}</Notice>}

      <div className="row-end wrap gap-4">
        <Field label="Nombre *" className="grow">
          {(props) => (
            <input {...props} className="input" value={form.name} onChange={set('name')} required autoFocus />
          )}
        </Field>
        <Field
          label="Email"
          className="grow"
          hint="Para escribirle hoy. Cuando acepte su invitación, queda el de su cuenta."
        >
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
        {variosProtocolos && (
          <Field
            label="Protocolo"
            className="grow"
            hint="Cómo vas a trabajar con esta persona. Se le aplica al crearla."
          >
            {(props) => (
              <select
                {...props}
                className="select"
                value={form.protocoloId || protocolos[0].id}
                onChange={set('protocoloId')}
              >
                {protocolos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}
        {varias && (
          <Field
            label="Formulario de alta"
            className="grow"
            hint="Lo que le vas a pedir para empezar. Se copia a su ficha al crearlo."
          >
            {(props) => (
              <select
                {...props}
                className="select"
                value={form.intakeFormId || formularios[0].id}
                onChange={set('intakeFormId')}
              >
                {formularios.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}
        <Field label="Plan" className="grow">
          {(props) => (
            <input {...props} className="input" value={form.plan} onChange={set('plan')} placeholder="Ej: Online Premium" />
          )}
        </Field>
      </div>

      <div className="row gap-2 wrap">
        <BotonAccion
          type="submit"
          className="btn btn-primary"
          estado={alta.estado}
          disabled={!form.name.trim()}
        >
          Guardar cliente
        </BotonAccion>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </Panel>
  );
};
