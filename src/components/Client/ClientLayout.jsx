import { NavLink, Outlet } from 'react-router-dom';
import { ShieldCheck, UserX } from 'lucide-react';

import { useApp } from '@/context/AppContext';
import { latestWeight } from '@/domain/anthropometry';
import { CONSENT_POINTS, grantConsent, hasConsent } from '@/domain/privacy';
import { CLIENT_SECTIONS } from '@/routes';
import { EmptyState, Panel } from '@/components/ui/primitives';
import { BottomNav } from '@/components/ui/BottomNav';
import { ClientPrivacy } from './ClientPrivacy';

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
  const { activeClient, workoutData, anthropometry, isCoach, updateClientPreferences } = useApp();

  /* Del histórico de pesajes, no de `clients.current_weight`: esa columna no la
     escribía nadie y enseñaba un peso congelado como si fuera el de hoy. */
  const pesoActual = latestWeight(anthropometry[activeClient?.id]?.history);

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

      {/*
        ── El consentimiento, antes que nada ──────────────────────────────────
        Se pide al CLIENTE y no lo marca el entrenador en el alta: es suyo. Va
        arriba del todo y solo desaparece cuando lo da, porque mientras no conste
        el tratamiento de sus fotos y sus medidas no está cubierto.

        No bloquea el portal a propósito: impedirle ver su rutina hasta que acepte
        convertiría el consentimiento en un peaje, y un consentimiento que no se
        puede rechazar sin perder el servicio no es libre — que es justo lo que la
        norma exige que sea.
      */}
      {!isCoach && !hasConsent(activeClient.preferences) && (
        <Panel className="col gap-3" style={{ marginBottom: 'var(--s4)' }}>
          <span className="section-title">
            <ShieldCheck size={17} /> Antes de empezar
          </span>
          <ul className="col gap-2 t-sm t-secondary" style={{ paddingLeft: '1.1em' }}>
            {CONSENT_POINTS.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
          <div className="row gap-2 wrap">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() =>
                updateClientPreferences(activeClient.id, 'consent', grantConsent())
              }
            >
              Entendido, acepto
            </button>
          </div>
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

        {pesoActual !== null && (
          <div className="client-hero-figure">
            <span className="stat-label">Peso actual</span>
            <span className="v">{pesoActual} kg</span>
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

      {/* Sus derechos, ejercitables por él y no pidiéndolos. Al final y plegado:
          no es a lo que viene, pero tiene que estar. */}
      {!isCoach && <ClientPrivacy client={activeClient} />}

      {/*
        En móvil las pestañas de arriba se ocultan y navega esta barra. No son dos
        navegaciones: es la misma lista en el sitio donde se puede usar en cada
        formato —arriba con ratón, abajo con el pulgar—. Ver `ui/BottomNav.jsx`.
      */}
      <BottomNav
        label="Secciones de mi portal"
        items={CLIENT_SECTIONS.map(({ path, short, label, icon }) => ({
          to: `/mi/${path}`,
          label: short || label,
          icon,
        }))}
      />
    </div>
  );
};
