import { LogOut, Moon, ShieldCheck, Sun, User } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { useTheme } from '@/lib/useTheme.jsx';
import { Logo } from '@/components/ui/Logo';

export const Header = () => {
  const { view, setViewMode, isCoach, clients, signOut, hasUnsavedChanges } = useApp();
  const { isDark, toggle } = useTheme();

  return (
    <header className="app-header">
      <Logo />

      <div className="row wrap center gap-2 grow">
        {isCoach && (
          <span className="badge">
            {clients.length} {clients.length === 1 ? 'cliente' : 'clientes'}
          </span>
        )}
        {hasUnsavedChanges && (
          <span className="badge badge-warn" role="status">
            Cambios sin confirmar
          </span>
        )}
      </div>

      <div className="row gap-2">
        {/*
          El conmutador de rol solo se ofrece a un coach, y como "previsualizar"
          el portal del cliente. Antes cualquier usuario podía ponerse rol de
          entrenador desde aquí: RLS impedía la fuga de datos, pero un cliente
          veía el panel completo del coach sobre su propia ficha.
        */}
        {isCoach && (
          <div className="role-switcher" role="group" aria-label="Vista activa">
            <button
              type="button"
              className="role-btn"
              aria-pressed={view === 'coach'}
              onClick={() => setViewMode('coach')}
            >
              <ShieldCheck size={14} /> Entrenador
            </button>
            <button
              type="button"
              className="role-btn"
              aria-pressed={view === 'client'}
              onClick={() => setViewMode('client')}
              title="Ver la aplicación como la ve tu cliente"
            >
              <User size={14} /> Cliente
            </button>
          </div>
        )}

        <button
          type="button"
          className="btn btn-icon"
          onClick={toggle}
          title={isDark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
          aria-pressed={isDark}
        >
          {isDark ? <Sun size={15} /> : <Moon size={15} />}
          <span className="sr-only">{isDark ? 'Tema claro' : 'Tema oscuro'}</span>
        </button>

        <button type="button" className="btn btn-icon" onClick={signOut} title="Cerrar sesión">
          <LogOut size={15} />
          <span className="sr-only">Cerrar sesión</span>
        </button>
      </div>
    </header>
  );
};
