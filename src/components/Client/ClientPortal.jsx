import { useCallback, useMemo, useState } from 'react';
import { Camera, TrendingUp, Gauge, Layers, Salad, Scale, UserX } from 'lucide-react';

import { useApp } from '@/context/AppContext';
import { EmptyState, Panel } from '@/components/ui/primitives';
import { AnthropometryPanel } from '@/components/anthropometry/AnthropometryPanel';
import { Dashboard } from '@/components/dashboard/Dashboard';
import { AnalyticsPanel } from '@/components/analytics/AnalyticsPanel';
import { ClientRoutine } from './ClientRoutine';
import { ClientPhotos } from './ClientPhotos';
import { ClientDiet } from './ClientDiet';

const TABS = [
  { id: 'dashboard', label: 'Mi panel', icon: Gauge },
  { id: 'analytics', label: 'Analítica', icon: TrendingUp },
  { id: 'workout', label: 'Mi rutina', icon: Layers },
  { id: 'nutrition', label: 'Mi dieta', icon: Salad },
  { id: 'photos', label: 'Mis fotos', icon: Camera },
  { id: 'weight', label: 'Mis check-ins', icon: Scale },
];

export const ClientPortal = () => {
  const {
    activeClient,
    workoutData,
    nutrition,
    anthropometry,
    progressPhotos,
    startSession,
    logSessionSet,
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

  /**
   * El cliente registra sus series en una SESIÓN CON FECHA, igual que el
   * entrenador.
   *
   * Antes llamaba a `updateExerciseSet`, que escribe dentro del plan. Eso hacía
   * que sus kilos se fecharan con la fecha del microciclo y, peor, que
   * desaparecieran de la analítica en cuanto el entrenador abría una sesión real
   * de ese mismo día (`allSessions` descarta la versión heredada del plan).
   *
   * `startOnly` cubre el caso de «registrar hoy» sin haber escrito nada todavía:
   * crea la sesión vacía a partir del plan para que el cliente vea sobre qué
   * fecha va a escribir.
   */
  const logClientSet = useCallback(
    ({ clientId: id, weekNumber, sessionId, date, dayName, exercise, setIndex, field, value, startOnly }) => {
      if (startOnly) return startSession(id, weekNumber, dayName, date);
      return logSessionSet(id, weekNumber, sessionId, date, dayName, exercise, setIndex, field, value);
    },
    [logSessionSet, startSession]
  );

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

  const program = workoutData[activeClient.id];
  const microcycles = program?.microcycles || [];
  const weeks = microcycles.map((m) => m.weekNumber);
  // Derivado, no almacenado: no puede quedar una semana rancia seleccionada.
  const activeWeek = weeks.includes(preferredWeek) ? preferredWeek : weeks[weeks.length - 1] ?? null;

  const workoutSave = saveStatus('workout', activeClient.id);
  const anthroSave = saveStatus('anthro', activeClient.id);

  return (
    <div className="layout layout-narrow">
      {isCoach && (
        <Panel tight style={{ marginBottom: 'var(--s4)' }}>
          <p className="t-sm t-secondary">
            Estás previsualizando el portal de <strong>{activeClient.name}</strong> tal y como lo ve
            tu cliente.
          </p>
        </Panel>
      )}

      <Panel
        className="row between wrap gap-4"
        style={{
          marginBottom: 'var(--s5)',
          background: 'linear-gradient(135deg, var(--accent-soft) 0%, var(--info-soft) 100%)',
          borderColor: 'var(--accent-soft)',
        }}
      >
        <div className="row gap-4">
          {activeClient.avatar && (
            <img
              src={activeClient.avatar}
              alt=""
              width={58}
              height={58}
              style={{ borderRadius: 16, objectFit: 'cover', border: '2px solid var(--accent)' }}
            />
          )}
          <div>
            <h1 style={{ fontSize: '1.3rem', fontWeight: 900 }}>Hola, {activeClient.name}</h1>
            <p className="t-sm t-secondary">
              {[activeClient.plan, activeWeek ? `Semana ${activeWeek} activa` : null]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
        </div>

        {activeClient.currentWeight && (
          <div style={{ textAlign: 'right' }}>
            <div className="stat-label">Peso actual</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--accent)' }}>
              {activeClient.currentWeight} kg
            </div>
          </div>
        )}
      </Panel>

      <div className="tabs" role="tablist" aria-label="Secciones de mi portal">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            className="tab"
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
          onLogSet={logClientSet}
          save={workoutSave}
          onRetry={() => retrySave('workout', activeClient.id)}
        />
      )}

      {activeTab === 'photos' && (
        <ClientPhotos
          client={activeClient}
          photos={photos}
          history={anthropometry[activeClient.id]?.history || []}
          onUpload={uploadProgressPhoto}
        />
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
          photos={photos}
          onUploadPhoto={uploadProgressPhoto}
        />
      )}
    </div>
  );
};
