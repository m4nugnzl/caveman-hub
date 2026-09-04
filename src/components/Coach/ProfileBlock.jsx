import { useState } from 'react';
import { ExternalLink } from 'lucide-react';

import {
  MAX_FIELD,
  examplePlaceholder,
  fieldById,
  fieldsOf,
  groupById,
  profileRows,
} from '@/domain/profile';
import { Field, NumberInput, Panel } from '@/components/ui/primitives';

/**
 * Un campo del catálogo, pintado según su `kind`.
 *
 * Un `switch` y no cuatro componentes: son cuatro formas de la misma cosa —una
 * etiqueta, un control y una pista— y partirlas obligaría a mirar en cinco
 * archivos para saber cómo se edita un campo.
 */
const Control = ({ field, value, onChange }) => (
  <Field label={field.label} hint={field.hint}>
    {(props) => {
      if (field.kind === 'number') {
        return (
          <div className="input-suffix">
            <NumberInput
              {...props}
              center={false}
              placeholder={examplePlaceholder(field)}
              value={value}
              onChange={onChange}
            />
            {field.unit && <span aria-hidden="true">{field.unit}</span>}
          </div>
        );
      }

      if (field.kind === 'choice' || field.kind === 'yesno') {
        /*
          El vacío es una OPCIÓN del desplegable y no un estado escondido: «sin
          contestar» es distinto de «no», y sin esa primera línea no habría forma
          de deshacer una respuesta puesta por error.
        */
        const opciones =
          field.kind === 'yesno'
            ? [
                { id: 'true', label: 'Sí' },
                { id: 'false', label: 'No' },
              ]
            : field.options;

        return (
          <select
            {...props}
            className="select"
            value={value === true ? 'true' : value === false ? 'false' : value ?? ''}
            onChange={(e) => onChange(e.target.value)}
          >
            <option value="">Sin contestar</option>
            {opciones.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        );
      }

      return (
        <input
          {...props}
          /* `type="url"` en los enlaces: en el móvil cambia el teclado y añade
             la barra y los dos puntos, que es donde más se agradece. Lo que
             filtra de verdad es `cleanProfile` con `safeLink`. */
          type={field.kind === 'link' ? 'url' : 'text'}
          className="input"
          maxLength={MAX_FIELD}
          placeholder={examplePlaceholder(field)}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    }}
  </Field>
);

/**
 * Un bloque del perfil: «Cómo entrena», «Cómo come» o «Su día».
 *
 * ══ Un componente y no tres ════════════════════════════════════════════════
 *
 * Los tres bloques son la misma pantalla con distinta lista de campos, y la
 * lista sale del catálogo (`domain/profile.js`). Escritos a mano serían tres
 * archivos que hay que acordarse de tocar a la vez cada vez que se añade una
 * pregunta — y añadir preguntas es exactamente lo que va a pasar aquí, porque
 * cada entrenador quiere las suyas.
 *
 * Así, un campo nuevo es una entrada en el catálogo. Ni un componente, ni una
 * columna, ni una migración.
 *
 * ══ Lo vacío no se pinta ═══════════════════════════════════════════════════
 *
 * En lectura salen SOLO los campos con valor. Con diecinueve, enseñar los huecos
 * sería una columna de «sin poner» en gris que nadie va a rellenar por leerla, y
 * la ficha de alguien recién dado de alta parecería rota. El hueco se ofrece una
 * vez, al editar, donde salen todos.
 *
 * ══ Se guarda el bloque entero, no campo a campo ═══════════════════════════
 *
 * Un `<input>` que guarda al salir del foco manda una petición por campo y deja
 * a medias al que se arrepiente. Aquí se edita, se guarda y se cierra, que es lo
 * mismo que hace el bloque de arriba con los datos de identidad.
 *
 * El objeto viaja ENTERO en cada guardado —los tres bloques comparten columna—,
 * así que dos entrenadores editando bloques distintos del mismo cliente a la vez
 * se pisarían. Es la misma condición que ya tiene `preferences` desde la 0005 y
 * no se resuelve aquí: hacerlo bien es un `jsonb_set` en una función, y el caso
 * todavía no ha ocurrido.
 */
export const ProfileBlock = ({ client, group, onSave }) => {
  const meta = groupById(group);
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState(null);

  const perfil = client.profile || {};
  const filas = profileRows(perfil, group);

  const abrir = () => {
    setBorrador({ ...perfil });
    setEditando(true);
  };

  const guardar = (e) => {
    e.preventDefault();
    /* Se manda el perfil ENTERO —los campos de los otros dos bloques incluidos—
       porque la columna es una. `cleanProfile` se encarga de tirar lo vacío, así
       que borrar el contenido de un campo lo quita de verdad. */
    onSave(borrador);
    setEditando(false);
  };

  const vacio = filas.length === 0;

  return (
    <Panel
      desnudo
      rango="bloque"
      title={meta.label}
      /* La frase de qué va esto solo cuando NO hay nada: con contenido, el
         contenido lo explica mejor y la frase es un renglón de más en una
         pantalla que ya tenía seis. */
      sub={vacio ? meta.sub : undefined}
      action={
        !editando && (
          /*
            ══ Un verbo, no un botón ═══════════════════════════════════════

            Pasó por las dos formas equivocadas: primero una píldora con canto
            —cuatro idénticas en la misma franja, pesando más que los datos que
            editan— y después un lápiz suelto pegado al canto derecho, a mil
            píxeles del título al que pertenecía y sin nada que lo sujetase.

            Debajo del rótulo y como palabra en acento es lo que la casa ya usa
            para un verbo suelto (`cab-accion.is-puerta`, ver la ley de los
            gestos): está donde se lee el bloque, no lleva cromo, y dice lo que
            hace sin que haya que adivinar un icono.
          */
          <button type="button" className="cab-accion is-puerta" onClick={abrir}>
            {vacio ? 'Rellenar' : 'Editar'}
          </button>
        )
      }
    >
      {editando ? (
        <form className="col gap-3 swap-in" onSubmit={guardar}>
          <div className="grid-2">
            {fieldsOf(group).map((field) => (
              <Control
                key={field.id}
                field={field}
                value={borrador[field.id]}
                onChange={(v) => setBorrador((prev) => ({ ...prev, [field.id]: v }))}
              />
            ))}
          </div>

          <div className="row gap-2">
            <button type="submit" className="btn btn-primary btn-sm">
              Guardar
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setEditando(false)}
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : !vacio ? (
        /*
          ══ Pares apilados, no una tabla de dos columnas ═══════════════════

          Eran filas de «etiqueta a la izquierda, valor en negrita a la derecha»,
          y con datos de verdad se rompían: «A qué hora puede» contra «Hay días
          que entreno a las 7am y otros días tipo 1:30» dejaba la etiqueta
          aplastada contra el canto y el valor ocupando la fila entera. Diez filas
          así, cada una partida por un sitio distinto, es lo que hacía que este
          bloque se leyera como una hoja de cálculo mal exportada.

          Con el rótulo encima del valor, cada dato ocupa una celda de la misma
          anchura, los largos envuelven dentro de la suya y la rejilla se lee de
          un vistazo. Es la misma voz que la anatomía de la cabecera.
        */
        <div className="pares swap-in">
          {filas.map((fila) => (
            <div key={fila.id} className="par">
              <span className="k">{fila.label}</span>
              {/* Un enlace se pulsa. Guardado y no abrible sería pedirle a
                  alguien que copie una URL a mano desde una ficha — y el filtro
                  de `cleanProfile` garantiza que solo llega aquí lo que empieza
                  por http(s), así que el `href` no puede ejecutar nada. */}
              {fieldById(fila.id)?.kind === 'link' ? (
                <a className="v row gap-1" href={fila.text} target="_blank" rel="noreferrer noopener">
                  <ExternalLink size={12} /> Abrir
                </a>
              ) : (
                <span className="v">{fila.text}</span>
              )}
            </div>
          ))}
        </div>
      ) : null}
    </Panel>
  );
};
