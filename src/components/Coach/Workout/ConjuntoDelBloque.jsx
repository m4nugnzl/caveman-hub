import { useEffect, useRef, useState } from 'react';
import { Bookmark, ClipboardPaste, Copy, FileUp, GripVertical, Layers, Pencil, Plus, Trash2, Zap } from 'lucide-react';

import {
  blockPlan,
  esquemaDicho,
  hasBlockPlan,
  isCurrentBlock,
  microcicloDelBloque,
  nombresDeLaHoja,
  pautaHeredada,
  queDifiere,
  setsDesdeTramos,
  tramosDeSeries,
  untrainedWeeksOfDay,
  weeksOfBlock,
} from '@/domain/blocks';
import {
  MUSCLE_GROUPS,
  WEEK_DAYS,
  buildExercise,
  normalizaMicrociclo,
  findMicrocycle,
  ponerDia,
  pesoPautado,
  rematesDe,
  unitInitial,
  unitIsFeminine,
  tecnicaFrase,
  unitLabel,
  unitLabelPlural,
} from '@/domain/training';
import { executedSessions, resumenDeEntrada, sessionSetCount, ultimaSesionDeHoja } from '@/domain/sessions';
import { localeNumber, weekdayName } from '@/lib/dates';
import { clampInt } from '@/lib/num';
import { norm } from '@/lib/texto';
import { Autocomplete } from '@/components/ui/Autocomplete';
import { MenuAcciones } from '@/components/ui/MenuAcciones';
import { EmptyState, RenombrarEnSitio } from '@/components/ui/primitives';
import { CambiarEjercicio } from './CambiarEjercicio';
import { TIPO, useZonasDeSoltar } from '@/lib/portapapeles';
import { useArrastreDeFicheros } from '@/lib/useArrastreDeFicheros';
import { ZonaDeSoltar } from '@/components/ui/ZonaDeSoltar';
import { useCambiosDelMicrociclo } from './EditorDelMicrociclo';

/**
 * EL BLOQUE EN CONJUNTO: sus hojas, su estructura y su información, a la vez.
 *
 * ══ Volvió, y por qué ══════════════════════════════════════════════════════
 * Esta vista se retiró el 9 de septiembre —el dueño había elegido «Efort puro»,
 * una sola pantalla por hoja— y la echó de menos el mismo día: «no hay nada que
 * me permita ver el bloque entero, su estructura y su información, como estaba
 * antes y como está en producción, que me gustaba y me era cómodo para
 * planificar y sacar conclusiones».
 *
 * Y su queja anterior —«no puedo editar nada»— no era contra ESTA vista sino
 * contra la que la sustituyó durante dos días: aquí las series y las
 * repeticiones son campos, hay papelera por ejercicio y «+ ejercicio» por hoja.
 * Se escribe el plan del bloque desde el conjunto, que es de lo que se trata.
 *
 * ══ Dónde vive ahora: es el cuarto de al lado ══════════════════════════════
 * Ya no es la puerta de Entreno. Se entra por una HOJA —«lo suyo sería entrar
 * en entreno, tener la hoja, y poder entrar a la vista de bloque si quieres»—
 * y esto es `?v=bloque`, a un verbo de distancia en la cabecera («El bloque»)
 * y de vuelta con Esc. Sigue siendo un SITIO y no una capa: aquí se está, no
 * se consulta.
 *
 * La cabecera (`CabeceraDelBloque`) y el costado con las lecturas
 * (`LecturasDelBloque`) los pone la pantalla, porque son de las dos vistas.
 *
 * ══ Todas las hojas, siempre ═══════════════════════════════════════════════
 * Las hojas se reparten el ancho y, si no caben, pasan a otra fila: nunca un
 * carril con desplazamiento que deje la sexta fuera. Se ordenan arrastrando por
 * el asa —la hoja entera, o un ejercicio dentro de su hoja—.
 *
 * ══ Hoja, y no «sesión» ════════════════════════════════════════════════════
 * Cada día de entreno es una HOJA. Lo ejecutado se llama ENTRENAMIENTO: en
 * rotativo «sesión» ya es la vuelta al ciclo.
 *
 * ══ Y desde el 14 sep, SOLO LECTURA de verdad ══════════════════════════════
 *
 * El dueño, sobre el portal: *«la vista de entrenamiento tiene que ser similar
 * a la vista del entrenador, ves el bloque entero y ves las hojas de entreno,
 * tal cual lo tiene el entrenador pero adaptado al cliente»*. O sea: ESTA
 * rejilla, en `Client/EntrenoEnMonitor`.
 *
 * La pieza ya decía «lo que se puede hacer sale de lo que llega», pero solo lo
 * cumplían los verbos que nacieron gateados. Renombrar, quitar, reordenar,
 * añadir, el día de la hoja y —sobre todo— los CAMPOS de series y repeticiones
 * se pintaban siempre. Montarla fuera del editor le habría enseñado al cliente
 * su rutina con la papelera puesta y, al tocar un campo, `onSeries is not a
 * function`.
 *
 * Ahora cada verbo cuelga de su manejador y la dosis se lee de un tirón («4 ×
 * 6-8») cuando no hay dónde escribirla. El entrenador pasa los diecisiete
 * manejadores de siempre, así que su pantalla no cambia en nada: se comprobó
 * capturándola antes y después.
 */

/**
 * LA PAUTA, EN LÍNEA: «4 × 6-8», «3 × 6-8 / 8-10 / 8-12» o «2 × 6-8 / 1 × 8-12».
 *
 * ══ Se escribe como se lee (23 sep) ════════════════════════════════════════
 *
 * La pauta de varios tramos se leía en un renglón y, al tocarla, se abría en
 * una pila de casillas —«1 × 6-8» / «1 × 8-10» / «1 × 8-12» y un «＋»—: la
 * tarjeta saltaba de alto y el formato cambiaba bajo el dedo. El dueño: «la
 * edición tiene que verse igual que la lectura».
 *
 * Ahora es UNA pieza para las dos cosas. Cada cifra es su propia casilla sin
 * caja —se enciende al pasar y al escribir, como las de un tramo de siempre—,
 * así que tocar «8-10» edita ese rango donde está. Sin `onCambiar` (el portal
 * del cliente) las mismas cifras se pintan como texto, con el mismo ancho.
 *
 * ── Los tres gestos, sin salir de la línea ─────────────────────────────────
 *   · AÑADIR un rango: el «＋» del final (una oferta: sale al acercarse) abre
 *     una casilla vacía al final de la línea. Con algo escrito, el rango nace
 *     partiendo la pauta (`conOtroTramo`: el volumen no cambia); vacía, se va.
 *   · QUITAR un rango: dejarlo vacío, o sus series a 0. Es lo que significa.
 *   · DESGLOSAR: «2×6-8» escrito en un rango le da dos series. En una rampa
 *     —todas a una serie— la cifra de delante es la cuenta de rangos y no se
 *     escribe; en cuanto un rango lleva más de una, cada uno enseña la suya y
 *     se escribe en su sitio.
 *
 * Emite el array entero (`onCambiar`) y no el campo tocado: quien lo recibe ya
 * sabe si eso es un cambio de series, de repeticiones o de esquema.
 */
const PARTIDO = /^\s*(\d{1,2})\s*[x×*]\s*(.*)$/i;
/** «2×8-10» → { n: 2, reps: '8-10' }; «8-10» → { n: null, reps: '8-10' }. */
const leerRango = (texto) => {
  const m = PARTIDO.exec(texto);
  return m ? { n: Number(m[1]), reps: m[2].trim() } : { n: null, reps: texto.trim() };
};
/* Con varios rangos cada casilla mide lo escrito (y su relleno), no la caja
   de una pauta de un tramo: tres rangos no caben en una columna de 110 px con
   casillas de 44. El último rango guarda el ancho fijo de `.plan-reps` para que
   la pauta de todas las filas acabe en la misma vertical. */
/* Un guion o una coma miden media cifra: contarlos enteros dejaba aire detrás. */
const anchoDe = (texto, minimo = 2) => {
  const t = String(texto ?? '');
  const estrechos = (t.match(/[-.,\s]/g) || []).length;
  return `calc(${Math.max(minimo, t.length - estrechos * 0.45).toFixed(2)}ch + 6px)`;
};

const PautaEnLinea = ({ tramos, nombre, idBase, onCambiar = null, puedePartir = false }) => {
  const [nuevo, setNuevo] = useState(false);
  const editable = Boolean(onCambiar);
  const rampa = tramos.length > 1 && tramos.every((t) => t.n === 1);
  const unTramo = tramos.length === 1;
  const ultimo = tramos.length - 1;
  const total = tramos.reduce((n, t) => n + t.n, 0);
  /* Partir no hace nada con las doce puestas y ninguna que ceder. */
  const cabeOtro = total < 12 || tramos.some((t) => t.n > 1);

  const cambia = (i, cambio) =>
    onCambiar(
      tramos
        .map((t, j) => (j === i ? { ...t, ...cambio } : t))
        .filter((t) => t.n > 0 && (unTramo || t.reps !== ''))
    );

  const por = (
    <span className="plan-por" aria-hidden="true">
      ×
    </span>
  );
  const barra = (
    <span className="plan-esq-barra" aria-hidden="true">
      /
    </span>
  );
  /* Enter guarda (es salir de la casilla); Escape devuelve lo que había. */
  const teclas = (valor) => (e) => {
    if (e.key === 'Enter') e.currentTarget.blur();
    if (e.key === 'Escape') {
      e.stopPropagation();
      e.currentTarget.value = valor;
      e.currentTarget.blur();
    }
  };

  const series = (t, i) =>
    editable ? (
      <input
        className="plan-series"
        inputMode="numeric"
        /* La cifra en la llave: la casilla se remonta cuando el valor cambia
           por otro camino —el «＋», o la hoja abierta al lado—. */
        key={`${idBase}-s${i}-${t.n}`}
        style={{ width: anchoDe(t.n, 1) }}
        onInput={(e) => (e.currentTarget.style.width = anchoDe(e.currentTarget.value, 1))}
        defaultValue={t.n}
        aria-label={unTramo ? `Series de ${nombre}` : `Series del rango ${i + 1} de ${nombre}`}
        title={unTramo ? undefined : 'Series de este rango. A 0, el rango se quita.'}
        onKeyDown={teclas(t.n)}
        onBlur={(e) => {
          /* Con un tramo, mínimo 1: un ejercicio sin series no es un
             ejercicio. Con varios, 0 quita el rango. */
          const n = clampInt(e.target.value, unTramo ? 1 : 0, 12, t.n);
          e.target.value = n;
          if (n !== t.n) cambia(i, { n });
        }}
      />
    ) : (
      <span className="plan-series is-lectura" style={{ width: anchoDe(t.n, 1) }}>
        {t.n}
      </span>
    );

  const reps = (t, i) => {
    const fija = i === ultimo && !nuevo;
    if (!editable) {
      return (
        <span className="plan-reps is-lectura" style={fija ? undefined : { width: anchoDe(t.reps) }}>
          {t.reps || '—'}
        </span>
      );
    }
    return (
      <input
        className="plan-reps"
        key={`${idBase}-r${i}-${t.reps}-${t.n}`}
        defaultValue={t.reps}
        placeholder="8-10"
        style={fija ? undefined : { width: anchoDe(t.reps) }}
        onInput={fija ? undefined : (e) => (e.currentTarget.style.width = anchoDe(e.currentTarget.value))}
        aria-label={unTramo ? `Repeticiones objetivo de ${nombre}` : `Repeticiones del rango ${i + 1} de ${nombre}`}
        title={
          unTramo
            ? undefined
            : `Repeticiones de este rango. «2×${t.reps || '8-10'}» le da dos series; vacío, se quita.`
        }
        onKeyDown={teclas(t.reps)}
        onBlur={(e) => {
          const { n, reps: escrito } = leerRango(e.target.value);
          if (escrito === t.reps && (n === null || n === t.n)) return;
          /* Vacío, con un solo tramo, no borra nada: vuelve a lo que había. */
          if (unTramo && escrito === '') {
            e.target.value = t.reps;
            return;
          }
          cambia(i, { reps: escrito, ...(n !== null ? { n: Math.min(Math.max(n, 0), 12) } : {}) });
        }}
      />
    );
  };

  return (
    <span className={`plan-esq${editable ? '' : ' is-lectura'}`}>
      {rampa && (
        <>
          <span
            className="plan-series is-lectura is-cuenta"
            style={{ width: anchoDe(tramos.length, 1) }}
            title={editable ? 'Una serie por rango. Escribe «2×8-10» en un rango para darle más.' : undefined}
          >
            {tramos.length}
          </span>
          {por}
        </>
      )}
      {tramos.map((t, i) => (
        /* La barra cierra su rango y no abre el siguiente: si la línea baja,
           «2 × 6-8 /» se lee como «sigue», y una «/» al principio de renglón no. */
        <span className="plan-esq-tramo" key={`${idBase}-t${i}`}>
          {!rampa && series(t, i)}
          {!rampa && por}
          {reps(t, i)}
          {(i < ultimo || nuevo) && barra}
        </span>
      ))}
      {/* El rango que se está añadiendo: una casilla vacía al final de la
          línea. No se escribe nada hasta que lleva algo. */}
      {nuevo && (
        <span className="plan-esq-tramo">
          <input
            className="plan-reps"
            autoFocus
            placeholder="8-10"
            aria-label={`Repeticiones del rango nuevo de ${nombre}`}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') {
                e.stopPropagation();
                e.currentTarget.value = '';
                e.currentTarget.blur();
              }
            }}
            onBlur={(e) => {
              const { n, reps: escrito } = leerRango(e.target.value);
              setNuevo(false);
              if (!escrito) return;
              const partida = conOtroTramo(tramos);
              if (partida === tramos) return;
              const fin = partida.length - 1;
              onCambiar(
                partida.map((t, j) => (j === fin ? { n: n ? Math.min(n, 12) : t.n, reps: escrito } : t))
              );
            }}
          />
        </span>
      )}
      {/*
        ── PARTIR OTRA VEZ ─────────────────────────────────────────────────
        El «＋» se posa en el hueco que `.plan-esq` le reserva a la derecha: así
        la pauta de todas las filas acaba en la misma vertical. Es una OFERTA y
        ahí sigue la ley: en reposo no está, sale al acercarse y se apaga con
        opacidad —nunca desmontándose— para que el tabulador siga llegando.
      */}
      {editable && puedePartir && cabeOtro && !nuevo && (
        <span className="plan-esq-pie is-suelto">
          <button
            type="button"
            className="plan-esq-mas"
            onClick={() => setNuevo(true)}
            title="Añadir un rango"
            aria-label={`Añadir un rango a ${nombre}`}
          >
            <Plus size={13} aria-hidden="true" />
          </button>
        </span>
      )}
    </span>
  );
};

/** Los tramos sin los que se han puesto a cero, y nunca ninguno: un ejercicio
    sin series no es un ejercicio. Lo que en el bloque hace `setsDesdeTramos` al
    guardar, aquí hay que hacerlo a mano — el alta no guarda hasta «Añadir». */
const sinVacios = (tramos) => {
  const vivos = tramos.filter((t) => t.n > 0);
  return vivos.length > 0 ? vivos : [{ ...tramos[0], n: 1 }];
};

/**
 * PARTIR LA PAUTA: un tramo más al final, y su serie sale de las que ya hay.
 *
 * Es PARTIR y no añadir, y la diferencia importa: «4 × 6-8» pasa a «3 × 6-8,
 * 1 × ___» y el ejercicio sigue teniendo cuatro series. Quien pulsa esto está
 * diciendo «las últimas piden otra cosa», no «ponme una más»; si además subiera
 * el volumen, cada pirámide traería de regalo una serie que nadie pidió.
 *
 * La cede el ÚLTIMO tramo que tenga más de una. Cuando ninguno puede —todos a
 * una serie, o sea una rampa entera— sí se añade, porque ahí no hay nada que
 * partir; y con las doce puestas no se hace nada, que es el tope de la casa.
 *
 * Nace VACÍO a propósito. Con las repeticiones del anterior pediría exactamente
 * lo mismo, así que `tramosDeSeries` volvería a juntar los dos y el botón no
 * haría nada visible — se probó y no hacía nada. Vacío es un tramo de verdad, y
 * su casilla, con «8-10» de pista, es la pregunta que hay que contestar.
 */
const conOtroTramo = (tramos) => {
  const nuevo = { n: 1, reps: '' };
  const desdeElFinal = [...tramos].reverse().findIndex((t) => t.n > 1);
  if (desdeElFinal >= 0) {
    const i = tramos.length - 1 - desdeElFinal;
    return [...tramos.map((t, j) => (j === i ? { ...t, n: t.n - 1 } : t)), nuevo];
  }
  return tramos.reduce((n, t) => n + t.n, 0) < 12 ? [...tramos, nuevo] : tramos;
};

/**
 * AÑADIR UN EJERCICIO, DENTRO DE SU PROPIA COLUMNA.
 *
 * ══ Lo que había, y por qué se cayó ════════════════════════════════════════
 *
 * «El añadir ejercicios es raro e incómodo: en vez de simplemente añadirlo
 * cómodo, desaparecen el resto de hojas.»
 *
 * Desaparecían de verdad, y el motivo es geométrico. El alta era `EscribirHoja`
 * —una superficie de dos secciones: el formulario arriba y la hoja entera
 * debajo— metida en una BANDA que ocupaba una fila completa de la retícula
 * (`grid-column: 1 / -1`). Con cuatro hojas en un renglón, abrir el alta de la
 * primera partía ese renglón en dos: la banda medía más de 400 px y empujaba
 * a Pull, Pierna y Push B por debajo del pliegue. El comentario que la
 * defendía decía «las demás hojas siguen ahí, arriba y abajo, sin moverse»;
 * arriba y abajo es precisamente moverse.
 *
 * ══ Y por qué ahora sí cabe en la columna ══════════════════════════════════
 *
 * Porque el formulario ha adelgazado a la mitad, y no por gusto: la columna ya
 * tiene DENTRO lo que aquel formulario repetía. Las series y las repeticiones
 * son campos en cada fila de la rejilla —se escriben donde se leen—, y la lista
 * de lo que la hoja lleva es la propia columna, que está justo encima. Lo único
 * que el alta tiene que preguntar es qué ejercicio y de qué músculo.
 *
 * Dos controles caben en 276 px. Cinco no cabían, y por eso se fue a una
 * ventana primero y a una banda después.
 *
 *     ┌────────────────────────┐
 *     │ Busca o escribe uno…   │   ← con el foco puesto
 *     │ [Pecho ▾]  [Añadir]    │   ← y Enter también añade
 *     └────────────────────────┘
 *
 * Se meten cinco seguidos sin cerrar nada —el campo se vacía y vuelve a coger
 * el foco—, el músculo se queda puesto entre uno y otro (quien mete cuatro de
 * espalda no lo elige cuatro veces) y la pauta nace en 3 × 8-10, que se corrige
 * en la fila recién aparecida, dos centímetros más arriba.
 *
 * Nada de la pantalla se mueve: la columna crece por dentro y sus vecinas
 * siguen en su sitio, que es lo que pedía la queja.
 */
const AltaDeEjercicio = ({ dayName, library, nota, pauta, onAdd, onRecordar, onClose }) => {
  const [nombre, setNombre] = useState('');
  const [musculo, setMusculo] = useState(MUSCLE_GROUPS[0]);
  /*
    ══ Y LA PAUTA VUELVE AL ALTA, PERO COMO LA PAUTA Y NO COMO FORMULARIO ═════
    Es la misma pieza que la fila del ejercicio (`PautaEnLinea`): lo que se ve
    aquí es lo que va a quedar escrito ahí. Entra con la pauta del ejercicio
    anterior de la hoja (`pautaHeredada`) y se queda puesta entre uno y otro.
  */
  const [tramos, setTramos] = useState(() => [{ n: pauta.numSets, reps: pauta.targetReps }]);
  /* Cuántos van metidos en esta apertura: remonta el buscador —de ahí el
     `key`— y con él vuelve el `autoFocus`, que es lo que deja meter el
     siguiente sin tocar el ratón. */
  const [metidos, setMetidos] = useState(0);
  const musculoRef = useRef(null);

  /* Lo escrito, ¿es ya de la biblioteca? Entonces el músculo lo pone la ficha
     y no se pregunta. Solo un ejercicio NUEVO necesita que se le diga de qué
     músculo es, y solo entonces sale el desplegable. */
  const escrito = nombre.trim();
  const deLaLibreria = escrito ? (library || []).find((item) => norm(item.name) === norm(escrito)) : null;
  const esNuevo = Boolean(escrito) && !deLaLibreria;

  const anadir = (name, muscle) => {
    /* El ejercicio nace con su esquema puesto: `buildExercise` da la forma y
       `setsDesdeTramos` las series, que es la misma traducción que usa la
       rejilla al escribirlas. Sin tramos válidos se queda con las de
       `buildExercise`, que nunca son cero. */
    const base = buildExercise({ name, muscle, numSets: 3, targetReps: '8-10' });
    const sets = setsDesdeTramos(tramos, []);
    onAdd(sets.length > 0 ? { ...base, sets } : base);
    onRecordar(name, muscle);
    setNombre('');
    setMetidos((n) => n + 1);
  };

  const enviar = (event) => {
    event.preventDefault();
    if (!escrito) return;
    anadir(deLaLibreria?.name ?? escrito, deLaLibreria?.muscle || musculo);
  };

  return (
    <form className="plan-alta" onSubmit={enviar} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      {/*
        ══ SE ESCRIBE Y LUEGO SALE LA LISTA ═════════════════════════════════
        Abría la biblioteca entera al poner el foco (`abreVacio`), y como el
        foco entra solo, el alta nacía tapada por un desplegable que nadie
        había pedido. Ahora la lista sale al teclear, y elegir una sugerencia
        YA la añade: un gesto, no dos. Lo que no está se escribe, se le pone
        músculo y se añade con Enter.
      */}
      <Autocomplete
        key={`alta-${dayName}-${metidos}`}
        value={nombre}
        onChange={setNombre}
        items={library}
        getMeta={(item) => item.muscle}
        onPick={(item) => anadir(item.name, item.muscle || musculo)}
        queEs="ejercicio"
        onCreate={() => musculoRef.current?.focus()}
        placeholder="Buscar ejercicio"
        inputProps={{ autoFocus: true, 'aria-label': `Ejercicio nuevo de ${dayName}` }}
      />
      {esNuevo && (
        <label className="plan-alta-fila">
          <span className="plan-alta-rotulo">Músculo</span>
          <select
            ref={musculoRef}
            className="select select-sm"
            value={musculo}
            onChange={(e) => setMusculo(e.target.value)}
          >
            {MUSCLE_GROUPS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="plan-alta-fila">
        <span className="plan-alta-rotulo">Pauta</span>
        <div className="plan-alta-pauta">
          <PautaEnLinea
            tramos={tramos}
            nombre={escrito || 'el ejercicio nuevo'}
            idBase={`alta-${dayName}`}
            onCambiar={(nuevos) => setTramos(sinVacios(nuevos))}
            puedePartir
          />
        </div>
      </div>
      <div className="plan-alta-pie">
        <button type="submit" className="btn btn-primary btn-sm" disabled={!escrito}>
          Añadir
        </button>
        <button type="button" className="btn btn-plain btn-sm" onClick={onClose}>
          Listo
        </button>
      </div>
      {/* A cuántos microciclos va a parar esto: lo que se escribe aquí no es
          de esta semana. */}
      {nota && <span className="plan-alta-nota">{nota}</span>}
    </form>
  );
};

export const ConjuntoDelBloque = ({
  program = null,
  cliente,
  bloque = null,
  semanaEnCurso,
  library,
  /*
    ══ LA COSTURA DEL COMPOSITOR ═══════════════════════════════════════════
    Con `plan` puesto, esta rejilla deja de leer el programa: las hojas son
    las que le pasan y no hay `bloque` del que sacarlas. Es lo que permite
    componer un bloque —que todavía no existe en ninguna parte— con la MISMA
    pantalla con la que se mira uno abierto, en vez del segundo editor, peor,
    que el compositor tuvo hasta ahora.

    Y casi todo lo demás se apaga solo, sin un `if` por medio: sin semanas del
    bloque no hay semáforo ni fantasma («lo que hizo la vez pasada» no existe
    antes de la primera vez), sin excepciones no hay `difieren`, y con el plan
    dentro ninguna hoja puede estar «entrenada». Lo único que hay que decirle
    es cómo se llama el bloque —`nombre`— y su microciclo —`microciclo`—,
    que son los dos datos que normalmente saca de `bloque` y del programa.

    Ver `Compositor.jsx`.
  */
  plan: planDado = null,
  nombre = null,
  microciclo: microcicloDado = null,
  onAbrirHoja,
  onIrSemana,
  onAnadirEjercicio,
  onQuitarEjercicio,
  /* `(dayName, name, nuevo, { muscle })`: pulsar el nombre cambia el ejercicio
     por otro, con su estructura.
     Sin él —el portal del cliente— el nombre solo se lee. */
  onRenombrarEjercicio = null,
  onMoverEjercicio,
  onSeries,
  onReps,
  /* El esquema entero de un ejercicio, cuando sus series no piden lo mismo:
     `(hoja, nombre, tramos, antes)`. Sin él, la fila sigue escribiéndose con
     los dos de arriba y una pauta de varios tramos se lee y no se toca — es lo
     que ve el cliente en su portal. Ver `PautaEnLinea`. */
  onEsquema = null,
  onAnadirHoja,
  onRenombrarHoja,
  /* `(dayName) => motivo | null`: por qué esa hoja no se puede renombrar
     ahora mismo —el cliente la está entrenando—. El lápiz se apaga y lo dice. */
  noSePuedeRenombrar = null,
  onCopiarHoja,
  /* La hoja que se lleva en la mano y el verbo de ponerla encima de una de
     estas: la columna conserva su nombre y cambia lo que lleva dentro. Ver
     `sustituirHoja` en `WorkoutLogEditor`. */
  hojaEnMano = null,
  onSustituirHoja = null,
  onQuitarHoja,
  onMoverHoja,
  onRecordarEjercicio,
  onGuardarPieza,
  /* `(dayName, weeks)`: «Es intencionado» en la marca de las excepciones.
     Sin él la marca solo se lee. Ver `marcarExcepcionVistaIn`. */
  onExcepcionVista = null,
  /*
    `(nuevo) => void`: escribe la secuencia entera del microciclo. Con él, el
    rótulo del día de cada columna es el mando de su día —el menú «Cae el …»—;
    sin él —el portal del cliente— solo lo dice. El microciclo entero se edita
    desde la barra de arriba (`RitmoDelMicrociclo`), no aquí.
  */
  onMicrociclo = null,
  onTraerFichero,
  /* `{ hoja }`: la hoja que acaba de nacer de «Copia de…» y hay que nombrar.
     Llega de fuera porque el «+ hoja» vive en la tira, no aquí; se atiende una
     vez y se devuelve con `onRenombrarVisto`, para que volver a esta vista no
     la reabra. */
  renombrarPrimero = null,
  onRenombrarVisto = null,
}) => {
  const [nuevaHoja, setNuevaHoja] = useState(null);
  const [renombrando, setRenombrando] = useState(null);
  useEffect(() => {
    if (!renombrarPrimero) return;
    setRenombrando(renombrarPrimero.hoja);
    onRenombrarVisto?.();
  }, [renombrarPrimero, onRenombrarVisto]);
  const [altaEn, setAltaEn] = useState(null);
  /*
    El arrastre: qué viaja —una hoja entera o un ejercicio dentro de la suya—
    y sobre qué está. El mismo `draggable` de la hoja de series: el asa
    arranca, la pieza de destino recibe. Un ejercicio solo se suelta dentro de
    su hoja; moverlo a otra sería otro ejercicio en otro día.
  */
  const [arrastre, setArrastre] = useState(null); // { tipo: 'hoja'|'ej', hoja, index }
  const [sobre, setSobre] = useState(null); // { tipo, hoja, index }
  /*
    Y el otro arrastre, el que viene de FUERA de esta rejilla: una hoja copiada
    que se trae de la mano y se suelta sobre una columna. Aquí es donde hace
    falta y no en la mano —seis columnas, y el clic no puede decir cuál—; ver
    `useZonasDeSoltar`. Los dos no coinciden nunca: `receptor` solo devuelve
    manejadores con un arrastre interno en curso, y `zona` solo con una pieza
    viajando desde la mano.
  */
  const deLaMano = useZonasDeSoltar(TIPO.HOJA);

  /* Componiendo: el plan llega de fuera y no hay bloque guardado detrás. */
  const componiendo = planDado !== null;
  const plan = planDado || blockPlan(program, bloque);
  /* Lo que se está componiendo es, por definición, lo que se va a entrenar:
     se escribe entero. */
  const esActual = componiendo || isCurrentBlock(program, bloque);
  const comoSeLlama = nombre || bloque?.name || 'el bloque';
  const cycleType = cliente?.cycleType || 'weekly';
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
  /* El microciclo del bloque: la secuencia guardada, o la que se deriva de la
     ficha mientras no lo esté. Componiendo, la que se compone. */
  const microciclo = componiendo
    ? normalizaMicrociclo(microcicloDado)
    : microcicloDelBloque(program, bloque, cliente);
  const diasDelCiclo = microciclo?.dias || [];
  const porRotacion = microciclo?.tipo === 'rotativo';
  const rotuloDia = (i) => (porRotacion ? `D${i + 1}` : WEEK_DAYS[i].slice(0, 3));

  /* Cuándo cae cada hoja: sus días de la secuencia, «Lun · Jue» o «D1 · D6». */
  const cuandoCae = (dayName) => {
    const suyos = diasDelCiclo.flatMap((d, i) => (d.hoja === dayName && !d.descanso ? [rotuloDia(i)] : []));
    return suyos.length > 0 ? suyos.join(' · ') : null;
  };
  const { colocar: colocarEnDia, cambiar: cambiarMicrociclo, nombreDia } = useCambiosDelMicrociclo(
    microciclo,
    onMicrociclo || (() => {})
  );

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

    if (!diasDelCiclo.some((d) => d.hoja && porNombre.has(d.hoja))) return null;
    diasDelCiclo.forEach((d, i) => {
      if (d.hoja && !d.descanso) mete(d.hoja, rotuloDia(i));
    });

    for (const hoja of plan.sessions) mete(hoja.dayName, null);
    return piezas;
  })();

  /*
    ── El plan del bloque ya no deja huecos ────────────────────────────────
    Aquí se calculaba qué microciclos estaban sin ejercicios y si había
    plantilla de la que copiarlos. Con el plan DENTRO del bloque no hay hueco:
    un microciclo nuevo lo lleva puesto. Queda solo saber si este bloque tiene
    ya su plan, que es lo que decide si el andamio del modelo viejo se pinta.
  */
  const conPlanPropio = componiendo || hasBlockPlan(bloque);
  /* El bloque en blanco: ninguna hoja tiene un solo ejercicio. */
  const bloqueVacio = plan.sessions.every((s) => (s.exercises || []).length === 0);
  /* Con el bloque en blanco, un fichero soltado en cualquier sitio de la mesa
     es la rutina que se trae: apuntar a la hoja justa no puede ser condición. */
  const traeFichero = esActual && bloqueVacio && Boolean(onTraerFichero);
  const soltarFichero = useArrastreDeFicheros((ficheros) => onTraerFichero?.(ficheros), traeFichero);

  const enBloque = (w) => w - (bloque?.fromWeek ?? 1) + 1;
  const etiqueta = (w) => `${unitInitial(cycleType)}${enBloque(w)}`;

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
  /* Sin bloque guardado no hay semanas, y sin semanas se apagan solos el
     semáforo, el fantasma de la vez pasada y el tope de «entrenada». */
  const semanasBloque = componiendo ? [] : weeksOfBlock(program, bloque);
  const enCursoAqui = esActual && Number.isFinite(semanaEnCurso) && semanasBloque.includes(semanaEnCurso);
  const microEnCurso = enCursoAqui ? findMicrocycle(program?.microcycles || [], semanaEnCurso) : null;
  const diaDe = (fecha) => (fecha ? weekdayName(`${fecha}T00:00:00Z`) : null);
  const resumenTexto = (r) =>
    [r.kg !== null ? `${localeNumber(r.kg)} kg` : null, r.reps.join('·')].filter(Boolean).join(' · ');

  /*
    ══ EL PESO PAUTADO, SI LO HAY ════════════════════════════════════════════
    Desde que los kilos se pueden pautar (`targetKg`), esta rejilla enseñaba la
    mitad del plan: «4 × 6-8» y ni rastro del peso que el entrenador había
    escrito en la hoja. Va en voz baja delante de la pauta, y NO como campo: el
    peso es por serie —una pirámide sube en cada una— y en una columna de 310 px
    no cabe una tercera casilla. Se escribe donde hay una fila por serie.

    Y estuvo escrito aquí, leyendo `ex.sets`... que es justo lo que la vista del
    plan no traía: la cifra no salió NUNCA. Ahora la traduce el dominio
    (`planExerciseView`) y el resumen lo dice él (`pesoPautado`), que es el
    mismo que usa el banco del compositor en su renglón.
  */
  /* ── El arrastre ───────────────────────────────────────────────────────── */
  const soltar = () => {
    setArrastre(null);
    setSobre(null);
  };
  const mismaPieza = (a, b) => a && b && a.tipo === b.tipo && a.hoja === b.hoja && a.index === b.index;
  /*
    El asa: arrastre con el ratón y ALT + FLECHAS con el teclado.

    Lo segundo no es un adorno de accesibilidad: es lo que ha permitido tirar
    los ítems «Mover antes» y «Mover después» del menú de la hoja, que eran la
    única forma de reordenar sin ratón. Es exactamente la misma pareja que ya
    tiene la hoja de series (`HojaDeSeries`), y así el gesto se aprende una vez.

    Las hojas van en horizontal (←/→, son columnas) y los ejercicios en vertical
    (↑/↓, son una lista): la flecha coincide con lo que se ve moverse.
  */
  const asa = (pieza, label, mover) => ({
    draggable: true,
    onDragStart: (e) => {
      setArrastre(pieza);
      e.dataTransfer.effectAllowed = 'move';
      /* Firefox no arranca el arrastre sin datos. */
      e.dataTransfer.setData('text/plain', label);
    },
    onDragEnd: soltar,
    onKeyDown: (e) => {
      if (!e.altKey || !mover) return;
      const atras = pieza.tipo === 'hoja' ? 'ArrowLeft' : 'ArrowUp';
      const alante = pieza.tipo === 'hoja' ? 'ArrowRight' : 'ArrowDown';
      if (e.key !== atras && e.key !== alante) return;
      e.preventDefault();
      mover(e.key === atras ? -1 : 1);
    },
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

  /*
    ══ EL VOLUMEN PAUTADO DE LA HOJA ═════════════════════════════════════════

    «No me interesa tanto lo que hizo, sino más bien lo pautado: ver volumen y
    eso.»

    La cabecera de la columna decía «18 series» y ahí se acababa: dieciocho
    series de qué es la pregunta que se hace un entrenador mirando un microciclo,
    y para contestarla había que leer los nueve nombres y sumarlos de cabeza —o
    irse a la tarjeta del costado, que suma el bloque ENTERO y por tanto no
    contesta por esta hoja—.

    Sale de `hoja.volumen`, que ya lo trae el plan del bloque (`blockPlan`) y es
    lo PAUTADO, no lo hecho: las series que hay escritas. Los tres grupos que
    más pesan, que son los que definen la hoja, y el resto contado en el
    title. Un renglón fijo, como los tres de encima: si no midiera siempre lo
    mismo devolvería a la rejilla el desnivel que costó dos vueltas quitarle.
  */
  const volumenDeLaHoja = (hoja) =>
    Object.entries(hoja.volumen || {})
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1]);

  if (plan.sessions.length === 0) {
    return (
      <div className="bloque-conjunto">
        <EmptyState
          icon={Layers}
          title={`«${comoSeLlama}» está vacío`}
          message={
            esActual
              ? 'Añade la primera con «+ hoja».'
              : 'Bloque cerrado.'
          }
          action={esActual && onAnadirHoja ? altaDeHoja : null}
        />
      </div>
    );
  }

  /* La hoja que invita a traer el fichero: la primera de la rejilla, y una
     sola. Con cuatro hojas en blanco, cuatro zonas iguales serían la misma
     oferta cuatro veces; el fichero trae todos los días de una vez. */
  const hojaQueInvita = traeFichero ? (piezasRejilla?.[0]?.hoja || plan.sessions[0])?.dayName : null;

  return (
    <div className="bloque-conjunto" {...(traeFichero ? soltarFichero.props : {})}>

        {/*
          ══ EL HUECO SE HA IDO DE ENCIMA DE LA HOJA (19 sep) ════════════════
          Aquí había una franja —«"Bloque 1" no tiene ningún ejercicio todavía:
          su hoja "Día 1" está en blanco»— con «Escribir el primero» y «Traer de
          un fichero». El dueño, al verla nada más crear el bloque: «no tiene
          sentido». Decía lo que se estaba viendo, un segundo después de haberlo
          hecho, y las dos salidas quedaban lejos de la hoja que había que
          llenar.

          Las dos se mudan DENTRO de la hoja en blanco, que es donde se miran:
          escribir sigue siendo su «+ ejercicio» de siempre, y traer lo que ya
          tienes es la zona de soltar que la llena. Ver `invitaAFichero`.
        */}

        {/*
          ── «Poner la plantilla» se ha ido ───────────────────────────────────
          Aquí había una franja que avisaba de los microciclos sin ejercicios y

        {/*
          ── La tira del microciclo NO va aquí ─────────────────────────────
          Encima de la rejilla vivía la fila «MICROCICLO · LUN Push A · MAR
          Pull A · …», que es el MISMO dibujo que la rejilla de debajo: las
          mismas cuatro hojas, con su día y su nombre, dos veces en la misma
          pantalla. Medido sobre la captura del dueño, «LUN» salía cuatro veces
          —la tira, el rótulo de la columna, su pie y «hecha el lunes»—.

          Volvió en F2c como editor del microciclo y pasó lo mismo, peor: se
          comía la vista del bloque, empujaba las columnas hacia abajo y las
          estrechaba. El editor vive ahora detrás del ritmo de la barra de
          arriba (`RitmoDelMicrociclo`), y aquí dónde cae cada hoja lo dice
          —y lo cambia— el rótulo de su propia columna.
        */}
        {/* ── Las hojas, todas ──────────────────────────────────────────── */}
        {/* ── LAS COLUMNAS DEL MICROCICLO ──────────────────────────────────
            El canto ya no lo lleva esta sección: lo lleva la mesa entera
            (`.mesa-panel` en `WorkoutLogEditor`), que es la que además
            sostiene la banda. Aquí solo va su contenido, y las hojas son lo
            que son: las columnas de un microciclo. */}
        <section className="plan-seccion" aria-label="Las hojas del bloque">
          {/* Sin `role="list"`: cada columna es una `section` que se nombra
              sola con su título, y anunciarlas además como una lista de seis
              elementos no añade nada que el lector de pantalla no diga ya. */}
          {/*
            ══ CUÁNTAS HOJAS HAY, PARA QUE LAS FILAS SALGAN PAREJAS ══════════
            «Cuando el cliente tiene muchas sesiones se hace algo fea la
            división en dos líneas.» Y era verdad: la retícula se llenaba de
            izquierda a derecha con las que cupieran —cinco arriba y una
            huérfana debajo—, así que el reparto lo decidía el ancho de la
            ventana y no el bloque. Seis hojas iguales en importancia salían 5+1.

            La cuenta sube al CSS (`--cols`, en `piezas.css`), que la usa para
            elegir el número de columnas que parte las hojas en filas iguales:
            seis salen 3+3 y siete 4+3, sea cual sea el ancho. Es un dato del
            contenido, así que lo pone quien lo sabe.
          */}
          <div
            className={`plan-rejilla${piezasRejilla ? ' is-ciclo' : ''}`}
            data-hojas={(piezasRejilla || plan.sessions).length}
          >
            {(piezasRejilla || plan.sessions.map((hoja, index) => ({ hoja, index, dia: null }))).map((pieza) => {
              const { hoja, index, dia } = pieza;
              /* Una hoja del bloque no se "cierra": el plan se escribe una vez
                 y lo entrenado vive en las sesiones, que no se tocan. El tope
                 solo existe mientras el plan siga copiado por microciclo. */
              const cerrada = !conPlanPropio && untrainedWeeksOfDay(program, bloque, hoja.dayName).length === 0;
              /* Dónde cae se dice UNA vez y en un solo sitio: el rótulo de
                 arriba, que además es el mando con el que se cambia. Lo decía
                 también el subtítulo, y con la rejilla ordenada por el ciclo
                 eran dos veces el mismo dato en dos renglones seguidos. */
              const piezaHoja = { tipo: 'hoja', hoja: hoja.dayName, index };
              const sinRenombrar = noSePuedeRenombrar?.(hoja.dayName) || null;

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
                    ? /* El día abreviado («el dom.»): «hecha el miércoles»
                         pide 135 px y la columna estrecha da 113. Entero en
                         el title. */
                      {
                        tono: 'ok',
                        texto: `hecha${diaDe(ultimaDeSemana?.date) ? ` el ${diaDe(ultimaDeSemana.date).slice(0, 3)}.` : ''}`,
                        title: `Hecha${diaDe(ultimaDeSemana?.date) ? ` el ${diaDe(ultimaDeSemana.date)}` : ''}`,
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
                  key={hoja.dayName}
                  className={`plan-col${estadoHoja ? ` is-${estadoHoja.tono}` : ''}${marcas(piezaHoja)}${
                    deLaMano.sobre === hoja.dayName ? ' is-drop-target' : ''
                  }`}
                  {...(esActual ? receptor(piezaHoja) : {})}
                  {...(esActual && onSustituirHoja
                    ? deLaMano.zona(hoja.dayName, (pieza) => onSustituirHoja(hoja.dayName, pieza))
                    : {})}
                >
                  {/*
                    ══ EL DÍA ES EL MANDO DEL DÍA ═══════════════════════════
                    Dónde cae esta hoja se elegía con SIETE interruptores
                    dentro del «···» —«Cae el lunes», «Cae el martes»…—, que
                    era la mitad de un menú de doce ítems. El dueño: «no me
                    gusta tener tantas opciones ahí metidas, creo que debería
                    ser mucho más sencillo e intuitivo».

                    Un campo, un mando: el día se cambia PULSANDO EL DÍA, que
                    es donde se lee. El «···» se queda con lo que le toca —el
                    nombre, la pieza, el orden y el quitar— y baja de doce
                    ítems a seis.

                    El rótulo se pinta SIEMPRE, aunque no haya día que decir:
                    es la primera de las tres líneas fijas de la cabecera, y es
                    lo que mantiene la fila N de todas las hojas en la misma
                    altura. Ver `.plan-col-cab`.

                    ══ Y AHORA ES UNA PÍLDORA (17 sep, rediseño de Figma) ═════
                    El rótulo era versalita suelta sobre el nombre. En el frame
                    es una píldora con su propio fondo, del tamaño de la del
                    estado que tiene enfrente: las dos abren la tarjeta, una
                    dice CUÁNDO y la otra CÓMO VA. Que el día siga siendo el
                    mando que lo cambia no cambia — la píldora se pulsa igual.
                  */}
                  {/*
                    ══ LA CABECERA ES UNA RETÍCULA DE DOS FILAS ═══════════════
                    En el frame la tarjeta abre con una fila de dos extremos —el
                    día a la izquierda, cómo va a la derecha— y el nombre debajo,
                    con el ancho entero.

                    Se monta con áreas (`.plan-col-alto`) y no con dos flex
                    anidados por una razón que esta pantalla ya pagó una vez: en
                    fila, el nombre pierde tanto ancho como midan sus vecinos de
                    la derecha, y con cuatro verbos ahí eran «Emp…» a 150 px. Con
                    áreas, el nombre ocupa las dos columnas de la fila de abajo y
                    no negocia con nadie.
                  */}
                  <div className="plan-col-alto">
                  {/*
                    ══ UNA FILA, SIEMPRE (23 sep) ═════════════════════════════
                    El día y cómo va a la izquierda, los verbos a la derecha. En
                    columna estrecha (4-5 hojas) esto se partía en tres renglones
                    —día / verbos / nombre— y los verbos quedaban flotando entre
                    el día y el titular. Ahora lo que cede es la izquierda: la
                    píldora de estado se recorta con puntos, nunca bajan los
                    verbos.
                  */}
                  <div className="plan-col-cuando">
                  {esActual && onMicrociclo && microciclo ? (
                    <MenuAcciones
                      /* Sin día que decir, el rótulo guarda su sitio pero se
                         calla hasta que te acercas a la columna: cuatro hojas
                         sin reparto son cuatro «SIN DÍA» en versalita encima
                         de sus nombres, que es el ruido de decir cuatro veces
                         lo que no hay. Con día puesto se lee siempre. */
                      clase={`plan-col-dia is-mando${cuandoCae(hoja.dayName) || dia ? '' : ' is-vacio'}`}
                      alineado="izquierda"
                      ariaLabel={`Días en los que cae ${hoja.dayName}`}
                      sinFlecha
                      label={cuandoCae(hoja.dayName) || dia || 'sin día'}
                      /* Un ítem por día de la SECUENCIA: los siete de la
                         semana o los del rotativo. Marcado, quitarlo lo deja
                         en descanso; sin marcar, ponerlo pregunta si el día
                         ya tiene otra hoja (la regla va en
                         `useCambiosDelMicrociclo`, la misma del editor). */
                      items={diasDelCiclo.map((d, i) => {
                        const suyo = d.hoja === hoja.dayName;
                        return {
                          label: `Cae ${nombreDia(i, { largo: true })}`,
                          on: suyo,
                          sub: !suyo && d.hoja ? d.hoja : null,
                          run: () =>
                            suyo
                              ? cambiarMicrociclo(
                                  ponerDia(microciclo, i, null),
                                  `Descanso ${nombreDia(i, { largo: true })}.`
                                )
                              : colocarEnDia(hoja.dayName, i),
                        };
                      })}
                    />
                  ) : (
                    <span className="plan-col-dia">{cuandoCae(hoja.dayName) || dia || ' '}</span>
                  )}
                  {/* Cómo va, pegado al día: las dos cosas dicen cuándo. El
                      total de series ya no va aquí: tiene su sitio en la fila
                      del volumen, que es donde se mira cuánto pesa la hoja. */}
                  {estadoHoja && (
                    <span
                      className={`plan-col-estado is-${estadoHoja.tono}`}
                      title={estadoHoja.title || estadoHoja.texto}
                    >
                      {estadoHoja.texto}
                    </span>
                  )}
                  </div>
                  {/*
                    ══ LOS BOTONES DE LA HOJA ═══════════════════════════════
                    «Las hojas dentro de bloque tampoco tienen botones,
                    deberían tener.» Tenían un «···» de seis ítems, que es lo
                    contrario: un botón que esconde botones.

                    Salen los cuatro que hacen algo distinto —copiarla,
                    renombrarla, guardarla como pieza y quitarla— con la misma
                    escala y el mismo orden que en la cabecera de la hoja
                    abierta: lo que construye primero, lo que borra al final.

                    ── COPIAR, que es el verbo que faltaba ─────────────────
                    «En las cajas de hojas deberías dar las opciones de
                    copiar y esas cosas.» Y era verdad que no estaban: copiar
                    una hoja —montar «Push B» a partir de «Push A», que es
                    como se escribe media semana— solo se podía DENTRO de la
                    hoja abierta, o sea después de entrar en ella. Aquí, con
                    las seis columnas delante, es donde se decide que hace
                    falta otra: es exactamente el sitio del verbo. Y es el
                    MISMO manejador de la hoja abierta, con el mismo icono.

                    ── Y los dos que NO salen ──────────────────────────────
                    «Mover antes» y «Mover después» se han ido: el asa de la
                    izquierda ya arrastra, y desde ahora también entiende
                    Alt + ←/→, que era lo único que esos dos ítems aportaban.
                    Dos maneras de reordenar bastan; tres son la avería que
                    esta pantalla arrastra desde el principio. Y «Abrir la
                    hoja» tampoco: el nombre ES la puerta.
                  */}
                  {/* Nada de esto se pinta si no llega su manejador — ver «lo
                      que se puede hacer sale de lo que llega», arriba. Sin
                      ninguno, el carril entero se va: un `span` vacío de 26 px
                      subía la cabecera de todas las columnas. */}
                  {(onCopiarHoja || onRenombrarHoja || onGuardarPieza || onQuitarHoja) && (
                  <span className="plan-col-acciones">
                    {onCopiarHoja && (
                      <button
                        type="button"
                        className="btn btn-icon btn-icon-compact"
                        title={`Copiar «${hoja.dayName}» al portapapeles`}
                        aria-label={`Copiar «${hoja.dayName}» al portapapeles`}
                        onClick={() => onCopiarHoja(hoja.dayName)}
                      >
                        <Copy size={13} />
                      </button>
                    )}
                    {onRenombrarHoja && (
                    <button
                      type="button"
                      className="btn btn-icon btn-icon-compact"
                      disabled={Boolean(sinRenombrar)}
                      title={sinRenombrar || `Renombrar «${hoja.dayName}»`}
                      aria-label={sinRenombrar || `Renombrar «${hoja.dayName}»`}
                      onClick={() => setRenombrando(hoja.dayName)}
                    >
                      <Pencil size={13} />
                    </button>
                    )}
                    {onGuardarPieza && (
                      <button
                        type="button"
                        className="btn btn-icon btn-icon-compact"
                        title="Guardarla como pieza tuya"
                        aria-label={`Guardar «${hoja.dayName}» como pieza tuya`}
                        onClick={() => onGuardarPieza(hoja.dayName)}
                      >
                        <Bookmark size={13} />
                      </button>
                    )}
                    {/* ── PONERLE ENCIMA LA QUE SE LLEVA ─────────────────
                        «Este lunes pasa a ser este otro entrenamiento»: la
                        columna conserva su nombre —que es lo que el cliente
                        reconoce— y cambia lo que lleva dentro. Solo con una
                        hoja en la mano, por la ley del reposo: una oferta que
                        no se puede aceptar es mobiliario. */}
                    {onSustituirHoja && hojaEnMano && esActual && (
                      <button
                        type="button"
                        className="btn btn-icon btn-icon-compact"
                        title={`Poner «${hojaEnMano.titulo}» en «${hoja.dayName}»`}
                        aria-label={`Poner ${hojaEnMano.titulo} en ${hoja.dayName}`}
                        onClick={() => onSustituirHoja(hoja.dayName)}
                      >
                        <ClipboardPaste size={13} />
                      </button>
                    )}
                    {onQuitarHoja && (
                    <button
                      type="button"
                      className="btn btn-icon btn-icon-compact btn-icon-danger"
                      title={`Quitar «${hoja.dayName}»`}
                      aria-label={`Quitar «${hoja.dayName}»`}
                      onClick={() => onQuitarHoja(hoja.dayName)}
                    >
                      <Trash2 size={13} />
                    </button>
                    )}
                  </span>
                  )}
                  <header className="plan-col-cab">
                    {esActual && onMoverHoja && plan.sessions.length > 1 && (
                      <button
                        type="button"
                        className="hoja-asa plan-asa"
                        aria-label={`Reordenar ${hoja.dayName}. Alt y flechas para moverla.`}
                        title="Arrastra para cambiarla de sitio (o Alt + ←/→)"
                        {...asa(piezaHoja, hoja.dayName, (d) => {
                          const destino = index + d;
                          if (destino >= 0 && destino < plan.sessions.length) onMoverHoja(index, destino);
                        })}
                      >
                        <GripVertical size={15} />
                      </button>
                    )}
                    <div className="plan-col-say">
                      {renombrando === hoja.dayName ? (
                        <RenombrarEnSitio
                          value={hoja.dayName}
                          label="Nuevo nombre de la hoja"
                          /* Renombrar una hoja es escribir otro nombre, no
                             retocar este: «Pull A 2» → «Pull B» de un tecleo. */
                          seleccionado
                          onRename={(nombre) => onRenombrarHoja(hoja.dayName, nombre)}
                          onDone={() => setRenombrando(null)}
                        />
                      ) : onAbrirHoja ? (
                        /* El nombre ES la puerta: pulsarlo entra en la hoja. En
                           el portal del cliente la puerta es otra —entrar a
                           entrenar ese día— y por eso el título sale del lado
                           que sí tiene el verbo de renombrar. */
                        <button
                          type="button"
                          className="plan-col-nombre"
                          onClick={() => onAbrirHoja(hoja.dayName)}
                          onDoubleClick={onRenombrarHoja && !sinRenombrar ? () => setRenombrando(hoja.dayName) : undefined}
                          title={
                            onRenombrarHoja && !sinRenombrar
                              ? `Abrir ${hoja.dayName} y escribir sus series · doble clic para renombrar`
                              : `Abrir ${hoja.dayName}`
                          }
                        >
                          {hoja.dayName}
                        </button>
                      ) : (
                        /* Sin ninguna puerta detrás, el nombre es un rótulo y
                           no un botón que no lleva a ningún sitio. */
                        <span className="plan-col-nombre">{hoja.dayName}</span>
                      )}
                      {/*
                        ══ LA LÍNEA DE DEBAJO DEL NOMBRE SE HA IDO ═══════════
                        Llevaba tres cosas —el semáforo, el peso de la hoja y la
                        excepción— y existía para que no fueran tres renglones
                        sueltos de alto variable, que era lo que descuadraba la
                        rejilla («las sesiones no están alineadas»).

                        El rediseño las reparte mejor sin romper esa ley: el
                        semáforo y el peso suben juntos al cintillo de la derecha
                        (son la misma pregunta) y la excepción baja a la fila de
                        chips, que es donde vive lo que califica a la hoja. Dos
                        renglones fijos en vez de tres, y ninguno opcional.
                      */}
                      {/*
                        ══ Y EL CUARTO RENGLÓN: DE QUÉ SON ESAS SERIES ═══════
                        «Ver volumen y eso.» «18 series» dice cuánto pesa la
                        hoja pero no qué entrena, que es la mitad de la
                        decisión al montar un microciclo: si Push A lleva ocho
                        de pecho y seis de tríceps, Push B se escribe distinto.
                        Estaba solo en la tarjeta del costado, y allí la suma
                        es la del BLOQUE ENTERO: no contesta por esta hoja.

                        Los tres grupos que más pesan, en el orden en que
                        pesan, y el resto en el title. Renglón fijo: se pinta
                        aunque la hoja esté en blanco, porque es lo que
                        mantiene la fila 1 de todas las columnas a la misma
                        altura (la misma ley que `.plan-col-dia`).
                      */}
                      {/*
                        ══ EL TOTAL DE LA HOJA, EL PRIMER CHIP (23 sep) ═══════
                        «18 series» vivía dentro de la píldora de estado y en
                        columna estrecha se escondía. La primera vuelta lo puso
                        suelto al canto derecho, con otra letra, y se leía como
                        un texto pegado. Ahora es un chip más, con el mismo
                        orden que los otros —«Total 18» como «Cuádriceps 7»—,
                        el primero, y distinto solo por el relleno. Va delante
                        del «+N» y no se encoge: nunca queda absorbido.
                      */}
                      <span
                        className="plan-col-vol"
                        title={
                          volumenDeLaHoja(hoja).length > 0
                            ? `${hoja.series} series pautadas: ${volumenDeLaHoja(hoja).map(([m, n]) => `${m} ${n}`).join(' · ')}`
                            : `${hoja.series} series pautadas`
                        }
                      >
                        <span className="plan-col-vol-g is-total">
                          Total <span className="plan-col-vol-n">{hoja.series}</span>
                        </span>
                        {volumenDeLaHoja(hoja)
                          .slice(0, 3)
                          .map(([m, n]) => (
                            <span className="plan-col-vol-g" key={m}>
                              {m} <span className="plan-col-vol-n">{n}</span>
                            </span>
                          ))}
                        {volumenDeLaHoja(hoja).length > 3 && (
                          <span className="plan-col-vol-mas">+{volumenDeLaHoja(hoja).length - 3}</span>
                        )}
                        {/* La excepción, al final de la fila de chips: los
                            microciclos donde esta hoja se aparta del plan. Sin
                            semáforo a propósito —una excepción es una decisión
                            del entrenador, no un fallo— y con su asterisco, que
                            es lo que la distingue de un grupo muscular. */}
                        {/*
                          ══ Y SE PUEDE DAR POR VISTA (23 sep) ═══════════════
                          Solo marca los microciclos que nadie ha dado por
                          vistos (`avisan`). Pulsarla dice qué difiere en cada
                          uno —y lleva a él— y ofrece «Es intencionado», que la
                          quita hasta que cambie algo más ahí. Sin manejadores
                          (el portal del cliente) es la marca y su globo.
                        */}
                        {conPlanPropio && (hoja.avisan || []).length > 0 && (() => {
                          const detalle = hoja.avisan
                            .map((w) => `${etiqueta(w)}: ${bloque ? queDifiere(bloque, w, hoja.dayName) : 'difiere del bloque'}`)
                            .join(' · ');
                          const marca = `✱ ${hoja.avisan.map(etiqueta).join(' · ')}`;
                          if (!onIrSemana && !onExcepcionVista) {
                            return (
                              <span className="plan-col-excepcion" title={detalle}>
                                {marca}
                              </span>
                            );
                          }
                          return (
                            <MenuAcciones
                              clase="plan-col-excepcion is-mando"
                              label={marca}
                              sinFlecha
                              alineado="izquierda"
                              descriptivo
                              titulo={detalle}
                              ariaLabel={`Excepciones de ${hoja.dayName}: ${detalle}`}
                              items={[
                                ...hoja.avisan.map((w) => ({
                                  label: `Ver ${etiqueta(w)}`,
                                  sub: bloque ? queDifiere(bloque, w, hoja.dayName) : null,
                                  run: onIrSemana ? () => onIrSemana(w) : undefined,
                                })).filter((it) => it.run),
                                onExcepcionVista ? null : undefined,
                                onExcepcionVista
                                  ? {
                                      label: 'Es intencionado',
                                      sub: 'Quita la marca hasta que cambie algo más',
                                      run: () => onExcepcionVista(hoja.dayName, hoja.avisan),
                                    }
                                  : undefined,
                              ]}
                            />
                          );
                        })()}
                      </span>
                    </div>
                  </header>
                  </div>

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
                      /*
                        La pauta, en tramos. El respaldo es para el ejercicio
                        sin ninguna serie montada —lo deja algún importador—:
                        ahí no hay tramos que sacar y la fila tiene que seguir
                        enseñando su casilla para poder escribirlos.
                      */
                      const deSusSeries = tramosDeSeries(ex);
                      const tramos =
                        deSusSeries.length > 0 ? deSusSeries : [{ n: ex.series || 0, reps: ex.targetReps || '' }];
                      /* Con varios tramos hace falta `onEsquema`: sin él, los
                         dos verbos de siempre no saben decir «1 × 12, 3 × 6-8»
                         y las casillas escribirían una pauta distinta de la que
                         enseñan. Entonces se lee y no se toca. */
                      const editable = Boolean(onSeries && onReps && (onEsquema || tramos.length === 1));
                      const real = ultimaDeSemana ? resumenDeEntrada(ultimaDeSemana, ex.name) : null;
                      const fantasma = !real && pasada ? resumenDeEntrada(pasada, ex.name) : null;
                      const hecho = real ? (real.series >= ex.series ? 'ok' : 'warn') : null;
                      const dicho = real
                        ? `${ex.name} · ${este} ${unidad.toLowerCase()}: ${resumenTexto(real)}`
                        : fantasma
                          ? `${ex.name} · la vez pasada: ${resumenTexto(fantasma)}`
                          : ex.name;
                      return (
                        <li
                          className={`plan-ej${marcas(piezaEj)}`}
                          key={ex.id}
                          {...(cerrada ? {} : receptor(piezaEj))}
                        >
                          {!cerrada && onMoverEjercicio && hoja.exercises.length > 1 && (
                            <button
                              type="button"
                              className="hoja-asa plan-asa is-ej"
                              aria-label={`Reordenar ${ex.name}. Alt y flechas para moverlo.`}
                              title="Arrastra para cambiarlo de sitio (o Alt + ↑/↓)"
                              {...asa(piezaEj, ex.name, (d) => {
                                const destino = i + d;
                                if (destino >= 0 && destino < hoja.exercises.length) {
                                  onMoverEjercicio(hoja.dayName, ex.name, d);
                                }
                              })}
                            >
                              <GripVertical size={13} />
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

                            El nombre, lo registrado y la pauta son TRES piezas
                            HERMANAS y no dos anidadas: `.plan-ej` es una
                            rejilla con áreas («nombre pauta» / «real pauta»),
                            así que puede recolocarlas según lo ancha que sea la
                            columna sin que ninguna se caiga. Metidas en un
                            `.plan-ej-texto`, en columna estrecha había que
                            esconder el registro —justo la firma de la
                            pantalla— para que cupiera.
                          */}
                          {/* El nombre no lleva el semáforo: lo lleva lo
                              REGISTRADO, que es donde está el juicio. Estuvo
                              aquí como `is-ok`/`is-warn` y ninguna de las dos
                              tenía regla en el CSS —un modificador muerto que
                              pintaba exactamente nada—, mientras
                              `.plan-ej-real.is-warn` sí existía y no se lo ponía
                              nadie. Las dos puntas de la misma avería. */}
                          <span className="plan-ej-nombre" title={dicho}>
                            {!cerrada && onRenombrarEjercicio ? (
                              <CambiarEjercicio
                                ejercicio={ex}
                                /* Lo que enseña la hoja y, con bloque, también lo
                                   que entra por excepción en alguna semana. */
                                vecinos={[
                                  ...hoja.exercises,
                                  ...(bloque ? nombresDeLaHoja(bloque, hoja.dayName, ex.id) : []),
                                ]}
                                library={library}
                                /* Lo registrado sigue en el globo del nombre. */
                                title={dicho}
                                onCambiar={(nombre, opciones) =>
                                  onRenombrarEjercicio(hoja.dayName, ex.name, nombre, opciones)
                                }
                              />
                            ) : (
                              ex.name
                            )}
                          </span>
                          {/*
                            ── Y SE DICE QUE ES LO QUE HIZO ──────────────────
                            «110 kg · 8·8·8·7» debajo del nombre y «4 × 6-8» a
                            su derecha: dos cifras del mismo tamaño, una encima
                            de la otra, sin nada que dijera cuál era el plan y
                            cuál el registro. El dueño: «no se entiende del todo
                            qué va dónde». Una palabra lo resuelve, y es la
                            misma que rotula la mitad derecha de la hoja.
                          */}
                          {/*
                            ── Y EN EL FRAME ES UNA CHAPA, NO UN RENGLÓN ──────
                            Lo registrado iba en tinta suelta debajo del nombre y
                            el verde se le quitó en su día por una razón buena:
                            ocho líneas verdes debajo de ocho nombres dejaban la
                            pantalla entera en semáforo y el azul de lo que se
                            pulsa se perdía dentro.

                            El rediseño lo devuelve pero CONTENIDO: el color no
                            es la letra, es un fondo tenue del tamaño de la
                            chapa, así que dice lo mismo sin gritarlo. Verde si
                            cumplió las series, ámbar si se quedó corto, y gris
                            para el fantasma de la vez pasada —que no juzga
                            nada, solo recuerda—.
                          */}
                          {(real || fantasma) && (
                            <span className={`plan-ej-real${hecho ? ` is-${hecho}` : ''}`}>
                              <span className="plan-ej-real-k">{real ? 'hizo' : 'antes'}</span>
                              {resumenTexto(real || fantasma)}
                            </span>
                          )}
                          <span className="plan-ej-pauta">
                            {pesoPautado(ex) && (
                              <span className="plan-ej-peso" title="Peso pautado en la hoja">
                                {pesoPautado(ex)}
                              </span>
                            )}
                            {/*
                              ── LA DOSIS: campos o rótulo ──────────────────
                              Aquí se escribe el plan del bloque, y por eso son
                              campos. Quien monta esta rejilla para MIRARLA
                              —el portal del cliente— no pasa `onSeries` ni
                              `onReps`, y entonces la dosis se lee y ya: un
                              campo que no se puede escribir es una promesa
                              falsa.

                              El rótulo usa las MISMAS clases con `is-lectura`,
                              que ya existían en `piezas.css` para esto: mismo
                              ancho, misma cifra tabular y mismo sitio, así que
                              las columnas del cliente caen exactamente donde
                              caen las del entrenador. Lo que pierde es el
                              fondo al pasar por encima, que era la única señal
                              de que ahí se escribía.

                              ── Y LA DOSIS SON TRAMOS ──────────────────────
                              «4 × 6-8» es UN tramo y se pinta como se pintaba:
                              dos casillas en su carril. Con varios, la fila
                              sigue midiendo un renglón —la pauta escrita, «6-8,
                              8-10, 8-12»— y cada cifra se escribe en su sitio. Ver
                              `PautaEnLinea`.

                              Escribir un solo tramo sigue siendo el verbo de
                              siempre —`onSeries` cuando cambia la cifra y
                              `onReps` cuando cambian las repeticiones—, que es
                              lo que conserva su apunte en la bitácora. Con dos
                              o más no hay otra forma de decirlo que el esquema
                              entero, y para eso está `onEsquema`.
                            */}
                            <PautaEnLinea
                              tramos={tramos}
                              nombre={ex.name}
                              idBase={`p-${ex.id}`}
                              puedePartir={Boolean(onEsquema)}
                              onCambiar={
                                editable
                                  ? (nuevos) => {
                                      const antes = esquemaDicho(tramos);
                                      if (tramos.length === 1 && nuevos.length === 1) {
                                        if (nuevos[0].n !== tramos[0].n && nuevos[0].reps === tramos[0].reps) {
                                          onSeries(hoja.dayName, ex.name, nuevos[0].n, tramos[0].n);
                                          return;
                                        }
                                        if (nuevos[0].n === tramos[0].n && nuevos[0].reps !== tramos[0].reps) {
                                          onReps(hoja.dayName, ex.name, nuevos[0].reps);
                                          return;
                                        }
                                      }
                                      if (onEsquema) onEsquema(hoja.dayName, ex.name, nuevos, antes);
                                      else if (nuevos.length === 1) {
                                        /* «4x6-8» escrito de una vez en una hoja sin esquema. */
                                        onSeries(hoja.dayName, ex.name, nuevos[0].n, tramos[0].n);
                                        onReps(hoja.dayName, ex.name, nuevos[0].reps);
                                      }
                                    }
                                  : null
                              }
                            />
                            {/*
                              El remate, si esa hoja lo pauta: una marca, no la
                              frase. Que un ejercicio acabe en bajada es parte
                              del plan y esta rejilla no lo decía en ninguna
                              parte —había que abrir la hoja para enterarse—;
                              la frase entera («bajada ×2, −20 %») no cabe en
                              310 px y su sitio es la fila de la serie que
                              remata. Ver `HojaDeSeries`.
                            */}
                            {rematesDe(ex).length > 0 && (
                              <span
                                className="plan-ej-remate"
                                title={rematesDe(ex)
                                  .map((r) => `serie ${r.serie}: ${tecnicaFrase(r.tecnica)}`)
                                  .join(' · ')}
                              >
                                <Zap size={13} aria-hidden="true" />
                              </span>
                            )}
                          </span>
                          {/* La papelera no gasta ancho: se posa encima del
                              carril de la pauta al acercarse a la fila. */}
                          {onQuitarEjercicio && (
                            <button
                              type="button"
                              className="btn btn-icon btn-icon-compact btn-icon-danger plan-ej-quitar"
                              aria-label={`Quitar ${ex.name}`}
                              onClick={() => onQuitarEjercicio(hoja.dayName, ex.name)}
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ol>

                  {/*
                    ══ LA HOJA EN BLANCO INVITA A TRAER LA QUE YA TIENES ═════
                    Quien llega de un Excel no tiene que volver a escribir su
                    rutina: la suelta aquí y el lector saca los días, los
                    ejercicios y las series —y la dieta, si va en el mismo
                    fichero—. Escribir de cero sigue abajo, en «+ ejercicio».
                    Calla mientras se escribe el primero: ya se ha elegido.
                  */}
                  {hoja.dayName === hojaQueInvita && altaEn !== hoja.dayName && (
                    <div className="plan-traer">
                      <ZonaDeSoltar
                        icon={FileUp}
                        encima={soltarFichero.encima}
                        titulo="Trae la rutina que ya tienes"
                        sub="Arrastra un Excel, Word o PDF, o pulsa para elegirlo"
                        onClick={() => onTraerFichero()}
                      />
                    </div>
                  )}

                  {/* El pie es el carril de «+ ejercicio» y de los avisos de la
                      hoja. Sin ninguno de los dos no se pinta: un pie vacío son
                      13 px de relleno y un filete debajo de la última fila. */}
                  {(cerrada || onAnadirEjercicio) && (
                  <div className="plan-col-pie">
                    {cerrada ? (
                      /* Sin sitio donde escribir: todas sus repeticiones están
                         entrenadas. Se dice en una palabra, no en una frase. */
                      <span className="plan-col-cerrada" title={`Ya entrenada en ${todas} ${unidades} de este bloque`}>
                        entrenada
                      </span>
                    ) : altaEn === hoja.dayName ? (
                      /* El alta ocupa el pie de SU columna. Ni una ventana, ni
                         una banda que parta el renglón: la columna crece por
                         dentro y sus vecinas no se enteran. */
                      <AltaDeEjercicio
                        dayName={hoja.dayName}
                        library={library}
                        /* La del ejercicio anterior de ESTA hoja: es la regla
                           que ya siguen el banco del compositor y el «+» de la
                           biblioteca, y la que evita que el mismo gesto dé un
                           resultado distinto según por dónde entres. */
                        pauta={pautaHeredada(hoja.exercises)}
                        nota={componiendo ? null : `Se añade a ${todas} ${unidades} de este bloque que aún no se han entrenado.`}
                        onAdd={(exercise) => onAnadirEjercicio(hoja.dayName, exercise)}
                        onRecordar={onRecordarEjercicio}
                        onClose={() => setAltaEn(null)}
                      />
                    ) : onAnadirEjercicio ? (
                      <button
                        type="button"
                        className="plan-alta-abrir"
                        onClick={() => setAltaEn(hoja.dayName)}
                        title={componiendo ? `Añadir un ejercicio a «${hoja.dayName}»` : `Se añade a ${todas} ${unidades} de este bloque que aún no se han entrenado`}
                      >
                        <Plus size={15} aria-hidden="true" /> ejercicio
                      </button>
                    ) : null}

                  </div>
                  )}
                </section>
              );
            })}

            {/*
              ══ «+ hoja» NO ESTÁ AQUÍ, Y ES LA TERCERA VEZ QUE SE MUDA ══════

              Vivió debajo de la rejilla —«el botón hojas está demasiado
              abajo»: con las columnas estiradas al bajo de la ventana caía a
              novecientos píxeles del titular— y vivió DENTRO de la retícula,
              como el hueco de la hoja siguiente. Lo segundo lo rompe
              `auto-fit`: cuando el ancho no da para una pista más, la columna
              del hueco baja a la fila de abajo y el botón vuelve exactamente al
              sitio del que se le quería sacar (medido a 1600, con la mesa en
              932 px).

              Ahora está al final del renglón del microciclo, en la tira, que es
              de quien son las hojas y donde no depende de cuánto quepa. Lo pone
              `WorkoutLogEditor` con la prop `derecha`.
            */}
          </div>
        </section>
    </div>
  );
};
