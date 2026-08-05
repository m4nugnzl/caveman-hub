'use client'

import React, { useState, useEffect, use } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

interface Cliente {
  id: string
  nombre: string
  whatsapp: string
  sexo?: 'Hombre' | 'Mujer'
}

interface RegistroAntropometrico {
  id?: string
  fecha: string
  peso: number
  tricipital: number
  subescapular: number
  abdominal: number
  suprailiaco: number
  muslo: number
  pantorrilla: number
  pecho: number
  brazo_izq: number
  brazo_dcho: number
  ombligo: number
  gluteo: number
  muslo_izq: number
  muslo_dcho: number
  gemelo_izq: number
  gemelo_dcho: number
}

export default function ClienteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: clienteId } = use(params)
  const supabase = createClient()

  const [activeTab, setActiveTab] = useState<'resumen' | 'rutina' | 'antropometria' | 'nutricion'>('resumen')
  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [registros, setRegistros] = useState<RegistroAntropometrico[]>([])
  const [loading, setLoading] = useState(true)

  // Formulario Antropométrico
  const [nuevoRegistro, setNuevoRegistro] = useState<RegistroAntropometrico>({
    fecha: new Date().toISOString().split('T')[0],
    peso: 80,
    tricipital: 0, subescapular: 0, abdominal: 0, suprailiaco: 0, muslo: 0, pantorrilla: 0,
    pecho: 0, brazo_izq: 0, brazo_dcho: 0, ombligo: 0, gluteo: 0, muslo_izq: 0, muslo_dcho: 0, gemelo_izq: 0, gemelo_dcho: 0
  })

  useEffect(() => {
    cargarDatos()
  }, [clienteId])

  async function cargarDatos() {
    setLoading(true)

    // Cargar Cliente
    const { data: dataCliente } = await supabase.from('clientes').select('*').eq('id', clienteId).single()
    if (dataCliente) setCliente(dataCliente)

    // Cargar Antropometría
    const { data: dataAntropometria } = await supabase
      .from('antropometria')
      .select('*')
      .eq('cliente_id', clienteId)
      .order('fecha', { ascending: false })

    if (dataAntropometria) setRegistros(dataAntropometria)

    setLoading(false)
  }

  // Cálculo de Porcentaje Graso según Pliegues Cutáneos
  const sumaPliegues = 
    (Number(nuevoRegistro.tricipital) || 0) +
    (Number(nuevoRegistro.subescapular) || 0) +
    (Number(nuevoRegistro.abdominal) || 0) +
    (Number(nuevoRegistro.suprailiaco) || 0) +
    (Number(nuevoRegistro.muslo) || 0) +
    (Number(nuevoRegistro.pantorrilla) || 0)

  const porcentajeGraso = sumaPliegues > 0 
    ? (cliente?.sexo === 'Mujer' 
        ? (3.5803 + (sumaPliegues * 0.1548)).toFixed(1)
        : (2.59 + (sumaPliegues * 0.1051)).toFixed(1))
    : null

  async function handleGuardarAntropometria(e: React.FormEvent) {
    e.preventDefault()
    const { error } = await supabase.from('antropometria').insert([
      { ...nuevoRegistro, cliente_id: clienteId }
    ])

    if (!error) {
      alert('Registro antropométrico guardado con éxito.')
      cargarDatos()
    } else {
      alert('Error al guardar registro: ' + error.message)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-400 flex items-center justify-center font-sans">
        Cargando FitCoach Hub...
      </div>
    )
  }

  const ultimoPeso = registros.length > 0 ? registros[0].peso : '--'

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-12">
      
      {/* Barra de Encabezado Superior */}
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-3 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-emerald-400 font-bold text-lg flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-emerald-400 inline-block"></span> FitCoach Hub
          </Link>
          <span className="text-xs text-slate-500">| Panel de Gestión Elite</span>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1 rounded-full font-medium">
            ● AL DÍA
          </span>
          <span className="bg-slate-800 text-slate-300 px-3 py-1 rounded-full font-semibold border border-slate-700">
            {ultimoPeso} KG
          </span>
        </div>
      </header>

      {/* Selector de Navegación por Pestañas (Tabs) */}
      <nav className="border-b border-slate-800 bg-slate-900/50 px-6 pt-4">
        <div className="max-w-6xl mx-auto flex gap-2">
          <button
            onClick={() => setActiveTab('resumen')}
            className={`px-4 py-2.5 text-xs font-semibold rounded-t-lg transition border-t border-x ${
              activeTab === 'resumen'
                ? 'bg-slate-950 text-emerald-400 border-slate-800 border-b-slate-950'
                : 'text-slate-400 border-transparent hover:text-white'
            }`}
          >
            📊 Resumen & Volumen
          </button>
          <button
            onClick={() => setActiveTab('rutina')}
            className={`px-4 py-2.5 text-xs font-semibold rounded-t-lg transition border-t border-x ${
              activeTab === 'rutina'
                ? 'bg-slate-950 text-emerald-400 border-slate-800 border-b-slate-950'
                : 'text-slate-400 border-transparent hover:text-white'
            }`}
          >
            🏋️ Rutina & Microciclos
          </button>
          <button
            onClick={() => setActiveTab('antropometria')}
            className={`px-4 py-2.5 text-xs font-semibold rounded-t-lg transition border-t border-x ${
              activeTab === 'antropometria'
                ? 'bg-slate-950 text-emerald-400 border-slate-800 border-b-slate-950'
                : 'text-slate-400 border-transparent hover:text-white'
            }`}
          >
            📏 Antropometría & % Graso
          </button>
          <button
            onClick={() => setActiveTab('nutricion')}
            className={`px-4 py-2.5 text-xs font-semibold rounded-t-lg transition border-t border-x ${
              activeTab === 'nutricion'
                ? 'bg-slate-950 text-emerald-400 border-slate-800 border-b-slate-950'
                : 'text-slate-400 border-transparent hover:text-white'
            }`}
          >
            🥗 Nutrición & Hábitos
          </button>
        </div>
      </nav>

      {/* Contenido Principal por Pestaña */}
      <main className="max-w-6xl mx-auto p-6 space-y-6">

        {/* Header Nombre Atleta */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight">{cliente?.nombre}</h1>
            <p className="text-xs text-slate-400 mt-1">Plan de Entrenamiento y Nutrición Activo</p>
          </div>
          <div className="flex gap-4">
            <div className="bg-slate-950 border border-slate-800 p-3 rounded-lg text-center min-w-[100px]">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">Peso Actual</p>
              <p className="text-xl font-bold text-emerald-400 mt-0.5">{ultimoPeso} kg</p>
            </div>
            <div className="bg-slate-950 border border-slate-800 p-3 rounded-lg text-center min-w-[100px]">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">Tonelaje Sem.</p>
              <p className="text-xl font-bold text-cyan-400 mt-0.5">10,208 kg</p>
            </div>
          </div>
        </div>

        {/* PESTAÑA 1: RESUMEN Y VOLUMEN MUSCULAR */}
        {activeTab === 'resumen' && (
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl">
              <h3 className="text-sm font-bold text-slate-200 mb-4">Análisis Gráfico — Series Efectivas por Grupo Muscular</h3>
              <div className="space-y-3">
                {[
                  { musculo: 'Tríceps', series: 6, max: 18, color: 'bg-indigo-500' },
                  { musculo: 'Pecho', series: 5, max: 20, color: 'bg-rose-500' },
                  { musculo: 'Isquiotibiales', series: 5, max: 16, color: 'bg-cyan-500' },
                  { musculo: 'Dorsal', series: 3, max: 22, color: 'bg-emerald-500' },
                  { musculo: 'Cuádriceps', series: 3, max: 20, color: 'bg-lime-500' },
                  { musculo: 'Deltoides Posterior', series: 2, max: 22, color: 'bg-teal-500' },
                ].map((item) => (
                  <div key={item.musculo} className="flex items-center text-xs gap-3">
                    <span className="w-32 text-slate-300 font-medium">{item.musculo}</span>
                    <div className="flex-1 bg-slate-950 h-5 rounded-md overflow-hidden p-0.5 border border-slate-800">
                      <div
                        className={`${item.color} h-full rounded text-[10px] font-bold text-slate-950 flex items-center justify-end pr-2`}
                        style={{ width: `${(item.series / item.max) * 100}%` }}
                      >
                        {item.series}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* PESTAÑA 2: RUTINA */}
        {activeTab === 'rutina' && (
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl text-center text-slate-400">
            <p className="text-sm">Gestor interactivo de Microciclos y Rutina activo.</p>
          </div>
        )}

        {/* PESTAÑA 3: ANTROPOMETRÍA & CHECK-IN */}
        {activeTab === 'antropometria' && (
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl">
              <h2 className="text-lg font-bold text-white mb-4">⚖️ Nuevo Registro Antropométrico & Check-in</h2>
              <form onSubmit={handleGuardarAntropometria} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Fecha</label>
                    <input
                      type="date"
                      value={nuevoRegistro.fecha}
                      onChange={e => setNuevoRegistro({...nuevoRegistro, fecha: e.target.value})}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Peso Corporal (kg)</label>
                    <input
                      type="number"
                      step="0.1"
                      value={nuevoRegistro.peso}
                      onChange={e => setNuevoRegistro({...nuevoRegistro, peso: parseFloat(e.target.value) || 0})}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-sm text-white"
                    />
                  </div>
                </div>

                {/* Pliegues Cutáneos */}
                <div>
                  <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-3">Pliegues Cutáneos (mm)</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {[
                      { label: 'Tricipital', key: 'tricipital' },
                      { label: 'Subescapular', key: 'subescapular' },
                      { label: 'Abdominal', key: 'abdominal' },
                      { label: 'Suprailíaco', key: 'suprailiaco' },
                      { label: 'Muslo', key: 'muslo' },
                      { label: 'Pantorrilla', key: 'pantorrilla' }
                    ].map((item) => (
                      <div key={item.key}>
                        <label className="block text-[11px] text-slate-400 mb-1">{item.label}</label>
                        <input
                          type="number"
                          step="0.1"
                          onChange={e => setNuevoRegistro({...nuevoRegistro, [item.key]: parseFloat(e.target.value) || 0})}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-white"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Perímetros Corporales */}
                <div>
                  <h3 className="text-xs font-bold text-cyan-400 uppercase tracking-wider mb-3">Perímetros Corporales (cm)</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      { label: 'Pecho', key: 'pecho' },
                      { label: 'Brazo Dcho.', key: 'brazo_dcho' },
                      { label: 'Brazo Izq.', key: 'brazo_izq' },
                      { label: 'Ombligo', key: 'ombligo' },
                      { label: 'Glúteo', key: 'gluteo' },
                      { label: 'Muslo Dcho.', key: 'muslo_dcho' },
                      { label: 'Gemelo Dcho.', key: 'gemelo_dcho' }
                    ].map((item) => (
                      <div key={item.key}>
                        <label className="block text-[11px] text-slate-400 mb-1">{item.label}</label>
                        <input
                          type="number"
                          step="0.1"
                          onChange={e => setNuevoRegistro({...nuevoRegistro, [item.key]: parseFloat(e.target.value) || 0})}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-xs text-white"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Resultado Estimación % Graso */}
                <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl flex justify-between items-center">
                  <div>
                    <p className="text-xs text-slate-400">Suma 6 Pliegues: <strong className="text-white">{sumaPliegues} mm</strong></p>
                    <p className="text-xs text-slate-400 mt-0.5">Fórmula estimada para hombres/mujeres activa</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500 uppercase">Estimación % Graso</p>
                    <p className="text-2xl font-extrabold text-emerald-400">{porcentajeGraso ? `${porcentajeGraso}%` : '—'}</p>
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-3 rounded-lg text-sm transition"
                >
                  Guardar Check-in Antropométrico
                </button>
              </form>
            </div>
          </div>
        )}

        {/* PESTAÑA 4: NUTRICIÓN */}
        {activeTab === 'nutricion' && (
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl text-center text-slate-400">
            <p className="text-sm">Sección de Planes Nutricionales, Macros y Hábitos.</p>
          </div>
        )}

      </main>
    </div>
  )
}