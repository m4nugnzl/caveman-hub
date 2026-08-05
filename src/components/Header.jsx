import React from 'react';
import { useApp } from '../context/AppContext';
import { supabase } from '../lib/supabaseClient';
import { Dumbbell, ShieldCheck, User, Video, Users, Sparkles, LogOut } from 'lucide-react';

export const Header = () => {
  const { role, setRole, selectedClientId, setSelectedClientId, clients, videos, activeClient } = useApp();
  const pendingCount = videos.filter((v) => v.status === 'pending').length;

  return (
    <header className="app-header">
      {/* Logo */}
      <div className="logo-container">
        <div className="logo-icon">
          <Dumbbell size={22} />
        </div>
        <div>
          <div className="logo-text">FitCoach Hub</div>
          <div style={{ fontSize: '0.68rem', color: 'var(--accent-emerald)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}>
            <Sparkles size={9} /> Sistema de Asesoramiento Elite
          </div>
        </div>
      </div>

      {/* Center: Status badges (coach only) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1, justifyContent: 'center', flexWrap: 'wrap' }}>
        {role === 'coach' && (
          <>
            {pendingCount > 0 && (
              <div className="badge badge-pending">
                <Video size={11} /> {pendingCount} vídeo{pendingCount !== 1 ? 's' : ''} pendiente{pendingCount !== 1 ? 's' : ''}
              </div>
            )}
            <div className="badge badge-active">
              <Users size={11} /> {clients.length} clientes
            </div>
          </>
        )}
        {role === 'client' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Vista cliente:</span>
            <select
              value={selectedClientId}
              onChange={(e) => setSelectedClientId(e.target.value)}
              style={{ background: '#1e293b', color: '#fff', border: '1px solid var(--border-color)', padding: '6px 12px', borderRadius: 8, fontSize: '0.85rem', fontWeight: 700 }}
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Role Switcher */}
      <div className="role-switcher">
        <button className={`role-btn ${role === 'coach' ? 'active' : ''}`} onClick={() => setRole('coach')}>
          <ShieldCheck size={15} /> Entrenador
        </button>
        <button className={`role-btn ${role === 'client' ? 'active' : ''}`} onClick={() => setRole('client')}>
          <User size={15} /> Cliente
        </button>
        <button className="role-btn" onClick={() => supabase.auth.signOut()} title="Cerrar sesión">
          <LogOut size={15} />
        </button>
      </div>
    </header>
  );
};
