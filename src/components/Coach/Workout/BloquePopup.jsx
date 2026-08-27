import { useState } from 'react';
import { ArrowDown, ArrowUp, ChevronLeft, Plus, Trash2 } from 'lucide-react';

import { blocksOf, isCurrentBlock, structureOfBlock, weeksOfBlock } from '@/domain/blocks';
import { executedSessions, sessionTonnage } from '@/domain/sessions';
import { WEEK_DAYS, findMicrocycle, isRestDay, rotatingSlots, unitLabel, unitLabelPlural } from '@/domain/training';
import { localeNumber, shortDate } from '@/lib/dates';
import { Modal } from '@/components/ui/Modal';
import { CycleChain } from '@/components/ui/CycleChain';

/**
 * El bloque, entero y de un vistazo — y su estructura, en la pantalla de al lado.
 *
 * ══ Qué es un bloque, dicho aquí ═══════════════════════════════════════════
 * Una ESTRUCTURA —qué días de entreno hay, cómo se llaman, en qué orden, y
 * cómo se reparten en la semana o en el ciclo— y las SEMANAS que la repiten.
 * Cambiar la estructura de verdad es abrir otro bloque; ajustarla (renombrar
 * un día, reordenar, añadir o quitar uno) se hace aquí y vale para todas las
 * semanas del bloque a la vez.
 *
 * ── Dos pantallas, no una pila ──────────────────────────────────────────────
 * La primera MIRA: nombre, cifras, ciclo, días, semanas con su tonelaje. La
 * segunda EDITA la estructura. Se desliza a la izquierda y se vuelve con la
 * flecha: la ventana no crece, cambia de pantalla.
 */
const n = (v) => localeNumber(v || 0);

export const BloquePopup = ({
  open,
  onClose,
  program,
  cliente,
  bloqueInicial,
  semanaAbierta,
  semanaEnCurso,
  onIr,
  onRenombrar,
  onFecha = null,
  ajustesDelCiclo = null,
  onRenombrarDia,
  onMoverDia,
  onAnadirDia,
  onQuitarDia,
  onNuevoBloque = null,
  vistaInicial = 'resumen',
}) => {
  const bloques = blocksOf(program);
  const [elegidoId, setElegidoId] = useState(null);
  const [vista, setVista] = useState(vistaInicial);
  const [nuevoDia, setNuevoDia] = useState('');
  const bloque = bloques.find((b) => b.id === elegidoId) || bloqueInicial || bloques[bloques.length - 1];
  const esActual = isCurrentBlock(program, bloque);
  const semanas = weeksOfBlock(program, bloque);
  const microcycles = program?.microcycles || [];
  const unidad = unitLabel(cliente?.cycleType || 'weekly');
  const unidades = unitLabelPlural(cliente?.cycleType || 'weekly');
  const rotativo = (cliente?.cycleType || 'weekly') === 'rotating';
  const estructura = structureOfBlock(program, bloque);

  const referencia = findMicrocycle(microcycles, semanas[semanas.length - 1]) || null;
  const dias = referencia?.days || [];

  const porSemana = semanas.map((w) => {
    const micro = findMicrocycle(microcycles, w) || {};
    const hechas = executedSessions(micro);
    const kg = hechas.reduce((acc, s) => acc + sessionTonnage(s), 0);
    return { w, micro, sesiones: hechas.length, kg, planificadas: (micro.days || []).length };
  });
  const maxKg = Math.max(1, ...porSemana.map((s) => s.kg));
  const totalKg = porSemana.reduce((acc, s) => acc + s.kg, 0);
  const totalSesiones = porSemana.reduce((acc, s) => acc + s.sesiones, 0);
  const totalPlanificadas = porSemana.reduce((acc, s) => acc + s.planificadas, 0);
  const primera = findMicrocycle(microcycles, semanas[0])?.date;

  const cerrar = () => {
    setVista('resumen');
    onClose();
  };

  return (
    <Modal
      open={open}
      size="lg"
      title={
        vista === 'estructura' ? (
          <button type="button" className="bloque-volver" onClick={() => setVista('resumen')}>
            <ChevronLeft size={16} aria-hidden="true" /> {bloque.name}
          </button>
        ) : (
          'Bloque'
        )
      }
      onClose={cerrar}
    >
      <div className={`bloque-track${vista === 'estructura' ? ' is-estructura' : ''}`}>
        {/* ── Pantalla 1: mirar ─────────────────────────────────────────── */}
        <div className="bloque bloque-pantalla" aria-hidden={vista !== 'resumen'}>
          {bloques.length > 1 && (
            <nav className="bloque-tabs" aria-label="Bloques">
              {bloques.map((b) => (
                <button key={b.id} type="button" className={`bloque-tab${b.id === bloque.id ? ' is-on' : ''}`} aria-pressed={b.id === bloque.id} onClick={() => setElegidoId(b.id)}>
                  {b.name}
                  <small>{weeksOfBlock(program, b).length} {unidades}</small>
                </button>
              ))}
            </nav>
          )}

          <header className="bloque-cab">
            <div className="bloque-nombre">
              <input
                key={bloque.id}
                className="bloque-nombre-input"
                defaultValue={bloque.name}
                aria-label="Nombre del bloque"
                onBlur={(e) => {
                  const nombre = e.target.value.trim();
                  if (nombre && nombre !== bloque.name) onRenombrar(bloque.id, nombre);
                }}
              />
              <span className="bloque-sub">
                {esActual ? 'Bloque abierto' : 'Bloque cerrado'}
                {primera && ` · desde el ${shortDate(primera)}`}
              </span>
            </div>
            <div className="bloque-cifras">
              <div className="bloque-cifra"><span className="v">{semanas.length}</span><span className="k">{semanas.length === 1 ? unidad.toLowerCase() : unidades}</span></div>
              <div className="bloque-cifra"><span className="v">{n(totalKg)}</span><span className="k">kg levantados</span></div>
              <div className="bloque-cifra"><span className="v">{totalSesiones}<small>/{totalPlanificadas}</small></span><span className="k">sesiones hechas</span></div>
              <div className="bloque-cifra"><span className="v">{dias.length}</span><span className="k">{dias.length === 1 ? 'día de entreno' : 'días de entreno'}</span></div>
            </div>
          </header>

          <section className="bloque-seccion">
            <div className="row between wrap gap-2">
              <h3 className="bloque-titulo">Estructura</h3>
              {esActual && (
                <span className="row gap-2">
                  <button type="button" className="btn btn-quiet btn-sm" onClick={() => setVista('estructura')}>
                    Editar la estructura
                  </button>
                  {onNuevoBloque && (
                    <button type="button" className="btn btn-quiet btn-sm" onClick={() => { cerrar(); onNuevoBloque(); }} title="Cierra este bloque y abre el siguiente">
                      Nuevo bloque…
                    </button>
                  )}
                </span>
              )}
            </div>
            {rotativo ? (
              <CycleChain slots={rotatingSlots(cliente?.cyclePattern, dias)} />
            ) : (
              <div className="bloque-semana-natural">
                {WEEK_DAYS.map((d) => {
                  const v = estructura.weeklySplit?.[d];
                  const descanso = !v || isRestDay(v);
                  return (
                    <div key={d} className={`bloque-dia-natural${descanso ? ' is-descanso' : ''}`}>
                      <span className="k">{d.slice(0, 3)}</span>
                      <span className="v">{descanso ? 'Descanso' : v}</span>
                    </div>
                  );
                })}
              </div>
            )}
            {dias.length > 0 && (
              <ul className="bloque-dias">
                {dias.map((day) => {
                  const ejercicios = day.exercises || [];
                  const series = ejercicios.reduce((acc, ex) => acc + (ex.sets?.length || 0), 0);
                  return (
                    <li key={day.dayName} className="bloque-dia">
                      <span className="bloque-dia-nombre">{day.dayName}</span>
                      <span className="bloque-dia-meta">
                        {ejercicios.length} {ejercicios.length === 1 ? 'ejercicio' : 'ejercicios'} · {series} series
                        {(day.mobilityDrills || []).length > 0 && ' · calentamiento'}
                      </span>
                      <span className="bloque-dia-lista">{ejercicios.map((ex) => ex.name).join(' · ')}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="bloque-seccion">
            <h3 className="bloque-titulo">{unidades}</h3>
            {porSemana.length === 0 ? (
              <p className="t-sm t-tertiary">Todavía no tiene ninguna montada.</p>
            ) : (
              <ol className="bloque-semanas">
                {porSemana.map(({ w, micro, sesiones, kg, planificadas }) => {
                  const estado = w === semanaEnCurso ? 'en curso' : sesiones > 0 ? 'hecha' : 'montada';
                  const ir = () => {
                    onIr(w);
                    cerrar();
                  };
                  return (
                    <li key={w}>
                      <div
                        role="button"
                        tabIndex={0}
                        className={`bloque-semana${w === semanaAbierta ? ' is-on' : ''}${w === semanaEnCurso ? ' is-curso' : ''}`}
                        onClick={ir}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            ir();
                          }
                        }}
                        title={`Abrir ${unidad.toLowerCase()} ${w}`}
                      >
                        <span className="bloque-semana-n">{unidad.charAt(0)}{w - bloque.fromWeek + 1}</span>
                        <span className="bloque-semana-estado">{estado}</span>
                        {esActual && onFecha ? (
                          <input
                            type="date"
                            className="bloque-semana-fecha is-editable"
                            value={micro.date || ''}
                            aria-label={`Fecha de inicio de ${unidad.toLowerCase()} ${w}`}
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => e.stopPropagation()}
                            onChange={(e) => onFecha(w, e.target.value)}
                          />
                        ) : (
                          <span className="bloque-semana-fecha">{micro.date ? shortDate(micro.date) : ''}</span>
                        )}
                        <span className="bloque-semana-barra" aria-hidden="true">
                          <span style={{ width: `${(kg / maxKg) * 100}%` }} />
                        </span>
                        <span className="bloque-semana-kg">{kg > 0 ? `${n(kg)} kg` : '—'}</span>
                        <span className="bloque-semana-ses">{sesiones}/{planificadas}</span>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </div>

        {/* ── Pantalla 2: editar la estructura ──────────────────────────── */}
        <div className="bloque bloque-pantalla" aria-hidden={vista !== 'estructura'}>
          <header className="bloque-cab">
            <div className="bloque-nombre">
              <span className="bloque-titulo">Estructura de {bloque.name}</span>
              <span className="bloque-sub">
                Vale para todas sus {unidades}: renombrar u ordenar un día lo cambia en las {semanas.length} a la vez. Si la estructura cambia de verdad, abre un bloque nuevo desde «+ {unidad.toLowerCase()}».
              </span>
            </div>
          </header>

          <section className="bloque-seccion">
            <h3 className="bloque-titulo">Días de entreno</h3>
            <ol className="bloque-editar-dias">
              {dias.map((day, index) => (
                <li key={day.dayName} className="bloque-editar-dia">
                  <span className="bloque-editar-n">{index + 1}</span>
                  <input
                    className="bloque-editar-nombre"
                    defaultValue={day.dayName}
                    aria-label={`Nombre del día ${index + 1}`}
                    onBlur={(e) => {
                      const nombre = e.target.value.trim();
                      if (nombre && nombre !== day.dayName) onRenombrarDia(day.dayName, nombre);
                    }}
                  />
                  <span className="bloque-editar-meta">
                    {(day.exercises || []).length} {(day.exercises || []).length === 1 ? 'ejercicio' : 'ejercicios'}
                  </span>
                  <span className="bloque-editar-acciones">
                    <button type="button" className="btn btn-icon btn-icon-compact" disabled={index === 0} aria-label="Subir" onClick={() => onMoverDia(index, index - 1)}>
                      <ArrowUp size={13} />
                    </button>
                    <button type="button" className="btn btn-icon btn-icon-compact" disabled={index === dias.length - 1} aria-label="Bajar" onClick={() => onMoverDia(index, index + 1)}>
                      <ArrowDown size={13} />
                    </button>
                    <button type="button" className="btn btn-icon btn-icon-compact btn-icon-danger hoja-papelera" aria-label={`Quitar «${day.dayName}»`} onClick={() => onQuitarDia(day.dayName)}>
                      <Trash2 size={13} />
                    </button>
                  </span>
                </li>
              ))}
            </ol>
            <form
              className="bloque-editar-alta"
              onSubmit={(e) => {
                e.preventDefault();
                const nombre = nuevoDia.trim();
                if (!nombre) return;
                onAnadirDia(nombre);
                setNuevoDia('');
              }}
            >
              <input className="input input-sm" value={nuevoDia} placeholder="Nuevo día (p. ej. Legs C)" aria-label="Nombre del nuevo día" onChange={(e) => setNuevoDia(e.target.value)} />
              <button type="submit" className="btn btn-quiet btn-sm" disabled={!nuevoDia.trim()}>
                <Plus size={13} /> Añadir día
              </button>
            </form>
          </section>

          {ajustesDelCiclo && (
            <section className="bloque-seccion">
              <h3 className="bloque-titulo">{rotativo ? 'El ciclo' : 'La semana'}</h3>
              {ajustesDelCiclo}
            </section>
          )}
        </div>
      </div>
    </Modal>
  );
};
