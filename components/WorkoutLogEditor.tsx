// components/WorkoutLogEditor.tsx
'use client';

import React, { useState } from 'react';

interface WorkoutLogEditorProps {
  clientId?: string;
}

export const WorkoutLogEditor = ({ clientId }: WorkoutLogEditorProps) => {
  // Aquí mantendrás la lógica de microciclos y tabla de ejercicios
  return (
    <div className="space-y-6">
      {/* Selector de Semanas / Microciclos */}
      <div className="flex items-center justify-between bg-slate-900 border border-slate-800 p-4 rounded-xl">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-slate-400">Microciclo:</span>
          <button className="px-3 py-1.5 bg-emerald-500 text-black text-xs font-bold rounded-lg">
            Semana 1
          </button>
        </div>
      </div>

      {/* Tabla Principal de Series */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden p-4">
        <div className="bg-red-600 text-white font-black px-4 py-2 rounded-md mb-4 text-sm uppercase tracking-wide">
          Día 1 - Torso Hipertrofia
        </div>
        
        {/* Renderizado de la tabla adaptado a Tailwind */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-950 text-slate-400 text-xs uppercase">
              <tr>
                <th className="p-3">#</th>
                <th className="p-3">Ejercicio</th>
                <th className="p-3 text-center">Músculo</th>
                <th className="p-3 text-center text-emerald-400">Serie 1</th>
                <th className="p-3 text-center text-cyan-400">Serie 2</th>
                <th className="p-3 text-center text-purple-400">Serie 3</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-slate-800/50">
                <td className="p-3">1</td>
                <td className="p-3 font-semibold text-white">Press Banca Plano</td>
                <td className="p-3 text-center">
                  <span className="bg-slate-800 text-slate-300 text-xs px-2 py-1 rounded">Pecho</span>
                </td>
                {/* Inputs agrupados para kg, reps, rir */}
                {[1, 2, 3].map((s) => (
                  <td key={s} className="p-2">
                    <div className="flex items-center gap-1 bg-slate-950 p-1.5 rounded-lg border border-slate-800 justify-center">
                      <input placeholder="kg" className="w-10 bg-transparent text-center font-bold text-white text-xs outline-none" />
                      <span className="text-slate-600 text-xs">×</span>
                      <input placeholder="reps" className="w-8 bg-transparent text-center font-bold text-white text-xs outline-none" />
                      <input placeholder="RIR" className="w-8 bg-transparent text-center font-bold text-emerald-400 text-xs outline-none" />
                    </div>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};