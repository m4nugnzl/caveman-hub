import { Fragment } from 'react';
import { Plus, X } from 'lucide-react';

import { isSetLogged } from '@/domain/sessions';
import { nombreDeSubserie, subseriesDe, tecnicaDeLaSerie } from '@/domain/training';
import { isBlank, toNum } from '@/lib/num';
import { MenuAcciones } from '@/components/ui/MenuAcciones';
import { LineaDelRemate, RemateDeLaSerie } from './RemateDeLaSerie';

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
/* `lo` es cómo se nombra el objetivo en una frase: «Quitado el peso de…». */
/*
  ── EL RIR ES OPCIONAL SERIE A SERIE, COMO EL PESO ──────────────────────────
  Llevaba de pista un «2» en cada casilla vacía. Con la columna abierta, eso
  pintaba «2» en TODAS las series aunque no se hubiera escrito ninguno, y
  pautarlo en una sola —la última, la de aproximación— se leía como pautarlo
  en todas: «te lo mete a todas». Vacío es «sin pautar» y se dibuja como el
  peso vacío, un renglón.
*/
export const CAMPOS_PIDES = [
  { key: 'targetKg', label: 'kg', lo: 'el peso', mode: 'decimal', pista: '', opcional: true, pautable: true },
  { key: 'targetReps', label: 'reps', mode: 'text', pista: '8-10' },
  { key: 'targetRir', label: 'rir', lo: 'el RIR', mode: 'numeric', pista: '', opcional: true, pautable: true },
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
 * La COLUMNA se decide sobre la HOJA: es una tabla, y dos ejercicios seguidos
 * con distinto número de columnas no se comparan. Qué ejercicio la usa, no
 * (ver abajo).
 *
 * ── Y se quita igual que se pone ──────────────────────────────────────────
 * `retirables` son las columnas puestas que un «×» en su rótulo puede quitar:
 * vaciar ese objetivo en todas las series devuelve la hoja a «+ kg». El RIR
 * que pone el protocolo no está entre ellas: vaciado, la columna seguiría ahí,
 * y un «×» que no quita lo que señala es peor que no tenerlo.
 *
 * @returns `{ campos, delEjercicio, faltanEn, retirables, columnas }` —
 *   `delEjercicio(ex)` dice qué lleva un ejercicio y qué le falta (su «+ kg»);
 *   `faltanEn(key)`, a quién más se le puede dar; `retirables`, las claves de
 *   los que se pueden quitar; `columnas`, las clases de la retícula.
 */
/*
 * ── Y SE ABRE POR EJERCICIO (21 sep) ──────────────────────────────────────
 * «Cuando le doy a +kg me lo mete a todos los ejercicios de la hoja.» La
 * COLUMNA sigue siendo de la hoja —es lo que hace que las cifras caigan en
 * vertical—, pero quién la USA es cada ejercicio: `aMano` va por ejercicio
 * (`{ [ex.id]: { targetKg: true } }`) y `delEjercicio(ex)` dice qué objetivos
 * lleva ese. En Entreno cada ejercicio es su propia caja y se dibuja SOLO con
 * sus columnas («si lo añades en uno, el resto se expande; no debería»). En
 * el compositor, con un rótulo para toda la hoja, el que no la lleva deja el
 * hueco vacío, sin casilla.
 */
export const camposDeLaHoja = (exercises = [], { showRir = false, aMano = {} } = {}) => {
  const pautadoEn = (ex, key) => (ex.sets || []).some((s) => String(s?.[key] ?? '').trim() !== '');
  const impuesto = (c) => c.key === 'targetRir' && showRir;
  const usa = (ex, c) => !c.pautable || impuesto(c) || pautadoEn(ex, c.key) || Boolean(aMano[ex.id]?.[c.key]);
  const campos = CAMPOS_PIDES.filter((c) => exercises.some((ex) => usa(ex, c)));
  const reticula = (lista) =>
    `${lista.some((c) => c.key === 'targetRir') ? 'is-rir' : 'is-sin-rir'}${lista.some((c) => c.key === 'targetKg') ? '' : ' is-sin-kg'}`;
  return {
    campos,
    /** `{ activos, porPautar, campos, columnas }` de un ejercicio: qué casillas
        lleva, qué le falta y su propia retícula. En Entreno cada ejercicio es su
        caja y se dibuja con SUS columnas: el kg de uno no ensancha a los demás. */
    delEjercicio: (ex) => {
      const suyos = CAMPOS_PIDES.filter((c) => usa(ex, c));
      return {
        activos: suyos.map((c) => c.key),
        porPautar: CAMPOS_PIDES.filter((c) => c.pautable && !usa(ex, c)),
        campos: suyos,
        columnas: reticula(suyos),
      };
    },
    /** Los ids de los ejercicios que todavía no llevan ese objetivo. */
    faltanEn: (key) => {
      const c = CAMPOS_PIDES.find((x) => x.key === key);
      return c ? exercises.filter((ex) => !usa(ex, c)).map((ex) => ex.id) : [];
    },
    retirables: campos.filter((c) => c.pautable && !impuesto(c)).map((c) => c.key),
    columnas: reticula(campos),
  };
};

/* `aMano` con un objetivo abierto (o cerrado) en unos ejercicios: en los de
   `ids`, o en todos los que ya tiene apuntados si `ids` es null. */
export const abrirAMano = (aMano, ids, key, valor = true) => {
  const lista = ids ?? Object.keys(aMano);
  return lista.reduce((v, id) => ({ ...v, [id]: { ...v[id], [key]: valor } }), aMano);
};

/**
 * «+ KG»: A ESTE EJERCICIO O A TODOS, SE DECIDE AL AÑADIRLO.
 *
 * «Me gustaría tener la posibilidad de decidir si es a todo o solo a ese
 * ejercicio cuando se añada.» Primero abría la columna en toda la hoja; luego
 * solo en el suyo. Las dos son lo que se quiere según el día, así que el mismo
 * verbo pregunta, con dos opciones y nada más. Si no hay nadie más a quien
 * dárselo —el ejercicio está solo, o los demás ya lo llevan— no hay nada que
 * decidir y abre directamente.
 *
 * @param faltan los ids de los ejercicios que no lo llevan (este incluido).
 * @param onAbrir `(ids)` abre el objetivo en esos ejercicios.
 */
export const AnadirObjetivo = ({ campo, ex, faltan, onAbrir, clase = 'hoja-chapa' }) => {
  const otros = faltan.filter((id) => id !== ex.id).length;
  if (otros === 0) {
    return (
      <button type="button" className={clase} title={`Pautar ${campo.label}`} onClick={() => onAbrir([ex.id])}>
        + {campo.label}
      </button>
    );
  }
  return (
    <MenuAcciones
      label={`+ ${campo.label}`}
      clase={clase}
      sinFlecha
      alineado="izquierda"
      ariaLabel={`Pautar ${campo.label}`}
      titulo={`Pautar ${campo.label}`}
      items={[
        { label: 'Solo en este ejercicio', run: () => onAbrir([ex.id]) },
        { label: 'En todos los de la hoja', run: () => onAbrir(faltan) },
      ]}
    />
  );
};

/* Escribir un objetivo pautable lo deja abierto en ese ejercicio: borrar la
   única cifra no puede hacer desaparecer la casilla mientras se escribe. */
export const esPautable = (key) => CAMPOS_PIDES.some((c) => c.key === key && c.pautable);

/**
 * El aviso de haber quitado una columna: «Quitado el peso de 6 ejercicios.»
 * `null` si no había nada escrito —la columna estaba abierta a mano y vacía—,
 * que entonces no hay nada que contar ni que deshacer.
 */
export const avisoDeRetirar = (key, ejercicios) => {
  if (!ejercicios) return null;
  const campo = CAMPOS_PIDES.find((c) => c.key === key);
  return `Quitado ${campo?.lo || campo?.label || key} de ${ejercicios} ${ejercicios === 1 ? 'ejercicio' : 'ejercicios'}.`;
};

/**
 * EL «×» DEL RÓTULO: el reverso exacto de «+ kg».
 *
 * Vive dentro del rótulo de su columna porque es de la columna —no de una
 * serie ni de un ejercicio— y sale al acercarse, como los verbos de la hoja; en
 * táctil está siempre. Sin confirmación: lo que quita vuelve con el «Deshacer»
 * del aviso. Lo usan las dos hojas —Entreno y el compositor— para que retirar
 * se aprenda una vez.
 */
export const QuitarColumna = ({ campo, onQuitar }) => (
  <button
    type="button"
    className="hoja-rot-x"
    title={`Quitar ${campo.label}`}
    aria-label={`Quitar la columna de ${campo.label} de la hoja`}
    onClick={(e) => {
      /* La hoja de Entreno enciende el ejercicio al pulsar dentro: quitar una
         columna no es elegir ejercicio. */
      e.stopPropagation();
      onQuitar(campo.key);
    }}
  >
    <X size={13} aria-hidden="true" />
  </button>
);

/**
 * @param ex        el ejercicio, con sus `sets`.
 * @param campos    los objetivos que este ejercicio pauta (`delEjercicio(ex).campos`).
 * @param columnas  las clases de su retícula, de la misma lectura.
 * @param retirables las columnas que su rótulo puede quitar, y `onRetirar(key)`
 *   lo que pasa al pulsar su «×». Sin manejador no hay «×».
 * @param soloPlan  sin la mitad de lo hecho ni las tandas del remate.
 */
export const TablaDeSeries = ({
  ex,
  campos,
  columnas,
  retirables = [],
  onRetirar = null,
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
            {onRetirar && retirables.includes(c.key) && <QuitarColumna campo={c} onQuitar={onRetirar} />}
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
                    El peso y el RIR son objetivos OPCIONALES —vacío significa
                    «a criterio del cliente», que es lo normal— así que
                    vacío se dibuja como un renglón y no como una casilla.
                    Con caja, una hoja donde nadie pauta pesos son cuatro
                    cajas grises vacías por ejercicio, que es la avería que
                    esta hoja ya arregló una vez en la mitad derecha. Y es lo
                    que deja pautar una sola serie: las demás se leen vacías.
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

              ── Y es UNA pieza: la bandeja y el raíl ───────────────────────
              «Falta darle algo de gracia a las series de alta intensidad, se
              ve muy plano.» Eran cuatro renglones sueltos con rayas. Ahora la
              serie, su línea y sus tandas van sobre la misma bandeja, y un
              raíl baja del número de la serie hasta la última tanda. El punto
              de cada tanda dice algo cierto: hueco, sin apuntar; lleno, ya
              apuntada. Ver `.hoja-fila.is-sub` en `revision.css`.
            */}
            {remate && <LineaDelRemate tecnica={remate} />}
            {Array.from({ length: subs }, (_, j) => {
              const extra = set.extras?.[j] || {};
              const nombre = nombreDeSubserie(remate, j);
              const apuntada = SUBCAMPOS.some((c) => !isBlank(extra[c.key]));
              return (
                <div
                  className={`hoja-fila is-sub${apuntada ? ' is-apuntada' : ''}${j === subs - 1 ? ' is-fin' : ''}`}
                  role="row"
                  key={`sub-${j}`}
                >
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
