import { Dumbbell, LogOut, ShieldCheck, Sparkles, User, Users } from 'lucide-react';
import { useApp } from '@/context/AppContext';

export const Header = () => {
  const { view, setViewMode, isCoach, clients, signOut, hasUnsavedChanges } = useApp();

  return (
    <header className="app-header">
      <div className="logo-container">
        <span className="logo-icon">
          <Dumbbell size={21} />
        </span>
        <div>
          <div className="logo-text">Caveman Hub</div>
          <div className="logo-tag">
            <Sparkles size={9} /> Entrenamiento y progreso
          </div>
        </div>
      </div>

      <div className="row wrap center gap-2 grow">
        {isCoach && (
          <span className="badge badge-active">
            <Users size={11} /> {clients.length} {clients.length === 1 ? 'cliente' : 'clientes'}
          </span>
        )}
        {hasUnsavedChanges && (
          <span className="badge badge-pending" role="status">
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
              <User size={14} /> Vista cliente
            </button>
          </div>
        )}

        <button type="button" className="btn btn-icon" onClick={signOut} title="Cerrar sesión">
          <LogOut size={15} />
          <span className="sr-only">Cerrar sesión</span>
        </button>
      </div>
    </header>
  );
};
