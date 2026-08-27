import { mealKcalRange, mealTarget, optionMacros } from '@/domain/nutrition';
import { Modal } from '@/components/ui/Modal';
import { MacroDonut } from '@/components/ui/charts';
import { MACRO_META, macroBreakdown, opcionElegida } from './macros';
import { PlanDia } from './PlanDia';

/**
 * LA VENTANA DEL DÍA: una pantalla, y de una pieza — sin deslizar.
 *
 *   1. Cuatro cifras: desvío medio por comida, cuántas cuadran, entre qué kcal
 *      se mueve el día según las alternativas, y cuántas alternativas hay.
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
const tono = (diff, objetivo) => {
  if (!objetivo) return '';
  const margen = objetivo * 0.05;
  return diff > margen ? ' is-over' : diff < -margen ? ' is-under' : ' is-ok';
};

export const DiaPopup = ({ open, label, meals, targets, elegidas = {}, onTarget, onIrA, onClose }) => {
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
  const cuadran = conPauta.filter((f) => Math.abs(f.desvio) <= f.pautado.kcals * 0.05).length;
  const rangoDia = filas.reduce((acc, f) => ({ min: acc.min + f.rango.min, max: acc.max + f.rango.max }), { min: 0, max: 0 });
  const totalOpciones = filas.reduce((s, f) => s + f.opciones, 0);

  const irA = (i) => {
    onClose();
    onIrA?.(i);
  };

  return (
    <Modal open={open} size="lg" title={`El día · ${label}`} onClose={onClose}>
      <div className="col gap-4 dia-ventana">
        <div className="bloque-cifras">
          <div className="bloque-cifra">
            <span className="v">{desvioMedio === null ? '—' : `±${desvioMedio}`}</span>
            <span className="k">kcal de desvío medio por comida</span>
          </div>
          <div className="bloque-cifra">
            <span className="v">
              {cuadran}
              <small>/{conPauta.length}</small>
            </span>
            <span className="k">comidas que cuadran (±5 %)</span>
          </div>
          <div className="bloque-cifra">
            <span className="v">
              {Math.round(rangoDia.min)}
              <small>–{Math.round(rangoDia.max)}</small>
            </span>
            <span className="k">kcal según la alternativa que elija</span>
          </div>
          <div className="bloque-cifra">
            <span className="v">{totalOpciones}</span>
            <span className="k">
              {totalOpciones === 1 ? 'alternativa' : 'alternativas'} en {meals.length} {meals.length === 1 ? 'comida' : 'comidas'}
            </span>
          </div>
        </div>

        <section className="bloque-seccion">
          <h3 className="bloque-titulo">Reparto · lo que le asignas a cada comida</h3>
          <PlanDia meals={meals} targets={targets} elegidas={elegidas} onTarget={onTarget} onIrA={irA} />
        </section>

        <section className="bloque-seccion">
          <h3 className="bloque-titulo">Desvío · lo real sobre lo pautado, con las opciones abiertas</h3>
          {/*
            Un anillo por comida: el reparto real de sus macros, el desvío de
            kcal en el centro y, debajo, lo que suma sobre lo pautado y las
            diferencias de cada macro. Se lee de un vistazo cuál cuadra y cuál
            no, y de qué es la diferencia.
          */}
          <div className="dia-anillos">
            {filas.map((f) => {
              const pautado = f.pautado?.kcals || 0;
              const t = tono(f.desvio ?? 0, pautado);
              const energia = macroBreakdown({ protein: f.real.protein, carbs: f.real.carbs, fats: f.real.fats, kcals: f.kcal });
              return (
                <button key={f.id} type="button" className={`dia-anillo${t}`} onClick={() => irA(f.i)} title="Ir a la comida">
                  <MacroDonut
                    size={76}
                    thickness={9}
                    slices={MACRO_META.map(({ key, label: l, color }) => ({ key, label: l, color, value: energia.energy[key] }))}
                    label={f.desvio === null ? f.kcal || '—' : signo(f.desvio)}
                    unit="kcal"
                    sub={f.desvio === null ? 'sin pauta' : 'de desvío'}
                  />
                  <span className="dia-anillo-nombre">
                    <span className="plan-dia-n">{f.i + 1}</span>
                    {f.nombre}
                  </span>
                  <span className="dia-anillo-kcal">
                    <b>{f.kcal}</b>
                    {pautado ? ` de ${pautado} kcal` : ' kcal'}
                  </span>
                  <span className="dia-anillo-macros">
                    {MACRO_META.map(({ key, short, color }) => {
                      const d = f.pautado ? Math.round(f.real[key]) - f.pautado[key] : null;
                      return (
                        <span key={key} className={`dia-desvio-macro${f.pautado?.[key] ? tono(d, f.pautado[key]) : ''}`}>
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
      </div>
    </Modal>
  );
};
