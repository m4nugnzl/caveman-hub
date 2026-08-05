// components/ClientModal.tsx
'use client';

import React, { useState } from 'react';

interface ClientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave?: (newClient: { name: string; driveLink: string; plan: string }) => void;
}

export const ClientModal = ({ isOpen, onClose, onSave }: ClientModalProps) => {
  const [name, setName] = useState('');
  const [plan, setPlan] = useState('');
  const [driveLink, setDriveLink] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (onSave) {
      onSave({ name, driveLink, plan });
    }
    // Limpiar campos y cerrar
    setName('');
    setDriveLink('');
    setPlan('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl space-y-4">
        
        {/* Encabezado del Modal */}
        <div className="flex justify-between items-center border-b border-slate-800 pb-3">
          <h3 className="text-base font-bold text-white">Nuevo Cliente / Atleta</h3>
          <button 
            type="button" 
            onClick={onClose} 
            className="text-slate-400 hover:text-white font-bold text-lg"
          >
            ✕
          </button>
        </div>

        {/* Formulario que tenías en page.tsx */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Nombre Completo</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
              placeholder="Ej: Juan Pérez"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Plan / Objetivo</label>
            <input
              type="text"
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
              placeholder="Ej: Hipertrofia 4 días"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Carpeta de Google Drive (Opcional)</label>
            <input
              type="url"
              value={driveLink}
              onChange={(e) => setDriveLink(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
              placeholder="https://drive.google.com/drive/folders/..."
            />
          </div>

          {/* Botones de acción */}
          <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-lg transition-all"
            >
              Guardar Cliente
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};