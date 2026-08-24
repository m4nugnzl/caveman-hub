import { Trash2, X } from 'lucide-react';

import { toExerciseDraft } from '@/domain/routineSheet';
import { MUSCLE_GROUPS } from '@/domain/training';
import { Field, NumberInput } from '@/components/ui/primitives';

/**
 * La rutina leída, tal y como se va a guardar, y editable.
 *
 * ══ Por qué la previsualización no es un lujo ══════════════════════════════
 *
 * Porque es lo único que hace que esto funcione con una hoja que no hemos visto
 * nunca. Cada entrenador guarda su rutina a su manera y no hay lector que las
 * entienda todas; lo que sí se puede garantizar es que **cuando se equivoque se
 * vea, y corregirlo cueste dos clics**. Un importador que acierta el 90 % y
 * escribe en silencio es peor que uno que acierta el 70 % y lo enseña: del
 * segundo te fías, porque lo has mirado.
 *
 * Va aparte del diálogo por dos motivos y el segundo es el bueno: no tiene
 * estado propio —lo recibe todo— así que se puede pintar en una prueba sin
 * simular a nadie escribiendo, y es la parte donde una errata no la detecta ni
 * el linter ni el compilador, solo el ojo.
 */

/* ══ Lo leído, convertido en algo que se puede corregir ════════════════════

   Al principio la previsualización pintaba directamente lo que salía del
   lector y guardaba las correcciones aparte, en un mapa indexado por posición.
   Eso aguantaba cambiar un músculo y se rompía en cuanto había que QUITAR algo,
   que resulta ser la corrección más frecuente: al borrar el segundo día, las
   correcciones del tercero pasaban a aplicarse al que ocupara su sitio.

   Así que lo leído se materializa una vez en una lista editable con identidad
   propia, y a partir de ahí se toca esa lista. Cambiar de fuente —otro fichero,
   otras hojas, otra columna de objetivo— la vuelve a materializar. */

let contador = 0;
export const nuevaId = () => {
  contador += 1;
  return `p${contador}`;
};

export const toEditableDays = (days, targetIndex = 0) =>
  days.map((dia, i) => ({
    id: nuevaId(),
    name: dia.name ?? `Día ${i + 1}`,
    exercises: dia.exercises.map((ex) => ({
      id: nuevaId(),
      name: ex.name,
      muscle: ex.muscle,
      muscleRaw: ex.muscleRaw,
      muscleSure: ex.muscleSure,
      sets: ex.sets,
      /* Un objetivo por serie: la hoja puede pedir 6-8 en la primera y 8-10 en
         las demás, y eso no se puede aplanar sin perderlo. */
      targets: ex.targetOptions[targetIndex] || ex.targetOptions[0] || [],
      rir: ex.rir || '',
      note: ex.note || '',
    })),
  }));

export const contarSeries = (dia) => dia.exercises.reduce((n, e) => n + (Number(e.sets) || 0), 0);

/** «6-8 · 8-10» cuando las series piden cosas distintas; «8-10» cuando no. */
const objetivoVisible = (ex) => [...new Set(ex.targets)].join(' · ');

const redimensionar = (targets, largo) =>
  Array.from({ length: largo }, (_, i) => targets[i] ?? targets[targets.length - 1] ?? '');

/** Aplica un cambio de la tabla, manteniendo coherentes series y objetivos. */
export const aplicarCambio = (ex, patch) => {
  if ('sets' in patch) {
    const n = Number.parseInt(patch.sets, 10);
    /* Se acota al vuelo en vez de admitir un valor imposible y protestar
       después: así de la tabla no puede salir nunca un ejercicio de 0 series. */
    if (!Number.isFinite(n)) return ex;
    const sets = Math.max(1, Math.min(12, n));
    return { ...ex, sets, targets: redimensionar(ex.targets, sets) };
  }
  if ('objetivo' in patch) {
    return { ...ex, targets: Array.from({ length: Math.max(1, ex.sets) }, () => patch.objetivo) };
  }
  return { ...ex, ...patch };
};

/** De la tabla editada a lo que guarda la aplicación. */
export const aBorrador = (dias) =>
  dias.map((dia, i) => ({
    dayName: dia.name.trim() || `Día ${i + 1}`,
    exercises: dia.exercises.map((ex) => toExerciseDraft({ ...ex, targetOptions: [ex.targets] })),
  }));

export const RoutinePreview = ({ days, onRenameDay, onRemoveDay, onChangeExercise, onRemoveExercise }) => (
  <>
    {days.map((dia, di) => (
      <div className="col gap-3" key={dia.id}>
        <div className="row between wrap gap-3">
          {/* El nombre va en un campo y NO dentro del encabezado: un `<input>`
              metido en un `<h3>` deja de ser un encabezado para un lector de
              pantalla, y el proyecto ya tropezó una vez con eso al renombrar el
              equipo. */}
          <Field
            className="grow"
            label={`Día ${di + 1} de ${days.length}`}
            hint={`${dia.exercises.length} ejercicios · ${contarSeries(dia)} series`}
          >
            {(props) => (
              <input
                {...props}
                className="input input-sm"
                value={dia.name}
                onChange={(e) => onRenameDay(di, e.target.value)}
              />
            )}
          </Field>

          {/*
            Quitar un día entero es la corrección MÁS frecuente, porque el fallo
            típico de leer una hoja no es equivocarse en una celda: es traer de
            más —una pestaña que resultó tener dos tablas, un bloque de ejemplo
            de la plantilla—. Sin esto, la única salida era cancelar y volver a
            empezar eligiendo hojas a ciegas.
          */}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => onRemoveDay(di)}
            title={`Quitar «${dia.name}» de lo que se va a crear`}
          >
            <Trash2 size={14} /> Quitar día
          </button>
        </div>

        {/* La tabla se desplaza dentro de su caja: seis columnas en el teléfono
            no caben, y lo que no puede pasar es que empuje el diálogo a lo
            ancho. */}
        <div className="table-scroll">
          <table className="table table-compact">
            <thead>
              <tr>
                <th>Ejercicio</th>
                <th className="num">Series</th>
                <th className="num">Objetivo</th>
                <th className="num">RIR</th>
                <th>Grupo muscular</th>
                <th aria-label="Quitar" />
              </tr>
            </thead>
            <tbody>
              {dia.exercises.map((ex, ei) => (
                <tr key={ex.id}>
                  <td>
                    {ex.name}
                    {ex.note && <div className="t-xs t-tertiary">{ex.note}</div>}
                  </td>
                  <td className="num">
                    <NumberInput
                      className="input-sm"
                      style={{ width: 52 }}
                      aria-label={`Series de ${ex.name}`}
                      value={ex.sets}
                      onChange={(v) => onChangeExercise(di, ei, { sets: v })}
                    />
                  </td>
                  {/* Un objetivo por serie, dicho sin repetirlo cinco veces:
                      «6-8 · 8-10» es la primera serie y las demás. Al escribir
                      encima pasa a valer para todas, que es lo que se espera de
                      un campo con un solo valor dentro. */}
                  <td className="num">
                    <input
                      className="input input-sm input-center"
                      style={{ width: 84 }}
                      aria-label={`Objetivo de repeticiones de ${ex.name}`}
                      value={objetivoVisible(ex)}
                      onChange={(e) => onChangeExercise(di, ei, { objetivo: e.target.value })}
                    />
                  </td>
                  <td className="num">
                    <input
                      className="input input-sm input-center"
                      style={{ width: 52 }}
                      aria-label={`RIR de ${ex.name}`}
                      value={ex.rir}
                      onChange={(e) => onChangeExercise(di, ei, { rir: e.target.value })}
                    />
                  </td>
                  <td>
                    <select
                      className="select input-sm"
                      aria-label={`Grupo muscular de ${ex.name}`}
                      value={ex.muscle}
                      onChange={(e) => onChangeExercise(di, ei, { muscle: e.target.value })}
                    >
                      {MUSCLE_GROUPS.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                    {!ex.muscleSure && ex.muscleRaw && (
                      <div className="t-xs t-tertiary">tu hoja decía «{ex.muscleRaw}»</div>
                    )}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-icon"
                      aria-label={`Quitar ${ex.name}`}
                      onClick={() => onRemoveExercise(di, ei)}
                    >
                      <X size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    ))}
  </>
);
