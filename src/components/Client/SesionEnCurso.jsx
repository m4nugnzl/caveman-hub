import { useState } from 'react';
import { Check, ChevronRight, Minus, Plus } from 'lucide-react';

import { isRecord, isSetLogged, previousSetKey } from '@/domain/sessions';
import { round, toNum } from '@/lib/num';
import { MarcaFicha } from '@/components/Coach/Workout/ExerciseList';

/**
 * ══ EL MODO ENTRENO ═════════════════════════════════════════════════════════
 *
 * Registrar una sesión en el teléfono, un ejercicio cada vez.
 *
 * ── Qué estaba mal ──────────────────────────────────────────────────────────
 * La misma lista para las dos cosas que se hacen aquí, que no son la misma:
 * **repasar el día** (quince ejercicios, una ojeada) y **apuntar la serie que
 * acabas de hacer** (tres números, de pie, con una mano y el pulso alto). La
 * segunda ocurre sesenta veces por sesión y estaba resuelta como la primera:
 * una tabla larga por la que hay que buscar dónde ibas cada vez que levantas la
 * vista del móvil.
 *
 * ── Lo que hace este componente ─────────────────────────────────────────────
 *
 *   · **Un ejercicio a la vez**, con el carril de todos arriba: qué llevas
 *     hecho, dónde estás y a cuál saltas, en una sola fila que no se pierde.
 *   · **La serie viva, alzada**, con sus tres números en grande y un − y un +
 *     a cada lado. El paso es el del gimnasio: 2,5 kg, una repetición, un RIR.
 *     Y el campo sigue siendo un campo: lo que cambia mucho se escribe, lo que
 *     cambia poco se toca.
 *   · **Nada se cierra con llave.** Una serie hecha es una fila que se vuelve a
 *     abrir tocándola, con sus valores dentro. Cerrar es una marca, no un
 *     candado — quien se equivoca al apuntar (y se equivoca, con el pulso a
 *     160) tiene que poder corregir en el sitio, no deshacer un trámite.
 *
 * ── Y el vacío parte de la vez anterior ─────────────────────────────────────
 * El primer toque en un campo en blanco no pone 2,5 kg: pone lo que levantaste
 * la última vez en ESA serie. Es donde empieza a pensar cualquiera que entrena
 * un bloque, y es la misma idea que ya tenía el ✓ de «igual que la vez
 * anterior» —que sigue estando, para las series que no cambian—.
 *
 * ── Solo en el teléfono ─────────────────────────────────────────────────────
 * En escritorio se queda la lista entera (`ExerciseList`): ahí caben los
 * ejercicios a la vez, se comparan de un vistazo y los campos ya son editables
 * sin gesto ninguno. Es el mismo reparto que ya hace la lista para programar.
 */

/** El paso de cada campo, en las unidades del gimnasio. */
const PASO = { kg: 2.5, reps: 1, rir: 1 };

const CAMPOS = [
  { key: 'kg', rotulo: 'kg', modo: 'decimal', nombre: 'kilos' },
  { key: 'reps', rotulo: 'reps', modo: 'numeric', nombre: 'repeticiones' },
  { key: 'rir', rotulo: 'RIR', modo: 'numeric', nombre: 'RIR' },
];

/** «55 kg · 6 · RIR 0», y los huecos dichos como huecos. */
const resumenDeSerie = (set, showRir) => {
  const partes = [
    set.kg ? `${set.kg} kg` : null,
    set.reps ? `${set.reps} reps` : null,
    showRir && set.rir !== '' && set.rir != null ? `RIR ${set.rir}` : null,
  ].filter(Boolean);
  return partes.length > 0 ? partes.join(' · ') : '—';
};

/**
 * La serie abierta: los tres campos con su − y su +, y el botón que la cierra.
 */
const SerieAbierta = ({
  index,
  set,
  previo,
  objetivo,
  showRir,
  esCorreccion,
  onAjustar,
  onEscribir,
  onIgual,
  onCerrar,
}) => {
  const campos = CAMPOS.filter((c) => c.key !== 'rir' || showRir);
  const hecha = isSetLogged(set);
  const puedeRepetir = !hecha && previo?.kg && previo?.reps;

  return (
    <div className="serie-abierta">
      <div className="serie-abierta-cab">
        <span className="n">Serie {index + 1}</span>
        {objetivo && <span className="obj">objetivo {objetivo}</span>}
      </div>

      <div className="serie-pasos">
        {campos.map((campo) => (
          <div className="serie-paso" key={campo.key}>
            <span className="k">{campo.rotulo}</span>
            <div className="paso">
              <button
                type="button"
                onClick={() => onAjustar(campo.key, -1)}
                aria-label={`Bajar ${campo.nombre}`}
              >
                <Minus size={15} aria-hidden="true" />
              </button>
              {/* Sigue siendo un campo: de 40 a 100 kg se escribe, no se toca
                  veinticuatro veces. `inputMode` y la coma decimal, como en el
                  resto del producto (ver `lib/num.toNum`). */}
              <input
                type="text"
                inputMode={campo.modo}
                className="paso-campo"
                placeholder={previo?.[campo.key] || '—'}
                value={set[campo.key] ?? ''}
                onChange={(e) => onEscribir(campo.key, e.target.value)}
                aria-label={
                  previo?.[campo.key]
                    ? `Serie ${index + 1}: ${campo.nombre}. La vez anterior, ${previo[campo.key]}`
                    : `Serie ${index + 1}: ${campo.nombre}`
                }
              />
              <button
                type="button"
                onClick={() => onAjustar(campo.key, 1)}
                aria-label={`Subir ${campo.nombre}`}
              >
                <Plus size={15} aria-hidden="true" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="serie-abierta-pie">
        <span className="ult">
          {previo?.kg
            ? `La vez anterior: ${previo.kg} kg · ${previo.reps}`
            : 'Es la primera vez que haces esta serie'}
        </span>
        {puedeRepetir && (
          <button
            type="button"
            className="chip"
            onClick={onIgual}
            aria-label={`Apuntar lo mismo que la vez anterior: ${previo.kg} kg por ${previo.reps}`}
          >
            Repetir
          </button>
        )}
      </div>

      {/*
        Deshabilitado sin repeticiones a propósito, y no «rellena solas las de
        la vez anterior»: una serie que nadie ha levantado y unos kilos reales
        tienen que ser distinguibles en la analítica. Para repetir lo de
        entonces está el botón que lo dice.
      */}
      <button
        type="button"
        className="btn btn-primary btn-block"
        disabled={!hecha}
        onClick={onCerrar}
      >
        {esCorreccion ? 'Listo' : 'Hecha'}
      </button>
    </div>
  );
};

export const SesionEnCurso = ({
  exercises,
  onSetChange,
  onConfirmSet,
  previousSets = null,
  bestSets = null,
  showRir = false,
  sheetOf = null,
  onOpenSheet = null,
  emptyMessage = 'Tu entrenador no ha programado ejercicios en este día.',
}) => {
  /* Las dos son PREFERENCIAS, no la verdad: dónde está y qué serie está abierta
     se derivan abajo contra lo que de verdad hay registrado. Es el mismo
     criterio que `useDaySession` con la sesión elegida, y por el mismo motivo:
     una elección guardada sobrevive al dato que la justificaba. */
  const [elegido, setElegido] = useState(null);
  const [corrigiendo, setCorrigiendo] = useState(null);

  if (!exercises || exercises.length === 0) {
    return <p className="t-sm t-secondary">{emptyMessage}</p>;
  }

  /* Dónde está: el ejercicio que eligió en el carril mientras exista, y si no
     el primero que tenga series sin registrar — que es dónde iba. Con todo
     hecho, el último: la sesión terminada se queda enseñando el final. */
  const sinTerminar = exercises.findIndex((ex) => (ex.sets || []).some((s) => !isSetLogged(s)));
  const elegidoIdx = exercises.findIndex((ex) => ex.id === elegido);
  const idx = elegidoIdx >= 0 ? elegidoIdx : sinTerminar >= 0 ? sinTerminar : exercises.length - 1;

  const ex = exercises[idx];
  const sets = ex.sets || [];
  const siguiente = exercises[idx + 1] || null;

  /* Qué serie está abierta: la que abrió a mano para corregir, o la primera
     que falta. `-1` significa que este ejercicio ya está entero. */
  const enCorreccion = corrigiendo?.exId === ex.id && sets[corrigiendo.index] !== undefined;
  const abierta = enCorreccion ? corrigiendo.index : sets.findIndex((s) => !isSetLogged(s));

  const previoDe = (i) => previousSets?.get(previousSetKey(ex.name, i)) || null;
  const mejor = bestSets?.get(ex.name);

  const irA = (id) => {
    setElegido(id);
    setCorrigiendo(null);
  };

  /*
    ══ Dónde estás es DONDE HAS TOCADO ALGO ═══════════════════════════════════

    Sin esto, cerrar la última serie de un ejercicio te teletransportaba al
    siguiente: la pantalla se derivaba de «el primero que tenga series sin
    registrar», y al completarse este, ese pasaba a ser el de al lado. El
    ejercicio se cambiaba solo, sin decirlo, justo después del gesto — y con la
    pantalla ya cambiada no había forma de ver que la serie se había apuntado.

    Tocar cualquier cosa de un ejercicio lo fija. Terminarlo deja la pantalla
    donde está, con el recuento entero a la vista, y la salida pasa a ser una
    puerta que se pulsa (`.sesion-siguiente`). Nada se mueve solo debajo del
    dedo, que en una pantalla que se usa entre serie y serie es media pieza.
  */
  const tocar = () => setElegido(ex.id);

  const ajustar = (i, key, signo) => {
    tocar();
    const actual = toNum(sets[i]?.[key]);
    const previo = toNum(previoDe(i)?.[key]);
    /* El campo vacío no arranca en cero: arranca en lo que levantó la última
       vez. Sin referencia, el primer «+» vale un paso y el primer «−», nada. */
    const nuevo =
      actual === null
        ? previo ?? Math.max(0, signo * PASO[key])
        : Math.max(0, round(actual + signo * PASO[key], 1));
    onSetChange(ex.id, i, key, String(nuevo));
  };

  const hechas = sets.filter(isSetLogged).length;

  return (
    <div className="sesion-viva">
      {/* El carril: el mapa del día y el salto, en una sola fila. Se arrastra a
          lo ancho, así que se marca para que el gesto no cambie además de hoja
          (ver `lib/useDeslizar`). */}
      <nav className="sesion-carril" aria-label="Ejercicios de la sesión" data-sin-deslizar>
        {exercises.map((otro, i) => {
          const suyas = otro.sets || [];
          const entero = suyas.length > 0 && suyas.every(isSetLogged);
          return (
            <button
              key={otro.id}
              type="button"
              className={`chip${entero ? ' is-entero' : ''}`}
              aria-pressed={i === idx}
              onClick={() => irA(otro.id)}
            >
              {entero && <Check size={13} aria-hidden="true" />}
              {otro.name}
            </button>
          );
        })}
      </nav>

      <header className="sesion-ejercicio">
        <div className="col">
          <div className="name-linea">
            <h4 className="n">{ex.name}</h4>
            <MarcaFicha ficha={sheetOf?.(ex.name)} onOpen={() => onOpenSheet?.(ex.name)} />
          </div>
          <span className="m">
            {[ex.muscle, `${hechas} de ${sets.length} series`].filter(Boolean).join(' · ')}
          </span>
        </div>
        <span className="pos">
          {idx + 1} de {exercises.length}
        </span>
      </header>

      <div className="sesion-series">
        {sets.map((set, i) => {
          if (i === abierta) {
            return (
              <SerieAbierta
                key={i}
                index={i}
                set={set}
                previo={previoDe(i)}
                objetivo={set.targetReps}
                showRir={showRir}
                esCorreccion={enCorreccion}
                onAjustar={(key, signo) => ajustar(i, key, signo)}
                onEscribir={(key, value) => {
                  tocar();
                  onSetChange(ex.id, i, key, value);
                }}
                onIgual={() => {
                  tocar();
                  onConfirmSet?.(ex.id, i, previoDe(i));
                  setCorrigiendo(null);
                }}
                onCerrar={() => {
                  tocar();
                  setCorrigiendo(null);
                }}
              />
            );
          }

          if (isSetLogged(set)) {
            const record = mejor && isRecord(set, mejor);
            return (
              <button
                key={i}
                type="button"
                className="serie-hecha"
                onClick={() => {
                  tocar();
                  setCorrigiendo({ exId: ex.id, index: i });
                }}
                aria-label={`Serie ${i + 1}, hecha. Tocar para corregir`}
              >
                <span className="t">{record ? 'PR' : <Check size={13} strokeWidth={3} />}</span>
                <span className="v">{resumenDeSerie(set, showRir)}</span>
                <span className="c">corregir</span>
              </button>
            );
          }

          return (
            <div className="serie-libre" key={i}>
              <span className="t">{i + 1}</span>
              <span className="v">
                {set.targetReps ? `objetivo ${set.targetReps}` : 'sin registrar'}
              </span>
            </div>
          );
        })}
      </div>

      {/* Terminado el ejercicio, la salida es el siguiente. Sin esto, acabar
          una serie deja la pantalla sin nada que hacer y hay que volver al
          carril a buscar dónde seguía. */}
      {abierta === -1 && siguiente && (
        <button type="button" className="sesion-siguiente" onClick={() => irA(siguiente.id)}>
          <span className="col">
            <span className="t-xs t-tertiary">Después</span>
            <strong>{siguiente.name}</strong>
          </span>
          <ChevronRight size={15} aria-hidden="true" />
        </button>
      )}
    </div>
  );
};
