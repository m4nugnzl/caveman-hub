import { useEffect, useId, useState } from 'react';
import { Check } from 'lucide-react';

import { MICROS, MICRO_TARGET_FIELDS } from '@/domain/micros';
import { TARGET_FIELDS, macroSplit } from '@/domain/nutrition';
import { toNum0 } from '@/lib/num';
import { Modal } from '@/components/ui/Modal';
import { MacroBar } from './macros';

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
 * PONER EL OBJETIVO DE UN DÍA: las cuatro casillas, su vista previa y el aviso
 * de descuadre.
 *
 * ══ Por qué es una pieza y no un trozo de tarjeta ══════════════════════════
 *
 * Vivía dentro de `MacroTargetCard`, que era a la vez la LECTURA del objetivo y
 * su EDITOR. Mientras la lectura fue una sola —la tarjeta del costado— eso no
 * molestaba. Pero el objetivo se lee ya en tres sitios con tres formas
 * distintas: la sección del costado de la dieta, la sección de la mesa cuando
 * el plan es por macros sin reparto, y las dos tarjetas de la revisión. Atar el
 * editor a UNA de las lecturas obligaba a montar esa lectura aunque no se
 * quisiera pintar, que es lo que impedía fundir «Objetivo» y «El día» en una
 * sola sección del costado.
 *
 * Aquí está el editor y nada más: se abre desde donde se lea, y siempre es el
 * mismo — las mismas casillas, la misma barra y el mismo aviso.
 *
 * ══ Se decide, no se compara ═══════════════════════════════════════════════
 * Va en ventana CENTRADA y no por el canto derecho. Es la misma regla que ya
 * tenían los ajustes del programa en `WorkoutLogEditor`: `side` está para mirar
 * un detalle sin soltar el trabajo, no para decidir. Y no se sustituye la
 * tarjeta por un formulario en su sitio: las cifras del plan desaparecían y la
 * columna entera daba un salto.
 *
 * @param {object} targets  Lo guardado, de `targetsFor(plan, variant)`.
 * @param {func}   onSave   Recibe el objeto con los cuatro campos tal cual se
 *                          han tecleado; quien lo recibe decide qué hacer.
 */
export const EditarObjetivo = ({ open, onClose, title, targets, onSave, avanzado = false }) => {
  const [form, setForm] = useState(null);
  /* El formulario va en el cuerpo de la ventana y «Guardar» en su pie: se atan
     con `form=` y eso pide un id estable. */
  const formId = useId();

  /*
    El borrador nace al ABRIRSE, no al montarse: esta pieza vive junto a la
    lectura y se queda montada con `open={false}` mientras no se toque nada, así
    que sembrarlo una sola vez dejaría dentro las cifras de la primera vez que
    se pintó —o las del día que estuviera abierto entonces—. Con la ventana
    cerrada se descarta, y así «Cancelar» no deja nada escrito para la próxima.
  */
  useEffect(() => {
    if (!open) {
      setForm(null);
      return;
    }
    setForm(
      Object.fromEntries(
        [...TARGET_FIELDS, ...MICRO_TARGET_FIELDS].map((key) => [key, targets?.[key] ?? ''])
      )
    );
    /* `targets` es un objeto nuevo en cada render (sale de `targetsFor`), así
       que no puede ir en las dependencias: sembraría el borrador con lo
       guardado en cada pulsación de tecla. Lo que manda es abrir. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const commit = (event) => {
    event.preventDefault();
    onSave(form);
    onClose();
  };

  /*
    Lo que se está tecleando ahora mismo, para la barra y el aviso. Con la
    ventana cerrada `form` es null y se lee lo guardado, así que la barra nunca
    aparece vacía en el primer fotograma de la apertura.
  */
  const borrador = form ?? targets ?? {};
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

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title || 'Objetivo diario'}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" form={formId} className="btn btn-primary">
            <Check size={15} /> Guardar
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
          que arriba va la barra alimentada por el BORRADOR: se teclean 120 de
          proteína y el trozo rosa crece ahí mismo.

          Es además el ÚNICO sitio de la dieta donde la barra de tres colores
          sigue viva, y por eso: aquí el tramo se mueve mientras tecleas. En una
          tarjeta quieta decía lo mismo que los números escritos debajo y hacía
          que el ámbar significara «carbos» en una pantalla donde el ámbar
          significa «ojo con esto». Ver [[ley-del-color]].
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
          ══ LAS CUATRO DEL ENVASE, si las has encendido ═══════════════════════

          Debajo y separadas, porque son de otro orden: las cuatro de arriba son
          el objetivo —la energía y de dónde sale— y estas son composición. En
          blanco significa que no las pautas, que es lo normal: aquí no hay
          ninguna cifra por defecto y la aplicación no propone ninguna.

          Cada una dice si es un suelo o un techo en su propia etiqueta. Un
          objetivo de fibra es un mínimo y uno de sal un máximo, y sin decirlo se
          leerían como los macros —o sea, como una cifra que hay que clavar—.
          Ver `MICROS` en `domain/micros.js`.
        */}
        {avanzado && (
          <>
            <hr className="menu-sep" />
            <div className="grid-auto">
              {MICROS.map(({ key, target, label, unit, sentido }) => (
                <label className="field" key={key}>
                  <span className="field-label">
                    {label} <small>{sentido === 'min' ? 'mínimo' : 'máximo'}</small>
                  </span>
                  <span className="input-suffix">
                    <input
                      type="text"
                      inputMode="decimal"
                      className="input input-center"
                      placeholder="—"
                      value={form?.[target] ?? ''}
                      onChange={(e) => setForm({ ...form, [target]: e.target.value })}
                    />
                    <span aria-hidden="true">{unit}</span>
                  </span>
                </label>
              ))}
            </div>
          </>
        )}

        {/*
          El descuadre, donde se arregla. Vivía solo en la tarjeta —o sea, fuera
          del editor—, así que avisaba de un desajuste en la única pantalla en la
          que no se podía tocar. Aquí se recalcula con cada tecla. Dice lo que
          pasa y no qué hacer: cuadrarlo bajando carbos o subiendo el objetivo es
          criterio del entrenador, no de la aplicación.

          El cliente no lo ve nunca, y por una razón que sigue valiendo entera:
          le señalaría un fallo del trabajo de su entrenador que él no puede
          tocar. No hace falta esconderlo — no tiene este editor.
        */}
        {descuadre && (
          <p className="t-xs" style={{ color: 'var(--warning)' }}>
            Los macros suman {descuadre.suma} kcal, {descuadre.cuanto} {descuadre.signo} del objetivo de{' '}
            {descuadre.objetivo}.
          </p>
        )}
      </form>
    </Modal>
  );
};
