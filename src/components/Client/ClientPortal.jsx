import { useMemo, useState } from 'react';
import { Camera, Dumbbell, LayoutGrid, LineChart, Scale, UserX, Utensils } from 'lucide-react';

import { useApp } from '@/context/AppContext';
import { EmptyState, Panel } from '@/components/ui/primitives';
import { AnthropometryPanel } from '@/components/anthropometry/AnthropometryPanel';
import { Dashboard } from '@/components/dashboard/Dashboard';
import { AnalyticsPanel } from '@/components/analytics/AnalyticsPanel';
import { ClientRoutine } from './ClientRoutine';
import { ClientPhotos } from './ClientPhotos';
import { ClientDiet } from './ClientDiet';

const TABS = [
  { id: 'dashboard', label: 'Mi panel', icon: LayoutGrid },
  { id: 'analytics', label: 'Analítica', icon: LineChart },
  { id: 'workout', label: 'Mi rutina', icon: Dumbbell },
  { id: 'photos', label: 'Mis fotos', icon: Camera },
  { id: 'nutrition', label: 'Mi dieta', icon: Utensils },
  { id: 'weight', label: 'Peso y medidas', icon: Scale },
];

export const ClientPortal = () => {
  const {
    activeClient,
    workoutData,
    nutrition,
    anthropometry,
    progressPhotos,
    updateExerciseSet,
    addAnthropometryLog,
    removeAnthropometryLog,
    uploadProgressPhoto,
    saveStatus,
    retrySave,
    isCoach,
  } = useApp();

  const [activeTab, setActiveTab] = useState('dashboard');
  const [preferredWeek, setPreferredWeek] = useState(null);

  // Todos los hooks van antes de cualquier return condicional: el orden de
  // llamada tiene que ser idéntico en cada render.
  const clientId = activeClient?.id;
  const photos = useMemo(
    () => (clientId ? progressPhotos.filter((p) => p.clientId === clientId) : []),
    [progressPhotos, clientId]
  );

  // Un perfil de cliente sin ficha vinculada no tiene datos que mostrar. Antes
  // esto tumbaba la app entera al leer `activeClient.id` sobre undefined.
  if (!activeClient) {
    return (
      <div className="layout-container layout-narrow">
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

  const program = workoutData[activeClient.id];
  const microcycles = program?.microcycles || [];
  const weeks = microcycles.map((m) => m.weekNumber);
  // Derivado, no almacenado: no puede quedar una semana rancia seleccionada.
  const activeWeek = weeks.includes(preferredWeek) ? preferredWeek : weeks[weeks.length - 1] ?? null;

  const workoutSave = saveStatus('workout', activeClient.id);
  const anthroSave = saveStatus('anthro', activeClient.id);

  return (
    <div className="layout-container layout-narrow">
      {isCoach && (
        <Panel tight style={{ marginBottom: 'var(--space-4)' }}>
          <p className="text-sm text-muted">
            Estás previsualizando el portal de <strong>{activeClient.name}</strong> tal y como lo ve
            tu cliente.
          </p>
        </Panel>
      )}

      <Panel
        className="row between wrap gap-4"
        style={{
          marginBottom: 'var(--space-5)',
          background: 'linear-gradient(135deg, rgba(16,185,129,0.15) 0%, rgba(6,182,212,0.1) 100%)',
          borderColor: 'var(--accent-emerald-glow)',
        }}
      >
        <div className="row gap-4">
          {activeClient.avatar && (
            <img
              src={activeClient.avatar}
              alt=""
              width={58}
              height={58}
              style={{ borderRadius: 16, objectFit: 'cover', border: '2px solid var(--accent-emerald)' }}
            />
          )}
          <div>
            <h1 style={{ fontSize: '1.3rem', fontWeight: 900 }}>Hola, {activeClient.name}</h1>
            <p className="text-sm text-muted">
              {[activeClient.plan, activeWeek ? `Semana ${activeWeek} activa` : null]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
        </div>

        {activeClient.currentWeight && (
          <div style={{ textAlign: 'right' }}>
            <div className="stat-label">Peso actual</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--accent-emerald)' }}>
              {activeClient.currentWeight} kg
            </div>
          </div>
        )}
      </Panel>

      <div className="tabs-nav" role="tablist" aria-label="Secciones de mi portal">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            className="tab-item"
            aria-selected={activeTab === id}
            onClick={() => setActiveTab(id)}
          >
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>

      {/* Los mismos paneles que ve el entrenador, sin recortes. */}
      {activeTab === 'dashboard' && <Dashboard audience="client" />}

      {activeTab === 'analytics' && <AnalyticsPanel audience="client" />}

      {activeTab === 'workout' && (
        <ClientRoutine
          client={activeClient}
          program={program}
          weeks={weeks}
          activeWeek={activeWeek}
          onSelectWeek={setPreferredWeek}
          onSetChange={updateExerciseSet}
          save={workoutSave}
          onRetry={() => retrySave('workout', activeClient.id)}
        />
      )}

      {activeTab === 'photos' && (
        <ClientPhotos client={activeClient} photos={photos} onUpload={uploadProgressPhoto} />
      )}

      {activeTab === 'nutrition' && <ClientDiet plan={nutrition[activeClient.id]} />}

      {activeTab === 'weight' && (
        <AnthropometryPanel
          client={activeClient}
          anthropometry={anthropometry[activeClient.id]}
          nutritionPlan={nutrition[activeClient.id]}
          audience="client"
          save={anthroSave}
          onRetry={() => retrySave('anthro', activeClient.id)}
          onAdd={(log) => addAnthropometryLog(activeClient.id, log)}
          onRemove={(logId) => removeAnthropometryLog(activeClient.id, logId)}
        />
      )}
    </div>
  );
};
