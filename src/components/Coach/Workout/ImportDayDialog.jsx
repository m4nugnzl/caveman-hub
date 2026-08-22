import { useEffect, useMemo, useState } from 'react';
import { Copy } from 'lucide-react';

import { useApp } from '@/context/AppContext';
import { cloneExerciseAsTemplate, countSets, unitLabel } from '@/domain/training';
import { Field, Loading, Notice } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/Modal';

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
 */
export const ImportDayDialog = ({ clients, activeClient, targetDayName, onImport, onClose }) => {
  const { ensureProgram, workoutData } = useApp();

  const [sourceId, setSourceId] = useState('');
  const [cargando, setCargando] = useState(false);
  const [week, setWeek] = useState(null);
  const [fallo, setFallo] = useState(false);

  const others = useMemo(
    () => clients.filter((c) => c.id !== activeClient.id),
    [clients, activeClient.id]
  );

  const program = sourceId ? workoutData[sourceId] : null;
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

  return (
    <Modal title={`Traer un día a ${targetDayName}`} onClose={onClose}>
      <div className="col gap-4">
        <p className="t-sm t-secondary">
          Los ejercicios del día que elijas se añadirán a {targetDayName} como plantilla: series y
          objetivos, sin los kilos ni las notas de la otra persona.
        </p>

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
                          onImport(day.exercises.map(cloneExerciseAsTemplate));
                          onClose();
                        }}
                      >
                        <Copy size={14} /> Traer
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
