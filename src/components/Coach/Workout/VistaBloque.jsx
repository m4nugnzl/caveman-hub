import { useState } from 'react';
import { ArrowLeft, ArrowRight, GripVertical, Layers, Pencil, Plus, RotateCw, Trash2, Wand2 } from 'lucide-react';

import {
  blockPlan,
  blockSummary,
  fillableWeeksOfDay,
  isCurrentBlock,
  structureOfBlock,
  untrainedWeeksOfDay,
  weeksOfBlock,
} from '@/domain/blocks';
import { MRV_GOALS, MUSCLE_GROUPS, WEEK_DAYS, buildExercise, findMicrocycle, isRestDay, rotatingSlots } from '@/domain/training';
import { executedSessions, resumenDeEntrada, sessionSetCount, ultimaSesionDeHoja } from '@/domain/sessions';
import { metricColor } from '@/domain/metrics';
import { localeNumber, weekdayName } from '@/lib/dates';
import { clampInt } from '@/lib/num';
import { Autocomplete } from '@/components/ui/Autocomplete';
import { MenuAcciones } from '@/components/ui/MenuAcciones';
import { EmptyState, RenombrarEnSitio, SegmentedControl } from '@/components/ui/primitives';
import { HistorialPopup } from './HistorialPopup';
import { VolumenPopup } from './VolumenPopup';
import { LineaDeBloques } from './LineaDeBloques';
import { WeeklySplitEditor } from './WeeklySplitEditor';

/**
 * EL BLOQUE: el plan a la izquierda, con qué se juzga a la derecha.
 *
 * ══ Los bloques como LÍNEA DE TIEMPO ═══════════════════════════════════════
 * Un programa es una sucesión de bloques, y cada bloque una sucesión de
 * semanas. Eso se dibuja, no se lista: arriba del plan va la línea entera —un
 * tramo por bloque, ancho según sus semanas, y dentro una marca por semana que
 * dice si se entrenó, si está en curso o si está por hacer—. Pulsar un tramo
 * viaja a ese bloque; pulsar una marca del abierto entra en esa semana. Es el
 * mapa del entrenamiento de esta persona y el mando para moverse por él, en
 * el mismo objeto, y vive en el plan porque es del plan: cambiar de bloque no
 * es consultar una cifra.
 *
 * ══ El costado: con qué se juzga ═══════════════════════════════════════════
 * Dos tarjetas con la cabecera de las laterales (`lado-cab`, la misma que
 * `ComparativaEjercicio` y `MacroTargetCard`): las cifras del bloque, cuyo
 * título abre el historial entero con su gráfica; y el volumen por grupo
 * contra el MRV, cuyo título abre la lista completa.
 *
 * ══ Todas las hojas, siempre ═══════════════════════════════════════════════
 * Las hojas se reparten el ancho y, si no caben, pasan a otra fila: nunca un
 * carril con desplazamiento que deje la sexta fuera. Se ordenan arrastrando
 * por el asa —la hoja entera, o un ejercicio dentro de su hoja—, con el mismo
 * gesto y las mismas marcas que la hoja de series.
 *
 * ══ Hoja, y no «sesión» ════════════════════════════════════════════════════
 * Cada día de entreno es una HOJA. Lo ejecutado se llama ENTRENAMIENTO: en
 * rotativo «sesión» ya es la vuelta al ciclo.
 */

const NUEVO = { name: '', muscle: 'Pecho', series: '3', reps: '8-10' };
const GRUPOS_A_LA_VISTA = 6;

/** «3 semanas», «1 hoja»… */
const cuenta = (n, singular, plural) => `${n} ${n === 1 ? singular : plural}`;

/**
 * El alta DENTRO de la hoja: se escribe donde va el ejercicio.
 *
 * No se cierra tras añadir: lo normal es meter cinco seguidos y cerrarla cada
 * vez sería pedir cinco clics de más. Se cierra con Escape o con «Listo».
 */
const AltaEnHoja = ({ dayName, library, onAdd, onRecordar, onCerrar }) => {
  const [form, setForm] = useState(NUEVO);
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const enviar = (event) => {
    event.preventDefault();
    const name = form.name.trim();
    if (!name) return;
    onAdd(buildExercise({ name, muscle: form.muscle, numSets: clampInt(form.series, 1, 12, 3), targetReps: form.reps.trim() }));
    onRecordar(name, form.muscle);
    setForm({ ...NUEVO, muscle: form.muscle });
  };

  return (
    <form className="plan-alta" onSubmit={enviar} onKeyDown={(e) => e.key === 'Escape' && onCerrar()}>
      <Autocomplete
        value={form.name}
        onChange={(value) => set('name', value)}
        items={library}
        getMeta={(item) => (item.fromCatalog ? `${item.muscle} · del catálogo` : item.muscle)}
        onPick={(item) => setForm((f) => ({ ...f, name: item.name, muscle: item.muscle || f.muscle }))}
        placeholder="Ejercicio"
        inputProps={{ autoFocus: true, 'aria-label': `Nombre del ejercicio nuevo de ${dayName}` }}
      />
      <select className="select select-sm" value={form.muscle} aria-label="Músculo principal" onChange={(e) => set('muscle', e.target.value)}>
        {MUSCLE_GROUPS.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      <div className="plan-alta-pie">
        <input className="plan-series" inputMode="numeric" value={form.series} aria-label="Número de series" onChange={(e) => set('series', e.target.value)} />
        <span className="plan-por" aria-hidden="true">
          ×
        </span>
        <input className="plan-reps" value={form.reps} aria-label="Repeticiones objetivo" placeholder="8-10" onChange={(e) => set('reps', e.target.value)} />
        <button type="submit" className="btn btn-primary btn-sm" disabled={!form.name.trim()}>
          Añadir
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onCerrar}>
          Listo
        </button>
      </div>
    </form>
  );
};

/* ══ LA LÍNEA DE TIEMPO ══ vive en `LineaDeBloques.jsx`: la usan el plan del
   entrenador y el portal del cliente, con y sin poder tocarla. ═══════════ */

/* ══ EL VOLUMEN ══════════════════════════════════════════════════════════════ */

/** Las series por grupo del bloque entero, de más a menos, con su MRV. */
const volumenPorGrupo = (hojas) =>
  [...new Set(hojas.flatMap((h) => Object.keys(h.volumen)))]
    .map((name) => ({
      name,
      valor: hojas.reduce((n, h) => n + (h.volumen[name] || 0), 0),
      mrv: MRV_GOALS[name]?.mrv ?? null,
    }))
    .filter((m) => m.valor > 0)
    .sort((a, b) => b.valor - a.valor);

/**
 * Las mismas barras que el Resumen y «Cómo lo lleva»: un valor sobre su tope,
 * la cifra a la derecha, y en negativo solo lo que se pasa.
 */
const BarrasVolumen = ({ grupos }) => {
  const tope = Math.max(1, ...grupos.map((m) => m.mrv || m.valor));
  return (
    <div className="subjetivo is-volumen">
      {grupos.map((m) => {
        const pasado = Boolean(m.mrv) && m.valor > m.mrv;
        return (
          <div className="subjetivo-fila" key={m.name} title={m.mrv ? `${m.name}: ${m.valor} series de un MRV estimado de ${m.mrv}` : m.name}>
            <span className="subjetivo-k">{m.name}</span>
            <span className="subjetivo-barra" aria-hidden="true">
              <span
                className="subjetivo-relleno"
                style={{ width: `${Math.min(100, (m.valor / (m.mrv || tope)) * 100)}%`, background: pasado ? 'var(--negative)' : metricColor('sets') }}
              />
            </span>
            <span className="subjetivo-v" style={pasado ? { color: 'var(--negative)' } : undefined}>
              {m.valor}
              {m.mrv && <small>/{m.mrv}</small>}
            </span>
          </div>
        );
      })}
    </div>
  );
};

const TarjetaVolumen = ({ grupos, unidad, onAmpliar }) => {
  const pasados = grupos.filter((m) => m.mrv && m.valor > m.mrv).length;
  return (
    <section className="lado-tarjeta" aria-label="Volumen por grupo">
      <div className="lado-cab">
        <span className="section-label">Volumen por {unidad.toLowerCase()}</span>
        <div className="lado-cab-fila">
          <button type="button" className="lado-titulo" onClick={onAmpliar} disabled={grupos.length === 0} title="Todos los grupos contra su MRV">
            {cuenta(grupos.length, 'grupo', 'grupos')}
          </button>
          {pasados > 0 && (
            <span className="lado-aviso" title="Grupos por encima de su MRV estimado">
              {pasados} sobre el MRV
            </span>
          )}
        </div>
      </div>
      {grupos.length === 0 ? (
        <p className="t-sm t-tertiary">Sin ejercicios todavía.</p>
      ) : (
        <>
          <BarrasVolumen grupos={grupos.slice(0, GRUPOS_A_LA_VISTA)} />
          {grupos.length > GRUPOS_A_LA_VISTA && (
            <button type="button" className="lado-mas" onClick={onAmpliar}>
              y {grupos.length - GRUPOS_A_LA_VISTA} más
            </button>
          )}
        </>
      )}
    </section>
  );
};

/* ══ EL BLOQUE EN CIFRAS ═════════════════════════════════════════════════════ */

const TarjetaCifras = ({ resumen, unidad, unidades, onAmpliar }) => (
  <section className="lado-tarjeta" aria-label="El bloque en cifras">
    <div className="lado-cab">
      <span className="section-label">Este bloque</span>
      <div className="lado-cab-fila">
        <button type="button" className="lado-titulo" onClick={onAmpliar} title="El historial de todos los bloques, con su gráfica">
          {cuenta(resumen.semanas, unidad.toLowerCase(), unidades)}
        </button>
      </div>
    </div>
    <div className="bloque-cifras is-2">
      <div className="bloque-cifra">
        <span className="v">{resumen.series ?? '—'}</span>
        <span className="k">series por {unidad.toLowerCase()}</span>
      </div>
      <div className="bloque-cifra">
        <span className="v">{localeNumber(resumen.kg)}</span>
        <span className="k">kg levantados</span>
      </div>
      <div className="bloque-cifra">
        <span className="v">
          {resumen.hechas}
          <small>/{resumen.planificadas}</small>
        </span>
        {/* «Entrenamientos» y no «sesiones»: en rotativo una sesión es la
            vuelta al ciclo, y las dos palabras juntas no se distinguen. */}
        <span className="k">entrenamientos</span>
      </div>
      <div className="bloque-cifra">
        <span className="v">{resumen.adherencia === null ? '—' : `${resumen.adherencia}%`}</span>
        <span className="k">de lo pautado</span>
      </div>
    </div>
  </section>
);

/* ══ LA VISTA ════════════════════════════════════════════════════════════════ */

export const VistaBloque = ({
  program,
  cliente,
  bloque,
  semanaEnCurso,
  library,
  onAbrirHoja,
  onIrSemana,
  onIrBloque,
  onFechaSemana,
  onRenombrarBloque,
  onNuevaSemana,
  onNuevoBloque,
  onAnadirEjercicio,
  onQuitarEjercicio,
  onMoverEjercicio,
  onSeries,
  onReps,
  onAnadirHoja,
  onRenombrarHoja,
  onQuitarHoja,
  onMoverHoja,
  onRellenar,
  onRecordarEjercicio,
  onSplit,
  onAjustes,
}) => {
  const [nuevaHoja, setNuevaHoja] = useState(null);
  const [renombrando, setRenombrando] = useState(null);
  const [altaEn, setAltaEn] = useState(null);
  const [ventana, setVentana] = useState(null); // 'historial' | 'volumen'
  /*
    ── Dos densidades: leer y trabajar ──────────────────────────────────────
    Programar veinte series de un tirón y repasar el plan con calma piden aires
    distintos. «Compacta» encoge filas y letra para meter más hoja en pantalla;
    se recuerda en este navegador, como la guía de Inicio, porque es una
    preferencia de la mesa de trabajo, no un dato del cliente.
  */
  const [densidad, setDensidad] = useState(() => {
    try {
      return localStorage.getItem('caveman-densidad-hoja') === 'compacta' ? 'compacta' : 'comoda';
    } catch {
      return 'comoda';
    }
  });
  const cambiarDensidad = (id) => {
    setDensidad(id);
    try {
      localStorage.setItem('caveman-densidad-hoja', id);
    } catch {
      /* Sin almacenamiento, la preferencia dura la sesión. Suficiente. */
    }
  };
  /*
    El arrastre: qué viaja —una hoja entera o un ejercicio dentro de la suya—
    y sobre qué está. El mismo `draggable` de la hoja de series: el asa
    arranca, la pieza de destino recibe. Un ejercicio solo se suelta dentro de
    su hoja; moverlo a otra sería otro ejercicio en otro día.
  */
  const [arrastre, setArrastre] = useState(null); // { tipo: 'hoja'|'ej', hoja, index }
  const [sobre, setSobre] = useState(null); // { tipo, hoja, index }

  const plan = blockPlan(program, bloque);
  const esActual = isCurrentBlock(program, bloque);
  const cycleType = cliente?.cycleType || 'weekly';
  const rotativo = cycleType === 'rotating';
  /* La unidad del bloque: la SEMANA natural o el CICLO —una vuelta al patrón—.
     No «sesión»: en la hoja de series una sesión es un entrenamiento, y «109
     series por sesión» era mentira. Son por ciclo. */
  const unidad = rotativo ? 'Ciclo' : 'Semana';
  const unidades = rotativo ? 'ciclos' : 'semanas';
  const estructura = structureOfBlock(program, bloque);
  const resumen = blockSummary(program, bloque);
  const grupos = volumenPorGrupo(plan.sessions);

  /*
    La estructura, dicha en una línea al lado de su editor. En rotativo el
    editor es la cadena del patrón —donde caen los descansos—.
  */
  const slots = rotativo ? rotatingSlots(cliente?.cyclePattern, plan.sessions.map((s) => ({ dayName: s.dayName }))) : [];
  const descansos = slots.filter((s) => s.rest).length;
  const split = estructura.weeklySplit || {};
  const diasDeEntreno = WEEK_DAYS.filter((d) => !isRestDay(split[d])).length;
  const estructuraTexto = rotativo
    ? `ciclo de ${cuenta(slots.length, 'día', 'días')} · ${slots.length - descansos} de entreno, ${descansos} de descanso`
    : `${diasDeEntreno} de entreno, ${7 - diasDeEntreno} de descanso`;

  /* Cuándo cae cada hoja: los días de la semana que la llevan, o su sitio en el ciclo. */
  const cuandoCae = (dayName) => {
    if (rotativo) return slots.find((s) => !s.rest && s.name === dayName)?.lead || null;
    const dias = WEEK_DAYS.filter((d) => split[d] === dayName).map((d) => d.slice(0, 3));
    return dias.length > 0 ? dias.join(' · ') : null;
  };

  /* Las hojas que están por rellenar, para el gesto de una sola vez. */
  const porRellenar = plan.sessions
    .map((s) => ({ dayName: s.dayName, semanas: fillableWeeksOfDay(program, bloque, s.dayName) }))
    .filter((s) => s.semanas.length > 0);
  const semanasPorRellenar = [...new Set(porRellenar.flatMap((s) => s.semanas))].sort((a, b) => a - b);

  const enBloque = (w) => w - bloque.fromWeek + 1;
  const etiqueta = (w) => `${unidad.charAt(0)}${enBloque(w)}`;
  const rellenarTodo = () => porRellenar.forEach(({ dayName, semanas: ws }) => onRellenar(dayName, ws));

  /*
    ══ LA HOJA VERAZ: lo hecho al lado del plan ═══════════════════════════════
    La hoja decía «4 × 6-8» y ahí se acababa: lo que la persona HIZO vivía en
    otra pestaña, y revisar el plan era saltar entre las dos. Ahora cada hoja
    dice si esta semana está hecha, a medias o pendiente —el semáforo, pegado a
    su rótulo—, y cada ejercicio lleva debajo, en fantasma, lo de la última vez:
    kilos y repeticiones reales. Es la rejilla veraz que hace panel al documento.
    Solo en el bloque actual con la semana en curso dentro: en un bloque cerrado
    la hoja es archivo y el semáforo mentiría.
  */
  const semanasBloque = weeksOfBlock(program, bloque);
  const enCursoAqui = esActual && Number.isFinite(semanaEnCurso) && semanasBloque.includes(semanaEnCurso);
  const microEnCurso = enCursoAqui ? findMicrocycle(program?.microcycles || [], semanaEnCurso) : null;
  const diaDe = (fecha) => (fecha ? weekdayName(`${fecha}T00:00:00Z`) : null);
  const resumenTexto = (r) =>
    [r.kg !== null ? `${localeNumber(r.kg)} kg` : null, r.reps.join('·')].filter(Boolean).join(' · ');

  /* ── El arrastre ───────────────────────────────────────────────────────── */
  const soltar = () => {
    setArrastre(null);
    setSobre(null);
  };
  const mismaPieza = (a, b) => a && b && a.tipo === b.tipo && a.hoja === b.hoja && a.index === b.index;
  const asa = (pieza, label) => ({
    draggable: true,
    onDragStart: (e) => {
      setArrastre(pieza);
      e.dataTransfer.effectAllowed = 'move';
      /* Firefox no arranca el arrastre sin datos. */
      e.dataTransfer.setData('text/plain', label);
    },
    onDragEnd: soltar,
  });
  /* La pieza que recibe: solo acepta lo suyo (hoja sobre hoja, ejercicio
     sobre ejercicio de la misma hoja). */
  const receptor = (pieza) => {
    const acepta = arrastre && arrastre.tipo === pieza.tipo && (pieza.tipo === 'hoja' || arrastre.hoja === pieza.hoja);
    if (!acepta) return {};
    return {
      onDragOver: (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (!mismaPieza(sobre, pieza)) setSobre(pieza);
      },
      onDragLeave: () => setSobre((s) => (mismaPieza(s, pieza) ? null : s)),
      onDrop: (e) => {
        e.preventDefault();
        if (arrastre.index !== pieza.index) {
          if (pieza.tipo === 'hoja') onMoverHoja(arrastre.index, pieza.index);
          else onMoverEjercicio(pieza.hoja, arrastre.nombre, pieza.index - arrastre.index);
        }
        soltar();
      },
    };
  };
  const marcas = (pieza) =>
    `${mismaPieza(arrastre, pieza) ? ' is-dragging' : ''}${mismaPieza(sobre, pieza) && !mismaPieza(arrastre, pieza) ? ' is-drop-target' : ''}`;

  const altaDeHoja = (
    <form
      className="plan-hoja-alta"
      onSubmit={(e) => {
        e.preventDefault();
        const nombre = (nuevaHoja || '').trim();
        if (!nombre) return;
        onAnadirHoja(nombre);
        setNuevaHoja(null);
      }}
    >
      <input
        autoFocus
        className="input input-sm"
        value={nuevaHoja || ''}
        placeholder="Ej: Legs B"
        aria-label="Nombre de la hoja nueva"
        onChange={(e) => setNuevaHoja(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && setNuevaHoja(null)}
      />
      <button type="submit" className="btn btn-primary btn-sm" disabled={!(nuevaHoja || '').trim()}>
        Añadir
      </button>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setNuevaHoja(null)}>
        Cancelar
      </button>
    </form>
  );

  const linea = (
    <LineaDeBloques
      program={program}
      bloque={bloque}
      semanaEnCurso={semanaEnCurso}
      unidad={unidad}
      unidades={unidades}
      conHorizonte
      onIrBloque={onIrBloque}
      onIrSemana={onIrSemana}
      onNuevaSemana={onNuevaSemana}
      onNuevoBloque={esActual ? onNuevoBloque : null}
      onRenombrarBloque={onRenombrarBloque}
      onAjustes={onAjustes}
      contexto={[cuenta(plan.sessions.length, 'hoja', 'hojas'), estructuraTexto, esActual ? null : 'cerrado'].filter(Boolean).join(' · ')}
    />
  );

  const costado = (
    <aside className="bloque-lado" aria-label="Con qué se juzga el bloque">
      <TarjetaCifras resumen={resumen} unidad={unidad} unidades={unidades} onAmpliar={() => setVentana('historial')} />
      {plan.sessions.length > 0 && <TarjetaVolumen grupos={grupos} unidad={unidad} onAmpliar={() => setVentana('volumen')} />}
    </aside>
  );

  /* Las ventanas se montan solo abiertas: cerradas no calculan nada. */
  const ventanas = (
    <>
      {ventana === 'historial' && (
        <HistorialPopup
          open
          onClose={() => setVentana(null)}
          program={program}
          bloque={bloque}
          semanaEnCurso={semanaEnCurso}
          unidad={unidad}
          unidades={unidades}
          onIrBloque={(b) => {
            setVentana(null);
            onIrBloque(b);
          }}
          onIrSemana={(w) => {
            setVentana(null);
            onIrSemana(w);
          }}
          onFechaSemana={onFechaSemana}
        />
      )}
      {ventana === 'volumen' && <VolumenPopup open onClose={() => setVentana(null)} bloque={bloque} hojas={plan.sessions} unidad={unidad} />}
    </>
  );

  if (plan.sessions.length === 0) {
    return (
      <div className="bloque-pagina">
        <div className="bloque-plan">
          {linea}
          <EmptyState
            icon={Layers}
            title={`«${bloque.name}» todavía no tiene hojas`}
            message={
              esActual
                ? 'Una hoja es un día de entreno de este bloque —Push, Pull, Legs—. Añade la primera y ponle dentro sus ejercicios.'
                : 'Es un bloque cerrado y se quedó sin ninguna montada. Lo que se programe a partir de ahora va en el bloque abierto.'
            }
            action={esActual ? altaDeHoja : null}
          />
        </div>
        {costado}
        {ventanas}
      </div>
    );
  }

  return (
    <div className="bloque-pagina">
      {/* ══ EL PLAN ═══════════════════════════════════════════════════════ */}
      <div className="bloque-plan">
        {linea}

        {esActual && semanasPorRellenar.length > 0 && (
          <div className="plan-hueco">
            <span>
              {semanasPorRellenar.map(etiqueta).join(', ')} {semanasPorRellenar.length === 1 ? 'está' : 'están'} sin ejercicios.
            </span>
            <button type="button" className="btn btn-primary btn-sm" onClick={rellenarTodo}>
              <Wand2 size={14} /> Poner la plantilla
            </button>
          </div>
        )}

        {/* ── Las hojas, todas ──────────────────────────────────────────── */}
        <section className="plan-tramo">
          <div className="plan-tramo-cab">
            <h3 className="plan-titulo">Hojas</h3>
            <span className="plan-tramo-meta">
              {resumen.series ?? 0} series por {unidad.toLowerCase()}
              {esActual && plan.sessions.length > 1 ? ' · arrastra por el asa para ordenar' : ''}
            </span>
            <span className="plan-densidad">
              <SegmentedControl
                label="Densidad de la hoja"
                value={densidad}
                onChange={cambiarDensidad}
                options={[
                  { id: 'comoda', label: 'Cómoda', hint: 'Con aire, para leer el plan' },
                  { id: 'compacta', label: 'Compacta', hint: 'Más filas por pantalla, para programar de un tirón' },
                ]}
              />
            </span>
          </div>

          {/*
            Dónde cae cada hoja, justo encima de las hojas: en la semana
            natural se ELIGE día a día; en rotativo lo dicta el patrón, que
            se enseña como cadena y se cambia en Ajustes.
          */}
          <div className="plan-estructura">
            <span className="plan-estructura-k">{rotativo ? 'El ciclo' : 'La semana'}</span>
            {rotativo ? (
              <ol className="ciclo-tira" aria-label="El ciclo, día a día">
                {slots.map((slot, i) => (
                  <li key={slot.key} className={`ciclo-dia${slot.rest ? ' is-descanso' : ''}`} title={`Día ${i + 1}: ${slot.rest ? 'descanso' : slot.name}`}>
                    <span className="ciclo-dia-n">{i + 1}</span>
                    <span className="ciclo-dia-nombre">{slot.rest ? 'descanso' : slot.name}</span>
                  </li>
                ))}
                <li className="ciclo-dia is-vuelta" aria-label="y vuelta a empezar" title="Y vuelta a empezar">
                  <RotateCw size={12} aria-hidden="true" />
                </li>
              </ol>
            ) : (
              <WeeklySplitEditor split={estructura.weeklySplit} days={plan.sessions.map((s) => ({ dayName: s.dayName }))} disabled={!esActual} onChange={onSplit} />
            )}
          </div>

          <div
            className={`plan-rejilla${arrastre ? ` is-arrastrando-${arrastre.tipo}` : ''}${densidad === 'compacta' ? ' is-compacta' : ''}`}
            role="list"
          >
            {plan.sessions.map((hoja, index) => {
              const cerrada = untrainedWeeksOfDay(program, bloque, hoja.dayName).length === 0;
              const cae = cuandoCae(hoja.dayName);
              const piezaHoja = { tipo: 'hoja', hoja: hoja.dayName, index };

              /* Lo hecho esta semana con esta hoja, y la última vez del bloque
                 para el fantasma de quien aún no la ha tocado. */
              const sesionesSemana = microEnCurso
                ? executedSessions(microEnCurso).filter((s) => s.dayName === hoja.dayName)
                : [];
              const ultimaDeSemana =
                sesionesSemana.length > 0
                  ? sesionesSemana.reduce((a, b) =>
                      String(a.date || '').localeCompare(String(b.date || '')) >= 0 ? a : b
                    )
                  : null;
              const seriesHechas = sesionesSemana.reduce((n, s) => n + sessionSetCount(s), 0);
              const pasada = enCursoAqui
                ? ultimaSesionDeHoja(
                    program?.microcycles || [],
                    semanasBloque.filter((w) => w < semanaEnCurso),
                    hoja.dayName
                  )
                : null;
              const estadoHoja = !enCursoAqui
                ? null
                : seriesHechas === 0
                  ? { tono: 'aun', texto: `aún no esta ${unidad.toLowerCase()}` }
                  : seriesHechas >= hoja.series
                    ? {
                        tono: 'ok',
                        texto: `hecha${diaDe(ultimaDeSemana?.date) ? ` el ${diaDe(ultimaDeSemana.date)}` : ''}`,
                      }
                    : /* «1/20» y no «1 de 20 series»: la columna es estrecha y el
                         encabezado de arriba ya dice que son series. */
                      { tono: 'warn', texto: `a medias · ${seriesHechas}/${hoja.series}` };

              return (
                <section className={`plan-col${marcas(piezaHoja)}`} role="listitem" key={hoja.dayName} {...(esActual ? receptor(piezaHoja) : {})}>
                  <header className="plan-col-cab">
                    {esActual && plan.sessions.length > 1 && (
                      <button type="button" className="hoja-asa plan-asa" aria-label={`Arrastrar ${hoja.dayName} para ordenar`} title="Arrastra para cambiarla de sitio" {...asa(piezaHoja, hoja.dayName)}>
                        <GripVertical size={14} />
                      </button>
                    )}
                    <div className="plan-col-say">
                      {renombrando === hoja.dayName ? (
                        <RenombrarEnSitio
                          value={hoja.dayName}
                          label="Nuevo nombre de la hoja"
                          onRename={(nombre) => onRenombrarHoja(hoja.dayName, nombre)}
                          onDone={() => setRenombrando(null)}
                        />
                      ) : (
                        /* El nombre ES la puerta: pulsarlo entra en la hoja. */
                        <button type="button" className="plan-col-nombre" onClick={() => onAbrirHoja(hoja.dayName)} onDoubleClick={() => setRenombrando(hoja.dayName)} title={`Abrir ${hoja.dayName} y escribir sus series · doble clic para renombrar`}>
                          {hoja.dayName}
                        </button>
                      )}
                      <span className="plan-col-sub">
                        {[cae, `${hoja.series} series`, cuenta(hoja.exercises.length, 'ejercicio', 'ejercicios')].filter(Boolean).join(' · ')}
                      </span>
                      {estadoHoja && (
                        /* El semáforo de la semana, pegado al rótulo que juzga:
                           hecha · a medias · aún no. */
                        <span className={`plan-col-estado is-${estadoHoja.tono}`}>{estadoHoja.texto}</span>
                      )}
                    </div>
                    <MenuAcciones
                      clase="btn btn-icon btn-icon-compact plan-col-menu"
                      ariaLabel={`Acciones de ${hoja.dayName}`}
                      items={[
                        { icon: ArrowRight, label: 'Abrir la hoja', run: () => onAbrirHoja(hoja.dayName) },
                        { icon: Pencil, label: 'Renombrar', run: () => setRenombrando(hoja.dayName) },
                        null,
                        index > 0 && { icon: ArrowLeft, label: 'Mover antes', run: () => onMoverHoja(index, index - 1) },
                        index < plan.sessions.length - 1 && { icon: ArrowRight, label: 'Mover después', run: () => onMoverHoja(index, index + 1) },
                        null,
                        { icon: Trash2, label: `Quitar «${hoja.dayName}»`, danger: true, run: () => onQuitarHoja(hoja.dayName) },
                      ]}
                    />
                  </header>

                  <ol className="plan-ejs">
                    {hoja.exercises.map((ex, i) => {
                      const piezaEj = { tipo: 'ej', hoja: hoja.dayName, index: i, nombre: ex.name };
                      /* La verdad bajo la pauta: lo de esta semana si existe, y
                         si no, la última vez del bloque como fantasma. */
                      const real = ultimaDeSemana ? resumenDeEntrada(ultimaDeSemana, ex.name) : null;
                      const fantasma = !real && pasada ? resumenDeEntrada(pasada, ex.name) : null;
                      return (
                        <li className={`plan-ej${marcas(piezaEj)}`} key={ex.id} {...(cerrada ? {} : receptor(piezaEj))}>
                          <span className="plan-ej-nombre" title={ex.name}>
                            {!cerrada && hoja.exercises.length > 1 && (
                              <button type="button" className="hoja-asa plan-asa is-ej" aria-label={`Arrastrar ${ex.name} para ordenar`} title="Arrastra para cambiarlo de sitio" {...asa(piezaEj, ex.name)}>
                                <GripVertical size={12} />
                              </button>
                            )}
                            {ex.name}
                          </span>
                          <span className="plan-ej-fila">
                            <input
                              className="plan-series"
                              inputMode="numeric"
                              defaultValue={ex.series}
                              key={`s-${ex.id}-${ex.series}`}
                              aria-label={`Series de ${ex.name}`}
                              onBlur={(e) => {
                                const n = clampInt(e.target.value, 1, 12, ex.series);
                                if (n !== ex.series) onSeries(hoja.dayName, ex.name, n, ex.series);
                                e.target.value = n;
                              }}
                            />
                            <span className="plan-por" aria-hidden="true">
                              ×
                            </span>
                            <input
                              className="plan-reps"
                              defaultValue={ex.targetReps ?? ''}
                              key={`r-${ex.id}-${ex.targetReps}`}
                              placeholder={ex.targetReps === null ? 'varias' : '8-10'}
                              aria-label={`Repeticiones objetivo de ${ex.name}`}
                              onBlur={(e) => {
                                const reps = e.target.value.trim();
                                if (reps !== (ex.targetReps ?? '')) onReps(hoja.dayName, ex.name, reps);
                              }}
                            />
                            <span className="plan-ej-acciones">
                              <button
                                type="button"
                                className="btn btn-icon btn-icon-compact btn-icon-danger"
                                aria-label={`Quitar ${ex.name}`}
                                onClick={() => onQuitarEjercicio(hoja.dayName, ex.name)}
                              >
                                <Trash2 size={12} />
                              </button>
                            </span>
                          </span>
                          {(real || fantasma) && (
                            <span
                              className={`plan-ej-real${real ? (real.series >= ex.series ? ' is-ok' : ' is-warn') : ''}`}
                              title={
                                real
                                  ? `Lo registrado esta ${unidad.toLowerCase()}: su mayor peso y las repeticiones serie a serie`
                                  : 'Lo registrado la última vez que entrenó esta hoja en el bloque'
                              }
                            >
                              {real ? resumenTexto(real) : `la vez pasada: ${resumenTexto(fantasma)}`}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ol>

                  <div className="plan-col-pie">
                    {cerrada ? (
                      /* Sin sitio donde escribir: todas sus repeticiones están
                         entrenadas. Se dice en una palabra, no en una frase. */
                      <span className="plan-col-cerrada" title={`Ya entrenada en todas las ${unidades} de este bloque`}>
                        entrenada
                      </span>
                    ) : altaEn === hoja.dayName ? (
                      <AltaEnHoja
                        dayName={hoja.dayName}
                        library={library}
                        onAdd={(exercise) => onAnadirEjercicio(hoja.dayName, exercise)}
                        onRecordar={onRecordarEjercicio}
                        onCerrar={() => setAltaEn(null)}
                      />
                    ) : (
                      <button
                        type="button"
                        className="plan-alta-abrir"
                        onClick={() => setAltaEn(hoja.dayName)}
                        title={`Se añade a las ${unidades} de este bloque que aún no se han entrenado`}
                      >
                        <Plus size={12} aria-hidden="true" /> ejercicio
                      </button>
                    )}

                    {hoja.difieren.length > 0 && (
                      <button
                        type="button"
                        className="plan-difiere"
                        onClick={() => onIrSemana(hoja.difieren[0])}
                        title="Esa repetición lleva otros ejercicios o series en esta hoja. Sigue siendo el mismo bloque; el cambio está apuntado en el historial."
                      >
                        {hoja.difieren.map(etiqueta).join(', ')} {hoja.difieren.length === 1 ? 'va distinta' : 'van distintas'}
                      </button>
                    )}
                  </div>
                </section>
              );
            })}

            {/* La hoja de más: una columna al final, que es donde iría —la
                misma regla que «+ bloque» al final de la línea—. */}
            {esActual && (
              <section className={`plan-col is-nueva${nuevaHoja === null ? '' : ' is-abierta'}`} role="listitem">
                {nuevaHoja === null ? (
                  <button type="button" className="plan-col-mas" onClick={() => setNuevaHoja('')} aria-label="Añadir una hoja" title="Añadir una hoja al bloque">
                    <Plus size={15} aria-hidden="true" />
                  </button>
                ) : (
                  altaDeHoja
                )}
              </section>
            )}
          </div>
        </section>
      </div>

      {/* ══ EL COSTADO: con qué se juzga ══════════════════════════════════ */}
      {costado}
      {ventanas}
    </div>
  );
};
