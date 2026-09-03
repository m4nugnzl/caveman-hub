import { useState } from 'react';
import { ArrowLeft, ArrowRight, FileUp, GripVertical, Layers, Pencil, Plus, Trash2, Wand2 } from 'lucide-react';

import {
  blockPlan,
  blockSummary,
  fillableWeeksOfDay,
  isCurrentBlock,
  structureOfBlock,
  untrainedWeeksOfDay,
  weeksOfBlock,
} from '@/domain/blocks';
import { MRV_GOALS, MUSCLE_GROUPS, WEEK_DAYS, buildExercise, findMicrocycle, rotatingSlots, unitInitial, unitIsFeminine, unitLabel, unitLabelPlural } from '@/domain/training';
import { executedSessions, resumenDeEntrada, sessionSetCount, ultimaSesionDeHoja } from '@/domain/sessions';
import { strengthByExercise } from '@/domain/reading';
import { metricColor } from '@/domain/metrics';
import { localeNumber, weekdayName } from '@/lib/dates';
import { clampInt } from '@/lib/num';
import { Autocomplete } from '@/components/ui/Autocomplete';
import { MenuAcciones } from '@/components/ui/MenuAcciones';
import { EmptyState, RenombrarEnSitio } from '@/components/ui/primitives';
import { HistorialPopup } from './HistorialPopup';
import { VolumenPopup } from './VolumenPopup';
import { LineaDeBloques } from './LineaDeBloques';
import { EstructuraDelMicrociclo } from './EstructuraDelMicrociclo';

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

/* ══ LA PROGRESIÓN: qué se mueve y qué lleva semanas clavado ════════════════
   La hoja veraz dice qué se HIZO; esto dice qué ejercicios no se MUEVEN, que
   es lo que se va a buscar al montar el microciclo siguiente y hasta ahora
   exigía abrir la progresión uno a uno. Sale de `strengthByExercise` —el mismo
   1RM estimado que usa la lectura del Resumen— filtrado a los ejercicios de
   ESTE bloque. Señala; qué hacer con ellos es cosa del entrenador. */
const TarjetaProgresion = ({ filas, unidades }) => {
  const suben = filas.filter((f) => f.dir === 'up').length;
  const clavados = filas.filter((f) => f.dir === 'flat');
  const bajan = filas.filter((f) => f.dir === 'down');
  const quietos = [...bajan, ...clavados];

  return (
    <section className="lado-tarjeta" aria-label="Progresión de los ejercicios">
      <div className="lado-cab">
        <span className="section-label">Progresión</span>
        <div className="lado-cab-fila">
          <span className="lado-titulo is-texto">
            sube en {suben} de {filas.length}
          </span>
          {quietos.length > 0 && (
            <span className="lado-aviso" title={`Sin mejorar su 1RM estimado en ${unidades} seguidos`}>
              {quietos.length} sin moverse
            </span>
          )}
        </div>
      </div>
      {quietos.length > 0 && (
        <ul className="progresion-quietos">
          {quietos.slice(0, 5).map((f) => (
            <li key={f.name} title={`${f.name}: 1RM estimado ${f.dir === 'down' ? 'a la baja' : 'plano'} en sus últimos ${f.weeks} entrenamientos`}>
              <span className="n">{f.name}</span>
              <span className={`d${f.dir === 'down' ? ' is-baja' : ''}`}>
                {f.dir === 'down' ? 'a la baja' : `${f.weeks} sin subir`}
              </span>
            </li>
          ))}
          {quietos.length > 5 && <li className="progresion-mas">y {quietos.length - 5} más</li>}
        </ul>
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
  onQuitarBloque,
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
  /* Abre el diálogo de traer el plan de un fichero. Como en la línea de
     bloques: la acción existe si —y solo si— llega su manejador. */
  onTraerFichero,
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
  /* La unidad del bloque: la SEMANA natural o el MICROCICLO —una vuelta al
     patrón—. Ni «sesión» (en la hoja de series una sesión es un entrenamiento,
     y «109 series por sesión» era mentira) ni «ciclo» a secas, que es lo que
     se elige en Ajustes. Ver `unitLabel`. */
  const unidad = unitLabel(cycleType);
  const unidades = unitLabelPlural(cycleType);
  /* «aún no esta semana» / «aún no este microciclo». */
  const fem = unitIsFeminine(cycleType);
  const este = fem ? 'esta' : 'este';
  const todas = fem ? 'todas las' : 'todos los';
  const estructura = structureOfBlock(program, bloque);
  const resumen = blockSummary(program, bloque);
  const grupos = volumenPorGrupo(plan.sessions);

  /* La estructura del bloque: en rotativo, la cadena del patrón —donde caen
     los descansos—; en semana natural, el reparto por días. */
  const slots = rotativo ? rotatingSlots(cliente?.cyclePattern, plan.sessions.map((s) => ({ dayName: s.dayName }))) : [];
  const split = estructura.weeklySplit || {};

  /* Cuándo cae cada hoja: los días de la semana que la llevan, o su sitio en el ciclo. */
  const cuandoCae = (dayName) => {
    if (rotativo) return slots.find((s) => !s.rest && s.name === dayName)?.lead || null;
    const dias = WEEK_DAYS.filter((d) => split[d] === dayName).map((d) => d.slice(0, 3));
    return dias.length > 0 ? dias.join(' · ') : null;
  };

  /*
    ══ V-01 · LA REJILLA SE ORDENA POR EL MICROCICLO ═════════════════════════

    El ritmo del microciclo era texto en la franja de arriba y la rejilla lo
    ignoraba: columnas idénticas en el orden de la lista. Ahora las columnas se
    ordenan por dónde caen y cada una lleva su día rotulado, así que la
    estructura del microciclo ES el orden de la rejilla y no una leyenda que
    traducir.

    ── Y los descansos NO bajan aquí ─────────────────────────────────────────
    Llegaron a ocupar su propia muesca rayada entre columnas, para «dibujar el
    ritmo». Pero esta rejilla es lo que hay que PROGRAMAR, y un día de descanso
    no se programa: eran cuatro cicatrices verticales en medio del plan que no
    se podían pulsar, no se podían llenar y no llevaban nada dentro. El ritmo ya
    lo enseña la franja de arriba, que es su sitio —ahí las casillas libres son
    huecos de verdad, con algo que elegir dentro—, y aquí los números de día
    (D1, D4, D7) siguen contando dónde cae cada hoja sin gastar una columna en
    lo que no la necesita.

    Solo cuando la estructura se conoce: en rotativo la dicta el patrón; en
    semana natural, el reparto de días si lo hay. Sin reparto, `null` y la
    rejilla plana de siempre — inventar un orden sería mentir.

    Una hoja repetida en el microciclo (Push el lunes y el jueves) se pinta UNA
    vez, en su primer día; sus otros días ya los dice su subtítulo. Y la que la
    estructura no nombra va al final, sin día: existe en el plan aunque el ciclo
    no la recoja.
  */
  const piezasRejilla = (() => {
    const porNombre = new Map(plan.sessions.map((hoja, index) => [hoja.dayName, { hoja, index }]));
    const usadas = new Set();
    const piezas = [];
    const mete = (nombre, dia) => {
      if (!porNombre.has(nombre) || usadas.has(nombre)) return;
      usadas.add(nombre);
      piezas.push({ dia, ...porNombre.get(nombre) });
    };

    if (rotativo && slots.length > 0) {
      slots.forEach((slot, i) => {
        if (!slot.rest) mete(slot.name, `D${i + 1}`);
      });
    } else if (!rotativo && WEEK_DAYS.some((d) => split[d] && porNombre.has(split[d]))) {
      for (const d of WEEK_DAYS) {
        if (split[d] && porNombre.has(split[d])) mete(split[d], d.slice(0, 3));
      }
    } else {
      return null;
    }

    for (const hoja of plan.sessions) mete(hoja.dayName, null);
    return piezas;
  })();

  /*
    Las hojas que están por rellenar, para el gesto de una sola vez.

    ── Y solo las que TIENEN de dónde copiar ─────────────────────────────────
    «Poner la plantilla» copia los ejercicios del microciclo de referencia del
    bloque (`rellenarConLaPlantilla`). En un bloque recién abierto ese
    microciclo está tan en blanco como los demás, así que el botón salía igual,
    se pulsaba, y no pasaba NADA: ni cambio ni aviso. Un botón que no hace nada
    es peor que no tener botón, porque el que lo pulsa se queda pensando que ha
    fallado la aplicación.

    Ahora la franja pregunta antes: si hay plantilla, ofrece ponerla; si no la
    hay —el bloque entero está vacío—, ofrece las dos rutas que de verdad
    existen (escribirlo aquí, o traer el fichero donde ya está escrito).
  */
  /* `plan.sessions` se lee del microciclo de REFERENCIA, así que sus ejercicios
     son literalmente la plantilla: si esa hoja no tiene ninguno, no hay nada
     que copiar a las demás. */
  const conPlantilla = (dayName) =>
    ((plan.sessions.find((s) => s.dayName === dayName)?.exercises) || []).length > 0;
  const porRellenar = plan.sessions
    .map((s) => ({ dayName: s.dayName, semanas: fillableWeeksOfDay(program, bloque, s.dayName) }))
    .filter((s) => s.semanas.length > 0 && conPlantilla(s.dayName));
  const semanasPorRellenar = [...new Set(porRellenar.flatMap((s) => s.semanas))].sort((a, b) => a - b);
  /* El bloque en blanco: ninguna hoja tiene un solo ejercicio. */
  const bloqueVacio = plan.sessions.every((s) => (s.exercises || []).length === 0);

  const enBloque = (w) => w - bloque.fromWeek + 1;
  const etiqueta = (w) => `${unitInitial(cycleType)}${enBloque(w)}`;
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
      onQuitarBloque={onQuitarBloque}
      onAjustes={onAjustes}
      /* «4 hojas · 4 de entreno, 3 de descanso» era el dibujo de abajo dicho en
         palabras: la franja de la semana enseña dónde cae cada hoja y las
         columnas se cuentan solas. Aquí queda lo que no se ve en ningún sitio:
         que el bloque está cerrado. */
      contexto={esActual ? null : 'cerrado'}
    />
  );

  /*
    ── Sin fila de mando encima ──────────────────────────────────────────────
    Llegó a haberla, con «+ bloque» y el engranaje, copiando la de Dieta. Dos
    cosas iban mal: separaba la acción de añadir un bloque de los bloques —el
    botón no tocaba por ningún sitio lo que crea—, y empujaba la hoja del plan
    medio pliegue hacia abajo, así que arrancaba por debajo de las tarjetas del
    costado y las dos columnas de la pantalla ya no empezaban a la misma altura.
    Sus dos acciones viven ahora donde actúan, dentro de la línea de bloques.
  */

  /* La progresión de los ejercicios de ESTE bloque, solo en el actual: en un
     bloque cerrado la hoja es archivo y ya no hay microciclo que montar. Con
     menos de 3 entrenamientos por ejercicio, `strengthByExercise` calla solo. */
  const progresion = esActual
    ? strengthByExercise(program?.microcycles || []).filter((f) =>
        plan.sessions.some((h) => (h.exercises || []).some((ex) => ex.name === f.name))
      )
    : [];

  const costado = (
    <aside className="bloque-lado" aria-label="Con qué se juzga el bloque">
      <TarjetaCifras resumen={resumen} unidad={unidad} unidades={unidades} onAmpliar={() => setVentana('historial')} />
      {plan.sessions.length > 0 && <TarjetaVolumen grupos={grupos} unidad={unidad} onAmpliar={() => setVentana('volumen')} />}
      {progresion.length > 0 && <TarjetaProgresion filas={progresion} unidades={unidades} />}
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
      <div className="bloque-pagina cascada">
        <div className="bloque-plan">
          <div className="plan-hoja">
            <section className="plan-seccion">{linea}</section>
          </div>
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
    <div className="bloque-pagina cascada">
      {/*
        ══ EL PLAN: UNA HOJA, TRES SECCIONES ══════════════════════════════

        Esto fue un titular suelto, una franja suelta y una rejilla de tarjetas
        sueltas, las tres sobre el lienzo. Y al lado, Dieta y Resumen: una fila
        de mando en voz baja y UNA caja que lo contiene todo, con sus secciones
        separadas por filete dentro. La misma casa con dos formas de montar una
        hoja, y Entreno cantaba justamente por ser la distinta.

        Ahora es la gramática de la hoja de dieta, con las mismas piezas: el
        bloque y su carril, el reparto del microciclo, y las hojas. Tres
        secciones de una caja, no tres cajas.
      */}
      <div className="bloque-plan">
        <div className="plan-hoja">
          <section className="plan-seccion">{linea}</section>

        {/*
          ══ EL HUECO: dos huecos distintos, dos ofertas distintas ═══════════

          Si el bloque tiene plantilla, lo que falta es copiarla a los
          microciclos en blanco: una frase y el botón que lo hace.

          Si NO la tiene —el bloque entero está vacío—, no hay nada que copiar,
          y el botón de la plantilla se pulsaba sin efecto ni aviso. Lo que hace
          falta ahí son las dos rutas de verdad: escribirlo en la hoja, o traer
          el fichero donde ya está escrito. Es el mismo par que ofrece el vacío
          del programa entero (`WorkoutLogEditor`), en el sitio donde ahora hace
          falta.
        */}
        {esActual && bloqueVacio && (
          <div className="plan-hueco plan-seccion">
            <span>
              «{bloque.name}» no tiene ningún ejercicio todavía:{' '}
              {plan.sessions.length === 1
                ? `su hoja «${plan.sessions[0].dayName}» está en blanco`
                : `sus ${plan.sessions.length} hojas están en blanco`}
              .
            </span>
            <div className="plan-hueco-acciones">
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setAltaEn(plan.sessions[0].dayName)}>
                <Plus size={14} /> Escribir el primero
              </button>
              {onTraerFichero && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={onTraerFichero}>
                  <FileUp size={14} /> Traer de un fichero
                </button>
              )}
            </div>
          </div>
        )}

        {esActual && !bloqueVacio && semanasPorRellenar.length > 0 && (
          <div className="plan-hueco plan-seccion">
            <span>
              {semanasPorRellenar.map(etiqueta).join(', ')} {semanasPorRellenar.length === 1 ? 'está' : 'están'} sin ejercicios.
            </span>
            <div className="plan-hueco-acciones">
              <button type="button" className="btn btn-primary btn-sm" onClick={rellenarTodo}>
                <Wand2 size={14} /> Poner la plantilla
              </button>
            </div>
          </div>
        )}

        {/*
          ── Dónde cae cada hoja: su propia sección ────────────────────────
          En la semana natural se ELIGE día a día; en rotativo lo dicta el
          patrón, que se cambia en Ajustes. Aquí hubo un rótulo «Hojas» con su
          contador de series y un conmutador de densidad, y entre los tres
          empujaban el plan medio pliegue hacia abajo para no decir nada nuevo.
        */}
        <section className="plan-seccion">
          <div className="plan-estructura">
            {/* «Microciclo» y no «Los días»: es la unidad que se programa, se
                llama igual en los dos tipos de ciclo, y así el rótulo de la
                franja y el del carril de arriba nombran la misma cosa. */}
            <span className="plan-estructura-k">Microciclo</span>
            <EstructuraDelMicrociclo
              rotativo={rotativo}
              split={estructura.weeklySplit}
              slots={slots}
              hojas={plan.sessions.map((s) => s.dayName)}
              disabled={!esActual}
              onSplit={onSplit}
              onMoverHoja={onMoverHoja}
            />
          </div>
        </section>

        {/* ── Las hojas, todas ──────────────────────────────────────────── */}
        <section className="plan-seccion" aria-label="Las hojas del bloque">
          <div
            className={`plan-rejilla${piezasRejilla ? ' is-ciclo' : ''}`}
            role="list"
          >
            {(piezasRejilla || plan.sessions.map((hoja, index) => ({ hoja, index, dia: null }))).map((pieza) => {
              const { hoja, index, dia } = pieza;
              const cerrada = untrainedWeeksOfDay(program, bloque, hoja.dayName).length === 0;
              /* Con el día ya rotulado encima, el «D2» del subtítulo sería el
                 mismo dato dos veces; en semana natural se queda, porque una
                 hoja puede caer en dos días y el rótulo solo lleva el primero. */
              const cae = rotativo && dia ? null : cuandoCae(hoja.dayName);
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
                  ? /* «aún no» a secas: la frase entera («aún no este
                       microciclo») no cabía en una columna de 150 px y salía
                       truncada en media rejilla. La unidad ya la dice la
                       franja de arriba; la frase completa va en el title. */
                    { tono: 'aun', texto: 'aún no', title: `Aún no ${este} ${unidad.toLowerCase()}` }
                  : seriesHechas >= hoja.series
                    ? {
                        tono: 'ok',
                        texto: `hecha${diaDe(ultimaDeSemana?.date) ? ` el ${diaDe(ultimaDeSemana.date)}` : ''}`,
                      }
                    : /* «1/20» y no «1 de 20 series»: la columna es estrecha y el
                         encabezado de arriba ya dice que son series. */
                      { tono: 'warn', texto: `a medias · ${seriesHechas}/${hoja.series}` };

              return (
                /* El semáforo sube también a la CLASE de la columna: en la
                   rejilla del ciclo se pinta como filo superior, y la palabra
                   se queda porque lleva lo que el color no puede («el martes»,
                   «17/19»). */
                <section
                  className={`plan-col${estadoHoja ? ` is-${estadoHoja.tono}` : ''}${marcas(piezaHoja)}`}
                  role="listitem"
                  key={hoja.dayName}
                  {...(esActual ? receptor(piezaHoja) : {})}
                >
                  {dia && <span className="plan-col-dia">{dia}</span>}
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
                      {/*
                        Dónde cae y cuántas series, y se acabó. El tercer dato
                        —«7 ejercicios»— no cabía en una columna estrecha y
                        cortaba la línea en «7 ejer…»: se cuenta solo mirando
                        las filas de debajo, y de esta pantalla lo que importa
                        es el reparto y el VOLUMEN.
                      */}
                      <span className="plan-col-sub">{[cae, `${hoja.series} series`].filter(Boolean).join(' · ')}</span>
                      {estadoHoja && (
                        /* El semáforo de la semana, pegado al rótulo que juzga:
                           hecha · a medias · aún no. */
                        <span className={`plan-col-estado is-${estadoHoja.tono}`} title={estadoHoja.title}>
                          {estadoHoja.texto}
                        </span>
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
                      /*
                        ── UNA FILA, UN RENGLÓN ────────────────────────────────
                        El nombre iba arriba y la pauta debajo, y encima el
                        nombre envolvía cuando era largo: cada ejercicio medía
                        dos o tres renglones según el nombre que le tocara, así
                        que el tercer ejercicio de una hoja no caía a la misma
                        altura que el tercero de la de al lado. Con seis hojas
                        en fila, eso deja de ser una rejilla y pasa a ser seis
                        listas sueltas.

                        Ahora la fila es una: nombre a la izquierda —cortado
                        con puntos suspensivos, nunca envuelto— y la pauta
                        pegada a la derecha, en su carril. Alto fijo, así que
                        la fila N de todas las hojas está en la misma línea y
                        la pantalla vuelve a leerse como la tabla que es.

                        Lo registrado ya no ocupa su propio renglón: era el
                        tercero y el que descuadraba, porque solo lo tienen los
                        ejercicios ya entrenados. Se queda como punto de color
                        —cumplió o le faltó— con los kilos y las repeticiones
                        en el título.
                      */
                      const real = ultimaDeSemana ? resumenDeEntrada(ultimaDeSemana, ex.name) : null;
                      const fantasma = !real && pasada ? resumenDeEntrada(pasada, ex.name) : null;
                      const hecho = real ? (real.series >= ex.series ? 'ok' : 'warn') : null;
                      const dicho = real
                        ? `${ex.name} · ${este} ${unidad.toLowerCase()}: ${resumenTexto(real)}`
                        : fantasma
                          ? `${ex.name} · la vez pasada: ${resumenTexto(fantasma)}`
                          : ex.name;
                      return (
                        <li className={`plan-ej${marcas(piezaEj)}`} key={ex.id} {...(cerrada ? {} : receptor(piezaEj))}>
                          {!cerrada && hoja.exercises.length > 1 && (
                            <button type="button" className="hoja-asa plan-asa is-ej" aria-label={`Arrastrar ${ex.name} para ordenar`} title="Arrastra para cambiarlo de sitio" {...asa(piezaEj, ex.name)}>
                              <GripVertical size={12} />
                            </button>
                          )}
                          {/*
                            ── V-02 · TRES TINTAS ─────────────────────────────
                            El nombre en tinta plena, la pauta en secundaria y,
                            debajo del nombre, LO REGISTRADO en terciaria: lo de
                            este microciclo si ya entrenó (con su punto), y si
                            no, lo de la vez pasada como fantasma. Antes vivía
                            solo en el title; un dato que hay que sobrevolar
                            para leer no acompaña ninguna decisión. El alto de
                            la fila es fijo con o sin registro, así que la fila
                            N de todas las hojas sigue en la misma línea.
                          */}
                          <span className="plan-ej-texto">
                            <span className={`plan-ej-nombre${hecho ? ` is-${hecho}` : ''}`} title={dicho}>
                              {ex.name}
                            </span>
                            {(real || fantasma) && (
                              <span className="plan-ej-real">{resumenTexto(real || fantasma)}</span>
                            )}
                          </span>
                          <span className="plan-ej-pauta">
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
                          </span>
                          {/* La papelera no gasta ancho: se posa encima del
                              carril de la pauta al acercarse a la fila. */}
                          <button
                            type="button"
                            className="btn btn-icon btn-icon-compact btn-icon-danger plan-ej-quitar"
                            aria-label={`Quitar ${ex.name}`}
                            onClick={() => onQuitarEjercicio(hoja.dayName, ex.name)}
                          >
                            <Trash2 size={12} />
                          </button>
                        </li>
                      );
                    })}
                  </ol>

                  <div className="plan-col-pie">
                    {cerrada ? (
                      /* Sin sitio donde escribir: todas sus repeticiones están
                         entrenadas. Se dice en una palabra, no en una frase. */
                      <span className="plan-col-cerrada" title={`Ya entrenada en ${todas} ${unidades} de este bloque`}>
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
                        title={`Se añade a ${todas} ${unidades} de este bloque que aún no se han entrenado`}
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

          {/*
            ══ «+ hoja»: al final de la lista, a la izquierda ════════════════

            Fue una columna de más al final de la rejilla, y con cuatro hojas
            repartiéndose el ancho acababa siendo un «+» solo contra el canto
            derecho de la pantalla, pegado a las tarjetas del costado: leído
            desde lejos no era «añade una hoja aquí», era un botón perdido en la
            esquina. Ahora es lo que esta casa pone para añadir uno más de lo que
            se está listando —el mismo botón, en el mismo sitio, que el «+ comida»
            de la hoja de dieta (`.dieta-alta`)—: al final de la lista y contra
            el margen izquierdo, que es por donde se lee.
          */}
          {esActual && (
            <div className="plan-alta-hoja">
              {nuevaHoja === null ? (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setNuevaHoja('')}>
                  <Plus size={14} aria-hidden="true" /> hoja
                </button>
              ) : (
                altaDeHoja
              )}
            </div>
          )}
        </section>
        </div>
      </div>

      {/* ══ EL COSTADO: con qué se juzga ══════════════════════════════════ */}
      {costado}
      {ventanas}
    </div>
  );
};
