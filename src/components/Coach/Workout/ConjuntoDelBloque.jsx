import { useState } from 'react';
import { Bookmark, ClipboardPaste, Copy, FileUp, GripVertical, Layers, Pencil, Plus, Trash2, Zap } from 'lucide-react';

import {
  blockPlan,
  hasBlockPlan,
  isCurrentBlock,
  structureOfBlock,
  untrainedWeeksOfDay,
  weeksOfBlock,
} from '@/domain/blocks';
import {
  MUSCLE_GROUPS,
  WEEK_DAYS,
  buildExercise,
  findMicrocycle,
  pesoPautado,
  rematesDe,
  rotatingSlots,
  unitInitial,
  unitIsFeminine,
  tecnicaFrase,
  unitLabel,
  unitLabelPlural,
} from '@/domain/training';
import { executedSessions, resumenDeEntrada, sessionSetCount, ultimaSesionDeHoja } from '@/domain/sessions';
import { localeNumber, weekdayName } from '@/lib/dates';
import { clampInt } from '@/lib/num';
import { Autocomplete } from '@/components/ui/Autocomplete';
import { MenuAcciones } from '@/components/ui/MenuAcciones';
import { EmptyState, RenombrarEnSitio } from '@/components/ui/primitives';
import { TIPO, useZonasDeSoltar } from '@/lib/portapapeles';
import { useArrastreDeFicheros } from '@/lib/useArrastreDeFicheros';
import { ZonaDeSoltar } from '@/components/ui/ZonaDeSoltar';

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
const AltaDeEjercicio = ({ dayName, library, nota, onAdd, onRecordar, onClose }) => {
  const [nombre, setNombre] = useState('');
  const [musculo, setMusculo] = useState(MUSCLE_GROUPS[0]);
  /* Cuántos van metidos en esta apertura: remonta el buscador —de ahí el
     `key`— y con él vuelve el `autoFocus`, que es lo que deja meter el
     siguiente sin tocar el ratón. */
  const [metidos, setMetidos] = useState(0);

  const enviar = (event) => {
    event.preventDefault();
    const name = nombre.trim();
    if (!name) return;
    onAdd(buildExercise({ name, muscle: musculo, numSets: 3, targetReps: '8-10' }));
    onRecordar(name, musculo);
    setNombre('');
    setMetidos((n) => n + 1);
  };

  return (
    <form className="plan-alta" onSubmit={enviar} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <Autocomplete
        key={`alta-${dayName}-${metidos}`}
        value={nombre}
        onChange={setNombre}
        items={library}
        /* La ficha del ejercicio en la lista: el equipamiento dice si eso
           existe en su gimnasio ANTES de elegirlo. */
        getMeta={(item) => [item.muscle, item.equipment].filter(Boolean).join(' · ')}
        onPick={(item) => {
          setNombre(item.name);
          if (item.muscle) setMusculo(item.muscle);
        }}
        placeholder="Busca o escribe uno nuevo"
        inputProps={{ autoFocus: true, 'aria-label': `Ejercicio nuevo de ${dayName}` }}
      />
      <div className="plan-alta-pie">
        <select
          className="select select-sm"
          value={musculo}
          aria-label={`Músculo del ejercicio nuevo de ${dayName}`}
          onChange={(e) => setMusculo(e.target.value)}
        >
          {MUSCLE_GROUPS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <button type="submit" className="btn btn-primary btn-sm" disabled={!nombre.trim()}>
          Añadir
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
          Listo
        </button>
      </div>
      {/* A cuántos microciclos va a parar esto. Es la única frase del alta, y
          hace falta: lo que se escribe aquí no es de esta semana. */}
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
    es cómo se llama el bloque —`nombre`— y dónde cae cada hoja —`split`—,
    que son los dos datos que normalmente saca de `bloque` y del programa.

    Ver `Compositor.jsx`.
  */
  plan: planDado = null,
  nombre = null,
  split: splitDado = null,
  onAbrirHoja,
  onIrSemana,
  onAnadirEjercicio,
  onQuitarEjercicio,
  onMoverEjercicio,
  onSeries,
  onReps,
  onAnadirHoja,
  onRenombrarHoja,
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
  onSplit,
  onTraerFichero,
}) => {
  const [nuevaHoja, setNuevaHoja] = useState(null);
  const [renombrando, setRenombrando] = useState(null);
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
  const estructura = componiendo
    ? { weeklySplit: splitDado || {}, mobilityDrills: [] }
    : structureOfBlock(program, bloque);

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
          title={`«${comoSeLlama}» todavía no tiene hojas`}
          message={
            esActual
              ? 'Una hoja es un día de entreno de este bloque —Push, Pull, Pierna—. Añade la primera y ponle dentro sus ejercicios.'
              : 'Es un bloque cerrado y se quedó sin ninguna montada. Lo que se programe a partir de ahora va en el bloque abierto.'
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

          La tira se queda donde sí hace falta: encima de una hoja abierta,
          donde es el único dibujo del microciclo y además su navegador. Aquí,
          dónde cae cada hoja lo dice su propia columna, y se cambia en su
          «···». Ver `EstructuraDelMicrociclo` y `WorkoutLogEditor`.
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
                  {esActual && !rotativo && onSplit ? (
                    <MenuAcciones
                      /* Sin día que decir, el rótulo guarda su sitio pero se
                         calla hasta que te acercas a la columna: cuatro hojas
                         sin reparto son cuatro «SIN DÍA» en versalita encima
                         de sus nombres, que es el ruido de decir cuatro veces
                         lo que no hay. Con día puesto se lee siempre. */
                      clase={`plan-col-dia is-mando${dia || cuandoCae(hoja.dayName) ? '' : ' is-vacio'}`}
                      alineado="izquierda"
                      ariaLabel={`Días en los que cae ${hoja.dayName}`}
                      sinFlecha
                      label={dia || cuandoCae(hoja.dayName) || 'sin día'}
                      items={WEEK_DAYS.map((d) => ({
                        label: `Cae el ${d.toLowerCase()}`,
                        on: split[d] === hoja.dayName,
                        run: () => onSplit(d, split[d] === hoja.dayName ? 'Descanso' : hoja.dayName),
                      }))}
                    />
                  ) : (
                    <span className="plan-col-dia">{dia || cuandoCae(hoja.dayName) || ' '}</span>
                  )}
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
                  {/*
                    ══ EL CINTILLO: CÓMO VA LA HOJA, Y LOS VERBOS ═════════════
                    La esquina derecha de la cabecera, enfrente del día. Lleva
                    dos cosas y en este orden:

                      · los VERBOS, que siguen apareciendo al acercarse.
                      · CÓMO VA, que se lee siempre.

                    Los verbos van a la IZQUIERDA de la píldora a propósito: el
                    cintillo está anclado al canto derecho, así que lo que crece
                    crece hacia dentro y la píldora no se mueve un píxel cuando
                    aparecen los cuatro botones. Esta casa ya aprendió que un
                    dato que se aparta del cursor es un dato que no se puede
                    apuntar (ver `.plan-ej-quitar`).
                  */}
                  <div className="plan-col-cintillo">
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
                      title={`Renombrar «${hoja.dayName}»`}
                      aria-label={`Renombrar «${hoja.dayName}»`}
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
                        title={`Poner «${hojaEnMano.titulo}» en «${hoja.dayName}»: conserva el nombre y cambia sus ejercicios`}
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
                  {/*
                    ══ CÓMO VA LA HOJA, EN UNA SOLA PÍLDORA ═══════════════════
                    Eran dos piezas en el renglón de debajo del nombre: el
                    semáforo («a medias · 14/20») y el peso de la hoja («20
                    series»). En el frame son UNA píldora, y tiene sentido que lo
                    sean: las dos contestan la misma pregunta —cuánto pide esta
                    hoja y cuánto lleva—, y separadas obligaban a leer dos veces.

                    La píldora se pinta SIEMPRE, con semáforo o sin él: sin
                    bloque en curso no hay estado que dar pero el peso de la hoja
                    sigue siendo un dato de la hoja. Sin ella la cabecera mediría
                    distinto en un bloque cerrado que en uno abierto, que es
                    exactamente el desnivel que costó dos vueltas quitar.
                  */}
                  <span
                    className={`plan-col-estado${estadoHoja ? ` is-${estadoHoja.tono}` : ''}`}
                    title={estadoHoja?.title}
                  >
                    {estadoHoja && <>{estadoHoja.texto} ·</>}
                    <span className="plan-col-sub">{hoja.series} series</span>
                  </span>
                  </div>
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
                          onDoubleClick={onRenombrarHoja ? () => setRenombrando(hoja.dayName) : undefined}
                          title={
                            onRenombrarHoja
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
                      <span
                        className="plan-col-vol"
                        title={
                          volumenDeLaHoja(hoja).length > 0
                            ? `Series pautadas: ${volumenDeLaHoja(hoja).map(([m, n]) => `${m} ${n}`).join(' · ')}`
                            : undefined
                        }
                      >
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
                        {conPlanPropio && hoja.difieren.length > 0 && (
                          <span
                            className="plan-col-excepcion"
                            title={`Con una excepción en ${hoja.difieren.map(etiqueta).join(', ')}`}
                          >
                            ✱ {hoja.difieren.map(etiqueta).join(' · ')}
                          </span>
                        )}
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
                            {ex.name}
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
                              dos campos. Quien monta esta rejilla para MIRARLA
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
                            */}
                            {onSeries ? (
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
                            ) : (
                              <span className="plan-series is-lectura">{ex.series}</span>
                            )}
                            <span className="plan-por" aria-hidden="true">
                              ×
                            </span>
                            {onReps ? (
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
                            ) : (
                              <span className="plan-reps is-lectura">{ex.targetReps ?? 'varias'}</span>
                            )}
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
                        sub="Suelta aquí su Excel, Word o PDF, o pulsa para buscarlo. Si trae su dieta, entra con ella."
                        onClick={() => onTraerFichero()}
                      />
                    </div>
                  )}

                  {/* El pie es el carril de «+ ejercicio» y de los avisos de la
                      hoja. Sin ninguno de los dos no se pinta: un pie vacío son
                      13 px de relleno y un filete debajo de la última fila. */}
                  {(cerrada || onAnadirEjercicio || (onIrSemana && hoja.difieren.length > 0)) && (
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

                    {onIrSemana && hoja.difieren.length > 0 && (
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
