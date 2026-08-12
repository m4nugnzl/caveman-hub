import { NavLink, Outlet } from 'react-router-dom';
import { UserX } from 'lucide-react';

import { useApp } from '@/context/AppContext';
import { CLIENT_SECTIONS } from '@/routes';
import { EmptyState, Panel } from '@/components/ui/primitives';

/**
 * Marco del portal del cliente: saludo, pestañas y contenido.
 *
 * Antes era `ClientPortal`, un componente de 200 líneas que decidía la pestaña
 * con `useState` y montaba los seis paneles con seis condicionales. Ahora las
 * pestañas son enlaces y cada sección es su propia ruta, así que el cliente puede
 * guardar «mi rutina» en la pantalla de inicio del móvil y el gesto de volver
 * atrás no cierra la aplicación.
 */
export const ClientLayout = () => {
  const { activeClient, workoutData, isCoach } = useApp();

  // Un perfil de cliente sin ficha vinculada no tiene datos que mostrar. Antes
  // esto tumbaba la app entera al leer `activeClient.id` sobre undefined.
  if (!activeClient) {
    return (
      <div className="layout layout-narrow">
        <EmptyState
          icon={UserX}
          title={isCoach ? 'No hay ningún cliente seleccionado' : 'Tu cuenta aún no está vinculada'}
          message={
            isCoach
              ? 'Vuelve a la vista de entrenador y selecciona un cliente para previsualizar su portal.'
              : 'Tu entrenador todavía no ha enlazado tu cuenta con tu ficha. Escríbele para que la vincule.'
          }
        />
      </div>
    );
  }

  const microcycles = workoutData[activeClient.id]?.microcycles || [];
  const lastWeek = microcycles.length > 0 ? microcycles[microcycles.length - 1].weekNumber : null;

  return (
    <div className="layout layout-narrow">
      {isCoach && (
        <Panel tight className="client-preview">
          Estás previsualizando el portal de <strong>{activeClient.name}</strong> tal y como lo ve tu
          cliente.
        </Panel>
      )}

      <Panel className="client-hero row between wrap gap-4">
        <div className="row gap-4">
          {activeClient.avatar && (
            <img src={activeClient.avatar} alt="" width={58} height={58} className="client-hero-avatar" />
          )}
          <div>
            <h1 className="client-hero-name">Hola, {activeClient.name}</h1>
            <p className="t-sm t-secondary">
              {[activeClient.plan, lastWeek ? `Semana ${lastWeek} activa` : null]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
        </div>

        {activeClient.currentWeight && (
          <div className="client-hero-figure">
            <span className="stat-label">Peso actual</span>
            <span className="v">{activeClient.currentWeight} kg</span>
          </div>
        )}
      </Panel>

      <nav className="tabs" aria-label="Secciones de mi portal">
        {CLIENT_SECTIONS.map(({ path, label, icon: Icon }) => (
          <NavLink key={path} to={`/mi/${path}`} className="tab">
            <Icon size={16} /> {label}
          </NavLink>
        ))}
      </nav>

      <Outlet />
    </div>
  );
};
