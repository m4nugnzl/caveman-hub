import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

import { useApp } from '@/context/AppContext';
import { PROFILE_GROUPS, fieldsOf } from '@/domain/profile';
import {
  CUSTOM_KINDS,
  MAX_CUSTOM,
  MAX_LABEL,
  addCustom,
  coachIntakeForm,
  intakeFormToPreferences,
  isRequired,
  removeCustom,
  toggleAsked,
  toggleRequired,
} from '@/domain/intakeForm';
import { Field, Notice, Panel } from '@/components/ui/primitives';

/**
 * Qué le preguntas a un cliente nuevo.
 *
 * ══ Por qué esto vive en el protocolo y no en una pantalla propia ══════════
 *
 * Porque es la misma decisión que las otras cuatro de esta pantalla: **qué le
 * pides a tus clientes**. Los pasos del alta, los módulos, las preguntas de la
 * sesión y las del check-in contestan todas a eso, y el cuestionario de entrada
 * es la primera de la serie por orden de tiempo.
 *
 * ══ Las preguntas NO se inventan aquí ══════════════════════════════════════
 *
 * Son los campos de la ficha (`domain/profile.js`), y aquí solo se elige cuáles
 * se le piden al cliente. Un catálogo propio tendría que mantenerse en paralelo
 * con el de la ficha, y a la tercera semana preguntarían cosas distintas — que
 * es el fallo que este proyecto ya evitó dos veces, con las preguntas del
 * check-in y con los pasos del alta.
 *
 * Lo que sí se inventa son las tuyas: las que no están en ningún catálogo porque
 * son de tu forma de trabajar. Ésas la aplicación las guarda y las enseña, y no
 * actúa sobre ellas — y eso se dice abajo, para que nadie espere lo contrario.
 */
export const IntakeFormSection = () => {
  const { coachPrefs, updateCoachPreferences } = useApp();

  const form = coachIntakeForm(coachPrefs);
  const [nueva, setNueva] = useState({ label: '', kind: 'text' });

  /*
    `updateCoachPreferences` recibe (SECCIÓN, parche) y mezcla el parche dentro de
    esa sección — no un objeto suelto con la sección dentro. Llamándola con un
    solo argumento, `section` acababa siendo el objeto y la clave escrita se
    llamaba «[object Object]»: no fallaba nada, no había error, y las casillas
    parecían muertas porque lo guardado no volvía por donde se leía.
  */
  const guardar = (siguiente) =>
    updateCoachPreferences('intakeForm', intakeFormToPreferences(siguiente));

  const anadir = (e) => {
    e.preventDefault();
    const limpio = nueva.label.trim();
    if (!limpio) return;
    guardar(addCustom(form, { label: limpio, kind: nueva.kind }));
    setNueva({ label: '', kind: nueva.kind });
  };

  const total = form.asked.length + form.custom.length + (form.askHealth ? 1 : 0);

  return (
    <Panel
      title="El cuestionario"
      sub="Las preguntas que contesta él desde su portal. Cada respuesta cae en su ficha, en el bloque que le toca."
      className="col gap-4"
      action={<span className="badge">{total}</span>}
    >
      {total === 0 && (
        <Notice tone="info">
          Sin ninguna pregunta puesta, tu cliente no ve formulario: su alta se queda en las fotos de
          su gimnasio. Enciende las que quieras y aparece.
        </Notice>
      )}

      {/* Las del catálogo, en las mismas dos tandas que la ficha. Que se lean con
          las mismas palabras en los dos sitios es lo que hace evidente dónde va a
          aparecer cada respuesta. */}
      {PROFILE_GROUPS.map((grupo) => (
        <div key={grupo.id} className="col gap-2">
          <span className="section-label">{grupo.label}</span>
          <div className="grid-2">
            {fieldsOf(grupo.id).map((field) => (
              <div
                key={field.id}
                className={`ask-row${form.asked.includes(field.id) ? ' is-on' : ''}`}
              >
                <label className="checkbox-row" style={{ minWidth: 0 }}>
                  <input
                    type="checkbox"
                    checked={form.asked.includes(field.id)}
                    onChange={() => guardar(toggleAsked(form, field.id))}
                  />
                  <span className="col" style={{ gap: 0, minWidth: 0 }}>
                    <span className="t-sm" style={{ fontWeight: 600 }}>
                      {field.label}
                    </span>
                    {field.hint && <span className="ask-hint t-2xs t-tertiary">{field.hint}</span>}
                  </span>
                </label>

                {/* «Obligatoria» solo aparece si además la preguntas: marcarla en
                    algo que nadie ve dejaría el alta bloqueada por una pregunta
                    invisible. */}
                {form.asked.includes(field.id) && (
                  <button
                    type="button"
                    className="chip ask-req"
                    aria-pressed={isRequired(form, field.id)}
                    onClick={() => guardar(toggleRequired(form, field.id))}
                  >
                    Obligatoria
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {/*
        Preguntar por su salud: un interruptor y no una pregunta más de la lista.

        Porque no es un campo del perfil —son filas de `client_conditions`, con su
        área y su gravedad— y porque es la parte que convierte esto en una
        anamnesis. Nace ENCENDIDA, que es la única excepción a la regla de que
        nada llega encendido: un cuestionario de alta que no pregunta por las
        lesiones es una ficha de preferencias con otro nombre.
      */}
      <div className="col gap-2">
        <span className="section-label">Su salud</span>
        <label className="checkbox-row is-block" style={{ minWidth: 0 }}>
          <input
            type="checkbox"
            checked={form.askHealth}
            onChange={() => guardar({ ...form, askHealth: !form.askHealth })}
          />
          <span className="col gap-1" style={{ minWidth: 0 }}>
            <span className="t-sm" style={{ fontWeight: 600 }}>
              Pregúntale por sus lesiones y alergias
            </span>
            <span className="t-2xs t-tertiary">
              Lo que declare aparece en sus Condicionantes, y con ello en su rutina y en su dieta.
              Él añade; quitar o marcar como veto es cosa tuya.
            </span>
          </span>
        </label>
      </div>

      {/* Las tuyas */}
      <div className="col gap-2">
        <span className="section-label">Tus preguntas</span>

        {form.custom.length === 0 ? (
          <p className="t-xs t-tertiary">
            Las que no están arriba porque son tuyas. La aplicación las guarda y te las enseña en su
            ficha; no hace nada más con ellas.
          </p>
        ) : (
          <div className="col gap-2">
            {form.custom.map((q) => (
              <div key={q.id} className="card-inset row between wrap gap-2">
                <span className="col gap-1" style={{ minWidth: 0 }}>
                  <span className="t-sm" style={{ fontWeight: 600 }}>
                    {q.label}
                  </span>
                  <span className="t-2xs t-tertiary">
                    {CUSTOM_KINDS.find((k) => k.id === q.kind)?.label}
                  </span>
                </span>
                <button
                  type="button"
                  className="btn btn-plain btn-sm"
                  aria-label={`Quitar «${q.label}»`}
                  onClick={() => guardar(removeCustom(form, q.id))}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        {form.custom.length < MAX_CUSTOM ? (
          <form className="row-end wrap gap-3" onSubmit={anadir}>
            <Field label="Añadir una tuya" className="grow">
              {(props) => (
                <input
                  {...props}
                  className="input"
                  maxLength={MAX_LABEL}
                  placeholder="¿Con quién vives y quién cocina?"
                  value={nueva.label}
                  onChange={(e) => setNueva({ ...nueva, label: e.target.value })}
                />
              )}
            </Field>
            <Field label="Se contesta con">
              {(props) => (
                <select
                  {...props}
                  className="select"
                  value={nueva.kind}
                  onChange={(e) => setNueva({ ...nueva, kind: e.target.value })}
                >
                  {CUSTOM_KINDS.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.label}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <button type="submit" className="btn btn-secondary btn-sm" disabled={!nueva.label.trim()}>
              <Plus size={14} /> Añadir
            </button>
          </form>
        ) : (
          <p className="t-xs t-tertiary">
            Son {MAX_CUSTOM} como máximo. Un formulario más largo que eso se abandona a la mitad y
            no llega ninguna respuesta.
          </p>
        )}
      </div>

      {/*
        Lo que hay que decir en voz alta, porque nadie lo adivina: la plantilla es
        para los clientes NUEVOS. Es el mismo trato que el protocolo —cambiarla no
        toca a nadie ya dado de alta— y aquí importa más, porque quien lo dé por
        supuesto se quedará esperando respuestas que no van a llegar.
      */}
      <p className="t-xs t-tertiary">
        Esto se copia a cada cliente que des de alta a partir de ahora. A los que ya tienes no les
        cambia el formulario — su cuestionario es el que se les copió el día que entraron. Todo lo
        que contesten cae en su ficha, en los bloques de la persona.
      </p>
    </Panel>
  );
};
