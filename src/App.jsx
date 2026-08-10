import { useApp } from '@/context/AppContext';
import { Header } from '@/components/Header';
import { Login } from '@/components/Auth/Login';
import { CoachDashboard } from '@/components/Coach/CoachDashboard';
import { ClientPortal } from '@/components/Client/ClientPortal';
import { Notice } from '@/components/ui/primitives';

export default function App() {
  const { session, loading, loadError, view } = useApp();

  if (loading) {
    return (
      <div className="row center" style={{ minHeight: '100vh' }}>
        <span className="t-secondary">Cargando…</span>
      </div>
    );
  }

  if (!session) return <Login />;

  return (
    <>
      <Header />
      <main>
        {loadError && (
          <div className="layout" style={{ paddingBottom: 0 }}>
            <Notice tone="error">{loadError}</Notice>
          </div>
        )}
        {view === 'coach' ? <CoachDashboard /> : <ClientPortal />}
      </main>
    </>
  );
}
