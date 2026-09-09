import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, FilePlus2, FileUp, Layers, Library, Plus, Trash2 } from 'lucide-react';

import { useApp } from '@/context/AppContext';
import {
  BLOCK_INTENTS,
  MAX_BLOCK_NOTE,
  blocksOf,
  inheritedSessions,
  intentLabel,
  lastWeekNumber,
  planExerciseView,
  sessionDiff,
  structureOfBlock,
} from '@/domain/blocks';
import { mergeCatalog } from '@/domain/catalog';
import { piecesOf } from '@/domain/pieces';
import { buildExercise, cloneExerciseAsTemplate, dayPlannedVolume } from '@/domain/training';
import { clampInt } from '@/lib/num';
import { clientPath } from '@/routes';
import { EmptyState, RenombrarEnSitio } from '@/components/ui/primitives';
import { MenuAcciones } from '@/components/ui/MenuAcciones';
import { ConditionsNote } from '@/components/conditions/ConditionsNote';
import { BibliotecaDelCliente } from './BibliotecaDelCliente';
import { EscribirHoja } from './EscribirHoja';

/**
 * EL COMPOSITOR: componer es un sitio, no un momento.
 *
 * ══ El diagnóstico ═════════════════════════════════════════════════════════
 * Entreno hacía TRES trabajos en una superficie —componer, consultar y leer— y
 * el mobiliario de componer estaba puesto encima de los otros dos. El material
 * —su maquinaria, sus condicionantes, su historial, tus piezas— sirve para
 * ACORDARSE MIENTRAS DECIDES; después de decidido, estorba. Así que se muda
 * entero aquí, y aquí es el único sitio donde aparece.
 *
 * ══ La anatomía, aprendida de Coachway ═════════════════════════════════════
 * Su creador de programas es lo mejor que tienen, y su forma es la correcta:
 *
 *   cabecera:  ← volver · el nombre · el estado · guardar
 *   izquierda: la biblioteca, fija, con buscador — de ahí salen los ejercicios
 *   centro:    las sesiones como pastillas, y la abierta con sus filas
 *
 * Lo que teníamos era un FORMULARIO: nombre, duración, intención y nota
 * ocupaban el primer tercio de la pantalla, y el plan —que es el trabajo—
 * quedaba al fondo en una tarjeta pequeña. Ahora las características viven en
 * la cabecera, que es donde se leen sin ocupar sitio, y la pantalla es el plan.
 *
 * ══ Lo que NO se le copia ══════════════════════════════════════════════════
 * Su biblioteca es un almacén de 1.772 ejercicios de nadie; la nuestra es ESTE
 * cliente, con lo que ha levantado en cada fila. Su bloque nace siempre vacío;
 * el nuestro sabe heredar el anterior y enseñar el diff. Y su Draft/Publish es
 * un binario: nuestro tramo dice desde cuándo y hasta cuándo, que es más.
 */

/** Las hojas, tal y como las lee la hoja de escribir. */
const comoVista = (hoja) => ({
  dayName: hoja.dayName,
  exercises: (hoja.exercises || []).map(planExerciseView),
});

export const Compositor = () => {
  const {
    activeClient,
    workoutData,
    exerciseLibrary,
    catalogExercises,
    coachPrefs,
    startBlockWithPlan,
    upsertLibraryExercise,
  } = useApp();
  const navigate = useNavigate();

  /* De dónde nace el bloque: `null` mientras no se ha elegido puerta. */
  const [origen, setOrigen] = useState(null);
  const [eligiendoPieza, setEligiendoPieza] = useState(false);

  /* Las características, y el plan que se está montando. Todo local hasta que
     se cierra el bloque anterior y se abre este: hasta entonces no hay nada
     escrito en ninguna parte. */
  const [nombre, setNombre] = useState('');
  const [intencion, setIntencion] = useState(null);
  const [previstos, setPrevistos] = useState(null);
  const [nota, setNota] = useState('');
  const [sesiones, setSesiones] = useState([]);
  const [abierta, setAbierta] = useState(null);
  const [nuevaHoja, setNuevaHoja] = useState(null);
  const [renombrando, setRenombrando] = useState(false);

  const program = workoutData[activeClient?.id];
  const bloques = blocksOf(program);
  const anterior = bloques[bloques.length - 1];
  const piezas = piecesOf(coachPrefs);

  const library = useMemo(
    () => mergeCatalog(exerciseLibrary, catalogExercises),
    [exerciseLibrary, catalogExercises]
  );
  const heredadas = useMemo(() => inheritedSessions(program, anterior), [program, anterior]);

  const aLaRutina = (busca = '') => navigate(`${clientPath(activeClient.id, 'rutina')}${busca}`);

  /*
    Sin programa no hay bloque siguiente que componer: `startBlockWithPlan`
    cierra el abierto y abre otro, y no hay ninguno que cerrar. El alta de la
    rutina vive en la propia rutina, con sus dos salidas —escribirla o traer el
    fichero—, así que aquí se dice y se devuelve allí.
  */
  if (!activeClient || !program || (program.microcycles || []).length === 0) {
    return (
      <div className="compositor-pagina">
        <EmptyState
          icon={Layers}
          title="Todavía no hay rutina que continuar"
          message="Un bloque nuevo se abre detrás del anterior. Empieza la rutina desde la pantalla de Entreno —escribiéndola o trayendo el fichero— y vuelve aquí para el siguiente."
          action={
            <button type="button" className="btn btn-primary btn-sm" onClick={() => aLaRutina()}>
              Ir a la rutina
            </button>
          }
        />
      </div>
    );
  }

  const ultima = lastWeekNumber(program.microcycles);
  const drills = structureOfBlock(program, anterior).mobilityDrills || [];
  const hereda = origen?.tipo === 'herencia';
  const cambios = hereda ? sessionDiff(heredadas, sesiones) : [];
  const totalSeries = sesiones.reduce(
    (n, s) => n + (s.exercises || []).reduce((k, ex) => k + (ex.sets || []).length, 0),
    0
  );

  /* ── Empezar por una puerta ───────────────────────────────────────────── */

  const empezar = (nuevo) => {
    setOrigen(nuevo);
    setNombre(`Bloque ${bloques.length + 1}`);
    setSesiones(nuevo.sesiones || heredadas);
    setAbierta((nuevo.sesiones || heredadas)[0]?.dayName ?? null);
  };

  /* ── Escribir sobre las hojas de aquí, que aún no están guardadas ─────── */

  const conHoja = (dayName, fn) => setSesiones((ss) => ss.map((s) => (s.dayName === dayName ? fn(s) : s)));
  const conEjercicios = (dayName, fn) => conHoja(dayName, (s) => ({ ...s, exercises: fn(s.exercises || []) }));
  const porNombre = (name) => (ex) => String(ex.name).trim().toLowerCase() === String(name).trim().toLowerCase();

  const anadirEjercicio = (exercise) => {
    if (!abierta) return;
    conEjercicios(abierta, (lista) => [...lista, exercise]);
  };

  const anadirDeLaBiblioteca = (item) =>
    anadirEjercicio(
      buildExercise({ name: item.name, muscle: item.muscle || 'Pecho', numSets: 3, targetReps: '8-10' })
    );

  const quitarEjercicio = (dayName, name) =>
    conEjercicios(dayName, (lista) => lista.filter((ex) => !porNombre(name)(ex)));

  const series = (dayName, name, n) =>
    conEjercicios(dayName, (lista) =>
      lista.map((ex) => {
        if (!porNombre(name)(ex)) return ex;
        const objetivo = clampInt(n, 1, 12, (ex.sets || []).length);
        const sets = [...(ex.sets || [])];
        const ultimaSerie = sets[sets.length - 1];
        while (sets.length < objetivo) sets.push({ ...ultimaSerie, kg: '', reps: '', rir: '' });
        while (sets.length > objetivo && sets.length > 1) sets.pop();
        return { ...ex, sets };
      })
    );

  const reps = (dayName, name, valor) =>
    conEjercicios(dayName, (lista) =>
      lista.map((ex) =>
        !porNombre(name)(ex) ? ex : { ...ex, sets: (ex.sets || []).map((s) => ({ ...s, targetReps: valor })) }
      )
    );

  /* La gramática de serie —enlazar, remate, descanso, alternativas— es plan, y
     aquí el plan es este estado. `undefined` borra la clave, como en el
     dominio. */
  const gramatica = (dayName, name, campos) =>
    conEjercicios(dayName, (lista) =>
      lista.map((ex) => {
        if (!porNombre(name)(ex)) return ex;
        const salida = { ...ex, ...campos };
        Object.keys(campos).forEach((k) => {
          if (campos[k] === undefined || campos[k] === null) delete salida[k];
        });
        return salida;
      })
    );

  const quitarHoja = (dayName) => {
    setSesiones((ss) => {
      const restantes = ss.filter((s) => s.dayName !== dayName);
      if (dayName === abierta) setAbierta(restantes[0]?.dayName ?? null);
      return restantes;
    });
  };

  const ponerPieza = (pieza) => {
    const usados = new Set(sesiones.map((s) => s.dayName));
    let nombreHoja = pieza.name;
    let n = 2;
    while (usados.has(nombreHoja)) nombreHoja = `${pieza.name} ${n++}`;
    setSesiones((ss) => [
      ...ss,
      { dayName: nombreHoja, exercises: (pieza.exercises || []).map(cloneExerciseAsTemplate) },
    ]);
    setAbierta(nombreHoja);
  };

  const guardar = () => {
    const semana = startBlockWithPlan(activeClient.id, {
      name: nombre.trim() || null,
      sessions: sesiones,
      mobilityDrills: drills,
      plannedWeeks: previstos,
      intent: intencion,
      note: nota,
    });
    aLaRutina(semana ? `?s=${semana}` : '');
  };

  /* ── La cabecera: lo que es este bloque, en una línea ─────────────────── */

  const cabecera = (
    <header className="compositor-cab">
      <button type="button" className="entreno-miga-boton is-volver" onClick={() => aLaRutina()}>
        <ArrowLeft size={15} aria-hidden="true" />
        La rutina
      </button>

      {origen === null ? (
        <div className="compositor-say">
          <span className="section-label">Componer</span>
          <h2 className="compositor-titulo">Un bloque nuevo</h2>
        </div>
      ) : (
        <>
          <div className="compositor-say">
            <span className="section-label">Componiendo</span>
            {renombrando ? (
              <RenombrarEnSitio
                value={nombre}
                label="Nombre del bloque"
                onRename={setNombre}
                onDone={() => setRenombrando(false)}
              />
            ) : (
              /* El nombre se toca pulsándolo, como en la línea de bloques: sin
                 lápiz, porque el título ES el gesto. */
              <button
                type="button"
                className="compositor-titulo"
                title="Cambiar el nombre del bloque"
                onClick={() => setRenombrando(true)}
              >
                {nombre}
              </button>
            )}
          </div>

          {/*
            Las características, como chapas en la cabecera y no como un
            formulario: se leen de un vistazo y solo se abren si se van a
            tocar. Ninguna es obligatoria — un bloque puede no jugar a nada y
            durar lo que dure.
          */}
          <MenuAcciones
            label={intencion ? intentLabel(intencion) : 'A qué juega'}
            ariaLabel="A qué juega el bloque"
            clase={`chapa${intencion ? ' is-puesta' : ''}`}
            items={[
              { label: 'Sin decidir', on: !intencion, run: () => setIntencion(null) },
              ...BLOCK_INTENTS.map((i) => ({
                label: i.label,
                on: intencion === i.id,
                run: () => setIntencion(i.id),
              })),
            ]}
          />

          <MenuAcciones
            label={previstos ? `${previstos} microciclos` : 'Abierto'}
            ariaLabel="Duración prevista del bloque"
            clase={`chapa${previstos ? ' is-puesta' : ''}`}
            items={[
              {
                label: 'Abierto · dura hasta que lo cambies',
                on: !previstos,
                run: () => setPrevistos(null),
              },
              null,
              ...[3, 4, 5, 6, 8, 12].map((n) => ({
                label: `${n} microciclos`,
                on: previstos === n,
                run: () => setPrevistos(n),
              })),
            ]}
          />

          <div className="compositor-acciones">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => aLaRutina()}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={sesiones.length === 0}
              onClick={guardar}
            >
              Cerrar «{anterior.name}» y abrir este
            </button>
          </div>
        </>
      )}
    </header>
  );

  /* ── Las tres puertas ─────────────────────────────────────────────────── */

  const puertas = (
    <section className="plan-hoja compositor-puertas" aria-label="De dónde parte el bloque">
      <div className="compositor-puertas-say">
        <span className="section-label">El primer gesto</span>
        <p className="t-sm t-secondary">
          El bloque nuevo se abre detrás de «{anterior.name}», que se cierra en el microciclo {ultima}.
          ¿De qué parte?
        </p>
      </div>

      <div className="compositor-puertas-rejilla">
        <button type="button" className="compositor-puerta is-recomendada" onClick={() => empezar({ tipo: 'herencia' })}>
          <Layers size={20} aria-hidden="true" />
          <span className="compositor-puerta-recom">Lo normal</span>
          <span className="compositor-puerta-t">Heredar «{anterior.name}»</span>
          <span className="compositor-puerta-d">
            Nace siendo el anterior con todo lo suyo dentro, y te va diciendo qué has cambiado.
          </span>
        </button>

        <button type="button" className="compositor-puerta" onClick={() => empezar({ tipo: 'blanco', sesiones: [] })}>
          <FilePlus2 size={20} aria-hidden="true" />
          <span className="compositor-puerta-t">En blanco</span>
          <span className="compositor-puerta-d">
            Un bloque vacío: creas la primera hoja, le pones nombre y le metes sus ejercicios.
          </span>
        </button>

        <button
          type="button"
          className="compositor-puerta"
          disabled={piezas.length === 0}
          onClick={() => setEligiendoPieza(true)}
        >
          <Library size={20} aria-hidden="true" />
          <span className="compositor-puerta-t">Desde una pieza tuya</span>
          <span className="compositor-puerta-d">
            {piezas.length === 0
              ? 'Todavía no has guardado ninguna. Se guardan desde la hoja, en la biblioteca.'
              : `Tus días guardados: ${piezas.length === 1 ? '1 pieza' : `${piezas.length} piezas`}.`}
          </span>
        </button>
      </div>

      {eligiendoPieza && piezas.length > 0 && (
        <div className="compositor-piezas">
          <span className="section-label">Cuál</span>
          <ul className="compositor-piezas-lista">
            {piezas.map((pieza) => (
              <li key={pieza.id}>
                <button
                  type="button"
                  className="compositor-pieza"
                  onClick={() => {
                    setEligiendoPieza(false);
                    empezar({
                      tipo: 'pieza',
                      sesiones: [
                        { dayName: pieza.name, exercises: (pieza.exercises || []).map(cloneExerciseAsTemplate) },
                      ],
                    });
                  }}
                >
                  <span className="compositor-pieza-n">{pieza.name}</span>
                  <span className="compositor-pieza-d">
                    {(pieza.exercises || []).length} ejercicios
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );

  /* ── El plan: las hojas como pastillas y la abierta con sus filas ─────── */

  const hoja = sesiones.find((s) => s.dayName === abierta) || null;
  const vista = hoja ? comoVista(hoja) : null;

  const carrilDeHojas = (
    <div className="hojas-carril" role="tablist" aria-label="Las hojas del bloque">
      {sesiones.map((s) => {
        const suyas = (s.exercises || []).reduce((n, ex) => n + (ex.sets || []).length, 0);
        return (
          <button
            key={s.dayName}
            type="button"
            role="tab"
            aria-selected={s.dayName === abierta}
            className={`hoja-chip${s.dayName === abierta ? ' is-on' : ''}`}
            onClick={() => setAbierta(s.dayName)}
          >
            {s.dayName}
            <span className="hoja-chip-n">{suyas}</span>
          </button>
        );
      })}

      {nuevaHoja === null ? (
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setNuevaHoja('')}>
          <Plus size={15} /> hoja
        </button>
      ) : (
        <form
          className="hoja-alta"
          onSubmit={(e) => {
            e.preventDefault();
            const n = nuevaHoja.trim();
            if (!n || sesiones.some((s) => s.dayName === n)) return;
            setSesiones((ss) => [...ss, { dayName: n, exercises: [] }]);
            setAbierta(n);
            setNuevaHoja(null);
          }}
        >
          <input
            autoFocus
            className="input input-sm"
            value={nuevaHoja}
            placeholder="Empuje, Pierna…"
            aria-label="Nombre de la hoja nueva"
            onChange={(e) => setNuevaHoja(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && setNuevaHoja(null)}
          />
          <button type="submit" className="btn btn-primary btn-sm" disabled={!nuevaHoja.trim()}>
            Añadir
          </button>
        </form>
      )}

      {hoja && (
        <span className="hojas-carril-fin">
          <MenuAcciones
            ariaLabel={`Más acciones de ${hoja.dayName}`}
            clase="btn btn-icon btn-icon-compact"
            items={[
              {
                label: `Quitar «${hoja.dayName}» del bloque`,
                icon: Trash2,
                danger: true,
                run: () => quitarHoja(hoja.dayName),
              },
            ]}
          />
        </span>
      )}
    </div>
  );

  const mesa = (
    <section className="plan-hoja compositor-mesa" aria-label="El plan del bloque">
      {/* De dónde nace y qué le has cambiado: una línea, no una sección. */}
      <div className="compositor-herencia">
        <span>
          {hereda ? (
            <>
              Nace de <b>«{anterior.name}»</b>, que se cierra en el microciclo {ultima}.
            </>
          ) : (
            <>
              Nace {origen?.tipo === 'pieza' ? 'de una pieza tuya' : 'en blanco'}. «{anterior.name}» se
              cierra en el microciclo {ultima}.
            </>
          )}
        </span>
        {hereda && (
          <span className="compositor-diff">
            {cambios.length === 0
              ? 'de momento, igual que él'
              : `${cambios.length} ${cambios.length === 1 ? 'cambio' : 'cambios'}`}
          </span>
        )}
      </div>

      {sesiones.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="El bloque no tiene ninguna hoja"
          message="Una hoja es un día de entreno —Empuje, Tirón, Pierna—. Créala y métele ejercicios desde la biblioteca de la izquierda."
          action={
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setNuevaHoja('')}>
              <Plus size={15} /> Crear la primera hoja
            </button>
          }
        />
      ) : (
        <>
          {carrilDeHojas}
          {vista && (
            <EscribirHoja
              key={vista.dayName}
              dayName={vista.dayName}
              exercises={vista.exercises}
              library={library}
              conCabecera={false}
              onAdd={anadirEjercicio}
              onQuitar={quitarEjercicio}
              onSeries={series}
              onReps={reps}
              onGramatica={gramatica}
              onRecordar={upsertLibraryExercise}
            />
          )}
        </>
      )}

      <div className="compositor-pie">
        <span className="t-xs t-tertiary tnum">
          {sesiones.length} {sesiones.length === 1 ? 'hoja' : 'hojas'} · {totalSeries} series por microciclo
          {hoja ? ` · ${Object.entries(dayPlannedVolume(hoja))
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([g, n]) => `${g.toLowerCase()} ${n}`)
            .join(' · ')}` : ''}
        </span>
        <label className="compositor-nota">
          <span className="label">Qué se persigue</span>
          <input
            className="input"
            value={nota}
            maxLength={MAX_BLOCK_NOTE}
            placeholder="Subir intensidad en los básicos y recortar accesorios"
            onChange={(e) => setNota(e.target.value)}
          />
        </label>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => aLaRutina('?traer=1')}>
          <FileUp size={15} /> Traer de un fichero
        </button>
      </div>
    </section>
  );

  return (
    <div className="compositor-pagina">
      {cabecera}
      {/* Lo que condiciona lo que se decide: aquí es donde importa. */}
      <ConditionsNote area="training" />
      <div className="compositor">
        <BibliotecaDelCliente
          library={library}
          microcycles={program.microcycles || []}
          piezas={piezas}
          hojaAbierta={origen === null ? null : abierta}
          onAnadirEjercicio={origen === null ? null : anadirDeLaBiblioteca}
          onPonerPieza={origen === null ? null : ponerPieza}
        />
        <div className="compositor-centro">{origen === null ? puertas : mesa}</div>
      </div>
    </div>
  );
};
