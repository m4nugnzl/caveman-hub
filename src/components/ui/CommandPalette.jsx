import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronRight,
  CornerDownLeft,
  LogOut,
  Moon,
  Search,
  Sun,
  User,
  UserPlus,
} from 'lucide-react';

import { useApp } from '@/context/AppContext';
import { useTheme } from '@/lib/useTheme.jsx';
import { norm } from '@/lib/texto';
import {
  CLIENT_SECTIONS,
  COACH_CLIENT,
  COACH_PRIMARY,
  SETTINGS_SECTIONS,
  clientPath,
  sectionsFor,
} from '@/routes';
import { clientProtocol } from '@/domain/protocol';

/**
 * Paleta de comandos.
 *
 * ══ Por qué ════════════════════════════════════════════════════════════════
 * Ir a la nutrición de un cliente eran tres pasos y una búsqueda visual: abrir la
 * cartera, encontrar su ficha entre veinte, abrirla y pulsar la pestaña. Repetido
 * cuarenta veces al día, eso es la mayor parte del tiempo que un entrenador pasa
 * con la aplicación, y no es trabajo: es tránsito.
 *
 * Con la paleta son dos pulsaciones y tres letras. `Ctrl/⌘ + K`, «nut», entrar.
 *
 * ── Dos niveles, como la navegación ─────────────────────────────────────────
 * La tentación es listar el producto cartesiano —veinte clientes por siete
 * secciones, ciento cuarenta entradas— y dejar que el filtro haga el resto. Con la
 * caja vacía eso es una lista ilegible, y al escribir «marta» salen siete
 * resultados idénticos salvo la última palabra.
 *
 * En vez de eso la paleta ENTRA en el cliente: escribes su nombre, pulsas Tab (o
 * →) y a partir de ahí la lista son sus siete secciones. Es el mismo modelo de dos
 * planos que ya tiene la navegación de la aplicación, así que no hay nada nuevo
 * que aprender, y con la caja vacía nunca hay más de una veintena de opciones.
 *
 * ── Sin dependencias ────────────────────────────────────────────────────────
 * No hace falta ninguna librería: es un `<input>`, una lista y un manejador de
 * teclado. El filtro ignora tildes y mayúsculas, que es el 100 % de lo que hace
 * falta buscando entre nombres de personas —una coincidencia difusa de verdad
 * acertaría «Martínez» escribiendo «mrtnz» y a cambio devolvería resultados que
 * nadie ha pedido.
 */

// ── El estado abierto/cerrado, compartido ──────────────────────────────────

/*
  Un contexto de una sola propiedad, y no un `useState` dentro del componente,
  porque hay DOS cosas que la abren: el atajo de teclado y el botón de la
  cabecera. Sin esto el botón tendría que simular una pulsación de tecla, que es
  la clase de truco que funciona hasta que alguien cambia el atajo.
*/
const PaletteContext = createContext(null);

export const CommandPaletteProvider = ({ children }) => {
  const [open, setOpen] = useState(false);
  const value = useMemo(
    () => ({ open, setOpen, toggle: () => setOpen((v) => !v) }),
    [open]
  );
  return <PaletteContext.Provider value={value}>{children}</PaletteContext.Provider>;
};

export const useCommandPalette = () => {
  const ctx = useContext(PaletteContext);
  if (!ctx) throw new Error('useCommandPalette debe usarse dentro de <CommandPaletteProvider>.');
  return ctx;
};

// ── Búsqueda ───────────────────────────────────────────────────────────────

/** Todas las palabras de la consulta tienen que aparecer en la etiqueta. */
const matches = (item, tokens) => {
  if (tokens.length === 0) return true;
  const haystack = `${norm(item.label)} ${norm(item.hint)}`;
  return tokens.every((token) => haystack.includes(token));
};

// ── La paleta ──────────────────────────────────────────────────────────────

const GROUP_ORDER = ['Cliente', 'Clientes', 'Ir a', 'Ajustes', 'Acciones'];

export const CommandPalette = () => {
  const { open, setOpen } = useCommandPalette();
  const { activeClient, clients, isCoach, view, setViewMode, signOut } = useApp();
  const { isDark, toggle: toggleTheme } = useTheme();
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  /** Cliente en el que se ha «entrado». `null` = primer nivel. */
  const [scope, setScope] = useState(null);

  const inputRef = useRef(null);
  const listRef = useRef(null);

  // ── El atajo global ──────────────────────────────────────────────────────
  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && String(event.key).toLowerCase() === 'k') {
        /*
          `preventDefault` es obligatorio: Ctrl+K es «buscar en la web» en Firefox
          y «insertar enlace» en muchos editores. Sin esto el navegador se lleva la
          pulsación y la paleta no se abre nunca en Firefox.
        */
        event.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setOpen]);

  // Cada apertura empieza limpia: una consulta vieja obliga a borrarla antes de
  // escribir, que es justo el gesto que la paleta viene a ahorrar.
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setCursor(0);
    setScope(null);
  }, [open]);

  const close = useCallback(() => setOpen(false), [setOpen]);

  const go = useCallback(
    (path) => {
      navigate(path);
      close();
    },
    [navigate, close]
  );

  /** El catálogo completo, antes de filtrar. */
  const items = useMemo(() => {
    // ── Segundo nivel: dentro de un cliente ────────────────────────────────
    if (scope) {
      /* Las suyas, no todas: la paleta es otra forma de enseñar el carril, y
         ofrecer «Nutrición» de quien no la tiene lleva a una ruta que rebota. */
      return sectionsFor(COACH_CLIENT, clientProtocol(scope.preferences)).map(({ path, label, icon }) => ({
        id: `section:${path}`,
        group: 'Cliente',
        label,
        hint: scope.name,
        icon,
        run: () => go(clientPath(scope.id, path)),
      }));
    }

    const out = [];

    // ── Clientes ───────────────────────────────────────────────────────────
    if (isCoach && view === 'coach') {
      for (const client of clients) {
        out.push({
          id: `client:${client.id}`,
          group: 'Clientes',
          label: client.name,
          hint: client.plan || 'sin plan',
          icon: User,
          enter: client,
          run: () => go(clientPath(client.id, 'resumen')),
        });
      }
    }

    // ── Secciones del rol activo ───────────────────────────────────────────
    const sections =
      view === 'coach'
        ? COACH_PRIMARY.map((s) => ({ ...s, to: s.path }))
        : sectionsFor(CLIENT_SECTIONS, clientProtocol(activeClient?.preferences)).map((s) => ({
            ...s,
            to: `/mi/${s.path}`,
          }));

    for (const { to, label, icon } of sections) {
      out.push({ id: `nav:${to}`, group: 'Ir a', label, icon, run: () => go(to) });
    }

    if (isCoach && view === 'coach') {
      for (const { path, label, icon, hint } of SETTINGS_SECTIONS) {
        out.push({
          id: `settings:${path}`,
          group: 'Ajustes',
          label,
          hint,
          icon,
          run: () => go(`/ajustes/${path}`),
        });
      }

      out.push({
        id: 'action:new-client',
        group: 'Acciones',
        label: 'Dar de alta un cliente',
        icon: UserPlus,
        run: () => go('/clientes'),
      });
    }

    out.push({
      id: 'action:theme',
      group: 'Acciones',
      label: isDark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro',
      icon: isDark ? Sun : Moon,
      run: () => {
        toggleTheme();
        close();
      },
    });

    if (isCoach) {
      out.push({
        id: 'action:view',
        group: 'Acciones',
        label: view === 'coach' ? 'Ver como lo ve mi cliente' : 'Volver a la vista de entrenador',
        icon: User,
        run: () => {
          setViewMode(view === 'coach' ? 'client' : 'coach');
          close();
        },
      });
    }

    out.push({
      id: 'action:signout',
      group: 'Acciones',
      label: 'Cerrar sesión',
      icon: LogOut,
      run: () => {
        close();
        signOut();
      },
    });

    return out;
  }, [
    scope,
    clients,
    /* Sus preferencias y no el cliente entero: dentro está el protocolo, que es
       lo que decide qué secciones se ofrecen. */
    activeClient?.preferences,
    isCoach,
    view,
    isDark,
    go,
    close,
    setViewMode,
    signOut,
    toggleTheme,
  ]);

  const results = useMemo(() => {
    const tokens = norm(query).split(/\s+/).filter(Boolean);
    const hits = items.filter((item) => matches(item, tokens));

    /* Lo que EMPIEZA por lo tecleado va antes. Buscando «ana» interesa Ana Ruiz
       antes que Juana Gil, y sin esto el orden lo decide el alfabeto. */
    if (tokens.length > 0) {
      hits.sort((a, b) => {
        const sa = norm(a.label).startsWith(tokens[0]) ? 0 : 1;
        const sb = norm(b.label).startsWith(tokens[0]) ? 0 : 1;
        return sa - sb;
      });
    }

    return hits.slice(0, 40);
  }, [items, query]);

  /* Los grupos se pintan en un orden fijo, no en el de aparición: una lista cuyas
     secciones se reordenan al escribir obliga a releerla en cada tecla. */
  const groups = useMemo(() => {
    const byGroup = new Map();
    for (const item of results) {
      if (!byGroup.has(item.group)) byGroup.set(item.group, []);
      byGroup.get(item.group).push(item);
    }
    return [...byGroup.entries()].sort(
      (a, b) => GROUP_ORDER.indexOf(a[0]) - GROUP_ORDER.indexOf(b[0])
    );
  }, [results]);

  /** El orden en que el cursor recorre la lista: el de los grupos ya ordenados. */
  const flat = useMemo(() => groups.flatMap(([, rows]) => rows), [groups]);

  useEffect(() => setCursor(0), [query, scope]);

  // La fila señalada tiene que estar a la vista aunque se llegue a ella con el
  // teclado: sin esto, bajar por una lista de veinte clientes deja el cursor
  // fuera de la caja y parece que no pasa nada.
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [cursor, results]);

  if (!open) return null;

  const active = flat[Math.min(cursor, flat.length - 1)];

  const onKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setCursor((c) => (flat.length === 0 ? 0 : (c + 1) % flat.length));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setCursor((c) => (flat.length === 0 ? 0 : (c - 1 + flat.length) % flat.length));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      active?.run();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      // Escape sale de un nivel cada vez. Cerrar del todo desde dentro de un
      // cliente obligaría a volver a abrir y volver a escribir su nombre.
      if (scope) setScope(null);
      else close();
    } else if ((event.key === 'Tab' || event.key === 'ArrowRight') && active?.enter) {
      event.preventDefault();
      setScope(active.enter);
      setQuery('');
    } else if (event.key === 'Backspace' && query === '' && scope) {
      event.preventDefault();
      setScope(null);
    }
  };

  return (
    <div
      className="palette-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <div className="palette" role="dialog" aria-modal="true" aria-label="Buscar y ejecutar">
        <div className="palette-input">
          <Search size={17} aria-hidden="true" />

          {/* Dentro de un cliente, su nombre queda como una migaja delante del
              campo: es lo que hace evidente que lo que se escriba ahora se busca
              entre SUS secciones y no en toda la aplicación. */}
          {scope && (
            <span className="palette-scope">
              {scope.name}
              <ChevronRight size={13} aria-hidden="true" />
            </span>
          )}

          <input
            ref={inputRef}
            type="text"
            autoFocus
            className="palette-field"
            placeholder={scope ? `Sección de ${scope.name}…` : 'Busca un cliente, una sección o una acción…'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            aria-label="Buscar"
            aria-autocomplete="list"
          />
          <kbd className="kbd">esc</kbd>
        </div>

        <div className="palette-list" ref={listRef} role="listbox" aria-label="Resultados">
          {flat.length === 0 ? (
            <p className="palette-empty">
              Nada coincide con «{query}». Prueba con el nombre del cliente o de la sección.
            </p>
          ) : (
            groups.map(([group, rows]) => (
              <div className="palette-group" key={group}>
                <span className="section-label">{group}</span>
                {rows.map((item) => {
                  const Icon = item.icon;
                  const isActive = item.id === active?.id;
                  return (
                    /*
                      Es un `div` y no un `<button>` porque dentro va OTRO botón
                      —el de entrar a las secciones del cliente— y un botón no
                      puede anidar botones. La navegación por teclado no pasa
                      por aquí (vive en el campo de arriba), así que la fila no
                      pierde nada al dejar de ser tabulable.
                    */
                    <div
                      key={item.id}
                      role="option"
                      aria-selected={isActive}
                      data-active={isActive}
                      className="palette-row"
                      onMouseMove={() => setCursor(flat.indexOf(item))}
                      onClick={item.run}
                    >
                      {Icon && <Icon size={15} aria-hidden="true" />}
                      <span className="label">{item.label}</span>
                      {item.hint && <span className="hint">{item.hint}</span>}
                      {/*
                        Entrar al segundo nivel («Marta → sus secciones») era
                        SOLO de teclado: Tab o →, con un `kbd` decorativo que en
                        táctil no existía — desde el móvil nunca se llegaba.
                        Ahora el atajo es un botón de verdad; el `kbd` de dentro
                        se esconde en táctil, donde no significa nada.
                      */}
                      {item.enter && (
                        <button
                          type="button"
                          className="palette-into"
                          onClick={(e) => {
                            e.stopPropagation();
                            setScope(item.enter);
                            setQuery('');
                          }}
                          aria-label={`Secciones de ${item.label}`}
                        >
                          <ChevronRight size={14} aria-hidden="true" />
                          <kbd className="kbd">tab</kbd>
                        </button>
                      )}
                      {isActive && !item.enter && (
                        <CornerDownLeft size={13} className="palette-enter" aria-hidden="true" />
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <footer className="palette-foot">
          <span>
            <kbd className="kbd">↑</kbd>
            <kbd className="kbd">↓</kbd> moverse
          </span>
          <span>
            <kbd className="kbd">↵</kbd> abrir
          </span>
          <span>
            <kbd className="kbd">tab</kbd> entrar en el cliente
          </span>
        </footer>
      </div>
    </div>
  );
};
