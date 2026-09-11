import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';

import {
  MAX_NOTES,
  NOTE_BODY_MAX,
  NOTE_TITLE_MAX,
  buildDietNote,
  dietNotes,
  moveItem,
  notesToStorage,
} from '@/domain/nutrition';

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
 * ══ Y por qué ya no van dentro de una caja ═════════════════════════════════
 *
 * «No me gusta el cómo se ven las pautas.»
 *
 * Lo que se veía era un `Panel` con su filete y su fondo, puesto DENTRO de la
 * hoja —que ya es una caja— y con el «+ Añadir pauta» encerrado dentro como si
 * fuera un formulario que rellenar. Tres superficies encajadas —página, hoja,
 * panel— para enseñar dos frases, y la ley de la hoja de esta casa dice justo
 * lo contrario: la hoja es UNA caja, y lo que va dentro va a ras del papel.
 * Caja dentro de caja es la figura que ya se corrigió en el costado del bloque
 * y en la mesa de Entreno.
 *
 * Ahora las pautas son una SECCIÓN de la hoja, como el reparto o el menú: un
 * rótulo, lo que hay que saber en voz baja y el verbo en azul al canto derecho
 * —la ley de los gestos: la caja se enciende, el verbo va en azul—, y debajo el
 * texto separado por filetes. La misma anatomía que «El reparto», que está dos
 * dedos más arriba en la misma hoja.
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
 *
 * ── Y el campo ES el texto ─────────────────────────────────────────────────
 * Lo que se escribe aquí lo LEE el cliente tal cual, así que aquí también tiene
 * que leerse como texto: el título en la letra de los títulos, el cuerpo en
 * prosa, sin recuadros, y la caja creciendo con lo escrito en vez de pedir
 * rueda. Es la misma idea que la nota de una comida (`comida-nota`) y que
 * renombrar en su sitio (`RenombrarEnSitio`). Las acciones —subir, bajar,
 * borrar— se atenúan hasta que pasas por encima, como en la cabecera de una
 * comida.
 */
const NoteCard = ({ note, index, total, onChange, onRemove, onMove }) => {
  const [draft, setDraft] = useState(note);
  const cuerpoRef = useRef(null);

  /* Si la pauta cambia por fuera —otra pestaña, deshacer— el borrador se queda
     rancio. Comparar por id evita pisar lo que se está escribiendo ahora. */
  const actual = draft.id === note.id ? draft : note;

  const guardar = () => {
    if (actual.title === note.title && actual.body === note.body) return;
    onChange(actual);
  };

  /* La caja crece con lo escrito. Un alto fijo con barra de desplazamiento
     obliga a leer una pauta de seis líneas por una ventana de tres, y lo que se
     escribe aquí está pensado para leerse entero. */
  useEffect(() => {
    const el = cuerpoRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [actual.body]);

  return (
    <article className="pauta">
      <div className="pauta-cab">
        <input
          className="pauta-titulo"
          value={actual.title}
          maxLength={NOTE_TITLE_MAX}
          placeholder="Título (opcional). Ej: Hipotiroidismo"
          aria-label={`Título de la pauta ${index + 1}`}
          onChange={(e) => setDraft({ ...actual, title: e.target.value })}
          onBlur={guardar}
        />
        {/* Atenuadas hasta que pasas por encima, como en la cabecera de una
            comida: mover y borrar se hacen de uvas a peras y no tienen por qué
            competir con lo que se está leyendo. */}
        <span className="pauta-acciones">
          <button
            type="button"
            className="btn btn-icon btn-icon-compact"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            aria-label="Subir esta pauta"
          >
            <ChevronUp size={15} />
          </button>
          <button
            type="button"
            className="btn btn-icon btn-icon-compact"
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            aria-label="Bajar esta pauta"
          >
            <ChevronDown size={15} />
          </button>
          <button
            type="button"
            className="btn btn-icon btn-icon-compact btn-icon-danger"
            onClick={onRemove}
            aria-label="Quitar esta pauta"
          >
            <Trash2 size={15} />
          </button>
        </span>
      </div>

      <textarea
        ref={cuerpoRef}
        rows={1}
        className="pauta-cuerpo"
        value={actual.body}
        maxLength={NOTE_BODY_MAX}
        placeholder="Lo que quieras explicarle. Los saltos de línea se conservan."
        aria-label={`Texto de la pauta ${index + 1}`}
        onChange={(e) => setDraft({ ...actual, body: e.target.value })}
        onBlur={guardar}
      />
    </article>
  );
};

export const DietNotes = ({ notes: raw, onChange }) => {
  const notes = dietNotes(raw);
  const guardar = (lista) => onChange(notesToStorage(lista));

  /*
    La nueva se guarda con un cuerpo de partida y no vacía: una pauta sin cuerpo
    no sobrevive a `notesToStorage`, así que añadir una en blanco y recargar la
    haría desaparecer sin explicación.
  */
  const anadir = () => guardar([...notes, { ...buildDietNote(), body: 'Escribe aquí…' }]);

  return (
    <section className="pautas" aria-label="Tus pautas">
      <div className="pautas-cab">
        <span className="section-label">Tus pautas</span>
        <span className="pautas-dice">
          {notes.length === 0
            ? 'Lo que no cabe en una cifra: por qué el plan es así, o qué hacer el día que se salta.'
            : 'Lo ve en su dieta, tal cual lo escribes.'}
        </span>
        <span className="tira-hueco" />
        {notes.length < MAX_NOTES ? (
          <button type="button" className="cab-accion" onClick={anadir}>
            <Plus size={13} /> pauta
          </button>
        ) : (
          /* El tope no es un aviso con icono ni una franja: es el sitio del
             verbo diciendo por qué no está. Doce pautas ya no se leen. */
          <span className="t-xs t-tertiary">Doce es el tope</span>
        )}
      </div>

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
    </section>
  );
};
