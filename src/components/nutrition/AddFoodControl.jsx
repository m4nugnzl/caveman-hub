import { useState } from 'react';
import { macroError } from '@/domain/nutrition';
import { toNum } from '@/lib/num';
import { Autocomplete } from '@/components/ui/Autocomplete';
import { Field } from '@/components/ui/primitives';

const EMPTY = {
  name: '',
  proteinPer100: '',
  carbsPer100: '',
  fatsPer100: '',
  // Opcionales y en blanco por defecto: la mayoría de los alimentos se pesan, y
  // pedir la unidad de todos convertiría un alta de cuatro campos en una de seis
  // con dos que casi siempre se dejan vacías.
  unitLabel: '',
  unitGrams: '',
};

/**
 * Buscador y alta rápida de alimento. Autocompleta desde la biblioteca del
 * coach (con los macros por 100 g ya guardados) o permite dar de alta uno nuevo
 * al vuelo, que queda guardado para la próxima vez.
 */
export const AddFoodControl = ({ foodLibrary, onAdd }) => {
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState(null);

  const startCreating = () => {
    setDraft({ ...EMPTY, name: query.trim() });
  };

  /*
    ── Lo que se comprueba antes de dar de alta ─────────────────────────────
    Aquí no se comprobaba NADA: lo que se tecleara entraba en la biblioteca del
    equipo tal cual, y de ahí a todas las dietas que usaran el alimento. Es la
    misma regla que aplica `FoodDialog` al corregirlo — la comprobación vive en
    `domain/nutrition.js` para que las dos pantallas no puedan discrepar.

    Y la unidad va entera o no va: con etiqueta escrita, los gramos dejan de ser
    opcionales (CHECK de la 0030).
  */
  const errores = draft && {
    proteinPer100: macroError(draft.proteinPer100),
    carbsPer100: macroError(draft.carbsPer100),
    fatsPer100: macroError(draft.fatsPer100),
    unitGrams:
      draft.unitLabel.trim() && !(toNum(draft.unitGrams) > 0)
        ? 'Hace falta el peso de una.'
        : null,
  };
  const sePuedeAnadir = Boolean(draft?.name.trim()) && !Object.values(errores || {}).some(Boolean);

  const commitNew = () => {
    if (!sePuedeAnadir) return;
    onAdd(draft);
    setDraft(null);
    setQuery('');
  };

  if (draft) {
    return (
      <div className="card-inset col gap-3">
        <div className="row-end wrap gap-2">
          <Field label="Alimento" className="grow">
            {(props) => (
              <input
                {...props}
                autoFocus
                className="input"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Nombre del alimento"
              />
            )}
          </Field>

          {[
            { key: 'proteinPer100', label: 'P /100g' },
            { key: 'carbsPer100', label: 'C /100g' },
            { key: 'fatsPer100', label: 'G /100g' },
          ].map(({ key, label }) => (
            <Field key={key} label={label} error={errores[key]} className="shrink-0">
              {(props) => (
                <input
                  {...props}
                  type="text"
                  inputMode="decimal"
                  className="input input-center"
                  style={{ width: 72 }}
                  value={draft[key]}
                  onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                />
              )}
            </Field>
          ))}
        </div>

        {/*
          ── La unidad, para lo que no se pesa ────────────────────────────────
          Nadie pesa un huevo ni una manzana. Con estos dos campos rellenos, el
          alimento se escribe y se lee en piezas —«2 huevos»— y los gramos se
          calculan solos; sin rellenar, se comporta como siempre.

          Van en una segunda fila y no mezclados con los macros porque son otra
          cosa: los de arriba describen el alimento, estos describen cómo se
          cuenta. Y son los únicos dos opcionales del formulario.
        */}
        <div className="row-end wrap gap-2">
          <Field
            label="Se cuenta en (opcional)"
            // Mismos ejemplos que en el diálogo de la dieta (`MealCard`): es la
            // misma pregunta hecha en dos sitios, y dos listas distintas harían
            // pensar que no lo es.
            hint="En singular: unidad, cucharada, rebanada, lata, vaso…"
            className="grow"
          >
            {(props) => (
              <input
                {...props}
                className="input"
                value={draft.unitLabel}
                onChange={(e) => setDraft({ ...draft, unitLabel: e.target.value })}
                placeholder="Se pesa en gramos"
              />
            )}
          </Field>

          <Field label="g por unidad" error={errores.unitGrams} className="shrink-0">
            {(props) => (
              <input
                {...props}
                type="text"
                inputMode="decimal"
                className="input input-center"
                style={{ width: 72 }}
                value={draft.unitGrams}
                onChange={(e) => setDraft({ ...draft, unitGrams: e.target.value })}
                // Sin etiqueta, este número no significa nada y la base lo
                // rechazaría: las dos columnas van juntas o no va ninguna.
                disabled={!draft.unitLabel.trim()}
              />
            )}
          </Field>
        </div>

        <div className="row gap-2">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={commitNew}
            disabled={!sePuedeAnadir}
          >
            Añadir
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDraft(null)}>
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <Autocomplete
      value={query}
      onChange={setQuery}
      items={foodLibrary}
      /*
        Dos datos además de los macros:

        · La unidad, que es lo que distingue «Huevo entero» —que se cuenta— de
          «Clara de huevo» cuando los dos salen en la lista.
        · De dónde viene. Marcar los del catálogo explica por qué, al elegir uno,
          aparece de repente en tu biblioteca: no es un efecto secundario raro,
          es lo que significa usarlo por primera vez.
      */
      getMeta={(food) =>
        [
          `P${food.proteinPer100} C${food.carbsPer100} G${food.fatsPer100} /100g`,
          food.unitLabel ? `1 ${food.unitLabel} = ${food.unitGrams} g` : null,
          food.fromCatalog ? 'del catálogo' : null,
        ]
          .filter(Boolean)
          .join(' · ')
      }
      onPick={(food) => {
        onAdd(food);
        setQuery('');
      }}
      onCreate={startCreating}
      placeholder="Buscar o añadir alimento…"
    />
  );
};
