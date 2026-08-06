import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { UserCheck, ExternalLink, Calendar, CheckCircle2, AlertTriangle, Search, Plus, FolderCheck, CreditCard, Sparkles } from 'lucide-react';

export const ClientRoster = () => {
  const { clients, updateClient, addClient } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('all'); // 'all' | 'pending_onboarding' | 'due_soon'
  const [showNewClientForm, setShowNewClientForm] = useState(false);
  const [newClient, setNewClient] = useState({ name: '', email: '', phone: '' });

  const handleCreateClient = async (e) => {
    e.preventDefault();
    if (!newClient.name.trim()) return;
    await addClient(newClient);
    setNewClient({ name: '', email: '', phone: '' });
    setShowNewClientForm(false);
  };

  const filteredClients = clients.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) || (c.email || '').toLowerCase().includes(searchTerm.toLowerCase());
    if (selectedFilter === 'pending_onboarding') return matchesSearch && !c.onboardingComplete;
    if (selectedFilter === 'due_soon') return matchesSearch && c.paymentStatus === 'due_soon';
    return matchesSearch;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Header & Actions Bar */}
      <div className="glass-panel" style={{ padding: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <UserCheck size={20} color="var(--accent-cyan)" /> Control de Clientes & Onboarding
          </h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Gestiona la entrada de nuevos atletas, la revisión inicial postura/maquinaria y el control de pagos.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Buscar por nombre o correo..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                background: '#0f172a',
                border: '1px solid var(--border-color)',
                padding: '8px 12px 8px 34px',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '0.85rem',
                width: '240px'
              }}
            />
          </div>

          <button className="btn-primary" onClick={() => setShowNewClientForm(!showNewClientForm)}>
            <Plus size={16} /> Nuevo Cliente
          </button>
        </div>
      </div>

      {showNewClientForm && (
        <form onSubmit={handleCreateClient} className="glass-panel" style={{ padding: '1.25rem', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Nombre *</label>
            <input
              value={newClient.name}
              onChange={(e) => setNewClient({ ...newClient, name: e.target.value })}
              required
              style={{ background: '#0f172a', border: '1px solid var(--border-color)', color: '#fff', padding: '8px 12px', borderRadius: 8, fontSize: '0.88rem', width: 200 }}
            />
          </div>
          <div>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Email</label>
            <input
              type="email"
              value={newClient.email}
              onChange={(e) => setNewClient({ ...newClient, email: e.target.value })}
              style={{ background: '#0f172a', border: '1px solid var(--border-color)', color: '#fff', padding: '8px 12px', borderRadius: 8, fontSize: '0.88rem', width: 200 }}
            />
          </div>
          <div>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Teléfono / WhatsApp</label>
            <input
              value={newClient.phone}
              onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })}
              style={{ background: '#0f172a', border: '1px solid var(--border-color)', color: '#fff', padding: '8px 12px', borderRadius: 8, fontSize: '0.88rem', width: 160 }}
            />
          </div>
          <button type="submit" className="btn-primary">Guardar cliente</button>
          <button type="button" className="btn-secondary" onClick={() => setShowNewClientForm(false)}>Cancelar</button>
        </form>
      )}

      {/* Roster Cards Table */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '1.25rem' }}>
        {filteredClients.map(c => (
          <div key={c.id} className="glass-panel" style={{ padding: '1.25rem', position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1rem' }}>
              <img
                src={c.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(c.name)}`}
                alt={c.name}
                style={{ width: '48px', height: '48px', borderRadius: '12px', objectFit: 'cover', border: '1px solid var(--accent-emerald)' }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: '1rem' }}>{c.name}</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{c.email} • {c.phone}</div>
              </div>
              <span className={`badge ${c.paymentStatus === 'paid' ? 'badge-reviewed' : 'badge-urgent'}`}>
                <CreditCard size={10} /> {c.paymentStatus === 'paid' ? 'Al día' : 'Pago Pendiente'}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: '#0f172a', padding: '12px', borderRadius: '8px', marginBottom: '1rem', border: '1px solid var(--border-color)', fontSize: '0.82rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-muted)' }}>Estado Onboarding:</span>
                {c.onboardingComplete ? (
                  <span style={{ color: 'var(--accent-emerald)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <CheckCircle2 size={12} /> Completado
                  </span>
                ) : (
                  <button
                    onClick={() => updateClient(c.id, { onboardingComplete: true })}
                    style={{ background: 'var(--accent-amber)', color: '#000', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700 }}
                  >
                    Marcar Completado
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-muted)' }}>Revisión Postural Inicial:</span>
                {c.postureReviewed ? (
                  <span style={{ color: 'var(--accent-emerald)', fontWeight: 600 }}>✓ Analizada</span>
                ) : (
                  <button
                    onClick={() => updateClient(c.id, { postureReviewed: true })}
                    style={{ background: 'var(--accent-cyan)', color: '#000', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700 }}
                  >
                    Revisar Postura
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--text-muted)' }}>Vídeos de Maquinaria Gimnasio:</span>
                <a
                  href={c.gymEquipmentLink}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: 'var(--accent-cyan)', textDecoration: 'none', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  <FolderCheck size={12} /> Ver Carpeta Drive <ExternalLink size={10} />
                </a>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Próxima Renovación: <strong>{c.nextPaymentDate}</strong></span>
              <button
                className="btn-secondary"
                onClick={() => alert(`Enviando recordatorio automático de WhatsApp a ${c.name}`)}
                style={{ padding: '4px 10px', fontSize: '0.75rem' }}
              >
                Notificar por WhatsApp
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
