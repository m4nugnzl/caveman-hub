import { Search } from 'lucide-react';
import { useData } from '@/context/AppContext';
import { paletteShortcut } from '@/lib/platform';
import { Logo } from '@/components/ui/Logo';
import { AccountMenu } from '@/components/AccountMenu';
import { ClientBell } from '@/components/Client/ClientBell';
import { useCommandPalette } from '@/components/ui/CommandPalette';

/**
 * Cabecera.
 *
 * ── Qué hay y qué se ha ido ─────────────────────────────────────────────────
 * Tres cosas: la marca, la búsqueda y la cuenta. Han salido dos:
 *
 * · **El recuento de clientes.** «12 clientes» es un dato de la cartera, y en la
 *   cartera está, con su desglose. En una barra pegajosa que acompaña toda la
 *   jornada era una cifra que nunca cambia y que no lleva a ninguna parte.
 *
 * · **El conmutador Entrenador/Cliente.** Ocupaba el centro de la cabecera para
 *   una función de PREVISUALIZACIÓN, que es algo que se usa un minuto al mes.
 *   Se ha ido al menú de cuenta —junto al tema y a la configuración, que son las
 *   otras cosas que se dejan puestas y no se tocan— y además está en la paleta.
 *
 * Lo que ocupa ese hueco ahora es la búsqueda, que es lo contrario: se usa
 * decenas de veces al día. El botón existe además del atajo `⌘K` porque un atajo
 * que no se anuncia no lo descubre nadie; el propio botón lleva la tecla escrita
 * para enseñarlo.
 *
 * El aviso de cambios sin confirmar sí se queda: es lo único de la cabecera que
 * habla de algo que puede perderse.
 */
export const Header = () => {
  const { hasUnsavedChanges } = useData();
  const palette = useCommandPalette();

  return (
    <header className="app-header">
      <Logo subtitle={null} />

      <button type="button" className="omnibox" onClick={() => palette.setOpen(true)}>
        <Search size={15} aria-hidden="true" />
        <span className="omnibox-label">Busca un cliente o una sección</span>
        {/* `⌘` en Apple y `Ctrl` en el resto: ver `lib/platform.js`. */}
        <kbd className="kbd">{paletteShortcut()}</kbd>
      </button>

      <div className="row gap-2 shrink-0">
        {/* Los avisos del cliente, donde se miran en un móvil: no en una pantalla
            a la que hay que acordarse de entrar. Ver `Client/ClientBell`. */}
        <ClientBell />
        {hasUnsavedChanges && (
          <span className="badge badge-warn" role="status">
            Cambios sin confirmar
          </span>
        )}
        <AccountMenu />
      </div>
    </header>
  );
};
