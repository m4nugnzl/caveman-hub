import { useState } from 'react';
import { HeartPulse, Plus } from 'lucide-react';

import { useActions, useData } from '@/context/AppContext';
import { AREAS, MAX_DETAIL, MAX_LABEL, activeConditions, areaShort } from '@/domain/conditions';
import { Field, Notice, Panel, SegmentedControl } from '@/components/ui/primitives';

/**
 * Lo que el cliente declara de su salud.
 *
 * ══ Por qué esto faltaba, y por qué era lo más grave que faltaba ═══════════
 *
 * El cuestionario de alta preguntaba a qué hora entrena y cuántas comidas hace,
 * y **no preguntaba por sus lesiones ni por sus alergias**. Eso no es una
 * anamnesis: es una ficha de preferencias con nombre de historial.
 *
 * Y quien sabe que tiene una hernia es él. Que lo cuente por WhatsApp para que su
 * entrenador lo teclee es el trabajo que esto vino a quitar — y es donde se
 * pierde, en un hilo de mensajes.
 *
 * ══ Añade, y no toca lo que ya hay ═════════════════════════════════════════
 *
 * La política de la 0081 le da INSERT y nada más. Lo que apunta su entrenador es
 * criterio profesional —«sin peso muerto libre hasta que la resonancia diga otra
 * cosa»— y no se puede borrar ni suavizar desde aquí; y dar una lesión por
 * curada es una decisión clínica, así que la toma quien la valoró.
 *
 * Por eso esta pantalla no tiene papelera y lo ya declarado sale en modo lectura:
 * enseñar controles que van a fallar es peor que no tenerlos.
 *
 * ══ Y no elige la gravedad ═════════════════════════════════════════════════
 *
 * Todo lo que entra por aquí es «tenlo en cuenta». Que algo sea un VETO —«esto no
 * se le puede poner»— cambia lo que se prescribe, así que lo decide quien
 * prescribe. Su entrenador lo sube desde la ficha.
 */
export const IntakeHealth = ({ client }) => {
  const { conditions } = useData();
  const { addCondition } = useActions();

  const [form, setForm] = useState({ label: '', area: 'training', detail: '' });
  const [guardando, setGuardando] = useState(false);
  const [fallo, setFallo] = useState(null);

  const limpio = form.label.trim();
  const declarados = activeConditions(conditions);

  const anadir = async (e) => {
    e.preventDefault();
    if (!limpio || guardando) return;

    setGuardando(true);
    setFallo(null);
    /* `severity` va a lo suyo y no se ofrece: ver la cabecera. */
    const res = await addCondition(client.id, {
      label: limpio,
      area: form.area,
      detail: form.detail.trim(),
      severity: 'note',
    });
    setGuardando(false);

    if (!res.ok) {
      setFallo(res.error);
      return;
    }
    setForm({ label: '', area: form.area, detail: '' });
  };

  return (
    <Panel
      title="Tu salud"
      sub="Lesiones, dolores, alergias, intolerancias, lo que estés tomando. Con esto se decide qué se te puede poner y qué no."
      className="col gap-3"
    >
      {fallo && <Notice tone="error">{fallo}</Notice>}

      {declarados.length > 0 && (
        <div className="col gap-2">
          {declarados.map((c) => (
            <div key={c.id} className="card-inset col gap-1">
              <span className="row gap-2 wrap t-sm" style={{ alignItems: 'baseline' }}>
                <span style={{ fontWeight: 600 }}>{c.label}</span>
                <span className="badge">{areaShort(c.area)}</span>
              </span>
              {c.detail && <span className="t-xs t-secondary">{c.detail}</span>}
            </div>
          ))}
          <p className="t-2xs t-tertiary">
            Para quitar o cambiar algo de esta lista, díselo a tu entrenador: lo que hay aquí es lo
            que decide tu plan.
          </p>
        </div>
      )}

      <form className="card-inset col gap-3" onSubmit={anadir}>
        <Field label="¿Algo que debamos saber?">
          {(props) => (
            <input
              {...props}
              className="input"
              maxLength={MAX_LABEL}
              placeholder="Ej.: molestia en el hombro derecho"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
            />
          )}
        </Field>

        <div className="row-end wrap gap-3">
          <Field label="Te afecta al" className="grow">
            <SegmentedControl
              label="A qué te afecta"
              value={form.area}
              onChange={(area) => setForm({ ...form, area })}
              options={AREAS.map((a) => ({ id: a.id, label: a.short }))}
            />
          </Field>
        </div>

        <Field label="Cuéntalo un poco" hint="Desde cuándo, qué te duele, qué te han dicho.">
          {(props) => (
            <textarea
              {...props}
              className="input"
              rows={2}
              maxLength={MAX_DETAIL}
              value={form.detail}
              onChange={(e) => setForm({ ...form, detail: e.target.value })}
            />
          )}
        </Field>

        <div className="row gap-2">
          <button type="submit" className="btn btn-secondary btn-sm" disabled={!limpio || guardando}>
            <Plus size={14} /> {guardando ? 'Guardando…' : 'Añadir'}
          </button>
          {declarados.length === 0 && (
            <span className="row gap-2 t-xs t-tertiary" style={{ alignSelf: 'center' }}>
              <HeartPulse size={13} /> Si no tienes nada, puedes seguir sin rellenarlo.
            </span>
          )}
        </div>
      </form>
    </Panel>
  );
};
