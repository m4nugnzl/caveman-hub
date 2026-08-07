import { useEffect, useState } from 'react';
import { BarChart3, Camera, Dumbbell, LineChart, Ruler, UserPlus, Users, Utensils } from 'lucide-react';

import { useApp } from '@/context/AppContext';
import { EmptyState } from '@/components/ui/primitives';
import { Dashboard } from '@/components/dashboard/Dashboard';
import { AnalyticsPanel } from '@/components/analytics/AnalyticsPanel';
import { ClientSwitcher } from './ClientSwitcher';
import { WorkoutLogEditor } from './Workout/WorkoutLogEditor';
import { AnthropometryModule } from './AnthropometryModule';
import { NutritionModule } from './NutritionModule';
import { ClientRoster } from './ClientRoster';
import { PhotoStudio } from './PhotoStudio/PhotoStudio';

// Los paneles son los MISMOS componentes que ve el cliente, con `audience`
// distinto: resumen accionable en una pestaña, exploración en la otra.
const CoachOverview = () => <Dashboard audience="coach" />;
const CoachAnalytics = () => <AnalyticsPanel audience="coach" />;

const TABS = [
  { id: 'volume', label: 'Resumen', icon: BarChart3, Component: CoachOverview },
  { id: 'analytics', label: 'Analítica', icon: LineChart, Component: CoachAnalytics },
  { id: 'workout', label: 'Rutina & Microciclos', icon: Dumbbell, Component: WorkoutLogEditor },
  { id: 'photos', label: 'Fotos & Evolución', icon: Camera, Component: PhotoStudio },
  { id: 'anthropometry', label: 'Antropometría', icon: Ruler, Component: AnthropometryModule },
  { id: 'nutrition', label: 'Nutrición & Hábitos', icon: Utensils, Component: NutritionModule },
  { id: 'clients', label: 'Clientes & Pagos', icon: Users, Component: ClientRoster },
];

export const CoachDashboard = () => {
  const { clients, selectedClientId, setSelectedClientId, activeClient } = useApp();
  const [activeTab, setActiveTab] = useState('volume');

  const hasClients = clients.length > 0;

  /*
   * Con el roster vacío se forzaba la pestaña 'volume', que leía
   * `activeClient.id` sobre `undefined` y tumbaba la app: TODO entrenador
   * recién registrado veía una pantalla en blanco y no llegaba nunca a
   * "+ Nuevo Cliente". Ahora, sin clientes, la única pestaña posible es la de
   * clientes.
   */
  useEffect(() => {
    if (!hasClients && activeTab !== 'clients') setActiveTab('clients');
  }, [hasClients, activeTab]);

  const current = TABS.find((t) => t.id === activeTab) || TABS[0];
  const Current = current.Component;

  return (
    <div className="layout-container">
      {hasClients && (
        <div className="panel panel-tight row between wrap gap-3" style={{ marginBottom: 'var(--space-5)' }}>
          <div className="row wrap gap-4">
            <ClientSwitcher
              clients={clients}
              selectedClientId={selectedClientId}
              onSelect={setSelectedClientId}
            />
            {activeClient && (
              <div className="row gap-2 wrap">
                <span
                  className={`badge ${activeClient.paymentStatus === 'paid' ? 'badge-ok' : 'badge-urgent'}`}
                >
                  {activeClient.paymentStatus === 'paid' ? 'Pago al día' : 'Pago pendiente'}
                </span>
                {activeClient.currentWeight && (
                  <span className="badge badge-active">{activeClient.currentWeight} kg</span>
                )}
                {activeClient.startDate && (
                  <span className="badge badge-neutral">Desde {activeClient.startDate}</span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="tabs-nav" role="tablist" aria-label="Secciones del panel">
        {TABS.map(({ id, label, icon: Icon }) => {
          const disabled = !hasClients && id !== 'clients';
          return (
            <button
              key={id}
              type="button"
              role="tab"
              className="tab-item"
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
        Guarda única para los cinco módulos que dependen de un cliente activo.
        Antes cada uno accedía a `activeClient.id` sin comprobar nada.
      */}
      {!hasClients && activeTab !== 'clients' ? (
        <EmptyState
          icon={UserPlus}
          title="Todavía no tienes clientes"
          message="Da de alta a tu primer atleta en la pestaña «Clientes & Pagos» y aquí aparecerán su rutina, su progreso y sus datos."
        />
      ) : (
        <Current />
      )}
    </div>
  );
};
