import { ShieldCheck, User } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Logo } from '@/components/ui/Logo';
import { AccountMenu } from '@/components/AccountMenu';

export const Header = () => {
  const { view, setViewMode, isCoach, clients, hasUnsavedChanges } = useApp();

  return (
    <header className="app-header">
      {/*
        Sin subtítulo. «Entrenamiento y progreso» presenta el producto a quien
        aún no ha entrado, y ahí sigue —en la pantalla de acceso—; en una
        cabecera pegajosa que acompaña al entrenador toda la jornada es una línea
        que no informa de nada y que compite con el nombre del cliente.
      */}
      <Logo subtitle={null} />

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

        {/* Configuración, tema y salir cuelgan del avatar, que es donde la gente
            los busca en cualquier aplicación. */}
        <AccountMenu />
      </div>
    </header>
  );
};
