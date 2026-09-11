import { useEffect, useMemo, useState } from 'react';
import { Copy } from 'lucide-react';

import { useApp } from '@/context/AppContext';
import { cloneExerciseAsTemplate, countSets, unitLabel } from '@/domain/training';
import { Field, Loading, Notice, SegmentedControl } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/Modal';
import { copiar, piezaDeHoja } from '@/lib/portapapeles';

/**
 * Traer UN día de otro cliente al día que se está montando.
 *
 * ── Por qué existe además de «Traer de otro cliente» ────────────────────────
 * Aquel copia bloques enteros —el programa completo, la dieta— y SUSTITUYE.
 * Este es el gesto pequeño que se hace veinte veces: «el Legs se lo monto a
 * todo el mundo parecido; tráeme el de Marta como base y lo retoco». Añade, no
 * sustituye, y trae solo el PLAN: los ejercicios con sus series y objetivos,
 * nunca los kilos que la otra persona levantó ni sus notas (la regla vive en
 * `cloneExerciseAsTemplate`, con sus pruebas).
 *
 * El programa del otro cliente puede no estar en memoria (carga perezosa), así
 * que se pide con `ensureProgram` al elegirlo.
 *
 * ══ Y también se puede uno quedar el día en la mano ═════════════════════════
 *
 * Ésta era una de las cuatro puertas que hacen lo mismo sin conocerse entre sí:
 * escribía los ejercicios AQUÍ y en ningún otro sitio, así que «el Legs de
 * Marta» servía para esta persona y para nadie más — y para ponerlo también en
 * Luis había que volver a abrir esta ventana desde su ficha.
 *
 * Copiándolo, lo traído es una pieza como cualquier otra y hereda lo que la
 * mano ya sabe hacer: pegarlo donde sea, ponerlo encima de un día que ya existe
 * con su tramo, repartirlo a varios o guardarlo en tus plantillas. Es la misma
 * respuesta que ya tiene «Traer de un fichero», y con las mismas palabras.
 *
 * La pregunta es UNA y se hace arriba —no dos botones por fila—: dónde va lo
 * que elijas. El botón de cada día dice entonces lo que va a hacer.
 */
export const ImportDayDialog = ({ clients, activeClient, targetDayName, onImport, onClose }) => {
  const { ensureProgram, workoutData } = useApp();

  const [aDonde, setAdonde] = useState('actual');
  const [sourceId, setSourceId] = useState('');
  const [cargando, setCargando] = useState(false);
  const [week, setWeek] = useState(null);
  const [fallo, setFallo] = useState(false);

  const others = useMemo(
    () => clients.filter((c) => c.id !== activeClient.id),
    [clients, activeClient.id]
  );

  const aLaMano = aDonde === 'mano';
  const program = sourceId ? workoutData[sourceId] : null;
  /* De quién es el día que se copia: el ORIGEN de la pieza, que no es el cliente
     abierto. Sin él, la mano no puede decir de dónde salió lo que llevas —y con
     dos «Legs» copiados eso es lo único que los distingue—. */
  const deQuien = others.find((c) => c.id === sourceId)?.name || null;
  const cycles = useMemo(() => program?.microcycles || [], [program]);

  /* Al elegir cliente se trae su programa si no está, y se aterriza en su
     ÚLTIMA semana: es donde está la versión más reciente de cada día. */
  useEffect(() => {
    if (!sourceId) return undefined;
    let vivo = true;
    setFallo(false);
    setCargando(true);
    ensureProgram(sourceId).then((resultado) => {
      if (!vivo) return;
      setCargando(false);
      if (!resultado) setFallo(true);
    });
    return () => {
      vivo = false;
    };
  }, [sourceId, ensureProgram]);

  useEffect(() => {
    if (cycles.length > 0) setWeek((prev) => prev ?? cycles[cycles.length - 1].weekNumber);
  }, [cycles]);

  const cycle = cycles.find((m) => m.weekNumber === week) || null;
  const unidad = unitLabel(program?.cycleType);
  /* El título es el del verbo que abre esta ventana —«Traer un día de otro
     cliente»— y no «Traer un día a Push A»: desde que uno se puede quedar el día
     en la mano, el destino es una respuesta de dentro y no el asunto. */

  return (
    <Modal title="Traer un día de otro cliente" onClose={onClose}>
      <div className="col gap-4">
        {/* Lo que se lleva es lo mismo por los dos caminos —el plan, nunca lo
            levantado—, así que esa frase se dice una vez y solo cambia dónde
            aterriza. Ver `cloneExerciseAsTemplate`. */}
        <p className="t-sm t-secondary">
          {aLaMano
            ? 'El día que elijas se queda copiado en tu mano, listo para pegarlo donde quieras: aquí, en otro bloque o en otra persona.'
            : `Los ejercicios del día que elijas se añadirán a ${targetDayName} como plantilla.`}{' '}
          Series y objetivos, sin los kilos ni las notas de la otra persona.
        </p>

        <SegmentedControl
          label="Dónde va el día"
          value={aDonde}
          onChange={setAdonde}
          options={[
            { id: 'actual', label: `Añadir a ${targetDayName}` },
            { id: 'mano', label: 'Dejarlo copiado' },
          ]}
        />

        <Field label="De qué cliente">
          {(props) => (
            <select
              {...props}
              className="select"
              value={sourceId}
              onChange={(e) => {
                setSourceId(e.target.value);
                setWeek(null);
              }}
            >
              <option value="">Selecciona cliente…</option>
              {others.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          )}
        </Field>

        {fallo && (
          <Notice tone="error">No se pudo cargar su programa. Inténtalo otra vez.</Notice>
        )}
        {cargando && <Loading label="Cargando su programa…" />}

        {sourceId && !cargando && !fallo && cycles.length === 0 && (
          <p className="t-sm t-secondary">Este cliente todavía no tiene programa.</p>
        )}

        {cycles.length > 0 && (
          <>
            <div className="rail-wrap" role="group" aria-label={`${unidad} del que copiar`}>
              {cycles.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className="chip"
                  aria-pressed={week === m.weekNumber}
                  onClick={() => setWeek(m.weekNumber)}
                >
                  {unidad.slice(0, 1)}
                  {m.weekNumber}
                </button>
              ))}
            </div>

            {(cycle?.days || []).length === 0 ? (
              <p className="t-sm t-secondary">Ese {unidad.toLowerCase()} no tiene días.</p>
            ) : (
              <div className="list">
                {cycle.days.map((day) => {
                  const n = day.exercises?.length || 0;
                  return (
                    <div className="list-row" key={day.dayName}>
                      <span className="list-row-label">
                        <span className="title">{day.dayName}</span>
                        <span className="sub">
                          {n} {n === 1 ? 'ejercicio' : 'ejercicios'} · {countSets(day)} series
                        </span>
                      </span>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={n === 0}
                        onClick={() => {
                          const ejercicios = day.exercises.map(cloneExerciseAsTemplate);
                          if (aLaMano) {
                            /* Sin aviso: lo nombra la mano. Ley II. */
                            copiar(
                              piezaDeHoja({
                                dayName: day.dayName,
                                exercises: ejercicios,
                                cliente: deQuien,
                                donde: `${unidad} ${week}`,
                              })
                            );
                          } else {
                            onImport(ejercicios);
                          }
                          onClose();
                        }}
                      >
                        <Copy size={15} /> {aLaMano ? 'Copiar' : 'Traer'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
};
