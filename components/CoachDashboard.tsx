// components/CoachDashboard.tsx
'use client'; //
import React, { useState } from 'react';
import { WorkoutLogEditor } from './WorkoutLogEditor';
import { ClientModal } from './ClientModal'; // 1. Importamos el modal

export const CoachDashboard = ({ initialClients = [] }: { initialClients?: any[] }) => {
  const [activeTab, setActiveTab] = useState<'workout'>('workout');
  const [clients, setClients] = useState(initialClients);
  const [selectedClientId, setSelectedClientId] = useState<string>(clients[0]?.id || '');
  
  // State para controlar el modal
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleSaveClient = (newClientData: any) => {
    // Aquí puedes guardar en Supabase o agregarlo al estado local
    const newClient = {
      id: String(Date.now()),
      ...newClientData
    };
    setClients([...clients, newClient]);
    setSelectedClientId(newClient.id);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <header className="bg-slate-900/80 backdrop-blur-md border border-slate-800 rounded-2xl p-4 flex flex-wrap justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <h1 className="font-black text-xl text-white tracking-wide">
            FitCoach<span className="text-emerald-400">Hub</span>
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <label className="text-xs font-bold text-slate-400">Atleta:</label>
          <select 
            value={selectedClientId} 
            onChange={(e) => setSelectedClientId(e.target.value)}
            className="bg-slate-950 text-white font-bold text-sm px-3 py-2 rounded-xl border border-slate-800 outline-none"
          >
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          {/* Botón para abrir el Modal */}
          <button 
            onClick={() => setIsModalOpen(true)}
            className="px-3 py-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500 hover:text-black font-bold text-xs rounded-xl transition-all"
          >
            + Nuevo Cliente
          </button>
        </div>
      </header>

      {/* Renderizado del Modal */}
      <ClientModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSave={handleSaveClient} 
      />

      {/* Vista principal */}
      <main>
        <WorkoutLogEditor clientId={selectedClientId} />
      </main>
    </div>
  );
};