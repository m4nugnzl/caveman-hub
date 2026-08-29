import { useState } from 'react';
import { ArrowLeft, ArrowRight, Dumbbell, GripVertical, Pencil, Plus, Settings2, Trash2, Wand2 } from 'lucide-react';

import {
  blockPlan,
  blockSummary,
  blocksOf,
  fillableWeeksOfDay,
  isCurrentBlock,
  structureOfBlock,
  untrainedWeeksOfDay,
  weeksOfBlock,
} from '@/domain/blocks';
import { executedSessions } from '@/domain/sessions';
import { MRV_GOALS, MUSCLE_GROUPS, WEEK_DAYS, buildExercise, findMicrocycle, isRestDay, rotatingSlots, unitLabel, unitLabelPlural } from '@/domain/training';
import { metricColor } from '@/domain/metrics';
import { localeNumber, shortDate } from '@/lib/dates';
import { clampInt } from '@/lib/num';
import { Autocomplete } from '@/components/ui/Autocomplete';
import { CycleChain } from '@/components/ui/CycleChain';
import { MenuAcciones } from '@/components/ui/MenuAcciones';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, RenombrarEnSitio } from '@/components/ui/primitives';
import { HistorialPopup } from './HistorialPopup';
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
        <button type="button" className="btn btn-quiet btn-sm" onClick={onCerrar}>
          Listo
        </button>
      </div>
    </form>
  );
};

/* ══ LA LÍNEA DE TIEMPO ══════════════════════════════════════════════════════ */

/**
 * Los bloques de esta persona, de izquierda a derecha, y dentro sus semanas.
 *
 * Cada tramo crece con sus semanas, así que un bloque de ocho pesa el doble
 * que uno de cuatro y la línea se lee como tiempo. El abierto lleva el borde;
 * los demás van en voz baja. Al final, en el bloque en curso, la semana de
 * más y el bloque de más: cada «+» al final de lo que alarga.
 */
const LineaDeBloques = ({ program, bloque, semanaEnCurso, unidad, unidades, onIrBloque, onIrSemana, onNuevaSemana, onNuevoBloque }) => {
  const bloques = blocksOf(program);
  const microcycles = program?.microcycles || [];

  return (
    <nav className="linea" aria-label="Bloques del programa">
      <ol className="linea-tramos">
        {bloques.map((b, i) => {
          const esEste = b.id === bloque.id;
          const r = blockSummary(program, b);
          const semanas = weeksOfBlock(program, b);
          const cifras = [r.kg > 0 && `${localeNumber(r.kg)} kg`, r.adherencia !== null && `${r.adherencia} % de lo pautado`].filter(Boolean).join(' · ');

          return (
            <li key={b.id} className={`linea-tramo${esEste ? ' is-on' : ''}${r.abierto ? ' is-abierto' : ''}`} style={{ flexGrow: Math.max(2, semanas.length) }}>
              <button
                type="button"
                className="linea-cab"
                onClick={() => !esEste && onIrBloque(b)}
                aria-current={esEste ? 'true' : undefined}
                title={esEste ? `${b.name}: el que estás mirando` : `Ir a ${b.name}${cifras ? ` · ${cifras}` : ''}`}
              >
                <span className="linea-n">B{i + 1}</span>
                <span className="linea-nombre">{b.name}</span>
                <span className="linea-cuando">
                  {r.desde ? shortDate(r.desde) : 'sin fechas'}
                  {r.abierto ? ' · abierto' : r.hasta ? ` – ${shortDate(r.hasta)}` : ''}
                </span>
              </button>

              <div className="linea-semanas" role="list" aria-label={`${unidades} de ${b.name}`}>
                {semanas.map((w) => {
                  const micro = findMicrocycle(microcycles, w) || {};
                  const hecha = executedSessions(micro).length > 0;
                  const estado = w === semanaEnCurso ? 'is-curso' : hecha ? 'is-hecha' : '';
                  const n = w - b.fromWeek + 1;
                  const titulo = `${unidad} ${n}${micro.date ? ` · ${shortDate(micro.date)}` : ''}${w === semanaEnCurso ? ' · en curso' : hecha ? ' · entrenada' : ' · por hacer'}`;
                  return esEste ? (
                    <button key={w} type="button" role="listitem" className={`linea-semana${estado ? ` ${estado}` : ''}`} onClick={() => onIrSemana(w)} title={`Abrir ${titulo}`}>
                      {n}
                    </button>
                  ) : (
                    <span key={w} role="listitem" className={`linea-semana${estado ? ` ${estado}` : ''}`} title={titulo}>
                      {n}
                    </span>
                  );
                })}
                {esEste && r.abierto && (
                  <button type="button" className="linea-semana is-nueva" onClick={onNuevaSemana} aria-label={`Añadir ${unidad.toLowerCase()}`} title={`Añadir ${unidad.toLowerCase()} ${semanas.length + 1}`}>
                    <Plus size={11} />
                  </button>
                )}
              </div>
            </li>
          );
        })}

        {onNuevoBloque && (
          <li className="linea-tramo is-siguiente">
            <button type="button" className="linea-mas" onClick={onNuevoBloque} title="Cierra el bloque abierto y empieza el siguiente">
              <Plus size={14} aria-hidden="true" /> bloque
            </button>
          </li>
        )}
      </ol>
    </nav>
  );
};

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
  const unidad = unitLabel(cycleType);
  const unidades = unitLabelPlural(cycleType);
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
      <button type="button" className="btn btn-quiet btn-sm" onClick={() => setNuevaHoja(null)}>
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
      onIrBloque={onIrBloque}
      onIrSemana={onIrSemana}
      onNuevaSemana={onNuevaSemana}
      onNuevoBloque={esActual ? onNuevoBloque : null}
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
      {ventana === 'volumen' && (
        <Modal open title={`Volumen por grupo · ${bloque.name}`} onClose={() => setVentana(null)}>
          <div className="volumen-ventana">
            <p className="t-sm t-secondary">
              Series pautadas por {unidad.toLowerCase()} en este bloque, contra el máximo recuperable estimado de cada grupo. En rojo, lo que se pasa.
            </p>
            <BarrasVolumen grupos={grupos} />
          </div>
        </Modal>
      )}
    </>
  );

  /* ── El mando: nombre, contexto, y el engranaje ────────────────────────── */
  const mando = (
    <header className="mando plan-mando">
      <div className="mando-izq">
        <input
          key={bloque.id}
          className="plan-nombre"
          defaultValue={bloque.name}
          size={Math.max(6, bloque.name.length + 1)}
          aria-label="Nombre del bloque"
          onBlur={(e) => {
            const nombre = e.target.value.trim();
            if (nombre && nombre !== bloque.name) onRenombrarBloque(bloque.id, nombre);
          }}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
        <span className="mando-contexto">
          {[cuenta(plan.sessions.length, 'hoja', 'hojas'), estructuraTexto, esActual ? null : 'cerrado'].filter(Boolean).join(' · ')}
        </span>
      </div>
      <div className="mando-acciones">
        <button type="button" className="btn btn-icon btn-icon-compact" onClick={onAjustes} aria-label="Ajustes del programa" title="Ajustes: tipo de ciclo, fecha de inicio y protocolo">
          <Settings2 size={16} />
        </button>
      </div>
    </header>
  );

  if (plan.sessions.length === 0) {
    return (
      <div className="bloque-pagina">
        <div className="bloque-plan">
          {mando}
          {linea}
          <EmptyState
            icon={Dumbbell}
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
        {mando}
        {linea}

        {/*
          La estructura: en la semana natural, dónde cae cada hoja de lunes a
          domingo (un editor); en rotativo, la cadena del patrón —qué va tras
          qué y dónde se descansa—, que se edita en Ajustes.
        */}
        <section className="plan-tramo">
          <div className="plan-tramo-cab">
            <h3 className="plan-titulo">Estructura</h3>
            <span className="plan-tramo-meta">{rotativo ? 'el ciclo se repite sin fin' : 'la semana natural'}</span>
          </div>
          {rotativo ? (
            <CycleChain slots={slots} />
          ) : (
            <WeeklySplitEditor split={estructura.weeklySplit} days={plan.sessions.map((s) => ({ dayName: s.dayName }))} disabled={!esActual} onChange={onSplit} />
          )}
        </section>

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
            {esActual && nuevaHoja === null && (
              <button type="button" className="btn btn-quiet btn-sm plan-tramo-accion" onClick={() => setNuevaHoja('')}>
                <Plus size={14} /> Hoja
              </button>
            )}
          </div>
          {nuevaHoja !== null && altaDeHoja}

          <div className={`plan-rejilla${arrastre ? ` is-arrastrando-${arrastre.tipo}` : ''}`} role="list">
            {plan.sessions.map((hoja, index) => {
              const cerrada = untrainedWeeksOfDay(program, bloque, hoja.dayName).length === 0;
              const cae = cuandoCae(hoja.dayName);
              const piezaHoja = { tipo: 'hoja', hoja: hoja.dayName, index };

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
          </div>
        </section>
      </div>

      {/* ══ EL COSTADO: con qué se juzga ══════════════════════════════════ */}
      {costado}
      {ventanas}
    </div>
  );
};
