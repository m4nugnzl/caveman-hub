import { useEffect, useState } from 'react';
import { Camera, TrendingUp, Gauge, LayoutGrid, Layers, Ruler, Salad, UserPlus, Users, UsersRound } from 'lucide-react';

import { useApp } from '@/context/AppContext';
import { EmptyState } from '@/components/ui/primitives';
import { Dashboard } from '@/components/dashboard/Dashboard';
import { AnalyticsPanel } from '@/components/analytics/AnalyticsPanel';
import { ClientSwitcher } from './ClientSwitcher';
import { WorkoutLogEditor } from './Workout/WorkoutLogEditor';
import { AnthropometryModule } from './AnthropometryModule';
import { NutritionModule } from './NutritionModule';
import { ClientRoster } from './ClientRoster';
import { ClientPortfolio } from './ClientPortfolio';
import { TeamPanel } from './TeamPanel';
import { PhotoStudio } from './PhotoStudio/PhotoStudio';

// Los paneles son los MISMOS componentes que ve el cliente, con `audience`
// distinto: resumen accionable en una pestaña, exploración en la otra.
const CoachOverview = () => <Dashboard audience="coach" />;
const CoachAnalytics = () => <AnalyticsPanel audience="coach" />;

const TABS = [
  /*
    La cartera va primera y es la pantalla de entrada: la primera pregunta del
    día no es «¿cómo va este cliente?» sino «¿a quién tengo que atender hoy?».
    Es además la única pestaña que no necesita un cliente activo, porque habla de
    todos a la vez.
  */
  { id: 'portfolio', label: 'Cartera', icon: LayoutGrid, Component: ClientPortfolio, global: true },
  { id: 'volume', label: 'Resumen', icon: Gauge, Component: CoachOverview },
  { id: 'analytics', label: 'Analítica', icon: TrendingUp, Component: CoachAnalytics },
  { id: 'workout', label: 'Rutina & Microciclos', icon: Layers, Component: WorkoutLogEditor },
  { id: 'nutrition', label: 'Nutrición & Hábitos', icon: Salad, Component: NutritionModule },
  { id: 'photos', label: 'Fotos & Evolución', icon: Camera, Component: PhotoStudio },
  { id: 'anthropometry', label: 'Check-ins', icon: Ruler, Component: AnthropometryModule },
  { id: 'clients', label: 'Clientes & Pagos', icon: Users, Component: ClientRoster, global: true },
  { id: 'team', label: 'Equipo', icon: UsersRound, Component: TeamPanel, global: true },
];

export const CoachDashboard = () => {
  const { clients, selectedClientId, setSelectedClientId, activeClient } = useApp();
  const [activeTab, setActiveTab] = useState('portfolio');

  const hasClients = clients.length > 0;

  /*
   * Con el roster vacío se forzaba la pestaña 'volume', que leía
   * `activeClient.id` sobre `undefined` y tumbaba la app: TODO entrenador
   * recién registrado veía una pantalla en blanco y no llegaba nunca a
   * "+ Nuevo Cliente". Ahora, sin clientes, solo quedan disponibles las pestañas
   * marcadas como `global`, que son las que no dependen de un cliente activo.
   */
  useEffect(() => {
    const tab = TABS.find((t) => t.id === activeTab);
    if (!hasClients && !tab?.global) setActiveTab('clients');
  }, [hasClients, activeTab]);

  const current = TABS.find((t) => t.id === activeTab) || TABS[0];
  const Current = current.Component;

  return (
    <div className="layout">
      {/* El selector de cliente solo tiene sentido en las pestañas que hablan de
          UNO. En la cartera y en el listado sobra: ahí se ven todos. */}
      {hasClients && !current.global && (
        <div className="card card-tight row between wrap gap-3" style={{ marginBottom: 'var(--s5)' }}>
          <div className="row wrap gap-4">
            <ClientSwitcher
              clients={clients}
              selectedClientId={selectedClientId}
              onSelect={setSelectedClientId}
            />
            {activeClient && (
              <div className="row gap-2 wrap">
                <span
                  className={`badge ${activeClient.paymentStatus === 'paid' ? 'badge-ok' : 'badge-bad'}`}
                >
                  {activeClient.paymentStatus === 'paid' ? 'Pago al día' : 'Pago pendiente'}
                </span>
                {activeClient.currentWeight && (
                  <span className="badge badge-info">{activeClient.currentWeight} kg</span>
                )}
                {activeClient.startDate && (
                  <span className="badge">Desde {activeClient.startDate}</span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="tabs" role="tablist" aria-label="Secciones del panel">
        {TABS.map(({ id, label, icon: Icon }) => {
          const disabled = !hasClients && !TABS.find((t) => t.id === id)?.global;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              className="tab"
              aria-selected={activeTab === id}
              disabled={disabled}
              title={disabled ? 'Primero da de alta a un cliente' : undefined}
              onClick={() => setActiveTab(id)}
            >
              <Icon size={16} />
              {label}
            </button>
          );
        })}
      </div>

      {/*
        Guarda única para los módulos que dependen de un cliente activo. Antes
        cada uno accedía a `activeClient.id` sin comprobar nada.
      */}
      {!hasClients && !current.global ? (
        <EmptyState
          icon={UserPlus}
          title="Todavía no tienes clientes"
          message="Da de alta a tu primer atleta en la pestaña «Clientes & Pagos» y aquí aparecerán su rutina, su progreso y sus datos."
        />
      ) : (
        <Current onOpenClient={() => setActiveTab('volume')} />
      )}
    </div>
  );
};
