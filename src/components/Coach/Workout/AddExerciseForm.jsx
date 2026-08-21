import { useState } from 'react';
import { Plus } from 'lucide-react';

import { MUSCLE_GROUPS, buildExercise } from '@/domain/training';
import { clampInt } from '@/lib/num';
import { Field } from '@/components/ui/primitives';
import { Autocomplete } from '@/components/ui/Autocomplete';

const EMPTY = { name: '', muscle: 'Pecho', targetReps: '8-10', numSets: '4' };

/**
 * @param enHoja  El formulario vive dentro de una hoja (el FAB del teléfono):
 *   nace abierto, tras añadir SIGUE abierto —lo normal es meter varios
 *   seguidos— y «Cancelar» cierra la hoja entera vía `onClose`.
 */
export const AddExerciseForm = ({ library, onAdd, onRememberExercise, enHoja = false, onClose }) => {
  const [open, setOpen] = useState(enHoja);
  const [form, setForm] = useState(EMPTY);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const submit = (event) => {
    event.preventDefault();
    const name = form.name.trim();
    if (!name) return;

    onAdd(
      buildExercise({
        name,
        muscle: form.muscle,
        numSets: clampInt(form.numSets, 1, 12, 4),
        targetReps: form.targetReps.trim(),
      })
    );
    // Se recuerda en la biblioteca del coach para que el autocompletado lo
    // proponga la próxima vez con su grupo muscular ya relleno.
    onRememberExercise(name, form.muscle);

    setForm(EMPTY);
    if (!enHoja) setOpen(false);
  };

  if (!open) {
    return (
      <button type="button" className="btn btn-secondary btn-block btn-lg" onClick={() => setOpen(true)}>
        <Plus size={18} /> Nuevo ejercicio
      </button>
    );
  }

  return (
    <form className="card-inset col gap-4" onSubmit={submit}>
      <div className="row-end wrap gap-4">
        <Field label="Nombre del ejercicio" className="grow" hint="Se guarda para autocompletar después">
          <Autocomplete
            value={form.name}
            onChange={(value) => set('name', value)}
            items={library}
            // «del catálogo» avisa de que ese ejercicio todavía no es tuyo, y por
            // tanto de que al elegirlo pasa a estar en tu biblioteca.
            getMeta={(item) => (item.fromCatalog ? `${item.muscle} · del catálogo` : item.muscle)}
            onPick={(item) => setForm((f) => ({ ...f, name: item.name, muscle: item.muscle || f.muscle }))}
            placeholder="Ej: Press banca"
            inputProps={{ autoFocus: true }}
          />
        </Field>

        <Field label="Músculo principal">
          {(props) => (
            <select
              {...props}
              className="select"
              value={form.muscle}
              onChange={(e) => set('muscle', e.target.value)}
            >
              {MUSCLE_GROUPS.map((muscle) => (
                <option key={muscle} value={muscle}>
                  {muscle}
                </option>
              ))}
            </select>
          )}
        </Field>

        <Field label="Reps objetivo" className="shrink-0">
          {(props) => (
            <input
              {...props}
              className="input input-center"
              style={{ width: 92 }}
              value={form.targetReps}
              onChange={(e) => set('targetReps', e.target.value)}
              placeholder="8-10"
            />
          )}
        </Field>

        <Field label="Nº series" className="shrink-0">
          {(props) => (
            <input
              {...props}
              type="text"
              inputMode="numeric"
              className="input input-center"
              style={{ width: 78 }}
              value={form.numSets}
              onChange={(e) => set('numSets', e.target.value)}
            />
          )}
        </Field>
      </div>

      <div className="row gap-2 wrap">
        <button type="submit" className="btn btn-primary" disabled={!form.name.trim()}>
          Añadir ejercicio
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => (enHoja ? onClose?.() : setOpen(false))}
        >
          Cancelar
        </button>
      </div>
    </form>
  );
};
