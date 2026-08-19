import { useState } from 'react';
import { ChevronDown, ChevronUp, Plus, Sparkles, Trash2 } from 'lucide-react';

import {
  MAX_NOTES,
  NOTE_BODY_MAX,
  NOTE_TITLE_MAX,
  buildDietNote,
  dietNotes,
  moveItem,
  notesToStorage,
} from '@/domain/nutrition';
import { GroupHead, Panel } from '@/components/ui/primitives';

/**
 * Las pautas que el entrenador le escribe a ESTE cliente sobre su dieta.
 *
 * ══ Qué era esto y por qué ha cambiado ══════════════════════════════════════
 *
 * Era «Hábitos y recomendaciones»: una casilla de una línea y una lista de
 * frases con un ✓ delante. Daba para «bebe 2 L al día» y para nada más.
 *
 * Lo que hace falta escribir de verdad casi nunca es una regla suelta, es una
 * explicación: «teniendo en cuenta tu hipotiroidismo repartimos los hidratos
 * así, y los días que entrenas pierna los subimos». Eso no cabe en una línea, y
 * sobre todo no se lee como una casilla — se lee como algo escrito para ti.
 *
 * ── Por qué el título es opcional ───────────────────────────────────────────
 * Porque sin él esto sigue sirviendo para la frase corta de siempre, y con él
 * una pauta larga se encuentra de un vistazo entre otras cinco. Obligar a
 * titular «bebe 2 L al día» sería pedir trabajo para no ganar nada.
 *
 * ── Por qué se guarda al salir del campo y no al escribir ───────────────────
 * Porque cada pulsación sería una escritura en la base de datos de un texto de
 * mil caracteres. El borrador vive aquí mientras se escribe y baja al plan
 * cuando el campo pierde el foco, que es cuando la pauta está terminada.
 */
const NoteCard = ({ note, index, total, onChange, onRemove, onMove }) => {
  const [draft, setDraft] = useState(note);

  /* Si la pauta cambia por fuera —otra pestaña, deshacer— el borrador se queda
     rancio. Comparar por id evita pisar lo que se está escribiendo ahora. */
  const actual = draft.id === note.id ? draft : note;

  const guardar = () => {
    if (actual.title === note.title && actual.body === note.body) return;
    onChange(actual);
  };

  return (
    <div className="card-inset col gap-2">
      <div className="row gap-2">
        <input
          className="input input-sm grow"
          value={actual.title}
          maxLength={NOTE_TITLE_MAX}
          placeholder="Título (opcional). Ej: Hipotiroidismo"
          aria-label={`Título de la pauta ${index + 1}`}
          onChange={(e) => setDraft({ ...actual, title: e.target.value })}
          onBlur={guardar}
        />
        <span className="row gap-1 shrink-0">
          <button
            type="button"
            className="btn btn-icon"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            aria-label="Subir esta pauta"
          >
            <ChevronUp size={15} />
          </button>
          <button
            type="button"
            className="btn btn-icon"
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            aria-label="Bajar esta pauta"
          >
            <ChevronDown size={15} />
          </button>
          <button
            type="button"
            className="btn btn-icon btn-icon-danger"
            onClick={onRemove}
            aria-label="Eliminar esta pauta"
          >
            <Trash2 size={15} />
          </button>
        </span>
      </div>

      <textarea
        className="input textarea"
        value={actual.body}
        maxLength={NOTE_BODY_MAX}
        placeholder="Lo que quieras explicarle. Los saltos de línea se conservan."
        aria-label={`Texto de la pauta ${index + 1}`}
        onChange={(e) => setDraft({ ...actual, body: e.target.value })}
        onBlur={guardar}
      />
    </div>
  );
};

export const DietNotes = ({ notes: raw, onChange }) => {
  const notes = dietNotes(raw);
  const guardar = (lista) => onChange(notesToStorage(lista));

  return (
    <section className="col gap-4">
      {/* Una tanda de bloques dentro de «Plan nutricional», no otra pantalla:
          era el TERCER `h2` de nivel pantalla de la misma página. */}
      <GroupHead
        title="Tus pautas"
        sub="Lo que le explicas a esta persona sobre su plan. Lo ve en su dieta, tal cual lo escribes."
      />

      <Panel tight className="col gap-3">
        {notes.length === 0 && (
          <p className="t-sm t-tertiary">
            Nada escrito todavía. Aquí van las indicaciones que no caben en una cifra: por qué el
            plan es así, qué hacer los días que se salta, cómo afecta una patología.
          </p>
        )}

        {notes.map((note, index) => (
          <NoteCard
            key={note.id}
            note={note}
            index={index}
            total={notes.length}
            onChange={(next) => guardar(notes.map((n, i) => (i === index ? next : n)))}
            onRemove={() => guardar(notes.filter((_, i) => i !== index))}
            onMove={(delta) => guardar(moveItem(notes, index, index + delta))}
          />
        ))}

        {notes.length < MAX_NOTES && (
          <div className="row">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              /*
                La nueva se guarda con un cuerpo de partida y no vacía: una pauta
                sin cuerpo no sobrevive a `notesToStorage`, así que añadir una en
                blanco y recargar la haría desaparecer sin explicación.
              */
              onClick={() => guardar([...notes, { ...buildDietNote(), body: 'Escribe aquí…' }])}
            >
              <Plus size={14} /> Añadir pauta
            </button>
          </div>
        )}

        {notes.length >= MAX_NOTES && (
          <p className="t-xs t-tertiary">
            <Sparkles size={12} style={{ display: 'inline', verticalAlign: -2, marginRight: 4 }} />
            Doce pautas es el tope. Si necesitas más, probablemente convenga juntar varias en una.
          </p>
        )}
      </Panel>
    </section>
  );
};
