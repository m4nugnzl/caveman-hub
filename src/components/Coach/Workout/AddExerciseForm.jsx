import { useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';

import { MUSCLE_GROUPS, buildExercise } from '@/domain/training';
import { clampInt } from '@/lib/num';
import { Autocomplete } from '@/components/ui/Autocomplete';
import { ALCANCES, ALCANCE_POR_DEFECTO, ALCANCE_TITULO, SEMANAS } from './alcances';

/* 3 series por defecto: es lo que más se programa (decisión del autor, 21/08).
   Cambiarlas en el formulario sigue costando un toque. */
const EMPTY = { name: '', muscle: 'Pecho', targetReps: '8-10', numSets: '3' };

/**
 * Añadir un ejercicio a la hoja: UNA LÍNEA, no un formulario.
 *
 * ══ Lo que era, y por qué no valía ══════════════════════════════════════════
 *
 * Un botón del ancho de la mesa que se abría en una tarjeta de 230 px de alto
 * con cuatro campos rotulados, una pista, el alcance con su explicación y dos
 * botones. Para lo que casi siempre es «escribe un nombre y Enter». El dueño,
 * con la captura delante: «el añadir nuevos ejercicios es algo feo e incómodo».
 * Tres cosas lo hacían incómodo de verdad, y ninguna era el tamaño:
 *
 *   · **Cerraba al añadir.** Meter seis ejercicios en una hoja nueva eran seis
 *     viajes al pie de la página. Ahora se queda abierta con el campo limpio y
 *     el foco puesto, que es lo que ya hacía la del teléfono.
 *   · **El desplegable tapaba los botones.** La lista se encajaba al ancho del
 *     campo (132 px) y caía encima de «Añadir ejercicio» y «Cancelar». Con el
 *     nombre ocupando el ancho de la línea, la lista mide lo que tiene que
 *     medir; y `Autocomplete` ya no parte los nombres en tres renglones.
 *   · **Cuatro rótulos para cuatro campos que se explican solos.** «Pecho»,
 *     «8-10» y «3» dicen lo que son. Lo que hace falta saberlo —hasta cuándo
 *     vale el alta— conserva su frase, que es la única que no es obvia.
 *
 * @param enHoja  El formulario vive dentro de una hoja (el FAB del teléfono):
 *   nace abierto y «cerrar» cierra la hoja entera vía `onClose`.
 */
export const AddExerciseForm = ({ library, onAdd, onRememberExercise, enHoja = false, onClose, onAlcance = false }) => {
  const [open, setOpen] = useState(enHoja);
  /* Hasta cuándo vale el alta. Ver `alcances.js`. */
  const [solo, setSolo] = useState(ALCANCE_POR_DEFECTO);
  const [form, setForm] = useState(EMPTY);
  const nombreRef = useRef(null);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const submit = (event) => {
    event.preventDefault();
    const name = form.name.trim();
    if (!name) return;

    /*
      ── El puente con las alternativas de biblioteca se ha retirado ─────────
      Aquí se traían puestas las de tu biblioteca (`exercises.alternatives`) al
      escribir un ejercicio en una hoja. Ese campo salió de la Librería por orden
      del dueño —«material y con qué se cambia en ejercicios no me gusta
      tenerlo»—, así que ya no hay dónde escribirlo: seguir leyéndolo sería
      rellenar el plan desde un dato invisible que nadie puede corregir.

      Y el 9 sep 2026 cayeron también las del PLAN, así que la idea entera —un
      recambio escrito de antemano— ya no existe en el producto: «no me gusta la
      idea de dar alternativas». Ver `domain/training.js`.
    */
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

    /* El nombre se limpia y lo demás SE QUEDA: quien mete un accesorio detrás de
       otro repite músculo, repeticiones y series, y volver a «Pecho · 8-10 · 3»
       en cada alta sería escribir tres veces lo mismo. */
    setForm((f) => ({ ...f, name: '' }));
    nombreRef.current?.focus();
  };

  const cerrar = () => (enHoja ? onClose?.() : setOpen(false));

  /* «ejercicio», en minúscula y con su cruz: el mismo verbo que «+ serie» justo
     encima, que «+ hoja» y que «+ microciclo». El producto entero nombra así lo
     que se añade, y esta era la única puerta que lo gritaba. */
  if (!open) {
    return (
      <button type="button" className="hoja-verbo" onClick={() => setOpen(true)}>
        <Plus size={15} /> ejercicio
      </button>
    );
  }

  return (
    <form className="alta-linea" onSubmit={submit} onKeyDown={(e) => e.key === 'Escape' && cerrar()}>
      <div className="alta-fila">
        <Autocomplete
          value={form.name}
          onChange={(value) => set('name', value)}
          items={library}
          // «del catálogo» avisa de que ese ejercicio todavía no es tuyo, y por
          // tanto de que al elegirlo pasa a estar en tu biblioteca.
          getMeta={(item) =>
            [item.muscle, item.equipment, item.fromCatalog ? 'del catálogo' : null]
              .filter(Boolean)
              .join(' · ')
          }
          /* Y el foco vuelve al campo: elegir con el ratón dejaba el foco en el
             botón de la sugerencia —que es de otro tipo y no envía nada—, así
             que el Enter de después no añadía y parecía que la línea no
             funcionaba. Elegir un nombre es media frase; la otra media se
             escribe donde se estaba escribiendo. */
          onPick={(item) => {
            setForm((f) => ({ ...f, name: item.name, muscle: item.muscle || f.muscle }));
            nombreRef.current?.focus();
          }}
          placeholder="Nombre del ejercicio"
          inputProps={{ autoFocus: true, ref: nombreRef, 'aria-label': 'Nombre del ejercicio' }}
        />

        <select
          className="select select-sm"
          aria-label="Músculo principal"
          title="Músculo principal"
          value={form.muscle}
          onChange={(e) => set('muscle', e.target.value)}
        >
          {MUSCLE_GROUPS.map((muscle) => (
            <option key={muscle} value={muscle}>
              {muscle}
            </option>
          ))}
        </select>

        <input
          className="input input-sm input-center alta-cifra"
          aria-label="Repeticiones objetivo"
          title="Repeticiones objetivo de cada serie"
          value={form.targetReps}
          onChange={(e) => set('targetReps', e.target.value)}
          placeholder="8-10"
        />
        <span className="alta-por">×</span>
        <input
          type="text"
          inputMode="numeric"
          className="input input-sm input-center alta-cifra is-corta"
          aria-label="Número de series"
          title="Cuántas series"
          value={form.numSets}
          onChange={(e) => set('numSets', e.target.value)}
          placeholder="3"
        />

      </div>

      {/*
        ── Hasta dónde llega el alta ─────────────────────────────────────────
        Un ejercicio que se añade desde la hoja va AL BLOQUE: lo normal es que
        un cambio se haga para quedarse. Pero probar algo unas semanas también
        es de verdad, así que el tramo se elige aquí y no se deduce.

        Se elige en la línea y no en un menú aparte porque el alcance se decide
        ANTES de añadir, que es cuando se sabe; después ya hay que deshacer. Y
        va en el renglón de abajo, con su frase al lado: arriba está QUÉ
        ejercicio es, que es lo que se teclea; esto es la letra pequeña, y la
        letra pequeña no puede empujar el nombre a 160 px.
      */}
      <div className="alta-pie">
        {onAlcance && (
          <>
            <select
              className="select select-sm"
              aria-label="Hasta cuándo vale este alta"
              value={solo}
              onChange={(e) => setSolo(e.target.value)}
            >
              {Object.keys(ALCANCES).map((clave) => (
                <option key={clave} value={clave}>
                  {ALCANCE_TITULO[clave]}
                </option>
              ))}
            </select>
            <p className="alta-dice">{ALCANCES[solo]}</p>
          </>
        )}
        {/* Los dos verbos, juntos y al canto: el renglón de arriba es QUÉ
            ejercicio, éste es hasta cuándo y hecho. */}
        <span className="alta-verbos">
          <button
            type="submit"
            className="btn btn-primary btn-sm"
            disabled={!form.name.trim()}
            title="Añadir (Enter)"
          >
            Añadir
          </button>
          {/* En la hoja del teléfono el aspa la pone la ventana, y dos aspas en
              la misma esquina son dos preguntas para una sola salida. */}
          {!enHoja && (
            <button type="button" className="btn btn-icon btn-icon-compact" onClick={cerrar} aria-label="Cerrar el alta">
              <X size={15} />
            </button>
          )}
        </span>
      </div>
    </form>
  );
};
