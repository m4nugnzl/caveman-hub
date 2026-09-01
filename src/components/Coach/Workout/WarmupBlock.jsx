import { useState } from 'react';
import { ChevronDown, ChevronUp, Play, Plus, Trash2, Waves } from 'lucide-react';

import { parseVideoUrl } from '@/domain/video';
import { newId } from '@/lib/ids';
import { VideoPlayer } from '@/components/ui/VideoEmbed';
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
 * ── Del programa, salvo que el día diga otra cosa ───────────────────────────
 * Un calentamiento se repite: es la rutina de movilidad de esta persona, no una
 * decisión que se tome cada lunes. Por eso el de por defecto es del PROGRAMA y
 * se monta una vez.
 *
 * Pero hay días que piden lo suyo —el de pierna no se calienta como el de
 * empuje—, así que un día puede tener el suyo y entonces manda. La regla vive en
 * `domain/training.js` (`drillsForDay`), y ahí está también por qué una lista
 * vacía significa «este día no se calienta» y no «usa el del programa».
 *
 * ── El vídeo se ve AQUÍ ─────────────────────────────────────────────────────
 * Antes era un enlace que sacaba de la aplicación: el cliente está en el
 * gimnasio, con una mano, y para ver diez segundos de una movilidad acababa en
 * YouTube —con sus recomendados— y tenía que volver.
 *
 * Ahora se reproduce dentro, y sin coste para quien no lo mire: lo que se pinta
 * de entrada es una fila, y el reproductor se monta al pulsarla (`VideoEmbed`).
 * Sin reproducir, YouTube no se entera de que esta página existe.
 *
 * Lo que no sea YouTube ni Loom —un Drive, un archivo suyo— sigue siendo un
 * enlace: la CSP no deja incrustar otra cosa, y prometer un reproductor que no
 * va a aparecer es peor que decir la verdad.
 */

const emptyDrill = () => ({ id: newId('drill'), name: '', prescription: '', videoUrl: '', notes: '' });

// ── Lo que ve el cliente ───────────────────────────────────────────────────

/**
 * Un ejercicio del calentamiento. Con vídeo, la FILA ENTERA lo abre.
 *
 * ── Por qué no un botón aparte ──────────────────────────────────────────────
 * Lo era: una banda del ancho del panel con «Ver la revisión en vídeo» dentro
 * —texto de otro sitio, además— y una celda pegada al lado para salir a
 * YouTube. Para diez segundos de una movilidad, eso es un cartel; y con cinco
 * ejercicios, cinco carteles.
 *
 * Un vídeo de un ejercicio no es un destino: es una propiedad del ejercicio.
 * Así que se dice como se dice en cualquier lista de reproducción —una
 * miniatura con su triángulo a la izquierda del nombre— y al pulsar la fila el
 * reproductor se abre debajo, dentro del propio ejercicio.
 */
const WarmupDrill = ({ drill }) => {
  const [abierto, setAbierto] = useState(false);
  const video = drill.videoUrl ? parseVideoUrl(drill.videoUrl) : null;

  const cuerpo = (
    <>
      {/* La miniatura solo si se puede reproducir aquí: prometer un play que
          acaba abriendo otra pestaña es prometer lo que no es. */}
      {video && (
        <span className="warmup-thumb" aria-hidden="true">
          <Play size={11} fill="currentColor" />
        </span>
      )}

      <span className="warmup-say">
        <span className="nm">
          {drill.name}
          {drill.prescription && <span className="dose">{drill.prescription}</span>}
        </span>
        {drill.notes && <span className="note">{drill.notes}</span>}
      </span>

      {video && (
        <span className="warmup-go" aria-hidden="true">
          {abierto ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </span>
      )}
    </>
  );

  return (
    <li className="warmup-item">
      {video ? (
        <button
          type="button"
          className="warmup-hit"
          aria-expanded={abierto}
          onClick={() => setAbierto((v) => !v)}
        >
          {cuerpo}
        </button>
      ) : (
        <span className="warmup-hit is-plain">{cuerpo}</span>
      )}

      {video && abierto && <VideoPlayer video={video} title={drill.name} />}

      {/* Lo que no se puede incrustar —un Drive, un archivo suyo— se dice como
          lo que es: la CSP no deja otra cosa, y un play que abre otra pestaña
          engaña más de lo que ayuda. */}
      {drill.videoUrl && !video && (
        <a className="link t-xs" href={drill.videoUrl} target="_blank" rel="noreferrer noopener">
          <Play size={12} /> Ver el vídeo
        </a>
      )}
    </li>
  );
};

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
          <WarmupDrill drill={drill} key={drill.id} />
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

      {list.map((drill, index) => {
        /* Qué va a pasar con ese enlace, dicho AL ESCRIBIRLO. Sin esto, un
           enlace de Drive parece que se va a poder ver dentro de la aplicación
           y no se descubre hasta que el cliente lo abre en el gimnasio. */
        const video = drill.videoUrl?.trim() ? parseVideoUrl(drill.videoUrl) : null;

        return (
          <div className="warmup-edit" key={drill.id}>
            {/* La primera línea es lo que define el ejercicio: qué y cuánto. */}
            <div className="warmup-edit-top">
              <div className="warmup-edit-name">
                <TextInput
                  value={drill.name}
                  onChange={(v) => patch(drill.id, 'name', v)}
                  placeholder="Movilidad de cadera"
                  aria-label="Nombre del ejercicio"
                />
                <TextInput
                  className="dose"
                  value={drill.prescription}
                  onChange={(v) => patch(drill.id, 'prescription', v)}
                  placeholder="2 × 10"
                  aria-label="Series, repeticiones o tiempo"
                />
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

            {/* Y debajo lo que lo acompaña, en gris: el vídeo y la indicación. */}
            <div className="warmup-edit-more">
              <Field
                label="Vídeo"
                hint={
                  drill.videoUrl?.trim()
                    ? undefined
                    : 'De YouTube o Loom para que se vea aquí dentro'
                }
              >
                {(props) => (
                  <TextInput
                    {...props}
                    value={drill.videoUrl}
                    onChange={(v) => patch(drill.id, 'videoUrl', v)}
                    placeholder="https://…"
                  />
                )}
              </Field>

              <Field label="Indicaciones">
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

            {drill.videoUrl?.trim() && (
              <span className={`warmup-edit-video${video ? ' is-ok' : ''}`}>
                {video
                  ? `Se verá dentro de la sesión, sin salir a ${video.label}.`
                  : 'No es de YouTube ni de Loom, así que se abrirá en otra pestaña.'}
              </span>
            )}
          </div>
        );
      })}

      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => onChange([...list, emptyDrill()])}
      >
        <Plus size={15} /> Añadir ejercicio
      </button>
    </div>
  );
};
