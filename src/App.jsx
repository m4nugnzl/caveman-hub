import React from 'react';
import { useApp } from './context/AppContext';
import { Header } from './components/Header';
import { CoachDashboard } from './components/Coach/CoachDashboard';
import { ClientPortal } from './components/Client/ClientPortal';
import { Login } from './components/Auth/Login';

export default function App() {
  const { session, loading, role } = useApp();

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
        Cargando...
      </div>
    );
  }

  if (!session) {
    return <Login />;
  }

  return (
    <div>
      <Header />
      <main>
        {role === 'coach' ? <CoachDashboard /> : (
          <div style={{ padding: '2rem 1rem', maxWidth: 960, margin: '0 auto' }}>
            <ClientPortal />
          </div>
        )}
      </main>
    </div>
  );
}
