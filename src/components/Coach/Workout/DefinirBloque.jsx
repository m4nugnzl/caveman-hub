import { useMemo, useState } from 'react';
import { FileUp, Plus, Trash2 } from 'lucide-react';

import { blockPlan, blockSessionsOf, blocksOf, hasBlockPlan, lastWeekNumber, planOfWeek, structureOfBlock } from '@/domain/blocks';
import { MUSCLE_GROUPS, buildExercise, cloneExerciseAsTemplate, dayPlannedVolume } from '@/domain/training';
import { clampInt } from '@/lib/num';
import { Autocomplete } from '@/components/ui/Autocomplete';
import { Modal } from '@/components/ui/Modal';

/**
 * DEFINIR EL BLOQUE: el momento que no existía.
 *
 * ══ Lo que había ═══════════════════════════════════════════════════════════
 *
 * «Nuevo bloque» era un nombre y tres botones de radio —los mismos días, un
 * fichero, desde cero—, y el bloque nacía con las hojas VACÍAS. El propio
 * diálogo lo decía: «sin ejercicios: se rellenan de nuevo». Así que el momento
 * en el que un bloque se define no estaba en ninguna pantalla: se definía por
 * acumulación, hoja a hoja, dentro del primer microciclo.
 *
 * ══ Lo que es ══════════════════════════════════════════════════════════════
 *
 * Un bloque es la estructura de sesión y se define al principio, así que aquí
 * se define entera: sus hojas con sus ejercicios, dónde cae cada una y su
 * calentamiento.
 *
 * ── Nace SIENDO el anterior ───────────────────────────────────────────────
 * Y no al lado de él. Hubo una versión con el bloque anterior en una columna
 * gris a la izquierda, para copiar de ahí; se leía como si aquel bloque fuera
 * una sola hoja —«Push A»— cuando un bloque son todas sus sesiones. Además no
 * describe lo que pasa: un bloque nuevo casi siempre ES el anterior con
 * cambios. Así que se hereda entero y lo que se enseña es QUÉ HAS CAMBIADO,
 * que es la mitad que de verdad hay que revisar.
 *
 * ── La duración es opcional, y por defecto no hay ─────────────────────────
 * Una rutina se monta y dura hasta que hay motivo para cambiarla. «Abierto» es
 * lo normal; la duración prevista solo aparece cuando de verdad hay un plan con
 * fecha, y entonces se pide.
 */

/** Los ejercicios de una hoja, sin lo que alguien levantó y con ids nuevos. */
const comoPlantilla = (hoja) => ({
  dayName: hoja.dayName,
  exercises: (hoja.exercises || []).map(cloneExerciseAsTemplate),
  ...(Array.isArray(hoja.mobilityDrills) ? { mobilityDrills: hoja.mobilityDrills } : {}),
});

/**
 * De dónde salen las hojas que se heredan.
 *
 * Del plan del bloque si ya lo tiene dentro; del último microciclo escrito si
 * todavía no. `planOfWeek` contesta por los dos, así que esto no tiene que
 * saber cuál manda.
 */
const hojasHeredadas = (program, bloque) => {
  if (hasBlockPlan(bloque)) return blockSessionsOf(bloque).map(comoPlantilla);
  const referencia = blockPlan(program, bloque).reference;
  if (!referencia) return [];
  return planOfWeek(program, referencia).map(comoPlantilla);
};

/** «4 × 8-10» a partir de las series de un ejercicio. */
const objetivoDe = (ex) => {
  const valores = (ex.sets || []).map((s) => String(s?.targetReps ?? '').trim());
  return valores.length > 0 && valores.every((v) => v === valores[0]) ? valores[0] : '';
};

/**
 * Qué ha cambiado respecto al bloque del que se hereda.
 *
 * Se empareja por nombre, como en toda la casa. Devuelve una línea por cambio;
 * sin ninguna, el bloque nuevo es idéntico al anterior y también hay que poder
 * decirlo.
 */
const cambiosContra = (heredadas, actuales) => {
  const out = [];
  const clave = (n) => String(n || '').trim().toLowerCase();

  for (const antes of heredadas) {
    const ahora = actuales.find((s) => s.dayName === antes.dayName);
    if (!ahora) {
      out.push({ hoja: antes.dayName, tipo: 'menos', texto: 'la hoja se va' });
      continue;
    }
    for (const ex of antes.exercises) {
      const suyo = ahora.exercises.find((e) => clave(e.name) === clave(ex.name));
      if (!suyo) {
        out.push({ hoja: antes.dayName, tipo: 'menos', texto: `fuera ${ex.name}` });
        continue;
      }
      const seriesAntes = (ex.sets || []).length;
      const seriesAhora = (suyo.sets || []).length;
      if (seriesAntes !== seriesAhora) {
        out.push({ hoja: antes.dayName, tipo: 'mas', texto: `${ex.name} ${seriesAntes} → ${seriesAhora} series` });
      } else if (objetivoDe(ex) !== objetivoDe(suyo)) {
        out.push({ hoja: antes.dayName, tipo: 'mas', texto: `${ex.name} ${objetivoDe(ex)} → ${objetivoDe(suyo)}` });
      }
    }
  }

  for (const ahora of actuales) {
    const antes = heredadas.find((s) => s.dayName === ahora.dayName);
    if (!antes) {
      out.push({ hoja: ahora.dayName, tipo: 'mas', texto: 'hoja nueva' });
      continue;
    }
    for (const ex of ahora.exercises) {
      if (!antes.exercises.some((e) => clave(e.name) === clave(ex.name))) {
        out.push({ hoja: ahora.dayName, tipo: 'mas', texto: `entra ${ex.name}` });
      }
    }
  }

  return out;
};

/** El alta de un ejercicio dentro de una hoja del bloque que se está definiendo. */
const Alta = ({ dayName, library, onAdd, onCerrar }) => {
  const [form, setForm] = useState({ name: '', muscle: 'Pecho', series: '3', reps: '8-10' });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <form
      className="definir-alta"
      onSubmit={(e) => {
        e.preventDefault();
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
        setForm({ name: '', muscle: form.muscle, series: form.series, reps: form.reps });
      }}
      onKeyDown={(e) => e.key === 'Escape' && onCerrar()}
    >
      <Autocomplete
        value={form.name}
        onChange={(v) => set('name', v)}
        items={library}
        getMeta={(item) => (item.fromCatalog ? `${item.muscle} · del catálogo` : item.muscle)}
        onPick={(item) => setForm((f) => ({ ...f, name: item.name, muscle: item.muscle || f.muscle }))}
        placeholder="Ejercicio"
        inputProps={{ autoFocus: true, 'aria-label': `Ejercicio nuevo de ${dayName}` }}
      />
      <select className="select select-sm" value={form.muscle} aria-label="Músculo principal" onChange={(e) => set('muscle', e.target.value)}>
        {MUSCLE_GROUPS.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      <input className="input input-sm definir-series" inputMode="numeric" value={form.series} aria-label="Series" onChange={(e) => set('series', e.target.value)} />
      <span className="definir-por" aria-hidden="true">
        ×
      </span>
      <input className="input input-sm definir-reps" value={form.reps} aria-label="Repeticiones objetivo" onChange={(e) => set('reps', e.target.value)} />
      <button type="submit" className="btn btn-primary btn-sm" disabled={!form.name.trim()}>
        Añadir
      </button>
      <button type="button" className="btn btn-secondary btn-sm" onClick={onCerrar}>
        Listo
      </button>
    </form>
  );
};

export const DefinirBloque = ({ open, onClose, program, library = [], onAbrir, onTraerFichero }) => {
  const bloques = blocksOf(program);
  const anterior = bloques[bloques.length - 1];
  const ultima = lastWeekNumber(program?.microcycles);

  const heredadas = useMemo(() => hojasHeredadas(program, anterior), [program, anterior]);
  const drills = structureOfBlock(program, anterior).mobilityDrills || [];

  const [nombre, setNombre] = useState(`Bloque ${bloques.length + 1}`);
  const [abierto, setAbierto] = useState(true);
  const [previstos, setPrevistos] = useState('5');
  const [sesiones, setSesiones] = useState(heredadas);
  const [altaEn, setAltaEn] = useState(null);
  const [nuevaHoja, setNuevaHoja] = useState(null);
  const [verCambios, setVerCambios] = useState(false);

  const cambios = cambiosContra(heredadas, sesiones);

  const conHoja = (dayName, fn) => setSesiones((ss) => ss.map((s) => (s.dayName === dayName ? fn(s) : s)));
  const conEjercicios = (dayName, fn) => conHoja(dayName, (s) => ({ ...s, exercises: fn(s.exercises) }));

  const series = (dayName, id, n) =>
    conEjercicios(dayName, (lista) =>
      lista.map((ex) => {
        if (ex.id !== id) return ex;
        const objetivo = clampInt(n, 1, 12, (ex.sets || []).length);
        const sets = [...(ex.sets || [])];
        const ultimaSerie = sets[sets.length - 1];
        while (sets.length < objetivo) sets.push({ ...ultimaSerie, kg: '', reps: '', rir: '' });
        while (sets.length > objetivo && sets.length > 1) sets.pop();
        return { ...ex, sets };
      })
    );

  const reps = (dayName, id, valor) =>
    conEjercicios(dayName, (lista) =>
      lista.map((ex) => (ex.id !== id ? ex : { ...ex, sets: (ex.sets || []).map((s) => ({ ...s, targetReps: valor })) }))
    );

  const totalSeries = sesiones.reduce((n, s) => n + s.exercises.reduce((k, ex) => k + (ex.sets || []).length, 0), 0);

  return (
    <Modal open={open} size="lg" title="Definir el bloque" onClose={onClose}>
      <div className="definir">
        {/* ── Nombre y duración ────────────────────────────────────────── */}
        <div className="definir-cab">
          <label className="field definir-nombre">
            <span className="label">Nombre del bloque</span>
            <input className="input" value={nombre} autoFocus onChange={(e) => setNombre(e.target.value)} />
          </label>
          <div className="field">
            <span className="label">Duración</span>
            <div className="definir-duracion">
              <button type="button" className={`btn btn-sm${abierto ? ' btn-primary' : ' btn-secondary'}`} onClick={() => setAbierto(true)}>
                Abierto
              </button>
              <button type="button" className={`btn btn-sm${abierto ? ' btn-secondary' : ' btn-primary'}`} onClick={() => setAbierto(false)}>
                Prevista
              </button>
              {!abierto && (
                <input
                  className="input input-sm definir-previstos"
                  inputMode="numeric"
                  value={previstos}
                  aria-label="Microciclos previstos"
                  onChange={(e) => setPrevistos(e.target.value)}
                />
              )}
            </div>
          </div>
        </div>
        <p className="definir-nota">
          {abierto
            ? 'Abierto es lo normal: dura hasta que decidas cambiarlo.'
            : 'Solo hace falta cuando de verdad hay un plan con fecha.'}
        </p>

        {/* ── De dónde nace, y qué has cambiado ────────────────────────── */}
        <div className="definir-herencia">
          <span>
            Nace de <b>«{anterior.name}»</b>, con todo lo suyo dentro. Se cierra en el microciclo {ultima}.
          </span>
          {cambios.length > 0 ? (
            <button type="button" className="link" onClick={() => setVerCambios((v) => !v)}>
              {cambios.length} {cambios.length === 1 ? 'cambio' : 'cambios'} · {verCambios ? 'ocultar' : 'ver'}
            </button>
          ) : (
            <span className="definir-igual">de momento, igual que él</span>
          )}
        </div>
        {verCambios && cambios.length > 0 && (
          <ul className="definir-cambios">
            {cambios.map((c, i) => (
              <li key={`${c.hoja}-${c.texto}-${i}`}>
                <span className="h">{c.hoja}</span>
                <span className={c.tipo === 'mas' ? 'mas' : 'menos'}>{c.texto}</span>
              </li>
            ))}
          </ul>
        )}

        {/* ── Las hojas ────────────────────────────────────────────────── */}
        <div className="definir-hojas">
          {sesiones.map((hoja) => {
            const suyas = hoja.exercises.reduce((n, ex) => n + (ex.sets || []).length, 0);
            const grupos = Object.entries(dayPlannedVolume(hoja))
              .sort((a, b) => b[1] - a[1])
              .slice(0, 3)
              .map(([g, n]) => `${g.toLowerCase()} ${n}`)
              .join(' · ');

            return (
              <section className="definir-hoja" key={hoja.dayName}>
                <header className="definir-hoja-cab">
                  <span className="h">{hoja.dayName}</span>
                  <span className="d">{suyas} series</span>
                  <button
                    type="button"
                    className="btn btn-icon btn-icon-compact btn-icon-danger"
                    aria-label={`Quitar ${hoja.dayName}`}
                    onClick={() => setSesiones((ss) => ss.filter((s) => s.dayName !== hoja.dayName))}
                  >
                    <Trash2 size={13} />
                  </button>
                </header>

                <ul className="definir-ejs">
                  {hoja.exercises.map((ex) => (
                    <li className="definir-ej" key={ex.id}>
                      <span className="n" title={ex.name}>
                        {ex.name}
                      </span>
                      <input
                        className="definir-series"
                        inputMode="numeric"
                        value={(ex.sets || []).length}
                        aria-label={`Series de ${ex.name}`}
                        onChange={(e) => series(hoja.dayName, ex.id, e.target.value)}
                      />
                      <span className="definir-por" aria-hidden="true">
                        ×
                      </span>
                      <input
                        className="definir-reps"
                        value={objetivoDe(ex)}
                        aria-label={`Repeticiones objetivo de ${ex.name}`}
                        onChange={(e) => reps(hoja.dayName, ex.id, e.target.value)}
                      />
                      <button
                        type="button"
                        className="btn btn-icon btn-icon-compact btn-icon-danger"
                        aria-label={`Quitar ${ex.name}`}
                        onClick={() => conEjercicios(hoja.dayName, (l) => l.filter((e) => e.id !== ex.id))}
                      >
                        <Trash2 size={12} />
                      </button>
                    </li>
                  ))}
                </ul>

                {altaEn === hoja.dayName ? (
                  <Alta
                    dayName={hoja.dayName}
                    library={library}
                    onAdd={(ex) => conEjercicios(hoja.dayName, (l) => [...l, ex])}
                    onCerrar={() => setAltaEn(null)}
                  />
                ) : (
                  <button type="button" className="definir-mas" onClick={() => setAltaEn(hoja.dayName)}>
                    <Plus size={13} aria-hidden="true" /> ejercicio
                  </button>
                )}

                {grupos && <div className="definir-hoja-sum">{grupos}</div>}
              </section>
            );
          })}

          {nuevaHoja === null ? (
            <button type="button" className="definir-hoja is-nueva" onClick={() => setNuevaHoja('')}>
              <Plus size={14} aria-hidden="true" /> hoja
            </button>
          ) : (
            <form
              className="definir-hoja is-nueva"
              onSubmit={(e) => {
                e.preventDefault();
                const n = nuevaHoja.trim();
                if (!n || sesiones.some((s) => s.dayName === n)) return;
                setSesiones((ss) => [...ss, { dayName: n, exercises: [] }]);
                setNuevaHoja(null);
              }}
            >
              <input
                autoFocus
                className="input input-sm"
                value={nuevaHoja}
                placeholder="Ej: Legs B"
                aria-label="Nombre de la hoja nueva"
                onChange={(e) => setNuevaHoja(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && setNuevaHoja(null)}
              />
              <button type="submit" className="btn btn-primary btn-sm" disabled={!nuevaHoja.trim()}>
                Añadir
              </button>
            </form>
          )}
        </div>

        {/* ── El calentamiento, que también es del bloque ───────────────── */}
        <div className="definir-calentamiento">
          <span className="section-label">Calentamiento del bloque</span>
          {drills.length > 0 ? (
            <div className="definir-drills">
              {drills.map((d) => (
                <span className="definir-drill" key={d.id} title={d.notes || d.name}>
                  {d.name}
                  {d.prescription ? <small>{d.prescription}</small> : null}
                </span>
              ))}
            </div>
          ) : (
            <p className="t-sm t-tertiary">Sin calentamiento propio. Se puede montar después, en la hoja.</p>
          )}
          <p className="t-xs t-tertiary">Se hereda del bloque anterior. Se cambia desde la hoja, como siempre.</p>
        </div>

        {/* ── La barra ─────────────────────────────────────────────────── */}
        <div className="definir-pie">
          <span className="definir-total">
            {sesiones.length} {sesiones.length === 1 ? 'hoja' : 'hojas'} · {totalSeries} series por microciclo
          </span>
          {onTraerFichero && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={onTraerFichero}>
              <FileUp size={14} /> Traer de un fichero
            </button>
          )}
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={sesiones.length === 0}
            onClick={() => {
              onAbrir({
                name: nombre.trim() || null,
                sessions: sesiones,
                mobilityDrills: drills,
                plannedWeeks: abierto ? null : clampInt(previstos, 1, 52, null),
              });
              onClose();
            }}
          >
            Cerrar «{anterior.name}» y abrir este
          </button>
        </div>
      </div>
    </Modal>
  );
};
