import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

import { MUSCLE_GROUPS, buildExercise } from '@/domain/training';
import { clampInt } from '@/lib/num';
import { Autocomplete } from '@/components/ui/Autocomplete';
import { Modal } from '@/components/ui/Modal';

/**
 * ESCRIBIR UNA HOJA: el banco donde se le meten los ejercicios.
 *
 * ══ Por qué se abre y no se escribe en la columna ══════════════════════════
 *
 * El alta vivía DENTRO de la tarjeta de la hoja, en la rejilla del bloque, y
 * ahí no cabía. Una columna del plan mide 168 px cuando hay seis hojas: el
 * buscador no tenía sitio para enseñar una sola sugerencia, el músculo y la
 * pauta bajaban cada uno a su renglón, y «Añadir / Listo» hacían un tercero.
 * Tres cosas que hacer en una caja del ancho de un dedo, con el formulario
 * empujando el resto de la rejilla hacia abajo mientras estuviera abierto.
 *
 * Y tenía un vicio peor: dejaba a la hoja peleando consigo misma. Con el alta
 * puesta, quitar el ejercicio que se acababa de escribir mal era ir a buscar
 * una papelera que solo aparecía al pasar por encima, en una fila de 30 px y
 * pegada a la pauta.
 *
 * Aquí la hoja se abre entera: arriba lo que se escribe, debajo lo que ya
 * lleva, y las dos cosas se ven a la vez. Se meten cinco seguidos sin cerrar
 * nada —el campo se vacía y vuelve a coger el foco— y quitar uno es pulsar su
 * papelera, que está siempre y tiene su sitio.
 *
 * ── Lo que NO hace ─────────────────────────────────────────────────────────
 * No propone ejercicios ni corrige la pauta: enseña la biblioteca del
 * entrenador y su catálogo, y el criterio lo pone él. La app resalta
 * información, no receta.
 */

const NUEVO = { name: '', muscle: 'Pecho', series: '3', reps: '8-10' };

export const EscribirHoja = ({
  open,
  dayName,
  exercises,
  library,
  nota = null,
  onAdd,
  onQuitar,
  onSeries,
  onReps,
  onRecordar,
  onClose,
}) => {
  const [form, setForm] = useState(NUEVO);
  /* Cuántos van metidos en esta apertura. No es adorno: remonta el buscador
     —de ahí el `key`— y con él vuelve el `autoFocus`, que es lo que deja meter
     el siguiente sin tocar el ratón. Va aparte del número de ejercicios de la
     hoja a propósito: quitar uno no puede borrar lo que se esté tecleando. */
  const [metidos, setMetidos] = useState(0);
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const enviar = (event) => {
    event.preventDefault();
    const name = form.name.trim();
    if (!name) return;
    onAdd(
      buildExercise({
        name,
        muscle: form.muscle,
        numSets: clampInt(form.series, 1, 12, 3),
        targetReps: form.reps.trim(),
      })
    );
    onRecordar(name, form.muscle);
    /* El músculo y la pauta se quedan: quien mete cuatro de espalda a 3 × 8-10
       no quiere volver a elegirlos cuatro veces. */
    setForm((f) => ({ ...NUEVO, muscle: f.muscle, series: f.series, reps: f.reps }));
    setMetidos((n) => n + 1);
  };

  const series = exercises.reduce((n, ex) => n + ex.series, 0);

  /* El foco solo se toma donde hay teclado físico. Es la misma regla que aplica
     `ui/Modal` al abrirse: en táctil, enfocar un campo levanta el teclado en
     pantalla encima de la hoja recién abierta, antes de haber podido leerla. */
  const conTeclado = typeof window !== 'undefined' && window.matchMedia('(hover: hover)').matches;

  return (
    <Modal
      open={open}
      size="lg"
      title={`Escribir «${dayName}»`}
      onClose={onClose}
      /* Un solo botón principal en la ventana, y es «Añadir»: es el trabajo.
         Salir es salir —también con Escape, con la equis y pulsando fuera—, y
         a su lado va el alcance de lo que se acaba de escribir. */
      footer={
        <div className="escribir-pie">
          <span className="t-xs t-tertiary">{nota}</span>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Listo
          </button>
        </div>
      }
    >
      <div className="escribir">
        <form className="escribir-alta" onSubmit={enviar}>
          <Autocomplete
            key={`nombre-${metidos}`}
            value={form.name}
            onChange={(value) => set('name', value)}
            items={library}
            getMeta={(item) => (item.fromCatalog ? `${item.muscle} · del catálogo` : item.muscle)}
            onPick={(item) => setForm((f) => ({ ...f, name: item.name, muscle: item.muscle || f.muscle }))}
            placeholder="Busca un ejercicio o escribe uno nuevo"
            inputProps={{ autoFocus: conTeclado, 'aria-label': `Nombre del ejercicio nuevo de ${dayName}` }}
          />

          <div className="escribir-alta-pie">
            <select
              className="select"
              value={form.muscle}
              aria-label="Músculo principal"
              onChange={(e) => set('muscle', e.target.value)}
            >
              {MUSCLE_GROUPS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>

            <span className="escribir-pauta">
              <input
                className="plan-series"
                inputMode="numeric"
                value={form.series}
                aria-label="Número de series"
                onChange={(e) => set('series', e.target.value)}
              />
              <span className="plan-por" aria-hidden="true">
                ×
              </span>
              <input
                className="plan-reps"
                value={form.reps}
                aria-label="Repeticiones objetivo"
                placeholder="8-10"
                onChange={(e) => set('reps', e.target.value)}
              />
            </span>

            <button type="submit" className="btn btn-primary" disabled={!form.name.trim()}>
              <Plus size={15} /> Añadir
            </button>
          </div>
        </form>

        {/* Lo que la hoja lleva ya: es la mitad de la razón de abrir esto. Sin
            ello se escribe a ciegas y se repite el tercer ejercicio. */}
        <div className="escribir-cab">
          <span className="section-label">En la hoja</span>
          <span className="t-xs t-tertiary tnum">
            {exercises.length === 0
              ? 'nada todavía'
              : `${exercises.length} ${exercises.length === 1 ? 'ejercicio' : 'ejercicios'} · ${series} series`}
          </span>
        </div>

        {exercises.length === 0 ? (
          <p className="t-sm t-tertiary">
            «{dayName}» está en blanco. Lo que escribas arriba aparece aquí.
          </p>
        ) : (
          <ol className="escribir-lista">
            {exercises.map((ex, i) => (
              <li className="escribir-ej" key={ex.id}>
                <span className="escribir-num" aria-hidden="true">
                  {i + 1}
                </span>
                <span className="escribir-say">
                  <span className="escribir-nombre">{ex.name}</span>
                  {ex.muscle && <span className="escribir-musculo">{ex.muscle}</span>}
                </span>
                <span className="escribir-pauta">
                  <input
                    className="plan-series"
                    inputMode="numeric"
                    defaultValue={ex.series}
                    key={`s-${ex.id}-${ex.series}`}
                    aria-label={`Series de ${ex.name}`}
                    onBlur={(e) => {
                      const n = clampInt(e.target.value, 1, 12, ex.series);
                      if (n !== ex.series) onSeries(dayName, ex.name, n, ex.series);
                      e.target.value = n;
                    }}
                  />
                  <span className="plan-por" aria-hidden="true">
                    ×
                  </span>
                  <input
                    className="plan-reps"
                    defaultValue={ex.targetReps ?? ''}
                    key={`r-${ex.id}-${ex.targetReps}`}
                    placeholder={ex.targetReps === null ? 'varias' : '8-10'}
                    aria-label={`Repeticiones objetivo de ${ex.name}`}
                    onBlur={(e) => {
                      const reps = e.target.value.trim();
                      if (reps !== (ex.targetReps ?? '')) onReps(dayName, ex.name, reps);
                    }}
                  />
                </span>
                <button
                  type="button"
                  className="btn btn-icon btn-icon-compact btn-icon-danger"
                  aria-label={`Quitar ${ex.name}`}
                  onClick={() => onQuitar(dayName, ex.name)}
                >
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>
    </Modal>
  );
};
