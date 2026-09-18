import { useState } from 'react';

import { estadoDeDiff, margenDe, mealKcalRange, mealTarget, optionMacros } from '@/domain/nutrition';
import { Modal } from '@/components/ui/Modal';
import { useMarcaDeslizante } from '@/components/ui/carril';
import { MacroDonut } from '@/components/ui/charts';
import { MACRO_META, opcionElegida } from './macros';
import { PlanDia } from './PlanDia';
import { RepartoComparado } from './RepartoComparado';

/**
 * LA VENTANA DEL DÍA: una pantalla, y de una pieza — sin deslizar.
 *
 *   1. Tres cifras: desvío medio por comida, entre qué kcal se mueve el día
 *      según las alternativas, y cuántas alternativas hay.
 *   2. El REPARTO: la tabla donde se asignan kcal y macros a cada comida, con
 *      lo pautado arriba y lo que suma abajo, todo en las mismas columnas.
 *   3. El DESVÍO, comida a comida: un anillo por comida —su reparto real de
 *      macros, con el desvío de kcal en el centro— y debajo lo que suma sobre
 *      lo pautado y la diferencia de cada macro.
 *
 * ── Lo que cabe es lo que no se repite ──────────────────────────────────────
 * Había un cuarto bloque al pie con los tres macros del día sobre su objetivo,
 * y era la tercera copia de las mismas cifras: la tabla del punto 2 ya enfrenta
 * «OBJETIVO DEL PLAN» con «SUMAN» macro a macro y en las mismas columnas, y la
 * tira desde la que se abre esta ventana las tiene igual. Quitado eso, la
 * ventana entra entera y no hay que deslizar para ver el último dato.
 *
 * Todo con la opción ABIERTA en cada comida (la hoja la manda), así que cambiar
 * de alternativa cambia lo que se ve aquí: es la forma de probar un día.
 */
const signo = (n) => (n > 0 ? `+${n}` : `${n}`);
/* El semáforo es el del dominio, con su suelo: aquí vivía la tercera copia del
   5 % pelado y con ella los anillos de una comida de 9 g de grasa salían
   siempre en rojo. Ver `estadoDe` en `domain/nutrition.js`. */
const tono = (diff, objetivo, campo = 'kcals') => {
  /* En la ESCALA DE UNA COMIDA, que es más estrecha que la del día: aquí todo
     lo que se juzga es una comida contra lo que se le pautó a ella. Ver
     `MARGEN_COMIDA_KCALS` en `domain/nutrition.js`. */
  const estado = estadoDeDiff(diff, objetivo, campo, 'comida');
  return estado === 'none' ? '' : ` is-${estado}`;
};

/* La tinta del arco: la del semáforo de la cifra de dentro, en su peso de
   FIGURA. El aro no es texto —lo que hay que leer es el número del centro, y
   ese se queda en la tinta que se lee—, así que se pinta con el escalón vivo de
   la misma familia (ver `--positive-grafico` en `tokens.css`). Es la diferencia
   entre un dibujo apagado y uno que se ve desde el otro lado de la mesa. */
const TINTA = {
  ' is-ok': 'var(--positive-grafico)',
  ' is-over': 'var(--negative-grafico)',
  ' is-under': 'var(--warning-grafico)',
};

export const DiaPopup = ({
  open,
  label,
  meals,
  targets,
  elegidas = {},
  onTarget,
  onIrA,
  onClose,
  juzga = true,
  /* Todos los días del plan (`planDays`) y cómo escribir en cualquiera. Con
     más de uno, la ventana ofrece «Todos los días»: el reparto de cada comida
     en todos a la vez, para comparar entreno con descanso sin cerrar esta
     ventana y abrir la del otro. Ver `RepartoComparado`. */
  dias = [],
  onTargetDia = null,
  /* El título que habla en la voz del que reparte. El cliente abre la
     misma ventana en lectura y la lee desde su lado; como en `ComoLoLlevo`,
     va con el del entrenador por defecto. */
  tituloReparto = 'Reparto · lo que le asignas a cada comida',
  /* El DESVÍO —lo real sobre lo pautado— es lectura del que reparte. El
     cliente no reparte: lo que come ES lo pautado, así que a él la ventana le
     enseña la planificación y la comparación entre días, sin la cifra de
     desvío, sin los anillos y sin las cifras de arriba —el rango y la
     cuenta de alternativas no son planificación, son el tanteo del que
     monta el menú— (el dueño, 18 sep). */
  desvio = true,
}) => {
  const [todos, setTodos] = useState(false);
  const carril = useMarcaDeslizante();
  /* El entrenador compara y escribe; el cliente (sin `onTarget`) solo compara. */
  const comparable = dias.length > 1 && (Boolean(onTargetDia) || !onTarget);
  const comparando = todos && comparable;
  const filas = meals.map((meal, i) => {
    const pautado = mealTarget(meal);
    const real = optionMacros(opcionElegida(meal, elegidas));
    const rango = mealKcalRange(meal);
    const kcal = Math.round(real.kcal);
    return {
      i,
      id: meal.id,
      nombre: meal.name,
      pautado,
      real,
      kcal,
      rango,
      opciones: (meal.options || []).length,
      desvio: pautado ? kcal - pautado.kcals : null,
    };
  });

  const conPauta = filas.filter((f) => f.pautado?.kcals);
  const desvioMedio = conPauta.length
    ? Math.round(conPauta.reduce((s, f) => s + Math.abs(f.desvio), 0) / conPauta.length)
    : null;
  const rangoDia = filas.reduce((acc, f) => ({ min: acc.min + f.rango.min, max: acc.max + f.rango.max }), { min: 0, max: 0 });
  const totalOpciones = filas.reduce((s, f) => s + f.opciones, 0);

  const irA = (i) => {
    onClose();
    onIrA?.(i);
  };

  return (
    <Modal open={open} size="lg" title={comparando ? 'El reparto · todos los días' : `El día · ${label}`} onClose={onClose}>
      <div className="col gap-4 dia-ventana">
        {/*
          ══ SON PESTAÑAS, NO UN INTERRUPTOR (17 sep · frame 73:13) ══════════

          Era un `SegmentedControl` —dos cajas dentro de una— y el frame lo
          dibuja como el carril de pestañas de la casa: dos palabras con la raya
          de acento debajo de la abierta, pegado al filete de la cabecera.

          No es un cambio de dibujo por gusto: lo que hay debajo son DOS
          PANTALLAS distintas —una tabla de un día y otra de todos—, y eso es lo
          que una pestaña dice y un interruptor no. Un segmentado promete que lo
          de debajo se queda igual y solo cambia un filtro.
        */}
        {comparable && (
          <nav ref={carril} className="tabs dia-ventana-tabs" aria-label="Qué días se ven">
            {[
              { id: 'uno', label: 'Este día' },
              { id: 'todos', label: 'Todos los días' },
            ].map(({ id, label: rotulo }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={(id === 'todos') === comparando}
                className={`tab${(id === 'todos') === comparando ? ' active' : ''}`}
                onClick={() => setTodos(id === 'todos')}
                title={id === 'todos' ? 'El reparto de cada comida en todos los días a la vez' : undefined}
              >
                {rotulo}
              </button>
            ))}
            <span className="tabs-marca" aria-hidden="true" />
          </nav>
        )}

        {comparando ? (
          <section className="bloque-seccion">
            <RepartoComparado dias={dias} elegidas={elegidas} onTarget={onTargetDia} juzga={juzga} />
          </section>
        ) : (
        <>
        {/*
          ── DOS CIFRAS EN CAJA, Y LA TERCERA ES UNA LÍNEA (frame 73:22) ─────
          Eran tres celdas del mismo rango. El frame le da caja a las dos que
          son LECTURAS del día —cuánto se desvía y entre qué kcal se mueve— y
          baja la cuenta de alternativas a un renglón en voz baja, que es lo que
          es: el tamaño del menú, no una medida de cómo está montado.
        */}
        {desvio && (
        <>
        <div className="bloque-cifras is-cajas">
          <div className="bloque-cifra">
            <span className="v">{desvioMedio === null ? '—' : `±${desvioMedio}`}</span>
            <span className="k">kcal de desvío medio por comida</span>
          </div>
          {/* ── AQUÍ ESTABA «1/5 comidas que cuadran (±5 %)» ─────────────────
              Con el margen sin suelo esa cifra decía casi siempre «1 de 5» en
              planes que estaban cuadrados, así que era un marcador de fallos
              inventados. Y arreglado el margen sigue sin merecer un hueco: el
              desvío medio de al lado dice lo mismo con un número que se puede
              seguir de una semana a otra, y estas cuatro cifras no son un
              tanteo — son la lectura de un día. */}
          <div className="bloque-cifra">
            <span className="v">
              {Math.round(rangoDia.min)}
              <small>–{Math.round(rangoDia.max)}</small>
            </span>
            <span className="k">kcal según la alternativa que elija</span>
          </div>
        </div>

        <p className="dia-ventana-dice">
          {totalOpciones} {totalOpciones === 1 ? 'alternativa' : 'alternativas'} en {meals.length}{' '}
          {meals.length === 1 ? 'comida' : 'comidas'}
        </p>
        </>
        )}

        <section className="bloque-seccion">
          <h3 className="bloque-titulo">{tituloReparto}</h3>
          <PlanDia meals={meals} targets={targets} elegidas={elegidas} onTarget={onTarget} onIrA={irA} juzga={juzga} />
        </section>

        {desvio && (
        <section className="bloque-seccion">
          <h3 className="bloque-titulo">Desvío · lo real sobre lo pautado</h3>
          {/*
            Un anillo por comida: el reparto real de sus macros, el desvío de
            kcal en el centro y, debajo, lo que suma sobre lo pautado y las
            diferencias de cada macro. Se lee de un vistazo cuál cuadra y cuál
            no, y de qué es la diferencia.
          */}
          <div className="dia-anillos">
            {filas.map((f) => {
              const pautado = f.pautado?.kcals || 0;
              const t = juzga ? tono(f.desvio ?? 0, pautado, 'kcals') : '';
              /*
                ══ UN ARCO, NO TRES (frame 73:99) ═══════════════════════════

                El anillo era el reparto de macros de la comida —rosa, ámbar,
                violeta— con el desvío escrito en el centro: dos lecturas en
                el mismo dibujo, y la de fuera contestando una pregunta que
                aquí nadie hace (el reparto de UNA comida no se juzga contra
                nada). El frame lo deja en un solo arco del color del semáforo
                con el desvío en el centro.

                Los colores de macro no se pierden: siguen en los puntos de la
                línea de abajo, que es donde distinguen una serie de otra.

                ══ Y EL ARCO SE MIDE CONTRA EL MARGEN, NO CONTRA LO PAUTADO ══

                «Los 3 anillos son del mismo color», y era peor que eso: eran
                el mismo dibujo. El arco medía lo que la comida CUBRE de lo
                pautado —910 de 900, 1121 de 1100, 1098 de 1100—, o sea el
                99, el 102 y el 100 por ciento. Sobre una escala de cien, tres
                comidas bien montadas son tres círculos cerrados idénticos, y
                el único dato que quedaba era la cifra del centro.

                El arco mide ahora LO CLAVADA que está la comida en la escala
                de su propio margen (`margenDe` en escala de comida: el 2 %,
                nunca menos de 15 kcal). Lleno = en el clavo; medio aro = justo
                en el filo de lo que se le tolera; vacío = al doble de eso.

                ══ Y LA ESCALA ES LA DE LA COMIDA, NO LA DEL DÍA ════════════

                «Los 3 anillos son del mismo color, en el prototipo se ve
                distinto.» El margen del semáforo era el del PLAN —el 5 %, con
                suelo de 25 kcal— y sobre una comida de 1.100 eso son 55 kcal
                de holgura: la tercera comida del ejemplo se sale por 30 y aún
                salía verde, como las otras dos. Con la escala de la comida
                (`MARGEN_COMIDA_KCALS`) el margen es 22 y esa comida se pinta
                en ámbar, que es lo que el prototipo enseña: dos verdes y una
                ámbar. Las tres se dibujan además con arcos distintos —78 %,
                86 % y 32 %—: dos largos y uno corto.

                Y la escala del arco va al DOBLE del margen a propósito.
                Contra el margen pelado, todo lo que se sale salía con el aro
                vacío: la comida que se pasa de 30 y la que se pasa de 300 se
                dibujaban igual, y justo cuando el color ya está gritando es
                cuando hace falta saber por cuánto. Al doble, el filo del
                margen cae en la mitad del aro y lo que se sale sigue teniendo
                dónde caer.

                Y por qué el margen y no una escala fija: porque lo que es
                «mucho» en un desayuno de 900 kcal no lo es en una cena de
                1400, y ese suelo ya está decidido en el dominio y lo usa todo
                lo demás que juzga en esta pantalla. El anillo no inventa un
                segundo criterio: dibuja el que ya hay.
              */
              const margen = pautado > 0 ? margenDe(pautado, 'kcals', 'comida') : 0;
              const cubre =
                margen > 0
                  ? Math.max(0, Math.min(100, Math.round(100 - (Math.abs(f.desvio) / (margen * 2)) * 100)))
                  : 100;
              const tinta = TINTA[t] || 'var(--text-tertiary)';
              return (
                <button key={f.id} type="button" className={`dia-anillo${t}`} onClick={() => irA(f.i)} title="Ir a la comida">
                  <MacroDonut
                    /* 76 y no los 72 del frame: la escala de figuras de la casa
                       no tiene ese escalón y `verify-styles` lo vigila. */
                    size={76}
                    thickness={8}
                    slices={[
                      { key: 'cubre', label: 'lo clavada que está', color: tinta, value: cubre },
                      { key: 'resto', label: 'lo que se sale', color: 'transparent', value: 100 - cubre },
                    ]}
                    label={f.desvio === null ? f.kcal || '—' : signo(f.desvio)}
                    unit="kcal"
                  />
                  {/* Sin ordinal delante: ver `PlanDia`. Una comida se llama
                      por su nombre, y estas tres van en fila de izquierda a
                      derecha en el mismo orden que la hoja. */}
                  <span className="dia-anillo-nombre">{f.nombre}</span>
                  <span className="dia-anillo-kcal">
                    <b>{f.kcal}</b>
                    {pautado ? ` de ${pautado} kcal` : ' kcal'}
                  </span>
                  <span className="dia-anillo-macros">
                    {MACRO_META.map(({ key, short, color }) => {
                      const d = f.pautado ? Math.round(f.real[key]) - f.pautado[key] : null;
                      return (
                        <span key={key} className={`dia-desvio-macro${juzga && f.pautado?.[key] ? tono(d, f.pautado[key], key) : ''}`}>
                          <i style={{ background: color }} />
                          {short} {f.pautado?.[key] ? signo(d) : `${Math.round(f.real[key])} g`}
                        </span>
                      );
                    })}
                  </span>
                  {f.opciones > 1 && (
                    <span className="dia-anillo-opciones">
                      {f.opciones} opciones · {Math.round(f.rango.min)}–{Math.round(f.rango.max)} kcal
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/*
            Aquí iban los tres macros del día sobre su objetivo, y era la
            TERCERA copia de las mismas cifras: la tabla de arriba ya enfrenta
            «OBJETIVO DEL PLAN» con «SUMAN» macro a macro y en las mismas
            columnas, y la tira de encima de las comidas —desde la que se abre
            esta ventana— las tiene igual. Quitarlas es lo que hace que la
            ventana quepa de una pieza, sin deslizar.
          */}
        </section>
        )}
        </>
        )}
      </div>
    </Modal>
  );
};
