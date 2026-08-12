import { ChevronDown, ChevronUp, Play, Plus, Trash2, Waves } from 'lucide-react';

import { newId } from '@/lib/ids';
import { Field, TextInput } from '@/components/ui/primitives';

/**
 * Calentamiento y movilidad.
 *
 * ── Dónde vive, y por qué no hizo falta migrar nada ─────────────────────────
 * En `workout_data.mobility_drills`, una columna `jsonb` que existe desde el
 * primer esquema del proyecto y que **no usaba ninguna pantalla**. Estaba
 * mapeada en `lib/mappers.js`, se clonaba al replicar un cliente, y no había
 * forma de escribir ni de leer un solo ejercicio en toda la aplicación.
 *
 * ── Por qué es del programa y no de cada día ────────────────────────────────
 * Un calentamiento se repite: es la rutina de movilidad de este cliente, no una
 * decisión que se toma cada lunes. Colgarlo de cada día obligaría a copiarlo
 * cinco veces y a mantenerlo cinco veces, y en cuanto uno diverja el cliente hará
 * cosas distintas según el día sin que nadie lo haya decidido.
 *
 * Si algún día hace falta un calentamiento específico de un día concreto, la
 * forma correcta es que el día pueda SUSTITUIR al del programa, no que cada día
 * tenga el suyo desde el principio.
 *
 * ── El vídeo es un enlace, no un incrustado ─────────────────────────────────
 * Un `<iframe>` de YouTube en la pantalla que el cliente abre en el gimnasio
 * significa una petición a un tercero, sus cookies y su peso, en cada carga y aunque
 * nadie lo mire. El enlace abre la aplicación nativa, que es donde se ve mejor y
 * donde ya está la sesión iniciada.
 */

const emptyDrill = () => ({ id: newId('drill'), name: '', prescription: '', videoUrl: '', notes: '' });

// ── Lo que ve el cliente ───────────────────────────────────────────────────

export const WarmupView = ({ drills }) => {
  const list = (drills || []).filter((d) => d.name?.trim());
  if (list.length === 0) return null;

  return (
    <section className="warmup">
      <header className="row gap-2">
        <Waves size={14} />
        <span className="section-label">Antes de empezar</span>
        <span className="t-2xs t-tertiary">
          {list.length} {list.length === 1 ? 'ejercicio' : 'ejercicios'}
        </span>
      </header>

      <ul className="warmup-list">
        {list.map((drill) => (
          <li className="warmup-item" key={drill.id}>
            <div className="col gap-1 grow">
              <span className="row gap-2 wrap">
                <strong className="t-sm">{drill.name}</strong>
                {drill.prescription && <span className="badge">{drill.prescription}</span>}
              </span>
              {drill.notes && <span className="t-xs t-secondary">{drill.notes}</span>}
            </div>

            {drill.videoUrl && (
              <a
                className="chip shrink-0"
                href={drill.videoUrl}
                target="_blank"
                rel="noreferrer noopener"
              >
                <Play size={12} /> Vídeo
              </a>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
};

// ── Lo que edita el entrenador ─────────────────────────────────────────────

export const WarmupEditor = ({ drills = [], onChange }) => {
  const list = drills || [];

  const patch = (id, field, value) =>
    onChange(list.map((d) => (d.id === id ? { ...d, [field]: value } : d)));

  const move = (index, direction) => {
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= list.length) return;
    const next = [...list];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <div className="col gap-3">
      {list.length === 0 && (
        <p className="t-sm t-secondary">
          Todavía no hay calentamiento. Añade los ejercicios que tu cliente hace antes de entrenar:
          aparecerán arriba de cada sesión, con su vídeo si lo pones.
        </p>
      )}

      {list.map((drill, index) => (
        <div className="warmup-edit" key={drill.id}>
          <div className="warmup-edit-main">
            <Field label="Ejercicio">
              {(props) => (
                <TextInput
                  {...props}
                  value={drill.name}
                  onChange={(v) => patch(drill.id, 'name', v)}
                  placeholder="Movilidad de cadera"
                />
              )}
            </Field>

            <Field label="Prescripción" hint="Series, repeticiones o tiempo">
              {(props) => (
                <TextInput
                  {...props}
                  value={drill.prescription}
                  onChange={(v) => patch(drill.id, 'prescription', v)}
                  placeholder="2 × 10"
                />
              )}
            </Field>

            <Field label="Vídeo" hint="Un enlace de YouTube, Drive o donde lo tengas">
              {(props) => (
                <TextInput
                  {...props}
                  value={drill.videoUrl}
                  onChange={(v) => patch(drill.id, 'videoUrl', v)}
                  placeholder="https://…"
                />
              )}
            </Field>

            <Field label="Indicaciones" className="grow">
              {(props) => (
                <TextInput
                  {...props}
                  value={drill.notes}
                  onChange={(v) => patch(drill.id, 'notes', v)}
                  placeholder="Sin rebotes, controla la bajada"
                />
              )}
            </Field>
          </div>

          <div className="warmup-edit-tools">
            <button
              type="button"
              className="btn btn-icon"
              onClick={() => move(index, 'up')}
              disabled={index === 0}
              aria-label={`Subir ${drill.name || 'el ejercicio'}`}
            >
              <ChevronUp size={15} />
            </button>
            <button
              type="button"
              className="btn btn-icon"
              onClick={() => move(index, 'down')}
              disabled={index === list.length - 1}
              aria-label={`Bajar ${drill.name || 'el ejercicio'}`}
            >
              <ChevronDown size={15} />
            </button>
            <button
              type="button"
              className="btn btn-icon btn-icon-danger"
              onClick={() => onChange(list.filter((d) => d.id !== drill.id))}
              aria-label={`Quitar ${drill.name || 'el ejercicio'}`}
            >
              <Trash2 size={15} />
            </button>
          </div>
        </div>
      ))}

      <button
        type="button"
        className="btn btn-dashed"
        onClick={() => onChange([...list, emptyDrill()])}
      >
        <Plus size={15} /> Añadir ejercicio
      </button>
    </div>
  );
};
