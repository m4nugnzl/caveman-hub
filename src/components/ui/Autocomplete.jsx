import { useMemo, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { useCapaFlotante } from '@/lib/useCapaFlotante';
import { useClickOutside } from '@/lib/useClickOutside';
import { norm } from '@/lib/texto';

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
 *
 * ── `abreVacio`: buscar y OJEAR no son lo mismo ─────────────────────────────
 * Sin texto escrito no había sugerencias, así que el `onFocus` que abre el
 * desplegable no abría nada: solo se podía encontrar algo cuyo nombre ya se
 * supiera. Eso está bien con un catálogo de mil alimentos —volcarlo entero al
 * pinchar es ruido— y está mal con una lista corta y propia, como la cartera de
 * clientes, donde la pregunta que se trae no es «¿está Marta?» sino «¿quiénes
 * hay?». Va por propiedad y apagado por defecto: lo pide quien tiene una lista
 * que se puede ojear.
 *
 * ── `vacio`: cuando lo ojeable es una PARTE de la lista ────────────────────
 * El caso de los platos en el buscador de la dieta: la lista son trescientos
 * alimentos —que no se ojean— más tus platos —que sí—. Con `abreVacio` salen
 * los seis primeros de todo, o sea seis alimentos por orden alfabético; sin él
 * no sale nada y **un plato solo aparece si ya sabías cómo se llamaba**, que es
 * tanto como no tenerlo. Con `vacio` se ojea lo tuyo y se busca en todo.
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
  abreVacio = false,
  vacio = null,
  inputProps = {},
}) => {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(-1);
  const wrapRef = useRef(null);
  const listaRef = useRef(null);

  useClickOutside(wrapRef, () => setOpen(false), open);

  /* `norm` y no `toLowerCase`: buscar «platano» tiene que encontrar «Plátano»
     y «prension» la «Prensión». La tilde no puede ser la llave (lib/texto). */
  const query = norm(String(value || '').trim());
  const matches = useMemo(() => {
    if (!query) {
      if (vacio) return vacio.slice(0, maxSuggestions);
      return abreVacio ? (items || []).slice(0, maxSuggestions) : [];
    }
    return (items || [])
      .filter((item) => norm(getLabel(item)).includes(query))
      .slice(0, maxSuggestions);
  }, [items, query, getLabel, maxSuggestions, abreVacio, vacio]);

  const exactExists = matches.some((m) => norm(getLabel(m)) === query);
  const canCreate = Boolean(onCreate) && query.length > 0 && !exactExists;
  const rowCount = matches.length + (canCreate ? 1 : 0);
  const showList = open && rowCount > 0;
  /* La lista sube al top layer: este campo vive dentro de tablas, carriles y
     capas con `overflow`, y ahí un absoluto sale cortado (`useCapaFlotante`). */
  const capa = useCapaFlotante(showList, wrapRef, listaRef, {
    alineado: 'izquierda',
    igualarAncho: true,
  });

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
        <div
          ref={listaRef}
          className="popover"
          /* La lista mide lo que el campo: es su continuación, no un menú aparte. */
          style={capa.estilo || { top: 'calc(100% + 4px)', left: 0, right: 0 }}
          {...capa.atributos}
          role="listbox"
        >
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
              {/*
                ── Un renglón por sugerencia, y el dato al canto ──────────────
                Eran `.grow` y un `t-xs` sueltos, y en un campo estrecho —el
                alta de un ejercicio— eso se veía literalmente ROTO: «Press
                banca agarre cerrado con mancuernas» partía en tres renglones y
                «Pectoral · Barra» se pintaba ENCIMA, porque un elemento flex no
                baja de su ancho de contenido salvo que se le diga.

                `.menu-sub` es la pieza que esta casa ya tiene para «el dato que
                acompaña al nombre, al canto derecho y en voz baja»; el nombre,
                a un renglón con puntos suspensivos. Un menú de sugerencias se
                OJEA, y para ojear hace falta una columna de nombres, no un
                párrafo por fila.
              */}
              <span className="menu-item-nombre">{getLabel(item)}</span>
              {getMeta && <span className="menu-sub">{getMeta(item)}</span>}
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
