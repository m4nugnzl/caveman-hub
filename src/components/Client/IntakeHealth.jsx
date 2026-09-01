import { useState } from 'react';
import { HeartPulse, Plus } from 'lucide-react';

import { useActions, useData } from '@/context/AppContext';
import { AREAS, MAX_DETAIL, MAX_LABEL, activeConditions, areaShort } from '@/domain/conditions';
import {
  BotonAccion,
  Field,
  Notice,
  Panel,
  SegmentedControl,
  useAccionDeBoton,
} from '@/components/ui/primitives';

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
  /* El giro y el tic del botón de añadir; ver `BotonAccion`. */
  const alta = useAccionDeBoton();
  const [fallo, setFallo] = useState(null);
  /*
    Lo último añadido, para poder decirlo.

    Sin esto, añadir algo vaciaba el formulario y ya está: la fila aparecía
    arriba, fuera de donde estaba mirando el dedo en un móvil, y desde abajo la
    pantalla no daba ninguna señal de que hubiera pasado nada. Un formulario que
    se vacía sin acusar recibo se rellena dos veces.
  */
  const [ultimo, setUltimo] = useState('');

  const limpio = form.label.trim();
  const declarados = activeConditions(conditions);

  const anadir = (e) => {
    e.preventDefault();
    if (!limpio) return;

    alta.lanzar(async () => {
      setFallo(null);
      setUltimo('');
      /* `severity` va a lo suyo y no se ofrece: ver la cabecera. */
      const res = await addCondition(client.id, {
        label: limpio,
        area: form.area,
        detail: form.detail.trim(),
        severity: 'note',
      });
      if (!res.ok) {
        setFallo(res.error);
        return false;
      }
      setUltimo(limpio);
      setForm({ label: '', area: form.area, detail: '' });
      return true;
    });
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
          {/* Un rótulo, porque la lista y el formulario de abajo se parecen
              demasiado: sin él, lo primero que se ve al abrir el apartado son
              cajas con texto y no queda claro cuál es lo ya contado y cuál lo
              que se está escribiendo. */}
          <span className="section-label">Lo que ya sabe tu entrenador</span>
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
        <span className="section-label">
          {declarados.length > 0 ? 'Añadir otra cosa' : 'Cuéntanos'}
        </span>

        {/* El acuse de recibo, donde está el dedo. Se va solo al escribir la
            siguiente, así que no hay nada que cerrar. */}
        {ultimo && !limpio && (
          <Notice tone="success">
            Apuntado: «{ultimo}». Tu entrenador ya lo ve en tu ficha.
          </Notice>
        )}

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
          <BotonAccion
            type="submit"
            className="btn btn-secondary btn-sm"
            icon={Plus}
            estado={alta.estado}
            disabled={!limpio}
          >
            Añadir
          </BotonAccion>
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
