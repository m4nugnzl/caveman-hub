import { useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { useClickOutside } from '@/lib/useClickOutside';
import { useDismissable } from '@/lib/useDismissable';
import { norm } from '@/lib/texto';
import { useEsTelefono } from '@/lib/useMediaQuery';
import { Modal } from '@/components/ui/Modal';

/** Iniciales para el avatar: un cliente sin foto no debe verse como un hueco. */
const initials = (name = '') =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() || '')
    .join('');

const Avatar = ({ name, active, size = 32 }) => (
  <span
    aria-hidden="true"
    style={{
      width: size,
      height: size,
      borderRadius: size / 3,
      flexShrink: 0,
      display: 'grid',
      placeItems: 'center',
      fontWeight: 900,
      fontSize: size * 0.3,
      background: active
        ? 'linear-gradient(135deg, var(--accent), var(--data-blue))'
        : 'var(--fill)',
      color: active ? 'var(--accent-on)' : 'var(--text-secondary)',
    }}
  >
    {initials(name)}
  </span>
);

/**
 * Selector de cliente. Sigue siendo un desplegable propio (y no un `<select>`
 * nativo) porque el nativo no se puede maquetar y desentonaba con el panel,
 * pero ahora expone semántica de menú y se maneja con teclado.
 */
/** La fila de un cliente, compartida por el desplegable y la hoja. */
const ClientOption = ({ client, selected, onPick }) => (
  <button
    type="button"
    role="menuitemradio"
    aria-checked={selected}
    className="menu-item"
    style={selected ? { background: 'var(--accent-soft)' } : undefined}
    onClick={onPick}
  >
    <Avatar name={client.name} active={selected} size={28} />
    <span className="grow" style={{ minWidth: 0 }}>
      <span
        style={{
          display: 'block',
          fontSize: '0.85rem',
          fontWeight: 700,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {client.name}
      </span>
      <span className="t-xs t-secondary">{client.plan || 'Sin plan'}</span>
    </span>
    {selected && <Check size={15} color="var(--accent)" />}
  </button>
);

export const ClientSwitcher = ({ clients, selectedClientId, onSelect, subtitle }) => {
  const [open, setOpen] = useState(false);
  /* El filtro de la hoja del teléfono. Se limpia al abrir, no al cerrar: así
     un cierre con el gesto de atrás no deja la búsqueda anterior puesta. */
  const [filtro, setFiltro] = useState('');
  const esTelefono = useEsTelefono();
  const wrapRef = useRef(null);
  useClickOutside(wrapRef, () => setOpen(false), open && !esTelefono);
  /* El cierre animado del desplegable de escritorio; la hoja del teléfono ya lo
     trae de serie con la prop `open` del Modal. */
  const pop = useDismissable(open && !esTelefono);

  const current = clients.find((c) => c.id === selectedClientId) || clients[0];
  if (!current) return null;

  const abrir = () => {
    setFiltro('');
    setOpen((v) => !v);
  };

  /* Sin tildes por los dos lados: «nunez» encuentra a Núñez (lib/texto). */
  const filtrados = filtro.trim()
    ? clients.filter((c) => norm(c.name).includes(norm(filtro.trim())))
    : clients;

  return (
    <div ref={wrapRef} className="switcher" style={{ position: 'relative' }}>
      <button
        type="button"
        className="btn btn-secondary switcher-btn"
        style={{ padding: '6px 14px 6px 6px', borderRadius: 'var(--r-lg)' }}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={abrir}
      >
        <Avatar name={current.name} active />
        {/* `flex: 1` para que en la barra lateral —donde el botón ocupa el
            ancho— el galón se vaya al canto derecho, como en cualquier
            selector de espacio de trabajo. En el subnivel del móvil el botón
            mide lo que su contenido y el `flex` no cambia nada. */}
        <span style={{ textAlign: 'left', flex: 1, minWidth: 0 }}>
          <span
            style={{
              display: 'block',
              fontSize: '0.9rem',
              fontWeight: 800,
              lineHeight: 1.15,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {current.name}
          </span>
          {/* El subtítulo lo compone quien monta el selector (plan, antigüedad…);
              sin él, el plan a secas, como en la lista. */}
          <span
            className="t-xs t-secondary"
            style={{
              fontWeight: 600,
              display: 'block',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {subtitle || current.plan || 'Sin plan'}
          </span>
        </span>
        <ChevronDown
          size={16}
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform var(--fast)', flexShrink: 0 }}
        />
      </button>

      {/*
        ══ En el teléfono, la lista es una HOJA con buscador ═══════════════════
        El desplegable anclado al botón funciona con ratón; con veinte clientes
        en un móvil era una columna estrecha sin filtro en la zona alta de la
        pantalla. La hoja usa el ancho entero, la lista se desplaza con el
        pulgar y el buscador corta la lista en dos toques. En escritorio, el
        desplegable de siempre.
      */}
      {esTelefono && (
        <Modal open={open} title="Cambiar de cliente" onClose={() => setOpen(false)}>
          <div className="col gap-3">
            {clients.length > 6 && (
              <input
                type="search"
                className="input"
                placeholder="Buscar por nombre…"
                value={filtro}
                onChange={(e) => setFiltro(e.target.value)}
                aria-label="Buscar cliente"
              />
            )}
            <div className="col" role="menu" aria-label="Tus clientes">
              {filtrados.length === 0 ? (
                <p className="t-sm t-secondary">Nadie se llama así en tu cartera.</p>
              ) : (
                filtrados.map((client) => (
                  <ClientOption
                    key={client.id}
                    client={client}
                    selected={client.id === selectedClientId}
                    onPick={() => {
                      onSelect(client.id);
                      setOpen(false);
                    }}
                  />
                ))
              )}
            </div>
          </div>
        </Modal>
      )}

      {pop.mounted && !esTelefono && (
        <div
          ref={pop.ref}
          className="popover"
          data-state={pop.closing ? 'closing' : 'open'}
          style={{ top: 'calc(100% + 8px)', left: 0, maxHeight: 340, overflowY: 'auto' }}
          role="menu"
        >
          {clients.map((client) => (
            <ClientOption
              key={client.id}
              client={client}
              selected={client.id === selectedClientId}
              onPick={() => {
                onSelect(client.id);
                setOpen(false);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
};
