import { Search } from 'lucide-react';
import { useData } from '@/context/AppContext';
import { paletteShortcut } from '@/lib/platform';
import { Logo } from '@/components/ui/Logo';
import { AccountMenu } from '@/components/AccountMenu';
import { ClientBell } from '@/components/Client/ClientBell';
import { useCommandPalette } from '@/components/ui/CommandPalette';

/**
 * La cabecera y sus dos piezas de trabajo.
 *
 * ── Una cabecera, dos monturas ──────────────────────────────────────────────
 * La franja clásica (`<Header/>`) navega el móvil, el portal del cliente y el
 * modo preview. En el escritorio del entrenador NO hay franja: el chasis con
 * barra lateral monta sus dos piezas útiles —la búsqueda y la cuenta— en su
 * propia barra de herramientas (`.shell-top`, ver `CoachLayout`), un objeto de
 * cristal a juego con la barra lateral, no una franja de borde a borde. Una
 * franja entera para un buscador y un avatar era cromo vacío.
 *
 * Por eso este archivo exporta las piezas por separado: `Omnibox` y
 * `HeaderActions` se pintan en las dos monturas y no pueden divergir. Y el
 * avatar queda SIEMPRE arriba a la derecha, en cualquier modo y tamaño.
 *
 * ── Qué se ha ido de la cabecera ────────────────────────────────────────────
 * · **El recuento de clientes.** «12 clientes» es un dato de la cartera, y en
 *   la cartera está, con su desglose.
 * · **El conmutador Entrenador/Cliente.** Pasó por el centro de la cabecera y
 *   por el menú de cuenta —donde no lo imaginaba nadie— y hoy vive con el
 *   cliente al que pertenece (`CoachLayout`, «Ver su portal»), además de en la
 *   paleta; la vuelta la lleva la barra del modo (`PreviewBar`).
 *
 * El botón de búsqueda existe además del atajo `⌘K` porque un atajo que no se
 * anuncia no lo descubre nadie; el propio botón lleva la tecla escrita.
 */
/*
  ── Un botón, no un falso campo ─────────────────────────────────────────────
  La búsqueda fue una caja ancha con pinta de input, y esa promesa era mentira:
  al pulsarla no se escribía AHÍ, se abría la paleta en el centro. Un campo que
  abre otro campo se siente como un salto; un BOTÓN que abre un diálogo es lo
  normal desde hace treinta años. Compacto, vive con las demás acciones de la
  esquina —buscar, avisos, cuenta— y le devuelve a la miga el sitio que el
  campo estirado ocupaba sobre vacío.
*/
export const Omnibox = () => {
  const palette = useCommandPalette();

  return (
    <button
      type="button"
      className="omnibox"
      aria-expanded={palette.open}
      title="Busca un cliente, una sección o una acción"
      onClick={() => palette.setOpen(true)}
    >
      <Search size={15} aria-hidden="true" />
      <span className="omnibox-label">Buscar</span>
      {/* `⌘` en Apple y `Ctrl` en el resto: ver `lib/platform.js`. */}
      <kbd className="kbd">{paletteShortcut()}</kbd>
    </button>
  );
};

export const HeaderActions = () => {
  const { hasUnsavedChanges } = useData();

  return (
    <div className="row gap-2 shrink-0">
      {/* Los avisos del cliente, donde se miran en un móvil: no en una pantalla
          a la que hay que acordarse de entrar. Ver `Client/ClientBell`. */}
      <ClientBell />
      {/* El aviso de cambios sin confirmar: lo único de esta esquina que habla
          de algo que puede perderse. */}
      {hasUnsavedChanges && (
        <span className="badge badge-warn" role="status">
          Cambios sin confirmar
        </span>
      )}
      <AccountMenu />
    </div>
  );
};

export const Header = () => (
  <header className="app-header">
    <Logo subtitle={null} />
    <Omnibox />
    <HeaderActions />
  </header>
);
