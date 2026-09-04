import { useId, useState } from 'react';
import { Check, Pencil } from 'lucide-react';

import { TARGET_FIELDS, macroSplit, targetsFor } from '@/domain/nutrition';
import { toNum0 } from '@/lib/num';
import { MacroBar } from './macros';
import { Modal } from '@/components/ui/Modal';

/* El nombre y la unidad van por separado desde que la unidad se pinta DENTRO
   del campo (`.input-suffix`): en la etiqueta era «Proteína (g)», un paréntesis
   haciendo el trabajo que hace mejor el propio recuadro. */
const LABELS = {
  targetKcals: 'Objetivo',
  proteinGrams: 'Proteína',
  carbsGrams: 'Carbos',
  fatsGrams: 'Grasas',
};
const UNIDADES = {
  targetKcals: 'kcal',
  proteinGrams: 'g',
  carbsGrams: 'g',
  fatsGrams: 'g',
};

/**
 * Objetivo de una variante: la cifra calórica y su reparto en una barra.
 *
 * ── Por qué una barra y no un anillo ────────────────────────────────────────
 * Es la misma forma que en el resumen: kcal grandes, barra segmentada por macro e
 * iconos con los gramos. Repetir la forma es lo que hace que la app se lea como
 * una sola cosa, y a lo ancho de la tarjeta caben las tres etiquetas sin
 * comprimir nada.
 *
 * El anillo queda para las comidas y sus opciones, donde lo que se hace es
 * comparar varias piezas pequeñas entre sí.
 *
 * ── Los pasos diarios ya no están aquí ──────────────────────────────────────
 * Se fueron a `GoalCard`, con el cardio. Esta tarjeta es de UNA VARIANTE y la
 * actividad es de la persona: metida aquí, el campo solo existía en la tarjeta de
 * los días de entreno —en la de descanso había que esconderlo a mano— y daba a
 * entender que eran los pasos de esos días.
 */
export const MacroTargetCard = ({ plan, variant = 'default', title, editable = false, onSave, onAbrir = null }) => {
  const targets = targetsFor(plan, variant);
  const macros = macroSplit(targets);

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  /* El formulario va en el cuerpo de la ventana y «Guardar» en su pie: se atan
     con `form=` y eso pide un id estable. */
  const formId = useId();

  const open = () => {
    setForm(Object.fromEntries(TARGET_FIELDS.map((key) => [key, targets[key] ?? ''])));
    setEditing(true);
  };

  const commit = (event) => {
    event.preventDefault();
    onSave(form);
    setEditing(false);
  };

  const kcals = targets.targetKcals ?? (macros.total > 0 ? Math.round(macros.total) : null);
  const derived = !targets.targetKcals && macros.total > 0;
  /*
    El descuadre lo ve SOLO quien puede cuadrarlo.

    Es un aviso de que las dos cifras del plan no casan —«los macros suman 1.863
    kcal, por debajo del objetivo de 1.950»— y eso es una corrección dirigida a
    quien programa. Al cliente se le pintaba igual, en naranja y bajo el título
    de su dieta: le señalaba un fallo del trabajo de su entrenador que él no
    puede tocar, en la pantalla que existe para que se fíe de lo que le han
    pautado. Con `editable` en false no se enseña, que es exactamente la misma
    condición con la que aparece o no el lápiz de al lado.
  */
  const mismatch =
    editable &&
    targets.targetKcals &&
    macros.total > 0 &&
    Math.abs(macros.total - targets.targetKcals) > 60;

  const nombre = (title || 'Objetivo diario').replace(/^Objetivo(?: ·)? /, '');

  /* Lo que se está tecleando ahora mismo, para la barra y el aviso de la
     ventana. Con la ventana cerrada `form` es null y se lee lo guardado, así
     que la barra nunca aparece vacía en el primer fotograma. */
  const borrador = form ?? targets;
  const sumaBorrador = macroSplit({
    proteinGrams: borrador.proteinGrams,
    carbsGrams: borrador.carbsGrams,
    fatsGrams: borrador.fatsGrams,
  }).total;
  const objetivoBorrador = toNum0(borrador.targetKcals);
  const descuadre =
    objetivoBorrador > 0 && sumaBorrador > 0 && Math.abs(sumaBorrador - objetivoBorrador) > 60
      ? {
          suma: Math.round(sumaBorrador),
          objetivo: Math.round(objetivoBorrador),
          cuanto: Math.round(Math.abs(sumaBorrador - objetivoBorrador)),
          signo: sumaBorrador > objetivoBorrador ? 'por encima' : 'por debajo',
        }
      : null;

  /*
    ══ EL OBJETIVO SE PONE EN UNA VENTANA CENTRADA ════════════════════════════

    La tarjeta se sustituía a sí misma por un formulario: las cifras del plan
    desaparecían, las cuatro casillas ocupaban su sitio y la columna entera daba
    un salto. Con dos dietas eso pasaba en una de las dos tarjetas mientras la
    otra se quedaba quieta al lado, así que además se perdía la comparación —que
    es justo para lo que están las dos juntas.

    Se decide, no se compara con lo de debajo: por eso va CENTRADA y no por el
    canto derecho. Es la misma regla que ya tenían los ajustes del programa en
    `WorkoutLogEditor` («`side` está para mirar un detalle sin soltar el trabajo,
    no para decidir») y la que ahora siguen también las hojas de la ficha.
  */
  const ventana = (
    <Modal
      open={editing}
      onClose={() => setEditing(false)}
      title={title || 'Objetivo diario'}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={() => setEditing(false)}>
            Cancelar
          </button>
          <button type="submit" form={formId} className="btn btn-primary">
            <Check size={14} /> Guardar
          </button>
        </>
      }
    >
      <form id={formId} className="col gap-4" onSubmit={commit}>
        {/*
          ── El objetivo se ve mientras se escribe ──────────────────────────
          Era un formulario de cuatro casillas: cuatro números sueltos y ninguna
          idea de qué salía de ellos. Pero un objetivo de macros NO es cuatro
          números, es un reparto —y el reparto solo se entiende viéndolo—, así
          que arriba va la misma barra que enseña la tarjeta, alimentada por el
          BORRADOR: se teclean 120 de proteína y el trozo rosa crece ahí mismo.
          Ni una pieza nueva; la del producto, en el sitio donde se decide.
        */}
        <MacroBar
          protein={borrador.proteinGrams}
          carbs={borrador.carbsGrams}
          fats={borrador.fatsGrams}
          kcals={borrador.targetKcals}
        />

        <div className="grid-auto">
          {TARGET_FIELDS.map((key) => (
            <label className="field" key={key}>
              <span className="field-label">{LABELS[key]}</span>
              {/* La unidad va DENTRO del recuadro, no entre paréntesis en la
                  etiqueta: es parte de lo que se escribe. Ver `.input-suffix`. */}
              <span className="input-suffix">
                <input
                  type="text"
                  inputMode="decimal"
                  className="input input-center"
                  value={form?.[key] ?? ''}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                />
                <span aria-hidden="true">{UNIDADES[key]}</span>
              </span>
            </label>
          ))}
        </div>

        {/*
          El descuadre, POR FIN donde se arregla. Vivía solo en la tarjeta —o
          sea, fuera del editor—, así que avisaba de un desajuste en la única
          pantalla en la que no se podía tocar. Aquí se recalcula con cada
          tecla. Dice lo que pasa y no qué hacer: cuadrarlo bajando carbos o
          subiendo el objetivo es criterio del entrenador, no de la aplicación.
        */}
        {descuadre && (
          <p className="t-xs" style={{ color: 'var(--warning)' }}>
            Los macros suman {descuadre.suma} kcal, {descuadre.cuanto}{' '}
            {descuadre.signo} del objetivo de {descuadre.objetivo}.
          </p>
        )}
      </form>
    </Modal>
  );

  return (
    <>
    <article className={`card col gap-4${onAbrir ? ' tarjeta-puerta' : ''}`}>
      {/*
        Con `onAbrir`, la TARJETA ENTERA abre la ventana del día —lo real contra
        lo esperado y el reparto por comida—, y el lápiz de dentro sigue siendo
        su propio blanco para el objetivo. Dos destinos, dos blancos, pero el
        grande es el grande: antes la puerta era el título, un objetivo del
        ancho de dos palabras dentro de una caja de 300 px.

        La capa va DEBAJO del contenido (`.task-hit`, ver «LA TARJETA-PUERTA»)
        porque envolver todo esto en un <button> anidaría el lápiz dentro de
        otro botón. Sin `onAbrir` (el portal del cliente) no hay puerta ninguna.
      */}
      {onAbrir ? (
        <>
          <button
            type="button"
            className="task-hit"
            onClick={onAbrir}
            aria-label={`${nombre}: ver el día, lo real contra lo esperado y el reparto por comida`}
            title="Ver el día: lo real contra lo esperado y el reparto por comida"
          />
          <div className="lado-cab">
            <span className="section-label">Objetivo</span>
            <div className="lado-cab-fila">
              <span className="lado-titulo">{nombre}</span>
              {editable && (
                <button type="button" className="btn btn-plain btn-icon btn-icon-compact" onClick={open} aria-label="Editar objetivo">
                  <Pencil size={14} />
                </button>
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="row between wrap gap-2">
          <span className="section-label is-titulo">{title || 'Objetivo diario'}</span>
          {editable && (
            <button type="button" className="btn btn-plain btn-icon" onClick={open} aria-label="Editar objetivo">
              <Pencil size={14} />
            </button>
          )}
        </div>
      )}

      <MacroBar
        protein={targets.proteinGrams}
        carbs={targets.carbsGrams}
        fats={targets.fatsGrams}
        kcals={kcals}
        caption={derived ? 'calculadas a partir de los macros' : undefined}
      />

      {macros.total === 0 && (
        <p className="t-sm t-secondary">
          Sin macros configurados{editable ? ' — pulsa el lápiz para ponerlos.' : '.'}
        </p>
      )}

      {mismatch && (
        <p className="t-xs" style={{ color: 'var(--warning)' }}>
          Los macros suman {Math.round(macros.total)} kcal,{' '}
          {macros.total > targets.targetKcals ? 'por encima' : 'por debajo'} del objetivo de{' '}
          {targets.targetKcals}.
        </p>
      )}
    </article>
    {ventana}
    </>
  );
};
