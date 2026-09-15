import { useState } from 'react';
import { Check, Quote } from 'lucide-react';

import { e1rm, isRecord, isSetLogged, previousSetKey } from '@/domain/sessions';
import { restLabel } from '@/domain/training';
import { MarcaFicha } from '@/components/ui/MarcaFicha';

/**
 * LA HOJA DEL CLIENTE EN EL ESCRITORIO: el día como TABLA.
 *
 * ══ Por qué existe ═════════════════════════════════════════════════════════
 *
 * Porque el portal montaba `ExerciseList` en los dos aparatos. `ExerciseList`
 * pinta cada serie como una tarjeta con tres cajas grandes —la forma correcta
 * para el pulgar— y en un monitor es lo contrario de lo que sirve: seis fichas
 * apiladas, cada una repitiendo sus rótulos, con el nombre del ejercicio a un
 * lado y sus cifras al otro y el hueco entre los dos creciendo con la pantalla.
 * Eso es lo que el dueño vio: *«en la vista del pc el entreno sale deformado»*.
 *
 * El entrenador ya había resuelto esto mismo para sí (`HojaDeSeries`), pero su
 * hoja es de PROGRAMAR: lleva reordenar, duplicar, excepciones del microciclo y
 * los rótulos repetidos por ejercicio. Aquí no se programa nada — se anota lo
 * que se acaba de levantar— así que la pieza es otra, con la misma gramática:
 *
 *     TE PIDE (kg · reps · RIR)  ‖  HAS HECHO (kg · reps · RIR)
 *
 * ══ Una tabla, y no seis tarjetas ══════════════════════════════════════════
 *
 * El ejercicio es el RÓTULO de sus series: fila propia, a todo lo ancho, y
 * debajo van las suyas. Así no queda hueco entre el nombre y las cifras.
 *
 * Y los rótulos de columna se escriben UNA vez, arriba, y se quedan pegados al
 * bajar. Esa es la respuesta de verdad a «no se entiende qué va dónde»: no
 * repetirlos en cada ejercicio —seis veces lo mismo— sino que no se vayan.
 *
 * ── Lo pedido tiene casilla; lo hecho es un renglón ────────────────────────
 * Esa diferencia de superficie es la que separa las dos mitades sin gastar más
 * tinta que la costura. Y una repetición por debajo de la que te pidieron se
 * pinta en negativo: es lo único de esta hoja que hay que ver sin leer. No es
 * un juicio —la app no receta—, es el dato que su entrenador va a mirar.
 */

/* Los tres campos que anota quien entrena, en el orden en que se teclean. Es la
   misma lista que `SetCell`, y por la misma razón que allí: el día que entre
   «tempo» tiene que aparecer en los dos sitios. */
const CAMPOS = [
  { key: 'kg', unit: 'kg', mode: 'decimal' },
  { key: 'reps', unit: 'reps', mode: 'numeric' },
  { key: 'rir', unit: 'rir', mode: 'numeric' },
];

/** Lo pautado para un campo, tal cual se escribió: «100», «8-10», «2». */
const pedido = (set, key) => {
  const valor = { kg: set?.targetKg, reps: set?.targetReps, rir: set?.targetRir }[key];
  const texto = String(valor ?? '').trim();
  return texto || null;
};

/**
 * Cuál de las series de un ejercicio es EL récord, o -1.
 *
 * Una sola, y es la misma cuenta que hace `ExerciseList`: pasarse del listón lo
 * hacen a veces las tres series de un ejercicio, y tres marcas encendidas no
 * dicen «has batido tu marca», dicen que la marca estaba mal puesta.
 */
const indiceDelRecord = (exercise, mejor) => {
  if (!mejor) return -1;
  let indice = -1;
  let tope = 0;
  (exercise.sets || []).forEach((set, i) => {
    if (!isSetLogged(set) || !isRecord(set, mejor)) return;
    const marca = e1rm(set.kg, set.reps);
    if (marca > tope) {
      tope = marca;
      indice = i;
    }
  });
  return indice;
};

/**
 * ¿Se ha quedado corto en repeticiones?
 *
 * Solo con el rango delante y solo en `reps`: los kilos por debajo pueden ser la
 * progresión que su entrenador le pidió, y un RIR bajo es lo contrario de ir
 * corto. El mínimo de «8-10» es 8; el de «8», 8.
 */
const porDebajo = (set, key, valor) => {
  if (key !== 'reps') return false;
  const rango = pedido(set, 'reps');
  const minimo = Number(String(rango ?? '').match(/\d+/)?.[0]);
  const hecho = Number(valor);
  return Number.isFinite(minimo) && Number.isFinite(hecho) && hecho > 0 && hecho < minimo;
};

/**
 * Una serie: lo que te pide a la izquierda, lo que has hecho a la derecha.
 *
 * El disco del final hace dos trabajos, como en el teléfono: mientras falta y
 * hay vez anterior es el BOTÓN de «lo mismo que entonces»; hecha, es el visto.
 */
const FilaDeSerie = ({ set, index, exerciseName, showRir, previous, record, onChange, onConfirm }) => {
  const hecha = isSetLogged(set);
  const puedeRepetir = !hecha && previous?.kg && previous?.reps && onConfirm;

  return (
    <div className={`hcl-fila${hecha ? ' is-hecha' : ''}${record ? ' es-record' : ''}`}>
      <span className="hcl-i">Serie {index + 1}</span>

      {CAMPOS.map((campo) => {
        /* La columna del RIR no se retira cuando el protocolo lo apaga: la
           rejilla es la misma para la cabecera y para todas las filas, y una
           columna que desaparece en unas filas y no en otras descuadra la hoja
           entera. Se queda vacía, que es lo que dice la verdad — no se pauta. */
        const visible = showRir || campo.key !== 'rir';
        /* Y sin RIR pautado, la casilla tampoco se dibuja: `.hcl-pide` pinta el
           fondo gris de «esto te lo piden», así que una vacía era una casilla
           gris de sesenta y cuatro píxeles, sin rótulo encima —la cabecera deja
           ese hueco en blanco— y repetida en las veintiuna series de la sesión.
           Se leía como un campo roto. La columna sigue existiendo, que es lo que
           mantiene cuadrada la rejilla; lo que se va es su relleno. */
        if (!visible) return <span key={campo.key} aria-hidden="true" />;
        return (
          <span className="hcl-pide" key={campo.key}>
            {pedido(set, campo.key) || '—'}
          </span>
        );
      })}

      <span className="hcl-costura" aria-hidden="true" />

      {CAMPOS.map((campo) => {
        if (!showRir && campo.key === 'rir') return <span key={campo.key} aria-hidden="true" />;
        const valor = set[campo.key] ?? '';
        const antes = previous?.[campo.key];
        return (
          <span className="hcl-hizo" key={campo.key}>
            <input
              type="text"
              inputMode={campo.mode}
              className={`hcl-campo${porDebajo(set, campo.key, valor) ? ' es-baja' : ''}`}
              /* La vez anterior como marcador, igual que en el teléfono: está
                 donde se necesita —justo antes de escribir la cifra— y no se
                 guarda. Unos kilos que nadie ha levantado son indistinguibles
                 de los reales en cuanto se escriben. */
              placeholder={antes || '—'}
              value={valor}
              aria-label={`${exerciseName}, serie ${index + 1}, ${campo.unit}`}
              onChange={(e) => onChange(campo.key, e.target.value)}
            />
          </span>
        );
      })}

      {puedeRepetir ? (
        <button
          type="button"
          className="hcl-tick es-boton"
          onClick={() => onConfirm(previous)}
          title="Igual que la vez anterior"
          aria-label={`${exerciseName}, serie ${index + 1}: apuntar lo mismo que la vez anterior, ${previous.kg} kg por ${previous.reps}`}
        >
          <Check size={13} strokeWidth={3} aria-hidden="true" />
        </button>
      ) : (
        <span className={`hcl-tick${hecha ? ' es-hecha' : ''}`} aria-hidden="true">
          {hecha && <Check size={13} strokeWidth={3} />}
        </span>
      )}
    </div>
  );
};

export const HojaDelCliente = ({
  exercises = [],
  /* El nombre del día y sus series: es el rótulo de la primera columna de la
     cabecera, que es la única que no nombra una cifra. */
  dayName = '',
  emptyMessage = 'Tu entrenador no ha programado ejercicios en este día.',
  showRir = false,
  showNotes = false,
  onSetChange,
  onConfirmSet = null,
  /* Los dos mapas del dominio. Y aquí NO llega `onCampoFoco`: la pastilla del
     pulgar es del teléfono, donde se escribe con una mano y el teclado tapa la
     mitad de la pantalla. Con teclado no hace falta nada de eso. */
  previousSets = null,
  bestSets = null,
  /* La ficha del ejercicio —el vídeo y las pautas de su entrenador— si la ha
     puesto. Como en el teléfono: sin ficha, el nombre no lleva marca. */
  sheetOf = null,
  onOpenSheet = null,
  /*
    ══ SU CUADERNO, EJERCICIO A EJERCICIO (13 sep 2026) ══════════════════════

    El dueño, con la rutina del PC delante: *«tampoco veo dónde puede él mismo
    anotar sus propias pautas»*. Y no lo veía porque no estaba: escribir una
    nota en un ejercicio solo se podía desde la FICHA, y la ficha únicamente
    existe si su entrenador le puso un vídeo o una indicación (regla de la
    0098). En un día de seis ejercicios sin vídeo no había una sola puerta.

    En el teléfono sí la hay —`ExerciseList` lleva su «+ nota» junto al
    nombre—, así que esto no estrena ni concepto ni escritura: es la misma
    `log_exercise_note` (0119) y el mismo sitio, el rótulo del ejercicio.

    `puedeAnotar` es lo que ya decide `ClientDay` (`canAnnotate`): hay sesión y
    no es heredada. Sin él no se ofrece nada —una caja de texto que no puede
    guardar es peor que no tenerla— pero lo ya escrito se sigue leyendo.
  */
  puedeAnotar = false,
  onNota = null,
}) => {
  /*
    Qué ejercicio tiene el campo abierto SIN nota todavía. Lo mismo que hace
    `ExerciseList`, y por lo mismo: uno con nota escrita la enseña siempre —no
    se esconde lo que ya has dicho— y uno sin nota no gasta una línea hasta que
    se pide. Así la nota es de verdad opcional.
  */
  const [notaAbierta, setNotaAbierta] = useState(null);

  if (exercises.length === 0) {
    return <p className="hcl-vacio t-sm t-secondary">{emptyMessage}</p>;
  }

  const series = exercises.reduce((total, ex) => total + (ex.sets?.length || 0), 0);

  return (
    <div className="hcl">
      {/*
        ══ LA CABECERA SE ESCRIBE UNA VEZ ════════════════════════════════════

        Y se queda pegada arriba al bajar. Por eso la tarjeta NO lleva
        `overflow: hidden`: se lo comería y el pegajoso quedaría de adorno.
      */}
      <div className="hcl-cab">
        <span className="hcl-g es-dia">
          {dayName}
          {series > 0 && <b>{`· ${series} series`}</b>}
        </span>
        <span className="hcl-g es-izq">Te pide</span>
        <span className="hcl-costura es-cab" aria-hidden="true" />
        <span className="hcl-g es-der">Has hecho</span>
        {CAMPOS.map((campo) => (
          <span className="hcl-k" key={`pide-${campo.key}`}>
            {showRir || campo.key !== 'rir' ? campo.unit : ''}
          </span>
        ))}
        {CAMPOS.map((campo) => (
          <span className="hcl-k" key={`hizo-${campo.key}`}>
            {showRir || campo.key !== 'rir' ? campo.unit : ''}
          </span>
        ))}
        <span aria-hidden="true" />
      </div>

      {exercises.map((ex) => {
        const ficha = sheetOf?.(ex) || null;
        const nota = showNotes ? ex.coachNote?.trim() : '';
        const descanso = Number(ex.restSeconds) > 0 ? restLabel(Number(ex.restSeconds)) : null;
        const hechas = (ex.sets || []).filter(isSetLogged).length;
        /* Su mejor marca hasta hoy, para reconocer la serie que la bate. Los
           dos mapas vienen del dominio (`previousSetsBefore`, `bestSetsBefore`)
           y son `Map`, no objetos: se leen con `get`. */
        const mejor = bestSets?.get?.(ex.name) || null;
        const elRecord = indiceDelRecord(ex, mejor);
        /* Su cuaderno de este ejercicio: con texto se enseña siempre, vacío
           solo si acaba de pedirlo. Ver `notaAbierta`. */
        const suya = String(ex.clientNote ?? '');
        const abiertaLaNota = notaAbierta === ex.id || suya.trim().length > 0;

        return (
          /*
            Cada ejercicio va envuelto en su grupo, y no por maquetación: el
            rótulo se queda pegado debajo de la cabecera mientras dura SU
            ejercicio, y dos pegajosos hermanos al mismo borde se APILAN en vez
            de empujarse. Dentro de su grupo, el rótulo se va con él.
          */
          <div className="hcl-grupo" key={ex.id}>
            <div className="hcl-ejer">
              <p className="hcl-n">
                {/*
                  ══ EL NOMBRE ES UN DATO; LA PUERTA ES LA MARCA ══════════════

                  Aquí el nombre entero era un botón en acento que se subrayaba
                  al pasar por encima. Dos cosas mal, y las dos se ven sin
                  saberlas nombrar: **el azul invita a pulsar y no se pinta
                  sobre un dato** (`ley-del-color`), y un nombre de ejercicio lo
                  es; y prometía un vídeo también cuando detrás solo había una
                  nota. El dueño, el 13 de septiembre: *«los vídeos con enlace
                  de la rutina deberían tener simplemente un icono de cadena o
                  link al lado del texto y ya»*.

                  Es la MISMA marca que la tabla ancha del entrenador —cadena si
                  hay vídeo, comillas si solo hay pautas, ángulo si lo que hay
                  es lo tuyo—. Una pieza, dos monturas. Ver `ui/MarcaFicha`.

                  Sin ficha no hay marca: la regla de la 0098 —si no lo pone el
                  entrenador, no existe.
                */}
                <span className="hcl-nombre">{ex.name}</span>
                {onOpenSheet && <MarcaFicha ficha={ficha} onOpen={() => onOpenSheet(ex)} />}
                <span className="hcl-d">
                  {[
                    `${ex.sets?.length || 0} series`,
                    descanso ? `descanso ${descanso}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
                {/* Un hecho, no un veredicto: cuántas de las suyas llevas. Se
                    retira sola cuando no has empezado, que es la ley del
                    reposo — lo que no ha pasado no ocupa sitio. */}
                {hechas > 0 && (
                  <span className="hcl-chip">
                    {hechas === (ex.sets?.length || 0) ? 'anotada' : `${hechas} anotadas`}
                  </span>
                )}
                {/* Pedir la nota vive con el NOMBRE, igual que en el teléfono:
                    es decir algo sobre este ejercicio, no una acción sobre la
                    tabla. Y desaparece en cuanto hay nota, porque entonces el
                    campo ya está abierto debajo — un botón que no puede hacer
                    nada es peor que no tenerlo. */}
                {puedeAnotar && onNota && !abiertaLaNota && (
                  <button
                    type="button"
                    className="note-add"
                    onClick={() => setNotaAbierta(ex.id)}
                    aria-label={`Añadir una nota a ${ex.name}`}
                  >
                    + nota
                  </button>
                )}
              </p>
            </div>

            {/* La nota del entrenador va FUERA del rótulo y no se pega: un
                pegajoso tiene que medir siempre lo mismo, y una nota de tres
                líneas al lado de un rótulo de una se asoma por debajo del
                siguiente. */}
            {nota && (
              <p className="hcl-nota">
                <Quote size={13} className="icon-inline" aria-hidden="true" />
                {nota}
              </p>
            )}

            {/* Y LA SUYA, debajo de la de él. El orden importa: la indicación
                del entrenador es la condición del ejercicio y se lee antes; lo
                que tú apuntas es lo que le contestas. Se guarda tecleando, como
                todo lo demás de esta hoja. */}
            {abiertaLaNota &&
              (puedeAnotar && onNota ? (
                <label className="hcl-cuaderno">
                  <span className="section-label">Tu nota</span>
                  <textarea
                    className="textarea"
                    rows={2}
                    autoFocus={notaAbierta === ex.id}
                    placeholder="La verá tu entrenador. Ej: el hombro derecho ha molestado en la última."
                    value={suya}
                    onChange={(e) => onNota(ex, e.target.value)}
                  />
                </label>
              ) : (
                <p className="hcl-nota es-tuya">
                  <Quote size={13} className="icon-inline" aria-hidden="true" />
                  {suya}
                </p>
              ))}

            {(ex.sets || []).map((set, i) => (
              <FilaDeSerie
                key={`${ex.id}:${i}`}
                set={set}
                index={i}
                exerciseName={ex.name}
                showRir={showRir}
                previous={previousSets?.get?.(previousSetKey(ex.name, i)) || null}
                record={i === elRecord}
                onChange={(field, value) => onSetChange(ex.id, i, field, value)}
                onConfirm={
                  onConfirmSet ? (anterior) => onConfirmSet(ex.id, i, anterior) : null
                }
              />
            ))}
          </div>
        );
      })}
    </div>
  );
};
