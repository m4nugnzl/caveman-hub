import { useState } from 'react';
import { Plus } from 'lucide-react';

import { MUSCLE_GROUPS, buildExercise } from '@/domain/training';
import { clampInt } from '@/lib/num';
import { Field } from '@/components/ui/primitives';
import { Autocomplete } from '@/components/ui/Autocomplete';

/* 3 series por defecto: es lo que más se programa (decisión del autor, 21/08).
   Cambiarlas en el formulario sigue costando un toque. */
const EMPTY = { name: '', muscle: 'Pecho', targetReps: '8-10', numSets: '3' };

/* Hasta cuándo vale un ejercicio que se añade desde la hoja. Un cambio se hace
   para quedarse, así que el bloque va primero; lo de a prueba y lo puntual
   existen porque también son de verdad —«le meto esto tres semanas y vemos»—. */
const ALCANCES = {
  bloque: 'Entra en el plan del bloque: lo ven todos sus microciclos.',
  unas: 'Tres microciclos desde este. Después vuelve solo al plan.',
  una: 'Solo aquí. El bloque no se toca.',
};
const SEMANAS = { bloque: undefined, unas: 3, una: 1 };

/**
 * @param enHoja  El formulario vive dentro de una hoja (el FAB del teléfono):
 *   nace abierto, tras añadir SIGUE abierto —lo normal es meter varios
 *   seguidos— y «Cancelar» cierra la hoja entera vía `onClose`.
 */
export const AddExerciseForm = ({ library, onAdd, onRememberExercise, enHoja = false, onClose, onAlcance = false }) => {
  const [open, setOpen] = useState(enHoja);
  /* Hasta cuándo vale el alta. Ver `ALCANCES`. */
  const [solo, setSolo] = useState('bloque');
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
        numSets: clampInt(form.numSets, 1, 12, 3),
        targetReps: form.targetReps.trim(),
      }),
      { semanas: SEMANAS[solo] }
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

      {/*
        ── Hasta dónde llega el alta ───────────────────────────────────────
        Un ejercicio que se añade desde la hoja va AL BLOQUE: lo normal es que
        un cambio se haga para quedarse. Pero probar algo unas semanas también
        es de verdad, así que el tramo se elige aquí y no se deduce.

        Va en el formulario y no en un menú aparte porque el alcance se decide
        ANTES de añadir, que es cuando se sabe; después ya hay que deshacer.
      */}
      {onAlcance && (
        <label className="alta-alcance">
          <span className="k">Hasta cuándo</span>
          <select className="select select-sm" value={solo} onChange={(e) => setSolo(e.target.value)}>
            <option value="bloque">En el bloque, mientras dure</option>
            <option value="unas">Unas semanas, a prueba</option>
            <option value="una">Solo este microciclo</option>
          </select>
          <small>{ALCANCES[solo]}</small>
        </label>
      )}

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
