import { Search } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Logo } from '@/components/ui/Logo';
import { AccountMenu } from '@/components/AccountMenu';
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
  const { hasUnsavedChanges } = useApp();
  const palette = useCommandPalette();

  return (
    <header className="app-header">
      <Logo subtitle={null} />

      <button type="button" className="omnibox" onClick={() => palette.setOpen(true)}>
        <Search size={15} aria-hidden="true" />
        <span className="omnibox-label">Busca un cliente o una sección</span>
        {/*
          `⌘` en Apple y `Ctrl` en el resto. Se decide por la plataforma y no se
          escribe «Ctrl/⌘» porque una etiqueta que enseña las dos obliga a elegir
          cuál es la tuya cada vez que la lees.
        */}
        <kbd className="kbd">
          {typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '')
            ? '⌘'
            : 'Ctrl'}
          {' K'}
        </kbd>
      </button>

      <div className="row gap-2 shrink-0">
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
