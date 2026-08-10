import { useMemo, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { useClickOutside } from '@/lib/useClickOutside';

/**
 * Buscador con sugerencias y opción de crear una entrada nueva.
 *
 * Dos detalles que estaban mal en las dos copias anteriores (ejercicios y
 * alimentos):
 *
 * 1. La lista de sugerencias se derivaba del texto escrito, así que al ELEGIR
 *    una sugerencia el nombre quedaba en el input, seguía coincidiendo consigo
 *    mismo y el desplegable se reabría solo. Aquí la visibilidad es estado
 *    propio, independiente del texto.
 * 2. Las sugerencias eran `<div onClick>`: invisibles al teclado. Ahora son
 *    botones y se pueden recorrer con flechas y Enter.
 */
export const Autocomplete = ({
  value,
  onChange,
  items,
  getLabel = (item) => item.name,
  getMeta,
  onPick,
  onCreate,
  placeholder,
  maxSuggestions = 6,
  inputProps = {},
}) => {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(-1);
  const wrapRef = useRef(null);

  useClickOutside(wrapRef, () => setOpen(false), open);

  const query = String(value || '').trim().toLowerCase();
  const matches = useMemo(() => {
    if (!query) return [];
    return (items || [])
      .filter((item) => getLabel(item).toLowerCase().includes(query))
      .slice(0, maxSuggestions);
  }, [items, query, getLabel, maxSuggestions]);

  const exactExists = matches.some((m) => getLabel(m).toLowerCase() === query);
  const canCreate = Boolean(onCreate) && query.length > 0 && !exactExists;
  const rowCount = matches.length + (canCreate ? 1 : 0);
  const showList = open && rowCount > 0;

  const pick = (item) => {
    onPick(item);
    setOpen(false);
    setCursor(-1);
  };

  const handleKeyDown = (event) => {
    if (!showList) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setCursor((c) => (c + 1) % rowCount);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setCursor((c) => (c <= 0 ? rowCount - 1 : c - 1));
    } else if (event.key === 'Enter' && cursor >= 0) {
      event.preventDefault();
      if (cursor < matches.length) pick(matches[cursor]);
      else onCreate();
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <input
        type="text"
        className="input"
        autoComplete="off"
        role="combobox"
        aria-expanded={showList}
        aria-autocomplete="list"
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setCursor(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        {...inputProps}
      />

      {showList && (
        <div className="popover" style={{ top: 'calc(100% + 4px)', left: 0, right: 0 }} role="listbox">
          {matches.map((item, i) => (
            <button
              key={item.id ?? getLabel(item)}
              type="button"
              role="option"
              aria-selected={cursor === i}
              className="menu-item"
              style={cursor === i ? { background: 'var(--fill)' } : undefined}
              onMouseEnter={() => setCursor(i)}
              onClick={() => pick(item)}
            >
              <span className="grow">{getLabel(item)}</span>
              {getMeta && <span className="t-xs t-secondary">{getMeta(item)}</span>}
            </button>
          ))}

          {canCreate && (
            <button
              type="button"
              role="option"
              aria-selected={cursor === matches.length}
              className="menu-item"
              style={{
                color: 'var(--accent)',
                ...(cursor === matches.length ? { background: 'var(--fill)' } : {}),
              }}
              onMouseEnter={() => setCursor(matches.length)}
              onClick={() => {
                onCreate();
                setOpen(false);
              }}
            >
              <Plus size={13} /> Crear &laquo;{String(value).trim()}&raquo;
            </button>
          )}
        </div>
      )}
    </div>
  );
};
