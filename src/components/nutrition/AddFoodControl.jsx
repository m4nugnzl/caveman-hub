import { useState } from 'react';
import { Autocomplete } from '@/components/ui/Autocomplete';
import { Field } from '@/components/ui/primitives';

const EMPTY = { name: '', proteinPer100: '', carbsPer100: '', fatsPer100: '' };

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

  const commitNew = () => {
    if (!draft?.name.trim()) return;
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
            <Field key={key} label={label} className="shrink-0">
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

        <div className="row gap-2">
          <button type="button" className="btn btn-primary btn-sm" onClick={commitNew} disabled={!draft.name.trim()}>
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
      getMeta={(food) => `P${food.proteinPer100} C${food.carbsPer100} G${food.fatsPer100} /100g`}
      onPick={(food) => {
        onAdd(food);
        setQuery('');
      }}
      onCreate={startCreating}
      placeholder="Buscar o añadir alimento…"
    />
  );
};
