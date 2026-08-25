import { useState } from 'react';
import { Check } from 'lucide-react';

import { useActions } from '@/context/AppContext';
import {
  clientIntakeForm,
  formProgress,
  formSections,
  isFormEmpty,
  isRequired,
} from '@/domain/intakeForm';
import { MAX_FIELD, customAnswers, examplePlaceholder } from '@/domain/profile';
import { Field, Notice, NumberInput, Panel } from '@/components/ui/primitives';

/**
 * Un control, según lo que pida la pregunta.
 *
 * Sirve para las dos clases de pregunta —las del catálogo del perfil y las
 * propias del entrenador— porque las dos declaran su `kind` con el mismo
 * vocabulario. Si no fuera así habría dos formularios que mantener, y el segundo
 * sería el que se quedara atrás.
 */
const Pregunta = ({ field, obligatoria, value, onChange }) => (
  <Field
    /* El asterisco y no la palabra «obligatoria» al lado: son hasta diecinueve
       campos y repetir la palabra en cinco de ellos convierte la etiqueta en
       ruido. Lo que las nombra es el aviso de abajo, cuando de verdad faltan. */
    label={obligatoria ? `${field.label} *` : field.label}
    hint={field.hint}
  >
    {(props) => {
      if (field.kind === 'number') {
        return (
          <div className="input-suffix">
            <NumberInput
              {...props}
              center={false}
              placeholder={examplePlaceholder(field)}
              value={value}
              onChange={onChange}
            />
            {field.unit && <span aria-hidden="true">{field.unit}</span>}
          </div>
        );
      }

      if (field.kind === 'choice' || field.kind === 'yesno') {
        const opciones =
          field.kind === 'yesno'
            ? [
                { id: 'true', label: 'Sí' },
                { id: 'false', label: 'No' },
              ]
            : field.options;

        return (
          <select
            {...props}
            className="select"
            value={value === true ? 'true' : value === false ? 'false' : value ?? ''}
            onChange={(e) => onChange(e.target.value)}
          >
            {/* «Prefiero no decirlo» es una respuesta, y dejarla fuera obligaría
                a inventarse una. */}
            <option value="">Sin contestar</option>
            {opciones.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        );
      }

      return (
        <input
          {...props}
          className="input"
          maxLength={MAX_FIELD}
          placeholder={examplePlaceholder(field)}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    }}
  </Field>
);

/**
 * El cuestionario de alta, contestado por el cliente.
 *
 * ══ Lo que sustituye ═══════════════════════════════════════════════════════
 *
 * Un Word de trece páginas que va por correo, se contesta a mano y se archiva.
 * Todo lo que decide el primer plan está ahí dentro y ninguna de esas respuestas
 * llegaba a la aplicación de una forma que pudiera usar.
 *
 * ══ Se guarda ENTERO y de una vez ══════════════════════════════════════════
 *
 * No campo a campo al salir del foco. En un móvil con mala cobertura, guardar al
 * vuelo son doce peticiones que pueden fallar por separado y dejar media
 * respuesta puesta sin que nadie lo sepa. Aquí se contesta lo que se quiera y se
 * pulsa una vez: o entra todo o no entra nada, y lo que no entra se dice.
 *
 * ══ Y se puede dejar a medias ══════════════════════════════════════════════
 *
 * Ninguna pregunta es obligatoria. Un formulario que no deja guardar sin
 * completarlo se abandona en la tercera pregunta y no llega nada; uno que guarda
 * lo que haya deja a su entrenador con cinco respuestas de siete, que es mucho
 * más de lo que tenía. El contador de arriba dice por dónde va.
 */
export const IntakeQuestions = ({ client }) => {
  const { saveClientProfile } = useActions();

  const form = clientIntakeForm(client.preferences);
  const perfil = client.profile || {};
  const propias = customAnswers(perfil);

  /* El borrador arranca con lo ya contestado: volver a la pantalla tiene que
     enseñar lo que puso, no un formulario en blanco que invita a repetirlo. */
  const [borrador, setBorrador] = useState(() => ({ ...perfil, custom: { ...propias } }));
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState(null);

  if (isFormEmpty(form)) return null;

  const tandas = formSections(form);
  const progreso = formProgress(form, perfil);

  const set = (field) => (valor) =>
    setBorrador((prev) =>
      field.custom
        ? { ...prev, custom: { ...prev.custom, [field.id]: valor } }
        : { ...prev, [field.id]: valor }
    );

  const valorDe = (field) => (field.custom ? borrador.custom?.[field.id] : borrador[field.id]);

  const guardar = async (e) => {
    e.preventDefault();
    setGuardando(true);
    setAviso(null);

    /*
      Se manda SOLO lo que este formulario pregunta, no el borrador entero.

      El borrador arrastra lo que ya había en el perfil —incluido lo que apuntó
      el entrenador y que aquí ni se pinta—, y devolvérselo tal cual sería
      escribirlo otra vez con el valor que tuviera al abrir la pantalla. Mandando
      solo lo preguntado, la mezcla de `set_client_profile` hace lo que dice.
    */
    const respuestas = {};
    for (const id of form.asked) respuestas[id] = borrador[id] ?? null;
    if (form.custom.length > 0) {
      respuestas.custom = {
        ...propias,
        ...Object.fromEntries(form.custom.map((q) => [q.id, borrador.custom?.[q.id] ?? null])),
      };
    }

    const res = await saveClientProfile(client.id, respuestas);
    setGuardando(false);
    setAviso(
      res.ok
        ? { tone: 'success', text: 'Guardado. Puedes volver y cambiarlo cuando quieras.' }
        : { tone: 'error', text: res.error }
    );
  };

  return (
    <Panel
      title="Cuéntanos de ti"
      sub="Con esto te montan la rutina y la dieta. No hace falta que lo contestes todo de una vez."
      className="col gap-4"
      action={
        <span className={`badge${progreso.done === progreso.total ? ' badge-ok' : ''}`}>
          {progreso.done === progreso.total && <Check size={11} />} {progreso.done} de{' '}
          {progreso.total}
        </span>
      }
    >
      {/* La barra dice lo mismo que la chapa de la cabecera y lo dice de otra
          manera: una cifra es un dato, una barra es la promesa de que se acaba.
          En un formulario que se puede dejar a medias, saber cuánto queda es lo
          que decide si se retoma. */}
      <div
        className="form-progress"
        role="progressbar"
        aria-valuenow={progreso.done}
        aria-valuemin={0}
        aria-valuemax={progreso.total}
        aria-label="Preguntas contestadas"
      >
        <i style={{ width: `${progreso.total ? (progreso.done / progreso.total) * 100 : 0}%` }} />
      </div>

      {form.intro && <p className="t-sm t-secondary">{form.intro}</p>}
      {aviso && <Notice tone={aviso.tone}>{aviso.text}</Notice>}

      {/*
        Lo obligatorio que falta, NOMBRADO.

        No bloquea el guardado —un formulario que no deja guardar sin completarlo
        se abandona en la tercera pregunta— pero sí impide que el alta se dé por
        terminada. Y se dice cuáles son: «te falta algo obligatorio» sin decir qué
        es una pantalla que no se puede obedecer.
      */}
      {progreso.missing.length > 0 && (
        <Notice tone="warn">
          Tu entrenador necesita {progreso.missing.length === 1 ? 'esto' : 'estas cosas'} para poder
          empezar: {progreso.missing.map((q) => q.label).join(', ')}. Puedes guardar lo demás
          igualmente y volver.
        </Notice>
      )}

      <form className="col gap-4" onSubmit={guardar}>
        {tandas.map((tanda, i) => (
          <div key={tanda.id} className="form-block col gap-3">
            <span className="section-label">
              {/* El número, y no un icono: dice cuántas tandas quedan sin tener
                  que contarlas, que es la pregunta de quien rellena algo largo
                  en un móvil. */}
              <span className="n" aria-hidden="true">
                {i + 1}
              </span>
              {tanda.label}
            </span>
            <div className="grid-2">
              {tanda.fields.map((field) => (
                <Pregunta
                  key={field.id}
                  field={field}
                  obligatoria={isRequired(form, field.id)}
                  value={valorDe(field)}
                  onChange={set(field)}
                />
              ))}
            </div>
          </div>
        ))}

        <div className="row gap-2">
          <button type="submit" className="btn btn-primary btn-sm" disabled={guardando}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
          <span className="t-xs t-tertiary" style={{ alignSelf: 'center' }}>
            Puedes dejarlo a medias y seguir otro día.
          </span>
        </div>
      </form>
    </Panel>
  );
};
