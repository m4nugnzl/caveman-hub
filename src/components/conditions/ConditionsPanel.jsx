import { useState } from 'react';
import { Check, HeartPulse, Plus, RotateCcw, Trash2, X } from 'lucide-react';

import { useActions, useData } from '@/context/AppContext';
import {
  AREAS,
  MAX_DETAIL,
  MAX_LABEL,
  SEVERITIES,
  activeConditions,
  areaShort,
  catalogFor,
  resolvedConditions,
} from '@/domain/conditions';
import { shortDate, todayISO } from '@/lib/dates';
import {
  BotonAccion,
  Field,
  Fold,
  Notice,
  Panel,
  SegmentedControl,
  useAccionDeBoton,
} from '@/components/ui/primitives';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { useToast } from '@/components/ui/ToastProvider';

/**
 * Apuntar uno nuevo.
 *
 * ── Las sugerencias van ANTES del campo, no dentro de un desplegable ────────
 * Un `<select>` con dieciséis patologías obliga a abrirlo y a leerlas todas para
 * descubrir que la tuya no está — y la tuya casi nunca está, porque «hernia
 * L5-S1 del año pasado» no cabe en ninguna lista. Como chips delante del campo,
 * la sugerencia rellena y se puede retocar, y quien no la ve escribe y ya está.
 *
 * Es el mismo trato que da `catalog.js` a los alimentos: el catálogo no se
 * navega, se mezcla con lo tuyo en el sitio donde ya estabas escribiendo.
 */
const Alta = ({ existing, onAdd, onCancel }) => {
  const [form, setForm] = useState({ label: '', area: 'training', severity: 'note', since: '', detail: '' });
  const [error, setError] = useState('');
  /* El giro y el tic del botón de añadir; ver `BotonAccion`. */
  const alta = useAccionDeBoton();

  const limpio = form.label.trim();
  const sugerencias = catalogFor(form.area, existing);

  const guardar = (e) => {
    e.preventDefault();
    if (!limpio) return;

    alta.lanzar(async () => {
      setError('');
      const res = await onAdd({ ...form, label: limpio, detail: form.detail.trim() });
      if (!res.ok) {
        setError(res.error);
        return false;
      }
      setForm({ label: '', area: form.area, severity: 'note', since: '', detail: '' });
      return true;
    });
  };

  return (
    <form className="card-inset col gap-3 swap-in" onSubmit={guardar}>
      <Field label="Qué es" error={error || null}>
        {(props) => (
          <input
            {...props}
            autoFocus
            className="input"
            maxLength={MAX_LABEL}
            placeholder="Hernia L5-S1, alergia a los frutos secos…"
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
          />
        )}
      </Field>

      {sugerencias.length > 0 && !limpio && (
        <div className="col gap-1">
          <span className="t-2xs t-tertiary">O elige uno de los habituales:</span>
          <div className="rail-wrap" role="group" aria-label="Condicionantes habituales">
            {sugerencias.map((s) => (
              <button
                key={s.label}
                type="button"
                className="chip"
                /* La sugerencia trae su área puesta: una celiaquía apuntada
                   como condicionante de entrenamiento no la vería nunca quien
                   monta la dieta, que es el único sitio donde importa. */
                onClick={() => setForm({ ...form, label: s.label, area: s.area })}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Los tres en UNA fila que envuelve, igual que los cuatro del cobro: en
          dos filas de dos, los controles del mismo bloque se alinean de dos
          maneras distintas y las etiquetas quedan a cuatro alturas. */}
      <div className="row-end wrap gap-4">
        <Field label="A qué afecta" className="grow">
          <SegmentedControl
            label="A qué afecta"
            value={form.area}
            onChange={(area) => setForm({ ...form, area })}
            options={AREAS.map((a) => ({ id: a.id, label: a.short }))}
          />
        </Field>
        <Field label="Cuánto pesa" className="grow">
          <SegmentedControl
            label="Cuánto pesa"
            value={form.severity}
            onChange={(severity) => setForm({ ...form, severity })}
            options={SEVERITIES.map((s) => ({ id: s.id, label: s.id === 'block' ? 'No puede' : 'Ojo' }))}
          />
        </Field>
        {/* Cuándo empezó. Opcional y a propósito el último: de una alergia no se
            sabe y de una lesión sí, y es lo que convierte «hernia» en «hernia
            desde marzo» cuando vuelve a doler dentro de dos años. */}
        <Field label="Desde" hint="Opcional" className="grow">
          {(props) => (
            <input
              {...props}
              type="date"
              className="input"
              max={todayISO()}
              value={form.since}
              onChange={(e) => setForm({ ...form, since: e.target.value })}
            />
          )}
        </Field>
      </div>

      <Field
        label="Detalle"
        hint="Lo que hay que hacer o evitar por esto. Es lo que vas a leer al programar."
      >
        {(props) => (
          <textarea
            {...props}
            className="input"
            rows={2}
            maxLength={MAX_DETAIL}
            placeholder="Sin peso muerto libre; bisagra de cadera con carga axial baja."
            value={form.detail}
            onChange={(e) => setForm({ ...form, detail: e.target.value })}
          />
        )}
      </Field>

      <div className="row gap-2">
        <BotonAccion
          type="submit"
          className="btn btn-primary btn-sm"
          estado={alta.estado}
          disabled={!limpio}
        >
          Añadir
        </BotonAccion>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onCancel}>
          Cerrar
        </button>
      </div>
    </form>
  );
};

/** Uno de la lista, con lo que se puede hacer con él. */
const Fila = ({ condition, onResolve, onRemove }) => (
  <div className="card-inset row between wrap gap-2">
    <div className="col gap-1 grow" style={{ minWidth: 0 }}>
      <div className="row gap-2 wrap" style={{ alignItems: 'baseline' }}>
        <span className="t-sm" style={{ fontWeight: 600 }}>
          {condition.label}
        </span>
        {/* La gravedad solo se dice cuando es un veto. «Ojo» en cada fila sería
            una chapa que aparece siempre, y una chapa que aparece siempre deja
            de leerse: lo que informa es la que NO está en las demás. */}
        {condition.severity === 'block' && <span className="badge badge-warn">No puede</span>}
        <span className="badge">{areaShort(condition.area)}</span>
      </div>
      {condition.detail && <span className="t-xs t-secondary">{condition.detail}</span>}
      {condition.since && (
        <span className="t-2xs t-tertiary">Desde {shortDate(condition.since)}</span>
      )}
    </div>

    <div className="row gap-1">
      <button
        type="button"
        className="btn btn-plain btn-sm"
        title="Darlo por resuelto"
        onClick={onResolve}
      >
        <Check size={14} /> Resuelto
      </button>
      <button type="button" className="btn btn-plain btn-sm" title="Borrarlo" onClick={onRemove}>
        <Trash2 size={14} />
      </button>
    </div>
  </div>
);

/**
 * Los condicionantes de un cliente: el bloque de la ficha.
 *
 * ══ Por qué esto es su propio bloque y no una fila más de «Quién es» ════════
 *
 * Porque es lo único de la ficha que hay que poder AÑADIR y RESOLVER, y porque
 * es lo único que se lee desde otras dos pantallas. Los demás datos de la
 * persona son campos de un formulario que se rellena una vez.
 *
 * ══ Resolver y borrar son cosas distintas ══════════════════════════════════
 *
 * «Resuelto» es lo que le pasa a una lesión que se cura: la fila se queda con su
 * fecha y deja de avisar. Borrar es para lo que se apuntó mal. Si solo existiera
 * borrar, curarse una hernia tiraría el motivo por el que durante cuatro meses
 * no hubo peso muerto — y eso es justo lo que hay que poder mirar cuando se
 * repite.
 *
 * Por eso «Resuelto» va primero y sin confirmación (se deshace en un clic) y
 * borrar sí la pide.
 */
export const ConditionsPanel = ({ client }) => {
  const { conditions } = useData();
  const { addCondition, resolveCondition, removeCondition } = useActions();
  const confirm = useConfirm();
  const toast = useToast();

  const [abriendo, setAbriendo] = useState(false);
  const [fallo, setFallo] = useState(null);

  const vigentes = activeConditions(conditions);
  const resueltos = resolvedConditions(conditions);

  const resolver = async (condition) => {
    const res = await resolveCondition(condition.id);
    if (!res.ok) {
      setFallo(res.error);
      return;
    }
    setFallo(null);
    /* Con «Deshacer», como el cobro y como el borrado de una semana: resolver es
       un clic y equivocarse de fila también. */
    toast({
      text: `«${condition.label}» pasa al historial.`,
      action: { label: 'Deshacer', onClick: () => resolveCondition(condition.id, false) },
    });
  };

  const borrar = async (condition) => {
    const ok = await confirm({
      title: `¿Borrar «${condition.label}»?`,
      message:
        'Desaparece de su ficha y de las secciones donde te lo recuerda, y no queda constancia de que existió. Si simplemente ya no le afecta, usa «Resuelto»: así se conserva por qué su plan fue como fue.',
      confirmLabel: 'Borrar',
      tone: 'danger',
    });
    if (!ok) return;

    const res = await removeCondition(condition.id);
    setFallo(res.ok ? null : res.error);
  };

  return (
    <Panel
      title="Condicionantes"
      sub="Lesiones, patologías, alergias: lo que limita lo que le puedes poner."
      className="col gap-3"
      action={
        !abriendo && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAbriendo(true)}>
            <Plus size={13} /> Añadir
          </button>
        )
      }
    >
      {fallo && <Notice tone="error">{fallo}</Notice>}

      {abriendo && (
        <Alta
          existing={conditions}
          onAdd={(fields) => addCondition(client.id, fields)}
          onCancel={() => setAbriendo(false)}
        />
      )}

      {vigentes.length === 0 && !abriendo && (
        /*
          El estado vacío dice para qué sirve esto, no «no hay nada». Es el único
          bloque de la ficha cuyo valor no se adivina del título: quien lee
          «Condicionantes» y ve una lista vacía no sabe todavía que lo que apunte
          aquí le va a salir al programar, que es toda la razón de rellenarlo.
        */
        <div className="card-inset col gap-2">
          <span className="row gap-2 t-sm t-secondary">
            <HeartPulse size={15} /> Todavía no has apuntado ninguno.
          </span>
          <span className="t-xs t-tertiary">
            Lo que pongas aquí te sale al montar su rutina y al montar su dieta, según a qué afecte.
            Es lo que hoy vive en tu cabeza o en el PDF de su anamnesis.
          </span>
        </div>
      )}

      {vigentes.length > 0 && (
        <div className="col gap-2">
          {vigentes.map((c) => (
            <Fila
              key={c.id}
              condition={c}
              onResolve={() => resolver(c)}
              onRemove={() => borrar(c)}
            />
          ))}
        </div>
      )}

      {/*
        El historial, plegado. No es ruido: saber que hace ocho meses tuvo una
        tendinopatía es lo primero que hay que mirar cuando vuelve a doler lo
        mismo. Pero no es lo que se viene a ver, así que no ocupa sitio.
      */}
      {resueltos.length > 0 && (
        <Fold
          icon={RotateCcw}
          title="Ya resueltos"
          summary={`${resueltos.length}`}
        >
          <div className="col gap-2">
            {resueltos.map((c) => (
              <div key={c.id} className="row between wrap gap-2 t-sm">
                <span className="t-secondary" style={{ minWidth: 0 }}>
                  {c.label}
                  <span className="t-tertiary"> · resuelto el {shortDate(c.resolvedAt)}</span>
                </span>
                <button
                  type="button"
                  className="btn btn-plain btn-sm"
                  onClick={() => resolveCondition(c.id, false)}
                >
                  <X size={13} /> Reabrir
                </button>
              </div>
            ))}
          </div>
        </Fold>
      )}
    </Panel>
  );
};
