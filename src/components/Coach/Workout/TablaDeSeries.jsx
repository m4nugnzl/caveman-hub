import { Fragment } from 'react';
import { Plus, X } from 'lucide-react';

import { isSetLogged } from '@/domain/sessions';
import {
  nombreDeSubserie,
  subseriesDe,
  tecnicaDeLaSerie,
  tecnicaFrase,
  tecnicaSpec,
} from '@/domain/training';
import { toNum } from '@/lib/num';
import { RemateDeLaSerie } from './RemateDeLaSerie';

/**
 * LA TABLA DE SERIES DE UN EJERCICIO: una fila por serie, y una sola en todo
 * el producto.
 *
 * ══ Por qué salió de `HojaDeSeries` ════════════════════════════════════════
 *
 * Vivía dentro de ella y ahí estaba bien mientras hubo un solo sitio donde se
 * escribe serie a serie. Dejó de haberlo: los kilos y el RIR se pautan por
 * SERIE desde el 9 sep, y el compositor —donde se monta el bloque entero antes
 * de abrirlo— no enseñaba ninguna serie, así que las dos únicas pautas que no
 * son del ejercicio no se podían escribir hasta después de abrir el bloque.
 *
 * La salida barata era dibujar allí una tabla parecida. Sería la misma avería
 * que ya tuvo el remate cuando se pautaba en dos sitios: **dos modelos del
 * mismo dato**, y el de la copia pisando al otro al primer campo nuevo. Así
 * que la tabla es una y la usan los dos.
 *
 * ══ LAS DOS MITADES, Y CUÁNDO SOBRA UNA ════════════════════════════════════
 *
 * La tabla es PIDES (kg · reps · rir) | HIZO (kg · reps · rir), partidas por la
 * costura. Con `soloPlan` puesto se queda la mitad izquierda, y no es una
 * variante estética: donde se compone un bloque **no hay nada hecho todavía**
 * —no existe ni el bloque—, así que las tres columnas de la derecha serían
 * doce renglones por ejercicio esperando un dato que no puede llegar. Es la ley
 * del reposo: lo que no está, no se pinta.
 *
 * Con ella se van también las tandas del remate (`extras`), que son registro
 * puro: lo que el cliente anota de cada bajada. Lo que SÍ se queda es la pauta
 * del remate —su línea con sus números—, porque eso es plan.
 */

/** El mínimo del rango objetivo: «8-10» → 8. */
const minimoDe = (targetReps) => toNum(String(targetReps ?? '').split(/[-–]/)[0]);

/* Las dos mitades, y el mismo orden en las dos: kg, reps, rir. La simetría no
   es estética — es lo que deja comparar en horizontal sin contar columnas. */
/* `pautable` dice que la columna solo existe si esta hoja la usa (ver
   `camposDeLaHoja`); el protocolo del cliente puede además dejar el RIR puesto
   de entrada aunque esté vacío. Las repeticiones no llevan ninguna de las dos:
   son el objetivo que define una serie. */
export const CAMPOS_PIDES = [
  { key: 'targetKg', label: 'kg', mode: 'decimal', pista: '', opcional: true, pautable: true },
  { key: 'targetReps', label: 'reps', mode: 'text', pista: '8-10' },
  { key: 'targetRir', label: 'rir', mode: 'numeric', pista: '2', pautable: true },
];
/*
  ── Y LA RAYA VUELVE ────────────────────────────────────────────────────────
  Se quitó una vez, y con razón para lo que la hoja era entonces: cada casilla
  vivía en su caja hundida, así que un microciclo sin registrar eran doce
  rectángulos grises por ejercicio con una raya dentro de cada uno, y eso se
  leía como un dibujo antes que como una tabla.

  Lo que quitaba la raya era la CAJA, no la raya. Desde el frame `46:114` la
  mitad de lo hecho va sobre el papel, sin fondo, al canto derecho de su
  columna: ahí una raya no es relleno, es el sitio del dato dicho en voz baja
  —que es lo que el dibujo pone en las doce celdas vacías del suyo—. Y sin
  ella, una columna de dos cifras y dos huecos no se lee como una columna.
  El dueño, con el prototipo delante: «los guiones me gustan tal y como en el
  prototipo».
*/
const CAMPOS_HECHO = [
  { key: 'kg', label: 'kg', mode: 'decimal', pista: '-' },
  { key: 'reps', label: 'reps', mode: 'numeric', pista: '-' },
  { key: 'rir', label: 'rir', mode: 'numeric', pista: '-' },
];
/* Y lo que se anota en una tanda de remate: kilos y repeticiones. RIR no: una
   bajada y un rest-pause van al fallo por definición, así que la columna solo
   podría llevar un cero repetido. */
const SUBCAMPOS = CAMPOS_HECHO.filter((c) => c.key !== 'rir');

/*
  La celda vacía se queda VACÍA. El relleno era una raya, y las tres columnas
  de «Hizo» de un microciclo sin registrar son doce rayas por ejercicio: sobre
  cinco ejercicios, sesenta guiones alineados en tres columnas que se leen como
  un dibujo antes que como una tabla. La casilla hundida ya dice que ahí se
  escribe y que ahí no hay nada; la raya solo lo repite en tinta.

  Los objetivos sí conservan su pista («8-10», «2»): ahí el relleno enseña el
  FORMATO de lo que se espera, que no es evidente.
*/
const Celda = ({ value, placeholder = '', mode = 'numeric', tone = '', label, onChange }) => (
  <input
    type="text"
    inputMode={mode}
    className={`hoja-celda${tone ? ` ${tone}` : ''}`}
    value={value ?? ''}
    placeholder={placeholder}
    aria-label={label}
    onChange={(e) => onChange(e.target.value)}
    onKeyDown={(e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      /* Enter recorre la HOJA entera donde hay hoja —se baja de ejercicio en
         ejercicio sin tocar el ratón— y solo su tabla donde la tabla va suelta,
         que es lo que hay en la fila desplegada del compositor. */
      const donde = e.currentTarget.closest('.hoja') || e.currentTarget.closest('.hoja-tabla');
      const campos = [...(donde?.querySelectorAll('input.hoja-celda') || [])];
      const siguiente = campos[campos.indexOf(e.currentTarget) + 1];
      if (siguiente) siguiente.focus();
      else e.currentTarget.blur();
    }}
  />
);

/**
 * ══ CADA OBJETIVO SE PAUTA SI SE QUIERE, Y SU COLUMNA EXISTE SI SE PAUTA ══
 *
 * «Tanto kg como reps como rir se deberían poder pautar si se quiere.» Los
 * tres eran tres reglas distintas y ninguna era esa:
 *
 *   · kg   — columna fija en todas las hojas. Medido sobre un bloque entero:
 *            80 casillas y CERO escritas. De ahí «yo sigo viendo kg pautados».
 *   · reps — columna fija, y esta sí se usa siempre: es el objetivo normal.
 *   · rir  — encendido o apagado por el PROTOCOLO del cliente, o sea una
 *            decisión que se toma en otra pantalla, otro día, para todas sus
 *            hojas a la vez. Puesto, la columna salía vacía en las hojas donde
 *            no se pauta; quitado, no había forma de pautarlo en la que sí.
 *
 * Ahora la regla es una sola y la manda el CONTENIDO: la columna está si algo
 * de esta hoja la usa. Basta una serie con valor para que la columna esté en
 * todos sus ejercicios —han de cuadrar, es una tabla—, y para escribir el
 * primero está `aMano`, que la abre sin guardar nada.
 *
 * `showRir` no desaparece: el protocolo sigue pudiendo dejar el RIR puesto de
 * entrada para quien programa así siempre. Lo que ya no hace es IMPEDIRLO.
 *
 * La decisión se toma sobre la HOJA y no sobre el ejercicio: es una tabla, y
 * dos ejercicios seguidos con distinto número de columnas no se comparan.
 *
 * @returns `{ campos, porPautar, columnas }` — `porPautar` son los que faltan,
 *   para ofrecerlos («+ kg», «+ rir»), y `columnas` las clases de la retícula.
 */
export const camposDeLaHoja = (exercises = [], { showRir = false, aMano = {} } = {}) => {
  const pautado = (key) =>
    exercises.some((ex) => (ex.sets || []).some((s) => String(s?.[key] ?? '').trim() !== ''));
  const conCampo = (c) =>
    !c.pautable || (c.key === 'targetRir' && showRir) || pautado(c.key) || Boolean(aMano[c.key]);
  const campos = CAMPOS_PIDES.filter(conCampo);
  const conKg = campos.some((c) => c.key === 'targetKg');
  const conRir = campos.some((c) => c.key === 'targetRir');
  return {
    campos,
    porPautar: CAMPOS_PIDES.filter((c) => c.pautable && !conCampo(c)),
    columnas: `${conRir ? 'is-rir' : 'is-sin-rir'}${conKg ? '' : ' is-sin-kg'}`,
  };
};

/**
 * @param ex        el ejercicio, con sus `sets`.
 * @param campos    los objetivos que esta hoja pauta (ver `camposDeLaHoja`).
 * @param columnas  las clases de la retícula, de la misma lectura.
 * @param soloPlan  sin la mitad de lo hecho ni las tandas del remate.
 */
export const TablaDeSeries = ({
  ex,
  campos,
  columnas,
  soloPlan = false,
  onSetChange,
  onAddSet,
  onRemoveSet,
  onTecnica = null,
}) => {
  const sets = ex.sets || [];
  return (
    <div
      className={`hoja-tabla ${columnas}${soloPlan ? ' is-solo-plan' : ''}`}
      role="table"
      aria-label={`Series de ${ex.name}`}
    >
      {/*
        Los rótulos de ESTE ejercicio. Es la línea que el dueño pidió
        —«kg, reps y rir deberían ir en cada fila, no se entiende qué va
        dónde»— resuelta al nivel donde el dato deja de reconocerse: el
        ejercicio. Por serie sería repetirla cuatro veces seguidas.
      */}
      {/* Cada rótulo dice de qué MITAD es y qué columna es. No es adorno: desde
          el frame `46:114` las dos mitades no se alinean igual —lo pedido va al
          canto izquierdo, pegado a su pastilla, y lo hecho al derecho, que es
          donde se comparan las cifras bajando por la columna— y sin nombre en
          el rótulo eso habría que contarlo por posición, que cambia con cada
          combinación de columnas. */}
      <div className="hoja-fila is-head" role="row">
        <span className="hoja-rot">#</span>
        {campos.map((c) => (
          <span key={c.key} className={`hoja-rot is-pide${c.key === 'targetReps' ? ' is-reps' : ''}`}>
            {c.label}
          </span>
        ))}
        {!soloPlan && (
          <>
            <span className="hoja-costura" aria-hidden="true" />
            {CAMPOS_HECHO.map((c) => (
              <span key={c.key} className="hoja-rot is-hecho">
                {c.label}
              </span>
            ))}
          </>
        )}
        <span />
        <span />
      </div>
      {sets.map((set, i) => {
        const etiqueta = `${ex.name}, serie ${i + 1}`;
        const minimo = minimoDe(set.targetReps);
        const hechas = toNum(set.reps);
        const corta = minimo !== null && hechas !== null && hechas < minimo;
        const hecha = !soloPlan && isSetLogged(set);
        /* El remate de ESTA serie, y las tandas que cuelgan de él. */
        const remate = tecnicaDeLaSerie(ex, i);
        const subs = soloPlan ? 0 : subseriesDe(remate);
        return (
          <Fragment key={i}>
            <div
              className={`hoja-fila${hecha ? ' is-hecha' : ''}${remate ? ' is-remate' : ''}`}
              role="row"
            >
              <span className="hoja-num">{i + 1}</span>
              {campos.map((c) => (
                <Celda
                  key={c.key}
                  value={set[c.key]}
                  placeholder={c.pista}
                  mode={c.mode}
                  /*
                    El peso es el único objetivo OPCIONAL —vacío significa
                    «a criterio del cliente», que es lo normal— así que
                    vacío se dibuja como un renglón y no como una casilla.
                    Con caja, una hoja donde nadie pauta pesos son cuatro
                    cajas grises vacías por ejercicio, que es la avería que
                    esta hoja ya arregló una vez en la mitad derecha.
                  */
                  /*
                    ── Y LAS REPETICIONES SON LA PASTILLA ───────────────────
                    Las tres pautas se escriben igual, pero una de ellas es la
                    que DEFINE la serie: sin repeticiones objetivo no hay serie,
                    y el peso y el RIR son lo que se le añade encima (por eso se
                    pautan con un «+ kg» y no están siempre). El frame lo dibuja
                    con eso: «8-10» va en una pastilla de tinta y lo demás en
                    casilla normal. Es además lo que separa las dos mitades sin
                    gastar un rótulo — ver `.hoja-celda.is-reps`.
                  */
                  tone={`is-pide${c.key === 'targetReps' ? ' is-reps' : ''}${c.opcional && String(set[c.key] ?? '') === '' ? ' is-vacia' : ''}`}
                  label={`${etiqueta}: ${c.label} que pides`}
                  onChange={(v) => onSetChange(ex.id, i, c.key, v)}
                />
              ))}
              {/*
                LA COSTURA. Una columna de un píxel, presente en la
                cabecera, en cada serie y en cada subserie, así que la
                línea que parte lo pedido de lo hecho baja recta por toda
                la tabla. Un `border-left` en la primera celda de la
                derecha habría teñido el canto de un campo de escritura;
                esto no es de ningún campo, es de la tabla.

                Sin mitad derecha no hay nada que coser: en el compositor la
                columna no se pinta en ninguna fila, y la retícula lo sabe.
              */}
              {!soloPlan && (
                <>
                  <span className="hoja-costura" aria-hidden="true" />
                  {/*
                    ── LO QUE HIZO NO SE PINTA COMO LO QUE SE PIDE ─────────
                    Las tres columnas de «Hizo» las escribe el CLIENTE desde
                    su teléfono; el entrenador las toca para corregir una vez
                    de cada veinte. Con la casilla hundida en las cinco
                    columnas, un microciclo sin registrar son sesenta cajas
                    grises por hoja y la pantalla entera se lee como un
                    formulario en blanco: «me da la sensación de ser una hoja
                    muy plana, sosa».

                    Vacías son un renglón —el sitio donde caerá el dato, con
                    su raya—; escritas o al pasar por encima recuperan la
                    caja. El plan, que es lo que el entrenador SÍ escribe,
                    conserva la suya en las dos columnas de la izquierda: la
                    diferencia de superficie es la que separa lo pedido de lo
                    hecho sin gastar un rótulo más.
                  */}
                  {CAMPOS_HECHO.map((c) => (
                    <Celda
                      key={c.key}
                      value={set[c.key]}
                      placeholder={c.pista}
                      mode={c.mode}
                      tone={[
                        'is-hecho',
                        String(set[c.key] ?? '') === '' ? 'is-vacia' : '',
                        c.key === 'reps' && corta ? 'is-corta' : '',
                        c.key === 'reps' && !corta && hecha ? 'is-cumple' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      label={`${etiqueta}: ${c.label} hechos`}
                      onChange={(v) => onSetChange(ex.id, i, c.key, v)}
                    />
                  ))}
                </>
              )}
              {/*
                El remate, en la fila que remata. Solo se pauta donde se
                escribe el plan: sin `onTecnica` —la hoja de solo lectura
                del portal— la columna se queda vacía y las cifras siguen
                cuadrando.
              */}
              {onTecnica ? (
                <RemateDeLaSerie
                  tecnica={remate}
                  etiqueta={etiqueta}
                  onCambio={(t) => onTecnica(ex.id, i, t)}
                />
              ) : (
                <span />
              )}
              <button
                type="button"
                className="hoja-x"
                disabled={sets.length <= 1}
                aria-label={`Quitar ${etiqueta}`}
                title="Quitar serie"
                onClick={() => onRemoveSet(ex.id, i)}
              >
                <X size={13} />
              </button>
            </div>

            {/*
              ══ EL REMATE SE DIBUJA DONDE PASA ══════════════════════════
              «Que se vea bonito cuando pautas dropset o myoreps o cosas
              así.» Estuvo en el renglón del ejercicio, a cinco filas de
              la serie de la que hablaba, y luego al pie de la tabla. Las
              dos veces había que acordarse de a cuál se refería.

              Ahora cuelga de SU fila: el corchete, la pauta con sus
              números, y debajo un renglón por tanda —«bajada 1», «bajada
              2»— con sus casillas bajo las columnas de lo hecho. El
              nombre de la tanda ocupa el sitio de lo pedido porque eso es
              exactamente lo que es: lo pedido ya lo dice la pauta de
              arriba, y aquí solo se anota lo que salió.

              Tipografía de la hoja y no chapas de color: en esta tabla el
              color ya significa «repeticiones por debajo del objetivo».
            */}
            {remate && (
              <p className="hoja-remate" title={tecnicaSpec(remate.id)?.ayuda}>
                <span className="hoja-remate-corchete" aria-hidden="true" />
                {tecnicaFrase(remate)}
              </p>
            )}
            {Array.from({ length: subs }, (_, j) => {
              const extra = set.extras?.[j] || {};
              const nombre = nombreDeSubserie(remate, j);
              return (
                <div className="hoja-fila is-sub" role="row" key={`sub-${j}`}>
                  <span className="hoja-num" aria-hidden="true" />
                  <span className="hoja-sub-nombre">{nombre}</span>
                  <span className="hoja-costura" aria-hidden="true" />
                  {SUBCAMPOS.map((c) => (
                    <Celda
                      key={c.key}
                      value={extra[c.key]}
                      placeholder={c.pista}
                      mode={c.mode}
                      tone={`is-hecho${String(extra[c.key] ?? '') === '' ? ' is-vacia' : ''}`}
                      label={`${etiqueta}, ${nombre}: ${c.label}`}
                      onChange={(v) => onSetChange(ex.id, i, c.key, v, j)}
                    />
                  ))}
                  <span />
                  <span />
                  <span />
                </div>
              );
            })}
          </Fragment>
        );
      })}
      <button type="button" className="hoja-mas" onClick={() => onAddSet(ex.id)}>
        <Plus size={13} /> serie
      </button>
    </div>
  );
};
